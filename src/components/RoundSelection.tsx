import { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Code2,
  Layers,
  MessageCircle,
  Briefcase,
  Brain,
  Database,
  Smartphone,
  Server,
  Shield,
  Cloud,
  Target,
  Clock,
  TrendingUp,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Zap,
  Award,
  Settings,
  Loader2,
} from 'lucide-react';
import {
  InterviewRound,
  RoundConfig,
  getAvailableRounds,
  startRoundInterview,
  type UserProfile,
} from '@/lib/practiceModeApi';
import type { ResumeContext } from '../types/resume';
import ResumeUpload from './ResumeUpload';
import { useToast } from '@/hooks/use-toast';
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
} from './practice/PracticeKit';
import { toneColor, toneVar, cx, type PxTone } from './practice/tones';

interface RoundSelectionProps {
  onRoundStart: (sessionId: string, roundConfig: RoundConfig, firstQuestion: any, ttsAudioUrl?: string, totalQuestionsFromApi?: number) => void;
  userProfile?: UserProfile;
  ensureLiveMediaReady: () => Promise<{ screen_shared: boolean; camera_enabled: boolean }>;
  ensureCameraForProctoring?: () => Promise<void>;
  resumeContext?: ResumeContext | null;
  onResumeChange?: (ctx: ResumeContext | null) => void;
  livePracticeConsentChecked: boolean;
  onLivePracticeConsentChange: (checked: boolean) => void;
}

// Icon mapping for each round type
const ROUND_ICONS: Record<InterviewRound, any> = {
  [InterviewRound.HR_SCREENING]: Users,
  [InterviewRound.TECHNICAL_ROUND_1]: Code2,
  [InterviewRound.TECHNICAL_ROUND_2]: Code2,
  [InterviewRound.SYSTEM_DESIGN]: Layers,
  [InterviewRound.BEHAVIORAL]: MessageCircle,
  [InterviewRound.MANAGERIAL]: Briefcase,
  [InterviewRound.MACHINE_LEARNING]: Brain,        // ✅ Fixed
  [InterviewRound.DATA_ENGINEERING]: Database,
  [InterviewRound.FRONTEND_SPECIALIST]: Smartphone,
  [InterviewRound.BACKEND_SPECIALIST]: Server,
  [InterviewRound.DEVOPS]: Cloud,                   // ✅ Fixed
  [InterviewRound.SECURITY]: Shield,
  [InterviewRound.FULL_INTERVIEW]: Award,
};

const DIFFICULTY_TONE: Record<string, PxTone> = {
  easy: 'positive',
  medium: 'caution',
  hard: 'critical',
  mixed: 'neural',
};

/**
 * Rounds no longer each get their own gradient. They map onto the three tones
 * the design system already means something with, so the grid reads as one
 * system: accent = conversational, neural = technical depth, caution = the
 * high-stakes rounds.
 */
const ROUND_TONES: Record<InterviewRound, PxTone> = {
  [InterviewRound.HR_SCREENING]: 'accent',
  [InterviewRound.TECHNICAL_ROUND_1]: 'neural',
  [InterviewRound.TECHNICAL_ROUND_2]: 'neural',
  [InterviewRound.SYSTEM_DESIGN]: 'caution',
  [InterviewRound.BEHAVIORAL]: 'accent',
  [InterviewRound.MANAGERIAL]: 'accent',
  [InterviewRound.MACHINE_LEARNING]: 'neural',
  [InterviewRound.DATA_ENGINEERING]: 'neural',
  [InterviewRound.FRONTEND_SPECIALIST]: 'neural',
  [InterviewRound.BACKEND_SPECIALIST]: 'neural',
  [InterviewRound.DEVOPS]: 'neural',
  [InterviewRound.SECURITY]: 'critical',
  [InterviewRound.FULL_INTERVIEW]: 'caution',
};

const normalizeRoundTypeToken = (value: unknown): string => {
  if (!value) return '';
  return String(value).trim().toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_');
};

const LEGACY_ROUND_TYPE_ALIASES: Record<string, InterviewRound> = {
  ml_specialist: InterviewRound.MACHINE_LEARNING,
  devops_sre: InterviewRound.DEVOPS,
};

const resolveInterviewRound = (value: unknown): InterviewRound | null => {
  const normalized = normalizeRoundTypeToken(value);
  if (!normalized) return null;

  if (LEGACY_ROUND_TYPE_ALIASES[normalized]) {
    return LEGACY_ROUND_TYPE_ALIASES[normalized];
  }

  return (Object.values(InterviewRound) as string[]).includes(normalized)
    ? (normalized as InterviewRound)
    : null;
};

