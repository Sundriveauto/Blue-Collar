#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, Symbol,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup() -> (Env, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract_v2(admin.clone());
    let token_addr = token_id.address();
    StellarAssetClient::new(&env, &token_addr).mint(&from, &10_000);

    (env, admin, fee_recipient, from, to, token_addr)
}

fn deploy(env: &Env) -> Address {
    env.register_contract(None, MarketContract)
}

fn init(env: &Env, contract: &Address, admin: &Address, fee_bps: u32, fee_recipient: &Address) {
    let client = MarketContractClient::new(env, contract);
    client.initialize(admin, &fee_bps, fee_recipient);
    // Grant fee manager role to admin for update_fee tests
    client.grant_role(admin, &Symbol::new(env, ROLE_FEE_MANAGER), admin);
}

fn set_time(env: &Env, ts: u64) {
    env.ledger().set(LedgerInfo {
        timestamp: ts,
        protocol_version: 22,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 100_000,
    });
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_success() {
    let (env, admin, fee_recipient, _from, _to, _token) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 100, &fee_recipient);

    let client = MarketContractClient::new(&env, &contract);
    let config = client.get_config();
    assert_eq!(config.fee_bps, 100);
    // Admin is stored separately from `Config`, not as a field on it.
    assert_eq!(client.get_admin(), admin);
    assert_eq!(config.fee_recipient, fee_recipient);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_initialize_twice_panics() {
    let (env, admin, fee_recipient, _from, _to, _token) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 100, &fee_recipient);
    MarketContractClient::new(&env, &contract).initialize(&admin, &100, &fee_recipient);
}

#[test]
#[should_panic(expected = "fee_bps exceeds maximum")]
fn test_initialize_fee_too_high() {
    let (env, admin, fee_recipient, _from, _to, _token) = setup();
    let contract = deploy(&env);
    MarketContractClient::new(&env, &contract).initialize(&admin, &501, &fee_recipient);
}

// ---------------------------------------------------------------------------
// tip — Issue #523: multi-token tip with TipSent event
// ---------------------------------------------------------------------------

#[test]
fn test_tip_success_with_fee() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 100, &fee_recipient); // 1%

    MarketContractClient::new(&env, &contract).tip(&from, &to, &token_addr, &1000);

    let token = TokenClient::new(&env, &token_addr);
    assert_eq!(token.balance(&to), 990);
    assert_eq!(token.balance(&fee_recipient), 10);
    assert_eq!(token.balance(&from), 9_000);
}

#[test]
fn test_tip_zero_fee() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    MarketContractClient::new(&env, &contract).tip(&from, &to, &token_addr, &500);

    let token = TokenClient::new(&env, &token_addr);
    assert_eq!(token.balance(&to), 500);
    assert_eq!(token.balance(&fee_recipient), 0);
}

#[test]
fn test_tip_max_fee() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 500, &fee_recipient); // 5%

    MarketContractClient::new(&env, &contract).tip(&from, &to, &token_addr, &1000);

    let token = TokenClient::new(&env, &token_addr);
    assert_eq!(token.balance(&to), 950);
    assert_eq!(token.balance(&fee_recipient), 50);
}

/// Issue #523: tip with a second (custom) token — verifies any SEP-41 token works.
#[test]
fn test_tip_custom_token() {
    let (env, admin, fee_recipient, from, to, _xlm) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    // Deploy a second token and mint to `from`
    let token2_id = env.register_stellar_asset_contract_v2(admin.clone());
    let token2_addr = token2_id.address();
    StellarAssetClient::new(&env, &token2_addr).mint(&from, &5_000);

    MarketContractClient::new(&env, &contract).tip(&from, &to, &token2_addr, &2_000);

    let token2 = TokenClient::new(&env, &token2_addr);
    assert_eq!(token2.balance(&to), 2_000);
    assert_eq!(token2.balance(&from), 3_000);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_tip_zero_amount() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 100, &fee_recipient);
    MarketContractClient::new(&env, &contract).tip(&from, &to, &token_addr, &0);
}

