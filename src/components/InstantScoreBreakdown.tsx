import { useState, useEffect } from 'react';
import { Loader2, Award, Target, TrendingUp, ShieldAlert, Film, TriangleAlert, Gauge, BarChart3 } from 'lucide-react';
import { getSessionScore, type SessionScore } from '@/lib/progressApi';
import { StrataxApiError } from '@/lib/strataxClient';
import {
  Panel,
  PanelHead,
  PanelBody,
  Seam,
  Eyebrow,
  Chip,
  PxButton,
  Grid,
  MeterRow,
  Dial,
  FindingList,
} from './practice/PracticeKit';
import { toneColor, toneVar, type PxTone } from './practice/tones';

interface InstantScoreBreakdownProps {
  sessionId: string;
  onViewProgress?: () => void;
}

/** Same score→tone scale the rest of Practice Mode reads by. */
const scoreTone = (value: number): PxTone => {
  if (value >= 85) return 'positive';
  if (value >= 70) return 'accent';
  if (value >= 50) return 'caution';
  return 'critical';
};

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function InstantScoreBreakdown({ sessionId, onViewProgress }: InstantScoreBreakdownProps) {
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<SessionScore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadScore();
  }, [sessionId]);

  const loadScore = async () => {
    setLoading(true);
    setError(null);
    try {
      const scoreData = await getSessionScore(sessionId);
      setScore(scoreData);
    } catch (err) {
      console.error('Failed to load session score:', err);
      if (err instanceof StrataxApiError) {
        if (err.status === 404) {
          setError('Score breakdown not available yet (endpoint not deployed)');
        } else {
          setError(`Could not load score breakdown (${err.status})`);
        }
      } else {
        setError('Could not load score breakdown');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="px">
        <Panel className="overflow-hidden">
          <PanelBody className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-5 h-5 animate-spin" style={toneColor('accent')} />
            <div className="text-center">
              <Eyebrow tone="accent">Scoring</Eyebrow>
              <p className="px-body mt-1.5">Compiling your score breakdown…</p>
            </div>
            <div className="w-40">
              <div className="px-sweep" />
            </div>
          </PanelBody>
        </Panel>
      </div>
    );
  }

  if (error || !score) {
    return (
      <div className="px">
        <Panel tone="caution" className="overflow-hidden">
          <PanelBody className="flex flex-col items-center gap-3 py-10 text-center">
            <TriangleAlert className="w-5 h-5" style={toneColor('caution')} />
            <p className="px-body">{error || 'Score not available'}</p>
            <PxButton variant="outline" size="sm" onClick={loadScore}>
              Retry
            </PxButton>
          </PanelBody>
        </Panel>
      </div>
    );
  }

  const dimensions = Object.entries(score.dimension_scores).sort((a, b) => b[1] - a[1]);
  const overallTone = scoreTone(score.overall_score);

  const whyItems = Array.isArray(score.why)
    ? score.why.filter((item) => typeof item === 'string' && item.trim())
    : [];

  const nextSessionPlan = score.next_session_plan && typeof score.next_session_plan === 'object'
    ? score.next_session_plan
    : null;
  const nextSessionFocus = Array.isArray(nextSessionPlan?.focus)
    ? nextSessionPlan.focus.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const nextSessionFocusDimension = typeof nextSessionPlan?.focus_dimension === 'string' ? nextSessionPlan.focus_dimension : null;
  const nextSessionRound = typeof nextSessionPlan?.recommended_round === 'string' ? nextSessionPlan.recommended_round : null;
  const nextSessionDifficulty = typeof nextSessionPlan?.difficulty === 'string' ? nextSessionPlan.difficulty : null;
  const nextSessionQuestionCount = typeof nextSessionPlan?.question_count === 'number' ? nextSessionPlan.question_count : null;

  const screenUrl =
    (typeof score.screen_recording_url === 'string' ? score.screen_recording_url : '') ||
    (typeof score.media?.screen_recording_url === 'string' ? score.media.screen_recording_url : '');
  const cameraUrl =
    (typeof score.camera_recording_url === 'string' ? score.camera_recording_url : '') ||
    (typeof score.media?.camera_recording_url === 'string' ? score.media.camera_recording_url : '');
  const proctoringStatus = typeof score.proctoring_summary?.status === 'string' ? score.proctoring_summary.status : '';
  const riskLevel = typeof score.risk_level === 'string'
    ? score.risk_level
    : typeof score.proctoring_summary?.risk_level === 'string'
      ? score.proctoring_summary.risk_level
      : '';
  const terminatedReason = typeof score.terminated_reason === 'string'
    ? score.terminated_reason
    : typeof score.proctoring_summary?.terminated_reason === 'string'
      ? score.proctoring_summary.terminated_reason
      : '';
  const violationCount = typeof score.total_violation_count === 'number'
    ? score.total_violation_count
    : typeof score.violation_count === 'number'
      ? score.violation_count
      : typeof score.proctoring_summary?.total_violations === 'number'
        ? score.proctoring_summary.total_violations
        : typeof score.proctoring_summary?.violation_count === 'number'
          ? score.proctoring_summary.violation_count
          : null;
  const seriousViolationCount = typeof score.serious_violation_count === 'number'
    ? score.serious_violation_count
    : typeof score.proctoring_summary?.serious_violations === 'number'
      ? score.proctoring_summary.serious_violations
      : null;
  const eventCounts = score.event_counts
    ? Object.entries(score.event_counts)
    : score.proctoring_summary?.event_counts && typeof score.proctoring_summary.event_counts === 'object'
      ? Object.entries(score.proctoring_summary.event_counts as Record<string, number>)
      : [];
  const proctoringEvents = Array.isArray(score.recent_events)
    ? score.recent_events
    : Array.isArray(score.events)
      ? score.events
      : Array.isArray(score.proctoring_summary?.recent_events)
        ? score.proctoring_summary.recent_events
        : Array.isArray(score.proctoring_summary?.events)
          ? score.proctoring_summary.events
          : [];

  const proctoringTone: PxTone = terminatedReason
    ? 'critical'
    : violationCount && violationCount > 0
      ? 'caution'
      : 'positive';

  return (
    <div className="px space-y-4">

      {/* ── Overall score ── */}
      <Panel variant="raised" brackets className="overflow-hidden px-rise">
        <Seam tone={overallTone} />
        <PanelHead
          eyebrow="Session score"
          icon={Award}
          tone={overallTone}
          title="Your score breakdown"
          description="Scored against the dimensions a real interviewer weighs."
        />
        <PanelBody>
          <div className="flex flex-col sm:flex-row items-center gap-7">
            <Dial value={score.overall_score} size={156} stroke={9} tone={overallTone}>
              <div>
                <div className="px-num text-[2.5rem] font-semibold px-ink leading-none">
                  {score.overall_score.toFixed(0)}
                </div>
                <div className="px-eyebrow mt-2 justify-center">out of 100</div>
              </div>
            </Dial>

            <div className="flex-1 w-full min-w-0 space-y-3.5">
              <Eyebrow icon={Gauge}>Dimension scores</Eyebrow>
              {dimensions.map(([dimension, value]) => (
                <MeterRow
                  key={dimension}
                  label={<span className="capitalize">{dimension.replace(/_/g, ' ')}</span>}
                  value={value}
                  display={value.toFixed(0)}
                  tone={scoreTone(value)}
                />
              ))}
            </div>
          </div>
        </PanelBody>
      </Panel>

      {/* ── Rationale ── */}
      <Panel className="overflow-hidden px-rise">
        <PanelHead eyebrow="Rationale" icon={BarChart3} tone="neural" title="Why you got this score" />
        <PanelBody>
          <FindingList items={whyItems} tone="neural" empty="No explanation available." />
        </PanelBody>
      </Panel>

      {/* ── Plans ── */}
      {(Array.isArray(score.improvement_plan) && score.improvement_plan.length > 0) ||
      (Array.isArray(score.next_session_plan) && score.next_session_plan.length > 0) ? (
        <Grid
          cols={1}
          md={
            (Array.isArray(score.improvement_plan) && score.improvement_plan.length > 0) &&
            (Array.isArray(score.next_session_plan) && score.next_session_plan.length > 0)
              ? 2
              : 1
          }
          gap="0.75rem"
        >
          {Array.isArray(score.improvement_plan) && score.improvement_plan.length > 0 && (
            <Panel tone="accent" className="overflow-hidden px-rise">
              <PanelHead eyebrow="Improvement plan" icon={Target} tone="accent" />
              <PanelBody>
                <FindingList items={score.improvement_plan} tone="accent" numbered />
              </PanelBody>
            </Panel>
          )}

          {nextSessionPlan && (
            <Panel tone="positive" className="overflow-hidden px-rise">
              <PanelHead eyebrow="Next session plan" icon={TrendingUp} tone="positive" />
              <PanelBody className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {nextSessionFocusDimension && <Chip mono>Focus · {nextSessionFocusDimension}</Chip>}
                  {nextSessionRound && <Chip mono>Round · {nextSessionRound}</Chip>}
                  {nextSessionDifficulty && (
                    <Chip mono className="capitalize">Difficulty · {nextSessionDifficulty}</Chip>
                  )}
                  {typeof nextSessionQuestionCount === 'number' && (
                    <Chip mono>Questions · {nextSessionQuestionCount}</Chip>
                  )}
                </div>

                <FindingList
                  items={nextSessionFocus}
                  tone="positive"
                  empty="Structured next-session guidance is available for this attempt."
                />
              </PanelBody>
            </Panel>
          )}
        </Grid>
      ) : null}

      {/* ── Recordings ── */}
      {(!!screenUrl || !!cameraUrl) && (
        <Panel className="overflow-hidden px-rise">
          <PanelHead eyebrow="Recordings" icon={Film} tone="accent" />
          <PanelBody className="space-y-2">
            {!!screenUrl && (
              <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="px-body px-body--tight">Screen recording</span>
                <a
                  className="px-btn px-btn--ghost px-btn--sm"
                  href={screenUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={toneColor('accent')}
                >
                  Open
                </a>
              </div>
            )}
            {!!cameraUrl && (
              <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="px-body px-body--tight">Camera recording</span>
                <a
                  className="px-btn px-btn--ghost px-btn--sm"
                  href={cameraUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={toneColor('accent')}
                >
                  Open
                </a>
              </div>
            )}
          </PanelBody>
        </Panel>
      )}

      {/* ── Proctoring ── */}
      {(proctoringStatus || violationCount !== null || seriousViolationCount !== null || proctoringEvents.length > 0 || terminatedReason) && (
        <Panel tone={proctoringTone === 'positive' ? undefined : proctoringTone} className="overflow-hidden px-rise">
          <PanelHead
            eyebrow="Integrity"
            icon={ShieldAlert}
            tone={proctoringTone}
            title="Proctoring summary"
            actions={
              <div className="flex items-center gap-1.5">
                {riskLevel && (
                  <Chip tone={riskLevel === 'warning' || riskLevel === 'serious' ? 'critical' : 'neutral'}>
                    {riskLevel}
                  </Chip>
                )}
                {violationCount !== null && (
                  <Chip mono tone={violationCount > 0 ? 'critical' : 'positive'}>
                    {violationCount} event{violationCount === 1 ? '' : 's'}
                  </Chip>
                )}
              </div>
            }
          />
          <PanelBody className="space-y-3">
            {(proctoringStatus || seriousViolationCount !== null) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {proctoringStatus && <Chip mono>Status · {titleCase(proctoringStatus)}</Chip>}
                {seriousViolationCount !== null && (
                  <Chip mono tone={seriousViolationCount > 0 ? 'critical' : 'positive'}>
                    Serious · {seriousViolationCount}
                  </Chip>
                )}
              </div>
            )}

            {terminatedReason && (
              <div
                className="px-panel px-panel--inset px-3.5 py-3"
                style={{ borderColor: `hsl(${toneVar('critical')} / 0.3)` }}
              >
                <Eyebrow tone="critical">Termination reason</Eyebrow>
                <p className="px-body mt-1.5">{terminatedReason}</p>
              </div>
            )}

            {eventCounts.length > 0 && (
              <Grid cols={1} sm={2}>
                {eventCounts.map(([eventType, count]) => (
                  <div
                    key={eventType}
                    className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <span className="px-note">{titleCase(eventType)}</span>
                    <span className="px-num text-[0.8125rem] font-semibold px-ink">{count}</span>
                  </div>
                ))}
              </Grid>
            )}

            {proctoringEvents.length === 0 ? (
              <p className="px-note">No proctoring events recorded.</p>
            ) : (
              <div className="space-y-1.5">
                <Eyebrow>Event log</Eyebrow>
                {proctoringEvents.slice(0, 20).map((evt, idx) => {
                  const e = evt as Record<string, unknown>;
                  // Format event type: WINDOW_MINIMIZED → Window Minimized
                  const rawType = String(e.event_type ?? e.type ?? e.event ?? e.name ?? JSON.stringify(evt));
                  const label = titleCase(rawType);
                  const ts = e.timestamp ?? e.created_at ?? e.time;
                  const detail = e.detail ?? e.details ?? e.message ?? e.description;
                  const timeStr = typeof ts === 'string'
                    ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : null;

                  return (
                    <div
                      key={idx}
                      className="px-panel px-panel--inset flex items-center gap-3 px-3.5 py-2.5"
                    >
                      <TriangleAlert className="w-3.5 h-3.5 shrink-0" style={toneColor('caution')} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[0.8125rem] font-semibold px-ink">{label}</span>
                        {typeof detail === 'string' && detail && (
                          <span className="px-note ml-1.5">— {detail}</span>
                        )}
                      </div>
                      {timeStr && <span className="px-note px-num shrink-0">{timeStr}</span>}
                    </div>
                  );
                })}
                {proctoringEvents.length > 20 && (
                  <p className="px-note">Showing the first 20 events.</p>
                )}
              </div>
            )}
          </PanelBody>
        </Panel>
      )}

      {onViewProgress && (
        <div className="flex justify-center">
          <PxButton variant="outline" size="lg" onClick={onViewProgress}>
            <Award className="w-4 h-4" />
            View full progress
          </PxButton>
        </div>
      )}
    </div>
  );
}