const getRoundIconComponent = (roundType: unknown) => {
  const resolvedRoundType = resolveInterviewRound(roundType);
  return resolvedRoundType ? (ROUND_ICONS[resolvedRoundType] || Target) : Target;
};

const getRoundTone = (roundType: unknown): PxTone => {
  const resolvedRoundType = resolveInterviewRound(roundType);
  return resolvedRoundType ? (ROUND_TONES[resolvedRoundType] ?? 'accent') : 'accent';
};

// Domain keywords for smart filtering
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  backend: ['backend', 'python', 'java', 'node.js', 'node', 'go', 'c#', '.net', 'api', 'server'],
  frontend: ['frontend', 'react', 'vue', 'angular', 'javascript', 'typescript', 'ui', 'web'],
  ml: ['machine learning', 'ml', 'ai', 'data science', 'deep learning', 'neural'],
  data: ['data engineering', 'data engineer', 'etl', 'pipeline', 'spark', 'hadoop'],
  devops: ['devops', 'sre', 'cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'docker'],
  security: ['security', 'cybersecurity', 'infosec', 'penetration', 'appsec'],
  mobile: ['mobile', 'ios', 'android', 'react native', 'flutter'],
  fullstack: ['full stack', 'fullstack', 'full-stack'],
};

// Core rounds shown to everyone
const CORE_ROUNDS = [
  InterviewRound.HR_SCREENING,
  InterviewRound.TECHNICAL_ROUND_1,
  InterviewRound.BEHAVIORAL,
];

// Advanced rounds for senior/experienced roles
const ADVANCED_ROUNDS = [
  InterviewRound.TECHNICAL_ROUND_2,
  InterviewRound.SYSTEM_DESIGN,
  InterviewRound.MANAGERIAL,
  InterviewRound.FULL_INTERVIEW,
];

// Detect domain category from domain string
const detectDomainCategory = (domain: string): string => {
  if (!domain) return 'general';

  const lowerDomain = domain.toLowerCase();

  for (const [category, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(keyword => lowerDomain.includes(keyword))) {
      return category;
    }
  }

  return 'general';
};

// Get friendly name for domain category
const getDomainCategoryName = (category: string): string => {
  const names: Record<string, string> = {
    backend: 'Backend Development',
    frontend: 'Frontend Development',
    ml: 'Machine Learning',
    data: 'Data Engineering',
    devops: 'DevOps/SRE',
    security: 'Security Engineering',
    mobile: 'Mobile Development',
    fullstack: 'Full Stack Development',
    general: 'General Software Engineering',
  };

  return names[category] || 'General';
};

// Filter rounds based on domain
const filterRoundsByDomain = (rounds: RoundConfig[], domain: string): RoundConfig[] => {
  const domainCategory = detectDomainCategory(domain);

  console.log('🔧 [Filter] Filtering rounds for domain:', domain, '→ category:', domainCategory);

  const filtered = rounds.filter(round => {
    const roundType = resolveInterviewRound(round.round_type) ?? round.round_type;

    // Always show core rounds
    if (CORE_ROUNDS.includes(roundType)) {
      console.log('✅ [Filter] Core round:', roundType);
      return true;
    }

    // Always show advanced rounds
    if (ADVANCED_ROUNDS.includes(roundType)) {
      console.log('✅ [Filter] Advanced round:', roundType);
      return true;
    }

    // Filter specialist rounds based on domain
    let include = false;
    switch (domainCategory) {
      case 'backend':
        include = roundType === InterviewRound.BACKEND_SPECIALIST;
        break;
      case 'frontend':
        include = roundType === InterviewRound.FRONTEND_SPECIALIST;
        break;
      case 'ml':
        include = roundType === InterviewRound.MACHINE_LEARNING;
        break;
      case 'data':
        include = roundType === InterviewRound.DATA_ENGINEERING;
        break;
      case 'devops':
        include = roundType === InterviewRound.DEVOPS;
        break;
      case 'security':
        include = roundType === InterviewRound.SECURITY;
        break;
      case 'fullstack':
        // Show both frontend and backend for fullstack
        include = roundType === InterviewRound.BACKEND_SPECIALIST ||
          roundType === InterviewRound.FRONTEND_SPECIALIST;
        break;
      default:
        // For general/unknown domains, hide all specialist rounds
        include = ![
          InterviewRound.BACKEND_SPECIALIST,
          InterviewRound.FRONTEND_SPECIALIST,
          InterviewRound.MACHINE_LEARNING,
          InterviewRound.DATA_ENGINEERING,
          InterviewRound.DEVOPS,
          InterviewRound.SECURITY,
        ].includes(roundType);
    }

    console.log(`${include ? '✅' : '❌'} [Filter] Specialist round:`, roundType, '→', include);
    return include;
  });

  console.log('🎯 [Filter] Result:', filtered.length, 'of', rounds.length, 'rounds');
  return filtered;
};

