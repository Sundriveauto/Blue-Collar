#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    Address, BytesN, Env, String, Symbol,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract = env.register_contract(None, RegistryContract);
    (env, contract)
}

fn make_worker(
    env: &Env,
    contract: &Address,
    id: &str,
    owner: &Address,
) {
    let client = RegistryContractClient::new(env, contract);
    client.register(
        &Symbol::new(env, id),
        owner,
        &String::from_str(env, id),
        &Symbol::new(env, "plumber"),
    );
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

#[test]
fn test_register_success() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    let client = RegistryContractClient::new(&env, &contract);

    client.register(
        &Symbol::new(&env, "w1"),
        &owner,
        &String::from_str(&env, "Alice"),
        &Symbol::new(&env, "electrician"),
    );

    let worker = client.get_worker(&Symbol::new(&env, "w1")).unwrap();
    assert_eq!(worker.owner, owner);
    assert_eq!(worker.is_active, true);
    assert_eq!(worker.category, Symbol::new(&env, "electrician"));
}

#[test]
fn test_register_duplicate_id_overwrites() {
    // Soroban persistent storage allows overwrite; registering same id twice
    // replaces the entry. We verify the second write wins.
    let (env, contract) = setup();
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);
    let client = RegistryContractClient::new(&env, &contract);

    client.register(
        &Symbol::new(&env, "w1"),
        &owner1,
        &String::from_str(&env, "Alice"),
        &Symbol::new(&env, "plumber"),
    );
    client.register(
        &Symbol::new(&env, "w1"),
        &owner2,
        &String::from_str(&env, "Bob"),
        &Symbol::new(&env, "electrician"),
    );

    let worker = client.get_worker(&Symbol::new(&env, "w1")).unwrap();
    assert_eq!(worker.owner, owner2);
}

#[test]
#[should_panic]
fn test_register_unauthorized() {
    let env = Env::default();
    // Do NOT mock auths — require_auth will panic
    let contract = env.register_contract(None, RegistryContract);
    let owner = Address::generate(&env);
    let client = RegistryContractClient::new(&env, &contract);

    client.register(
        &Symbol::new(&env, "w1"),
        &owner,
        &String::from_str(&env, "Alice"),
        &Symbol::new(&env, "plumber"),
    );
}

// ---------------------------------------------------------------------------
// get_worker
// ---------------------------------------------------------------------------

#[test]
fn test_get_worker_found() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    let result = client.get_worker(&Symbol::new(&env, "w1"));
    assert!(result.is_some());
    assert_eq!(result.unwrap().owner, owner);
}

#[test]
fn test_get_worker_not_found() {
    let (env, contract) = setup();
    let client = RegistryContractClient::new(&env, &contract);
    let result = client.get_worker(&Symbol::new(&env, "nonexistent"));
    assert!(result.is_none());
}

// ---------------------------------------------------------------------------
// toggle
// ---------------------------------------------------------------------------

#[test]
fn test_toggle_owner_deactivates_then_activates() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);

    // starts active
    assert_eq!(
        client.get_worker(&Symbol::new(&env, "w1")).unwrap().is_active,
        true
    );

    // toggle off
    client.toggle(&Symbol::new(&env, "w1"), &owner);
    assert_eq!(
        client.get_worker(&Symbol::new(&env, "w1")).unwrap().is_active,
        false
    );

    // toggle back on
    client.toggle(&Symbol::new(&env, "w1"), &owner);
    assert_eq!(
        client.get_worker(&Symbol::new(&env, "w1")).unwrap().is_active,
        true
    );
}

#[test]
#[should_panic(expected = "Not authorized")]
fn test_toggle_non_owner_panics() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    let other = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    client.toggle(&Symbol::new(&env, "w1"), &other);
}

#[test]
#[should_panic(expected = "Worker not found")]
fn test_toggle_nonexistent_worker() {
    let (env, contract) = setup();
    let caller = Address::generate(&env);
    let client = RegistryContractClient::new(&env, &contract);
    client.toggle(&Symbol::new(&env, "ghost"), &caller);
}

// ---------------------------------------------------------------------------
// list_workers
// ---------------------------------------------------------------------------

