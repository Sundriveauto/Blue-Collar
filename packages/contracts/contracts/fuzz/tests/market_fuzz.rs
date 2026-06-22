//! Property-based fuzz tests for the Market contract.
//!
//! These tests use `proptest` to generate random inputs and verify invariants.

use proptest::prelude::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, Symbol,
};

use bluecollar_market::{MarketContract, MarketContractClient};

/// Generate a random positive tip amount (1 to 1_000_000).
fn arb_amount() -> impl Strategy<Value = i128> {
    (1i128..=1_000_000i128).prop_map(|v| v)
}

/// Generate a random fee in basis points (0-500).
fn arb_fee_bps() -> impl Strategy<Value = u32> {
    0u32..=500
}

/// Generate a random escrow id (1-16 alphanumeric).
fn arb_escrow_id() -> impl Strategy<Value = String> {
    "[a-z0-9]{1,16}".prop_map(|s| s)
}

/// Generate a random expiry offset in seconds (1 to 1_000_000).
fn arb_expiry_offset() -> impl Strategy<Value = u64> {
    (1u64..=1_000_000u64).prop_map(|v| v)
}

proptest! {
    /// Fuzz test: tip with random valid amounts should transfer correct net amount.
    #[test]
    fn fuzz_tip_correct_amount(
        amount in arb_amount(),
        fee_bps in arb_fee_bps(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let worker = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = token_id.address();
        StellarAssetClient::new(&env, &token_addr).mint(&payer, &1_000_000);

        let contract_id = env.register_contract(None, MarketContract);
        let client = MarketContractClient::new(&env, &contract_id);
        client.initialize(&admin, &fee_bps, &admin);
        client.grant_role(&admin, &Symbol::new(&env, "fee_mgr"), &admin);

        let payer_before = TokenClient::new(&env, &token_addr).balance(&payer);
        let worker_before = TokenClient::new(&env, &token_addr).balance(&worker);

        client.tip(&payer, &worker, &token_addr, &amount);

        let fee = (amount * fee_bps as i128) / 10_000;
        let expected_worker = worker_before + amount - fee;
        let expected_payer = payer_before - amount;

        // Invariant: worker receives amount minus fee
        assert_eq!(TokenClient::new(&env, &token_addr).balance(&worker), expected_worker);
        // Invariant: payer loses full amount
        assert_eq!(TokenClient::new(&env, &token_addr).balance(&payer), expected_payer);
    }

    /// Fuzz test: create escrow with random amounts should lock funds correctly.
    #[test]
    fn fuzz_create_escrow_locks_funds(
        amount in arb_amount(),
        escrow_id in arb_escrow_id(),
        expiry_offset in arb_expiry_offset(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let worker = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = token_id.address();
        StellarAssetClient::new(&env, &token_addr).mint(&payer, &1_000_000);

        let contract_id = env.register_contract(None, MarketContract);
        let client = MarketContractClient::new(&env, &contract_id);
        client.initialize(&admin, &0, &admin);

        let id = Symbol::new(&env, &escrow_id);
        let expiry = expiry_offset;

        client.create_escrow(&id, &payer, &worker, &token_addr, &amount, &expiry);

        // Invariant: escrow exists and is not released/cancelled
        let escrow = client.get_escrow(&id).expect("Escrow should exist");
        assert_eq!(escrow.amount, amount);
        assert!(!escrow.released);
        assert!(!escrow.cancelled);

        // Invariant: payer balance decreased by amount
        let payer_balance = TokenClient::new(&env, &token_addr).balance(&payer);
        assert_eq!(payer_balance, 1_000_000 - amount);
    }

    /// Fuzz test: release escrow should transfer full amount to worker.
    #[test]
    fn fuzz_release_escrow_transfers_to_worker(
        amount in arb_amount(),
        escrow_id in arb_escrow_id(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let worker = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = token_id.address();
        StellarAssetClient::new(&env, &token_addr).mint(&payer, &1_000_000);

        let contract_id = env.register_contract(None, MarketContract);
        let client = MarketContractClient::new(&env, &contract_id);
        client.initialize(&admin, &0, &admin);

        let id = Symbol::new(&env, &escrow_id);
        client.create_escrow(&id, &payer, &worker, &token_addr, &amount, &9_999_999);
        client.release_escrow(&id, &payer);

        // Invariant: worker receives full escrow amount
        assert_eq!(TokenClient::new(&env, &token_addr).balance(&worker), amount);

        // Invariant: escrow is marked released
        let escrow = client.get_escrow(&id).expect("Escrow should exist");
        assert!(escrow.released);
        assert!(!escrow.cancelled);
    }

    /// Fuzz test: cancel escrow after expiry should refund payer.
    #[test]
    fn fuzz_cancel_escrow_refunds_payer(
        amount in arb_amount(),
        escrow_id in arb_escrow_id(),
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let worker = Address::generate(&env);

        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let token_addr = token_id.address();
        StellarAssetClient::new(&env, &token_addr).mint(&payer, &1_000_000);

        let contract_id = env.register_contract(None, MarketContract);
        let client = MarketContractClient::new(&env, &contract_id);
        client.initialize(&admin, &0, &admin);

        // Set time before expiry
        env.ledger().set(LedgerInfo {
            timestamp: 1000,
            protocol_version: 22,
            sequence_number: 1,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 1,
            min_persistent_entry_ttl: 1,
            max_entry_ttl: 100_000,
        });

        let id = Symbol::new(&env, &escrow_id);
        client.create_escrow(&id, &payer, &worker, &token_addr, &amount, &2000);

        // Advance the timestamp past expiry. Keep `sequence_number` steady so the
        // persistent escrow entry is not archived (expiry is timestamp-based, and
        // the in-process test host archives entries once the ledger sequence passes
        // their TTL — which would otherwise mask the behavior under test).
        env.ledger().set(LedgerInfo {
            timestamp: 3000,
            protocol_version: 22,
            sequence_number: 1,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 1,
            min_persistent_entry_ttl: 1,
            max_entry_ttl: 100_000,
        });

        client.cancel_escrow(&id, &payer);

        // Invariant: payer gets full refund
        assert_eq!(TokenClient::new(&env, &token_addr).balance(&payer), 1_000_000);

        // Invariant: escrow is marked cancelled
        let escrow = client.get_escrow(&id).expect("Escrow should exist");
        assert!(escrow.cancelled);
        assert!(!escrow.released);
    }

    /// Fuzz test: fee_bps exceeding MAX_FEE_BPS should always panic.
    #[test]
    fn fuzz_fee_bps_over_max_panics(
        fee_bps in 501u32..=u32::MAX,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, MarketContract);
        let client = MarketContractClient::new(&env, &contract_id);

        // Should always panic with fee_bps > 500
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.initialize(&admin, &fee_bps, &admin);
        }));
        assert!(result.is_err(), "Expected panic for fee_bps={fee_bps}");
    }
}
