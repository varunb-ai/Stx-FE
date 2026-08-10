import { useCallback, useEffect, useState, useRef } from "react";
import { SearchBar } from "./SearchBar";
import { AnswerCard } from "./AnswerCard";
import { QuestionCards } from "./QuestionCards";
import { CopilotFeatureNav, type CopilotFeature } from "./CopilotFeatureNav";
import { CopilotStuckNudge } from "./CopilotStuckNudge";
import { TryItYourselfPrompt } from "./TryItYourselfPrompt";

/**
 * Stratax brand mark — the real asset.
 *
 * This was previously a hand-drawn stroke "S" sitting on a purple→blue
 * gradient tile, which is not the Stratax symbol: the actual mark is a
 * layered metallic S built from strata slabs on its own dark tile. Because
 * the asset already carries its own tile and lighting, it must NOT be wrapped
 * in a gradient square — doing so was what produced the purple badge.
 *
 * Shipped at 192px and rendered small, so it stays crisp on hi-DPI screens.
 */
const StrataxMark = ({ className }: { className?: string }) => (
  <img
    src="/icons/stratax-ai-192.png?v=16"
    alt=""
    width={192}
    height={192}
    className={className}
    aria-hidden="true"
    draggable={false}
  />
);

// Animated Loading Dots Component
const LoadingDots = () => (
  <span className="inline-flex items-center">
    <style>{`
      @keyframes dotFlow {
        0%, 20% { opacity: 0.3; }
        40% { opacity: 1; }
        100% { opacity: 0.3; }
      }
      .dot-1 { animation: dotFlow 1.4s infinite; animation-delay: 0s; }
      .dot-2 { animation: dotFlow 1.4s infinite; animation-delay: 0.2s; }
      .dot-3 { animation: dotFlow 1.4s infinite; animation-delay: 0.4s; }
    `}</style>
    <span className="dot-1">.</span>
    <span className="dot-2">.</span>
    <span className="dot-3">.</span>
  </span>
);
import { MockInterviewMode } from "./MockInterviewMode";
import { PracticeMode } from "./PracticeMode";
import { AnswerEngineUpgradeBanner } from "./AnswerEngineUpgradeBanner";
import { UserProfile } from "./UserProfile";
import { MessageSquare, MoreVertical, Trash2, Menu, X, History as HistoryIcon, RefreshCw, Loader2, AlertCircle, Sparkles, Copy, Download, Edit2, Code2, PanelLeft } from "lucide-react";
import { apiCreateSession, apiSubmitQuestion, apiSubmitQuestionStream, apiGetHistory, apiGetSessions, apiDeleteSession, apiUpdateSessionTitle, apiDeleteHistoryItemByIndex, apiUploadProfile, type AnswerStyle, type SessionSummary, type GetHistoryResponse, type HistoryItem } from "@/lib/api";
import { apiRenderMermaid, questionCardsPayload, type CopilotMode } from "@/lib/api";
import { downloadAnswerPdf } from "@/lib/utils";
import { generateArchitecture, type ArchitecturePackage } from "@/lib/architectureApi";
import { Plus, Check, FileText, XCircle, Mic } from "lucide-react";
import { apiGetMockInterviewHistory, apiDeleteMockInterviewSession, apiDeleteAllMockInterviewSessions, type MockInterviewHistorySession } from "@/lib/mockInterviewApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { startEvaluationOverlay } from "@/overlayHost";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { BYOKOnboarding } from "./BYOKOnboarding";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { ApiKeySettings } from "./ApiKeySettings";
import { UnlockAnswerEngine } from "./UnlockAnswerEngine";
import { AnimatePresence } from "framer-motion";
import { Key, Settings } from "lucide-react";
import { PoweredByBadge } from "./PoweredByBadge";
import { isDevelopmentMode, hasValidApiKeys } from "@/lib/devUtils";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { usePwaInstall } from "@/context/PwaInstallContext";

/** Extract short extension label from a filename */
const ext = (name: string) => {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toUpperCase() : 'FILE';
};