#[test]
fn test_list_workers_empty() {
    let (env, contract) = setup();
    let client = RegistryContractClient::new(&env, &contract);
    let list = client.list_workers();
    assert_eq!(list.len(), 0);
}

#[test]
fn test_list_workers_multiple() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);
    make_worker(&env, &contract, "w2", &owner);
    make_worker(&env, &contract, "w3", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    let list = client.list_workers();
    assert_eq!(list.len(), 3);
    assert_eq!(list.get(0).unwrap(), Symbol::new(&env, "w1"));
    assert_eq!(list.get(1).unwrap(), Symbol::new(&env, "w2"));
    assert_eq!(list.get(2).unwrap(), Symbol::new(&env, "w3"));
}

#[test]
fn test_list_workers_after_toggle_still_listed() {
    // toggling active status does not remove from list
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    client.toggle(&Symbol::new(&env, "w1"), &owner);

    let list = client.list_workers();
    assert_eq!(list.len(), 1);
}

// ---------------------------------------------------------------------------
// update_worker
// ---------------------------------------------------------------------------

#[test]
fn test_update_worker_changes_fields() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    let new_wallet = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    client.update_worker(
        &Symbol::new(&env, "w1"),
        &owner,
        &String::from_str(&env, "Bob"),
        &Symbol::new(&env, "electrician"),
        &new_wallet,
    );

    let worker = client.get_worker(&Symbol::new(&env, "w1")).unwrap();
    assert_eq!(worker.name, String::from_str(&env, "Bob"));
    assert_eq!(worker.category, Symbol::new(&env, "electrician"));
    assert_eq!(worker.wallet, new_wallet);
}

#[test]
fn test_update_worker_preserves_owner_and_active() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    let new_wallet = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    client.update_worker(
        &Symbol::new(&env, "w1"),
        &owner,
        &String::from_str(&env, "Bob"),
        &Symbol::new(&env, "electrician"),
        &new_wallet,
    );

    let worker = client.get_worker(&Symbol::new(&env, "w1")).unwrap();
    assert_eq!(worker.owner, owner);
    assert!(worker.is_active);
}

#[test]
#[should_panic(expected = "Not authorized")]
fn test_update_worker_non_owner_panics() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    client.update_worker(
        &Symbol::new(&env, "w1"),
        &stranger,
        &String::from_str(&env, "Eve"),
        &Symbol::new(&env, "hacker"),
        &stranger,
    );
}

#[test]
#[should_panic(expected = "Worker not found")]
fn test_update_worker_nonexistent_panics() {
    let (env, contract) = setup();
    let caller = Address::generate(&env);

    let client = RegistryContractClient::new(&env, &contract);
    client.update_worker(
        &Symbol::new(&env, "ghost"),
        &caller,
        &String::from_str(&env, "Nobody"),
        &Symbol::new(&env, "none"),
        &caller,
    );
}

#[test]
fn test_update_worker_idempotent() {
// worker_count
// ---------------------------------------------------------------------------

#[test]
fn test_worker_count_empty() {
    let (env, contract) = setup();
    let client = RegistryContractClient::new(&env, &contract);
    assert_eq!(client.worker_count(), 0);
}

#[test]
fn test_worker_count_after_registrations() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);
    make_worker(&env, &contract, "w2", &owner);
    make_worker(&env, &contract, "w3", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    client.deregister(&Symbol::new(&env, "w2"), &owner);

    let list = client.list_workers();
    assert_eq!(list.len(), 2);
    assert_eq!(list.get(0).unwrap(), Symbol::new(&env, "w1"));
    assert_eq!(list.get(1).unwrap(), Symbol::new(&env, "w3"));
}

#[test]
fn test_deregister_last_worker_empties_list() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    client.deregister(&Symbol::new(&env, "w1"), &owner);

    assert_eq!(client.list_workers().len(), 0);
}

#[test]
#[should_panic(expected = "Not authorized")]
fn test_deregister_non_owner_panics() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    let stranger = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    client.deregister(&Symbol::new(&env, "w1"), &stranger);
}

#[test]
#[should_panic(expected = "Worker not found")]
fn test_deregister_nonexistent_worker_panics() {
    let (env, contract) = setup();
    let caller = Address::generate(&env);

    let client = RegistryContractClient::new(&env, &contract);
    client.deregister(&Symbol::new(&env, "ghost"), &caller);
}

