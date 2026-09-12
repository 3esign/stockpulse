# STOCX Trust Status

STOCX V2 is live and immutable on Solana mainnet. The clean game rule is enforced by the Etude program: one `buy_and_reward` call CPI-calls Pump `buy_v2` for STOCX/TSLAx, then pays a TSLAx reward from the pot only after the trade succeeds. The older V1 top-level `buy_v2 + record_activity` path remains present for compatibility.

## On-Chain Now

- STOCX CA: `4NseDVjR15RQJyMpquqRVdEWoWFMrjb4pnyXbhYy1tHE`
- Etude program: `GPYNqnB9h5PnsmajMYkhCSDrfQiXmgePR57QFwuG6eDH`
- Config PDA: `2QqJ5MKXvyhcyXNo4hbwromGujuuVkCt92AWJL3DMPVX`
- Pot authority PDA: `2zcMDmgufo2cbosVeoxFaQkbirfLuqcLKbbDNFXZYFzh`
- Pot TSLAx ATA: `8pZKZYm9dWBpVWVW7GJYN4UzT2WcK3cUQRNKpRU5grix`
- Fee-share config: `Hs6Ls7x1qc8GdweZKXEuZ4DiMWGaABxdTptgXmq66ZVn`
- Address lookup table: `FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG`

The Pump fee-share config is locked with `adminRevoked: true`: 66.33% of creator fee-share points at the pot authority and 33.67% points at Semir's wallet. The Etude ProgramData authority is now `none`, and the address lookup table authority is `null`.

## Builder Model

The builder is intentionally off-chain because Solana programs cannot serve HTTP or return transactions to browsers. The builder is not trusted with funds: it only returns an unsigned transaction for the user's wallet to inspect, sign, and send.

The public builder source is in `builder/`. Any operator can run it and pass its URL to the dashboard:

```text
https://stocx.ratchetx.xyz/?builder=https://your-builder.example
```

For the public launch page, the active builder route is the current Cloudflare Tunnel endpoint in `actions.json`.
The Cloudflare Worker version is deployed at `https://stocx-player-builder.scumutator.workers.dev`
and passes `/health`, but public Solana RPC limits make it a backup until a private RPC endpoint is configured.
Production readiness for the Worker is explicit: `/health` must report `privateRpcConfigured: true`, `rpcReadyForProduction: true`, and `rpcSource: configured-secret`. If it reports `privateRpcConfigured: false`, it is using a known public endpoint or fallback and should not be treated as the launch builder under traffic.

## Final Lock Complete

- ALT freeze tx: `EYwg8ij9WQv2Xqvjv42zd9S4zAbjr6ugRiv6GBnjN8ybAXHaVUa27phU76JM8ZeEsx9Hoief8h5iNoaPhuivAsS`
- Program final tx: `2N5PQNz88cbGWPZu55ugZ6yeyU5qKH34at2qY3ZnYBtvrr7gvPXivRqMSMYL7U87QznjzYCF9T7eNL4Qzhh5Q8jh`

Readback after final lock: `solana program show` reports `Authority: none`; `solana address-lookup-table get` reports `authority: null`.

## V2 Proof

The V2 Etude `buy_and_reward` instruction was upgraded on mainnet in tx `4Sg7yFa7acon3FhU7uquGdi9dd2HFixNfq8VbXactfHMWeSniu483NgAmNVNGSutxPibFc3UM5g5SprjRqY8LfJ8`.

A live V2 proof transaction finalized in tx `3YiZCnFX4GjfUcGdniqHQDvgZ4oz8vC8kr9ryDFVJtsxUBPhiD53ekn4KzwudxxPX6e6qsorEfpqoNbecaaXZNm`: Etude was the top-level program, Pump `BuyV2` ran as CPI, and the launch wallet activity record advanced to `totalCalls=3` / `totalEarnedRaw=3000`.

Semir's public wallet then finalized the V2 path in tx `43SJiAPpXKwc8AMLEky2Zwc7L4ULFSk2FmUMDmmVDucfEqE4XqgkhVCrGj6oNadcszhjsq8YYSsjHndHkcPWHxup`: one Etude top-level call, inner Pump `BuyV2`, inner Token-2022 reward transfer, and activity record `94GMExvgEfs3kBLd2eE9FZCfBEAnux3tKsimAf6E3U87` at `totalCalls=4` / `totalEarnedRaw=4000`.

The public builder still stays no-keypair and replaceable. To serve V2 wallet transactions from a builder, run it with `STOCX_ENABLE_V2_BUILD=1`; without that flag it fails closed.
