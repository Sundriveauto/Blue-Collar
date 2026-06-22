//! Contract-upgrade testing framework for the Registry contract.
//!
//! This module is the home of the upgrade test framework requested in the
//! "smart-contract upgrade testing" work. It is organized into four pillars
//! that together give a contract administrator confidence that an upgrade
//! preserves data and behavior:
//!
//! 1. [`state_migration`]      — `migrate` preserves all stored data and
//!                               advances the schema version correctly.
//! 2. [`backward_compat`]      — storage written by the old code is still
//!                               readable, and entry points keep their shapes.
//! 3. [`perf_regression`]      — core operations stay within a CPU/memory
//!                               budget, so an upgrade cannot silently regress
//!                               gas cost.
//! 4. [`security_regression`]  — upgrade/migration entry points keep enforcing
//!                               their authorization and timelock guards.
//!
//! A real WASM-swap upgrade (uploading new bytecode and calling `upgrade`) is
//! exercised separately in the `wasm-upgrade-tests` feature build and by the
//! `fuzz_migrate` libFuzzer target, because the in-process host cannot install
//! a WASM blob from a dummy hash.
#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    Address, BytesN, Env, String, Symbol,
};

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

/// A registry contract with the bootstrap admin holding every operational role.
struct UpgradeFixture {
    env: Env,
    contract: Address,
    admin: Address,
    curator: Address,
    owner: Address,
}

impl UpgradeFixture {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let curator = Address::generate(&env);
        let owner = Address::generate(&env);

        let contract = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &contract);
        client.initialize(&admin);

        client.grant_role(&admin, &Symbol::new(&env, ROLE_PAUSER), &admin);
        client.grant_role(&admin, &Symbol::new(&env, ROLE_CURATOR_MGR), &admin);
        client.grant_role(&admin, &Symbol::new(&env, ROLE_REP_MGR), &admin);
        client.grant_role(&admin, &Symbol::new(&env, ROLE_UPGRADER), &admin);

        UpgradeFixture { env, contract, admin, curator, owner }
    }

    fn client(&self) -> RegistryContractClient {
        RegistryContractClient::new(&self.env, &self.contract)
    }

    fn zero_hash(&self) -> BytesN<32> {
        BytesN::from_array(&self.env, &[0u8; 32])
    }

    /// Register a worker `id` owned by the fixture's `owner`.
    fn register(&self, id: &str) -> Symbol {
        let sym = Symbol::new(&self.env, id);
        self.client().add_curator(&self.admin, &self.curator);
        self.client().register(
            &sym,
            &self.owner,
            &String::from_str(&self.env, "Alice"),
            &Symbol::new(&self.env, "plumber"),
            &self.zero_hash(),
            &self.zero_hash(),
            &self.curator,
        );
        sym
    }
}

// ===========================================================================
// 1. State migration testing
// ===========================================================================

mod state_migration {
    use super::*;

    /// A migration must not alter any field of an existing worker record.
    #[test]
    fn migration_preserves_all_worker_fields() {
        let f = UpgradeFixture::new();
        let id = f.register("worker1");
        f.client().update_reputation(&f.admin, &id, &7_500);

        let before = f.client().get_worker(&id).unwrap();
        let count_before = f.client().worker_count();

        f.client().migrate(&f.admin, &1u32);

        let after = f.client().get_worker(&id).unwrap();
        assert_eq!(after.owner, before.owner);
        assert_eq!(after.name, before.name);
        assert_eq!(after.category, before.category);
        assert_eq!(after.reputation, before.reputation);
        assert_eq!(after.is_active, before.is_active);
        assert_eq!(f.client().worker_count(), count_before);
    }

