# STOCX site knowledge

## Greske
- The first public reward text implied a player could buy on Pump and later refresh for rewards; the Etude program requires a same top-level transaction containing Pump `buy_v2`/`sell_v2` before `record_activity`, so the site now separates ordinary Pump trading from the reward transaction path.
- First-render dashboard placeholders are product truth too: if RPC has not answered yet, the UI must say `Checking`, not stale pre-launch states such as `Not sent` or `Empty`.

## Iskustva
- The live ALT `FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG` is enough for ordinary player wallets even though it was created during the deployer proof: user-specific ATAs, volume accumulator and activity PDA can stay static and the v0 packet is still 709 bytes.
- A player wallet must have a TSLAx ATA with enough TSLAx for the proof buy; the builder should not return a signable transaction while that gate is red.
- Solana Pay transaction requests are the cleaner mobile/public-wallet shape for this flow because the wallet posts its signer account and receives a base64 serialized transaction; it still requires an HTTPS builder endpoint.
- `cloudflared tunnel --url` on this PC reads `%USERPROFILE%\.cloudflared\config.yml` by default; for a clean quick tunnel to the builder, pass an empty temp config with `--config C:\Svemir\data\brain\logs\stocx_cloudflared_empty.yml` or the request may hit the existing named-tunnel `http_status:404` fallback.
- The deployer wallet no longer blocks the proof path: after a `0.02 SOL` Jupiter ExactIn swap, the v0+ALT `buy_v2 + record_activity` proof tx finalized and paid `0.00001 TSLAx` from the pot.
- Public copy must separate entry asset from reward asset: STOCX is TSLAx-quoted, so a player needs TSLAx to play the current Reward TX, and only then may receive TSLAx back from the pot.
- Proof funding and lean funding are different gates: `--target proof` only needs enough post-swap TSLAx for one reward proof, while `--target lean` is for a larger launch/pot buffer.

## Izvori
- `tools/solana-cli/scripts-scratch/stocx_player_trade_record_builder.js measure --user HXFDaHyZ3i477z1BakiTWZg9UQN8rcreruuv9ifC1HvM --alt FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG`
- `tools/solana-cli/scripts-scratch/stocx_tslax_swap.js swap --send --amount-lamports 20000000 --target proof` produced tx `5LGvTmQZx3mSbphXTNF5hscLtJbiFgSfJfgPg5e9MbkUVVBoaMwtaiDw7dFZEBTa66DU8yenRxzFWAmW8X4LkrBS`.
- `tools/solana-cli/scripts-scratch/stocx_launch_rehearsal.js send-first-buy --send --alt FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG` produced tx `55JkQShU72Vy2L3hzHgoZDRNLcTpBsFXrLr2d4trTDFPo6twoeurDN9zizRtvnHHDKVKSGuUrrjsZ7gwrRN1D9V9`.
- Phantom docs, checked 2026-09-11: versioned transactions with Address Lookup Tables are the supported path for larger account sets.
- Solana Pay spec, checked 2026-09-11: transaction requests require an absolute HTTPS link, POST body `account`, and response field `transaction` as base64 serialized transaction.

## Vestine
- Use a backend builder for STOCX reward trades: frontend connects wallet, builder returns measured state, and only a green wallet/chain gate should expose a wallet-signable v0 transaction.
- For public wallet requests, expose both app JSON (`/api/stocx/build`) and Solana Pay JSON (`/api/stocx/pay`) so extension browsers and mobile wallets have a path from the same no-keypair builder.
- Keep public builder endpoints origin-limited and throttled because every build request performs live mainnet RPC reads.

## Odluke
- Keep the public page static and readable; add a guarded `Reward TX` panel now, and wire the actual public signer endpoint separately instead of pretending Pump-only trades can trigger rewards.
- The first fold must carry the core mechanism before dashboard controls: `STOCX / TSLAx`, fee-fed TSLAx pot, and `buy + record proof` reward path.
- Keep GitHub Pages as the readable dashboard, and require a separate HTTPS runtime for the reward builder instead of embedding a heavyweight wallet SDK into the static page.
