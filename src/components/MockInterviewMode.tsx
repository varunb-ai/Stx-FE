import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import {
  apiStartMockInterview,
  apiSubmitMockAnswer,
  apiGetSessionSummary,
  apiEndSession,
  apiGetSessionStatus,
  apiGetHint,
  apiGetProgress,
  type InterviewType,
  type Difficulty,
  type StartSessionResponse,
  type SubmitAnswerResponse,
  type SessionSummaryResponse,
  type SessionStatusResponse,
  type HintResponse,
  type ProgressResponse,
  type EndSessionResponse,
} from "@/lib/mockInterviewApi";
import { apiExecuteCode } from "@/lib/api";
import { StrataxApiError } from "@/lib/strataxClient";
import {
  Play,
  Mic,
  MicOff,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Award,
  Target,
  Lightbulb,
  ArrowRight,
  RotateCcw,
  Loader2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronDown,
  Maximize2,
  HelpCircle,
  Download,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { MonacoEditor } from "@/components/MonacoEditor";
import ResumeUpload from "./ResumeUpload";
import { loadSavedResumeContext } from "@/lib/resumeContextStorage";
import type { ResumeContext } from "../types/resume";

type SessionPhase = "setup" | "interview" | "feedback" | "summary" | "history";

function isSessionPhase(value: unknown): value is SessionPhase {
  return (
    value === "setup" ||
    value === "interview" ||
    value === "feedback" ||
    value === "summary" ||
    value === "history"
  );
}

function toStartQuestionFromStatus(status: SessionStatusResponse): StartSessionResponse["first_question"] | null {
  const q = status.current_question;
  if (!q?.question_id || !q?.question_text) return null;
  return {
    question_id: q.question_id,
    question_text: q.question_text,
    question_number: Math.max(1, Number(status.current_question_index || 0) + 1),
    difficulty: status.difficulty,
    topic: q.topic || "",
    interview_type: status.interview_type,
    total_questions: status.total_questions,
  };
}

interface MockInterviewModeProps {
  selectedHistorySession?: any;
  onHistoryUpdate?: () => void;
}

export const MockInterviewMode = ({ selectedHistorySession, onHistoryUpdate }: MockInterviewModeProps) => {
  const { toast } = useToast();

  // Resume-based interviewing — parsed resume context for claim-based probing
  const [resumeContext, setResumeContext] = useState<ResumeContext | null>(() => loadSavedResumeContext());

  const [submitErrorNotice, setSubmitErrorNotice] = useState<{ title: string; description: string } | null>(null);
  const {
    isListening,
    transcript,
    isSupported: isSpeechSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  // Session state
  const [phase, setPhase] = useState<SessionPhase>("setup");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId] = useState(() => {
    const stored = localStorage.getItem("mock_interview_user_id");
    if (stored) return stored;
    const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("mock_interview_user_id", newId);
    return newId;
  });

  // Setup form state
  const [interviewType, setInterviewType] = useState<InterviewType>("coding");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [numQuestions, setNumQuestions] = useState(5);
  const [topic, setTopic] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [whySetupOpen, setWhySetupOpen] = useState(false);

  // Interview state
  const [currentQuestion, setCurrentQuestion] = useState<StartSessionResponse["first_question"] | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [codeAnswer, setCodeAnswer] = useState("");
  const [language, setLanguage] = useState("python");
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Feedback state
  const [currentFeedback, setCurrentFeedback] = useState<SubmitAnswerResponse["evaluation"] | null>(null);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [evaluationTrace, setEvaluationTrace] = useState<SubmitAnswerResponse["evaluation_trace"] | null>(null);
  const [trajectory, setTrajectory] = useState<SubmitAnswerResponse["trajectory"] | null>(null);

  // Summary state
  const [summary, setSummary] = useState<SessionSummaryResponse | null>(null);
  const [endedEarlyData, setEndedEarlyData] = useState<EndSessionResponse | null>(null);

  // History state for previous questions
  const [questionHistory, setQuestionHistory] = useState<Array<{
    question: StartSessionResponse["first_question"];
    answer: string;
    feedback: SubmitAnswerResponse["evaluation"];
    followUps: string[];
    evaluationTrace?: SubmitAnswerResponse["evaluation_trace"] | null;
    trajectory?: SubmitAnswerResponse["trajectory"] | null;
  }>>([]);

  // Selected question for side-by-side comparison in summary
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState<boolean>(false);
  // History expanded view (show larger side-by-side answers in history tab)
  const [historyExpanded, setHistoryExpanded] = useState<boolean>(false);

  // Hint system state
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState<1 | 2 | 3>(1);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [isLoadingHint, setIsLoadingHint] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [codeOutput, setCodeOutput] = useState<string>("");
  const [isRunningCode, setIsRunningCode] = useState(false);

  // Progress tracking state
  const [progressData, setProgressData] = useState<ProgressResponse | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);

  // Timer
  const timerRef = useRef<number | null>(null);

  // Save session state to localStorage
  useEffect(() => {
    // Only persist resumable in-progress states. History view depends on external selection
    // and should not be restored from localStorage.
    if (sessionId && phase !== "setup" && phase !== "history") {
      const sessionState = {
        phase,
        sessionId,
        interviewType,
        difficulty,
        numQuestions,
        topic,
        currentQuestion,
        questionNumber,
        totalQuestions,
        startTime,
        elapsedTime,
        currentFeedback,
        followUpQuestions,
        summary,
        questionHistory,
        hintsUsed,
        progressData,
      };
      localStorage.setItem("mock_interview_session", JSON.stringify(sessionState));
    }
  }, [phase, sessionId, currentQuestion, questionNumber, currentFeedback, summary, questionHistory, elapsedTime]);

  // Restore session state on mount
  useEffect(() => {
    const restore = async () => {
      const savedSession = localStorage.getItem("mock_interview_session");
      if (!savedSession) return;

      try {
        const state = JSON.parse(savedSession);
        const rawPhase = state?.phase;
        const savedPhase: SessionPhase | null = isSessionPhase(rawPhase) ? rawPhase : null;
        const savedSessionId = typeof state?.sessionId === "string" ? state.sessionId : "";

        // Only restore if session is not completed
        if (!savedPhase || savedPhase === "setup" || !savedSessionId) return;

        // History can't be restored without a selectedHistorySession from the sidebar.
        if (savedPhase === "history") {
          localStorage.removeItem("mock_interview_session");
          setPhase("setup");
          return;
        }

        // Apply the persisted fields first.
        setPhase(savedPhase);
        setSessionId(savedSessionId);
        setInterviewType(state.interviewType);
        setDifficulty(state.difficulty);
        setNumQuestions(state.numQuestions);
        setTopic(state.topic || "");
        setCurrentQuestion(state.currentQuestion);
        setQuestionNumber(state.questionNumber);
        setTotalQuestions(state.totalQuestions);
        setStartTime(state.startTime);
        setElapsedTime(state.elapsedTime || 0);
        setCurrentFeedback(state.currentFeedback);
        setFollowUpQuestions(state.followUpQuestions || []);
        setSummary(state.summary);
        setQuestionHistory(state.questionHistory || []);
        setHintsUsed(state.hintsUsed || 0);
        setProgressData(state.progressData);

        // Defensive: if required data for the phase is missing, try to recover from backend.
        // Otherwise, fall back to setup to avoid a blank screen.
        const hasQuestion = !!state.currentQuestion;
        const hasFeedback = !!state.currentFeedback;
        const hasSummary = !!state.summary;

        if (savedPhase === "interview" && !hasQuestion) {
          try {
            const status = await apiGetSessionStatus(savedSessionId);
            const q = toStartQuestionFromStatus(status);
            if (q) {
              setInterviewType(status.interview_type);
              setDifficulty(status.difficulty);
              setTotalQuestions(status.total_questions);
              setQuestionNumber(Math.max(1, Number(status.current_question_index || 0) + 1));
              setCurrentQuestion(q);
              const parsedStart = Date.parse(status.start_time);
              if (Number.isFinite(parsedStart)) setStartTime(parsedStart);
              setPhase("interview");
            } else {
              localStorage.removeItem("mock_interview_session");
              setPhase("setup");
            }
          } catch {
            localStorage.removeItem("mock_interview_session");
            setPhase("setup");
          }
        } else if (savedPhase === "feedback" && !hasFeedback) {
          setPhase(hasQuestion ? "interview" : "setup");
        } else if (savedPhase === "summary" && !hasSummary) {
          setPhase("setup");
        }

        toast({
          title: "Session restored",
          description: "Continuing from where you left off",
        });
      } catch (error) {
        console.error("Failed to restore session:", error);
        localStorage.removeItem("mock_interview_session");
      }
    };

    void restore();
  }, []);

  // Handle selected history session from sidebar
  useEffect(() => {
    if (selectedHistorySession) {
      // Only switch to history if the session has evaluations
      if (selectedHistorySession.evaluations && selectedHistorySession.evaluations.length > 0) {
        setPhase("history");
        setSelectedQuestionIndex(0); // Start with first question
      } else {
        // If no evaluations, show error and stay in setup
        toast({
          title: "No Questions Found",
          description: "This session doesn't have recorded questions. Starting a new interview instead.",
          variant: "destructive",
        });
        // Don't change phase, stay in setup
      }
    } else {
      // No session selected, make sure we're in setup phase
      if (phase === "history") {
        setPhase("setup");
      }
    }
  }, [selectedHistorySession]);

  useEffect(() => {
    if (startTime && phase === "interview") {
      timerRef.current = window.setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTime, phase]);

  // Load progress data when interview phase starts
  useEffect(() => {
    if (phase === "interview" && sessionId && questionNumber > 1) {
      loadProgress();
    }
  }, [phase, questionNumber]);

  // Update answer when voice transcript changes
  useEffect(() => {
    if (transcript) {
      setUserAnswer((prev) => {
        const trimmedPrev = prev.trim();
        const trimmedTranscript = transcript.trim();
        if (trimmedPrev && !trimmedPrev.endsWith(" ")) {
          return trimmedPrev + " " + trimmedTranscript;
        }
        return trimmedPrev + trimmedTranscript;
      });
    }
  }, [transcript]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTimeSafe = (seconds: unknown) => {
    return Number.isFinite(seconds) ? formatTime(seconds as number) : "--";
  };

  const handleStartInterview = async () => {
    try {
      setIsSubmitting(true);

      // Clear any previous session
      localStorage.removeItem("mock_interview_session");

      console.log("[MockInterview] Starting interview with config:", {
        user_id: userId,
        interview_type: interviewType,
        difficulty,
        num_questions: numQuestions,
        topic: topic || undefined,
      });

      const response = await apiStartMockInterview({
        user_id: userId,
        interview_type: interviewType,
        difficulty,
        num_questions: numQuestions,
        topic: topic || undefined,
        ...(resumeContext && { resume_context: resumeContext }),
      });

      console.log("[MockInterview] Start response:", response);
      console.log("[MockInterview] First question:", response.first_question);
      console.log("[MockInterview] Setting phase to 'interview'");

      setSessionId(response.session_id);
      setCurrentQuestion(response.first_question);
      setTotalQuestions(response.total_questions);
      setQuestionNumber(1);
      setPhase("interview");
      setStartTime(Date.now());
      setQuestionStartTime(Date.now());
      setElapsedTime(0);
      setCurrentHint(null);
      setHintLevel(1);
      setHintsUsed(0);

      console.log("[MockInterview] State updated - phase:", "interview", "sessionId:", response.session_id);

      toast({
        title: "Interview Started",
        description: `Get ready for ${response.total_questions} ${interviewType} questions!`,
      });
    } catch (error: any) {
      console.error("[MockInterview] Failed to start:", error);
      toast({
        title: "Failed to start interview",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!sessionId || !currentQuestion) return;

    const answerText = interviewType === "coding" && codeAnswer ? codeAnswer : userAnswer;
    if (!answerText.trim()) {
      toast({
        title: "Empty answer",
        description: "Please provide an answer before submitting",
        variant: "destructive",
      });
      return;
    }

    await submitAnswer(answerText);
  };

  const handleSkipQuestion = async () => {
    if (!sessionId || !currentQuestion) return;

    const skipText = "[Skipped]";
    await submitAnswer(skipText);
  };

  const submitAnswer = async (answerText: string) => {
    if (!sessionId || !currentQuestion) return;

    try {
      setIsSubmitting(true);
      setSubmitErrorNotice(null);
      const timeSpent = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

      console.log("[MockInterview] Submitting answer:", {
        session_id: sessionId,
        answer_length: answerText.length,
        time_taken: timeSpent,
      });

      const response = await apiSubmitMockAnswer({
        session_id: sessionId,
        answer_text: answerText,
        time_taken_seconds: timeSpent,
        input_method: isListening || transcript ? "voice" : "text",
        code_solution: interviewType === "coding" ? codeAnswer : undefined,
        language: interviewType === "coding" ? language : undefined,
      });

      console.log("[MockInterview] Submit response:", response);
      console.log("[MockInterview] Evaluation:", response.evaluation);
      console.log("[MockInterview] Is last question:", response.is_last_question);
      console.log("[MockInterview] Next question:", response.next_question);
      console.log("[MockInterview] Follow-up questions:", response.follow_up_questions);

      // Save current question and feedback to history
      if (currentQuestion && response.evaluation) {
        setQuestionHistory(prev => [...prev, {
          question: currentQuestion,
          answer: answerText,
          feedback: response.evaluation,
          followUps: response.follow_up_questions || [],
          evaluationTrace: response.evaluation_trace ?? null,
          trajectory: response.trajectory ?? null,
        }]);
      }

      setCurrentFeedback(response.evaluation);
      setFollowUpQuestions(response.follow_up_questions || []);
      setEvaluationTrace(response.evaluation_trace ?? null);
      setTrajectory(response.trajectory ?? null);
      setPhase("feedback");

      if (response.is_last_question) {
        console.log("[MockInterview] Interview complete, loading summary...");
        // Interview complete, load summary
        const summaryData = await apiGetSessionSummary(sessionId);
        console.log("[MockInterview] Summary data:", summaryData);
        setSummary(summaryData);

        // Save completed session to history cache
        try {
          console.log("[MockInterview] Saving to history - questionHistory:", questionHistory);
          const historySession = {
            session_id: sessionId,
            user_id: userId,
            interview_type: interviewType,
            difficulty: difficulty,
            status: "completed",
            started_at: summaryData.started_at,
            completed_at: summaryData.completed_at,
            average_score: summaryData.average_score,
            questions_answered: summaryData.questions_answered,
            total_questions: summaryData.total_questions,
            is_complete: true,
            evaluations: summaryData.evaluations.map((evaluation: any, idx: number) => {
              // For the last question, we use the current data because state hasn't updated yet
              const isLast = idx === summaryData.evaluations.length - 1;
              const historyItem = isLast
                ? { answer: answerText, feedback: response.evaluation, followUps: response.follow_up_questions || [] }
                : questionHistory[idx];

              console.log(`[MockInterview] Mapping evaluation ${idx}${isLast ? ' (LAST)' : ''}:`, {
                question: evaluation.question,
                userAnswer: historyItem?.answer?.substring(0, 50),
                modelAnswer: historyItem?.feedback?.model_answer?.substring(0, 50),
              });

              return {
                question: evaluation.question,
                user_answer: historyItem?.answer || "",
                model_answer: historyItem?.feedback?.model_answer || "",
                score: evaluation.score,
                rating: evaluation.rating,
                feedback: evaluation.summary,
              };
            }),
          };
          console.log("[MockInterview] History session to save:", historySession);

          // Add to localStorage history cache
          const cached = localStorage.getItem(`mock_interview_history_${userId}`);
          const sessions = cached ? JSON.parse(cached) : [];
          sessions.unshift(historySession);
          localStorage.setItem(`mock_interview_history_${userId}`, JSON.stringify(sessions.slice(0, 50))); // Keep last 50

          // Notify parent to refresh history
          if (onHistoryUpdate) {
            onHistoryUpdate();
          }
        } catch (error) {
          console.error("[MockInterview] Failed to save to history:", error);
        }
      } else if (response.next_question) {
        console.log("[MockInterview] Setting next question");
        setCurrentQuestion(response.next_question);
        setQuestionNumber((prev) => prev + 1);
      }

      // Reset for next question
      setUserAnswer("");
      setCodeAnswer("");
      resetTranscript();
      setStartTime(Date.now());
    } catch (error: any) {
      console.error("[MockInterview] Failed to submit answer:", error);

      const message = typeof error?.message === 'string' ? error.message : '';
      const status = typeof (error as any)?.status === 'number' ? (error as any).status : undefined;
      const isRateLimited = status === 429;
      const isFetchFailure = message.toLowerCase().includes('failed to fetch');

      let title = 'Failed to submit answer';
      let description = message || 'Please try again.';

      if ((error instanceof StrataxApiError && isRateLimited) || isRateLimited) {
        title = 'Too many requests';
        description = 'Your answer was NOT submitted. Please wait a moment and try again.';
      } else if (isFetchFailure) {
        title = 'Could not reach server';
        description = 'Your answer was NOT submitted. This usually means a temporary network issue or a blocked CORS preflight. Please retry in a few seconds.';
      }

      setSubmitErrorNotice({ title, description });
      toast({ title, description, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueToNextQuestion = () => {
    if (summary) {
      setPhase("summary");
    } else {
      setPhase("interview");
      setCurrentFeedback(null);
      setEvaluationTrace(null);
      setTrajectory(null);
      setCurrentHint(null);
      setHintLevel(1);
      setQuestionStartTime(Date.now());
    }
  };

  const handleRestart = () => {
    // Clear saved session
    localStorage.removeItem("mock_interview_session");

    setPhase("setup");
    setSessionId(null);
    setCurrentQuestion(null);
    setCurrentFeedback(null);
    setEvaluationTrace(null);
    setTrajectory(null);
    setSummary(null);
    setEndedEarlyData(null);
    setUserAnswer("");
    setCodeAnswer("");
    setQuestionNumber(1);
    setStartTime(null);
    setElapsedTime(0);
    setQuestionHistory([]);
    setCurrentHint(null);
    setHintLevel(1);
    setHintsUsed(0);
    setProgressData(null);
    resetTranscript();
  };

  const handleRequestHint = async () => {
    if (!sessionId) return;

    try {
      setIsLoadingHint(true);
      const hintResponse = await apiGetHint(sessionId, hintLevel);

      setCurrentHint(hintResponse.hint);
      setHintsUsed(hintResponse.hints_used_count);

      // Auto-advance hint level for next hint (max 3)
      if (hintLevel < 3) {
        setHintLevel((prev) => (prev + 1) as 1 | 2 | 3);
      }

      toast({
        title: `Hint Level ${hintResponse.hint_level}`,
        description: hintResponse.hint_description,
      });
    } catch (error: any) {
      console.error("[MockInterview] Failed to get hint:", error);
      toast({
        title: "Failed to get hint",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoadingHint(false);
    }
  };

  const loadProgress = async () => {
    if (!sessionId) return;

    try {
      const progress = await apiGetProgress(sessionId);
      setProgressData(progress);
    } catch (error: any) {
      console.error("[MockInterview] Failed to load progress:", error);
    }
  };

  const toggleRecording = () => {
    if (!isSpeechSupported) {
      toast({
        title: "Voice input not supported",
        description: "Your browser doesn't support voice recognition",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  const handleRunCode = async () => {
    if (!codeAnswer.trim()) {
      toast({
        title: "No code to run",
        description: "Please write some code first",
        variant: "destructive",
      });
      return;
    }

    setIsRunningCode(true);
    setCodeOutput("");

    try {
      toast({
        title: "Running code...",
        description: "Compiling and executing your code",
      });

      // Backend-only execution. Never call Judge0/RapidAPI from the browser.
      // If the UI offers TypeScript, run it as JavaScript unless your backend explicitly supports TypeScript.
      const execLanguage = language === "typescript" ? "javascript" : language;

      const exec = await apiExecuteCode({
        language: execLanguage,
        code: codeAnswer,
        stdin: "",
      });

      const stdout = (exec.stdout ?? "").trim();
      const stderr = (exec.stderr ?? "").trim();

      if (exec.success) {
        const output = stdout || "(no output)";
        setCodeOutput(stderr ? `${output}\n\n[stderr]\n${stderr}` : output);
        toast({
          title: "Code executed successfully",
          description: "Check the output below",
        });
      } else {
        const msg = stderr || stdout || exec.status || "Execution failed";
        setCodeOutput(msg);
        toast({
          title: "Execution failed",
          description: msg,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("[MockInterview] Code execution failed:", error);
      setCodeOutput(`Error: ${error.message || "Failed to execute code"}`);
      toast({
        title: "Execution failed",
        description: error.message || "Could not run your code",
        variant: "destructive",
      });
    } finally {
      setIsRunningCode(false);
    }
  };

  // Debug: Log state changes
  useEffect(() => {
    console.log("[MockInterview] State changed - phase:", phase, "question:", currentQuestion?.question_text?.substring(0, 50), "sessionId:", sessionId);
  }, [phase, currentQuestion, sessionId]);

  // Setup Phase
  if (phase === "setup") {
    const interviewTypes = [
      { id: 'coding', name: 'Coding', description: 'Algorithms & Data Structures', outcome: 'Tests problem-solving speed and clarity under pressure' },
      { id: 'behavioral', name: 'Behavioral', description: 'Leadership & Communication', outcome: 'Evaluates communication, ownership, and decision-making' },
      { id: 'system_design', name: 'System Design', description: 'Architecture & Scalability', outcome: 'Assesses architecture thinking and trade-off reasoning' },
      { id: 'technical', name: 'Technical', description: 'Concepts & Theory', outcome: 'Measures depth of knowledge and technical fundamentals' }
    ];

    const difficulties = [
      { id: 'easy', name: 'Easy', description: 'Warm-up, fundamentals, confidence-building' },
      { id: 'medium', name: 'Medium', description: 'Real interview standard (recommended)' },
      { id: 'hard', name: 'Hard', description: 'Senior-level depth and edge cases' }
    ];

    // Quick Start Presets
    const quickPresets = [
      { name: 'FAANG Prep', type: 'coding' as InterviewType, difficulty: 'hard' as Difficulty, questions: 5, topic: 'Arrays' },
      { name: 'Startup Interview', type: 'system_design' as InterviewType, difficulty: 'medium' as Difficulty, questions: 3, topic: '' },
      { name: 'Quick Practice', type: 'coding' as InterviewType, difficulty: 'easy' as Difficulty, questions: 3, topic: '' },
      { name: 'Behavioral Prep', type: 'behavioral' as InterviewType, difficulty: 'medium' as Difficulty, questions: 5, topic: 'Leadership' }
    ];

    const applyPreset = (preset: typeof quickPresets[0]) => {
      setInterviewType(preset.type);
      setDifficulty(preset.difficulty);
      setNumQuestions(preset.questions);
      setTopic(preset.topic);
    };

    const resetToDefaults = () => {
      setInterviewType('coding');
      setDifficulty('medium');
      setNumQuestions(5);
      setTopic('');
      setAdvancedOpen(false);
    };

    // Get user stats from localStorage
    const getUserStats = () => {
      const stats = localStorage.getItem('mock_interview_stats');
      if (!stats) return null;
      try {
        return JSON.parse(stats);
      } catch {
        return null;
      }
    };

    const userStats = getUserStats();

    return (
      <div className="h-full overflow-y-auto p-4 scrollbar-hide scroll-smooth">
        <div className="max-w-5xl mx-auto pb-20">
          <div className="space-y-5">
            {/* Interview Type Selection */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-400" />
                Interview Type
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {interviewTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setInterviewType(type.id as InterviewType)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${interviewType === type.id
                      ? 'border-primary bg-primary/10 shadow-lg'
                      : 'border-border hover:border-primary/50'
                      }`}
                  >
                    <div className="text-sm font-semibold mb-0.5">{type.name}</div>
                    <div className="text-[10px] text-muted-foreground leading-snug">{type.outcome}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Topic Input — promoted above advanced so user sees it early */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-400" />
                Focus Topic (Optional)
              </h2>
              <Input
                placeholder="e.g., Arrays, Dynamic Programming, Leadership..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={512}
                className="mb-2 text-sm h-9"
              />
              <div className="flex flex-wrap gap-2">
                {['Arrays', 'Trees', 'Graphs', 'DP', 'System Design', 'Leadership'].map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => setTopic(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Resume Upload (optional) */}
            <ResumeUpload
              mode="mock-interview"
              onParsed={(ctx) => setResumeContext(ctx)}
              onClear={() => setResumeContext(null)}
              existing={resumeContext}
            />

            {/* Advanced Settings — collapsed by default */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between py-2 px-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-orange-400" />
                    Advanced Settings
                    <span className="text-[10px] font-normal text-muted-foreground/70">
                      {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} · {numQuestions} Qs
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-300 pt-1">
                {/* Difficulty */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Difficulty</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {difficulties.map((diff) => (
                      <button
                        key={diff.id}
                        onClick={() => setDifficulty(diff.id as Difficulty)}
                        className={`text-left rounded-lg p-2.5 border-2 transition-all ${difficulty === diff.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                          }`}
                      >
                        <div>
                          <div className="text-sm font-semibold flex items-center gap-1.5">
                            {diff.name}
                            {diff.id === 'medium' && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">Recommended</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">{diff.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Questions */}
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-green-400" />
                    Number of Questions
                  </h3>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={numQuestions}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setNumQuestions(1);
                        return;
                      }
                      const num = parseInt(value, 10);
                      if (!isNaN(num) && num >= 1 && num <= 50) {
                        setNumQuestions(num);
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value === '' || parseInt(value, 10) < 1) {
                        setNumQuestions(1);
                      } else if (parseInt(value, 10) > 50) {
                        setNumQuestions(50);
                      }
                    }}
                    className="mb-2 text-sm h-9 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="1-50"
                  />
                  <div className="text-xs text-muted-foreground">
                    ~{numQuestions * 7} minutes
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Session Summary */}
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-400" />
                Summary
              </h2>
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline" className="capitalize">{interviewType.replace('_', ' ')}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Difficulty</span>
                    <Badge variant="outline" className="capitalize">{difficulty}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Questions</span>
                    <Badge variant="outline">{numQuestions}</Badge>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Duration</span>
                    <Badge variant="outline">{numQuestions * 7} min</Badge>
                  </div>
                  {userStats && (
                    <>
                      <Separator />
                      <div className="pt-2 border-t">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Your Stats</div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Sessions</span>
                            <span className="font-medium">{userStats.totalSessions || 0}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Avg Score</span>
                            <span className="font-medium">{userStats.avgScore?.toFixed(1) || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Why this setup? */}
              <Collapsible open={whySetupOpen} onOpenChange={setWhySetupOpen}>
                <CollapsibleTrigger asChild>
                  <button className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="w-3 h-3" />
                    <span>Why this setup?</span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2 text-[11px] text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-300">
                  <p><strong className="text-foreground/80">Medium difficulty</strong> matches the standard bar at most companies — not too easy to be unrealistic, not too hard to be discouraging.</p>
                  <p><strong className="text-foreground/80">5 questions ≈ 35 minutes</strong> — this mirrors a typical single-round interview. Enough to build momentum without burnout.</p>
                  <p><strong className="text-foreground/80">Difficulty affects follow-ups</strong> — harder settings produce deeper probing and edge-case questions from the AI interviewer.</p>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* CTA microcopy + Action Buttons */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                You're about to start a <strong className="text-foreground/80">{numQuestions * 7}-minute</strong> mock interview
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={resetToDefaults}
                  variant="outline"
                  size="default"
                  className="flex-shrink-0"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
                <Button
                  onClick={handleStartInterview}
                  disabled={isSubmitting}
                  size="default"
                  className="flex-1 h-11 text-base font-semibold bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 shadow-lg shadow-primary/20"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting Interview...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Start Interview
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Interview Phase
  if (phase === "interview" && currentQuestion) {
    const showCodeEditor = interviewType === "coding";

    const handleEndInterview = async () => {
      if (!sessionId) return;
      if (!confirm("End interview early? You'll get results for answered questions only.")) return;
      try {
        const result = await apiEndSession(sessionId);
        setEndedEarlyData(result);

        // Build a summary from the end-session response
        const summarySource = result.summary || result;
        const summaryData: SessionSummaryResponse = {
          session_id: summarySource.session_id || sessionId,
          average_score: summarySource.average_score ?? 0,
          interview_type: summarySource.interview_type ?? interviewType as InterviewType,
          difficulty: summarySource.difficulty ?? difficulty as Difficulty,
          questions_answered: summarySource.questions_answered ?? questionNumber - 1,
          total_questions: summarySource.total_questions ?? totalQuestions,
          started_at: summarySource.started_at ?? new Date().toISOString(),
          completed_at: summarySource.completed_at ?? new Date().toISOString(),
          evaluations: summarySource.evaluations ?? [],
          trajectory: summarySource.trajectory,
          evaluation_trace: summarySource.evaluation_trace,
        };

        setSummary(summaryData);
        setPhase("summary");

        // Clear localStorage to prevent restoration
        localStorage.removeItem("mock_interview_session");

        toast({
          title: "Interview Ended",
          description: `Results ready for ${summaryData.questions_answered} answered question${summaryData.questions_answered !== 1 ? 's' : ''}.`,
        });
      } catch (err) {
        console.error("Failed to end interview:", err);
        toast({
          title: "Failed to end interview",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    };

    return (
      <div className="h-full flex flex-col p-2 sm:p-4 gap-3 sm:gap-4 overflow-hidden">
        {/* Header */}
        <Card className="border-0 bg-card/50 backdrop-blur-sm shadow-sm ring-1 ring-border/20">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap order-2 sm:order-1">
                <Badge variant="outline" className="text-[10px] sm:text-xs">
                  {questionNumber}/{totalQuestions}
                </Badge>
                <Badge variant="secondary" className="text-[10px] sm:text-xs uppercase tracking-wider">{currentQuestion.difficulty}</Badge>
                {currentQuestion.topic && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs max-w-[100px] truncate">
                    {currentQuestion.topic}
                  </Badge>
                )}
              </div>
                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 order-1 sm:order-2 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold tabular-nums px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/20 shadow-sm">
                    <Clock className={`h-4 w-4 ${elapsedTime < 180 ? 'text-green-500' : elapsedTime < 300 ? 'text-yellow-500' : 'text-red-500'}`} />
                    <span className={elapsedTime < 180 ? 'text-green-500' : elapsedTime < 300 ? 'text-yellow-500' : 'text-red-500'}>
                      {formatTime(elapsedTime)}
                    </span>
                  </div>
                  {hintsUsed > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-500/15 border border-yellow-500/20 px-2.5 py-1.5 rounded-lg shadow-sm">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      <span>{hintsUsed}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {questionHistory.length > 0 && (
                    <Select onValueChange={(value) => {
                      const index = parseInt(value);
                      const previous = questionHistory[index];
                      if (previous && previous.feedback) {
                        setCurrentFeedback(previous.feedback);
                        setFollowUpQuestions(previous.followUps);
                        setPhase("feedback");
                      }
                    }}>
                      <SelectTrigger className="w-[110px] sm:w-[140px] h-8 text-[10px] sm:text-xs">
                        <SelectValue placeholder="Feedback" />
                      </SelectTrigger>
                      <SelectContent>
                        {questionHistory.map((item, idx) => (
                          <SelectItem key={idx} value={idx.toString()} className="text-xs">
                            Q{idx + 1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEndInterview}
                    className="h-8 px-2 sm:px-3 text-[10px] sm:text-xs font-bold uppercase tracking-tight text-red-400/70 hover:text-white hover:bg-destructive transition-all duration-200"
                  >
                    <X className="h-3.5 w-3.5 sm:mr-1" />
                    <span className="hidden sm:inline">Stop</span>
                  </Button>
                </div>
              </div>
            </div>
            <Progress value={(questionNumber / totalQuestions) * 100} className="h-1.5 sm:h-2" />
            <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <span className="flex items-center gap-1 font-medium"><Award className="h-3 w-3 text-primary" /> Avg: {progressData?.average_score?.toFixed(1) || "--"}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTimeSafe(progressData?.total_time_seconds)}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Lightbulb className="h-3 w-3" /> Hints: {progressData?.hints_used_total || 0}</span>
              </div>
              <div className="hidden sm:block font-medium">
                {Math.round((questionNumber / totalQuestions) * 100)}% Complete
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
          {/* Question Panel */}
          <Card className="flex flex-col border-0 bg-card/40 backdrop-blur-sm shadow-sm">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Question</CardTitle>
                {showCodeEditor && (
                  <Badge variant="secondary" className="text-xs">
                    Coding Challenge
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
              <div className="space-y-4 pr-4">
                <div className="space-y-3">
                  <p className="text-base leading-7 font-medium">{currentQuestion.question_text}</p>

                  {/* No hardcoded example or constraints here.
                      This block used to render a fixed LeetCode "Contains
                      Duplicate" example — Input: nums = [1,2,3,1] — plus
                      "1 ≤ array.length ≤ 10⁵" and an O(1) follow-up, under EVERY
                      coding question, gated only on interviewType === "coding".
                      The question is generated; the example was not, so a graph
                      or concurrency problem was shown an array example and a
                      complexity target that belonged to a different question.
                      Examples and constraints have to come from the question
                      itself or not appear at all. */}
                </div>

                {currentQuestion.hints && currentQuestion.hints.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <Separator className="my-3" />
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      <span>Available Hints ({currentQuestion.hints.length})</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Click the Hint button above to reveal hints when needed</p>
                  </div>
                )}
              </div>

              {/* Expanded history dialog -- moved to history block so currentEval is available */}
            </CardContent>
          </Card>

          {/* Answer Panel */}
          <Card className="flex flex-col min-h-0 border-0 bg-card/60 backdrop-blur-xl shadow-lg ring-1 ring-primary/10">
            <CardHeader className="flex-shrink-0 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/30 py-2.5 px-3 sm:px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-base font-semibold truncate mr-2 hidden min-[360px]:block">Your Answer</CardTitle>
                <CardTitle className="text-xs font-semibold min-[360px]:hidden">Ans</CardTitle>
                <div className="flex items-center gap-1 sm:gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => setIsAnswerExpanded(true)}
                    title="Expand answer"
                  >
                    <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                  {!showCodeEditor && isSpeechSupported && (
                    <Button
                      variant={isListening ? "destructive" : "outline"}
                      size="sm"
                      onClick={toggleRecording}
                      className={`h-7 sm:h-8 px-1.5 sm:px-3 text-[9px] sm:text-xs font-bold uppercase transition-all ${isListening ? 'animate-pulse' : ''}`}
                    >
                      {isListening ? (
                        <>
                          <MicOff className="h-3 w-3 sm:mr-1.5" />
                          <span className="hidden sm:inline">Stop</span>
                        </>
                      ) : (
                        <>
                          <Mic className="h-3 w-3 sm:mr-1.5" />
                          <span>Voice</span>
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRequestHint}
                    disabled={isLoadingHint || hintLevel > 3}
                    className="h-7 sm:h-8 px-1.5 sm:px-3 text-[9px] sm:text-xs font-bold uppercase transition-all"
                  >
                    {isLoadingHint ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Lightbulb className="h-3 w-3 sm:mr-1.5 text-yellow-500" />
                        <span>Hint {hintLevel > 3 ? 'Max' : `${hintLevel}/3`}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col gap-3 p-6 overflow-y-auto scrollbar-hide">
              {currentHint && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex-shrink-0">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold mb-1">Hint Level {hintLevel - 1}</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{currentHint}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => setCurrentHint(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {isListening && transcript && (
                <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 text-sm flex-shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs text-gray-400">Recording...</span>
                  </div>
                  <p className="text-gray-300">{transcript}</p>
                </div>
              )}

              {showCodeEditor ? (
                <div className="flex flex-col gap-3 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Label className="text-xs text-muted-foreground">Language:</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="python">Python</SelectItem>
                          <SelectItem value="javascript">JavaScript</SelectItem>
                          <SelectItem value="typescript">TypeScript</SelectItem>
                          <SelectItem value="java">Java</SelectItem>
                          <SelectItem value="cpp">C++</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                      <Badge variant="outline" className="text-xs font-mono whitespace-nowrap">solution.{language === 'python' ? 'py' : language === 'cpp' ? 'cpp' : 'js'}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={handleRunCode}
                        disabled={isRunningCode}
                      >
                        {isRunningCode ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="hidden sm:inline">Running...</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            <span className="hidden sm:inline">Run Code</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 border rounded-md overflow-hidden min-h-[300px]">
                    <MonacoEditor
                      value={codeAnswer}
                      onChange={(v) => {
                        setCodeAnswer(v);
                        if (submitErrorNotice) setSubmitErrorNotice(null);
                      }}
                      language={language}
                      height="100%"
                    />
                  </div>
                  {codeOutput && (
                    <div className="border rounded-md p-3 bg-muted/50">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold">Output:</h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => setCodeOutput("")}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[150px] overflow-y-auto scrollbar-hide">
                        {codeOutput}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-2">
                  {interviewType === 'behavioral' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const starTemplate = "Situation: [Describe the context]\n\nTask: [Explain what needed to be done]\n\nAction: [Detail the steps you took]\n\nResult: [Share the outcome and impact]";
                        setUserAnswer(starTemplate);
                        setWordCount(starTemplate.split(/\s+/).filter(w => w.length > 0).length);
                      }}
                      className="self-start"
                    >
                      <Lightbulb className="h-4 w-4 mr-2" />
                      STAR Template
                    </Button>
                  )}
                  <Textarea
                    placeholder="Type your answer here..."
                    value={userAnswer}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserAnswer(val);
                      if (submitErrorNotice) setSubmitErrorNotice(null);
                      const words = val.trim().split(/\s+/).filter(w => w.length > 0).length;
                      setWordCount(val.trim() === '' ? 0 : words);
                    }}
                    onKeyDown={(e) => {
                      if (e.ctrlKey && e.key === 'Enter') {
                        e.preventDefault();
                        if (userAnswer.trim()) {
                          handleSubmitAnswer();
                        }
                      }
                    }}
                    className="min-h-[300px] resize-none font-sans flex-1"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                    <span className="text-xs">Press Ctrl+Enter to submit</span>
                  </div>
                </div>
              )}

              {submitErrorNotice ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2 flex-shrink-0">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-red-200">{submitErrorNotice.title}</div>
                    <div className="text-xs text-red-100/90 mt-0.5">{submitErrorNotice.description}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => setSubmitErrorNotice(null)}
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 gap-2"
                  onClick={handleSkipQuestion}
                  disabled={isSubmitting}
                >
                  <ArrowRight className="h-4 w-4" />
                  Skip
                </Button>
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={isSubmitting || (!userAnswer.trim() && !codeAnswer.trim())}
                  size="lg"
                  className="flex-[2] gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit Answer
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Expanded Answer Dialog */}
        <Dialog open={isAnswerExpanded} onOpenChange={setIsAnswerExpanded}>
          <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-6xl max-h-[92vh] flex flex-col p-0 border-none bg-background/95 backdrop-blur-xl">
            <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 border-b">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-8">
                <DialogTitle className="text-base sm:text-lg font-bold leading-tight uppercase tracking-tight">Expanded View</DialogTitle>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-bold">{questionNumber} of {totalQuestions}</Badge>
                  <div className="flex items-center gap-2 text-sm font-bold tabular-nums bg-muted/30 px-2 py-1 rounded-md">
                    <Clock className={`h-4 w-4 ${elapsedTime < 180 ? 'text-green-500' :
                      elapsedTime < 300 ? 'text-yellow-500' :
                        'text-red-500'
                      }`} />
                    <span className={elapsedTime < 180 ? 'text-green-500' :
                      elapsedTime < 300 ? 'text-yellow-500' :
                        'text-red-500'
                    }>{formatTime(elapsedTime)}</span>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 scrollbar-hide">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                {/* Question Panel */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold mb-3 text-primary flex items-center gap-2">
                      Question
                      {currentQuestion?.difficulty && (
                        <Badge variant="secondary">{currentQuestion.difficulty}</Badge>
                      )}
                      {currentQuestion?.topic && (
                        <Badge variant="outline">{currentQuestion.topic}</Badge>
                      )}
                    </h3>
                    <p className="text-base text-foreground leading-7">{currentQuestion?.question_text}</p>
                  </div>

                  {currentHint && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold mb-1">Hint Level {hintLevel - 1}</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">{currentHint}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={() => setCurrentHint(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Second copy of the same fabricated example, removed. See the
                      collapsed view above. */}
                </div>

                {/* Answer Panel */}
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm sm:text-base font-semibold text-primary uppercase tracking-tight">Your Answer</h3>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {!showCodeEditor && isSpeechSupported && (
                        <Button
                          variant={isListening ? "destructive" : "outline"}
                          size="sm"
                          onClick={toggleRecording}
                          className={`h-8 px-2 sm:px-3 text-[10px] sm:text-xs font-bold uppercase transition-all ${isListening ? 'animate-pulse' : ''}`}
                        >
                          {isListening ? (
                            <>
                              <MicOff className="h-3.5 w-3.5 sm:mr-1.5" />
                              <span className="hidden sm:inline">Stop</span>
                            </>
                          ) : (
                            <>
                              <Mic className="h-3.5 w-3.5 sm:mr-1.5" />
                              <span className="hidden sm:inline">Voice</span>
                              <span className="sm:hidden">Mic</span>
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRequestHint}
                        disabled={isLoadingHint || hintLevel > 3}
                        className="h-8 px-2 sm:px-3 text-[10px] sm:text-xs font-bold uppercase transition-all"
                      >
                        {isLoadingHint ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Lightbulb className="h-3.5 w-3.5 sm:mr-1.5 text-yellow-500" />
                            <span>Hint {hintLevel > 3 ? 'Max' : `${hintLevel}/3`}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {isListening && transcript && (
                    <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-xs text-gray-400">Recording...</span>
                      </div>
                      <p className="text-gray-300">{transcript}</p>
                    </div>
                  )}

                  {showCodeEditor ? (
                    <div className="flex flex-col gap-3 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Language:</Label>
                          <Select value={language} onValueChange={setLanguage}>
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="python">Python</SelectItem>
                              <SelectItem value="javascript">JavaScript</SelectItem>
                              <SelectItem value="typescript">TypeScript</SelectItem>
                              <SelectItem value="java">Java</SelectItem>
                              <SelectItem value="cpp">C++</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            solution.{language === 'python' ? 'py' : language === 'cpp' ? 'cpp' : 'js'}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={handleRunCode}
                            disabled={isRunningCode}
                          >
                            {isRunningCode ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Running...
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" />
                                Run Code
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 border rounded-md overflow-hidden min-h-[400px]">
                        <MonacoEditor
                          value={codeAnswer}
                          onChange={(v) => {
                            setCodeAnswer(v);
                            if (submitErrorNotice) setSubmitErrorNotice(null);
                          }}
                          language={language}
                          height="100%"
                        />
                      </div>
                      {codeOutput && (
                        <div className="border rounded-md p-3 bg-muted/50">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold">Output:</h4>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => setCodeOutput("")}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[200px] overflow-y-auto scrollbar-hide">
                            {codeOutput}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-2">
                      {interviewType === 'behavioral' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const starTemplate = "Situation: [Describe the context]\n\nTask: [Explain what needed to be done]\n\nAction: [Detail the steps you took]\n\nResult: [Share the outcome and impact]";
                            setUserAnswer(starTemplate);
                            setWordCount(starTemplate.split(/\s+/).filter(w => w.length > 0).length);
                          }}
                          className="self-start"
                        >
                          <Lightbulb className="h-4 w-4 mr-2" />
                          STAR Template
                        </Button>
                      )}
                      <Textarea
                        placeholder="Type your answer here..."
                        value={userAnswer}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserAnswer(val);
                          if (submitErrorNotice) setSubmitErrorNotice(null);
                          const words = val.trim().split(/\s+/).filter(w => w.length > 0).length;
                          setWordCount(val.trim() === '' ? 0 : words);
                        }}
                        onKeyDown={(e) => {
                          if (e.ctrlKey && e.key === 'Enter') {
                            e.preventDefault();
                            if (userAnswer.trim()) {
                              handleSubmitAnswer();
                              setIsAnswerExpanded(false);
                            }
                          }
                        }}
                        className="min-h-[250px] sm:min-h-[400px] resize-none font-sans flex-1"
                      />
                      <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground mt-1">
                        <span className="font-medium">{wordCount} words</span>
                        <span className="hidden sm:inline">Press Ctrl+Enter to submit</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="px-4 sm:px-6 py-4 border-t">
              {submitErrorNotice ? (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-red-200">{submitErrorNotice.title}</div>
                    <div className="text-xs text-red-100/90 mt-0.5">{submitErrorNotice.description}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={() => setSubmitErrorNotice(null)}
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 gap-2 h-11 text-xs sm:text-sm font-bold uppercase tracking-wider"
                onClick={handleSkipQuestion}
                disabled={isSubmitting}
              >
                <ArrowRight className="h-4 w-4" />
                Skip
              </Button>
              <Button
                onClick={() => {
                  handleSubmitAnswer();
                  setIsAnswerExpanded(false);
                }}
                disabled={isSubmitting || (!userAnswer.trim() && !codeAnswer.trim())}
                size="lg"
                className="flex-[2] gap-2 h-11 text-xs sm:text-sm font-bold uppercase tracking-wider"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Answer
                  </>
                )}
              </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div >
    );
  }

  const handleCloseFeedback = () => {
    setPhase("interview");
    setEvaluationTrace(null);
    setTrajectory(null);
  };

  const handleViewPreviousQuestion = (index: number) => {
    if (questionHistory.length > index) {
      const previous = questionHistory[index];
      setCurrentFeedback(previous.feedback);
      setFollowUpQuestions(previous.followUps);
      setEvaluationTrace(previous.evaluationTrace ?? null);
      setTrajectory(previous.trajectory ?? null);
      setCurrentQuestion(previous.question);
    }
  };

  // Feedback Phase
  if (phase === "feedback" && currentFeedback) {
    return (
      <div className="h-full overflow-auto p-3 sm:p-6">
        <Card className="w-full max-w-4xl mx-auto mb-6 border-0 shadow-xl bg-card/80 backdrop-blur-xl">
          <CardHeader className="border-b border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {questionHistory.length > 0 && (
                  <Select onValueChange={(value) => handleViewPreviousQuestion(parseInt(value))}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="View Previous" />
                    </SelectTrigger>
                    <SelectContent>
                      {questionHistory.map((item, idx) => (
                        <SelectItem key={idx} value={idx.toString()}>
                          Question {idx + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div>
                  <CardTitle className="text-2xl">Answer Evaluation</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Question {questionNumber} of {totalQuestions}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">{currentFeedback.overall_score.toFixed(1)}</div>
                  <Badge variant="secondary" className="mt-1">{currentFeedback.rating_category}</Badge>
                </div>
                <Award className="h-8 w-8 text-yellow-500" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseFeedback}
                  className="ml-2"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-6">
              {/* Performance Summary */}
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-5">
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Performance Summary
                </h3>
                <p className="text-sm text-muted-foreground leading-7">{currentFeedback.performance_summary}</p>
              </div>

              {/* Why this score */}
              {evaluationTrace && Array.isArray((evaluationTrace as any).why) && (evaluationTrace as any).why.length > 0 && (
                <div className="bg-muted/30 rounded-xl p-5">
                  <h3 className="text-base font-semibold mb-3">Why this score</h3>
                  <ul className="space-y-2">
                    {(evaluationTrace as any).why.map((line: any, idx: number) => (
                      <li key={idx} className="flex gap-2 items-start text-sm">
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span className="text-muted-foreground flex-1">{String(line)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Session trajectory */}
              {trajectory && ((trajectory as any).note || (trajectory as any).overall || (trajectory as any).dimensions) && (
                <div className="bg-muted/30 rounded-xl p-5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="text-base font-semibold">Session trajectory</h3>
                    {typeof (trajectory as any)?.overall?.delta === 'number' && (
                      <Badge variant="outline">
                        Overall Δ {(trajectory as any).overall.delta > 0 ? '+' : ''}{(trajectory as any).overall.delta}
                      </Badge>
                    )}
                  </div>
                  {typeof (trajectory as any).note === 'string' && (trajectory as any).note.trim() && (
                    <p className="text-sm text-muted-foreground leading-7">{(trajectory as any).note}</p>
                  )}
                  {(trajectory as any).dimensions && typeof (trajectory as any).dimensions === 'object' && (
                    <div className="flex flex-wrap gap-2 pt-3">
                      {Object.entries((trajectory as any).dimensions as Record<string, any>).map(([dim, info]) => {
                        const delta = (info as any)?.delta;
                        if (typeof delta !== 'number') return null;
                        return (
                          <Badge key={dim} variant="secondary" className="capitalize">
                            {dim} Δ {delta > 0 ? '+' : ''}{delta}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Criteria Scores */}
              <div>
                <h3 className="text-base font-semibold mb-4">Evaluation Criteria</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                  <div className="bg-muted/30 rounded-xl p-3 sm:p-4 text-center">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Correctness</div>
                    <div className="text-xl sm:text-2xl font-bold">{currentFeedback.criteria_scores.correctness}</div>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 sm:p-4 text-center">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Completeness</div>
                    <div className="text-xl sm:text-2xl font-bold">{currentFeedback.criteria_scores.completeness}</div>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 sm:p-4 text-center">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Clarity</div>
                    <div className="text-xl sm:text-2xl font-bold">{currentFeedback.criteria_scores.clarity}</div>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 sm:p-4 text-center">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Confidence</div>
                    <div className="text-xl sm:text-2xl font-bold">{currentFeedback.criteria_scores.confidence}</div>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-3 sm:p-4 text-center">
                    <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Tech Depth</div>
                    <div className="text-xl sm:text-2xl font-bold">{currentFeedback.criteria_scores.technical_depth}</div>
                  </div>
                </div>
              </div>

              <Separator className="opacity-30" />

              {/* Strengths and Weaknesses Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Strengths
                  </h3>
                  <ul className="space-y-2">
                    {currentFeedback.strengths.map((strength, idx) => (
                      <li key={idx} className="flex gap-2 items-start text-sm bg-green-500/5 p-3 rounded-lg">
                        <span className="text-green-500 font-bold mt-0.5">✓</span>
                        <span className="text-muted-foreground flex-1">{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    Weaknesses
                  </h3>
                  <ul className="space-y-2">
                    {currentFeedback.weaknesses.map((weakness, idx) => (
                      <li key={idx} className="flex gap-2 items-start text-sm bg-red-500/5 p-3 rounded-lg">
                        <span className="text-red-500 font-bold mt-0.5">×</span>
                        <span className="text-muted-foreground flex-1">{weakness}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Model Answer */}
              {currentFeedback.model_answer && (
                <>
                  <div className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 rounded-xl p-5">
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-blue-500" />
                      Model Answer
                    </h3>
                    <div className="bg-background/50 rounded-xl p-4">
                      <p className="text-sm text-muted-foreground leading-7 whitespace-pre-wrap">
                        {currentFeedback.model_answer}
                      </p>
                    </div>
                  </div>
                  <Separator className="opacity-30" />
                </>
              )}

              {/* Improvement Suggestions */}
              <div>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                  Improvement Suggestions
                </h3>
                <ul className="space-y-2">
                  {currentFeedback.improvement_suggestions.map((suggestion, idx) => (
                    <li key={idx} className="flex gap-3 items-start text-sm bg-orange-500/5 p-3 rounded-lg">
                      <span className="text-orange-500 font-bold mt-0.5">→</span>
                      <span className="text-muted-foreground flex-1">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {currentFeedback.missing_points && currentFeedback.missing_points.length > 0 && (
                <>
                  <Separator className="opacity-30" />
                  <div>
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                      Missing Points
                    </h3>
                    <ul className="space-y-2">
                      {currentFeedback.missing_points.map((point, idx) => (
                        <li key={idx} className="flex gap-3 items-start text-sm bg-yellow-500/5 p-3 rounded-lg">
                          <span className="text-yellow-500 font-bold mt-0.5">!</span>
                          <span className="text-muted-foreground flex-1">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              <Separator className="opacity-30" />

              {/* Detailed Feedback */}
              <div>
                <h3 className="text-base font-semibold mb-3">Detailed Feedback</h3>
                <div className="bg-muted/20 rounded-xl p-4">
                  <p className="text-sm text-muted-foreground leading-7">
                    {currentFeedback.detailed_feedback}
                  </p>
                </div>
              </div>

              {followUpQuestions && followUpQuestions.length > 0 && (
                <>
                  <Separator className="opacity-30" />
                  <div>
                    <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-blue-500" />
                      Follow-up Questions
                    </h3>
                    <ul className="space-y-3">
                      {followUpQuestions.map((question, idx) => (
                        <li key={idx} className="flex gap-3 items-start bg-blue-500/5 p-4 rounded-xl">
                          <span className="text-blue-500 font-bold text-base">{idx + 1}.</span>
                          <span className="text-sm text-muted-foreground flex-1">{question}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            {/* Action Button */}
            <div className="pt-4 border-t mt-6">
              <Button onClick={handleContinueToNextQuestion} size="lg" className="w-full">
                {summary ? (
                  <>
                    View Summary
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    Next Question
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Download Report as detailed HTML
  const handleDownloadReport = (summaryData: SessionSummaryResponse, bestScore: number, worstScore: number, consistencyScore: number) => {
    // Determine the extra stats from summary data (backend returns these) or fall back to progress data
    const totalTime = (summaryData as any).total_time_seconds ?? (summaryData as any).progress?.total_time_seconds ?? progressData?.total_time_seconds ?? (elapsedTime > 0 ? elapsedTime : 0);
    const hintsUsedNum = (summaryData as any).total_hints_used ?? (summaryData as any).hints_used_total ?? (summaryData as any).progress?.hints_used_total ?? progressData?.hints_used_total ?? hintsUsed ?? 0;
    const avgScore = summaryData.average_score;
    const efficiency = (summaryData as any).performance_insights?.efficiency || (hintsUsedNum === 0 ? "Perfect" : hintsUsedNum < 3 ? "Excellent" : hintsUsedNum < 6 ? "Good" : "Needs Work");
    const trajectoryNote = (summaryData as any).trajectory?.note || "";
    const strongestArea = (summaryData as any).performance_insights?.strongest_area || "N/A";
    const weakestArea = (summaryData as any).performance_insights?.weakest_area || "N/A";
    const consistencyLabel = (summaryData as any).performance_insights?.consistency || (consistencyScore >= 8 ? "Very Consistent" : consistencyScore >= 5 ? "Consistent" : "Variable");

    // Compute average criteria scores across all evaluations
    const criteriaKeys = ["correctness", "completeness", "clarity", "confidence", "technical_depth"];
    const criteriaAvgs: Record<string, number> = {};
    criteriaKeys.forEach(k => {
      const vals = summaryData.evaluations.map(e => (e as any).criteria_scores?.[k] ?? 0).filter((v: number) => v > 0);
      criteriaAvgs[k] = vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
    });

    // Escape HTML in user text to prevent XSS in the generated report
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock Interview Report - ${new Date().toLocaleDateString()}</title>
<style>
:root{--primary:#4f46e5;--primary-light:#eef2ff;--success:#22c55e;--warning:#f59e0b;--danger:#ef4444;--bg:#f8fafc;--card:#fff;--text:#1e293b;--text-light:#64748b;--border:#e2e8f0;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',-apple-system,sans-serif;color:var(--text);background:var(--bg);padding:32px;line-height:1.6;}
.container{max-width:960px;margin:0 auto;background:var(--card);padding:40px;border-radius:24px;box-shadow:0 10px 25px -5px rgba(0,0,0,.08);border:1px solid var(--border);}
.header{margin-bottom:32px;border-bottom:2px solid var(--border);padding-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;}
.header-info h1{font-size:28px;font-weight:800;letter-spacing:-.025em;color:#0f172a;margin-bottom:4px;}
.header-info p{color:var(--text-light);font-size:13px;font-weight:500;}
.date-badge{background:var(--primary-light);color:var(--primary);padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;}
.score-hero{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:36px;border-radius:20px;text-align:center;margin-bottom:28px;box-shadow:0 16px 20px -5px rgba(79,70,229,.2);}
.score-hero .score-val{font-size:64px;font-weight:900;line-height:1;}
.score-hero .score-label{font-size:15px;opacity:.9;font-weight:600;margin-top:6px;}
.score-hero .score-badge{display:inline-block;margin-top:10px;padding:4px 16px;border-radius:20px;background:rgba(255,255,255,.2);font-size:13px;font-weight:700;}
.stats-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:32px;}
.stat-tile{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;text-align:center;}
.stat-tile .val{font-size:20px;font-weight:700;color:#0f172a;display:block;}
.stat-tile .lbl{font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-top:4px;display:block;}
.section{margin-bottom:36px;}
.section-title{font-size:18px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:10px;color:#0f172a;}
.section-title::before{content:"";display:block;width:4px;height:22px;background:var(--primary);border-radius:2px;}
.insights-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.insight-card{padding:20px;border-radius:14px;border:1px solid var(--border);}
.insight-card.success{background:#f0fdf4;border-color:#dcfce7;}
.insight-card.warning{background:#fff7ed;border-color:#ffedd5;}
.insight-card h3{font-size:14px;font-weight:700;margin-bottom:12px;}
.insight-row{display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;}
.insight-row span:first-child{color:var(--text-light);}
.insight-row .val{font-weight:700;color:#0f172a;}
.criteria-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:32px;}
.criteria-tile{text-align:center;padding:14px 8px;border:1px solid var(--border);border-radius:14px;background:#fafbfc;}
.criteria-tile .c-name{font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-light);letter-spacing:.04em;margin-bottom:6px;display:block;}
.criteria-tile .c-val{font-size:22px;font-weight:800;color:var(--primary);display:block;}
.criteria-bar{height:6px;border-radius:3px;background:#e2e8f0;margin-top:8px;overflow:hidden;}
.criteria-bar-fill{height:100%;border-radius:3px;background:var(--primary);}
.q-list{display:flex;flex-direction:column;gap:24px;}
.q-card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:0;page-break-inside:avoid;overflow:hidden;}
.q-card-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);background:#fafbfc;}
.q-card-header .q-tag{font-size:10px;font-weight:800;color:var(--text-light);background:var(--border);padding:3px 10px;border-radius:6px;text-transform:uppercase;}
.q-card-header .q-badge{font-size:10px;font-weight:700;padding:3px 10px;border-radius:6px;background:var(--primary-light);color:var(--primary);text-transform:uppercase;margin-left:6px;}
.q-card-header .q-score-pill{font-size:16px;font-weight:800;color:var(--primary);background:var(--primary-light);padding:4px 14px;border-radius:20px;}
.q-card-body{padding:20px;}
.q-title{font-size:15px;font-weight:700;color:#0f172a;margin-bottom:12px;line-height:1.5;}
.q-mini-criteria{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;}
.q-mini-criteria span{font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:#f1f5f9;color:var(--text-light);}
.q-feedback-text{font-size:13px;color:var(--text);margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:10px;border:1px dashed var(--border);line-height:1.7;}
.q-answers{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;}
.q-answer-box{border-radius:10px;padding:14px;font-size:12px;line-height:1.6;}
.q-answer-box.user{background:#eff6ff;border:1px solid #bfdbfe;}
.q-answer-box.model{background:#f0fdf4;border:1px solid #bbf7d0;}
.q-answer-box h5{font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:8px;letter-spacing:.04em;}
.q-answer-box.user h5{color:#3b82f6;}
.q-answer-box.model h5{color:#22c55e;}
.q-answer-box pre{white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:12px;color:var(--text);max-height:200px;overflow-y:auto;}
.q-points{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;}
.q-point-col h4{font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:4px;}
.q-point-col.strengths h4{color:var(--success);}
.q-point-col.weaknesses h4{color:var(--danger);}
.q-point-list{list-style:none;font-size:12px;color:var(--text-light);}
.q-point-list li{margin-bottom:3px;padding-left:10px;position:relative;}
.q-point-list li::before{content:"•";position:absolute;left:0;color:currentColor;}
.q-suggestions{margin-top:10px;}
.q-suggestions h4{font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:6px;color:var(--warning);}
.q-suggestions li{font-size:12px;color:var(--text-light);margin-bottom:3px;padding-left:10px;position:relative;list-style:none;}
.q-suggestions li::before{content:"→";position:absolute;left:0;color:var(--warning);}
.trajectory-note{background:var(--primary-light);border:1px solid #c7d2fe;border-radius:12px;padding:14px 18px;font-size:13px;color:var(--primary);font-weight:600;margin-bottom:28px;}
.footer{text-align:center;margin-top:48px;padding-top:24px;border-top:1px solid var(--border);color:var(--text-light);font-size:12px;font-weight:500;}
@media print{body{padding:0;background:#fff;}.container{border:none;padding:20px;max-width:100%;box-shadow:none;}.score-hero{box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;}.q-card{break-inside:avoid;}}
</style></head><body>
<div class="container">
  <div class="header">
    <div class="header-info">
      <h1>Mock Interview Report</h1>
      <p>${esc((summaryData.interview_type || '').replace('_',' '))} • ${esc(summaryData.difficulty || '')} Round • ${summaryData.questions_answered}/${summaryData.total_questions} Questions</p>
    </div>
    <div class="date-badge">${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
  </div>

  <div class="score-hero">
    <div class="score-val">${avgScore.toFixed(1)}</div>
    <div class="score-label">Overall Performance Score (out of 10)</div>
    <div class="score-badge">${avgScore >= 8 ? "Excellent" : avgScore >= 6 ? "Good" : avgScore >= 4 ? "Fair" : "Needs Work"}</div>
  </div>

  ${trajectoryNote ? `<div class="trajectory-note">📈 Session Trajectory: ${esc(trajectoryNote)}</div>` : ''}

  <div class="stats-grid">
    <div class="stat-tile">
      <span class="val">${summaryData.questions_answered}/${summaryData.total_questions}</span>
      <span class="lbl">Progress</span>
    </div>
    <div class="stat-tile">
      <span class="val">${formatTimeSafe(totalTime)}</span>
      <span class="lbl">Total Duration</span>
    </div>
    <div class="stat-tile">
      <span class="val">${hintsUsedNum}</span>
      <span class="lbl">Hints Used</span>
    </div>
    <div class="stat-tile">
      <span class="val">${consistencyScore.toFixed(1)}/10</span>
      <span class="lbl">Consistency</span>
    </div>
    <div class="stat-tile">
      <span class="val">${esc(consistencyLabel)}</span>
      <span class="lbl">Stability</span>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Average Criteria Scores</h2>
    <div class="criteria-grid">
      ${criteriaKeys.map(k => `
      <div class="criteria-tile">
        <span class="c-name">${k.replace('_',' ')}</span>
        <span class="c-val">${criteriaAvgs[k].toFixed(1)}</span>
        <div class="criteria-bar"><div class="criteria-bar-fill" style="width:${Math.min(100, criteriaAvgs[k]*10)}%"></div></div>
      </div>`).join('')}
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Performance Insights</h2>
    <div class="insights-grid">
      <div class="insight-card success">
        <h3>✨ Key Strengths</h3>
        <div class="insight-row"><span>Strongest Area</span><span class="val">${esc(strongestArea)}</span></div>
        <div class="insight-row"><span>Best Score</span><span class="val">${bestScore.toFixed(1)}/10</span></div>
        <div class="insight-row"><span>Efficiency</span><span class="val">${esc(efficiency)}</span></div>
      </div>
      <div class="insight-card warning">
        <h3>🚀 Growth Opportunities</h3>
        <div class="insight-row"><span>Weakest Area</span><span class="val">${esc(weakestArea)}</span></div>
        <div class="insight-row"><span>Lowest Score</span><span class="val">${worstScore.toFixed(1)}/10</span></div>
        <div class="insight-row"><span>Score Range</span><span class="val">${(bestScore - worstScore).toFixed(1)} pts</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Detailed Question Breakdown</h2>
    <div class="q-list">
      ${summaryData.evaluations.map((e: any, i: number) => {
        const histItem = questionHistory[i];
        const userAns = histItem?.answer || (e as any).user_answer || "";
        const modelAns = histItem?.feedback?.model_answer || (e as any).model_answer || "";
        const critScores = (e as any).criteria_scores || {};
        const timeSpent = (e as any).time_spent_seconds;
        const qHints = (e as any).hints_used;
        const improveSuggestions = (e as any).improvement_suggestions || histItem?.feedback?.improvement_suggestions || [];

        return `
      <div class="q-card">
        <div class="q-card-header">
          <div>
            <span class="q-tag">Q${i+1}</span>
            <span class="q-badge">${esc(e.rating || '')}</span>
            ${timeSpent ? `<span class="q-badge">⏱ ${formatTimeSafe(timeSpent)}</span>` : ''}
            ${qHints ? `<span class="q-badge">💡 ${qHints} hint${qHints > 1 ? 's' : ''}</span>` : ''}
          </div>
          <span class="q-score-pill">${e.score.toFixed(1)} / 10</span>
        </div>
        <div class="q-card-body">
          <div class="q-title">${esc(e.question || '')}</div>

          ${Object.keys(critScores).length > 0 ? `
          <div class="q-mini-criteria">
            ${Object.entries(critScores).map(([k, v]) => `<span>${k.replace('_',' ')}: ${typeof v === 'number' ? (v as number).toFixed(1) : v}</span>`).join('')}
          </div>` : ''}

          <div class="q-feedback-text">${esc(e.summary || e.detailed_feedback || '')}</div>

          ${(userAns || modelAns) ? `
          <div class="q-answers">
            <div class="q-answer-box user">
              <h5>📝 Your Answer</h5>
              <pre>${userAns === "[Skipped]" ? "<em>Question was skipped</em>" : esc(userAns).substring(0, 1500)}${userAns.length > 1500 ? '...' : ''}</pre>
            </div>
            <div class="q-answer-box model">
              <h5>✅ Model Answer</h5>
              <pre>${modelAns ? esc(modelAns).substring(0, 1500) + (modelAns.length > 1500 ? '...' : '') : '<em>Not available</em>'}</pre>
            </div>
          </div>` : ''}

          <div class="q-points">
            <div class="q-point-col strengths">
              <h4>✓ Strengths</h4>
              <ul class="q-point-list">
                ${(e.strengths || []).map((s: string) => `<li>${esc(s)}</li>`).join('') || '<li>N/A</li>'}
              </ul>
            </div>
            <div class="q-point-col weaknesses">
              <h4>✗ Areas to Improve</h4>
              <ul class="q-point-list">
                ${(e.weaknesses || []).map((w: string) => `<li>${esc(w)}</li>`).join('') || '<li>N/A</li>'}
              </ul>
            </div>
          </div>

          ${improveSuggestions.length > 0 ? `
          <div class="q-suggestions">
            <h4>→ Improvement Suggestions</h4>
            <ul>
              ${improveSuggestions.map((s: string) => `<li>${esc(s)}</li>`).join('')}
            </ul>
          </div>` : ''}
        </div>
      </div>`;
      }).join('')}
    </div>
  </div>

  <div class="footer">
    Generated with Stratax AI Interview Intelligence &bull; ${new Date().toLocaleString()}<br/>
    <strong>Total Time:</strong> ${formatTimeSafe(totalTime)} &bull; <strong>Hints Used:</strong> ${hintsUsedNum} &bull; <strong>Average Score:</strong> ${avgScore.toFixed(1)}/10
  </div>
</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-report-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Report Downloaded", description: "Your detailed report has been saved. Open the HTML file in your browser and print to PDF." });
  };

  // Summary Phase
  if (phase === "summary" && summary) {
    // Calculate performance insights
    const scores = summary.evaluations.map(e => e.score);
    const bestScore = Math.max(...scores, 0);
    const worstScore = Math.min(...scores, bestScore);
    const avgScore = summary.average_score;
    const scoreVariance = scores.length > 1
      ? Math.sqrt(scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length)
      : 0;
    const consistencyScore = Math.max(0, 10 - (scoreVariance * 2)); // Dynamic consistency score

    // If a question is selected, show side-by-side comparison
    if (selectedQuestionIndex !== null && questionHistory[selectedQuestionIndex]) {
      const selected = questionHistory[selectedQuestionIndex];
      const evaluation = summary.evaluations[selectedQuestionIndex];

      return (
        <div className="h-full overflow-auto p-3 sm:p-4">
          <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">
            {/* Back button */}
            <Button
              variant="outline"
              onClick={() => setSelectedQuestionIndex(null)}
              className="mb-2"
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to Summary
            </Button>

            {/* Question Header */}
            <Card>
              <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">Question {selectedQuestionIndex + 1}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selected.question.question_text}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl sm:text-3xl font-bold text-primary">{evaluation.score.toFixed(1)}</div>
                    <Badge variant="secondary" className="mt-1">{evaluation.rating}</Badge>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Side-by-Side Comparison */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Your Answer */}
              <Card className="border-blue-500/30">
                <CardHeader className="bg-gradient-to-r from-blue-500/10 to-transparent border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Your Answer
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 sm:pt-6">
                  <ScrollArea className="h-[300px] sm:h-[500px] pr-4">
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-sm bg-muted/30 rounded-lg p-3 sm:p-4 leading-relaxed">
                        {selected.answer === "[Skipped]" ? (
                          <span className="text-muted-foreground italic">Question was skipped</span>
                        ) : (
                          selected.answer
                        )}
                      </pre>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Model Answer */}
              <Card className="border-green-500/30">
                <CardHeader className="bg-gradient-to-r from-green-500/10 to-transparent border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Model Answer
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 sm:pt-6">
                  <ScrollArea className="h-[300px] sm:h-[500px] pr-4">
                    <div className="prose prose-sm max-w-none">
                      {selected.feedback.model_answer ? (
                        <pre className="whitespace-pre-wrap text-sm bg-muted/30 rounded-lg p-3 sm:p-4 leading-relaxed">
                          {selected.feedback.model_answer}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No model answer available</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Feedback */}
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base">Detailed Feedback</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {/* Criteria Scores */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Evaluation Criteria</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                    <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center border">
                      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1">Correctness</div>
                      <div className="text-lg sm:text-xl font-bold">{selected.feedback.criteria_scores.correctness}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center border">
                      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1">Completeness</div>
                      <div className="text-lg sm:text-xl font-bold">{selected.feedback.criteria_scores.completeness}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center border">
                      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1">Clarity</div>
                      <div className="text-lg sm:text-xl font-bold">{selected.feedback.criteria_scores.clarity}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center border">
                      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1">Confidence</div>
                      <div className="text-lg sm:text-xl font-bold">{selected.feedback.criteria_scores.confidence}</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-2 sm:p-3 text-center border">
                      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mb-1">Tech Depth</div>
                      <div className="text-lg sm:text-xl font-bold">{selected.feedback.criteria_scores.technical_depth}</div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Strengths and Weaknesses */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Strengths
                    </h4>
                    <ul className="space-y-2">
                      {selected.feedback.strengths.map((strength, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-sm bg-green-500/5 p-2 rounded border border-green-500/20">
                          <span className="text-green-500 font-bold mt-0.5">✓</span>
                          <span className="text-muted-foreground flex-1">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      Weaknesses
                    </h4>
                    <ul className="space-y-2">
                      {selected.feedback.weaknesses.map((weakness, idx) => (
                        <li key={idx} className="flex gap-2 items-start text-sm bg-red-500/5 p-2 rounded border border-red-500/20">
                          <span className="text-red-500 font-bold mt-0.5">×</span>
                          <span className="text-muted-foreground flex-1">{weakness}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <Separator />

                {/* Improvement Suggestions */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                    Improvement Suggestions
                  </h4>
                  <ul className="space-y-2">
                    {selected.feedback.improvement_suggestions.map((suggestion, idx) => (
                      <li key={idx} className="flex gap-2 items-start text-sm bg-orange-500/5 p-2 rounded border border-orange-500/20">
                        <span className="text-orange-500 font-bold mt-0.5">→</span>
                        <span className="text-muted-foreground flex-1">{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4 pb-6">
          <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-xl">
            <CardHeader className="border-b border-border/30 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">🎉 Interview Complete!</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Here's your performance summary
                  </p>
                  {endedEarlyData?.ended_early && (
                    <div className="inline-flex items-center px-3 py-1 mt-2 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs font-medium">
                      ⚠️ Ended early — {endedEarlyData.questions_answered ?? summary.questions_answered}/{endedEarlyData.total_questions ?? summary.total_questions} answered
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-bold text-primary">{summary.average_score.toFixed(1)}</div>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {summary.average_score >= 8 ? "Excellent" :
                      summary.average_score >= 6 ? "Good" :
                        summary.average_score >= 4 ? "Fair" : "Needs Work"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-3">
                  <div className="text-xl font-bold">{summary.questions_answered}</div>
                  <p className="text-[10px] text-muted-foreground">Questions Answered</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 rounded-xl p-3">
                  <div className="text-xl font-bold capitalize">{summary.difficulty}</div>
                  <p className="text-[10px] text-muted-foreground">Difficulty Level</p>
                </div>
                <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl p-3">
                  <div className="text-xl font-bold">{consistencyScore.toFixed(1)}/10</div>
                  <p className="text-[10px] text-muted-foreground">Consistency</p>
                </div>
                <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 rounded-xl p-3">
                  <div className="text-xl font-bold capitalize">{summary.interview_type}</div>
                  <p className="text-[10px] text-muted-foreground">Interview Type</p>
                </div>
              </div>

              <Separator className="opacity-30" />

              {/* Performance Insights */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="bg-green-500/5 rounded-xl p-3">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Strongest Performance
                  </h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Best Score</span>
                      <span className="text-base font-bold text-green-500">{bestScore.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Total Time</span>
                      <span className="text-xs font-mono">{formatTimeSafe((summary as any).total_time_seconds ?? (summary as any).progress?.total_time_seconds ?? progressData?.total_time_seconds ?? (elapsedTime > 0 ? elapsedTime : undefined))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Hints Used</span>
                      <span className="text-xs">{(summary as any).total_hints_used ?? (summary as any).hints_used_total ?? (summary as any).progress?.hints_used_total ?? progressData?.hints_used_total ?? hintsUsed ?? 0}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-500/5 rounded-xl p-3">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4 text-orange-500" />
                    Areas to Improve
                  </h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Lowest Score</span>
                      <span className="text-base font-bold text-orange-500">{worstScore.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Score Range</span>
                      <span className="text-xs">{(bestScore - worstScore).toFixed(1)} points</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Efficiency Rating</span>
                        <span className="text-xs">
                          {((summary as any).total_hints_used ?? progressData?.hints_used_total ?? hintsUsed ?? 0) < 3 ? "Excellent" :
                            ((summary as any).total_hints_used ?? progressData?.hints_used_total ?? hintsUsed ?? 0) < 6 ? "Good" : "Needs Work"}
                        </span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="opacity-30" />

              {/* Optional: trajectory + evaluation trace */}
              {summary.trajectory && (
                ((summary.trajectory as any).note || (summary.trajectory as any).overall || (summary.trajectory as any).dimensions) && (
                  <div className="bg-muted/20 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">Session trajectory</div>
                      {typeof (summary.trajectory as any)?.overall?.delta === 'number' && (
                        <Badge variant="outline">
                          Overall Δ {(summary.trajectory as any).overall.delta > 0 ? '+' : ''}{(summary.trajectory as any).overall.delta}
                        </Badge>
                      )}
                    </div>
                    {typeof (summary.trajectory as any).note === 'string' && (summary.trajectory as any).note.trim() && (
                      <div className="text-xs text-muted-foreground mt-2 leading-relaxed">{(summary.trajectory as any).note}</div>
                    )}
                    {(summary.trajectory as any).dimensions && typeof (summary.trajectory as any).dimensions === 'object' && (
                      <div className="flex flex-wrap gap-2 pt-3">
                        {Object.entries((summary.trajectory as any).dimensions as Record<string, any>).map(([dim, info]) => {
                          const delta = (info as any)?.delta;
                          if (typeof delta !== 'number') return null;
                          return (
                            <Badge key={dim} variant="secondary" className="capitalize">
                              {dim} Δ {delta > 0 ? '+' : ''}{delta}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )
              )}

              {summary.evaluation_trace && (
                (((summary.evaluation_trace as any).criteria_averages && typeof (summary.evaluation_trace as any).criteria_averages === 'object') ||
                  (Array.isArray((summary.evaluation_trace as any).why) && (summary.evaluation_trace as any).why.length > 0)) && (
                  <div className="bg-muted/20 rounded-xl p-4">
                    <div className="text-sm font-semibold mb-2">Why this score</div>
                    {(summary.evaluation_trace as any).criteria_averages && typeof (summary.evaluation_trace as any).criteria_averages === 'object' && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries((summary.evaluation_trace as any).criteria_averages as Record<string, any>).map(([k, v]) => {
                          if (typeof v !== 'number') return null;
                          return (
                            <Badge key={k} variant="secondary" className="capitalize">
                              {k}: {v}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                    {Array.isArray((summary.evaluation_trace as any).why) && (summary.evaluation_trace as any).why.length > 0 && (
                      <ul className="space-y-1.5 mt-3">
                        {(summary.evaluation_trace as any).why.map((line: any, idx: number) => (
                          <li key={idx} className="flex gap-2 items-start text-xs">
                            <span className="text-primary font-bold mt-0.5">•</span>
                            <span className="text-muted-foreground flex-1">{String(line)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              )}

              <div>
                <h3 className="text-sm font-semibold mb-3">Question Performance - Click to Compare Answers</h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                  {summary.evaluations.map((evaluation, idx) => (
                    <div
                      key={idx}
                      className="bg-muted/20 rounded-xl p-3 space-y-2 cursor-pointer hover:bg-primary/5 hover:shadow-md transition-all duration-200"
                      onClick={() => setSelectedQuestionIndex(idx)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-semibold text-muted-foreground">Question {idx + 1}</span>
                            <Badge variant={
                              evaluation.rating === "Excellent" ? "default" :
                                evaluation.rating === "Good" || evaluation.rating === "Strong" ? "secondary" :
                                  evaluation.rating === "Fair" ? "outline" : "destructive"
                            } className="text-[10px] px-1.5 py-0">
                              {evaluation.rating}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              Click to compare
                            </Badge>
                          </div>
                          <p className="text-xs mb-1.5 line-clamp-2">{evaluation.question}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xl font-bold">{evaluation.score.toFixed(1)}</div>
                          <p className="text-[10px] text-muted-foreground">Score</p>
                        </div>
                      </div>
                      {evaluation.summary && (
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 line-clamp-2">
                          {evaluation.summary}
                        </p>
                      )}
                      {evaluation.model_answer && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                            📖 View Model Answer
                          </summary>
                          <div className="mt-2 p-3 bg-green-500/5 rounded-lg">
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                              {evaluation.model_answer}
                            </p>
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Skipped Questions */}
              {endedEarlyData?.skipped_questions && endedEarlyData.skipped_questions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    Skipped Questions
                  </h3>
                  <div className="space-y-2">
                    {endedEarlyData.skipped_questions.map((q) => (
                      <div key={q.question_number} className="p-3 bg-muted/20 rounded-xl border border-dashed border-border/40">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground font-medium">Q{q.question_number}</span>
                          {q.question_type && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                              {q.question_type.replace('_', ' ')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs">{q.question}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 gap-2"
                  onClick={() => handleDownloadReport(summary, bestScore, worstScore, consistencyScore)}
                >
                  <Download className="h-4 w-4" />
                  Download Report
                </Button>
                <Button onClick={handleRestart} size="lg" className="flex-[2] gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Start New Interview
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // History View Phase - Show past interview session with question comparison
  if (phase === "history" && selectedHistorySession) {
    const currentEval = selectedQuestionIndex !== null && selectedHistorySession.evaluations?.[selectedQuestionIndex]
      ? selectedHistorySession.evaluations[selectedQuestionIndex]
      : null;

    const handleBackToSetup = () => {
      setPhase("setup");
      setSelectedQuestionIndex(null);
    };

    // Safety check: if no evaluations, show error message
    if (!selectedHistorySession.evaluations || selectedHistorySession.evaluations.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-4 gap-4">
          <Card className="max-w-md">
            <CardContent className="py-6 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Questions Found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                This interview session doesn't have any recorded questions and answers.
              </p>
              <Button onClick={handleBackToSetup} variant="outline">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back to Setup
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col">
        {/* Fixed Header */}
        <div className="flex-shrink-0 p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToSetup}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Setup
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {selectedHistorySession.interview_type?.replace('_', ' ') || 'Interview'}
                </Badge>
                <Badge variant="secondary" className="capitalize">{selectedHistorySession.difficulty || 'Unknown'}</Badge>
                {selectedHistorySession.average_score != null && (
                  <Badge className="bg-primary/10 text-primary border-primary/20">
                    ⭐ {selectedHistorySession.average_score.toFixed(1)}/10
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">
                {selectedHistorySession.started_at
                  ? new Date(selectedHistorySession.started_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                  : 'Unknown date'
                }
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setHistoryExpanded(true)}
                title="Expand answers"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Question Navigation Pills */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Questions:</span>
            <div className="flex flex-wrap gap-2">
              {selectedHistorySession.evaluations?.map((evaluation, idx) => (
                <Button
                  key={idx}
                  variant={selectedQuestionIndex === idx ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedQuestionIndex(idx)}
                  className="min-w-[50px] h-8"
                >
                  {idx + 1}
                  {evaluation.score != null && (
                    <span className="ml-1 text-xs opacity-70">
                      ({evaluation.score.toFixed(1)})
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        {currentEval && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-7xl mx-auto">
              {/* Question Card */}
              <Card className="mb-4">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">
                        Question {(selectedQuestionIndex ?? 0) + 1} of {selectedHistorySession.evaluations?.length || 0}
                      </CardTitle>
                      <p className="text-sm leading-relaxed">{currentEval.question}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-primary">{currentEval.score.toFixed(1)}</span>
                        <span className="text-sm text-muted-foreground">/ 10</span>
                      </div>
                      <Badge variant={
                        currentEval.rating === "Excellent" || currentEval.rating === "excellent" ? "default" :
                          currentEval.rating === "Good" || currentEval.rating === "good" ||
                            currentEval.rating === "Strong" || currentEval.rating === "strong" ? "secondary" :
                            "outline"
                      } className="capitalize">
                        {currentEval.rating}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Side-by-Side Answer Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {/* Your Answer */}
                <Card className="border-l-4 border-l-orange-500">
                  <CardHeader className="bg-gradient-to-r from-orange-500/10 to-transparent pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                      Your Answer
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="prose prose-sm max-w-none">
                        {currentEval.user_answer ? (
                          <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-4 leading-relaxed font-sans">
                            {currentEval.user_answer}
                          </pre>
                        ) : (
                          <div className="flex items-center justify-center h-32 text-muted-foreground italic text-sm">
                            No answer provided
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Model Answer */}
                <Card className="border-l-4 border-l-green-500">
                  <CardHeader className="bg-gradient-to-r from-green-500/10 to-transparent pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Model Answer
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="prose prose-sm max-w-none">
                        {currentEval.model_answer ? (
                          <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-4 leading-relaxed font-sans">
                            {currentEval.model_answer}
                          </pre>
                        ) : (
                          <div className="flex items-center justify-center h-32 text-muted-foreground italic text-sm">
                            Model answer not available
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Expanded history dialog (both answers) */}
              {currentEval && (
                <Dialog open={historyExpanded} onOpenChange={setHistoryExpanded}>
                  <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-5xl lg:max-w-7xl max-h-[95vh] flex flex-col p-0">
                    <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b">
                      <div className="flex items-center justify-between pr-8">
                        <DialogTitle className="text-lg font-semibold">Expanded Answers</DialogTitle>
                      </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 scrollbar-hide">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                        <div className="flex flex-col">
                          <h3 className="text-base font-semibold mb-3">Your Answer</h3>
                          <ScrollArea className="h-[70vh] pr-4">
                            <div className="prose prose-lg max-w-none">
                              {currentEval.user_answer ? (
                                <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-6 leading-relaxed font-sans">
                                  {currentEval.user_answer}
                                </pre>
                              ) : (
                                <div className="flex items-center justify-center h-32 text-muted-foreground italic text-sm">
                                  No answer provided
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>

                        <div className="flex flex-col">
                          <h3 className="text-base font-semibold mb-3">Model Answer</h3>
                          <ScrollArea className="h-[70vh] pr-4">
                            <div className="prose prose-lg max-w-none">
                              {currentEval.model_answer ? (
                                <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-6 leading-relaxed font-sans">
                                  {currentEval.model_answer}
                                </pre>
                              ) : (
                                <div className="flex items-center justify-center h-32 text-muted-foreground italic text-sm">
                                  Model answer not available
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {/* Feedback Card */}
              {currentEval.feedback && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      Detailed Feedback
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {currentEval.feedback}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};
