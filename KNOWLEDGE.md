# STOCX site knowledge

## Greske
- The first public reward text implied a player could buy on Pump and later refresh for rewards; the Etude program requires a same top-level transaction containing Pump `buy_v2`/`sell_v2` before `record_activity`, so the site now separates ordinary Pump trading from the reward transaction path.
- First-render dashboard placeholders are product truth too: if RPC has not answered yet, the UI must say `Checking`, not stale pre-launch states such as `Not sent` or `Empty`.

## Iskustva
- The live ALT `FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG` is enough for ordinary player wallets even though it was created during the deployer proof: user-specific ATAs, volume accumulator and activity PDA can stay static and the v0 packet is still 709 bytes.
- A player wallet must have a TSLAx ATA with enough TSLAx for the proof buy; the builder should not return a signable transaction while that gate is red.
- Solana Pay transaction requests are the cleaner mobile/public-wallet shape for this flow because the wallet posts its signer account and receives a base64 serialized transaction; it still requires an HTTPS builder endpoint.

## Izvori
- `tools/solana-cli/scripts-scratch/stocx_player_trade_record_builder.js measure --user HXFDaHyZ3i477z1BakiTWZg9UQN8rcreruuv9ifC1HvM --alt FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG`
- Phantom docs, checked 2026-09-11: versioned transactions with Address Lookup Tables are the supported path for larger account sets.
- Solana Pay spec, checked 2026-09-11: transaction requests require an absolute HTTPS link, POST body `account`, and response field `transaction` as base64 serialized transaction.

## Vestine
- Use a backend builder for STOCX reward trades: frontend connects wallet, builder returns measured state, and only a green wallet/chain gate should expose a wallet-signable v0 transaction.
- For public wallet requests, expose both app JSON (`/api/stocx/build`) and Solana Pay JSON (`/api/stocx/pay`) so extension browsers and mobile wallets have a path from the same no-keypair builder.

## Odluke
- Keep the public page static and readable; add a guarded `Reward TX` panel now, and wire the actual public signer endpoint separately instead of pretending Pump-only trades can trigger rewards.
- The first fold must carry the core mechanism before dashboard controls: `STOCX / TSLAx`, fee-fed TSLAx pot, and `buy + record proof` reward path.
- Keep GitHub Pages as the readable dashboard, and require a separate HTTPS runtime for the reward builder instead of embedding a heavyweight wallet SDK into the static page.