export default function RoundSelection({
  onRoundStart,
  userProfile,
  ensureLiveMediaReady,
  ensureCameraForProctoring,
  resumeContext,
  onResumeChange,
  livePracticeConsentChecked,
  onLivePracticeConsentChange,
}: RoundSelectionProps) {
  const { toast } = useToast();

  // If the user clicks "Start next targeted session" from Progress, we store a plan in localStorage.
  // RoundSelection will best-effort apply it (select round, set question count, set domain) and can auto-start.
  const [nextSessionPrefill] = useState<any | null>(() => {
    try {
      const raw = window.localStorage.getItem('practice_next_session_plan');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
  const [prefillApplied, setPrefillApplied] = useState(false);

  const [loading, setLoading] = useState(true);
  const [allRounds, setAllRounds] = useState<RoundConfig[]>([]);
  const [recommendedRounds, setRecommendedRounds] = useState<RoundConfig[]>([]);
  const [recommendedSequence, setRecommendedSequence] = useState<RoundConfig[]>([]);
  const [selectedRound, setSelectedRound] = useState<RoundConfig | null>(null);
  const [companySpecific, setCompanySpecific] = useState('');
  const [domain, setDomain] = useState(
    userProfile?.domain ||
    (typeof window !== 'undefined' ? window.localStorage.getItem('practice_last_domain') : '') ||
    nextSessionPrefill?.domain ||
    ''
  );
  const [experienceYears, setExperienceYears] = useState(userProfile?.experience_years || 0);
  const [questionCount, setQuestionCount] = useState<number>(
    typeof nextSessionPrefill?.question_count === 'number' && nextSessionPrefill.question_count >= 1
      ? nextSessionPrefill.question_count
      : 1
  );
  const [starting, setStarting] = useState(false);
  const [view, setView] = useState<'recommended' | 'all'>('recommended');

  const normalizeRoundType = (value: unknown): string => {
    if (!value) return '';
    return String(value).trim().toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_');
  };

  // Apply any stored next-session plan once rounds are loaded.
  useEffect(() => {
    if (loading) return;
    if (!nextSessionPrefill || prefillApplied) return;

    if (typeof nextSessionPrefill?.domain === 'string' && nextSessionPrefill.domain.trim() && !domain.trim()) {
      setDomain(nextSessionPrefill.domain.trim());
    }
    if (typeof nextSessionPrefill?.question_count === 'number' && nextSessionPrefill.question_count >= 1) {
      setQuestionCount(nextSessionPrefill.question_count);
    }

    const desired = normalizeRoundType(nextSessionPrefill?.recommended_round);
    if (desired) {
      // We don't auto-select the round anymore so the user sees the list first.
      // But we could potentially use this to highlight the round in the UI.
    }

    setPrefillApplied(true);
  }, [loading, nextSessionPrefill, prefillApplied, allRounds, recommendedRounds, recommendedSequence, domain]);

  useEffect(() => {
    loadRounds();
  }, [userProfile]);

  // Reload rounds when domain changes
  useEffect(() => {
    if (domain) {
      loadRounds();
    }
  }, [domain, experienceYears]);

  const loadRounds = async () => {
    setLoading(true);
    try {
      console.log('🔍 [Round Selection] Fetching rounds...');
      console.log('📊 [Round Selection] User Profile:', userProfile);

      const response = await getAvailableRounds(
        experienceYears || userProfile?.experience_years,
        domain || userProfile?.domain
      );

      console.log('✅ [Round Selection] API Response:', response);
      console.log('📋 [Round Selection] All Rounds:', response.all_rounds);
      console.log('⭐ [Round Selection] Recommended Rounds:', response.recommended_rounds);
      console.log('📈 [Round Selection] Recommended Sequence:', response.recommended_sequence);

      // Backend returns 'rounds' instead of 'all_rounds'
      const allRoundsData = response.all_rounds || response.rounds || [];
      const recommendedRoundsData = response.recommended_rounds || response.rounds || [];

      // Apply smart domain filtering
      const currentDomain = domain || userProfile?.domain || '';

      console.log('🎯 [Round Selection] Current domain:', currentDomain);
      console.log('🔍 [Round Selection] Domain category:', detectDomainCategory(currentDomain));
      console.log('📊 [Round Selection] Before filtering:', {
        allRounds: allRoundsData.length,
        recommended: recommendedRoundsData.length,
        allRoundTypes: allRoundsData.map(r => r.round_type),
      });

      const filteredAllRounds = currentDomain
        ? filterRoundsByDomain(allRoundsData, currentDomain)
        : allRoundsData;
      const filteredRecommendedRounds = currentDomain
        ? filterRoundsByDomain(recommendedRoundsData, currentDomain)
        : recommendedRoundsData;
      const filteredSequence = response.recommended_sequence && currentDomain
        ? filterRoundsByDomain(response.recommended_sequence, currentDomain)
        : (response.recommended_sequence || []);

      console.log('✂️ [Round Selection] After filtering:', {
        allRounds: filteredAllRounds.length,
        recommended: filteredRecommendedRounds.length,
        filteredRoundTypes: filteredAllRounds.map(r => r.round_type),
      });

      setAllRounds(filteredAllRounds);
      setRecommendedRounds(filteredRecommendedRounds);
      if (filteredSequence.length > 0) {
        setRecommendedSequence(filteredSequence);
      }

      console.log('✅ [Round Selection] State updated successfully');
      console.log('📊 [Round Selection] Setting allRounds:', filteredAllRounds.length, 'rounds');
      console.log('⭐ [Round Selection] Setting recommendedRounds:', filteredRecommendedRounds.length, 'rounds');
    } catch (error: any) {
      console.error('❌ [Round Selection] Failed to load rounds:', error);
      console.error('❌ [Round Selection] Error details:', {
        message: error.message,
        stack: error.stack,
      });
      toast({
        title: 'Failed to load rounds',
        description: 'Could not load interview rounds. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartRound = async () => {
    if (!selectedRound) return;

    if (!livePracticeConsentChecked) {
      toast({
        title: 'Consent required',
        description: 'Review the Live Practice consent. This session uses camera, screen, and recording to simulate real interview conditions.',
        variant: 'warning',
      });
      return;
    }

    // Validate domain is selected (CRITICAL)
    if (!domain && !userProfile?.domain) {
      toast({
        title: 'Domain required',
        description: 'Please select your domain/specialization to get relevant questions',
        variant: 'warning',
      });
      return;
    }

    setStarting(true);
    try {
      // Gate: camera must be live if proctored mode is ON
      if (ensureCameraForProctoring) {
        await ensureCameraForProctoring();
      }
      const gate = await ensureLiveMediaReady();

      const requestData: any = {
        round_type: selectedRound.round_type,
        domain: domain || userProfile?.domain || '',
        experience_years: parseInt(String(experienceYears || userProfile?.experience_years || 0)), // Ensure integer
        company_specific: companySpecific || undefined,
        enable_tts: true,
        screen_shared: !!gate.screen_shared,
        camera_enabled: !!gate.camera_enabled,
        ...(resumeContext && { resume_context: resumeContext }),
      };

      // Add question_count if user customized it (not using default)
      if (questionCount > 0 && questionCount >= 1 && questionCount <= 15) {
        requestData.question_count = questionCount;
      }

      console.log('🚀 [Round Selection] Starting round with:', requestData);
      console.log('📊 [Round Selection] Request validation:', {
        round_type_is_lowercase: requestData.round_type === requestData.round_type.toLowerCase(),
        domain_is_string: typeof requestData.domain === 'string',
        experience_is_number: typeof requestData.experience_years === 'number',
      });

      const response = await startRoundInterview(requestData);

      console.log('✅ [Round Selection] Response:', response);
      console.log('🔊 [Round Selection] TTS Audio URL:', response.tts_audio_url);

      toast({
        title: 'Round started',
        description: `${selectedRound.name} interview has begun`,
        variant: 'success',
      });

      // Clear the prefill so we don't auto-apply it on future visits.
      try {
        window.localStorage.removeItem('practice_next_session_plan');
      } catch { }

      // Use round_config from response, or fallback to selectedRound
      const roundConfig = response.round_config || selectedRound;

      // Pass TTS audio URL to parent component
      onRoundStart(
        response.session_id,
        roundConfig,
        response.first_question,
        response.tts_audio_url,
        response.total_questions
      );
    } catch (error: any) {
      console.error('❌ [Round Selection] Failed to start round:', error);

      // Log full error for debugging; never expose raw validation details to user
      console.error('📋 [Round Selection] Error details:', error?.message);

      toast({
        title: 'Could not start round',
        description: 'Something went wrong while setting up the interview round. Please check your selections and try again.',
        variant: 'destructive',
      });
    } finally {
      setStarting(false);
    }
  };

  // Build contextual recommendation label for a round
  const getRecommendationLabel = (round: RoundConfig): string | null => {
    // Only label rounds that are actually in the recommended set
    const isInRecommended = recommendedRounds.some(r => r.round_type === round.round_type);
    if (!isInRecommended) return null;

    // HR Screening is always "Start here"
    if (round.round_type === InterviewRound.HR_SCREENING) return null; // handled separately

    const effectiveDomain = domain || userProfile?.domain || '';
    const effectiveExp = experienceYears || userProfile?.experience_years || 0;

    // Contextual labels
    if (effectiveDomain && effectiveExp > 0) {
      const domainShort = effectiveDomain.length > 20 ? effectiveDomain.slice(0, 18) + '…' : effectiveDomain;
      return `For ${domainShort}, ${effectiveExp}yr+`;
    }
    if (effectiveExp > 0) return `For ${effectiveExp}+ yrs experience`;
    if (effectiveDomain) {
      const domainShort = effectiveDomain.length > 25 ? effectiveDomain.slice(0, 23) + '…' : effectiveDomain;
      return `Based on ${domainShort}`;
    }
    return 'Recommended';
  };

  const RoundCard = ({ round, isRecommended = false }: { round: RoundConfig; isRecommended?: boolean }) => {
    const Icon = getRoundIconComponent(round.round_type);
    const tone = getRoundTone(round.round_type);
    const isSelected = selectedRound?.round_type === round.round_type;
    const isDomainMissing = !domain && !userProfile?.domain;
    const isStartHere = round.round_type === InterviewRound.HR_SCREENING;
    const contextualLabel = isRecommended ? getRecommendationLabel(round) : null;

    return (
      <Panel
        as="button"
        variant={isStartHere ? 'raised' : 'default'}
        className={cx(
          'px-panel--interactive group flex flex-col overflow-hidden text-left',
          isSelected && 'px-panel--selected',
          isDomainMissing && 'opacity-40 pointer-events-none',
        )}
        onClick={() => {
          if (isDomainMissing) {
            toast({
              title: 'Domain required',
              description: 'Please select your domain first to choose a round',
              variant: 'warning',
            });
            return;
          }
          setSelectedRound(round);
        }}
      >
        <Seam tone={tone} />

        <div className="flex-1 p-4 sm:p-5 space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div
              className="shrink-0 grid place-items-center w-10 h-10 rounded-[var(--px-r-md)] border"
              style={{
                color: `hsl(${toneVar(tone)})`,
                borderColor: `hsl(${toneVar(tone)} / 0.28)`,
                background: `hsl(${toneVar(tone)} / 0.1)`,
              }}
            >
              <Icon className="w-4.5 h-4.5" />
            </div>
            {isStartHere ? (
              <Chip tone="accent">
                <StatusDot tone="accent" live />
                Start here
              </Chip>
            ) : isSelected ? (
              <CheckCircle2 className="w-4 h-4" style={toneColor('accent')} />
            ) : null}
          </div>

          <div className="min-w-0">
            <h3 className="px-subtitle line-clamp-2">{round.name}</h3>
            <p className="px-note mt-1 line-clamp-2">{round.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip mono icon={Clock}>{round.duration_minutes}m</Chip>
            <Chip mono icon={Target}>{round.question_count} Qs</Chip>
            <Chip tone={DIFFICULTY_TONE[round.difficulty] ?? 'neutral'} className="capitalize">
              {round.difficulty}
            </Chip>
          </div>

          {contextualLabel && !isStartHere && (
            <Chip tone="accent" icon={Sparkles}>{contextualLabel}</Chip>
          )}
        </div>

        {round.focus_areas && round.focus_areas.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-t border-[hsl(var(--px-line-soft))] flex flex-wrap gap-1">
            {round.focus_areas.slice(0, 4).map((area, idx) => (
              <span key={idx} className="px-note text-[0.625rem] px-1.5 py-0.5 rounded-[var(--px-r-xs)] bg-[hsl(var(--px-surface-3))]">
                {area}
              </span>
            ))}
            {round.focus_areas.length > 4 && (
              <span className="px-note text-[0.625rem] px-1.5 py-0.5">+{round.focus_areas.length - 4}</span>
            )}
          </div>
        )}
      </Panel>
    );
  };

  if (loading) {
    return (
      <div className="px flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-5 px-fade">
          <div className="px-orb" style={{ ['--px-orb-size' as string]: '4.5rem' }}>
            <Layers className="w-6 h-6" />
          </div>
          <div className="text-center">
            <Eyebrow tone="accent">Loading</Eyebrow>
            <p className="px-body mt-1.5">Fetching interview rounds…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px w-full pb-10">
      {!selectedRound ? (
        <div className="space-y-5">
          {/* Header */}
          <header className="text-center pt-4 pb-1 px-rise">
            <div className="inline-flex">
              <Chip tone="accent" icon={Zap}>Full interview simulation</Chip>
            </div>
            <h1 className="px-display mt-3.5">Choose your round.</h1>
            <p className="px-body mt-2.5 max-w-md mx-auto">
              Pick a round and configure the session — questions adapt to the profile you set below.
            </p>
          </header>

          {/* Profile setup */}
          <div className="max-w-3xl mx-auto px-rise">
            <Panel variant="raised" className="overflow-hidden">
              <Seam tone="accent" />
              <PanelHead
                eyebrow="Profile"
                icon={Settings}
                tone="accent"
                title="Who is being interviewed?"
                description="This drives which rounds are recommended and how hard the questions get."
                actions={
                  <Chip tone={domain ? 'positive' : 'caution'}>
                    <StatusDot tone={domain ? 'positive' : 'caution'} live={!domain} />
                    {domain ? 'Ready' : 'Required'}
                  </Chip>
                }
              />
              <PanelBody className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="domain" className="px-eyebrow">
                      <Code2 className="w-3 h-3" />
                      Domain / specialisation <span style={toneColor('critical')}>*</span>
                    </label>
                    <Select value={domain} onValueChange={setDomain}>
                      <SelectTrigger
                        id="domain"
                        className={cx('px-select', !domain && 'px-select--invalid')}
                      >
                        <SelectValue placeholder="Select your domain…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        <SelectItem value="Python Backend Development">Python Backend Development</SelectItem>
                        <SelectItem value="Java Backend Development">Java Backend Development</SelectItem>
                        <SelectItem value="JavaScript/Node.js Backend">JavaScript/Node.js Backend</SelectItem>
                        <SelectItem value="Go Backend Development">Go Backend Development</SelectItem>
                        <SelectItem value="C# .NET Development">C# .NET Development</SelectItem>
                        <SelectItem value="Frontend Development (React)">Frontend Development (React)</SelectItem>
                        <SelectItem value="Frontend Development (Vue)">Frontend Development (Vue)</SelectItem>
                        <SelectItem value="Frontend Development (Angular)">Frontend Development (Angular)</SelectItem>
                        <SelectItem value="Full Stack Development">Full Stack Development</SelectItem>
                        <SelectItem value="Mobile Development (iOS)">Mobile Development (iOS)</SelectItem>
                        <SelectItem value="Mobile Development (Android)">Mobile Development (Android)</SelectItem>
                        <SelectItem value="Mobile Development (React Native)">Mobile Development (React Native)</SelectItem>
                        <SelectItem value="Data Engineering">Data Engineering</SelectItem>
                        <SelectItem value="Machine Learning Engineering">Machine Learning Engineering</SelectItem>
                        <SelectItem value="Data Science">Data Science</SelectItem>
                        <SelectItem value="DevOps Engineering">DevOps Engineering</SelectItem>
                        <SelectItem value="Site Reliability Engineering (SRE)">Site Reliability Engineering (SRE)</SelectItem>
                        <SelectItem value="Cloud Engineering (AWS)">Cloud Engineering (AWS)</SelectItem>
                        <SelectItem value="Cloud Engineering (Azure)">Cloud Engineering (Azure)</SelectItem>
                        <SelectItem value="Cloud Engineering (GCP)">Cloud Engineering (GCP)</SelectItem>
                        <SelectItem value="Security Engineering">Security Engineering</SelectItem>
                        <SelectItem value="System Design & Architecture">System Design & Architecture</SelectItem>
                        <SelectItem value="Database Administration">Database Administration</SelectItem>
                        <SelectItem value="Product Management">Product Management</SelectItem>
                      </SelectContent>
                    </Select>
                    {!domain && (
                      <p className="px-note" style={toneColor('critical')}>
                        Required — rounds stay locked until a domain is set.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="experience" className="px-eyebrow">
                      <TrendingUp className="w-3 h-3" />
                      Years of experience
                    </label>
                    <input
                      id="experience"
                      type="number"
                      min="0"
                      max="30"
                      value={experienceYears || ''}
                      onChange={(e) => setExperienceYears(parseInt(e.target.value) || 0)}
                      placeholder="0–30"
                      className="px-field px-num"
                    />
                    <p className="px-note">Sets the difficulty band for generated questions.</p>
                  </div>
                </div>

                {(domain !== (userProfile?.domain || '') || experienceYears !== (userProfile?.experience_years || 0)) && (
                  <PxButton variant="primary" block onClick={loadRounds} disabled={loading || !domain}>
                    <Sparkles className="w-4 h-4" />
                    Update recommendations
                  </PxButton>
                )}
              </PanelBody>
            </Panel>
          </div>

          {/* Filter summary + view switch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-center gap-3">
            {domain && (
              <div className="flex items-center justify-center gap-2.5">
                <Chip tone="accent">{getDomainCategoryName(detectDomainCategory(domain))}</Chip>
                <span className="px-note px-num">{allRounds.length} rounds available</span>
              </div>
            )}

            <div className="flex justify-center">
              <div className="px-segment">
                <button
                  type="button"
                  className="px-segment__item"
                  data-active={view === 'recommended'}
                  onClick={() => setView('recommended')}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Recommended
                </button>
                <button
                  type="button"
                  className="px-segment__item"
                  data-active={view === 'all'}
                  onClick={() => setView('all')}
                >
                  <Layers className="w-3.5 h-3.5" />
                  All rounds
                </button>
              </div>
            </div>
          </div>

          {/* Rounds grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(() => {
              const rounds = view === 'recommended' ? recommendedRounds : allRounds;
              // Sort: HR_SCREENING first ("Start here") to anchor the grid
              const sorted = [...(rounds || [])].sort((a, b) => {
                if (resolveInterviewRound(a.round_type) === InterviewRound.HR_SCREENING) return -1;
                if (resolveInterviewRound(b.round_type) === InterviewRound.HR_SCREENING) return 1;
                return 0;
              });
              return sorted.map((round) => (
                <RoundCard
                  key={round.round_type}
                  round={round}
                  isRecommended={view === 'recommended'}
                />
              ));
            })()}
          </div>

          {(view === 'recommended' ? recommendedRounds : allRounds)?.length === 0 && (
            <div className="max-w-2xl mx-auto">
              <div className="px-panel px-panel--inset flex flex-col items-center gap-2 py-12 text-center">
                <Target className="w-6 h-6 px-ink-3 opacity-60" />
                <p className="px-subtitle">No rounds available</p>
                <p className="px-note max-w-sm">
                  {!domain
                    ? 'Select a domain to see the interview rounds that match it.'
                    : 'Try a different domain, or switch to All rounds.'}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Confirmation ── */
        <div className="max-w-3xl mx-auto pt-4 space-y-4 px-rise">
          {(() => {
            const tone = getRoundTone(selectedRound.round_type);
            const Icon = getRoundIconComponent(selectedRound.round_type);
            const effectiveQuestions = questionCount > 0 ? questionCount : selectedRound.question_count;
            const effectiveMinutes = questionCount > 0
              ? Math.round((questionCount / selectedRound.question_count) * selectedRound.duration_minutes)
              : selectedRound.duration_minutes;

            return (
              <Panel variant="raised" brackets className="overflow-hidden">
                <Seam tone={tone} />
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div
                        className="shrink-0 grid place-items-center w-12 h-12 rounded-[var(--px-r-md)] border"
                        style={{
                          color: `hsl(${toneVar(tone)})`,
                          borderColor: `hsl(${toneVar(tone)} / 0.3)`,
                          background: `hsl(${toneVar(tone)} / 0.1)`,
                        }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <Eyebrow tone={tone}>Selected round</Eyebrow>
                        <h2 className="px-title mt-2">{selectedRound.name}</h2>
                        <p className="px-body mt-1.5">{selectedRound.description}</p>
                      </div>
                    </div>
                    <PxButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRound(null)}
                      disabled={starting}
                    >
                      Change
                    </PxButton>
                  </div>

                  <Grid cols={3} gap="0.625rem" className="mt-5">
                    <StatTile label="Duration" value={effectiveMinutes} unit="min" icon={Clock} tone={tone} />
                    <StatTile label="Questions" value={effectiveQuestions} icon={Target} tone={tone} />
                    <StatTile
                      label="Difficulty"
                      value={<span className="capitalize">{selectedRound.difficulty}</span>}
                      icon={TrendingUp}
                      tone={DIFFICULTY_TONE[selectedRound.difficulty] ?? 'neutral'}
                    />
                  </Grid>
                </div>
              </Panel>
            );
          })()}

          {/* Profile summary */}
          <Panel className="overflow-hidden">
            <PanelHead eyebrow="Your profile" icon={Sparkles} tone="accent" />
            <PanelBody className="space-y-3">
              <Grid cols={1} sm={2}>
                <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="px-note">Domain</span>
                  <span className="text-[0.8125rem] font-semibold px-ink truncate">
                    {domain || userProfile?.domain || '—'}
                  </span>
                </div>
                <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="px-note">Experience</span>
                  <span className="px-num text-[0.8125rem] font-semibold px-ink">
                    {experienceYears || userProfile?.experience_years || 0} yrs
                  </span>
                </div>
              </Grid>

              {(!domain && !userProfile?.domain) && (
                <div
                  className="px-panel px-panel--inset flex items-center gap-2.5 px-3.5 py-3"
                  style={{ borderColor: `hsl(${toneVar('critical')} / 0.3)` }}
                >
                  <Target className="w-4 h-4 shrink-0" style={toneColor('critical')} />
                  <p className="px-body px-body--tight">Go back and select your domain to start.</p>
                </div>
              )}
            </PanelBody>
          </Panel>

          {/* Session settings */}
          <Panel className="overflow-hidden">
            <PanelHead eyebrow="Session settings" icon={Settings} />
            <PanelBody className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="company" className="px-eyebrow">
                  <Briefcase className="w-3 h-3" />
                  Company-specific preparation
                </label>
                <input
                  id="company"
                  className="px-field"
                  placeholder="e.g., Google, Meta, Amazon, Netflix…"
                  value={companySpecific}
                  onChange={(e) => setCompanySpecific(e.target.value)}
                />
                <p className="px-note">Optional — tailors questions to that company's interview style.</p>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="questionCount" className="px-eyebrow">
                    <Target className="w-3 h-3" />
                    Number of questions
                  </label>
                  <span className="px-num text-[0.8125rem] font-semibold px-ink">
                    {questionCount === 0 ? `Default · ${selectedRound.question_count}` : questionCount}
                  </span>
                </div>
                <input
                  id="questionCount"
                  type="range"
                  min="0"
                  max="15"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[hsl(var(--px-accent))] bg-[hsl(var(--px-line))]"
                />
                <div className="flex items-center justify-between">
                  <span className="px-note px-num">0 = default</span>
                  <span className="px-note px-num">15 max</span>
                </div>
              </div>

              <ResumeUpload
                mode="practice"
                onParsed={(ctx) => onResumeChange?.(ctx)}
                onClear={() => onResumeChange?.(null)}
                existing={resumeContext}
              />
            </PanelBody>
          </Panel>

          {/* Consent */}
          <div
            className="px-panel px-panel--inset p-4"
            style={{ borderColor: livePracticeConsentChecked ? `hsl(${toneVar('accent')} / 0.34)` : undefined }}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                id="round-selection-live-practice-consent"
                checked={livePracticeConsentChecked}
                onCheckedChange={(value) => onLivePracticeConsentChange(!!value)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <Eyebrow tone={livePracticeConsentChecked ? 'accent' : 'neutral'} icon={Shield}>
                  Live Practice consent
                </Eyebrow>
                <label
                  htmlFor="round-selection-live-practice-consent"
                  className="block mt-1.5 cursor-pointer text-[0.8125rem] font-semibold leading-snug px-ink"
                >
                  I understand that Live Practice uses camera, screen, and recording to simulate real interview conditions.
                </label>
                <div className="px-note mt-2 space-y-1">
                  <p>Camera and full-screen monitoring stay active while the session runs.</p>
                  <p>Recordings may be uploaded for interview evaluation and review.</p>
                  <p>Camera-proctored mode adds automated integrity checks and warning enforcement.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <PxButton
              variant="outline"
              size="lg"
              onClick={() => setSelectedRound(null)}
              disabled={starting}
              className="sm:flex-1"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to selection
            </PxButton>
            <PxButton
              variant="primary"
              size="lg"
              onClick={handleStartRound}
              disabled={starting || (!domain && !userProfile?.domain) || !livePracticeConsentChecked}
              className="sm:flex-[1.4]"
            >
              {starting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting interview…
                </>
              ) : (!domain && !userProfile?.domain) ? (
                <>
                  <Target className="w-4 h-4" />
                  Select domain first
                </>
              ) : !livePracticeConsentChecked ? (
                <>
                  <Shield className="w-4 h-4" />
                  Review consent first
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Start interview round
                </>
              )}
            </PxButton>
          </div>
        </div>
      )}
    </div>
  );
}