/**
 * Practice Mode API Integration
 * Real-time voice interview practice with AI evaluation
 */

import {
  STRATAX_API_BASE_URL,
  StrataxApiError,
  strataxFetch,
  strataxFetchJson,
} from './strataxClient';
import type { ResumeContext, ResumeUploadResponse } from '../types/resume';

export const API_BASE_URL = STRATAX_API_BASE_URL;

// ============================================================================
// Practice Proctoring
// ============================================================================

export type ProctoringSeverity = 'info' | 'warning' | 'violation';

export type ProctoringEventType =
  | 'camera_started'
  | 'camera_stopped'
  | 'camera_heartbeat'
  | 'face_missing'
  | 'multiple_faces'
  | 'tab_switch'
  | 'window_blur'
  | 'user_left_frame';

// New proctoring event contract (session-scoped audit trail)
/**
 * Must match `PracticeProctoringEventType` in app/schemas.py exactly.
 *
 * `MULTIPLE_FACES_DETECTED` was in this list and is not in that enum, so the
 * one camera-derived signal the detector produces was rejected with a 422 on
 * every single occurrence -- face detection ran every two seconds for the whole
 * interview and every result it found was thrown away. The server calls it
 * `MULTIPLE_FACES`.
 */
export type PracticeSessionProctoringEventType =
  | 'SCREEN_STOPPED'
  | 'CAMERA_STARTED'
  | 'CAMERA_STOPPED'
  | 'CAMERA_HEARTBEAT'
  | 'TAB_SWITCH'
  | 'WINDOW_BLUR'
  | 'WINDOW_MINIMIZED'
  | 'FACE_MISSING'
  | 'MULTIPLE_FACES'
  | 'PHONE_DETECTED'
  | 'OBJECT_DETECTED'
  | 'USER_LEFT_FRAME'
  | 'MONITORING_INTERRUPTED'
  | 'DISPLAY_SURFACE_MISMATCH'
  | 'SESSION_STARTED_WITH_PROCTORING'
  | 'SESSION_STARTED_WITHOUT_PROCTORING';

export type ProctoringEventIn = {
  session_id: string;
  event_type: ProctoringEventType;
  severity?: ProctoringSeverity;
  metadata?: Record<string, unknown>;
  client_timestamp?: string;
};

export type PracticeSessionProctoringEventIn = {
  session_id: string;
  event_type: PracticeSessionProctoringEventType;
  metadata?: Record<string, unknown>;
  client_timestamp?: string;
};

export type PracticeSessionProctoringHeartbeatIn = {
  session_id: string;
  camera_active: boolean;
  screen_active: boolean;
  tab_active: boolean;
  window_focused: boolean;
  detection_active: boolean;
  display_surface?: string | null;
  client_timestamp?: string;
};

export type PracticeProctoringAction = 'none' | 'warn' | 'terminate' | string;

export interface PracticeProctoringRecentEvent {
  event_type?: string;
  timestamp?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PracticeProctoringSnapshot {
  status: string;
  risk_level?: string | null;
  action?: PracticeProctoringAction | null;
  message?: string | null;
  total_violations?: number;
  serious_violations?: number;
  remaining_total_violations?: number | null;
  remaining_serious_violations?: number | null;
  event_counts?: Record<string, number>;
  recent_events?: PracticeProctoringRecentEvent[];
  terminated_reason?: string | null;
  monitoring_metadata?: Record<string, unknown> | null;
  last_heartbeat_at?: string | null;
  heartbeat_stale?: boolean;
}

export type PracticeProctoringApiResult = {
  ok: boolean;
  status: number;
  snapshot?: PracticeProctoringSnapshot | null;
  raw?: unknown;
};

const DEFAULT_SERIOUS_VIOLATION_LIMIT = 3;
const DEFAULT_TOTAL_VIOLATION_LIMIT = 5;

const ACTIONABLE_PROCTORING_EVENT_TYPES = new Set([
  'camera_stopped',
  'device_detected',
  'mobile_phone_detected',
  'monitoring_interrupted',
  'multiple_faces_detected',
  'phone_detected',
  'screen_stopped',
  'tab_switch',
  'window_blur',
  'window_minimized',
]);

const SERIOUS_PROCTORING_EVENT_TYPES = new Set([
  'camera_stopped',
  'device_detected',
  'monitoring_interrupted',
  'multiple_faces_detected',
  'screen_stopped',
]);

function normalizeProctoringEventType(value?: string | null): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'mobile_phone_detected' || normalized === 'phone_detected') return 'device_detected';
  if (normalized === 'window_minimized') return 'window_blur';
  return normalized;
}

function sumMatchingProctoringEventCounts(
  eventCounts: Record<string, number> | undefined,
  matcher: (eventType: string) => boolean
): number {
  if (!eventCounts) return 0;

  let total = 0;
  for (const [rawType, count] of Object.entries(eventCounts)) {
    if (!Number.isFinite(count) || count <= 0) continue;
    if (matcher(normalizeProctoringEventType(rawType))) {
      total += count;
    }
  }

  return total;
}

function countMatchingRecentProctoringEvents(
  recentEvents: PracticeProctoringRecentEvent[] | undefined,
  matcher: (eventType: string) => boolean
): number {
  if (!recentEvents?.length) return 0;

  let total = 0;
  for (const event of recentEvents) {
    const eventType = normalizeProctoringEventType(event.event_type);
    if (eventType && matcher(eventType)) {
      total += 1;
    }
  }

  return total;
}

function inferSeriousViolationCount(options: {
  current?: number;
  remaining?: number;
  eventCounts?: Record<string, number>;
  recentEvents?: PracticeProctoringRecentEvent[];
}): number | undefined {
  if (typeof options.current === 'number' && options.current >= 0) return options.current;

  if (typeof options.remaining === 'number' && options.remaining >= 0) {
    return Math.max(DEFAULT_SERIOUS_VIOLATION_LIMIT - options.remaining, 0);
  }

  const fromEventCounts = sumMatchingProctoringEventCounts(
    options.eventCounts,
    (eventType) => SERIOUS_PROCTORING_EVENT_TYPES.has(eventType)
  );
  if (fromEventCounts > 0) return fromEventCounts;

  const fromRecentEvents = countMatchingRecentProctoringEvents(
    options.recentEvents,
    (eventType) => SERIOUS_PROCTORING_EVENT_TYPES.has(eventType)
  );
  if (fromRecentEvents > 0) return fromRecentEvents;

  return undefined;
}

function inferTotalViolationCount(options: {
  current?: number;
  remaining?: number;
  eventCounts?: Record<string, number>;
  recentEvents?: PracticeProctoringRecentEvent[];
}): number | undefined {
  if (typeof options.current === 'number' && options.current >= 0) return options.current;

  if (typeof options.remaining === 'number' && options.remaining >= 0) {
    return Math.max(DEFAULT_TOTAL_VIOLATION_LIMIT - options.remaining, 0);
  }

  const fromEventCounts = sumMatchingProctoringEventCounts(
    options.eventCounts,
    (eventType) => ACTIONABLE_PROCTORING_EVENT_TYPES.has(eventType)
  );
  if (fromEventCounts > 0) return fromEventCounts;

  const fromRecentEvents = countMatchingRecentProctoringEvents(
    options.recentEvents,
    (eventType) => ACTIONABLE_PROCTORING_EVENT_TYPES.has(eventType)
  );
  if (fromRecentEvents > 0) return fromRecentEvents;

  return undefined;
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return undefined;
}

function asNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function coerceNumberMap(value: unknown): Record<string, number> | undefined {
  const record = asUnknownRecord(value);
  if (!record) return undefined;

  const entries = Object.entries(record)
    .map(([key, raw]) => {
      const n = asNumberOrUndefined(raw);
      return n === undefined ? null : [key, n] as const;
    })
    .filter((entry): entry is readonly [string, number] => entry !== null);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function coerceRecentEvents(value: unknown): PracticeProctoringRecentEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const events = value
    .map((entry) => {
      const record = asUnknownRecord(entry);
      if (!record) return null;

      return {
        ...record,
        event_type: asStringOrNull(record.event_type ?? record.type ?? record.event ?? record.name) ?? undefined,
        timestamp: asStringOrNull(record.timestamp ?? record.created_at ?? record.time) ?? undefined,
        message: asStringOrNull(record.message ?? record.detail ?? record.description) ?? undefined,
      } satisfies PracticeProctoringRecentEvent;
    })
    .filter((entry) => entry !== null);

  return events.length > 0 ? (events as PracticeProctoringRecentEvent[]) : undefined;
}

export function coercePracticeProctoringSnapshot(raw: unknown): PracticeProctoringSnapshot | null {
  const root = asUnknownRecord(raw);
  if (!root) return null;

  const payload =
    asUnknownRecord(root.proctoring) ??
    asUnknownRecord(root.proctoring_status) ??
    asUnknownRecord(root.snapshot) ??
    asUnknownRecord(root.status_snapshot) ??
    asUnknownRecord(root.data) ??
    root;

  const remaining =
    asUnknownRecord(payload.remaining) ??
    asUnknownRecord(payload.remaining_counts) ??
    null;

  const status = asStringOrNull(payload.status ?? payload.state) ?? undefined;
  const riskLevel = asStringOrNull(payload.risk_level ?? payload.risk) ?? undefined;
  const action = asStringOrNull(payload.action) ?? undefined;
  const message = asStringOrNull(payload.message ?? payload.detail ?? payload.description) ?? undefined;
  const totalViolations = asNumberOrUndefined(payload.total_violations ?? payload.violation_count ?? payload.total_count);
  const seriousViolations = asNumberOrUndefined(payload.serious_violations ?? payload.serious_count);
  const remainingTotal = asNumberOrUndefined(
    payload.remaining_total_violations ?? remaining?.total_violations ?? remaining?.total
  );
  const remainingSerious = asNumberOrUndefined(
    payload.remaining_serious_violations ?? remaining?.serious_violations ?? remaining?.serious
  );
  const terminatedReason = asStringOrNull(
    payload.terminated_reason ?? payload.termination_reason ?? payload.reason
  );
  const lastHeartbeatAt = asStringOrNull(payload.last_heartbeat_at ?? payload.heartbeat_at ?? payload.last_heartbeat);
  const heartbeatStale = typeof payload.heartbeat_stale === 'boolean' ? payload.heartbeat_stale : undefined;
  const eventCounts = coerceNumberMap(payload.event_counts ?? payload.counts);
  const recentEvents = coerceRecentEvents(payload.recent_events ?? payload.events);
  const monitoringMetadata =
    asUnknownRecord(payload.monitoring_metadata) ??
    asUnknownRecord(payload.metadata) ??
    undefined;
  const inferredSeriousViolations = inferSeriousViolationCount({
    current: seriousViolations,
    remaining: remainingSerious,
    eventCounts,
    recentEvents,
  });
  const inferredTotalViolations = inferTotalViolationCount({
    current: totalViolations,
    remaining: remainingTotal,
    eventCounts,
    recentEvents,
  });

  if (
    !status &&
    !riskLevel &&
    !action &&
    !message &&
    totalViolations === undefined &&
    seriousViolations === undefined &&
    remainingTotal === undefined &&
    remainingSerious === undefined &&
    !terminatedReason &&
    !eventCounts &&
    !recentEvents &&
    !monitoringMetadata &&
    !lastHeartbeatAt &&
    heartbeatStale === undefined
  ) {
    return null;
  }

  return {
    status: status ?? 'unknown',
    risk_level: riskLevel,
    action: action ?? undefined,
    message: message,
    total_violations: inferredTotalViolations,
    serious_violations: inferredSeriousViolations,
    remaining_total_violations: remainingTotal,
    remaining_serious_violations: remainingSerious,
    event_counts: eventCounts,
    recent_events: recentEvents,
    terminated_reason: terminatedReason,
    monitoring_metadata: monitoringMetadata ?? null,
    last_heartbeat_at: lastHeartbeatAt,
    heartbeat_stale: heartbeatStale,
  };
}

async function parsePracticeProctoringApiResult(res: Response): Promise<PracticeProctoringApiResult> {
  const raw = await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    snapshot: coercePracticeProctoringSnapshot(raw),
    raw,
  };
}

/**
 * Best-effort proctoring event ingest.
 *
 * Privacy model:
 * - No video/audio blobs are ever uploaded.
 * - Event-only timeline signals tied to an existing practice session.
 */
export async function postPracticeProctoringEvent(
  payload: ProctoringEventIn
): Promise<PracticeProctoringApiResult> {
  if (!payload?.session_id) throw new Error('session_id is required');
  if (!payload?.event_type) throw new Error('event_type is required');

  const body = {
    session_id: payload.session_id,
    event_type: payload.event_type,
    severity: payload.severity ?? 'info',
    metadata: payload.metadata ?? {},
    client_timestamp: payload.client_timestamp ?? new Date().toISOString(),
  };

  const res = await strataxFetch(`${API_BASE_URL}/api/practice/proctoring/event`, {
    method: 'POST',
    body: JSON.stringify(body),
    throwOnError: false,
  });

  return await parsePracticeProctoringApiResult(res);
}

/**
 * Best-effort proctoring event ingest (session-scoped).
 * Backend endpoint: POST /api/practice/session/{session_id}/proctoring/event
 */
export async function postPracticeSessionProctoringEvent(
  payload: PracticeSessionProctoringEventIn
): Promise<PracticeProctoringApiResult> {
  if (!payload?.session_id) throw new Error('session_id is required');
  if (!payload?.event_type) throw new Error('event_type is required');

  const body = {
    event_type: payload.event_type,
    metadata: payload.metadata ?? {},
    client_timestamp: payload.client_timestamp ?? new Date().toISOString(),
  };

  const sid = encodeURIComponent(payload.session_id);
  const res = await strataxFetch(`${API_BASE_URL}/api/practice/session/${sid}/proctoring/event`, {
    method: 'POST',
    body: JSON.stringify(body),
    throwOnError: false,
  });

  return await parsePracticeProctoringApiResult(res);
}

export async function postPracticeSessionProctoringHeartbeat(
  payload: PracticeSessionProctoringHeartbeatIn
): Promise<PracticeProctoringApiResult> {
  if (!payload?.session_id) throw new Error('session_id is required');

  const body = {
    camera_active: !!payload.camera_active,
    screen_active: !!payload.screen_active,
    tab_active: !!payload.tab_active,
    window_focused: !!payload.window_focused,
    detection_active: !!payload.detection_active,
    display_surface: payload.display_surface ?? null,
    client_timestamp: payload.client_timestamp ?? new Date().toISOString(),
  };

  const sid = encodeURIComponent(payload.session_id);
  const res = await strataxFetch(`${API_BASE_URL}/api/practice/session/${sid}/proctoring/heartbeat`, {
    method: 'POST',
    body: JSON.stringify(body),
    throwOnError: false,
  });

  return await parsePracticeProctoringApiResult(res);
}

export async function getPracticeSessionProctoringStatus(
  sessionId: string
): Promise<PracticeProctoringApiResult> {
  if (!sessionId) throw new Error('sessionId is required');

  const sid = encodeURIComponent(sessionId);
  const res = await strataxFetch(`${API_BASE_URL}/api/practice/session/${sid}/proctoring/status`, {
    method: 'GET',
    throwOnError: false,
  });

  return await parsePracticeProctoringApiResult(res);
}

// ============================================================================
// Practice Session Media (uploads)
// ============================================================================

export type PracticeSessionMediaType = 'screen' | 'camera' | 'combined';

export type UploadPracticeSessionMediaResult = {
  media_id?: string | number;
  storage_url?: string;
  [key: string]: unknown;
};