    /// The schema version starts at 1 and advances by exactly one per migration.
    #[test]
    fn migration_advances_version_by_one() {
        let f = UpgradeFixture::new();
        assert_eq!(f.client().get_schema_version(), 1);
        f.client().migrate(&f.admin, &1u32);
        assert_eq!(f.client().get_schema_version(), 2);
        f.client().migrate(&f.admin, &2u32);
        assert_eq!(f.client().get_schema_version(), 3);
    }

    /// Replaying a migration for an already-applied version is rejected, so a
    /// migration can never run twice against the same schema.
    #[test]
    #[should_panic(expected = "Wrong schema version")]
    fn migration_is_not_replayable() {
        let f = UpgradeFixture::new();
        f.client().migrate(&f.admin, &1u32);
        f.client().migrate(&f.admin, &1u32);
    }

    /// Migrating with the wrong `expected_version` is rejected (no out-of-order
    /// migrations).
    #[test]
    #[should_panic(expected = "Wrong schema version")]
    fn migration_rejects_out_of_order_version() {
        let f = UpgradeFixture::new();
        f.client().migrate(&f.admin, &5u32);
    }

    /// Data registered before a migration is fully intact across several
    /// sequential migrations (multi-version upgrade simulation).
    #[test]
    fn data_survives_multiple_sequential_migrations() {
        let f = UpgradeFixture::new();
        let id = f.register("worker1");
        let original = f.client().get_worker(&id).unwrap();

        for v in 1..=4u32 {
            f.client().migrate(&f.admin, &v);
            let now = f.client().get_worker(&id).unwrap();
            assert_eq!(now.name, original.name, "name lost at schema v{}", v + 1);
            assert_eq!(now.owner, original.owner, "owner lost at schema v{}", v + 1);
        }
        assert_eq!(f.client().get_schema_version(), 5);
    }
}

// ===========================================================================
// 2. Backward compatibility verification
// ===========================================================================

mod backward_compat {
    use super::*;

    /// Records and role memberships written before an upgrade remain readable
    /// after a migration (storage-key/layout compatibility).
    #[test]
    fn pre_upgrade_state_is_readable_after_migration() {
        let f = UpgradeFixture::new();
        let id = f.register("worker1");
        assert!(f.client().is_curator(&f.curator));

        f.client().migrate(&f.admin, &1u32);

        // Worker record still present and correct.
        let w = f.client().get_worker(&id).unwrap();
        assert_eq!(w.owner, f.owner);
        // Role membership preserved.
        assert!(f.client().is_curator(&f.curator));
    }

    /// A fresh deployment reports schema version 1, the baseline old clients
    /// expect. This pins the starting point for backward-compatible reads.
    #[test]
    fn fresh_deploy_reports_baseline_version() {
        let f = UpgradeFixture::new();
        assert_eq!(f.client().get_schema_version(), 1);
    }

    /// The `upgrade`, `migrate`, and timelock entry points keep the exact
    /// argument shapes external tooling depends on. This is a compile-time
    /// contract: if a signature changed, this test would fail to build.
    #[test]
    fn upgrade_entry_point_signatures_are_stable() {
        let f = UpgradeFixture::new();
        let hash = BytesN::from_array(&f.env, &[1u8; 32]);

        // migrate(admin, expected_version)
        let _migrate: fn(&RegistryContractClient, &Address, &u32) =
            |c, a, v| { c.migrate(a, v); };
        // propose_upgrade(admin, wasm_hash) / get_pending_upgrade()
        f.client().propose_upgrade(&f.admin, &hash);
        let pending = f.client().get_pending_upgrade().unwrap();
        assert_eq!(pending.wasm_hash, hash);
        f.client().cancel_upgrade(&f.admin);
        let _ = _migrate;
    }
}

// ===========================================================================
// 3. Performance regression testing
// ===========================================================================
//
// Each test resets the budget to real network limits, runs an operation, and
// asserts the CPU/memory cost stays under a ceiling. The ceilings are set with
// generous headroom over observed costs; a future change that materially
// regresses gas usage will trip them.

mod perf_regression {
    use super::*;

