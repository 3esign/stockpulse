# STOCX site knowledge

## Greske
- The first public reward text implied a player could buy on Pump and later refresh for rewards; the Etude program requires a same top-level transaction containing Pump `buy_v2`/`sell_v2` before `record_activity`, so the site now separates ordinary Pump trading from the reward transaction path.
- First-render dashboard placeholders are product truth too: if RPC has not answered yet, the UI must say `Checking`, not stale pre-launch states such as `Not sent` or `Empty`.
- A plain Porkbun CNAME from `builder.ratchetx.xyz` to `<tunnel-id>.cfargotunnel.com` is not enough for a public Cloudflare named-tunnel hostname: without Cloudflare managing/proxying the `ratchetx.xyz` zone, DNS resolves to the tunnel's internal IPv6/no public A path and browsers cannot reach the builder.
- A live quick-tunnel URL is not proof that the reward builder is alive: if the local origin behind `127.0.0.1:8798` has stopped, Cloudflare can still answer while the browser sees `Failed to fetch` or a 502 path.
- A fixed `0.15 SOL` post-swap reserve guard became too strict after the V2 upgrade spend: the deployer wallet had `0.144882175 SOL`, so every proof swap would fail unless the reserve was deliberately parameterized.
- The status helper's "expected artifact" labels became stale after the V2 deploy; guardrails must update expected local and padded hashes immediately after a successful program upgrade.

## Iskustva
- The live ALT `FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG` is enough for ordinary player wallets even though it was created during the deployer proof: user-specific ATAs, volume accumulator and activity PDA can stay static and the v0 packet is still 709 bytes.
- A player wallet must have a TSLAx ATA with enough TSLAx for the proof buy; the builder should not return a signable transaction while that gate is red.
- Solana Pay transaction requests are the cleaner mobile/public-wallet shape for this flow because the wallet posts its signer account and receives a base64 serialized transaction; it still requires an HTTPS builder endpoint.
- `cloudflared tunnel --url` on this PC reads `%USERPROFILE%\.cloudflared\config.yml` by default; for a clean quick tunnel to the builder, pass an empty temp config with `--config C:\Svemir\data\brain\logs\stocx_cloudflared_empty.yml` or the request may hit the existing named-tunnel `http_status:404` fallback.
- The deployer wallet no longer blocks the proof path: after a `0.02 SOL` Jupiter ExactIn swap, the v0+ALT `buy_v2 + record_activity` proof tx finalized and paid `0.00001 TSLAx` from the pot.
- Public copy must separate entry asset from reward asset: STOCX is TSLAx-quoted, so a player needs TSLAx to play the current Reward TX, and only then may receive TSLAx back from the pot.
- Proof funding and lean funding are different gates: `--target proof` only needs enough post-swap TSLAx for one reward proof, while `--target lean` is for a larger launch/pot buffer.
- Semir's wallet moved from missing-ATA to ready state after a bundled Token-2022 ATA creation plus `0.014 TSLAx` transfer; the next blocker is public wallet signing, not player quote balance.
- The temporary HTTPS builder path produced a real Semir-wallet v0+ALT Reward TX: chain state proves wallet signer `HXFDa...C1HvM`, Pump `BuyV2`, and Etude `record_activity` in one transaction.
- For a clean quick tunnel on this PC, pass an empty `--config` path; otherwise `cloudflared tunnel --url` can inherit the named-tunnel config and return a Cloudflare 404 before the request reaches the local builder.
- A second `0.05 SOL` proof-target swap plus `0.014 TSLAx` transfer leaves Semir with enough quote token for one more Reward TX at the current measured cap of about `0.01127848 TSLAx`.
- If the mobile page shows the wallet as ready but `Sign trade` stays disabled after `Check`, check which builder endpoint the static page selected; a non-live default endpoint can make the wallet path look connected while the build request never succeeds.
- Reward builder selection should be recoverable, not singular: the static page should try query, local, production, and stored endpoints in order, then save the endpoint that actually returned a valid builder response.
- Semir's second wallet Reward TX succeeded before the latest builder fix was committed: when activity shows `totalCalls=2`, the next `Check` should honestly block on low remaining TSLAx unless another top-up is sent.
- The `proof` swap target can be falsely red for player top-ups because it measures launch-wallet post-swap readiness, not the player's post-transfer readiness; use a separate `semir-topup` target for small SOL -> TSLAx -> Semir refills.
- A player can repeat the STOCX Reward TX after a TSLAx refill; the chain state moves the per-wallet activity PDA from `totalCalls=2` to `3`, then correctly blocks another same-size check on low TSLAx again.
- "On-chain builder" is not an HTTP service on Solana; the real V2 shape is an Etude `buy_and_reward` instruction that CPI-calls Pump and then pays locally, while the current public builder remains off-chain and no-keypair.
- A synthetic `buy_and_reward` wrapper has packet room: using today's Pump account set, one Etude instruction with 31 accounts measured `1204` bytes as legacy and `651` bytes through the live ALT, so the idea is feasible enough to test but not safe to mainnet-upgrade without LiteSVM coverage.
- A public Action mapping is only real if both sides pass CORS: root `actions.json` and the target builder endpoint must answer `Access-Control-Allow-Origin: *`, otherwise Action-aware clients can discover the route and still fail before signing.
- V2 builder support should stay safe-gated even after the live upgrade: `mode=v2` may measure freely, but must not return a wallet-signable V2 transaction unless the operator deliberately sets `STOCX_ENABLE_V2_BUILD=1`.
- V2 `buy_and_reward` is now more than a candidate: a mainnet proof shows one top-level Etude instruction can CPI-call Pump `BuyV2` and then pay TSLAx in the same call.
- A small proof swap should use an explicit low reserve only when the following proof transaction is already sized and simulated; keep the default reserve guard conservative for normal funding.

