import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Upload, Monitor, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { CopilotMode } from "@/lib/api";

/**
 * Badge and tooltip copy per mode.
 *
 * A keyed record rather than a ternary chain: the previous
 * `mode === "mirror" ? "Mirror" : "Answer"` silently labelled any new mode
 * "Answer", so adding one mislabelled the badge instead of failing.
 */
const MODE_COPY: Record<CopilotMode, {
  badge: string;
  name: string;
  title: string;
  blurb: string;
  /**
   * What the input expects in this mode.
   *
   * The three modes take genuinely different input -- a question, a topic, or
   * a question plus your own draft -- but the field said "Ask anything..."
   * in all of them. Mode *names* are guessable; what to type is not, and the
   * input is where someone is already looking after switching.
   */
  placeholder: string;
}> = {
  answer: {
    badge: "Answer",
    name: "Answer Mode",
    title: "Answer Mode: generate a full answer",
    blurb: "Get a complete interview-ready answer with examples.",
    placeholder: "Ask an interview question…",
  },
  mirror: {
    badge: "Mirror",
    name: "Mirror Mode",
    title: "Mirror Mode: enter the question, then paste your draft answer for feedback",
    blurb: "Enter the question, then paste your draft answer for critique and a stronger rewrite.",
    placeholder: "Enter the question you were asked…",
  },
  questions: {
    badge: "Questions",
    name: "Practice Questions",
    title: "Practice Questions: enter a topic and get a set of questions to practise",
    blurb: "Enter a topic and get a set of interview questions, each with a model answer.",
    placeholder: "Enter a topic to generate practice questions…",
  },
};

/** Order shown in the mode picker. */
const MODE_ORDER: CopilotMode[] = ["answer", "mirror", "questions"];

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // When this value changes, the component clears captured text and stops the mic
  resetToken?: number;
  // Ensure a session exists and return its id (provided by parent)
  ensureSession?: (opts?: { forceNew?: boolean }) => Promise<string>;
  // Callback for generating response
  onGenerate?: () => void;
  // Whether response is being generated
  isGenerating?: boolean;
  // Whether generating is allowed (e.g., disabled when viewing history)
  canGenerate?: boolean;
  // Current mode to display as a badge inside the input
  mode?: CopilotMode;
  // Legacy: cycles to the next mode. Kept for callers that still pass it, but
  // `onModeSelect` is preferred -- see the picker below for why.
  onModeClick?: () => void;
  // Pick a mode directly. When provided, the badge opens a picker instead of
  // blind-cycling.
  onModeSelect?: (next: CopilotMode) => void;
}

