# STOCX Player Builder

This is the public, no-keypair builder for STOCX Reward TX.

It reads Solana mainnet state, builds an unsigned v0 transaction, and returns it to a wallet for signing. It does not read keypairs, sign transactions, send transactions, or custody funds.

## Run

```powershell
npm install
$env:SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
$env:STOCX_ALLOWED_ORIGINS="*"
npm start
```

Health:

```text
GET http://127.0.0.1:8798/health
```

Measure a wallet:

```text
POST http://127.0.0.1:8798/api/stocx/measure
{ "user": "<wallet public key>" }
```

Build a wallet-signable transaction:

```text
POST http://127.0.0.1:8798/api/stocx/build
{ "user": "<wallet public key>" }
```

The default path is `v1`: top-level Pump `buy_v2` followed by Etude `record_activity`.

The live `v2` path builds a single Etude `buy_and_reward` instruction that CPI-calls Pump and then pays the reward. It is available with:

```text
{ "user": "<wallet public key>", "mode": "v2" }
```

V2 was upgraded on mainnet and proofed in tx `3YiZCnFX4GjfUcGdniqHQDvgZ4oz8vC8kr9ryDFVJtsxUBPhiD53ekn4KzwudxxPX6e6qsorEfpqoNbecaaXZNm`. Wallet-build output still requires an explicit process-level guard so an operator cannot switch modes accidentally:

```powershell
$env:STOCX_ENABLE_V2_BUILD="1"
```

Solana Action / Solana Pay shape:

```text
GET  http://127.0.0.1:8798/api/stocx/pay
POST http://127.0.0.1:8798/api/stocx/pay
{ "account": "<wallet public key>" }
```

## Public Contract

- STOCX mint: `4NseDVjR15RQJyMpquqRVdEWoWFMrjb4pnyXbhYy1tHE`
- TSLAx mint: `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB`
- Etude program: `GPYNqnB9h5PnsmajMYkhCSDrfQiXmgePR57QFwuG6eDH`
- Reward pot ATA: `8pZKZYm9dWBpVWVW7GJYN4UzT2WcK3cUQRNKpRU5grix`
- Address lookup table: `FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG`

The builder is replaceable: anyone can run this source and point the dashboard at their endpoint with `?builder=https://your-builder.example`.
