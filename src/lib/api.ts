import { isDevelopmentMode } from "./devUtils";
import { STRATAX_API_BASE_URL, StrataxApiError, buildStrataxHeaders, strataxFetch } from "./strataxClient";

export type AnswerStyle = "short" | "detailed";

const BASE_URL = STRATAX_API_BASE_URL;

function buildHeaders(options?: { forceGemini?: boolean }): HeadersInit {
  // Back-compat helper: keep callsites stable while unifying behavior.
  return buildStrataxHeaders({ forceGeminiAsPrimary: options?.forceGemini });
}

export async function apiHealth(): Promise<any> {
  const res = await strataxFetch(`${BASE_URL}/health`, {
    method: "GET",
    headers: buildHeaders(),
  });
  return res.json();
}

export interface CreateSessionResponse { session_id: string }
export async function apiCreateSession(): Promise<CreateSessionResponse> {
  const res = await strataxFetch(`${BASE_URL}/api/session`, {
    method: "POST",
    headers: buildHeaders(),
  });
  return res.json();
}

/**
 * Which copilot behaviour a request asks for.
 *
 * "questions" is Search Intelligence folded into the copilot: it shares the
 * session, key resolution and quota, and returns question cards through the same
 * ui_action mechanism as mirror prompts and architecture choices.
 */
export type CopilotMode = "answer" | "mirror" | "questions";

export interface SubmitQuestionRequest {
  session_id: string;
  question: string;
  style: AnswerStyle;
  // Default behavior is "answer". Mirror mode analyzes a user's draft answer.
  // "questions" generates a set of practice questions for the topic instead of
  // answering it, returned as cards in ui_payload.
  mode?: CopilotMode;
  // Used only when mode === "mirror".
  user_answer?: string;
  // Optional backend hinting (kept flexible for forward-compat).
  depth?: string;
  architecture_mode?: "single" | "multi-view" | null;
}
export interface SubmitQuestionResponse {
  answer: string;
  style: AnswerStyle;
  created_at: string; // ISO8601
  truncated?: boolean; // Backend indicates if answer was cut off

  // Echoed by backend for clarity and debugging.
  mode?: CopilotMode;

  // Optional: backend may return the effective session id used.
  // If omitted, we will try to recover it from response headers.
  session_id?: string;

  // Optional UI actions (preferred over parsing magic strings in `answer`)
  ui_action?: string;
  ui_payload?: {
    default?: string;
    options?: Array<{ id: string; label: string; description?: string }>;
    /** ui_action "offer_help": why the copilot thinks the user is stuck. */
    reason?: string;
    /** ui_action "offer_help": the sentence to show, in the copilot's voice. */
    message?: string;
    /** ui_action "offer_help": the feature being offered as a way out. */
    feature?: string;
    /** ui_action "render_question_cards": the query the set was generated for. */
    query?: string;
    /** ui_action "render_question_cards": how many cards are in `questions`. */
    count?: number;
    /** ui_action "render_question_cards": the generated practice questions. */
    questions?: EnhancedQuestion[];
    [key: string]: unknown;
  };
}

/**
 * A turn that rendered question cards.
 *
 * `answer` carries only a one-line preamble -- the questions themselves are in
 * ui_payload, so rendering both would show every question twice.
 */
export const RENDER_QUESTION_CARDS = "render_question_cards" as const;

export interface QuestionCardsPayload {
  query: string;
  count: number;
  questions: EnhancedQuestion[];
}

