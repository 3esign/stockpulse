# STOCX Trust Status

STOCX v1 is live on Solana mainnet. The game rule is enforced by the Etude program: a wallet transaction must contain a real Pump `buy_v2` or `sell_v2` for STOCX/TSLAx before `record_activity` pays a TSLAx reward from the pot.

## On-Chain Now

- STOCX CA: `4NseDVjR15RQJyMpquqRVdEWoWFMrjb4pnyXbhYy1tHE`
- Etude program: `GPYNqnB9h5PnsmajMYkhCSDrfQiXmgePR57QFwuG6eDH`
- Config PDA: `2QqJ5MKXvyhcyXNo4hbwromGujuuVkCt92AWJL3DMPVX`
- Pot authority PDA: `2zcMDmgufo2cbosVeoxFaQkbirfLuqcLKbbDNFXZYFzh`
- Pot TSLAx ATA: `8pZKZYm9dWBpVWVW7GJYN4UzT2WcK3cUQRNKpRU5grix`
- Fee-share config: `Hs6Ls7x1qc8GdweZKXEuZ4DiMWGaABxdTptgXmq66ZVn`

The Pump fee-share config is locked with `adminRevoked: true`: 66.33% of creator fee-share points at the pot authority and 33.67% points at Semir's wallet.

## Builder Model

The builder is intentionally off-chain because Solana programs cannot serve HTTP or return transactions to browsers. The builder is not trusted with funds: it only returns an unsigned transaction for the user's wallet to inspect, sign, and send.

The public builder source is in `builder/`. Any operator can run it and pass its URL to the dashboard:

```text
https://stocx.ratchetx.xyz/?builder=https://your-builder.example
```

## Final Lock Gate

Two remaining authorities should be frozen only after the final v1/v2 decision:

```text
solana address-lookup-table freeze FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG --authority <UPGRADE_AUTHORITY_KEYPAIR> --url https://api.mainnet-beta.solana.com --bypass-warning
solana program set-upgrade-authority GPYNqnB9h5PnsmajMYkhCSDrfQiXmgePR57QFwuG6eDH --final --upgrade-authority <UPGRADE_AUTHORITY_KEYPAIR> --url https://api.mainnet-beta.solana.com
```

Do not run those commands until the program is meant to be immutable forever.

## V2 Candidate

A measured next on-chain improvement is a new Etude `buy_and_reward` instruction: the user signs one Etude instruction, Etude CPI-calls Pump `buy_v2`, then pays the TSLAx reward from the pot. A no-send packet estimate on 2026-09-12 was `1204` bytes legacy with `28` bytes headroom, and `651` bytes with the live ALT.

That upgrade would make the on-chain path cleaner, but it needs new LiteSVM tests and a mainnet upgrade before final authority revocation.
