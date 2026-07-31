// Mock Interview API Client
// Follows the same patterns as api.ts for consistency

import { STRATAX_API_BASE_URL, StrataxApiError, buildStrataxHeaders, strataxFetch } from "./strataxClient";
import type { ResumeContext, ResumeUploadResponse } from "../types/resume";

const BASE_URL = STRATAX_API_BASE_URL;

function buildHeaders(): HeadersInit {
  // Back-compat helper; uses unified header logic (JWT + user keys only if authenticated)
  return buildStrataxHeaders({ json: true });
}

async function safeReadText(res: Response): Promise<string> {
  return await res.text().catch(() => "");
}

async function safeReadJson(res: Response): Promise<any> {
  return await res.json().catch(() => null);
}

async function buildErrorMessage(prefix: string, res: Response): Promise<string> {
  const body = await safeReadJson(res);
  const detail = body?.detail ?? body;
  const msg = typeof detail === "string" ? detail : detail?.message;
  if (msg) return `${prefix}: ${res.status} ${msg}`;
  const text = await safeReadText(res);
  return `${prefix}: ${res.status} ${text}`.trim();
}

// Request/Response Types
export type InterviewType = "coding" | "behavioral" | "system_design" | "technical";
export type Difficulty = "easy" | "medium" | "hard";
export type InputMethod = "text" | "voice";

// Optional runtime coaching extensions (may be absent on older backends)
export type EvaluationTrace = {
  why?: string[];
  criteria_averages?: Record<string, number>;
  [key: string]: unknown;
};

export type Trajectory = {
  note?: string;
  points?: Array<{
    question?: number;
    question_number?: number;
    overall?: number;
    overall_score?: number;
    dimensions?: Record<string, number>;
    dimension_scores?: Record<string, number>;
    [key: string]: unknown;
  }>;
  overall?: { delta?: number; [key: string]: unknown };
  dimensions?: Record<string, { delta?: number; [key: string]: unknown }>;
  [key: string]: unknown;
};

export interface StartSessionRequest {
  user_id: string;
  interview_type: InterviewType;
  difficulty: Difficulty;
  num_questions: number;
  topic?: string;
  resume_context?: ResumeContext;
}

export interface StartSessionResponse {
  session_id: string;
  first_question: {
    question_id: string;
    question_text: string;
    question_number: number;
    difficulty: Difficulty;
    topic: string;
    interview_type: InterviewType;
    hints?: string[];
    total_questions: number;
  };
  total_questions: number;
  interview_type: InterviewType;
  difficulty: Difficulty;
}

export interface SubmitAnswerRequest {
  session_id: string;
  answer_text: string;
  time_taken_seconds?: number;
  input_method: InputMethod;
  code_solution?: string;
  language?: string;
}

export interface SubmitAnswerResponse {
  evaluation: {
    criteria_scores: {
      correctness: number;
      completeness: number;
      clarity: number;
      confidence: number;
      technical_depth: number;
    };
    detailed_feedback: string;
    overall_score: number;
    performance_summary: string;
    rating_category: string;
    strengths: string[];
    weaknesses: string[];
    improvement_suggestions: string[];
    missing_points: string[];
    model_answer?: string;
  };
  follow_up_questions?: string[];
  next_question?: {
    question_id: string;
    question_text: string;
    question_number: number;
    difficulty: Difficulty;
    topic: string;
    interview_type: InterviewType;
    total_questions: number;
  };
  is_last_question: boolean;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };

  // Optional runtime extensions
  evaluation_trace?: EvaluationTrace;
  trajectory?: Trajectory;
}

export interface SessionStatusResponse {
  session_id: string;
  user_id: string;
  interview_type: InterviewType;
  difficulty: Difficulty;
  status: "active" | "completed" | "abandoned";
  current_question_index: number;
  total_questions: number;
  start_time: string;
  current_question?: {
    question_id: string;
    question_text: string;
    difficulty: Difficulty;
    topic: string;
  };
}

export interface SessionSummaryResponse {
  session_id: string;
  average_score: number;
  interview_type: InterviewType;
  difficulty: Difficulty;
  questions_answered: number;
  total_questions: number;
  started_at: string;
  completed_at: string;
  evaluations: Array<{
    question: string;
    score: number;
    rating: string;
    summary: string;
    model_answer?: string;
    user_answer?: string;
    strengths?: string[];
    weaknesses?: string[];
    criteria_scores?: {
      correctness: number;
      completeness: number;
      clarity: number;
      confidence: number;
      technical_depth: number;
    };
  }>;