## Izvori
- `tools/solana-cli/scripts-scratch/stocx_player_trade_record_builder.js measure --user HXFDaHyZ3i477z1BakiTWZg9UQN8rcreruuv9ifC1HvM --alt FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG`
- `tools/solana-cli/scripts-scratch/stocx_tslax_swap.js swap --send --amount-lamports 20000000 --target proof` produced tx `5LGvTmQZx3mSbphXTNF5hscLtJbiFgSfJfgPg5e9MbkUVVBoaMwtaiDw7dFZEBTa66DU8yenRxzFWAmW8X4LkrBS`.
- `tools/solana-cli/scripts-scratch/stocx_launch_rehearsal.js send-first-buy --send --alt FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG` produced tx `55JkQShU72Vy2L3hzHgoZDRNLcTpBsFXrLr2d4trTDFPo6twoeurDN9zizRtvnHHDKVKSGuUrrjsZ7gwrRN1D9V9`.
- `tools/solana-cli/scripts-scratch/stocx_tslax_swap.js swap --send --amount-lamports 50000000 --target proof` produced tx `56pyDbVf2ZM1kfvSj9EoF6ojNBhzMH8bAPPmkZ5RViCHfTsi9qiNmhxiQGUJxfMp3Z3Luwx1c57bZ9V58s4T3shW`.
- `tools/solana-cli/scripts-scratch/stocx_tslax_send_to_semir.js send --send --amount-raw 1400000` produced tx `3VG5DY3MwzDWgHdrJ3aTK2dDw6WTSMfnGrvF79ESkubScu8eHEeJHB2EiPiPEX2nDPt1havCkZk4gy7hF6BBF88e`.
- Semir-wallet Reward TX: `5gcApB2xEAP7rrVgyPc48Sx9g5semK2BYgg4sx8SoKUGkY25f5wLkdVoC4d6ymSKCzLRHmqfs9KcfQSE8dBXsg5p`.
- Second Semir proof top-up swap: `5eAh2CCwt7RrbwvrTVfAMWm5rQbGFbd7GsGX4YNNs8GPJZ9L6E1V8D5H8E857424kffwRdEaw87Zv8KRTj7iTWTu`.
- Second Semir TSLAx transfer: `3swRmk2AGtmyztTp87psvLdaNVJPpTtpd1nNWdyo2n1YcCfTbaM8VQFa3jRuhdGdVT9833eCKEfjDCC9iJdcpdhX`.
- Second Semir-wallet Reward TX: `5LztMCajS8ADqRi3FBLoZY13UWBfYYJuuEdjcnNx7ioDLgPpYRY2RGJGDfUvQCJZuqf1Q8z8tGuVswi95NGWKx5X`.
- Quick HTTPS builder QA: `https://wrote-photographer-unsigned-traditional.trycloudflare.com/health`, `/api/stocx/measure`, and `/api/stocx/build` returned 200 with `Access-Control-Allow-Origin: https://stocx.ratchetx.xyz`.
- Restarted quick HTTPS builder QA: `http://127.0.0.1:8798/health`, `https://removed-confident-compatible-entertaining.trycloudflare.com/health`, and `/api/stocx/measure` from `Origin: https://stocx.ratchetx.xyz` returned 200 after the local builder was restarted.
- Third Semir proof top-up swap: `3hAzDyeGCVpKBxjfZjtMZMn2AgmrnoZLPhLiugZgMGtHaVou3emicVj7Nm2pLgRaZRkYi5G2iPKiJwZtYpLnTCLi`.
- Third Semir TSLAx transfer: `3DGyDrcLbgWmdrVFmjPi1BSWiGr6Y4mNx172jMZVDCQxS4W7MsinwXo5TA9iN44XvHFcvyxT7Gt9qpv17toDZ9as`.
- `tools/solana-cli/scripts-scratch/stocx_player_trade_record_builder.js measure --user HXFDaHyZ3i477z1BakiTWZg9UQN8rcreruuv9ifC1HvM --alt FfP2CFWniyUraM4g3vncRPfYQnFZ3HTTShHXsfSJGSJG --include-base-ata auto` returned `OK: STOCX_PLAYER_TRADE_RECORD_READY` after the 0.03 SOL top-up route.
- `https://removed-confident-compatible-entertaining.trycloudflare.com/api/stocx/measure` and `/api/stocx/build` returned 200 from `Origin: https://stocx.ratchetx.xyz`; `/build` returned a wallet-signable `699`-byte v0+ALT transaction.
- Third Semir-wallet Reward TX: `3rYxoZXHSAwr7JC2QCkFECAGcwvdVwjYiWkM47K7fLJungGvbQnfCDmZv8axcRUufzGyoZ8Bp2mBkpXC4NH3CpSf`.
- Post-third-proof readback: Semir TSLAx `0.00252951`, pot TSLAx `0.05995`, activity record `94GM...U87` at `totalCalls=3` / `totalEarnedRaw=3000`; the next check is again balance-gated by the current `0.01132096 TSLAx` quote cap.
- Public builder package: `builder/stocx-player-builder.js`, `builder/package.json`, and `builder/README.md`; it removes local Svemir imports and exposes `/health`, `/api/stocx/measure`, `/api/stocx/build`, `/api/stocx/pay`, and `/actions.json`.
- Synthetic V2 wrapper measurement, no-send, 2026-09-12: one top-level Etude `buy_and_reward` instruction that would CPI into Pump measured `1204` bytes legacy with `28` bytes headroom, `1206` bytes v0 without lookup, `496` bytes synthetic full lookup, and `651` bytes with live ALT `FfP2...SJG`.
- Live Actions route QA after restart: `https://stocx.ratchetx.xyz/actions.json`, `https://removed-confident-compatible-entertaining.trycloudflare.com/actions.json`, and `https://removed-confident-compatible-entertaining.trycloudflare.com/api/stocx/pay` returned 200 with `Access-Control-Allow-Origin: *`.
- V2 public-builder measurement, no-send, 2026-09-12: `mode=v2` produced `compute_limit + priority_fee + buy_and_reward`, `buy_and_reward` has 40 accounts and 29 data bytes, live ALT transaction size is `665` bytes with `567` bytes headroom, and output is correctly blocked by low Semir TSLAx plus the V2 enable guard.
- V1 public-builder regression, no-send, 2026-09-12: `mode=v1` still measures `709` bytes through the live ALT with `523` bytes headroom and is blocked only by Semir's current low TSLAx balance.
- V2 program upgrade: `4Sg7yFa7acon3FhU7uquGdi9dd2HFixNfq8VbXactfHMWeSniu483NgAmNVNGSutxPibFc3UM5g5SprjRqY8LfJ8`.
- V2 proof funding swap: `3cRedt9sV9fLVU8doiQ4hgcS73a8BgjthKBkdF7K5TyCLDK6y3KjnxT9QzbxRAU2QzvafVaaicU2Zjg54yE72wQC`.
- `tools/solana-cli/scripts-scratch/stocx_v2_proof_sender.js send --send` produced V2 proof tx `3YiZCnFX4GjfUcGdniqHQDvgZ4oz8vC8kr9ryDFVJtsxUBPhiD53ekn4KzwudxxPX6e6qsorEfpqoNbecaaXZNm`.
- Post-V2-proof readback: Etude top-level, Pump `BuyV2` as CPI, deployer STOCX `3,000,000`, deployer TSLAx `0.00133745`, pot TSLAx `0.05994`, deployer activity `EUuE...ZTg` at `totalCalls=3` / `totalEarnedRaw=3000`.
- Phantom docs, checked 2026-09-11: versioned transactions with Address Lookup Tables are the supported path for larger account sets.
- Solana Pay spec, checked 2026-09-11: transaction requests require an absolute HTTPS link, POST body `account`, and response field `transaction` as base64 serialized transaction.
- Solana Actions docs, checked 2026-09-12: Actions are public APIs that return signable transactions; GET returns metadata, POST returns a signable transaction/message, and production needs `actions.json` plus CORS.

