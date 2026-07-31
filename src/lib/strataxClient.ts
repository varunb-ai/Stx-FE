/**
 * Unified Stratax API client wrapper.
 *
 * Responsibilities:
 * - Attach JWT auth when logged in (Authorization: Bearer <jwt>)
 * - Attach user-provided LLM keys (X-API-Key / X-Gemini-Key) when authenticated
 * - Support demo gating errors (DEMO_LIMIT_REACHED / DEMO_UNAVAILABLE) via window events
 * - Capture and persist effective session id from response headers (X-Stratax-Session-Id)
 */

import { isDevelopmentMode } from "./devUtils";

export const STRATAX_API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "https://intvmate-interview-assistant.hf.space";

export type DemoRemaining = {
  questions?: number;
  designs?: number;
  practice_rounds?: number;
  [key: string]: unknown;
};

export type DemoGateDetail = {
  error: "DEMO_LIMIT_REACHED";
  message?: string;
  user_type?: "demo";
  demo_remaining?: DemoRemaining;
  [key: string]: unknown;
};

export type DemoUnavailableDetail = {
  error: "DEMO_UNAVAILABLE";
  message?: string;
  [key: string]: unknown;
};

export type ApiErrorDetail =
  | { error?: string; message?: string; [key: string]: unknown }
  | string
  | unknown;

export class StrataxApiError extends Error {
  status: number;
  detail: ApiErrorDetail;

  constructor(message: string, opts: { status: number; detail: ApiErrorDetail }) {
    super(message);
    this.name = "StrataxApiError";
    this.status = opts.status;
    this.detail = opts.detail;
  }
}

export const STRATAX_GUEST_ID_STORAGE_KEY = "stratax_guest_id";
export const STRATAX_GUEST_ID_HEADER = "X-Stratax-Guest-Id";
export const STRATAX_CLIENT_ID_HEADER = "X-Client-Id";

function generateStableId(prefix: string): string {
  try {
    const cryptoAny = (globalThis as any)?.crypto;
    if (cryptoAny?.randomUUID) {
      return `${prefix}_${cryptoAny.randomUUID()}`;
    }
  } catch {
    // ignore
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

/**
 * Stable client identity for guests.
 *
 * Backend prefers this (or cookie) to keep history/sessions stable even if IP/UA changes.
 */
export function getOrCreateStrataxGuestId(): string {
  if (typeof window === "undefined") return "guest";

  let guestId =
    localStorage.getItem(STRATAX_GUEST_ID_STORAGE_KEY) ||
    // Back-compat: older builds stored only `stratax_user_id`
    localStorage.getItem("stratax_user_id");

  if (!guestId) {
    guestId = generateStableId("guest");
  }

  // Persist in the new key (and keep legacy key populated for older code paths).
  try {
    localStorage.setItem(STRATAX_GUEST_ID_STORAGE_KEY, guestId);
    if (!localStorage.getItem("stratax_user_id")) {
      localStorage.setItem("stratax_user_id", guestId);
    }
  } catch {
    // ignore
  }

  return guestId;
}

function getOrCreateUserId(): string {
  // Keep existing X-User-ID behavior stable, but align it with the guest id so
  // all identity-related headers refer to the same bucket.
  return getOrCreateStrataxGuestId();
}

function getJwtToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function getUserKeys(): { groqKey?: string; geminiKey?: string } {
  if (typeof window === "undefined") return {};
  const groqKey = localStorage.getItem("user_api_key") || undefined;
  const geminiKey = localStorage.getItem("gemini_api_key") || undefined;
  return { groqKey: groqKey || undefined, geminiKey: geminiKey || undefined };
}

/**
 * The LLM key to use for transports that cannot carry headers.
 *
 * WebSocket has no header phase in the browser, so the realtime search sends
 * credentials in its first message instead. Without this the streaming path
 * always ran on server keys, which quietly defeated BYOK for the whole
 * realtime flow.
 *
 * Mirrors buildHeaders: keys are only released once the user is authenticated
 * or has explicitly connected them, so stale localStorage cannot leak into a
 * demo session.
 */
export function getUserLlmKeyForSocket(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const allow = !!getJwtToken() || hasExplicitByokConnectionFlag();
  if (!allow) return undefined;
  const { groqKey, geminiKey } = getUserKeys();
  return groqKey || geminiKey || undefined;
}

function hasExplicitByokConnectionFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('api_keys_connected') === 'true';
  } catch {
    return false;
  }
}

export type BuildHeadersOptions = {
  json?: boolean;
  forceGeminiAsPrimary?: boolean;
  includeUserKeys?: boolean;
};

