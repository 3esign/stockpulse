# STOCX Trust Status

STOCX V2 is live on Solana mainnet. The clean game rule is enforced by the Etude program: one `buy_and_reward` call CPI-calls Pump `buy_v2` for STOCX/TSLAx, then pays a TSLAx reward from the pot only after the trade succeeds. The older V1 top-level `buy_v2 + record_activity` path remains present for compatibility.

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

Two remaining authorities should be frozen only after the final immutable-launch decision:

```text
solana address-lookup-table freeze FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG --authority <UPGRADE_AUTHORITY_KEYPAIR> --url https://api.mainnet-beta.solana.com --bypass-warning
solana program set-upgrade-authority GPYNqnB9h5PnsmajMYkhCSDrfQiXmgePR57QFwuG6eDH --final --upgrade-authority <UPGRADE_AUTHORITY_KEYPAIR> --url https://api.mainnet-beta.solana.com
```

Do not run those commands until the program is meant to be immutable forever.

## V2 Proof

The V2 Etude `buy_and_reward` instruction was upgraded on mainnet in tx `4Sg7yFa7acon3FhU7uquGdi9dd2HFixNfq8VbXactfHMWeSniu483NgAmNVNGSutxPibFc3UM5g5SprjRqY8LfJ8`.

A live V2 proof transaction finalized in tx `3YiZCnFX4GjfUcGdniqHQDvgZ4oz8vC8kr9ryDFVJtsxUBPhiD53ekn4KzwudxxPX6e6qsorEfpqoNbecaaXZNm`: Etude was the top-level program, Pump `BuyV2` ran as CPI, and the launch wallet activity record advanced to `totalCalls=3` / `totalEarnedRaw=3000`.

The public builder still stays no-keypair and replaceable. To serve V2 wallet transactions from a builder, run it with `STOCX_ENABLE_V2_BUILD=1`; without that flag it fails closed.
