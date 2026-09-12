# STOCX Player Builder

This is the public, no-keypair builder for STOCX Reward TX.

It reads Solana mainnet state, builds an unsigned v0 transaction, and returns it to a wallet for signing. It does not read keypairs, sign transactions, send transactions, or custody funds.

## Run

```powershell
npm install
$env:SOLANA_RPC_URLS="https://your-private-solana-rpc.example"
$env:STOCX_ALLOWED_ORIGINS="*"
npm start
```

Health:

```text
GET http://127.0.0.1:8798/health
```

`privateRpcConfigured` and `rpcReadyForProduction` must be `true` for production. If either is `false`, the builder is using a known public endpoint or fallback and should stay a backup/test endpoint.

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

## Production RPC

The Worker is ready for a real private Solana RPC endpoint, but the endpoint itself must come from a provider account or from running our own Solana RPC node. Do not put RPC URLs with API keys in `wrangler.jsonc`; Cloudflare treats secrets as environment variables at runtime while hiding their values from Wrangler and the dashboard.

Set the production endpoint interactively:

```powershell
cd C:\Svemir\tools\stockpulse-site\builder
npx wrangler secret put SOLANA_RPC_URLS
npx wrangler deploy
```

Paste one URL, or a comma-separated failover list, at the Wrangler prompt. Then verify:

```powershell
Invoke-RestMethod https://stocx-player-builder.scumutator.workers.dev/health
```

Expected production shape:

```json
{
  "ok": true,
  "service": "stocx-player-builder",
  "mode": "v2",
  "v2BuilderEnabled": true,
  "rpcFallbacks": 1,
  "rpcSource": "configured-secret",
  "privateRpcConfigured": true,
  "rpcReadyForProduction": true
}
```

## Public Contract

- STOCX mint: `4NseDVjR15RQJyMpquqRVdEWoWFMrjb4pnyXbhYy1tHE`
- TSLAx mint: `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB`
- Etude program: `GPYNqnB9h5PnsmajMYkhCSDrfQiXmgePR57QFwuG6eDH`
- Reward pot ATA: `8pZKZYm9dWBpVWVW7GJYN4UzT2WcK3cUQRNKpRU5grix`
- Address lookup table: `FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG`

The Etude program is immutable (`Authority: none`) and the lookup table is frozen (`authority: null`) after final lock txs `2N5PQNz88cbGWPZu55ugZ6yeyU5qKH34at2qY3ZnYBtvrr7gvPXivRqMSMYL7U87QznjzYCF9T7eNL4Qzhh5Q8jh` and `EYwg8ij9WQv2Xqvjv42zd9S4zAbjr6ugRiv6GBnjN8ybAXHaVUa27phU76JM8ZeEsx9Hoief8h5iNoaPhuivAsS`.

The builder is replaceable: anyone can run this source and point the dashboard at their endpoint with `?builder=https://your-builder.example`.
