import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
} from 'lucide-react';
import RoundSelection from './RoundSelection';
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

const getStrategyToneClasses = (style?: string | null) => {
  switch ((style ?? '').toLowerCase()) {
    case 'supportive':
      return {
        card: 'border-emerald-500/30 bg-emerald-500/5',
        badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      };
    case 'challenging':
      return {
        card: 'border-amber-500/30 bg-amber-500/5',
        badge: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      };
    default:
      return {
        card: 'border-primary/20 bg-primary/5',
        badge: 'border-primary/20 bg-primary/10 text-primary',
      };
  }
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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => navigate('/progress', { state: { refreshToken: Date.now() } })}
      className={className}
    >
      <BarChart3 className="w-4 h-4 mr-2" />
      View Progress
    </Button>
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
      <Card className="border-2 border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">
                {guestGateBanner.kind === 'limit'
                  ? 'Guest usage limit reached'
                  : 'Guest mode temporarily unavailable'}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {guestGateBanner.message?.trim()
                  ? guestGateBanner.message
                  : guestGateBanner.kind === 'limit'
                    ? 'You’ve used all guest credits for now. Sign in to continue, or connect your own API keys for unlimited usage.'
                    : 'Guest capacity is currently full right now. Please try again later, or sign in and use your own API keys.'}
              </p>

              {guestGateBanner.kind === 'limit' && remaining && typeof remaining === 'object' && (
                <div className="mt-3 rounded-xl border border-border/50 bg-muted/10 p-3 text-sm">
                  <div className="font-medium mb-2">Guest credits remaining</div>
                  <div className="space-y-1">
                    {Object.entries(remaining)
                      .filter(([_, v]) => typeof v === 'number')
                      .map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={() => setGuestGateBanner(null)}>
                  Dismiss
                </Button>
                <Button
                  onClick={() => {
                    try {
                      window.location.assign('/login?mode=signin');
                    } catch {
                      window.location.href = '/login?mode=signin';
                    }
                  }}
                >
                  Sign in
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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

  useEffect(() => {
    const el = facePreviewVideoRef.current;
    if (!el) return;

    try {
      (el as any).srcObject = cameraPreviewStream ?? null;
    } catch {
      // ignore
    }

    if (cameraPreviewStream) {
      el.muted = true;
      el.playsInline = true;
      void el.play().catch(() => {
        // ignore
      });
    }
  }, [cameraPreviewStream, sessionId, phase]);

  const renderFacePreview = () => {
    const show = !!sessionId && !!cameraPreviewStream && phase !== 'welcome' && phase !== 'setup' && phase !== 'round-selection';
    if (!show) return null;

    const track = cameraPreviewStream?.getVideoTracks?.()?.[0];
    const trackLive = !!track && track.readyState === 'live';
    const seriousViolationCount = proctoringSnapshot?.serious_violations ?? 0;
    const seriousViolationLimit = getSeriousViolationLimit(proctoringSnapshot);
    const isTerminated = proctoringSnapshot?.action === 'terminate' || proctoringSnapshot?.status === 'terminated';
    const isWarning = isWarningProctoringSnapshot(proctoringSnapshot);

    return (
      <div className="fixed top-4 left-4 z-[90]">
        <div className={`w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-background/70 backdrop-blur shadow-lg ${
          isTerminated
            ? 'border-red-500/80'
            : isWarning
              ? 'border-amber-500/60'
              : 'border-border/60'
        }`}>
          <div className="px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Camera</span>
            <div className="flex items-center gap-2">
              {(seriousViolationCount > 0 || proctoringSnapshot?.remaining_serious_violations !== undefined) && (
                <span className={`text-[10px] font-medium ${
                  isTerminated ? 'text-red-400' : isWarning ? 'text-amber-500' : 'text-muted-foreground'
                }`}>
                  Strike {seriousViolationCount}/{seriousViolationLimit}
                </span>
              )}
              <span className="text-[10px]">{trackLive ? 'Live' : 'Starting…'}</span>
            </div>
          </div>
          <div className="relative w-64 h-64 bg-black">
            <video
              ref={facePreviewVideoRef}
              className="w-full h-full object-cover -scale-x-100"
              autoPlay
              muted
              playsInline
            />

            {!trackLive && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-3 py-2 rounded-md bg-black/50 text-white text-xs">
                  Camera not streaming
                </div>
              </div>
            )}
          </div>
        </div>
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

    if (proctoringOverlay.presentation === 'banner') {
      return (
        <div className="fixed top-20 left-1/2 z-[200] w-[min(92vw,28rem)] -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="rounded-2xl border border-amber-500/70 bg-background/95 px-4 py-3 shadow-2xl backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-xl">⚠️</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-amber-500">{proctoringOverlay.title}</div>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{proctoringOverlay.description}</p>
                {proctoringOverlay.supportingText && (
                  <p className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    {proctoringOverlay.supportingText}
                  </p>
                )}
                <p className="mt-2 text-[11px] font-mono text-amber-600 dark:text-amber-400">
                  Strike {seriousViolationCount}/{seriousViolationLimit}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
        <div className={`mx-4 max-w-md w-full rounded-2xl border-2 p-6 shadow-2xl ${
          isTerminal
            ? 'border-red-500 bg-red-950/95'
            : isFinalWarning
              ? 'border-red-500/80 bg-background/95'
            : 'border-amber-500 bg-background/95'
        }`}>
          <div className="flex justify-center mb-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              isTerminal ? 'bg-red-500/20' : isFinalWarning ? 'bg-red-500/10' : 'bg-amber-500/20'
            }`}>
              <span className="text-4xl">{isTerminal ? '⛔' : isFinalWarning ? '🚨' : '⚠️'}</span>
            </div>
          </div>

          <h3 className={`text-xl font-bold text-center mb-2 ${
            isTerminal ? 'text-red-400' : isFinalWarning ? 'text-red-500' : 'text-amber-500'
          }`}>
            {proctoringOverlay.title}
          </h3>

          <p className={`text-sm text-center mb-4 leading-relaxed ${
            isTerminal ? 'text-red-300/80' : isFinalWarning ? 'text-foreground' : 'text-muted-foreground'
          }`}>
            {proctoringOverlay.description}
          </p>

          {proctoringOverlay.supportingText && (
            <p className={`mb-4 text-center text-sm font-semibold ${
              isTerminal ? 'text-red-300' : isFinalWarning ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'
            }`}>
              {proctoringOverlay.supportingText}
            </p>
          )}

          {reasonItems.length > 0 && (
            <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
              isTerminal
                ? 'border-red-500/30 bg-red-500/10 text-red-100'
                : isFinalWarning
                  ? 'border-red-500/20 bg-red-500/5 text-foreground'
                  : 'border-amber-500/20 bg-amber-500/5 text-foreground'
            }`}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Issue summary</p>
              <div className="space-y-1.5">
                {reasonItems.map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="mt-0.5">•</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-2 mb-4">
            {Array.from({ length: seriousViolationLimit }).map((_, idx) => (
              <div
                key={idx}
                className={`w-3 h-3 rounded-full transition-all ${
                  idx < seriousViolationCount
                    ? isTerminal || isFinalWarning ? 'bg-red-500' : 'bg-amber-500'
                    : 'bg-muted-foreground/20'
                }`}
              />
            ))}
          </div>

          <p className={`text-xs text-center font-mono ${
            isTerminal ? 'text-red-400' : isFinalWarning ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'
          }`}>
            {isTerminal
              ? `Strike ${seriousViolationCount}/${seriousViolationLimit} — Session ended`
              : isFinalWarning
                ? `Strike ${seriousViolationCount}/${seriousViolationLimit} — One more serious violation will end the session`
                : `Strike ${seriousViolationCount}/${seriousViolationLimit} — ${Math.max(seriousViolationLimit - seriousViolationCount, 0)} remaining before termination`
            }
          </p>
        </div>
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
    <div className={`rounded-xl border border-primary/20 bg-primary/5 ${compact ? 'p-3' : 'p-3.5'} ${className}`.trim()}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={id}
          checked={livePracticeConsentChecked}
          onCheckedChange={(value) => setLivePracticeConsentChecked(!!value)}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <Label
            htmlFor={id}
            className={`${compact ? 'text-[11px]' : 'text-sm'} cursor-pointer font-semibold leading-snug text-foreground`}
          >
            I understand that Live Practice uses camera, screen, and recording to simulate real interview conditions.
          </Label>
          <div className={`${compact ? 'mt-1.5 space-y-1 text-[10px]' : 'mt-2 space-y-1.5 text-xs'} text-muted-foreground`}>
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

    const toneClass = isTerminated
      ? 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300'
      : isFinalWarning
        ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
      : heartbeatInterrupted || proctoringStatus === 'error'
        ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : isWarning
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : proctoringStatus === 'starting'
            ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';

    const dotClass = isTerminated
      ? 'bg-red-500'
      : isFinalWarning
        ? 'bg-red-500'
      : heartbeatInterrupted || proctoringStatus === 'error'
        ? 'bg-amber-500'
        : isWarning
          ? 'bg-amber-500'
          : proctoringStatus === 'starting'
            ? 'bg-sky-500'
            : 'bg-emerald-500';

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
        className="fixed bottom-3 right-3 z-[90] sm:right-4 sm:top-4 sm:bottom-auto"
        onMouseEnter={() => setIsProctoringBadgeHovered(true)}
        onMouseLeave={() => setIsProctoringBadgeHovered(false)}
      >
        <button
          type="button"
          onClick={() => setIsProctoringBadgePinned((current) => !current)}
          aria-expanded={isExpanded}
          className={`ml-auto flex items-center gap-2 rounded-full border px-2.5 py-2 text-[11px] font-semibold shadow-lg backdrop-blur transition-all sm:px-3 sm:text-xs ${toneClass}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${dotClass} ${!isTerminated ? 'animate-pulse' : ''}`} />
          <Shield className="h-4 w-4" />
          <span>{statusLabel}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        {isExpanded && (
          <div className="mt-2 w-[min(88vw,20rem)] rounded-2xl border border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur sm:w-[min(92vw,20rem)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live integrity</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{statusLabel}</p>
              </div>
              <Badge variant="outline" className={toneClass}>
                {seriousViolationCount}/{seriousViolationLimit} serious
              </Badge>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detailText}</p>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-xl bg-muted/50 px-3 py-2">
                <p className="text-muted-foreground">Serious strikes</p>
                <p className="mt-1 font-semibold text-foreground">{seriousViolationCount}/{seriousViolationLimit}</p>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2">
                <p className="text-muted-foreground">All violations</p>
                <p className="mt-1 font-semibold text-foreground">{totalViolationCount}/{totalViolationLimit}</p>
              </div>
            </div>

            {(isFinalWarning || typeof remainingSerious === 'number') && !isTerminated && (
              <p className={`mt-3 text-[11px] font-medium ${
                isFinalWarning ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {isFinalWarning
                  ? escalationText
                  : remainingSerious > 0
                    ? `${remainingSerious} serious warning${remainingSerious === 1 ? '' : 's'} remaining before termination.`
                    : 'The next serious violation may end the session.'}
              </p>
            )}

            {latestLabel && (
              <div className="mt-3 rounded-xl border border-border/50 bg-muted/30 px-3 py-2">
                <p className="text-[11px] font-semibold text-foreground">Latest event: {latestLabel}</p>
                {latestDescription && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{latestDescription}</p>
                )}
              </div>
            )}

            {(isTerminated || isFinalWarning) && reasonItems.length > 0 && (
              <div className="mt-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-[11px]">
                <p className="font-semibold text-foreground">Why this happened</p>
                <div className="mt-2 space-y-1 text-muted-foreground">
                  {reasonItems.map((item) => (
                    <div key={item} className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

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
        cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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
  const [profileExperience, setProfileExperience] = useState<number>(0);
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

    return (
      <div className="p-3 bg-muted/30 rounded-2xl border border-border/60">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Your focus for next session</div>
            <div className="text-[10px] text-muted-foreground mt-1">{basedOnLine}</div>
          </div>
          {practiceInsightsLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {focus.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {focus.map((x, idx) => (
              <div key={`${x}-${idx}`} className="flex items-start gap-2 text-[12px]">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/70" />
                <div className="text-foreground/90 font-medium leading-snug">{x}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border/50">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Recent performance</div>
          <div className="mt-2 grid grid-cols-1 gap-1 text-[12px] text-muted-foreground">
            <div className="flex items-center justify-between"><span>Correctness</span><span className="text-foreground/80">{correctnessLabel}</span></div>
            <div className="flex items-center justify-between"><span>Confidence</span><span className="text-foreground/80">{confidenceLabel}</span></div>
            <div className="flex items-center justify-between"><span>Delivery clarity</span><span className="text-foreground/80">{deliveryLabel}</span></div>
          </div>
        </div>
      </div>
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
      if (enableAdaptive && profileDomain && profileExperience > 0) {
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

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-orange-500';
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
    return (
      <div className="max-w-4xl mx-auto w-full px-4">

        {/* ── GATEWAY: Choose your practice mode ── */}
        {welcomeStep === 'gateway' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Futuristic Header with animated gradient ring */}
            <div className="text-center space-y-3 pt-4">
              <div className="flex justify-center md:hidden mb-2">
                {viewProgressButton("h-9 px-3")}
              </div>
              <div className="relative mx-auto w-20 h-20 md:w-24 md:h-24">
                {/* Outer rotating ring */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary via-purple-500 to-cyan-400 animate-spin" style={{ animationDuration: '6s' }} />
                <div className="absolute inset-[3px] rounded-full bg-background" />
                {/* Inner icon container */}
                <div className="absolute inset-[6px] rounded-full bg-gradient-to-br from-primary/20 via-purple-500/10 to-cyan-400/10 border border-primary/20 flex items-center justify-center backdrop-blur-sm">
                  <Mic className="w-8 h-8 md:w-10 md:h-10 text-primary drop-shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text">
                  Choose Your Practice Mode
                </h1>
                <p className="text-xs md:text-sm text-muted-foreground max-w-md mx-auto mt-1.5 leading-relaxed">
                  AI-powered interview preparation — pick a path and let&apos;s elevate your skills
                </p>
              </div>
            </div>

            {renderPracticeInsights()}

            {/* Three intent cards — futuristic glassmorphism */}
            <div className="grid grid-cols-1 gap-3">
              {/* Quick Practice */}
              <button
                onClick={() => { setUseQuickStart(false); setWelcomeStep('configure'); }}
                className="w-full group relative flex items-center gap-4 p-5 md:p-6 rounded-3xl border border-border/30 bg-gradient-to-br from-background/80 via-background/60 to-primary/[0.03] backdrop-blur-2xl shadow-xl shadow-black/10 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 hover:scale-[1.01] transition-all duration-500 text-left overflow-hidden"
              >
                {/* Glow effect on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 rounded-3xl" />
                <div className="relative shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-blue-500/25 to-primary/25 border border-primary/20 flex items-center justify-center shadow-lg backdrop-blur-sm">
                  <Zap className="w-7 h-7 md:w-8 md:h-8 text-primary drop-shadow-[0_0_6px_rgba(var(--primary-rgb),0.4)]" />
                </div>
                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base md:text-lg text-foreground">Quick Practice</h3>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20">AI-DRIVEN</Badge>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-1">
                    Tell me the role — I&apos;ll pick questions, difficulty, and adapt as you go
                  </p>
                </div>
                <ArrowRight className="relative w-5 h-5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-1 transition-all duration-300 shrink-0" />
              </button>

              {/* Full Interview Simulation — Highly Recommended */}
              <button
                onClick={() => setPhase('round-selection')}
                className="w-full group relative flex items-center gap-4 p-5 md:p-6 rounded-3xl border-2 border-purple-500/40 bg-gradient-to-br from-purple-500/[0.08] via-background/60 to-violet-500/[0.06] backdrop-blur-2xl shadow-xl shadow-purple-500/10 hover:border-purple-500/60 hover:shadow-2xl hover:shadow-purple-500/20 hover:scale-[1.01] transition-all duration-500 text-left overflow-hidden ring-1 ring-purple-500/20"
              >
                {/* Recommended ribbon */}
                <div className="absolute top-0 right-0 overflow-hidden w-28 h-28 pointer-events-none">
                  <div className="absolute top-3 right-[-30px] w-[150px] text-center text-[8px] font-extrabold uppercase tracking-widest text-white bg-gradient-to-r from-purple-600 to-violet-500 py-1 rotate-45 shadow-lg shadow-purple-500/30">
                    Recommended
                  </div>
                </div>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-purple-500/5 via-transparent to-purple-500/5 rounded-3xl" />
                <div className="relative shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-purple-500/30 to-violet-500/30 border border-purple-500/30 flex items-center justify-center shadow-lg shadow-purple-500/20 backdrop-blur-sm">
                  <Target className="w-7 h-7 md:w-8 md:h-8 text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                </div>
                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base md:text-lg text-foreground">Full Interview Simulation</h3>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-purple-500/10 text-purple-500 border-purple-500/20">ROUNDS</Badge>
                    <Badge className="text-[8px] px-1.5 py-0 h-4 bg-gradient-to-r from-purple-600 to-violet-500 text-white border-0 shadow-sm shadow-purple-500/30 animate-pulse">★ HIGHLY RECOMMENDED</Badge>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-1">
                    Step through real interview rounds — HR, Technical, System Design
                  </p>
                </div>
                <ArrowRight className="relative w-5 h-5 text-purple-400/60 group-hover:text-purple-400 group-hover:translate-x-1 transition-all duration-300 shrink-0" />
              </button>

              {/* Custom Setup */}
              <button
                onClick={() => { setUseQuickStart(true); setWelcomeStep('configure'); }}
                className="w-full group relative flex items-center gap-4 p-5 md:p-6 rounded-3xl border border-border/30 bg-gradient-to-br from-background/80 via-background/60 to-amber-500/[0.03] backdrop-blur-2xl shadow-xl shadow-black/10 hover:border-amber-500/40 hover:shadow-2xl hover:shadow-amber-500/10 hover:scale-[1.01] transition-all duration-500 text-left overflow-hidden"
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-r from-amber-500/5 via-transparent to-amber-500/5 rounded-3xl" />
                <div className="relative shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-amber-500/25 to-orange-500/25 border border-amber-500/20 flex items-center justify-center shadow-lg backdrop-blur-sm">
                  <Settings className="w-7 h-7 md:w-8 md:h-8 text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]" />
                </div>
                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base md:text-lg text-foreground">Custom Setup</h3>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-500 border-amber-500/20">ADVANCED</Badge>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-1">
                    Pick your role, difficulty, number of questions, and more
                  </p>
                </div>
                <ArrowRight className="relative w-5 h-5 text-muted-foreground/40 group-hover:text-amber-500 group-hover:translate-x-1 transition-all duration-300 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* ── CONFIGURE: Mode-specific setup ── */}
        {welcomeStep === 'configure' && (
          <Card className="w-full border border-border/30 bg-gradient-to-br from-background/90 via-background/70 to-primary/[0.02] backdrop-blur-2xl shadow-2xl shadow-black/20 rounded-3xl animate-in fade-in slide-in-from-right-4 duration-500 overflow-hidden">
            {/* Decorative top gradient bar */}
            <div className="h-1 bg-gradient-to-r from-primary via-purple-500 to-cyan-400" />
            <CardHeader className="pb-3 pt-5 px-5">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 rounded-xl hover:bg-muted/50 shrink-0 border border-border/30"
                  onClick={() => setWelcomeStep('gateway')}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1">
                  <CardTitle className="text-lg md:text-xl font-extrabold text-foreground tracking-tight">
                    {useQuickStart ? 'Custom Setup' : 'AI Interviewer'}
                  </CardTitle>
                  <CardDescription className="text-[10px] md:text-xs mt-0.5 text-muted-foreground/80">
                    {useQuickStart
                      ? 'Configure your practice session exactly how you want it'
                      : "Tell me the role — I'll adapt questions and difficulty as you go"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pb-6 px-5">
              {!useQuickStart ? (
                /* ── Instant / AI Interviewer mode ── */
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/70 flex items-center gap-1.5">
                        <Rocket className="w-3 h-3" />
                        What are you preparing for?
                      </Label>
                    </div>
                    <div className="relative group">
                      <Input
                        placeholder='e.g., "Senior React role at Google"'
                        value={quickStartInput}
                        onChange={(e) => setQuickStartInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !quickStartLoading) {
                            handleQuickStart();
                          }
                        }}
                        maxLength={512}
                        className="text-sm h-12 bg-background/50 border-border/30 rounded-2xl pl-4 pr-10 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all shadow-inner"
                        autoFocus
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/30 group-focus-within:text-primary/50 transition-colors">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {aiMessage && (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-start gap-2.5 shadow-sm animate-in zoom-in-95 duration-300 backdrop-blur-sm">
                      <div className="p-1 bg-green-500/20 rounded-lg mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      </div>
                      <p className="text-xs text-green-700 dark:text-green-400 font-medium leading-relaxed">
                        {aiMessage}
                      </p>
                    </div>
                  )}

                  {/* Resume Upload (optional) */}
                  <ResumeUpload
                    mode="practice"
                    onParsed={(ctx) => setResumeContext(ctx)}
                    onClear={() => setResumeContext(null)}
                    existing={resumeContext}
                  />

                  {/* Progress promise */}
                  <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1.5">This session helps you improve</p>
                    <div className="flex flex-wrap gap-2">
                      {['Answer clarity', 'Confidence', 'Interview structure'].map((item) => (
                        <span key={item} className="inline-flex items-center gap-1 text-[11px] text-foreground/80 font-medium">
                          <CheckCircle2 className="w-3 h-3 text-primary/60" />
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  {renderLivePracticeConsentCard({
                    id: 'quick-start-live-practice-consent',
                    compact: true,
                  })}

                  {/* CTA */}
                  <Button
                    size="lg"
                    className="w-full h-12 text-sm font-bold shadow-xl shadow-black/30 transition-all hover:scale-[1.01] active:scale-[0.98] rounded-2xl"
                    onClick={handleQuickStart}
                    disabled={quickStartLoading || !quickStartInput.trim() || !livePracticeConsentChecked}
                  >
                    {quickStartLoading ? (
                      <>
                        <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                        Setting Up Interview...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 w-4 h-4" />
                        Start Interview
                      </>
                    )}
                  </Button>

                  {/* Deferred session settings */}
                  <Collapsible open={sessionSettingsOpen} onOpenChange={setSessionSettingsOpen}>
                    <CollapsibleTrigger asChild>
                      <button className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                        <Settings className="w-3 h-3" />
                        <span>Session Settings</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${sessionSettingsOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                      <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl border border-border/50">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
                            <Volume2 className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="font-bold text-[11px] text-foreground">Voice Assistant</p>
                            <p className="text-[9px] text-muted-foreground">Hear questions read aloud</p>
                          </div>
                        </div>
                        <Switch
                          checked={enableTTS}
                          onCheckedChange={setEnableTTS}
                          className="scale-75 md:scale-75 origin-right data-[state=checked]:bg-primary"
                        />
                      </div>

                      <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl border border-border/50">
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">
                            <Camera className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="font-bold text-[11px] text-foreground">Camera-proctored mode</p>
                            <p className="text-[9px] text-muted-foreground">Optional integrity analysis on top of the required camera and screen recording</p>
                          </div>
                        </div>
                        <Switch
                          checked={enableCameraProctoring}
                          onCheckedChange={setEnableCameraProctoring}
                          className="scale-75 md:scale-75 origin-right data-[state=checked]:bg-primary"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ) : (
                /* ── Custom / Manual setup mode ── */
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-semibold mb-1 block text-muted-foreground">Interview Role</label>
                      <Input
                        placeholder="e.g., Software Engineer, Data Scientist, Product Manager, DevOps..."
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        maxLength={512}
                        className="text-sm bg-background/50 border-border/40"
                        list="role-suggestions"
                        autoFocus
                      />
                      <datalist id="role-suggestions">
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
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Type any role - not limited to the suggestions above
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-medium mb-1 block">Difficulty Level</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'easy', label: 'Easy', color: 'bg-green-500' },
                          { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
                          { value: 'hard', label: 'Hard', color: 'bg-red-500' },
                        ].map((diff) => (
                          <Button
                            key={diff.value}
                            variant={selectedDifficulty === diff.value ? 'default' : 'outline'}
                            className="relative text-xs h-8"
                            onClick={() => setSelectedDifficulty(diff.value as InterviewDifficulty)}
                          >
                            {selectedDifficulty === diff.value && (
                              <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${diff.color}`} />
                            )}
                            {diff.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-xs">Number of Questions</p>
                          <p className="text-[10px] text-muted-foreground">Choose 1-10 questions</p>
                        </div>
                      </div>
                      <Input
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
                        maxLength={3}
                        className="w-16 h-7 text-xs text-center bg-background/50 border-border/40"
                      />
                    </div>
                  </div>

                  {/* Resume Upload (optional) */}
                  <ResumeUpload
                    mode="practice"
                    onParsed={(ctx) => setResumeContext(ctx)}
                    onClear={() => setResumeContext(null)}
                    existing={resumeContext}
                  />

                  {/* Progress promise */}
                  <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1.5">This session helps you improve</p>
                    <div className="flex flex-wrap gap-2">
                      {['Answer clarity', 'Confidence', 'Interview structure'].map((item) => (
                        <span key={item} className="inline-flex items-center gap-1 text-[11px] text-foreground/80 font-medium">
                          <CheckCircle2 className="w-3 h-3 text-primary/60" />
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  {renderLivePracticeConsentCard({
                    id: 'custom-setup-live-practice-consent',
                    compact: true,
                  })}

                  {/* CTAs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button
                      size="lg"
                      className="h-12"
                      onClick={() => setPhase('setup')}
                    >
                      <Sparkles className="mr-2 w-5 h-5" />
                      <div className="text-left">
                        <div className="font-semibold">Quick Practice</div>
                        <div className="text-xs opacity-90">AI-generated questions</div>
                      </div>
                    </Button>

                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 border-2 hover:bg-primary/5"
                      onClick={() => setPhase('round-selection')}
                    >
                      <Target className="mr-2 w-5 h-5" />
                      <div className="text-left">
                        <div className="font-semibold">Round-Based</div>
                        <div className="text-xs opacity-70">Specific interview rounds</div>
                      </div>
                    </Button>
                  </div>

                  {/* Deferred session settings */}
                  <Collapsible open={sessionSettingsOpen} onOpenChange={setSessionSettingsOpen}>
                    <CollapsibleTrigger asChild>
                      <button className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                        <Settings className="w-3 h-3" />
                        <span>Session Settings</span>
                        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${sessionSettingsOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-xs">Text-to-Speech</p>
                            <p className="text-[10px] text-muted-foreground">Hear questions read aloud</p>
                          </div>
                        </div>
                        <Button
                          variant={enableTTS ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setEnableTTS(!enableTTS)}
                        >
                          {enableTTS ? 'Enabled' : 'Disabled'}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-xs">Camera-proctored mode</p>
                            <p className="text-[10px] text-muted-foreground">Optional integrity analysis on top of the required camera and screen recording</p>
                          </div>
                        </div>
                        <Switch
                          checked={enableCameraProctoring}
                          onCheckedChange={setEnableCameraProctoring}
                        />
                      </div>

                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <div>
                            <div className="font-medium text-xs flex items-center gap-1">
                              Adaptive Intelligence
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">NEW</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">AI-personalized questions</p>
                          </div>
                        </div>
                        <Switch
                          checked={enableAdaptive}
                          onCheckedChange={setEnableAdaptive}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (phase === 'round-selection') {
    const userProfile = enableAdaptive && profileDomain && profileExperience > 0 ? {
      domain: profileDomain,
      experience_years: profileExperience,
      skills: profileSkills.split(',').map(s => s.trim()).filter(Boolean),
      job_role: profileJobRole || undefined,
      company_preference: profileCompany || undefined,
      interview_focus: profileFocus ? profileFocus.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    } : undefined;

    return (
      <div className="w-full h-full flex flex-col relative overflow-hidden">
        {/* Scrollable Content Container */}
        <div ref={roundSelectionScrollRef} className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Sticky header: back + interview settings */}
          <div
            className={`sticky top-0 z-[60] transition-all duration-300 ${
              showRoundSelectionHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
            }`}
          >
            <div className="backdrop-blur-xl">
              <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
                {/* Left: Back */}
                <Button
                  variant="ghost"
                  onClick={() => { setWelcomeStep('gateway'); setPhase('welcome'); }}
                  className="group h-10 px-4 rounded-xl bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground border border-border/20 hover:border-border/40 transition-all"
                >
                  <ChevronLeft className="w-4 h-4 mr-1.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span className="text-sm font-semibold">Back</span>
                </Button>

                {/* Right: Camera toggle + Progress */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-muted/20 border border-border/15 select-none">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <div className="w-7 h-7 rounded-lg bg-muted/40 flex items-center justify-center">
                        <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <span className="hidden md:inline text-xs font-semibold text-muted-foreground">Proctoring</span>
                      <Switch
                        checked={enableCameraProctoring}
                        onCheckedChange={setEnableCameraProctoring}
                        aria-label="Toggle camera-proctored mode"
                      />
                    </label>
                  </div>

                  {viewProgressButton(
                    "h-10 px-4 md:hidden rounded-xl bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground border border-border/20"
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto w-full px-6 sm:px-8 pt-4">
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
    return (
      <div className="max-w-4xl mx-auto w-full px-4">
        <div className="flex justify-end pt-2">
          {viewProgressButton("h-8 px-3 md:hidden")}
        </div>
        <Card className="w-full rounded-3xl border border-border/30 overflow-hidden shadow-xl shadow-black/10">
          <div className="h-1 bg-gradient-to-r from-primary via-purple-500 to-primary" />
          <CardHeader className="text-center pb-3 pt-8">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/20 flex items-center justify-center mb-3">
              {enableAdaptive ? <Brain className="w-7 h-7 text-primary" /> : <Target className="w-7 h-7 text-primary" />}
            </div>
            <CardTitle className="text-2xl font-black tracking-tight">
              {enableAdaptive ? 'Setup Your Profile' : 'Ready to Start'}
            </CardTitle>
            <CardDescription className="text-sm">
              {enableAdaptive
                ? 'Help AI generate personalized questions'
                : 'Preparing your interview'
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 px-6 pb-6">
            <div className="flex items-center justify-between p-3 bg-muted/20 rounded-2xl border border-border/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted/30 rounded-xl">
                  <Camera className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-xs">Camera-proctored mode</p>
                  <p className="text-[10px] text-muted-foreground">Optional integrity analysis on top of the required camera and screen recording</p>
                </div>
              </div>
              <Switch
                checked={enableCameraProctoring}
                onCheckedChange={setEnableCameraProctoring}
              />
            </div>

            {renderLivePracticeConsentCard({
              id: 'setup-live-practice-consent',
            })}

            {enableAdaptive && (
              <>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="domain" className="text-xs font-semibold">Domain / Specialization *</Label>
                    <Input
                      id="domain"
                      className="h-10 text-sm rounded-xl border-border/30 bg-muted/10 focus:bg-background transition-colors"
                      placeholder="e.g., Python Backend Development"
                      value={profileDomain}
                      onChange={(e) => setProfileDomain(e.target.value)}
                      maxLength={512}
                    />
                    <p className="text-[10px] text-muted-foreground">Your primary technical domain</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="experience" className="text-xs font-semibold">Years of Experience *</Label>
                    <Input
                      id="experience"
                      type="number"
                      className="h-10 text-sm rounded-xl border-border/30 bg-muted/10 focus:bg-background transition-colors"
                      min="0"
                      max="50"
                      placeholder="e.g., 5"
                      value={profileExperience || ''}
                      onChange={(e) => setProfileExperience(parseInt(e.target.value) || 0)}
                      maxLength={3}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="skills" className="text-xs font-semibold">Key Skills *</Label>
                    <Input
                      id="skills"
                      className="h-10 text-sm rounded-xl border-border/30 bg-muted/10 focus:bg-background transition-colors"
                      placeholder="e.g., Python, Django, AWS"
                      value={profileSkills}
                      onChange={(e) => setProfileSkills(e.target.value)}
                      maxLength={512}
                    />
                    <p className="text-[10px] text-muted-foreground">Comma-separated skills</p>
                  </div>

                  <Separator className="my-1" />
                  <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Optional</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="jobRole" className="text-xs font-semibold">Target Role</Label>
                      <Input
                        id="jobRole"
                        className="h-10 text-sm rounded-xl border-border/30 bg-muted/10 focus:bg-background transition-colors"
                        placeholder="Senior Engineer"
                        value={profileJobRole}
                        onChange={(e) => setProfileJobRole(e.target.value)}
                        maxLength={512}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="company" className="text-xs font-semibold">Company Type</Label>
                      <Input
                        id="company"
                        className="h-10 text-sm rounded-xl border-border/30 bg-muted/10 focus:bg-background transition-colors"
                        placeholder="FAANG, Startup"
                        value={profileCompany}
                        onChange={(e) => setProfileCompany(e.target.value)}
                        maxLength={512}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="focus" className="text-xs font-semibold">Focus Areas</Label>
                    <Input
                      id="focus"
                      className="h-10 text-sm rounded-xl border-border/30 bg-muted/10 focus:bg-background transition-colors"
                      placeholder="System Design, API Design"
                      value={profileFocus}
                      onChange={(e) => setProfileFocus(e.target.value)}
                      maxLength={512}
                    />
                    <p className="text-[10px] text-muted-foreground">Comma-separated topics</p>
                  </div>
                </div>

                {(!profileDomain || !profileExperience || !profileSkills) && (
                  <div className="flex items-center gap-2.5 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                    <p className="text-xs text-yellow-600 dark:text-yellow-500 font-medium">
                      Required fields (*) needed to continue
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-11 text-sm rounded-2xl font-semibold"
                onClick={() => setPhase('welcome')}
              >
                <ArrowRight className="mr-1.5 w-4 h-4 rotate-180" />
                Back
              </Button>
              <Button
                className="flex-1 h-11 text-sm rounded-2xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                onClick={handleStartInterview}
                disabled={isProcessing || !livePracticeConsentChecked || (enableAdaptive && (!profileDomain || !profileExperience || !profileSkills))}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-1.5 w-4 h-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 w-4 h-4" />
                    {enableAdaptive ? 'Generate Questions' : 'Begin Interview'}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
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

    return (
      <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 flex flex-col space-y-4 pb-[env(safe-area-inset-bottom)]">
        {renderGuestGateBanner()}
        {renderFacePreview()}
        {renderFaceWarningOverlay()}
        {renderProctoringStatusPanel()}

        {/* A drill skips the Live Practice consent card, because that card is
            about screen and camera capture which a drill does not perform. It
            does record the microphone, so say so plainly rather than not at all. */}
        {isDrillSession && (
          <div className="flex items-start gap-2 rounded-xl border border-border/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <Mic className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/70" />
            <span>
              Your microphone records this answer so it can be scored. No screen or
              camera capture.
            </span>
          </div>
        )}

        {/* ── Header bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {isDrillSession && (
              <Badge
                variant="outline"
                className="text-[11px] sm:text-sm px-3 py-1.5 rounded-xl bg-primary/10 border-primary/30 text-primary"
              >
                <Mic className="w-3 h-3 mr-1.5" />
                Practice drill
              </Badge>
            )}
            {currentRoundConfig && (
              <Badge variant="outline" className="text-[11px] sm:text-sm px-3 py-1.5 rounded-xl bg-muted/20 border-border/30 backdrop-blur-sm">
                <Target className="w-3 h-3 mr-1.5" />
                {currentRoundConfig.name}
              </Badge>
            )}
            <Badge variant="outline" className="text-[11px] sm:text-sm px-3 py-1.5 rounded-xl border-border/30">
              Q {currentQuestionNumber} / {totalQuestions}
            </Badge>

            <Badge
              variant="outline"
              className={`rounded-xl ${
                isCodingQuestion(currentQuestion)
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                  : "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400"
              }`}
            >
              {isCodingQuestion(currentQuestion) ? 'CODING' : 'VOICE'}
              {currentQuestion?.programming_language && ` (${currentQuestion.programming_language})`}
            </Badge>

            <Badge className="bg-primary/90 text-primary-foreground text-[11px] sm:text-sm rounded-xl px-3 py-1">
              {displayedQuestionDifficulty}
            </Badge>
            {phase === 'recording' ? (
              <Badge
                variant={timeRemaining <= 10 ? "destructive" : "secondary"}
                className={`rounded-xl ${timeRemaining <= 10 ? "animate-pulse" : ""}`}
              >
                <Clock className="w-3 h-3 mr-1" />
                {formatTime(timeRemaining)}
              </Badge>
            ) : (
              <Badge variant="outline" className="opacity-60 rounded-xl">
                <Clock className="w-3 h-3 mr-1" />
                {currentQuestion?.time_limit}s limit
              </Badge>
            )}

            {(isProcessing || isSubmittingCode) && (
              <Badge variant="secondary" className="animate-pulse text-[11px] sm:text-sm rounded-xl">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Submitting…
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Progress value={(currentQuestionNumber / totalQuestions) * 100} className="w-full sm:w-36 h-2 rounded-full" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEndPractice}
              className="h-8 px-3 text-[10px] sm:text-xs font-bold uppercase tracking-tight text-red-400/70 hover:text-white hover:bg-destructive rounded-xl transition-all duration-200 shrink-0"
            >
              End
            </Button>
          </div>
        </div>

        {/* ── Question Card ── */}
        <Card key={currentQuestionRenderKey} className="flex-1 flex flex-col rounded-2xl border border-border/30 shadow-lg shadow-black/5 overflow-hidden">
          {/* Gradient top accent */}
          <div className={`h-0.5 ${isCodingQuestion(currentQuestion) ? 'bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500' : 'bg-gradient-to-r from-green-500 via-emerald-400 to-green-500'}`} />

          {isCodingQuestion(currentQuestion) ? (
            <div className="p-3 sm:p-6">
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
            <>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl sm:text-2xl font-bold mb-2 leading-snug">
                      {deliveredQuestionText || (fullQuestionText ? '…' : 'No question text available')}
                    </CardTitle>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {currentQuestion?.time_limit}s time limit
                      </div>
                      <Badge variant="secondary" className="text-xs rounded-lg">
                        {currentQuestion?.category}
                      </Badge>
                    </div>
                  </div>
                  {enableTTS && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="rounded-xl"
                      onClick={() => {
                        if (currentQuestion && sessionId) {
                          // Replay audio logic here
                        }
                      }}
                      disabled={isPlayingAudio}
                    >
                      {isPlayingAudio ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col items-center justify-center gap-6 pb-8">
                {phase === 'recording' ? (
                  <>
                    <div className="relative flex flex-col items-center">
                      {/* Futuristic Waveform Visualization */}
                      <div className="flex items-end gap-1.5 h-32 mb-6">
                        {[...Array(16)].map((_, i) => {
                          const baseHeight = 16;
                          const maxHeight = 120;
                          const position = Math.abs(i - 7.5) / 7.5;
                          const heightMultiplier = (1 - position * 0.4) * audioLevel;
                          const height = baseHeight + (maxHeight - baseHeight) * heightMultiplier;

                          return (
                            <div
                              key={i}
                              className="w-1.5 rounded-full transition-all duration-75 ease-out"
                              style={{
                                height: `${height}px`,
                                opacity: 0.6 + audioLevel * 0.4,
                                background: `linear-gradient(to top, rgb(239, 68, 68), rgb(236, 72, 153))`,
                              }}
                            />
                          );
                        })}
                      </div>

                      {/* Recording Timer Pill */}
                      <Badge className="bg-red-500/90 text-white px-5 py-2 text-base rounded-2xl shadow-lg shadow-red-500/30">
                        <div className="w-2 h-2 bg-white rounded-full mr-2.5 animate-pulse" />
                        {formatTime(recordingTime)}
                      </Badge>
                    </div>

                    <div className="text-center space-y-2">
                      <h3 className="text-2xl font-bold">Recording...</h3>
                      <p className="text-muted-foreground">
                        Speak clearly and naturally. Click stop when finished.
                      </p>
                    </div>

                    <Button
                      size="lg"
                      variant="destructive"
                      className="px-8 h-12 rounded-2xl shadow-lg shadow-red-500/20 hover:shadow-xl hover:shadow-red-500/30 font-bold transition-all duration-200"
                      onClick={handleStopRecording}
                      disabled={isProcessing}
                    >
                      <MicOff className="mr-2 w-5 h-5" />
                      Stop & Submit
                    </Button>
                  </>
                ) : (
                  <>
                    {(isPlayingAudio || isAudioLoading) ? (
                      <>
                        <div className="relative">
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 blur-xl opacity-40 animate-pulse" />
                          <div className="relative w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/30">
                            <Volume2 className="w-14 h-14 text-white" />
                          </div>
                          <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2">
                            <Badge className="bg-blue-500 text-white px-4 py-1 rounded-xl shadow-lg">
                              AI Speaking
                            </Badge>
                          </div>
                        </div>

                        <div className="text-center space-y-2 pt-2">
                          <h3 className="text-2xl font-bold">Listen to the Question</h3>
                          <p className="text-muted-foreground max-w-md">
                            The AI interviewer is asking you the question. Please listen carefully.
                          </p>
                        </div>

                        <Button
                          size="lg"
                          variant="outline"
                          className="px-8 h-12 rounded-2xl"
                          disabled
                        >
                          <Loader2 className="mr-2 animate-spin" />
                          Please Wait...
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="relative">
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/30 blur-xl opacity-30" />
                          <div className="relative w-32 h-32 bg-gradient-to-br from-primary/20 to-primary/10 border-2 border-primary/30 rounded-full flex items-center justify-center shadow-xl">
                            <Mic className="w-14 h-14 text-primary" />
                          </div>
                        </div>

                        <div className="text-center space-y-2">
                          <h3 className="text-2xl font-bold">Ready to Answer</h3>
                          <p className="text-muted-foreground max-w-md">
                            {autoStartVoiceRecording
                              ? 'Recording starts automatically when the question is ready. Timer begins when recording begins.'
                              : 'Click the button below to start recording. Timer begins when recording begins.'}
                          </p>
                          <div className="flex items-center justify-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-primary" />
                            <span className="font-semibold text-primary">{currentQuestion?.time_limit}s time limit</span>
                          </div>
                        </div>

                        <Button
                          size="lg"
                          className="px-8 h-12 rounded-2xl shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 font-bold"
                          onClick={handleStartRecording}
                          disabled={isProcessing}
                        >
                          <Mic className="mr-2 w-5 h-5" />
                          Start Recording
                        </Button>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    );
  }

  if (phase === 'processing') {
    return (
      <div className="max-w-4xl mx-auto w-full px-4 flex items-center justify-center">
        {renderFacePreview()}
        {renderFaceWarningOverlay()}
        {renderProctoringStatusPanel()}
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-purple-500 blur-xl opacity-30 animate-pulse" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/30 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
            </div>
          </div>
          <div className="text-sm text-muted-foreground font-medium">Analyzing your response…</div>
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
    const feedbackTone = getStrategyToneClasses(strategyPreview?.coaching_style);
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

    return (
      <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 flex flex-col space-y-3 sm:space-y-4 pb-6">
        {renderProctoringStatusPanel()}
        {/* ── Header ── */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">{isCodeQ ? 'Code Feedback' : 'Answer Feedback'}</h2>
            {completionPending && (
              <Badge className="bg-primary/10 text-primary border-primary/20 rounded-xl" variant="outline">
                Final
              </Badge>
            )}
          </div>
          <Badge variant="outline" className="text-xs sm:text-sm rounded-xl">
            Q {currentQuestionNumber} / {totalQuestions}
          </Badge>
        </div>

        {showFeedbackPreview && (
          <Card className={`border rounded-2xl overflow-hidden ${feedbackTone.card}`}>
            <div className="h-0.5 bg-gradient-to-r from-primary via-purple-500 to-primary" />
            <CardContent className="pt-4 px-4 pb-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Coming up next
                  </div>
                  {feedbackBadgeLabel && (
                    <Badge variant="outline" className={`rounded-xl ${feedbackTone.badge}`}>
                      {feedbackBadgeLabel}
                    </Badge>
                  )}
                  <p className="text-base sm:text-lg font-bold leading-relaxed text-foreground/95">
                    {feedbackHeadline}
                  </p>
                  {feedbackReasonText && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {feedbackReasonText}
                    </p>
                  )}
                </div>

                {feedbackRequiresAcknowledgment && (
                  <span className="text-xs text-muted-foreground">Continue when you’re ready.</span>
                )}
              </div>

              {strategyDebugMode && strategyPreview?.decision_trace && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" className="w-full justify-between px-3 py-2 h-auto rounded-lg border border-border/60 bg-background/60">
                      <div className="text-left">
                        <div className="text-sm font-semibold">Debug details</div>
                        <div className="text-xs text-muted-foreground">Internal adaptation metadata for power users.</div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 px-1 pt-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Action: {feedbackActionLabel}</Badge>
                      {feedbackDepthLabel && <Badge variant="outline">Depth: {feedbackDepthLabel}</Badge>}
                      {strategyPreview?.target_difficulty && (
                        <Badge variant="outline" className="capitalize">Difficulty: {strategyPreview.target_difficulty}</Badge>
                      )}
                      {strategyPreview?.coaching_style && (
                        <Badge variant="outline" className="capitalize">Style: {strategyPreview.coaching_style}</Badge>
                      )}
                    </div>
                    {(feedbackGuardrail || feedbackPressureMode) && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {feedbackGuardrail && (
                          <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Guardrail</div>
                            <div className="mt-1 text-sm text-foreground/90">{feedbackGuardrail}</div>
                          </div>
                        )}
                        {feedbackPressureMode && (
                          <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Pressure mode</div>
                            <div className="mt-1 text-sm text-foreground/90">{feedbackPressureMode}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {strategyPreview.decision_trace.follow_up_budget && (
                      <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Follow-up budget</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {typeof strategyPreview.decision_trace.follow_up_budget.used === 'number' && (
                            <Badge variant="outline">Used {strategyPreview.decision_trace.follow_up_budget.used}</Badge>
                          )}
                          {typeof strategyPreview.decision_trace.follow_up_budget.max === 'number' && (
                            <Badge variant="outline">Max {strategyPreview.decision_trace.follow_up_budget.max}</Badge>
                          )}
                          {typeof strategyPreview.decision_trace.follow_up_budget.remaining === 'number' && (
                            <Badge variant="outline">Remaining {strategyPreview.decision_trace.follow_up_budget.remaining}</Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── CODE question feedback ── */}
        {isCodeQ && (
          <>
            {/* Code Evaluation Scores */}
            {activeCodeEvaluation && (
              <Card className="border border-border/30 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-500/5 to-blue-500/10">
                <div className="h-0.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500" />
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <div className="p-1.5 bg-blue-500/10 rounded-lg">
                      <Target className="w-5 h-5 text-blue-500" />
                    </div>
                    Code Evaluation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Overall + Pass/Fail */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-base px-3 py-1">
                      Overall: {activeCodeEvaluation.overall_score}%
                    </Badge>
                    <Badge variant={activeCodeEvaluation.is_correct ? 'default' : 'destructive'}>
                      {activeCodeEvaluation.is_correct ? '✅ Accepted' : '❌ Not Accepted'}
                    </Badge>
                    {activeCodeEvaluation.test_cases_total !== undefined && (
                      <Badge variant="outline">
                        Tests: {activeCodeEvaluation.test_cases_passed ?? 0}/{activeCodeEvaluation.test_cases_total}
                      </Badge>
                    )}
                  </div>

                  {/* Score breakdown bars */}
                  <div className="space-y-2">
                    {[
                      { label: 'Correctness', value: activeCodeEvaluation.correctness_score },
                      { label: 'Code Quality', value: activeCodeEvaluation.code_quality_score },
                      { label: 'Efficiency', value: activeCodeEvaluation.efficiency_score },
                    ].map(({ label, value }) => (
                      <div key={label} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{label}</span>
                          <span className="font-bold">{value}%</span>
                        </div>
                        <Progress value={value} className="h-2" />
                      </div>
                    ))}
                  </div>

                  {/* Complexity */}
                  {(activeCodeEvaluation.time_complexity || activeCodeEvaluation.space_complexity) && (
                    <div className="flex flex-wrap gap-3 text-sm">
                      {activeCodeEvaluation.time_complexity && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Time:</span>
                          <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{activeCodeEvaluation.time_complexity}</code>
                        </div>
                      )}
                      {activeCodeEvaluation.space_complexity && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">Space:</span>
                          <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{activeCodeEvaluation.space_complexity}</code>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Test Results Detail */}
            {activeCodeTestResults && activeCodeTestResults.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Test Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activeCodeTestResults.map((test, idx) => (
                    <div key={idx} className={`rounded-md border p-3 text-sm ${test.passed ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">Test Case {test.test_case_number}</span>
                        <Badge variant={test.passed ? 'default' : 'destructive'} className="text-xs">
                          {test.passed ? 'Passed' : 'Failed'}
                        </Badge>
                      </div>
                      {!test.passed && (
                        <div className="text-xs text-muted-foreground space-y-1 mt-2">
                          {test.expected_output && <div><span className="font-medium">Expected:</span> {test.expected_output}</div>}
                          {test.actual_output && <div><span className="font-medium">Got:</span> {test.actual_output}</div>}
                          {test.error_message && <div className="text-red-500"><span className="font-medium">Error:</span> {test.error_message}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Approach Feedback */}
            {activeCodeEvaluation?.approach_feedback && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Approach Feedback</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{activeCodeEvaluation.approach_feedback}</p>
                </CardContent>
              </Card>
            )}

            {/* Edge cases & Suggestions */}
            {activeCodeEvaluation && (
              <div className="grid md:grid-cols-2 gap-3">
                {activeCodeEvaluation.edge_cases_handled && activeCodeEvaluation.edge_cases_handled.length > 0 && (
                  <Card className="border-green-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-green-600 dark:text-green-400">✅ Edge Cases Handled</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-xs space-y-1">
                        {activeCodeEvaluation.edge_cases_handled.map((ec, i) => (
                          <li key={i} className="flex items-start gap-1.5"><span className="text-green-500 shrink-0">✓</span> {ec}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
                {activeCodeEvaluation.edge_cases_missed && activeCodeEvaluation.edge_cases_missed.length > 0 && (
                  <Card className="border-red-500/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-red-600 dark:text-red-400">❌ Edge Cases Missed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-xs space-y-1">
                        {activeCodeEvaluation.edge_cases_missed.map((ec, i) => (
                          <li key={i} className="flex items-start gap-1.5"><span className="text-red-500 shrink-0">✗</span> {ec}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Optimization Suggestions */}
            {activeCodeEvaluation?.optimization_suggestions && activeCodeEvaluation.optimization_suggestions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">💡 Optimization Suggestions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-xs space-y-1.5">
                    {activeCodeEvaluation.optimization_suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2"><span className="text-primary shrink-0">→</span> <span className="leading-relaxed">{s}</span></li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* No evaluation fallback */}
            {!activeCodeEvaluation && (!activeCodeTestResults || activeCodeTestResults.length === 0) && (
              <Card className="border-amber-500/30">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No code evaluation details were returned for this submission.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── VOICE question feedback ── */}
        {!isCodeQ && (
          <>
        {/* Pressure / Mode indicator (debug only) */}
        {strategyDebugMode && pressure && (pressure.mode || pressure.reason) && (
          <Card className="border-muted">
            <CardContent className="pt-4 px-3 sm:px-6 pb-4 sm:pb-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Mode</div>
                  {pressure.reason ? (
                    <div className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                      {pressure.reason}
                    </div>
                  ) : null}
                </div>
                {pressure.mode ? (
                  <Badge variant="outline" className="capitalize shrink-0">
                    {pressure.mode}
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Speech Metrics - Futuristic Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: 'Speed', value: speechMetrics?.wpm || 0, unit: 'wpm', icon: Activity, color: 'text-blue-500' },
            { label: 'Confidence', value: `${((speechMetrics?.confidence_score || 0) * 100).toFixed(0)}%`, unit: 'score', icon: Gauge, color: 'text-green-500' },
            { label: 'Fillers', value: speechMetrics?.filler_count || 0, unit: 'um, uh', icon: CircleDot, color: 'text-amber-500' },
          ].map((metric) => (
            <Card key={metric.label} className="border-border/20 rounded-2xl overflow-hidden">
              <CardContent className="p-3 sm:p-4 text-center">
                <metric.icon className={`w-4 h-4 mx-auto mb-1.5 ${metric.color} opacity-60`} />
                <div className="text-xl sm:text-3xl font-black">{metric.value}</div>
                <p className="text-[9px] sm:text-xs text-muted-foreground mt-0.5 uppercase tracking-wider">{metric.unit}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* VAD Silence Removal - Compact Mobile Version */}
        {speechMetrics?.silence_removed && speechMetrics.silence_removed > 0 && (
          <Card className="border-yellow-500/30 bg-gradient-to-br from-yellow-50/50 to-orange-50/30 dark:from-yellow-950/20 dark:to-orange-950/10">
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6 pb-4 sm:pb-6">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-full shrink-0">
                  <Clock className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600 dark:text-yellow-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2 mb-2">
                    <span className="text-2xl sm:text-3xl font-bold text-yellow-700 dark:text-yellow-400">
                      {speechMetrics.silence_removed.toFixed(1)}s
                    </span>
                    <span className="text-xs sm:text-sm text-muted-foreground">of silence removed</span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-3 leading-relaxed">
                    ⏸️ Long pauses were detected and removed by Voice Activity Detection (VAD). Practice speaking more continuously to reduce dead air.
                  </p>

                  {/* Compact Time Breakdown */}
                  <div className="bg-white/60 dark:bg-gray-800/60 rounded-lg p-2 sm:p-3 space-y-1.5 sm:space-y-2 mb-2">
                    <div className="flex justify-between items-center text-xs sm:text-sm">
                      <span className="text-muted-foreground">Actual Speaking Time:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {((speechMetrics.duration || 0) - speechMetrics.silence_removed).toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs sm:text-sm">
                      <span className="text-muted-foreground">Silence Removed:</span>
                      <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                        {speechMetrics.silence_removed.toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs sm:text-sm border-t pt-1.5 sm:pt-2">
                      <span className="text-muted-foreground font-medium">Total Recording:</span>
                      <span className="font-semibold">
                        {(speechMetrics.duration || 0).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Progress
                      value={Math.min(100, (speechMetrics.silence_removed / (speechMetrics.duration || 1)) * 100)}
                      className="h-1.5 sm:h-2 bg-yellow-200 dark:bg-yellow-900/30"
                    />
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                      {((speechMetrics.silence_removed / (speechMetrics.duration || 1)) * 100).toFixed(1)}% of your recording was silence
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Your Answer & Feedback */}
        <Card className="flex-1 rounded-2xl border border-border/30 overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" />
          <CardHeader className="px-3 sm:px-6 pt-4 sm:pt-6 pb-3">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <div className="p-1.5 bg-green-500/10 rounded-lg">
                <FileText className="w-4 h-4 text-green-500" />
              </div>
              Your Answer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-4 sm:pb-6">
            <ScrollArea className="h-24 sm:h-32">
              <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">{transcription}</p>
            </ScrollArea>

            <Separator />

            {/* Answer Correctness Section - NEW */}
            {microFeedback?.correctness_score !== undefined && (
              <>
                <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                      <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Answer Correctness
                    </h4>
                    <div className="flex items-center gap-2 sm:gap-3">
                      {microFeedback.is_correct ? (
                        <span className="text-green-600 dark:text-green-400 text-lg sm:text-2xl">✅</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 text-lg sm:text-2xl">❌</span>
                      )}
                      <span className="text-xl sm:text-2xl font-bold text-primary">
                        {microFeedback.correctness_score}%
                      </span>
                      {microFeedback.technical_accuracy && (
                        <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${microFeedback.technical_accuracy === 'Excellent' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          microFeedback.technical_accuracy === 'Good' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                            microFeedback.technical_accuracy === 'Fair' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                          {microFeedback.technical_accuracy}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Key Points Covered */}
                  {microFeedback.key_points_covered && microFeedback.key_points_covered.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-green-600 dark:text-green-400">
                        ✅ Key Points Covered
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.key_points_covered.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-green-600 dark:text-green-400 mt-0.5 shrink-0">✓</span>
                            <span className="leading-relaxed">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Key Points Missed */}
                  {microFeedback.key_points_missed && microFeedback.key_points_missed.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-red-600 dark:text-red-400">
                        ❌ Key Points Missed
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.key_points_missed.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-red-600 dark:text-red-400 mt-0.5 shrink-0">✗</span>
                            <span className="leading-relaxed">{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Strengths */}
                  {microFeedback.strengths && microFeedback.strengths.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-blue-600 dark:text-blue-400">
                        💪 Strengths
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.strengths.map((strength, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0">•</span>
                            <span className="leading-relaxed">{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improvement Areas */}
                  {microFeedback.improvement_areas && microFeedback.improvement_areas.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-orange-600 dark:text-orange-400">
                        📈 Areas to Improve
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.improvement_areas.map((area, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-orange-600 dark:text-orange-400 mt-0.5 shrink-0">↗</span>
                            <span className="leading-relaxed">{area}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actionable Suggestions */}
                  {microFeedback.actionable_suggestions && microFeedback.actionable_suggestions.length > 0 && (
                    <div>
                      <h5 className="text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 text-primary">
                        🎯 Next Steps
                      </h5>
                      <ul className="text-xs sm:text-sm space-y-1">
                        {microFeedback.actionable_suggestions.map((suggestion, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-primary mt-0.5 shrink-0">→</span>
                            <span className="leading-relaxed">{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Model Answer */}
                  {microFeedback?.model_answer && (
                    <div className="mt-4 p-3 bg-green-500/5 rounded-lg">
                      <h4 className="font-semibold text-sm mb-1 text-green-600 dark:text-green-400">📖 Model Answer</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {microFeedback.model_answer}
                      </p>
                    </div>
                  )}
                </div>
                <Separator />
              </>
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
                <>
                  <div className="space-y-2 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                    <div className="text-sm sm:text-base font-semibold flex items-center gap-2">
                      <span>🧠</span> Why this score
                    </div>
                    <ul className="text-xs sm:text-sm space-y-1.5">
                      {whyLines.map((line, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-primary mt-0.5 shrink-0">•</span>
                          <span className="text-muted-foreground leading-relaxed">{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Separator />
                </>
              );
            })()}

            {/* Session trajectory */}
            {trajectory && (trajectory.points || trajectory.overall || trajectory.dimensions || trajectory.note) && (
              <>
                <div className="space-y-3 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm sm:text-base font-semibold flex items-center gap-2">
                      <span>📈</span> Session Trajectory
                    </div>
                    {typeof trajectory?.overall?.delta === 'number' && (
                      <Badge
                        variant="outline"
                        className={`font-mono text-xs ${
                          trajectory.overall.delta > 0
                            ? 'border-green-500/40 text-green-600 dark:text-green-400'
                            : trajectory.overall.delta < 0
                              ? 'border-red-500/40 text-red-600 dark:text-red-400'
                              : ''
                        }`}
                      >
                        Overall Δ {trajectory.overall.delta > 0 ? '+' : ''}{Math.round(trajectory.overall.delta * 100) / 100}
                      </Badge>
                    )}
                  </div>

                  {typeof trajectory.note === 'string' && trajectory.note.trim() && (
                    <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed italic">
                      {trajectory.note}
                    </div>
                  )}

                  {trajectory.dimensions && typeof trajectory.dimensions === 'object' && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {Object.entries(trajectory.dimensions as Record<string, any>).map(([dim, info]) => {
                        const delta = (info as any)?.delta;
                        if (typeof delta !== 'number') return null;
                        const rounded = Math.round(delta * 100) / 100;
                        return (
                          <Badge
                            key={dim}
                            variant="secondary"
                            className={`capitalize font-mono text-xs ${
                              rounded > 0
                                ? 'text-green-600 dark:text-green-400'
                                : rounded < 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {dim} {rounded > 0 ? '+' : ''}{rounded}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {Array.isArray(trajectory.points) && trajectory.points.length > 0 && (
                    <div className="pt-1 space-y-1">
                      {trajectory.points.map((p: any, idx: number) => {
                        const qn = p?.question_number ?? p?.question ?? idx + 1;
                        const overall = p?.overall ?? p?.overall_score;
                        const dims = p?.dimensions ?? p?.dimension_scores;
                        const roundedOverall = typeof overall === 'number' ? Math.round(overall * 100) / 100 : null;
                        return (
                          <div key={idx} className="text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-2 py-1 border-b border-border/40 last:border-0">
                            <Badge variant="outline" className="text-xs font-mono">Q{qn}</Badge>
                            {roundedOverall !== null && (
                              <span>
                                Overall: <span className="font-semibold text-foreground">{roundedOverall}</span>
                              </span>
                            )}
                            {dims && typeof dims === 'object' && (
                              <span className="text-muted-foreground/80">
                                {Object.entries(dims as Record<string, any>)
                                  .filter(([, v]) => typeof v === 'number')
                                  .slice(0, 4)
                                  .map(([k, v]) => `${k}: ${Math.round((v as number) * 100) / 100}`)
                                  .join(' · ')}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Delivery Feedback - Compact Mobile Layout */}
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
                  <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Delivery Tips
                </h4>
                <ul className="text-xs sm:text-sm space-y-1.5 sm:space-y-2">
                  {microFeedback?.delivery_tips && microFeedback.delivery_tips.length > 0 ? (
                    microFeedback.delivery_tips.map((tip, idx) => {
                      const isVadTip = tip.toLowerCase().includes('silence') ||
                        tip.toLowerCase().includes('pause') ||
                        tip.includes('⏸️');

                      return (
                        <li key={idx} className={`flex items-start gap-2 p-2 rounded leading-relaxed ${isVadTip ? 'bg-yellow-50 dark:bg-yellow-950/20 border-l-2 border-yellow-500' : ''
                          }`}>
                          <span className={`mt-0.5 shrink-0 ${isVadTip ? 'text-yellow-600 dark:text-yellow-500' : 'text-primary'}`}>
                            {isVadTip ? '⏸️' : '•'}
                          </span>
                          <span className={isVadTip ? 'text-yellow-700 dark:text-yellow-400 font-medium' : 'text-muted-foreground'}>
                            {tip}
                          </span>
                        </li>
                      );
                    })
                  ) : (
                    <li className="text-muted-foreground">{microFeedback?.speech_quality || 'N/A'}</li>
                  )}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
                  <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Overall Note
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {microFeedback?.overall_note || microFeedback?.content_relevance || 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
          </>
        )}

        {/* Phase 3: Feedback usefulness rating (optional) */}
        {questionId && (
          <Card className="border-border/20 rounded-2xl overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500" />
            <CardHeader className="px-3 sm:px-6 pt-4 sm:pt-6 pb-3">
              <CardTitle className="text-base sm:text-lg">Was this feedback useful?</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Optional — helps us improve the coach.</CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((v) => {
                    const active = (usefulnessRating ?? 0) >= v;
                    return (
                      <Button
                        key={v}
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={ratingSubmitted || ratingSubmitting}
                        className="h-9 w-9"
                        onClick={() => updateFeedbackRatingDraft(questionId, { usefulnessRating: v })}
                        aria-label={`Rate usefulness ${v} out of 5`}
                      >
                        <Star className={active ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'} />
                      </Button>
                    );
                  })}
                </div>
                {ratingSubmitted ? (
                  <span className="text-xs text-muted-foreground">Thanks — saved.</span>
                ) : ratingSubmitting ? (
                  <span className="text-xs text-muted-foreground">Saving…</span>
                ) : usefulnessRating ? (
                  <span className="text-xs text-muted-foreground">{usefulnessRating}/5</span>
                ) : (
                  <span className="text-xs text-muted-foreground">(tap to rate)</span>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Felt difficulty (optional)</Label>
                <div className="flex gap-2">
                  {(['easy', 'medium', 'hard'] as const).map((d) => {
                    const selected = perceivedDifficulty === d;
                    return (
                      <Button
                        key={d}
                        type="button"
                        variant={selected ? 'secondary' : 'outline'}
                        size="sm"
                        disabled={ratingSubmitted || ratingSubmitting}
                        onClick={() => updateFeedbackRatingDraft(questionId, { perceivedDifficulty: d })}
                        className="capitalize"
                      >
                        {d}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Comment (optional)</Label>
                <Textarea
                  value={comment}
                  disabled={ratingSubmitted || ratingSubmitting}
                  onChange={(e) => updateFeedbackRatingDraft(questionId, { comment: e.target.value })}
                  placeholder="What helped? What was missing?"
                  className="min-h-[56px]"
                  maxLength={500}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {renderGuestGateBanner()}

        <div className="flex justify-center gap-4">
          <Button
            onClick={handleNextQuestion}
            disabled={isProcessing || !!guestGateBanner}
            size="lg"
            className="px-8 h-12 rounded-2xl shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 font-bold"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </>
            ) : (
              <>
                {feedbackButtonLabel}
                {completionPending ? (
                  <CheckCircle2 className="ml-2 w-4 h-4" />
                ) : (
                  <ArrowRight className="ml-2 w-4 h-4" />
                )}
              </>
            )}
          </Button>
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

    // ── Report download handler ──
    const handleDownloadReport = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const strengthsList = evaluation?.strengths?.items && Array.isArray(evaluation.strengths.items) && evaluation.strengths.items.length > 0
        ? evaluation.strengths.items.map((s: string, i: number) => `  ${i + 1}. ${s}`).join('\n')
        : '  No strengths data available';

      const improvementsList = evaluation?.improvements?.items && Array.isArray(evaluation.improvements.items) && evaluation.improvements.items.length > 0
        ? evaluation.improvements.items.map((a: string, i: number) => `  ${i + 1}. ${a}`).join('\n')
        : '  No improvement areas data available';

      const actionSteps = evaluation?.action_plan?.steps && Array.isArray(evaluation.action_plan.steps) && evaluation.action_plan.steps.length > 0
        ? evaluation.action_plan.steps.map((s: string, i: number) => `  Step ${i + 1}: ${s}`).join('\n')
        : '  No action plan available';

      const avgWpm = evaluation?.metrics_summary?.avg_wpm || evaluation?.speech_summary?.average_wpm || 0;
      const totalFillers = evaluation?.metrics_summary?.total_fillers || evaluation?.speech_summary?.total_filler_count || 0;
      const avgConf = ((evaluation?.metrics_summary?.avg_confidence || evaluation?.speech_summary?.average_confidence || 0) * 100).toFixed(0);
      const longestPause = (evaluation?.metrics_summary?.longest_pause || 0).toFixed(1);
      const totalDuration = formatTime(Math.floor(evaluation?.metrics_summary?.total_duration || 0));
      const overtalkCount = evaluation?.metrics_summary?.overtalked_count || 0;

      let questionDetails = '';
      if (questionEvaluations.length > 0) {
        const sorted = [...questionEvaluations].sort((a, b) => a.questionNumber - b.questionNumber);
        questionDetails = sorted.map((item) => {
          let detail = `\n  Question ${item.questionNumber} (${item.kind.toUpperCase()})`;
          if (item.questionText) detail += `\n    Q: ${item.questionText}`;
          if (item.kind === 'voice') {
            if (item.transcript) detail += `\n    Your Answer: ${item.transcript}`;
            if (item.metrics?.wpm) detail += `\n    WPM: ${item.metrics.wpm}`;
            const voiceConf = item.metrics?.confidence_score !== undefined
              ? Math.round((item.metrics.confidence_score || 0) * 100) : undefined;
            if (voiceConf !== undefined) detail += ` | Confidence: ${voiceConf}%`;
            if (item.metrics?.filler_count !== undefined) detail += ` | Fillers: ${item.metrics.filler_count}`;
            if (item.microFeedback?.correctness_score !== undefined) {
              detail += `\n    Correctness: ${item.microFeedback.correctness_score}%`;
              if (item.microFeedback.technical_accuracy) detail += ` (${item.microFeedback.technical_accuracy})`;
            }
            if (item.microFeedback?.key_points_covered?.length) detail += `\n    Key Points Covered: ${item.microFeedback.key_points_covered.join('; ')}`;
            if (item.microFeedback?.key_points_missed?.length) detail += `\n    Key Points Missed: ${item.microFeedback.key_points_missed.join('; ')}`;
            if (item.microFeedback?.strengths?.length) detail += `\n    Strengths: ${item.microFeedback.strengths.join('; ')}`;
            if (item.microFeedback?.improvement_areas?.length) detail += `\n    Areas to Improve: ${item.microFeedback.improvement_areas.join('; ')}`;
            if (item.microFeedback?.model_answer) detail += `\n    Model Answer: ${item.microFeedback.model_answer}`;
          } else if (item.kind === 'code') {
            if (item.codeEvaluation) {
              detail += `\n    Overall: ${item.codeEvaluation.overall_score}% | ${item.codeEvaluation.is_correct ? 'Accepted' : 'Not Accepted'}`;
              if (item.codeEvaluation.correctness_score !== undefined) detail += `\n    Correctness: ${item.codeEvaluation.correctness_score}%`;
              if (item.codeEvaluation.code_quality_score !== undefined) detail += ` | Quality: ${item.codeEvaluation.code_quality_score}%`;
              if (item.codeEvaluation.efficiency_score !== undefined) detail += ` | Efficiency: ${item.codeEvaluation.efficiency_score}%`;
              if (item.codeEvaluation.time_complexity) detail += `\n    Time: ${item.codeEvaluation.time_complexity}`;
              if (item.codeEvaluation.space_complexity) detail += ` | Space: ${item.codeEvaluation.space_complexity}`;
              if (item.codeEvaluation.approach_feedback) detail += `\n    Approach: ${item.codeEvaluation.approach_feedback}`;
              if (item.codeEvaluation.edge_cases_handled?.length) detail += `\n    Edge Cases Handled: ${item.codeEvaluation.edge_cases_handled.join('; ')}`;
              if (item.codeEvaluation.edge_cases_missed?.length) detail += `\n    Edge Cases Missed: ${item.codeEvaluation.edge_cases_missed.join('; ')}`;
              if (item.codeEvaluation.optimization_suggestions?.length) detail += `\n    Suggestions: ${item.codeEvaluation.optimization_suggestions.join('; ')}`;
            }
            if (item.testResults?.length) {
              const passed = item.testResults.filter((t) => t.passed).length;
              detail += `\n    Tests: ${passed}/${item.testResults.length} passed`;
            }
          }
          return detail;
        }).join('\n');
      }

      const skippedSection = endedEarlyData?.skipped_questions?.length
        ? `\n\n${'═'.repeat(60)}\n  SKIPPED QUESTIONS\n${'═'.repeat(60)}\n${endedEarlyData.skipped_questions.map((q) => `  Q${q.question_number}: ${q.question}${q.category ? ` [${q.category}]` : ''}`).join('\n')}`
        : '';

      const proctoringSection = proctoringSessionEndSummary
        ? `\n\n${'═'.repeat(60)}\n  PROCTORING SUMMARY\n${'═'.repeat(60)}\n  ${proctoringSessionEndSummary.title}\n  ${proctoringSessionEndSummary.description}${proctoringSessionEndSummary.items.length ? '\n' + proctoringSessionEndSummary.items.map((item) => `  • ${item}`).join('\n') : ''}`
        : '';

      const reportContent = `
${'╔' + '═'.repeat(58) + '╗'}
${'║'}  STRATAX AI — INTERVIEW EVALUATION REPORT${' '.repeat(15)}${'║'}
${'╚' + '═'.repeat(58) + '╝'}

  Generated: ${dateStr} at ${timeStr}
  Session ID: ${sessionId || 'N/A'}
  ${currentRoundConfig ? `Round: ${currentRoundConfig.name}` : ''}
  Questions: ${totalQuestions}${endedEarlyData?.ended_early ? ` (${endedEarlyData.questions_answered ?? currentQuestionNumber} answered)` : ''}

${'═'.repeat(60)}
  OVERALL SCORE
${'═'.repeat(60)}
  Score: ${score}/100 (Grade: ${grade})
  ${score >= 80 ? '★ Excellent Performance!' : score >= 60 ? '★ Good Performance!' : score >= 40 ? '△ Fair — Keep Practicing' : '▽ Needs Improvement — Don\'t Give Up!'}

${'═'.repeat(60)}
  SPEECH ANALYTICS
${'═'.repeat(60)}
  Average Speed:    ${avgWpm} WPM
  Total Fillers:    ${totalFillers}
  Avg Confidence:   ${avgConf}%
  Longest Pause:    ${longestPause}s
  Duration:         ${totalDuration}
  Overtalk Count:   ${overtalkCount}

${evaluation?.learning_insight ? `  Peer Benchmark: ${evaluation.learning_insight}\n` : ''}
${'═'.repeat(60)}
  STRENGTHS
${'═'.repeat(60)}
${strengthsList}

${'═'.repeat(60)}
  AREAS FOR IMPROVEMENT
${'═'.repeat(60)}
${improvementsList}

${'═'.repeat(60)}
  ACTION PLAN
${'═'.repeat(60)}
${actionSteps}
${evaluation?.practice_recommendation ? `\n  Recommendation: ${evaluation.practice_recommendation}` : ''}

${'═'.repeat(60)}
  DETAILED QUESTION ANALYSIS
${'═'.repeat(60)}
${questionDetails || '  No detailed question data available'}
${skippedSection}${proctoringSection}

${'─'.repeat(60)}
  Report generated by StrataxAI Interview Practice Platform
  © ${now.getFullYear()} StrataxAI — All rights reserved
${'─'.repeat(60)}
`.trim();

      const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `StrataxAI_Interview_Report_${now.toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Report Downloaded',
        description: 'Your evaluation report has been saved.',
      });
    };

    return (
      <div className="max-w-4xl mx-auto w-full px-4 overflow-auto">
        <ScrollArea className="h-full">
          <div className="space-y-6 pb-8">

            {/* ── HERO: Futuristic completion header ── */}
            <div className="relative overflow-hidden rounded-3xl border border-border/30 bg-gradient-to-br from-background via-background/95 to-primary/5 shadow-2xl shadow-black/20">
              {/* Animated background elements */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-3xl" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-gradient-to-tr from-purple-500/10 to-transparent blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-gradient-to-r from-cyan-400/5 to-primary/5 blur-3xl" />
              </div>

              <div className="relative pt-10 pb-8 px-6">
                <div className="text-center space-y-5">
                  {/* Animated trophy with glow ring */}
                  <div className="relative mx-auto w-28 h-28 md:w-32 md:h-32">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400 via-orange-500 to-amber-400 animate-spin opacity-60" style={{ animationDuration: '4s' }} />
                    <div className="absolute inset-[3px] rounded-full bg-background" />
                    <div className="absolute inset-[6px] rounded-full bg-gradient-to-br from-yellow-400/30 via-orange-500/20 to-amber-400/30 flex items-center justify-center backdrop-blur-sm">
                      <Trophy className="w-14 h-14 md:w-16 md:h-16 text-yellow-500 drop-shadow-[0_0_12px_rgba(234,179,8,0.5)]" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
                      Interview Complete!
                    </h1>
                    {endedEarlyData?.ended_early && (
                      <div className={`inline-flex items-center px-4 py-1.5 rounded-2xl text-sm font-semibold backdrop-blur-sm ${
                        proctoringSessionEndSummary
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                          : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20'
                      }`}>
                        {proctoringSessionEndSummary ? '🚨 Interview ended by proctoring' : '⚠️ Ended early'} — {endedEarlyData.questions_answered ?? currentQuestionNumber}/{endedEarlyData.total_questions ?? totalQuestions} answered
                      </div>
                    )}
                    {currentRoundConfig ? (
                      <p className="text-muted-foreground text-base md:text-lg">
                        Completed <span className="font-bold text-primary">{currentRoundConfig.name}</span> — {totalQuestions} questions
                      </p>
                    ) : isDrillSession ? (
                      <p className="text-muted-foreground text-base md:text-lg">
                        Drill complete — one question practised.
                        <span className="block text-sm mt-1 text-muted-foreground/70">
                          Drills are scored but kept out of your Progress averages,
                          which track full interview rounds.
                        </span>
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-base md:text-lg">
                        Great job completing all <span className="font-bold text-primary">{totalQuestions}</span> questions!
                      </p>
                    )}
                  </div>

                  {/* Completion badge */}
                  <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 backdrop-blur-sm">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">See your detailed score breakdown below</span>
                    <ChevronDown className="w-4 h-4 text-primary animate-bounce" />
                  </div>
                </div>
              </div>
            </div>

            {/* Proctoring termination summary */}
            {proctoringSessionEndSummary && (
              <Card className="border-red-500/30 bg-gradient-to-br from-red-500/5 to-transparent rounded-2xl overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-red-500 via-red-400 to-red-500" />
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-red-600 dark:text-red-400">
                    <div className="p-1.5 bg-red-500/10 rounded-lg">
                      <AlertCircle className="h-5 w-5" />
                    </div>
                    {proctoringSessionEndSummary.title}
                  </CardTitle>
                  <CardDescription className="text-sm text-red-700/80 dark:text-red-300/80">
                    {proctoringSessionEndSummary.description}
                  </CardDescription>
                </CardHeader>
                {proctoringSessionEndSummary.items.length > 0 && (
                  <CardContent className="space-y-2 text-sm text-foreground">
                    {proctoringSessionEndSummary.items.map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <span className="mt-0.5 text-red-500">•</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Instant Score Breakdown */}
            {sessionId && (
              <InstantScoreBreakdown 
                sessionId={sessionId} 
                onViewProgress={() => navigate('/progress', { state: { refreshToken: Date.now() } })}
              />
            )}

            {/* ── TABBED REPORT VIEW ── */}
            <Tabs defaultValue="questions" className="w-full">
              <TabsList className="w-full grid grid-cols-4 h-12 rounded-2xl bg-muted/40 border border-border/30 p-1">
                <TabsTrigger value="questions" className="rounded-xl text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-md transition-all">
                  <Layers className="w-3.5 h-3.5 mr-1.5 hidden sm:block" />
                  Questions
                </TabsTrigger>
                <TabsTrigger value="strengths" className="rounded-xl text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-md transition-all">
                  <TrendingUp className="w-3.5 h-3.5 mr-1.5 hidden sm:block" />
                  Insights
                </TabsTrigger>
                <TabsTrigger value="analytics" className="rounded-xl text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-md transition-all">
                  <Activity className="w-3.5 h-3.5 mr-1.5 hidden sm:block" />
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="plan" className="rounded-xl text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-md transition-all">
                  <Target className="w-3.5 h-3.5 mr-1.5 hidden sm:block" />
                  Action Plan
                </TabsTrigger>
              </TabsList>

              {/* TAB: All Questions Evaluation */}
              <TabsContent value="questions" className="mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
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

                      return (
                        <Card key={`${item.kind}-${item.questionNumber}-${item.createdAt}`} className="border border-border/30 rounded-2xl overflow-hidden hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 group">
                          <div className={`h-0.5 ${item.kind === 'code' ? 'bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500' : 'bg-gradient-to-r from-green-500 via-emerald-400 to-green-500'}`} />
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black ${item.kind === 'code' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                                    Q{item.questionNumber}
                                  </div>
                                  <CardTitle className="text-base sm:text-lg truncate">
                                    Question {item.questionNumber}
                                  </CardTitle>
                                </div>
                                {item.questionText && (
                                  <p className="text-xs sm:text-sm text-muted-foreground mt-2 line-clamp-2 pl-10">
                                    {item.questionText}
                                  </p>
                                )}
                              </div>
                              <Badge variant="outline" className={`shrink-0 rounded-xl ${item.kind === 'code' ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400' : 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'}`}>
                                {item.kind === 'code' ? 'CODE' : 'VOICE'}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {item.kind === 'voice' && (
                              <>
                                {item.transcript && (
                                  <div className="space-y-2">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                                      <FileText className="w-3 h-3" />
                                      Transcript
                                    </div>
                                    <div className="rounded-xl border border-border/30 bg-muted/20 p-3 backdrop-blur-sm">
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{item.transcript}</p>
                                    </div>
                                  </div>
                                )}

                                {(item.metrics || item.microFeedback) && (
                                  <div className="grid grid-cols-3 gap-2">
                                    {[
                                      { label: 'WPM', value: item.metrics?.wpm ?? 0, icon: Activity },
                                      { label: 'Confidence', value: `${voiceConfidencePct ?? 0}%`, icon: Gauge },
                                      { label: 'Fillers', value: item.metrics?.filler_count ?? 0, icon: CircleDot },
                                    ].map((metric) => (
                                      <div key={metric.label} className="p-3 rounded-xl bg-muted/20 border border-border/20 text-center">
                                        <metric.icon className="w-3.5 h-3.5 mx-auto text-muted-foreground/50 mb-1" />
                                        <div className="text-lg font-bold">{metric.value}</div>
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{metric.label}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {item.microFeedback?.correctness_score !== undefined && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary" className="rounded-xl">
                                      Correctness: {item.microFeedback.correctness_score}%
                                    </Badge>
                                    {typeof item.microFeedback.is_correct === 'boolean' && (
                                      <Badge variant={item.microFeedback.is_correct ? 'default' : 'destructive'} className="rounded-xl">
                                        {item.microFeedback.is_correct ? 'Correct' : 'Needs Improvement'}
                                      </Badge>
                                    )}
                                    {item.microFeedback.technical_accuracy && (
                                      <Badge variant="outline" className="rounded-xl">{item.microFeedback.technical_accuracy}</Badge>
                                    )}
                                  </div>
                                )}
                              </>
                            )}

                            {item.kind === 'code' && (
                              <>
                                {item.codeEvaluation && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="secondary" className="rounded-xl text-sm px-3 py-1">Overall: {item.codeEvaluation.overall_score}%</Badge>
                                    <Badge variant={item.codeEvaluation.is_correct ? 'default' : 'destructive'} className="rounded-xl">
                                      {item.codeEvaluation.is_correct ? '✅ Accepted' : '❌ Not Accepted'}
                                    </Badge>
                                    {testsTotal !== undefined && testsPassed !== undefined && (
                                      <Badge variant="outline" className="rounded-xl">Tests: {testsPassed}/{testsTotal}</Badge>
                                    )}
                                  </div>
                                )}

                                {item.codeEvaluation?.approach_feedback && (
                                  <div className="space-y-2">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
                                      <Lightbulb className="w-3 h-3" />
                                      Approach Feedback
                                    </div>
                                    <div className="rounded-xl border border-border/30 bg-muted/20 p-3 backdrop-blur-sm">
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{item.codeEvaluation.approach_feedback}</p>
                                    </div>
                                  </div>
                                )}

                                {item.testResults && item.testResults.length > 0 && (
                                  <div className="space-y-2">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Test Results</div>
                                    <div className="rounded-xl border border-border/30 bg-muted/20 p-3 space-y-1.5">
                                      <div className="text-sm font-medium text-muted-foreground">
                                        {item.testResults.filter((t) => t.passed).length}/{item.testResults.length} passed
                                      </div>
                                      {item.testResults.map((tr, trIdx) => (
                                        <div key={trIdx} className={`text-xs flex items-center gap-2 ${tr.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                          <span>{tr.passed ? '✅' : '❌'}</span>
                                          <span>Test {tr.test_case_number}</span>
                                          {!tr.passed && tr.error_message && (
                                            <span className="text-muted-foreground">— {tr.error_message}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {!item.codeEvaluation && (!item.testResults || item.testResults.length === 0) && (
                                  <p className="text-sm text-muted-foreground italic">Code evaluation data not available from server. Check the Score Breakdown above for overall results.</p>
                                )}
                              </>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Layers className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No detailed question evaluations available.</p>
                    <p className="text-xs mt-1">Check the Score Breakdown above for overall results.</p>
                  </div>
                )}
              </TabsContent>

              {/* TAB: Strengths & Improvements */}
              <TabsContent value="strengths" className="mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Strengths */}
                  <Card className="border-green-500/20 rounded-2xl overflow-hidden">
                    <div className="h-0.5 bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" />
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <div className="p-1.5 bg-green-500/10 rounded-lg">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        Your Strengths
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2.5">
                        {evaluation?.strengths?.items && Array.isArray(evaluation.strengths.items) && evaluation.strengths.items.length > 0 ? (
                          evaluation.strengths.items.map((strength, idx) => (
                            <li key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-green-500/5 border border-green-500/10">
                              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm leading-relaxed">{strength}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-sm text-muted-foreground p-2.5">No strengths data available</li>
                        )}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Improvements */}
                  <Card className="border-orange-500/20 rounded-2xl overflow-hidden">
                    <div className="h-0.5 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500" />
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                        <div className="p-1.5 bg-orange-500/10 rounded-lg">
                          <TrendingUp className="w-5 h-5" />
                        </div>
                        Areas for Improvement
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2.5">
                        {evaluation?.improvements?.items && Array.isArray(evaluation.improvements.items) && evaluation.improvements.items.length > 0 ? (
                          evaluation.improvements.items.map((area, idx) => (
                            <li key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-orange-500/5 border border-orange-500/10">
                              <Flame className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm leading-relaxed">{area}</span>
                            </li>
                          ))
                        ) : (
                          <li className="text-sm text-muted-foreground p-2.5">No improvement areas data available</li>
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                {/* Fallback: Legacy Score Card (only if instant score fails) */}
                {!sessionId && (
                  <Card className="border border-border/30 rounded-2xl overflow-hidden">
                    <div className="h-0.5 bg-gradient-to-r from-primary via-purple-500 to-primary" />
                    <CardHeader>
                      <CardTitle className="text-2xl">Overall Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4">
                        <div className="flex-1 w-full">
                          <div className="flex flex-wrap items-baseline gap-2 sm:gap-3 mb-2 justify-center sm:justify-start">
                            <span className={`text-4xl sm:text-6xl font-black ${getScoreColor(score)}`}>
                              {score}
                            </span>
                            <span className="text-xl sm:text-3xl text-muted-foreground">/100</span>
                            <Badge className="text-base sm:text-xl px-3 sm:px-4 py-1 sm:py-2 rounded-xl font-bold">{grade}</Badge>
                          </div>
                          <Progress value={score} className="h-3 mt-4 rounded-full" />
                          <p className="text-xs text-muted-foreground mt-2 text-center sm:text-left">
                            Based on average confidence score: {avgConfidence.toFixed(2)}{avgConfidence <= 1 ? ' (0-1 scale)' : '/10'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* TAB: Speech Analytics */}
              <TabsContent value="analytics" className="mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="border border-border/30 rounded-2xl overflow-hidden">
                  <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-blue-400 to-cyan-500" />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="p-1.5 bg-cyan-500/10 rounded-lg">
                        <BarChart3 className="w-5 h-5 text-cyan-500" />
                      </div>
                      Speech Analytics Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { label: 'Average Speed', value: `${evaluation?.metrics_summary?.avg_wpm || evaluation?.speech_summary?.average_wpm || 0}`, unit: 'WPM', icon: Activity, color: 'text-blue-500' },
                        { label: 'Total Fillers', value: `${evaluation?.metrics_summary?.total_fillers || evaluation?.speech_summary?.total_filler_count || 0}`, unit: '', icon: CircleDot, color: 'text-amber-500' },
                        { label: 'Avg Confidence', value: `${((evaluation?.metrics_summary?.avg_confidence || evaluation?.speech_summary?.average_confidence || 0) * 100).toFixed(0)}`, unit: '%', icon: Gauge, color: 'text-green-500' },
                        { label: 'Longest Pause', value: `${(evaluation?.metrics_summary?.longest_pause || 0).toFixed(1)}`, unit: 'sec', icon: Timer, color: 'text-purple-500' },
                        { label: 'Duration', value: formatTime(Math.floor(evaluation?.metrics_summary?.total_duration || 0)), unit: '', icon: Clock, color: 'text-cyan-500' },
                        { label: 'Overtalk Count', value: `${evaluation?.metrics_summary?.overtalked_count || 0}`, unit: '', icon: Radio, color: 'text-rose-500' },
                      ].map((metric) => (
                        <div key={metric.label} className="p-4 rounded-2xl bg-muted/20 border border-border/20 hover:bg-muted/30 transition-colors group">
                          <div className="flex items-center gap-2 mb-2">
                            <metric.icon className={`w-4 h-4 ${metric.color} opacity-60 group-hover:opacity-100 transition-opacity`} />
                            <p className="text-xs text-muted-foreground font-medium">{metric.label}</p>
                          </div>
                          <p className="text-2xl md:text-3xl font-black">
                            {metric.value}
                            {metric.unit && <span className="text-sm text-muted-foreground ml-1 font-medium">{metric.unit}</span>}
                          </p>
                        </div>
                      ))}
                    </div>

                    {evaluation?.learning_insight ? (
                      <>
                        <Separator className="my-4" />
                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15">
                          <GraduationCap className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-1">Peer Benchmark</div>
                            <div className="text-sm font-medium text-foreground leading-relaxed">
                              {evaluation.learning_insight}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </CardContent>
                </Card>

                {/* Post-session confidence prompt.
                    Not shown for drills: the rating feeds a cross-user benchmark
                    keyed on session metrics that a drill deliberately does not
                    write, so it would be collected and never used. */}
                {sessionId && !isDrillSession && sessionConfidenceStatus !== 'disabled' ? (
                  <Card className="border border-border/30 rounded-2xl overflow-hidden">
                    <div className="h-0.5 bg-gradient-to-r from-primary via-purple-400 to-primary" />
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <div className="p-1.5 bg-primary/10 rounded-lg">
                          <Brain className="w-5 h-5 text-primary" />
                        </div>
                        How confident do you feel?
                      </CardTitle>
                      <CardDescription>Rate your overall confidence for this session (1–5).</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap items-center gap-2">
                        {[1, 2, 3, 4, 5].map((v) => {
                          const active = (sessionConfidenceDraft ?? 0) === v;
                          return (
                            <Button
                              key={v}
                              type="button"
                              size="sm"
                              variant={active ? 'default' : 'outline'}
                              disabled={sessionConfidenceStatus === 'submitting'}
                              onClick={() => submitSessionConfidenceBestEffort(sessionId, v)}
                              className="min-w-12 h-10 rounded-xl font-bold"
                            >
                              {v}
                            </Button>
                          );
                        })}
                        <div className="flex-1" />
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={sessionConfidenceStatus === 'submitting'}
                          onClick={() => skipSessionConfidencePrompt(sessionId)}
                          className="rounded-xl"
                        >
                          Skip
                        </Button>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {sessionConfidenceStatus === 'saved'
                          ? 'Thanks—saved.'
                          : sessionConfidenceStatus === 'skipped'
                            ? 'Skipped. You can still add a rating anytime.'
                            : sessionConfidenceStatus === 'submitting'
                              ? 'Saving…'
                              : sessionConfidenceStatus === 'error'
                                ? 'Not saved yet. Try again.'
                                : ''}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </TabsContent>

              {/* TAB: Action Plan */}
              <TabsContent value="plan" className="mt-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {evaluation?.action_plan?.steps && Array.isArray(evaluation.action_plan.steps) && evaluation.action_plan.steps.length > 0 && (
                  <Card className="border border-border/30 rounded-2xl overflow-hidden">
                    <div className="h-0.5 bg-gradient-to-r from-blue-500 via-indigo-400 to-blue-500" />
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                        <div className="p-1.5 bg-blue-500/10 rounded-lg">
                          <Target className="w-5 h-5" />
                        </div>
                        Your Action Plan
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {evaluation.action_plan.steps.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/8 transition-colors">
                            <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 text-white rounded-xl flex items-center justify-center text-sm font-black shadow-md">
                              {idx + 1}
                            </div>
                            <span className="text-sm flex-1 leading-relaxed pt-1">{step}</span>
                          </div>
                        ))}
                      </div>
                      {evaluation.practice_recommendation && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent border border-blue-500/20 rounded-2xl">
                          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                            <Lightbulb className="w-4 h-4" />
                            {evaluation.practice_recommendation}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Skipped Questions */}
                {endedEarlyData?.skipped_questions && endedEarlyData.skipped_questions.length > 0 && (
                  <Card className="border border-border/30 rounded-2xl overflow-hidden">
                    <div className="h-0.5 bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500" />
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <div className="p-1.5 bg-yellow-500/10 rounded-lg">
                          <AlertCircle className="h-5 w-5 text-yellow-500" />
                        </div>
                        Skipped Questions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {endedEarlyData.skipped_questions.map((q) => (
                        <div key={q.question_number} className="p-3 bg-muted/20 rounded-xl border border-dashed border-border/40">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground font-bold">Q{q.question_number}</span>
                            {q.category && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize rounded-lg">
                                {q.category.replace('_', ' ')}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm">{q.question}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {!evaluation?.action_plan?.steps?.length && !endedEarlyData?.skipped_questions?.length && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No action plan available yet.</p>
                    <p className="text-xs mt-1">Complete more sessions to receive personalized recommendations.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* ── ACTION BUTTONS ── */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              {/* Download Report Button */}
              <Button
                size="lg"
                variant="outline"
                onClick={handleDownloadReport}
                className="px-6 h-12 rounded-2xl border-2 border-primary/30 hover:border-primary/50 hover:bg-primary/5 shadow-lg hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 font-semibold group"
              >
                <Download className="mr-2 w-5 h-5 text-primary group-hover:animate-bounce" />
                Download Report
              </Button>

              <Button
                size="lg"
                variant="outline"
                onClick={handleRestart}
                className="px-6 h-12 rounded-2xl border-2 hover:bg-muted/50 shadow-lg transition-all duration-300 font-semibold"
              >
                <RotateCcw className="mr-2 w-5 h-5" />
                Practice Again
              </Button>

              <Button
                size="lg"
                className="px-6 h-12 rounded-2xl shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 font-bold"
                onClick={handleRestart}
              >
                <Sparkles className="mr-2 w-5 h-5" />
                New Interview
              </Button>
            </div>

          </div>
        </ScrollArea>
      </div>
    );
  }

  return null;
};