#[test]
#[should_panic]
fn test_tip_insufficient_balance() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 100, &fee_recipient);
    MarketContractClient::new(&env, &contract).tip(&from, &to, &token_addr, &99_999);
}

// ---------------------------------------------------------------------------
// update_fee
// ---------------------------------------------------------------------------

#[test]
fn test_update_fee_success() {
    let (env, admin, fee_recipient, _from, _to, _token) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 100, &fee_recipient);

    let client = MarketContractClient::new(&env, &contract);
    // `update_fee` reads the admin from storage; it takes only the new fee.
    client.update_fee(&200);
    assert_eq!(client.get_config().fee_bps, 200);
}

#[test]
#[should_panic(expected = "fee_bps exceeds maximum")]
fn test_update_fee_too_high() {
    let (env, admin, fee_recipient, _from, _to, _token) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 100, &fee_recipient);
    MarketContractClient::new(&env, &contract).update_fee(&501);
}

// ---------------------------------------------------------------------------
// escrow: create — Issue #521
// ---------------------------------------------------------------------------

#[test]
fn test_create_escrow_success() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    let client = MarketContractClient::new(&env, &contract);
    let id = Symbol::new(&env, "esc1");
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &9999);

    let escrow = client.get_escrow(&id).unwrap();
    assert_eq!(escrow.amount, 1000);
    assert_eq!(escrow.expiry, 9999);
    assert!(!escrow.released);
    assert!(!escrow.cancelled);

    let token = TokenClient::new(&env, &token_addr);
    assert_eq!(token.balance(&contract), 1000);
    assert_eq!(token.balance(&from), 9_000);
}

#[test]
#[should_panic(expected = "Escrow id already exists")]
fn test_create_escrow_duplicate_id() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    let client = MarketContractClient::new(&env, &contract);
    let id = Symbol::new(&env, "esc1");
    client.create_escrow(&id, &from, &to, &token_addr, &500, &9999);
    client.create_escrow(&id, &from, &to, &token_addr, &500, &9999);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_create_escrow_zero_amount() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    let id = Symbol::new(&env, "esc1");
    MarketContractClient::new(&env, &contract).create_escrow(&id, &from, &to, &token_addr, &0, &9999);
}

// ---------------------------------------------------------------------------
// escrow: release — Issue #521
// ---------------------------------------------------------------------------

#[test]
fn test_release_escrow_by_payer() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    let client = MarketContractClient::new(&env, &contract);
    let id = Symbol::new(&env, "esc1");
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &9999);
    client.release_escrow(&id, &from);

    let token = TokenClient::new(&env, &token_addr);
    assert_eq!(token.balance(&to), 1000);
    assert_eq!(token.balance(&contract), 0);
    assert!(client.get_escrow(&id).unwrap().released);
}

#[test]
fn test_release_escrow_by_worker() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    let client = MarketContractClient::new(&env, &contract);
    let id = Symbol::new(&env, "esc1");
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &9999);
    client.release_escrow(&id, &to);

    assert_eq!(TokenClient::new(&env, &token_addr).balance(&to), 1000);
    assert!(client.get_escrow(&id).unwrap().released);
}

#[test]
#[should_panic(expected = "Not authorized")]
fn test_release_escrow_unauthorized() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &9999);
    let stranger = Address::generate(&env);
    client.release_escrow(&id, &stranger);
}

#[test]
#[should_panic(expected = "Already released")]
fn test_release_escrow_twice_panics() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &9999);
    client.release_escrow(&id, &from);
    client.release_escrow(&id, &from);
}

// ---------------------------------------------------------------------------
// escrow: cancel — Issue #521
// ---------------------------------------------------------------------------

