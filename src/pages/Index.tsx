import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  MessageSquare,
  Brain,
  Video,
  Code2,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronRight,
  Network,
  BookOpen,
  TrendingUp
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { UserProfile } from "@/components/UserProfile";
import { useAuth } from "@/context/AuthContext";

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [selectedFeature, setSelectedFeature] = useState<typeof features[0] | null>(null);
  const [showFeatureModal, setShowFeatureModal] = useState(false);

  // Safety: clear any stale scroll-lock styles left by overlays/modals.
  // On some mobile browsers, a previous `body { position: fixed }` lock can persist
  // after route changes/crashes and make the landing page appear "stuck".
  useEffect(() => {
    try {
      const body = document.body;
      const html = document.documentElement;
      body.style.overflow = '';
      body.style.overflowY = '';
      body.style.position = '';
      body.style.width = '';
      body.style.height = '';
      html.style.overflow = '';
      html.style.overflowY = '';
    } catch {
      // ignore
    }
  }, []);

  // World-class futuristic design - no particle animations needed

  const features = [
    {
      icon: MessageSquare,
      title: "AI Assistant",
      kind: "ASSIST",
      description: "Get comprehensive, interview-ready answers to both technical and behavioral questions. Our AI provides structured responses following industry best practices like the STAR method, with detailed explanations and practical examples tailored to your interview preparation needs.",
    },
    {
      icon: Sparkles,
      title: "Mirror Mode (Feedback)",
      kind: "ASSIST",
      description: "Turn a rough draft into an interview-ready response. Enter the question, paste your draft answer, and get structured critique (clarity, structure, missing points) plus an improved rewrite you can confidently deliver.",
    },
    {
      icon: Brain,
      title: "Interview Intelligence",
      kind: "RESEARCH",
      description: "Access a curated database of real interview questions from top tech companies. Browse questions by topic, company, or difficulty level. Get verified answers and insights to prepare strategically for your target companies and roles.",
    },
    {
      icon: Zap,
      title: "Real-time Practice",
      kind: "PRACTICE",
      description: "Live, session-based practice with spoken answers, instant per-question feedback and a scored round at the end. Interview conditions are yours to set: turn camera and screen monitoring on for a realistic proctored run, or leave them off and practise without them — either way the session is scored and saved. With monitoring on, a phone or a second person in frame is flagged, and that analysis runs entirely in your browser: frames are never sent anywhere to be checked, only the resulting signal.",
    },
    {
      icon: Video,
      title: "Mock Interviews",
      kind: "PRACTICE",
      description: "Practice with realistic mock interview sessions that simulate real interview scenarios. Receive instant feedback on your responses, track your progress over time, and identify areas for improvement with detailed performance analytics.",
    },
    {
      icon: Code2,
      title: "Advanced Code Studio",
      kind: "BUILD",
      description: "Run Python, JavaScript, TypeScript, Java, C, C++, C#, Go, Rust and SQL on current runtimes — the editor shows you the exact version your code will run on, so modern syntax behaves the way it does in a real interview. Step through Python line by line with live variable values and plain-English explanations of each line, feed in stdin, and stop a runaway loop the moment you spot it.",
    },
    {
      icon: TrendingUp,
      title: "Progress & Analytics",
      kind: "MEASURE",
      description: "Every scored round feeds a single view of how you are actually improving. See your average across sessions, a week-by-week heatmap of each skill — correctness, delivery, clarity, structure — and which of them is your strongest and weakest right now. Each score shows its own working: what was measured, what was not, and why. Finish a round and the next session's focus is recommended for you.",
    },
    {
      icon: Network,
      title: "System Architecture AI",
      kind: "BUILD",
      description: "Generate complete multi-view architecture diagrams for any system description. Get junior-to-architect level diagrams with both single and multi-view perspectives, detailed explanations, and key insights automatically. Perfect for system design interviews and visualizing complex software architectures.",
    }
  ];

  return (
    <div className="px px-shell relative min-h-screen overflow-y-auto touch-pan-y transition-colors duration-500 overflow-x-clip" style={{ maxWidth: '100vw', WebkitOverflowScrolling: 'touch' }}>
      {/* Fixed Header with User Profile */}
      <div className="fixed top-0 right-0 z-50 p-4 flex items-center gap-3">
        {loading ? null : user ? <UserProfile /> : null}
      </div>

      {/* Instrument-panel field.
          Replaces five blurred rainbow orbs and a glassmorphism scrim. The
          design system this product already ships (src/styles/practice-system.css)
          states the rule plainly: "one accent hue, semantic colour used only to
          mean something, hairline structure". Structure is drawn, not blurred:
          a measured grid, one accent bloom, one horizon seam. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute inset-0 bg-[hsl(var(--px-canvas))] transition-colors duration-500" />

        {/* Measured grid — the page reads as a surface with coordinates. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--px-grid-ink)) 1px, transparent 1px),' +
              'linear-gradient(to bottom, hsl(var(--px-grid-ink)) 1px, transparent 1px)',
            backgroundSize: 'clamp(48px, 6vw, 84px) clamp(48px, 6vw, 84px)',
            maskImage: 'radial-gradient(120% 90% at 50% 0%, #000 35%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(120% 90% at 50% 0%, #000 35%, transparent 100%)',
          }}
        />

        {/* A single accent bloom. One hue, low amplitude, no competition. */}
        <div
          className="absolute -top-[18vh] left-1/2 -translate-x-1/2 w-[min(1100px,140vw)] h-[min(620px,70vh)] rounded-[50%] blur-[90px]"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 40%, hsl(var(--px-bloom-a)) 0%, transparent 70%)',
          }}
        />

        {/* Horizon: the hairline that separates hero from content. */}
        <div className="absolute inset-x-0 top-[86vh] px-seam opacity-60" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Hero Section */}
        <div className="relative min-h-screen flex items-center">
          <div className="container mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-12 sm:pb-16">
            <div className="max-w-5xl mx-auto space-y-7 sm:space-y-9">
              {/* Status line, not a marketing badge. Mono, tracked, with a live
                  dot — the same vocabulary the running product uses. */}
              <div className="px-rise flex items-center gap-2.5" style={{ ['--px-delay' as string]: '0ms' }}>
                <span className="px-dot px-dot--live" />
                <span className="px-eyebrow">Interview preparation system</span>
              </div>

              <h1
                className="px-rise text-[clamp(2.5rem,7vw,5.25rem)] font-[620] leading-[0.98] tracking-[-0.04em] text-balance"
                style={{ ['--px-delay' as string]: '60ms' }}
              >
                Rehearse the interview
                <br />
                <span className="text-[hsl(var(--px-ink-2))]">before it happens.</span>
              </h1>

              <p
                className="px-rise max-w-2xl text-base sm:text-lg leading-relaxed text-[hsl(var(--px-ink-2))]"
                style={{ ['--px-delay' as string]: '120ms' }}
              >
                Live rounds with spoken answers and scored feedback, a code studio on current
                runtimes, and a progress view that shows its own working — so you know what
                improved and why.
              </p>

              <div
                className="px-rise flex flex-col sm:flex-row gap-3 pt-1"
                style={{ ['--px-delay' as string]: '180ms' }}
              >
                <button
                  type="button"
                  onClick={() => { if (!loading) navigate("/app"); }}
                  disabled={loading}
                  className="px-btn px-btn--primary px-btn--lg group"
                >
                  {loading ? "Loading…" : "Start a session"}
                  <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/docs")}
                  className="px-btn px-btn--outline px-btn--lg"
                >
                  <BookOpen className="w-4 h-4" />
                  Read the docs
                </button>
              </div>

              {/* Instrument readout. Real capabilities as measured values —
                  the page states what the system is, rather than adjectives. */}
              <dl
                className="px-rise grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-6 max-w-3xl"
                style={{ ['--px-delay' as string]: '240ms' }}
              >
                {[
                  { value: '10', unit: 'languages', label: 'Code studio' },
                  { value: '4', unit: 'dimensions', label: 'Scored per answer' },
                  { value: '2s', unit: 'cadence', label: 'On-device checks' },
                  { value: '0', unit: 'frames sent', label: 'Detection stays local' },
                ].map((stat) => (
                  <div key={stat.label} className="px-tile">
                    <dd className="px-tile__value px-num">
                      {stat.value}
                      <span className="px-tile__unit"> {stat.unit}</span>
                    </dd>
                    <dt className="px-tile__label">{stat.label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* Scroll Hint */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 md:bottom-6 flex justify-center">
            <div className="text-muted-foreground/70">
              <ChevronDown className="h-6 w-6 animate-float" />
            </div>
          </div>
        </div>

        {/* Features Bento Grid */}
        <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8 sm:mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="px-eyebrow">Capabilities</span>
                <h2 className="px-display mt-2.5">Eight instruments, one loop</h2>
              </div>
              <p className="px-num text-[0.6875rem] uppercase tracking-[0.16em] text-[hsl(var(--px-ink-3))]">
                {String(features.length).padStart(2, '0')} modules
              </p>
            </div>

            <div className="px-grid [--px-cols:1] md:[--px-cols:2] xl:[--px-cols:3] [--px-gap:0.625rem]">
              {features.map((feature, index) => (
                <button
                  key={feature.title}
                  type="button"
                  onClick={() => {
                    setSelectedFeature(feature);
                    setShowFeatureModal(true);
                  }}
                  aria-label={`${feature.title} — read more`}
                  className="px-panel px-panel--interactive px-brackets px-rise group h-full text-left focus-visible:outline-none"
                  style={{ ['--px-delay' as string]: `${Math.min(index, 6) * 45}ms` }}
                >
                  <div className="px-panel__head px-panel__head--plain">
                    {/* The index is the ornament. Mono numerals carry the
                        "instrument" reading that eight different gradients
                        were previously being asked to carry. */}
                    <span className="px-num text-[0.6875rem] text-[hsl(var(--px-ink-3))] tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="px-eyebrow">{feature.kind}</span>
                    <feature.icon
                      className="ml-auto h-4 w-4 text-[hsl(var(--px-ink-3))] transition-colors duration-200 group-hover:text-[hsl(var(--px-accent))]"
                      strokeWidth={1.75}
                    />
                  </div>

                  <div className="px-panel__body space-y-2.5">
                    <h3 className="px-title">{feature.title}</h3>
                    <p className="text-[0.8125rem] leading-[1.6] text-[hsl(var(--px-ink-2))] line-clamp-4">
                      {feature.description}
                    </p>
                  </div>

                  <div className="px-panel__foot">
                    <span className="px-eyebrow transition-colors duration-200 group-hover:text-[hsl(var(--px-accent))]">
                      Read more
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--px-ink-3))] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[hsl(var(--px-accent))]" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer — a base plate, not a banner. */}
        <footer className="mt-8 border-t border-[hsl(var(--px-line-soft))]">
          <div className="container mx-auto px-4 sm:px-6 py-7 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="px-eyebrow">Stratax AI</span>
            <p className="px-num text-[0.6875rem] tracking-[0.08em] text-[hsl(var(--px-ink-3))]">
              © {new Date().getFullYear()} — interview preparation, measured.
            </p>
          </div>
        </footer>
      </div>

      {/* Feature Info Modal */}
      <Dialog open={showFeatureModal} onOpenChange={setShowFeatureModal}>
        {/* `px` is required here, not inherited: Radix portals dialog content to
            document.body, outside the page's `.px` wrapper, so without this
            every --px-* token inside the modal resolves to nothing. */}
        <DialogContent className="px inset-x-2 sm:inset-x-4 max-w-[96vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 md:gap-4 mb-4">
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-xl md:text-2xl font-bold">{selectedFeature?.title}</DialogTitle>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">Comprehensive feature overview and capabilities</p>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription className="text-sm md:text-base leading-relaxed space-y-4 md:space-y-6">
            <p className="text-foreground">{selectedFeature?.description}</p>

            <div className="pt-3 md:pt-4 border-t">
              <h4 className="font-semibold mb-3 md:mb-4 text-base md:text-lg text-foreground">Key Features & Benefits:</h4>
              <ul className="space-y-2 md:space-y-3">
                {selectedFeature?.title === "AI Assistant" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">STAR Method Answers:</strong> Get perfectly structured responses following the Situation, Task, Action, Result framework that interviewers expect</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Personalized Responses:</strong> Tailored answers based on your role, experience level, and target company culture</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Comprehensive Coverage:</strong> Handles both technical questions and behavioral scenarios with equal expertise</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Real-Time Support:</strong> Get instant answers during preparation or even during live interviews with discreet overlay mode</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Context-Aware:</strong> Remembers your conversation history to provide consistent, coherent answers throughout your session</li>
                  </>
                )}
                {selectedFeature?.title === "Mirror Mode (Feedback)" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Draft → Polished:</strong> Paste your draft answer and get a stronger, interview-ready rewrite</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Structured Critique:</strong> Clear feedback on clarity, structure, relevance, and missing points</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Better Storytelling:</strong> Improves flow and adds crisp, high-signal phrasing interviewers expect</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Behavioral + Technical:</strong> Works for STAR answers, explanations, and problem-solving narratives</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Actionable Next Steps:</strong> Practical suggestions you can apply immediately in your next attempt</li>
                  </>
                )}
                {selectedFeature?.title === "Interview Intelligence" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Verified Question Bank:</strong> Access thousands of real interview questions from FAANG and top tech companies, verified by actual candidates</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Smart Filtering:</strong> Search and filter by company, role, topic, difficulty level, and question type to focus your preparation</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Detailed Solutions:</strong> Each question comes with comprehensive answers, multiple approaches, and interviewer insights</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Frequency Tracking:</strong> See which questions are asked most frequently at your target companies</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Pattern Recognition:</strong> Learn common question patterns and themes to prepare more effectively</li>
                  </>
                )}
                {selectedFeature?.title === "Real-time Practice" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Live Practice Sessions:</strong> Engage in real-time practice with immediate feedback on your responses</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Instant Corrections:</strong> Get immediate suggestions for improving your answers while you practice</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Adaptive Difficulty:</strong> Questions automatically adjust to your skill level for optimal learning</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Time Management:</strong> Practice under realistic time constraints to build your interview pace</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Performance Metrics:</strong> Track your speed, accuracy, and improvement over time with detailed analytics</li>
                  </>
                )}
                {selectedFeature?.title === "Mock Interviews" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Realistic Simulations:</strong> Practice with AI-powered mock interviews that feel like the real thing</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Company-Specific Prep:</strong> Simulate interviews for specific companies with their unique question styles and culture</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Multi-Round Practice:</strong> Experience full interview loops including phone screens, technical rounds, and behavioral interviews</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Detailed Feedback:</strong> Receive comprehensive performance reports with strengths, weaknesses, and improvement suggestions</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Progress Tracking:</strong> Monitor your improvement across multiple mock sessions with visual analytics</li>
                  </>
                )}
                {selectedFeature?.title === "Advanced Code Studio" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Multi-Language Support:</strong> Write and execute code in Python, JavaScript, Java, C++, and more with full syntax highlighting</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Visual Execution Flow:</strong> See your code come to life with interactive diagrams showing memory, stack, and execution steps</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Step-by-Step Debugging:</strong> Debug complex algorithms with variable tracking, breakpoints, and execution visualization</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">AI Code Analysis:</strong> Get instant explanations of how your code works, time/space complexity analysis, and optimization suggestions</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Interview Timer:</strong> Practice with realistic time constraints and track your coding speed</li>
                  </>
                )}
                {selectedFeature?.title === "System Architecture AI" && (
                  <>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Multi-View Diagrams:</strong> Generate architecture diagrams from junior, mid-level, and senior architect perspectives automatically</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Single & Split Views:</strong> View complete systems or focus on specific components with both unified and decomposed architecture views</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Intelligent Insights:</strong> Get automatic explanations of design decisions, trade-offs, and scalability considerations</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Industry Patterns:</strong> Learn recognized architecture patterns and best practices applied to your system design</li>
                    <li className="text-sm md:text-base"><strong className="text-[hsl(var(--px-accent))] font-semibold">Interactive Editing:</strong> Modify and refine diagrams in real-time with live Mermaid diagram support</li>
                  </>
                )}
              </ul>
            </div>
          </DialogDescription>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowFeatureModal(false)}
              className="px-btn px-btn--primary px-btn--block"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(8px); }
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }

        .animate-float {
          animation: float 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default Index;