#[test]
#[should_panic(expected = "Worker not found")]
fn test_deregister_twice_panics() {
    assert_eq!(client.worker_count(), 3);
}

// ---------------------------------------------------------------------------
// list_workers_paginated
// ---------------------------------------------------------------------------

#[test]
fn test_paginated_empty_list() {
    let (env, contract) = setup();
    let client = RegistryContractClient::new(&env, &contract);
    let page = client.list_workers_paginated(&0, &10);
    assert_eq!(page.len(), 0);
}

#[test]
fn test_paginated_first_page() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    for id in ["w1", "w2", "w3", "w4", "w5"] {
        make_worker(&env, &contract, id, &owner);
    }
    let client = RegistryContractClient::new(&env, &contract);
    let page = client.list_workers_paginated(&0, &3);
    assert_eq!(page.len(), 3);
    assert_eq!(page.get(0).unwrap(), Symbol::new(&env, "w1"));
    assert_eq!(page.get(1).unwrap(), Symbol::new(&env, "w2"));
    assert_eq!(page.get(2).unwrap(), Symbol::new(&env, "w3"));
}

#[test]
fn test_paginated_second_page() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    for id in ["w1", "w2", "w3", "w4", "w5"] {
        make_worker(&env, &contract, id, &owner);
    }
    let client = RegistryContractClient::new(&env, &contract);
    let page = client.list_workers_paginated(&3, &3);
    assert_eq!(page.len(), 2); // only w4, w5 remain
    assert_eq!(page.get(0).unwrap(), Symbol::new(&env, "w4"));
    assert_eq!(page.get(1).unwrap(), Symbol::new(&env, "w5"));
}

#[test]
fn test_paginated_offset_beyond_end_returns_empty() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);
    make_worker(&env, &contract, "w2", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    let page = client.list_workers_paginated(&10, &5);
    assert_eq!(page.len(), 0);
}

#[test]
fn test_paginated_limit_larger_than_list() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);
    make_worker(&env, &contract, "w2", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    let page = client.list_workers_paginated(&0, &100);
    assert_eq!(page.len(), 2);
}

#[test]
fn test_paginated_limit_zero_returns_empty() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    make_worker(&env, &contract, "w1", &owner);

    let client = RegistryContractClient::new(&env, &contract);
    // update twice with same values
    for _ in 0..2 {
        client.update_worker(
            &Symbol::new(&env, "w1"),
            &owner,
            &String::from_str(&env, "Alice"),
            &Symbol::new(&env, "plumber"),
            &owner,
        );
    }

    let worker = client.get_worker(&Symbol::new(&env, "w1")).unwrap();
    assert_eq!(worker.name, String::from_str(&env, "Alice"));
    let page = client.list_workers_paginated(&0, &0);
    assert_eq!(page.len(), 0);
}

#[test]
fn test_paginated_exact_fit() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    for id in ["w1", "w2", "w3"] {
        make_worker(&env, &contract, id, &owner);
    }
    let client = RegistryContractClient::new(&env, &contract);
    let page = client.list_workers_paginated(&0, &3);
    assert_eq!(page.len(), 3);
}