#[test]
fn test_cancel_escrow_after_expiry() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    set_time(&env, 1000);
    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &2000);

    set_time(&env, 3000);
    client.cancel_escrow(&id, &from);

    assert_eq!(TokenClient::new(&env, &token_addr).balance(&from), 10_000);
    assert_eq!(TokenClient::new(&env, &token_addr).balance(&contract), 0);
    assert!(client.get_escrow(&id).unwrap().cancelled);
}

#[test]
#[should_panic(expected = "Not authorized")]
fn test_cancel_escrow_by_worker_panics() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    set_time(&env, 5000);
    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &2000);
    client.cancel_escrow(&id, &to);
}

#[test]
#[should_panic(expected = "Escrow not yet expired")]
fn test_cancel_escrow_before_expiry_panics() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    set_time(&env, 500);
    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &2000);
    client.cancel_escrow(&id, &from);
}

#[test]
#[should_panic(expected = "Already cancelled")]
fn test_cancel_escrow_twice_panics() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    set_time(&env, 5000);
    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &2000);
    client.cancel_escrow(&id, &from);
    client.cancel_escrow(&id, &from);
}

#[test]
#[should_panic(expected = "Escrow cancelled")]
fn test_release_after_cancel_panics() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    set_time(&env, 5000);
    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &2000);
    client.cancel_escrow(&id, &from);
    client.release_escrow(&id, &from);
}

// ---------------------------------------------------------------------------
// escrow: cancel_expired — Issue #521
// ---------------------------------------------------------------------------

#[test]
fn test_cancel_expired_escrow_success() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    set_time(&env, 1000);
    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &2000);

    set_time(&env, 3000);
    client.cancel_expired_escrow(&id);

    assert_eq!(TokenClient::new(&env, &token_addr).balance(&from), 10_000);
    assert!(client.get_escrow(&id).unwrap().cancelled);
}

#[test]
#[should_panic(expected = "Escrow not yet expired")]
fn test_cancel_expired_escrow_not_expired() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    set_time(&env, 500);
    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &2000);
    client.cancel_expired_escrow(&id);
}

#[test]
#[should_panic(expected = "Escrow not active")]
fn test_cancel_expired_already_released() {
    let (env, admin, fee_recipient, from, to, token_addr) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);

    set_time(&env, 1000);
    let id = Symbol::new(&env, "esc1");
    let client = MarketContractClient::new(&env, &contract);
    client.create_escrow(&id, &from, &to, &token_addr, &1000, &2000);
    client.release_escrow(&id, &from);

    set_time(&env, 3000);
    client.cancel_expired_escrow(&id);
}

#[test]
fn test_get_escrow_nonexistent_returns_none() {
    let (env, admin, fee_recipient, _from, _to, _token) = setup();
    let contract = deploy(&env);
    init(&env, &contract, &admin, 0, &fee_recipient);
    assert!(MarketContractClient::new(&env, &contract).get_escrow(&Symbol::new(&env, "nope")).is_none());
}

// ===========================================================================
// Contract-upgrade testing framework (Market)
// ===========================================================================
//
// Mirrors the Registry upgrade framework in `registry/src/test.rs`:
//   1. state_migration     — escrow state survives a migration; version bumps.
//   2. backward_compat      — pre-upgrade escrows stay readable; signatures stable.
//   3. perf_regression      — core ops stay within a CPU/memory budget.
//   4. security_regression  — upgrade/migrate keep their authorization guards.
//
// A real WASM-swap upgrade is exercised in the `wasm-upgrade-tests` feature
// build, since the in-process host cannot install a WASM blob from a dummy hash.

#[cfg(test)]
mod upgrade_framework {
    use super::*;
    use soroban_sdk::BytesN;

    /// A market contract with a funded token, an open escrow, and the admin
    /// holding ROLE_UPGRADER.
    struct UpgradeFixture {
        env: Env,
        contract: Address,
        admin: Address,
        from: Address,
        to: Address,
        token: Address,
        escrow_id: Symbol,
    }

