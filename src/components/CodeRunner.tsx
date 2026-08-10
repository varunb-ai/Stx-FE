import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, StickyNote, Zap, Cpu, HardDrive, Keyboard, ChevronDown, StopCircle, RotateCcw, Code2, Terminal, Activity, ChevronLeft, ChevronRight, Search, Eye, EyeOff } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import OutputExplanation from "@/components/OutputExplanation";
import { apiCreateSession, apiExecuteCode, apiListCodeLanguages, type CodeExecuteTraceEvent } from "@/lib/api";
import { useSearchParams } from "react-router-dom";
import { MonacoEditor } from "./MonacoEditor";

type SampleKind = 'python' | 'node' | 'java' | 'cpp' | 'c' | 'go' | 'sql';

type RunnerLanguage = {
  /** Free-form: the server owns the list, so new languages appear without a redeploy. */
  id: string;
  name: string;
  sampleKind: SampleKind;
  /** Resolved runtime, e.g. "Python (3.14.0)". Absent until the server answers. */
  runtime?: string | null;
  supportsTrace?: boolean;
};

/**
 * "Python (3.14.0)" -> "3.14.0", "JavaScript (Node.js 22.08.0)" -> "Node.js 22.08.0".
 * The language name is already the label beside it; repeating it is noise.
 */
function formatRuntime(runtime: string): string {
  const match = runtime.match(/\(([^)]*)\)\s*$/);
  return (match ? match[1] : runtime).trim();
}

/** Starter snippet per language id. Purely client-side knowledge. */
const SAMPLE_KIND_BY_ID: Record<string, SampleKind> = {
  python: 'python',
  javascript: 'node',
  typescript: 'node',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  csharp: 'c',
  go: 'go',
  rust: 'c',
  sql: 'sql',
};

const RUNNER_LANGUAGES: RunnerLanguage[] = [
  { id: 'python', name: 'Python', sampleKind: 'python' },
  { id: 'javascript', name: 'JavaScript (Node.js)', sampleKind: 'node' },
  { id: 'java', name: 'Java (OpenJDK)', sampleKind: 'java' },
  { id: 'cpp', name: 'C++ (GCC)', sampleKind: 'cpp' },
  { id: 'c', name: 'C (GCC)', sampleKind: 'c' },
  { id: 'csharp', name: 'C# (.NET)', sampleKind: 'c' },
  { id: 'go', name: 'Go', sampleKind: 'go' },
  { id: 'sql', name: 'SQL (SQLite)', sampleKind: 'sql' },
];

const STORAGE_KEYS = {
  CODE_SOURCE: 'code-runner-source',
  CODE_STDIN: 'code-runner-stdin',
  CODE_LANGUAGE: 'code-runner-language',
  CODE_RESULT: 'code-runner-result',
  CODE_EXPLANATION: 'code-runner-explanation',
  CODE_TRACE_EVENTS: 'code-runner-trace-events',
  CODE_TRACE_ENABLED: 'code-runner-trace-enabled',
  CODE_TRACE_MAX_EVENTS: 'code-runner-trace-max-events',
  TIMER_SECONDS: 'code-runner-timer-seconds',
  TIMER_ACTIVE: 'code-runner-timer-active',
};