  // Optional runtime extensions
  trajectory?: Trajectory;
  evaluation_trace?: EvaluationTrace;
}

export type EndSessionResponse = Partial<SessionSummaryResponse> & {
  message?: string;
  total_time_seconds?: number;
  score_range?: unknown;
  ended_early?: boolean;
  questions_skipped?: number;
  skipped_questions?: Array<{
    question_number: number;
    question: string;
    question_type?: string;
  }>;
  summary?: (Partial<SessionSummaryResponse> & { total_time_seconds?: number; score_range?: unknown }) | null;
};

export interface HintResponse {
  hint: string;
  hint_level: 1 | 2 | 3;
  hints_used_count: number;
  hint_description: string;
}

export interface ProgressResponse {
  session_id: string;
  current_question: number;
  total_questions: number;
  questions_answered: number;
  average_score: number;
  total_time_seconds: number;
  hints_used_total: number;
  question_times: number[];
  question_scores: number[];
}

// API Functions
export async function apiStartMockInterview(
  request: StartSessionRequest
): Promise<StartSessionResponse> {
  console.log("[MockInterviewAPI] Starting interview, request:", request);
  console.log("[MockInterviewAPI] URL:", `${BASE_URL}/api/mock-interview/sessions/start`);

  const res = await strataxFetch(`${BASE_URL}/api/mock-interview/sessions/start`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(request),
  });

  console.log("[MockInterviewAPI] Response status:", res.status, res.statusText);

  if (!res.ok) {
    const msg = await buildErrorMessage("Failed to start mock interview", res);
    console.error("[MockInterviewAPI] Error response:", msg);
    throw new Error(msg);
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Response data:", data);
  return data;
}

export async function apiSubmitMockAnswer(
  request: SubmitAnswerRequest
): Promise<SubmitAnswerResponse> {
  console.log("[MockInterviewAPI] Submitting answer, request:", request);

  const res = await strataxFetch(`${BASE_URL}/api/mock-interview/sessions/submit-answer`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(request),
  });

  console.log("[MockInterviewAPI] Submit response status:", res.status, res.statusText);

  if (!res.ok) {
    const msg = await buildErrorMessage("Failed to submit answer", res);
    console.error("[MockInterviewAPI] Submit error response:", msg);
    throw new Error(msg);
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Submit response data:", data);
  return data;
}