export const SearchBar = ({ value, onChange, placeholder = "Type your question...", resetToken, ensureSession, onGenerate, isGenerating = false, canGenerate = true, mode, onModeClick, onModeSelect }: SearchBarProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const baseTextRef = useRef(''); // Store the finalized text
  const permissionPrimedRef = useRef(false);
  const isStartingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptionBuffer, setTranscriptionBuffer] = useState<string>('');
  const [lastTranscriptionTime, setLastTranscriptionTime] = useState<number>(0);
  const [isFocused, setIsFocused] = useState(false);
  const isFocusedRef = useRef(false);
  const lastRenderedTextRef = useRef<string>('');
  // Tracks the base committed text at the start of the current utterance
  const utteranceBaseRef = useRef<string>('');
  const inUtteranceRef = useRef<boolean>(false);
  // Global flag to completely disable speech processing
  const speechProcessingEnabledRef = useRef<boolean>(false);

  // Fixed height for consistent layout
  const { toast } = useToast();

  // Deepgram meeting/tab audio capture
  const [isCapturingMeetingAudio, setIsCapturingMeetingAudio] = useState(false);
  const meetingStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);

  // Deepgram direct microphone capture (phone use-case)
  const [isCapturingProMic, setIsCapturingProMic] = useState(false);
  const proMicStreamRef = useRef<MediaStream | null>(null);
  const proMicRecorderRef = useRef<MediaRecorder | null>(null);
  const proMicSocketRef = useRef<WebSocket | null>(null);
  const proMicReconnectTimerRef = useRef<number | null>(null);
  const proMicHeartbeatTimerRef = useRef<number | null>(null);
  const proMicLastMessageAtRef = useRef<number>(0);
  const proMicReconnectAttemptsRef = useRef<number>(0);

  // Sync baseTextRef when value changes manually (not during speech recognition)
  useEffect(() => {
    if (!isListening) {
      baseTextRef.current = value;
      lastRenderedTextRef.current = value;
    }
  }, [value, isListening]);

  // Track if we're on mobile for responsive styling
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Simple height management for consistent layout
  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      // Always maintain consistent height
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, 40), 275);
      textarea.style.height = `${newHeight}px`;
    }
  }, [value]);

  // Reset everything when parent requests a reset (e.g., after Generate)
  useEffect(() => {
    if (resetToken === undefined) return;
    // Clear all accumulated text and UI
    baseTextRef.current = '';
    lastRenderedTextRef.current = '';
    setTranscriptionBuffer('');
    setConfidence(0);
    onChange('');
    // NEVER stop the microphone on reset - user wants it to stay on
    // Only clear the text and UI state
  }, [resetToken]);

  // Pre-warm microphone permission on mount to reduce first-start latency
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
            sampleRate: 44100,
            sampleSize: 16
          }
        });
        stream.getTracks().forEach(t => t.stop());
        permissionPrimedRef.current = true;
        console.log('Microphone permission primed successfully');
      } catch {
        // user may dismiss; we'll request again on first start
        console.log('Microphone permission priming failed, will request on first use');
      }
    })();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.log('Error cleaning up recognition:', error);
        }
      }
      // Stop Deepgram capture if active
      try { mediaRecorderRef.current?.stop(); } catch { }
      try { meetingStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { }
      try { deepgramSocketRef.current?.close(); } catch { }
      try { proMicRecorderRef.current?.stop(); } catch { }
      try { proMicStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { }
      try { proMicSocketRef.current?.close(); } catch { }
      if (proMicReconnectTimerRef.current) {
        window.clearTimeout(proMicReconnectTimerRef.current);
        proMicReconnectTimerRef.current = null;
      }
      if (proMicHeartbeatTimerRef.current) {
        window.clearInterval(proMicHeartbeatTimerRef.current);
        proMicHeartbeatTimerRef.current = null;
      }
    };
  }, []);

  // Advanced text correction and auto-completion
  const correctTranscription = (text: string): string => {
    // Common interview question corrections
    const corrections: { [key: string]: string } = {
      'tell me about yourself': 'Tell me about yourself',
      'what are your strengths': 'What are your strengths',
      'what are your weaknesses': 'What are your weaknesses',
      'why do you want this job': 'Why do you want this job',
      'where do you see yourself': 'Where do you see yourself',
      'describe a challenging situation': 'Describe a challenging situation',
      'how do you handle stress': 'How do you handle stress',
      'what is your greatest achievement': 'What is your greatest achievement',
      'do you have any questions': 'Do you have any questions',
      'what is your expected salary': 'What is your expected salary',
      'when can you start': 'When can you start',
      'why should we hire you': 'Why should we hire you'
    };

    let correctedText = text.toLowerCase();

    // Apply corrections
    Object.entries(corrections).forEach(([incorrect, correct]) => {
      correctedText = correctedText.replace(new RegExp(incorrect, 'gi'), correct);
    });

    // Auto-capitalize sentences
    correctedText = correctedText.replace(/(^|\.\s+)([a-z])/g, (match, prefix, letter) => {
      return prefix + letter.toUpperCase();
    });

    return correctedText;
  };

  // Real-time confidence scoring
  const calculateConfidence = (transcript: string, isFinal: boolean): number => {
    if (!transcript.trim()) return 0;

    // Base confidence on transcript length and finality
    let confidence = isFinal ? 0.9 : 0.6;

    // Boost confidence for common interview phrases
    const interviewPhrases = [
      'tell me about yourself',
      'what are your strengths',
      'why do you want this job',
      'describe a time when',
      'how do you handle',
      'what is your greatest',
      'do you have any questions'
    ];

    const lowerTranscript = transcript.toLowerCase();
    const hasInterviewPhrase = interviewPhrases.some(phrase =>
      lowerTranscript.includes(phrase)
    );

    if (hasInterviewPhrase) {
      confidence += 0.2;
    }

    // Boost confidence for longer, more complete sentences
    if (transcript.length > 20) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  };

  const startListening = () => {
    if (!isSupported) return;
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    // Set listening flag before creating recognition instance
    isListeningRef.current = true;

    // Set mic button state immediately when clicked for instant feedback
    setIsListening(true);
    setIsProcessing(true); // Show processing state immediately

    // Set base text to current value when starting
    baseTextRef.current = value;
    lastRenderedTextRef.current = value;
    setTranscriptionBuffer('');
    setConfidence(0);

    // Always create a new recognition instance to ensure clean state
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();

    // Enhanced recognition settings for maximum accuracy
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';
    recognitionRef.current.maxAlternatives = 3; // Get multiple alternatives for better accuracy

    // Advanced settings for better performance
    try {
      (recognitionRef.current as any).serviceURI = 'wss://www.google.com/speech-api/v2/recognize';
      (recognitionRef.current as any).grammars = [];
    } catch { }

    recognitionRef.current.onstart = () => {
      // Only update states if we're still supposed to be listening
      if (isListeningRef.current) {
        setIsListening(true);
        setIsProcessing(false);
      }
    };

    recognitionRef.current.onresult = (event: any) => {
      // ULTRA AGGRESSIVE check - multiple layers of protection
      if (!speechProcessingEnabledRef.current) {
        console.log('Speech processing globally disabled - ignoring');
        return;
      }

      if (!isFocusedRef.current || !isListeningRef.current || !recognitionRef.current) {
        console.log('Speech detected but conditions not met - ignoring completely');
        return;
      }

      // Additional safety check
      if (document.activeElement !== textareaRef.current) {
        console.log('Search bar not actually focused - ignoring speech');
        return;
      }

      let interimTranscript = '';
      let finalTranscript = '';
      let bestConfidence = 0;

      // Start of an utterance: remember base text to avoid duplication
      if (!inUtteranceRef.current) {
        inUtteranceRef.current = true;
        utteranceBaseRef.current = baseTextRef.current;
      }

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const isFinal = result.isFinal;

        // Get the best alternative with highest confidence
        let bestAlternative = result[0];
        for (let j = 1; j < result.length; j++) {
          if (result[j].confidence > bestAlternative.confidence) {
            bestAlternative = result[j];
          }
        }

        const transcript = bestAlternative.transcript;
        const transcriptConfidence = bestAlternative.confidence || 0.8;

        if (isFinal) {
          // Apply intelligent corrections to final transcript
          const correctedTranscript = correctTranscription(transcript);
          finalTranscript += correctedTranscript + ' ';
          bestConfidence = Math.max(bestConfidence, transcriptConfidence);
        } else {
          interimTranscript += transcript;
          bestConfidence = Math.max(bestConfidence, transcriptConfidence);
        }
      }

      // Update confidence score
      const currentConfidence = calculateConfidence(
        finalTranscript + interimTranscript,
        finalTranscript.length > 0
      );
      setConfidence(currentConfidence);

      // Update base text with final results
      if (finalTranscript.trim()) {
        const correctedFinal = correctTranscription(finalTranscript.trim());
        baseTextRef.current = utteranceBaseRef.current + (utteranceBaseRef.current ? ' ' : '') + correctedFinal;
        setLastTranscriptionTime(Date.now());
        // Update last rendered on final chunks to lock words in
        if (baseTextRef.current.length > lastRenderedTextRef.current.length) {
          lastRenderedTextRef.current = baseTextRef.current;
          onChange(baseTextRef.current);
        }
        // Utterance finalized
        inUtteranceRef.current = false;
      }

      // Show real-time text with intelligent corrections
      const interimCorrected = interimTranscript ? correctTranscription(interimTranscript) : '';
      const candidateText = (inUtteranceRef.current ? utteranceBaseRef.current : baseTextRef.current) + (interimCorrected ? ((inUtteranceRef.current ? utteranceBaseRef.current : baseTextRef.current) ? ' ' : '') + interimCorrected : '');

      // Guard: never shrink displayed text (avoid cutting off words)
      const stableText = candidateText.length >= lastRenderedTextRef.current.length
        ? candidateText
        : lastRenderedTextRef.current;

      if (stableText !== lastRenderedTextRef.current) {
        lastRenderedTextRef.current = stableText;
        onChange(stableText);
      }

      // Update transcription buffer for continuous processing
      setTranscriptionBuffer(stableText);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.log('Speech recognition error:', event.error);

      // Enhanced error handling for better reliability
      const benign = ['no-speech', 'aborted', 'audio-capture', 'service-not-allowed'];
      if (benign.includes(event?.error)) {
        // Keep mic ON for benign errors; attempt a gentle restart after a short delay
        if (isListeningRef.current && isFocusedRef.current) {
          setTimeout(() => {
            try { recognitionRef.current?.start?.(); } catch { }
          }, 100);
        }
        return;
      }

      // Handle network errors with retry logic
      if (event.error === 'network') {
        setIsProcessing(true);
        setTimeout(() => {
          if (isListeningRef.current && isFocusedRef.current) {
            try {
              recognitionRef.current?.start();
              setIsProcessing(false);
            } catch {
              console.log('Restart failed, will wait for focus/user action');
            }
          }
        }, 200);
        return;
      }

      // Stop only on critical permission errors
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setIsListening(false);
        isListeningRef.current = false;
        toast({
          title: "Microphone access denied",
          description: "Please allow microphone access to use voice input.",
          variant: "destructive"
        });
      }
    };

    recognitionRef.current.onend = () => {
      // Only restart if listening AND focused
      if (isListeningRef.current && isFocusedRef.current) {
        if (recognitionRef.current) {
          const retryDelay = 100; // Reduced delay for faster restart
          setTimeout(() => {
            if (isListeningRef.current && isFocusedRef.current) {
              try {
                recognitionRef.current.start();
              } catch (error) {
                console.log('Failed to restart recognition:', error);
                // Keep mic state on; will restart on focus/user action
              }
            }
          }, retryDelay);
        }
      }
    };

    // Some engines fire onaudioend instead of onend reliably; handle both
    recognitionRef.current.onaudioend = () => {
      if (isListeningRef.current && isFocusedRef.current) {
        if (recognitionRef.current) {
          const retryDelay = 100; // Reduced delay for faster restart
          setTimeout(() => {
            if (isListeningRef.current && isFocusedRef.current) {
              try {
                recognitionRef.current.start();
              } catch (error) {
                console.log('Failed to restart recognition on audio end:', error);
                // Keep mic state on; will restart on focus/user action
              }
            }
          }, retryDelay);
        }
      }
    };

    // Start recognition only if focused AND speech processing enabled
    if (isFocusedRef.current && speechProcessingEnabledRef.current) {
      try {
        recognitionRef.current.start();
        console.log('Speech recognition started - focused and enabled');
      } catch {
        // Safari/WebKit may throw if already started; try stopping then starting
        try {
          recognitionRef.current.stop();
        } catch { }
        try {
          recognitionRef.current.start();
        } catch { }
      }
    } else {
      console.log('Speech recognition NOT started - not focused or disabled');
    }

    // give a short window to avoid rapid double-starts
    setTimeout(() => { isStartingRef.current = false; }, 50);
  };

  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.log('Error stopping recognition:', error);
      }
    }
  };

  // ===== Deepgram meeting audio capture =====
  const stopMeetingCapture = () => {
    try { mediaRecorderRef.current?.stop(); } catch { }
    try { meetingStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { }
    try { deepgramSocketRef.current?.close(); } catch { }
    mediaRecorderRef.current = null;
    meetingStreamRef.current = null;
    deepgramSocketRef.current = null;
    setIsCapturingMeetingAudio(false);
  };

  const startMeetingCapture = async () => {
    if (isCapturingMeetingAudio) return;
    if (!navigator?.mediaDevices?.getDisplayMedia) {
      toast({ title: 'Not supported', description: 'Your browser does not support tab/window audio capture.', variant: 'destructive' });
      return;
    }
    try {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false } as any);
      } catch {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true } as any);
      }
      if (!stream || !stream.getAudioTracks().length) {
        try { stream?.getTracks().forEach(t => t.stop()); } catch { }
        toast({ title: 'No audio', description: 'The selected surface has no audio track.', variant: 'destructive' });
        return;
      }
      meetingStreamRef.current = stream;

      const key = (import.meta as any).env?.VITE_DEEPGRAM_API_KEY;
      if (!key) {
        toast({ title: 'Speech recognition unavailable', description: 'Real-time transcription is not configured for this environment. Please contact support.', variant: 'destructive' });
        try { stream.getTracks().forEach(t => t.stop()); } catch { }
        return;
      }

      const url = 'wss://api.deepgram.com/v1/listen?model=nova-2-meeting&language=en-US&smart_format=true&punctuate=true&interim_results=true&filler_words=true&encoding=opus';
      const ws = new WebSocket(url, ['token', key]);
      deepgramSocketRef.current = ws;

      ws.onopen = () => {
        const candidates = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus'
        ];
        const mime = candidates.find((c) => (window as any).MediaRecorder?.isTypeSupported?.(c)) || '';
        try {
          const rec = new MediaRecorder(stream as MediaStream, mime ? { mimeType: mime } as any : undefined);
          mediaRecorderRef.current = rec;
          rec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(e.data);
            }
          };
          rec.start(100);
          setIsCapturingMeetingAudio(true);
        } catch {
          toast({ title: 'Recorder unsupported', description: 'MediaRecorder not supported in this browser.', variant: 'destructive' });
          try { ws.close(); } catch { }
          try { stream.getTracks().forEach(t => t.stop()); } catch { }
        }
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          const alt = msg?.channel?.alternatives?.[0];
          const transcript: string = alt?.transcript || '';
          const isFinal: boolean = !!msg?.is_final;
          if (!transcript) return;
          if (!isFocusedRef.current) return;
          if (!inUtteranceRef.current) {
            inUtteranceRef.current = true;
            utteranceBaseRef.current = baseTextRef.current;
          }
          if (isFinal) {
            const corrected = correctTranscription(transcript);
            baseTextRef.current = utteranceBaseRef.current + (utteranceBaseRef.current ? ' ' : '') + corrected.trim();
            if (baseTextRef.current.length > lastRenderedTextRef.current.length) {
              lastRenderedTextRef.current = baseTextRef.current;
              onChange(baseTextRef.current);
            }
            inUtteranceRef.current = false;
          } else {
            // Show raw interim for responsiveness; corrections only on final
            const base = inUtteranceRef.current ? utteranceBaseRef.current : baseTextRef.current;
            const candidate = base + (base ? ' ' : '') + transcript;
            const stable = candidate.length >= lastRenderedTextRef.current.length ? candidate : lastRenderedTextRef.current;
            if (stable !== lastRenderedTextRef.current) {
              lastRenderedTextRef.current = stable;
              onChange(stable);
            }
          }
        } catch { }
      };

      const stopAll = () => {
        try { mediaRecorderRef.current?.stop(); } catch { }
        try { meetingStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { }
        try { deepgramSocketRef.current?.close(); } catch { }
        mediaRecorderRef.current = null;
        meetingStreamRef.current = null;
        deepgramSocketRef.current = null;
        setIsCapturingMeetingAudio(false);
      };
      ws.onerror = () => stopAll();
      ws.onclose = () => stopAll();
    } catch (err: any) {
      const msg = String(err?.message || 'Could not start meeting capture');
      toast({ title: 'Capture failed', description: msg, variant: 'destructive' });
    }
  };

  // ===== Deepgram direct microphone capture (no screen share) =====
  const stopProMicCapture = () => {
    try { proMicRecorderRef.current?.stop(); } catch { }
    try { proMicStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { }
    try { proMicSocketRef.current?.close(); } catch { }
    proMicRecorderRef.current = null;
    proMicStreamRef.current = null;
    proMicSocketRef.current = null;
    setIsCapturingProMic(false);
    if (proMicReconnectTimerRef.current) {
      window.clearTimeout(proMicReconnectTimerRef.current);
      proMicReconnectTimerRef.current = null;
    }
    if (proMicHeartbeatTimerRef.current) {
      window.clearInterval(proMicHeartbeatTimerRef.current);
      proMicHeartbeatTimerRef.current = null;
    }
  };

  const scheduleProMicReconnect = (reason: string) => {
    if (!isCapturingProMic) return;
    // Exponential backoff with cap
    proMicReconnectAttemptsRef.current = Math.min(proMicReconnectAttemptsRef.current + 1, 5);
    const delayMs = Math.min(30000, 500 * Math.pow(2, proMicReconnectAttemptsRef.current - 1));
    if (proMicReconnectTimerRef.current) {
      window.clearTimeout(proMicReconnectTimerRef.current);
    }
    proMicReconnectTimerRef.current = window.setTimeout(() => {
      if (!isCapturingProMic) return;
      startProMicCapture();
    }, delayMs);
    console.log(`[mic] Scheduled reconnect in ${delayMs}ms due to: ${reason}`);
  };

  const startProMicHeartbeat = () => {
    proMicLastMessageAtRef.current = Date.now();
    if (proMicHeartbeatTimerRef.current) {
      window.clearInterval(proMicHeartbeatTimerRef.current);
    }
    // Watchdog: if we get no transcripts for 30s, reconnect
    proMicHeartbeatTimerRef.current = window.setInterval(() => {
      const idleMs = Date.now() - proMicLastMessageAtRef.current;
      if (isCapturingProMic && idleMs > 30000) {
        console.log('[mic] No transcripts for 30s, reconnecting');
        try { proMicSocketRef.current?.close(); } catch { }
        scheduleProMicReconnect('idle-timeout');
      }
    }, 5000);
  };

  const startProMicCapture = async () => {
    if (isCapturingProMic) return;
    if (!navigator?.mediaDevices?.getUserMedia) {
      toast({ title: 'Microphone not supported', description: 'Your browser does not allow mic capture.', variant: 'destructive' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        } as MediaTrackConstraints,
        video: false
      });
      proMicStreamRef.current = stream;

      const key = (import.meta as any).env?.VITE_DEEPGRAM_API_KEY;
      if (!key) {
        toast({ title: 'Speech recognition unavailable', description: 'Real-time transcription is not configured for this environment. Please contact support.', variant: 'destructive' });
        try { stream.getTracks().forEach(t => t.stop()); } catch { }
        return;
      }

      const url = 'wss://api.deepgram.com/v1/listen?model=nova-2-meeting&language=en-US&smart_format=true&punctuate=true&interim_results=true&filler_words=true&encoding=opus';
      const ws = new WebSocket(url, ['token', key]);
      proMicSocketRef.current = ws;

      ws.onopen = () => {
        const candidates = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus'
        ];
        const mime = candidates.find((c) => (window as any).MediaRecorder?.isTypeSupported?.(c)) || '';
        try {
          const rec = new MediaRecorder(stream as MediaStream, mime ? { mimeType: mime } as any : undefined);
          proMicRecorderRef.current = rec;
          rec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(e.data);
            }
          };
          rec.start(100);
          setIsCapturingProMic(true);
          proMicReconnectAttemptsRef.current = 0;
          startProMicHeartbeat();
        } catch {
          toast({ title: 'Recorder unsupported', description: 'MediaRecorder not supported in this browser.', variant: 'destructive' });
          try { ws.close(); } catch { }
          try { stream.getTracks().forEach(t => t.stop()); } catch { }
        }
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          const alt = msg?.channel?.alternatives?.[0];
          const transcript: string = alt?.transcript || '';
          const isFinal: boolean = !!msg?.is_final;
          proMicLastMessageAtRef.current = Date.now();
          if (!transcript) return;
          if (!isFocusedRef.current) return;
          if (!inUtteranceRef.current) {
            inUtteranceRef.current = true;
            utteranceBaseRef.current = baseTextRef.current;
          }
          if (isFinal) {
            const corrected = correctTranscription(transcript);
            baseTextRef.current = utteranceBaseRef.current + (utteranceBaseRef.current ? ' ' : '') + corrected.trim();
            if (baseTextRef.current.length > lastRenderedTextRef.current.length) {
              lastRenderedTextRef.current = baseTextRef.current;
              onChange(baseTextRef.current);
            }
            inUtteranceRef.current = false;
          } else {
            // Show raw interim for responsiveness; corrections only on final
            const base = inUtteranceRef.current ? utteranceBaseRef.current : baseTextRef.current;
            const candidate = base + (base ? ' ' : '') + transcript;
            const stable = candidate.length >= lastRenderedTextRef.current.length ? candidate : lastRenderedTextRef.current;
            if (stable !== lastRenderedTextRef.current) {
              lastRenderedTextRef.current = stable;
              onChange(stable);
            }
          }
        } catch { }
      };

      const stopAll = () => {
        try { proMicRecorderRef.current?.stop(); } catch { }
        try { proMicStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { }
        try { proMicSocketRef.current?.close(); } catch { }
        proMicRecorderRef.current = null;
        proMicStreamRef.current = null;
        proMicSocketRef.current = null;
        setIsCapturingProMic(false);
      };
      ws.onerror = () => {
        stopAll();
        scheduleProMicReconnect('ws-error');
      };
      ws.onclose = () => {
        stopAll();
        scheduleProMicReconnect('ws-close');
      };
    } catch (err: any) {
      const msg = String(err?.message || 'Could not start mic capture');
      toast({ title: 'Mic capture failed', description: msg, variant: 'destructive' });
    }
  };

  const handleProMicToggle = () => {
    if (isCapturingProMic) {
      stopProMicCapture();
    } else {
      startProMicCapture();
    }
  };

  const handleSpeechToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleMeetingToggle = () => {
    if (isCapturingMeetingAudio) {
      stopMeetingCapture();
    } else {
      startMeetingCapture();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // On backspace, clear the speech buffer so next speech starts fresh
    if (e.key === 'Backspace' && isListening) {
      baseTextRef.current = '';
    }

    // Handle Enter key for auto-generation
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canGenerate && value.trim() && onGenerate && !isGenerating) {
        onGenerate();
      }
    }

    // Adjust height after key press
    setTimeout(() => {
      if (textareaRef.current) {
        const textarea = textareaRef.current;
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const newHeight = Math.min(Math.max(scrollHeight, 40), 275);
        textarea.style.height = `${newHeight}px`;
      }
    }, 0);
  };

  const restartRecognition = () => {
    if (!isSupported || !isListeningRef.current) return;

    // Create new recognition instance
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();

    // Ensure mic button is shown as active
    setIsListening(true);

    // Enhanced recognition settings for maximum accuracy
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';
    recognitionRef.current.maxAlternatives = 3;

    // Set up event handlers (reuse the same logic)
    recognitionRef.current.onstart = () => {
      if (isListeningRef.current) {
        setIsListening(true);
        setIsProcessing(false);
      }
    };

    recognitionRef.current.onresult = (event: any) => {
      // Only process speech if the textarea is focused
      if (!isFocusedRef.current) {
        return;
      }

      let interimTranscript = '';
      let finalTranscript = '';
      let bestConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const isFinal = result.isFinal;

        // Get the best alternative with highest confidence
        let bestAlternative = result[0];
        for (let j = 1; j < result.length; j++) {
          if (result[j].confidence > bestAlternative.confidence) {
            bestAlternative = result[j];
          }
        }

        const transcript = bestAlternative.transcript;
        const transcriptConfidence = bestAlternative.confidence || 0.8;

        if (isFinal) {
          // Apply intelligent corrections to final transcript
          const correctedTranscript = correctTranscription(transcript);
          finalTranscript += correctedTranscript + ' ';
          bestConfidence = Math.max(bestConfidence, transcriptConfidence);
        } else {
          interimTranscript += transcript;
          bestConfidence = Math.max(bestConfidence, transcriptConfidence);
        }
      }

      // Update confidence score
      const currentConfidence = calculateConfidence(
        finalTranscript + interimTranscript,
        finalTranscript.length > 0
      );
      setConfidence(currentConfidence);

      // Update base text with final results
      if (finalTranscript.trim()) {
        const correctedFinal = correctTranscription(finalTranscript.trim());
        baseTextRef.current += (baseTextRef.current ? ' ' : '') + correctedFinal;
        setLastTranscriptionTime(Date.now());
      }

      // Show real-time text with intelligent corrections
      const interimCorrected = interimTranscript ? correctTranscription(interimTranscript) : '';
      const displayText = baseTextRef.current + (interimCorrected ? (baseTextRef.current ? ' ' : '') + interimCorrected : '');
      onChange(displayText);

      // Update transcription buffer for continuous processing
      setTranscriptionBuffer(displayText);
    };

    recognitionRef.current.onerror = (event: any) => {
      console.log('Speech recognition error:', event.error);

      // Enhanced error handling for better reliability
      const benign = ['no-speech', 'aborted', 'audio-capture', 'service-not-allowed'];
      if (benign.includes(event?.error)) {
        // Commit interim text so nothing is lost before stopping
        try {
          const buffered = transcriptionBuffer?.trim?.() ?? '';
          if (buffered && buffered.length > (baseTextRef.current?.length || 0)) {
            baseTextRef.current = buffered;
            onChange(buffered);
          }
        } catch { }

        // Don't restart for benign errors, just stop
        if (event.error === 'aborted') {
          // Aborted usually means user stopped or focus changed, don't restart
          return;
        }
        try { recognitionRef.current?.stop(); recognitionRef.current = null; } catch { }
        return;
      }

      // Handle network errors with retry logic
      if (event.error === 'network') {
        setIsProcessing(true);
        setTimeout(() => {
          if (isListeningRef.current && isFocusedRef.current) {
            try {
              recognitionRef.current?.start();
              setIsProcessing(false);
            } catch {
              console.log('Restart failed, will wait for focus/user action');
            }
          }
        }, 200);
        return;
      }

      // Stop only on critical errors
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setIsListening(false);
        isListeningRef.current = false;
        toast({
          title: "Microphone access denied",
          description: "Please allow microphone access to use voice input.",
          variant: "destructive"
        });
      }
    };

    recognitionRef.current.onend = () => {
      // Commit any interim text so nothing is lost across restarts
      try {
        const buffered = transcriptionBuffer?.trim?.() ?? '';
        if (buffered && buffered.length > (baseTextRef.current?.length || 0)) {
          baseTextRef.current = buffered;
          onChange(buffered);
        }
      } catch { }

      // Only restart if we're still supposed to be listening and focused
      if (isListeningRef.current && isFocusedRef.current && recognitionRef.current) {
        const retryDelay = 500; // Fixed delay to prevent rapid restarts
        setTimeout(() => {
          if (isListeningRef.current && isFocusedRef.current) {
            try {
              recognitionRef.current.start();
            } catch (error) {
              console.log('Failed to restart recognition:', error);
              // Keep mic state on; will restart on focus/user action
            }
          }
        }, retryDelay);
      }
    };

    // Only restart automatically if focused
    recognitionRef.current.onaudioend = () => {
      // Commit any interim text so nothing is lost across restarts
      try {
        const buffered = transcriptionBuffer?.trim?.() ?? '';
        if (buffered && buffered.length > (baseTextRef.current?.length || 0)) {
          baseTextRef.current = buffered;
          onChange(buffered);
        }
      } catch { }

      if (isListeningRef.current && isFocusedRef.current && recognitionRef.current) {
        const retryDelay = 500;
        setTimeout(() => {
          if (isListeningRef.current && isFocusedRef.current) {
            try {
              recognitionRef.current.start();
            } catch (error) {
              console.log('Failed to restart recognition on audio end:', error);
              // Keep mic state on; will restart on focus/user action
            }
          }
        }, retryDelay);
      }
    };

    // Start the recognition
    try {
      recognitionRef.current.start();
    } catch (error) {
      console.log('Error starting recognition:', error);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    isFocusedRef.current = true;
    speechProcessingEnabledRef.current = true; // Enable speech processing

    // If microphone is on, start recognition
    if (isListening && isSupported) {
      // Always recreate recognition instance for clean state
      restartRecognition();
    }
    // If Deepgram mic is on but idle, nudge heartbeat and refocus typing
    if (isCapturingProMic && textareaRef.current) {
      textareaRef.current.focus();
      startProMicHeartbeat();
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    isFocusedRef.current = false;
    speechProcessingEnabledRef.current = false; // DISABLE speech processing

    // AGGRESSIVELY stop and destroy speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current.abort && recognitionRef.current.abort();
      } catch (error) {
        console.log('Error stopping recognition on blur:', error);
      }
      recognitionRef.current = null; // Completely destroy
    }

    // Clear all state
    setIsProcessing(false);
    setConfidence(0);
    setTranscriptionBuffer('');
    inUtteranceRef.current = false;
    utteranceBaseRef.current = '';

    console.log('Speech recognition completely stopped on blur');
  };

  // Recover mic on visibility change (e.g., returning to the tab)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (isCapturingProMic && !proMicSocketRef.current) {
          scheduleProMicReconnect('tab-visible');
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isCapturingProMic]);

  return (
    <div className="relative w-full">
      <div className="relative group">
        {/* ChatGPT-style compact mobile search bar */}
        <div className="search-bar bg-background/98 dark:bg-background/90 backdrop-blur-xl border border-border/80 rounded-3xl shadow-md ring-1 ring-border/40 focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-lg transition-shadow">
          {/* Main content container - using flex for proper alignment */}
          <div className="flex items-end gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2">
            {/* Mode badge inside the input.
                A picker, not a cycle. This used to advance
                answer -> questions -> mirror on click, while its tooltip
                described the mode you were already *in* -- so the one control
                that changes mode never named where you were going. Worse on
                touch: tooltips are hover-only, so a tap switched the mode and
                explained nothing. A menu names every destination and works
                with pointer and finger alike. */}
            {mode && (onModeSelect ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Mode: ${MODE_COPY[mode].name}. Change mode`}
                    className="flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-[10px] sm:text-xs font-medium transition-colors cursor-pointer self-start mt-1.5 sm:mt-2 flex-shrink-0"
                    title={MODE_COPY[mode].title}
                  >
                    {MODE_COPY[mode].badge}
                    <ChevronDown className="ml-0.5 h-3 w-3 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[290px]">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Copilot mode
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {MODE_ORDER.map((m) => {
                    const copy = MODE_COPY[m];
                    const isCurrent = m === mode;
                    return (
                      <DropdownMenuItem
                        key={m}
                        onSelect={() => { if (!isCurrent) onModeSelect(m); }}
                        className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                      >
                        <span className="flex w-full items-center gap-2 text-sm font-medium">
                          {copy.name}
                          {isCurrent && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                        </span>
                        {/* The blurb travels with the choice, so a mode is
                            explained before it is applied, not after. */}
                        <span className="text-xs leading-snug text-muted-foreground">
                          {copy.blurb}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => { e.preventDefault(); onModeClick?.(); }}
                      className="flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-[10px] sm:text-xs font-medium transition-colors cursor-pointer self-start mt-1.5 sm:mt-2 flex-shrink-0"
                      title={MODE_COPY[mode].title}
                    >
                      {MODE_COPY[mode].badge}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[280px] text-xs">
                    <div className="space-y-1">
                      <div className="font-medium">{MODE_COPY[mode].name}</div>
                      <div className="text-muted-foreground">{MODE_COPY[mode].blurb}</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}

            {/* Text area - grows to fill space */}
            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={mode ? MODE_COPY[mode].placeholder : placeholder}
                maxLength={512}
                className="w-full bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground/60 leading-5 sm:leading-6 overflow-y-auto scrollbar-thin px-0 py-1 sm:py-2 text-[16px]"
                rows={1}
                style={{
                  lineHeight: isMobile ? '1.4' : '1.5',
                  minHeight: isMobile ? '28px' : '32px',
                  maxHeight: isMobile ? '120px' : '200px',
                  verticalAlign: 'top',
                  textAlign: 'left'
                }}
              />
            </div>

            {/* Action buttons - right side, always at the far right and bottom */}
            <div className="flex items-center flex-shrink-0 ml-auto" style={{ gap: isMobile ? '0.2rem' : '0.375rem' }}>
              {/* Microphone button */}
              {isSupported && (
                <Button
                  onClick={handleProMicToggle}
                  variant="ghost"
                  size="icon"
                  className={`rounded-full h-10 w-10 sm:h-9 sm:w-9 touch-manipulation ${isCapturingProMic
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  title={isCapturingProMic ? 'Stop microphone' : 'Start microphone'}
                >
                  <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              )}

              {/* Send button */}
              <Button
                onClick={() => canGenerate && value.trim() && onGenerate && !isGenerating ? onGenerate() : null}
                disabled={!canGenerate || !value.trim() || isGenerating}
                className="rounded-full h-10 w-10 sm:h-9 sm:w-9 p-0 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                title="Send message"
              >
                {isGenerating ? (
                  <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 border-2 border-primary-foreground rounded-full border-t-transparent animate-spin"></div>
                ) : (
                  <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Extend Window interface for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}