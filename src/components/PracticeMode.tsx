import { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { InterviewCodeEditor } from './InterviewCodeEditor';
import InstantScoreBreakdown from './InstantScoreBreakdown';
import {
  AudioRecorder,
  startInterview,
  submitAnswer,
  submitCode,
  acknowledgeFeedback,
  ratePracticeFeedback,
  playQuestionAudio,
  checkPracticeModeStatus,
  quickStartInterview,
  startDrill,
  getSessionEvaluation,
  getPracticeInsights,
  type PracticeInsightsResponse,
  type StartInterviewResponse,
  type SubmitAnswerResponse,
  type SubmitCodeResponse,
  type AcknowledgeFeedbackResponse,
  type InterviewRole,
  type InterviewDifficulty,
  type UserProfile,
  type Evaluation,
  type SpeechMetrics,
  type MicroFeedback,
  type EvaluationTrace,
  type Trajectory,
  type Pressure,
  type Strategy,
  type QuickStartResponse,
  type Question,
  type QuestionType,
  type CodeTestResult,
  type CodeEvaluationFeedback,
  type PerceivedDifficulty,
  QuestionType as QuestionTypeEnum,
  API_BASE_URL,
  submitSessionConfidence,
  uploadPracticeSessionMedia,
  postPracticeSessionProctoringEvent,
  endPracticeSession,
  type EndPracticeSessionResponse,
  type PracticeProctoringRecentEvent,
  type PracticeProctoringSnapshot,
  type PracticeSessionProctoringEventType,
} from '@/lib/practiceModeApi';
import { startPracticeProctoring } from '@/lib/practiceProctoring';
import {
  Mic,
  MicOff,
  Play,
  Volume2,
  VolumeX,
  Loader2,
  CheckCircle2,
  TrendingUp,
  Award,
  Target,
  Clock,
  MessageSquare,
  Zap,
  BarChart3,
  Brain,
  Sparkles,
  ArrowRight,
  ChevronLeft,
  ChevronDown,
  RotateCcw,
  AlertCircle,
  Trophy,
  Star,
  Flame,
  Camera,
  Shield,
  Settings,
  Download,
  FileText,
  Eye,
  Layers,
  Activity,
  Gauge,
  CircleDot,
  Lightbulb,
  GraduationCap,
  Rocket,
  Timer,
  Radio,
  ShieldAlert,
  OctagonAlert,
  TriangleAlert,
  Cpu,
  ListChecks,
  ChevronRight,
  Bot,
  Waves,
  Hourglass,
  CircleX,
  SquareCode,
  Command,
  Fingerprint,
  Briefcase,
  Compass,
  Minus,
  ChevronUp,
} from 'lucide-react';
import RoundSelection from './RoundSelection';
import {
  Panel,
  PanelHead,
  PanelBody,
  Seam,
  Eyebrow,
  Chip,
  StatusDot,
  PxButton,
  Grid,
  StatTile,
  Meter,
  MeterRow,
  Ticks,
  Dial,
  Rows,
  Row,
  FindingList,
  EmptyState,
} from './practice/PracticeKit';
import { toneColor, toneVar, cx, type PxTone } from './practice/tones';
import ResumeUpload from './ResumeUpload';
import { loadSavedResumeContext } from '@/lib/resumeContextStorage';
import type { ResumeContext } from '../types/resume';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { RoundConfig } from '@/lib/practiceModeApi';
import { StrataxApiError } from '@/lib/strataxClient';

type PracticePhase = 'welcome' | 'setup' | 'round-selection' | 'question' | 'recording' | 'processing' | 'feedback' | 'complete';

type FeedbackRatingDraft = {
  usefulnessRating?: number;
  perceivedDifficulty?: PerceivedDifficulty;
  comment?: string;
};

type PendingQuestionAudio = {
  questionKey: string;
  ttsAudioUrl: string;
};

type GuestGateBanner =
  | { kind: 'limit'; message?: string; demo_remaining?: Record<string, unknown> }
  | { kind: 'unavailable'; message?: string }
  | null;

type SessionConfidenceStoredState = {
  value?: number;
  skipped?: boolean;
  disabled?: boolean;
  updatedAt?: number;
};

type ProctoringOverlayState = {
  tone: 'warning' | 'final-warning' | 'terminate';
  title: string;
  description: string;
  presentation: 'banner' | 'modal';
  supportingText?: string;
  reasonItems?: string[];
};

type ProctoringEndSummary = {
  title: string;
  description: string;
  items: string[];
};

const PROCTORING_WARNING_DURATION_MS = 3200;
const PROCTORING_BADGE_MIN_VISIBLE_MS = 2500;
const PROCTORING_BADGE_AUTO_COLLAPSE_MS = 4500;
const PROCTORING_BADGE_DEBOUNCE_MS = 1500;

const QUIET_PROCTORING_RISK_LEVELS = new Set(['', 'none', 'low', 'normal', 'active', 'ok', 'safe', 'good', 'clear']);
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

const normalizeProctoringToken = (value?: string | null): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizeProctoringEventType = (value?: string | null): string => {
  const normalized = normalizeProctoringToken(value);
  if (normalized === 'mobile_phone_detected' || normalized === 'phone_detected') return 'device_detected';
  if (normalized === 'window_minimized') return 'window_blur';
  return normalized;
};

const getProctoringEventLabel = (eventType: string): string => {
  if (eventType.includes('phone') || eventType.includes('device')) return 'Phone detected';
  if (eventType === 'multiple_faces_detected') return 'Multiple people detected';
  if (eventType === 'tab_switch') return 'Tab switch detected';
  if (eventType === 'window_blur' || eventType === 'window_minimized') return 'Interview window left';
  if (eventType === 'monitoring_interrupted') return 'Monitoring interrupted';
  if (eventType === 'camera_stopped') return 'Camera stopped';
  if (eventType === 'screen_stopped') return 'Screen sharing stopped';

  return 'Proctoring warning';
};

const getLatestProctoringEvent = (
  snapshot?: PracticeProctoringSnapshot | null
): PracticeProctoringRecentEvent | null => snapshot?.recent_events?.[0] ?? null;

const getProctoringEventMetadataText = (event?: PracticeProctoringRecentEvent | null): string => {
  if (!event?.metadata) return '';

  const candidates = [
    event.metadata.message,
    event.metadata.detail,
    event.metadata.reason,
    event.metadata.description,
    event.metadata.event_detail,
    event.metadata.violation_reason,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  if (typeof event.metadata.face_count === 'number' && event.metadata.face_count > 1) {
    return `${event.metadata.face_count} faces detected in frame.`;
  }

  return '';
};

const getProctoringEventTitle = (event?: PracticeProctoringRecentEvent | null): string => {
  return getProctoringEventLabel(normalizeProctoringEventType(event?.event_type));
};

const getProctoringEventDescription = (event?: PracticeProctoringRecentEvent | null): string => {
  if (!event) return '';

  if (typeof event.message === 'string' && event.message.trim()) return event.message.trim();

  const metadataText = getProctoringEventMetadataText(event);
  if (metadataText) return metadataText;

  const eventType = normalizeProctoringToken(event.event_type);
  switch (eventType) {
    case 'multiple_faces_detected':
      return 'More than one person was detected on camera. Make sure only you are visible in frame.';
    case 'tab_switch':
      return 'You switched away from the interview tab. Keep the interview tab in focus.';
    case 'window_blur':
    case 'window_minimized':
      return 'The interview window lost focus. Keep the interview window active.';
    case 'monitoring_interrupted':
      return 'Monitoring was interrupted. Keep camera and screen sharing active.';
    case 'camera_stopped':
      return 'Your camera stopped streaming. Re-enable the camera to continue safely.';
    case 'screen_stopped':
      return 'Screen sharing stopped. Resume sharing to continue the interview.';
    default:
      if (eventType.includes('phone') || eventType.includes('device')) {
        return 'A phone or secondary device was detected. Keep other devices out of view during the interview.';
      }
      return 'A proctoring warning was issued. Keep the interview window, camera, and screen share active.';
  }
};

const isEscalatedProctoringRisk = (riskLevel?: string | null): boolean => {
  const normalized = normalizeProctoringToken(riskLevel);
  if (!normalized) return false;
  return !QUIET_PROCTORING_RISK_LEVELS.has(normalized);
};

const isActionableProctoringEvent = (event?: PracticeProctoringRecentEvent | null): boolean => {
  const eventType = normalizeProctoringEventType(event?.event_type);
  return !!eventType && ACTIONABLE_PROCTORING_EVENT_TYPES.has(eventType);
};

const isSeriousProctoringEvent = (event?: PracticeProctoringRecentEvent | null): boolean => {
  const eventType = normalizeProctoringEventType(event?.event_type);
  return !!eventType && SERIOUS_PROCTORING_EVENT_TYPES.has(eventType);
};

const formatCountLabel = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;

const formatProctoringReasonItem = (eventType: string, count: number): string => {
  const normalized = normalizeProctoringEventType(eventType);

  switch (normalized) {
    case 'multiple_faces_detected':
      return `${formatCountLabel(count, 'multiple-person detection')} in camera view`;
    case 'device_detected':
      return formatCountLabel(count, 'device detection');
    case 'monitoring_interrupted':
      return formatCountLabel(count, 'monitoring interruption');
    case 'camera_stopped':
      return formatCountLabel(count, 'camera interruption');
    case 'screen_stopped':
      return formatCountLabel(count, 'screen-share interruption');
    case 'tab_switch':
      return formatCountLabel(count, 'tab switch', 'tab switches');
    case 'window_blur':
      return formatCountLabel(count, 'focus loss', 'focus losses');
    default:
      return `${formatCountLabel(count, 'proctoring alert')} (${getProctoringEventLabel(normalized).toLowerCase()})`;
  }
};

const getProctoringReasonItems = (snapshot?: PracticeProctoringSnapshot | null): string[] => {
  if (!snapshot) return [];

  const items: string[] = [];
  const seriousViolations = snapshot.serious_violations ?? 0;
  const totalViolations = snapshot.total_violations ?? 0;

  const mergedCounts = new Map<string, number>();
  for (const [rawType, rawCount] of Object.entries(snapshot.event_counts ?? {})) {
    if (typeof rawCount !== 'number' || rawCount <= 0) continue;
    const normalized = normalizeProctoringEventType(rawType);
    mergedCounts.set(normalized, (mergedCounts.get(normalized) ?? 0) + rawCount);
  }

  const countItems = [...mergedCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([eventType, count]) => formatProctoringReasonItem(eventType, count));

  for (const item of countItems) {
    if (!items.includes(item)) items.push(item);
  }

  if (seriousViolations > 0) {
    const summaryItem = `${formatCountLabel(seriousViolations, 'serious violation')} recorded`;
    if (!items.includes(summaryItem)) items.push(summaryItem);
  }

  if (items.length === 0 && totalViolations > 0) {
    items.push(`${formatCountLabel(totalViolations, 'total violation')} recorded`);
  }

  if (items.length === 0) {
    const latestEvent = getLatestProctoringEvent(snapshot);
    if (latestEvent) {
      items.push(getProctoringEventDescription(latestEvent) || getProctoringEventTitle(latestEvent));
    }
  }

  return items.slice(0, 3);
};

const isFinalWarningProctoringSnapshot = (snapshot?: PracticeProctoringSnapshot | null): boolean => {
  if (!snapshot) return false;
  if (snapshot.action === 'terminate' || snapshot.status === 'terminated') return false;

  const remainingSerious = snapshot.remaining_serious_violations;
  if (typeof remainingSerious === 'number' && remainingSerious <= 1) return true;

  const remainingTotal = snapshot.remaining_total_violations;
  return typeof remainingTotal === 'number' && remainingTotal <= 1;
};

const getProctoringEscalationText = (snapshot?: PracticeProctoringSnapshot | null): string => {
  if (!snapshot) return 'Correct the issue now to avoid escalation.';

  const remainingSerious = snapshot.remaining_serious_violations;
  if (typeof remainingSerious === 'number') {
    if (remainingSerious <= 0) return 'Any additional serious violation may end this interview immediately.';
    if (remainingSerious === 1) return 'Final warning. One more serious violation will end this interview.';
    return `${remainingSerious} serious violations remaining before termination.`;
  }

  const remainingTotal = snapshot.remaining_total_violations;
  if (typeof remainingTotal === 'number') {
    if (remainingTotal <= 0) return 'Any additional violation may end this interview immediately.';
    if (remainingTotal === 1) return 'Final warning. One more violation may end this interview.';
    return `${remainingTotal} violations remaining before termination.`;
  }

  return 'Correct the issue now to avoid escalation.';
};

const buildProctoringEndSummary = (snapshot?: PracticeProctoringSnapshot | null): ProctoringEndSummary => ({
  title: 'Why the session ended',
  description:
    snapshot?.message ||
    snapshot?.terminated_reason ||
    'The interview ended because the monitoring policy detected repeated integrity violations.',
  items: getProctoringReasonItems(snapshot),
});

const STRATEGY_ACTION_LABELS: Record<string, string> = {
  ASK_QUESTION: 'Next question',
  FOLLOW_UP: 'Follow-up',
  INCREASE_DIFFICULTY: 'Harder next',
  DECREASE_DIFFICULTY: 'Easier next',
  GIVE_FEEDBACK: 'Feedback',
  END_SESSION: 'Wrap up',
};

const formatStrategyTokenLabel = (value?: string | null): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;

  return value
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
};

const asQuestionStateRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const getQuestionStateKeyText = (question: unknown): string => {
  const questionRecord = asQuestionStateRecord(question);
  if (!questionRecord) return '';

  const candidates = [
    questionRecord.question_text,
    questionRecord.text,
    questionRecord.question,
    questionRecord.prompt,
    questionRecord.questionText,
    questionRecord.question_prompt,
    questionRecord.prompt_text,
    questionRecord.body,
    questionRecord.statement,
    questionRecord.content,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/\s+/g, ' ').slice(0, 180);
    }
  }

  return '';
};

const buildPracticeQuestionStateKey = (
  question: unknown,
  sessionId: string | null | undefined,
  fallbackQuestionNumber: number,
): string => {
  const questionRecord = asQuestionStateRecord(question);
  const questionId = typeof questionRecord?.id === 'number' ? questionRecord.id : fallbackQuestionNumber;
  const difficulty = typeof questionRecord?.difficulty === 'string' ? questionRecord.difficulty.trim() : '';
  const timeLimit = typeof questionRecord?.time_limit === 'number' && Number.isFinite(questionRecord.time_limit)
    ? String(questionRecord.time_limit)
    : '';
  const questionType = typeof questionRecord?.question_type === 'string' ? questionRecord.question_type.trim() : '';
  const promptText = getQuestionStateKeyText(questionRecord);

  return `${sessionId ?? 'no-session'}:${questionId}:${difficulty}:${timeLimit}:${questionType}:${promptText}`;
};

const PRACTICE_STRATEGY_DEBUG_STORAGE_KEY = 'practice_strategy_debug';
/**
 * Camera constraints for the proctoring preview.
 *
 * This was a bare `{ video: true }`, which lets the browser pick -- and it
 * often picks a low or variable frame rate, or a resolution far larger than a
 * 13rem preview needs, both of which read as a choppy feed. Asking for a
 * modest size at a steady 30fps is cheaper *and* smoother, and `ideal` keeps
 * it a hint so a webcam that cannot honour it still opens.
 */
const PRACTICE_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 30, min: 15 },
    facingMode: 'user',
  },
  audio: false,
};

const FACE_PREVIEW_COLLAPSED_KEY = 'practice_face_preview_collapsed';
const FACE_PREVIEW_POS_KEY = 'practice_face_preview_pos';

const PRACTICE_PROGRESS_REFRESH_HINT_STORAGE_KEY = 'practice_progress_refresh_hint';
const PRACTICE_PROGRESS_REFRESH_EVENT = 'practice:session-complete';

const persistPracticeProgressRefreshHint = (sessionId?: string | null) => {
  if (typeof window === 'undefined') return;

  const detail = {
    sessionId: sessionId ?? null,
    completedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(PRACTICE_PROGRESS_REFRESH_HINT_STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // Ignore storage failures.
  }

  try {
    window.dispatchEvent(new CustomEvent(PRACTICE_PROGRESS_REFRESH_EVENT, { detail }));
  } catch {
    // Ignore event dispatch failures.
  }
};

const readPracticeStrategyDebugMode = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    const queryValue = params.get('practiceDebug') ?? params.get('strategyDebug');
    if (queryValue === '1' || queryValue === 'true') return true;
  } catch {
    // ignore
  }

  try {
    return window.localStorage.getItem(PRACTICE_STRATEGY_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const getStrategyActionLabel = (action?: string | null): string => {
  if (typeof action === 'string' && STRATEGY_ACTION_LABELS[action]) {
    return STRATEGY_ACTION_LABELS[action];
  }

  return formatStrategyTokenLabel(action) ?? 'Next step';
};

const getStrategyBadgeLabel = (strategy?: Strategy | null): string | null => {
  switch (strategy?.action) {
    case 'FOLLOW_UP':
      return 'Going deeper';
    case 'INCREASE_DIFFICULTY':
    case 'DECREASE_DIFFICULTY':
      return 'Adjusting difficulty';
    case 'ASK_QUESTION':
      return 'Next question';
    case 'END_SESSION':
      return 'Wrapping up';
    case 'GIVE_FEEDBACK':
      return 'Feedback';
    default:
      return null;
  }
};

const getStrategyHeadline = (strategy?: Strategy | null, fallback = 'Here’s what comes next.'): string => {
  switch (strategy?.action) {
    case 'FOLLOW_UP':
      return strategy.follow_up_depth === 'deep'
        ? 'Let’s dig deeper on this.'
        : 'Let’s go a bit deeper on this.';
    case 'INCREASE_DIFFICULTY':
      return 'You handled that well. Let’s push a little further.';
    case 'DECREASE_DIFFICULTY':
      return 'Let’s strengthen the fundamentals before moving ahead.';
    case 'ASK_QUESTION':
      return 'Let’s move to the next question.';
    case 'END_SESSION':
      return 'Let’s wrap up this session.';
    case 'GIVE_FEEDBACK':
      return 'Here’s what to focus on next.';
    default:
      return fallback;
  }
};

const formatStrategyReason = (reason?: string | null): string | null => {
  if (typeof reason !== 'string') return null;
  const compact = reason.trim().replace(/\s+/g, ' ');
  if (!compact) return null;
  const normalized = compact.charAt(0).toUpperCase() + compact.slice(1);
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
};

const getStrategyDepthLabel = (depth?: string | null): string | null => {
  if (typeof depth !== 'string' || !depth.trim() || depth === 'none') return null;
  if (depth === 'light') return 'Light probe';
  if (depth === 'deep') return 'Deep probe';
  return formatStrategyTokenLabel(depth);
};

/** The coach's stance, expressed as one design-system tone rather than a set of
 *  ad-hoc colour classes. */
const getStrategyTone = (style?: string | null): PxTone => {
  switch ((style ?? '').toLowerCase()) {
    case 'supportive':
      return 'positive';
    case 'challenging':
      return 'caution';
    default:
      return 'accent';
  }
};

/** Scores map to a tone on the same scale the report cards use. */
const getScoreTone = (value: number): PxTone => {
  if (value >= 85) return 'positive';
  if (value >= 70) return 'accent';
  if (value >= 50) return 'caution';
  return 'critical';
};

const getStrategyGuardrailText = (guardrail: unknown): string | null => {
  if (typeof guardrail === 'string' && guardrail.trim()) return guardrail.trim();
  if (typeof guardrail === 'boolean') return guardrail ? 'Active' : 'Clear';
  if (typeof guardrail === 'number' && Number.isFinite(guardrail)) return String(guardrail);

  if (Array.isArray(guardrail)) {
    const items = guardrail.map((item) => String(item).trim()).filter(Boolean);
    return items.length > 0 ? items.join(', ') : null;
  }

  if (guardrail && typeof guardrail === 'object') {
    const record = guardrail as Record<string, unknown>;
    const candidates = [record.reason, record.message, record.detail, record.name, record.action];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }

    try {
      return JSON.stringify(record);
    } catch {
      return null;
    }
  }

  return null;
};

const parseProgressCounter = (progress?: string | null): { current: number; total: number } | null => {
  if (typeof progress !== 'string' || !progress.trim()) return null;
  const match = progress.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total)) return null;

  return { current, total };
};

const isHeartbeatInterruptedSnapshot = (snapshot?: PracticeProctoringSnapshot | null): boolean => {
  if (!snapshot) return false;

  const status = normalizeProctoringToken(snapshot.status);
  const latestEventType = normalizeProctoringToken(getLatestProctoringEvent(snapshot)?.event_type);

  return snapshot.heartbeat_stale === true || status === 'interrupted' || latestEventType === 'monitoring_interrupted';
};

const isWarningProctoringSnapshot = (snapshot?: PracticeProctoringSnapshot | null): boolean => {
  if (!snapshot) return false;
  if (snapshot.action === 'terminate' || snapshot.status === 'terminated') return false;
  if (isHeartbeatInterruptedSnapshot(snapshot)) return true;
  if (snapshot.action === 'warn' || snapshot.status === 'warning') return true;
  if (isEscalatedProctoringRisk(snapshot.risk_level)) return true;
  return isActionableProctoringEvent(getLatestProctoringEvent(snapshot));
};