export async function apiGetSessionStatus(
  sessionId: string
): Promise<SessionStatusResponse> {
  const res = await strataxFetch(`${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: buildHeaders(),
  });

  if (!res.ok) {
    throw new Error(await buildErrorMessage("Failed to get session status", res));
  }

  return res.json();
}

export async function apiGetSessionSummary(
  sessionId: string
): Promise<SessionSummaryResponse> {
  const res = await strataxFetch(
    `${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}/summary`,
    {
      method: "GET",
      headers: buildHeaders(),
    }
  );

  if (!res.ok) {
    throw new Error(await buildErrorMessage("Failed to get session summary", res));
  }

  return res.json();
}

export async function apiEndSession(sessionId: string): Promise<EndSessionResponse> {
  const res = await strataxFetch(
    `${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}/end`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );

  if (!res.ok) {
    throw new Error(await buildErrorMessage("Failed to end session", res));
  }

  const resp = (await res.json()) as EndSessionResponse;

  // Backend may return summary fields at top-level OR nested under `summary`.
  // Normalize the two fields we rely on so callers can read a single shape.
  const totalTime = resp.total_time_seconds ?? resp.summary?.total_time_seconds;
  const scoreRange = resp.score_range ?? resp.summary?.score_range;

  return {
    ...resp,
    total_time_seconds: totalTime,
    score_range: scoreRange,
  };
}

export async function apiGetHint(
  sessionId: string,
  hintLevel: 1 | 2 | 3
): Promise<HintResponse> {
  console.log("[MockInterviewAPI] Requesting hint, level:", hintLevel);

  const res = await strataxFetch(
    `${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}/hint?hint_level=${hintLevel}`,
    {
      method: "POST",
      headers: buildHeaders(),
    }
  );

  console.log("[MockInterviewAPI] Hint response status:", res.status, res.statusText);

  if (!res.ok) {
    const msg = await buildErrorMessage("Failed to get hint", res);
    console.error("[MockInterviewAPI] Hint error response:", msg);
    throw new Error(msg);
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Hint response data:", data);
  return data;
}

export async function apiGetProgress(
  sessionId: string
): Promise<ProgressResponse> {
  const res = await strataxFetch(
    `${BASE_URL}/api/mock-interview/sessions/${encodeURIComponent(sessionId)}/progress`,
    {
      method: "GET",
      headers: buildHeaders(),
    }
  );

  if (!res.ok) {
    throw new Error(await buildErrorMessage("Failed to get progress", res));
  }

  return res.json();
}

export interface MockInterviewHistorySession {
  session_id: string;
  user_id: string;
  interview_type: InterviewType;
  difficulty: Difficulty;
  status: "completed" | "active" | "abandoned";
  started_at: string;
  completed_at?: string;
  average_score: number;
  questions_answered: number;
  total_questions: number;
  evaluations?: Array<{
    question: string;
    user_answer: string;
    model_answer?: string;
    score: number;
    rating: string;
    feedback: string;
  }>;
}

export async function apiGetMockInterviewHistory(
  userId: string
): Promise<{ sessions: MockInterviewHistorySession[] }> {
  console.log("[MockInterviewAPI] Fetching history for userId:", userId);
  console.log("[MockInterviewAPI] URL:", `${BASE_URL}/api/mock-interview/history/${encodeURIComponent(userId)}`);

  const res = await strataxFetch(
    // `include_details`, not `include_evaluations` -- the API has no parameter
    // by that name, so it was silently ignored and every session came back
    // without its evaluations. MockInterviewMode treats a session with no
    // evaluations as unopenable, so this one word made the whole history
    // sidebar dead: every past interview answered "No Questions Found".
    `${BASE_URL}/api/mock-interview/history/${encodeURIComponent(userId)}?include_details=true`,
    {
      method: "GET",
      headers: buildHeaders(),
    }
  );

  console.log("[MockInterviewAPI] History response status:", res.status, res.statusText);

  if (!res.ok) {
    const text = await safeReadText(res);
    console.error("[MockInterviewAPI] History error response:", text);
    // Return empty array if endpoint doesn't exist yet
    if (res.status === 404) {
      console.log("[MockInterviewAPI] 404 - returning empty sessions");
      return { sessions: [] };
    }
    throw new Error('Could not load interview history. Please try again.');
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] History response data:", data);
  return data;
}

export async function apiDeleteMockInterviewSession(
  userId: string,
  sessionId: string
): Promise<{ message: string }> {
  console.log("[MockInterviewAPI] Deleting session:", sessionId, "for user:", userId);

  const res = await strataxFetch(
    `${BASE_URL}/api/mock-interview/history/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      headers: buildHeaders(),
    }
  );

  console.log("[MockInterviewAPI] Delete response status:", res.status, res.statusText);

  if (!res.ok) {
    if (res.status === 404) {
      console.log("[MockInterviewAPI] 404 - treating as deleted");
      return { message: "Session deleted" };
    }
    const text = await safeReadText(res);
    console.error("[MockInterviewAPI] Delete error response:", text);
    if (res.status === 403) {
      throw new Error("You don't have permission to delete this session");
    }
    throw new Error('Could not delete the session. Please try again.');
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Delete response data:", data);
  return data;
}

export async function apiDeleteAllMockInterviewSessions(
  userId: string
): Promise<{ message: string; deleted_count: number }> {
  console.log("[MockInterviewAPI] Deleting all sessions for user:", userId);

  const res = await strataxFetch(
    `${BASE_URL}/api/mock-interview/history/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: buildHeaders(),
    }
  );

  console.log("[MockInterviewAPI] Delete all response status:", res.status, res.statusText);

  if (!res.ok) {
    if (res.status === 404) {
      console.log("[MockInterviewAPI] 404 - treating as deleted");
      return { message: "All sessions deleted", deleted_count: 0 };
    }
    const text = await safeReadText(res);
    console.error("[MockInterviewAPI] Delete all error response:", text);
    throw new Error('Could not delete sessions. Please try again.');
  }

  const data = await res.json();
  console.log("[MockInterviewAPI] Delete all response data:", data);
  return data;
}

// ============================================================================
// Resume Upload
// ============================================================================

/**
 * Upload and parse a resume file for Mock Interview.
 * Accepts .txt, .md, .pdf, .docx (max 5 MB).
 * Returns structured resume context for claim-based probing.
 */
export async function uploadResumeForMockInterview(
  file: File
): Promise<ResumeUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await strataxFetch(`${BASE_URL}/api/mock-interview/upload-resume`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Upload failed: ${res.status}`);
  }

  return res.json();
}
