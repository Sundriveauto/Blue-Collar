# BlueCollar User Guide

## Finding a Worker

1. Open the app and go to the **Workers** page.
2. Use the category filter (e.g. Plumber, Electrician) and location search to narrow results.
3. Click a listing to view the worker's profile, reviews, and contact details.

## Connecting Your Stellar Wallet

1. Install the [Freighter browser extension](https://freighter.app).
2. Create or import a Stellar account in Freighter.
3. Click **Connect Wallet** in the top-right corner of the app.
4. Approve the connection request in Freighter.

Your public key will appear in the navbar when connected.

> **Testnet only:** Click **Fund Wallet (Testnet)** in the navbar to receive testnet XLM from Friendbot.

## Sending a Tip

1. Open a worker's profile page.
2. Click **Send Tip**.
3. Enter the amount of XLM (or supported token) to send.
4. Click **Confirm** — Freighter will open asking you to sign the transaction.
5. Approve the transaction in Freighter.

The tip is sent directly to the worker's Stellar address via the Market smart contract.

## Curator: Managing Listings

Curators are community-verified members who create and manage worker listings.

### Register a Worker

1. Go to **Dashboard → Register Worker**.
2. Fill in: name, category, location, and contact info.
3. Submit — the listing is written to the Registry contract on-chain.

### Update a Listing

1. Go to **Dashboard → My Listings**.
2. Click **Edit** next to the listing.
3. Update the fields and save.

### Toggle Availability

On any listing you manage, click **Toggle Availability** to mark the worker as available or unavailable.

### Extend TTL

On-chain listings expire after a set period. Click **Renew Listing** to extend the worker's on-chain TTL before it expires.

---

For wallet setup details see [stellar-wallet-integration.md](stellar-wallet-integration.md).  
For contract details see [CONTRACT_INTEGRATION.md](CONTRACT_INTEGRATION.md).