    impl UpgradeFixture {
        fn new() -> Self {
            let (env, admin, fee_recipient, from, to, token) = setup();
            let contract = deploy(&env);
            init(&env, &contract, &admin, 0, &fee_recipient);

            let client = MarketContractClient::new(&env, &contract);
            client.grant_role(&admin, &Symbol::new(&env, ROLE_UPGRADER), &admin);

            let escrow_id = Symbol::new(&env, "esc1");
            client.create_escrow(&escrow_id, &from, &to, &token, &1_000, &9_999);

            UpgradeFixture { env, contract, admin, from, to, token, escrow_id }
        }

        fn client(&self) -> MarketContractClient {
            MarketContractClient::new(&self.env, &self.contract)
        }
    }

    // -- 1. state migration --------------------------------------------------

    #[test]
    fn migration_preserves_escrow_state() {
        let f = UpgradeFixture::new();
        let before = f.client().get_escrow(&f.escrow_id).unwrap();
        assert_eq!(f.client().get_schema_version(), 1);

        f.client().migrate(&f.admin, &1u32);

        let after = f.client().get_escrow(&f.escrow_id).unwrap();
        assert_eq!(after.amount, before.amount);
        assert_eq!(after.expiry, before.expiry);
        assert_eq!(after.released, before.released);
        assert_eq!(after.cancelled, before.cancelled);
        assert_eq!(f.client().get_schema_version(), 2);
    }

    #[test]
    #[should_panic(expected = "Wrong schema version")]
    fn migration_is_not_replayable() {
        let f = UpgradeFixture::new();
        f.client().migrate(&f.admin, &1u32);
        f.client().migrate(&f.admin, &1u32);
    }

    // -- 2. backward compatibility ------------------------------------------

    #[test]
    fn escrow_released_after_migration_pays_worker() {
        let f = UpgradeFixture::new();
        f.client().migrate(&f.admin, &1u32);

        // The escrow created pre-migration is still operable post-migration.
        f.client().release_escrow(&f.escrow_id, &f.from);
        assert_eq!(TokenClient::new(&f.env, &f.token).balance(&f.to), 1_000);
        assert!(f.client().get_escrow(&f.escrow_id).unwrap().released);
    }

    // -- 3. performance regression ------------------------------------------

    #[test]
    fn create_escrow_within_budget() {
        let (env, admin, fee_recipient, from, to, token) = setup();
        let contract = deploy(&env);
        init(&env, &contract, &admin, 0, &fee_recipient);
        let client = MarketContractClient::new(&env, &contract);

        env.budget().reset_default();
        client.create_escrow(&Symbol::new(&env, "p1"), &from, &to, &token, &1_000, &9_999);
        let cpu = env.budget().cpu_instruction_cost();
        let mem = env.budget().memory_bytes_cost();
        std::println!("create_escrow cost: cpu={cpu} mem={mem}");
        // Observed ~214k CPU / ~34k mem (includes a token transfer); the
        // ceilings give ~4-6x headroom to flag a material regression.
        assert!(cpu < 1_200_000, "create_escrow CPU regression: {cpu}");
        assert!(mem < 250_000, "create_escrow memory regression: {mem}");
    }

    // -- 4. security / authorization regression -----------------------------

    #[test]
    #[should_panic(expected = "Missing role")]
    fn upgrade_requires_upgrader_role() {
        // Admin is initialized with ROLE_ADMIN but never granted ROLE_UPGRADER.
        let (env, admin, fee_recipient, _from, _to, _token) = setup();
        let contract = deploy(&env);
        init(&env, &contract, &admin, 0, &fee_recipient);
        let hash = BytesN::from_array(&env, &[1u8; 32]);
        MarketContractClient::new(&env, &contract).upgrade(&hash);
    }

    #[test]
    #[should_panic(expected = "Missing role")]
    fn migrate_requires_admin() {
        let f = UpgradeFixture::new();
        let stranger = Address::generate(&f.env);
        f.client().migrate(&stranger, &1u32);
    }
}