export const CodeRunner = () => {
  const [languages, setLanguages] = useState<RunnerLanguage[]>(RUNNER_LANGUAGES);
  const [languageId, setLanguageId] = useState<RunnerLanguage['id']>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CODE_LANGUAGE);
      if (saved && RUNNER_LANGUAGES.some(l => l.id === saved)) return saved as RunnerLanguage['id'];
    } catch {}
    return 'python';
  });
  const [source, setSource] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CODE_SOURCE);
      return stored || sampleCode("python");
    } catch {
      return sampleCode("python");
    }
  });
  const [stdin, setStdin] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.CODE_STDIN) || '';
    } catch {
      return '';
    }
  });
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ stdout?: string; stderr?: string; compile?: string; time?: string | null; memory?: number | null } | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CODE_RESULT);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [explanation, setExplanation] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.CODE_EXPLANATION) || '';
    } catch {
      return '';
    }
  });
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'compile' | 'errors' | 'explain' | 'visualize'>("output");
  const [sessionId, setSessionId] = useState<string>("");
  const RUNNER_SESSION_KEY = 'ia_runner_session_id';

  const [traceEnabled, setTraceEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEYS.CODE_TRACE_ENABLED) === '1'; } catch { return false; }
  });
  const [traceMaxEvents, setTraceMaxEvents] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CODE_TRACE_MAX_EVENTS);
      const n = raw ? Number(raw) : 2000;
      return Number.isFinite(n) && n > 0 ? n : 2000;
    } catch {
      return 2000;
    }
  });
  const [traceEvents, setTraceEvents] = useState<CodeExecuteTraceEvent[] | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CODE_TRACE_EVENTS);
      return raw ? (JSON.parse(raw) as CodeExecuteTraceEvent[]) : null;
    } catch {
      return null;
    }
  });

  const [lineExplanations, setLineExplanations] = useState<Record<string, string> | null>(null);

  const [selectedTraceIndex, setSelectedTraceIndex] = useState(0);
  const [localsQuery, setLocalsQuery] = useState('');
  const [localsMode, setLocalsMode] = useState<'changed' | 'all'>('changed');
  const [showSystemLocals, setShowSystemLocals] = useState(false);

  useEffect(() => {
    if (traceEvents && traceEvents.length > 0) setSelectedTraceIndex(0);
  }, [traceEvents]);

  // Which languages this deployment can actually run, and on which runtime.
  //
  // The dropdown used to be a hardcoded constant maintained separately from the
  // backend, which is how it came to offer C# and SQL that the server did not
  // support: picking either ran the source through a Python interpreter and
  // returned a SyntaxError. The static list is now only the pre-flight
  // placeholder and the offline fallback.
  const [languagesError, setLanguagesError] = useState<string | null>(null);
  const [executionEnabled, setExecutionEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiListCodeLanguages();
        if (cancelled) return;

        const fromServer: RunnerLanguage[] = (data.languages || []).map((l) => ({
          id: l.id,
          name: l.label,
          sampleKind: SAMPLE_KIND_BY_ID[l.id] ?? 'python',
          runtime: l.runtime ?? null,
          supportsTrace: Boolean(l.supports_trace),
        }));

        if (fromServer.length > 0) setLanguages(fromServer);
        setExecutionEnabled(Boolean(data.enabled));
        setLanguagesError(null);
      } catch (e: any) {
        if (cancelled) return;
        // Keep the built-in list so the editor still works; only the runtime
        // labels are lost.
        setLanguagesError(String(e?.message || 'Could not load the language list'));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Lets a run be cancelled. The backend caps a request at 45s, but a user who
  // has already spotted their infinite loop should not have to wait for it.
  const runAbortRef = useRef<AbortController | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const startedAt = performance.now();
    setElapsedMs(0);
    const id = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 100);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const onStop = useCallback(() => {
    runAbortRef.current?.abort();
    runAbortRef.current = null;
  }, []);

  // Professional features state
  const [panelWidth, setPanelWidth] = useState(50); // Percentage
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<string>(() => {
    try { return localStorage.getItem('interview-notes') || ''; } catch { return ''; }
  });
  const [timerActive, setTimerActive] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.TIMER_ACTIVE) === 'true';
    } catch {
      return false;
    }
  });
  const [timerSeconds, setTimerSeconds] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.TIMER_SECONDS);
      return stored ? parseInt(stored, 10) : 2700; // 45 minutes default
    } catch {
      return 2700;
    }
  });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTimerDialog, setShowTimerDialog] = useState(false);
  const [timerInput, setTimerInput] = useState({ hours: 0, minutes: 45 });
  const [mobileView, setMobileView] = useState<'code' | 'output'>('code'); // Mobile toggle between code and output
  const monacoRef = useRef<any>(null);
  const { toast } = useToast();

  // Tracing temporarily removed

  useEffect(() => {
    // Get runner session ID from localStorage (separate from assistant session)
    try {
      const stored = window.localStorage.getItem(RUNNER_SESSION_KEY);
      if (stored) setSessionId(stored);
    } catch { }

    // Backend-only runner: language list is static and code executes via /api/code/execute.
    // If another feature suggests a language, adopt it.
    try {
      const suggestedLang = localStorage.getItem('code-runner-language-suggest');
      if (suggestedLang) {
        localStorage.removeItem('code-runner-language-suggest');
        const s = suggestedLang.toLowerCase();
        const match = RUNNER_LANGUAGES.find(l => l.id === s || l.name.toLowerCase().includes(s));
        if (match) setLanguageId(match.id);
      }
    } catch {}
  }, []);

  // Ensure we have a valid session for Explain tab
  useEffect(() => {
    (async () => {
      try {
        if (!sessionId) {
          const res = await apiCreateSession();
          setSessionId(res.session_id);
          try { window.localStorage.setItem(RUNNER_SESSION_KEY, res.session_id); } catch { }
        }
      } catch (e) {
        // Non-fatal: Explain tab will handle retry as well
        console.warn("Failed to initialize runner session", e);
      }
    })();
  }, [sessionId]);

  // Initialize timer input from saved timer seconds
  useEffect(() => {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    setTimerInput({ hours, minutes });
  }, []); // Only on mount

  // Save notes to localStorage
  useEffect(() => {
    try { localStorage.setItem('interview-notes', notes); } catch { }
  }, [notes]);

  // Save source code to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.CODE_SOURCE, source); } catch { }
  }, [source]);

  // Save stdin to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.CODE_STDIN, stdin); } catch { }
  }, [stdin]);

  // Save result to localStorage
  useEffect(() => {
    if (result) {
      try { localStorage.setItem(STORAGE_KEYS.CODE_RESULT, JSON.stringify(result)); } catch { }
    }
  }, [result]);

  // Save explanation to localStorage
  useEffect(() => {
    if (explanation) {
      try { localStorage.setItem(STORAGE_KEYS.CODE_EXPLANATION, explanation); } catch { }
    }
  }, [explanation]);

  // Save timer state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TIMER_SECONDS, String(timerSeconds));
      localStorage.setItem(STORAGE_KEYS.TIMER_ACTIVE, String(timerActive));
    } catch { }
  }, [timerSeconds, timerActive]);

  // Save language ID to localStorage
  useEffect(() => {
    if (languageId) {
      try { localStorage.setItem(STORAGE_KEYS.CODE_LANGUAGE, String(languageId)); } catch { }
    }
  }, [languageId]);

  // Timer logic
  useEffect(() => {
    if (!timerActive || timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          setTimerActive(false);
          toast({ title: "Time's up!", description: "Interview time has elapsed.", variant: "destructive" });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timerSeconds, toast]);

  const langLabel = useMemo(() => languages.find(l => l.id === languageId)?.name || "Language", [languages, languageId]);

  const onRun = useCallback(async (opts?: { forceTrace?: boolean }) => {
    // Clear any previous explanation before a new run starts
    try { localStorage.removeItem(STORAGE_KEYS.CODE_EXPLANATION); } catch { }
    setExplanation('');

    const currentLangLabel = languages.find(l => l.id === languageId)?.name || "Language";

    setIsRunning(true);
    setResult(null);
    setTraceEvents(null);
    setLineExplanations(null);
    try { localStorage.removeItem(STORAGE_KEYS.CODE_TRACE_EVENTS); } catch { }

    try {
      // Backend-only execution.
      // For Java: normalize to a Main class for single-file runners.
      let sendSource = source;
      const langLabelLower = currentLangLabel.toLowerCase();
      if (langLabelLower.includes('java')) {
        sendSource = transformJavaForSingleFileRunner(source);
      }

      const doTrace = (opts?.forceTrace ?? traceEnabled) && languageId === 'python';

      // Replace any in-flight run, so a double-click cannot leave two requests
      // racing to write the same output pane.
      runAbortRef.current?.abort();
      const controller = new AbortController();
      runAbortRef.current = controller;

      const r = await apiExecuteCode({
        language: languageId,
        code: sendSource,
        stdin,
        store_code: false,
        trace: doTrace,
        trace_max_events: doTrace ? traceMaxEvents : undefined,
        explain_trace: doTrace,
        explain_max_lines: doTrace ? 200 : undefined,
      }, { signal: controller.signal });

      if (!r || r.success === false) {
        const msg = (r as any)?.stderr || (r as any)?.status || 'Execution failed';
        setResult({ stderr: String(msg) });
        setActiveTab('errors');
        return;
      }

      setResult({
        stdout: r.stdout || undefined,
        stderr: r.stderr || undefined,
        time: typeof r.time_seconds === 'number' ? r.time_seconds.toFixed(3) : undefined,
        memory: typeof r.memory_kb === 'number' ? r.memory_kb : undefined,
      });

      if (doTrace && languageId === 'python') {
        const events = Array.isArray(r.trace_events) ? r.trace_events : null;
        setTraceEvents(events);
        setLineExplanations(r.line_explanations && typeof r.line_explanations === 'object' ? (r.line_explanations as Record<string, string>) : null);
        try { localStorage.setItem(STORAGE_KEYS.CODE_TRACE_EVENTS, JSON.stringify(events || [])); } catch { }
        if (events && events.length > 0) setActiveTab('visualize');
      }

      if (r.stdout) setActiveTab('output');
      else if (r.stderr) setActiveTab('errors');
    } catch (e: any) {
      // Cancelling is a deliberate act, not a failure. Reporting "AbortError"
      // in the errors pane reads like the code crashed.
      if (e?.name === 'AbortError') {
        setResult({ stderr: 'Run stopped.' });
        setActiveTab('errors');
        return;
      }
      setResult({ stderr: String(e?.message || e) });
      setActiveTab('errors');
    } finally {
      runAbortRef.current = null;
      setIsRunning(false);
    }
  }, [languageId, source, stdin, languages, traceEnabled, traceMaxEvents]);

  // Tracing removed

  const onResetAll = useCallback(() => {
    setResult(null);
    setExplanation('');
    setStdin('');
    setSource('');
    try {
      localStorage.removeItem(STORAGE_KEYS.CODE_SOURCE);
      localStorage.removeItem(STORAGE_KEYS.CODE_STDIN);
      localStorage.removeItem(STORAGE_KEYS.CODE_RESULT);
      localStorage.removeItem(STORAGE_KEYS.CODE_EXPLANATION);
    } catch { }
    toast({ title: 'Reset', description: 'Cleared source, input, outputs, explanation, and trace.' });
  }, [toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter to run
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning && languageId) onRun();
      }
      // Ctrl+K to show shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowShortcuts(!showShortcuts);
      }
      // Ctrl+/ for comments (handled by Monaco)
      // Esc to close modals
      if (e.key === 'Escape') {
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, languageId, showShortcuts, onRun]);

  const formatTimer = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTimerDialogOpen = () => {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    setTimerInput({ hours, minutes });
    setShowTimerDialog(true);
  };

  const handleTimerSet = () => {
    const totalSeconds = timerInput.hours * 3600 + timerInput.minutes * 60;
    if (totalSeconds <= 0) {
      toast({ title: "Invalid time", description: "Time must be greater than 0.", variant: "destructive" });
      return;
    }
    setTimerSeconds(totalSeconds);
    setShowTimerDialog(false);
    if (!timerActive) {
      setTimerActive(true);
    }
  };

  const handleTimerToggle = () => {
    if (timerActive) {
      // Stop the timer
      setTimerActive(false);
    } else {
      // Start the timer (if time is set) or show dialog to set time
      if (timerSeconds <= 0) {
        handleTimerDialogOpen();
      } else {
        setTimerActive(true);
      }
    }
  };

  // Handle double-click or long-press to set custom time
  const handleTimerSetTime = () => {
    handleTimerDialogOpen();
  };

  const handleResize = useCallback((e: MouseEvent) => {
    const newWidth = (e.clientX / window.innerWidth) * 100;
    setPanelWidth(Math.max(30, Math.min(70, newWidth)));
  }, []);

  const startResize = useCallback(() => {
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', () => {
      window.removeEventListener('mousemove', handleResize);
    }, { once: true });
  }, [handleResize]);

  const mapLanguageToMonaco = (langName: string): string => {
    const name = langName.toLowerCase();
    if (name.includes('python')) return 'python';
    if (name.includes('javascript') || name.includes('node.js')) return 'javascript';
    if (name.includes('typescript')) return 'typescript';
    if (name.includes('c++') || name.includes('cpp')) return 'cpp';
    if (name.includes('java')) return 'java';
    if (name.includes('go')) return 'go';
    if (name.includes('sql')) return 'sql';
    if (name.includes('c ')) return 'c';
    return name.split(' ')[0];
  };

  const setTraceEnabledPersisted = useCallback((enabled: boolean) => {
    setTraceEnabled(enabled);
    try { localStorage.setItem(STORAGE_KEYS.CODE_TRACE_ENABLED, enabled ? '1' : '0'); } catch { }
  }, []);

  const onToggleTrace = useCallback(() => {
    const next = !traceEnabled;
    setTraceEnabledPersisted(next);
    if (next && languageId !== 'python') {
      toast({
        title: 'Visualize is Python-only',
        description: 'Switch to Python to get line-by-line trace events from the backend.',
      });
    }
  }, [traceEnabled, languageId, toast, setTraceEnabledPersisted]);

  const enableTraceAndRun = useCallback(() => {
    setActiveTab('visualize');
    setTraceEnabledPersisted(true);
    // Force trace for this run (avoids React state timing)
    onRun({ forceTrace: true });
  }, [onRun, setTraceEnabledPersisted]);

  const jumpToLine = useCallback((line: number) => {
    const editor = monacoRef.current as any;
    if (!editor || !line || line <= 0) return;
    try {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    } catch { }
  }, []);

  const sourceLines = useMemo(() => String(source || '').split('\n'), [source]);

  const sanitizeLocals = useCallback((locals: Record<string, unknown> | undefined, includeSystem: boolean) => {
    if (!locals) return {} as Record<string, string>;
    const ignoredExact = new Set([
      '__builtins__',
      '__name__',
      '__doc__',
      '__package__',
      '__loader__',
      '__spec__',
      '__annotations__',
      '__cached__',
      '__file__',
    ]);

    const entries = Object.entries(locals)
      .filter(([k]) => {
        if (ignoredExact.has(k)) return false;
        if (!includeSystem && (k.startsWith('__') || k.startsWith('_'))) return false;
        return true;
      })
      .slice(0, 200);

    const out: Record<string, string> = {};
    for (const [k, v] of entries) {
      let s: string;
      try {
        if (v === null || v === undefined) s = String(v);
        else if (typeof v === 'string') s = v;
        else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
        else s = JSON.stringify(v);
      } catch {
        s = String(v);
      }
      s = s.replace(/\s+/g, ' ').trim();
      if (s.length > 220) s = s.slice(0, 220) + '…';
      out[k] = s;
    }
    return out;
  }, []);

  const traceView = useMemo(() => {
    const events = Array.isArray(traceEvents) ? traceEvents : [];
    const mapped = events.map((ev) => ({
      step: Number((ev as any).step ?? 0),
      line: Number((ev as any).line ?? 0),
      event: String((ev as any).event ?? 'line'),
      explanation: String((ev as any).explanation ?? ''),
      locals: sanitizeLocals((ev as any).locals as any, showSystemLocals),
    }));
    return mapped.map((m, i) => {
      const prev = i > 0 ? mapped[i - 1].locals : {};
      const changedKeys = new Set<string>();
      for (const k of Object.keys(m.locals)) {
        if (prev[k] !== m.locals[k]) changedKeys.add(k);
      }
      for (const k of Object.keys(prev)) {
        if (!(k in m.locals)) changedKeys.add(k);
      }
      return { ...m, changedKeys };
    });
  }, [traceEvents, sanitizeLocals, showSystemLocals]);

  const selectedTrace = traceView[Math.min(Math.max(selectedTraceIndex, 0), Math.max(traceView.length - 1, 0))];
  const selectedLineText = selectedTrace?.line ? (sourceLines[selectedTrace.line - 1] ?? '') : '';

  const selectedExplanation = useMemo(() => {
    const line = selectedTrace?.line;
    if (!line) return '';
    const stepExp = (selectedTrace as any)?.explanation ? String((selectedTrace as any).explanation) : '';
    if (stepExp.trim()) return stepExp;
    return lineExplanations?.[String(line)] ?? '';
  }, [selectedTrace, lineExplanations]);

  const visibleLocalsRows = useMemo(() => {
    const locals = selectedTrace?.locals ?? {};
    const q = localsQuery.trim().toLowerCase();
    let rows = Object.entries(locals);
    if (q) rows = rows.filter(([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
    if (localsMode === 'changed') rows = rows.filter(([k]) => selectedTrace?.changedKeys?.has(k));
    rows.sort(([a], [b]) => a.localeCompare(b));
    return rows;
  }, [selectedTrace, localsQuery, localsMode]);

  const renderVisualizePanel = (variant: 'desktop' | 'mobile') => {
    const isPython = languageId === 'python';
    const hasEvents = traceView.length > 0;

    if (!isPython) {
      return (
        <div className="rounded-lg border p-4 bg-card flex-1 overflow-hidden">
          <div className="text-sm font-semibold">Visualize</div>
          <div className="mt-1 text-xs text-muted-foreground">Python-only right now. Switch language to Python to get line-by-line trace events.</div>
        </div>
      );
    }

    if (!traceEnabled) {
      return (
        <div className="rounded-lg border p-4 bg-card flex-1 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Visualize</div>
              <div className="mt-1 text-xs text-muted-foreground">Enable tracing and run to capture a professional execution timeline.</div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setTraceEnabledPersisted(true)}>Enable</Button>
              <Button size="sm" onClick={enableTraceAndRun} disabled={isRunning}>Enable & Run</Button>
            </div>
          </div>
          <div className="mt-4 rounded-md border bg-background/40 p-3">
            <div className="text-xs font-semibold">What you’ll see</div>
            <div className="mt-1 text-xs text-muted-foreground">A step timeline, line preview, and a clean locals table (system noise hidden by default).</div>
          </div>
        </div>
      );
    }

    if (!hasEvents) {
      return (
        <div className="rounded-lg border p-4 bg-card flex-1 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Visualize</div>
              <div className="mt-1 text-xs text-muted-foreground">No trace events yet. Run your Python code with Visualize enabled.</div>
            </div>
            <Button size="sm" onClick={() => onRun({ forceTrace: true })} disabled={isRunning}>Run (Trace)</Button>
          </div>
        </div>
      );
    }

    const maxIdx = Math.max(traceView.length - 1, 0);
    const idx = Math.min(Math.max(selectedTraceIndex, 0), maxIdx);

    const timelineHeight = variant === 'desktop' ? 'h-[calc(100vh-360px)]' : 'h-40';
    const localsHeight = variant === 'desktop' ? 'h-[calc(100vh-600px)]' : 'h-56';

    return (
      <div className="rounded-lg border p-4 bg-card flex-1 overflow-hidden flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setSelectedTraceIndex(Math.max(0, idx - 1))}
              disabled={idx === 0}
              title="Previous step"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setSelectedTraceIndex(Math.min(maxIdx, idx + 1))}
              disabled={idx === maxIdx}
              title="Next step"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="text-xs text-muted-foreground font-mono">
              Step {selectedTrace?.step ?? idx} / {traceView.length - 1}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
              <Input
                value={localsQuery}
                onChange={(e) => setLocalsQuery(e.target.value)}
                placeholder="Search locals"
                className="h-8 pl-7 w-[180px]"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLocalsMode(m => (m === 'changed' ? 'all' : 'changed'))}
              className="h-8"
              title={localsMode === 'changed' ? 'Showing changed locals' : 'Showing all locals'}
            >
              {localsMode === 'changed' ? 'Changed' : 'All'}
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setShowSystemLocals(v => !v)}
              title={showSystemLocals ? 'Hide system locals' : 'Show system locals'}
            >
              {showSystemLocals ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={maxIdx}
            value={idx}
            onChange={(e) => setSelectedTraceIndex(Number(e.target.value))}
            className="w-full"
          />
          <div className="text-[10px] text-muted-foreground font-mono w-[64px] text-right">#{idx}</div>
        </div>

        <div className={variant === 'desktop' ? 'mt-4 grid grid-cols-5 gap-3 flex-1 min-h-0' : 'mt-4 grid grid-cols-1 gap-3 flex-1 min-h-0'}>
          <div className={variant === 'desktop' ? 'col-span-2 min-h-0' : 'min-h-0'}>
            <div className="rounded-lg border bg-card overflow-hidden h-full flex flex-col">
              <div className="px-3 py-2 border-b">
                <div className="text-xs font-semibold">Timeline</div>
                <div className="text-[10px] text-muted-foreground">Click a step to inspect state</div>
              </div>
              <ScrollArea className={`p-2 ${timelineHeight}`}>
                <div className="space-y-1">
                  {traceView.map((ev, i) => {
                    const selected = i === idx;
                    const exp = (ev as any).explanation ? String((ev as any).explanation) : (lineExplanations?.[String(ev.line)] ?? '');
                    return (
                      <button
                        key={`${ev.step}-${ev.line}-${ev.event}-${i}`}
                        onClick={() => {
                          setSelectedTraceIndex(i);
                          if (ev.line) jumpToLine(ev.line);
                        }}
                        className={`w-full text-left rounded-md border px-2 py-1 transition-colors ${selected ? 'bg-primary/10 border-primary/30' : 'bg-background/40 hover:bg-background'}`}
                        title={`Step ${ev.step} · Line ${ev.line}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono">#{ev.step}</span>
                          <span className="text-xs font-mono text-muted-foreground">L{ev.line}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{ev.event}</span>
                        </div>
                        {exp ? (
                          <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{exp}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className={variant === 'desktop' ? 'col-span-3 min-h-0' : 'min-h-0'}>
            <div className="rounded-lg border bg-card overflow-hidden h-full flex flex-col min-h-0">
              <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold">State</div>
                  <div className="text-[10px] text-muted-foreground font-mono">Line {selectedTrace?.line ?? 0} · {selectedTrace?.event ?? ''}</div>
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={() => selectedTrace?.line && jumpToLine(selectedTrace.line)} disabled={!selectedTrace?.line}>
                  Jump to line
                </Button>
              </div>

              <div className="p-3 border-b bg-background/30">
                <div className="text-[10px] text-muted-foreground">Current line</div>
                <div className="mt-1 rounded-md border bg-background px-2 py-1 font-mono text-xs whitespace-pre overflow-auto">
                  {selectedTrace?.line ? `${selectedTrace.line}: ${selectedLineText}` : '(no line)'}
                </div>
                {selectedExplanation ? (
                  <div className="mt-2 rounded-md border bg-background px-2 py-1">
                    <div className="text-[10px] text-muted-foreground">Explanation</div>
                    <div className="mt-0.5 text-xs">{selectedExplanation}</div>
                  </div>
                ) : null}
              </div>

              <div className="p-3 flex-1 min-h-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">Locals</div>
                  <div className="text-[10px] text-muted-foreground">{visibleLocalsRows.length} vars</div>
                </div>

                {visibleLocalsRows.length === 0 ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    {localsMode === 'changed' ? 'No local changes at this step.' : 'No locals to display.'}
                  </div>
                ) : (
                  <div className="mt-2 rounded-md border overflow-hidden">
                    <ScrollArea className={localsHeight}>
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-10 w-[180px]">Variable</TableHead>
                            <TableHead className="h-10">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleLocalsRows.map(([k, v]) => {
                            const changed = selectedTrace?.changedKeys?.has(k);
                            return (
                              <TableRow key={k} data-state={changed ? 'selected' : undefined}>
                                <TableCell className="py-2 px-3 font-mono align-top">{k}</TableCell>
                                <TableCell className="py-2 px-3 font-mono text-muted-foreground align-top whitespace-pre-wrap break-words">{v}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-none px-0 h-[var(--app-height)] md:h-[calc(100vh-48px)] overflow-x-hidden">
      {/* Top toolbar - Mobile Optimized */}
      <div className="flex items-center justify-between gap-2 px-2 md:px-4 py-2 border-b bg-background/95">
        <div className="flex items-center gap-1 md:gap-2">
          <Link to="/" aria-label="Back to Assistant" title="Back">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="text-sm font-semibold tracking-wide hidden sm:block">Code Runner</div>
        </div>
        
        {/* Mobile: Compact Controls */}
        <div className="flex items-center gap-1 md:gap-2 flex-1 justify-end">
          {/* Visualize (Python-only) */}
          <Button
            variant={traceEnabled ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('visualize');
              onToggleTrace();
            }}
            className="gap-1.5 px-2 md:px-3 hidden sm:flex"
            title="Backend trace (Python-only)"
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Visualize</span>
          </Button>
          {/* Timer - Compact on mobile */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTimerToggle}
              onContextMenu={(e) => {
                e.preventDefault();
                handleTimerDialogOpen();
              }}
              className="gap-1 px-2 md:px-3"
            >
              {timerActive ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <StopCircle className="h-3.5 w-3.5 text-destructive" />
              )}
              <span className={`text-xs md:text-sm ${timerSeconds < 300 && timerActive ? "text-destructive font-mono" : "font-mono"}`}>
                {formatTimer(timerSeconds)}
              </span>
            </Button>
            {timerActive && timerSeconds > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setTimerSeconds(0); setTimerActive(false); }}
                className="gap-1 px-1.5 md:px-2 text-destructive hover:bg-destructive/10"
                title="Reset timer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          
          {/* Notes - Hidden on mobile */}
          <Button variant={showNotes ? "default" : "ghost"} size="sm" onClick={() => setShowNotes(!showNotes)} className="gap-1.5 hidden md:flex">
            <StickyNote className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Notes</span>
          </Button>
          
          {/* Shortcuts - Hidden on mobile */}
          <Button variant="ghost" size="sm" onClick={() => setShowShortcuts(!showShortcuts)} className="gap-1.5 hidden md:flex">
            <Keyboard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Shortcuts</span>
          </Button>
          
          {/* The list fell back to the built-in one. Execution still works for
              the core languages; only the server-confirmed list and runtime
              versions are missing, so this is a note, not an error banner. */}
          {languagesError && (
            <span
              className="hidden lg:inline text-[10px] text-muted-foreground"
              title={`Using the built-in language list: ${languagesError}`}
            >
              offline list
            </span>
          )}

          {/* Language Selector - Compact on mobile */}
          <Select value={languageId ? String(languageId) : undefined} onValueChange={(v) => {
            const id = v as RunnerLanguage['id'];
            setLanguageId(id);
            try { localStorage.removeItem(STORAGE_KEYS.CODE_EXPLANATION); } catch { }
            setExplanation('');
            const lang = RUNNER_LANGUAGES.find(l => l.id === id);
            if (lang) setSource(sampleCode(lang.sampleKind));
          }}>
            <SelectTrigger className="w-[130px] md:w-[260px] text-xs md:text-sm">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map(l => (
                <SelectItem key={l.id} value={String(l.id)}>
                  <span className="flex items-center gap-2">
                    <span>{l.name}</span>
                    {/* The runtime you will actually be judged on. Worth knowing
                        before you type: the backend used to pin Python 3.8. */}
                    {l.runtime && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatRuntime(l.runtime)}
                      </span>
                    )}
                    {l.supportsTrace && (
                      <span className="rounded bg-primary/10 px-1 text-[9px] font-medium uppercase tracking-wide text-primary">
                        step
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Run / Stop. A run can now be abandoned instead of waiting out the
              backend's 45s ceiling. */}
          {isRunning ? (
            <Button
              onClick={onStop}
              size="sm"
              variant="destructive"
              className="shadow-sm gap-1.5 px-2 md:px-3"
              title="Stop the running program"
            >
              <StopCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline tabular-nums">
                Stop · {(elapsedMs / 1000).toFixed(1)}s
              </span>
            </Button>
          ) : (
            <Button
              onClick={() => onRun()}
              disabled={!executionEnabled}
              size="sm"
              className="shadow-sm gap-1 px-2 md:px-3"
              title={executionEnabled ? 'Run (Ctrl+Enter)' : 'Code execution is disabled on this deployment'}
            >
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Run</span>
            </Button>
          )}
        </div>
      </div>

      {/* Mobile View Toggle */}
      <div className="md:hidden flex border-b bg-muted/30">
        <button
          onClick={() => setMobileView('code')}
          className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            mobileView === 'code' ? 'bg-background text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <Code2 className="h-4 w-4" />
          Code
        </button>
        <button
          onClick={() => setMobileView('output')}
          className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            mobileView === 'output' ? 'bg-background text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <Terminal className="h-4 w-4" />
          Output
        </button>
      </div>

      {/* Main split with resizable panels - Desktop */}
      <div className="hidden md:flex relative" style={{ height: 'calc(100% - 44px)' }}>
        {/* Left: Code Editor */}
        <div className="bg-background border-r p-2 lg:p-3 overflow-hidden" style={{ width: `${panelWidth}%`, minWidth: '250px' }}>
          <div className="text-xs mb-2 text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>Source</span>
              <Button size="icon" variant="ghost" className="h-5 w-5" title="Reset editor & outputs" onClick={onResetAll}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </span>
            <span className="font-mono text-[10px]">{source.split('\n').length} lines</span>
          </div>
          <div className="h-[calc(100%-16px)]">
            <MonacoEditor
              value={source}
              language={mapLanguageToMonaco(languages.find(l => l.id === languageId)?.name || 'python')}
              onChange={setSource}
              onMount={(editor) => { monacoRef.current = editor; }}
              height="100%"
            />
          </div>
        </div>
        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          className="w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors active:bg-primary"
          style={{ flexShrink: 0 }}
        />
        {/* Right: Output Panel */}
        <div className="bg-background flex-1 p-2 lg:p-3 overflow-hidden flex flex-col" style={{ minWidth: '250px' }}>
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full flex-1 flex flex-col overflow-hidden">
            <div className="mb-2 flex-shrink-0 overflow-x-auto scrollbar-professional">
              <TabsList className="inline-flex w-auto min-w-full">
                <TabsTrigger value="input" className="whitespace-nowrap flex-shrink-0">Input</TabsTrigger>
                <TabsTrigger value="output" className="whitespace-nowrap flex-shrink-0">Output</TabsTrigger>
                <TabsTrigger value="compile" className="whitespace-nowrap flex-shrink-0">Compiler</TabsTrigger>
                <TabsTrigger value="errors" className="whitespace-nowrap flex-shrink-0">Errors</TabsTrigger>
                <TabsTrigger value="visualize" className="whitespace-nowrap flex-shrink-0">Visualize</TabsTrigger>
                <TabsTrigger value="explain" className="whitespace-nowrap flex-shrink-0">Explain</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <TabsContent value="input" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="mb-2 text-xs text-muted-foreground">
                  Input Simulator: Provide test cases or stdin input
                </div>
                <Textarea
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  className="font-mono flex-1 min-h-0 resize-none"
                  placeholder="Enter test input here...&#10;Example for Python:&#10;5&#10;1 2 3 4 5"
                />
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Tip: Each line will be read by input() in order
                </div>
              </TabsContent>
              <TabsContent value="output" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                  {result?.stdout ? (
                    <pre className="text-xs whitespace-pre-wrap font-mono">{result.stdout}</pre>
                  ) : (
                    <div className="text-xs text-muted-foreground">No output</div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="compile" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                  {result?.compile ? (
                    <pre className="text-xs whitespace-pre-wrap font-mono">{result.compile}</pre>
                  ) : (
                    <div className="text-xs text-muted-foreground">No compiler messages</div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="errors" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                  {result?.stderr ? (
                    <pre className="text-xs whitespace-pre-wrap font-mono text-red-600">{result.stderr}</pre>
                  ) : (
                    <div className="text-xs text-muted-foreground">No errors</div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="visualize" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                {renderVisualizePanel('desktop')}
              </TabsContent>
              <TabsContent value="explain" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                <div className="flex-1 overflow-auto scrollbar-professional">
                  <OutputExplanation
                    output={result?.stdout || ''}
                    code={source}
                    language={langLabel}
                    isActive={activeTab === 'explain'}
                    sessionId={sessionId}
                    explanation={explanation}
                    onExplanationChange={setExplanation}
                  />
                </div>
              </TabsContent>
            </div>
          </Tabs>
          {/* Enhanced Metrics Bar */}
          {result && (
            <div className="mt-3 p-2 bg-muted/30 rounded-lg border flex items-center gap-4 text-xs">
              {result.time ? (
                <div className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{result.time}s</span>
                </div>
              ) : null}
              {typeof result.memory === 'number' ? (
                <div className="flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{(result.memory / 1024).toFixed(2)} MB</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
        {/* Notes Panel */}
        {showNotes && (
          <div className="w-72 border-l bg-background p-3 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <StickyNote className="h-4 w-4" />
                Interview Notes
              </h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNotes(false)}>×</Button>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jot down thoughts, strategies, or observations here..."
              className="flex-1 font-mono text-xs resize-none scrollbar-professional min-h-0"
            />
          </div>
        )}
      </div>

      {/* Mobile Layout - Stacked Panels */}
      <div className="md:hidden flex flex-col" style={{ height: 'calc(100% - 88px)' }}>
        {/* Code Editor - Mobile */}
        {mobileView === 'code' && (
          <div className="flex-1 bg-background p-2 overflow-hidden flex flex-col">
            <div className="text-xs mb-2 text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>Source</span>
                <Button size="icon" variant="ghost" className="h-5 w-5" title="Reset" onClick={onResetAll}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </span>
              <span className="font-mono text-[10px]">{source.split('\n').length} lines</span>
            </div>
            <div className="flex-1 min-h-0">
              <MonacoEditor
                value={source}
                language={mapLanguageToMonaco(languages.find(l => l.id === languageId)?.name || 'python')}
                onChange={setSource}
                onMount={(editor) => { monacoRef.current = editor; }}
                height="100%"
              />
            </div>
            {/* Mobile Input Area */}
            <div className="mt-2 border-t pt-2">
              <div className="text-xs text-muted-foreground mb-1">Input (stdin)</div>
              <Textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                className="font-mono text-xs h-20 resize-none"
                placeholder="Enter test input..."
              />
            </div>
          </div>
        )}

        {/* Output Panel - Mobile */}
        {mobileView === 'output' && (
          <div className="flex-1 bg-background p-2 overflow-hidden flex flex-col">
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full flex-1 flex flex-col overflow-hidden">
              <div className="mb-2 flex-shrink-0 overflow-x-auto scrollbar-professional">
                <TabsList className="inline-flex w-auto">
                  <TabsTrigger value="output" className="text-xs px-2">Output</TabsTrigger>
                  <TabsTrigger value="errors" className="text-xs px-2">Errors</TabsTrigger>
                  <TabsTrigger value="compile" className="text-xs px-2">Compile</TabsTrigger>
                  <TabsTrigger value="visualize" className="text-xs px-2">Visualize</TabsTrigger>
                  <TabsTrigger value="explain" className="text-xs px-2">Explain</TabsTrigger>
                </TabsList>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <TabsContent value="output" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                  <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                    {result?.stdout ? (
                      <pre className="text-xs whitespace-pre-wrap font-mono">{result.stdout}</pre>
                    ) : (
                      <div className="text-xs text-muted-foreground">No output. Run your code to see results.</div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="errors" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                  <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                    {result?.stderr ? (
                      <pre className="text-xs whitespace-pre-wrap font-mono text-red-600">{result.stderr}</pre>
                    ) : (
                      <div className="text-xs text-muted-foreground">No errors</div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="compile" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                  <div className="rounded-lg border p-3 bg-card flex-1 overflow-auto min-h-0 scrollbar-professional">
                    {result?.compile ? (
                      <pre className="text-xs whitespace-pre-wrap font-mono">{result.compile}</pre>
                    ) : (
                      <div className="text-xs text-muted-foreground">No compiler messages</div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="visualize" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                  {renderVisualizePanel('mobile')}
                </TabsContent>
                <TabsContent value="explain" className="flex-1 flex flex-col mt-0 data-[state=active]:flex data-[state=inactive]:hidden overflow-hidden">
                  <div className="flex-1 overflow-auto scrollbar-professional">
                    <OutputExplanation
                      output={result?.stdout || ''}
                      code={source}
                      language={langLabel}
                      isActive={activeTab === 'explain'}
                      sessionId={sessionId}
                      explanation={explanation}
                      onExplanationChange={setExplanation}
                    />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
            {/* Mobile Metrics */}
            {result && (result.time || typeof result.memory === 'number') && (
              <div className="mt-2 p-2 bg-muted/30 rounded-lg border flex items-center gap-4 text-xs">
                {result.time && (
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono">{result.time}s</span>
                  </div>
                )}
                {typeof result.memory === 'number' && (
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono">{(result.memory / 1024).toFixed(2)} MB</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timer Dialog */}
      <Dialog open={showTimerDialog} onOpenChange={setShowTimerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Timer Duration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor="hours">Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  min="0"
                  max="23"
                  value={timerInput.hours}
                  onChange={(e) => setTimerInput({ ...timerInput, hours: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="minutes">Minutes</Label>
                <Input
                  id="minutes"
                  type="number"
                  min="0"
                  max="59"
                  value={timerInput.minutes}
                  onChange={(e) => setTimerInput({ ...timerInput, minutes: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Total: {formatTimer(timerInput.hours * 3600 + timerInput.minutes * 60)}
            </div>
            {timerActive && timerSeconds > 0 && (
              <div className="text-xs text-muted-foreground">
                Current Timer: {formatTimer(timerSeconds)}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowTimerDialog(false)}>Cancel</Button>
            {timerActive && timerSeconds > 0 && (
              <Button variant="destructive" onClick={() => { setTimerSeconds(0); setTimerActive(false); setShowTimerDialog(false); }} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Reset Timer
              </Button>
            )}
            <Button onClick={handleTimerSet}>Set Timer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Keyboard Shortcuts</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowShortcuts(false)}>×</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-sm">Run Code</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl/Cmd + Enter</kbd>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-sm">Toggle Comment</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl/Cmd + /</kbd>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-sm">Show Shortcuts</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl/Cmd + K</kbd>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b">
                <span className="text-sm">Close Modal</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Esc</kbd>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

function sampleCode(kind: 'python' | 'node' | 'cpp' | 'c' | 'java' | 'go' | 'sql'): string {
  switch (kind) {
    case 'python':
      return `print('Hello from Python')\nprint(input())`;
    case 'node':
      return `console.log('Hello from Node.js');\nprocess.stdin.on('data', d => console.log(String(d).trim()));`;
    case 'cpp':
      return `#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n  cout << "Hello from C++" << endl;\n  string s; if(getline(cin,s)) cout << s << endl;\n  return 0;\n}`;
    case 'c':
      return `#include <stdio.h>\nint main(){\n  printf("Hello from C\\n");\n  char s[256]; if(fgets(s,256,stdin)) printf("%s", s);\n  return 0;\n}`;
    case 'java':
      return `import java.util.*;\nclass Main{\n  public static void main(String[] args){\n    System.out.println("Hello from Java");\n    Scanner sc=new Scanner(System.in);\n    if(sc.hasNextLine()) System.out.println(sc.nextLine());\n  }\n}`;
    case 'go':
      return `package main\nimport (\n  "bufio"\n  "fmt"\n  "os"\n)\nfunc main(){\n  fmt.Println("Hello from Go")\n  in:=bufio.NewScanner(os.Stdin)\n  if in.Scan(){ fmt.Println(in.Text()) }\n}`;
    case 'sql':
      return `-- Hello from SQL (SQLite).\n-- Create a demo table and query it.\nCREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO users(name) VALUES ('Alice'), ('Bob'), ('Carol');\nSELECT * FROM users ORDER BY id;`;
  }
}

export default CodeRunner;


// Many sandboxes run single-file Java with an assumed entry file (e.g. Main.java).
// If the class name doesn't match, we normalize to `class Main` and strip package lines.
function transformJavaForSingleFileRunner(src: string): string {
  let out = src;
  try {
    // Remove package declarations which break single-file execution
    out = out.replace(/^\s*package\s+[^;]+;\s*$/gm, '');
    if (/\bclass\s+Main\b/.test(out) && /public\s+static\s+void\s+main\s*\(/.test(out)) {
      // Ensure public class Main to satisfy stricter runners
      out = out.replace(/\bclass\s+Main\b/, 'public class Main');
      return out;
    }
    // Find the class that defines public static void main (capture generics if any)
    const classWithMain = out.match(/(?:public\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)(\s*<[^>{]*>)?[\s\S]*?public\s+static\s+void\s+main\s*\(/);
    if (classWithMain) {
      const cls = classWithMain[1];
      // Demote any other public top-level types (class/enum/interface) except Main
      out = out
        .replace(/(^|\n)\s*public\s+class\s+(?!Main\b)([A-Za-z_][A-Za-z0-9_]*)(\s*<[^>{]*>)?/g, ($0, p1, name, gen = '') => `${p1}class ${name}${gen || ''}`)
        .replace(/(^|\n)\s*public\s+enum\s+(?!Main\b)([A-Za-z_][A-Za-z0-9_]*)/g, ($0, p1, name) => `${p1}enum ${name}`)
        .replace(/(^|\n)\s*public\s+interface\s+(?!Main\b)([A-Za-z_][A-Za-z0-9_]*)/g, ($0, p1, name) => `${p1}interface ${name}`);
      // Append a delegating Main wrapper to call the located main
      out += `\n\npublic class Main { public static void main(String[] args) { ${cls}.main(args); } }\n`;
      return out;
    }
    // No main found anywhere: append a no-op Main so execution doesn't error
    if (!/\bclass\s+Main\b/.test(out)) {
      out += "\n\npublic class Main { public static void main(String[] args) { } }\n";
    }
    return out;
  } catch {
    return src;
  }
}