/** Narrow a response (or a stored history turn) to its question-card payload. */
export function questionCardsPayload(source: {
  ui_action?: string;
  ui_payload?: Record<string, unknown> | null;
}): QuestionCardsPayload | null {
  if (source?.ui_action !== RENDER_QUESTION_CARDS) return null;
  const payload = source.ui_payload as Partial<QuestionCardsPayload> | undefined;
  const questions = payload?.questions;
  if (!Array.isArray(questions) || questions.length === 0) return null;
  return {
    query: typeof payload?.query === "string" ? payload.query : "",
    count: typeof payload?.count === "number" ? payload.count : questions.length,
    questions,
  };
}
export async function apiSubmitQuestion(body: SubmitQuestionRequest): Promise<SubmitQuestionResponse> {
  const res = await strataxFetch(`${BASE_URL}/api/question`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ ...body, stream: false }),
  });

  const effectiveSessionId =
    res.headers.get("X-Stratax-Session-Id") ||
    res.headers.get("x-stratax-session-id") ||
    undefined;

  const effectiveMode =
    (res.headers.get("X-Stratax-Chat-Mode") || res.headers.get("x-stratax-chat-mode") || undefined) as
      | CopilotMode
      | undefined;

  const data = (await res.json()) as SubmitQuestionResponse;
  if (effectiveSessionId && !data.session_id) {
    data.session_id = effectiveSessionId;
  }
  if (effectiveMode && !data.mode) {
    data.mode = effectiveMode;
  }
  return data;
}

// Streaming version of apiSubmitQuestion
export async function apiSubmitQuestionStream(
  body: SubmitQuestionRequest,
  onChunk: (chunk: string) => void
): Promise<{ answer: string; style: AnswerStyle; created_at: string; truncated?: boolean; session_id?: string; mode?: CopilotMode }> {
  const res = await strataxFetch(`${BASE_URL}/api/question`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.body) throw new Error("Submit question failed: missing response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullAnswer = "";

  const effectiveSessionId =
    res.headers.get("X-Stratax-Session-Id") ||
    res.headers.get("x-stratax-session-id") ||
    undefined;

  const effectiveMode =
    (res.headers.get("X-Stratax-Chat-Mode") || res.headers.get("x-stratax-chat-mode") || undefined) as
      | CopilotMode
      | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      fullAnswer += chunk;
      onChunk(chunk);
    }
  }

  return {
    answer: fullAnswer,
    style: body.style,
    created_at: new Date().toISOString(),
    truncated: false,
    session_id: effectiveSessionId,
    mode: effectiveMode,
  };
}

// Streaming evaluation
export interface EvaluateRequest {
  session_id: string;
  code: string;
  problem: string;
  language: string; // e.g., "python"
}

export async function apiEvaluateStream(body: EvaluateRequest, onChunk: (text: string) => void): Promise<void> {
  // Ensure session exists upstream; assume caller created session_id
  const res = await strataxFetch(`${BASE_URL}/api/evaluate`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.body) throw new Error("Evaluate failed: missing response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) onChunk(chunk);
  }
}

// Backend code execution (LeetCode-style). Frontend should NOT call Judge0/Piston directly.
export interface CodeExecuteTestCase {
  input: string;
  expected_output?: string | null;
}

export interface CodeExecuteRequest {
  language: string;
  code: string;
  stdin?: string;
  test_cases?: CodeExecuteTestCase[] | null;
  store_code?: boolean;
  trace?: boolean;
  trace_max_events?: number;
  explain_trace?: boolean;
  explain_max_lines?: number;
}

export interface CodeExecuteTraceEvent {
  step: number;
  line: number;
  event: string;
  locals?: Record<string, unknown>;
  explanation?: string | null;
  stack?: string[];
  stdout?: string | null;
  stderr?: string | null;
}

export interface CodeExecuteTestResult {
  input: string;
  expected_output?: string | null;
  actual_output?: string | null;
  passed?: boolean;
  stdout?: string | null;
  stderr?: string | null;
  time_seconds?: number | null;
  memory_kb?: number | null;
}

export interface CodeExecuteResponse {
  success: boolean;
  status?: string;
  stdout?: string;
  stderr?: string;
  time_seconds?: number | null;
  memory_kb?: number | null;
  test_results?: CodeExecuteTestResult[] | null;
  trace_events?: CodeExecuteTraceEvent[] | null;
  line_explanations?: Record<string, string> | null;
}