const PRACTICE_MEDIA_UPLOAD_RETRY_LIMIT = 1;
const PRACTICE_MEDIA_UPLOAD_RETRY_DELAY_MS = 900;

export async function uploadPracticeSessionMedia(options: {
  sessionId: string;
  media_type: PracticeSessionMediaType;
  file: Blob;
  filename?: string;
  duration_seconds?: number;
}): Promise<UploadPracticeSessionMediaResult> {
  const { sessionId, media_type, file } = options;
  if (!sessionId) throw new Error('sessionId is required');
  if (!media_type) throw new Error('media_type is required');
  if (!file) throw new Error('file is required');

  const form = new FormData();
  form.append('media_type', media_type);
  if (typeof options.duration_seconds === 'number' && Number.isFinite(options.duration_seconds)) {
    form.append('duration_seconds', String(Math.max(0, Math.round(options.duration_seconds))));
  }
  form.append('file', file, options.filename ?? `${media_type}.webm`);

  const sid = encodeURIComponent(sessionId);

  for (let attempt = 0; attempt <= PRACTICE_MEDIA_UPLOAD_RETRY_LIMIT; attempt += 1) {
    const res = await strataxFetch(`${API_BASE_URL}/api/practice/session/${sid}/media`, {
      method: 'POST',
      body: form,
      throwOnError: false,
    });

    if (res.ok) {
      return (await res.json().catch(() => ({}))) as UploadPracticeSessionMediaResult;
    }

    const detail = await res.json().catch(() => null);

    if (res.status === 413 && attempt < PRACTICE_MEDIA_UPLOAD_RETRY_LIMIT) {
      await new Promise((resolve) => setTimeout(resolve, PRACTICE_MEDIA_UPLOAD_RETRY_DELAY_MS));
      continue;
    }

    if (res.status === 413) {
      throw new StrataxApiError(
        'Recording upload was too large to store automatically.',
        {
          status: res.status,
          detail:
            detail ??
            {
              message: 'Recording upload was too large to store automatically.',
              media_type,
              bytes: file.size,
            },
        }
      );
    }

    const errorDetail = detail?.detail ?? detail;
    const message = typeof errorDetail === 'string'
      ? errorDetail
      : errorDetail?.message || `Upload failed: ${res.status}`;

    throw new StrataxApiError(message, { status: res.status, detail: errorDetail });
  }

  throw new StrataxApiError('Recording upload failed unexpectedly.', {
    status: 0,
    detail: { media_type, bytes: file.size },
  });
}

export function getPracticeSessionMediaUrl(sessionId: string, mediaId: string | number): string {
  const sid = encodeURIComponent(sessionId);
  const mid = encodeURIComponent(String(mediaId));
  return `${API_BASE_URL}/api/practice/session/${sid}/media/${mid}`;
}

// ============================================================================
// TypeScript Types
// ============================================================================

// ============================================================================
// Round-Based Interview Types
// ============================================================================

export enum InterviewRound {
  HR_SCREENING = 'hr_screening',
  // Must mirror app/schemas.py InterviewRound. Entry-level round for candidates
  // with no professional experience; the backend recommends it for 0 years and
  // offers it for every domain.
  CAMPUS_PLACEMENT = 'campus_placement',
  TECHNICAL_ROUND_1 = 'technical_round_1',
  TECHNICAL_ROUND_2 = 'technical_round_2',
  SYSTEM_DESIGN = 'system_design',
  BEHAVIORAL = 'behavioral',
  MANAGERIAL = 'managerial',
  MACHINE_LEARNING = 'machine_learning',        // ✅ Fixed: was 'ml_specialist'
  DATA_ENGINEERING = 'data_engineering',
  FRONTEND_SPECIALIST = 'frontend_specialist',
  BACKEND_SPECIALIST = 'backend_specialist',
  DEVOPS = 'devops',                            // ✅ Fixed: was 'devops_sre'
  SECURITY = 'security',
  FULL_INTERVIEW = 'full_interview',
}

export interface RoundConfig {
  round_type: InterviewRound;
  name: string;
  description: string;
  duration_minutes: number;
  question_count: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  focus_areas: string[];
  recommended_for: string[];
  icon: string;
  color: string;
}

export interface AvailableRoundsResponse {
  rounds?: RoundConfig[];  // Backend returns 'rounds'
  all_rounds?: RoundConfig[];  // Alternative field name
  recommended_rounds?: RoundConfig[];
  recommended_round?: RoundConfig | null;
  recommended_sequence?: RoundConfig[] | null;
}

export interface StartRoundRequest {
  round_type: InterviewRound;
  domain: string;                    // ✅ Top-level field (REQUIRED)
  experience_years: number;          // ✅ Top-level field (REQUIRED)
  company_specific?: string;         // Optional
  enable_tts?: boolean;              // Optional
  question_count?: number;           // Optional - Number of questions (1-15, backend default varies by round)
  resume_context?: ResumeContext;    // Optional — parsed resume for claim-based probing

  // Live Practice / Proctoring gate (required by backend)
  screen_shared: boolean;
  camera_enabled: boolean;
}

export interface StartRoundResponse {
  session_id: string;
  round_config: RoundConfig;
  first_question: Question;
  tts_audio_url?: string;
  message: string;
  total_questions: number;
  progress: string;
}

// ============================================================================

export enum QuestionType {
  VOICE = 'VOICE',
  CODING = 'CODING',
  SYSTEM_DESIGN = 'SYSTEM_DESIGN',
}

export interface TestCase {
  input: string;
  expected_output: string;
  is_hidden?: boolean;
}

export interface Question {
  question_text: string;  // Changed from 'text' to 'question_text'
  category: 'behavioral' | 'technical' | 'system_design' | 'problem_solving';
  difficulty: 'easy' | 'medium' | 'hard';
  time_limit: number;
  model_answer?: string;
  rationale?: string;
  round_type?: InterviewRound;  // NEW - Round association

  // ✨ NEW - Coding Question Support
  question_type?: QuestionType;         // Determines UI (voice recorder vs code editor)
  programming_language?: string;        // e.g., "python", "javascript", "java"
  code_template?: string;               // Starter code for coding questions
  test_cases?: TestCase[];              // Input/output validation
  constraints?: string[];               // Time/space complexity requirements
  hints?: string[];                     // Progressive hints for users
  auto_start_recording?: boolean;

  // Legacy field for backward compatibility
  id?: number;
  text?: string;
}

export interface SpeechMetrics {
  filler_count: number;
  wpm: number;
  longest_silence: number;
  confidence_score: number;  // 0-1 range
  overtalked: boolean;
  duration: number;
  filler_words?: string[];
  pause_count?: number;
  pitch_variance?: number;
  silence_removed?: number;  // NEW - Seconds of silence removed by VAD
  // Legacy fields for backward compatibility
  filler_words_used?: string[];
  total_words?: number;
  speaking_duration?: number;
  average_pause_duration?: number;
  significant_pauses?: number;
}

export interface MicroFeedback {
  // Existing fields - Delivery feedback
  delivery_tips: string[];
  pace_feedback: string;
  overall_note: string;
  speech_quality?: string;
  content_relevance?: string;  // Deprecated - use correctness_score
  timestamp?: string;

  // ✨ NEW - Answer Correctness Fields
  correctness_score?: number;              // 0-100 rating
  technical_accuracy?: string;             // Excellent/Good/Fair/Poor
  is_correct?: boolean;                    // true if score >= 70
  key_points_covered?: string[];           // What user got right
  key_points_missed?: string[];            // What user missed
  strengths?: string[];                    // Positive aspects
  improvement_areas?: string[];            // Areas to improve
  actionable_suggestions?: string[];       // Specific next steps
  model_answer?: string | null;            // Model/ideal answer
}

