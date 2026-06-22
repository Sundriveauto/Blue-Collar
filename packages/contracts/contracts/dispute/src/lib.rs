//! # BlueCollar Dispute Resolution Contract
//!
//! Deployed on Stellar (Soroban), this contract handles payment disputes between
//! users and workers in the BlueCollar protocol. It provides a trustless mechanism
//! for filing disputes, submitting evidence, and resolving them through arbitration.
//!
//! ## Access Control
//! - **Admin**: Set once at [`initialize`]. Can add/remove arbitrators and upgrade the contract.
//! - **Arbitrators**: Approved addresses that may resolve disputes.
//! - **Disputer**: The party filing the dispute (payer or worker).
//!
//! ## Dispute Lifecycle
//! 1. File dispute with initial evidence
//! 2. Respondent submits counter-evidence
//! 3. Arbitrator reviews and resolves
//! 4. Funds are refunded or released based on outcome

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec,
};

/// Approximate TTL extension target (~1 year at 5 s/ledger).
const TTL_EXTEND_TO: u32 = 535_000;
/// Extend TTL only when it drops below this threshold (~6 months).
const TTL_THRESHOLD: u32 = 267_500;

// =============================================================================
// Types
// =============================================================================

/// Dispute status enumeration.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum DisputeStatus {
    /// Dispute filed, awaiting evidence submission.
    Filed = 0,
    /// Evidence submitted by both parties.
    EvidenceSubmitted = 1,
    /// Dispute resolved by arbitrator.
    Resolved = 2,
    /// Dispute cancelled.
    Cancelled = 3,
}

/// Dispute resolution outcome.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum DisputeOutcome {
    /// Funds refunded to payer.
    RefundPayer = 0,
    /// Funds released to worker.
    ReleaseWorker = 1,
    /// Funds split between parties.
    PartialRefund = 2,
    /// No outcome yet — the dispute has not been resolved.
    ///
    /// Used instead of `Option<DisputeOutcome>` because a `#[contracttype]`
    /// struct field of type `Option<custom-enum>` fails to derive the required
    /// `ScVal` conversions under the `alloc` feature.
    Unresolved = 3,
}

/// On-chain dispute record stored in persistent contract storage.
#[contracttype]
#[derive(Clone)]
pub struct Dispute {
    /// Unique dispute identifier.
    pub id: Symbol,
    /// Address that filed the dispute (payer).
    pub disputer: Address,
    /// Address being disputed against (worker).
    pub respondent: Address,
    /// Token contract address.
    pub token: Address,
    /// Disputed amount in the token's smallest unit.
    pub amount: i128,
    /// Current status of the dispute.
    pub status: DisputeStatus,
    /// Resolution outcome. `DisputeOutcome::Unresolved` until `status == Resolved`.
    pub outcome: DisputeOutcome,
    /// Arbitrator who resolved the dispute.
    pub arbitrator: Option<Address>,
    /// Unix timestamp when dispute was filed.
    pub filed_at: u64,
    /// Unix timestamp when dispute was resolved.
    pub resolved_at: Option<u64>,
    /// Disputer's evidence hash (SHA-256).
    pub disputer_evidence_hash: Option<String>,
    /// Respondent's evidence hash (SHA-256).
    pub respondent_evidence_hash: Option<String>,
}

/// Storage keys used throughout the contract.
#[contracttype]
pub enum DataKey {
    /// Instance storage — admin address, set once at [`initialize`].
    Admin,
    /// Instance storage — paused flag.
    Paused,
    /// Persistent storage — `Vec<Address>` of arbitrators.
    Arbitrators,
    /// Persistent storage — [`Dispute`] keyed by dispute id.
    Dispute(Symbol),
    /// Persistent storage — ordered list of all dispute ids.
    DisputeList,
}

// =============================================================================
// Contract
// =============================================================================

#[contract]
pub struct DisputeContract;

