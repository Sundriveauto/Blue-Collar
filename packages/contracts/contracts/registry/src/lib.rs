//! # BlueCollar Registry Contract
//!
//! Deployed on Stellar (Soroban), this contract manages on-chain worker registrations
//! for the BlueCollar protocol. It provides a trustless, immutable record of worker
//! listings that can be verified by anyone on the network.
//!
//! ## Access Control
//! - **Admin**: Set once at [`initialize`]. Can add/remove curators and upgrade the contract.
//! - **Curators**: Approved addresses that may register workers on behalf of owners.
//! - **Owners**: The worker's on-chain owner address; may toggle, update, or deregister their own worker.
//!
//! ## Storage
//! - Instance storage: `Admin` key (set once).
//! - Persistent storage: `Curators` list, individual `Worker` entries, and `WorkerList` index.
//!
//! ## Privacy
//! Raw PII (location, contact details) is never stored on-chain.
//! Only SHA-256 digests are stored — see `location_hash` and `contact_hash` on [`Worker`].

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, String,
    Symbol, Vec,
};

/// Approximate TTL extension target (~1 year at 5 s/ledger).
const TTL_EXTEND_TO: u32 = 535_000;
/// Extend TTL only when it drops below this threshold (~6 months).
const TTL_THRESHOLD: u32 = 267_500;

// =============================================================================
// Gas Optimization Constants (#351)
// =============================================================================

/// Cached role symbols to reduce symbol creation overhead.
const ROLE_ADMIN_CACHED: &str = "admin";
const ROLE_PAUSER_CACHED: &str = "pauser";
const ROLE_CURATOR_MGR_CACHED: &str = "curator_mgr";
const ROLE_REP_MGR_CACHED: &str = "rep_mgr";
const ROLE_UPGRADER_CACHED: &str = "upgrader";

// =============================================================================
// Types
// =============================================================================

/// Subscription tier for a worker.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SubscriptionTier {
    /// Free tier - no subscription.
    Free = 0,
    /// Basic tier - standard visibility.
    Basic = 1,
    /// Premium tier - enhanced visibility and features.
    Premium = 2,
}

/// Worker subscription information.
#[contracttype]
#[derive(Clone)]
pub struct WorkerSubscription {
    /// Current subscription tier.
    pub tier: SubscriptionTier,
    /// Unix timestamp when subscription expires (0 = never expires).
    pub expires_at: u64,
    /// Unix timestamp of last renewal.
    pub last_renewed_at: u64,
}

/// On-chain worker profile stored in persistent contract storage.
///
/// `location_hash` and `contact_hash` are SHA-256 digests — raw PII is never
/// stored on-chain. See README § Hashing Scheme for the exact input format.
#[contracttype]
#[derive(Clone)]
pub struct Worker {
    /// Unique worker identifier (matches the off-chain database id).
    pub id: Symbol,
    /// Stellar address of the worker's owner account.
    pub owner: Address,
    /// Display name of the worker.
    pub name: String,
    /// Trade/skill category (e.g. `plumber`, `electrician`).
    pub category: Symbol,
    /// Whether the worker is currently accepting work.
    pub is_active: bool,
    /// Stellar wallet address used to receive tips/payments.
    pub wallet: Address,
    /// SHA-256( lowercase(city) + ":" + lowercase(country_iso2) )
    pub location_hash: BytesN<32>,
    /// SHA-256( lowercase(email_or_e164_phone) )
    pub contact_hash: BytesN<32>,
    /// Reputation score in basis points (0–10000, where 10000 = 100.00%).
    /// Updated by the admin via [`RegistryContract::update_reputation`].
    pub reputation: u32,
    /// On-chain verified categories for this worker (see [`CategoryVerification`]).
    pub verified_categories: Vec<Symbol>,
    /// Total tokens staked by this worker for visibility boost.
    pub staked_amount: i128,
    /// Total number of reviews received by this worker.
    pub review_count: u32,
    /// Average rating in basis points (0–10000, where 10000 = 100.00%).
    pub avg_rating: u32,
    /// Worker subscription status.
    pub subscription: WorkerSubscription,
}

/// Delegate record for worker profile management.
#[contracttype]
#[derive(Clone)]
pub struct Delegate {
    /// Address granted delegation.
    pub address: Address,
    /// Unix timestamp when delegation expires (0 = no expiry).
    pub expires_at: u64,
}

/// Performance metrics for a worker (#378).
#[contracttype]
#[derive(Clone)]
pub struct PerformanceMetrics {
    /// Total number of jobs completed.
    pub jobs_completed: u32,
    /// Average rating (0-10000 basis points).
    pub avg_rating: u32,
    /// Total number of ratings received.
    pub total_ratings: u32,
    /// Last update timestamp.
    pub last_updated: u64,
    /// Performance score (calculated from metrics).
    pub performance_score: u32,
}

/// Delegate authorization for a worker.
#[contracttype]
#[derive(Clone)]
pub struct Delegate {
    /// Delegate address.
    pub address: Address,
    /// Expiry timestamp (0 = no expiry).
    pub expires_at: u64,
}

/// On-chain record of a curator verifying a worker's category.
#[contracttype]
#[derive(Clone)]
pub struct CategoryVerification {
    /// The category that was verified.
    pub category: Symbol,
    /// Curator who performed the verification.
    pub curator: Address,
    /// Unix timestamp when this verification expires.
    pub expires_at: u64,
}

/// Location verification record for a worker.
#[contracttype]
#[derive(Clone)]
pub struct LocationVerification {
    /// Verifier address.
    pub verifier: Address,
    /// Unix timestamp when verification was recorded.
    pub verified_at: u64,
    /// Unix timestamp when verification expires.
    pub expires_at: u64,
}

/// Worker availability status.
#[contracttype]
#[derive(Clone)]
pub struct AvailabilityStatus {
    /// Whether worker is currently available.
    pub is_available: bool,
    /// Unix timestamp of last availability update.
    pub updated_at: u64,
    /// Unix timestamp when availability status expires (0 = no expiry).
    pub expires_at: u64,
}

/// Staking record for a worker.
#[contracttype]
#[derive(Clone)]
pub struct StakeInfo {
    /// Token contract used for staking.
    pub token: Address,
    /// Total amount currently staked.
    pub amount: i128,
    /// Ledger timestamp when unstake was requested (0 = no pending unstake).
    pub unstake_requested_at: u64,
    /// Accumulated rewards in basis points of staked amount per ledger.
    pub rewards_accumulated: i128,
    /// Ledger timestamp of last reward calculation.
    pub last_reward_ledger: u64,
}

/// Badge awarded to a worker for achievements (#380).
#[contracttype]
#[derive(Clone)]
pub struct Badge {
    /// Badge identifier.
    pub id: Symbol,
    /// Badge name/title.
    pub name: String,
    /// Issuer address (admin or curator).
    pub issuer: Address,
    /// Timestamp when badge was awarded.
    pub awarded_at: u64,
    /// Expiry timestamp (0 = no expiry).
    pub expires_at: u64,
    /// Whether badge is currently active.
    pub active: bool,
}

/// Result of a single registration attempt in [`RegistryContract::batch_register`].
#[contracttype]
#[derive(Clone)]
pub struct BatchRegisterResult {
    pub id: Symbol,
    pub success: bool,
}

// =============================================================================
// Roles
// =============================================================================

/// Full admin — can grant/revoke any role and call all privileged functions.
pub const ROLE_ADMIN: &str = "admin";
/// May pause and unpause the contract.
pub const ROLE_PAUSER: &str = "pauser";
/// May add and remove curators.
pub const ROLE_CURATOR_MGR: &str = "curator_mgr";
/// May update worker reputation scores.
pub const ROLE_REP_MGR: &str = "rep_mgr";
/// May upgrade the contract WASM.
pub const ROLE_UPGRADER: &str = "upgrader";

/// Storage keys used throughout the contract.
#[contracttype]
pub enum DataKey {
    /// Instance storage — bootstrap admin address, set once at [`RegistryContract::initialize`].
    Admin,
    /// Instance storage — paused flag; when `true` all state-mutating functions revert.
    Paused,
    /// Persistent storage — `Vec<Address>` of members for a given role [`Symbol`].
    RoleMembers(Symbol),
    /// Persistent storage — ordered list of approved curator [`Address`]es.
    Curators,
    /// Persistent storage — [`Worker`] record keyed by its `id` [`Symbol`].
    Worker(Symbol),
    /// Persistent storage — ordered list of all registered worker id [`Symbol`]s.
    WorkerList,
    /// Persistent storage — [`CategoryVerification`] keyed by `(worker_id, category)`.
    CategoryVerification(Symbol, Symbol),
    /// Persistent storage — [`StakeInfo`] keyed by worker id.
    StakeInfo(Symbol),
    /// Persistent storage — [`PerformanceMetrics`] keyed by worker id.
    PerformanceMetrics(Symbol),
    /// Persistent storage — list of delegate addresses for a worker.
    Delegates(Symbol),
    /// Persistent storage — list of badges for a worker.
    WorkerBadges(Symbol),
    /// Persistent storage — individual badge keyed by (worker_id, badge_id).
    Badge(Symbol, Symbol),
    /// Persistent storage — [`WorkerSubscription`] keyed by worker id.
    Subscription(Symbol),
}

