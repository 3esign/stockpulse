import * as builderModule from "./stocx-player-builder.js";
import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";

const builder = builderModule.default && builderModule.default.buildForUser
  ? builderModule.default
  : builderModule;

const {
  DEFAULT_ALT,
  DEFAULT_BASE_AMOUNT_RAW,
  DEFAULT_SLIPPAGE_BPS,
  DEFAULT_SIDE,
  buildForUser,
  statusForError,
} = builder;

const SITE_URL = "https://stocx.ratchetx.xyz";
const SERVICE = "stocx-player-builder";
const DEFAULT_ALLOWED_ORIGINS = [
  "*",
  SITE_URL,
  "http://127.0.0.1:8787",
  "http://localhost:8787",
];
const rateBuckets = new Map();

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function allowedOrigins(env) {
  return new Set(splitCsv(env.STOCX_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(",")));
}

function originAllowed(request, env) {
  const origin = request.headers.get("origin");
  const allowed = allowedOrigins(env);
  return !origin || allowed.has("*") || allowed.has(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowed = allowedOrigins(env);
  const allowOrigin = allowed.has("*") ? "*" : (allowed.has(origin) ? origin : SITE_URL);
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,solana-action,solana-client",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function json(request, env, status, body, extraHeaders = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

async function requestJson(request) {
  if (request.method !== "POST") return {};
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid_json_body");
  }
}

function value(url, body, name, fallback = null) {
  return url.searchParams.get(name) ?? body[name] ?? fallback;
}

function workerDefaults(env) {
  const rpcUrls = splitCsv(env.SOLANA_RPC_URLS || env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com");
  return {
    rpcUrls,
    defaultAlt: env.STOCX_ALT || DEFAULT_ALT.toBase58(),
    defaultMode: String(env.STOCX_BUILDER_MODE || "v2").toLowerCase(),
    v2BuilderEnabled: env.STOCX_ENABLE_V2_BUILD === "1",
    retryAttempts: Number(env.STOCX_RETRY_ATTEMPTS || 1),
  };
}

function rateLimit(request, env) {
  const max = Number(env.STOCX_RATE_LIMIT_MAX || 30);
  if (!Number.isFinite(max) || max <= 0) return null;
  const windowMs = Number(env.STOCX_RATE_LIMIT_WINDOW_MS || 60000);
  const now = Date.now();
  const key = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")
    || "unknown";
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  current.count += 1;
  if (current.count <= max) return null;
  return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
}

async function handleBuild(request, env, url, body) {
  const defaults = workerDefaults(env);
  const user = new PublicKey(value(url, body, "user", body.account));
  const altAddress = new PublicKey(value(url, body, "alt", defaults.defaultAlt));
  const amount = new BN(String(value(url, body, "baseAmountRaw", DEFAULT_BASE_AMOUNT_RAW)));
  const slippageBps = Number(value(url, body, "slippageBps", DEFAULT_SLIPPAGE_BPS));
  const side = Number(value(url, body, "side", DEFAULT_SIDE));
  const mode = String(value(url, body, "mode", defaults.defaultMode)).toLowerCase();
  if (!["v1", "v2"].includes(mode)) throw new Error("mode must be v1 or v2");
  const includeBaseAta = value(url, body, "includeBaseAta", "always");

  let lastError = null;
  for (const rpcUrl of defaults.rpcUrls) {
    try {
      return await buildForUser({
        user,
        altAddress,
        amount,
        slippageBps,
        side,
        includeBaseAta,
        mode,
        serialize: url.pathname === "/api/stocx/build" || url.pathname === "/api/stocx/pay",
        rpcUrl,
        v2BuilderEnabled: defaults.v2BuilderEnabled,
        retryAttempts: defaults.retryAttempts,
      });
    } catch (err) {
      lastError = err;
      const message = String(err.message || err);
      if (!/403|429|rate limit|Too Many Requests|blocked|fetch failed/i.test(message)) break;
    }
  }
  throw lastError;
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        if (!originAllowed(request, env)) return json(request, env, 403, { error: "origin_not_allowed" });
        return json(request, env, 204, {});
      }

      const url = new URL(request.url);
      const defaults = workerDefaults(env);

      if (url.pathname === "/" && request.method === "GET") {
        return json(request, env, 200, {
          ok: true,
          service: SERVICE,
          site: SITE_URL,
          endpoints: ["/health", "/actions.json", "/api/stocx/measure", "/api/stocx/build", "/api/stocx/pay"],
        });
      }

      if (url.pathname === "/health" && request.method === "GET") {
        return json(request, env, 200, {
          ok: true,
          service: SERVICE,
          mode: defaults.defaultMode,
          v2BuilderEnabled: defaults.v2BuilderEnabled,
          rpcFallbacks: defaults.rpcUrls.length,
        });
      }

      if (url.pathname === "/actions.json" && request.method === "GET") {
        return json(request, env, 200, {
          rules: [
            { pathPattern: "/", apiPath: "/api/stocx/pay" },
            { pathPattern: "/api/stocx/pay", apiPath: "/api/stocx/pay" },
          ],
        });
      }

      if (!originAllowed(request, env)) {
        return json(request, env, 403, { error: "origin_not_allowed" });
      }

      const limited = rateLimit(request, env);
      if (limited) {
        return json(request, env, 429, {
          error: "rate_limited",
          retryAfterSeconds: limited,
        }, {
          "retry-after": String(limited),
        });
      }

      if (url.pathname === "/api/stocx/pay" && request.method === "GET") {
        return json(request, env, 200, {
          type: "action",
          title: "STOCX Reward TX",
          icon: `${SITE_URL}/stocx-token.svg`,
          description: "Buy STOCX with TSLAx, record the proof on-chain, and receive a TSLAx reward from the live pot when the gate passes.",
          label: "Build Reward TX",
        });
      }

      if (!["/api/stocx/build", "/api/stocx/measure", "/api/stocx/pay"].includes(url.pathname)) {
        return json(request, env, 404, { error: "not_found" });
      }
      if (request.method !== "POST") {
        return json(request, env, 405, { error: "method_not_allowed" }, { allow: "POST" });
      }

      const body = await requestJson(request);
      const result = await handleBuild(request, env, url, body);

      if (url.pathname === "/api/stocx/pay") {
        const tx = result.transaction?.serializedBase64;
        if (!tx) {
          return json(request, env, 400, {
            error: result.gates?.failures?.[0] || result.transactionStatus || "transaction_not_ready",
            message: "STOCX reward transaction is not ready for this wallet.",
          });
        }
        return json(request, env, 200, {
          transaction: tx,
          message: `Buy ${result.price.baseAmountUi} STOCX and record ${result.expectedReward.ui} TSLAx reward proof.`,
        });
      }

      return json(request, env, 200, result);
    } catch (err) {
      const message = String(err.message || err);
      return json(request, env, statusForError(message), { error: message });
    }
  },
};