#[contractimpl]
impl DisputeContract {
    /// Initialize the contract with an admin address.
    ///
    /// # Panics
    /// - `"Already initialized"` if called more than once.
    pub fn initialize(env: Env, admin: Address) {
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "Already initialized"
        );
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        let arbitrators: Vec<Address> = Vec::new(&env);
        env.storage().persistent().set(&DataKey::Arbitrators, &arbitrators);
        env.events().publish((symbol_short!("Init"),), admin);
    }

    /// Get the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized")
    }

    /// Add an arbitrator. Admin only.
    ///
    /// # Panics
    /// - `"Not authorized"` if caller is not admin.
    pub fn add_arbitrator(env: Env, admin: Address, arbitrator: Address) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        assert!(admin == stored_admin, "Not authorized");

        let mut arbitrators: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Arbitrators)
            .unwrap_or(Vec::new(&env));

        if !arbitrators.iter().any(|a| a == arbitrator) {
            arbitrators.push_back(arbitrator.clone());
            env.storage().persistent().set(&DataKey::Arbitrators, &arbitrators);
        }
        env.events().publish((symbol_short!("ArbAdd"),), arbitrator);
    }

    /// Remove an arbitrator. Admin only.
    pub fn remove_arbitrator(env: Env, admin: Address, arbitrator: Address) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        assert!(admin == stored_admin, "Not authorized");

        let arbitrators: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Arbitrators)
            .unwrap_or(Vec::new(&env));

        let mut new_arbitrators: Vec<Address> = Vec::new(&env);
        for a in arbitrators.iter() {
            if a != arbitrator {
                new_arbitrators.push_back(a);
            }
        }
        env.storage().persistent().set(&DataKey::Arbitrators, &new_arbitrators);
        env.events().publish((symbol_short!("ArbRem"),), arbitrator);
    }

    /// File a dispute. Disputer only.
    ///
    /// # Parameters
    /// - `id`: Unique dispute identifier.
    /// - `disputer`: Address filing the dispute.
    /// - `respondent`: Address being disputed against.
    /// - `token`: Token contract address.
    /// - `amount`: Disputed amount.
    /// - `evidence_hash`: SHA-256 hash of disputer's evidence.
    ///
    /// # Panics
    /// - `"Dispute already exists"` if dispute id is already used.
    pub fn file_dispute(
        env: Env,
        id: Symbol,
        disputer: Address,
        respondent: Address,
        token: Address,
        amount: i128,
        evidence_hash: String,
    ) {
        disputer.require_auth();
        assert!(amount > 0, "Amount must be positive");

        let key = DataKey::Dispute(id.clone());
        assert!(
            !env.storage().persistent().has(&key),
            "Dispute already exists"
        );

        let dispute = Dispute {
            id: id.clone(),
            disputer: disputer.clone(),
            respondent,
            token,
            amount,
            status: DisputeStatus::Filed,
            outcome: DisputeOutcome::Unresolved,
            arbitrator: None,
            filed_at: env.ledger().timestamp(),
            resolved_at: None,
            disputer_evidence_hash: Some(evidence_hash),
            respondent_evidence_hash: None,
        };

        env.storage().persistent().set(&key, &dispute);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let list_key = DataKey::DisputeList;
        let mut list: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&list_key)
            .unwrap_or(Vec::new(&env));
        list.push_back(id.clone());
        env.storage().persistent().set(&list_key, &list);
        env.storage().persistent().extend_ttl(&list_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish((symbol_short!("DspFld"), id), (disputer, amount));
    }

    /// Submit evidence for a dispute. Respondent only.
    ///
    /// # Panics
    /// - `"Dispute not found"` if dispute doesn't exist.
    /// - `"Not authorized"` if caller is not the respondent.
    /// - `"Invalid status"` if dispute is not in Filed status.
    pub fn submit_evidence(
        env: Env,
        dispute_id: Symbol,
        respondent: Address,
        evidence_hash: String,
    ) {
        respondent.require_auth();

        let key = DataKey::Dispute(dispute_id.clone());
        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Dispute not found");

        assert!(dispute.respondent == respondent, "Not authorized");
        assert!(dispute.status == DisputeStatus::Filed, "Invalid status");

        dispute.respondent_evidence_hash = Some(evidence_hash);
        dispute.status = DisputeStatus::EvidenceSubmitted;

        env.storage().persistent().set(&key, &dispute);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish((symbol_short!("EvdSub"), dispute_id), respondent);
    }

    /// Resolve a dispute. Arbitrator only.
    ///
    /// # Parameters
    /// - `dispute_id`: The dispute to resolve.
    /// - `arbitrator`: Address of the arbitrator.
    /// - `outcome`: Resolution outcome.
    ///
    /// # Panics
    /// - `"Dispute not found"` if dispute doesn't exist.
    /// - `"Not authorized"` if caller is not an arbitrator.
    /// - `"Invalid status"` if dispute is not in EvidenceSubmitted status.
    pub fn resolve_dispute(
        env: Env,
        dispute_id: Symbol,
        arbitrator: Address,
        outcome: DisputeOutcome,
    ) {
        arbitrator.require_auth();

        let arbitrators: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Arbitrators)
            .unwrap_or(Vec::new(&env));
        assert!(
            arbitrators.iter().any(|a| a == arbitrator),
            "Not authorized"
        );

        let key = DataKey::Dispute(dispute_id.clone());
        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Dispute not found");

        assert!(
            dispute.status == DisputeStatus::EvidenceSubmitted,
            "Invalid status"
        );

        dispute.status = DisputeStatus::Resolved;
        dispute.outcome = outcome;
        dispute.arbitrator = Some(arbitrator.clone());
        dispute.resolved_at = Some(env.ledger().timestamp());

        env.storage().persistent().set(&key, &dispute);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish(
            (symbol_short!("DspRes"), dispute_id),
            (arbitrator, outcome as u32),
        );
    }

    /// Get a dispute by id.
    pub fn get_dispute(env: Env, dispute_id: Symbol) -> Option<Dispute> {
        env.storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
    }

    /// Get all dispute ids.
    pub fn list_disputes(env: Env) -> Vec<Symbol> {
        env.storage()
            .persistent()
            .get(&DataKey::DisputeList)
            .unwrap_or(Vec::new(&env))
    }

    /// Upgrade the contract WASM. Admin only.
    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: soroban_sdk::BytesN<32>) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        assert!(admin == stored_admin, "Not authorized");

        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}