export interface Evaluation {
  overall_score?: number;  // Made optional since it might not always be present
  detailed_feedback?: string;  // Made optional
  // Optional peer benchmark insight (only present when learning is enabled and sample size is sufficient)
  learning_insight?: string | null;
  strengths: {
    items: string[];
  };
  improvements: {
    items: string[];
  };
  metrics_summary: {
    total_fillers: number;
    avg_wpm: number;
    longest_pause: number;
    avg_confidence: number;
    total_duration: number;
    overtalked_count: number;
  };
  action_plan: {
    steps: string[];
  };
  practice_recommendation: string;
  generated_at: string;
  // Legacy fields for backward compatibility
  speech_summary?: {
    average_wpm: number;
    total_filler_count: number;
    average_confidence: number;
  };
  areas_for_improvement?: string[];
}

export type StrategyAction =
  | 'ASK_QUESTION'
  | 'FOLLOW_UP'
  | 'INCREASE_DIFFICULTY'
  | 'DECREASE_DIFFICULTY'
  | 'GIVE_FEEDBACK'
  | 'END_SESSION'
  | (string & {});

export type StrategyCoachingStyle = 'supportive' | 'balanced' | 'challenging' | (string & {});
export type StrategyFollowUpDepth = 'none' | 'light' | 'deep' | (string & {});
export type StrategySource = 'llm' | 'fallback_rules' | 'guardrail' | (string & {});

export interface StrategyDecisionTraceFollowUpBudget {
  used?: number;
  max?: number;
  remaining?: number;
  [key: string]: unknown;
}

export interface StrategyDecisionTrace {
  proposed_action?: string;
  proposed_source?: string;
  final_action?: string;
  final_source?: string;
  guardrail?: unknown;
  overall_score?: number;
  correctness_score?: number;
  transcript_word_count?: number;
  remaining_questions?: number;
  answered_questions?: number;
  current_difficulty?: string;
  last_strategy_action?: string;
  recent_strategy_actions?: string[];
  pressure_mode?: string;
  missed_key_points?: string[];
  follow_up_budget?: StrategyDecisionTraceFollowUpBudget;
  [key: string]: unknown;
}

export interface Strategy {
  action?: StrategyAction;
  reason?: string;
  coaching_style?: StrategyCoachingStyle;
  follow_up_depth?: StrategyFollowUpDepth;
  target_difficulty?: string;
  source?: StrategySource;
  learning_focus?: string[];
  decision_trace?: StrategyDecisionTrace;
  [key: string]: unknown;
}

const EMPTY_SPEECH_METRICS: SpeechMetrics = {
  filler_count: 0,
  wpm: 0,
  longest_silence: 0,
  confidence_score: 0,
  overtalked: false,
  duration: 0,
};

const EMPTY_MICRO_FEEDBACK: MicroFeedback = {
  delivery_tips: [],
  pace_feedback: '',
  overall_note: '',
};

// ============================================================================
// Practice Insights (optional UI surface)
// ============================================================================

export interface PracticeInsightsResponse {
  recommended_focus?: string[];
  overall?: {
    correctness?: number;
    confidence?: number;
    filler?: number;
    wpm?: number;
    [key: string]: unknown;
  };
  by_category?: Record<string, unknown>;
  by_difficulty?: Record<string, unknown>;
  lookback_days?: number;
  lookback_sessions?: number;
  [key: string]: unknown;
}

// ============================================================================
// Feedback Rating (Phase 3)
// ============================================================================

export type PerceivedDifficulty = 'easy' | 'medium' | 'hard';

export interface RatePracticeFeedbackRequest {
  session_id: string;
  question_id: number;
  usefulness_rating: number; // 1-5
  perceived_difficulty?: PerceivedDifficulty;
  comment?: string;
}

export interface RatePracticeFeedbackResponse {
  ok: true;
}

export async function getPracticeInsights(params: { domain: string; lookback_days?: number }): Promise<PracticeInsightsResponse> {
  const domain = params.domain?.trim();
  if (!domain) throw new Error("Domain is required");

  const qs = new URLSearchParams();
  qs.set("domain", domain);
  qs.set("lookback_days", String(params.lookback_days ?? 30));

  return await strataxFetchJson(`${API_BASE_URL}/api/practice/insights?${qs.toString()}`, {
    method: "GET",
  });
}