#[test]
fn test_paginated_single_item_pages() {
    let (env, contract) = setup();
    let owner = Address::generate(&env);
    for id in ["w1", "w2", "w3"] {
        make_worker(&env, &contract, id, &owner);
    }
    let client = RegistryContractClient::new(&env, &contract);

     for (i, expected) in ["w1", "w2", "w3"].iter().enumerate() {
         let page = client.list_workers_paginated(&(i as u32), &1);
         assert_eq!(page.len(), 1);
         assert_eq!(page.get(0).unwrap(), Symbol::new(&env, expected));
     }
 }

 // ---------------------------------------------------------------------------
 // Pause mechanism tests
 // ---------------------------------------------------------------------------

 #[test]
 fn test_pause_and_unpause_events() {
     let (env, contract) = setup();
     let admin = Address::generate(&env);
     let client = RegistryContractClient::new(&env, &contract);

     // Initialize with admin
     client.initialize(&admin);

     // Test pause event emission
     let paused_event = Symbol::new(&env, "ContractPaused");
     client.pause(&admin);
     assert_eq!(client.get_events(&paused_event).len(), 1);

     // Test unpause event emission
     let unpaused_event = Symbol::new(&env, "ContractUnpaused");
     client.unpause(&admin);
     assert_eq!(client.get_events(&unpaused_event).len(), 1);
 }

 #[test]
 fn test_register_reverts_when_paused() {
     let (env, contract) = setup();
     let admin = Address::generate(&env);
     let curator = Address::generate(&env);
     let owner = Address::generate(&env);
     let mut client = RegistryContractClient::new(&env, &contract);

     // Initialize and set up curator
     client.initialize(&admin);
     client.grant_role(&admin, &Symbol::new(&env, ROLE_PAUSER), &admin); // admin can pause
     client.grant_role(&admin, &Symbol::new(&env, ROLE_CURATOR_MGR), &admin); // admin can manage curators
     client.grant_role(&admin, &Symbol::new(&env, "curator"), &curator); // make curator a curator

     // Pause the contract
     client.pause(&admin);

     // Register should revert when paused
     assert_panic_with_msg(
         &move || {
             client.register(
                 &Symbol::new(&env, "w1"),
                 &owner,
                 &String::from_str(&env, "Alice"),
                 &Symbol::new(&env, "plumber"),
             );
         },
         "Contract is paused",
     );
 }

 #[test]
 fn test_toggle_reverts_when_paused() {
     let (env, contract) = setup();
     let admin = Address::generate(&env);
     let owner = Address::generate(&env);
     let mut client = RegistryContractClient::new(&env, &contract);

     // Initialize and set up roles
     client.initialize(&admin);
     client.grant_role(&admin, &Symbol::new(&env, ROLE_PAUSER), &admin);
     client.grant_role(&admin, &Symbol::new(&env, ROLE_CURATOR_MGR), &admin);

     // Register a worker first
     client.register(
         &Symbol::new(&env, "w1"),
         &owner,
         &String::from_str(&env, "Alice"),
         &Symbol::new(&env, "plumber"),
     );

     // Pause the contract
     client.pause(&admin);

     // Toggle should revert when paused
     assert_panic_with_msg(
         &move || {
             client.toggle(&Symbol::new(&env, "w1"), &owner);
          },
          "Contract is paused",
      );
  }

  // ---------------------------------------------------------------------------
  // Event emission tests
  // ---------------------------------------------------------------------------

  #[test]
  fn test_register_emits_worker_registered_event() {
      let (env, contract) = setup();
      let owner = Address::generate(&env);
      let curator = Address::generate(&env);
      let mut client = RegistryContractClient::new(&env, &contract);

      // Setup curator permissions
      let admin = Address::generate(&env);
      client.initialize(&admin);
      client.grant_role(&admin, &Symbol::new(&env, ROLE_CURATOR_MGR), &admin);
      client.grant_role(&admin, &Symbol::new(&env, "curator"), &curator);

      // Register a worker
      let worker_id = Symbol::new(&env, "worker1");
      let worker_category = Symbol::new(&env, "plumber");
      client.register(
          &worker_id,
          &owner,
          &String::from_str(&env, "John Doe"),
          &worker_category,
          &BytesN::from_array(&env, &[0u8; 32]), // location_hash
          &BytesN::from_array(&env, &[1u8; 32]), // contact_hash
          &curator,
      );

      // Check that WorkerRegistered event was emitted
      let registered_event = Symbol::new(&env, "WorkerRegistered");
      let events = client.get_events(&registered_event);
      assert_eq!(events.len(), 1);

      // Check event data (this would require more detailed inspection in a real test)
      // For now, we just verify the event was emitted
  }

  #[test]
  fn test_toggle_emits_worker_toggled_event() {
      let (env, contract) = setup();
      let owner = Address::generate(&env);
      let mut client = RegistryContractClient::new(&env, &contract);

      // Initialize and register a worker first
      let admin = Address::generate(&env);
      client.initialize(&admin);
      client.register(
          &Symbol::new(&env, "worker1"),
          &owner,
          &String::from_str(&env, "John Doe"),
          &Symbol::new(&env, "plumber"),
          &BytesN::from_array(&env, &[0u8; 32]),
          &BytesN::from_array(&env, &[1u8; 32]),
          &owner, // curator
      );

      // Toggle the worker
      let toggle_event = Symbol::new(&env, "WorkerToggled");
      client.toggle(&Symbol::new(&env, "worker1"), &owner);
      assert_eq!(client.get_events(&toggle_event).len(), 1);
  }

  #[test]
  fn test_update_reviews_emits_worker_ttl_extended_event() {
      let (env, contract) = setup();
      let owner = Address::generate(&env);
      let mut client = RegistryContractClient::new(&env, &contract);

      // Initialize and register a worker first
      let admin = Address::generate(&env);
      client.initialize(&admin);
      client.register(
          &Symbol::new(&env, "worker1"),
          &owner,
          &String::from_str(&env, "John Doe"),
          &Symbol::new(&env, "plumber"),
          &BytesN::from_array(&env, &[0u8; 32]),
          &BytesN::from_array(&env, &[1u8; 32]),
          &owner, // curator
      );

      // Update reviews (which extends TTL)
      let ttl_extended_event = Symbol::new(&env, "WorkerTTLExtended");
      client.update_reviews(&admin, &Symbol::new(&env, "worker1"), 5, 8000);
      assert_eq!(client.get_events(&ttl_extended_event).len(), 1);
  }

  #[test]
  fn test_batch_register_emits_worker_and_list_ttl_extended_events() {
      let (env, contract) = setup();
      let owner1 = Address::generate(&env);
      let owner2 = Address::generate(&env);
      let curator = Address::generate(&env);
      let mut client = RegistryContractClient::new(&env, &contract);

      // Setup curator permissions
      let admin = Address::generate(&env);
      client.initialize(&admin);
      client.grant_role(&admin, &Symbol::new(&env, ROLE_CURATOR_MGR), &admin);
      client.grant_role(&admin, &Symbol::new(&env, "curator"), &curator);

      // Batch register workers
      let ids = soroban_sdk::vec![&env,
          Symbol::new(&env, "worker1"),
          Symbol::new(&env, "worker2")
      ];
      let owners = soroban_sdk::vec![&env, owner1.clone(), owner2.clone()];
      let names = soroban_sdk::vec![&env,
          String::from_str(&env, "John Doe"),
          String::from_str(&env, "Jane Smith")
      ];
      let categories = soroban_sdk::vec![&env,
          Symbol::new(&env, "plumber"),
          Symbol::new(&env, "electrician")
      ];
      let location_hashes = soroban_sdk::vec![&env,
          BytesN::from_array(&env, &[0u8; 32]),
          BytesN::from_array(&env, &[1u8; 32])
      ];
      let contact_hashes = soroban_sdk::vec![&env,
          BytesN::from_array(&env, &[2u8; 32]),
          BytesN::from_array(&env, &[3u8; 32])
      ];

      let worker_ttl_event = Symbol::new(&env, "WorkerTTLExtended");
      let list_ttl_event = Symbol::new(&env, "WorkerListTTLExtended");
      
      client.batch_register(&curator, ids, owners, names, categories, location_hashes, contact_hashes);
      
      // Check that WorkerTTLExtended events were emitted (2 workers = 2 events)
      let worker_ttl_events = client.get_events(&worker_ttl_event);
      assert_eq!(worker_ttl_events.len(), 2);

      // Check that WorkerListTTLExtended event was emitted
      let list_ttl_events = client.get_events(&list_ttl_event);
      assert_eq!(list_ttl_events.len(), 1);
  }

// Helper macro to check for panics with specific message
  macro_rules! assert_panic_with_msg {
      ($f:expr, $msg:expr) => {
          let result = std::panic::catch_unwind(|| $f);
          assert!(result.is_err(), "Expected panic but none occurred");
          if let Err(payload) = result {
              if let Some(s) = payload.downcast_ref::<&str>() {
                  assert!(
                      s.contains($msg),
                      "Expected panic message containing '{}', got: '{}'",
                      $msg,
                      s
                  );
              } else if let Some(s) = payload.downcast_ref::<String>() {
                  assert!(
                      s.contains($msg),
                      "Expected panic message containing '{}', got: '{}'",
                      $msg,
                      s
                  );
              } else {
                  panic!("Unable to extract panic message");
              }
          }
      };
  }