export async function apiExecuteCode(
  body: CodeExecuteRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<CodeExecuteResponse> {
  const res = await strataxFetch(`${BASE_URL}/api/code/execute`, {
    method: "POST",
    headers: buildHeaders(),
    signal: opts.signal,
    body: JSON.stringify({
      language: body.language,
      code: body.code,
      stdin: body.stdin ?? "",
      test_cases: body.test_cases ?? null,
      store_code: body.store_code ?? false,
      trace: body.trace ?? false,
      trace_max_events: body.trace_max_events,
      explain_trace: body.explain_trace,
      explain_max_lines: body.explain_max_lines,
    }),
  });
  return res.json();
}

export interface CodeLanguage {
  id: string;
  label: string;
  supports_trace: boolean;
  /** Resolved runtime, e.g. "Python (3.14.0)". Null when Judge0 is unreachable. */
  runtime?: string | null;
}

export interface CodeLanguagesResponse {
  enabled: boolean;
  languages: CodeLanguage[];
}

/**
 * The languages this deployment can actually run.
 *
 * The dropdown used to be hardcoded here, independently of the backend, which
 * is how it came to offer C# and SQL that the server did not support -- picking
 * either ran the source through a Python interpreter. Reading the list from the
 * server means the two cannot drift.
 */
export async function apiListCodeLanguages(): Promise<CodeLanguagesResponse> {
  const res = await strataxFetch(`${BASE_URL}/api/code/languages`, {
    method: "GET",
    headers: buildHeaders(),
  });
  return res.json();
}

export interface HistoryItem {
  question: string;
  answer: string;
  style: AnswerStyle;
  created_at: string;
  mode?: CopilotMode;
  /**
   * Per-turn extras stored server-side. Turns that rendered more than text put
   * their ui_action/ui_payload here, so reloading a session can restore them --
   * question cards would otherwise show once and vanish on refresh.
   */
  meta?: {
    mode?: CopilotMode;
    ui_action?: string;
    ui_payload?: Record<string, unknown>;
    [key: string]: unknown;
  } | null;
  /** Client-side only: file attached when asking this question */
  attachment?: { name: string; type: string } | null;
}
export interface GetHistoryResponse {
  session_id: string;
  items: HistoryItem[];
}
export async function apiGetHistory(sessionId: string): Promise<GetHistoryResponse> {
  // FIXED: Use SessionManager endpoint for chat history, not HistoryManager (Search Intelligence)
  const res = await strataxFetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}/chat`, {
    method: "GET",
    headers: buildHeaders(),
    throwOnError: false,
  });
  if (res.status === 404) {
    // Gracefully handle missing session/history as empty
    return { session_id: sessionId, items: [] };
  }
  if (!res.ok) throw new Error(`Get history failed: ${res.status}`);
  return res.json();
}

export async function apiDeleteHistoryItem(params: { session_id: string; created_at: string }): Promise<{ status: string }> {
  const { session_id, created_at } = params;
  // Try DELETE first (query param)
  const urlDelete = `${BASE_URL}/api/history/${encodeURIComponent(session_id)}?created_at=${encodeURIComponent(created_at)}`;
  try {
    const res = await strataxFetch(urlDelete, { method: "DELETE", headers: buildHeaders() });
    return res.json();
  } catch (err) {
    if (err instanceof StrataxApiError && err.status === 404) return { status: "deleted" };
    // Fallback: some servers don't allow DELETE here
    if (!(err instanceof StrataxApiError) || err.status !== 405) {
      throw err;
    }
  }

  // Fallback: some servers don't allow DELETE here; try POST-based delete endpoint
  const urlPost = `${BASE_URL}/api/history/${encodeURIComponent(session_id)}/delete`;
  const res = await strataxFetch(urlPost, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ created_at }),
  });
  return res.json();
}

export interface SessionSummary {
  session_id: string;
  last_update: string;
  qna_count: number;
  title?: string;
  custom_title?: string;
}
export async function apiGetSessions(): Promise<SessionSummary[]> {
  const res = await strataxFetch(`${BASE_URL}/api/sessions`, {
    method: "GET",
    headers: buildHeaders(),
  });
  const data = await res.json();

  // Backend returns { items: [sessions] }, not a direct array
  if (data && typeof data === 'object' && Array.isArray(data.items)) {
    return data.items;
  }

  // Fallback: if it's already an array, use it directly
  if (Array.isArray(data)) {
    return data;
  }

  console.warn('[apiGetSessions] Unexpected response format:', data);
  return [];
}

export async function apiDeleteSession(sessionId: string): Promise<{ status: string }> {
  const res = await strataxFetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: buildHeaders(),
    throwOnError: false,
  });
  if (res.status === 404) {
    // If not found, treat as already deleted
    return { status: "deleted" };
  }
  if (!res.ok) throw new Error(`Delete session failed: ${res.status}`);
  return res.json();
}

export async function apiUpdateSessionTitle(sessionId: string, title: string): Promise<{ status: string }> {
  const res = await strataxFetch(`${BASE_URL}/api/session/${encodeURIComponent(sessionId)}/title`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify({ title }),
  });
  return res.json();
}

// New: delete a single history item by index
export async function apiDeleteHistoryItemByIndex(params: { session_id: string; index: number }): Promise<{ status: string }> {
  const { session_id, index } = params;
  const res = await strataxFetch(`${BASE_URL}/api/history/${encodeURIComponent(session_id)}/${index}`, {
    method: "DELETE",
    headers: buildHeaders(),
    throwOnError: false,
  });
  if (!res.ok) {
    if (res.status === 404) return { status: "deleted" };
    throw new Error(`Delete history item failed: ${res.status}`);
  }
  return res.json();
}

// Render Mermaid to SVG via backend (preferred over direct Kroki calls)
export async function apiRenderMermaid(params: { code: string; theme?: string; style?: string; size?: "compact" | "medium" | "large" }): Promise<string> {
  const { code, theme = "default", style = "modern", size = "medium" } = params;
  const res = await strataxFetch(`${BASE_URL}/api/render_mermaid`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ code, theme, style, size }),
  });
  // Backend returns raw SVG text
  return res.text();
}

export type SttEvent =
  | { type: "partial_transcript"; text: string }
  | { type: "end" };

export function openSttWebSocket(sessionId: string): WebSocket {
  const wsProtocol = BASE_URL.startsWith("https") ? "wss" : "ws";
  const url = `${wsProtocol}://${BASE_URL.replace(/^https?:\/\//, "")}/ws/stt/${encodeURIComponent(sessionId)}`;
  const ws = new WebSocket(url);
  return ws;
}