// =============================================================================
// Contract
// =============================================================================

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    // -------------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------------

    /// Initialise the contract and set the admin address.
    ///
    /// Grants [`ROLE_ADMIN`] to `admin` automatically.
    ///
    /// # Parameters
    /// - `admin`: The address that will have admin privileges.
    ///
    /// # Panics
    /// Panics with `"Already initialized"` if called more than once.
    pub fn initialize(env: Env, admin: Address) {
        assert!(
            !env.storage().instance().has(&DataKey::Admin),
            "Already initialized"
        );
        env.storage().instance().set(&DataKey::Admin, &admin);
        // Bootstrap: grant ROLE_ADMIN to the initial admin.
        let role = Symbol::new(&env, ROLE_ADMIN);
        let mut members: Vec<Address> = Vec::new(&env);
        members.push_back(admin.clone());
        env.storage().persistent().set(&DataKey::RoleMembers(role.clone()), &members);
        env.events().publish((symbol_short!("RlGrnt"), role, admin), ());
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// Return the member list for a role, or empty vec if no members exist.
    fn get_role_members(env: &Env, role: &Symbol) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::RoleMembers(role.clone()))
            .unwrap_or(Vec::new(env))
    }

    /// Create a role symbol efficiently (gas optimization #351).
    fn role_symbol(env: &Env, role_str: &str) -> Symbol {
        Symbol::new(env, role_str)
    }

    /// Assert that `caller` holds `role` and has authorised this call.
    ///
    /// # Panics
    /// Panics with `"Missing role"` if `caller` does not hold the role.
    fn require_role(env: &Env, role: &Symbol, caller: &Address) {
        caller.require_auth();
        let members = Self::get_role_members(env, role);
        assert!(members.iter().any(|m| m == *caller), "Missing role");
    }

    /// Assert that the contract is not paused.
    ///
    /// # Panics
    /// Panics with `"Contract is paused"` if the paused flag is set.
    fn require_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        assert!(!paused, "Contract is paused");
    }

    /// Return the delegate list for a worker, or empty vec if none exist.
    fn get_delegates(env: &Env, worker_id: &Symbol) -> Vec<Delegate> {
        env.storage()
            .persistent()
            .get(&DataKey::Delegates(worker_id.clone()))
            .unwrap_or(Vec::new(env))
    }

    /// Assert that `caller` is either the worker's owner or an active (non-expired) delegate.
    ///
    /// # Panics
    /// Panics with `"Not authorized"` if neither condition holds.
    fn require_owner_or_delegate(env: &Env, worker: &Worker, caller: &Address) {
        if worker.owner == *caller {
            return;
        }
        let now = env.ledger().timestamp();
        let delegates = Self::get_delegates(env, &worker.id);
        let is_valid_delegate = delegates.iter().any(|d| {
            d.address == *caller && (d.expires_at == 0 || d.expires_at > now)
        });
        assert!(is_valid_delegate, "Not authorized");
    }

    // -------------------------------------------------------------------------
    // Role management (ROLE_ADMIN only)
    // -------------------------------------------------------------------------

    /// Grant a role to an address. Caller must hold [`ROLE_ADMIN`].
    ///
    /// Idempotent — granting an already-held role is a no-op.
    ///
    /// # Parameters
    /// - `caller`: Must hold `ROLE_ADMIN`; `require_auth()` is enforced.
    /// - `role`: The role symbol to grant (e.g. `Symbol::new(&env, "pauser")`).
    /// - `account`: Address to receive the role.
    ///
    /// # Panics
    /// - `"Missing role"` if `caller` does not hold `ROLE_ADMIN`.
    /// - `"Contract is paused"` if paused.
    ///
    /// # Events
    /// Emits `("RlGrnt", role, account)`.
    pub fn grant_role(env: Env, caller: Address, role: Symbol, account: Address) {
        let admin_role = Self::role_symbol(&env, ROLE_ADMIN_CACHED);
        Self::require_role(&env, &admin_role, &caller);
        Self::require_not_paused(&env);

        let mut members = Self::get_role_members(&env, &role);
        if members.iter().all(|m| m != account) {
            members.push_back(account.clone());
            env.storage().persistent().set(&DataKey::RoleMembers(role.clone()), &members);
        }

        env.events().publish((symbol_short!("RlGrnt"), role, account), ());
    }

    /// Revoke a role from an address. Caller must hold [`ROLE_ADMIN`].
    ///
    /// # Parameters
    /// - `caller`: Must hold `ROLE_ADMIN`; `require_auth()` is enforced.
    /// - `role`: The role symbol to revoke.
    /// - `account`: Address to lose the role.
    ///
    /// # Panics
    /// - `"Missing role"` if `caller` does not hold `ROLE_ADMIN`.
    /// - `"Account does not hold role"` if `account` is not a member.
    /// - `"Contract is paused"` if paused.
    ///
    /// # Events
    /// Emits `("RlRvkd", role, account)`.
    pub fn revoke_role(env: Env, caller: Address, role: Symbol, account: Address) {
        let admin_role = Self::role_symbol(&env, ROLE_ADMIN_CACHED);
        Self::require_role(&env, &admin_role, &caller);
        Self::require_not_paused(&env);

        let members = Self::get_role_members(&env, &role);
        let mut updated: Vec<Address> = Vec::new(&env);
        let mut found = false;
        for m in members.iter() {
            if m == account {
                found = true;
            } else {
                updated.push_back(m);
            }
        }
        assert!(found, "Account does not hold role");
        env.storage().persistent().set(&DataKey::RoleMembers(role.clone()), &updated);

        env.events().publish((symbol_short!("RlRvkd"), role, account), ());
    }

    /// Returns `true` if `account` holds `role`.
    pub fn has_role(env: Env, role: Symbol, account: Address) -> bool {
        Self::get_role_members(&env, &role).iter().any(|m| m == account)
    }

    /// Return all members of a role.
    pub fn get_role_members_list(env: Env, role: Symbol) -> Vec<Address> {
        Self::get_role_members(&env, &role)
    }

    // -------------------------------------------------------------------------
    // Delegation management
    // -------------------------------------------------------------------------

    /// Add a delegate for a worker profile. Owner only.
    ///
    /// Idempotent — adding an existing delegate updates its expiry.
    ///
    /// # Parameters
    /// - `id`: The worker's unique identifier.
    /// - `owner`: Must be the worker's owner; `require_auth()` is enforced.
    /// - `delegate`: Address to grant delegation to.
    /// - `expires_at`: Unix timestamp when the delegation expires. Pass `0` for no expiry.
    ///
    /// # Panics
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Not authorized"` if `owner` is not the worker's owner.
    /// - `"Contract is paused"` if paused.
    ///
    /// # Events
    /// Emits `("DlgAdd", id, delegate)` with data `expires_at`.
    pub fn add_delegate(env: Env, id: Symbol, owner: Address, delegate: Address, expires_at: u64) {
        owner.require_auth();
        Self::require_not_paused(&env);

        let worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");
        assert!(worker.owner == owner, "Not authorized");

        let mut delegates = Self::get_delegates(&env, &id);

        // Update expiry if delegate already exists, otherwise push.
        let mut found = false;
        for i in 0..delegates.len() {
            let mut d = delegates.get(i).unwrap();
            if d.address == delegate {
                d.expires_at = expires_at;
                delegates.set(i, d);
                found = true;
                break;
            }
        }
        if !found {
            delegates.push_back(Delegate { address: delegate.clone(), expires_at });
        }

        env.storage().persistent().set(&DataKey::Delegates(id.clone()), &delegates);

        env.events().publish(
            (symbol_short!("DlgAdd"), id, delegate),
            expires_at,
        );
    }

    /// Remove a delegate from a worker profile. Owner only.
    ///
    /// # Parameters
    /// - `id`: The worker's unique identifier.
    /// - `owner`: Must be the worker's owner; `require_auth()` is enforced.
    /// - `delegate`: Address to revoke delegation from.
    ///
    /// # Panics
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Not authorized"` if `owner` is not the worker's owner.
    /// - `"Delegate not found"` if `delegate` is not in the list.
    /// - `"Contract is paused"` if paused.
    ///
    /// # Events
    /// Emits `("DlgRem", id, delegate)`.
    pub fn remove_delegate(env: Env, id: Symbol, owner: Address, delegate: Address) {
        owner.require_auth();
        Self::require_not_paused(&env);

        let worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");
        assert!(worker.owner == owner, "Not authorized");

        let delegates = Self::get_delegates(&env, &id);
        let mut updated: Vec<Delegate> = Vec::new(&env);
        let mut removed = false;
        for d in delegates.iter() {
            if d.address == delegate {
                removed = true;
            } else {
                updated.push_back(d);
            }
        }
        assert!(removed, "Delegate not found");

        env.storage().persistent().set(&DataKey::Delegates(id.clone()), &updated);

        env.events().publish(
            (symbol_short!("DlgRem"), id, delegate),
            (),
        );
    }

    /// Get all delegates for a worker.
    ///
    /// # Returns
    /// A `Vec<Delegate>` (may be empty).
    pub fn get_worker_delegates(env: Env, id: Symbol) -> Vec<Delegate> {
        Self::get_delegates(&env, &id)
    }

    // -------------------------------------------------------------------------
    // Pause / Unpause (admin only)
    // -------------------------------------------------------------------------

    /// Pause the contract, blocking all state-mutating operations.
    ///
    /// # Parameters
    /// - `admin`: Must hold [`ROLE_PAUSER`]; `require_auth()` is enforced.
    ///
    /// # Panics
    /// Panics with `"Missing role"` if `admin` does not hold `ROLE_PAUSER`.
    ///
    /// # Events
    /// Emits `("Paused", admin)`.
    pub fn pause(env: Env, admin: Address) {
        let pauser_role = Self::role_symbol(&env, ROLE_PAUSER_CACHED);
        Self::require_role(&env, &pauser_role, &admin);
        env.storage().instance().set(&DataKey::Paused, &true);
        env.events().publish((symbol_short!("Paused"), admin), ());
    }

    /// Unpause the contract, re-enabling all state-mutating operations.
    ///
    /// # Parameters
    /// - `admin`: Must hold [`ROLE_PAUSER`]; `require_auth()` is enforced.
    ///
    /// # Panics
    /// Panics with `"Missing role"` if `admin` does not hold `ROLE_PAUSER`.
    ///
    /// # Events
    /// Emits `("Unpaused", admin)`.
    pub fn unpause(env: Env, admin: Address) {
        let pauser_role = Self::role_symbol(&env, ROLE_PAUSER_CACHED);
        Self::require_role(&env, &pauser_role, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.events().publish((symbol_short!("Unpaused"), admin), ());
    }

    /// Returns `true` if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    /// Return the current curator list, or an empty vec if none have been added yet.
    fn get_curators(env: &Env) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Curators)
            .unwrap_or(Vec::new(env))
    }

    // -------------------------------------------------------------------------
    // Curator management
    // -------------------------------------------------------------------------

    /// Add a curator (admin only). Idempotent — adding an existing curator is a no-op.
    ///
    /// # Parameters
    /// - `admin`: Must be the contract admin; `require_auth()` is enforced.
    /// - `curator`: Address to grant curator privileges.
    ///
    /// # Panics
    /// Panics with `"Admin only"` if `admin` is not the stored admin.
    ///
    /// # Events
    /// Emits `("CurAdd", admin, curator)`.
    pub fn add_curator(env: Env, admin: Address, curator: Address) {
        let curator_mgr_role = Self::role_symbol(&env, ROLE_CURATOR_MGR_CACHED);
        Self::require_role(&env, &curator_mgr_role, &admin);
        Self::require_not_paused(&env);

        let mut curators = Self::get_curators(&env);
        if curators.iter().all(|c| c != curator) {
            curators.push_back(curator.clone());
            env.storage().persistent().set(&DataKey::Curators, &curators);
        }

        env.events().publish((symbol_short!("CurAdd"), admin, curator), ());
    }

    /// Remove a curator (admin only).
    ///
    /// # Parameters
    /// - `admin`: Must be the contract admin; `require_auth()` is enforced.
    /// - `curator`: Address to revoke curator privileges from.
    ///
    /// # Panics
    /// Panics with `"Admin only"` if `admin` is not the stored admin.
    ///
    /// # Events
    /// Emits `("CurRem", admin, curator)`.
    pub fn remove_curator(env: Env, admin: Address, curator: Address) {
        let curator_mgr_role = Self::role_symbol(&env, ROLE_CURATOR_MGR_CACHED);
        Self::require_role(&env, &curator_mgr_role, &admin);
        Self::require_not_paused(&env);

        let curators = Self::get_curators(&env);
        let mut updated: Vec<Address> = Vec::new(&env);
        for c in curators.iter() {
            if c != curator {
                updated.push_back(c);
            }
        }
        env.storage().persistent().set(&DataKey::Curators, &updated);

        env.events().publish((symbol_short!("CurRem"), admin, curator), ());
    }

    /// Returns `true` if `addr` is an approved curator.
    ///
    /// # Parameters
    /// - `addr`: The address to check.
    pub fn is_curator(env: Env, addr: Address) -> bool {
        Self::get_curators(&env).iter().any(|c| c == addr)
    }

    // -------------------------------------------------------------------------
    // Worker registration (curator-gated)
    // -------------------------------------------------------------------------

    /// Register a new worker on-chain. Caller must be an authorised curator.
    ///
    /// Automatically extends the TTL of the new worker entry and the worker list
    /// to [`TTL_EXTEND_TO`] ledgers if below [`TTL_THRESHOLD`].
    ///
    /// # Parameters
    /// - `id`: Unique worker identifier (must not already exist).
    /// - `owner`: Stellar address of the worker's owner.
    /// - `name`: Display name.
    /// - `category`: Trade category symbol.
    /// - `location_hash`: SHA-256(lowercase(city) + ":" + lowercase(country_iso2)).
    /// - `contact_hash`: SHA-256(lowercase(email) or E.164 phone).
    /// - `curator`: Must be an approved curator; `require_auth()` is enforced.
    ///
    /// # Panics
    /// Panics with `"Caller is not a curator"` if `curator` is not in the curator list.
    ///
    /// # Events
    /// Emits `("WrkReg", id)` with data `(owner, category)`.
    pub fn register(
        env: Env,
        id: Symbol,
        owner: Address,
        name: String,
        category: Symbol,
        location_hash: BytesN<32>,
        contact_hash: BytesN<32>,
        curator: Address,
    ) {
        curator.require_auth();
        Self::require_not_paused(&env);
        assert!(
            Self::get_curators(&env).iter().any(|c| c == curator),
            "Caller is not a curator"
        );

        let worker = Worker {
            id: id.clone(),
            owner: owner.clone(),
            name,
            category: category.clone(),
            is_active: true,
            wallet: owner.clone(),
            location_hash,
            contact_hash,
            reputation: 0,
            verified_categories: Vec::new(&env),
            staked_amount: 0,
            review_count: 0,
            avg_rating: 0,
            subscription: WorkerSubscription {
                tier: SubscriptionTier::Free,
                expires_at: 0,
                last_renewed_at: env.ledger().timestamp(),
            },
        };

        let key = DataKey::Worker(id.clone());
        env.storage().persistent().set(&key, &worker);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let list_key = DataKey::WorkerList;
        let mut list: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&list_key)
            .unwrap_or(Vec::new(&env));
        list.push_back(id.clone());
        env.storage().persistent().set(&list_key, &list);
        env.storage().persistent().extend_ttl(&list_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish(
            (symbol_short!("WrkReg"), id),
            (owner, category),
        );
    }

    // -------------------------------------------------------------------------
    // Worker owner functions
    // -------------------------------------------------------------------------

    /// Toggle a worker's `is_active` status. Only the worker's owner may call this.
    ///
    /// # Parameters
    /// - `id`: The worker's unique identifier.
    /// - `caller`: Must be the worker's `owner`; `require_auth()` is enforced.
    ///
    /// # Panics
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Not authorized"` if `caller` is not the worker's owner.
    ///
    /// # Events
    /// Emits `("WrkTgl", id)` with data `new_is_active: bool`.
    pub fn toggle(env: Env, id: Symbol, caller: Address) {
        caller.require_auth();
        Self::require_not_paused(&env);
        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");
        Self::require_owner_or_delegate(&env, &worker, &caller);
        worker.is_active = !worker.is_active;
        let new_status = worker.is_active;
        env.storage().persistent().set(&DataKey::Worker(id.clone()), &worker);

        env.events().publish((symbol_short!("WrkTgl"), id), new_status);
    }

    /// Update a worker's name, category, location hash, and contact hash. Owner only.
    ///
    /// Pass existing hash values unchanged if only updating name/category.
    ///
    /// # Parameters
    /// - `id`: The worker's unique identifier.
    /// - `caller`: Must be the worker's `owner`; `require_auth()` is enforced.
    /// - `name`: New display name.
    /// - `category`: New trade category symbol.
    /// - `location_hash`: New or unchanged location hash.
    /// - `contact_hash`: New or unchanged contact hash.
    ///
    /// # Panics
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Not authorized"` if `caller` is not the worker's owner.
    ///
    /// # Events
    /// Emits `("WrkUpd", id)` with data `(name, category)`.
    pub fn update(
        env: Env,
        id: Symbol,
        caller: Address,
        name: String,
        category: Symbol,
        location_hash: BytesN<32>,
        contact_hash: BytesN<32>,
    ) {
        caller.require_auth();
        Self::require_not_paused(&env);
        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");
        Self::require_owner_or_delegate(&env, &worker, &caller);

        worker.name = name.clone();
        worker.category = category.clone();
        worker.location_hash = location_hash;
        worker.contact_hash = contact_hash;

        env.storage().persistent().set(&DataKey::Worker(id.clone()), &worker);

        env.events().publish(
            (symbol_short!("WrkUpd"), id),
            (name, category),
        );
    }

    /// Update a worker's name, category, and wallet address. Owner only.
    ///
    /// # Parameters
    /// - `id`: The worker's unique identifier.
    /// - `caller`: Must be the worker's `owner`; `require_auth()` is enforced.
    /// - `name`: New display name.
    /// - `category`: New trade category symbol.
    /// - `wallet`: New Stellar wallet address for receiving payments.
    ///
    /// # Panics
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Not authorized"` if `caller` is not the worker's owner.
    ///
    /// # Events
    /// Emits `("WrkUpd", id, caller)` with data `(name, category, wallet)`.
    pub fn update_worker(
        env: Env,
        id: Symbol,
        caller: Address,
        name: String,
        category: Symbol,
        wallet: Address,
    ) {
        caller.require_auth();
        Self::require_not_paused(&env);

        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");

        Self::require_owner_or_delegate(&env, &worker, &caller);

        worker.name = name.clone();
        worker.category = category.clone();
        worker.wallet = wallet.clone();
        env.storage().persistent().set(&DataKey::Worker(id.clone()), &worker);

        env.events().publish(
            (symbol_short!("WrkUpd"), id, caller),
            (name, category, wallet),
        );
    }

    /// Permanently remove a worker from the registry. Owner only.
    ///
    /// Removes the worker entry from persistent storage and from the `WorkerList` index.
    ///
    /// # Parameters
    /// - `id`: The worker's unique identifier.
    /// - `caller`: Must be the worker's `owner`; `require_auth()` is enforced.
    ///
    /// # Panics
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Not authorized"` if `caller` is not the worker's owner.
    ///
    /// # Events
    /// Emits `("WrkDrg", id, caller)`.
    pub fn deregister(env: Env, id: Symbol, caller: Address) {
        caller.require_auth();
        Self::require_not_paused(&env);
        let worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");
        assert!(worker.owner == caller, "Not authorized");
        env.storage().persistent().remove(&DataKey::Worker(id.clone()));

        let mut list: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&DataKey::WorkerList)
            .unwrap_or(Vec::new(&env));
        if let Some(pos) = list.iter().position(|x| x == id) {
            list.remove(pos as u32);
        }
        env.storage().persistent().set(&DataKey::WorkerList, &list);

        env.events().publish(
            (symbol_short!("WrkDrg"), id, caller),
            (),
        );
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// Get a worker by id.
    ///
    /// # Parameters
    /// - `id`: The worker's unique identifier.
    ///
    /// # Returns
    /// `Some(Worker)` if found, `None` otherwise.
    pub fn get_worker(env: Env, id: Symbol) -> Option<Worker> {
        env.storage().persistent().get(&DataKey::Worker(id))
    }

    /// List all registered worker ids.
    ///
    /// For large registries, prefer [`list_workers_paginated`] to avoid hitting
    /// Soroban's read-entry limits.
    pub fn list_workers(env: Env) -> Vec<Symbol> {
        env.storage()
            .persistent()
            .get(&DataKey::WorkerList)
            .unwrap_or(Vec::new(&env))
    }

    /// Return a page of worker ids starting at `offset`, up to `limit` items.
    ///
    /// # Parameters
    /// - `offset`: Zero-based index of the first item to return.
    /// - `limit`: Maximum number of items to return.
    ///
    /// # Returns
    /// A [`Vec<Symbol>`] of worker ids. Returns an empty vec if `offset >= total`.
    pub fn list_workers_paginated(env: Env, offset: u32, limit: u32) -> Vec<Symbol> {
        let list: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&DataKey::WorkerList)
            .unwrap_or(Vec::new(&env));

        let total = list.len();
        let mut page: Vec<Symbol> = Vec::new(&env);

        if offset >= total || limit == 0 {
            return page;
        }

        let end = (offset + limit).min(total);
        for i in offset..end {
            page.push_back(list.get(i).unwrap());
        }
        page
    }

    /// Return the total number of registered workers.
    pub fn worker_count(env: Env) -> u32 {
        let list: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&DataKey::WorkerList)
            .unwrap_or(Vec::new(&env));
        list.len()
    }

    /// Returns `true` if the contract has been initialised.
    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    /// Get the admin address.
    ///
    /// # Panics
    /// Panics with `"Not initialized"` if [`initialize`] has not been called.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized")
    }

    // -------------------------------------------------------------------------
    // Reputation
    // -------------------------------------------------------------------------

    /// Update a worker's on-chain reputation score (admin only).
    ///
    /// # Parameters
    /// - `admin`: Must be the contract admin; `require_auth()` is enforced.
    /// - `id`: The worker's unique identifier.
    /// - `score`: New reputation score in basis points (0–10000).
    ///
    /// # Panics
    /// - `"Admin only"` if `admin` is not the stored admin.
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Score out of range"` if `score > 10000`.
    ///
    /// # Events
    /// Emits `("RepUpd", id)` with data `score`.
    pub fn update_reputation(env: Env, admin: Address, id: Symbol, score: u32) {
        let rep_mgr_role = Self::role_symbol(&env, ROLE_REP_MGR_CACHED);
        Self::require_role(&env, &rep_mgr_role, &admin);
        Self::require_not_paused(&env);
        assert!(score <= 10_000, "Score out of range");

        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");

        worker.reputation = score;
        env.storage().persistent().set(&DataKey::Worker(id.clone()), &worker);

        env.events().publish((symbol_short!("RepUpd"), id), score);
    }

    /// Update a worker's review count and average rating. Admin only.
    ///
    /// Calculates weighted average rating based on review count and new rating.
    ///
    /// # Parameters
    /// - `admin`: Must have admin role; `require_auth()` is enforced.
    /// - `id`: The worker's unique identifier.
    /// - `review_count`: Total number of reviews.
    /// - `avg_rating`: Average rating in basis points (0–10000).
    ///
    /// # Panics
    /// - `"Missing role"` if `admin` does not have admin role.
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Rating out of range"` if `avg_rating > 10000`.
    ///
    /// # Events
    /// Emits `("RevUpd", id)` with data `(review_count, avg_rating)`.
    pub fn update_reviews(
        env: Env,
        admin: Address,
        id: Symbol,
        review_count: u32,
        avg_rating: u32,
    ) {
        Self::require_role(&env, &Symbol::new(&env, ROLE_ADMIN), &admin);
        Self::require_not_paused(&env);
        assert!(avg_rating <= 10_000, "Rating out of range");

        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");

        worker.review_count = review_count;
        worker.avg_rating = avg_rating;
        env.storage().persistent().set(&DataKey::Worker(id.clone()), &worker);
        env.storage().persistent().extend_ttl(&DataKey::Worker(id.clone()), TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish((symbol_short!("RevUpd"), id), (review_count, avg_rating));
    }

    /// Update a worker's subscription tier and expiration. Admin only.
    ///
    /// # Parameters
    /// - `admin`: Must have admin role; `require_auth()` is enforced.
    /// - `id`: The worker's unique identifier.
    /// - `tier`: New subscription tier (0=Free, 1=Basic, 2=Premium).
    /// - `expires_at`: Unix timestamp when subscription expires (0 = never).
    ///
    /// # Panics
    /// - `"Missing role"` if `admin` does not have admin role.
    /// - `"Worker not found"` if no worker exists with the given `id`.
    ///
    /// # Events
    /// Emits `("SubUpd", id)` with data `(tier, expires_at)`.
    pub fn update_subscription(
        env: Env,
        admin: Address,
        id: Symbol,
        tier: u32,
        expires_at: u64,
    ) {
        Self::require_role(&env, &Symbol::new(&env, ROLE_ADMIN), &admin);
        Self::require_not_paused(&env);

        let tier_enum = match tier {
            0 => SubscriptionTier::Free,
            1 => SubscriptionTier::Basic,
            2 => SubscriptionTier::Premium,
            _ => panic!("Invalid subscription tier"),
        };

        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");

        let now = env.ledger().timestamp();
        worker.subscription = WorkerSubscription {
            tier: tier_enum,
            expires_at,
            last_renewed_at: now,
        };

        env.storage().persistent().set(&DataKey::Worker(id.clone()), &worker);
        env.storage().persistent().extend_ttl(&DataKey::Worker(id.clone()), TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish((symbol_short!("SubUpd"), id), (tier, expires_at));
    }

    /// Renew a worker's subscription. Owner or delegate only.
    ///
    /// # Parameters
    /// - `caller`: Worker owner or delegate; `require_auth()` is enforced.
    /// - `id`: The worker's unique identifier.
    /// - `new_expires_at`: New expiration timestamp.
    ///
    /// # Panics
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Not authorized"` if caller is not owner or delegate.
    ///
    /// # Events
    /// Emits `("SubRnw", id)` with data `new_expires_at`.
    pub fn renew_subscription(env: Env, caller: Address, id: Symbol, new_expires_at: u64) {
        caller.require_auth();
        Self::require_not_paused(&env);

        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");

        Self::require_owner_or_delegate(&env, &worker, &caller);

        let now = env.ledger().timestamp();
        worker.subscription.expires_at = new_expires_at;
        worker.subscription.last_renewed_at = now;

        env.storage().persistent().set(&DataKey::Worker(id.clone()), &worker);
        env.storage().persistent().extend_ttl(&DataKey::Worker(id.clone()), TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish((symbol_short!("SubRnw"), id), new_expires_at);
    }

    /// Get a worker's subscription status.
    ///
    /// # Parameters
    /// - `id`: The worker's unique identifier.
    ///
    /// # Returns
    /// The [`WorkerSubscription`] for the worker, or panics if not found.
    pub fn get_subscription(env: Env, id: Symbol) -> WorkerSubscription {
        let worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id))
            .expect("Worker not found");

        worker.subscription
    }

    // -------------------------------------------------------------------------
    // Category verification (#338)
    // -------------------------------------------------------------------------

    /// Verify a worker's category on-chain. Curator only.
    ///
    /// Adds `category` to the worker's `verified_categories` list (idempotent) and
    /// stores a [`CategoryVerification`] record with expiry and curator info.
    ///
    /// # Panics
    /// - `"Caller is not a curator"` / `"Worker not found"`.
    ///
    /// # Events
    /// Emits `("CatVfy", worker_id, category)` with data `(curator, expires_at)`.
    pub fn verify_category(
        env: Env,
        curator: Address,
        worker_id: Symbol,
        category: Symbol,
        expires_at: u64,
    ) {
        curator.require_auth();
        assert!(
            Self::get_curators(&env).iter().any(|c| c == curator),
            "Caller is not a curator"
        );

        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(worker_id.clone()))
            .expect("Worker not found");

        if worker.verified_categories.iter().all(|c| c != category) {
            worker.verified_categories.push_back(category.clone());
            env.storage().persistent().set(&DataKey::Worker(worker_id.clone()), &worker);
        }

        let verification = CategoryVerification {
            category: category.clone(),
            curator: curator.clone(),
            expires_at,
        };
        env.storage().persistent().set(
            &DataKey::CategoryVerification(worker_id.clone(), category.clone()),
            &verification,
        );

        env.events().publish(
            (symbol_short!("CatVfy"), worker_id, category),
            (curator, expires_at),
        );
    }

    /// Get the verification record for a specific worker + category pair.
    pub fn get_category_verification(
        env: Env,
        worker_id: Symbol,
        category: Symbol,
    ) -> Option<CategoryVerification> {
        env.storage()
            .persistent()
            .get(&DataKey::CategoryVerification(worker_id, category))
    }

    // -------------------------------------------------------------------------
    // Location verification (#352)
    // -------------------------------------------------------------------------

    /// Verify a worker's location on-chain. Verifier role required.
    ///
    /// # Parameters
    /// - `verifier`: Address with verification authority; `require_auth()` is enforced.
    /// - `worker_id`: The worker's unique identifier.
    /// - `expires_at`: Unix timestamp when verification expires.
    ///
    /// # Panics
    /// - `"Worker not found"` if no worker exists with the given `worker_id`.
    ///
    /// # Events
    /// Emits `("LocVfy", worker_id)` with data `(verifier, verified_at, expires_at)`.
    pub fn verify_location(
        env: Env,
        verifier: Address,
        worker_id: Symbol,
        expires_at: u64,
    ) {
        verifier.require_auth();
        let _worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(worker_id.clone()))
            .expect("Worker not found");

        let now = env.ledger().timestamp();
        let verification = LocationVerification {
            verifier: verifier.clone(),
            verified_at: now,
            expires_at,
        };
        env.storage().persistent().set(
            &DataKey::LocationVerification(worker_id.clone()),
            &verification,
        );

        env.events().publish(
            (symbol_short!("LocVfy"), worker_id),
            (verifier, now, expires_at),
        );
    }

    /// Get the location verification record for a worker.
    pub fn get_location_verification(
        env: Env,
        worker_id: Symbol,
    ) -> Option<LocationVerification> {
        env.storage()
            .persistent()
            .get(&DataKey::LocationVerification(worker_id))
    }

    // -------------------------------------------------------------------------
    // Availability status (#376)
    // -------------------------------------------------------------------------

    /// Update a worker's availability status. Owner only.
    ///
    /// # Parameters
    /// - `id`: The worker's unique identifier.
    /// - `caller`: Must be the worker's owner; `require_auth()` is enforced.
    /// - `is_available`: New availability status.
    /// - `expires_at`: Unix timestamp when availability status expires (0 = no expiry).
    ///
    /// # Panics
    /// - `"Worker not found"` if no worker exists with the given `id`.
    /// - `"Not authorized"` if `caller` is not the worker's owner.
    ///
    /// # Events
    /// Emits `("AvlUpd", id)` with data `(is_available, updated_at, expires_at)`.
    pub fn update_availability(
        env: Env,
        id: Symbol,
        caller: Address,
        is_available: bool,
        expires_at: u64,
    ) {
        caller.require_auth();
        let worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(id.clone()))
            .expect("Worker not found");
        assert!(worker.owner == caller, "Not authorized");

        let now = env.ledger().timestamp();
        let status = AvailabilityStatus {
            is_available,
            updated_at: now,
            expires_at,
        };
        env.storage().persistent().set(
            &DataKey::AvailabilityStatus(id.clone()),
            &status,
        );

        env.events().publish(
            (symbol_short!("AvlUpd"), id),
            (is_available, now, expires_at),
        );
    }

    /// Get the availability status for a worker.
    pub fn get_availability(
        env: Env,
        worker_id: Symbol,
    ) -> Option<AvailabilityStatus> {
        env.storage()
            .persistent()
            .get(&DataKey::AvailabilityStatus(worker_id))
    }

    // -------------------------------------------------------------------------
    // Batch registration (#340)
    // -------------------------------------------------------------------------

    /// Maximum number of workers that can be registered in a single batch call.
    pub const MAX_BATCH_SIZE: u32 = 20;

    /// Register multiple workers in one transaction. Curator only.
    ///
    /// Processes up to [`MAX_BATCH_SIZE`] entries. Duplicate ids are skipped
    /// (partial success) rather than aborting the whole batch.
    ///
    /// # Panics
    /// - `"Caller is not a curator"` / `"Batch too large"` / `"Mismatched input lengths"`.
    ///
    /// # Returns
    /// A [`Vec<BatchRegisterResult>`] with one entry per input.
    pub fn batch_register(
        env: Env,
        curator: Address,
        ids: Vec<Symbol>,
        owners: Vec<Address>,
        names: Vec<String>,
        categories: Vec<Symbol>,
        location_hashes: Vec<BytesN<32>>,
        contact_hashes: Vec<BytesN<32>>,
    ) -> Vec<BatchRegisterResult> {
        curator.require_auth();
        assert!(
            Self::get_curators(&env).iter().any(|c| c == curator),
            "Caller is not a curator"
        );

        let n = ids.len();
        assert!(n <= Self::MAX_BATCH_SIZE, "Batch too large");
        assert!(
            owners.len() == n
                && names.len() == n
                && categories.len() == n
                && location_hashes.len() == n
                && contact_hashes.len() == n,
            "Mismatched input lengths"
        );

        let mut results: Vec<BatchRegisterResult> = Vec::new(&env);
        let list_key = DataKey::WorkerList;
        let mut list: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&list_key)
            .unwrap_or(Vec::new(&env));

        for i in 0..n {
            let id = ids.get(i).unwrap();
            let key = DataKey::Worker(id.clone());

            if env.storage().persistent().has(&key) {
                results.push_back(BatchRegisterResult { id, success: false });
                continue;
            }

            let owner = owners.get(i).unwrap();
            let worker = Worker {
                id: id.clone(),
                owner: owner.clone(),
                name: names.get(i).unwrap(),
                category: categories.get(i).unwrap(),
                is_active: true,
                wallet: owner.clone(),
                location_hash: location_hashes.get(i).unwrap(),
                contact_hash: contact_hashes.get(i).unwrap(),
                reputation: 0,
                verified_categories: Vec::new(&env),
                staked_amount: 0,
                review_count: 0,
                avg_rating: 0,
            };

            env.storage().persistent().set(&key, &worker);
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
            list.push_back(id.clone());

            env.events().publish(
                (symbol_short!("WrkReg"), id.clone()),
                (owner, categories.get(i).unwrap()),
            );

            results.push_back(BatchRegisterResult { id, success: true });
        }

        env.storage().persistent().set(&list_key, &list);
        env.storage().persistent().extend_ttl(&list_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        results
    }

    // -------------------------------------------------------------------------
    // Worker staking (#341)
    // -------------------------------------------------------------------------

    /// Cooldown period in seconds before an unstake request can be finalised (~7 days).
    pub const UNSTAKE_COOLDOWN_SECS: u64 = 604_800;
    /// Reward rate: 1 basis point per 1000 seconds of staking.
    pub const REWARD_RATE_BPS_PER_1000_SECS: i128 = 1;

    /// Stake tokens for a worker to boost visibility.
    ///
    /// Transfers `amount` tokens from `caller` to the contract.
    ///
    /// # Panics
    /// - `"Worker not found"` / `"Not authorized"` / `"Amount must be positive"`.
    ///
    /// # Events
    /// Emits `("Staked", worker_id, caller)` with data `(amount, total_staked)`.
    pub fn stake(env: Env, caller: Address, worker_id: Symbol, token_addr: Address, amount: i128) {
        caller.require_auth();
        assert!(amount > 0, "Amount must be positive");

        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(worker_id.clone()))
            .expect("Worker not found");
        assert!(worker.owner == caller, "Not authorized");

        let client = token::Client::new(&env, &token_addr);
        client.transfer(&caller, &env.current_contract_address(), &amount);

        let now = env.ledger().timestamp();
        let mut info: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::StakeInfo(worker_id.clone()))
            .unwrap_or(StakeInfo {
                token: token_addr.clone(),
                amount: 0,
                unstake_requested_at: 0,
                rewards_accumulated: 0,
                last_reward_ledger: now,
            });

        let elapsed = now.saturating_sub(info.last_reward_ledger);
        info.rewards_accumulated +=
            info.amount * Self::REWARD_RATE_BPS_PER_1000_SECS * elapsed as i128 / 1000;
        info.last_reward_ledger = now;
        info.amount += amount;
        info.unstake_requested_at = 0;
        env.storage().persistent().set(&DataKey::StakeInfo(worker_id.clone()), &info);

        worker.staked_amount = info.amount;
        env.storage().persistent().set(&DataKey::Worker(worker_id.clone()), &worker);

        env.events().publish(
            (symbol_short!("Staked"), worker_id, caller),
            (amount, info.amount),
        );
    }

    /// Request an unstake. Starts the cooldown timer.
    ///
    /// # Panics
    /// - `"Worker not found"` / `"Not authorized"` / `"No active stake"` /
    ///   `"Unstake already requested"`.
    ///
    /// # Events
    /// Emits `("UnstakeRq", worker_id, caller)` with data `unstake_requested_at`.
    pub fn request_unstake(env: Env, caller: Address, worker_id: Symbol) {
        caller.require_auth();
        let worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(worker_id.clone()))
            .expect("Worker not found");
        assert!(worker.owner == caller, "Not authorized");

        let mut info: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::StakeInfo(worker_id.clone()))
            .expect("No active stake");
        assert!(info.amount > 0, "No active stake");
        assert!(info.unstake_requested_at == 0, "Unstake already requested");

        let now = env.ledger().timestamp();
        info.unstake_requested_at = now;
        env.storage().persistent().set(&DataKey::StakeInfo(worker_id.clone()), &info);

        env.events().publish(
            (symbol_short!("UnstakeRq"), worker_id, caller),
            now,
        );
    }

    /// Finalise unstake after cooldown. Returns staked tokens + rewards to caller.
    ///
    /// # Panics
    /// - `"Worker not found"` / `"Not authorized"` / `"No active stake"` /
    ///   `"Unstake not requested"` / `"Cooldown not elapsed"`.
    ///
    /// # Events
    /// Emits `("Unstaked", worker_id, caller)` with data `(staked, rewards)`.
    pub fn unstake(env: Env, caller: Address, worker_id: Symbol) {
        caller.require_auth();
        let mut worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(worker_id.clone()))
            .expect("Worker not found");
        assert!(worker.owner == caller, "Not authorized");

        let mut info: StakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::StakeInfo(worker_id.clone()))
            .expect("No active stake");
        assert!(info.amount > 0, "No active stake");
        assert!(info.unstake_requested_at > 0, "Unstake not requested");

        let now = env.ledger().timestamp();
        assert!(
            now >= info.unstake_requested_at + Self::UNSTAKE_COOLDOWN_SECS,
            "Cooldown not elapsed"
        );

        let elapsed = now.saturating_sub(info.last_reward_ledger);
        info.rewards_accumulated +=
            info.amount * Self::REWARD_RATE_BPS_PER_1000_SECS * elapsed as i128 / 1000;

        let total_return = info.amount + info.rewards_accumulated;
        let client = token::Client::new(&env, &info.token);
        client.transfer(&env.current_contract_address(), &caller, &total_return);

        let staked = info.amount;
        let rewards = info.rewards_accumulated;
        info.amount = 0;
        info.rewards_accumulated = 0;
        info.unstake_requested_at = 0;
        env.storage().persistent().set(&DataKey::StakeInfo(worker_id.clone()), &info);

        worker.staked_amount = 0;
        env.storage().persistent().set(&DataKey::Worker(worker_id.clone()), &worker);

        env.events().publish(
            (symbol_short!("Unstaked"), worker_id, caller),
            (staked, rewards),
        );
    }

    /// Get staking info for a worker.
    pub fn get_stake_info(env: Env, worker_id: Symbol) -> Option<StakeInfo> {
        env.storage().persistent().get(&DataKey::StakeInfo(worker_id))
    }

    // -------------------------------------------------------------------------
    // Performance Metrics (#378)
    // -------------------------------------------------------------------------

    /// Update performance metrics for a worker.
    pub fn update_metrics(
        env: Env,
        admin: Address,
        worker_id: Symbol,
        jobs_completed: u32,
        rating: u32,
    ) {
        Self::require_role(&env, &Symbol::new(&env, ROLE_REP_MGR), &admin);
        assert!(rating <= 10_000, "Rating out of range");

        let mut metrics: PerformanceMetrics = env
            .storage()
            .persistent()
            .get(&DataKey::PerformanceMetrics(worker_id.clone()))
            .unwrap_or(PerformanceMetrics {
                jobs_completed: 0,
                avg_rating: 0,
                total_ratings: 0,
                last_updated: 0,
                performance_score: 0,
            });

        metrics.jobs_completed = jobs_completed;
        if rating > 0 {
            let total = metrics.avg_rating as u64 * metrics.total_ratings as u64 + rating as u64;
            metrics.total_ratings += 1;
            metrics.avg_rating = (total / metrics.total_ratings as u64) as u32;
        }
        metrics.last_updated = env.ledger().timestamp();
        metrics.performance_score = Self::calculate_performance_score(&metrics);

        env.storage()
            .persistent()
            .set(&DataKey::PerformanceMetrics(worker_id.clone()), &metrics);

        env.events().publish(
            (symbol_short!("MetUpd"), worker_id),
            (jobs_completed, metrics.avg_rating, metrics.performance_score),
        );
    }

    /// Calculate performance score from metrics.
    fn calculate_performance_score(metrics: &PerformanceMetrics) -> u32 {
        if metrics.total_ratings == 0 {
            return 0;
        }
        let rating_weight = 70u32;
        let completion_weight = 30u32;
        let rating_score = (metrics.avg_rating * rating_weight) / 100;
        let completion_score = metrics.jobs_completed.min(100) * completion_weight;
        rating_score + completion_score
    }

    /// Get performance metrics for a worker.
    pub fn get_metrics(env: Env, worker_id: Symbol) -> Option<PerformanceMetrics> {
        env.storage()
            .persistent()
            .get(&DataKey::PerformanceMetrics(worker_id))
    }

    // -------------------------------------------------------------------------
    // Badge System (#380)
    // -------------------------------------------------------------------------

    /// Award a badge to a worker (admin or curator).
    pub fn award_badge(
        env: Env,
        issuer: Address,
        worker_id: Symbol,
        badge_id: Symbol,
        name: String,
        expires_at: u64,
    ) {
        issuer.require_auth();
        let is_admin = Self::has_role(env.clone(), Symbol::new(&env, ROLE_ADMIN), issuer.clone());
        let is_curator = Self::is_curator(env.clone(), issuer.clone());
        assert!(is_admin || is_curator, "Not authorized");

        let worker: Worker = env
            .storage()
            .persistent()
            .get(&DataKey::Worker(worker_id.clone()))
            .expect("Worker not found");

        let badge = Badge {
            id: badge_id.clone(),
            name: name.clone(),
            issuer: issuer.clone(),
            awarded_at: env.ledger().timestamp(),
            expires_at,
            active: true,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Badge(worker_id.clone(), badge_id.clone()), &badge);

        let mut badges: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&DataKey::WorkerBadges(worker_id.clone()))
            .unwrap_or(Vec::new(&env));
        if badges.iter().all(|b| b != badge_id) {
            badges.push_back(badge_id.clone());
            env.storage()
                .persistent()
                .set(&DataKey::WorkerBadges(worker_id.clone()), &badges);
        }

        env.events().publish(
            (symbol_short!("BdgAwd"), worker_id, badge_id),
            (issuer, name),
        );
    }

    /// Revoke a badge from a worker (admin or original issuer).
    pub fn revoke_badge(env: Env, caller: Address, worker_id: Symbol, badge_id: Symbol) {
        caller.require_auth();
        let mut badge: Badge = env
            .storage()
            .persistent()
            .get(&DataKey::Badge(worker_id.clone(), badge_id.clone()))
            .expect("Badge not found");

        let is_admin = Self::has_role(env.clone(), Symbol::new(&env, ROLE_ADMIN), caller.clone());
        assert!(is_admin || badge.issuer == caller, "Not authorized");

        badge.active = false;
        env.storage()
            .persistent()
            .set(&DataKey::Badge(worker_id.clone(), badge_id.clone()), &badge);

        env.events().publish(
            (symbol_short!("BdgRvk"), worker_id, badge_id),
            caller,
        );
    }

    /// Verify if a worker has a specific active badge.
    pub fn verify_badge(env: Env, worker_id: Symbol, badge_id: Symbol) -> bool {
        if let Some(badge) = env
            .storage()
            .persistent()
            .get::<DataKey, Badge>(&DataKey::Badge(worker_id, badge_id))
        {
            let now = env.ledger().timestamp();
            badge.active && (badge.expires_at == 0 || badge.expires_at > now)
        } else {
            false
        }
    }

    /// Get all badges for a worker.
    pub fn get_worker_badges(env: Env, worker_id: Symbol) -> Vec<Badge> {
        let badge_ids: Vec<Symbol> = env
            .storage()
            .persistent()
            .get(&DataKey::WorkerBadges(worker_id.clone()))
            .unwrap_or(Vec::new(&env));

        let mut badges: Vec<Badge> = Vec::new(&env);
        for badge_id in badge_ids.iter() {
            if let Some(badge) = env
                .storage()
                .persistent()
                .get(&DataKey::Badge(worker_id.clone(), badge_id))
            {
                badges.push_back(badge);
            }
        }
        badges
    }

    /// Get a specific badge.
    pub fn get_badge(env: Env, worker_id: Symbol, badge_id: Symbol) -> Option<Badge> {
        env.storage()
            .persistent()
            .get(&DataKey::Badge(worker_id, badge_id))
    }

    // -------------------------------------------------------------------------
    // Upgrade
    // -------------------------------------------------------------------------

    /// Upgrade the contract WASM in-place, preserving the contract ID and all storage.
    ///
    /// # Parameters
    /// - `admin`: Must be the contract admin; `require_auth()` is enforced.
    /// - `new_wasm_hash`: The hash returned by `stellar contract install` for the new WASM.
    ///
    /// # Panics
    /// Panics with `"Admin only"` if `admin` is not the stored admin.
    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        let upgrader_role = Self::role_symbol(&env, ROLE_UPGRADER_CACHED);
        Self::require_role(&env, &upgrader_role, &admin);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger, LedgerInfo}, Address, BytesN, Env, String, Symbol};

    struct TestEnv {
        env: Env,
        contract_id: Address,
        admin: Address,
        curator: Address,
        owner: Address,
    }

    impl TestEnv {
        fn new() -> Self {
            let env = Env::default();
            env.mock_all_auths();

            let admin = Address::generate(&env);
            let curator = Address::generate(&env);
            let owner = Address::generate(&env);

            let contract_id = env.register_contract(None, RegistryContract);
            let client = RegistryContractClient::new(&env, &contract_id);
            client.initialize(&admin);

            // Grant all operational roles to the bootstrap admin for convenience in tests.
            client.grant_role(&admin, &Symbol::new(&env, ROLE_PAUSER), &admin);
            client.grant_role(&admin, &Symbol::new(&env, ROLE_CURATOR_MGR), &admin);
            client.grant_role(&admin, &Symbol::new(&env, ROLE_REP_MGR), &admin);
            client.grant_role(&admin, &Symbol::new(&env, ROLE_UPGRADER), &admin);

            TestEnv { env, contract_id, admin, curator, owner }
        }

        fn client(&self) -> RegistryContractClient {
            RegistryContractClient::new(&self.env, &self.contract_id)
        }

        fn worker_id(&self) -> Symbol {
            Symbol::new(&self.env, "worker1")
        }

        fn zero_hash(&self) -> BytesN<32> {
            BytesN::from_array(&self.env, &[0u8; 32])
        }

        fn register_worker(&self, curator: &Address) {
            self.client().register(
                &self.worker_id(),
                &self.owner,
                &String::from_str(&self.env, "Alice"),
                &Symbol::new(&self.env, "plumber"),
                &self.zero_hash(),
                &self.zero_hash(),
                curator,
            );
        }
    }

    #[test]
    fn test_initialize_sets_admin() {
        let t = TestEnv::new();
        assert_eq!(t.client().get_admin(), t.admin);
    }

    #[test]
    #[should_panic(expected = "Already initialized")]
    fn test_initialize_twice_panics() {
        let t = TestEnv::new();
        t.client().initialize(&t.admin);
    }

    #[test]
    fn test_add_curator() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        assert!(t.client().is_curator(&t.curator));
    }

    #[test]
    fn test_add_curator_idempotent() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.client().add_curator(&t.admin, &t.curator);
        t.client().remove_curator(&t.admin, &t.curator);
        assert!(!t.client().is_curator(&t.curator));
    }

    #[test]
    #[should_panic(expected = "Missing role")]
    fn test_add_curator_non_admin_panics() {
        let t = TestEnv::new();
        let stranger = Address::generate(&t.env);
        t.client().add_curator(&stranger, &t.curator);
    }

    #[test]
    fn test_remove_curator() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.client().remove_curator(&t.admin, &t.curator);
        assert!(!t.client().is_curator(&t.curator));
    }

    #[test]
    fn test_register_by_curator_succeeds() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        let worker = t.client().get_worker(&t.worker_id()).unwrap();
        assert_eq!(worker.owner, t.owner);
        assert!(worker.is_active);
    }

    #[test]
    fn test_register_stores_hashes() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);

        let loc = BytesN::from_array(&t.env, &[1u8; 32]);
        let con = BytesN::from_array(&t.env, &[2u8; 32]);

        t.client().register(
            &t.worker_id(),
            &t.owner,
            &String::from_str(&t.env, "Alice"),
            &Symbol::new(&t.env, "plumber"),
            &loc,
            &con,
            &t.curator,
        );

        let worker = t.client().get_worker(&t.worker_id()).unwrap();
        assert_eq!(worker.location_hash, loc);
        assert_eq!(worker.contact_hash, con);
    }

    #[test]
    fn test_update_stores_new_hashes() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        let new_loc = BytesN::from_array(&t.env, &[3u8; 32]);
        let new_con = BytesN::from_array(&t.env, &[4u8; 32]);

        t.client().update(
            &t.worker_id(),
            &t.owner,
            &String::from_str(&t.env, "Alice B"),
            &Symbol::new(&t.env, "electrician"),
            &new_loc,
            &new_con,
        );

        let worker = t.client().get_worker(&t.worker_id()).unwrap();
        assert_eq!(worker.location_hash, new_loc);
        assert_eq!(worker.contact_hash, new_con);
    }

    #[test]
    #[should_panic(expected = "Caller is not a curator")]
    fn test_register_by_non_curator_panics() {
        let t = TestEnv::new();
        t.register_worker(&t.curator);
    }

    #[test]
    fn test_toggle_by_owner() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        t.client().toggle(&t.worker_id(), &t.owner);
        assert!(!t.client().get_worker(&t.worker_id()).unwrap().is_active);

        t.client().toggle(&t.worker_id(), &t.owner);
        assert!(t.client().get_worker(&t.worker_id()).unwrap().is_active);
    }

    #[test]
    fn test_deregister_by_owner() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        t.client().deregister(&t.worker_id(), &t.owner);
        assert!(t.client().get_worker(&t.worker_id()).is_none());
        assert_eq!(t.client().list_workers().len(), 0);
    }

    #[test]
    fn test_worker_count() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        assert_eq!(t.client().worker_count(), 0);
        t.register_worker(&t.curator);
        assert_eq!(t.client().worker_count(), 1);
    }

    #[test]
    fn test_reputation_defaults_to_zero() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);
        let worker = t.client().get_worker(&t.worker_id()).unwrap();
        assert_eq!(worker.reputation, 0);
    }

    #[test]
    fn test_update_reputation() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);
        t.client().update_reputation(&t.admin, &t.worker_id(), &8500);
        let worker = t.client().get_worker(&t.worker_id()).unwrap();
        assert_eq!(worker.reputation, 8500);
    }

    #[test]
    #[should_panic(expected = "Score out of range")]
    fn test_update_reputation_out_of_range() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);
        t.client().update_reputation(&t.admin, &t.worker_id(), &10_001);
    }

    #[test]
    #[should_panic(expected = "Missing role")]
    fn test_update_reputation_non_admin_panics() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);
        let stranger = Address::generate(&t.env);
        t.client().update_reputation(&stranger, &t.worker_id(), &5000);
    }    #[test]
    fn test_list_workers_paginated() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);

        for i in 0..5u8 {
            let id = Symbol::new(&t.env, &soroban_sdk::String::from_str(&t.env, &format!("w{i}")));
            t.client().register(
                &id,
                &t.owner,
                &String::from_str(&t.env, "Worker"),
                &Symbol::new(&t.env, "plumber"),
                &t.zero_hash(),
                &t.zero_hash(),
                &t.curator,
            );
        }

        let page = t.client().list_workers_paginated(&0, &3);
        assert_eq!(page.len(), 3);

        let page2 = t.client().list_workers_paginated(&3, &3);
        assert_eq!(page2.len(), 2);
    }

    // -------------------------------------------------------------------------
    // Category verification tests (#338)
    // -------------------------------------------------------------------------

    #[test]
    fn test_verify_category_stores_record() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);


      let cat = Symbol::new(&t.env, "plumber");
        t.client().verify_category(&t.curator, &t.worker_id(), &cat, &9999);

        let v = t.client().get_category_verification(&t.worker_id(), &cat).unwrap();
        assert_eq!(v.curator, t.curator);
        assert_eq!(v.expires_at, 9999);

        let worker = t.client().get_worker(&t.worker_id()).unwrap();
        assert_eq!(worker.verified_categories.len(), 1);
    }

    #[test]
    fn test_verify_category_idempotent() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        let cat = Symbol::new(&t.env, "plumber");
        t.client().verify_category(&t.curator, &t.worker_id(), &cat, &9999);
        t.client().verify_category(&t.curator, &t.worker_id(), &cat, &9999);

        let worker = t.client().get_worker(&t.worker_id()).unwrap();
        assert_eq!(worker.verified_categories.len(), 1);
    }

    #[test]
    #[should_panic(expected = "Caller is not a curator")]
    fn test_verify_category_non_curator_panics() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);
        let stranger = Address::generate(&t.env);
        t.client().verify_category(&stranger, &t.worker_id(), &Symbol::new(&t.env, "plumber"), &9999);
    }

    // -------------------------------------------------------------------------
    // Batch registration tests (#340)
    // -------------------------------------------------------------------------

    #[test]
    fn test_batch_register_all_succeed() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);

        let ids = soroban_sdk::vec![
            &t.env,
            Symbol::new(&t.env, "b1"),
            Symbol::new(&t.env, "b2"),
        ];
        let owners = soroban_sdk::vec![&t.env, t.owner.clone(), t.owner.clone()];
        let names = soroban_sdk::vec![
            &t.env,
            String::from_str(&t.env, "Alice"),
            String::from_str(&t.env, "Bob"),
        ];
        let cats = soroban_sdk::vec![
            &t.env,
            Symbol::new(&t.env, "plumber"),
            Symbol::new(&t.env, "welder"),
        ];
        let hashes = soroban_sdk::vec![&t.env, t.zero_hash(), t.zero_hash()];

        let results = t.client().batch_register(
            &t.curator, &ids, &owners, &names, &cats, &hashes, &hashes,
        );

        assert_eq!(results.len(), 2);
        assert!(results.get(0).unwrap().success);
        assert!(results.get(1).unwrap().success);
        assert_eq!(t.client().worker_count(), 2);
    }

    #[test]
    fn test_batch_register_partial_success_on_duplicate() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator); // registers "worker1"

        let ids = soroban_sdk::vec![
            &t.env,
            t.worker_id(), // duplicate
            Symbol::new(&t.env, "b2"),
        ];
        let owners = soroban_sdk::vec![&t.env, t.owner.clone(), t.owner.clone()];
        let names = soroban_sdk::vec![
            &t.env,
            String::from_str(&t.env, "Alice"),
            String::from_str(&t.env, "Bob"),
        ];
        let cats = soroban_sdk::vec![
            &t.env,
            Symbol::new(&t.env, "plumber"),
            Symbol::new(&t.env, "welder"),
        ];
        let hashes = soroban_sdk::vec![&t.env, t.zero_hash(), t.zero_hash()];

        let results = t.client().batch_register(
            &t.curator, &ids, &owners, &names, &cats, &hashes, &hashes,
        );

        assert!(!results.get(0).unwrap().success); // duplicate
        assert!(results.get(1).unwrap().success);
        assert_eq!(t.client().worker_count(), 2); // original + b2
    }

    #[test]
    #[should_panic(expected = "Batch too large")]
    fn test_batch_register_too_large_panics() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);

        let mut ids = Vec::new(&t.env);
        let mut owners = Vec::new(&t.env);
        let mut names = Vec::new(&t.env);
        let mut cats = Vec::new(&t.env);
        let mut hashes = Vec::new(&t.env);

        for i in 0..21u32 {
            let id_str = soroban_sdk::String::from_str(&t.env, &format!("w{i}"));
            ids.push_back(Symbol::new(&t.env, &id_str));
            owners.push_back(t.owner.clone());
            names.push_back(String::from_str(&t.env, "W"));
            cats.push_back(Symbol::new(&t.env, "plumber"));
            hashes.push_back(t.zero_hash());
        }

        t.client().batch_register(&t.curator, &ids, &owners, &names, &cats, &hashes, &hashes);
    }

    // -------------------------------------------------------------------------
    // Staking tests (#341)
    // -------------------------------------------------------------------------

    struct StakeTestEnv {
        base: TestEnv,
        token_addr: Address,
    }

    impl StakeTestEnv {
        fn new() -> Self {
            use soroban_sdk::token::StellarAssetClient;
            let base = TestEnv::new();
            let admin = base.admin.clone();
            let token_id = base.env.register_stellar_asset_contract_v2(admin.clone());
            let token_addr = token_id.address();
            StellarAssetClient::new(&base.env, &token_addr).mint(&base.owner, &1_000_000);
            // Mint to contract for reward payouts
            StellarAssetClient::new(&base.env, &token_addr)
                .mint(&base.contract_id, &1_000_000);
            StakeTestEnv { base, token_addr }
        }

        fn set_time(&self, ts: u64) {
            use soroban_sdk::testutils::{Ledger, LedgerInfo};
            self.base.env.ledger().set(LedgerInfo {
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

        fn token_balance(&self, addr: &Address) -> i128 {
            soroban_sdk::token::Client::new(&self.base.env, &self.token_addr).balance(addr)
        }
    }

    #[test]
    fn test_stake_increases_staked_amount() {
        let s = StakeTestEnv::new();
        s.base.client().add_curator(&s.base.admin, &s.base.curator);
        s.base.register_worker(&s.base.curator);

        s.set_time(1000);
        s.base.client().stake(&s.base.owner, &s.base.worker_id(), &s.token_addr, &500_000);

        let info = s.base.client().get_stake_info(&s.base.worker_id()).unwrap();
        assert_eq!(info.amount, 500_000);

        let worker = s.base.client().get_worker(&s.base.worker_id()).unwrap();
        assert_eq!(worker.staked_amount, 500_000);
    }

    #[test]
    fn test_unstake_after_cooldown_returns_tokens() {
        let s = StakeTestEnv::new();
        s.base.client().add_curator(&s.base.admin, &s.base.curator);
        s.base.register_worker(&s.base.curator);

        s.set_time(1000);
        s.base.client().stake(&s.base.owner, &s.base.worker_id(), &s.token_addr, &500_000);

        s.set_time(2000);
        s.base.client().request_unstake(&s.base.owner, &s.base.worker_id());

        // advance past cooldown
        s.set_time(2000 + 604_800 + 1);
        s.base.client().unstake(&s.base.owner, &s.base.worker_id());

        // owner gets back at least their stake
        assert!(s.token_balance(&s.base.owner) >= 500_000);

        let info = s.base.client().get_stake_info(&s.base.worker_id()).unwrap();
        assert_eq!(info.amount, 0);
    }

    #[test]
    #[should_panic(expected = "Cooldown not elapsed")]
    fn test_unstake_before_cooldown_panics() {
        let s = StakeTestEnv::new();
        s.base.client().add_curator(&s.base.admin, &s.base.curator);
        s.base.register_worker(&s.base.curator);

        s.set_time(1000);
        s.base.client().stake(&s.base.owner, &s.base.worker_id(), &s.token_addr, &100_000);
        s.base.client().request_unstake(&s.base.owner, &s.base.worker_id());
        s.base.client().unstake(&s.base.owner, &s.base.worker_id());
    }

    #[test]
    #[should_panic(expected = "Unstake already requested")]
    fn test_double_request_unstake_panics() {
        let s = StakeTestEnv::new();
        s.base.client().add_curator(&s.base.admin, &s.base.curator);
        s.base.register_worker(&s.base.curator);

        s.set_time(1000);
        s.base.client().stake(&s.base.owner, &s.base.worker_id(), &s.token_addr, &100_000);
        s.base.client().request_unstake(&s.base.owner, &s.base.worker_id());
        s.base.client().request_unstake(&s.base.owner, &s.base.worker_id());
    }

    // -------------------------------------------------------------------------
    // Location verification tests (#352)
    // -------------------------------------------------------------------------

    #[test]
    fn test_verify_location_stores_record() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        let verifier = Address::generate(&t.env);
        t.client().verify_location(&verifier, &t.worker_id(), &9999);

        let v = t.client().get_location_verification(&t.worker_id()).unwrap();
        assert_eq!(v.verifier, verifier);
        assert_eq!(v.expires_at, 9999);
    }

    #[test]
    #[should_panic(expected = "Worker not found")]
    fn test_verify_location_nonexistent_worker_panics() {
        let t = TestEnv::new();
        let verifier = Address::generate(&t.env);
        let nonexistent = Symbol::new(&t.env, "nonexistent");
        t.client().verify_location(&verifier, &nonexistent, &9999);
    }

    // -------------------------------------------------------------------------
    // Availability status tests (#376)
    // -------------------------------------------------------------------------

    #[test]
    fn test_update_availability_stores_status() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        t.client().update_availability(&t.worker_id(), &t.owner, &true, &9999);

        let status = t.client().get_availability(&t.worker_id()).unwrap();
        assert!(status.is_available);
        assert_eq!(status.expires_at, 9999);
    }

    #[test]
    fn test_update_availability_toggle() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        t.client().update_availability(&t.worker_id(), &t.owner, &true, &0);
        let status1 = t.client().get_availability(&t.worker_id()).unwrap();
        assert!(status1.is_available);

        t.client().update_availability(&t.worker_id(), &t.owner, &false, &0);
        let status2 = t.client().get_availability(&t.worker_id()).unwrap();
        assert!(!status2.is_available);
    }

    #[test]
    #[should_panic(expected = "Not authorized")]
    fn test_update_availability_non_owner_panics() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        let stranger = Address::generate(&t.env);
        t.client().update_availability(&t.worker_id(), &stranger, &true, &0);
    }

    #[test]
    #[should_panic(expected = "Worker not found")]
    fn test_update_availability_nonexistent_worker_panics() {
        let t = TestEnv::new();
        let nonexistent = Symbol::new(&t.env, "nonexistent");
        t.client().update_availability(&nonexistent, &t.owner, &true, &0);
    }

    // -------------------------------------------------------------------------
    // Contract upgrade tests (#375)
    // -------------------------------------------------------------------------

    #[test]
    fn test_upgrade_preserves_storage() {
        let t = TestEnv::new();
        t.client().add_curator(&t.admin, &t.curator);
        t.register_worker(&t.curator);

        let worker_before = t.client().get_worker(&t.worker_id()).unwrap();
        assert_eq!(worker_before.name, String::from_str(&t.env, "Alice"));

        // Simulate upgrade by calling upgrade function
        let dummy_hash = BytesN::from_array(&t.env, &[1u8; 32]);
        t.client().upgrade(&t.admin, &dummy_hash);

        // Storage should be preserved (in real scenario, contract would be redeployed)
        let worker_after = t.client().get_worker(&t.worker_id()).unwrap();
        assert_eq!(worker_after.name, worker_before.name);
        assert_eq!(worker_after.owner, worker_before.owner);
    }

    #[test]
    fn test_upgrade_requires_upgrader_role() {
        let t = TestEnv::new();
        let stranger = Address::generate(&t.env);
        let dummy_hash = BytesN::from_array(&t.env, &[1u8; 32]);

        // Should panic because stranger doesn't have ROLE_UPGRADER
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            t.client().upgrade(&stranger, &dummy_hash);
        }));
        assert!(result.is_err());
    }
}