export async function ratePracticeFeedback(
  payload: RatePracticeFeedbackRequest
): Promise<RatePracticeFeedbackResponse> {
  if (!payload?.session_id) throw new Error('session_id is required');
  if (payload?.question_id === undefined || payload?.question_id === null) throw new Error('question_id is required');
  if (!payload?.usefulness_rating || payload.usefulness_rating < 1 || payload.usefulness_rating > 5) {
    throw new Error('usefulness_rating must be between 1 and 5');
  }

  return await strataxFetchJson(`${API_BASE_URL}/api/practice/interview/rate-feedback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// Post-session outcome: self-reported confidence (Phase 4)
// ============================================================================

export type SubmitSessionConfidenceResult =
  | { ok: true }
  | { ok: false; disabled?: boolean; status?: number };

export async function submitSessionConfidence(
  sessionId: string,
  confidence_1_5: number
): Promise<SubmitSessionConfidenceResult> {
  const sid = sessionId?.trim();
  if (!sid) throw new Error('sessionId is required');
  if (!Number.isFinite(confidence_1_5) || confidence_1_5 < 1 || confidence_1_5 > 5) {
    throw new Error('confidence_1_5 must be between 1 and 5');
  }

  const res = await strataxFetch(
    `${API_BASE_URL}/api/practice/session/${encodeURIComponent(sid)}/outcome/confidence`,
    {
      method: 'POST',
      body: JSON.stringify({ confidence_1_5 }),
      throwOnError: false,
    }
  );

  // Feature flag disabled on backend.
  if (res.status === 404) return { ok: false, disabled: true, status: 404 };

  if (!res.ok) return { ok: false, status: res.status };

  return { ok: true };
}

// ============================================================================
// Code Submission Types (For Coding Questions)
// ============================================================================

export interface SubmitCodeRequest {
  session_id: string;
  question_id: number;
  code: string;
  programming_language: string;
  time_taken?: number;  // seconds
}

export interface CodeTestResult {
  test_case_number: number;
  passed: boolean;
  input: string;
  expected_output: string;
  actual_output: string;
  error_message?: string;
  execution_time_ms?: number;
}

export interface CodeEvaluationFeedback {
  correctness_score: number;        // 0-100
  code_quality_score: number;       // 0-100
  efficiency_score: number;         // 0-100
  overall_score: number;            // Average of above

  // Detailed Analysis
  approach_feedback: string;        // AI analysis of algorithm choice
  code_quality_notes: string[];     // Readability, naming, structure
  time_complexity: string;          // e.g., "O(n log n)"
  space_complexity: string;         // e.g., "O(n)"
  edge_cases_handled: string[];     // What user handled well
  edge_cases_missed: string[];      // What user missed

  // Suggestions
  optimization_suggestions: string[];
  alternative_approaches: string[];
  best_practices_violated: string[];

  // Pass/Fail
  is_correct: boolean;              // All test cases passed + quality threshold met
  test_cases_passed: number;
  test_cases_total: number;
}

export interface SubmitCodeResponse {
  test_results?: CodeTestResult[];
  evaluation?: CodeEvaluationFeedback | null;
  tts_audio_url?: string;           // AI feedback audio
  next_question?: Question;         // If interview continues
  complete?: boolean;               // If interview is done
  evaluation_report?: Evaluation;   // Final report if complete
  progress?: string;                // e.g., "2/5"
  requires_acknowledgment?: boolean;
  current_question_id?: number;
  strategy?: Strategy;
}

function asBooleanOrUndefined(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function coerceStrategyDecisionTraceFollowUpBudget(
  value: unknown
): StrategyDecisionTraceFollowUpBudget | undefined {
  const record = asUnknownRecord(value);
  if (!record) return undefined;

  const used = asNumberOrUndefined(record.used);
  const max = asNumberOrUndefined(record.max);
  const remaining = asNumberOrUndefined(record.remaining);

  if (used === undefined && max === undefined && remaining === undefined) return undefined;

  return {
    ...record,
    used,
    max,
    remaining,
  } satisfies StrategyDecisionTraceFollowUpBudget;
}

function coerceStrategyDecisionTrace(value: unknown): StrategyDecisionTrace | undefined {
  const record = asUnknownRecord(value);
  if (!record) return undefined;

  const trace: StrategyDecisionTrace = {
    ...record,
    proposed_action: asStringOrNull(record.proposed_action ?? record.proposedAction) ?? undefined,
    proposed_source: asStringOrNull(record.proposed_source ?? record.proposedSource) ?? undefined,
    final_action: asStringOrNull(record.final_action ?? record.finalAction) ?? undefined,
    final_source: asStringOrNull(record.final_source ?? record.finalSource) ?? undefined,
    guardrail: record.guardrail,
    overall_score: asNumberOrUndefined(record.overall_score ?? record.overallScore ?? record.score),
    correctness_score: asNumberOrUndefined(record.correctness_score ?? record.correctnessScore),
    transcript_word_count: asNumberOrUndefined(record.transcript_word_count ?? record.transcriptWordCount),
    remaining_questions: asNumberOrUndefined(record.remaining_questions ?? record.remainingQuestions),
    answered_questions: asNumberOrUndefined(record.answered_questions ?? record.answeredQuestions),
    current_difficulty: asStringOrNull(record.current_difficulty ?? record.currentDifficulty) ?? undefined,
    last_strategy_action: asStringOrNull(record.last_strategy_action ?? record.lastStrategyAction) ?? undefined,
    recent_strategy_actions: coerceStringArray(record.recent_strategy_actions ?? record.recentStrategyActions),
    pressure_mode: asStringOrNull(record.pressure_mode ?? record.pressureMode) ?? undefined,
    missed_key_points: coerceStringArray(record.missed_key_points ?? record.missedKeyPoints),
    follow_up_budget: coerceStrategyDecisionTraceFollowUpBudget(
      record.follow_up_budget ?? record.followUpBudget
    ),
  };

  const hasAnySignal =
    trace.proposed_action !== undefined ||
    trace.proposed_source !== undefined ||
    trace.final_action !== undefined ||
    trace.final_source !== undefined ||
    trace.guardrail !== undefined ||
    trace.overall_score !== undefined ||
    trace.correctness_score !== undefined ||
    trace.transcript_word_count !== undefined ||
    trace.remaining_questions !== undefined ||
    trace.answered_questions !== undefined ||
    trace.current_difficulty !== undefined ||
    trace.last_strategy_action !== undefined ||
    (trace.recent_strategy_actions?.length ?? 0) > 0 ||
    trace.pressure_mode !== undefined ||
    (trace.missed_key_points?.length ?? 0) > 0 ||
    trace.follow_up_budget !== undefined;

  return hasAnySignal ? trace : undefined;
}

function coerceStrategy(value: unknown): Strategy | undefined {
  const record = asUnknownRecord(value);
  if (!record) return undefined;

  const strategy: Strategy = {
    ...record,
    action: (asStringOrNull(record.action) ?? undefined) as StrategyAction | undefined,
    reason: asStringOrNull(record.reason ?? record.explanation ?? record.message) ?? undefined,
    coaching_style: (asStringOrNull(record.coaching_style ?? record.coachingStyle) ?? undefined) as
      | StrategyCoachingStyle
      | undefined,
    follow_up_depth: (asStringOrNull(record.follow_up_depth ?? record.followUpDepth) ?? undefined) as
      | StrategyFollowUpDepth
      | undefined,
    target_difficulty: asStringOrNull(record.target_difficulty ?? record.targetDifficulty ?? record.difficulty) ?? undefined,
    source: (asStringOrNull(record.source) ?? undefined) as StrategySource | undefined,
    learning_focus: coerceStringArray(record.learning_focus ?? record.learningFocus),
    decision_trace: coerceStrategyDecisionTrace(record.decision_trace ?? record.decisionTrace),
  };

  const hasAnySignal =
    strategy.action !== undefined ||
    strategy.reason !== undefined ||
    strategy.coaching_style !== undefined ||
    strategy.follow_up_depth !== undefined ||
    strategy.target_difficulty !== undefined ||
    strategy.source !== undefined ||
    (strategy.learning_focus?.length ?? 0) > 0 ||
    strategy.decision_trace !== undefined;

  return hasAnySignal ? strategy : undefined;
}

function coerceCodeTestResults(value: unknown): CodeTestResult[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const results = value
    .map((entry, index) => {
      const record = asUnknownRecord(entry);
      if (!record) return null;

      return {
        test_case_number:
          asNumberOrUndefined(record.test_case_number ?? record.testCaseNumber ?? record.index ?? record.id) ??
          index + 1,
        passed: asBooleanOrUndefined(record.passed ?? record.success ?? record.ok) ?? false,
        input: asStringOrNull(record.input) ?? '',
        expected_output: asStringOrNull(record.expected_output ?? record.expectedOutput ?? record.expected) ?? '',
        actual_output: asStringOrNull(record.actual_output ?? record.actualOutput ?? record.actual) ?? '',
        error_message: asStringOrNull(record.error_message ?? record.errorMessage ?? record.error) ?? undefined,
        execution_time_ms: asNumberOrUndefined(
          record.execution_time_ms ?? record.executionTimeMs ?? record.runtime_ms ?? record.runtimeMs
        ),
      } satisfies CodeTestResult;
    })
    .filter((entry) => entry !== null) as CodeTestResult[];

  return results.length > 0 ? results : undefined;
}

function coerceCodeEvaluationFeedback(value: unknown): CodeEvaluationFeedback | null {
  const record = asUnknownRecord(value);
  if (!record) return null;

  const scores = asUnknownRecord(record.scores) ?? asUnknownRecord(record.score_breakdown) ?? null;
  const complexity = asUnknownRecord(record.complexity) ?? null;

  const correctnessScore = asNumberOrUndefined(
    record.correctness_score ?? scores?.correctness_score ?? scores?.correctness
  );
  const codeQualityScore = asNumberOrUndefined(
    record.code_quality_score ?? scores?.code_quality_score ?? scores?.code_quality ?? scores?.quality
  );
  const efficiencyScore = asNumberOrUndefined(
    record.efficiency_score ?? scores?.efficiency_score ?? scores?.efficiency ?? scores?.performance
  );
  const overallScore = asNumberOrUndefined(
    record.overall_score ?? record.total_score ?? record.score ?? record.overall
  );
  const testCasesPassed = asNumberOrUndefined(
    record.test_cases_passed ?? record.tests_passed ?? record.passed_tests
  );
  const testCasesTotal = asNumberOrUndefined(
    record.test_cases_total ?? record.tests_total ?? record.total_tests
  );

  const hasAnySignal =
    correctnessScore !== undefined ||
    codeQualityScore !== undefined ||
    efficiencyScore !== undefined ||
    overallScore !== undefined ||
    typeof record.approach_feedback === 'string' ||
    typeof record.feedback === 'string' ||
    typeof record.summary === 'string' ||
    testCasesPassed !== undefined ||
    testCasesTotal !== undefined ||
    Array.isArray(record.optimization_suggestions) ||
    Array.isArray(record.code_quality_notes);

  if (!hasAnySignal) return null;

  return {
    correctness_score: correctnessScore ?? 0,
    code_quality_score: codeQualityScore ?? 0,
    efficiency_score: efficiencyScore ?? 0,
    overall_score: overallScore ?? correctnessScore ?? codeQualityScore ?? efficiencyScore ?? 0,
    approach_feedback:
      asStringOrNull(record.approach_feedback ?? record.feedback ?? record.summary ?? record.analysis) ?? '',
    code_quality_notes: coerceStringArray(record.code_quality_notes ?? record.quality_notes),
    time_complexity: asStringOrNull(record.time_complexity ?? complexity?.time) ?? '',
    space_complexity: asStringOrNull(record.space_complexity ?? complexity?.space) ?? '',
    edge_cases_handled: coerceStringArray(record.edge_cases_handled ?? record.handled_edge_cases),
    edge_cases_missed: coerceStringArray(record.edge_cases_missed ?? record.missed_edge_cases),
    optimization_suggestions: coerceStringArray(record.optimization_suggestions ?? record.suggestions),
    alternative_approaches: coerceStringArray(record.alternative_approaches ?? record.alternatives),
    best_practices_violated: coerceStringArray(record.best_practices_violated ?? record.violations),
    is_correct: asBooleanOrUndefined(record.is_correct ?? record.passed ?? record.accepted) ?? false,
    test_cases_passed: testCasesPassed ?? 0,
    test_cases_total: testCasesTotal ?? 0,
  };
}

function normalizeSubmitCodeResponse(raw: unknown): SubmitCodeResponse {
  const root = asUnknownRecord(raw) ?? {};
  const nested =
    asUnknownRecord(root.data) ??
    asUnknownRecord(root.result) ??
    asUnknownRecord(root.payload) ??
    null;
  const source = nested ?? root;

  const testResults =
    coerceCodeTestResults(
      source.test_results ?? source.testResults ?? source.tests ?? source.test_cases ?? source.results
    ) ??
    coerceCodeTestResults(
      root.test_results ?? root.testResults ?? root.tests ?? root.test_cases ?? root.results
    );

  const evaluation =
    coerceCodeEvaluationFeedback(
      source.evaluation ?? source.code_evaluation ?? source.codeEvaluation ?? source.feedback ?? source.code_feedback
    ) ??
    coerceCodeEvaluationFeedback(
      root.evaluation ?? root.code_evaluation ?? root.codeEvaluation ?? root.feedback ?? root.code_feedback
    );

  const nextQuestion = asUnknownRecord(source.next_question ?? root.next_question) as unknown as Question | null;
  const evaluationReport = asUnknownRecord(source.evaluation_report ?? root.evaluation_report) as unknown as Evaluation | null;

  return {
    test_results: testResults ?? [],
    evaluation,
    tts_audio_url: asStringOrNull(source.tts_audio_url ?? root.tts_audio_url) ?? undefined,
    next_question: nextQuestion ?? undefined,
    complete: asBooleanOrUndefined(source.complete ?? root.complete),
    evaluation_report: evaluationReport ?? undefined,
    progress: asStringOrNull(source.progress ?? root.progress) ?? undefined,
    requires_acknowledgment: asBooleanOrUndefined(
      source.requires_acknowledgment ?? root.requires_acknowledgment
    ),
    current_question_id: asNumberOrUndefined(source.current_question_id ?? root.current_question_id),
    strategy: coerceStrategy(source.strategy ?? root.strategy),
  };
}

export interface StartInterviewResponse {
  session_id: string;
  first_question: Question;
  tts_audio_url?: string;
  message: string;
  total_questions: number;  // NEW - Total number of questions in interview
  progress: string;  // NEW - e.g., "1/3", "1/5", "1/10"
}

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

export type Pressure = {
  mode?: 'supportive' | 'balanced' | 'challenging' | (string & {});
  reason?: string;
  [key: string]: unknown;
};

export interface SubmitAnswerResponse {
  transcript: string;
  metrics: SpeechMetrics;
  micro_feedback: MicroFeedback;
  next_question?: Question;  // DEPRECATED - No longer returned, use acknowledgeFeedback()
  tts_audio_url?: string;
  complete?: boolean;
  evaluation_report?: Evaluation;
  progress?: string;  // e.g., "2/5", "3/5"
  requires_acknowledgment?: boolean;  // NEW - If true, user must click "Next Question" button
  current_question_id?: number;
  strategy?: Strategy;

  // Optional runtime extensions
  evaluation_trace?: EvaluationTrace;
  trajectory?: Trajectory;
  pressure?: Pressure;
}

export interface AcknowledgeFeedbackResponse {
  next_question?: Question;
  tts_audio_url?: string;
  progress?: string;  // e.g., "3/5", "4/5"
  complete: boolean;  // If true, no more questions
  evaluation_report?: Evaluation;  // Final evaluation if complete=true
  auto_start_recording?: boolean;
  strategy?: Strategy;

  // Optional runtime extensions
  pressure?: Pressure;
}

function normalizeSubmitAnswerResponse(raw: unknown): SubmitAnswerResponse {
  const root = asUnknownRecord(raw) ?? {};
  const nested =
    asUnknownRecord(root.data) ??
    asUnknownRecord(root.result) ??
    asUnknownRecord(root.payload) ??
    null;
  const source = nested ?? root;

  const transcript = asStringOrNull(source.transcript ?? root.transcript) ?? '';
  const metrics =
    (asUnknownRecord(source.metrics ?? root.metrics) as unknown as SpeechMetrics | null) ??
    EMPTY_SPEECH_METRICS;
  const microFeedback =
    (asUnknownRecord(source.micro_feedback ?? root.micro_feedback) as unknown as MicroFeedback | null) ??
    EMPTY_MICRO_FEEDBACK;

  return {
    transcript,
    metrics,
    micro_feedback: microFeedback,
    next_question: (asUnknownRecord(source.next_question ?? root.next_question) as unknown as Question | null) ?? undefined,
    tts_audio_url: asStringOrNull(source.tts_audio_url ?? root.tts_audio_url) ?? undefined,
    complete: asBooleanOrUndefined(source.complete ?? root.complete),
    evaluation_report:
      (asUnknownRecord(source.evaluation_report ?? root.evaluation_report) as unknown as Evaluation | null) ??
      undefined,
    progress: asStringOrNull(source.progress ?? root.progress) ?? undefined,
    requires_acknowledgment: asBooleanOrUndefined(
      source.requires_acknowledgment ?? root.requires_acknowledgment
    ),
    current_question_id: asNumberOrUndefined(source.current_question_id ?? root.current_question_id),
    strategy: coerceStrategy(source.strategy ?? root.strategy),
    evaluation_trace:
      (asUnknownRecord(source.evaluation_trace ?? root.evaluation_trace) as unknown as EvaluationTrace | null) ??
      undefined,
    trajectory: (asUnknownRecord(source.trajectory ?? root.trajectory) as unknown as Trajectory | null) ?? undefined,
    pressure: (asUnknownRecord(source.pressure ?? root.pressure) as unknown as Pressure | null) ?? undefined,
  };
}

function normalizeAcknowledgeFeedbackResponse(raw: unknown): AcknowledgeFeedbackResponse {
  const root = asUnknownRecord(raw) ?? {};
  const nested =
    asUnknownRecord(root.data) ??
    asUnknownRecord(root.result) ??
    asUnknownRecord(root.payload) ??
    null;
  const source = nested ?? root;

  return {
    next_question:
      (asUnknownRecord(source.next_question ?? root.next_question) as unknown as Question | null) ?? undefined,
    tts_audio_url: asStringOrNull(source.tts_audio_url ?? root.tts_audio_url) ?? undefined,
    progress: asStringOrNull(source.progress ?? root.progress) ?? undefined,
    complete: asBooleanOrUndefined(source.complete ?? root.complete) ?? false,
    evaluation_report:
      (asUnknownRecord(source.evaluation_report ?? root.evaluation_report) as unknown as Evaluation | null) ??
      undefined,
    auto_start_recording: asBooleanOrUndefined(
      source.auto_start_recording ?? root.auto_start_recording
    ),
    strategy: coerceStrategy(source.strategy ?? root.strategy),
    pressure: (asUnknownRecord(source.pressure ?? root.pressure) as unknown as Pressure | null) ?? undefined,
  };
}

export interface PracticeModeStatus {
  enabled: boolean;
  tts_engine: string;
  stt_model: string;
  active_sessions: number;
  tts_info: {
    engine: string;
    initialized: boolean;
    available_engines: string[];
  };
  stt_info: {
    model_size: string;
    device: string;
  };
}

export interface QuickStartResponse {
  ai_message: string;
  ready_to_start: boolean;
  session_id: string;
  first_question: Question;
  tts_audio_url?: string;
  total_questions: number;  // NEW - Total number of questions in interview
  progress: string;  // NEW - e.g., "1/3", "1/5", "1/10"
  inferred_profile?: {
    domain: string;
    experience_years: number;
    difficulty: 'easy' | 'medium' | 'hard';
    question_count: number;
    target_company?: string;
  };
}

export type InterviewRole = 'software_engineer' | 'data_scientist' | 'product_manager';
export type InterviewDifficulty = 'easy' | 'medium' | 'hard';

// NEW - User Profile for Adaptive Intelligence
export interface UserProfile {
  domain: string;  // e.g., 'Python Backend Development'
  experience_years: number;
  skills: string[];  // e.g., ['Python', 'Django', 'AWS', 'Docker']
  job_role?: string;  // e.g., 'Senior Backend Engineer'
  company_preference?: string;  // e.g., 'FAANG'
  interview_focus?: string[];  // e.g., ['System Design', 'API Design']
  target_round?: InterviewRound;  // NEW - Target interview round
}

// ============================================================================
// Audio Recorder Class
// ============================================================================

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;

  async start(): Promise<void> {
    try {
      // Request microphone permission
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Determine the best MIME type available
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();

      // Set up audio analyzer for real-time level detection
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);

      console.log('[AudioRecorder] Recording started with', mimeType);
    } catch (error) {
      console.error('[AudioRecorder] Error starting recording:', error);
      throw error;
    }
  }

  async stop(): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not initialized'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, {
          type: this.mediaRecorder!.mimeType,
        });

        // Stop all tracks
        this.stream?.getTracks().forEach((track) => track.stop());

        console.log('[AudioRecorder] Recording stopped, original blob size:', audioBlob.size, 'type:', audioBlob.type);

        // Convert to WAV format
        try {
          const wavBlob = await this.convertToWav(audioBlob);
          console.log('[AudioRecorder] Converted to WAV, size:', wavBlob.size);
          resolve(wavBlob);
        } catch (error) {
          console.error('[AudioRecorder] WAV conversion failed, using original:', error);
          resolve(audioBlob);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  getAudioLevel(): number {
    if (!this.analyser || !this.dataArray) {
      return 0;
    }

    // @ts-ignore - TypeScript has issues with Uint8Array type compatibility
    this.analyser.getByteFrequencyData(this.dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const average = sum / this.dataArray.length;

    // Normalize to 0-1 range (0-255 -> 0-1)
    return Math.min(average / 128, 1);
  }

  private async convertToWav(blob: Blob): Promise<Blob> {
    // Create new audio context for conversion (separate from analyzer)
    const conversionContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Read blob as array buffer
    const arrayBuffer = await blob.arrayBuffer();

    // Decode audio
    const audioBuffer = await conversionContext.decodeAudioData(arrayBuffer);

    // Convert to WAV
    const wavBuffer = this.audioBufferToWav(audioBuffer);

    // Close the conversion context
    await conversionContext.close();

    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  private audioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const length = audioBuffer.length * numChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, (sampleRate * numChannels * bitDepth) / 8, true);
    view.setUint16(32, (numChannels * bitDepth) / 8, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // Write audio data
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        let sample = Math.max(-1, Math.min(1, channels[channel][i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    return buffer;
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

// ============================================================================
// API Functions
// ============================================================================

export async function checkPracticeModeStatus(): Promise<PracticeModeStatus> {
  return await strataxFetchJson(`${API_BASE_URL}/api/practice/status`, { method: 'GET' });
}

export async function startInterview(
  role: string = 'Software Engineer',
  difficulty: InterviewDifficulty = 'easy',
  enableTTS: boolean = false,
  category?: string,
  userProfile?: UserProfile,  // Optional adaptive intelligence
  questionCount?: number,  // NEW - Number of questions (1-10, default 5)
  proctoringGate?: { screen_shared: boolean; camera_enabled: boolean }
): Promise<StartInterviewResponse> {
  const requestBody: any = {
    difficulty,
    enable_tts: enableTTS,
    screen_shared: !!proctoringGate?.screen_shared,
    camera_enabled: !!proctoringGate?.camera_enabled,
  };

  // Add optional fields
  if (category) {
    requestBody.category = category;
  } else {
    requestBody.category = 'behavioral';  // Default category
  }

  if (questionCount && questionCount >= 1 && questionCount <= 10) {
    requestBody.question_count = questionCount;
  }

  if (userProfile) {
    requestBody.user_profile = userProfile;
  }

  return await strataxFetchJson(`${API_BASE_URL}/api/practice/interview/start`, {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

export async function submitAnswer(
  sessionId: string,
  questionId: number,
  audioBlob: Blob
): Promise<SubmitAnswerResponse> {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  formData.append('question_id', questionId.toString());
  formData.append('audio', audioBlob, 'answer.wav');

  const response = await strataxFetch(`${API_BASE_URL}/api/practice/interview/submit-answer`, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type header - browser sets it automatically with boundary
  });

  const raw = await response.json();
  return normalizeSubmitAnswerResponse(raw);
}

/**
 * Acknowledge feedback and get next question
 * NEW FLOW: Called after user reviews feedback and clicks "Next Question"
 */
export async function acknowledgeFeedback(
  sessionId: string,
  questionId: number
): Promise<AcknowledgeFeedbackResponse> {
  console.log('🔔 [API] Acknowledging feedback for session:', sessionId, 'question:', questionId);

  const requestBody = {
    session_id: sessionId,
    question_id: questionId,
    feedback_read: true,
    sessionId: sessionId,
    questionId: questionId,
    feedbackRead: true,
  };
  console.log('📤 [API] Request body:', JSON.stringify(requestBody));

  let data: any;
  try {
    const response = await strataxFetch(`${API_BASE_URL}/api/practice/interview/acknowledge-feedback`, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    console.log('📡 [API] Acknowledge feedback response status:', response.status, response.statusText);
    data = await response.json();
  } catch (err) {
    console.error('❌ [API] Acknowledge feedback error:', err);

    if (err instanceof StrataxApiError && Array.isArray(err.detail)) {
      // Log the raw validation breakdown for debugging
      const validationErrors = err.detail
        .map((e: any) => `${e.loc?.join('.')}: ${e.msg} (input: ${JSON.stringify(e.input)})`)
        .join('; ');
      console.error('📋 [API] Validation errors:', validationErrors);
      // Throw a clean, user-safe message — never expose field paths or pydantic internals
      throw new Error('Could not process the request. Please try again.');
    }

    throw err;
  }

  console.log('✅ [API] Acknowledge feedback response data:', data);
  console.log('📊 [API] Response structure:', {
    hasNextQuestion: !!data.next_question,
    complete: data.complete,
    progress: data.progress,
    questionText: data.next_question?.question_text?.substring(0, 50),
  });

  return normalizeAcknowledgeFeedbackResponse(data);
}

/**
 * Submit code for evaluation (for CODING question types)
 * Backend evaluates code against test cases and provides AI feedback
 */
export async function submitCode(
  sessionId: string,
  questionId: number,
  code: string,
  programmingLanguage: string,
  timeTaken?: number
): Promise<SubmitCodeResponse> {
  console.log('💻 [API] Submitting code for session:', sessionId, 'question:', questionId);
  console.log('📝 [API] Code length:', code.length, 'Language:', programmingLanguage);

  const requestBody: SubmitCodeRequest = {
    session_id: sessionId,
    question_id: questionId,
    code: code,
    programming_language: programmingLanguage,
    time_taken: timeTaken,
  };

  const safeReadJson = async (res: Response): Promise<any> => {
    return await res.json().catch(() => null);
  };

  const endpoints = [
    `${API_BASE_URL}/api/practice/interview/submit-code`,
    `${API_BASE_URL}/api/practice/interview/submit_code`,
  ];

  let last404 = false;
  for (const url of endpoints) {
    const response = await strataxFetch(url, {
      method: 'POST',
      body: JSON.stringify(requestBody),
      throwOnError: false,
    });

    console.log('📡 [API] Submit code response status:', response.status, response.statusText);

    if (response.ok) {
      const raw = await response.json().catch(() => null);
      const data = normalizeSubmitCodeResponse(raw);
      console.log('✅ [API] Code submission response:', {
        testsPassed: data.test_results?.filter((t: CodeTestResult) => t.passed).length,
        testsTotal: data.test_results?.length,
        overallScore: data.evaluation?.overall_score,
        isCorrect: data.evaluation?.is_correct,
        complete: data.complete,
      });
      return data;
    }

    if (response.status === 404) {
      last404 = true;
      continue;
    }

    const body = await safeReadJson(response);
    const detail = body?.detail ?? body;
    const message = typeof detail === 'string' ? detail : detail?.message || `Request failed (${response.status})`;
    throw new Error(`Code submission failed: ${message}`);
  }

  if (last404) {
    throw new Error(
      'Coding submission endpoint not found (404). Backend must implement POST /api/practice/interview/submit-code (or /submit_code) to support coding questions.'
    );
  }

  throw new Error('Code submission failed: unexpected error');
}

export function getAudioUrl(audioPath: string): string {
  return `${API_BASE_URL}/api/practice/audio/${audioPath}`;
}

export async function playQuestionAudio(audioPath: string): Promise<HTMLAudioElement> {
  const audioUrl = getAudioUrl(audioPath);
  const audio = new Audio(audioUrl);
  await audio.play();
  return audio;
}

export async function getSessionDetails(sessionId: string): Promise<any> {
  return await strataxFetchJson(`${API_BASE_URL}/api/practice/session/${sessionId}`, { method: 'GET' });
}

export async function getSessionEvaluation(sessionId: string): Promise<any> {
  console.log(`🔍 [Diagnostic] Fetching evaluation for session: ${sessionId}`);

  const data = await strataxFetchJson(`${API_BASE_URL}/api/practice/session/${sessionId}/evaluation`, { method: 'GET' });
  console.log('✅ [Diagnostic] Evaluation response:', data);
  return data;
}

export async function quickStartInterview(
  voiceInput: string,
  autoMode: boolean = true,
  enableTTS: boolean = true,
  questionCount?: number,
  targetCompany?: string,
  targetRound?: InterviewRound,
  proctoringGate?: { screen_shared: boolean; camera_enabled: boolean },
  resumeContext?: ResumeContext | null
): Promise<QuickStartResponse> {
  const requestBody: any = {
    voice_input: voiceInput,
    auto_mode: autoMode,
    enable_tts: enableTTS,
    screen_shared: !!proctoringGate?.screen_shared,
    camera_enabled: !!proctoringGate?.camera_enabled,
  };

  // Add optional parameters if provided
  if (questionCount !== undefined && questionCount >= 1 && questionCount <= 10) {
    requestBody.question_count = questionCount;
  }

  if (targetCompany) {
    requestBody.target_company = targetCompany;
  }

  if (targetRound) {
    requestBody.target_round = targetRound;
  }

  if (resumeContext) {
    requestBody.resume_context = resumeContext;
  }

  return await strataxFetchJson(`${API_BASE_URL}/api/practice/interview/quick-start`, {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });
}

/**
 * Get available interview rounds with recommendations
 */
export async function getAvailableRounds(
  experienceYears?: number,
  domain?: string
): Promise<AvailableRoundsResponse> {
  const params = new URLSearchParams();
  if (experienceYears !== undefined) {
    params.append('experience_years', experienceYears.toString());
  }
  if (domain) {
    params.append('domain', domain);
  }

  const url = `${API_BASE_URL}/api/practice/rounds/available${params.toString() ? '?' + params.toString() : ''}`;
  console.log('🌐 [API] Fetching rounds from:', url);
  console.log('📊 [API] Parameters:', { experienceYears, domain });

  const data = await strataxFetchJson<AvailableRoundsResponse>(url, { method: 'GET' });
  console.log('📡 [API] Response status: 200 OK');
  console.log('✅ [API] Response data:', data);
  return data;
}

/**
 * Start round-based interview
 */
export async function startRoundInterview(
  request: StartRoundRequest
): Promise<StartRoundResponse> {
  console.log('🚀 [API] Starting round interview:', request);

  const data = await strataxFetchJson<StartRoundResponse>(`${API_BASE_URL}/api/practice/interview/start-round`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  console.log('✅ [API] Start round response:', data);
  return data;
}

/**
 * A generated question card, handed to Practice Mode to be practised.
 *
 * Mirrors what the copilot returns under `ui_action: "render_question_cards"`,
 * so a card passes through without reshaping.
 */
export interface DrillQuestionPayload {
  question: string;
  answer?: string | null;
  topic?: string | null;
  difficulty?: 'easy' | 'medium' | 'hard' | null;
  key_concepts?: string[];
}

/**
 * Start a one-question unproctored drill.
 *
 * Deliberately not under `/api/practice/interview/`: the backend buckets that
 * prefix into the demo `practice_rounds` quota, which allows a guest exactly one,
 * so a drill placed there would burn the graded round they came to do.
 *
 * No screen share or camera — a drill captures neither.
 */
export async function startDrill(
  question: DrillQuestionPayload,
  timeLimit = 180
): Promise<StartInterviewResponse> {
  console.log('🎯 [API] Starting drill:', question.question.slice(0, 80));

  const data = await strataxFetchJson<StartInterviewResponse>(
    `${API_BASE_URL}/api/practice/drill/start`,
    {
      method: 'POST',
      body: JSON.stringify({ question, time_limit: timeLimit }),
    }
  );
  console.log('✅ [API] Drill started:', data.session_id);
  return data;
}

/**
 * End a practice interview session early.
 * Returns evaluations for answered questions and skipped questions list.
 */
export interface EndPracticeSessionResponse {
  status: string;
  ended_early?: boolean;
  questions_answered?: number;
  questions_skipped?: number;
  total_questions?: number;
  evaluations?: Array<{
    question_number: number;
    question: string;
    user_answer?: string;
    model_answer?: string;
    correctness_score?: number;
    technical_accuracy?: string;
    strengths?: string[];
    improvement_areas?: string[];
    speech_metrics?: {
      wpm?: number;
      filler_count?: number;
      confidence_score?: number;
      duration?: number;
    };
  }>;
  skipped_questions?: Array<{
    question_number: number;
    question: string;
    category?: string;
  }>;
  evaluation_report?: {
    strengths?: { items: string[] };
    improvements?: { items: string[] };
    metrics_summary?: {
      total_fillers?: number;
      avg_wpm?: number;
      longest_pause?: number;
      avg_confidence?: number;
      total_duration?: number;
    };
    action_plan?: { steps: string[] };
    practice_recommendation?: string;
  };
}

export async function endPracticeSession(sessionId: string): Promise<EndPracticeSessionResponse> {
  const formData = new FormData();
  formData.append('session_id', sessionId);

  const res = await strataxFetch(`${API_BASE_URL}/api/practice/interview/end-session`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`End practice session failed: ${res.status}`);
  return res.json();
}

// ============================================================================
// Resume Upload
// ============================================================================

/**
 * Upload and parse a resume file for Practice Mode.
 * Accepts .txt, .md, .pdf, .docx (max 5 MB).
 * Returns structured resume context for claim-based probing.
 */
export async function uploadResumeForPractice(
  file: File
): Promise<ResumeUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await strataxFetch(`${API_BASE_URL}/api/practice/upload-resume`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Upload failed: ${res.status}`);
  }

  return res.json();
}