export const InterviewAssistant = () => {
  const { user, loading: authLoading, logout } = useAuth();
  const { canPrompt, deferredPrompt, installHelpText, isStandalone, promptInstall } = usePwaInstall();
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const viewportBaseHeightRef = useRef<number>(0);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  const [evaluationAllowed, setEvaluationAllowed] = useState<boolean | null>(null);
  const [evaluationReason, setEvaluationReason] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [style, setStyle] = useState<AnswerStyle>("detailed");
  const [questionMode, setQuestionMode] = useState<CopilotMode>(() => {
    try {
      const raw = window.localStorage.getItem("ia_question_mode");
      if (raw === "mirror" || raw === "questions") return raw;
      return "answer";
    } catch {
      return "answer";
    }
  });
  const [mirrorUserAnswer, setMirrorUserAnswer] = useState<string>("");
  const [mirrorDialogOpen, setMirrorDialogOpen] = useState(false);
  const [pendingMirrorQuestion, setPendingMirrorQuestion] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [lastQuestion, setLastQuestion] = useState("");
  const [answerTruncated, setAnswerTruncated] = useState(false);
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [history, setHistory] = useState<GetHistoryResponse | null>(null);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem("ia_desktop_sidebar_open");
      return stored == null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = useState<"answer" | "mock-interview" | "practice">(() => {
    try {
      const stored = window.localStorage.getItem('ia_active_main_tab');
      if (stored === 'answer' || stored === 'mock-interview' || stored === 'practice') return stored;
    } catch { }
    return 'answer';
  });

  const [practiceScreenShareLock, setPracticeScreenShareLock] = useState(false);

  /**
   * Set by Practice Mode once a path is chosen, and by Mock Interview once the
   * interview is running. Purely about chrome: unlike the screen-share lock it
   * never blocks navigation, it just gets the sidebar out of the way.
   */
  const [immersiveMode, setImmersiveMode] = useState(false);

  /**
   * The sidebar — brand, navigation, and AI Copilot chat history — stays put
   * while the user is browsing. It gets out of the way once they commit to a
   * session, which either child signals through `app:immersive-mode`.
   */
  const isInterviewSessionLive = practiceScreenShareLock || immersiveMode;

  /** Single place the three destinations change from, wherever they're rendered. */
  const handleMainTabChange = useCallback((next: string) => {
    if (practiceScreenShareLock && next !== 'practice') {
      toast({
        title: 'Screen sharing is active',
        description: 'Finish Live Practice before switching tabs.',
      });
      return;
    }
    setActiveMainTab(next as "answer" | "mock-interview" | "practice");
    // Clear any lingering openTab navigation state so refresh doesn't hijack the tab.
    navigate(location.pathname, { replace: true, state: {} });
  }, [practiceScreenShareLock, toast, navigate, location.pathname]);

  /** Sidebar navigation destinations. */
  const MAIN_NAV_ITEMS = [
    { id: "answer", label: "AI Copilot", icon: MessageSquare },
    { id: "mock-interview", label: "Mock Interview", icon: HistoryIcon },
    { id: "practice", label: "Live Practice", icon: Mic },
  ] as const;

  /** One row shape for every sidebar entry, so nav and utilities line up. */
  const SIDEBAR_ROW =
    "w-full flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  /** Live Practice owns the screen while it records; block navigation away. */
  const guardWhileLive = (label: string) => (e: { preventDefault: () => void }) => {
    if (!practiceScreenShareLock) return;
    e.preventDefault();
    toast({
      title: 'Screen sharing is active',
      description: `Finish Live Practice before opening ${label}.`,
    });
  };

  // Allow deep-linking / navigation to a specific tab.
  useEffect(() => {
    const raw = (location.state as any)?.openTab;
    const openTab = typeof raw === 'string' ? raw : null;
    if (!openTab) return;
    if (openTab === 'answer' || openTab === 'mock-interview' || openTab === 'practice') {
      setActiveMainTab(openTab);

      // IMPORTANT: react-router location state persists in browser history across refresh.
      // Clear it after consuming, otherwise refreshing /app can force the same tab again.
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  // Persist selected tab so refresh keeps user's current tab.
  useEffect(() => {
    try {
      window.localStorage.setItem('ia_active_main_tab', activeMainTab);
    } catch { }
  }, [activeMainTab]);

  /**
   * Questions and Mirror are actions, not stances -- so they last one message.
   *
   * They were sticky, which meant the turn after a question set was read as a
   * request for another one: "explain question 3" generated ten new questions
   * about the phrase "explain question 3". Answer mode is the only setting worth
   * persisting, because it is the only one that describes how to read *everything*
   * you say rather than one thing you want done.
   *
   * Called at the completion of a turn, not when one is dispatched -- the mirror
   * flow returns mid-way to collect the user's draft, and resetting there would
   * abandon it.
   */
  const resetOneShotMode = useCallback(() => {
    setQuestionMode((current) => (current === "answer" ? current : "answer"));
  }, []);

  /**
   * Follow up on one generated question.
   *
   * Loads it into the composer in Answer mode, ready to send as-is or to edit
   * into a narrower question. The text has to travel in the message because the
   * cards live in `ui_payload`, which the model never sees -- "explain question
   * 3" would leave it guessing which one.
   */
  const handleAskAboutQuestion = useCallback((question: string) => {
    setQuestionMode("answer");
    setViewingHistory(false);
    setQuestion(question);
    toast({
      title: "Added to the composer",
      description: "Send it as-is, or edit it to ask something more specific.",
    });
  }, [toast]);

  /**
   * Send one generated question to Practice Mode to be answered aloud.
   *
   * Handed over through localStorage rather than a prop, matching the existing
   * `practice_next_session_plan` route from the Progress page. Inactive tabs
   * unmount, so PracticeMode remounts fresh on every visit — a prop would need
   * the parent to clear it at exactly the right moment and races either way,
   * whereas a key the child consumes and deletes has no such window.
   */
  const handlePractiseQuestion = useCallback((card: any) => {
    if (practiceScreenShareLock) {
      toast({
        title: "Finish Live Practice first",
        description: "A practice session is already running.",
        variant: "destructive",
      });
      return;
    }
    try {
      window.localStorage.setItem(
        "practice_drill_request",
        JSON.stringify({
          question: card?.question,
          answer: card?.answer ?? null,
          topic: card?.topic ?? null,
          difficulty: card?.difficulty ?? null,
          key_concepts: Array.isArray(card?.key_concepts) ? card.key_concepts : [],
          ts: Date.now(),
        })
      );
    } catch {
      toast({
        title: "Couldn't open practice",
        description: "Your browser blocked local storage.",
        variant: "destructive",
      });
      return;
    }
    setActiveMainTab("practice");
  }, [practiceScreenShareLock, toast]);

  // Live Practice screen-share lock: blocks switching to other tabs/screens while sharing.
  useEffect(() => {
    const onLock = (event: Event) => {
      const detail = (event as CustomEvent).detail as { active?: boolean };
      setPracticeScreenShareLock(!!detail?.active);
    };
    window.addEventListener('practice:screen-share-lock', onLock);
    return () => window.removeEventListener('practice:screen-share-lock', onLock);
  }, []);

  // Chrome-only signal from Practice Mode and Mock Interview.
  useEffect(() => {
    const onImmersive = (event: Event) => {
      const detail = (event as CustomEvent).detail as { active?: boolean };
      setImmersiveMode(!!detail?.active);
    };
    window.addEventListener('app:immersive-mode', onImmersive);
    return () => window.removeEventListener('app:immersive-mode', onImmersive);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("ia_desktop_sidebar_open", String(isDesktopSidebarOpen));
    } catch { }
  }, [isDesktopSidebarOpen]);

  // Persist question mode so refresh keeps Answer vs Mirror.
  useEffect(() => {
    try {
      window.localStorage.setItem("ia_question_mode", questionMode);
    } catch {
      // ignore
    }
  }, [questionMode]);

  // Keep ref in sync so non-dependency effects can read the latest value
  useEffect(() => { isGeneratingRef.current = isGenerating; }, [isGenerating]);

  const showBottomSearchBar =
    activeMainTab === "answer" &&
    (showAnswer || isGenerating) &&
    !isMobileSidebarOpen;

  // Keep layout stable when the mobile keyboard opens.
  // We compute a keyboard offset and lift the fixed bottom bar instead of letting the browser scroll the whole page.
  useEffect(() => {
    const updateViewportVars = () => {
      const layoutHeight = document.documentElement.clientHeight;
      const vv = window.visualViewport;

      // Lock to the largest observed layout height to avoid shrinking the whole UI when the keyboard opens.
      // We still compute keyboard offset from visualViewport to lift the fixed footer.
      if (viewportBaseHeightRef.current === 0) viewportBaseHeightRef.current = layoutHeight;
      if (layoutHeight > viewportBaseHeightRef.current) viewportBaseHeightRef.current = layoutHeight;
      const baseHeight = viewportBaseHeightRef.current;

      // Stable "app height" based on layout viewport.
      document.documentElement.style.setProperty('--app-height', `${baseHeight}px`);

      if (!vv) {
        document.documentElement.style.setProperty('--keyboard-offset', '0px');
        return;
      }

      // Keyboard height approximation: difference between layout viewport and visual viewport.
      // `offsetTop` is relevant on iOS when the visual viewport shifts.
      const keyboardOffset = Math.max(0, baseHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--keyboard-offset', `${keyboardOffset}px`);
    };

    updateViewportVars();

    const vv = window.visualViewport;
    window.addEventListener('resize', updateViewportVars);
    vv?.addEventListener('resize', updateViewportVars);
    vv?.addEventListener('scroll', updateViewportVars);

    return () => {
      window.removeEventListener('resize', updateViewportVars);
      vv?.removeEventListener('resize', updateViewportVars);
      vv?.removeEventListener('scroll', updateViewportVars);
    };
  }, []);

  // Mock Interview history state (only for mock interview tab)
  const [mockInterviewSessions, setMockInterviewSessions] = useState<MockInterviewHistorySession[]>([]);
  const [mockInterviewHistoryLoading, setMockInterviewHistoryLoading] = useState<boolean>(false);
  const [mockInterviewHistoryError, setMockInterviewHistoryError] = useState<string | null>(null);
  const [selectedMockSession, setSelectedMockSession] = useState<MockInterviewHistorySession | null>(null);
  const [mockInterviewDeletingSessionId, setMockInterviewDeletingSessionId] = useState<string | null>(null);
  const [mockInterviewClearingAll, setMockInterviewClearingAll] = useState<boolean>(false);

  // Deleted sessions blacklist to handle eventual consistency - persisted to localStorage
  const deletedSessionIdsRef = useRef<Set<string>>((() => {
    try {
      const stored = window.localStorage.getItem('ia_deleted_sessions');
      if (stored) return new Set<string>(JSON.parse(stored));
    } catch { }
    return new Set<string>();
  })());

  // Helper to add a session to deleted list and persist
  const markSessionDeleted = (sessionId: string) => {
    deletedSessionIdsRef.current.add(sessionId);
    try {
      window.localStorage.setItem('ia_deleted_sessions', JSON.stringify([...deletedSessionIdsRef.current]));
      // Also update the sessions cache to remove this session immediately
      const raw = window.localStorage.getItem('ia_sessions_cache');
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached)) {
          const updated = cached.filter((s: any) => s.session_id !== sessionId);
          window.localStorage.setItem('ia_sessions_cache', JSON.stringify(updated));
        }
      }
    } catch { }
  };

  // Answer Engine unlock dialog
  const [showUnlockAnswerEngine, setShowUnlockAnswerEngine] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  // Backend suggestion shown when the user appears to be circling one topic.
  // Cleared on dismissal, on acting on it, and whenever the session changes -
  // a nudge earned in one conversation must not follow the user into another.
  const [stuckOffer, setStuckOffer] = useState<{ message: string; feature: string } | null>(null);
  // Suppresses the "try saying it back" offer for the rest of the session once
  // the user has declined it. Someone who dismissed it does not need convincing
  // again after every long answer.
  const [rehearsalDismissed, setRehearsalDismissed] = useState(false);

  // Versioning for edit-and-compare flow
  const [originalQA, setOriginalQA] = useState<{ q: string; a: string } | null>(null);
  const [latestQA, setLatestQA] = useState<{ q: string; a: string } | null>(null);
  const [currentVersion, setCurrentVersion] = useState<0 | 1>(0); // 0 original, 1 latest
  const [isEditingFromAnswer, setIsEditingFromAnswer] = useState(false);
  const [pendingEditedQuestion, setPendingEditedQuestion] = useState<string | null>(null);
  const [isNavigatingVersion, setIsNavigatingVersion] = useState(false);

  const [showKeyOnboarding, setShowKeyOnboarding] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [bridgeSettingsOpen, setBridgeSettingsOpen] = useState(false);
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);

  // Profile upload state
  const profileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [lastUploadedProfile, setLastUploadedProfile] = useState<{ name: string; characters: number } | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<{ name: string; type: string } | null>(null);

  // Architecture mode selection state
  const [showArchitectureChoice, setShowArchitectureChoice] = useState(false);
  const [pendingArchitectureQuestion, setPendingArchitectureQuestion] = useState<string>("");
  const [architectureChoicePayload, setArchitectureChoicePayload] = useState<{
    default?: string;
    options: Array<{ id: string; label: string; description?: string }>;
  } | null>(null);

  // Rename session state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  type DestructiveConfirmConfig = {
    title: string;
    description: React.ReactNode;
    confirmLabel?: string;
    requireAckLabel?: string;
    onConfirm: () => Promise<void>;
  };

  const [destructiveConfirmOpen, setDestructiveConfirmOpen] = useState(false);
  const [destructiveConfirmConfig, setDestructiveConfirmConfig] = useState<DestructiveConfirmConfig | null>(null);
  const [destructiveConfirmBusy, setDestructiveConfirmBusy] = useState(false);
  const [destructiveConfirmAck, setDestructiveConfirmAck] = useState(false);

  // Streaming state for typewriter animation
  const [streaming, setStreaming] = useState(false);

  // 🛡️ Debounce protection: Track if session creation is in progress
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // 📄 PDF Export: Track export progress
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportingSessionId, setExportingSessionId] = useState<string | null>(null);

  const openDestructiveConfirm = (config: DestructiveConfirmConfig) => {
    setDestructiveConfirmConfig(config);
    setDestructiveConfirmAck(false);
    setDestructiveConfirmOpen(true);
  };

  const closeDestructiveConfirm = () => {
    if (destructiveConfirmBusy) return;
    setDestructiveConfirmOpen(false);
    setDestructiveConfirmConfig(null);
    setDestructiveConfirmAck(false);
  };

  const runDestructiveConfirm = async () => {
    if (!destructiveConfirmConfig) return;
    if (destructiveConfirmConfig.requireAckLabel && !destructiveConfirmAck) return;
    setDestructiveConfirmBusy(true);
    try {
      await destructiveConfirmConfig.onConfirm();
    } finally {
      setDestructiveConfirmBusy(false);
      setDestructiveConfirmOpen(false);
      setDestructiveConfirmConfig(null);
      setDestructiveConfirmAck(false);
    }
  };

  const deleteConversationById = async (targetSessionId: string) => {
    markSessionDeleted(targetSessionId);
    await apiDeleteSession(targetSessionId);
    setSessions((prev) => prev.filter((ps) => ps.session_id !== targetSessionId));
    try {
      window.localStorage.removeItem(`ia_history_archive_${targetSessionId}`);
    } catch {
      // ignore
    }

    if (targetSessionId === sessionId) {
      setShowAnswer(false);
      setAnswer("");
      setLastQuestion("");
      setQuestion("");
      setHistory(null);
      setSessionId("");
      setOriginalQA(null);
      setLatestQA(null);
      setCurrentVersion(0);
      try {
        window.localStorage.removeItem("ia_session_id");
        window.localStorage.removeItem("ia_last_question");
        window.localStorage.removeItem("ia_last_answer");
        window.localStorage.setItem("ia_show_answer", "false");
      } catch {
        // ignore
      }
    }
  };

  const openDeleteConversationDialog = (targetSessionId: string) => {
    const currentSession = Array.isArray(sessions) ? sessions.find((s) => s.session_id === targetSessionId) : null;
    const title = currentSession?.custom_title || currentSession?.title || undefined;

    openDestructiveConfirm({
      title: "Delete conversation?",
      description: (
        <>
          This will permanently delete this conversation. This action cannot be undone.
          {title ? <span className="block mt-2">Conversation: “{title}”</span> : null}
        </>
      ),
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await deleteConversationById(targetSessionId);
          toast({ title: "Conversation deleted" });
        } catch (err) {
          toast({ title: "Delete failed", variant: "destructive" });
          throw err;
        }
      },
    });
  };

  const isValidSessionId = (value: unknown): value is string => {
    if (typeof value !== "string") return false;
    const v = value.trim();
    if (!v) return false;
    const lowered = v.toLowerCase();
    if (lowered === "undefined" || lowered === "null" || lowered === "none") return false;
    // Accept UUID (with or without hyphens)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
    if (/^[0-9a-f]{32}$/i.test(v)) return true;
    return false;
  };

  type LastViewState = {
    question: string;
    answer: string;
    show: boolean;
    viewingHistory: boolean;
    ts: number;
  };

  const getLastViewKey = (sid: string) => `ia_last_view_v2:${sid}`;
  const LAST_VIEW_SESSION_KEY = 'ia_last_view_session_id_v2';

  const readLastView = (sid: string): LastViewState | null => {
    if (!sid || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(getLastViewKey(sid));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const q = typeof parsed.question === 'string' ? parsed.question : '';
      const a = typeof parsed.answer === 'string' ? parsed.answer : '';
      const show = Boolean(parsed.show);
      const viewingHistory = Boolean(parsed.viewingHistory);
      const ts = typeof parsed.ts === 'number' ? parsed.ts : Date.now();
      return { question: q, answer: a, show, viewingHistory, ts };
    } catch {
      return null;
    }
  };

  const writeLastView = (sid: string, state: Omit<LastViewState, 'ts'>) => {
    if (!sid || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LAST_VIEW_SESSION_KEY, sid);
      window.localStorage.setItem(
        getLastViewKey(sid),
        JSON.stringify({
          ...state,
          ts: Date.now(),
        } satisfies LastViewState)
      );
    } catch {
      // ignore
    }
  };

  // The API returns history in append order (oldest first). The UI's canonical
  // order is the opposite - the archive unshifts new entries, the transcript
  // renders [...items].reverse(), and the session title reads the last entry.
  //
  // Normalising on arrival keeps every paint in agreement. Without it the
  // cached preload showed the raw server order while the subsequent merge
  // showed timestamp-descending order, so a session with 3+ messages visibly
  // flipped end-to-end a moment after opening.
  const toNewestFirst = (items: HistoryItem[]): HistoryItem[] => {
    const list = [...(items || [])];
    if (list.length > 1 && list.every((it) => it?.created_at)) {
      return list.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    // No usable timestamps: rely on the documented append order.
    return list.reverse();
  };

  // History cache, keyed per session.
  //
  // This used to be one global key holding whichever session was fetched last.
  // Every reader then had to remember to check the embedded id, and the one that
  // forgot rendered another conversation's messages under the open session. A
  // per-session key makes that mistake impossible to make.
  const HISTORY_CACHE_PREFIX = 'ia_history_cache_v2:';
  const HISTORY_CACHE_MAX_SESSIONS = 20;
  const LEGACY_HISTORY_CACHE_KEY = 'ia_history_cache';

  const readHistoryCache = (sid: string): GetHistoryResponse | null => {
    if (!sid || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(`${HISTORY_CACHE_PREFIX}${sid}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // The key is already session-scoped; this second check only matters for a
      // corrupted or hand-edited payload, and costs nothing.
      if (!parsed?.data || parsed?.sessionId !== sid) return null;
      return parsed.data as GetHistoryResponse;
    } catch {
      return null;
    }
  };

  const pruneHistoryCache = () => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(LEGACY_HISTORY_CACHE_KEY);

      const entries: Array<{ key: string; ts: number }> = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(HISTORY_CACHE_PREFIX)) continue;
        let ts = 0;
        try {
          ts = JSON.parse(window.localStorage.getItem(key) || '{}')?.ts || 0;
        } catch {
          // Unparseable entry: treat as oldest so it is evicted first.
        }
        entries.push({ key, ts });
      }

      if (entries.length <= HISTORY_CACHE_MAX_SESSIONS) return;
      entries.sort((a, b) => a.ts - b.ts);
      for (const entry of entries.slice(0, entries.length - HISTORY_CACHE_MAX_SESSIONS)) {
        window.localStorage.removeItem(entry.key);
      }
    } catch {
      // ignore
    }
  };

  const writeHistoryCache = (sid: string, data: GetHistoryResponse) => {
    if (!sid || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        `${HISTORY_CACHE_PREFIX}${sid}`,
        JSON.stringify({ sessionId: sid, data, ts: Date.now() })
      );
      pruneHistoryCache();
    } catch {
      // Quota exceeded or storage disabled: the cache is an optimisation only.
    }
  };

  const clearLastView = (sid: string) => {
    if (!sid || typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(getLastViewKey(sid));
    } catch {
      // ignore
    }
  };

  // On mount: if we have a persisted session id, adopt it so refresh stays in the same conversation.
  // This does NOT create a new session; it only re-selects an existing one.
  useEffect(() => {
    if (sessionId) return;
    try {
      const storedSid = window.localStorage.getItem('ia_session_id');
      if (storedSid && isValidSessionId(storedSid)) {
        setSessionId(storedSid);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPdfHtmlFromQA = async (qaItems: Array<{ question?: string; answer?: string }>) => {
    // Build HTML with proper structure so utils.ts can normalize it
    const htmlPromises = qaItems.map(async (it, idx) => {
      // Escape the question text
      const escapedQuestion = String(it.question || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      let rawAnswer = String(it.answer || '');

      // 1. Pre-render Mermaid diagrams if they exist - use Kroki PNG API for reliable text
      const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
      let match;
      const mermaidMatches: Array<{ full: string; code: string }> = [];
      while ((match = mermaidRegex.exec(rawAnswer)) !== null) {
        mermaidMatches.push({ full: match[0], code: match[1] });
      }

      // Helper: Render mermaid to PNG via Kroki with retry and timeout
      async function renderMermaidToPngViaKroki(code: string, retries = 2): Promise<string | null> {
        let mermaidCode = code.trim();
        // Add init directive for native text (not foreignObject)
        if (!mermaidCode.includes('%%{init:')) {
          mermaidCode = `%%{init: {'theme': 'neutral', 'flowchart': {'htmlLabels': false}}}%%\n${mermaidCode}`;
        }

        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

            console.log(`[PDF] Kroki attempt ${attempt + 1}/${retries + 1}...`);

            const response = await fetch('https://kroki.io/mermaid/png', {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: mermaidCode,
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              console.error(`[PDF] Kroki PNG failed (attempt ${attempt + 1}):`, response.status);
              if (attempt < retries) continue;
              return null;
            }

            const blob = await response.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
          } catch (e: any) {
            console.error(`[PDF] Kroki error (attempt ${attempt + 1}):`, e?.name || e);
            if (attempt < retries) continue;
            return null;
          }
        }
        return null;
      }

      // Fallback: Render mermaid via backend API then convert SVG to PNG
      async function renderMermaidViaBackend(code: string): Promise<string | null> {
        try {
          let mermaidCode = code.trim();

          // Add init directive for native text
          if (!mermaidCode.includes('%%{init:')) {
            mermaidCode = `%%{init: {'theme': 'neutral', 'flowchart': {'htmlLabels': false}}}%%\n${mermaidCode}`;
          }

          const svg = await apiRenderMermaid({
            code: mermaidCode,
            theme: 'neutral',
            style: 'modern'
          });

          if (!svg || !svg.includes('<svg')) return null;

          // Convert SVG to PNG using canvas with text extraction
          return new Promise((resolve) => {
            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(svg, 'image/svg+xml');
              const svgEl = doc.querySelector('svg');
              if (!svgEl) { resolve(null); return; }

              // Extract all text content from foreignObjects BEFORE conversion
              const textLabels: Array<{ x: number, y: number, text: string, w: number, h: number }> = [];
              svgEl.querySelectorAll('foreignObject').forEach(fo => {
                const x = parseFloat(fo.getAttribute('x') || '0');
                const y = parseFloat(fo.getAttribute('y') || '0');
                const w = parseFloat(fo.getAttribute('width') || '100');
                const h = parseFloat(fo.getAttribute('height') || '30');
                let text = '';
                const labelEl = fo.querySelector('.nodeLabel, .label, .edgeLabel, div, span');
                if (labelEl) text = labelEl.textContent?.trim() || '';
                if (!text) text = fo.textContent?.trim() || '';
                text = text.replace(/\s+/g, ' ').trim();
                if (text) textLabels.push({ x, y, text, w, h });
                fo.remove(); // Remove foreignObject - it won't render anyway
              });

              // Get dimensions
              let width = 800, height = 600;
              const vb = svgEl.getAttribute('viewBox');
              if (vb) {
                const parts = vb.split(/[\s,]+/).map(Number);
                if (parts.length >= 4) { width = parts[2] || 800; height = parts[3] || 600; }
              }

              // Scale for PDF - MUCH LARGER for crisp sharp diagram
              const maxW = 1600, maxH = 1200;
              const scale = Math.min(maxW / width, maxH / height, 3.0);
              const finalW = Math.round(width * scale);
              const finalH = Math.round(height * scale);

              svgEl.setAttribute('width', String(finalW));
              svgEl.setAttribute('height', String(finalH));
              if (!svgEl.getAttribute('xmlns')) {
                svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
              }

              const serializer = new XMLSerializer();
              const svgStr = serializer.serializeToString(svgEl);
              const encoded = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));

              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                // 4x DPI for CRISP text
                const dpr = 4;
                canvas.width = finalW * dpr;
                canvas.height = finalH * dpr;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(null); return; }

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // White background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.scale(dpr, dpr);
                ctx.drawImage(img, 0, 0, finalW, finalH);

                // Draw text labels
                ctx.font = 'bold 14px Arial, sans-serif';
                ctx.fillStyle = '#000000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                textLabels.forEach(({ x, y, text, w, h }) => {
                  const cx = (x + w / 2) * scale;
                  const cy = (y + h / 2) * scale;
                  const maxChars = Math.floor(w * scale / 7);
                  if (text.length > maxChars && maxChars > 8) {
                    const words = text.split(' ');
                    let lines: string[] = [];
                    let line = '';
                    for (const word of words) {
                      if ((line + ' ' + word).trim().length <= maxChars) {
                        line = (line + ' ' + word).trim();
                      } else {
                        if (line) lines.push(line);
                        line = word;
                      }
                    }
                    if (line) lines.push(line);
                    const lineH = 15;
                    const startY = cy - ((lines.length - 1) * lineH) / 2;
                    lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineH));
                  } else {
                    ctx.fillText(text, cx, cy);
                  }
                });

                resolve(canvas.toDataURL('image/png'));
              };
              img.onerror = () => resolve(null);
              img.src = encoded;
            } catch (e) {
              console.error('[PDF] Backend SVG conversion error:', e);
              resolve(null);
            }
          });
        } catch (e) {
          console.error('[PDF] Backend render error:', e);
          return null;
        }
      }

      for (const m of mermaidMatches) {
        try {
          console.log('[PDF] Rendering diagram via Kroki...');
          let pngDataUrl = await renderMermaidToPngViaKroki(m.code);

          if (!pngDataUrl) {
            console.log('[PDF] Kroki failed, trying backend fallback...');
            pngDataUrl = await renderMermaidViaBackend(m.code);
          }

          if (pngDataUrl) {
            const renderedReplacement = `
                <div class="mermaid-rendered" style="margin: 20px 0; page-break-inside: avoid; text-align: center;">
                  <img src="${pngDataUrl}" style="width: 100%; max-width: none; height: auto; display: block;" alt="Architecture Diagram" />
                </div>`;
            rawAnswer = rawAnswer.replace(m.full, renderedReplacement);
          } else {
            const renderedReplacement = `<div style="background: #1e293b; border-radius: 12px; padding: 20px; margin: 16px 0; color: #60a5fa; font-size: 13px; text-align: center;"><strong>📊 Architecture Diagram</strong><br/><span style="color: #94a3b8;">View in web app for interactive diagram.</span></div>`;
            rawAnswer = rawAnswer.replace(m.full, renderedReplacement);
          }
        } catch (err) {
          console.warn('[PDF Export] Failed to render diagram:', err);
        }
      }

      // 2. Convert remaining Markdown to Structured HTML
      const codeBlocks: string[] = [];
      // Extract code blocks to prevent them from being wrapped in <p> tags later
      let formattedAnswer = rawAnswer.replace(/```([a-zA-Z0-9+\-#\.]*)\s*?\n([\s\S]*?)```/g, (_m, lang, content) => {
        let c = content.trim()
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        // Basic syntax highlighting for PDF (safe placeholder strategy)
        const tokens: string[] = [];
        const addToken = (html: string) => {
          tokens.push(html);
          return `###TOKEN${tokens.length - 1}###`;
        };

        // 1. Strings
        c = c.replace(/("[^"]*"|'[^']*')/g, (m) => addToken(`<span class="code-string">${m}</span>`));
        // 2. Comments
        c = c.replace(/(\/\/[^\n]*)/g, (m) => addToken(`<span class="code-comment">${m}</span>`));
        // 3. Keywords (including Python specific ones)
        c = c.replace(/\b(class|const|let|var|function|return|if|else|for|while|import|export|from|def|try|catch|async|await|switch|case|public|private|protected|interface|type|module|implements|extends|void|int|float|bool|boolean|string|None|True|False|self|yield|pass|break|continue|lambda|raise|assert|global|nonlocal|with|as|in|is|not|and|or)\b/g, (m) => addToken(`<span class="code-keyword">${m}</span>`));
        // 4. Numbers
        c = c.replace(/\b(\d+)\b/g, (m) => addToken(`<span class="code-number">${m}</span>`));
        // 5. Functions
        c = c.replace(/(\w+)\s*\(/g, (_m2, name) => addToken(`<span class="code-function">${name}</span>`) + '(');

        // Restore tokens
        c = c.replace(/###TOKEN(\d+)###/g, (_m3, id) => tokens[parseInt(id)]);

        codeBlocks.push(`<div class="code-block" data-lang="${lang || ''}"><pre><code>${c}</code></pre></div>`);
        return `<!--CODE_BLOCK_${codeBlocks.length - 1}-->`;
      });

      formattedAnswer = formattedAnswer
        // Tables
        .replace(/\|(.+)\|/g, (m2) => {
          if (m2.includes('---')) return '';
          const cells = m2.split('|').filter(x => x.trim() !== '');
          return `<tr>${cells.map(c2 => `<td>${c2.trim()}</td>`).join('')}</tr>`;
        })
        // Basic Formatting
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/^#{1,6}\s+(.+)$/gm, '<h3>$1</h3>')
        .replace(/^(?:-\s+|\*\s+)(.+)$/gm, '<li>$1</li>')
        // IMPORTANT: Only wrap lines that don't start with HTML tags to avoid huge gaps
        .replace(/^\s*([^<>\n].+)$/gm, '<p>$1</p>');

      // Final structure cleanup for lists and tables
      if (formattedAnswer.includes('<tr>')) {
        formattedAnswer = formattedAnswer.replace(/((?:<tr>[\s\S]*?<\/tr>\s*)+)/g, '<table class="table-professional">$1</table>');
      }
      if (formattedAnswer.includes('<li>')) {
        formattedAnswer = formattedAnswer.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul style="margin: 8px 0 8px 16px;">$1</ul>');
      }

      // Restore code blocks
      codeBlocks.forEach((block, i) => {
        formattedAnswer = formattedAnswer.replace(`<!--CODE_BLOCK_${i}-->`, block);
      });

      return `
          <div class="session-block" style="margin-bottom: 40px;">
            <div style="font-weight: 700; font-size: 16px; margin-bottom: 12px; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">
              Question ${idx + 1}: ${escapedQuestion}
            </div>
            <div class="answer" style="color: #0f172a;">
              ${formattedAnswer}
            </div>
          </div>
        `;
    });

    const processedHtmlParts = await Promise.all(htmlPromises);
    return processedHtmlParts.join('');
  };

  // Auto-scroll to new prompt
  const activeQuestionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGenerating && mainScrollRef.current) {
      // Delay scroll slightly to ensure DOM has updated with new content
      setTimeout(() => {
        if (mainScrollRef.current) {
          const scrollBefore = mainScrollRef.current.scrollTop;
          console.log('[Scroll] Scrolling to bottom NOW, current scrollTop:', scrollBefore);

          // Scroll to bottom like ChatGPT to show the new question and response
          mainScrollRef.current.scrollTop = mainScrollRef.current.scrollHeight;

          // Verify it worked
          setTimeout(() => {
            if (mainScrollRef.current) {
              console.log('[Scroll] After scroll, scrollTop:', mainScrollRef.current.scrollTop);
            }
          }, 100);
        }
      }, 100);
    }
  }, [isGenerating]);

  useEffect(() => {
    if (authLoading) return;

    // Guest mode (logged out).
    //
    // Being logged out is not itself a reason to prompt: a guest may bring their
    // own key, and the backend accepts X-API-Key without auth. Having no key at
    // all is the reason.
    //
    // This used to assert hasApiKey(true) unconditionally, which was true while
    // anonymous traffic was served from server keys. It no longer is
    // (REQUIRE_USER_API_KEY now defaults to true), so the assertion became a
    // lie that suppressed the "Key Entry Required" badge and the BYOK prompt --
    // leaving a keyless visitor in a fully functional-looking app that 401s on
    // their first question, with nothing pointing them at the demo.
    if (!user) {
      const guestHasKey = Boolean(
        localStorage.getItem("user_api_key") || localStorage.getItem("gemini_api_key")
      );
      setHasApiKey(guestHasKey);
      // No account, so there is no per-account tour to run; the key is the gate.
      setShowOnboardingTour(false);
      setShowKeyOnboarding(!guestHasKey);
      return;
    }

    // In development mode, bypass API key checks and onboarding
    if (isDevelopmentMode()) {
      console.log('🔧 [Dev Mode] Bypassing API key requirements and onboarding');
      setHasApiKey(true);
      setShowKeyOnboarding(false);
      setShowOnboardingTour(false);
      return;
    }

    // Production (authenticated): Check onboarding completion status
    const userIdentity = (user as any)?.id || (user as any)?.email || "unknown";
    const onboardingTourKey = `onboarding_tour_completed:${userIdentity}`;

    const groqKey = localStorage.getItem("user_api_key");
    const geminiKey = localStorage.getItem("gemini_api_key");

    // Onboarding completion is per-account (not per-browser), otherwise a previous guest/other-user session
    // can cause brand new signups to skip the tour and jump directly to BYOK.
    let onboardingTourCompleted = localStorage.getItem(onboardingTourKey);

    // Best-effort migration: if legacy global flag is set AND keys exist, treat as completed for this user.
    if (!onboardingTourCompleted) {
      const legacy = localStorage.getItem("onboarding_tour_completed");
      if (legacy === "true" && (groqKey || geminiKey)) {
        localStorage.setItem(onboardingTourKey, "true");
        onboardingTourCompleted = "true";
      }
    }

    // Step 1: Check if onboarding tour is completed
    if (!onboardingTourCompleted) {
      console.log('📚 First time user - showing onboarding tour');
      setShowOnboardingTour(true);
      setHasApiKey(false);
      setShowKeyOnboarding(false);
      return;
    }

    // Step 2: Check if API keys are connected
    if (!groqKey && !geminiKey) {
      console.log('🔑 Onboarding complete, but no API keys - showing API key setup');
      setShowKeyOnboarding(true);
      setHasApiKey(false);
      return;
    }

    // All checks passed - user can access the app
    console.log('✅ User fully onboarded with API keys');
    setHasApiKey(true);
    setShowOnboardingTour(false);
    setShowKeyOnboarding(false);
  }, [authLoading, user]);

  // If backend reports missing/invalid LLM key (401/403 not related to JWT), open Bridge Settings.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onByokRequired = () => {
      if (!user || authLoading) return;
      setBridgeSettingsOpen(true);
      toast({
        title: 'API key required',
        description: 'Open Bridge Settings to add/refresh your key.',
      });
    };

    window.addEventListener('byok:required', onByokRequired as any);
    return () => {
      window.removeEventListener('byok:required', onByokRequired as any);
    };
  }, [user, authLoading, toast]);

  // Handle onboarding tour completion
  const handleOnboardingTourComplete = () => {
    console.log('✅ Onboarding tour completed');
    const userIdentity = (user as any)?.id || (user as any)?.email || "unknown";
    const onboardingTourKey = `onboarding_tour_completed:${userIdentity}`;
    localStorage.setItem(onboardingTourKey, "true");
    // Keep legacy key set for older builds / back-compat.
    localStorage.setItem("onboarding_tour_completed", "true");
    setShowOnboardingTour(false);

    // Check if user already has API keys (returning user scenario)
    const groqKey = localStorage.getItem("user_api_key");
    const geminiKey = localStorage.getItem("gemini_api_key");

    if (groqKey || geminiKey) {
      // User already has keys, mark as connected and proceed
      localStorage.setItem("api_keys_connected", "true");
      setHasApiKey(true);
    } else {
      // Show API key setup
      setShowKeyOnboarding(true);
    }
  };

  // Handle API key setup completion
  const handleApiKeySetupComplete = () => {
    console.log('✅ API keys connected');
    localStorage.setItem("api_keys_connected", "true");
    setShowKeyOnboarding(false);
    setHasApiKey(true);
  };

  const handleDeleteHistory = async (idx: number) => {
    try {
      if (sessionId == null || sessionId === "") return;
      // Get the item before deleting so we can remove it from archive
      const item = history?.items?.[idx];
      if (!item) return;

      // Optimistically remove from UI immediately (better UX)
      setHistory((prev) => {
        const items = prev?.items || [];
        const filtered = items.filter((_, i) => i !== idx);
        return { session_id: sessionId, items: filtered } as any;
      });

      // Remove from archive immediately (remove ALL matches for this question to handle duplicates)
      try {
        const archiveKey = `ia_history_archive_${sessionId}`;
        const raw = window.localStorage.getItem(archiveKey);
        if (raw) {
          const items = JSON.parse(raw) as Array<{ question: string; answer: string; ts: number }>;
          // Remove ALL entries with matching question (handles duplicates and incomplete entries)
          const cleaned = items.filter(x => x.question !== item.question);
          window.localStorage.setItem(archiveKey, JSON.stringify(cleaned));
        }
      } catch {
        // Ignore localStorage errors
      }

      // If the deleted item was currently displayed, clear answer view
      if (lastQuestion === item.question && answer === item.answer) {
        setShowAnswer(false);
        setAnswer("");
        setLastQuestion("");
        setViewingHistory(false);
        try {
          window.localStorage.removeItem('ia_last_question');
          window.localStorage.removeItem('ia_last_answer');
          window.localStorage.setItem('ia_show_answer', 'false');
        } catch {
          // Ignore localStorage errors
        }

        // Also clear the per-session last-view to avoid stale restoration on refresh.
        try {
          if (sessionId && isValidSessionId(sessionId)) {
            clearLastView(sessionId);
          }
        } catch { }
      }

      // Then delete from server (non-blocking)
      try {
        await apiDeleteHistoryItemByIndex({ session_id: sessionId, index: idx });
        // Reliance on optimistic update is sufficient and avoids "flash of empty content"
        // if the backend returns incomplete data immediately after delete.
      } catch (e) {
        console.error('[api] delete history error', e);
        // On error, keep optimistic UI update (already removed above)
      }
    } catch (e) {
      console.error('[api] delete history error', e);
    } finally {
      setOpenMenuIndex(null);
      setMenuPos(null);
    }
  };

  const handleUpdateSessionTitle = async (sid: string, title: string) => {
    if (!title.trim()) return;
    setIsRenaming(true);
    try {
      await apiUpdateSessionTitle(sid, title);
      // Update sessions list
      setSessions((prev) => prev.map(s => s.session_id === sid ? { ...s, custom_title: title, title: title } : s));
      setEditingSessionId(null);
      toast({ title: "Title updated" });
    } catch (err) {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setIsRenaming(false);
    }
  };

  const ensureSession = async (opts?: { forceNew?: boolean }): Promise<string> => {
    const forceNew = !!opts?.forceNew;
    if (!forceNew && isValidSessionId(sessionId)) return sessionId;
    const stored = !forceNew && typeof window !== 'undefined' ? window.localStorage.getItem("ia_session_id") : null;
    if (!forceNew && stored && isValidSessionId(stored)) {
      setSessionId(stored);
      return stored;
    }

    if (!forceNew && stored && !isValidSessionId(stored)) {
      try { window.localStorage.removeItem("ia_session_id"); } catch { }
    }

    const s = await apiCreateSession();
    setSessionId(s.session_id);
    try { window.localStorage.setItem("ia_session_id", s.session_id); } catch {
      // Ignore localStorage errors
    }
    return s.session_id;
  };

  const handleCopySession = async (s: SessionSummary) => {
    try {
      let items = s.session_id === sessionId && history?.items ? history.items : null;
      if (!items) {
        const h = await apiGetHistory(s.session_id);
        items = h.items;
      }
      if (!items || items.length === 0) {
        toast({ title: "No messages to copy" });
        return;
      }
      const text = [...items].reverse().map((it, idx) => `Q${idx + 1}: ${it.question}\n\nA${idx + 1}: ${it.answer}`).join('\n\n---\n\n');
      navigator.clipboard.writeText(text);
      toast({ title: "Copied!", description: "Conversation copied to clipboard" });
    } catch (e) {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleExportPdfSession = async (s: SessionSummary) => {
    // Prevent duplicate exports
    if (isExportingPdf) {
      console.log('PDF export already in progress');
      return;
    }

    try {
      // Set loading state
      setIsExportingPdf(true);
      setExportingSessionId(s.session_id);

      // Show initial feedback
      toast({
        title: "Starting PDF Export...",
        description: "Preparing your document...",
        duration: 60000, // Keep visible during export
      });

      let items = s.session_id === sessionId && history?.items ? history.items : null;
      if (!items) {
        const h = await apiGetHistory(s.session_id);
        items = h.items;
      }
      if (!items || items.length === 0) {
        toast({ title: "No messages to export" });
        return;
      }

      const html = await buildPdfHtmlFromQA([...items].reverse());

      // downloadAnswerPdf and apiRenderMermaid are now statically imported at the top
      await downloadAnswerPdf({
        question: s.custom_title || s.title || 'Conversation Export',
        answerHtml: html,
        fileName: `Stratax-Conversation-${s.session_id.slice(0, 8)}.pdf`,
        onProgress: (stage) => {
          // Update toast with progress
          toast({
            title: `Exporting: ${stage}`,
            description: stage === 'Complete!' ? 'PDF ready!' : 'Please wait...',
            duration: stage === 'Complete!' ? 3000 : 60000,
          });
        }
      });
      toast({ title: "Export complete", description: "Your PDF has been downloaded.", variant: 'success' });
    } catch (e) {
      console.error('[PDF Export] Error:', e);
      toast({ title: 'Export failed', description: 'Could not generate the PDF. Please try again or check your connection.', variant: 'destructive' });
    } finally {
      // Always reset loading state
      setIsExportingPdf(false);
      setExportingSessionId(null);
    }
  };

  const handleDeleteAllSessions = async () => {
    openDestructiveConfirm({
      title: "Delete all conversations?",
      description: "This will permanently delete all chat conversations. This action cannot be undone.",
      confirmLabel: "Delete all",
      requireAckLabel: "I understand this will permanently delete all conversations",
      onConfirm: async () => {
        try {
          const sessionsToDelete = [...sessions];

          for (const session of sessionsToDelete) {
            try {
              markSessionDeleted(session.session_id);
              await apiDeleteSession(session.session_id);
              try {
                window.localStorage.removeItem(`ia_history_archive_${session.session_id}`);
              } catch {
                // ignore
              }
            } catch (err) {
              console.error(`Failed to delete session ${session.session_id}:`, err);
            }
          }

          setSessions([]);
          setHistory(null);
          setShowAnswer(false);
          setSessionId("");
          try {
            window.localStorage.removeItem("ia_session_id");
            window.localStorage.removeItem("ia_sessions_cache");
          } catch {
            // ignore
          }

          toast({ title: "All conversations deleted", description: `${sessionsToDelete.length} chat sessions removed` });
        } catch (err) {
          toast({ title: "Failed to clear all conversations", variant: "destructive" });
          throw err;
        }
      },
    });
  };

  const handleNewChat = async () => {
    // 🛡️ Debounce protection: Prevent multiple clicks
    if (isCreatingSession) {
      console.log('🛡️ Session creation already in progress, ignoring duplicate click');
      return;
    }

    try {
      // Set flag to prevent duplicate clicks
      setIsCreatingSession(true);

      console.log("[New Chat] Starting new chat flow...");
      console.log("[New Chat] Current sessionId:", sessionId);
      console.log("[New Chat] Current sessions count:", sessions.length);

      // IMPORTANT: Clear localStorage FIRST to prevent ensureSession from reusing old session
      try { window.localStorage.removeItem("ia_session_id"); } catch { }

      // Clear UI state completely including streaming
      setShowAnswer(false);
      setAnswer("");
      setQuestion("");
      setLastQuestion("");
      setViewingHistory(false);
      setHistory(null);
      setIsMobileSidebarOpen(false);
      setStreaming(false); // CRITICAL: Reset streaming state

      // Clear the animation cache so new answers will animate
      try {
        // Access the global cache from AnswerCard and clear it
        (window as any).__seenAnswersCache?.clear?.();
      } catch { }

      // Wait for state to sync
      await new Promise(resolve => setTimeout(resolve, 50));

      // Do NOT create a backend session yet.
      // Creating sessions eagerly results in "empty chats" showing up in history.
      // We lazily create a session only when the user sends their first message (ensureSession).
      setSessionId("");
      try { window.localStorage.removeItem("ia_session_id"); } catch { }
      console.log("[New Chat] Ready for a fresh chat (session will be created on first message)");

      // Refresh sidebar list immediately so the old session appears in history
      console.log("[New Chat] Loading sessions list...");
      await loadSessions();
      console.log("[New Chat] Sessions loaded, count:", sessions.length);

      toast({
        title: "New chat ready",
        description: "Ask your first question to start the session.",
      });
    } catch (err) {
      console.error("Failed to start new chat:", err);
      toast({ title: "Failed to start new chat", variant: "destructive" });
    } finally {
      // Re-enable button after a short delay to prevent rapid re-clicking
      setTimeout(() => {
        setIsCreatingSession(false);
      }, 500);
    }
  };

  const handleProfileUploadClick = () => {
    profileInputRef.current?.click();
  };

  const handleProfileFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingProfile(true);
      let sid = await ensureSession();

      try {
        if (!sid) sid = await ensureSession({ forceNew: false });
        const res = await apiUploadProfile({ session_id: sid as string, file });
        setLastUploadedProfile({ name: file.name, characters: res.characters });
        setPendingAttachment({ name: file.name, type: file.type || ext(file.name) });
        toast({ title: "Profile uploaded", description: `${file.name} • ${res.characters.toLocaleString()} characters indexed.` });
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (msg.includes("Session not found")) {
          try { window.localStorage.removeItem("ia_session_id"); } catch { }
          sid = await ensureSession({ forceNew: true });
          const res = await apiUploadProfile({ session_id: sid as string, file });
          setLastUploadedProfile({ name: file.name, characters: res.characters });
          setPendingAttachment({ name: file.name, type: file.type || ext(file.name) });
          toast({ title: "Profile uploaded", description: `${file.name} • ${res.characters.toLocaleString()} characters indexed.` });
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsUploadingProfile(false);
      if (profileInputRef.current) profileInputRef.current.value = "";
    }
  };


  // Mock Interview history handlers
  const loadMockInterviewHistory = async () => {
    setMockInterviewHistoryError(null);
    setMockInterviewHistoryLoading(true);
    try {
      // Get userId from localStorage
      const userId = localStorage.getItem("mock_interview_user_id");
      console.log("[MockHistory] Loading history for userId:", userId);
      if (!userId) {
        setMockInterviewSessions([]);
        return;
      }

      // Try to load from localStorage first (for offline access and evaluations)
      let cachedSessions: MockInterviewHistorySession[] = [];
      try {
        const cached = localStorage.getItem(`mock_interview_history_${userId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            console.log("[MockHistory] Loaded from cache:", parsed);
            cachedSessions = parsed;
            setMockInterviewSessions(parsed);
          }
        }
      } catch {
        // Ignore cache errors
      }

      // Then fetch from API to get latest sessions
      console.log("[MockHistory] Fetching from API...");
      const data = await apiGetMockInterviewHistory(userId);
      console.log("[MockHistory] API response:", data);

      if (Array.isArray(data?.sessions)) {
        console.log("[MockHistory] Merging API sessions with cached evaluations...");
        console.log("[MockHistory] Cached sessions count:", cachedSessions.length);
        console.log("[MockHistory] API sessions count:", data.sessions.length);

        // Merge: Use API data but preserve evaluations from cache if API doesn't have them
        const mergedSessions = data.sessions.map((apiSession: MockInterviewHistorySession) => {
          // Find matching session in cache
          const cachedSession = cachedSessions.find(c => c.session_id === apiSession.session_id);

          console.log(`[MockHistory] Processing session ${apiSession.session_id}:`);
          console.log(`  - API has evaluations:`, apiSession.evaluations?.length || 0);
          console.log(`  - Cache found:`, !!cachedSession);
          console.log(`  - Cache has evaluations:`, cachedSession?.evaluations?.length || 0);

          // If API session lacks evaluations but cache has them, use cache evaluations
          if ((!apiSession.evaluations || apiSession.evaluations.length === 0) &&
            cachedSession?.evaluations && cachedSession.evaluations.length > 0) {
            console.log(`  ✅ Using cached evaluations (${cachedSession.evaluations.length} items)`);
            return { ...apiSession, evaluations: cachedSession.evaluations };
          }

          console.log(`  ❌ No cached evaluations to merge`);
          return apiSession;
        });

        console.log("[MockHistory] Merged sessions:", mergedSessions);
        console.log("[MockHistory] Setting merged sessions (count):", mergedSessions.length);
        setMockInterviewSessions(mergedSessions);

        // Cache merged data to localStorage
        try {
          localStorage.setItem(`mock_interview_history_${userId}`, JSON.stringify(mergedSessions));
        } catch {
          // Ignore localStorage errors
        }
      } else if (cachedSessions.length > 0) {
        // If API fails but we have cache, use cache
        console.log("[MockHistory] API returned no sessions, using cache only");
        setMockInterviewSessions(cachedSessions);
      } else {
        console.log("[MockHistory] No sessions found");
        setMockInterviewSessions([]);
      }
    } catch (err: unknown) {
      console.error("[MockHistory] Error loading history:", err);
      const message = (err as Error)?.message || "Failed to load mock interview history.";
      if (!message.includes("404")) {
        setMockInterviewHistoryError(message);
      } else {
        setMockInterviewSessions([]);
      }
    } finally {
      setMockInterviewHistoryLoading(false);
    }
  };

  const handleDeleteMockInterviewSession = async (sessionId: string) => {
    openDestructiveConfirm({
      title: "Delete interview session?",
      description: "This will permanently delete this interview session. This action cannot be undone.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        setMockInterviewDeletingSessionId(sessionId);
        try {
          const userId = localStorage.getItem("mock_interview_user_id");
          if (!userId) {
            throw new Error("User ID not found");
          }
          await apiDeleteMockInterviewSession(userId, sessionId);
          setMockInterviewSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
          if (selectedMockSession?.session_id === sessionId) {
            setSelectedMockSession(null);
          }
          try {
            const updated = (mockInterviewSessions as MockInterviewHistorySession[]).filter((s) => s.session_id !== sessionId);
            localStorage.setItem(`mock_interview_history_${userId}`, JSON.stringify(updated));
          } catch {
            // Ignore localStorage errors
          }
          toast({
            title: "Session deleted",
            description: "The interview session has been removed.",
          });
        } catch (err: unknown) {
          toast({
            title: "Failed to delete session",
            description: (err as Error)?.message || "Could not remove interview session.",
            variant: "destructive",
          });
          throw err;
        } finally {
          setMockInterviewDeletingSessionId(null);
        }
      },
    });
  };

  const handleDeleteAllMockInterviewSessions = async () => {
    openDestructiveConfirm({
      title: "Delete all interview sessions?",
      description: "This will permanently delete all mock interview sessions. This action cannot be undone.",
      confirmLabel: "Delete all",
      requireAckLabel: "I understand this will permanently delete all interview sessions",
      onConfirm: async () => {
        setMockInterviewClearingAll(true);
        try {
          const userId = localStorage.getItem("mock_interview_user_id");
          if (!userId) {
            throw new Error("User ID not found");
          }
          const result = await apiDeleteAllMockInterviewSessions(userId);
          setMockInterviewSessions([]);
          setSelectedMockSession(null);
          try {
            localStorage.removeItem(`mock_interview_history_${userId}`);
          } catch {
            // Ignore localStorage errors
          }
          toast({
            title: "History cleared",
            description: result?.message || `Deleted ${result?.deleted_count || 0} sessions.`,
          });
        } catch (err: unknown) {
          toast({
            title: "Failed to clear history",
            description: (err as Error)?.message || "Could not delete all sessions.",
            variant: "destructive",
          });
          throw err;
        } finally {
          setMockInterviewClearingAll(false);
        }
      },
    });
  };

  const handleSelectMockSession = (session: MockInterviewHistorySession) => {
    console.log("[MockHistory] Selecting session:", session.session_id);
    if (practiceScreenShareLock) {
      toast({
        title: 'Screen sharing is active',
        description: 'Finish Live Practice before switching views.',
      });
      return;
    }
    setSelectedMockSession(session);
    setActiveMainTab("mock-interview"); // Switch to Mock Interview tab
  };

  // Act on a feature the copilot pointed the user at. The chip is the whole
  // point of the suggestion, so it must land them in the feature rather than
  // in a menu they still have to read.
  const handleCopilotNavigate = (feature: CopilotFeature) => {
    if (practiceScreenShareLock && feature !== "mirror") {
      toast({
        title: "Screen sharing is active",
        description: "Finish Live Practice before switching views.",
      });
      return;
    }

    switch (feature) {
      case "practice":
        setActiveMainTab("practice");
        break;
      case "mock-interview":
        setActiveMainTab("mock-interview");
        break;
      case "questions":
        // Generating a question set happens in this chat now, so stay put and
        // arm the mode -- same shape as mirror below.
        setQuestionMode("questions");
        setActiveMainTab("answer");
        toast({
          title: "Practice Questions on",
          description: "Enter a topic and I'll generate a set with answers.",
        });
        break;
      case "progress":
        navigate("/progress");
        break;
      case "mirror":
        // Mirror lives inside this chat, so stay put and arm the mode. Without
        // the toast the toggle flips silently and looks like nothing happened.
        setQuestionMode("mirror");
        setActiveMainTab("answer");
        toast({
          title: "Mirror Mode on",
          description: "Paste your answer and I'll analyse it.",
        });
        break;
    }
  };

  // 🏗️ Architecture Mode Selection Handler
  const handleArchitectureModeSelection = async (mode: "single" | "multi-view") => {
    console.log(`[Architecture] User selected mode: ${mode}`);

    // Ensure typewriter animation stays enabled for the final answer.
    // This flow updates an existing history item (same `created_at`), which can
    // otherwise be treated as "already seen" and render instantly.
    setStreaming(true);

    // Clear AnswerCard seen-cache for this entry so replacing the choice prompt
    // with the real answer re-animates.
    try {
      const existing = history?.items?.find((it) => it.question === pendingArchitectureQuestion);
      const cacheKey = existing?.created_at;
      const cache = (window as unknown as { __seenAnswersCache?: Set<string> }).__seenAnswersCache;
      if (cacheKey && cache) {
        cache.delete(cacheKey);
      }
    } catch {
      void 0;
    }

    // Hide choice UI
    setShowArchitectureChoice(false);
    setArchitectureChoicePayload(null);

    // Show loading state
    setIsGenerating(true);
    const loadingMessage = mode === "single"
      ? "🏗️ Generating comprehensive single-view architecture..."
      : "🏗️ Generating multi-view architecture with specialized diagrams...";
    setAnswer(loadingMessage);

    try {
      const sid = await ensureSession();

      // Resend the question with the selected architecture_mode
      const res = await apiSubmitQuestion({
        session_id: sid,
        question: pendingArchitectureQuestion,
        style: style,
        mode: questionMode,
        user_answer: questionMode === "mirror" ? mirrorUserAnswer : undefined,
        architecture_mode: mode
      });

      const effectiveSid = (res as any)?.session_id && typeof (res as any).session_id === "string" ? (res as any).session_id : sid;
      if (effectiveSid && effectiveSid !== sid) {
        try {
          setSessionId(effectiveSid);
          window.localStorage.setItem("ia_session_id", effectiveSid);
          console.log("[session] Adopted effective session id from backend:", effectiveSid);
        } catch { }
      }

      console.log("[Architecture] Response received:", res);

      // Handle the response normally
      const orig = { q: pendingArchitectureQuestion, a: res.answer };
      setOriginalQA(orig);
      setLatestQA(null);
      setCurrentVersion(0);
      setLastQuestion(orig.q);
      setAnswer(orig.a);

      // Update existing history entry (don't create duplicate)
      setHistory((prev) => {
        const base = prev?.items ? [...prev.items] : [];
        // Find the existing entry with this question
        const existingIdx = base.findIndex(it => it.question === pendingArchitectureQuestion);

        if (existingIdx >= 0) {
          // Update existing entry
          const next = base.map((it, i) => i === existingIdx ? ({
            question: pendingArchitectureQuestion,
            answer: res.answer,
            style: res.style,
            created_at: base[existingIdx].created_at,
            mode: (it as any)?.mode ?? (res as any)?.mode ?? questionMode
          }) : it);
          return { session_id: effectiveSid, items: next } as GetHistoryResponse;
        } else {
          // Fallback: create new entry (shouldn't happen normally)
          const next: HistoryItem[] = [{
            question: pendingArchitectureQuestion,
            answer: res.answer,
            style: res.style,
            created_at: new Date().toISOString(),
            mode: (res as any)?.mode ?? questionMode
          }, ...base];
          return { session_id: effectiveSid, items: next } as GetHistoryResponse;
        }
      });

      // Update sidebar
      loadSessions();
      setShowAnswer(true);
    } catch (err) {
      console.error("[Architecture] Error:", err);
      setAnswer(`Failed to generate architecture: ${err instanceof Error ? err.message : 'Unknown error'}`);
      toast({
        title: "Architecture generation failed",
        description: err instanceof Error ? err.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
      setPendingArchitectureQuestion("");
    }
  };

  // Load mock interview history when mock interview tab is active
  useEffect(() => {
    if (activeMainTab === "mock-interview") {
      loadMockInterviewHistory();
    }
  }, [activeMainTab]);

  // Debug: Log when mockInterviewSessions changes
  useEffect(() => {
    console.log("[MockHistory] State updated - sessions count:", mockInterviewSessions.length);
    console.log("[MockHistory] State updated - sessions:", mockInterviewSessions);
  }, [mockInterviewSessions]);

  // NOTE: Do NOT create a backend session on mount.
  // Sessions are created lazily on first user action (send message, upload profile, etc.)
  // to avoid generating empty chat sessions.

  const GENERATING_PLACEHOLDER = "**Generating your response**";

  // Restore last visible answer per-session (prevents cross-session bleed on refresh).
  useEffect(() => {
    if (!sessionId || !isValidSessionId(sessionId)) return;
    if (isGenerating) return;

    // Don't override an already-populated view (e.g., user just clicked a history item).
    if ((lastQuestion && lastQuestion.trim()) || (answer && answer.trim()) || showAnswer) return;

    try {
      const storedSid = window.localStorage.getItem('ia_session_id');
      const lastViewSid = window.localStorage.getItem(LAST_VIEW_SESSION_KEY);
      if (!storedSid || !isValidSessionId(storedSid)) return;
      if (storedSid !== sessionId) return;
      if (!lastViewSid || lastViewSid !== sessionId) return;

      const view = readLastView(sessionId);
      if (!view) return;

      const normalizedA = String(view.answer || '').trim();
      const isIncomplete = !normalizedA || normalizedA === GENERATING_PLACEHOLDER;
      if (view.show && view.question && isIncomplete) {
        clearLastView(sessionId);
        return;
      }

      if (view.show && view.question && normalizedA) {
        setLastQuestion(view.question);
        setViewingHistory(Boolean(view.viewingHistory));
        setAnswer(view.answer);
        setShowAnswer(true);
        setIsNavigatingVersion(false);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const loadSessions = async () => {
    try {
      const s = await apiGetSessions();
      const sessionList = Array.isArray(s) ? s : [];
      // Filter out sessions that are in the deleted blacklist and hide empty sessions (qna_count === 0)
      // so the sidebar doesn't get polluted with blank chats.
      const validSessions = sessionList.filter(sess => {
        if (deletedSessionIdsRef.current.has(sess.session_id)) return false;
        if (typeof (sess as any)?.qna_count === 'number' && (sess as any).qna_count <= 0) return false;
        return true;
      });
      setSessions(validSessions);
      console.log("[api] GET /api/sessions ->", s);

      // Update cache with fresh data (excluding deleted sessions)
      try {
        window.localStorage.setItem('ia_sessions_cache', JSON.stringify(validSessions));

        // Clean up deleted sessions that are no longer in the API response
        // (they've been confirmed deleted from backend)
        const apiSessionIds = new Set(sessionList.map(sess => sess.session_id));
        const toRemove: string[] = [];
        deletedSessionIdsRef.current.forEach(id => {
          if (!apiSessionIds.has(id)) {
            toRemove.push(id);
          }
        });
        if (toRemove.length > 0) {
          toRemove.forEach(id => deletedSessionIdsRef.current.delete(id));
          window.localStorage.setItem('ia_deleted_sessions', JSON.stringify([...deletedSessionIdsRef.current]));
        }
      } catch { }
    } catch (e) {
      console.error("[api] sessions error", e);
    }
  };

  // Load recent sessions for sidebar
  useEffect(() => {
    // Restore cached sessions immediately for instant UI on return
    try {
      const raw = window.localStorage.getItem('ia_sessions_cache');
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached)) {
          // Filter out deleted sessions from cache too
          const validCached = cached.filter((s: any) => !deletedSessionIdsRef.current.has(s.session_id));
          setSessions(validCached);
        }
      }
    } catch { }

    loadSessions();
  }, []);

  // Show install banner briefly when install becomes available (once per device for a while).
  useEffect(() => {
    if (!canPrompt || isStandalone) return;
    try {
      const key = 'pwa_install_banner_dismissed_until';
      const raw = window.localStorage.getItem(key);
      const until = raw ? Number(raw) : 0;
      if (Number.isFinite(until) && until > Date.now()) return;
    } catch {
      // ignore
    }

    setShowInstallBanner(true);
    const timer = window.setTimeout(() => setShowInstallBanner(false), 5000);
    return () => window.clearTimeout(timer);
  }, [canPrompt, isStandalone]);

  // Load history when sessionId available or reset token changes
  useEffect(() => {
    if (!sessionId) return;
    // 🛡️ Skip history reload while actively generating a response.
    // When the user sends their FIRST question, ensureSession() creates a new session
    // and updates sessionId, which triggers this effect. But for a brand-new session
    // the server returns empty history, which would OVERWRITE the optimistic insert
    // (the pending question with empty answer) causing a blank screen on mobile.
    if (isGeneratingRef.current) return;
    // Track whether this effect invocation is still "current" (not stale).
    let cancelled = false;
    (async () => {
      try {
        // 0) Immediately hydrate from durable local archive so the sidebar isn't empty on return
        try {
          const archiveKey = `ia_history_archive_${sessionId}`;
          const rawArch = window.localStorage.getItem(archiveKey);
          if (rawArch) {
            const archived = JSON.parse(rawArch) as Array<{ question: string; answer: string; ts: number; mode?: CopilotMode }>;
            if (Array.isArray(archived) && archived.length > 0) {
              // Filter out incomplete entries (empty answer) - these are failed optimistic inserts
              const complete = archived.filter(it => {
                const a = (it.answer || '').trim();
                if (!a) return false;
                if (a === GENERATING_PLACEHOLDER) return false;
                return true;
              });
              if (complete.length > 0) {
                // Same comparator the merge below uses, so this first paint and
                // the final one cannot disagree about order.
                const ordered = [...complete].sort((a, b) => (b.ts || 0) - (a.ts || 0));
                const items = ordered.map(it => ({ question: it.question, answer: it.answer, mode: it.mode })) as any;
                if (!cancelled && !isGeneratingRef.current) {
                  setHistory({ session_id: sessionId, items } as any);
                }
                // Update archive to remove incomplete entries
                if (complete.length !== archived.length) {
                  window.localStorage.setItem(archiveKey, JSON.stringify(complete));
                }
              }
            }
          }
        } catch { }

        // Preload history from cache while network fetch happens
        const cachedHistory = readHistoryCache(sessionId);
        if (cachedHistory && !cancelled && !isGeneratingRef.current) {
          setHistory(cachedHistory);
        }
        const fetched = await apiGetHistory(sessionId);
        // 🛡️ Re-check after async: if generation started while we were fetching, bail out
        if (cancelled || isGeneratingRef.current) return;
        // Put the server response into the UI's canonical order before anything
        // reads it - the merge below, the cache write, and the no-archive path
        // all consume this value.
        const h = { ...fetched, items: toNewestFirst(fetched?.items || []) };
        // Merge with durable local archive to ensure persistence even across outages
        let merged = h;
        try {
          const archiveKey = `ia_history_archive_${sessionId}`;
          const raw = window.localStorage.getItem(archiveKey);
          if (raw) {
            const archived = JSON.parse(raw) as Array<{ question: string; answer: string; ts: number; mode?: CopilotMode }>;
            // Carry the real creation time through. Stamping every server item
            // with Date.now() made them all equal and newer than anything
            // archived, so the sort below could not interleave them - archived
            // entries were forced to the bottom regardless of when they were
            // written. The index fallback keeps newest-first when the server
            // omits created_at.
            const serverItems = (h?.items || []).map((it, i) => ({
              question: it.question,
              answer: it.answer,
              ts: it.created_at ? new Date(it.created_at).getTime() : Date.now() - i,
              mode: (it as any)?.mode,
            })) as any;
            const combined = [...archived, ...serverItems];
            // De-duplicate by question+answer
            const seen = new Set<string>();
            // Filter out incomplete entries (empty answer) and de-duplicate
            const unique = combined.filter(it => {
              // Skip incomplete entries (optimistic inserts that never got responses)
              const a = (it.answer || '').trim();
              if (!a) return false;
              if (a === GENERATING_PLACEHOLDER) return false;
              const key = `${it.question}\u0000${it.answer}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            // Sort by timestamp descending if available
            unique.sort((a, b) => (b.ts || 0) - (a.ts || 0));
            merged = { session_id: sessionId, items: unique.map(it => ({ question: it.question, answer: it.answer, mode: (it as any)?.mode })) } as any;
            // Write back merged archive for durability
            window.localStorage.setItem(archiveKey, JSON.stringify(unique));
          }
        } catch { }
        if (!cancelled && !isGeneratingRef.current) {
          setHistory(merged);
        }
        console.log(`[api] GET /api/history/${sessionId} ->`, h);
        // Cache to survive transient reloads or quick route switches
        writeHistoryCache(sessionId, h);
      } catch (e) {
        console.error("[api] history error", e);
        // Fallback to cached history if network fails or session temporarily
        // missing. Scoped to this session by construction now, so a failed fetch
        // can only ever restore this conversation - never whichever one happened
        // to be cached last.
        const fallback = readHistoryCache(sessionId);
        if (fallback && !cancelled && !isGeneratingRef.current) {
          setHistory(fallback);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, resetToken]);

  // Persist the currently displayed card so navigating away and back restores it
  useEffect(() => {
    try {
      // Never persist the in-flight generating placeholder as a "real" answer.
      const safeAnswer = isGenerating && (answer || '').trim() === GENERATING_PLACEHOLDER ? '' : (answer || '');
      const safeShow = isGenerating && (answer || '').trim() === GENERATING_PLACEHOLDER ? false : !!showAnswer;

      // Back-compat keys (legacy) - keep for now.
      window.localStorage.setItem('ia_last_question', lastQuestion || '');
      window.localStorage.setItem('ia_last_answer', safeAnswer);
      window.localStorage.setItem('ia_show_answer', String(safeShow));
      window.localStorage.setItem('ia_viewing_history', String(!!viewingHistory));

      // Session-scoped last-view (prevents wrong session adopting the last message on refresh).
      if (sessionId && isValidSessionId(sessionId)) {
        writeLastView(sessionId, {
          question: lastQuestion || '',
          answer: safeAnswer,
          show: safeShow,
          viewingHistory: !!viewingHistory,
        });
      }
    } catch { }
  }, [lastQuestion, answer, showAnswer, viewingHistory, isGenerating, sessionId]);

  // Fetch evaluation allowance when the lastQuestion or sessionId changes.
  useEffect(() => {
    let mounted = true;
    const localClassifier = (text: string) => {
      if (!text || !text.trim()) return { allowed: false, reason: 'No question provided.' };
      const low = text.toLowerCase();
      // conservative allow-list of technical keywords
      const techKeywords = ['implement', 'algorithm', 'time complexity', 'space complexity', 'optimize', 'data structure', 'dijkstra', 'two sum', 'leetcode', 'code', 'function', 'class', 'system design', 'architecture', 'design a', 'api', 'endpoint', 'sql', 'database', 'graph', 'tree', 'binary', 'search', 'sorting', 'merge', 'quick sort', 'dynamic programming'];
      const found = techKeywords.some(k => low.includes(k));
      if (found) return { allowed: true, reason: '' };
      return { allowed: false, reason: 'Evaluation is reserved for technical coding, algorithm, or system-design questions.' };
    };

    const check = async () => {
      if (!lastQuestion || !lastQuestion.trim()) {
        if (!mounted) return;
        setEvaluationAllowed(false);
        setEvaluationReason('No question to evaluate.');
        return;
      }

      // Try server-side check first
      try {
        const sid = sessionId || '';
        const q = encodeURIComponent(lastQuestion);
        const url = `/api/evaluate/allowed?session_id=${encodeURIComponent(sid)}&problem=${q}`;
        const res = await fetch(url, { method: 'GET' });
        if (!mounted) return;
        if (res.ok) {
          const body = await res.json();
          setEvaluationAllowed(Boolean(body?.allowed));
          setEvaluationReason(body?.reason || null);
          return;
        }
        // Non-OK: fall back to local classifier
      } catch (err) {
        // network or server error -> fallback
      }

      // Fallback local classifier
      try {
        const out = localClassifier(lastQuestion);
        if (!mounted) return;
        setEvaluationAllowed(Boolean(out.allowed));
        setEvaluationReason(out.reason || null);
      } catch (err) {
        if (!mounted) return;
        setEvaluationAllowed(false);
        setEvaluationReason('Could not determine evaluation allowance.');
      }
    };

    check();
    return () => { mounted = false; };
  }, [lastQuestion, sessionId]);

  // Close any open menu on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-history-item]') && !target.closest('[data-right-popover]')) {
        setOpenMenuIndex(null);
        setMenuPos(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Close on resize (layout changes). Keep popover during scroll for stability
  useEffect(() => {
    const onResize = () => {
      if (openMenuIndex !== null && menuPos) {
        setOpenMenuIndex(null);
        setMenuPos(null);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [openMenuIndex, menuPos]);

  // Removed aggressive auto-scroll behavior to allow free scrolling

  const submitMirrorAnswer = async () => {
    const q = String(pendingMirrorQuestion || lastQuestion || "").trim();
    const ua = mirrorUserAnswer.trim();
    if (!q || !ua) return;

    try {
      setStreaming(true);
      setIsGenerating(true);
      setShowAnswer(true);
      setAnswer(GENERATING_PLACEHOLDER);

      const sid = await ensureSession();
      let res;
      try {
        res = await apiSubmitQuestion({
          session_id: sid,
          question: q,
          style,
          mode: "mirror",
          user_answer: ua,
        });
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (msg.includes("Session not found")) {
          try { window.localStorage.removeItem("ia_session_id"); } catch { }
          const newSid = await ensureSession({ forceNew: true });
          res = await apiSubmitQuestion({
            session_id: newSid,
            question: q,
            style,
            mode: "mirror",
            user_answer: ua,
          });
        } else {
          throw err;
        }
      }

      const effectiveSid = (res as any)?.session_id && typeof (res as any).session_id === "string" ? (res as any).session_id : sid;
      if (effectiveSid && effectiveSid !== sid) {
        try {
          setSessionId(effectiveSid);
          window.localStorage.setItem("ia_session_id", effectiveSid);
        } catch { }
      }

      if (res?.ui_action === "collect_mirror_answer") {
        setPendingMirrorQuestion(q);
        setMirrorDialogOpen(true);
        setAnswer("Mirror Mode initialized. Please paste your draft answer below to receive a strategic critique and an improved rewrite.");
        return;
      }

      setMirrorDialogOpen(false);
      setPendingMirrorQuestion(null);
      setLastQuestion(q);
      setAnswer(res.answer);

      setHistory((prev) => {
        const base = prev?.items ? [...prev.items] : [];
        const pendingIdx = base.findIndex((it) => it.question === q && it.answer === "");
        if (pendingIdx >= 0) {
          const next = base.map((it, i) =>
            i === pendingIdx
              ? {
                question: q,
                answer: res.answer,
                style: res.style,
                created_at: base[pendingIdx].created_at,
                mode: (it as any)?.mode ?? (res as any)?.mode ?? "mirror",
              }
              : it
          );
          return { session_id: effectiveSid, items: next } as GetHistoryResponse;
        }
        const next: HistoryItem[] = [
          { question: q, answer: res.answer, style: res.style, created_at: new Date().toISOString(), mode: (res as any)?.mode ?? "mirror" },
          ...base,
        ];
        return { session_id: effectiveSid, items: next } as GetHistoryResponse;
      });

      try {
        const archiveKey = `ia_history_archive_${effectiveSid}`;
        const raw = window.localStorage.getItem(archiveKey);
        const list = raw ? (JSON.parse(raw) as Array<{ question: string; answer: string; ts: number; mode?: CopilotMode }>) : [];
        const pendingIndex = list.findIndex((x) => x.question === q && x.answer === "");
        if (pendingIndex >= 0) list[pendingIndex] = { question: q, answer: res.answer, ts: Date.now(), mode: (res as any)?.mode ?? "mirror" } as any;
        else list.unshift({ question: q, answer: res.answer, ts: Date.now(), mode: (res as any)?.mode ?? "mirror" } as any);
        const CUTOFF = 1000;
        window.localStorage.setItem(archiveKey, JSON.stringify(list.slice(0, CUTOFF)));
      } catch { }

      loadSessions();

      // Clear the mirror answer so next question will prompt again
      setMirrorUserAnswer("");
      // The critique is delivered: the next message is an ordinary question.
      resetOneShotMode();
    } catch (err: any) {
      console.error("[mirror] submit error", err);
      try {
        (toast as any) && toast({
          title: "Analysis failed",
          description: 'Could not complete the analysis. Please try again.',
          variant: "destructive",
        });
      } catch { }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAnswer = async (overrideQuestion?: string) => {
    // Reset navigation states immediately
    setIsNavigatingVersion(false);
    setViewingHistory(false);

    const currentQuestion = (overrideQuestion ?? question).trim();
    if (!currentQuestion) return;

    // 🪞 Mirror Mode: if user hasn't provided their answer yet, open dialog to collect it
    if (questionMode === "mirror" && !mirrorUserAnswer.trim()) {
      setPendingMirrorQuestion(currentQuestion);
      setMirrorDialogOpen(true);
      return;
    }

    try {
      // Ensure streaming is enabled for the new generation
      setStreaming(true);
      setIsGenerating(true);
      isGeneratingRef.current = true;

      console.log('[Generation] Starting, streaming enabled');

      // Tab/session binding: prefer in-memory sessionId (selected tab) over localStorage.
      // Only treat as a new session if BOTH ids are present and mismatched.
      const historySid = (history as any)?.session_id as string | undefined;
      const immediateSid = sessionId || historySid || "";
      const isSessionMismatch = Boolean(immediateSid) && Boolean(historySid) && historySid !== immediateSid;

      if (isSessionMismatch) {
        console.log('[Generation] Session mismatch detected, clearing old history. Current:', immediateSid, 'History:', historySid);
        setHistory(null);
      }
      // NOTE: We intentionally do NOT call setShowAnswer(false) here.
      // For the first question, showAnswer is already false. For subsequent
      // questions, we don't want to hide the conversation momentarily.
      // Instead, we set showAnswer=true below in the same synchronous batch.

      // Capture the attachment state before clearing
      const sentAttachment = pendingAttachment;

      // Optimistic history insert (empty answer until completion)
      // Do this BEFORE the await ensureSession to prevent flicker
      setHistory((prev) => {
        // If session changed, start fresh
        if (prev && prev.session_id !== immediateSid) {
          console.log('[Generation] Session mismatch in history update, starting fresh');
          return {
            session_id: immediateSid || "pending",
            items: [{ question: currentQuestion, answer: '', style, created_at: new Date().toISOString(), mode: questionMode, attachment: sentAttachment }],
          } as GetHistoryResponse;
        }

        const nowIso = new Date().toISOString();
        const items = prev?.items || [];
        const hasPending = items.some(it => it.question === currentQuestion && it.answer === '');
        const hasAnswered = items.some(it => it.question === currentQuestion && it.answer && it.answer.trim());

        const next: HistoryItem[] = hasPending || hasAnswered
          ? [...items]
          : [{ question: currentQuestion, answer: '', style, created_at: nowIso, mode: questionMode, attachment: sentAttachment }];

        if (!hasPending && !hasAnswered) {
          next.push(...items);
        }

        return { session_id: immediateSid || "pending", items: next } as GetHistoryResponse;
      });

      // ⚡ Show answer view + generating placeholder SYNCHRONOUSLY before any await.
      // This ensures React batches showAnswer=true with the optimistic history insert
      // above, preventing the blank screen flash on the first question.
      if (!(isEditingFromAnswer && originalQA)) {
        setShowAnswer(true);
        setAnswer(GENERATING_PLACEHOLDER);
      }

      // Clear input immediately on submit so it never "sticks" on early-return flows.
      // If the request fails, we restore the user's prompt in the catch block.
      if (!overrideQuestion) setQuestion("");
      setPendingAttachment(null);
      setLastQuestion(currentQuestion);

      // Now ensure session (might take a second)
      const sid = await ensureSession();
      try {
        const archiveKey = `ia_history_archive_${sid}`;
        const raw = window.localStorage.getItem(archiveKey);
        const list = raw ? (JSON.parse(raw) as Array<{ question: string; answer: string; ts: number }>) : [];
        const hasPending = list.some(x => x.question === currentQuestion && x.answer === '');
        const hasAnswered = list.some(x => x.question === currentQuestion && x.answer && x.answer.trim());
        if (!hasPending && !hasAnswered) {
          list.unshift({ question: currentQuestion, answer: '', ts: Date.now(), mode: questionMode } as any);
          const CUTOFF = 1000;
          window.localStorage.setItem(archiveKey, JSON.stringify(list.slice(0, CUTOFF)));
        }
      } catch { }

      // Start response generation immediately for zero-latency experience
      const responsePromise = (async () => {
        let res;
        try {
          // 🏗️ ARCHITECTURE REQUESTS NOW GO TO BACKEND FOR MODE SELECTION
          // Old direct frontend generation removed - backend handles choice flow

          // Debug: log outgoing payload so we can inspect it in network/console
          console.log('[api] POST /api/question payload', {
            session_id: sid,
            question: currentQuestion,
            style,
            mode: questionMode,
            has_user_answer: questionMode === "mirror" ? Boolean(mirrorUserAnswer.trim()) : undefined,
          });
          res = await apiSubmitQuestion({
            session_id: sid,
            question: currentQuestion,
            style,
            mode: questionMode,
            user_answer: questionMode === "mirror" ? mirrorUserAnswer : undefined,
          });
        } catch (err: any) {
          const msg = String(err?.message || "");
          const looksLikeMissing = msg.includes("Session not found");
          if (looksLikeMissing) {
            try { window.localStorage.removeItem("ia_session_id"); } catch { }
            const newSid = await ensureSession({ forceNew: true });
            res = await apiSubmitQuestion({
              session_id: newSid,
              question: currentQuestion,
              style,
              mode: questionMode,
              user_answer: questionMode === "mirror" ? mirrorUserAnswer : undefined,
            });
          } else {
            // Surface backend diagnostics in dev: show a toast with error body if available
            console.error('[question] submit error details', err);
            try {
              (toast as any) && toast({ title: 'Request failed', description: 'Something went wrong while processing your question. Please try again.', variant: 'destructive' });
            } catch { }
            throw err;
          }
        }
        return res;
      })();

      // Versioning: decide whether this is a fresh question or an edit of existing response
      if (!isEditingFromAnswer) {
        // New question flow: reset versions
        setOriginalQA(null);
        setLatestQA(null);
        setCurrentVersion(0);
      }

      // Clear the animation cache BEFORE showing answer to ensure streaming works
      try {
        const cache = (window as any).__seenAnswersCache;
        if (cache) {
          console.log('[Cache] Clearing cache before showing answer, size before:', cache.size);
          cache.clear();
          console.log('[Cache] Cleared successfully');
        }
      } catch (e) {
        console.error('[Cache] Error clearing before answer:', e);
      }

      // NOTE: setShowAnswer(true) + setAnswer(GENERATING_PLACEHOLDER) are now called
      // SYNCHRONOUSLY before the await ensureSession() above to prevent blank screen flash.

      try {
        const res = await responsePromise;
        console.log("[question] response", res);
        console.log("[truncation] Backend truncated flag:", res.truncated);
        console.log("[truncation] Gemini key exists:", !!localStorage.getItem("gemini_api_key"));

        // If backend repaired/overrode the session id, adopt it so future requests stay in the same session.
        const effectiveSid = (res as any)?.session_id && typeof (res as any).session_id === "string" ? (res as any).session_id : sid;
        if (effectiveSid && effectiveSid !== sid) {
          try {
            setSessionId(effectiveSid);
            window.localStorage.setItem("ia_session_id", effectiveSid);
            console.log("[session] Adopted effective session id from backend:", effectiveSid);
          } catch { }
        }

        const effectiveMode = ((res as any)?.mode as ("answer" | "mirror" | undefined)) ?? questionMode;

        // Note: Truncation handling removed to match ChatGPT/Claude behavior
        // Responses are shown in full without upgrade prompts
        setAnswerTruncated(false);
        setShowUpgradeBanner(false);

        // 🏗️ Architecture Mode Choice (structured)
        if (res?.ui_action === "choose_architecture_mode") {
          const payload = (res.ui_payload || {}) as {
            default?: string;
            options?: Array<{ id: string; label: string; description?: string }>;
          };

          setShowArchitectureChoice(true);
          setPendingArchitectureQuestion(currentQuestion);
          setArchitectureChoicePayload({
            default: payload.default,
            options: Array.isArray(payload.options) ? payload.options : [],
          });

          // Ensure we don't show any "answer text" for this step
          setAnswer("");
          setIsGenerating(false);

          // Keep the pending history entry (answer stays empty)
          setHistory((prev) => {
            const base = prev?.items ? [...prev.items] : [];
            const pendingIdx = base.findIndex((it) => it.question === currentQuestion && it.answer === "");
            if (pendingIdx >= 0) {
              const next = base.map((it, i) =>
                i === pendingIdx
                  ? {
                    question: currentQuestion,
                    answer: "",
                    style: res.style,
                    created_at: base[pendingIdx].created_at,
                    mode: (it as any)?.mode ?? ((res as any)?.mode as ("answer" | "mirror" | undefined)) ?? questionMode,
                  }
                  : it
              );
              return { session_id: effectiveSid, items: next } as GetHistoryResponse;
            }
            return prev;
          });

          return;
        }

        // 🪞 Mirror Mode: backend detected Mirror but user_answer was missing/empty
        if (res?.ui_action === "collect_mirror_answer") {
          setPendingMirrorQuestion(currentQuestion);
          setMirrorDialogOpen(true);
          setAnswer("Mirror Mode: Please paste your draft answer to analyze it for structural improvements and clarity.");
          setIsGenerating(false);
          return;
        }

        // The turn is done, so a one-shot mode has served its purpose. Below the
        // early return for `collect_mirror_answer`, which is not a finished turn.
        resetOneShotMode();

        // The backend thinks this user is circling the same thing. It caps
        // itself at one offer per session, so no throttling is needed here.
        if (res?.ui_action === "offer_help" && res.ui_payload?.message && res.ui_payload?.feature) {
          setStuckOffer({
            message: String(res.ui_payload.message),
            feature: String(res.ui_payload.feature),
          });
        }

        if (isEditingFromAnswer && originalQA) {
          // Save as latest and show latest
          const latest = { q: currentQuestion, a: res.answer };
          setLatestQA(latest);
          setCurrentVersion(1);
          setLastQuestion(latest.q);
          setAnswer(latest.a);
          setIsEditingFromAnswer(false);
          setPendingEditedQuestion(null);
        } else {
          // First response in this space
          const orig = { q: currentQuestion, a: res.answer };
          setOriginalQA(orig);
          setLatestQA(null);
          setCurrentVersion(0);
          setLastQuestion(orig.q);
          setAnswer(orig.a);
        }
        setHistory((prev) => {
          const base = prev?.items ? [...prev.items] : [];
          const pendingIdx = base.findIndex(it => it.question === currentQuestion && it.answer === '');
          let next: HistoryItem[];
          // Carried so a turn that rendered question cards keeps them without
          // waiting for a session reload to fetch them back from the server.
          const turnMeta = res?.ui_action
            ? { mode: effectiveMode, ui_action: res.ui_action, ui_payload: res.ui_payload }
            : undefined;
          if (pendingIdx >= 0) {
            next = base.map((it, i) => i === pendingIdx ? ({
              question: currentQuestion,
              answer: res.answer,
              style: res.style,
              created_at: base[pendingIdx].created_at,
              mode: (it as any)?.mode ?? effectiveMode,
              meta: turnMeta ?? (it as any)?.meta
            }) : it);
          } else {
            next = [{
              question: currentQuestion,
              answer: res.answer,
              style: res.style,
              created_at: new Date().toISOString(),
              mode: effectiveMode,
              meta: turnMeta
            }, ...base];
          }
          // Remove any other duplicates of the same question (both answered and pending), keeping the first occurrence
          const seenQ = new Set<string>();
          const dedup = next.filter(it => {
            if (it.question !== currentQuestion) return true;
            if (seenQ.has(currentQuestion)) return false;
            seenQ.add(currentQuestion);
            return true;
          });
          return { session_id: effectiveSid, items: dedup } as GetHistoryResponse;
        });

        // Update sidebar with latest counts/titles
        loadSessions();
        // Persist to local durable archive (replace pending entry if present)
        try {
          const archiveKey = `ia_history_archive_${effectiveSid}`;
          const raw = window.localStorage.getItem(archiveKey);
          const list = raw ? (JSON.parse(raw) as Array<{ question: string; answer: string; ts: number; mode?: CopilotMode }>) : [];
          const pendingIndex = list.findIndex(x => x.question === currentQuestion && x.answer === '');
          if (pendingIndex >= 0) list[pendingIndex] = { question: currentQuestion, answer: res.answer, ts: Date.now(), mode: effectiveMode };
          else list.unshift({ question: currentQuestion, answer: res.answer, ts: Date.now(), mode: effectiveMode });
          const CUTOFF = 1000;
          window.localStorage.setItem(archiveKey, JSON.stringify(list.slice(0, CUTOFF)));
        } catch { }

        // ✅ SUCCESS - Now clear the input field
        if (!overrideQuestion) setQuestion("");

        setShowAnswer(true);
      } catch (err) {
        console.error("[question] error", err);

        // ❌ ERROR - Restore the input so user doesn't lose their prompt
        if (!overrideQuestion && question !== currentQuestion) {
          setQuestion(currentQuestion);
        }

        // Parse error message for specific error types
        const errorMessage = String(err?.message || "");
        const errorLower = errorMessage.toLowerCase();

        // Detect and handle specific error types professionally
        if (
          errorMessage.includes("401") ||
          errorMessage.includes("403") ||
          errorLower.includes("unauthorized") ||
          errorLower.includes("forbidden") ||
          errorLower.includes("invalid api key") ||
          errorLower.includes("authentication") ||
          errorLower.includes("invalid_key")
        ) {
          // Missing or invalid API key
          setAnswer(
            "🔑 **API Key Issue**\n\n" +
            "The AI service rejected your request. This usually means your API key is missing, incorrect, or has expired.\n\n" +
            "**What you can do:**\n" +
            "1. Open **Bridge Settings** (top right icon)\n" +
            "2. Check if your Groq or Gemini key is entered correctly\n" +
            "3. Ensure there are no extra spaces at the beginning or end of the key\n\n" +
            "**Get a fresh free key:**\n" +
            "- **Groq:** [console.groq.com](https://console.groq.com/keys)\n" +
            "- **Gemini:** [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)\n\n" +
            "Your keys are stored locally in your browser and are never shared with anyone else."
          );
        } else if (errorLower.includes("rate limit") || errorLower.includes("429") || errorLower.includes("too many requests")) {
          // Rate limit exceeded
          setAnswer(
            "⏱️ **Rate Limit Reached**\n\n" +
            "You've hit the rate limit for your API key. This is a temporary restriction.\n\n" +
            "**What you can do:**\n" +
            "- **Wait a few minutes** and try again\n" +
            "- **Upgrade your API tier** for higher limits\n" +
            "- **Use a different API key** if you have one\n\n" +
            "**Pro tip:** If you have both Groq and Gemini keys, the app will automatically switch between them."
          );
        } else if (errorLower.includes("quota") || errorLower.includes("insufficient") || errorLower.includes("exceeded")) {
          // Quota exhausted
          setAnswer(
            "📊 **Quota Exhausted**\n\n" +
            "Your API key has reached its usage quota for this billing period.\n\n" +
            "**What you can do:**\n" +
            "- **Wait until quota resets** (usually monthly)\n" +
            "- **Upgrade your plan** for more quota\n" +
            "- **Get a new free API key** from the provider\n" +
            "- **Switch providers** (add Gemini if using Groq, or vice versa)\n\n" +
            "**Free tier limits:**\n" +
            "- Groq: Generous free tier with high limits\n" +
            "- Gemini: Free tier with daily quota"
          );
        } else if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
          // Request timeout
          setAnswer(
            "⏰ **Request Timed Out**\n\n" +
            "The request took too long to complete.\n\n" +
            "**What you can do:**\n" +
            "- **Try again** - it might work on retry\n" +
            "- **Simplify your question** - break it into smaller parts\n" +
            "- **Check your connection**\n\n" +
            "If this persists, the AI service might be experiencing high load."
          );
        } else if (errorLower.includes("network") || errorLower.includes("fetch failed") || errorLower.includes("connection")) {
          // Network error
          setAnswer(
            "🌐 **Connection Error**\n\n" +
            "Unable to reach the AI service.\n\n" +
            "**What you can do:**\n" +
            "- **Check your internet connection**\n" +
            "- **Try again in a moment**\n" +
            "- **Refresh the page** if it persists\n\n" +
            "If you're behind a firewall or VPN, it might be blocking the connection."
          );
        } else if (errorLower.includes("500") || errorLower.includes("internal server error")) {
          // Server error
          setAnswer(
            "🔧 **Service Temporarily Unavailable**\n\n" +
            "The AI service is experiencing technical difficulties.\n\n" +
            "**What you can do:**\n" +
            "- **Wait a few minutes** and try again\n" +
            "- **Try a different provider** (switch between Groq/Gemini)\n\n" +
            "The service should be back online shortly!"
          );
        } else {
          // Generic error with helpful guidance
          setAnswer(
            "⚠️ **Something Went Wrong**\n\n" +
            "I encountered an unexpected error.\n\n" +
            "**What you can do:**\n" +
            "- **Try again** - it might be temporary\n" +
            "- **Rephrase your question** if it was complex\n" +
            "- **Check Bridge Settings** for valid API key\n\n" +
            "If this keeps happening, check the browser console (F12) for details."
          );
        }

        // Remove the optimistic insert with empty answer since response failed
        setHistory((prev) => {
          const items = prev?.items || [];
          const filtered = items.filter(it => !(it.question === currentQuestion && (!it.answer || !it.answer.trim())));
          return { session_id: sid, items: filtered } as any;
        });
        // Also remove from archive
        try {
          const archiveKey = `ia_history_archive_${sid}`;
          const raw = window.localStorage.getItem(archiveKey);
          if (raw) {
            const list = JSON.parse(raw) as Array<{ question: string; answer: string; ts: number }>;
            const cleaned = list.filter(x => !(x.question === currentQuestion && (!x.answer || !x.answer.trim())));
            window.localStorage.setItem(archiveKey, JSON.stringify(cleaned));
          }
        } catch { }
      }
    } catch (err) {
      console.error("[question] error", err);
    } finally {
      setIsGenerating(false);
      // Turn off streaming after a delay to allow AnswerCard animation to complete and cache
      // This prevents re-streaming when navigating between tabs
      setTimeout(() => {
        setStreaming(false);
      }, 500);
    }
  };

  // Example Evaluate button handler (streams evaluation overlay)
  const handleEvaluateCode = async () => {
    // This is a sample hook-up. Replace `code` and `problem` with your current editor/problem state.
    const code = `def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        d = target - n\n        if d in seen:\n            return [seen[d], i]\n        seen[n] = i\n    return []`;
    const problem = "Implement two_sum. Return indices of two numbers adding to target.";
    try {
      await startEvaluationOverlay({ code, problem, language: "python", title: "Running Evaluation" });
    } catch { }
  };

  // Generate specifically for an edited question inline, preserving current view until response arrives
  const handleSubmitInlineEdit = async (newQuestion: string) => {
    // Keep current response visible; generate latest in background
    setIsEditingFromAnswer(true);
    setPendingEditedQuestion(newQuestion);
    // Hide current card and show generating placeholder similar to new query flow
    setShowAnswer(false);
    setViewingHistory(false);
    await handleGenerateAnswer(newQuestion);
  };

  // Handlers for edit and version navigation
  const handleEditCurrent = () => {
    // Mark inline editing without hiding the current response
    setIsEditingFromAnswer(true);
  };

  const handlePrevVersion = () => {
    if (latestQA && originalQA && currentVersion === 1) {
      setIsNavigatingVersion(true);
      setCurrentVersion(0);
      setLastQuestion(originalQA.q);
      setAnswer(originalQA.a);
    }
  };

  const handleNextVersion = () => {
    if (latestQA && currentVersion === 0) {
      setIsNavigatingVersion(true);
      setCurrentVersion(1);
      setLastQuestion(latestQA.q);
      setAnswer(latestQA.a);
    }
  };

  const generateMockAnswer = (q: string): string => {
    // Simple mock response generation based on common interview questions
    const lowerQ = q.toLowerCase();

    if (lowerQ.includes("tell me about yourself") || lowerQ.includes("introduce yourself")) {
      return "I'm a passionate software developer with over 3 years of experience in full-stack development. I've worked extensively with React, Node.js, and modern web technologies. What excites me most is solving complex problems and creating user-friendly applications. In my previous role, I led a team that improved application performance by 40% and delivered key features that increased user engagement significantly.";
    }

    if (lowerQ.includes("weakness") || lowerQ.includes("weaknesses")) {
      return "I'd say my biggest area for growth is public speaking. While I'm comfortable in small team settings, I used to feel nervous presenting to large groups. I've been actively working on this by volunteering to give more presentations and joining a local Toastmasters group. I've already seen improvement - last month I successfully presented our project roadmap to a 50-person audience.";
    }

    if (lowerQ.includes("strength") || lowerQ.includes("strengths")) {
      return "One of my key strengths is my ability to break down complex problems into manageable pieces. I approach challenges systematically, which helps me find efficient solutions quickly. For example, when our team faced a critical performance issue last quarter, I methodically analyzed the bottlenecks, identified the root cause, and implemented a solution that improved response times by 60%.";
    }

    if (lowerQ.includes("why") && (lowerQ.includes("company") || lowerQ.includes("job") || lowerQ.includes("role"))) {
      return "I'm excited about this opportunity because it aligns perfectly with my career goals and values. Your company's commitment to innovation and user-centric design really resonates with me. I've been following your recent product launches, and I'm impressed by how you balance technical excellence with real user needs. I believe my background in scalable web applications and my passion for creating meaningful user experiences would allow me to contribute significantly to your team's success.";
    }

    // Default response for other questions
    return "That's a great question. Let me think about this systematically. Based on my experience, I would approach this by first understanding the core requirements and constraints. I'd then evaluate different solutions, considering factors like scalability, maintainability, and user impact. I believe in data-driven decision making, so I'd also look at relevant metrics and feedback to guide the best path forward.";
  };

  // World-class futuristic design - no particle animations needed

  return (
    <div className="relative h-[var(--app-height)] overflow-hidden overflow-x-hidden bg-background" style={{ overscrollBehavior: 'none' }}>
      {user && !authLoading && (
        <Dialog open={bridgeSettingsOpen} onOpenChange={setBridgeSettingsOpen}>
          <DialogContent
            className="w-[calc(100vw-2rem)] sm:max-w-[450px] p-0 border-none bg-transparent"
            aria-describedby="bridge-settings-description"
          >
            {/* ApiKeySettings renders its own visual heading, so these are for
                assistive tech only. Radix warns without them and, more to the
                point, a screen reader otherwise announces an unlabelled dialog
                on the screen where users enter API keys. */}
            <DialogTitle className="sr-only">Bridge Settings</DialogTitle>
            <DialogDescription id="bridge-settings-description" className="sr-only">
              Connect your own Groq or Gemini API key.
            </DialogDescription>
            <ApiKeySettings />
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog
        open={destructiveConfirmOpen}
        onOpenChange={(open) => {
          if (!open) closeDestructiveConfirm();
          else setDestructiveConfirmOpen(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{destructiveConfirmConfig?.title || "Are you sure?"}</AlertDialogTitle>
            <AlertDialogDescription>{destructiveConfirmConfig?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {destructiveConfirmConfig?.requireAckLabel ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id="destructive-confirm-ack"
                checked={destructiveConfirmAck}
                onCheckedChange={(v) => setDestructiveConfirmAck(!!v)}
                disabled={destructiveConfirmBusy}
              />
              <Label
                htmlFor="destructive-confirm-ack"
                className="text-sm text-muted-foreground leading-tight cursor-pointer"
              >
                {destructiveConfirmConfig.requireAckLabel}
              </Label>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={destructiveConfirmBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={
                destructiveConfirmBusy ||
                !destructiveConfirmConfig ||
                (!!destructiveConfirmConfig?.requireAckLabel && !destructiveConfirmAck)
              }
              onClick={(e) => {
                e.preventDefault();
                void runDestructiveConfirm();
              }}
            >
              {destructiveConfirmBusy ? "Working..." : destructiveConfirmConfig?.confirmLabel || "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* World-Class Futuristic Background - Glassmorphism + Gradient Mesh */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Primary gradient mesh */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background" />

        {/* Sophisticated gradient orbs - Always visible with theme-appropriate opacity */}
        <div className="absolute -top-20 -right-20 sm:-top-40 sm:-right-40 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-gradient-to-br from-blue-500/[0.07] via-cyan-500/[0.05] to-transparent rounded-full blur-3xl dark:opacity-100 opacity-0 transition-opacity duration-300 animate-float-slow" />
        <div className="absolute -bottom-20 -left-20 sm:-bottom-40 sm:-left-40 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-gradient-to-tr from-violet-500/[0.07] via-purple-500/[0.05] to-transparent rounded-full blur-3xl dark:opacity-100 opacity-0 transition-opacity duration-300 animate-float-slower" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] bg-gradient-to-r from-indigo-500/[0.04] via-transparent to-cyan-500/[0.04] rounded-full blur-3xl dark:opacity-100 opacity-0 transition-opacity duration-300" />

        {/* Subtle grid pattern overlay for tech feel */}
        <div className="absolute inset-0 dark:opacity-100 opacity-0 transition-opacity duration-300" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.02) 1px, transparent 0)', backgroundSize: '40px 40px' }} />

        {/* Light mode elegant gradient - Always rendered */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/40 via-transparent to-purple-50/30 dark:opacity-0 opacity-100 transition-opacity duration-300" />
        <div className="absolute top-1/4 right-1/4 w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] bg-gradient-to-br from-blue-400/15 via-cyan-300/8 to-transparent rounded-full blur-3xl dark:opacity-0 opacity-100 transition-opacity duration-300 animate-float-slow" />
        <div className="absolute bottom-1/4 left-1/4 w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] bg-gradient-to-tr from-violet-400/15 via-purple-300/8 to-transparent rounded-full blur-3xl dark:opacity-0 opacity-100 transition-opacity duration-300 animate-float-slower" />
      </div>

      {/* Premium Install Notification Banner */}
      <AnimatePresence>
        {showInstallBanner && canPrompt && deferredPrompt && (
          <div
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm pointer-events-auto"
            onClick={() => {
              setShowInstallBanner(false);
              try {
                window.localStorage.setItem('pwa_install_banner_dismissed_until', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
              } catch {
                // ignore
              }
            }}
          >
            <div className="bg-primary/10 backdrop-blur-xl border border-primary/20 rounded-2xl p-4 shadow-2xl shadow-primary/20 flex items-center gap-4 animate-in fade-in zoom-in slide-in-from-top-4 duration-500">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-foreground">Install Stratax AI</h4>
                <p className="text-[11px] text-muted-foreground leading-tight">Get a faster, native experience with offline access.</p>
              </div>
              <Button
                size="sm"
                className="h-8 rounded-lg font-bold shadow-md shadow-primary/20"
                onClick={async (e) => {
                  e.stopPropagation();
                  setShowInstallBanner(false);
                  const outcome = await promptInstall();
                  if (outcome === 'accepted') {
                    toast({ title: 'Installed', description: 'Stratax AI is now available on your device.' });
                  } else if (outcome === 'dismissed') {
                    toast({ title: 'Install dismissed', description: 'You can install later from the menu.' });
                  }
                }}
              >
                Install
              </Button>
            </div>
          </div>
        )}
      </AnimatePresence>


      {/* Gradient Overlays - Only visible in dark mode (pro grey + subtle color touch) */}
      <div className="absolute inset-0 hidden dark:block bg-gradient-to-br dark:from-zinc-900/55 dark:via-zinc-950/70 dark:to-slate-950/60 pointer-events-none" />
      <div className="absolute inset-0 hidden dark:block bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
      <div className="absolute inset-0 hidden dark:block bg-gradient-to-t from-transparent via-white/[0.02] to-white/[0.035] pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-96 h-96 hidden dark:block dark:bg-indigo-500/10 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 hidden dark:block dark:bg-cyan-500/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Key Status Badge - Only shown when key is missing */}
      {!hasApiKey && (
        <div
          className={`fixed top-20 left-4 z-40 ${isInterviewSessionLive ? "md:left-4" : isDesktopSidebarOpen ? "md:left-72" : "md:left-16"}`}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md transition-all duration-500 bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-[0_0_158px_-5px_rgba(245,158,11,0.3)]">
            <Key className="w-3 h-3 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-[0.1em]">
              Key Entry Required
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full w-full overflow-hidden">
        {/* Mobile Header - Minimal and Transparent */}
        <div className="md:hidden sticky top-0 z-50 bg-transparent pointer-events-none">
          <div className="flex items-center justify-between px-4 py-3 pointer-events-auto">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-10 p-0 hover:bg-white/10 touch-manipulation"
                onClick={() => setIsMobileSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex items-center gap-1">
              {!authLoading && (
                user ? (
                  null
                ) : (
                  <>
                    <Badge variant="outline" className="hidden xs:inline-flex text-[10px] px-2 py-1">
                      Guest mode
                    </Badge>
                    <Link to="/login?mode=signin">
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/login?mode=signup">
                      <Button size="sm" className="h-8 px-2 text-xs">
                        Sign Up
                      </Button>
                    </Link>
                  </>
                )
              )}
              {user && !authLoading && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 w-8 p-0 hover:bg-white/10 ${!hasApiKey ? 'bg-amber-500/10 text-amber-500' : ''}`}
                  onClick={() => setBridgeSettingsOpen(true)}
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-[100] bg-gray-900/60 backdrop-blur-sm dark:bg-black/60" onClick={() => setIsMobileSidebarOpen(false)}>
            <div
              className="fixed left-0 top-0 bottom-0 w-80 max-w-[85vw] h-full bg-background border-r border-border shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile Sidebar Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <StrataxMark className="w-8 h-8 rounded-lg shrink-0" />
                  <div className="text-sm font-bold">Stratax AI</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  aria-label="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Mobile Sidebar Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
                <div className="px-4 py-6 space-y-8">
                  {/* View Selection */}
                  <div>
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4 px-2">Navigation</h3>
                    <div className="space-y-1">
                      {[
                        { id: "answer", label: "AI Copilot", icon: MessageSquare },
                        { id: "mock-interview", label: "Mock Interview", icon: HistoryIcon },
                        { id: "practice", label: "Live Practice", icon: RefreshCw },
                      ].map((item) => (
                        <Button
                          key={item.id}
                          variant="ghost"
                          onClick={() => {
                            setActiveMainTab(item.id as any);
                            setIsMobileSidebarOpen(false);
                          }}
                          className={`w-full justify-start h-10 px-3 gap-3 rounded-xl transition-all ${activeMainTab === item.id
                            ? "bg-primary/10 text-primary font-bold"
                            : "text-muted-foreground hover:bg-muted/50"
                            }`}
                        >
                          <item.icon className="h-4 w-4" />
                          <span className="text-sm">{item.label}</span>
                        </Button>
                      ))}
                      {/* Code Runner Link */}
                      <Link to="/run" onClick={() => setIsMobileSidebarOpen(false)}>
                        <Button
                          variant="ghost"
                          className="w-full justify-start h-10 px-3 gap-3 rounded-xl transition-all text-muted-foreground hover:bg-muted/50"
                        >
                          <Code2 className="h-4 w-4" />
                          <span className="text-sm">Code Runner</span>
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* New Chat Button - Only for AI Copilot */}
                  {activeMainTab === "answer" && (
                    <div className="px-2">
                      <Button
                        variant="outline"
                        onClick={handleNewChat}
                        disabled={isCreatingSession}
                        className="w-full justify-start h-10 px-3 gap-3 rounded-xl bg-primary/5 hover:bg-primary/10 text-primary font-medium border-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isCreatingSession ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        <span className="text-sm">{isCreatingSession ? "Creating..." : "New Chat"}</span>
                      </Button>
                    </div>
                  )}

                  {/* Context-Aware History */}
                  <div>
                    <div className="flex items-center justify-between px-2 mb-4">
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                        {activeMainTab === "mock-interview" ? "Mock History" : "Answer History"}
                      </h3>
                    </div>

                    <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                      {/* AI Copilot History - Show current conversation only */}
                      {activeMainTab === "answer" && (
                        history?.items?.length ? (
                          <div className="space-y-1">
                            {/* Show current session as ONE item */}
                            <div
                              onClick={() => {
                                // Already viewing current conversation - do nothing or scroll to top
                                setViewingHistory(false);
                                setShowAnswer(true);
                                setIsMobileSidebarOpen(false);
                              }}
                              className="group relative flex items-center gap-3 p-3 rounded-xl bg-primary/10 cursor-pointer transition-all border border-primary/20"
                            >
                              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                <MessageSquare className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0 pr-8">
                                <div className="text-xs font-medium line-clamp-1 opacity-90">
                                  {(() => {
                                    const currentSession = Array.isArray(sessions) ? sessions.find(s => s.session_id === sessionId) : null;
                                    return currentSession?.custom_title || currentSession?.title || (history?.items && history.items[history.items.length - 1]?.question) || "New Chat";
                                  })()}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {history?.items?.length || 0} message{(history?.items?.length || 0) !== 1 ? 's' : ''}
                                </div>
                              </div>
                              {/* Mobile Actions Dropdown */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-primary"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation();
                                    const currentSession = Array.isArray(sessions) ? sessions.find(s => s.session_id === sessionId) : null;
                                    if (currentSession) handleCopySession(currentSession);
                                    setIsMobileSidebarOpen(false);
                                  }}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    <span>Copy</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const currentSession = Array.isArray(sessions) ? sessions.find(s => s.session_id === sessionId) : null;
                                      if (currentSession) handleExportPdfSession(currentSession);
                                      setIsMobileSidebarOpen(false);
                                    }}
                                    disabled={isExportingPdf}
                                  >
                                    {isExportingPdf && exportingSessionId === sessionId ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <Download className="h-4 w-4 mr-2" />
                                    )}
                                    <span>{isExportingPdf && exportingSessionId === sessionId ? "Exporting..." : "Export PDF"}</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation();
                                    const currentSession = Array.isArray(sessions) ? sessions.find(s => s.session_id === sessionId) : null;
                                    setEditingSessionId(sessionId);
                                    setNewSessionTitle(currentSession?.custom_title || currentSession?.title || (history?.items && history.items[history.items.length - 1]?.question) || "");
                                    setIsMobileSidebarOpen(false);
                                  }}>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    <span>Rename</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setIsMobileSidebarOpen(false);
                                      openDeleteConversationDialog(sessionId);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    <span>Delete</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ) : <div className="px-2 py-4 text-xs text-muted-foreground/60 text-center italic">No messages yet</div>
                      )}


                      {/* Mock Interview History */}
                      {activeMainTab === "mock-interview" && (
                        mockInterviewSessions.length > 0 ? (
                          <div className="space-y-1">
                            {mockInterviewSessions.map((session) => (
                              <div
                                key={session.session_id}
                                onClick={() => {
                                  handleSelectMockSession(session);
                                  setIsMobileSidebarOpen(false);
                                }}
                                className="group relative flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 cursor-pointer transition-all duration-200 border border-transparent hover:border-border/30 hover:shadow-sm"
                              >
                                <div className="p-2 rounded-lg bg-primary/5 text-primary">
                                  <HistoryIcon className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex-1 min-w-0 pr-8">
                                  <div className="text-xs font-medium line-clamp-1 opacity-90">
                                    {session.interview_type ? session.interview_type.replace('_', ' ') : 'Mock Interview'} · {session.difficulty || 'Medium'}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                                    <span>{session.started_at ? new Date(session.started_at).toLocaleDateString() : 'Recent'}</span>
                                    <span>•</span>
                                    <span>{session.questions_answered || 0}/{session.total_questions || 0} Qs</span>
                                  </div>
                                </div>
                                <button
                                  className="absolute right-2 top-3 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMockInterviewSession(session.session_id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : <div className="px-2 py-4 text-xs text-muted-foreground/60 text-center italic">No interview history</div>
                      )}
                    </div>
                  </div>

                  {/* Install Option */}
                  {!isStandalone && (
                    <div className="pt-4 border-t border-border/40">
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          if (canPrompt) {
                            const outcome = await promptInstall();
                            if (outcome === 'accepted') {
                              toast({ title: 'Installed', description: 'Stratax AI is now available on your device.' });
                            } else if (outcome === 'dismissed') {
                              toast({ title: 'Install dismissed', description: 'You can install later from the menu.' });
                            }
                            return;
                          }

                          toast({
                            title: 'Install on this device',
                            description: installHelpText,
                          });
                        }}
                        className="w-full justify-start h-10 px-3 gap-3 rounded-xl text-primary font-bold hover:bg-primary/5"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span className="text-sm">Install Stratax AI</span>
                      </Button>
                      {!canPrompt && (
                        <div className="mt-2 px-3 text-[10px] leading-relaxed text-muted-foreground">
                          {installHelpText}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile Sidebar Footer */}
              {user && !authLoading && (
                <div className="p-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <UserProfile
                      variant="sidebar"
                      showTier={false}
                      showEmailInTrigger={false}
                      onLogout={() => setIsMobileSidebarOpen(false)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Collapsed Sidebar Rail (Desktop) — hidden only while a session runs */}
        {!isInterviewSessionLive && !isDesktopSidebarOpen && (
          <div className="hidden md:flex fixed left-0 top-0 bottom-0 w-14 border-r border-border bg-background/50 backdrop-blur-xl z-50">
            <div className="w-full flex flex-col items-center pt-3">
              <button
                type="button"
                onClick={() => setIsDesktopSidebarOpen(true)}
                aria-label="Show history sidebar"
                title="Show history"
                className="group relative h-10 w-10 rounded-xl border border-border bg-background/70 backdrop-blur-xl hover:bg-background/90 transition-colors flex items-center justify-center overflow-hidden"
              >
                <StrataxMark className="w-7 h-7 rounded-lg transition-opacity duration-150 group-hover:opacity-0" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <PanelLeft className="h-4 w-4" />
                </div>
              </button>
            </div>
          </div>
        )}
        <aside className={`hidden md:flex fixed left-0 top-0 bottom-0 w-64 border-r border-border bg-background/50 backdrop-blur-xl z-40 flex-col transition-transform duration-300 ${isInterviewSessionLive ? "md:hidden" : ""} ${isDesktopSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="px-3 py-2.5 border-b border-border/60">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StrataxMark className="w-7 h-7 rounded-lg shrink-0" />
                <h1 className="text-base font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent truncate">Stratax AI</h1>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setIsDesktopSidebarOpen(false)}
                title="Hide history"
                aria-label="Hide history sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Primary navigation — replaces the old top tab bar. */}
          <nav className="px-2 pt-2 pb-1 space-y-0.5">
            {MAIN_NAV_ITEMS.map((item) => {
              const isActive = activeMainTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleMainTabChange(item.id)}
                  disabled={practiceScreenShareLock && item.id !== "practice"}
                  aria-current={isActive ? "page" : undefined}
                  className={`${SIDEBAR_ROW} ${isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground font-medium"
                    }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/*
           * Utilities — the actions that used to sit in the top bar, grouped
           * with navigation rather than pinned to the bottom so every
           * destination in the app reads as one list.
           */}
          <div className="px-2 pt-1 pb-2 border-b border-border/50 space-y-0.5">
            {user && !authLoading && (
              <button
                type="button"
                disabled={practiceScreenShareLock}
                onClick={() => setBridgeSettingsOpen(true)}
                className={`${SIDEBAR_ROW} font-medium ${!hasApiKey
                  ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
              >
                <Settings className="h-4 w-4 shrink-0" />
                <span className="truncate">{hasApiKey ? "Bridge Settings" : "Connect AI Bridge"}</span>
              </button>
            )}

            <Link to="/run" onClick={guardWhileLive('Run Code')}>
              <button
                type="button"
                disabled={practiceScreenShareLock}
                className={`${SIDEBAR_ROW} font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground`}
              >
                <Code2 className="h-4 w-4 shrink-0" />
                <span className="truncate">Run Code</span>
              </button>
            </Link>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">

                {/* New Chat Button - Moved to top for better UX */}
                <div className="px-2 py-2 border-b border-border/40">
                  <Button
                    variant="outline"
                    onClick={handleNewChat}
                    disabled={isCreatingSession}
                    className="w-full justify-center h-9 px-3 gap-2 rounded-lg bg-primary/5 hover:bg-primary/10 text-primary font-medium border-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isCreatingSession ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span className="text-sm">{isCreatingSession ? "Creating..." : "New Chat"}</span>
                  </Button>
                </div>

                {/* Sessions */}
                <div className="px-3 pt-2.5 pb-1.5">
                  <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">Previous Sessions</h2>
                </div>
                <div className="px-2 overflow-y-auto max-h-[34vh]">
                  {Array.isArray(sessions) && sessions.length ? (
                    <ul className="space-y-1 pr-2">
                      {sessions
                        .filter(s => s.session_id !== sessionId)
                        .map((s) => (
                          <li key={s.session_id} className="group">
                            <div className="flex items-center gap-1 group">
                              {editingSessionId === s.session_id ? (
                                <div className="flex-1 flex items-center gap-1 px-2 py-1">
                                  <input
                                    autoFocus
                                    className="flex-1 bg-background border border-primary/30 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                                    value={newSessionTitle}
                                    onChange={(e) => setNewSessionTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleUpdateSessionTitle(s.session_id, newSessionTitle);
                                      if (e.key === 'Escape') setEditingSessionId(null);
                                    }}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-primary hover:bg-primary/10"
                                    onClick={() => handleUpdateSessionTitle(s.session_id, newSessionTitle)}
                                    disabled={isRenaming}
                                  >
                                    {isRenaming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground"
                                    onClick={() => setEditingSessionId(null)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    className="flex-1 min-w-0 text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors overflow-hidden"
                                    onClick={() => {
                                      if (practiceScreenShareLock) {
                                        toast({
                                          title: 'Screen sharing is active',
                                          description: 'Finish Live Practice before switching views.',
                                        });
                                        return;
                                      }
                                      setAnswer("");
                                      setQuestion("");
                                      setViewingHistory(true);

                                      // Only clear and reload when actually changing
                                      // session. The history effect keys off sessionId,
                                      // so clearing it for a re-click on the session
                                      // already open would blank the pane with nothing
                                      // to trigger a refetch.
                                      if (s.session_id !== sessionId) {
                                        // lastQuestion was left holding the previous
                                        // chat's question. showAnswer flips true right
                                        // away, so the outgoing conversation's card
                                        // stayed on screen until history arrived - the
                                        // brief flash of the wrong chat. Worse, the
                                        // persist effect below runs on the sessionId
                                        // change and would write that stale question
                                        // into the newly selected session's last-view.
                                        setLastQuestion("");
                                        setStuckOffer(null);
                                        setHistory(null);
                                        // Setting sessionId is all that is needed: the
                                        // effect loads this session, hydrating from the
                                        // per-session cache first. This handler used to
                                        // fetch as well, so every click issued two
                                        // identical requests and the slower response -
                                        // for whichever session it belonged to - won.
                                        setSessionId(s.session_id);
                                        try { window.localStorage.setItem("ia_session_id", s.session_id); } catch { }
                                      }

                                      // Switch to Copilot tab if not already there
                                      setActiveMainTab("answer");
                                      setShowAnswer(true);
                                    }}
                                  >
                                    <div className="text-sm font-medium truncate max-w-[180px]">
                                      {s?.custom_title || s?.title || s?.session_id || "Untitled Session"}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground flex items-center gap-2 truncate">
                                      <span>{s?.last_update ? new Date(s.last_update).toLocaleDateString() : "Recent"}</span>
                                      <span>•</span>
                                      <span>{s?.qna_count || 0} QnA</span>
                                    </div>
                                  </button>
                                  <div className="flex items-center">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                                        >
                                          <MoreVertical className="h-3.5 w-3.5" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-40">
                                        <DropdownMenuItem onClick={() => handleCopySession(s)}>
                                          <Copy className="h-4 w-4 mr-2" />
                                          <span>Copy</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleExportPdfSession(s)}
                                          disabled={isExportingPdf}
                                        >
                                          {exportingSessionId === s.session_id ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          ) : (
                                            <Download className="h-4 w-4 mr-2" />
                                          )}
                                          <span>{exportingSessionId === s.session_id ? "Exporting..." : "Export PDF"}</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                          setEditingSessionId(s.session_id);
                                          setNewSessionTitle(s.custom_title || s.title || "");
                                        }}>
                                          <Edit2 className="h-4 w-4 mr-2" />
                                          <span>Rename</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            openDeleteConversationDialog(s.session_id);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4 mr-2" />
                                          <span>Delete</span>
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>


                {/* Current History */}
                <div className="px-3 pt-2.5 pb-1.5">
                  <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">Current Conversation</h2>
                </div>
                <div className="px-2 overflow-y-auto mb-1 max-h-[50vh] flex-1">
                  {history?.items?.length ? (
                    <ul className="space-y-1 pr-2">
                      {/* Show current session as ONE item */}
                      <li className="group" data-history-item>
                        {editingSessionId === sessionId ? (
                          <div className="flex items-center gap-1 px-2 py-2 bg-primary/10 border border-primary/20 rounded-md">
                            <input
                              autoFocus
                              className="flex-1 bg-background border border-primary/30 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                              value={newSessionTitle}
                              onChange={(e) => setNewSessionTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateSessionTitle(sessionId, newSessionTitle);
                                if (e.key === 'Escape') setEditingSessionId(null);
                              }}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary hover:bg-primary/10"
                              onClick={() => handleUpdateSessionTitle(sessionId, newSessionTitle)}
                              disabled={isRenaming}
                            >
                              {isRenaming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              onClick={() => setEditingSessionId(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            className="relative rounded-md bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors cursor-pointer group"
                            onClick={() => {
                              // Already viewing current conversation
                              setViewingHistory(false);
                              setShowAnswer(true);
                              try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { }
                            }}
                          >
                            {/* Content */}
                            <div className="flex items-center justify-between px-3 py-2">
                              <div className="min-w-0 flex-1 pr-2">
                                <div className="text-xs font-medium truncate max-w-[160px]">
                                  {(() => {
                                    const currentSession = Array.isArray(sessions) ? sessions.find(s => s.session_id === sessionId) : null;
                                    return currentSession?.custom_title || currentSession?.title || (history?.items && history.items[history.items.length - 1]?.question) || "New Chat";
                                  })()}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                  {history?.items?.length || 0} message{(history?.items?.length || 0) !== 1 ? 's' : ''}
                                </div>
                              </div>
                              <div className="flex items-center">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                                    >
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem onClick={() => {
                                      const currentSession = Array.isArray(sessions) ? sessions.find(s => s.session_id === sessionId) : null;
                                      if (currentSession) handleCopySession(currentSession);
                                    }}>
                                      <Copy className="h-4 w-4 mr-2" />
                                      <span>Copy</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        const currentSession = Array.isArray(sessions) ? sessions.find(s => s.session_id === sessionId) : null;
                                        if (currentSession) handleExportPdfSession(currentSession);
                                      }}
                                      disabled={isExportingPdf}
                                    >
                                      {isExportingPdf && exportingSessionId === sessionId ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <Download className="h-4 w-4 mr-2" />
                                      )}
                                      <span>{isExportingPdf && exportingSessionId === sessionId ? "Exporting..." : "Export PDF"}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      const currentSession = Array.isArray(sessions) ? sessions.find(s => s.session_id === sessionId) : null;
                                      setEditingSessionId(sessionId);
                                      setNewSessionTitle(currentSession?.custom_title || currentSession?.title || (history?.items && history.items[history.items.length - 1]?.question) || "");
                                    }}>
                                      <Edit2 className="h-4 w-4 mr-2" />
                                      <span>Rename</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        openDeleteConversationDialog(sessionId);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      <span>Delete</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    </ul>
                  ) : (
                    <div className="px-4 text-xs text-muted-foreground">No history yet</div>
                  )}
                </div>
          </div>

          {/* Desktop Sidebar Footer */}
          {!authLoading && (
            user ? (
              <div className="p-2 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <UserProfile variant="sidebar" showTier={false} showEmailInTrigger={false} />
                </div>
              </div>
            ) : (
              <div className="p-2 border-t border-border/50 space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">Guest mode</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Link to="/login?mode=signin" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full h-8 text-xs">Sign In</Button>
                  </Link>
                  <Link to="/login?mode=signup" className="flex-1">
                    <Button size="sm" className="w-full h-8 text-xs">Sign Up</Button>
                  </Link>
                </div>
              </div>
            )
          )}
        </aside>

        {/* Main content area */}
        <div
          className={`flex-1 flex flex-col min-h-0 overflow-hidden overflow-x-hidden transition-all duration-300 ${isMobileSidebarOpen ? "overflow-hidden" : ""} ${isInterviewSessionLive ? "md:pl-0" : isDesktopSidebarOpen ? "md:pl-64" : "md:pl-14"}`}
        >
          <Tabs
            value={activeMainTab}
            onValueChange={handleMainTabChange}
            className="flex-1 flex flex-col min-h-0"
          >

            {/* Content Section */}
            <div ref={mainScrollRef} className={`ia-main-scroll flex-1 overflow-y-auto overflow-x-hidden scroll-professional px-3 py-2 md:px-6 md:py-6 ${activeMainTab !== "answer" ? "hidden" : ""} ${showBottomSearchBar ? "pb-40 md:pb-44 ia-main-scroll-footer" : ""
              }`} style={{ scrollbarGutter: 'stable', overscrollBehaviorX: 'none', WebkitOverflowScrolling: 'touch' }}>
              <div className="max-w-4xl mx-auto w-full overflow-x-hidden">

                <TabsContent value="answer" className="mt-0 overflow-x-hidden">
                  {showAnswer || isGenerating ? (
                    <div className="space-y-6 pb-4">
                      {/* Render all Q&As from history as a conversation thread */}
                      {[...(history?.items || [])].reverse().map((item, idx, arr) => {
                        // The array is reversed to show Oldest -> Newest (top to bottom)
                        // In this layout, the very bottom item is the most recent.
                        const isLatest = idx === arr.length - 1;
                        const itemMode = (item as any)?.mode as (CopilotMode | undefined);
                        const isMirrorItem = itemMode === "mirror";
                        return (
                          <div
                            key={item.created_at || `idx-${idx}`}
                            ref={isLatest ? activeQuestionRef : null}
                            className="space-y-3 scroll-mt-24"
                          >
                            <div className="flex justify-end pr-3 md:pr-0">
                              <div className="max-w-[80%] md:max-w-[70%] space-y-2">
                                {/* File attachment chip in message bubble */}
                                {item.attachment && (
                                  <div className="flex justify-end">
                                    <div className="inline-flex items-center gap-3 bg-muted/50 border border-border/50 rounded-xl px-3 py-2.5 shadow-sm">
                                      <div className="w-9 h-9 rounded-lg bg-red-500/90 flex items-center justify-center flex-shrink-0">
                                        <FileText className="h-4 w-4 text-white" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{item.attachment.name}</p>
                                        <p className="text-xs text-muted-foreground">{ext(item.attachment.name)}</p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
                                  <p className="text-sm md:text-base">{item.question}</p>
                                </div>
                              </div>
                            </div>

                            <div>
                              {/* 🏗️ Architecture Mode Choice UI */}
                              {isLatest && isGenerating && !showArchitectureChoice && (!item.answer || item.answer === GENERATING_PLACEHOLDER) ? (
                                <div className="w-full border-0 bg-transparent shadow-none mx-0 md:mx-0">
                                  <div className="pl-2 pr-3 md:px-6 py-2">
                                    <div className="flex items-center gap-2 mb-3">
                                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                      <span className="text-sm font-medium text-muted-foreground">
                                        Generating response<LoadingDots />
                                      </span>
                                    </div>
                                    <div className="space-y-3 py-2 animate-in fade-in duration-500">
                                      <div className="h-4 bg-muted/40 rounded-full w-[90%] animate-pulse" />
                                      <div className="h-4 bg-muted/40 rounded-full w-3/4 animate-pulse" />
                                      <div className="h-4 bg-muted/30 rounded-full w-[85%] animate-pulse" />
                                      <div className="h-4 bg-muted/40 rounded-full w-2/3 animate-pulse" />
                                      <div className="h-4 bg-muted/30 rounded-full w-[70%] animate-pulse" />
                                      <div className="h-4 bg-muted/40 rounded-full w-1/2 animate-pulse" />
                                      <div className="h-4 bg-muted/30 rounded-full w-[60%] animate-pulse" />
                                      <div className="h-4 bg-muted/40 rounded-full w-3/4 animate-pulse" />
                                    </div>
                                  </div>
                                </div>
                              ) : isLatest && showArchitectureChoice && item.question === pendingArchitectureQuestion ? (
                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-2xl p-6 shadow-lg border border-blue-200/50 dark:border-blue-800/50">
                                  <div className="text-center space-y-4 mb-6">
                                    <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl">
                                      <Sparkles className="h-6 w-6 text-primary" />
                                    </div>
                                    <h3 className="text-xl font-bold text-foreground">
                                      Choose Your Architecture Format
                                    </h3>
                                    <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                                      Select how you'd like to visualize your system design
                                    </p>
                                  </div>

                                  <div className="grid md:grid-cols-2 gap-4">
                                    {(architectureChoicePayload?.options || []).map((opt) => {
                                      const isDefault = opt.id === architectureChoicePayload?.default;
                                      const isMulti = opt.id === 'multi-view';
                                      const cardClass = isDefault
                                        ? 'group relative bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-xl p-6 border-2 border-primary/30 hover:border-primary hover:shadow-xl transition-all duration-300 text-left disabled:opacity-50 disabled:cursor-not-allowed'
                                        : 'group relative bg-white dark:bg-gray-900 rounded-xl p-6 border-2 border-gray-200 dark:border-gray-700 hover:border-primary hover:shadow-xl transition-all duration-300 text-left disabled:opacity-50 disabled:cursor-not-allowed';

                                      return (
                                        <button
                                          key={opt.id}
                                          onClick={() => handleArchitectureModeSelection(opt.id as 'single' | 'multi-view')}
                                          disabled={isGenerating}
                                          className={cardClass}
                                        >
                                          <div className={`absolute top-4 right-4 w-10 h-10 rounded-full ${isDefault ? 'bg-primary/20' : 'bg-primary/10'} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                            <span className="text-2xl">{isMulti ? '🎯' : '📊'}</span>
                                          </div>
                                          <div className="pr-12">
                                            <div className="flex items-center gap-2 mb-2">
                                              <h4 className="text-lg font-bold text-foreground">
                                                {opt.label}
                                              </h4>
                                              {isDefault && (
                                                <span className="text-xs font-semibold px-2 py-0.5 bg-primary text-primary-foreground rounded-full">
                                                  Recommended
                                                </span>
                                              )}
                                            </div>
                                            {opt.description && (
                                              <p className="text-sm text-muted-foreground">
                                                {opt.description}
                                              </p>
                                            )}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <AnswerCard
                                  answer={item.answer}
                                  question=""
                                  id={item.created_at || `idx-${idx}`}
                                  mode={itemMode}
                                  streaming={isLatest && streaming}
                                  evaluationAllowed={isLatest && evaluationAllowed}
                                  evaluationReason={isLatest ? evaluationReason : null}
                                  onEdit={undefined}
                                  onSubmitEdit={undefined}
                                  canPrev={false}
                                  canNext={false}
                                  isGenerating={isLatest && isGenerating}
                                  versionIndex={1}
                                  versionTotal={1}
                                  onShowUpgrade={() => setShowUpgradeBanner(true)}
                                />
                              )}
                              {/* A generated question set. `answer` above is only a
                                  one-line preamble; the questions themselves come
                                  from the turn's stored payload, which is why this
                                  survives a refresh. */}
                              {(() => {
                                const cards = questionCardsPayload({
                                  ui_action: (item as any)?.meta?.ui_action,
                                  ui_payload: (item as any)?.meta?.ui_payload,
                                });
                                if (!cards) return null;
                                return (
                                  <div className="pl-2 pr-3 md:px-6 pt-1 pb-2">
                                    <QuestionCards
                                      query={cards.query}
                                      questions={cards.questions}
                                      onAskAbout={handleAskAboutQuestion}
                                      onPractise={handlePractiseQuestion}
                                    />
                                  </div>
                                );
                              })()}
                              {/* Make the copilot's navigation advice actionable.
                                  Only on the settled latest answer: mid-stream the
                                  text is incomplete, so chips would flicker in and
                                  out as sentences complete. */}
                              {isLatest && !streaming && !isGenerating && item.answer && (
                                <CopilotFeatureNav
                                  answer={item.answer}
                                  onNavigate={handleCopilotNavigate}
                                />
                              )}
                              {isLatest && !streaming && !isGenerating && stuckOffer && (
                                <CopilotStuckNudge
                                  message={stuckOffer.message}
                                  feature={stuckOffer.feature}
                                  onAccept={(f) => {
                                    setStuckOffer(null);
                                    handleCopilotNavigate(f);
                                  }}
                                  onDismiss={() => setStuckOffer(null)}
                                />
                              )}
                              {/* Only when nothing more urgent is on screen. The stuck
                                  nudge is a response to evidence the user is struggling;
                                  this is a general invitation, and stacking both would
                                  read as pestering. Mirror answers are already the
                                  exercise, so they are excluded. */}
                              {isLatest && !streaming && !isGenerating && !stuckOffer &&
                                !rehearsalDismissed && itemMode !== "mirror" && item.answer && (
                                <TryItYourselfPrompt
                                  question={item.question}
                                  answer={item.answer}
                                  onAccept={() => {
                                    setPendingMirrorQuestion(item.question);
                                    setMirrorUserAnswer("");
                                    setMirrorDialogOpen(true);
                                  }}
                                  onDismiss={() => setRehearsalDismissed(true)}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center min-h-[40vh] md:min-h-[60vh] px-4 py-6 animate-in fade-in zoom-in duration-700">
                      <div className="w-full max-w-2xl space-y-6">
                        {/* Welcome Header */}
                        <div className="text-center space-y-4 mb-8">
                          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl mb-4">
                            <MessageSquare className="h-8 w-8 text-primary" />
                          </div>
                          <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                            What can I help with?
                          </h2>
                          <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto">
                            Ask your interview question and get comprehensive responses with examples.
                          </p>
                        </div>

                        {/* Centered Search Bar */}
                        <div className="space-y-2">
                          {/* Pending file attachment chip */}
                          {pendingAttachment && (
                            <div className="flex items-center">
                              <div className="inline-flex items-center gap-3 bg-muted/60 border border-border/60 rounded-xl px-3 py-2.5 shadow-sm max-w-xs">
                                <div className="w-9 h-9 rounded-lg bg-red-500/90 flex items-center justify-center flex-shrink-0">
                                  <FileText className="h-4 w-4 text-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground truncate">{pendingAttachment.name}</p>
                                  <p className="text-xs text-muted-foreground">{ext(pendingAttachment.name)}</p>
                                </div>
                                <button
                                  onClick={() => { setPendingAttachment(null); setLastUploadedProfile(null); }}
                                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <XCircle className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="flex items-end gap-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  disabled={isUploadingProfile}
                                  className="h-12 w-12 rounded-2xl border-primary/20 bg-background/95 backdrop-blur-xl hover:bg-primary/5 text-primary transition-all shrink-0"
                                  title="Actions"
                                >
                                  {isUploadingProfile ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                  ) : (
                                    <Plus className="h-6 w-6" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-56">
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    handleProfileUploadClick();
                                  }}
                                >
                                  Upload Resume/Profile
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>Mode</DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                  value={questionMode}
                                  onValueChange={(v) => setQuestionMode(v as CopilotMode)}
                                >
                                  <DropdownMenuRadioItem value="answer">Answer</DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="mirror">Mirror (Feedback)</DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="questions">Practice Questions</DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                  Mirror Mode: enter the question, then paste your draft answer for critique + a stronger rewrite. Practice Questions: enter a topic and get a set of interview questions with answers.
                                </div>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <div className="flex-1">
                              <SearchBar
                                value={question}
                                onChange={(v) => {
                                  if (viewingHistory) setViewingHistory(false);
                                  setQuestion(v);
                                }}
                                placeholder="Ask anything..."
                                resetToken={resetToken}
                                ensureSession={ensureSession}
                                onGenerate={handleGenerateAnswer}
                                isGenerating={isGenerating}
                                canGenerate={!viewingHistory}
                                mode={questionMode}
                                onModeSelect={(next) => setQuestionMode(next)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Quick suggestions */}
                        <div className="flex flex-wrap gap-2 justify-center pt-4 pb-6">
                          <span className="px-4 py-2 bg-primary/5 hover:bg-primary/10 text-primary text-sm font-medium rounded-full cursor-pointer transition-colors"
                            onClick={() => setQuestion("Explain the difference between REST and GraphQL")}
                          >
                            REST vs GraphQL
                          </span>
                          <span className="px-4 py-2 bg-primary/5 hover:bg-primary/10 text-primary text-sm font-medium rounded-full cursor-pointer transition-colors"
                            onClick={() => setQuestion("How do I implement authentication in React?")}
                          >
                            React Authentication
                          </span>
                          <span className="px-4 py-2 bg-primary/5 hover:bg-primary/10 text-primary text-sm font-medium rounded-full cursor-pointer transition-colors"
                            onClick={() => setQuestion("What are design patterns?")}
                          >
                            Design Patterns
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Right-side popover for history item actions */}
                {openMenuIndex !== null && menuPos && (
                  <div
                    data-right-popover
                    className="fixed w-40 bg-popover border border-border rounded-md shadow-lg z-50"
                    style={{ top: menuPos.top, left: menuPos.left }}
                  >
                    <button
                      className="w-full text-left px-3 py-2 text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (openMenuIndex !== null) handleDeleteHistory(openMenuIndex);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Mock Interview fills its column outright rather than guessing at
                a viewport offset, which is what left a band of dead space
                beneath it once the top header was removed. */}
            <TabsContent
              value="mock-interview"
              className="mt-0 flex-1 min-h-0 overflow-hidden"
            >
              <MockInterviewMode
                selectedHistorySession={selectedMockSession}
                onHistoryUpdate={loadMockInterviewHistory}
              />
            </TabsContent>

            {/*
             * Live Practice is its own full-height surface, so it sits beside the
             * reading scroller rather than inside it. Cancelling that scroller's
             * padding with negative margins looked right at rest but left the top
             * strip above the scroll origin — unreachable, and the source of the
             * gap that reappeared whenever the page moved. Its own flex child has
             * no padding to fight.
             */}
            <TabsContent
              value="practice"
              className="mt-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide"
            >
              <PracticeMode />
            </TabsContent>
          </Tabs>
        </div>
      </div >

      {/* Fixed Search Bar at Bottom - Only show on Answer tab when conversation is active */}
      {
        showBottomSearchBar && (
          <div
            className={`ia-fixed-bottom fixed bottom-0 left-0 right-0 z-50 ${isDesktopSidebarOpen ? "md:left-64" : "md:left-14"}`}
          >
            <div className="relative">
              {/* Gradient fade to hide content behind */}
              <div className="absolute bottom-0 left-0 right-0 h-28 md:h-36 bg-gradient-to-t from-background from-35% via-background/90 via-60% to-transparent pointer-events-none -z-10" />

              {/* Search bar container */}
              <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:px-6 md:pb-6">
                <div className="max-w-4xl mx-auto space-y-2">
                  {/* Pending file attachment chip */}
                  {pendingAttachment && (
                    <div className="flex items-center">
                      <div className="inline-flex items-center gap-3 bg-muted/60 border border-border/60 rounded-xl px-3 py-2.5 shadow-sm max-w-xs">
                        <div className="w-9 h-9 rounded-lg bg-red-500/90 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-4 w-4 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{pendingAttachment.name}</p>
                          <p className="text-xs text-muted-foreground">{ext(pendingAttachment.name)}</p>
                        </div>
                        <button
                          onClick={() => { setPendingAttachment(null); setLastUploadedProfile(null); }}
                          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Upload status (no pending chip) */}
                  {!pendingAttachment && lastUploadedProfile && (
                    <div className="flex items-center justify-center">
                      <div className="bg-primary/5 dark:backdrop-blur-sm px-3 py-1 rounded-full border border-primary/10 flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <Check className="h-3 w-3 text-primary" />
                        <span className="text-[10px] md:text-xs text-muted-foreground font-medium">
                          Indexed: <span className="text-foreground">{lastUploadedProfile.name}</span> ({lastUploadedProfile.characters.toLocaleString()} chars)
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-end gap-2 md:gap-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={isUploadingProfile}
                          className="h-12 w-12 rounded-full border-primary/20 bg-background/95 dark:backdrop-blur-xl hover:bg-primary/5 text-primary transition-all shrink-0 shadow-sm"
                          title="Actions"
                        >
                          {isUploadingProfile ? (
                            <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
                          ) : (
                            <Plus className="h-5 w-5 md:h-6 md:w-6" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            handleProfileUploadClick();
                          }}
                        >
                          Upload Resume/Profile
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Mode</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={questionMode}
                          onValueChange={(v) => setQuestionMode(v as CopilotMode)}
                        >
                          <DropdownMenuRadioItem value="answer">Answer</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="mirror">Mirror (Feedback)</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="questions">Practice Questions</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          Mirror Mode: enter the question, then paste your draft answer for critique + a stronger rewrite. Practice Questions: enter a topic and get a set of interview questions with answers.
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex-1">
                      <SearchBar
                        value={question}
                        onChange={(v) => {
                          if (viewingHistory) setViewingHistory(false);
                          setQuestion(v);
                        }}
                        placeholder="Ask Stratax AI..."
                        resetToken={resetToken}
                        ensureSession={ensureSession}
                        onGenerate={handleGenerateAnswer}
                        isGenerating={isGenerating}
                        canGenerate={!viewingHistory}
                        mode={questionMode}
                        onModeSelect={(next) => setQuestionMode(next)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer text - FIXED at bottom - Hidden on mobile */}
              <div className="hidden md:block px-4 pb-1">
                <p className="text-center text-[8px] md:text-[10px] text-white/50 leading-tight">
                  Stratax AI can make mistakes. Verify important information and use as a learning aid.
                </p>
              </div>
            </div>
          </div>
        )
      }

      {/* Mirror Mode: collect candidate's draft answer */}
      <Dialog open={mirrorDialogOpen} onOpenChange={setMirrorDialogOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Mirror Mode</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste your draft answer and Stratax will critique it (clarity, structure, missing points) and suggest a stronger version.
            </p>
            <p className="text-sm text-muted-foreground">
              Paste your answer to analyze{pendingMirrorQuestion ? `: ${pendingMirrorQuestion}` : "."}
            </p>

            <div className="space-y-2">
              <Label htmlFor="mirror-user-answer">Your answer</Label>
              <Textarea
                id="mirror-user-answer"
                value={mirrorUserAnswer}
                onChange={(e) => setMirrorUserAnswer(e.target.value)}
                placeholder="Paste your draft answer here to analyze..."
                className="min-h-[200px]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setMirrorDialogOpen(false)}
                disabled={isGenerating}
              >
                Cancel
              </Button>
              <Button
                onClick={submitMirrorAnswer}
                disabled={isGenerating || !mirrorUserAnswer.trim()}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  "Analyze"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {showOnboardingTour && (
          <OnboardingOverlay
            open={showOnboardingTour}
            onComplete={handleOnboardingTourComplete}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showKeyOnboarding && (
          <BYOKOnboarding
            onComplete={handleApiKeySetupComplete}
          />
        )}
      </AnimatePresence>

      {/* Answer Engine Unlock Dialog */}
      <UnlockAnswerEngine
        open={showUnlockAnswerEngine}
        onClose={() => setShowUnlockAnswerEngine(false)}
        onUnlock={() => {
          // Refresh any state that depends on Gemini key
          setShowUnlockAnswerEngine(false);
        }}
      />

      <input
        ref={profileInputRef}
        type="file"
        accept=".pdf,.txt,.doc,.docx"
        className="hidden"
        onChange={handleProfileFileChange}
      />
    </div >
  );
};
