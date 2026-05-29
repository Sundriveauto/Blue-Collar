#528 [Contracts] Write property-based tests for Registry contract
Repo Avatar
Blue-Kollar/Blue-Collar
Description:
Add property-based (fuzz) tests for the Registry contract using proptest to catch edge cases in state transitions.

Tasks:

Add proptest as a dev dependency in packages/contracts/Cargo.toml
Write property tests for register (arbitrary ids, names, categories)
Write property tests for toggle (only owner can toggle)
Write property tests for TTL extension (TTL never decreases)
Integrate fuzz tests into the CI pipeline
Priority: Medium

#529 [Contracts] Implement worker listing pagination in Registry
Repo Avatar
Blue-Kollar/Blue-Collar
Description:
The current list_workers() returns all worker IDs at once, which will become expensive as the registry grows. Add pagination.

Tasks:

Add list_workers_page(offset: u32, limit: u32) function
Store a worker_count: u32 in contract storage for efficient pagination
Return a WorkerPage { ids: Vec, total: u32 } struct
Deprecate list_workers() with a comment pointing to the new function
Add tests for boundary conditions (empty list, last page, out-of-range offset)
Priority: Medium

#531 [Contracts] Implement on-chain category validation
Repo Avatar
Blue-Kollar/Blue-Collar
Description:
Store the list of valid categories in the Registry contract so register can reject unknown categories without relying on the off-chain API.

Tasks:

Add categories: Vec to contract storage, initialized on deploy
Implement add_category(name) and remove_category(name) (admin only)
Add a category validation check in register
Emit CategoryAdded and CategoryRemoved events
Add tests for valid/invalid category registration
Priority: Low

#530 [Contracts] Add contract upgrade timelock
Repo Avatar
Blue-Kollar/Blue-Collar
Description:
Introduce a timelock on contract upgrades so the community has a window to review and react before a new WASM takes effect.

Tasks:

Add pending_upgrade: Option<(Bytes, u64)> (wasm_hash, execute_after_ledger) to storage
Implement propose_upgrade(new_wasm_hash) (admin only, sets a 48-hour timelock)
Implement execute_upgrade() callable by anyone after the timelock expires
Implement cancel_upgrade() (admin only)
Add tests for the full upgrade lifecycle including timelock enforcement
Priority: Medium