export function buildStrataxHeaders(options?: BuildHeadersOptions): HeadersInit {
  const headers: Record<string, string> = {};

  if (options?.json !== false) {
    headers["Content-Type"] = "application/json";
  }

  // Per-user isolation
  headers["X-User-ID"] = getOrCreateUserId();

  // Guest identity stability (for cross-origin deployments where cookies may not stick)
  // Backend will prefer these to avoid IP/UA-derived instability.
  const guestId = getOrCreateStrataxGuestId();
  headers[STRATAX_GUEST_ID_HEADER] = guestId;
  headers[STRATAX_CLIENT_ID_HEADER] = guestId;

  // Auth: JWT only (never put LLM keys in Authorization)
  const jwt = getJwtToken();
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

  // User-provided LLM keys
  // Attach keys when:
  // - authenticated via JWT, OR
  // - user explicitly connected keys (api_keys_connected=true)
  // This supports Quick Start/BYOK flows without requiring JWT while still
  // avoiding accidental attachment from stale localStorage in true demo mode.
  const allowUserKeys = options?.includeUserKeys !== false && (!!jwt || hasExplicitByokConnectionFlag());
  const { groqKey, geminiKey } = allowUserKeys ? getUserKeys() : {};
  if (groqKey) headers["X-API-Key"] = groqKey;
  if (geminiKey) headers["X-Gemini-Key"] = geminiKey;

  // If Groq isn't provided, allow Gemini to act as the primary key.
  if (allowUserKeys && !groqKey && geminiKey) headers["X-API-Key"] = geminiKey;

  if (allowUserKeys && options?.forceGeminiAsPrimary && geminiKey) headers["X-API-Key"] = geminiKey;

  if (isDevelopmentMode()) {
    const demoMode = !jwt;
    console.log("🔧 [Dev Mode] Request mode:", demoMode ? "demo" : "authenticated/with-keys");
  }

  return headers;
}

function readSessionHeaders(res: Response): {
  sessionId?: string;
  recovered?: boolean;
  reused?: boolean;
} {
  const sessionId =
    res.headers.get("X-Stratax-Session-Id") ||
    res.headers.get("x-stratax-session-id") ||
    undefined;

  const recovered =
    (res.headers.get("X-Stratax-Session-Recovered") || res.headers.get("x-stratax-session-recovered")) === "1";
  const reused = (res.headers.get("X-Stratax-Session-Reused") || res.headers.get("x-stratax-session-reused")) === "1";

  return { sessionId, recovered, reused };
}

function persistEffectiveSessionId(info: { sessionId?: string; recovered?: boolean; reused?: boolean }) {
  if (!info.sessionId || typeof window === "undefined") return;
  try {
    localStorage.setItem("stratax_effective_session_id", info.sessionId);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new CustomEvent("stratax:session", { detail: info }));
  } catch {
    // ignore
  }
}

function readGuestIdentityHeader(res: Response): string | undefined {
  return (
    res.headers.get(STRATAX_GUEST_ID_HEADER) ||
    res.headers.get(STRATAX_GUEST_ID_HEADER.toLowerCase()) ||
    undefined
  )?.trim() || undefined;
}

function persistGuestIdentityHeader(guestId?: string) {
  if (!guestId || typeof window === 'undefined') return;

  try {
    localStorage.setItem(STRATAX_GUEST_ID_STORAGE_KEY, guestId);
    localStorage.setItem('stratax_user_id', guestId);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new CustomEvent('stratax:guest-id', { detail: { guestId } }));
  } catch {
    // ignore
  }
}

async function safeReadJson(res: Response): Promise<any> {
  return await res.json().catch(() => null);
}

function shouldLogoutFor401(url: string, body: any): boolean {
  // Only force-logout when we are confident the 401 is about the JWT/session.
  // Some backend paths can return 401 for other reasons (e.g. invalid LLM API key),
  // and we must NOT clear the user's login session in those cases.
  const lowerUrl = (url || '').toLowerCase();
  if (lowerUrl.includes('/auth/me') || lowerUrl.includes('/auth/login') || lowerUrl.includes('/auth/register')) return true;

  const detail = body?.detail ?? body;
  const msg = (typeof detail === 'string' ? detail : (detail?.message || detail?.error || '')).toString().toLowerCase();

  // Common JWT/session-expiry indicators
  if (msg.includes('token') || msg.includes('jwt') || msg.includes('expired') || msg.includes('signature')) return true;

  // Common non-session causes we should NOT treat as a logout.
  if (msg.includes('api key') || msg.includes('invalid api key') || msg.includes('invalid_key') || msg.includes('authentication key')) return false;

  // Default: be conservative and don't log out.
  return false;
}

function dispatchByokRequiredEvent(opts: { status: number; url: string; detail: any }) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('byok:required', { detail: opts }));
  } catch {
    // ignore
  }
}