// Upload user profile (resume) for personalization
export interface UploadProfileResponse { status: "ok"; characters: number }
export async function apiUploadProfile(params: { session_id: string; file: File }): Promise<UploadProfileResponse> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("session_id", params.session_id);

  const res = await strataxFetch(`${BASE_URL}/api/upload_profile`, {
    method: "POST",
    body: form,
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Question cards
//
// What remains of the Interview Intelligence client. The tab, its search
// endpoints, its websocket and its separate search-tab history store are gone:
// question sets now come back from POST /api/question with mode "questions",
// through the copilot's own session and key handling. Only the card shape
// survives, because that is the part the UI actually renders.
// ---------------------------------------------------------------------------

export interface InterviewQuestion {
  question: string;
  answer: string;
  source: string;
  updated_at: string;
  topic?: string;
}

export interface EnhancedQuestion extends InterviewQuestion {
  source_type?: "verified" | "community" | "generated" | string;
  verification_status?: "verified" | "unverified" | "ai" | string;
  credibility_score?: number; // 0.0 - 1.0
  difficulty?: string;
  question_type?: string;
  key_concepts?: string[];
  common_mistakes?: string[];
  follow_up_questions?: string[];
  companies?: string[];
  code_solution?: string | null;
  language?: string | null;
  time_complexity?: string | null;
  space_complexity?: string | null;
  is_coding_question?: boolean;
  metadata?: {
    warning?: string;
    [k: string]: any;
  };
}