export const PracticeMode = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const audioRecorder = useRef(new AudioRecorder());
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Stream question text word-by-word so it isn't shown all at once.
  const [streamedQuestionText, setStreamedQuestionText] = useState<string>('');
  const [isQuestionStreaming, setIsQuestionStreaming] = useState(false);
  const questionAudioDurationRef = useRef<number | null>(null);
  const questionStreamTimerRef = useRef<number | null>(null);
  const questionStreamRafRef = useRef<number | null>(null);
  const questionStreamKeyRef = useRef<string>('');
  const questionStreamRunIdRef = useRef(0);

  const cancelQuestionStreaming = () => {
    if (questionStreamTimerRef.current != null) {
      window.clearTimeout(questionStreamTimerRef.current);
      questionStreamTimerRef.current = null;
    }
    if (questionStreamRafRef.current != null) {
      try {
        cancelAnimationFrame(questionStreamRafRef.current);
      } catch {
        // ignore
      }
      questionStreamRafRef.current = null;
    }
    // Bump run id and clear key so any in-flight callbacks become no-ops.
    questionStreamRunIdRef.current += 1;
    questionStreamKeyRef.current = '';
    setIsQuestionStreaming(false);
  };

  const playTtsBestEffort = async (ttsAudioUrl?: string) => {
    if (!enableTTS) return;
    if (!ttsAudioUrl || typeof ttsAudioUrl !== 'string') return;

    // Best-effort stop existing playback.
    try {
      audioPlayerRef.current?.pause();
    } catch {
      // ignore
    }

    setIsAudioLoading(true);
    setIsPlayingAudio(false);
  isAudioLoadingRef.current = true;
  isPlayingAudioRef.current = false;
    questionAudioDurationRef.current = null;

    const absoluteUrl = ttsAudioUrl.startsWith('http://') || ttsAudioUrl.startsWith('https://')
      ? ttsAudioUrl
      : `${API_BASE_URL}${ttsAudioUrl}`;

    try {
      const audio = new Audio(absoluteUrl);
      audioPlayerRef.current = audio;

      audio.onloadedmetadata = () => {
        try {
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            questionAudioDurationRef.current = audio.duration;
          }
        } catch {
          // ignore
        }
      };

      audio.onloadeddata = () => {
        setIsAudioLoading(false);
        isAudioLoadingRef.current = false;
      };

      audio.onplay = () => {
        setIsAudioLoading(false);
        setIsPlayingAudio(true);
        isAudioLoadingRef.current = false;
        isPlayingAudioRef.current = true;
      };

      audio.onended = () => {
        setIsPlayingAudio(false);
        isPlayingAudioRef.current = false;
      };

      audio.onerror = () => {
        setIsAudioLoading(false);
        setIsPlayingAudio(false);
        isAudioLoadingRef.current = false;
        isPlayingAudioRef.current = false;
      };

      // Force a reload when reusing same filenames in rare cases.
      try { audio.load(); } catch { }

      await audio.play();
    } catch (err) {
      setIsAudioLoading(false);
      setIsPlayingAudio(false);
      isAudioLoadingRef.current = false;
      isPlayingAudioRef.current = false;
    }
  };

  const roundSelectionScrollRef = useRef<HTMLDivElement | null>(null);
  const lastRoundSelectionScrollTopRef = useRef(0);
  const [showRoundSelectionHeader, setShowRoundSelectionHeader] = useState(true);

  const viewProgressButton = (className?: string) => (
    <PxButton
      variant="ghost"
      size="sm"
      onClick={() => navigate('/progress', { state: { refreshToken: Date.now() } })}
      className={className}
    >
      <BarChart3 className="w-3.5 h-3.5" />
      Progress
    </PxButton>
  );

  const [guestGateBanner, setGuestGateBanner] = useState<GuestGateBanner>(null);

  // Show a friendly, professional in-flow message when guest quota/capacity is hit.
  useEffect(() => {
    const onLimitReached = (event: Event) => {
      const detail = (event as CustomEvent).detail as { message?: string; demo_remaining?: Record<string, unknown> };
      setGuestGateBanner({ kind: 'limit', message: detail?.message, demo_remaining: detail?.demo_remaining });
    };

    const onUnavailable = (event: Event) => {
      const detail = (event as CustomEvent).detail as { message?: string };
      setGuestGateBanner({ kind: 'unavailable', message: detail?.message });
    };

    window.addEventListener('demo:limit-reached', onLimitReached);
    window.addEventListener('demo:unavailable', onUnavailable);

    return () => {
      window.removeEventListener('demo:limit-reached', onLimitReached);
      window.removeEventListener('demo:unavailable', onUnavailable);
    };
  }, []);

  // If guest limit/unavailable triggers mid-session, stop proctoring to avoid spamming 429s.
  useEffect(() => {
    if (!guestGateBanner) return;
    stopProctoring();
    setEnableCameraProctoring(false);

    // Also stop local recorders/streams best-effort.
    try { screenRecorderRef.current?.stop(); } catch { }
    try { cameraRecorderRef.current?.stop(); } catch { }
    try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    screenRecorderRef.current = null;
    cameraRecorderRef.current = null;
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    setCameraPreviewStream(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestGateBanner?.kind]);

  const renderGuestGateBanner = () => {
    if (!guestGateBanner) return null;
    const remaining = guestGateBanner.kind === 'limit' ? guestGateBanner.demo_remaining : undefined;

    return (
      <Panel tone="caution" className="px-rise overflow-hidden">
        <Seam tone="caution" />
        <PanelBody className="flex items-start gap-3.5">
          <div
            className="shrink-0 grid place-items-center w-9 h-9 rounded-[var(--px-r-sm)] border"
            style={{
              color: `hsl(${toneVar('caution')})`,
              borderColor: `hsl(${toneVar('caution')} / 0.3)`,
              background: `hsl(${toneVar('caution')} / 0.1)`,
            }}
          >
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <Eyebrow tone="caution">Access</Eyebrow>
            <div className="px-subtitle mt-1.5">
              {guestGateBanner.kind === 'limit'
                ? 'Guest usage limit reached'
                : 'Guest mode temporarily unavailable'}
            </div>
            <p className="px-body mt-1.5">
              {guestGateBanner.message?.trim()
                ? guestGateBanner.message
                : guestGateBanner.kind === 'limit'
                  ? 'You’ve used all guest credits for now. Sign in to continue, or connect your own API keys for unlimited usage.'
                  : 'Guest capacity is currently full right now. Please try again later, or sign in and use your own API keys.'}
            </p>

            {guestGateBanner.kind === 'limit' && remaining && typeof remaining === 'object' && (
              <div className="px-panel px-panel--inset mt-3 px-3 py-2.5">
                <Eyebrow>Credits remaining</Eyebrow>
                <div className="mt-2">
                  {Object.entries(remaining)
                    .filter(([_, v]) => typeof v === 'number')
                    .map(([k, v]) => (
                      <div key={k} className="px-row py-1.5">
                        <span className="flex-1 px-body px-body--tight">{k}</span>
                        <span className="px-num text-[0.8125rem] font-semibold px-ink">{String(v)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="mt-3.5 flex flex-wrap gap-2 justify-end">
              <PxButton variant="ghost" size="sm" onClick={() => setGuestGateBanner(null)}>
                Dismiss
              </PxButton>
              <PxButton
                variant="primary"
                size="sm"
                onClick={() => {
                  try {
                    window.location.assign('/login?mode=signin');
                  } catch {
                    window.location.href = '/login?mode=signin';
                  }
                }}
              >
                Sign in
                <ArrowRight className="w-3.5 h-3.5" />
              </PxButton>
            </div>
          </div>
        </PanelBody>
      </Panel>
    );
  };

  // Optional insights (coach-like nudge)
  const [practiceInsights, setPracticeInsights] = useState<PracticeInsightsResponse | null>(null);
  const [practiceInsightsLoading, setPracticeInsightsLoading] = useState(false);

  // State
  const [phase, setPhase] = useState<PracticePhase>('welcome');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<StartInterviewResponse['first_question'] | null>(null);
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(1);
  const [currentRoundConfig, setCurrentRoundConfig] = useState<RoundConfig | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [pendingQuestionAudio, setPendingQuestionAudio] = useState<PendingQuestionAudio | null>(null);

  /**
   * This session is a single-question drill from a generated card, not a graded
   * round. Drives the badge and the mic notice, and suppresses the confidence
   * prompt — a drill is excluded from the Progress numbers, so asking the user to
   * rate their confidence on it would feed a benchmark it never reaches.
   */
  const [isDrillSession, setIsDrillSession] = useState(false);
  // The start POST is async, so without this a remount mid-flight could fire a
  // second one and strand the first session.
  const drillStartInFlightRef = useRef(false);

  // If a next-session plan exists (set from Progress screen), jump straight into round selection.
  useEffect(() => {
    try {
      // A drill request wins: it is a direct action the user just took, whereas a
      // stored plan is a standing suggestion. Without this check the plan would
      // flash round-selection on screen before the drill replaced it.
      if (window.localStorage.getItem('practice_drill_request')) return;

      const raw = window.localStorage.getItem('practice_next_session_plan');
      if (raw) {
        // Consume the next-session plan once and remove it so subsequent
        // navigations to the Practice tab don't automatically jump to
        // round-selection every time.
        try { window.localStorage.removeItem('practice_next_session_plan'); } catch { }
        setPhase('round-selection');
      }
    } catch { }
  }, []);

  /**
   * Practise a single generated question, handed over from the copilot.
   *
   * Read at mount and deleted immediately: inactive tabs unmount, so this
   * component remounts on every visit to Practice, and a request left in place
   * would restart the same drill each time.
   *
   * Deliberately skips `ensureLiveMediaReady` — that throws without screen share
   * and camera, and a drill captures neither. The mic still arms itself, because
   * the backend returns the question as VOICE.
   */
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem('practice_drill_request');
      if (raw) window.localStorage.removeItem('practice_drill_request');
    } catch {
      return;
    }
    if (!raw) return;
    if (drillStartInFlightRef.current) return;

    let card: any;
    try {
      card = JSON.parse(raw);
    } catch {
      return;
    }
    if (!card?.question) return;

    drillStartInFlightRef.current = true;
    setIsDrillSession(true);
    setPhase('processing');

    (async () => {
      try {
        const res = await startDrill({
          question: card.question,
          answer: card.answer ?? null,
          topic: card.topic ?? null,
          difficulty: card.difficulty ?? null,
          key_concepts: Array.isArray(card.key_concepts) ? card.key_concepts : [],
        });

        // Seeded from the response, never the local card: the backend sets the
        // 1-based id, the time limit and question_type, and all three feed the
        // question render key. A missing time_limit renders the countdown NaN.
        const question = res.first_question as any;

        resetQuestionPresentationState();
        setQuestionEvaluations([]);
        setStrategyPreview(null);
        setTransitionStrategy(null);
        setPendingAcknowledgmentQuestionId(null);
        setFeedbackRequiresAcknowledgment(false);
        setSessionId(res.session_id);
        setCurrentRoundConfig(null);
        setCurrentQuestion(question);
        setCurrentQuestionNumber(1);
        setCompletionPending(false);
        setTotalQuestions(1);
        setTimeRemaining(question?.time_limit ?? 180);
        setPhase('question');
      } catch (err: any) {
        console.error('[Drill] start failed', err);
        setIsDrillSession(false);
        setPhase('welcome');
        toast({
          title: "Couldn't start the drill",
          description: String(err?.message || 'Please try again.'),
          variant: 'destructive',
        });
      } finally {
        drillStartInFlightRef.current = false;
      }
    })();
  }, []);

  // Auto-hide round-selection header while scrolling down; reveal on scroll up.
  useEffect(() => {
    if (phase !== 'round-selection') return;

    const el = roundSelectionScrollRef.current;
    if (!el) return;

    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const current = el.scrollTop;
        const prev = lastRoundSelectionScrollTopRef.current;
        const delta = current - prev;

        // Always show at the very top.
        if (current <= 8) {
          setShowRoundSelectionHeader(true);
        } else if (delta > 10) {
          // Scrolling down → hide
          setShowRoundSelectionHeader(false);
        } else if (delta < -6) {
          // Scrolling up → show
          setShowRoundSelectionHeader(true);
        }

        lastRoundSelectionScrollTopRef.current = current;
        ticking = false;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll as any);
  }, [phase]);

  // Quick Start state
  const [useQuickStart, setUseQuickStart] = useState(false);
  const [welcomeStep, setWelcomeStep] = useState<'gateway' | 'configure'>('gateway');
  const [quickStartInput, setQuickStartInput] = useState('');
  const [quickStartLoading, setQuickStartLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [sessionSettingsOpen, setSessionSettingsOpen] = useState(false);

  // Setup state
  const [selectedRole, setSelectedRole] = useState<string>('Software Engineer');
  const [selectedDifficulty, setSelectedDifficulty] = useState<InterviewDifficulty>('easy');
  const [enableTTS, setEnableTTS] = useState(true);
  const [enableAdaptive, setEnableAdaptive] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(1);  // Default to 1 question

  // Optional enhanced proctoring on top of the required Live Practice media gate.
  const [enableCameraProctoring, setEnableCameraProctoring] = useState(false);
  const [livePracticeConsentChecked, setLivePracticeConsentChecked] = useState(false);

  // Resume-based interviewing — parsed resume context for claim-based probing
  const [resumeContext, setResumeContext] = useState<ResumeContext | null>(() => loadSavedResumeContext());
  const [proctoringStatus, setProctoringStatus] = useState<'inactive' | 'starting' | 'active' | 'error'>('inactive');
  const [proctoringInfo, setProctoringInfo] = useState<string>('');
  const [proctoringSnapshot, setProctoringSnapshot] = useState<PracticeProctoringSnapshot | null>(null);
  const [proctoringOverlay, setProctoringOverlay] = useState<ProctoringOverlayState | null>(null);
  const [proctoringSessionEndSummary, setProctoringSessionEndSummary] = useState<ProctoringEndSummary | null>(null);
  const [isProctoringBadgePinned, setIsProctoringBadgePinned] = useState(false);
  const [isProctoringBadgeHovered, setIsProctoringBadgeHovered] = useState(false);
  const [isProctoringBadgeAutoExpanded, setIsProctoringBadgeAutoExpanded] = useState(false);
  const proctoringStopRef = useRef<null | (() => void)>(null);
  const proctoringSessionIdRef = useRef<string | null>(null);
  const proctoringStartInFlightRef = useRef<string | null>(null);
  const proctoringOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proctoringBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proctoringBadgeAutoCollapseAtRef = useRef(0);
  const proctoringBadgeLastExpandAtRef = useRef(0);
  const lastProctoringOverlayKeyRef = useRef<string>('');
  const lastProctoringBadgeIssueKeyRef = useRef<string>('');
  const proctoringTerminationHandledRef = useRef<string | null>(null);

  // Lock to prevent parallel ensureCameraForProctoring() calls (race-condition guard)
  const cameraAcquiringRef = useRef(false);

  // Live Practice gate: screen share + camera required by backend.
  const [liveMediaStatus, setLiveMediaStatus] = useState<'inactive' | 'starting' | 'ready' | 'error'>('inactive');
  const [liveMediaInfo, setLiveMediaInfo] = useState<string>('');
  const [cameraPreviewStream, setCameraPreviewStream] = useState<MediaStream | null>(null);
  const facePreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<BlobPart[]>([]);
  const cameraChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const liveCaptureSessionIdRef = useRef<string | null>(null);

  const practiceScreenShareLockRef = useRef(false);

  type QuestionEvaluationItem = {
    questionNumber: number;
    questionId?: number;
    questionText?: string;
    kind: 'voice' | 'code';
    strategy?: Strategy | null;
    transcript?: string;
    metrics?: SpeechMetrics | null;
    microFeedback?: MicroFeedback | null;
    evaluationTrace?: EvaluationTrace | null;
    trajectory?: Trajectory | null;
    pressure?: Pressure | null;
    codeEvaluation?: CodeEvaluationFeedback | null;
    testResults?: CodeTestResult[] | null;
    createdAt: string;
  };

  const [questionEvaluations, setQuestionEvaluations] = useState<QuestionEvaluationItem[]>([]);
  const [endedEarlyData, setEndedEarlyData] = useState<EndPracticeSessionResponse | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const phaseRef = useRef<PracticePhase>('welcome');
  const progressRefreshHintSessionRef = useRef<string | null>(null);
  const currentQuestionRenderKey = buildPracticeQuestionStateKey(
    currentQuestion,
    sessionId,
    currentQuestionNumber,
  );

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase !== 'complete' || !sessionId) return;
    if (progressRefreshHintSessionRef.current === sessionId) return;

    progressRefreshHintSessionRef.current = sessionId;
    persistPracticeProgressRefreshHint(sessionId);
  }, [phase, sessionId]);

  const clearProctoringOverlay = () => {
    if (proctoringOverlayTimerRef.current) {
      clearTimeout(proctoringOverlayTimerRef.current);
      proctoringOverlayTimerRef.current = null;
    }
    setProctoringOverlay(null);
  };

  const clearProctoringBadgeTimer = () => {
    if (proctoringBadgeTimerRef.current) {
      clearTimeout(proctoringBadgeTimerRef.current);
      proctoringBadgeTimerRef.current = null;
    }
  };

  const scheduleProctoringBadgeCollapse = (delayMs: number) => {
    clearProctoringBadgeTimer();

    if (delayMs <= 0) {
      proctoringBadgeAutoCollapseAtRef.current = 0;
      setIsProctoringBadgeAutoExpanded(false);
      return;
    }

    proctoringBadgeTimerRef.current = setTimeout(() => {
      proctoringBadgeAutoCollapseAtRef.current = 0;
      proctoringBadgeTimerRef.current = null;
      setIsProctoringBadgeAutoExpanded(false);
    }, delayMs);
  };

  const ensureLivePracticeConsent = (): boolean => {
    if (livePracticeConsentChecked) return true;

    toast({
      title: 'Consent required',
      description: 'Review the Live Practice consent. This session uses camera, screen, and recording to simulate real interview conditions.',
      variant: 'warning',
    });
    return false;
  };

  const getSeriousViolationLimit = (snapshot?: PracticeProctoringSnapshot | null): number => {
    const current = snapshot?.serious_violations ?? 0;
    const remaining = snapshot?.remaining_serious_violations;
    return typeof remaining === 'number' && remaining >= 0 ? current + remaining : 3;
  };

  const getTotalViolationLimit = (snapshot?: PracticeProctoringSnapshot | null): number => {
    const current = snapshot?.total_violations ?? 0;
    const remaining = snapshot?.remaining_total_violations;
    return typeof remaining === 'number' && remaining >= 0 ? current + remaining : 5;
  };

  const buildProctoringSnapshotKey = (snapshot: PracticeProctoringSnapshot): string => {
    const latestEvent = snapshot.recent_events?.[0];
    return [
      snapshot.status,
      snapshot.risk_level ?? '',
      snapshot.action ?? '',
      snapshot.message ?? '',
      snapshot.terminated_reason ?? '',
      snapshot.total_violations ?? '',
      snapshot.serious_violations ?? '',
      snapshot.remaining_total_violations ?? '',
      snapshot.remaining_serious_violations ?? '',
      latestEvent?.event_type ?? '',
      latestEvent?.timestamp ?? '',
    ].join('|');
  };

  const buildProctoringBadgeIssueKey = (snapshot: PracticeProctoringSnapshot): string => {
    const latestEvent = getLatestProctoringEvent(snapshot);

    return [
      snapshot.status,
      snapshot.action ?? '',
      snapshot.risk_level ?? '',
      snapshot.heartbeat_stale ? 'heartbeat' : '',
      normalizeProctoringEventType(latestEvent?.event_type),
      snapshot.total_violations ?? '',
      snapshot.serious_violations ?? '',
      snapshot.remaining_total_violations ?? '',
      snapshot.remaining_serious_violations ?? '',
    ].join('|');
  };

  const buildProctoringOverlayState = (snapshot: PracticeProctoringSnapshot): ProctoringOverlayState | null => {
    const isTerminal = snapshot.action === 'terminate' || snapshot.status === 'terminated';
    const latestEvent = getLatestProctoringEvent(snapshot);
    const heartbeatInterrupted = isHeartbeatInterruptedSnapshot(snapshot);
    const isFinalWarning = isFinalWarningProctoringSnapshot(snapshot);
    const isSeriousWarning = heartbeatInterrupted || isSeriousProctoringEvent(latestEvent);
    const shouldWarn = isTerminal || isWarningProctoringSnapshot(snapshot);
    const warningDescription =
      snapshot.message ||
      (heartbeatInterrupted ? 'Camera or screen monitoring stopped responding. Check permissions and keep both streams live.' : '') ||
      getProctoringEventDescription(latestEvent) ||
      'A proctoring warning was issued. Correct the issue to continue without escalation.';
    const reasonItems = getProctoringReasonItems(snapshot);

    if (!shouldWarn) return null;

    if (isTerminal) {
      const endSummary = buildProctoringEndSummary(snapshot);

      return {
        tone: 'terminate',
        title: 'Interview ended',
        description: endSummary.description,
        presentation: 'modal',
        supportingText: 'This session was closed by the interview integrity policy.',
        reasonItems: endSummary.items,
      };
    }

    if (isFinalWarning) {
      return {
        tone: 'final-warning',
        title: 'Final warning',
        description: warningDescription,
        presentation: 'modal',
        supportingText: getProctoringEscalationText(snapshot),
        reasonItems,
      };
    }

    if (isSeriousWarning) {
      return {
        tone: 'warning',
        title: heartbeatInterrupted ? 'Monitoring interrupted' : getProctoringEventTitle(latestEvent),
        description: warningDescription,
        presentation: 'modal',
        supportingText: 'This may end your interview if repeated.',
        reasonItems,
      };
    }

    return {
      tone: 'warning',
      title: heartbeatInterrupted ? 'Monitoring interrupted' : getProctoringEventTitle(latestEvent),
      description: warningDescription,
      presentation: 'banner',
      supportingText: getProctoringEscalationText(snapshot),
    };
  };

  const applyProctoringSnapshot = (
    snapshot: PracticeProctoringSnapshot,
    source: 'event' | 'heartbeat' | 'status'
  ) => {
    setProctoringSnapshot(snapshot);
    if (snapshot.message || snapshot.terminated_reason) {
      setProctoringInfo(snapshot.message || snapshot.terminated_reason || '');
    }

    const overlayState = buildProctoringOverlayState(snapshot);
    const snapshotKey = buildProctoringSnapshotKey(snapshot);

    if (!overlayState) {
      if (source === 'status' && snapshot.action !== 'terminate' && snapshot.status !== 'terminated') {
        clearProctoringOverlay();
      }
      return;
    }

    if (overlayState.tone === 'terminate') {
      clearProctoringOverlay();
      setProctoringOverlay(overlayState);

      if (
        proctoringTerminationHandledRef.current !== snapshotKey &&
        sessionIdRef.current &&
        phaseRef.current !== 'complete' &&
        phaseRef.current !== 'welcome'
      ) {
        proctoringTerminationHandledRef.current = snapshotKey;
        void handleEndPracticeFromBackend(snapshot);
      }
      return;
    }

    if (lastProctoringOverlayKeyRef.current === snapshotKey) return;

    lastProctoringOverlayKeyRef.current = snapshotKey;
    clearProctoringOverlay();
    setProctoringOverlay(overlayState);
    proctoringOverlayTimerRef.current = setTimeout(() => {
      setProctoringOverlay((current) => (current && current.tone !== 'terminate' ? null : current));
      proctoringOverlayTimerRef.current = null;
    }, PROCTORING_WARNING_DURATION_MS);
  };

  const stopProctoring = () => {
    try {
      proctoringStopRef.current?.();
    } catch {
      // ignore
    }
    proctoringStopRef.current = null;
    proctoringSessionIdRef.current = null;
    proctoringStartInFlightRef.current = null;
    setProctoringStatus('inactive');
    setProctoringInfo('');
    setProctoringSnapshot(null);
    clearProctoringOverlay();
    clearProctoringBadgeTimer();
    proctoringBadgeAutoCollapseAtRef.current = 0;
    proctoringBadgeLastExpandAtRef.current = 0;
    lastProctoringBadgeIssueKeyRef.current = '';
    setIsProctoringBadgeAutoExpanded(false);
    setIsProctoringBadgeHovered(false);
    setIsProctoringBadgePinned(false);
  };

  useEffect(() => {
    return () => {
      clearProctoringBadgeTimer();
    };
  }, []);

  useEffect(() => {
    const showBadge =
      enableCameraProctoring &&
      !!sessionId &&
      (phase === 'question' || phase === 'recording' || phase === 'processing' || phase === 'feedback');

    const now = Date.now();

    if (!showBadge) {
      clearProctoringBadgeTimer();
      proctoringBadgeAutoCollapseAtRef.current = 0;
      proctoringBadgeLastExpandAtRef.current = 0;
      lastProctoringBadgeIssueKeyRef.current = '';
      setIsProctoringBadgeAutoExpanded(false);
      return;
    }

    const hasIssue =
      proctoringStatus === 'error' ||
      (proctoringSnapshot != null && (
        proctoringSnapshot.action === 'terminate' ||
        proctoringSnapshot.status === 'terminated' ||
        isWarningProctoringSnapshot(proctoringSnapshot)
      ));

    if (!hasIssue) {
      lastProctoringBadgeIssueKeyRef.current = '';

      if (isProctoringBadgeAutoExpanded && proctoringBadgeAutoCollapseAtRef.current > now) {
        scheduleProctoringBadgeCollapse(proctoringBadgeAutoCollapseAtRef.current - now);
        return;
      }

      clearProctoringBadgeTimer();
      proctoringBadgeAutoCollapseAtRef.current = 0;
      setIsProctoringBadgeAutoExpanded(false);
      return;
    }

    const issueKey = proctoringSnapshot
      ? buildProctoringBadgeIssueKey(proctoringSnapshot)
      : `${proctoringStatus}|${proctoringInfo}`;
    const isTerminated = proctoringSnapshot?.action === 'terminate' || proctoringSnapshot?.status === 'terminated';

    if (lastProctoringBadgeIssueKeyRef.current !== issueKey) {
      const recentlyExpanded = now - proctoringBadgeLastExpandAtRef.current < PROCTORING_BADGE_DEBOUNCE_MS;

      lastProctoringBadgeIssueKeyRef.current = issueKey;
      setIsProctoringBadgeAutoExpanded(true);

      if (!recentlyExpanded || proctoringBadgeAutoCollapseAtRef.current <= now) {
        proctoringBadgeLastExpandAtRef.current = now;
        proctoringBadgeAutoCollapseAtRef.current = now + PROCTORING_BADGE_AUTO_COLLAPSE_MS;
      } else {
        proctoringBadgeAutoCollapseAtRef.current = Math.max(
          proctoringBadgeAutoCollapseAtRef.current,
          proctoringBadgeLastExpandAtRef.current + PROCTORING_BADGE_MIN_VISIBLE_MS
        );
      }
    }

    if (isTerminated) {
      clearProctoringBadgeTimer();
      proctoringBadgeAutoCollapseAtRef.current = 0;
      setIsProctoringBadgeAutoExpanded(true);
      return;
    }

    if (!isProctoringBadgeAutoExpanded) return;

    const minimumVisibleUntil = proctoringBadgeLastExpandAtRef.current + PROCTORING_BADGE_MIN_VISIBLE_MS;
    const collapseAt = Math.max(proctoringBadgeAutoCollapseAtRef.current, minimumVisibleUntil, now + 1);
    proctoringBadgeAutoCollapseAtRef.current = collapseAt;
    scheduleProctoringBadgeCollapse(collapseAt - now);
  }, [
    enableCameraProctoring,
    isProctoringBadgeAutoExpanded,
    phase,
    proctoringInfo,
    proctoringSnapshot,
    proctoringStatus,
    sessionId,
  ]);

  const startProctoringBestEffort = async (practiceSessionId: string) => {
    if (!enableCameraProctoring) return;

    // Avoid duplicate listener setup for the same session.
    if (proctoringStopRef.current && proctoringSessionIdRef.current === practiceSessionId) {
      return;
    }

    if (proctoringStartInFlightRef.current === practiceSessionId) {
      return;
    }

    stopProctoring();
    proctoringStartInFlightRef.current = practiceSessionId;
    setProctoringStatus('starting');
    setProctoringInfo('');
    setProctoringSnapshot(null);
    setProctoringSessionEndSummary(null);
    clearProctoringOverlay();
    lastProctoringOverlayKeyRef.current = '';
    proctoringTerminationHandledRef.current = null;

    try {
      const controller = await startPracticeProctoring({
        sessionId: practiceSessionId,
        cameraStream: cameraStreamRef.current,
        screenStream: screenStreamRef.current,
        onStatus: (status, info) => {
          setProctoringStatus(status);
          setProctoringInfo(info ?? '');
        },
        onSnapshot: (snapshot, source) => {
          applyProctoringSnapshot(snapshot, source);
        },
      });

      if (!controller.isActive()) {
        // Endpoint missing or controller disabled itself.
        setEnableCameraProctoring(false);
        toast({
          title: 'Proctoring unavailable',
          description: 'Backend proctoring endpoint is not available. Running unproctored.',
          variant: 'destructive',
        });
        return;
      }

      proctoringStopRef.current = controller.stop;
      proctoringSessionIdRef.current = practiceSessionId;
    } catch (err: any) {
      setEnableCameraProctoring(false);
      setProctoringStatus('error');
      setProctoringInfo(err?.message || 'Camera access failed');
      toast({
        title: 'Camera not enabled',
        description: 'Proctored mode requires camera permission. Continuing unproctored.',
        variant: 'destructive',
      });
    } finally {
      if (proctoringStartInFlightRef.current === practiceSessionId) {
        proctoringStartInFlightRef.current = null;
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopProctoring();
      clearProctoringOverlay();
      try { screenRecorderRef.current?.stop(); } catch { }
      try { cameraRecorderRef.current?.stop(); } catch { }
      try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      screenRecorderRef.current = null;
      cameraRecorderRef.current = null;
      screenStreamRef.current = null;
      cameraStreamRef.current = null;
      setCameraPreviewStream(null);
      liveCaptureSessionIdRef.current = null;
      recordingStartedAtRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera preview: collapsed state and position, both remembered so the
  // choice survives a reload mid-interview.
  const [facePreviewCollapsed, setFacePreviewCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(FACE_PREVIEW_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [facePreviewPos, setFacePreviewPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(FACE_PREVIEW_POS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed?.x === 'number' && typeof parsed?.y === 'number' ? parsed : null;
    } catch { return null; }
  });

  useEffect(() => {
    try { localStorage.setItem(FACE_PREVIEW_COLLAPSED_KEY, facePreviewCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [facePreviewCollapsed]);

  // Pointer events rather than mouse events, so the panel drags with a finger
  // as well as a cursor. Capture keeps the drag alive when the pointer leaves
  // the small header while moving quickly.
  const onFacePreviewDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const panel = e.currentTarget.parentElement as HTMLElement | null;
    if (!panel) return;
    const host = panel.parentElement as HTMLElement | null;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    e.currentTarget.setPointerCapture?.(e.pointerId);

    const clampToViewport = (x: number, y: number) => ({
      // Always leave the panel grabbable: never let it be dragged so far that
      // its header sits off-screen and cannot be reached again.
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - rect.width - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - 40)),
    });

    const onMove = (ev: PointerEvent) => {
      setFacePreviewPos(clampToViewport(ev.clientX - offsetX, ev.clientY - offsetY));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setFacePreviewPos((pos) => {
        if (pos) {
          try { localStorage.setItem(FACE_PREVIEW_POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
        }
        return pos;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  // A window that shrank while the panel was parked near an edge would leave
  // it off-screen and unreachable.
  useEffect(() => {
    const onResize = () => {
      setFacePreviewPos((pos) => {
        if (!pos) return pos;
        return {
          x: Math.min(pos.x, Math.max(8, window.innerWidth - 80)),
          y: Math.min(pos.y, Math.max(8, window.innerHeight - 40)),
        };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /**
   * Attach the stream to the <video>, idempotently.
   *
   * Only touches srcObject when the stream genuinely changed: re-assigning the
   * same MediaStream tears the element's pipeline down and back up, which is
   * what made the preview stutter at every phase transition.
   */
  const attachCameraPreview = useCallback(
    (el: HTMLVideoElement | null) => {
      facePreviewVideoRef.current = el;
      if (!el) return;

      const next = cameraPreviewStream ?? null;
      if ((el as any).srcObject !== next) {
        try {
          (el as any).srcObject = next;
        } catch {
          // ignore
        }
      }

      if (next && el.paused) {
        el.muted = true;
        el.playsInline = true;
        void el.play().catch(() => {
          // ignore
        });
      }
    },
    [cameraPreviewStream]
  );

  // A ref callback rather than only an effect, because the element mounts *after*
  // the stream arrives. ensureCameraForProctoring sets cameraPreviewStream while
  // phase is still 'round-selection', and renderFacePreview does not mount the
  // <video> until phase moves past it -- so the effect ran once with a null ref
  // and never again (its deps are the stream, which had not changed). srcObject
  // was therefore never assigned: a black feed, while the LIVE badge read true
  // because the track itself was healthy.
  //
  // The effect is kept for the other direction: the stream changing while the
  // element is already mounted (camera re-acquired, or cleared on session end).
  useEffect(() => {
    attachCameraPreview(facePreviewVideoRef.current);
  }, [attachCameraPreview]);

  const renderFacePreview = () => {
    const show = !!sessionId && !!cameraPreviewStream && phase !== 'welcome' && phase !== 'setup' && phase !== 'round-selection';
    if (!show) return null;

    // The panel was pinned to `bottom-4 left-4` with no way to move or shrink
    // it, so it sat over whatever happened to be in that corner for the whole
    // interview. Position is remembered per browser; the video element itself
    // is never unmounted while collapsed, because remounting it would restart
    // the stream and drop the detector's input.

    const track = cameraPreviewStream?.getVideoTracks?.()?.[0];
    const trackLive = !!track && track.readyState === 'live';
    const seriousViolationCount = proctoringSnapshot?.serious_violations ?? 0;
    const seriousViolationLimit = getSeriousViolationLimit(proctoringSnapshot);
    const isTerminated = proctoringSnapshot?.action === 'terminate' || proctoringSnapshot?.status === 'terminated';
    const isWarning = isWarningProctoringSnapshot(proctoringSnapshot);

    const feedTone: PxTone = isTerminated ? 'critical' : isWarning ? 'caution' : 'accent';

    return (
      /* Bottom-left: the interview content is a centred column, and a preview
         pinned top-left sat straight on top of the question text once the
         sidebar hides for a live session. Nothing else occupies this corner. */
      <div
        className="px fixed z-[90] px-fade"
        style={
          facePreviewPos
            ? { left: facePreviewPos.x, top: facePreviewPos.y }
            : { left: '1rem', bottom: '1rem' }
        }
      >
        <Panel
          brackets
          tone={feedTone === 'accent' ? undefined : feedTone}
          className="w-[min(11rem,calc(100vw-8rem))] sm:w-[min(13rem,calc(100vw-2rem))] overflow-hidden backdrop-blur-xl"
        >
          <div
            onPointerDown={onFacePreviewDragStart}
            className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[hsl(var(--px-line-soft))] cursor-grab active:cursor-grabbing select-none touch-none"
            title="Drag to move"
          >
            <Eyebrow tone={feedTone} icon={Camera}>
              Feed
            </Eyebrow>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setFacePreviewCollapsed((v) => !v)}
                className="grid h-4 w-4 place-items-center rounded-sm text-[hsl(var(--px-ink-3))] hover:text-[hsl(var(--px-ink-1))] transition-colors"
                title={facePreviewCollapsed ? 'Expand camera' : 'Minimise camera'}
                aria-label={facePreviewCollapsed ? 'Expand camera' : 'Minimise camera'}
                aria-expanded={!facePreviewCollapsed}
              >
                {facePreviewCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              </button>
              {(seriousViolationCount > 0 || proctoringSnapshot?.remaining_serious_violations !== undefined) && (
                <span
                  className="px-num text-[0.625rem] font-semibold"
                  style={toneColor(isTerminated || isWarning ? feedTone : 'neutral')}
                >
                  {seriousViolationCount}/{seriousViolationLimit}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-num text-[0.625rem] px-ink-3">
                <StatusDot tone={trackLive ? 'positive' : 'caution'} live={trackLive} />
                {trackLive ? 'LIVE' : 'SYNC'}
              </span>
            </div>
          </div>

          {/* Hidden, not unmounted: unmounting the <video> would detach the
              stream and the feed would have to restart on every expand. */}
          <div
            className={`relative aspect-square w-full bg-black ${facePreviewCollapsed ? 'hidden' : ''}`}
          >
            <video
              ref={attachCameraPreview}
              className="w-full h-full object-cover -scale-x-100"
              autoPlay
              muted
              playsInline
            />
            {trackLive ? <div className="px-scan" aria-hidden /> : null}

            {!trackLive && (
              <div className="absolute inset-0 grid place-items-center bg-black/55">
                <span className="px-chip px-chip--caution px-chip--mono">NO SIGNAL</span>
              </div>
            )}
          </div>
        </Panel>
      </div>
    );
  };

  const renderFaceWarningOverlay = () => {
    if (!proctoringOverlay) return null;

    const isTerminal = proctoringOverlay.tone === 'terminate';
    const isFinalWarning = proctoringOverlay.tone === 'final-warning';
    const seriousViolationCount = proctoringSnapshot?.serious_violations ?? 0;
    const seriousViolationLimit = getSeriousViolationLimit(proctoringSnapshot);
    const reasonItems = proctoringOverlay.reasonItems ?? [];

    const tone: PxTone = isTerminal || isFinalWarning ? 'critical' : 'caution';
    const OverlayIcon = isTerminal ? ShieldAlert : isFinalWarning ? OctagonAlert : TriangleAlert;

    if (proctoringOverlay.presentation === 'banner') {
      return (
        <div className="px fixed top-20 left-1/2 z-[200] w-[min(92vw,29rem)] -translate-x-1/2 px-rise">
          <Panel tone={tone} className="overflow-hidden backdrop-blur-xl">
            <Seam tone={tone} />
            <PanelBody tight className="flex items-start gap-3">
              <OverlayIcon className="w-4 h-4 mt-0.5 shrink-0" style={toneColor(tone)} />
              <div className="min-w-0 flex-1">
                <div className="px-subtitle" style={toneColor(tone)}>
                  {proctoringOverlay.title}
                </div>
                <p className="px-body mt-1">{proctoringOverlay.description}</p>
                {proctoringOverlay.supportingText && (
                  <p className="px-note mt-1.5 font-medium" style={toneColor(tone)}>
                    {proctoringOverlay.supportingText}
                  </p>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  <Chip tone={tone} mono>
                    STRIKE {seriousViolationCount}/{seriousViolationLimit}
                  </Chip>
                </div>
              </div>
            </PanelBody>
          </Panel>
        </div>
      );
    }

    return (
      <div className="px fixed inset-0 z-[200] grid place-items-center bg-black/65 backdrop-blur-md px-fade p-4">
        <Panel variant="raised" tone={tone} brackets className="w-full max-w-md overflow-hidden px-rise">
          <Seam tone={tone} />
          <PanelBody className="text-center">
            <div
              className="mx-auto grid place-items-center w-14 h-14 rounded-full border"
              style={{
                color: `hsl(${toneVar(tone)})`,
                borderColor: `hsl(${toneVar(tone)} / 0.4)`,
                background: `hsl(${toneVar(tone)} / 0.12)`,
              }}
            >
              <OverlayIcon className="w-6 h-6" />
            </div>

            <div className="mt-4">
              <Eyebrow tone={tone} className="justify-center">
                {isTerminal ? 'Session terminated' : isFinalWarning ? 'Final warning' : 'Integrity check'}
              </Eyebrow>
            </div>
            <h3 className="px-title mt-2">{proctoringOverlay.title}</h3>
            <p className="px-body mt-2">{proctoringOverlay.description}</p>

            {proctoringOverlay.supportingText && (
              <p className="px-body mt-3 font-semibold" style={toneColor(tone)}>
                {proctoringOverlay.supportingText}
              </p>
            )}

            {reasonItems.length > 0 && (
              <div className="px-panel px-panel--inset mt-4 px-3.5 py-3 text-left">
                <Eyebrow tone={tone}>Issue summary</Eyebrow>
                <div className="mt-1.5">
                  <FindingList items={reasonItems} tone={tone} />
                </div>
              </div>
            )}

            {/* Strike ledger — one cell per allowed serious violation. */}
            <div className="mt-5 flex justify-center gap-1.5">
              {Array.from({ length: Math.max(1, seriousViolationLimit) }).map((_, idx) => (
                <span
                  key={idx}
                  className="h-1.5 w-7 rounded-full transition-colors"
                  style={{
                    background:
                      idx < seriousViolationCount
                        ? `hsl(${toneVar(tone)})`
                        : `hsl(${toneVar('neutral')} / 0.22)`,
                    boxShadow: idx < seriousViolationCount ? `0 0 10px 0 hsl(${toneVar(tone)} / 0.5)` : undefined,
                  }}
                />
              ))}
            </div>

            <p className="px-num text-[0.6875rem] mt-3" style={toneColor(tone)}>
              {isTerminal
                ? `STRIKE ${seriousViolationCount}/${seriousViolationLimit} — SESSION ENDED`
                : isFinalWarning
                  ? `STRIKE ${seriousViolationCount}/${seriousViolationLimit} — ONE MORE ENDS THE SESSION`
                  : `STRIKE ${seriousViolationCount}/${seriousViolationLimit} — ${Math.max(seriousViolationLimit - seriousViolationCount, 0)} REMAINING`}
            </p>
          </PanelBody>
        </Panel>
      </div>
    );
  };

  const renderLivePracticeConsentCard = ({
    id,
    compact = false,
    className = '',
  }: {
    id: string;
    compact?: boolean;
    className?: string;
  }) => (
    <div
      className={cx('px-panel px-panel--inset relative overflow-hidden', compact ? 'p-3' : 'p-3.5', className)}
      style={{
        borderColor: livePracticeConsentChecked
          ? `hsl(${toneVar('accent')} / 0.34)`
          : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={livePracticeConsentChecked}
          onCheckedChange={(value) => setLivePracticeConsentChecked(!!value)}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <Eyebrow tone={livePracticeConsentChecked ? 'accent' : 'neutral'} icon={Shield}>
            Live Practice consent
          </Eyebrow>
          <label
            htmlFor={id}
            className={cx(
              'block mt-1.5 cursor-pointer font-semibold leading-snug px-ink',
              compact ? 'text-[0.75rem]' : 'text-[0.8125rem]',
            )}
          >
            I understand that Live Practice uses camera, screen, and recording to simulate real interview conditions.
          </label>
          <div className={cx('px-note', compact ? 'mt-1.5 space-y-0.5' : 'mt-2 space-y-1')}>
            <p>Camera and full-screen monitoring stay active while the session runs.</p>
            <p>Recordings may be uploaded for interview evaluation and review.</p>
            <p>Camera-proctored mode adds automated integrity checks and warning enforcement.</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProctoringStatusPanel = () => {
    const showBadge =
      enableCameraProctoring &&
      !!sessionId &&
      (phase === 'question' || phase === 'recording' || phase === 'processing' || phase === 'feedback');

    if (!showBadge) return null;

    const latestEvent = getLatestProctoringEvent(proctoringSnapshot);
    const isTerminated = proctoringSnapshot?.action === 'terminate' || proctoringSnapshot?.status === 'terminated';
    const heartbeatInterrupted = isHeartbeatInterruptedSnapshot(proctoringSnapshot);
    const isWarning = !!proctoringSnapshot && isWarningProctoringSnapshot(proctoringSnapshot);
    const isFinalWarning = !!proctoringSnapshot && isFinalWarningProctoringSnapshot(proctoringSnapshot);
    const isExpanded = isProctoringBadgePinned || isProctoringBadgeHovered || isProctoringBadgeAutoExpanded;
    const seriousViolationCount = proctoringSnapshot?.serious_violations ?? 0;
    const seriousViolationLimit = getSeriousViolationLimit(proctoringSnapshot);
    const totalViolationCount = proctoringSnapshot?.total_violations ?? 0;
    const totalViolationLimit = getTotalViolationLimit(proctoringSnapshot);
    const remainingSerious = proctoringSnapshot?.remaining_serious_violations;
    const escalationText = getProctoringEscalationText(proctoringSnapshot);
    const reasonItems = getProctoringReasonItems(proctoringSnapshot);

    const tone: PxTone = isTerminated || isFinalWarning
      ? 'critical'
      : heartbeatInterrupted || proctoringStatus === 'error' || isWarning
        ? 'caution'
        : proctoringStatus === 'starting'
          ? 'accent'
          : 'positive';

    const statusLabel = isTerminated
      ? 'Session terminated'
      : isFinalWarning
        ? 'Final warning'
      : heartbeatInterrupted
        ? 'Monitoring interrupted'
        : isWarning
          ? 'Attention needed'
          : proctoringStatus === 'starting'
            ? 'Proctoring starting'
            : 'Proctoring active';

    const detailText = isTerminated
      ? (proctoringSnapshot?.message || proctoringSnapshot?.terminated_reason || 'The backend enforcement policy ended this session.')
      : isFinalWarning
        ? `Final warning. ${proctoringSnapshot?.message || getProctoringEventDescription(latestEvent) || 'Correct the issue immediately to continue.'}`
      : heartbeatInterrupted
        ? (proctoringSnapshot?.message || 'Heartbeat checks are stale. Recheck camera and screen sharing before continuing.')
        : isWarning
          ? (proctoringSnapshot?.message || getProctoringEventDescription(latestEvent) || 'Correct the issue now to avoid escalation.')
          : proctoringStatus === 'starting'
            ? (proctoringInfo || 'Connecting camera checks, heartbeat, and backend status updates.')
            : (proctoringSnapshot?.message || 'Camera proctoring is running quietly in the background.');

    const latestLabel = latestEvent ? getProctoringEventTitle(latestEvent) : null;
    const latestDescription = latestEvent ? getProctoringEventDescription(latestEvent) : null;

    return (
      <div
        className="px fixed bottom-3 right-3 z-[90] sm:right-4 sm:top-4 sm:bottom-auto"
        onMouseEnter={() => setIsProctoringBadgeHovered(true)}
        onMouseLeave={() => setIsProctoringBadgeHovered(false)}
      >
        <button
          type="button"
          onClick={() => setIsProctoringBadgePinned((current) => !current)}
          aria-expanded={isExpanded}
          className="px-focusable ml-auto flex items-center gap-2 rounded-full border px-3 py-2 text-[0.6875rem] font-semibold backdrop-blur-xl transition-all sm:text-xs"
          style={{
            color: `hsl(${toneVar(tone)})`,
            borderColor: `hsl(${toneVar(tone)} / 0.34)`,
            background: `hsl(${toneVar(tone)} / 0.1)`,
            boxShadow: `0 14px 34px -24px hsl(${toneVar(tone)} / 0.9)`,
          }}
        >
          <StatusDot tone={tone} live={!isTerminated} />
          <Shield className="h-3.5 w-3.5" />
          <span>{statusLabel}</span>
          <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')} />
        </button>

        {isExpanded && (
          <Panel
            variant="raised"
            tone={tone === 'positive' ? undefined : tone}
            className="mt-2 w-[min(88vw,21rem)] overflow-hidden backdrop-blur-xl px-rise"
          >
            <Seam tone={tone} />
            <PanelBody tight>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Eyebrow tone={tone} icon={Fingerprint}>
                    Live integrity
                  </Eyebrow>
                  <p className="px-subtitle mt-1.5">{statusLabel}</p>
                </div>
                <Chip tone={tone} mono>
                  {seriousViolationCount}/{seriousViolationLimit}
                </Chip>
              </div>

              <p className="px-note mt-2">{detailText}</p>

              <Grid cols={2} className="mt-3">
                <StatTile
                  label="Serious"
                  value={`${seriousViolationCount}/${seriousViolationLimit}`}
                  tone={seriousViolationCount > 0 ? 'critical' : 'positive'}
                />
                <StatTile
                  label="All events"
                  value={`${totalViolationCount}/${totalViolationLimit}`}
                  tone={totalViolationCount > 0 ? 'caution' : 'positive'}
                />
              </Grid>

              {(isFinalWarning || typeof remainingSerious === 'number') && !isTerminated && (
                <p
                  className="px-note mt-3 font-medium"
                  style={toneColor(isFinalWarning ? 'critical' : 'caution')}
                >
                  {isFinalWarning
                    ? escalationText
                    : remainingSerious > 0
                      ? `${remainingSerious} serious warning${remainingSerious === 1 ? '' : 's'} remaining before termination.`
                      : 'The next serious violation may end the session.'}
                </p>
              )}

              {latestLabel && (
                <div className="px-panel px-panel--inset mt-3 px-3 py-2">
                  <Eyebrow>Latest event</Eyebrow>
                  <p className="px-note mt-1 font-semibold px-ink">{latestLabel}</p>
                  {latestDescription && <p className="px-note mt-0.5">{latestDescription}</p>}
                </div>
              )}

              {(isTerminated || isFinalWarning) && reasonItems.length > 0 && (
                <div className="px-panel px-panel--inset mt-3 px-3 py-2">
                  <Eyebrow tone={tone}>Why this happened</Eyebrow>
                  <div className="mt-1">
                    <FindingList items={reasonItems} tone={tone} />
                  </div>
                </div>
              )}
            </PanelBody>
          </Panel>
        )}
      </div>
    );
  };

  const pickMediaRecorderMime = (candidates: string[]): string => {
    try {
      const MR = (window as any).MediaRecorder as typeof MediaRecorder | undefined;
      if (!MR?.isTypeSupported) return '';
      return candidates.find((c) => MR.isTypeSupported(c)) || '';
    } catch {
      return '';
    }
  };

  const dispatchGuestLimitReached = (source: string) => {
    try {
      window.dispatchEvent(
        new CustomEvent('demo:limit-reached', {
          detail: {
            error: 'DEMO_LIMIT_REACHED',
            message: 'Guest usage limit reached. Please sign in to continue.',
            source,
          },
        })
      );
    } catch {
      // ignore
    }
  };

  const postSessionEventBestEffort = async (
    sid: string,
    event_type: PracticeSessionProctoringEventType,
    metadata: Record<string, unknown> = {}
  ) => {
    try {
      const res = await postPracticeSessionProctoringEvent({
        session_id: sid,
        event_type,
        metadata,
        client_timestamp: new Date().toISOString(),
      });

      if (res.snapshot) {
        applyProctoringSnapshot(res.snapshot, 'event');
      }

      if (res.status === 429) {
        dispatchGuestLimitReached('practice_session_proctoring');
        stopProctoring();
        setEnableCameraProctoring(false);
      }
    } catch {
      // best effort
    }
  };

  /**
   * When camera-proctored mode is ON, ensure the camera is live before
   * allowing the interview to start. If the camera isn't ready, request
   * permission. Throws if the user denies or the camera is unavailable.
   */
  const ensureCameraForProctoring = async (): Promise<void> => {
    if (!enableCameraProctoring) return; // Not proctored — no gate

    // Race-condition lock: prevent parallel acquire attempts
    if (cameraAcquiringRef.current) {
      console.log('[Proctoring] Camera acquisition already in progress — skipping duplicate call');
      return;
    }

    const hasLiveVideo = (stream: MediaStream | null): boolean => {
      const t = stream?.getVideoTracks?.()?.[0];
      return !!t && t.readyState === 'live';
    };

    // Camera already live
    if (hasLiveVideo(cameraStreamRef.current)) {
      setCameraPreviewStream(cameraStreamRef.current);
      return;
    }

    // Try to acquire camera
    if (!navigator?.mediaDevices?.getUserMedia) {
      toast({
        title: 'Camera required',
        description: 'Your browser does not support camera access. Please use a modern browser.',
        variant: 'destructive',
      });
      throw new Error('Camera access is required for proctored mode.');
    }

    cameraAcquiringRef.current = true;
    try {
      try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia(PRACTICE_CAMERA_CONSTRAINTS);

      if (!hasLiveVideo(cameraStreamRef.current)) {
        throw new Error('Camera video track is not live');
      }

      setCameraPreviewStream(cameraStreamRef.current);

      // Listen for camera track ending — enforce compliance: auto-end mid-interview
      const cameraTrack = cameraStreamRef.current.getVideoTracks()[0];
      try {
        cameraTrack.addEventListener('ended', () => {
          console.warn('[Proctoring] Camera track ended — waiting for backend enforcement status');
          const activePhases = ['question', 'recording', 'feedback', 'processing'];
          if (sessionIdRef.current && activePhases.includes(phaseRef.current)) {
            toast({
              title: 'Camera stopped',
              description: 'Camera was disconnected. Backend proctoring will decide whether the session can continue.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Camera stopped',
              description: 'Camera was disconnected. Please reconnect before starting a proctored interview.',
              variant: 'destructive',
            });
          }
          // Clean up preview
          setCameraPreviewStream(null);
        }, { once: true });
      } catch { }
    } catch (err: any) {
      try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      cameraStreamRef.current = null;
      setCameraPreviewStream(null);

      toast({
        title: 'Camera required for proctored mode',
        description: 'Please allow camera access to start the interview. The camera must be on for proctored interviews.',
        variant: 'destructive',
      });
      throw new Error('Camera is required for proctored mode. Please allow camera access and try again.');
    } finally {
      cameraAcquiringRef.current = false;
    }
  };

  const ensureLiveMediaReady = async (): Promise<{ screen_shared: boolean; camera_enabled: boolean }> => {
    const hasLiveVideo = (stream: MediaStream | null): boolean => {
      const t = stream?.getVideoTracks?.()?.[0];
      return !!t && t.readyState === 'live';
    };

    if (hasLiveVideo(screenStreamRef.current) && hasLiveVideo(cameraStreamRef.current)) {
      setLiveMediaStatus('ready');
      setLiveMediaInfo('');
      setCameraPreviewStream(cameraStreamRef.current);
      return { screen_shared: true, camera_enabled: true };
    }

    setLiveMediaStatus('starting');
    setLiveMediaInfo('');

    if (!navigator?.mediaDevices?.getDisplayMedia || !navigator?.mediaDevices?.getUserMedia) {
      setLiveMediaStatus('error');
      setLiveMediaInfo('Browser does not support screen/camera capture');
      throw new Error('Screen share + camera are required to start (not supported in this browser).');
    }

    // Acquire screen share first (so user sees the purpose), then camera.
    try {
      if (!hasLiveVideo(screenStreamRef.current)) {
        try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
        screenStreamRef.current = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false } as any);
      }
      if (!hasLiveVideo(cameraStreamRef.current)) {
        try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
        cameraStreamRef.current = await navigator.mediaDevices.getUserMedia(PRACTICE_CAMERA_CONSTRAINTS);
      }

      if (!hasLiveVideo(screenStreamRef.current) || !hasLiveVideo(cameraStreamRef.current)) {
        throw new Error('Missing screen or camera video track');
      }

      setCameraPreviewStream(cameraStreamRef.current);

      // Track ended listeners → proctoring events (best-effort)
      const screenTrack = screenStreamRef.current.getVideoTracks()[0];
      const cameraTrack = cameraStreamRef.current.getVideoTracks()[0];

      const onScreenEnded = () => {
        const sid = liveCaptureSessionIdRef.current;
        if (!sid) return;
        void postSessionEventBestEffort(sid, 'SCREEN_STOPPED', { reason: 'track_ended' });

        setLiveMediaStatus('error');
        setLiveMediaInfo('Screen sharing stopped. Please re-share your entire screen to continue.');
        toast({
          title: 'Screen sharing stopped',
          description: 'Please re-share your entire screen to continue Live Practice.',
          variant: 'destructive',
        });
      };
      const onCameraEnded = () => {
        const sid = liveCaptureSessionIdRef.current;
        if (!sid) return;
        void postSessionEventBestEffort(sid, 'CAMERA_STOPPED', { reason: 'track_ended' });

        setLiveMediaStatus('error');
        setLiveMediaInfo('Camera stopped. Please re-enable camera to continue.');
        toast({
          title: 'Camera stopped',
          description: 'Please re-enable your camera to continue Live Practice.',
          variant: 'destructive',
        });
      };

      try { screenTrack.addEventListener('ended', onScreenEnded, { once: true } as any); } catch { }
      try { cameraTrack.addEventListener('ended', onCameraEnded, { once: true } as any); } catch { }

      setLiveMediaStatus('ready');
      setLiveMediaInfo('');
      return { screen_shared: true, camera_enabled: true };
    } catch (err: any) {
      setLiveMediaStatus('error');
      setLiveMediaInfo(err?.message || 'Could not start screen share + camera');
      try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
      screenStreamRef.current = null;
      cameraStreamRef.current = null;
      setCameraPreviewStream(null);
      throw new Error('Screen share + camera are required to start. Please allow permissions and try again.');
    }
  };

  const startLiveCaptureForSession = async (sid: string) => {
    if (!sid) return;
    if (liveCaptureSessionIdRef.current === sid) return;

    // Only start recording if MediaRecorder exists.
    if (!(window as any).MediaRecorder) {
      liveCaptureSessionIdRef.current = sid;
      return;
    }

    const screen = screenStreamRef.current;
    const cam = cameraStreamRef.current;
    if (!screen || !cam) {
      liveCaptureSessionIdRef.current = sid;
      return;
    }

    liveCaptureSessionIdRef.current = sid;
    recordingStartedAtRef.current = Date.now();

    const videoCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mime = pickMediaRecorderMime(videoCandidates);

    const startOne = (stream: MediaStream, kind: 'screen' | 'camera') => {
      const rec = new MediaRecorder(stream as any, mime ? ({ mimeType: mime } as any) : undefined);
      const chunksRef = kind === 'screen' ? screenChunksRef : cameraChunksRef;
      const recorderRef = kind === 'screen' ? screenRecorderRef : cameraRecorderRef;
      chunksRef.current = [];
      recorderRef.current = rec;

      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
        if (!blob.size) return;

        const durationSeconds = recordingStartedAtRef.current ? (Date.now() - recordingStartedAtRef.current) / 1000 : undefined;
        try {
          await uploadPracticeSessionMedia({
            sessionId: sid,
            media_type: kind,
            file: blob,
            filename: `${kind}.webm`,
            duration_seconds: durationSeconds,
          });
        } catch (err: any) {
          if (err instanceof StrataxApiError && err.status === 429) {
            dispatchGuestLimitReached('practice_session_media_upload');
            stopProctoring();
            setEnableCameraProctoring(false);
          } else if (err instanceof StrataxApiError && err.status === 413) {
            toast({
              title: 'Recording too large to upload',
              description: `${kind === 'screen' ? 'Screen' : 'Camera'} recording was too large to store automatically. The interview result is safe, but the recording upload was skipped.`,
              variant: 'warning',
            });
          }
        }
      };

      try {
        rec.start(1000);
      } catch {
        // ignore
      }
    };

    try { startOne(screen, 'screen'); } catch { }
    try { startOne(cam, 'camera'); } catch { }
  };

  useEffect(() => {
    const shouldTearDown =
      phase === 'welcome' ||
      phase === 'setup' ||
      phase === 'round-selection';

    if (!shouldTearDown) return;
    if (!liveCaptureSessionIdRef.current) return;

    try { screenRecorderRef.current?.stop(); } catch { }
    try { cameraRecorderRef.current?.stop(); } catch { }
    try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    screenRecorderRef.current = null;
    cameraRecorderRef.current = null;
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    liveCaptureSessionIdRef.current = null;
    recordingStartedAtRef.current = null;
    setCameraPreviewStream(null);
    setLiveMediaStatus('inactive');
    setLiveMediaInfo('');
  }, [phase]);

  // When the session ends, stop recorders, finalize uploads, and fully tear down
  // screen/camera capture so the browser stops showing active sharing indicators.
  useEffect(() => {
    if (phase !== 'complete') return;
    if (!liveCaptureSessionIdRef.current) return;

    try { screenRecorderRef.current?.stop(); } catch { }
    try { cameraRecorderRef.current?.stop(); } catch { }
    try { screenStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    try { cameraStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { }
    screenRecorderRef.current = null;
    cameraRecorderRef.current = null;
    screenStreamRef.current = null;
    cameraStreamRef.current = null;
    liveCaptureSessionIdRef.current = null;
    recordingStartedAtRef.current = null;
    setCameraPreviewStream(null);
    setLiveMediaStatus('inactive');
    setLiveMediaInfo('');
  }, [phase]);

  /**
   * Immersive mode: the app sidebar steps aside the moment the user commits to
   * a practice path. The gateway is still browsing; everything past it — setup,
   * round selection, the interview itself — is the session, and it should own
   * the screen. Distinct from the screen-share lock below, which additionally
   * *blocks* navigation and only applies once capture is genuinely running.
   */
  useEffect(() => {
    const immersive = !(phase === 'welcome' && welcomeStep === 'gateway');
    try {
      window.dispatchEvent(new CustomEvent('app:immersive-mode', { detail: { active: immersive } }));
    } catch {
      // ignore
    }
  }, [phase, welcomeStep]);

  // Unmounting the tab must release the chrome, whatever phase we were in.
  useEffect(() => () => {
    try {
      window.dispatchEvent(new CustomEvent('app:immersive-mode', { detail: { active: false } }));
    } catch {
      // ignore
    }
  }, []);

  // Best-effort navigation lock while screen sharing is active.
  useEffect(() => {
    const getTrackLive = (stream: MediaStream | null): boolean => {
      const track = stream?.getVideoTracks?.()?.[0];
      return !!track && track.readyState === 'live';
    };

    const lockActive =
      !!sessionId &&
      getTrackLive(screenStreamRef.current) &&
      phase !== 'welcome' &&
      phase !== 'setup' &&
      phase !== 'round-selection';

    // Broadcast to parent container (InterviewAssistant) so it can disable tab switching/links.
    if (lockActive !== practiceScreenShareLockRef.current) {
      practiceScreenShareLockRef.current = lockActive;
      try {
        window.dispatchEvent(new CustomEvent('practice:screen-share-lock', { detail: { active: lockActive } }));
      } catch {
        // ignore
      }
    }

    if (!lockActive) return;

    let pushed = false;
    const pushLockState = () => {
      if (pushed) return;
      pushed = true;
      try {
        window.history.pushState({ practiceLock: true }, '', window.location.href);
      } catch {
        // ignore
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue to be set.
      e.returnValue = '';
      return '';
    };

    const onPopState = () => {
      // Keep user on the current screen while sharing.
      try {
        window.history.pushState({ practiceLock: true }, '', window.location.href);
      } catch {
        // ignore
      }
      toast({
        title: 'Screen sharing is active',
        description: 'Finish Live Practice before navigating away.',
      });
    };

    const isEditableTarget = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = (el as any).tagName ? String((el as any).tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if ((el as any).isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Block common "back" shortcuts while sharing.
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'Left')) {
        e.preventDefault();
        return;
      }

      if (e.key === 'Backspace' && !isEditableTarget(e.target)) {
        e.preventDefault();
        return;
      }
    };

    pushLockState();
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, phase, liveMediaStatus]);

  // Ensure we clear the lock flag on unmount.
  useEffect(() => {
    return () => {
      if (!practiceScreenShareLockRef.current) return;
      practiceScreenShareLockRef.current = false;
      try {
        window.dispatchEvent(new CustomEvent('practice:screen-share-lock', { detail: { active: false } }));
      } catch {
        // ignore
      }
    };
  }, []);

  // Adaptive Profile state
  const [profileDomain, setProfileDomain] = useState('');
  // `number | null`, because "nothing entered yet" and "zero years" are
  // different answers and the old `number` initialised to 0 could not tell
  // them apart -- parseInt('') is NaN, `NaN || 0` is 0, so clearing the field
  // and typing 0 both produced 0. That ambiguity is why 0 was treated as
  // "unset" and freshers were silently dropped from adaptive mode.
  const [profileExperience, setProfileExperience] = useState<number | null>(null);
  const [profileSkills, setProfileSkills] = useState<string>('');
  const [profileJobRole, setProfileJobRole] = useState('');
  const [profileCompany, setProfileCompany] = useState('');
  const [profileFocus, setProfileFocus] = useState<string>('');

  // Persist the last domain so we can show insights on next visit even before setup.
  useEffect(() => {
    const d = profileDomain?.trim();
    if (!d) return;
    try { window.localStorage.setItem('practice_last_domain', d); } catch { }
  }, [profileDomain]);

  // When user toggles proctoring ON → immediately acquire camera (don't wait for Start).
  // When toggled OFF → tear down proctoring. If a session is active, also start the proctoring loop.
  useEffect(() => {
    if (!enableCameraProctoring) {
      stopProctoring();
      return;
    }

    // Eagerly acquire camera so the user sees preview instantly & we fail fast on denial
    void ensureCameraForProctoring().catch((err) => {
      console.warn('[Proctoring] Eager camera acquire failed on toggle ON:', err?.message);
      // Flip toggle back off — user denied camera
      setEnableCameraProctoring(false);
    });

    if (sessionId) {
      void startProctoringBestEffort(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableCameraProctoring, sessionId]);

  // Load insights (best-effort). Keep UI silent if endpoint isn't available.
  useEffect(() => {
    const domain = (profileDomain || (typeof window !== 'undefined' ? window.localStorage.getItem('practice_last_domain') : '') || '').trim();
    if (!domain) return;

    let cancelled = false;
    setPracticeInsightsLoading(true);
    getPracticeInsights({ domain, lookback_days: 30 })
      .then((data) => {
        if (cancelled) return;
        setPracticeInsights(data);
      })
      .catch(() => {
        // Intentionally silent: insights are optional.
      })
      .finally(() => {
        if (cancelled) return;
        setPracticeInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileDomain]);

  const renderPracticeInsights = () => {
    const focus = Array.isArray(practiceInsights?.recommended_focus)
      ? practiceInsights!.recommended_focus!.filter(Boolean).slice(0, 3)
      : [];

    if (focus.length === 0 && !practiceInsightsLoading) return null;

    const overall = (practiceInsights?.overall || {}) as Record<string, unknown>;
    const correctness = typeof overall.correctness === 'number' ? overall.correctness : null;
    const confidence = typeof overall.confidence === 'number' ? overall.confidence : null;
    const filler = typeof overall.filler === 'number' ? overall.filler : null;

    const labelFromScore = (value: number | null, thresholds: { needsWork: number; steady: number }) => {
      if (value == null || Number.isNaN(value)) return 'steady';
      if (value < thresholds.needsWork) return 'needs work';
      if (value < thresholds.steady) return 'steady';
      return 'steady';
    };

    // Avoid claiming trends; give a simple direction-like signal.
    const correctnessLabel = labelFromScore(correctness, { needsWork: 0.7, steady: 0.85 });
    const confidenceLabel = labelFromScore(confidence, { needsWork: 0.65, steady: 0.8 });
    // Filler is inverted (more filler is worse). Keep thresholds conservative.
    const deliveryLabel = filler != null && filler > 10 ? 'needs work' : 'steady';

    const basedOnLine = (() => {
      const n = typeof practiceInsights?.lookback_sessions === 'number' ? practiceInsights!.lookback_sessions : null;
      if (n && n > 0) return `Based on your last ${n} practice sessions.`;
      return 'Based on your recent practice sessions.';
    })();

    const readout: Array<{ label: string; state: string }> = [
      { label: 'Correctness', state: correctnessLabel },
      { label: 'Confidence', state: confidenceLabel },
      { label: 'Delivery clarity', state: deliveryLabel },
    ];

    return (
      <Panel className="overflow-hidden px-rise" style={{ ['--px-delay' as string]: '80ms' }}>
        <Seam tone="neural" />
        <PanelHead
          eyebrow="Coach readout"
          icon={Brain}
          tone="neural"
          title="Your focus for the next session"
          description={basedOnLine}
          actions={practiceInsightsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin px-ink-3" /> : undefined}
        />
        <PanelBody className="space-y-4">
          {focus.length > 0 && <FindingList items={focus} tone="neural" />}

          <div>
            <Eyebrow>Recent performance</Eyebrow>
            <Grid cols={1} sm={3} className="mt-2">
              {readout.map((item) => {
                const needsWork = item.state === 'needs work';
                return (
                  <div key={item.label} className="px-panel px-panel--inset flex items-center justify-between gap-2 px-3 py-2">
                    <span className="px-note">{item.label}</span>
                    <span
                      className="px-num text-[0.625rem] font-semibold uppercase tracking-[0.1em]"
                      style={toneColor(needsWork ? 'caution' : 'positive')}
                    >
                      {item.state}
                    </span>
                  </div>
                );
              })}
            </Grid>
          </div>
        </PanelBody>
      </Panel>
    );
  };

  // Feedback state
  const [transcription, setTranscription] = useState<string>('');
  const [speechMetrics, setSpeechMetrics] = useState<SpeechMetrics | null>(null);
  const [microFeedback, setMicroFeedback] = useState<MicroFeedback | null>(null);
  const [evaluationTrace, setEvaluationTrace] = useState<EvaluationTrace | null>(null);
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [pressure, setPressure] = useState<Pressure | null>(null);
  const [strategyPreview, setStrategyPreview] = useState<Strategy | null>(null);
  const [transitionStrategy, setTransitionStrategy] = useState<Strategy | null>(null);
  const [pendingAcknowledgmentQuestionId, setPendingAcknowledgmentQuestionId] = useState<number | null>(null);
  const [feedbackRequiresAcknowledgment, setFeedbackRequiresAcknowledgment] = useState(false);
  const [strategyDebugMode] = useState(() => readPracticeStrategyDebugMode());
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [completionPending, setCompletionPending] = useState(false);

  // Phase 4: post-session self-reported confidence (1-5)
  const [sessionConfidenceDraft, setSessionConfidenceDraft] = useState<number | null>(null);
  const [sessionConfidenceStatus, setSessionConfidenceStatus] = useState<
    'idle' | 'submitting' | 'saved' | 'skipped' | 'disabled' | 'error'
  >('idle');

  const getSessionConfidenceStorageKey = (sid: string) => `practice_session_confidence_v1:${sid}`;

  const loadSessionConfidenceState = (sid: string): SessionConfidenceStoredState | null => {
    if (!sid || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(getSessionConfidenceStorageKey(sid));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as SessionConfidenceStoredState;
    } catch {
      return null;
    }
  };

  const persistSessionConfidenceState = (sid: string, state: SessionConfidenceStoredState) => {
    if (!sid || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        getSessionConfidenceStorageKey(sid),
        JSON.stringify({
          ...state,
          updatedAt: Date.now(),
        } satisfies SessionConfidenceStoredState)
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (phase !== 'complete') return;
    if (!sessionId) return;

    const stored = loadSessionConfidenceState(sessionId);
    if (stored?.disabled) {
      setSessionConfidenceStatus('disabled');
      setSessionConfidenceDraft(typeof stored.value === 'number' ? stored.value : null);
      return;
    }

    if (stored?.skipped) {
      setSessionConfidenceStatus('skipped');
      setSessionConfidenceDraft(typeof stored.value === 'number' ? stored.value : null);
      return;
    }

    if (typeof stored?.value === 'number' && stored.value >= 1 && stored.value <= 5) {
      setSessionConfidenceDraft(stored.value);
      setSessionConfidenceStatus('saved');
      return;
    }

    setSessionConfidenceDraft(null);
    setSessionConfidenceStatus('idle');
  }, [phase, sessionId]);

  const submitSessionConfidenceBestEffort = async (sid: string, value: number) => {
    setSessionConfidenceDraft(value);
    setSessionConfidenceStatus('submitting');

    try {
      const result: any = await submitSessionConfidence(sid, value);

      if (result.ok) {
        setSessionConfidenceStatus('saved');
        persistSessionConfidenceState(sid, { value });
        return;
      }

      const disabled = (result as any)?.disabled === true;
      if (!result.ok && disabled) {
        setSessionConfidenceStatus('disabled');
        persistSessionConfidenceState(sid, { disabled: true });
        return;
      }

      setSessionConfidenceStatus('error');
      toast({
        title: 'Could not save confidence rating',
        description: 'Please try again (this won’t affect your report).',
        variant: 'destructive',
      });
    } catch (err: any) {
      setSessionConfidenceStatus('error');
      toast({
        title: 'Could not save confidence rating',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const skipSessionConfidencePrompt = (sid: string) => {
    setSessionConfidenceStatus('skipped');
    persistSessionConfidenceState(sid, { skipped: true });
  };

  // Phase 3: human feedback rating (best-effort)
  const [feedbackRatingDraftByQuestion, setFeedbackRatingDraftByQuestion] = useState<Record<number, FeedbackRatingDraft>>({});
  const [ratedByQuestion, setRatedByQuestion] = useState<Record<number, boolean>>({});
  const [ratingSubmittingByQuestion, setRatingSubmittingByQuestion] = useState<Record<number, boolean>>({});

  // Code submission state (for coding questions)
  const [codeTestResults, setCodeTestResults] = useState<CodeTestResult[] | null>(null);
  const [codeEvaluation, setCodeEvaluation] = useState<CodeEvaluationFeedback | null>(null);
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  // Recording timer
  const recordingTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const audioLevelIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  // Refs for async effects (avoid stale closures)
  const isRecordingRef = useRef(false);
  const isPlayingAudioRef = useRef(false);
  const isAudioLoadingRef = useRef(false);
  const recordingStartInFlightRef = useRef(false);
  const activeRecordingQuestionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isPlayingAudioRef.current = isPlayingAudio;
  }, [isPlayingAudio]);

  useEffect(() => {
    isAudioLoadingRef.current = isAudioLoading;
  }, [isAudioLoading]);

  const resetQuestionPresentationState = () => {
    cancelQuestionStreaming();
    setStreamedQuestionText('');
    questionAudioDurationRef.current = null;
    setPendingQuestionAudio(null);

    try {
      audioPlayerRef.current?.pause();
    } catch {
      // ignore
    }

    audioPlayerRef.current = null;
    isAudioLoadingRef.current = false;
    isPlayingAudioRef.current = false;
    setIsAudioLoading(false);
    setIsPlayingAudio(false);
  };

  const stopRecordingSilently = async () => {
    // Always clear timers first.
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }

    setAudioLevel(0);

    try {
      await audioRecorder.current.stop();
    } catch {
      // Best-effort: ignore if recorder was not active.
    } finally {
      isRecordingRef.current = false;
      activeRecordingQuestionKeyRef.current = null;
      setIsRecording(false);
    }
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    };
  }, []);

  // Start countdown timer for coding questions
  useEffect(() => {
    // Only start timer for coding questions in question phase
    if (phase === 'question' && currentQuestion && isCodingQuestion(currentQuestion)) {
      console.log('⏱️ [Coding Timer] Starting countdown for coding question');

      // Clear any existing timer
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }

      // Start countdown
      countdownTimerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Time's up! Auto-submit code
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
            }
            console.log('⏰ [Coding Timer] Time limit exceeded');

            toast({
              title: 'Time\'s up',
              description: 'Time limit reached for this coding question.',
              variant: 'warning',
            });

            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
        }
      };
    }
  }, [phase, currentQuestion]);

  useEffect(() => {
    if (phase !== 'question' || !currentQuestion || !pendingQuestionAudio) return;
    if (pendingQuestionAudio.questionKey !== currentQuestionRenderKey) return;

    const queuedAudioUrl = pendingQuestionAudio.ttsAudioUrl;
    setPendingQuestionAudio(null);

    if (!enableTTS || !queuedAudioUrl) return;

    void playTtsBestEffort(queuedAudioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentQuestionRenderKey, pendingQuestionAudio, enableTTS]);

  // Reset and stream question text when a new question is shown.
  useEffect(() => {
    // NOTE: During answer submission we keep phase='question' for UX stability.
    // Without this guard, moving from 'recording' -> 'question' while submitting
    // would cause the SAME question to restart streaming.
    if (phase !== 'question' || !currentQuestion || isProcessing) {
      cancelQuestionStreaming();
      return;
    }

    cancelQuestionStreaming();

    const full = getQuestionPromptText(currentQuestion);
    setStreamedQuestionText('');

    if (!full) {
      setIsQuestionStreaming(false);
      return;
    }

    const key = currentQuestionRenderKey;
    questionStreamKeyRef.current = key;
    const runId = (questionStreamRunIdRef.current += 1);

    const words = full.split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
      setStreamedQuestionText(full);
      setIsQuestionStreaming(false);
      return;
    }

    // Mark as streaming immediately so answer UI can be gated even while we wait for audio metadata.
    setIsQuestionStreaming(true);

    // Smooth fallback streamer (no TTS): reveal progressively over time.
    const startTimeBasedStreaming = (targetMsPerWord: number) => {
      const targetTotalMs = Math.round(Math.max(600, Math.min(120_000, targetMsPerWord * words.length)));
      const startAt = performance.now();
      let lastLen = -1;

      const tick = (now: number) => {
        if (questionStreamKeyRef.current !== key) return;
        if (questionStreamRunIdRef.current !== runId) return;

        const elapsed = now - startAt;
        const progress = Math.min(1, Math.max(0, elapsed / targetTotalMs));
        const len = Math.floor(progress * full.length);

        if (len !== lastLen) {
          lastLen = len;
          setStreamedQuestionText(full.slice(0, len));
        }

        if (progress >= 1) {
          setIsQuestionStreaming(false);
          setStreamedQuestionText(full);
          questionStreamRafRef.current = null;
          return;
        }

        questionStreamRafRef.current = requestAnimationFrame(tick);
      };

      questionStreamRafRef.current = requestAnimationFrame(tick);
    };

    // TTS-synced streamer: drive reveal directly off the audio playback position.
    const startTtsSyncedStreaming = () => {
      const audio = audioPlayerRef.current;
      const duration = audio?.duration;
      const hasDuration = Number.isFinite(duration) && (duration ?? 0) > 0;
      if (!audio || !hasDuration) return false;

      let lastLen = -1;

      const tick = () => {
        if (questionStreamKeyRef.current !== key) return;
        if (questionStreamRunIdRef.current !== runId) return;

        const d = audio.duration;
        const t = audio.currentTime;
        const progress = (Number.isFinite(d) && d > 0 && Number.isFinite(t) && t >= 0)
          ? Math.min(1, Math.max(0, t / d))
          : 0;

        const len = Math.floor(progress * full.length);
        if (len !== lastLen) {
          lastLen = len;
          setStreamedQuestionText(full.slice(0, len));
        }

        if (progress >= 1 || audio.ended) {
          setIsQuestionStreaming(false);
          setStreamedQuestionText(full);
          questionStreamRafRef.current = null;
          return;
        }

        questionStreamRafRef.current = requestAnimationFrame(tick);
      };

      questionStreamRafRef.current = requestAnimationFrame(tick);
      return true;
    };

    const computeMsPerWord = () => {
      const durationFromAudio = audioPlayerRef.current?.duration;
      const durationSeconds = (Number.isFinite(durationFromAudio) && (durationFromAudio ?? 0) > 0)
        ? (durationFromAudio as number)
        : (questionAudioDurationRef.current && questionAudioDurationRef.current > 0 ? questionAudioDurationRef.current : null);

      // If we have a known audio duration, roughly match it; otherwise default to a brisk but readable pace.
      // Slightly faster than before for a more "instant" feel.
      return durationSeconds
        ? Math.max(70, Math.min(500, Math.round((durationSeconds * 1000) / words.length)))
        : 160;
    };

    // If TTS is enabled, give metadata a brief moment so pacing can better match audio.
    let tries = 0;
    const maybeStart = () => {
      if (questionStreamKeyRef.current !== key) return;
      if (questionStreamRunIdRef.current !== runId) return;
      const duration = audioPlayerRef.current?.duration;
      const hasDuration = Number.isFinite(duration) && (duration ?? 0) > 0;
      if (enableTTS && hasDuration) {
        // Sync exactly to TTS playback (pauses/buffering will also pause text).
        if (startTtsSyncedStreaming()) return;
      }

      if (tries >= 60 || !enableTTS) {
        startTimeBasedStreaming(computeMsPerWord());
        return;
      }
      tries += 1;
      questionStreamTimerRef.current = window.setTimeout(maybeStart, 75);
    };

    maybeStart();

    return () => {
      cancelQuestionStreaming();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentQuestionRenderKey, enableTTS, isProcessing]);

  // Auto-start recording when the current question is shown/changes.
  // Trigger conditions:
  // - `auto_start_recording === true` (backend hint)
  // - OR `question_type` indicates a voice question
  // NOTE: This is keyed to the authoritative question signature so rewritten
  // backend questions with the same ordinal still remount and re-arm correctly.
  useEffect(() => {
    if (!sessionId || !currentQuestion) return;

    // Only voice questions should ever auto-start recording.
    if (isCodingQuestion(currentQuestion)) return;

    const autoStart = (currentQuestion as any)?.auto_start_recording === true ||
      String((currentQuestion as any)?.question_type ?? '').toUpperCase() === 'VOICE';

    if (!autoStart) return;

    let cancelled = false;

    const run = async () => {
      const questionKey = currentQuestionRenderKey;

      // If the user already started recording for this question, do nothing.
      if (recordingStartInFlightRef.current) return;
      if (isRecordingRef.current && activeRecordingQuestionKeyRef.current === questionKey) return;

      // Stop any prior recorder before starting a new one.
      if (isRecordingRef.current && activeRecordingQuestionKeyRef.current !== questionKey) {
        await stopRecordingSilently();
        if (cancelled) return;
      }

      // If TTS audio is loading/playing, wait for it to finish.
      const startedAt = Date.now();
      while (!cancelled && (isAudioLoadingRef.current || isPlayingAudioRef.current)) {
        // Safety valve: don't wait forever (fallback to letting the user start manually).
        if (Date.now() - startedAt > 120_000) return;
        await new Promise((resolve) => setTimeout(resolve, 125));
      }

      if (cancelled) return;
      if (recordingStartInFlightRef.current) return;
      if (isRecordingRef.current) return; // user already started
      if (phase !== 'question') return;

      await handleStartRecording();
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentQuestionRenderKey]);

  const handleStartInterview = async () => {
    resetQuestionPresentationState();
    if (!ensureLivePracticeConsent()) return;
    setIsProcessing(true);
    try {
      // Gate: camera must be live if proctored mode is ON
      await ensureCameraForProctoring();
      setQuestionEvaluations([]);
      const gate = await ensureLiveMediaReady();

      // Build user profile if adaptive mode is enabled
      let userProfile: UserProfile | undefined = undefined;
      // `profileExperience > 0` excluded exactly the people who need the
      // entry-level path most: a student answering 0 honestly got no adaptive
      // profile at all -- no domain, no skills, no round targeting -- and no
      // explanation. The backend has always accepted 0 (ge=0) and maps it to
      // Junior/Entry-level, so the only thing rejecting it was this check.
      if (enableAdaptive && profileDomain && profileExperience !== null && profileExperience >= 0) {
        userProfile = {
          domain: profileDomain,
          experience_years: profileExperience,
          skills: profileSkills.split(',').map(s => s.trim()).filter(Boolean),
        };

        if (profileJobRole) userProfile.job_role = profileJobRole;
        if (profileCompany) userProfile.company_preference = profileCompany;
        if (profileFocus) {
          userProfile.interview_focus = profileFocus.split(',').map(s => s.trim()).filter(Boolean);
        }
      }

      const response = await startInterview(
        selectedRole,
        selectedDifficulty,
        enableTTS,
        undefined,  // category (optional)
        userProfile,  // adaptive profile
        questionCount,  // NEW - number of questions
        gate
      );
      console.log('🎯 [Practice Mode] Start Interview Response:', response);
      console.log('🔢 [Practice Mode] Total Questions from API:', response.total_questions);
      if (userProfile) {
        console.log('🧠 [Adaptive Mode] Using profile:', userProfile);
      }

      setStrategyPreview(null);
      setTransitionStrategy(null);
      setPendingAcknowledgmentQuestionId(null);
      setFeedbackRequiresAcknowledgment(false);
      setSessionId(response.session_id);
      setCurrentQuestion(response.first_question);
      setCurrentQuestionNumber(1);
      setTotalQuestions(response.total_questions);  // Use total from API response
      setTimeRemaining(response.first_question.time_limit);
      setCompletionPending(false);
      setPhase('question');

      void startLiveCaptureForSession(response.session_id);
      // Proctoring is started by the enableCameraProctoring/sessionId effect.

      // Countdown timer starts when recording begins.

      // Play TTS audio if available
      if (response.tts_audio_url && enableTTS) {
        try {
          setIsAudioLoading(true);
          const audioUrl = `${API_BASE_URL}${response.tts_audio_url}`;
          console.log('🔊 [Practice Mode] Playing question audio:', audioUrl);

          const audio = new Audio(audioUrl);
          audioPlayerRef.current = audio;

          audio.onloadedmetadata = () => {
            try {
              if (Number.isFinite(audio.duration)) {
                questionAudioDurationRef.current = audio.duration;
              }
            } catch {
              // ignore
            }
          };

          audio.onloadeddata = () => {
            console.log('✅ Audio loaded successfully');
            setIsAudioLoading(false);
          };

          audio.onplay = () => {
            console.log('▶️ Audio playback started');
            setIsPlayingAudio(true);
          };

          audio.onended = () => {
            console.log('⏹️ Audio playback finished');
            setIsPlayingAudio(false);
          };

          audio.onerror = (e) => {
            console.error('❌ Audio playback error:', e);
            setIsAudioLoading(false);
            setIsPlayingAudio(false);
            toast({
              title: 'Audio unavailable',
              description: 'Could not play question audio. You can still read and answer.',
              variant: 'warning',
            });
          };

          await audio.play();
        } catch (err) {
          console.error('❌ Error playing audio:', err);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
          toast({
            title: 'Audio unavailable',
            description: 'Could not play question audio. You can still read and answer.',
            variant: 'warning',
          });
        }
      }

      toast({
        title: 'Interview started',
        description: `Question 1 of ${response.total_questions}`,
        variant: 'success',
      });
    } catch (error: any) {
      console.error('❌ [Practice Mode] Start Interview Error:', error);
      toast({
        title: 'Failed to start',
        description: 'Could not start the interview. Please check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickStart = async () => {
    resetQuestionPresentationState();
    if (!quickStartInput.trim()) {
      toast({
        title: 'Input Required',
        description: 'Please describe your interview preparation needs',
        variant: 'destructive',
      });
      return;
    }

    if (!ensureLivePracticeConsent()) return;

    setQuickStartLoading(true);
    try {
      // Gate: camera must be live if proctored mode is ON
      await ensureCameraForProctoring();
      setQuestionEvaluations([]);
      const gate = await ensureLiveMediaReady();

      // Quick Start: AI decides EVERYTHING - no manual overrides
      const response = await quickStartInterview(
        quickStartInput,
        true,
        enableTTS,
        1,
        undefined,
        undefined,
        gate,
        resumeContext
      );
      console.log('🚀 [Quick Start] Response:', response);
      console.log('📊 [Quick Start] Inferred Profile:', response.inferred_profile);
      console.log('🔢 [Quick Start] Total Questions:', response.total_questions);
      console.log('📍 [Quick Start] Progress:', response.progress);

      setAiMessage(response.ai_message);
      setStrategyPreview(null);
      setTransitionStrategy(null);
      setPendingAcknowledgmentQuestionId(null);
      setFeedbackRequiresAcknowledgment(false);
      setSessionId(response.session_id);
      setCurrentQuestion(response.first_question);
      setCurrentQuestionNumber(1);

      // Set question count from API response
      setTotalQuestions(response.total_questions);
      console.log('✅ [Quick Start] Total Questions Set:', response.total_questions);

      if (response.inferred_profile?.target_company) {
        console.log('🏢 [Quick Start] Target Company:', response.inferred_profile.target_company);
      }

      setTimeRemaining(response.first_question.time_limit);
      setCompletionPending(false);
      setPhase('question');

      void startLiveCaptureForSession(response.session_id);
      // Proctoring is started by the enableCameraProctoring/sessionId effect.

      // Play TTS audio if available
      if (response.tts_audio_url && enableTTS) {
        try {
          setIsAudioLoading(true);
          const audioUrl = `${API_BASE_URL}${response.tts_audio_url}`;
          console.log('🔊 [Quick Start] Playing question audio:', audioUrl);

          const audio = new Audio(audioUrl);
          audioPlayerRef.current = audio;

          audio.onloadedmetadata = () => {
            try {
              if (Number.isFinite(audio.duration)) {
                questionAudioDurationRef.current = audio.duration;
              }
            } catch {
              // ignore
            }
          };

          audio.onloadeddata = () => {
            setIsAudioLoading(false);
          };

          audio.onplay = () => {
            setIsPlayingAudio(true);
          };

          audio.onended = () => {
            setIsPlayingAudio(false);
          };

          audio.onerror = () => {
            setIsAudioLoading(false);
            setIsPlayingAudio(false);
          };

          await audio.play();
        } catch (err) {
          console.error('❌ Error playing audio:', err);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
        }
      }

      toast({
        title: 'Interview started',
        description: response.ai_message,
        variant: 'success',
      });
    } catch (error: any) {
      console.error('❌ [Quick Start] Error:', error);
      toast({
        title: 'Quick start failed',
        description: 'Could not start the interview. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setQuickStartLoading(false);
    }
  };

  const handleStartRecording = async () => {
    if (recordingStartInFlightRef.current) return;
    if (isRecordingRef.current) return;

    recordingStartInFlightRef.current = true;

    try {
      // Clear any stale timers from prior recordings.
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current);
        audioLevelIntervalRef.current = null;
      }

      await audioRecorder.current.start();
      isRecordingRef.current = true;
      activeRecordingQuestionKeyRef.current = currentQuestionRenderKey;
      setIsRecording(true);
      setRecordingTime(0);
      setPhase('recording');

      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Start countdown timer (starts when recording begins)
      countdownTimerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Time's up! Auto-submit
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
            }
            console.log('⏰ [Practice Mode] Time limit exceeded - auto-submitting');

            toast({
              title: 'Time\'s up',
              description: 'Auto-submitting your answer...',
              variant: 'warning',
            });

            // Trigger auto-submit
            setTimeout(() => {
              handleStopRecording();
            }, 100);

            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Get real-time audio level from microphone
      audioLevelIntervalRef.current = setInterval(() => {
        const level = audioRecorder.current.getAudioLevel();
        setAudioLevel(level);
      }, 50); // Update 20 times per second for smooth animation

      toast({
        title: 'Recording started',
        description: 'Speak your answer clearly',
        variant: 'success',
      });
    } catch (error: any) {
      isRecordingRef.current = false;
      activeRecordingQuestionKeyRef.current = null;
      console.error('❌ [Practice Mode] Microphone Error:', error);
      toast({
        title: 'Microphone error',
        description: 'Could not access your microphone. Please check browser permissions and try again.',
        variant: 'destructive',
      });
    } finally {
      recordingStartInFlightRef.current = false;
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording || !sessionId) return;

    cancelQuestionStreaming();
    setIsProcessing(true);
    // Keep UX stable: do not show an explicit "Analyzing" screen.
    setPhase('question');

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    setAudioLevel(0);

    try {
      const audioBlob = await audioRecorder.current.stop();
      isRecordingRef.current = false;
      activeRecordingQuestionKeyRef.current = null;
      setIsRecording(false);
      console.log('🎤 [Practice Mode] Audio Blob Size:', audioBlob.size, 'bytes, Type:', audioBlob.type);

      const effectiveQuestionId = currentQuestion?.id ?? currentQuestionNumber;
      const response = await submitAnswer(sessionId, effectiveQuestionId, audioBlob);
      console.log('📊 [Practice Mode] Submit Answer Response:', response);
      console.log('🔍 [Practice Mode] evaluation_trace:', JSON.stringify(response.evaluation_trace, null, 2));
      console.log('🔍 [Practice Mode] trajectory:', JSON.stringify(response.trajectory, null, 2));

      // Populate the per-question feedback UI state
      setTranscription(response.transcript || '');
      setSpeechMetrics(response.metrics || null);
      setMicroFeedback(response.micro_feedback || null);
      setEvaluationTrace(response.evaluation_trace ?? null);
      setTrajectory(response.trajectory ?? null);
      setPressure(response.pressure ?? null);
      setStrategyPreview(response.strategy ?? null);
      setTransitionStrategy(null);
      setPendingAcknowledgmentQuestionId(response.current_question_id ?? effectiveQuestionId);
      setFeedbackRequiresAcknowledgment(response.requires_acknowledgment ?? true);

      const previewProgress = parseProgressCounter(response.progress);
      if (previewProgress?.total && previewProgress.total >= 1) {
        setTotalQuestions(previewProgress.total);
      }

      // Store per-question evaluation for the final report (do not render per-question feedback).
      setQuestionEvaluations((prev) => ([
        ...prev,
        {
          questionNumber: currentQuestionNumber,
          questionId: effectiveQuestionId,
          questionText: getQuestionPromptText(currentQuestion),
          kind: 'voice',
          strategy: response.strategy ?? null,
          transcript: response.transcript,
          metrics: response.metrics,
          microFeedback: response.micro_feedback,
          evaluationTrace: response.evaluation_trace ?? null,
          trajectory: response.trajectory ?? null,
          pressure: response.pressure ?? null,
          createdAt: new Date().toISOString(),
        },
      ]));

      setCompletionPending(!!response.complete);

      // If backend already included final report, keep it ready for the completion screen.
      if (response.complete && response.evaluation_report) {
        setEvaluation(response.evaluation_report);
      }

      // Show the existing post-answer feedback screen (micro-feedback + optional extensions).
      setPhase('feedback');
    } catch (error: any) {
      console.error('❌ [Practice Mode] Submit Answer Error:', error);
      console.error('❌ [Practice Mode] Error Details:', {
        message: error.message,
        stack: error.stack,
        sessionId,
        questionId: currentQuestion?.id,
        phase,
      });

      if (error instanceof StrataxApiError && error.status === 429) {
        dispatchGuestLimitReached('practice_submit_answer');
      }

      setIsRecording(false);
      toast({
        title: 'Submission failed',
        description: 'Could not submit your answer. Please try again.',
        variant: 'destructive',
      });
      setPhase('question');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitCode = async (code: string, timeTaken: number) => {
    if (!sessionId || !currentQuestion) {
      console.error('❌ [Practice Mode] Cannot submit code: Missing session or question');
      return;
    }

    cancelQuestionStreaming();

    setIsSubmittingCode(true);
    // Keep UX stable: do not show an explicit "Analyzing" screen.

    try {
      console.log('💻 [Practice Mode] Submitting code for question:', currentQuestion.id);

      const response: SubmitCodeResponse = await submitCode(
        sessionId,
        currentQuestion.id || currentQuestionNumber,
        code,
        currentQuestion.programming_language || 'python',
        timeTaken
      );

      console.log('✅ [Practice Mode] Code submission response:', response);
      console.log('🔍 [Practice Mode] Code evaluation:', JSON.stringify(response.evaluation, null, 2));
      console.log('🔍 [Practice Mode] Test results:', JSON.stringify(response.test_results, null, 2));

      // Store per-question evaluation for the final report.
      setQuestionEvaluations((prev) => ([
        ...prev,
        {
          questionNumber: currentQuestionNumber,
          questionId: currentQuestion.id || currentQuestionNumber,
          questionText: getQuestionPromptText(currentQuestion),
          kind: 'code',
          strategy: response.strategy ?? null,
          codeEvaluation: response.evaluation,
          testResults: response.test_results,
          createdAt: new Date().toISOString(),
        },
      ]));

      // Store code evaluation in component state so the feedback phase can display it.
      setCodeTestResults(response.test_results ?? null);
      setCodeEvaluation(response.evaluation ?? null);
      setEvaluationTrace(null);
      setTrajectory(null);
      setPressure(null);
      setStrategyPreview(response.strategy ?? null);
      setTransitionStrategy(null);
      setPendingAcknowledgmentQuestionId(response.current_question_id ?? currentQuestion.id ?? currentQuestionNumber);
      setFeedbackRequiresAcknowledgment(response.requires_acknowledgment ?? true);

      const previewProgress = parseProgressCounter(response.progress);
      if (previewProgress?.total && previewProgress.total >= 1) {
        setTotalQuestions(previewProgress.total);
      }

      setCompletionPending(!!response.complete);

      if (response.complete) {
        // Session is complete — show per-question code feedback first, then user clicks Finish → complete.
        console.log('🎉 [Practice Mode] Session complete; loading final report.');
        if (response.evaluation_report) {
          setEvaluation(response.evaluation_report);
        }
        // Show feedback phase so user can review code results before final summary.
        setPhase('feedback');
      } else {
        // Show code feedback before advancing to next question.
        setPhase('feedback');
      }
    } catch (error: any) {
      console.error('❌ [Practice Mode] Code submission error:', error);

      if (error instanceof StrataxApiError && error.status === 429) {
        dispatchGuestLimitReached('practice_submit_code');
      }

      setIsSubmittingCode(false);
      toast({
        title: 'Submission failed',
        description: 'Could not submit your code. Please try again.',
        variant: 'destructive',
      });
      setPhase('question');
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const handleRestart = () => {
    stopProctoring();
    cancelQuestionStreaming();
    setPhase('welcome');
    setSessionId(null);
    setCurrentQuestion(null);
    setCurrentQuestionNumber(0);
    setQuestionEvaluations([]);
    setTranscription('');
    setSpeechMetrics(null);
    setMicroFeedback(null);
    setEvaluationTrace(null);
    setTrajectory(null);
    setPressure(null);
    setStrategyPreview(null);
    setTransitionStrategy(null);
    setPendingAcknowledgmentQuestionId(null);
    setFeedbackRequiresAcknowledgment(false);
    setEvaluation(null);
    setCompletionPending(false);
    setRecordingTime(0);
    setEndedEarlyData(null);
    setProctoringSessionEndSummary(null);
    setProctoringSnapshot(null);
    clearProctoringOverlay();
    lastProctoringOverlayKeyRef.current = '';
    proctoringTerminationHandledRef.current = null;
  };

  const handleEndPractice = async () => {
    if (!sessionId) return;
    if (!confirm("End practice interview early? You'll receive feedback for questions answered so far.")) return;
    try {
      const result = await endPracticeSession(sessionId);
      setEndedEarlyData(result);
      setProctoringSessionEndSummary(null);
      stopProctoring();
      cancelQuestionStreaming();
      setPhase('complete');
      toast({
        title: "Interview Ended",
        description: `Results ready for ${result.questions_answered ?? currentQuestionNumber} answered question${(result.questions_answered ?? currentQuestionNumber) !== 1 ? 's' : ''}.`,
      });
    } catch (err) {
      console.error("Failed to end practice session:", err);
      toast({
        title: "Failed to end interview",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEndPracticeFromBackend = async (snapshot: PracticeProctoringSnapshot) => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) return;
    const endSummary = buildProctoringEndSummary(snapshot);
    const description = endSummary.description;

    setProctoringSessionEndSummary(endSummary);

    try {
      const result = await endPracticeSession(activeSessionId);
      setEndedEarlyData(result);
      stopProctoring();
      cancelQuestionStreaming();
      setPhase('complete');
      toast({
        title: 'Interview terminated',
        description: endSummary.items[0] ? `${description} Primary cause: ${endSummary.items[0]}.` : description,
        variant: 'destructive',
      });
    } catch (err) {
      console.error('[Proctoring] Failed to finalize backend termination:', err);
      stopProctoring();
      cancelQuestionStreaming();
      setPhase('complete');
      toast({
        title: 'Interview terminated',
        description: endSummary.items[0] ? `${description} Primary cause: ${endSummary.items[0]}.` : description,
        variant: 'destructive',
      });
    }
  };

  const getQuestionPromptText = (question: any): string => {
    if (!question) return '';
    if (typeof question === 'string') return question.trim();

    const candidates = [
      question.question_text,
      question.text,
      question.question,
      question.prompt,
      question.questionText,
      question.question_prompt,
      question.prompt_text,
      question.body,
      question.statement,
      question.content,
      question?.question?.question_text,
      question?.question?.text,
      question?.question?.question,
      question?.question?.prompt,
      question?.question?.questionText,
      question?.question?.question_prompt,
      question?.question?.prompt_text,
      question?.question?.body,
      question?.question?.statement,
      question?.question?.content,
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    // Last-resort: recursively scan for common prompt-ish keys.
    try {
      const seen = new Set<any>();
      const queue: Array<{ value: any; depth: number }> = [{ value: question, depth: 0 }];
      const keyRe = /^(question(_text)?|prompt(_text)?|questionText|question_prompt|text|statement|body|content)$/i;

      while (queue.length) {
        const { value, depth } = queue.shift()!;
        if (!value || typeof value !== 'object') continue;
        if (seen.has(value)) continue;
        seen.add(value);

        for (const [k, v] of Object.entries(value)) {
          if (typeof v === 'string' && keyRe.test(k) && v.trim()) return v.trim();
          if (depth < 3 && v && typeof v === 'object') queue.push({ value: v, depth: depth + 1 });
        }
      }
    } catch {
      // ignore
    }

    return '';
  };

  // Helper function to detect if question is a coding question
  const isCodingQuestion = (question: any): boolean => {
    if (!question) return false;

    // Check explicit question_type field (preferred)
    if (question.question_type?.toUpperCase() === 'CODING') {
      console.log('✅ [Coding Detection] Detected via question_type field');
      return true;
    }

    // Check for coding indicators as fallback
    const hasProgrammingLanguage = !!question.programming_language;
    const hasCodeTemplate = !!question.code_template;
    const hasLongTimeLimit = question.time_limit >= 300; // 5+ minutes

    // Check question text for coding keywords
    const questionText = getQuestionPromptText(question).toLowerCase();
    const codingKeywords = [
      'write the code', 'write code', 'write a function', 'write a program',
      'implement', 'code snippet', 'python code', 'javascript code', 'sql query',
      'write python', 'write javascript', 'write sql', 'create a function',
      'algorithm', 'data structure', 'pandas', 'dataframe'
    ];
    const hasCodeKeyword = codingKeywords.some(keyword => questionText.includes(keyword));

    // If has programming language OR code template, likely a coding question
    if (hasProgrammingLanguage || hasCodeTemplate) {
      console.log('✅ [Coding Detection] Detected via programming_language/code_template');
      return true;
    }

    // If has coding keyword AND longer time limit, likely a coding question
    if (hasCodeKeyword && hasLongTimeLimit) {
      console.log('✅ [Coding Detection] Detected via keywords + time limit');
      return true;
    }

    return false;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const updateFeedbackRatingDraft = (questionId: number, patch: Partial<FeedbackRatingDraft>) => {
    setFeedbackRatingDraftByQuestion((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] ?? {}),
        ...patch,
      },
    }));
  };

  const submitFeedbackRatingBestEffort = (opts: {
    sessionId: string;
    questionId: number;
  }) => {
    const { sessionId, questionId } = opts;

    if (!sessionId || !questionId) return;
    if (ratedByQuestion[questionId]) return;
    if (ratingSubmittingByQuestion[questionId]) return;

    const draft = feedbackRatingDraftByQuestion[questionId];
    const usefulnessRating = draft?.usefulnessRating;
    if (!usefulnessRating) return; // optional; only send if user selected one

    setRatingSubmittingByQuestion((prev) => ({ ...prev, [questionId]: true }));

    ratePracticeFeedback({
      session_id: sessionId,
      question_id: questionId,
      usefulness_rating: usefulnessRating,
      perceived_difficulty: draft?.perceivedDifficulty,
      comment: draft?.comment?.trim() ? draft.comment.trim() : undefined,
    })
      .then(() => {
        setRatedByQuestion((prev) => ({ ...prev, [questionId]: true }));
      })
      .catch((err) => {
        console.warn('⚠️ [Practice Mode] Feedback rating submit failed (non-blocking):', err);
      })
      .finally(() => {
        setRatingSubmittingByQuestion((prev) => ({ ...prev, [questionId]: false }));
      });
  };

  const handleNextQuestion = async () => {
    if (!sessionId) {
      console.error('❌ [Practice Mode] No session ID available');
      return;
    }

    const acknowledgedQuestionId = pendingAcknowledgmentQuestionId ?? currentQuestion?.id ?? currentQuestionNumber;

    if (!acknowledgedQuestionId) {
      console.error('❌ [Practice Mode] No acknowledged question ID available');
      return;
    }

    cancelQuestionStreaming();
    setIsProcessing(true);

    try {
      // Phase 3: best-effort rate feedback right before user advances.
      // Do not block Next Question if this fails.
      submitFeedbackRatingBestEffort({ sessionId, questionId: acknowledgedQuestionId });

      console.log('🔄 [Practice Mode] Acknowledging feedback for session:', sessionId, 'question:', acknowledgedQuestionId);
      console.log('📊 [Practice Mode] Current state:', {
        currentQuestionNumber,
        totalQuestions,
        phase,
        pendingAcknowledgmentQuestionId,
      });

      const response = await acknowledgeFeedback(sessionId, acknowledgedQuestionId);
      console.log('➡️ [Practice Mode] Next Question Response:', response);
      console.log('📋 [Practice Mode] Response details:', {
        hasNextQuestion: !!response.next_question,
        complete: response.complete,
        progress: response.progress,
        hasTtsAudio: !!response.tts_audio_url,
        hasEvaluation: !!response.evaluation_report,
        strategyAction: response.strategy?.action,
      });

      const parsedProgress = parseProgressCounter(response.progress);
      if (parsedProgress?.total && parsedProgress.total >= 1) {
        setTotalQuestions(parsedProgress.total);
      }

      if (response.complete) {
        // Interview complete - show evaluation
        console.log('🎉 [Practice Mode] Interview Complete!');

        if (response.evaluation_report) {
          setEvaluation(response.evaluation_report);
        }

        setStrategyPreview(null);
        setTransitionStrategy(null);
        setPendingQuestionAudio(null);
        setPendingAcknowledgmentQuestionId(null);
        setFeedbackRequiresAcknowledgment(false);

        setPhase('complete');
        setCompletionPending(false);

        toast({
          title: 'Interview complete',
          description: `Completed all ${totalQuestions} questions successfully!`,
          variant: 'success',
        });
      } else {
        // Validate next_question exists
        if (!response.next_question) {
          throw new Error('No next question in response but complete=false');
        }

        console.log('📝 [Practice Mode] Moving to next question:', response.next_question.question_text?.substring(0, 50) + '...');
        console.log('🔍 [Question Type Debug]:', {
          question_type: response.next_question?.question_type,
          question_type_upper: response.next_question?.question_type?.toUpperCase(),
          has_programming_language: !!response.next_question?.programming_language,
          has_code_template: !!response.next_question?.code_template,
          time_limit: response.next_question?.time_limit,
        });

        const nextQuestion: Question = {
          ...response.next_question,
          auto_start_recording:
            response.auto_start_recording ?? response.next_question.auto_start_recording,
        };
        const nextQuestionNumber = parsedProgress?.current && parsedProgress.current >= 1
          ? parsedProgress.current
          : currentQuestionNumber + 1;
        const nextQuestionKey = buildPracticeQuestionStateKey(
          nextQuestion,
          sessionId,
          nextQuestionNumber,
        );

        resetQuestionPresentationState();

        // Move to next question
        setCurrentQuestion(nextQuestion);
        setCurrentQuestionNumber(nextQuestionNumber);
        setSelectedDifficulty(nextQuestion.difficulty);
        setTimeRemaining(nextQuestion.time_limit);
        setCompletionPending(false);
        setPhase('question');
        setTranscription('');
        setSpeechMetrics(null);
        setMicroFeedback(null);
        setEvaluationTrace(null);
        setTrajectory(null);
        setPressure(response.pressure ?? null);
        setStrategyPreview(null);
        setTransitionStrategy(response.strategy ?? null);
        setPendingQuestionAudio(
          response.tts_audio_url
            ? { questionKey: nextQuestionKey, ttsAudioUrl: response.tts_audio_url }
            : null
        );
        setPendingAcknowledgmentQuestionId(null);
        setFeedbackRequiresAcknowledgment(false);

        // Clear code submission state (for coding questions)
        setCodeTestResults(null);
        setCodeEvaluation(null);

        // Clear any existing timer
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }

        console.log('✅ [Practice Mode] State updated, now on question', parsedProgress?.current ?? currentQuestionNumber + 1);
      }
    } catch (error: any) {
      console.error('❌ [Practice Mode] Next Question Error:', error);
      console.error('❌ [Practice Mode] Error stack:', error.stack);
      console.error('❌ [Practice Mode] Error message:', error.message);

      // Guest gating: avoid scary red toasts; the global modal + inline banner handle this.
      if (error instanceof StrataxApiError) {
        const detail = error.detail as any;
        const code = detail?.error;

        if (error.status === 429 && code === 'DEMO_LIMIT_REACHED') {
          setGuestGateBanner({ kind: 'limit', message: detail?.message });
          return;
        }

        if (error.status === 503 && code === 'DEMO_UNAVAILABLE') {
          setGuestGateBanner({ kind: 'unavailable', message: detail?.message });
          return;
        }
      }

      toast({
        title: 'Failed to load question',
        description: 'Could not load the next question. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRoundStart = (sessionId: string, roundConfig: RoundConfig, firstQuestion: any, ttsAudioUrl?: string, totalQuestionsFromApi?: number) => {
    if (!ensureLivePracticeConsent()) {
      return;
    }

    resetQuestionPresentationState();

    // Note: For round-based starts, camera is already ensured in RoundSelection
    // via ensureLiveMediaReady. But we also verify here as a safety net.
    if (enableCameraProctoring) {
      const track = cameraStreamRef.current?.getVideoTracks?.()?.[0];
      if (!track || track.readyState !== 'live') {
        toast({
          title: 'Camera required',
          description: 'Camera must be on for proctored interviews. Please enable your camera and try again.',
          variant: 'destructive',
        });
        return;
      }
    }

    console.log('🎯 [Round-Based] Round started:', roundConfig);
    console.log('📝 [Round-Based] First question structure:', firstQuestion);
    console.log('🔍 [Question Type Debug]:', {
      question_type: firstQuestion?.question_type,
      question_type_upper: firstQuestion?.question_type?.toUpperCase(),
      has_programming_language: !!firstQuestion?.programming_language,
      has_code_template: !!firstQuestion?.code_template,
      time_limit: firstQuestion?.time_limit,
    });
    console.log('🔊 [Round-Based] TTS Audio URL:', ttsAudioUrl);

    setQuestionEvaluations([]);
    setStrategyPreview(null);
    setTransitionStrategy(null);
    setPendingAcknowledgmentQuestionId(null);
    setFeedbackRequiresAcknowledgment(false);
    setSessionId(sessionId);
    setCurrentRoundConfig(roundConfig);
    setCurrentQuestion(firstQuestion);
    setCurrentQuestionNumber(1);
    setCompletionPending(false);
    const resolvedTotal = typeof totalQuestionsFromApi === 'number' && totalQuestionsFromApi >= 1
      ? totalQuestionsFromApi
      : roundConfig.question_count;
    setTotalQuestions(resolvedTotal);
    setTimeRemaining(firstQuestion.time_limit);
    setPhase('question');

    void startLiveCaptureForSession(sessionId);
    // Proctoring is started by the enableCameraProctoring/sessionId effect.

    // Play TTS audio if available
    if (ttsAudioUrl && enableTTS) {
      try {
        setIsAudioLoading(true);
        const audioUrl = `${API_BASE_URL}${ttsAudioUrl}`;
        console.log('🔊 [Round-Based] Playing question audio:', audioUrl);

        const audio = new Audio(audioUrl);
        audioPlayerRef.current = audio;

        audio.onloadedmetadata = () => {
          try {
            if (Number.isFinite(audio.duration)) {
              questionAudioDurationRef.current = audio.duration;
            }
          } catch {
            // ignore
          }
        };

        audio.onloadeddata = () => {
          console.log('✅ [Round-Based] Audio loaded successfully');
          setIsAudioLoading(false);
        };

        // Also handle canplaythrough as backup for onloadeddata
        audio.oncanplaythrough = () => {
          setIsAudioLoading(false);
        };

        audio.onplay = () => {
          console.log('▶️ [Round-Based] Audio playback started');
          setIsAudioLoading(false); // Ensure loading is cleared when playback starts
          setIsPlayingAudio(true);
        };

        audio.onended = () => {
          console.log('⏹️ [Round-Based] Audio playback finished');
          setIsPlayingAudio(false);
          setIsAudioLoading(false);
        };

        // Also handle pause (in case audio is paused/interrupted)
        audio.onpause = () => {
          if (audio.ended || audio.currentTime >= (audio.duration || 0) - 0.1) {
            console.log('⏹️ [Round-Based] Audio ended via pause event');
            setIsPlayingAudio(false);
            setIsAudioLoading(false);
          }
        };

        audio.onerror = (e) => {
          console.error('❌ [Round-Based] Audio playback error:', e);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
          toast({
            title: 'Audio unavailable',
            description: 'Could not play question audio. You can still read and answer.',
            variant: 'warning',
          });
        };

        audio.play().catch((err) => {
          console.error('❌ [Round-Based] Audio play failed:', err);
          setIsAudioLoading(false);
          setIsPlayingAudio(false);
        });

        // Safety: force-clear audio states after a generous timeout to prevent stuck UI
        setTimeout(() => {
          setIsAudioLoading(false);
          // Only clear playing if audio has actually ended/errored
          if (audio.ended || audio.paused) {
            setIsPlayingAudio(false);
          }
        }, 30000);
      } catch (error) {
        console.error('❌ [Round-Based] TTS error:', error);
        setIsAudioLoading(false);
        setIsPlayingAudio(false);
      }
    }

    toast({
      title: `${roundConfig.name} started`,
      description: `${(typeof totalQuestionsFromApi === 'number' && totalQuestionsFromApi >= 1) ? totalQuestionsFromApi : roundConfig.question_count} questions • ${roundConfig.duration_minutes} minutes`,
      variant: 'success',
    });
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    return 'D';
  };

  // ============================================================================
  // Render Phases
  // ============================================================================

  if (phase === 'welcome') {
    /**
     * Gateway paths. `useQuickStart` is inverted from its name: false selects the
     * AI-driven interviewer, true selects the manual configurator. Kept as-is so
     * the redesign stays a pure presentation change.
     */
    const practicePaths = [
      {
        key: 'ai',
        index: '01',
        icon: Zap,
        tone: 'accent' as PxTone,
        title: 'Quick Practice',
        tag: 'AI-driven',
        description: 'Name the role. The interviewer picks the questions, sets the difficulty, and adapts as you answer.',
        meta: ['Adaptive difficulty', '~10 min'],
        onSelect: () => { setUseQuickStart(false); setWelcomeStep('configure'); },
        recommended: false,
      },
      {
        key: 'rounds',
        index: '02',
        icon: Target,
        tone: 'neural' as PxTone,
        title: 'Full Interview Simulation',
        tag: 'Rounds',
        description: 'Step through real interview rounds — HR screening, technical, system design — scored end to end.',
        meta: ['Round-based', 'Scored to Progress'],
        onSelect: () => setPhase('round-selection'),
        recommended: true,
      },
      {
        key: 'custom',
        index: '03',
        icon: Settings,
        tone: 'caution' as PxTone,
        title: 'Custom Setup',
        tag: 'Advanced',
        description: 'Set the role, difficulty, and question count yourself, then start on your own terms.',
        meta: ['Manual control', '1–10 questions'],
        onSelect: () => { setUseQuickStart(true); setWelcomeStep('configure'); },
        recommended: false,
      },
    ];

    const sessionAnatomy = [
      { icon: Mic, label: 'Answer aloud', detail: 'Questions are read to you; you reply by voice or code.' },
      { icon: Waves, label: 'Delivery measured', detail: 'Pace, fillers, and confidence are tracked per answer.' },
      { icon: Brain, label: 'Scored instantly', detail: 'Correctness and coverage come back before the next question.' },
      { icon: TrendingUp, label: 'Rolled into Progress', detail: 'Every round moves your long-term trend lines.' },
    ];

    return (
      <div className="px px-shell min-h-full">
        <div className="px-frame px-frame--mid py-5 sm:py-8">

          {/* ── GATEWAY: choose a practice path ── */}
          {welcomeStep === 'gateway' && (
            <div className="space-y-6">

              {/* Command bar */}
              <div className="flex items-center justify-between gap-3 px-fade">
                <div className="flex items-center gap-2">
                  <Eyebrow tone="accent" icon={Command}>
                    Live Practice
                  </Eyebrow>
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-note">
                    <StatusDot tone="positive" live />
                    Interviewer online
                  </span>
                </div>
                {viewProgressButton()}
              </div>

              {/* Hero */}
              <header className="px-rise" style={{ ['--px-delay' as string]: '40ms' }}>
                <h1 className="px-display">
                  Choose how you
                  <br className="hidden sm:block" />
                  {' '}want to practise.
                </h1>
                <p className="px-body mt-3 max-w-xl">
                  Three ways in. Each one records your answer, scores it against what a real
                  interviewer looks for, and feeds the result back into your Progress.
                </p>
              </header>

              <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr] items-start">

                {/* Paths */}
                <div className="space-y-3">
                  {practicePaths.map((path, i) => (
                    <Panel
                      key={path.key}
                      as="button"
                      variant={path.recommended ? 'raised' : 'default'}
                      tone={path.recommended ? 'accent' : undefined}
                      onClick={path.onSelect}
                      className="px-panel--interactive group overflow-hidden px-rise"
                      style={{ ['--px-delay' as string]: `${100 + i * 70}ms` }}
                    >
                      {path.recommended && <Seam tone="accent" />}
                      <div className="flex items-start gap-4 p-4 sm:p-5">
                        <div
                          className="shrink-0 grid place-items-center w-11 h-11 rounded-[var(--px-r-md)] border transition-colors"
                          style={{
                            color: `hsl(${toneVar(path.tone)})`,
                            borderColor: `hsl(${toneVar(path.tone)} / 0.28)`,
                            background: `hsl(${toneVar(path.tone)} / 0.1)`,
                          }}
                        >
                          <path.icon className="w-5 h-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-num text-[0.625rem] px-ink-3">{path.index}</span>
                            <span className="px-subtitle">{path.title}</span>
                            <Chip tone={path.tone}>{path.tag}</Chip>
                            {path.recommended && (
                              <Chip tone="accent" icon={Sparkles}>
                                Recommended
                              </Chip>
                            )}
                          </div>
                          <p className="px-body mt-1.5">{path.description}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                            {path.meta.map((m) => (
                              <span key={m} className="px-note inline-flex items-center gap-1.5">
                                <span
                                  className="w-1 h-1 rounded-full"
                                  style={{ background: `hsl(${toneVar(path.tone)} / 0.7)` }}
                                />
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 mt-1 shrink-0 px-ink-3 transition-transform duration-300 group-hover:translate-x-1" />
                      </div>
                    </Panel>
                  ))}
                </div>

                {/* Readout column */}
                <aside className="space-y-3">
                  {renderPracticeInsights()}

                  <Panel className="overflow-hidden px-rise" style={{ ['--px-delay' as string]: '180ms' }}>
                    <PanelHead eyebrow="What a session does" icon={Layers} tone="accent" />
                    <PanelBody className="space-y-3.5">
                      {sessionAnatomy.map((step, i) => (
                        <div key={step.label} className="flex items-start gap-3">
                          <div className="shrink-0 flex flex-col items-center pt-0.5">
                            <step.icon className="w-3.5 h-3.5 px-accent-ink" />
                            {i < sessionAnatomy.length - 1 && (
                              <span className="mt-1.5 w-px flex-1 min-h-[1.25rem] bg-[hsl(var(--px-line))]" />
                            )}
                          </div>
                          <div className="min-w-0 pb-0.5">
                            <div className="text-[0.8125rem] font-semibold px-ink leading-tight">{step.label}</div>
                            <p className="px-note mt-0.5">{step.detail}</p>
                          </div>
                        </div>
                      ))}
                    </PanelBody>
                  </Panel>
                </aside>
              </div>
            </div>
          )}

          {/* ── CONFIGURE: mode-specific setup ── */}
          {welcomeStep === 'configure' && (
            <div className="max-w-2xl mx-auto px-rise">
              <Panel variant="raised" className="overflow-hidden">
                <Seam tone={useQuickStart ? 'caution' : 'accent'} />

                <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-3.5 border-b border-[hsl(var(--px-line-soft))]">
                  <PxButton
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label="Back to practice paths"
                    onClick={() => setWelcomeStep('gateway')}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </PxButton>
                  <div className="flex-1 min-w-0">
                    <Eyebrow tone={useQuickStart ? 'caution' : 'accent'}>
                      Step 2 — Configure
                    </Eyebrow>
                    <div className="px-title mt-1">
                      {useQuickStart ? 'Custom Setup' : 'AI Interviewer'}
                    </div>
                  </div>
                  <Chip mono>{useQuickStart ? 'MANUAL' : 'ADAPTIVE'}</Chip>
                </div>

                <PanelBody className="space-y-4">
                  {!useQuickStart ? (
                    /* ── AI Interviewer ── */
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="px-eyebrow" htmlFor="practice-target-role">
                          <Rocket className="w-3 h-3" />
                          What are you preparing for?
                        </label>
                        <div className="relative">
                          <input
                            id="practice-target-role"
                            className="px-field pr-11"
                            placeholder='e.g., "Senior React role at Google"'
                            value={quickStartInput}
                            onChange={(e) => setQuickStartInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !quickStartLoading) {
                                handleQuickStart();
                              }
                            }}
                            maxLength={512}
                            autoFocus
                          />
                          <MessageSquare className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 px-ink-3 pointer-events-none" />
                        </div>
                        <p className="px-note">
                          Role, seniority, and company all help — the interviewer uses every part of it.
                        </p>
                      </div>

                      {aiMessage && (
                        <div className="px-panel px-panel--inset px-3.5 py-3 flex items-start gap-2.5 px-fade">
                          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={toneColor('positive')} />
                          <p className="px-body px-body--tight">{aiMessage}</p>
                        </div>
                      )}

                      <ResumeUpload
                        mode="practice"
                        onParsed={(ctx) => setResumeContext(ctx)}
                        onClear={() => setResumeContext(null)}
                        existing={resumeContext}
                      />

                      <div className="px-panel px-panel--inset px-3.5 py-3">
                        <Eyebrow tone="accent">This session sharpens</Eyebrow>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {['Answer clarity', 'Confidence', 'Interview structure'].map((item) => (
                            <Chip key={item} tone="accent" icon={CheckCircle2}>
                              {item}
                            </Chip>
                          ))}
                        </div>
                      </div>

                      {renderLivePracticeConsentCard({
                        id: 'quick-start-live-practice-consent',
                        compact: true,
                      })}

                      <PxButton
                        variant="primary"
                        size="lg"
                        block
                        onClick={handleQuickStart}
                        disabled={quickStartLoading || !quickStartInput.trim() || !livePracticeConsentChecked}
                      >
                        {quickStartLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Setting up interview…
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Start Interview
                          </>
                        )}
                      </PxButton>

                      <Collapsible open={sessionSettingsOpen} onOpenChange={setSessionSettingsOpen}>
                        <CollapsibleTrigger asChild>
                          <button className="px-focusable w-full flex items-center justify-center gap-1.5 py-2 px-note px-link transition-colors">
                            <Settings className="w-3 h-3" />
                            <span>Session settings</span>
                            <ChevronDown className={cx('w-3 h-3 transition-transform duration-200', sessionSettingsOpen && 'rotate-180')} />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 px-fade">
                          <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Volume2 className="w-4 h-4 shrink-0 px-ink-3" />
                              <div className="min-w-0">
                                <p className="text-[0.8125rem] font-semibold px-ink">Voice assistant</p>
                                <p className="px-note">Hear each question read aloud.</p>
                              </div>
                            </div>
                            <Switch checked={enableTTS} onCheckedChange={setEnableTTS} />
                          </div>

                          <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Camera className="w-4 h-4 shrink-0 px-ink-3" />
                              <div className="min-w-0">
                                <p className="text-[0.8125rem] font-semibold px-ink">Camera-proctored mode</p>
                                <p className="px-note">Adds integrity analysis on top of the required camera and screen recording.</p>
                              </div>
                            </div>
                            <Switch checked={enableCameraProctoring} onCheckedChange={setEnableCameraProctoring} />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  ) : (
                    /* ── Manual setup ── */
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="px-eyebrow" htmlFor="practice-role">
                          <Briefcase className="w-3 h-3" />
                          Interview role
                        </label>
                        <input
                          id="practice-role"
                          className="px-field"
                          placeholder="e.g., Software Engineer, Data Scientist, DevOps…"
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value)}
                          maxLength={512}
                          list="role-suggestions"
                          autoFocus
                        />
                        <datalist id="role-suggestions">
                          {/* Entry-level first. The field has always accepted any
                              text (the backend's `domain` is free-form), but every
                              suggestion named a mid-career professional role, so
                              the platform read as closed to students even though
                              it was not. */}
                          <option value="Student / Fresher" />
                          <option value="Final-year Undergraduate" />
                          <option value="Software Engineer Intern" />
                          <option value="Campus Placement" />
                          <option value="Software Engineer" />
                          <option value="Data Scientist" />
                          <option value="Product Manager" />
                          <option value="DevOps Engineer" />
                          <option value="Frontend Developer" />
                          <option value="Backend Developer" />
                          <option value="Full Stack Developer" />
                          <option value="AI/ML Specialist" />
                          <option value="UX/UI Designer" />
                          <option value="AI Engineer" />
                          <option value="ML Engineer" />
                          <option value="QA Engineer" />
                          <option value="Security Engineer" />
                          <option value="Data Engineer" />
                        </datalist>
                        <p className="px-note">Any role works — the list is only a shortcut.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="px-eyebrow">
                          <Gauge className="w-3 h-3" />
                          Difficulty
                        </label>
                        <div className="px-segment w-full">
                          {([
                            { value: 'easy', label: 'Easy', tone: 'positive' as PxTone },
                            { value: 'medium', label: 'Medium', tone: 'caution' as PxTone },
                            { value: 'hard', label: 'Hard', tone: 'critical' as PxTone },
                          ]).map((diff) => (
                            <button
                              key={diff.value}
                              type="button"
                              className="px-segment__item flex-1"
                              data-active={selectedDifficulty === diff.value}
                              onClick={() => setSelectedDifficulty(diff.value as InterviewDifficulty)}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                  background:
                                    selectedDifficulty === diff.value
                                      ? `hsl(${toneVar(diff.tone)})`
                                      : `hsl(${toneVar('neutral')} / 0.35)`,
                                }}
                              />
                              {diff.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ListChecks className="w-4 h-4 shrink-0 px-ink-3" />
                          <div className="min-w-0">
                            <p className="text-[0.8125rem] font-semibold px-ink">Number of questions</p>
                            <p className="px-note">Between 1 and 10.</p>
                          </div>
                        </div>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={questionCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (val >= 1 && val <= 10) {
                              setQuestionCount(val);
                            }
                          }}
                          className="px-field px-num w-16 h-9 text-center"
                        />
                      </div>

                      <ResumeUpload
                        mode="practice"
                        onParsed={(ctx) => setResumeContext(ctx)}
                        onClear={() => setResumeContext(null)}
                        existing={resumeContext}
                      />

                      <div className="px-panel px-panel--inset px-3.5 py-3">
                        <Eyebrow tone="accent">This session sharpens</Eyebrow>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {['Answer clarity', 'Confidence', 'Interview structure'].map((item) => (
                            <Chip key={item} tone="accent" icon={CheckCircle2}>
                              {item}
                            </Chip>
                          ))}
                        </div>
                      </div>

                      {renderLivePracticeConsentCard({
                        id: 'custom-setup-live-practice-consent',
                        compact: true,
                      })}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <PxButton variant="primary" size="lg" onClick={() => setPhase('setup')}>
                          <Sparkles className="w-4 h-4" />
                          Quick Practice
                        </PxButton>
                        <PxButton variant="outline" size="lg" onClick={() => setPhase('round-selection')}>
                          <Target className="w-4 h-4" />
                          Round-Based
                        </PxButton>
                      </div>

                      <Collapsible open={sessionSettingsOpen} onOpenChange={setSessionSettingsOpen}>
                        <CollapsibleTrigger asChild>
                          <button className="px-focusable w-full flex items-center justify-center gap-1.5 py-2 px-note px-link transition-colors">
                            <Settings className="w-3 h-3" />
                            <span>Session settings</span>
                            <ChevronDown className={cx('w-3 h-3 transition-transform duration-200', sessionSettingsOpen && 'rotate-180')} />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 px-fade">
                          <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Volume2 className="w-4 h-4 shrink-0 px-ink-3" />
                              <div className="min-w-0">
                                <p className="text-[0.8125rem] font-semibold px-ink">Text-to-speech</p>
                                <p className="px-note">Hear each question read aloud.</p>
                              </div>
                            </div>
                            <Switch checked={enableTTS} onCheckedChange={setEnableTTS} />
                          </div>

                          <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Camera className="w-4 h-4 shrink-0 px-ink-3" />
                              <div className="min-w-0">
                                <p className="text-[0.8125rem] font-semibold px-ink">Camera-proctored mode</p>
                                <p className="px-note">Adds integrity analysis on top of the required camera and screen recording.</p>
                              </div>
                            </div>
                            <Switch checked={enableCameraProctoring} onCheckedChange={setEnableCameraProctoring} />
                          </div>

                          <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Brain className="w-4 h-4 shrink-0" style={toneColor('neural')} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-[0.8125rem] font-semibold px-ink">Adaptive intelligence</p>
                                  <Chip tone="neural">New</Chip>
                                </div>
                                <p className="px-note">Personalises questions from a profile you fill in next.</p>
                              </div>
                            </div>
                            <Switch checked={enableAdaptive} onCheckedChange={setEnableAdaptive} />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}
                </PanelBody>
              </Panel>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'round-selection') {
    const userProfile = enableAdaptive && profileDomain && profileExperience !== null && profileExperience >= 0 ? {
      domain: profileDomain,
      experience_years: profileExperience,
      skills: profileSkills.split(',').map(s => s.trim()).filter(Boolean),
      job_role: profileJobRole || undefined,
      company_preference: profileCompany || undefined,
      interview_focus: profileFocus ? profileFocus.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    } : undefined;

    return (
      <div className="px px-shell w-full h-full flex flex-col relative overflow-hidden">
        <div ref={roundSelectionScrollRef} className="flex-1 overflow-y-auto scrollbar-hide">

          {/* Session chrome — collapses out of the way as the user scrolls. */}
          <div
            className={cx(
              'sticky top-0 z-[60] transition-all duration-300',
              showRoundSelectionHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none',
            )}
          >
            {/* Session chrome rides inside the content frame rather than as a
                full-bleed band, so it reads as part of the screen instead of a
                second app header stacked under the real one. */}
            <div className="px-frame px-frame--mid pt-3 pb-1">
              <div
                className="px-panel flex items-center justify-between gap-3 h-12 pl-2 pr-2 backdrop-blur-xl"
                style={{ background: 'hsl(var(--px-surface) / 0.78)' }}
              >
                <PxButton
                  variant="ghost"
                  size="sm"
                  onClick={() => { setWelcomeStep('gateway'); setPhase('welcome'); }}
                  className="group"
                >
                  <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                  Back
                </PxButton>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2.5 h-8 px-2.5 rounded-[var(--px-r-sm)] cursor-pointer select-none hover:bg-[hsl(var(--px-surface-3))] transition-colors">
                    <Camera className="w-3.5 h-3.5 px-ink-3" />
                    <span className="hidden md:inline px-note font-semibold">Proctoring</span>
                    <Switch
                      checked={enableCameraProctoring}
                      onCheckedChange={setEnableCameraProctoring}
                      aria-label="Toggle camera-proctored mode"
                    />
                  </label>

                  {viewProgressButton('md:hidden')}
                </div>
              </div>
            </div>
          </div>

          <div className="px-frame px-frame--mid pt-1">
            <RoundSelection
              onRoundStart={handleRoundStart}
              userProfile={userProfile}
              ensureLiveMediaReady={ensureLiveMediaReady}
              ensureCameraForProctoring={ensureCameraForProctoring}
              resumeContext={resumeContext}
              onResumeChange={setResumeContext}
              livePracticeConsentChecked={livePracticeConsentChecked}
              onLivePracticeConsentChange={setLivePracticeConsentChecked}
            />
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    // Number(0) is falsy, so a fresher's profile never counted as ready.
    const adaptiveProfileReady = !!(profileDomain && profileSkills) && profileExperience !== null && profileExperience >= 0;

    return (
      <div className="px px-shell min-h-full">
        <div className="px-frame px-frame--narrow py-5 sm:py-8">
          <div className="flex items-center justify-between gap-3 mb-5">
            <Eyebrow tone="accent" icon={Command}>
              Live Practice
            </Eyebrow>
            {viewProgressButton()}
          </div>

          <div className="max-w-2xl mx-auto px-rise">
            <Panel variant="raised" className="overflow-hidden">
              <Seam tone={enableAdaptive ? 'neural' : 'accent'} />

              <div className="px-5 pt-6 pb-5 text-center border-b border-[hsl(var(--px-line-soft))]">
                <div
                  className="mx-auto grid place-items-center w-12 h-12 rounded-[var(--px-r-md)] border"
                  style={{
                    color: `hsl(${toneVar(enableAdaptive ? 'neural' : 'accent')})`,
                    borderColor: `hsl(${toneVar(enableAdaptive ? 'neural' : 'accent')} / 0.28)`,
                    background: `hsl(${toneVar(enableAdaptive ? 'neural' : 'accent')} / 0.1)`,
                  }}
                >
                  {enableAdaptive ? <Brain className="w-5 h-5" /> : <Target className="w-5 h-5" />}
                </div>
                <div className="mt-3.5">
                  <Eyebrow tone={enableAdaptive ? 'neural' : 'accent'}>
                    {enableAdaptive ? 'Step 3 — Profile' : 'Step 3 — Launch'}
                  </Eyebrow>
                </div>
                <h2 className="px-title mt-2">
                  {enableAdaptive ? 'Set up your profile' : 'Ready to start'}
                </h2>
                <p className="px-body mt-1.5 max-w-sm mx-auto">
                  {enableAdaptive
                    ? 'These details drive question selection. The more precise they are, the closer the session gets to your real interview.'
                    : 'Confirm how the session is recorded, then begin.'}
                </p>
              </div>

              <PanelBody className="space-y-4">
                <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3.5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Camera className="w-4 h-4 shrink-0 px-ink-3" />
                    <div className="min-w-0">
                      <p className="text-[0.8125rem] font-semibold px-ink">Camera-proctored mode</p>
                      <p className="px-note">Adds integrity analysis on top of the required camera and screen recording.</p>
                    </div>
                  </div>
                  <Switch checked={enableCameraProctoring} onCheckedChange={setEnableCameraProctoring} />
                </div>

                {renderLivePracticeConsentCard({ id: 'setup-live-practice-consent' })}

                {enableAdaptive && (
                  <>
                    <div className="space-y-3.5">
                      <div className="space-y-1.5">
                        <label htmlFor="domain" className="px-eyebrow">
                          <Cpu className="w-3 h-3" />
                          Domain / specialisation <span style={toneColor('critical')}>*</span>
                        </label>
                        <input
                          id="domain"
                          className="px-field"
                          placeholder="e.g., Python Backend Development"
                          value={profileDomain}
                          onChange={(e) => setProfileDomain(e.target.value)}
                          maxLength={512}
                        />
                        <p className="px-note">Your primary technical domain.</p>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="experience" className="px-eyebrow">
                          <TrendingUp className="w-3 h-3" />
                          Years of experience <span style={toneColor('critical')}>*</span>
                        </label>
                        <input
                          id="experience"
                          type="number"
                          className="px-field px-num"
                          min="0"
                          max="50"
                          placeholder="e.g., 5"
                          value={profileExperience === null ? '' : profileExperience}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') { setProfileExperience(null); return; }
                            const n = parseInt(raw, 10);
                            setProfileExperience(Number.isNaN(n) ? null : n);
                          }}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="skills" className="px-eyebrow">
                          <ListChecks className="w-3 h-3" />
                          Key skills <span style={toneColor('critical')}>*</span>
                        </label>
                        <input
                          id="skills"
                          className="px-field"
                          placeholder="e.g., Python, Django, AWS"
                          value={profileSkills}
                          onChange={(e) => setProfileSkills(e.target.value)}
                          maxLength={512}
                        />
                        <p className="px-note">Comma-separated.</p>
                      </div>
                    </div>

                    <div className="pt-1">
                      <Eyebrow>Optional — sharpens targeting</Eyebrow>
                      <div className="mt-3 space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label htmlFor="jobRole" className="px-eyebrow">Target role</label>
                            <input
                              id="jobRole"
                              className="px-field"
                              placeholder="Senior Engineer"
                              value={profileJobRole}
                              onChange={(e) => setProfileJobRole(e.target.value)}
                              maxLength={512}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label htmlFor="company" className="px-eyebrow">Company type</label>
                            <input
                              id="company"
                              className="px-field"
                              placeholder="FAANG, Startup"
                              value={profileCompany}
                              onChange={(e) => setProfileCompany(e.target.value)}
                              maxLength={512}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="focus" className="px-eyebrow">Focus areas</label>
                          <input
                            id="focus"
                            className="px-field"
                            placeholder="System Design, API Design"
                            value={profileFocus}
                            onChange={(e) => setProfileFocus(e.target.value)}
                            maxLength={512}
                          />
                          <p className="px-note">Comma-separated topics.</p>
                        </div>
                      </div>
                    </div>

                    {!adaptiveProfileReady && (
                      <div
                        className="px-panel px-panel--inset flex items-center gap-2.5 px-3.5 py-3"
                        style={{ borderColor: `hsl(${toneVar('caution')} / 0.3)` }}
                      >
                        <TriangleAlert className="w-4 h-4 shrink-0" style={toneColor('caution')} />
                        <p className="px-body px-body--tight">Fill the three required fields to continue.</p>
                      </div>
                    )}
                  </>
                )}
              </PanelBody>

              <div className="px-panel__foot flex gap-3">
                <PxButton variant="outline" size="lg" className="flex-1" onClick={() => setPhase('welcome')}>
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </PxButton>
                <PxButton
                  variant="primary"
                  size="lg"
                  className="flex-[1.4]"
                  onClick={handleStartInterview}
                  disabled={isProcessing || !livePracticeConsentChecked || (enableAdaptive && !adaptiveProfileReady)}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {enableAdaptive ? 'Generate Questions' : 'Begin Interview'}
                    </>
                  )}
                </PxButton>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'question' || phase === 'recording') {
    const fullQuestionText = getQuestionPromptText(currentQuestion);
    const deliveredQuestionText = streamedQuestionText || '';
    const displayedQuestionDifficulty = currentQuestion?.difficulty ?? selectedDifficulty;
    const autoStartVoiceRecording = !isCodingQuestion(currentQuestion) && (
      (currentQuestion as any)?.auto_start_recording === true ||
      String((currentQuestion as any)?.question_type ?? '').toUpperCase() === 'VOICE'
    );

    const isCodeQuestion = isCodingQuestion(currentQuestion);
    const questionTone: PxTone = isCodeQuestion ? 'neural' : 'accent';
    const timeLimit = Number(currentQuestion?.time_limit) || 0;
    // Countdown pressure drives the timer's tone: informational until the last
    // stretch, then caution, then critical — so colour tracks urgency instead of
    // being decorative.
    const timerTone: PxTone = timeRemaining <= 10 ? 'critical' : timeRemaining <= 30 ? 'caution' : 'accent';
    const timeElapsedPct = timeLimit > 0 ? Math.max(0, Math.min(100, ((timeLimit - timeRemaining) / timeLimit) * 100)) : 0;

    return (
      /* A voice question is a single screen: it claims the viewport and never
         scrolls, so the prompt, the timer, and the controls are all in view at
         once. A coding question needs room for the editor, so that branch keeps
         its own scroller. */
      <div className={cx('px px-shell h-full', isCodeQuestion ? 'overflow-y-auto scrollbar-hide' : 'overflow-hidden')}>
        {renderFacePreview()}
        {renderFaceWarningOverlay()}
        {renderProctoringStatusPanel()}

        <div
          className={cx(
            // --wide (88rem) rather than --mid (74rem). This is the densest
            // screen in the product -- question, timer, transcript, recorder,
            // and for coding questions an editor -- and at 74rem on a 1080p+
            // display it left a large empty margin either side. The left one
            // reads as intentional because the camera feed floats there; the
            // right holds only the proctoring chip, so it looked broken.
            'px-frame px-frame--wide py-3 sm:py-4 flex flex-col gap-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
            !isCodeQuestion && 'h-full',
          )}
        >
          {renderGuestGateBanner()}

          {/* A drill skips the Live Practice consent card, because that card is
              about screen and camera capture which a drill does not perform. It
              does record the microphone, so say so plainly rather than not at all. */}
          {isDrillSession && (
            <div className="px-panel px-panel--inset flex items-start gap-2.5 px-3.5 py-2 shrink-0">
              <Mic className="w-3.5 h-3.5 mt-0.5 shrink-0" style={toneColor('accent')} />
              <span className="px-note">
                Your microphone records this answer so it can be scored. No screen or camera capture.
              </span>
            </div>
          )}

          {/* ── Session HUD ── */}
          <Panel className="overflow-hidden px-fade shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="px-num text-[0.625rem] px-ink-3 tracking-[0.14em]">
                  Q{String(currentQuestionNumber).padStart(2, '0')}
                  <span className="opacity-50"> / {String(totalQuestions).padStart(2, '0')}</span>
                </span>
                <span className="w-px h-4 bg-[hsl(var(--px-line))]" aria-hidden />
                <div className="flex flex-wrap items-center gap-1.5">
                  {isDrillSession && (
                    <Chip tone="accent" icon={Mic}>
                      Drill
                    </Chip>
                  )}
                  {currentRoundConfig && <Chip icon={Target}>{currentRoundConfig.name}</Chip>}
                  <Chip tone={questionTone} icon={isCodeQuestion ? SquareCode : Mic}>
                    {isCodeQuestion ? 'Code' : 'Voice'}
                    {currentQuestion?.programming_language ? ` · ${currentQuestion.programming_language}` : ''}
                  </Chip>
                  <Chip mono className="capitalize">{String(displayedQuestionDifficulty ?? '')}</Chip>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {(isProcessing || isSubmittingCode) && (
                  <span className="px-note inline-flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Submitting
                  </span>
                )}

                <span
                  className="px-num text-[0.8125rem] font-semibold inline-flex items-center gap-1.5"
                  style={toneColor(phase === 'recording' ? timerTone : 'neutral')}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {phase === 'recording' ? formatTime(timeRemaining) : `${timeLimit}s`}
                </span>

                <PxButton variant="danger" size="sm" onClick={handleEndPractice}>
                  End
                </PxButton>
              </div>
            </div>

            <div className="px-4 pb-2.5">
              <Ticks total={totalQuestions} current={currentQuestionNumber} />
            </div>
          </Panel>

          {/* ── Question ──
              A coding question hands the whole stage to the editor, which owns
              its own panels; wrapping it again would nest one surface inside
              another and duplicate the prompt header. */}
          {isCodeQuestion ? (
            <div key={currentQuestionRenderKey} className="px-rise">
              <InterviewCodeEditor
                question={{
                  ...(currentQuestion as Question),
                  question_text: deliveredQuestionText || (fullQuestionText ? '…' : ''),
                  text: deliveredQuestionText || (fullQuestionText ? '…' : ''),
                }}
                onSubmit={handleSubmitCode}
                isSubmitting={isSubmittingCode}
                testResults={codeTestResults || undefined}
                evaluation={codeEvaluation || undefined}
                timeRemaining={timeRemaining}
                onTimeUp={() => {
                  if (phase === 'question') {
                    toast({
                      title: 'Time\'s up',
                      description: 'Submitting your current code...',
                      variant: 'warning',
                    });
                  }
                }}
              />
            </div>
          ) : (
            <Panel
              key={currentQuestionRenderKey}
              variant="raised"
              brackets={phase === 'recording'}
              className="flex-1 min-h-0 flex flex-col overflow-hidden px-rise"
            >
              <Seam tone={phase === 'recording' ? 'critical' : questionTone} />

              {/* Prompt block — fixed to its content; the stage takes the slack. */}
              <div className="shrink-0 px-5 sm:px-7 pt-4 pb-4 border-b border-[hsl(var(--px-line-soft))]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Eyebrow tone={questionTone} icon={MessageSquare}>
                      {currentQuestion?.category ? String(currentQuestion.category).replace(/_/g, ' ') : 'Interview question'}
                    </Eyebrow>
                    <h2 className="mt-2.5 text-[1.0625rem] sm:text-[1.1875rem] font-semibold leading-[1.45] tracking-[-0.012em] px-ink text-pretty max-w-3xl">
                      {deliveredQuestionText || (fullQuestionText ? '…' : 'No question text available')}
                    </h2>
                  </div>

                  {enableTTS && (
                    <PxButton
                      variant="outline"
                      iconOnly
                      size="sm"
                      aria-label="Replay question audio"
                      onClick={() => {
                        if (currentQuestion && sessionId) {
                          // Replay audio logic here
                        }
                      }}
                      disabled={isPlayingAudio}
                    >
                      {isPlayingAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </PxButton>
                  )}
                </div>

                {/* Time budget reads as a burn-down bar while recording. */}
                {timeLimit > 0 && (
                  <div className="mt-4 flex items-center gap-3">
                    <span className="px-eyebrow shrink-0">Time budget</span>
                    <Meter
                      value={phase === 'recording' ? 100 - timeElapsedPct : 100}
                      tone={phase === 'recording' ? timerTone : 'neutral'}
                      className="flex-1"
                    />
                    <span className="px-num text-[0.6875rem] px-ink-3 shrink-0">{timeLimit}s</span>
                  </div>
                )}
              </div>

              {/* Stage — absorbs whatever height is left, centred within it. */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col items-center justify-center gap-4 px-5 py-5">
                {phase === 'recording' ? (
                  <>
                    {/* Live waveform, driven by the analyser's level. */}
                    <div className="px-wave" style={{ ['--px-wave-hue' as string]: toneVar('critical') }}>
                      {[...Array(19)].map((_, i) => {
                        const centre = 9;
                        const position = Math.abs(i - centre) / centre;
                        const heightMultiplier = (1 - position * 0.55) * audioLevel;
                        const height = 4 + (84 - 4) * Math.max(0, heightMultiplier);
                        return (
                          <span
                            key={i}
                            className="px-wave__bar"
                            style={{ height: `${height}px`, opacity: 0.45 + audioLevel * 0.55 }}
                          />
                        );
                      })}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <span
                        className="inline-flex items-center gap-2 px-3.5 h-8 rounded-full border px-num text-[0.875rem] font-semibold"
                        style={{
                          color: `hsl(${toneVar('critical')})`,
                          borderColor: `hsl(${toneVar('critical')} / 0.36)`,
                          background: `hsl(${toneVar('critical')} / 0.1)`,
                        }}
                      >
                        <StatusDot tone="critical" live />
                        REC {formatTime(recordingTime)}
                      </span>
                      <h3 className="px-title">Recording your answer</h3>
                      <p className="px-body text-center max-w-sm">
                        Speak clearly and at a natural pace. Stop when you have finished your point.
                      </p>
                    </div>

                    <PxButton variant="danger" size="lg" onClick={handleStopRecording} disabled={isProcessing}>
                      <MicOff className="w-4 h-4" />
                      Stop &amp; Submit
                    </PxButton>
                  </>
                ) : (isPlayingAudio || isAudioLoading) ? (
                  <>
                    <div className="px-orb" style={{ ['--px-orb-hue' as string]: toneVar('neural'), ['--px-orb-size' as string]: '6.5rem' }}>
                      <Volume2 className="w-10 h-10" />
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <Chip tone="neural" icon={Bot}>
                        Interviewer speaking
                      </Chip>
                      <h3 className="px-title">Listen to the question</h3>
                      <p className="px-body text-center max-w-sm">
                        The AI interviewer is reading the question aloud. Recording opens as soon as it finishes.
                      </p>
                    </div>

                    <div className="w-40">
                      <div className="px-sweep" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-orb" style={{ ['--px-orb-size' as string]: '6.5rem' }}>
                      <Mic className="w-10 h-10" />
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <Eyebrow tone="accent">Standing by</Eyebrow>
                      <h3 className="px-title">Ready to answer</h3>
                      <p className="px-body text-center max-w-sm">
                        {autoStartVoiceRecording
                          ? 'Recording starts on its own once the question is ready. The timer begins with the recording.'
                          : 'Start recording when you are ready. The timer begins with the recording, not before.'}
                      </p>
                    </div>

                    <PxButton variant="primary" size="lg" onClick={handleStartRecording} disabled={isProcessing}>
                      <Mic className="w-4 h-4" />
                      Start Recording
                    </PxButton>
                  </>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'processing') {
    return (
      <div className="px px-shell min-h-full grid place-items-center">
        {renderFacePreview()}
        {renderFaceWarningOverlay()}
        {renderProctoringStatusPanel()}

        <div className="px-frame px-frame--narrow py-16 flex flex-col items-center gap-6 px-fade">
          <div className="px-orb" style={{ ['--px-orb-size' as string]: '5.5rem' }}>
            <Brain className="w-8 h-8" />
          </div>
          <div className="text-center">
            <Eyebrow tone="accent">Evaluating</Eyebrow>
            <h3 className="px-title mt-2">Analysing your response</h3>
            <p className="px-body mt-1.5 max-w-xs mx-auto">
              Transcribing, scoring correctness, and measuring delivery.
            </p>
          </div>
          <div className="w-48">
            <div className="px-sweep" />
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'feedback') {
    const questionId = currentQuestion?.id;
    const ratingDraft = questionId ? feedbackRatingDraftByQuestion[questionId] : undefined;
    const usefulnessRating = ratingDraft?.usefulnessRating;
    const perceivedDifficulty = ratingDraft?.perceivedDifficulty;
    const comment = ratingDraft?.comment ?? '';

    const ratingSubmitted = !!(questionId && ratedByQuestion[questionId]);
    const ratingSubmitting = !!(questionId && ratingSubmittingByQuestion[questionId]);

    const isCodeQ = currentQuestion ? isCodingQuestion(currentQuestion) : false;
    const persistedCodeEvaluation = isCodeQ
      ? [...questionEvaluations]
        .reverse()
        .find((item) => item.kind === 'code' && item.questionId === (currentQuestion?.id || currentQuestionNumber))
      : undefined;
    const activeCodeEvaluation = codeEvaluation ?? persistedCodeEvaluation?.codeEvaluation ?? null;
    const activeCodeTestResults = codeTestResults ?? persistedCodeEvaluation?.testResults ?? null;
    const feedbackTone = getStrategyTone(strategyPreview?.coaching_style);
    const feedbackBadgeLabel = getStrategyBadgeLabel(strategyPreview);
    const feedbackHeadline = getStrategyHeadline(
      strategyPreview,
      feedbackRequiresAcknowledgment
        ? 'Review the feedback, then continue when you’re ready.'
        : 'Here’s what comes next.'
    );
    const feedbackReasonText = formatStrategyReason(strategyPreview?.reason ?? null);
    const feedbackActionLabel = getStrategyActionLabel(strategyPreview?.action);
    const feedbackDepthLabel = getStrategyDepthLabel(strategyPreview?.follow_up_depth);
    const feedbackGuardrail = getStrategyGuardrailText(strategyPreview?.decision_trace?.guardrail);
    const feedbackPressureMode = formatStrategyTokenLabel(
      strategyPreview?.decision_trace?.pressure_mode ?? pressure?.mode ?? null
    );
    const feedbackButtonLabel = completionPending
      ? 'Finish'
      : feedbackRequiresAcknowledgment
        ? 'Continue'
        : 'Next Question';
    const showFeedbackPreview = Boolean(strategyPreview?.action || feedbackReasonText || feedbackRequiresAcknowledgment);

    const correctnessScore = microFeedback?.correctness_score;
    const confidencePct = Math.round((speechMetrics?.confidence_score || 0) * 100);
    const silenceRemoved = speechMetrics?.silence_removed ?? 0;
    const recordingDuration = speechMetrics?.duration || 0;

    return (
      <div className="px px-shell min-h-full">
        {renderProctoringStatusPanel()}

        <div className="px-frame px-frame--narrow py-4 sm:py-5 flex flex-col gap-3 pb-8">

          {/* ── Header ── */}
          <div className="flex items-end justify-between gap-3 px-fade">
            <div className="min-w-0">
              <Eyebrow tone={isCodeQ ? 'neural' : 'accent'} icon={isCodeQ ? SquareCode : Waves}>
                {isCodeQ ? 'Code evaluation' : 'Answer evaluation'}
              </Eyebrow>
              <h2 className="px-title mt-2">
                Question {currentQuestionNumber} feedback
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {completionPending && <Chip tone="accent">Final</Chip>}
              <Chip mono>
                {String(currentQuestionNumber).padStart(2, '0')}/{String(totalQuestions).padStart(2, '0')}
              </Chip>
            </div>
          </div>

          {/* ── What the coach does next ── */}
          {showFeedbackPreview && (
            <Panel tone={feedbackTone} className="overflow-hidden px-rise">
              <Seam tone={feedbackTone} />
              <PanelBody>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Eyebrow tone={feedbackTone} icon={Compass}>
                      Coming up next
                    </Eyebrow>
                    {feedbackBadgeLabel && (
                      <div className="mt-2">
                        <Chip tone={feedbackTone}>{feedbackBadgeLabel}</Chip>
                      </div>
                    )}
                    <p className="px-subtitle mt-2.5">{feedbackHeadline}</p>
                    {feedbackReasonText && <p className="px-body mt-1.5">{feedbackReasonText}</p>}
                  </div>

                  {feedbackRequiresAcknowledgment && (
                    <span className="px-note shrink-0">Continue when you’re ready.</span>
                  )}
                </div>

                {strategyDebugMode && strategyPreview?.decision_trace && (
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <button className="px-focusable mt-3 w-full flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--px-r-sm)] border border-[hsl(var(--px-line))]">
                        <span className="text-left">
                          <span className="block text-[0.8125rem] font-semibold px-ink">Debug details</span>
                          <span className="block px-note">Internal adaptation metadata for power users.</span>
                        </span>
                        <ChevronDown className="w-4 h-4 px-ink-3" />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-3">
                      <div className="flex flex-wrap gap-2">
                        <Chip mono>Action: {feedbackActionLabel}</Chip>
                        {feedbackDepthLabel && <Chip mono>Depth: {feedbackDepthLabel}</Chip>}
                        {strategyPreview?.target_difficulty && (
                          <Chip mono className="capitalize">Difficulty: {strategyPreview.target_difficulty}</Chip>
                        )}
                        {strategyPreview?.coaching_style && (
                          <Chip mono className="capitalize">Style: {strategyPreview.coaching_style}</Chip>
                        )}
                      </div>

                      {(feedbackGuardrail || feedbackPressureMode) && (
                        <Grid cols={1} sm={2}>
                          {feedbackGuardrail && (
                            <div className="px-panel px-panel--inset px-3 py-2">
                              <Eyebrow>Guardrail</Eyebrow>
                              <div className="px-body px-body--tight mt-1">{feedbackGuardrail}</div>
                            </div>
                          )}
                          {feedbackPressureMode && (
                            <div className="px-panel px-panel--inset px-3 py-2">
                              <Eyebrow>Pressure mode</Eyebrow>
                              <div className="px-body px-body--tight mt-1">{feedbackPressureMode}</div>
                            </div>
                          )}
                        </Grid>
                      )}

                      {strategyPreview.decision_trace.follow_up_budget && (
                        <div className="px-panel px-panel--inset px-3 py-2">
                          <Eyebrow>Follow-up budget</Eyebrow>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {typeof strategyPreview.decision_trace.follow_up_budget.used === 'number' && (
                              <Chip mono>Used {strategyPreview.decision_trace.follow_up_budget.used}</Chip>
                            )}
                            {typeof strategyPreview.decision_trace.follow_up_budget.max === 'number' && (
                              <Chip mono>Max {strategyPreview.decision_trace.follow_up_budget.max}</Chip>
                            )}
                            {typeof strategyPreview.decision_trace.follow_up_budget.remaining === 'number' && (
                              <Chip mono>Remaining {strategyPreview.decision_trace.follow_up_budget.remaining}</Chip>
                            )}
                          </div>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </PanelBody>
            </Panel>
          )}

          {/* ══ CODE FEEDBACK ══ */}
          {isCodeQ && (
            <>
              {activeCodeEvaluation && (
                <Panel variant="raised" className="overflow-hidden px-rise">
                  <Seam tone={activeCodeEvaluation.is_correct ? 'positive' : 'caution'} />
                  <PanelHead
                    eyebrow="Verdict"
                    icon={SquareCode}
                    tone="neural"
                    title="Code evaluation"
                    actions={
                      <Chip tone={activeCodeEvaluation.is_correct ? 'positive' : 'critical'} size="lg">
                        {activeCodeEvaluation.is_correct ? 'Accepted' : 'Not accepted'}
                      </Chip>
                    }
                  />
                  <PanelBody className="space-y-4">
                    <Grid cols={2} sm={3}>
                      <StatTile
                        label="Overall"
                        value={activeCodeEvaluation.overall_score ?? 0}
                        unit="%"
                        tone={getScoreTone(Number(activeCodeEvaluation.overall_score) || 0)}
                        icon={Gauge}
                      />
                      {activeCodeEvaluation.test_cases_total !== undefined && (
                        <StatTile
                          label="Tests passed"
                          value={`${activeCodeEvaluation.test_cases_passed ?? 0}/${activeCodeEvaluation.test_cases_total}`}
                          tone={
                            (activeCodeEvaluation.test_cases_passed ?? 0) === activeCodeEvaluation.test_cases_total
                              ? 'positive'
                              : 'caution'
                          }
                          icon={ListChecks}
                        />
                      )}
                      {(activeCodeEvaluation.time_complexity || activeCodeEvaluation.space_complexity) && (
                        <StatTile
                          label="Complexity"
                          value={activeCodeEvaluation.time_complexity || '—'}
                          foot={
                            activeCodeEvaluation.space_complexity
                              ? `Space ${activeCodeEvaluation.space_complexity}`
                              : undefined
                          }
                          tone="neural"
                          icon={Cpu}
                        />
                      )}
                    </Grid>

                    <div className="space-y-3">
                      <Eyebrow>Score breakdown</Eyebrow>
                      {[
                        { label: 'Correctness', value: Number(activeCodeEvaluation.correctness_score) || 0 },
                        { label: 'Code quality', value: Number(activeCodeEvaluation.code_quality_score) || 0 },
                        { label: 'Efficiency', value: Number(activeCodeEvaluation.efficiency_score) || 0 },
                      ].map(({ label, value }) => (
                        <MeterRow key={label} label={label} value={value} tone={getScoreTone(value)} />
                      ))}
                    </div>
                  </PanelBody>
                </Panel>
              )}

              {activeCodeTestResults && activeCodeTestResults.length > 0 && (
                <Panel className="overflow-hidden px-rise">
                  <PanelHead
                    eyebrow="Test results"
                    icon={ListChecks}
                    title={`${activeCodeTestResults.filter((t) => t.passed).length} of ${activeCodeTestResults.length} passed`}
                  />
                  <PanelBody className="space-y-2">
                    {activeCodeTestResults.map((test, idx) => (
                      <div
                        key={idx}
                        className="px-panel px-panel--inset px-3 py-2.5"
                        style={{ borderColor: `hsl(${toneVar(test.passed ? 'positive' : 'critical')} / 0.28)` }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-num text-[0.75rem] font-semibold px-ink">
                            Case {test.test_case_number}
                          </span>
                          <Chip tone={test.passed ? 'positive' : 'critical'}>
                            {test.passed ? 'Passed' : 'Failed'}
                          </Chip>
                        </div>
                        {!test.passed && (
                          <div className="mt-2 space-y-1">
                            {test.expected_output && (
                              <div className="px-note">
                                <span className="font-semibold px-ink-2">Expected </span>
                                <span className="px-num">{test.expected_output}</span>
                              </div>
                            )}
                            {test.actual_output && (
                              <div className="px-note">
                                <span className="font-semibold px-ink-2">Got </span>
                                <span className="px-num">{test.actual_output}</span>
                              </div>
                            )}
                            {test.error_message && (
                              <div className="px-note" style={toneColor('critical')}>
                                {test.error_message}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </PanelBody>
                </Panel>
              )}

              {activeCodeEvaluation?.approach_feedback && (
                <Panel className="overflow-hidden px-rise">
                  <PanelHead eyebrow="Approach" icon={Lightbulb} tone="accent" />
                  <PanelBody>
                    <p className="px-body whitespace-pre-wrap">{activeCodeEvaluation.approach_feedback}</p>
                  </PanelBody>
                </Panel>
              )}

              {activeCodeEvaluation && (
                (activeCodeEvaluation.edge_cases_handled?.length || activeCodeEvaluation.edge_cases_missed?.length) ? (
                  <Grid cols={1} md={2} gap="0.75rem">
                    {activeCodeEvaluation.edge_cases_handled && activeCodeEvaluation.edge_cases_handled.length > 0 && (
                      <Panel tone="positive" className="overflow-hidden px-rise">
                        <PanelHead eyebrow="Edge cases handled" icon={CheckCircle2} tone="positive" />
                        <PanelBody>
                          <FindingList items={activeCodeEvaluation.edge_cases_handled} tone="positive" />
                        </PanelBody>
                      </Panel>
                    )}
                    {activeCodeEvaluation.edge_cases_missed && activeCodeEvaluation.edge_cases_missed.length > 0 && (
                      <Panel tone="critical" className="overflow-hidden px-rise">
                        <PanelHead eyebrow="Edge cases missed" icon={CircleX} tone="critical" />
                        <PanelBody>
                          <FindingList items={activeCodeEvaluation.edge_cases_missed} tone="critical" />
                        </PanelBody>
                      </Panel>
                    )}
                  </Grid>
                ) : null
              )}

              {activeCodeEvaluation?.optimization_suggestions && activeCodeEvaluation.optimization_suggestions.length > 0 && (
                <Panel className="overflow-hidden px-rise">
                  <PanelHead eyebrow="Optimisation" icon={Rocket} tone="accent" />
                  <PanelBody>
                    <FindingList items={activeCodeEvaluation.optimization_suggestions} tone="accent" numbered />
                  </PanelBody>
                </Panel>
              )}

              {!activeCodeEvaluation && (!activeCodeTestResults || activeCodeTestResults.length === 0) && (
                <EmptyState
                  icon={SquareCode}
                  title="No evaluation returned"
                  hint="The server did not send evaluation details for this submission."
                />
              )}
            </>
          )}

          {/* ══ VOICE FEEDBACK ══ */}
          {!isCodeQ && (
            <>
              {strategyDebugMode && pressure && (pressure.mode || pressure.reason) && (
                <Panel className="overflow-hidden">
                  <PanelBody tight className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Eyebrow>Mode</Eyebrow>
                      {pressure.reason && <p className="px-body mt-1">{pressure.reason}</p>}
                    </div>
                    {pressure.mode && <Chip mono className="capitalize">{pressure.mode}</Chip>}
                  </PanelBody>
                </Panel>
              )}

              {/* Delivery instrumentation */}
              <Grid cols={3} gap="0.625rem" className="px-rise">
                <StatTile
                  label="Pace"
                  value={speechMetrics?.wpm || 0}
                  unit="wpm"
                  icon={Activity}
                  tone="accent"
                  foot={
                    (speechMetrics?.wpm || 0) > 170
                      ? 'A little fast'
                      : (speechMetrics?.wpm || 0) < 110 && (speechMetrics?.wpm || 0) > 0
                        ? 'A little slow'
                        : 'In range'
                  }
                />
                <StatTile
                  label="Confidence"
                  value={confidencePct}
                  unit="%"
                  icon={Gauge}
                  tone={getScoreTone(confidencePct)}
                />
                <StatTile
                  label="Fillers"
                  value={speechMetrics?.filler_count || 0}
                  icon={CircleDot}
                  tone={(speechMetrics?.filler_count || 0) > 8 ? 'caution' : 'positive'}
                  foot="um, uh, like"
                />
              </Grid>

              {/* Silence removed by VAD */}
              {silenceRemoved > 0 && (
                <Panel tone="caution" className="overflow-hidden px-rise">
                  <PanelHead
                    eyebrow="Dead air detected"
                    icon={Hourglass}
                    tone="caution"
                    title={`${silenceRemoved.toFixed(1)}s of silence removed`}
                    description="Voice Activity Detection stripped long pauses before scoring. Speaking more continuously keeps an interviewer with you."
                  />
                  <PanelBody className="space-y-3">
                    <Grid cols={3} gap="0.625rem">
                      <StatTile
                        label="Speaking"
                        value={Math.max(0, recordingDuration - silenceRemoved).toFixed(1)}
                        unit="s"
                        tone="positive"
                      />
                      <StatTile label="Silence" value={silenceRemoved.toFixed(1)} unit="s" tone="caution" />
                      <StatTile label="Recorded" value={recordingDuration.toFixed(1)} unit="s" tone="neutral" />
                    </Grid>
                    <div className="space-y-1.5">
                      <Meter
                        value={Math.min(100, (silenceRemoved / (recordingDuration || 1)) * 100)}
                        tone="caution"
                      />
                      <p className="px-note">
                        {((silenceRemoved / (recordingDuration || 1)) * 100).toFixed(1)}% of the recording was silence.
                      </p>
                    </div>
                  </PanelBody>
                </Panel>
              )}

              {/* Transcript */}
              <Panel className="overflow-hidden px-rise">
                <PanelHead eyebrow="Your answer" icon={FileText} tone="accent" />
                <PanelBody>
                  <ScrollArea className="max-h-40">
                    <p className="px-body whitespace-pre-wrap">
                      {transcription || <span className="px-ink-3">No transcript was returned for this answer.</span>}
                    </p>
                  </ScrollArea>
                </PanelBody>
              </Panel>

              {/* Correctness */}
              {correctnessScore !== undefined && (
                <Panel variant="raised" className="overflow-hidden px-rise">
                  <Seam tone={getScoreTone(Number(correctnessScore) || 0)} />
                  <PanelHead
                    eyebrow="Content"
                    icon={Target}
                    tone={getScoreTone(Number(correctnessScore) || 0)}
                    title="Answer correctness"
                    actions={
                      <div className="flex items-center gap-2">
                        {microFeedback?.technical_accuracy && (
                          <Chip
                            tone={
                              microFeedback.technical_accuracy === 'Excellent'
                                ? 'positive'
                                : microFeedback.technical_accuracy === 'Good'
                                  ? 'accent'
                                  : microFeedback.technical_accuracy === 'Fair'
                                    ? 'caution'
                                    : 'critical'
                            }
                          >
                            {microFeedback.technical_accuracy}
                          </Chip>
                        )}
                        <Chip tone={microFeedback?.is_correct ? 'positive' : 'critical'} size="lg">
                          {microFeedback?.is_correct ? 'On target' : 'Off target'}
                        </Chip>
                      </div>
                    }
                  />
                  <PanelBody className="space-y-4">
                    <div className="flex items-center gap-5">
                      <Dial value={Number(correctnessScore) || 0} size={104} stroke={7} tone={getScoreTone(Number(correctnessScore) || 0)}>
                        <div>
                          <div className="px-num text-2xl font-semibold px-ink leading-none">{correctnessScore}</div>
                          <div className="px-eyebrow mt-1 justify-center">score</div>
                        </div>
                      </Dial>
                      <div className="min-w-0 flex-1">
                        <p className="px-body">
                          {microFeedback?.overall_note || microFeedback?.content_relevance ||
                            'Correctness reflects how much of the expected substance your answer covered.'}
                        </p>
                      </div>
                    </div>

                    {microFeedback?.key_points_covered && microFeedback.key_points_covered.length > 0 && (
                      <div>
                        <Eyebrow tone="positive" icon={CheckCircle2}>Key points covered</Eyebrow>
                        <div className="mt-1.5">
                          <FindingList items={microFeedback.key_points_covered} tone="positive" />
                        </div>
                      </div>
                    )}

                    {microFeedback?.key_points_missed && microFeedback.key_points_missed.length > 0 && (
                      <div>
                        <Eyebrow tone="critical" icon={CircleX}>Key points missed</Eyebrow>
                        <div className="mt-1.5">
                          <FindingList items={microFeedback.key_points_missed} tone="critical" />
                        </div>
                      </div>
                    )}

                    <Grid cols={1} md={2} gap="0.875rem">
                      {microFeedback?.strengths && microFeedback.strengths.length > 0 && (
                        <div>
                          <Eyebrow tone="positive" icon={Award}>Strengths</Eyebrow>
                          <div className="mt-1.5">
                            <FindingList items={microFeedback.strengths} tone="positive" />
                          </div>
                        </div>
                      )}
                      {microFeedback?.improvement_areas && microFeedback.improvement_areas.length > 0 && (
                        <div>
                          <Eyebrow tone="caution" icon={TrendingUp}>Areas to improve</Eyebrow>
                          <div className="mt-1.5">
                            <FindingList items={microFeedback.improvement_areas} tone="caution" />
                          </div>
                        </div>
                      )}
                    </Grid>

                    {microFeedback?.actionable_suggestions && microFeedback.actionable_suggestions.length > 0 && (
                      <div>
                        <Eyebrow tone="accent" icon={Target}>Next steps</Eyebrow>
                        <div className="mt-1.5">
                          <FindingList items={microFeedback.actionable_suggestions} tone="accent" numbered />
                        </div>
                      </div>
                    )}

                    {microFeedback?.model_answer && (
                      <div className="px-panel px-panel--inset px-3.5 py-3">
                        <Eyebrow tone="positive" icon={GraduationCap}>Model answer</Eyebrow>
                        <p className="px-body mt-2 whitespace-pre-wrap">{microFeedback.model_answer}</p>
                      </div>
                    )}
                  </PanelBody>
                </Panel>
              )}

              {/* Why this score */}
              {evaluationTrace && (() => {
                // Normalize `why` to string[] — handle string, array, or object shapes
                let whyLines: string[] = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const raw: any = (evaluationTrace as any).why;
                if (Array.isArray(raw)) {
                  whyLines = raw.map(String).filter(Boolean);
                } else if (typeof raw === 'string' && raw.trim()) {
                  whyLines = raw.split(/\n|(?<=\.)\s+/).map((s: string) => s.trim()).filter(Boolean);
                }
                // Also check for alternative keys the backend might use
                if (whyLines.length === 0) {
                  const alt = (evaluationTrace as any).reasons ?? (evaluationTrace as any).explanation ?? (evaluationTrace as any).reasoning;
                  if (Array.isArray(alt)) {
                    whyLines = alt.map(String).filter(Boolean);
                  } else if (typeof alt === 'string' && alt.trim()) {
                    whyLines = alt.split(/\n|(?<=\.)\s+/).map((s: string) => s.trim()).filter(Boolean);
                  }
                }
                if (whyLines.length === 0) return null;
                return (
                  <Panel className="overflow-hidden px-rise">
                    <PanelHead eyebrow="Why this score" icon={Brain} tone="neural" />
                    <PanelBody>
                      <FindingList items={whyLines} tone="neural" />
                    </PanelBody>
                  </Panel>
                );
              })()}

              {/* Session trajectory */}
              {trajectory && (trajectory.points || trajectory.overall || trajectory.dimensions || trajectory.note) && (
                <Panel className="overflow-hidden px-rise">
                  <PanelHead
                    eyebrow="Session trajectory"
                    icon={TrendingUp}
                    tone="accent"
                    actions={
                      typeof trajectory?.overall?.delta === 'number' ? (
                        <Chip
                          mono
                          tone={
                            trajectory.overall.delta > 0
                              ? 'positive'
                              : trajectory.overall.delta < 0
                                ? 'critical'
                                : 'neutral'
                          }
                        >
                          Δ {trajectory.overall.delta > 0 ? '+' : ''}
                          {Math.round(trajectory.overall.delta * 100) / 100}
                        </Chip>
                      ) : undefined
                    }
                  />
                  <PanelBody className="space-y-3">
                    {typeof trajectory.note === 'string' && trajectory.note.trim() && (
                      <p className="px-body">{trajectory.note}</p>
                    )}

                    {trajectory.dimensions && typeof trajectory.dimensions === 'object' && (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(trajectory.dimensions as Record<string, any>).map(([dim, info]) => {
                          const delta = (info as any)?.delta;
                          if (typeof delta !== 'number') return null;
                          const rounded = Math.round(delta * 100) / 100;
                          return (
                            <Chip
                              key={dim}
                              mono
                              tone={rounded > 0 ? 'positive' : rounded < 0 ? 'critical' : 'neutral'}
                              className="capitalize"
                            >
                              {dim} {rounded > 0 ? '+' : ''}{rounded}
                            </Chip>
                          );
                        })}
                      </div>
                    )}

                    {Array.isArray(trajectory.points) && trajectory.points.length > 0 && (
                      <Rows>
                        {trajectory.points.map((p: any, idx: number) => {
                          const qn = p?.question_number ?? p?.question ?? idx + 1;
                          const overall = p?.overall ?? p?.overall_score;
                          const dims = p?.dimensions ?? p?.dimension_scores;
                          const roundedOverall = typeof overall === 'number' ? Math.round(overall * 100) / 100 : null;
                          return (
                            <div key={idx} className="px-row items-center">
                              <span className="px-row__index">{qn}</span>
                              <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                {roundedOverall !== null && (
                                  <span className="px-num text-[0.8125rem] font-semibold px-ink">{roundedOverall}</span>
                                )}
                                {dims && typeof dims === 'object' && (
                                  <span className="px-note px-num">
                                    {Object.entries(dims as Record<string, any>)
                                      .filter(([, v]) => typeof v === 'number')
                                      .slice(0, 4)
                                      .map(([k, v]) => `${k} ${Math.round((v as number) * 100) / 100}`)
                                      .join('  ·  ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </Rows>
                    )}
                  </PanelBody>
                </Panel>
              )}

              {/* Delivery tips */}
              <Panel className="overflow-hidden px-rise">
                <PanelHead eyebrow="Delivery" icon={Waves} tone="accent" />
                <PanelBody className="space-y-4">
                  {microFeedback?.delivery_tips && microFeedback.delivery_tips.length > 0 ? (
                    <Rows>
                      {microFeedback.delivery_tips.map((tip, idx) => {
                        const isVadTip =
                          tip.toLowerCase().includes('silence') ||
                          tip.toLowerCase().includes('pause') ||
                          tip.includes('⏸️');
                        return (
                          <Row key={idx} tone={isVadTip ? 'caution' : 'accent'}>
                            {tip}
                          </Row>
                        );
                      })}
                    </Rows>
                  ) : (
                    <p className="px-body">{microFeedback?.speech_quality || 'No delivery notes for this answer.'}</p>
                  )}

                  {(microFeedback?.overall_note || microFeedback?.content_relevance) && (
                    <div className="px-panel px-panel--inset px-3.5 py-3">
                      <Eyebrow>Overall note</Eyebrow>
                      <p className="px-body mt-1.5">
                        {microFeedback?.overall_note || microFeedback?.content_relevance}
                      </p>
                    </div>
                  )}
                </PanelBody>
              </Panel>
            </>
          )}

          {/* ── Feedback usefulness rating ── */}
          {questionId && (
            <Panel className="overflow-hidden px-rise">
              <PanelHead
                eyebrow="Calibration"
                icon={Star}
                tone="caution"
                title="Was this feedback useful?"
                description="Optional — it tunes how the coach talks to you."
              />
              <PanelBody className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((v) => {
                      const active = (usefulnessRating ?? 0) >= v;
                      return (
                        <button
                          key={v}
                          type="button"
                          disabled={ratingSubmitted || ratingSubmitting}
                          onClick={() => updateFeedbackRatingDraft(questionId, { usefulnessRating: v })}
                          aria-label={`Rate usefulness ${v} out of 5`}
                          className="px-focusable grid place-items-center w-9 h-9 rounded-[var(--px-r-sm)] transition-colors disabled:opacity-60"
                        >
                          <Star
                            className="w-4 h-4 transition-transform"
                            style={active ? { color: `hsl(${toneVar('caution')})`, fill: `hsl(${toneVar('caution')})` } : undefined}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span className="px-note">
                    {ratingSubmitted
                      ? 'Saved — thank you.'
                      : ratingSubmitting
                        ? 'Saving…'
                        : usefulnessRating
                          ? `${usefulnessRating}/5`
                          : 'Tap to rate'}
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="px-eyebrow">Felt difficulty (optional)</label>
                  <div className="px-segment">
                    {(['easy', 'medium', 'hard'] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="px-segment__item capitalize"
                        data-active={perceivedDifficulty === d}
                        disabled={ratingSubmitted || ratingSubmitting}
                        onClick={() => updateFeedbackRatingDraft(questionId, { perceivedDifficulty: d })}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="px-eyebrow">Comment (optional)</label>
                  <textarea
                    className="px-field px-field--area"
                    value={comment}
                    disabled={ratingSubmitted || ratingSubmitting}
                    onChange={(e) => updateFeedbackRatingDraft(questionId, { comment: e.target.value })}
                    placeholder="What helped? What was missing?"
                    maxLength={500}
                  />
                </div>
              </PanelBody>
            </Panel>
          )}

          {renderGuestGateBanner()}

          <div className="flex justify-center pt-1">
            <PxButton
              variant="primary"
              size="lg"
              onClick={handleNextQuestion}
              disabled={isProcessing || !!guestGateBanner}
              className="min-w-56"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </>
              ) : (
                <>
                  {feedbackButtonLabel}
                  {completionPending ? <CheckCircle2 className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </>
              )}
            </PxButton>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'complete') {
    // Calculate score from metrics_summary instead of overall_score
    const avgConfidence = evaluation?.metrics_summary?.avg_confidence || 0;
    // Check if confidence is 0-1 scale or 0-10 scale
    const score = avgConfidence <= 1
      ? Math.round(avgConfidence * 100)  // 0-1 scale → multiply by 100
      : Math.round((avgConfidence / 10) * 100); // 0-10 scale → convert to percentage
    const grade = getScoreGrade(score);

    /**
     * Build a print-ready HTML report and hand it to the browser's print
     * pipeline, where "Save as PDF" produces a real document. The previous
     * version emitted a box-drawing plain-text file — readable in a terminal,
     * not something to attach to anything.
     */
    const handleDownloadReport = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      /** Everything interpolated below is user or model text, so it is escaped. */
      const esc = (value: unknown): string =>
        String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const list = (items?: unknown, empty = 'Not available for this session.') => {
        const arr = Array.isArray(items) ? items.filter((i) => typeof i === 'string' && i.trim()) : [];
        if (arr.length === 0) return `<p class="muted">${esc(empty)}</p>`;
        return `<ul>${arr.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      };

      const scoreBand = score >= 80 ? 'strong' : score >= 60 ? 'solid' : score >= 40 ? 'developing' : 'early';
      const verdict = score >= 80
        ? 'Interview-ready on this material.'
        : score >= 60
          ? 'Competent, with specific gaps worth closing.'
          : score >= 40
            ? 'Developing — the structure is there, the substance needs work.'
            : 'Early stage. Focus on fundamentals before the next attempt.';

      const avgWpm = evaluation?.metrics_summary?.avg_wpm || evaluation?.speech_summary?.average_wpm || 0;
      const totalFillers = evaluation?.metrics_summary?.total_fillers || evaluation?.speech_summary?.total_filler_count || 0;
      const avgConf = ((evaluation?.metrics_summary?.avg_confidence || evaluation?.speech_summary?.average_confidence || 0) * 100).toFixed(0);
      const longestPause = (evaluation?.metrics_summary?.longest_pause || 0).toFixed(1);
      const totalDuration = formatTime(Math.floor(evaluation?.metrics_summary?.total_duration || 0));
      const overtalkCount = evaluation?.metrics_summary?.overtalked_count || 0;

      const metaRows: Array<[string, string]> = [
        ['Generated', `${dateStr} at ${timeStr}`],
        ['Session', sessionId || '—'],
        ...(currentRoundConfig ? [['Round', currentRoundConfig.name] as [string, string]] : []),
        ['Questions', `${endedEarlyData?.ended_early
          ? `${endedEarlyData.questions_answered ?? currentQuestionNumber} of ${endedEarlyData.total_questions ?? totalQuestions} answered`
          : `${totalQuestions} answered`}`],
        ['Mode', currentRoundConfig ? 'Interview round' : isDrillSession ? 'Single-question drill' : 'Practice session'],
      ];

      const metricCards = [
        { label: 'Average pace', value: `${avgWpm}`, unit: 'wpm' },
        { label: 'Avg confidence', value: `${avgConf}`, unit: '%' },
        { label: 'Filler words', value: `${totalFillers}`, unit: '' },
        { label: 'Longest pause', value: `${longestPause}`, unit: 's' },
        { label: 'Speaking time', value: totalDuration, unit: '' },
        { label: 'Overtalk', value: `${overtalkCount}`, unit: '' },
      ];

      const questionSections = [...questionEvaluations]
        .sort((a, b) => a.questionNumber - b.questionNumber)
        .map((item) => {
          const rows: string[] = [];

          if (item.kind === 'voice') {
            const conf = item.metrics?.confidence_score !== undefined
              ? `${Math.round((item.metrics.confidence_score || 0) * 100)}%`
              : '—';
            rows.push(`<table class="kv"><tbody>
              <tr><th>Pace</th><td>${esc(item.metrics?.wpm ?? '—')} wpm</td>
                  <th>Confidence</th><td>${esc(conf)}</td>
                  <th>Fillers</th><td>${esc(item.metrics?.filler_count ?? '—')}</td></tr>
              ${item.microFeedback?.correctness_score !== undefined
                ? `<tr><th>Correctness</th><td>${esc(item.microFeedback.correctness_score)}%</td>
                     <th>Accuracy</th><td colspan="3">${esc(item.microFeedback.technical_accuracy ?? '—')}</td></tr>`
                : ''}
            </tbody></table>`);

            if (item.transcript) {
              rows.push(`<h4>Your answer</h4><blockquote>${esc(item.transcript)}</blockquote>`);
            }
            if (item.microFeedback?.key_points_covered?.length) {
              rows.push(`<h4>Points covered</h4>${list(item.microFeedback.key_points_covered)}`);
            }
            if (item.microFeedback?.key_points_missed?.length) {
              rows.push(`<h4>Points missed</h4>${list(item.microFeedback.key_points_missed)}`);
            }
            if (item.microFeedback?.strengths?.length) {
              rows.push(`<h4>Strengths</h4>${list(item.microFeedback.strengths)}`);
            }
            if (item.microFeedback?.improvement_areas?.length) {
              rows.push(`<h4>Areas to improve</h4>${list(item.microFeedback.improvement_areas)}`);
            }
            if (item.microFeedback?.model_answer) {
              rows.push(`<h4>Model answer</h4><blockquote>${esc(item.microFeedback.model_answer)}</blockquote>`);
            }
          } else if (item.kind === 'code') {
            const ev = item.codeEvaluation;
            if (ev) {
              rows.push(`<table class="kv"><tbody>
                <tr><th>Overall</th><td>${esc(ev.overall_score)}%</td>
                    <th>Verdict</th><td>${ev.is_correct ? 'Accepted' : 'Not accepted'}</td>
                    <th>Tests</th><td>${esc(ev.test_cases_passed ?? '—')}/${esc(ev.test_cases_total ?? '—')}</td></tr>
                <tr><th>Correctness</th><td>${esc(ev.correctness_score ?? '—')}%</td>
                    <th>Quality</th><td>${esc(ev.code_quality_score ?? '—')}%</td>
                    <th>Efficiency</th><td>${esc(ev.efficiency_score ?? '—')}%</td></tr>
                <tr><th>Time</th><td>${esc(ev.time_complexity ?? '—')}</td>
                    <th>Space</th><td colspan="3">${esc(ev.space_complexity ?? '—')}</td></tr>
              </tbody></table>`);
              if (ev.approach_feedback) rows.push(`<h4>Approach</h4><p>${esc(ev.approach_feedback)}</p>`);
              if (ev.edge_cases_handled?.length) rows.push(`<h4>Edge cases handled</h4>${list(ev.edge_cases_handled)}`);
              if (ev.edge_cases_missed?.length) rows.push(`<h4>Edge cases missed</h4>${list(ev.edge_cases_missed)}`);
              if (ev.optimization_suggestions?.length) rows.push(`<h4>Optimisation</h4>${list(ev.optimization_suggestions)}`);
            }
            if (item.testResults?.length) {
              const passed = item.testResults.filter((t) => t.passed).length;
              rows.push(`<p class="muted">${passed} of ${item.testResults.length} test cases passed.</p>`);
            }
          }

          return `<section class="qblock">
            <div class="qhead">
              <span class="qnum">Q${String(item.questionNumber).padStart(2, '0')}</span>
              <span class="qtype">${item.kind === 'code' ? 'Coding' : 'Voice'}</span>
            </div>
            ${item.questionText ? `<p class="qtext">${esc(item.questionText)}</p>` : ''}
            ${rows.join('')}
          </section>`;
        }).join('');

      const skippedSection = endedEarlyData?.skipped_questions?.length
        ? `<h2>Not attempted</h2><ul>${endedEarlyData.skipped_questions
          .map((q) => `<li><strong>Q${esc(q.question_number)}</strong> — ${esc(q.question)}${q.category ? ` <em>(${esc(q.category.replace(/_/g, ' '))})</em>` : ''}</li>`)
          .join('')}</ul>`
        : '';

      const proctoringSection = proctoringSessionEndSummary
        ? `<h2>Proctoring</h2>
           <p><strong>${esc(proctoringSessionEndSummary.title)}</strong></p>
           <p>${esc(proctoringSessionEndSummary.description)}</p>
           ${list(proctoringSessionEndSummary.items, 'No further detail recorded.')}`
        : '';

      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Stratax AI — Interview Report — ${esc(dateStr)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #14161c; background: #fff;
    font: 400 10.5pt/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet { max-width: 190mm; margin: 0 auto; padding: 12mm 10mm; }
  header.doc { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #14161c; padding-bottom: 10px; margin-bottom: 18px; }
  .brand { font-size: 13pt; font-weight: 700; letter-spacing: -0.01em; }
  .brand span { display: block; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.16em;
    text-transform: uppercase; color: #6b7280; margin-top: 3px; }
  .docmeta { text-align: right; font-size: 8pt; color: #6b7280; }
  h1 { font-size: 17pt; letter-spacing: -0.02em; margin: 0 0 4px; }
  h2 { font-size: 11pt; letter-spacing: 0.02em; text-transform: uppercase; color: #14161c;
    border-bottom: 1px solid #d8dbe2; padding-bottom: 5px; margin: 22px 0 10px; page-break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 14px 0 4px; }
  h4 { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280;
    margin: 10px 0 3px; page-break-after: avoid; }
  p { margin: 0 0 7px; }
  ul { margin: 0 0 8px; padding-left: 16px; }
  li { margin-bottom: 3px; }
  .muted { color: #6b7280; }
  blockquote { margin: 0 0 8px; padding: 8px 11px; background: #f4f6f9;
    border-left: 3px solid #c8cdd6; white-space: pre-wrap; }
  .scorebar { display: flex; align-items: center; gap: 22px; padding: 14px 16px;
    border: 1px solid #d8dbe2; border-radius: 6px; margin-bottom: 6px; }
  .scoreval { font-size: 34pt; font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
  .scoreval small { font-size: 12pt; font-weight: 500; color: #6b7280; }
  .grade { font-size: 8pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    border: 1px solid #14161c; border-radius: 3px; padding: 3px 7px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.metrics td { border: 1px solid #d8dbe2; padding: 8px 10px; width: 16.66%; vertical-align: top; }
  table.metrics .mlabel { display: block; font-size: 7.5pt; text-transform: uppercase;
    letter-spacing: 0.1em; color: #6b7280; margin-bottom: 3px; }
  table.metrics .mval { font-size: 14pt; font-weight: 600; letter-spacing: -0.02em; }
  table.metrics .munit { font-size: 8pt; font-weight: 500; color: #6b7280; margin-left: 2px; }
  table.kv th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: #6b7280; font-weight: 600; padding: 4px 8px 4px 0; white-space: nowrap; }
  table.kv td { padding: 4px 16px 4px 0; font-size: 9.5pt; }
  .meta { width: 100%; margin-bottom: 4px; }
  .meta th { text-align: left; width: 24%; font-weight: 600; color: #6b7280; font-size: 8.5pt;
    padding: 3px 0; }
  .meta td { font-size: 9.5pt; padding: 3px 0; }
  .cols { display: flex; gap: 18px; }
  .cols > div { flex: 1 1 0; min-width: 0; }
  .qblock { page-break-inside: avoid; border-top: 1px solid #e6e9ee; padding-top: 12px; margin-top: 14px; }
  .qhead { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .qnum { font-weight: 700; font-size: 9pt; letter-spacing: 0.06em; }
  .qtype { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280;
    border: 1px solid #d8dbe2; border-radius: 3px; padding: 1px 6px; }
  .qtext { font-weight: 600; font-size: 10.5pt; margin-bottom: 8px; }
  footer.doc { border-top: 1px solid #d8dbe2; margin-top: 26px; padding-top: 8px;
    font-size: 8pt; color: #6b7280; display: flex; justify-content: space-between; }
  @media screen {
    body { background: #eef1f5; padding: 24px 12px; }
    .sheet { background: #fff; box-shadow: 0 12px 40px rgba(10,20,40,.14); border-radius: 4px; }
    .noprint { max-width: 190mm; margin: 0 auto 14px; display: flex; gap: 8px; justify-content: flex-end; }
    .noprint button { font: 600 10pt/1 inherit; padding: 9px 16px; border-radius: 6px;
      border: 1px solid #c8cdd6; background: #fff; cursor: pointer; }
    .noprint button.primary { background: #14161c; border-color: #14161c; color: #fff; }
  }
  @media print { .noprint { display: none !important; } .sheet { box-shadow: none; padding: 0; } }
</style>
</head>
<body>
<div class="noprint">
  <button onclick="window.close()">Close</button>
  <button class="primary" onclick="window.print()">Save as PDF</button>
</div>
<div class="sheet">
  <header class="doc">
    <div class="brand">Stratax AI<span>Interview Evaluation Report</span></div>
    <div class="docmeta">${esc(dateStr)}<br>${esc(timeStr)}</div>
  </header>

  <h1>${esc(currentRoundConfig ? currentRoundConfig.name : isDrillSession ? 'Practice drill' : 'Practice session')}</h1>
  <p class="muted">${esc(verdict)}</p>

  <table class="meta"><tbody>
    ${metaRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
  </tbody></table>

  <h2>Overall result</h2>
  <div class="scorebar">
    <div class="scoreval">${esc(score)}<small>/100</small></div>
    <div>
      <span class="grade">Grade ${esc(grade)}</span>
      <p class="muted" style="margin:6px 0 0">Performance band: ${esc(scoreBand)}. Derived from the session's
      averaged evaluation across correctness, delivery, and structure.</p>
    </div>
  </div>

  <h2>Delivery metrics</h2>
  <table class="metrics"><tbody><tr>
    ${metricCards.map((m) => `<td><span class="mlabel">${esc(m.label)}</span><span class="mval">${esc(m.value)}${m.unit ? `<span class="munit">${esc(m.unit)}</span>` : ''}</span></td>`).join('')}
  </tr></tbody></table>
  ${evaluation?.learning_insight ? `<p class="muted"><strong>Peer benchmark.</strong> ${esc(evaluation.learning_insight)}</p>` : ''}

  <h2>Assessment</h2>
  <div class="cols">
    <div><h3>Strengths</h3>${list(evaluation?.strengths?.items, 'No strengths recorded.')}</div>
    <div><h3>Areas for improvement</h3>${list(evaluation?.improvements?.items, 'No improvement areas recorded.')}</div>
  </div>

  <h2>Action plan</h2>
  ${list(evaluation?.action_plan?.steps, 'No action plan generated for this session.')}
  ${evaluation?.practice_recommendation ? `<p><strong>Recommended next step.</strong> ${esc(evaluation.practice_recommendation)}</p>` : ''}

  <h2>Question-by-question</h2>
  ${questionSections || '<p class="muted">No per-question evaluation data was recorded.</p>'}

  ${skippedSection}
  ${proctoringSection}

  <footer class="doc">
    <span>Stratax AI — Interview Practice Platform</span>
    <span>© ${now.getFullYear()} Stratax AI</span>
  </footer>
</div>
</body>
</html>`;

      const reportWindow = window.open('', '_blank', 'noopener,noreferrer,width=920,height=1000');

      if (reportWindow) {
        // document.write is the only synchronous way to seed an about:blank
        // popup; a Blob URL would be blocked as a cross-document navigation.
        reportWindow.document.write(html);
        reportWindow.document.close();
        reportWindow.focus();
        toast({
          title: 'Report ready',
          description: 'Use “Save as PDF” in the report window to keep a copy.',
        });
        return;
      }

      // Popup blocked — fall back to a self-contained HTML file, which still
      // opens and prints to PDF, rather than silently doing nothing.
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Stratax_Interview_Report_${now.toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Report downloaded',
        description: 'Open the file and print to PDF to keep a formatted copy.',
      });
    };

    const answeredCount = endedEarlyData?.ended_early
      ? (endedEarlyData.questions_answered ?? currentQuestionNumber)
      : totalQuestions;
    const sessionDuration = formatTime(Math.floor(evaluation?.metrics_summary?.total_duration || 0));
    const endedByProctoring = !!proctoringSessionEndSummary;
    const heroTone: PxTone = endedByProctoring ? 'critical' : endedEarlyData?.ended_early ? 'caution' : 'positive';

    return (
      <div className="px px-shell h-full overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-frame px-frame--mid py-5 sm:py-8 space-y-5 pb-12">

            {/* ── HERO ── */}
            <Panel variant="raised" brackets className="overflow-hidden px-rise">
              <Seam tone={heroTone} />
              <div className="px-5 sm:px-8 py-8 sm:py-10">
                <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                  <div
                    className="shrink-0 mx-auto sm:mx-0 grid place-items-center w-16 h-16 rounded-full border"
                    style={{
                      color: `hsl(${toneVar(heroTone)})`,
                      borderColor: `hsl(${toneVar(heroTone)} / 0.34)`,
                      background: `hsl(${toneVar(heroTone)} / 0.1)`,
                      boxShadow: `0 24px 60px -40px hsl(${toneVar(heroTone)})`,
                    }}
                  >
                    {endedByProctoring ? <ShieldAlert className="w-7 h-7" /> : <Trophy className="w-7 h-7" />}
                  </div>

                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <Eyebrow tone={heroTone}>
                      {endedByProctoring
                        ? 'Ended by proctoring'
                        : endedEarlyData?.ended_early
                          ? 'Ended early'
                          : 'Session complete'}
                    </Eyebrow>
                    <h1 className="px-display mt-2.5">
                      {endedEarlyData?.ended_early ? 'Session closed.' : 'Interview complete.'}
                    </h1>
                    <p className="px-body mt-2.5 max-w-lg mx-auto sm:mx-0">
                      {currentRoundConfig ? (
                        <>
                          You finished <span className="font-semibold px-ink">{currentRoundConfig.name}</span>. The full
                          breakdown is below, and the result is already in your Progress.
                        </>
                      ) : isDrillSession ? (
                        <>
                          Drill complete — one question practised. Drills are scored but kept out of your Progress
                          averages, which track full interview rounds.
                        </>
                      ) : (
                        <>
                          You answered {answeredCount} of {totalQuestions} questions. The full breakdown is below.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <Grid cols={2} sm={4} gap="0.625rem" className="mt-7">
                  <StatTile
                    label="Answered"
                    value={`${answeredCount}/${endedEarlyData?.total_questions ?? totalQuestions}`}
                    icon={ListChecks}
                    tone={heroTone}
                  />
                  <StatTile label="Duration" value={sessionDuration} icon={Clock} tone="accent" />
                  <StatTile
                    label="Avg pace"
                    value={evaluation?.metrics_summary?.avg_wpm || evaluation?.speech_summary?.average_wpm || 0}
                    unit="wpm"
                    icon={Activity}
                    tone="accent"
                  />
                  <StatTile
                    label="Mode"
                    value={currentRoundConfig ? 'Round' : isDrillSession ? 'Drill' : 'Practice'}
                    icon={Target}
                    tone="neural"
                  />
                </Grid>
              </div>
            </Panel>

            {/* Proctoring termination summary */}
            {proctoringSessionEndSummary && (
              <Panel tone="critical" className="overflow-hidden px-rise">
                <Seam tone="critical" />
                <PanelHead
                  eyebrow="Integrity"
                  icon={ShieldAlert}
                  tone="critical"
                  title={proctoringSessionEndSummary.title}
                  description={proctoringSessionEndSummary.description}
                />
                {proctoringSessionEndSummary.items.length > 0 && (
                  <PanelBody>
                    <FindingList items={proctoringSessionEndSummary.items} tone="critical" />
                  </PanelBody>
                )}
              </Panel>
            )}

            {/* Authoritative score breakdown */}
            {sessionId && (
              <InstantScoreBreakdown
                sessionId={sessionId}
                onViewProgress={() => navigate('/progress', { state: { refreshToken: Date.now() } })}
              />
            )}

            {/* ── REPORT ── */}
            <Tabs defaultValue="questions" className="w-full">
              <TabsList className="px-segment px-segment--block">
                <TabsTrigger value="questions" className="px-segment__item">
                  <Layers className="w-3.5 h-3.5 hidden sm:block" />
                  Questions
                </TabsTrigger>
                <TabsTrigger value="strengths" className="px-segment__item">
                  <TrendingUp className="w-3.5 h-3.5 hidden sm:block" />
                  Insights
                </TabsTrigger>
                <TabsTrigger value="analytics" className="px-segment__item">
                  <Activity className="w-3.5 h-3.5 hidden sm:block" />
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="plan" className="px-segment__item">
                  <Target className="w-3.5 h-3.5 hidden sm:block" />
                  Plan
                </TabsTrigger>
              </TabsList>

              {/* TAB: per-question evaluation */}
              <TabsContent value="questions" className="mt-4 space-y-3 px-fade">
                {questionEvaluations.length > 0 ? (
                  questionEvaluations
                    .slice()
                    .sort((a, b) => a.questionNumber - b.questionNumber)
                    .map((item) => {
                      const voiceConfidencePct = item.metrics?.confidence_score !== undefined
                        ? Math.round((item.metrics.confidence_score || 0) * 100)
                        : undefined;
                      const testsTotal = item.testResults?.length ?? item.codeEvaluation?.test_cases_total;
                      const testsPassed = item.testResults
                        ? item.testResults.filter((t) => t.passed).length
                        : item.codeEvaluation?.test_cases_passed;
                      const itemTone: PxTone = item.kind === 'code' ? 'neural' : 'accent';

                      return (
                        <Panel
                          key={`${item.kind}-${item.questionNumber}-${item.createdAt}`}
                          className="overflow-hidden px-rise"
                        >
                          <div className="flex items-start gap-3 px-4 pt-4 pb-3.5 border-b border-[hsl(var(--px-line-soft))]">
                            <span
                              className="shrink-0 grid place-items-center w-8 h-8 rounded-[var(--px-r-sm)] border px-num text-[0.6875rem] font-semibold"
                              style={{
                                color: `hsl(${toneVar(itemTone)})`,
                                borderColor: `hsl(${toneVar(itemTone)} / 0.28)`,
                                background: `hsl(${toneVar(itemTone)} / 0.1)`,
                              }}
                            >
                              {String(item.questionNumber).padStart(2, '0')}
                            </span>
                            <div className="min-w-0 flex-1">
                              <Eyebrow tone={itemTone} icon={item.kind === 'code' ? SquareCode : Mic}>
                                {item.kind === 'code' ? 'Code' : 'Voice'}
                              </Eyebrow>
                              {item.questionText && (
                                <p className="px-body px-body--tight mt-1.5 line-clamp-2 px-ink">{item.questionText}</p>
                              )}
                            </div>
                          </div>

                          <PanelBody className="space-y-3.5">
                            {item.kind === 'voice' && (
                              <>
                                {(item.metrics || item.microFeedback) && (
                                  <Grid cols={3} gap="0.625rem">
                                    <StatTile label="Pace" value={item.metrics?.wpm ?? 0} unit="wpm" icon={Activity} tone="accent" />
                                    <StatTile
                                      label="Confidence"
                                      value={voiceConfidencePct ?? 0}
                                      unit="%"
                                      icon={Gauge}
                                      tone={getScoreTone(voiceConfidencePct ?? 0)}
                                    />
                                    <StatTile
                                      label="Fillers"
                                      value={item.metrics?.filler_count ?? 0}
                                      icon={CircleDot}
                                      tone={(item.metrics?.filler_count ?? 0) > 8 ? 'caution' : 'positive'}
                                    />
                                  </Grid>
                                )}

                                {item.microFeedback?.correctness_score !== undefined && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Chip mono tone={getScoreTone(Number(item.microFeedback.correctness_score) || 0)}>
                                      Correctness {item.microFeedback.correctness_score}%
                                    </Chip>
                                    {typeof item.microFeedback.is_correct === 'boolean' && (
                                      <Chip tone={item.microFeedback.is_correct ? 'positive' : 'critical'}>
                                        {item.microFeedback.is_correct ? 'On target' : 'Needs work'}
                                      </Chip>
                                    )}
                                    {item.microFeedback.technical_accuracy && (
                                      <Chip>{item.microFeedback.technical_accuracy}</Chip>
                                    )}
                                  </div>
                                )}

                                {item.transcript && (
                                  <div className="px-panel px-panel--inset px-3.5 py-3">
                                    <Eyebrow icon={FileText}>Transcript</Eyebrow>
                                    <p className="px-body mt-2 whitespace-pre-wrap">{item.transcript}</p>
                                  </div>
                                )}
                              </>
                            )}

                            {item.kind === 'code' && (
                              <>
                                {item.codeEvaluation && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Chip mono tone={getScoreTone(Number(item.codeEvaluation.overall_score) || 0)} size="lg">
                                      Overall {item.codeEvaluation.overall_score}%
                                    </Chip>
                                    <Chip tone={item.codeEvaluation.is_correct ? 'positive' : 'critical'}>
                                      {item.codeEvaluation.is_correct ? 'Accepted' : 'Not accepted'}
                                    </Chip>
                                    {testsTotal !== undefined && testsPassed !== undefined && (
                                      <Chip mono>Tests {testsPassed}/{testsTotal}</Chip>
                                    )}
                                  </div>
                                )}

                                {item.codeEvaluation?.approach_feedback && (
                                  <div className="px-panel px-panel--inset px-3.5 py-3">
                                    <Eyebrow icon={Lightbulb}>Approach</Eyebrow>
                                    <p className="px-body mt-2 whitespace-pre-wrap">{item.codeEvaluation.approach_feedback}</p>
                                  </div>
                                )}

                                {item.testResults && item.testResults.length > 0 && (
                                  <div className="px-panel px-panel--inset px-3.5 py-3">
                                    <Eyebrow icon={ListChecks}>
                                      Tests — {item.testResults.filter((t) => t.passed).length}/{item.testResults.length} passed
                                    </Eyebrow>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {item.testResults.map((tr, trIdx) => (
                                        <Chip key={trIdx} mono tone={tr.passed ? 'positive' : 'critical'}>
                                          {tr.passed ? '✓' : '✕'} {tr.test_case_number}
                                        </Chip>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {!item.codeEvaluation && (!item.testResults || item.testResults.length === 0) && (
                                  <p className="px-note">
                                    No evaluation data came back for this submission — see the score breakdown above.
                                  </p>
                                )}
                              </>
                            )}
                          </PanelBody>
                        </Panel>
                      );
                    })
                ) : (
                  <EmptyState
                    icon={Layers}
                    title="No per-question detail"
                    hint="The score breakdown above still carries the overall result."
                  />
                )}
              </TabsContent>

              {/* TAB: strengths + improvements */}
              <TabsContent value="strengths" className="mt-4 space-y-3 px-fade">
                <Grid cols={1} md={2} gap="0.75rem">
                  <Panel tone="positive" className="overflow-hidden px-rise">
                    <Seam tone="positive" />
                    <PanelHead eyebrow="What worked" icon={CheckCircle2} tone="positive" title="Your strengths" />
                    <PanelBody>
                      <FindingList
                        items={Array.isArray(evaluation?.strengths?.items) ? evaluation?.strengths?.items : []}
                        tone="positive"
                        empty="No strengths data available."
                      />
                    </PanelBody>
                  </Panel>

                  <Panel tone="caution" className="overflow-hidden px-rise">
                    <Seam tone="caution" />
                    <PanelHead eyebrow="What to fix" icon={Flame} tone="caution" title="Areas for improvement" />
                    <PanelBody>
                      <FindingList
                        items={Array.isArray(evaluation?.improvements?.items) ? evaluation?.improvements?.items : []}
                        tone="caution"
                        empty="No improvement areas available."
                      />
                    </PanelBody>
                  </Panel>
                </Grid>

                {/* Fallback score card — only when the session score endpoint is unavailable. */}
                {!sessionId && (
                  <Panel variant="raised" className="overflow-hidden px-rise">
                    <Seam tone={getScoreTone(score)} />
                    <PanelHead eyebrow="Overall" icon={Gauge} tone={getScoreTone(score)} title="Session performance" />
                    <PanelBody>
                      <div className="flex items-center gap-6">
                        <Dial value={score} size={124} tone={getScoreTone(score)}>
                          <div>
                            <div className="px-num text-3xl font-semibold px-ink leading-none">{score}</div>
                            <div className="px-eyebrow mt-1.5 justify-center">/ 100</div>
                          </div>
                        </Dial>
                        <div className="min-w-0">
                          <Chip size="lg" tone={getScoreTone(score)} mono>Grade {grade}</Chip>
                          <p className="px-note mt-3">
                            Derived from average confidence ({avgConfidence.toFixed(2)}
                            {avgConfidence <= 1 ? ' on a 0–1 scale' : ' / 10'}).
                          </p>
                        </div>
                      </div>
                    </PanelBody>
                  </Panel>
                )}
              </TabsContent>

              {/* TAB: speech analytics */}
              <TabsContent value="analytics" className="mt-4 space-y-3 px-fade">
                <Panel className="overflow-hidden px-rise">
                  <PanelHead eyebrow="Delivery telemetry" icon={Activity} tone="accent" title="Speech analytics" />
                  <PanelBody className="space-y-4">
                    <Grid cols={2} sm={3} gap="0.625rem">
                      {[
                        {
                          label: 'Average pace',
                          value: `${evaluation?.metrics_summary?.avg_wpm || evaluation?.speech_summary?.average_wpm || 0}`,
                          unit: 'wpm',
                          icon: Activity,
                          tone: 'accent' as PxTone,
                        },
                        {
                          label: 'Total fillers',
                          value: `${evaluation?.metrics_summary?.total_fillers || evaluation?.speech_summary?.total_filler_count || 0}`,
                          icon: CircleDot,
                          tone: 'caution' as PxTone,
                        },
                        {
                          label: 'Avg confidence',
                          value: `${((evaluation?.metrics_summary?.avg_confidence || evaluation?.speech_summary?.average_confidence || 0) * 100).toFixed(0)}`,
                          unit: '%',
                          icon: Gauge,
                          tone: 'positive' as PxTone,
                        },
                        {
                          label: 'Longest pause',
                          value: `${(evaluation?.metrics_summary?.longest_pause || 0).toFixed(1)}`,
                          unit: 's',
                          icon: Timer,
                          tone: 'neural' as PxTone,
                        },
                        {
                          label: 'Duration',
                          value: formatTime(Math.floor(evaluation?.metrics_summary?.total_duration || 0)),
                          icon: Clock,
                          tone: 'accent' as PxTone,
                        },
                        {
                          label: 'Overtalk',
                          value: `${evaluation?.metrics_summary?.overtalked_count || 0}`,
                          icon: Radio,
                          tone: 'critical' as PxTone,
                        },
                      ].map((metric) => (
                        <StatTile
                          key={metric.label}
                          label={metric.label}
                          value={metric.value}
                          unit={metric.unit}
                          icon={metric.icon}
                          tone={metric.tone}
                        />
                      ))}
                    </Grid>

                    {evaluation?.learning_insight ? (
                      <div className="px-panel px-panel--inset flex items-start gap-3 px-3.5 py-3">
                        <GraduationCap className="w-4 h-4 mt-0.5 shrink-0" style={toneColor('accent')} />
                        <div className="min-w-0">
                          <Eyebrow tone="accent">Peer benchmark</Eyebrow>
                          <p className="px-body mt-1.5">{evaluation.learning_insight}</p>
                        </div>
                      </div>
                    ) : null}
                  </PanelBody>
                </Panel>

                {/* Post-session confidence prompt.
                    Not shown for drills: the rating feeds a cross-user benchmark
                    keyed on session metrics that a drill deliberately does not
                    write, so it would be collected and never used. */}
                {sessionId && !isDrillSession && sessionConfidenceStatus !== 'disabled' ? (
                  <Panel className="overflow-hidden px-rise">
                    <PanelHead
                      eyebrow="Self-report"
                      icon={Brain}
                      tone="neural"
                      title="How confident do you feel?"
                      description="Rate your overall confidence for this session (1–5)."
                    />
                    <PanelBody>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="px-segment">
                          {[1, 2, 3, 4, 5].map((v) => (
                            <button
                              key={v}
                              type="button"
                              className="px-segment__item px-num min-w-11"
                              data-active={(sessionConfidenceDraft ?? 0) === v}
                              disabled={sessionConfidenceStatus === 'submitting'}
                              onClick={() => submitSessionConfidenceBestEffort(sessionId, v)}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                        <div className="flex-1" />
                        <PxButton
                          variant="ghost"
                          size="sm"
                          disabled={sessionConfidenceStatus === 'submitting'}
                          onClick={() => skipSessionConfidencePrompt(sessionId)}
                        >
                          Skip
                        </PxButton>
                      </div>
                      {sessionConfidenceStatus !== 'idle' && (
                        <p className="px-note mt-2.5">
                          {sessionConfidenceStatus === 'saved'
                            ? 'Saved — thank you.'
                            : sessionConfidenceStatus === 'skipped'
                              ? 'Skipped. You can still add a rating anytime.'
                              : sessionConfidenceStatus === 'submitting'
                                ? 'Saving…'
                                : sessionConfidenceStatus === 'error'
                                  ? 'Not saved yet. Try again.'
                                  : ''}
                        </p>
                      )}
                    </PanelBody>
                  </Panel>
                ) : null}
              </TabsContent>

              {/* TAB: action plan */}
              <TabsContent value="plan" className="mt-4 space-y-3 px-fade">
                {evaluation?.action_plan?.steps && Array.isArray(evaluation.action_plan.steps) && evaluation.action_plan.steps.length > 0 && (
                  <Panel variant="raised" className="overflow-hidden px-rise">
                    <Seam tone="accent" />
                    <PanelHead eyebrow="Do this next" icon={Target} tone="accent" title="Your action plan" />
                    <PanelBody className="space-y-4">
                      <FindingList items={evaluation.action_plan.steps} tone="accent" numbered />

                      {evaluation.practice_recommendation && (
                        <div className="px-panel px-panel--inset flex items-start gap-2.5 px-3.5 py-3">
                          <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" style={toneColor('accent')} />
                          <p className="px-body px-body--tight">{evaluation.practice_recommendation}</p>
                        </div>
                      )}
                    </PanelBody>
                  </Panel>
                )}

                {endedEarlyData?.skipped_questions && endedEarlyData.skipped_questions.length > 0 && (
                  <Panel tone="caution" className="overflow-hidden px-rise">
                    <PanelHead
                      eyebrow="Not attempted"
                      icon={Hourglass}
                      tone="caution"
                      title="Skipped questions"
                      description="Worth returning to — these are the gaps this session left open."
                    />
                    <PanelBody className="space-y-2">
                      {endedEarlyData.skipped_questions.map((q) => (
                        <div key={q.question_number} className="px-panel px-panel--inset px-3.5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="px-num text-[0.625rem] px-ink-3">
                              Q{String(q.question_number).padStart(2, '0')}
                            </span>
                            {q.category && (
                              <Chip className="capitalize">{q.category.replace('_', ' ')}</Chip>
                            )}
                          </div>
                          <p className="px-body px-body--tight mt-1.5 px-ink">{q.question}</p>
                        </div>
                      ))}
                    </PanelBody>
                  </Panel>
                )}

                {!evaluation?.action_plan?.steps?.length && !endedEarlyData?.skipped_questions?.length && (
                  <EmptyState
                    icon={Target}
                    title="No action plan yet"
                    hint="Complete more sessions to receive personalised recommendations."
                  />
                )}
              </TabsContent>
            </Tabs>

            {/* ── ACTIONS ── */}
            <Panel className="overflow-hidden px-rise">
              <PanelBody className="flex flex-col sm:flex-row gap-3">
                <PxButton variant="ghost" size="lg" onClick={handleDownloadReport} className="sm:flex-1">
                  <Download className="w-4 h-4" />
                  Export PDF report
                </PxButton>
                <PxButton variant="outline" size="lg" onClick={handleRestart} className="sm:flex-1">
                  <RotateCcw className="w-4 h-4" />
                  Practice again
                </PxButton>
                <PxButton variant="primary" size="lg" onClick={handleRestart} className="sm:flex-1">
                  <Sparkles className="w-4 h-4" />
                  New interview
                </PxButton>
              </PanelBody>
            </Panel>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return null;
};