function dispatchDemoEvents(opts: {
  status: number;
  detail: any;
  headers: Headers;
}) {
  if (typeof window === "undefined") return;

  const { status, detail, headers } = opts;
  const d = detail?.detail ?? detail;

  if (status === 429 && d?.error === "DEMO_LIMIT_REACHED") {
    const reset = headers.get("X-RateLimit-Reset") || headers.get("x-ratelimit-reset") || undefined;
    const remaining = headers.get("X-RateLimit-Remaining") || headers.get("x-ratelimit-remaining") || undefined;

    window.dispatchEvent(
      new CustomEvent("demo:limit-reached", {
        detail: {
          ...d,
          rate_limit_reset: reset ? Number(reset) : undefined,
          rate_limit_remaining: remaining ? Number(remaining) : undefined,
        } satisfies DemoGateDetail & { rate_limit_reset?: number; rate_limit_remaining?: number },
      })
    );
    return;
  }

  if (status === 503 && d?.error === "DEMO_UNAVAILABLE") {
    window.dispatchEvent(new CustomEvent("demo:unavailable", { detail: d as DemoUnavailableDetail }));
    return;
  }
}

export async function strataxFetch(
  pathOrUrl: string,
  init: RequestInit & { json?: boolean; throwOnError?: boolean; includeUserKeys?: boolean } = {}
): Promise<Response> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${STRATAX_API_BASE_URL}${pathOrUrl}`;

  const wantsJsonHeader = init.json !== false;
  const defaultHeaders = buildStrataxHeaders({
    json: wantsJsonHeader,
    includeUserKeys: init.includeUserKeys,
  });

  const mergedHeaders: Record<string, string> = {
    ...(defaultHeaders as Record<string, string>),
    ...((init.headers as Record<string, string>) || {}),
  };

  // If the body is FormData, do not set Content-Type (browser will set boundary)
  if (typeof FormData !== "undefined" && init.body instanceof FormData) {
    delete mergedHeaders["Content-Type"];
  }

  const res = await fetch(url, {
    ...init,
    headers: mergedHeaders,
  });

  const sessionInfo = readSessionHeaders(res);
  persistEffectiveSessionId(sessionInfo);
  persistGuestIdentityHeader(readGuestIdentityHeader(res));

  if (!res.ok) {
    // If caller wants to handle non-OK status codes themselves, do not consume the body.
    if (init.throwOnError === false) {
      // Still surface demo gate events (429/503) even when caller handles errors.
      // IMPORTANT: Use a cloned response so we don't consume the caller's body.
      try {
        const body = await safeReadJson(res.clone());
        dispatchDemoEvents({ status: res.status, detail: body, headers: res.headers });
      } catch {
        // ignore
      }

      // Best-effort logout only when 401 is clearly JWT/session related.
      if (res.status === 401 && typeof window !== "undefined") {
        let body: any = null;
        try {
          body = await safeReadJson(res.clone());
        } catch {
          body = null;
        }

        if (!shouldLogoutFor401(url, body)) {
          // Surface a UI hint for missing/invalid user key.
          dispatchByokRequiredEvent({ status: res.status, url, detail: body?.detail ?? body });
          return res;
        }

        try {
          localStorage.removeItem("token");
          localStorage.removeItem("userId");
          localStorage.removeItem("tier");
        } catch {
          // ignore
        }
        try {
          window.dispatchEvent(new CustomEvent("auth:logout", { detail: { reason: "Session expired" } }));
        } catch {
          // ignore
        }
      }

      return res;
    }

    const body = await safeReadJson(res);

    // Demo gates
    dispatchDemoEvents({ status: res.status, detail: body, headers: res.headers });

    // Expired auth (only if it's truly JWT/session related)
    if (res.status === 401 && typeof window !== "undefined" && shouldLogoutFor401(url, body)) {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("tier");
      } catch {
        // ignore
      }
      try {
        window.dispatchEvent(new CustomEvent("auth:logout", { detail: { reason: "Session expired" } }));
      } catch {
        // ignore
      }
    }

    // Non-session 401/403 (e.g. missing/invalid LLM API key): prompt BYOK settings.
    // Not every 403 is about a key though. A session that belongs to someone
    // else is not something an API key fixes, and opening the key dialog there
    // tells the user to do something that cannot help.
    const isForbiddenResource = (body?.detail ?? body)?.error === 'SESSION_FORBIDDEN';
    if (
      (res.status === 401 || res.status === 403) &&
      typeof window !== 'undefined' &&
      !isForbiddenResource &&
      !shouldLogoutFor401(url, body)
    ) {
      dispatchByokRequiredEvent({ status: res.status, url, detail: body?.detail ?? body });
    }

    const detail = body?.detail ?? body;
    const message = typeof detail === "string" ? detail : detail?.message || `Request failed (${res.status})`;
    throw new StrataxApiError(message, { status: res.status, detail });
  }

  return res;
}

export async function strataxFetchJson<T>(
  pathOrUrl: string,
  init: RequestInit & { json?: boolean; includeUserKeys?: boolean } = {}
): Promise<T> {
  const res = await strataxFetch(pathOrUrl, init);
  return (await res.json()) as T;
}