    /// Worker registration must stay within a bounded CPU/memory budget.
    #[test]
    fn register_within_budget() {
        let f = UpgradeFixture::new();
        f.client().add_curator(&f.admin, &f.curator);
        let id = Symbol::new(&f.env, "perf1");

        f.env.budget().reset_default();
        f.client().register(
            &id,
            &f.owner,
            &String::from_str(&f.env, "Alice"),
            &Symbol::new(&f.env, "plumber"),
            &f.zero_hash(),
            &f.zero_hash(),
            &f.curator,
        );
        let cpu = f.env.budget().cpu_instruction_cost();
        let mem = f.env.budget().memory_bytes_cost();
        std::println!("register cost: cpu={cpu} mem={mem}");
        // Observed ~183k CPU / ~32k mem; ceilings give ~3-5x headroom so the
        // test flags a material regression without tripping on minor changes.
        assert!(cpu < 1_000_000, "register CPU regression: {cpu}");
        assert!(mem < 200_000, "register memory regression: {mem}");
    }

    /// A schema migration over existing state must stay within budget.
    #[test]
    fn migrate_within_budget() {
        let f = UpgradeFixture::new();
        f.register("worker1");

        f.env.budget().reset_default();
        f.client().migrate(&f.admin, &1u32);
        let cpu = f.env.budget().cpu_instruction_cost();
        let mem = f.env.budget().memory_bytes_cost();
        std::println!("migrate cost: cpu={cpu} mem={mem}");
        // Observed ~73k CPU / ~11k mem; ceilings give generous headroom.
        assert!(cpu < 500_000, "migrate CPU regression: {cpu}");
        assert!(mem < 100_000, "migrate memory regression: {mem}");
    }
}

// ===========================================================================
// 4. Security / authorization regression testing
// ===========================================================================

mod security_regression {
    use super::*;

    /// `upgrade` must reject a stored admin that does not hold ROLE_UPGRADER.
    #[test]
    #[should_panic(expected = "Missing role")]
    fn upgrade_requires_upgrader_role() {
        // Bootstrap a contract whose admin was never granted ROLE_UPGRADER.
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &contract);
        client.initialize(&admin);

        let hash = BytesN::from_array(&env, &[1u8; 32]);
        client.upgrade(&hash);
    }

    /// `migrate` must reject callers without ROLE_ADMIN.
    #[test]
    #[should_panic(expected = "Missing role")]
    fn migrate_requires_admin() {
        let f = UpgradeFixture::new();
        let stranger = Address::generate(&f.env);
        f.client().migrate(&stranger, &1u32);
    }

    /// `propose_upgrade` must reject callers without ROLE_UPGRADER.
    #[test]
    #[should_panic(expected = "Missing role")]
    fn propose_upgrade_requires_upgrader_role() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let stranger = Address::generate(&env);
        let contract = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &contract);
        client.initialize(&admin);

        let hash = BytesN::from_array(&env, &[1u8; 32]);
        client.propose_upgrade(&stranger, &hash);
    }

    /// A proposed upgrade cannot be executed before its timelock expires.
    #[test]
    #[should_panic(expected = "Timelock not expired")]
    fn timelocked_upgrade_cannot_execute_early() {
        let f = UpgradeFixture::new();
        let hash = BytesN::from_array(&f.env, &[9u8; 32]);
        f.client().propose_upgrade(&f.admin, &hash);
        f.client().execute_upgrade();
    }

    /// Only one upgrade may be pending at a time (no proposal overwrite).
    #[test]
    #[should_panic(expected = "Upgrade already pending")]
    fn cannot_double_propose_upgrade() {
        let f = UpgradeFixture::new();
        let hash = BytesN::from_array(&f.env, &[9u8; 32]);
        f.client().propose_upgrade(&f.admin, &hash);
        f.client().propose_upgrade(&f.admin, &hash);
    }
}