## Vestine
- Use a backend builder for STOCX reward trades: frontend connects wallet, builder returns measured state, and only a green wallet/chain gate should expose a wallet-signable v0 transaction.
- For public wallet requests, expose both app JSON (`/api/stocx/build`) and Solana Pay JSON (`/api/stocx/pay`) so extension browsers and mobile wallets have a path from the same no-keypair builder.
- Keep public builder endpoints origin-limited and throttled because every build request performs live mainnet RPC reads.
- Keep at least one known-good fallback builder URL in the static dashboard while the branded `builder.ratchetx.xyz` route is not durable, and surface endpoint failures as builder failures rather than wallet failures.
- Keep player top-ups in a separate guarded helper from pot funding: both are Token-2022 transfers, but their intended destinations and failure modes are different enough to deserve different scripts.
- Use `--target semir-topup` for a small source-wallet TSLAx refill that will be forwarded to Semir; reserve `--target proof` for cases where the launch wallet itself must retain enough TSLAx to sign a proof trade.
- For launch QA, a temporary builder tunnel is enough to prove the full wallet path, but public launch should still use a branded stable builder endpoint.
- The public dashboard should eventually default to `https://builder.ratchetx.xyz` on the `stocx.ratchetx.xyz` hostname, but until that branded runtime is healthy it should default to the current verified quick builder and keep query/local/stored fallbacks.
- Keep V1 live while packaging the public builder; do not revoke program or ALT authority until Semir chooses between freezing V1 now and spending one more upgrade cycle on the tested V2 CPI wrapper.
- Add experimental builder modes behind explicit flags when the live program does not yet support them; a public no-keypair builder must fail closed rather than hand wallets transactions known to target an undeployed instruction.
- Use `stocx_v2_proof_sender.js simulate` before `send --send`; it rebuilds a fresh unsigned V2 transaction, signs locally, and prints simulation logs before any send.
- Keep `--min-reserve-lamports` explicit on proof-only swaps so the command output states exactly which SOL reserve was accepted.

## Odluke
- Keep the public page static and readable; add a guarded `Reward TX` panel now, and wire the actual public signer endpoint separately instead of pretending Pump-only trades can trigger rewards.
- The first fold must carry the core mechanism before dashboard controls: `STOCX / TSLAx`, fee-fed TSLAx pot, and `buy + record proof` reward path.
- Keep GitHub Pages as the readable dashboard, and require a separate HTTPS runtime for the reward builder instead of embedding a heavyweight wallet SDK into the static page.
- Treat the temporary tunnel proof as successful QA, not final infrastructure; the production decision remains a stable `builder.ratchetx.xyz` runtime.
- Keep `builder.ratchetx.xyz` as the intended branded endpoint, but do not treat the Porkbun-only CNAME as finished infrastructure; the immediate launch/test path is the explicit quick-builder URL and the durable path is Cloudflare-managed DNS or a deployed Worker/runtime.
- Temporarily default production `stocx.ratchetx.xyz` to the verified quick builder so the public mobile `Check` button can work without Semir needing to preserve a long `builder=` query string.
- Keep `v1` as the public builder default until a stable hosted builder endpoint is configured for V2 and monitored; V2 can already be served by an operator with `STOCX_ENABLE_V2_BUILD=1`.
- V2 is now the preferred on-chain reward shape after proof; keep public builders operator-gated with `STOCX_ENABLE_V2_BUILD=1` until a stable hosted endpoint is configured and watched.
