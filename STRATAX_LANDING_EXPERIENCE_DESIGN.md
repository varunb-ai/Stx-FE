# StrataX AI — Landing Experience Design System

**Status:** Design specification, v1.0
**Supersedes:** `public/landing.html` (static marketing page), `src/pages/Index.tsx` (React landing at `/landing`)
**Audience:** Frontend engineers, designers, brand
**Stack it targets:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + framer-motion (already in `package.json`)

---

## 0. The One Idea

> Every AI landing page in 2026 looks the same: a dark hero, a glowing orb, drifting particles, a gradient headline, three feature cards, a logo wall. It is a costume. It says nothing about the product underneath.

StrataX AI does not need a costume. It needs a **thesis**, and the thesis is already in the name.

**Strata = layers.** Sedimentary bands. Depth you can read. Evidence stacked in order, where every layer is a record of something that actually happened and the whole column tells you how you got here.

That is *precisely* what the product does. StrataX does not hand you a number. It hands you a **column of evidence**: what you said, how you said it, what the code did when it ran, which claim on your résumé held up under probing, how this session compares to the eleven before it. Eight modules feeding one scoring standard.

**So the design principle is:**

### Evidence Made Visible.

The landing page does not *describe* explainable scoring. It *performs* it. Within eight seconds of arrival, a visitor watches StrataX evaluate something — and watches the score decompose into the layers that produced it. The page is not a brochure for the instrument. **The page is the instrument, running.**

This is what makes it uncopyable. A competitor can steal a gradient. They cannot steal a design language derived from their own name meaning the thing their product actually does.

**The three consequences that follow from this, and govern every decision in this document:**

| Principle | Meaning | What it forbids |
|---|---|---|
| **Depth is structural, not decorative** | Every element sits on a declared depth stratum (S0–S5). Z-order carries meaning: raw signal is deep, conclusions surface. | Drop shadows "to make it pop." Random blur. Parallax for vibes. |
| **Motion is causal** | Nothing moves unless something caused it. Animation shows a relationship — signal → score, input → consequence. | Idle floating blobs. Looping particle fields. Decorative auto-scroll. |
| **Claims are receipted** | Every number on the page can be clicked, expanded, or traced to its source. | Unsourced stats. "10x faster." Fabricated testimonials. |

---

## Table of Contents

1. [Design Philosophy — The Strata Doctrine](#1-design-philosophy--the-strata-doctrine)
2. [Visual Language](#2-visual-language--stratification-as-a-system)
3. [User Psychology & First-Impression Strategy](#3-user-psychology--the-first-eight-seconds)
4. [Information Architecture](#4-information-architecture--page-hierarchy)
5. [Hero Section](#5-hero--the-live-evaluation)
6. [Section-by-Section Specification](#6-section-by-section-specification)
7. [Feature Narrative](#7-core-features--the-narrative-spine)
8. [Platform Ecosystem & Technology](#8-platform-ecosystem--technology-highlights)
9. [Trust, Credibility & Social Proof](#9-trust-credibility--social-proof)
10. [Motion Design & Micro-Interactions](#10-motion-design--micro-interactions)
11. [Signature UI Components](#11-signature-ui-components--the-ownable-patterns)
12. [Responsive Experience](#12-responsive-experience)
13. [Accessibility, Performance, Scalability](#13-accessibility-performance-scalability)
14. [Design Tokens](#14-design-tokens)
15. [Conversion Strategy](#15-conversion-strategy--engagement-flow)
16. [Technical Implementation & Frontend Architecture](#16-technical-implementation--frontend-architecture)
17. [Design System & Component Library](#17-design-system--component-library)
18. [Future-Proofing](#18-future-proofing)
19. [Build Roadmap](#19-build-roadmap)

---

## 1. Design Philosophy — The Strata Doctrine

Six laws. Every review question resolves against them.

### Law 1 — Depth is structural

The interface has six declared depth strata. An element's stratum is a semantic assignment, not a visual afterthought. The rule that makes it legible: **raw signal lives deep, synthesis surfaces.**

| Stratum | Name | Contents | Blur | Opacity | Scale on scroll |
|---|---|---|---|---|---|
| **S0** | Bedrock | Page background, the Strata Field | — | 1.0 | 1.00 (fixed) |
| **S1** | Substrate | Sectional bands, grid rules, ambient telemetry | 3px | 0.35 | 1.02 |
| **S2** | Sediment | Raw evidence: transcripts, code, audio waveforms | 1px | 0.70 | 1.04 |
| **S3** | Strata | Primary content: cards, copy, module panels | 0 | 1.0 | 1.06 |
| **S4** | Surface | Interactive controls, CTAs, navigation | 0 | 1.0 | 1.08 |
| **S5** | Apex | Score verdicts, modals, the cursor instrument | 0 | 1.0 | 1.10 |

Scroll parallax rates derive from stratum index — deeper moves slower. This is not a decorative effect; it is the depth model made perceptible. One rate table, applied globally, means the whole page moves as one coherent volume rather than a stack of independently-animated sections.

### Law 2 — Motion is causal

Before any animation ships, answer: *what caused this?* If the answer is "the page loaded" or "it looked static," delete it.

Legitimate causes: user input, data arriving, a state transition, a value being derived from another value, an element entering the viewport for the first time.

The signature move — used maybe five times on the whole page — is the **rise**: a value emerges from deep strata, ascends through the layers, and resolves at S5. It is used exclusively for *a conclusion being derived from evidence*. Because it is rationed, it means something.

### Law 3 — Claims are receipted

Every quantitative claim carries a `<ReceiptedStat>` treatment: the number is interactive, and expanding it shows the source. "10 languages" expands to the language list with live-resolved runtime versions. "6 AI agents" expands to the agent roster with each agent's job.

This is a *design* decision with a *trust* payoff. It is also a hedge against the single biggest credibility failure mode of AI marketing sites: numbers nobody can check. If a number cannot be receipted, **it does not go on the page.**

### Law 4 — Restraint is the luxury signal

Premium is not maximalism. Premium is *confidence expressed as omission*: generous negative space, one accent colour used sparingly, type doing the work, motion that is rare and therefore meaningful.

Hard budgets, enforced in review:
- **One** accent hue (brand blue). Semantic colours (green/amber/red) appear **only** where they carry evaluative meaning — a score band, a pass/fail. Never decoratively.
- **Maximum three** simultaneously animating elements in any viewport.
- **Maximum one** gradient-filled text element per viewport.
- Every section must contain at least one region of deliberate emptiness ≥ 120px tall on desktop.

### Law 5 — The page must survive its own JavaScript

Full content, correct hierarchy, and working CTAs with zero JS executed. Every immersive layer is progressive enhancement, feature-detected and independently sheddable. This is simultaneously an accessibility requirement, an SEO requirement, a performance requirement, and — for a 2026 page that must still work in 2031 — a longevity requirement.

### Law 6 — Honesty is the differentiator

The category's default register is hype. StrataX's is **instrumentation**: precise, specific, verifiable, unbothered. Never "revolutionary." Never "10x." Say the actual number, say what it measures, let the visitor conclude.

This is a *positioning* asset, not modesty. In a market saturated with inflated claims, the brand that visibly refuses to inflate reads as the one with something real.

---

## 2. Visual Language — Stratification as a System

### 2.1 The Strata Field

The signature background. It replaces the category-standard particle field / mesh gradient / floating orb.

**Concept:** a slow, near-still cross-section of layered sediment — horizontal bands of subtly varying density drifting at different rates, like geological layers viewed edge-on. Occasionally a faint vertical **signal trace** rises through the bands, brightening each as it passes, and resolves into a point of light at the top. That is a data point being evaluated: raw input at the bottom, conclusion at the top.

**Why it works:**
- Directly encodes the brand name and the product's core mechanic
- Reads as *instrumentation* (seismograph, spectrometer, core sample) rather than *sci-fi*, which is what dates
- Almost entirely still — it does not compete with content, and it costs nearly nothing to render

**Implementation ladder** (pick the highest tier the device supports, degrade silently):

| Tier | Condition | Technique | Cost |
|---|---|---|---|
| 3 | WebGL2 + `deviceMemory ≥ 8` + not `prefers-reduced-motion` + desktop | Single fragment shader, ~1.4kb GLSL, layered value noise, DPR-capped at 1.5 | ~0.4ms/frame |
| 2 | Modern browser, no WebGL | Static SVG band stack + 3 CSS-transformed layers | ~0.1ms/frame |
| 1 | Reduced motion, low memory, or save-data | Single static SVG. Zero animation. | 0 |
| 0 | No CSS/JS | Flat `--bedrock` background | 0 |

**Critically: tier 3 renders nothing during page load.** It mounts after `requestIdleCallback` post-LCP. The hero's first paint is always tier 1. Nobody waits on a shader to see the headline.

### 2.2 Materials

Three materials. No others.

**Bedrock** — the page ground. Deep navy `#171b3c`, the established brand base (already the PWA theme colour and icon background in `package.json`). Non-negotiable anchor.

**Sediment** — content surfaces. Not "glassmorphism," which is 2021 and dating fast. Sediment is a *layered* material: a near-opaque base, a 1px top edge lit as if from above, and a barely-perceptible internal density gradient (top 4% lighter). It reads as a slab of material with thickness, not a pane of frosted glass.

```css
.sediment {
  background:
    linear-gradient(180deg, hsl(226 34% 15% / 0.94) 0%, hsl(226 36% 12% / 0.97) 100%);
  border: 1px solid hsl(226 30% 24%);
  border-top-color: hsl(226 28% 32%);      /* lit top edge — the "thickness" cue */
  border-radius: var(--radius-lg);
  box-shadow:
    inset 0 1px 0 hsl(220 40% 70% / 0.06), /* interior highlight */
    0 1px 2px hsl(226 50% 4% / 0.5),
    0 8px 24px -8px hsl(226 50% 4% / 0.4);
}
```

**Signal** — the only emissive material. Brand blue, used exclusively for *live or derived* things: an active score, a streaming token, a focused control, the signal trace. Signal is never used for static decoration. When the visitor sees blue glow, something is *happening*.

### 2.3 Light

Single light source, above and slightly forward. Top edges catch light, bottom edges fall into shadow, and the ambient occlusion between stacked strata is what creates depth — not blur radius.

Because the light model is consistent, the page reads as a physical object photographed once, rather than a collage of independently-styled components. This is the single highest-leverage detail separating "premium" from "made with a UI kit."

### 2.4 The Anti-Pattern List

Explicitly forbidden, because they are what make AI sites interchangeable:

- ❌ Purple→pink gradient meshes
- ❌ Floating/rotating glowing orbs or spheres
- ❌ Drifting particle constellations with connecting lines
- ❌ Grid-perspective floors receding to a horizon
- ❌ Full-bleed animated gradient headline text
- ❌ "AI" chip iconography, circuit-board motifs, brain glyphs
- ❌ Auto-scrolling logo marquees presented as customer proof
- ❌ Faux terminal windows typing marketing copy
- ❌ Neon cyberpunk cyan/magenta
- ❌ 3D isometric SaaS illustrations with tiny people

---

## 3. User Psychology — The First Eight Seconds

### 3.1 Who arrives

Three audiences, one page. Their needs conflict, and resolving that conflict is the central IA problem.

| Segment | Share | Arrives asking | Fails if | Convert with |
|---|---|---|---|---|
| **The Candidate** (job-seeker, 0–8 yrs exp) | ~70% | "Will this actually get me the offer?" | It feels like cheating, or like generic ChatGPT | Proof of *specificity* — their company, their stack, their résumé |
| **The Skeptical Engineer** | ~20% | "What's under this, or is it a GPT wrapper?" | Architecture is hidden behind marketing | Named systems: Judge0, BM25+vector, dual-LLM routing, BYOK |
| **The Evaluator** (bootcamp, university, L&D buyer) | ~10% | "Is the scoring defensible enough to standardise on?" | Scores look like a black box | Explainability, rubric transparency, exportable reports |

**The resolution:** all three want the *same thing* — proof that the evaluation is real. The Candidate wants it as reassurance, the Engineer as architecture, the Evaluator as auditability. So the page has **one spine (evidence) with three depths of disclosure.** Nobody gets a separate tab; everybody gets the next layer down when they ask for it.

### 3.2 The eight-second sequence

Attention is spent in a fixed order. Design to it deliberately.

**0.0–0.4s — Competence.** First paint must land before judgment forms. The visitor is not reading; they are deciding whether this is a serious product. Delivered by: typographic precision, a settled layout with zero shift, and a background that is *already* correct rather than fading in. **CLS here is not a metric, it is the whole impression.**

**0.4–2.0s — Orientation.** The headline resolves. It must answer "what is this" in one pass, with no cleverness tax. Not a pun, not a question, not a metaphor. A claim.

**2.0–5.0s — The hook.** The Live Evaluation begins in the hero. Something is being scored, in front of them, unprompted. This is the moment that beats every competitor page, because every competitor page shows a *screenshot* here.

**5.0–8.0s — The turn.** The score decomposes into its evidence layers. The visitor understands, without reading a word of body copy, that this system *shows its work*. That understanding is the entire value proposition, delivered pre-verbally.

**8.0s+ — Volition.** They scroll, or they act. Both are wins; the page is built so the scroll *is* the sales argument.

### 3.3 Psychological levers, used deliberately

- **The Instrument Effect** — tools that visibly measure read as more competent than tools that merely assert. Every section contains at least one element that looks like it is *reading* something.
- **Earned Specificity** — "13 round types" outperforms "comprehensive coverage" because a fabricated number is a liability while a real one is a proof. Specificity signals the claim survived contact with reality.
- **Productive Discomfort** — the Weakness Mirror section (§6.9) shows the product finding a flaw. Counter-intuitively this *increases* trust: a tool that only flatters is a tool that cannot help you. This is the page's boldest move and its strongest differentiator.
- **Consequence Framing** — the stakes are not "improve your interview skills," they are "the offer, the salary band, the next five years." Name it once, in the closing section. Once. Naming it twice is manipulation and reads as such.
- **Reciprocity before ask** — the visitor receives a real evaluation before being asked for anything. Signup follows value, never precedes it.

---

## 4. Information Architecture & Page Hierarchy

### 4.1 The narrative arc

The page is a single argument in five movements. Each section earns the next.

```
ACT I — PROOF          Hero → Live Evaluation
   "This thing measures. Watch it measure."
ACT II — MECHANISM     Evidence Column → Modules → Agents
   "Here is how it measures, in named detail."
ACT III — DIFFERENCE   Weakness Mirror → Comparison
   "Here is what no other tool does."
ACT IV — TRUST         Architecture → Privacy → Proof
   "Here is why you can rely on it."
ACT V — ACTION         Pricing → Close
   "Here is what to do now."
```

### 4.2 Section map

| # | Section | Act | Purpose | Height (desktop) | Primary CTA |
|---|---|---|---|---|---|
| 0 | Navigation | — | Persistent wayfinding | 64px fixed | Start Free |
| 1 | **Hero + Live Evaluation** | I | Prove capability pre-verbally | 100vh | Start Free / Watch it score |
| 2 | Signal Bar | I | Receipted scale metrics | 180px | — |
| 3 | **Evidence Column** | II | The core differentiator, explained | 220vh (pinned) | — |
| 4 | Module Constellation | II | 8 modules as one system | 140vh | Explore module |
| 5 | Agent Roster | II | The 6-agent architecture | 100vh | — |
| 6 | Interview Theatre | II | See a full session end-to-end | 120vh | Try this round |
| 7 | Code Evaluation | II | Live sandbox execution | 100vh | Run it yourself |
| 8 | **Weakness Mirror** | III | Show the product finding a flaw | 100vh | See your blind spots |
| 9 | The Difference | III | Explicit competitive contrast | 90vh | — |
| 10 | Architecture | IV | Engineer credibility | 110vh | Read the docs |
| 11 | Privacy & Control | IV | BYOK, zero-storage, on-device | 80vh | — |
| 12 | Proof | IV | Verifiable social proof | 90vh | — |
| 13 | Pricing | V | Remove commercial friction | 100vh | Start Free |
| 14 | FAQ | V | Dissolve final objections | Auto | — |
| 15 | Close | V | Final conversion | 90vh | Start Free |
| 16 | Footer | — | Depth, SEO, legal | Auto | — |

**Total scroll:** ~1,700vh desktop. Long, but every screen advances the argument — and sections 3–8 are the product demonstrating itself, which reads as exploration rather than reading.

### 4.3 Navigation

A **Depth Rail**, not a conventional navbar — a slim vertical rail on the right edge (desktop ≥1280px) showing the sixteen sections as tick marks grouped into the five acts. The current section's tick extends and labels itself. Position is *depth through the argument*, not distance through a document.

Top bar stays minimal and honest: wordmark, four anchor links, theme toggle, `Sign in`, `Start Free`. On scroll past hero it compresses 80px→56px, gains a 1px bottom rule and backdrop blur. No hide-on-scroll — hiding navigation to reclaim 56px is a false economy that costs orientation.

Mobile (<1024px): rail is replaced by a 2px top progress bar; nav collapses to wordmark + `Start Free` + sheet menu.

---

## 5. Hero — The Live Evaluation

The highest-stakes 100vh on the internet for this brand.

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [wordmark]      features  platform  pricing  docs   [Start] │  S4
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─ eyebrow ──────────────────┐                             │
│   │ ◆ Interview Intelligence   │                             │  S3
│   └────────────────────────────┘        ┌──────────────────┐ │
│                                         │                  │ │
│   Interviews are scored.                │   THE LIVE       │ │
│   Now the scoring                       │   EVALUATION     │ │  S2→S5
│   ─────────────────                     │                  │ │
│   shows its work.                       │   [instrument]   │ │
│                                         │                  │ │
│   Eight AI modules evaluate every        │                  │ │
│   answer you give — and every score      └──────────────────┘ │
│   decomposes into the evidence                               │
│   that produced it.                                          │
│                                                              │
│   [ Start free — no card ]  [ ▷ Watch it score ]              │  S4
│                                                              │
│   ─────────────────────────────────────────────────────      │
│   8 modules · 6 agents · 13 rounds · 10 languages · BYOK      │  S3
│                                                              │
└──────────────────────────────────────────────────────────────┘
                    ░░ Strata Field ░░                          S0/S1
```

Asymmetric 7:5 split. The instrument is deliberately *not* centred and *not* a screenshot.

### 5.2 The headline

**Primary:**
> # Interviews are scored.
> # Now the scoring shows its work.

Two sentences. First states an uncomfortable fact the visitor already knows. Second states what StrataX changes. No adjectives, no gradient, no "AI-powered." The confidence *is* the differentiator — in a category where everyone shouts, the calm claim reads as the credible one.

Typeset in Outfit at `clamp(2.75rem, 6.2vw, 5.5rem)`, weight 300 for line 1, weight 600 for line 2 — the weight shift carries the emphasis so colour doesn't have to. Line 2's "shows its work" gets a 2px signal-blue underline that **draws left-to-right at 900ms**, timed to complete exactly as the Live Evaluation begins. Copy and demo are one gesture.

**Subhead:**
> Eight AI modules evaluate every answer you give — spoken, written, or executed — and every score decomposes into the evidence that produced it.

**Alternates for A/B:**
- `Your answer was good. // Here is exactly how good, and why.`
- `Stop guessing why you didn't get the offer.`
- `The interview coach that shows its receipts.`

### 5.3 The Live Evaluation instrument

**The single most important component on the site.** It runs a real 14-second evaluation loop, from pre-recorded fixture data, with zero network dependency.

**The loop:**

| t | Stage | What is shown |
|---|---|---|
| 0.0s | **Question** | A real question surfaces at S3: *"Design a rate limiter for a multi-tenant API."* |
| 1.2s | **Answer** | Transcript streams in at S2 (sediment layer), word by word, at natural speech cadence (~2.8 words/sec). Monospace. Deliberately imperfect — includes a filler word. |
| 4.5s | **Signals** | Four signal traces ignite in the deep strata beneath the transcript, each pulsing at its own rate: `STRUCTURE` `DEPTH` `CLARITY` `EVIDENCE` |
| 7.0s | **Rise** | The four traces converge and ascend through the strata — the signature *rise* motion |
| 8.4s | **Verdict** | They resolve at S5 into a score: **78 / 100**, with band `STRONG`. Counter animates 0→78 over 700ms with a spring settle. |
| 9.5s | **Decomposition** | The 78 **splits apart** into four stacked bands, each labelled and weighted: Structure 22/25 · Depth 18/25 · Clarity 21/25 · Evidence 17/25 |
| 11.0s | **The receipt** | One band expands: *"Evidence 17/25 — you asserted 'it scales' without naming a bound. Interviewers probe unbounded claims."* |
| 13.0s | **Reset** | Fades to the next of three fixtures. |

**Why this beats every competitor hero:** they show a *screenshot of a result*. This shows the *derivation of a result*. The visitor doesn't learn that StrataX scores answers — they learn that StrataX can tell them *the specific sentence that cost them points*. That is the product, delivered in fourteen seconds, before a single body-copy word is read.

**Interaction:**
- Hover → loop pauses, "click to inspect any layer" appears
- Click a band → expands its full rubric breakdown
- `Watch it score` → restarts from t=0 and scrolls the instrument to viewport centre
- Reduced motion → renders the final decomposed state immediately, static, fully legible. **The reduced-motion version communicates 100% of the argument** — that is the test of whether motion was doing real work or decorating.
- No JS → static SVG of the final state, inlined in the HTML.

**Performance contract:** ≤22KB fixture JSON, ≤6KB component, zero network calls, no impact on LCP (LCP element is the headline), mounts post-hydration.

### 5.4 CTAs

**Primary — `Start free — no card`**
Signal-blue fill, 52px tall, 15px/600 Outfit. On hover a faint signal trace sweeps left→right beneath the label in 400ms — the hero's visual motif, miniaturised. Never a pulse or bounce; those read as needy.

**Secondary — `▷ Watch it score`**
Ghost, 1px sediment border. Scrolls-and-restarts rather than opening a video modal. Keeping the visitor *on the page interacting with the product* beats sending them to a video every time.

Below both: `Free tier · Bring your own key · No card required` — three objections pre-empted in nine words.

---

## 6. Section-by-Section Specification

### 6.1 Signal Bar

**Purpose:** convert scale into credibility without a logo wall.

Four `ReceiptedStat` units on a single S1 band, separated by hairline rules. Numbers count up **once**, on first intersection, `easeOutExpo` 1100ms, staggered 90ms.

| Stat | Receipt (on expand) |
|---|---|
| **8** AI-powered modules | Names all eight, each linking to its section |
| **6** specialised agents | Agent roster with each agent's responsibility |
| **13** interview round types | Full round list |
| **10** language runtimes | Language list with live-resolved versions from the Judge0 sandbox |

Every one of these is verifiable from the codebase today. That is the whole point of Law 3.

### 6.2 The Evidence Column ★ *centrepiece*

**Purpose:** the differentiator, taught rather than claimed. If a visitor reads only one section, this is it.

**Format:** a pinned 220vh scroll sequence. The column stays fixed centre-screen; scroll progress excavates it layer by layer — like sectioning a core sample.

| Progress | Layer revealed | Copy |
|---|---|---|
| 0–15% | **The Score** — a single 84 at S5 | "Most tools stop here. A number, and a shrug." |
| 15–35% | **The Criteria** — splits into 5 weighted bands | "Every score is a weighted sum of five criteria. The weights are visible, and they're the same for everyone." |
| 35–55% | **The Evidence** — each band links to transcript spans | "Each criterion points at the exact words that earned or cost you points." |
| 55–75% | **The Signals** — waveform, pacing, filler density, code trace | "Underneath: what your voice did, what your code did, what you left unsaid." |
| 75–90% | **The History** — the column joins 11 prior columns | "And every column joins your history. Semantic dedup means the same weakness twice is a pattern, not a coincidence." |
| 90–100% | **Unpins**, full column visible | "That's the whole stack. Nothing hidden." |

**Motion:** scroll-linked only — no autoplay, no time-based tweens. The visitor controls the excavation; scrubbing back re-buries layers exactly. Reversibility is what makes it feel like an instrument rather than a video.

**Mobile:** unpins entirely. Becomes six stacked cards, each revealing on entry. Same six beats, same copy, no pinning — pinned scroll on touch is a usability failure and gets no exception here.

### 6.3 Module Constellation

**Purpose:** present eight modules as one coherent system, not a feature list.

A radial arrangement — not a grid — with the unified **Scoring Standard** at centre and eight modules orbiting at fixed positions. Thin signal lines connect each module to the core. The layout argues the thesis: *eight modules, one standard.*

Hovering a module: it rises to S4, its connection line brightens, and — crucially — **related modules' lines also brighten**, showing the actual dependency graph. Progress Intelligence lights up when you hover Practice Mode, because it consumes its output. The interaction teaches the architecture.

The eight (content per existing `landing.html`, which is accurate to the product):

| Module | One-liner | Tags |
|---|---|---|
| **AI Copilot** | Context-aware assistant with dual-LLM routing, session persistence, identity-safe streaming | SSE · Multi-turn · Dual LLM |
| **Practice Mode** | Session practice with 6 agents, local STT, adaptive interviewing, optional on-device proctoring | 6 Agents · 13 Rounds · Proctored |
| **Mock Interview** | Multi-question simulator, 3-level progressive hints, 5-criteria evaluation, exportable reports | 4 Types · Hints · HTML Export |
| **Interview Intelligence** | Hybrid BM25 + vector retrieval, grounded generation for 15 major companies | Hybrid Search · 15 Companies |
| **Code Evaluation** | Judge0 sandbox execution + static analysis + LLM critique across 10 languages | Judge0 · 10 Languages · Critique |
| **Résumé Intelligence** | Claim extraction, ATS scoring, skills-gap analysis, tailored probing — in-memory only | ATS · Claims · Zero Storage |
| **Architecture Generator** | System-design questions → structured Mermaid diagrams with scaling annotations | Mermaid · Auto Layout |
| **Progress Intelligence** | Cross-session semantic dedup, heatmaps, trends, AI study plans via Mirror Ontology | Mirror Ontology · Trends |

**Mobile:** radial collapses to a vertical spine with modules alternating left/right off a central line. Connection lines persist — the system metaphor survives the reflow.

### 6.4 Agent Roster

**Purpose:** answer the Skeptical Engineer's "is this a GPT wrapper?"

Six agent cards. Each states: name, single responsibility, input, output, and which model tier it routes to. Presented as a *pipeline diagram*, not a feature grid — an answer visibly flows through it left to right.

The honest framing: "Six agents, each with one job, because a single prompt asked to do six things does all six badly." That sentence converts engineers.

### 6.5 Interview Theatre

**Purpose:** a full session, end to end, in 45 seconds.

A three-pane interface — question, response, live signals — replaying a real recorded session. The visitor can scrub the timeline and jump between the four interview types. It is a product tour that never says "product tour."

Adaptive follow-ups get their own beat: the transcript shows the AI asking a *different* second question because of what the candidate said first. Branching is shown, not asserted.

### 6.6 Code Evaluation

**Purpose:** demonstrate the only genuinely hard-to-fake capability — real sandboxed execution.

A live Monaco editor (already a dependency), pre-loaded with a two-bug function. Visitor clicks `Run`. Actual Judge0 execution against the real backend. Output panel shows: test results, static analysis findings, and LLM critique — *in the same three-layer structure as the Evidence Column*, reinforcing the system's consistency.

Language selector shows live-resolved runtime versions. Rate-limited, cached, with a graceful pre-computed fallback if the backend is unavailable — the demo must never appear broken.

### 6.7 The Weakness Mirror ★ *the bold one*

**Purpose:** the section no competitor will copy, because it requires confidence.

Every rival section shows the product praising the user. This one shows the product **finding a flaw** — a real weakness, named precisely, with the evidence.

```
   YOU SAID                          STRATAX SAW
   ─────────                         ───────────
   "...and then we scaled it         ◆ Unbounded claim, no metric
   and it worked really well."       ◆ 3rd unquantified assertion
                                       this session
                                     ◆ Pattern across 4 sessions:
                                       impact stated, never measured

                                     → This costs you the senior band.
                                       Interviewers read it as
                                       inability to measure your
                                       own work.
```

Cold, specific, useful. It says: *this tool will tell you the truth, which is why it's worth using.* It is the strongest trust signal on the page precisely because it is unflattering.

CTA: `See your blind spots →`

### 6.8 The Difference

Explicit contrast, named honestly, no strawmen:

| | Generic LLM chat | Question banks | **StrataX AI** |
|---|---|---|---|
| Evaluates delivery | ✗ | ✗ | **Voice, pacing, filler density** |
| Explains the score | Prose only | ✗ | **Weighted, traceable to spans** |
| Runs your code | ✗ | ✗ | **Judge0 sandbox, 10 languages** |
| Remembers you | Per-thread | ✗ | **Cross-session semantic dedup** |
| Company-grounded | Hallucination risk | Static | **Hybrid retrieval, 15 companies** |
| Your keys, your data | ✗ | ✗ | **BYOK, in-memory résumé** |

Naming "generic LLM chat" as a real alternative — rather than a strawman competitor — is itself a credibility signal.

### 6.9 Architecture

**Purpose:** the engineer's proof.

A real system diagram: client → routing layer → agent pipeline → LLM providers (Groq/Gemini) → Judge0 → retrieval (BM25 + vector) → Mirror Ontology store. Interactive; each node expands to explain its role and why it was chosen.

Copy in engineering register, not marketing register. Links to `FRONTEND_TECHNICAL_DOCUMENTATION.md` and `ARCHITECTURE_API_INTEGRATION.md` — real repo artifacts, which is itself the proof.

### 6.10 Privacy & Control

Three claims, each substantiated:

- **BYOK** — your key, your provider, your spend. Never proxied through a shared pool.
- **Zero résumé storage** — parsed in memory, never persisted. *(Verify against current implementation before shipping this claim.)*
- **On-device proctoring** — face/object detection runs in-browser via TensorFlow.js + face-api. Video never leaves the device.

That last one is a genuinely rare architectural choice and deserves prominence. Most proctoring uploads video. This doesn't.

### 6.11 Proof

**⚠️ This section is the page's integrity test.**

Ship **only** what is substantiable today:

- ✅ Real, attributed, permissioned testimonials
- ✅ Aggregate usage metrics you can query
- ✅ Verifiable technical claims (languages, companies, modules)
- ✅ Named integrations (Judge0, Groq, Gemini, Firebase)

**Never ship:** invented testimonials, fabricated outcome percentages, unauthorised company logos, "trusted by 10,000+" without the query behind it. One fabricated proof point, discovered, destroys the credibility the other fifteen sections built.

**If real proof is thin at launch:** replace with a `Build in Public` panel — changelog, roadmap, open metrics. Transparency substitutes for scale credibly. Fake scale substitutes for nothing.

**Design:** testimonials as **evidence cards** — quote plus the module referenced plus the score delta, in the same layered material as everything else. Proof presented in the product's own visual grammar.

### 6.12 Pricing

Three tiers, radical clarity, no "Contact sales" on the primary path. Free tier genuinely usable — BYOK makes this economically viable and is a real strategic advantage worth stating plainly.

Each tier shows exactly what it unlocks in terms of the eight modules. Annual toggle animates as a *reweighting* of the price band, not a card flip.

### 6.13 FAQ

Objections, ordered by frequency. Answered directly, in one paragraph, no deflection.

Lead with the hardest: **"Is this cheating?"** Answer honestly — Practice and Mock modes are preparation tools; Copilot is a study aid; here is our position on live-interview use. Dodging this question is more damaging than answering it, because every visitor is already thinking it.

### 6.14 Close

Return of the Strata Field, at full intensity for the only time on the page. Single line:

> ### You already know the answer.
> ### Find out whether you can *show* it.

One CTA. No form, no second option, no footer noise above it. The last screen is a decision, not a menu.

---

## 7. Core Features — The Narrative Spine

Features never appear as a flat list. Every one is introduced by the problem it solves, and each carries a single named mechanism.

| # | Feature | The problem it answers | Named mechanism |
|---|---|---|---|
| 1 | Real-time AI Copilot | "I freeze and can't structure my answer" | Dual-LLM routing, SSE streaming |
| 2 | Explainable Scoring | "I got rejected and never learned why" | 5-criteria weighted rubric, span-linked |
| 3 | Voice & Speech Analysis | "I sound nervous and don't know it" | Local STT, pacing/filler analysis |
| 4 | Résumé-Aware Probing | "They asked about *my* project and I fumbled" | Claim extraction → targeted probes |
| 5 | Adaptive Follow-Ups | "Real interviewers dig; question banks don't" | Branching agent, depth-seeking |
| 6 | Proctored Sessions | "Practice doesn't feel like the real thing" | On-device face/object detection |
| 7 | Code Evaluation | "My code 'looked right' and failed" | Judge0 + static analysis + critique |
| 8 | Progress Intelligence | "I keep making the same mistake" | Mirror Ontology semantic dedup |

Each renders as a **Signal Card** (§11.3): problem in muted text, mechanism in signal blue, a small live visual, and a receipted detail.

---

## 8. Platform Ecosystem & Technology Highlights

**The framing:** StrataX is not eight tools. It is one evaluation standard with eight entry points. Every module writes into the same scoring substrate — which is why Progress Intelligence can compare a coding round against a behavioural round from three weeks earlier.

**Technology, stated plainly (this is the engineer's section — no marketing register):**

- **Dual-LLM routing** — Groq for latency-critical streaming, Gemini for depth-critical evaluation. Routed per-task, not per-user.
- **Hybrid retrieval** — BM25 lexical + dense vector, reciprocal-rank fused. Lexical alone misses paraphrase; vector alone misses exact company/role terms.
- **Judge0 sandbox** — real isolated execution, live-resolved runtimes, 10 languages.
- **On-device ML** — TensorFlow.js (coco-ssd) + face-api for proctoring. Zero video egress.
- **Mirror Ontology** — semantic normalisation of weaknesses across sessions, so "vague about scale" in a system-design round and "no metrics" in a behavioural round resolve to one tracked pattern.
- **BYOK** — user-supplied provider keys, client-held.
- **PWA** — installable, offline-capable shell, service worker.

---

## 9. Trust, Credibility & Social Proof

Five layers, deployed in ascending order of strength:

1. **Technical specificity** — named systems and exact numbers. Free, immediate, and the most defensible.
2. **Architectural transparency** — the diagram, the linked docs. Nobody fakes an architecture section.
3. **Privacy posture** — BYOK, zero-storage, on-device. A structural claim competitors cannot match without rebuilding.
4. **Demonstrated capability** — the live demos. The visitor verifies for themselves.
5. **Human proof** — testimonials and outcomes. Strongest when real; **fatal when fabricated.**

Layers 1–4 are fully available today from the codebase. **Build trust on 1–4 and add 5 only as it becomes genuinely true.** A page that is credible without testimonials is stronger than one that is credible only because of invented ones.

---

## 10. Motion Design & Micro-Interactions

### 10.1 Timing system

| Token | Duration | Curve | Use |
|---|---|---|---|
| `--m-instant` | 90ms | `cubic-bezier(.4,0,.2,1)` | Hover, focus, toggle |
| `--m-quick` | 180ms | `cubic-bezier(.4,0,.2,1)` | Tooltips, small reveals |
| `--m-base` | 320ms | `cubic-bezier(.22,1,.36,1)` | Card entry, panel open |
| `--m-deliberate` | 620ms | `cubic-bezier(.16,1,.3,1)` | Section reveal, strata shift |
| `--m-rise` | 1400ms | `cubic-bezier(.19,1,.22,1)` | **The signature rise. Rationed.** |
| `--m-settle` | spring(1, 180, 22) | — | Score counters, verdicts |

**Rule:** the deeper the stratum, the slower it moves. Deep strata use `--m-deliberate`+; S4/S5 controls use `--m-instant`. Interfaces feel responsive when *controls* are fast, regardless of how slow the background is.

### 10.2 The rise (signature)

```
Deep stratum (S1) ──► ascends through S2, S3, S4 ──► resolves at S5
   opacity 0                brightens each layer         full opacity
   blur 8px                 it passes through            blur 0
   y +80px                                               y 0
   scale 0.92                                            scale 1
```

Used **only** when a conclusion is derived from evidence. Five instances page-wide: hero verdict, Evidence Column resolution, Code Evaluation result, Weakness Mirror finding, Close headline. Rarity is what makes it read as significant rather than as a transition style.

### 10.3 Micro-interactions

- **Buttons** — 90ms scale to 0.985 on press, `--m-settle` release. No hover-lift; hover-lift is 2020.
- **Signal sweep** — primary CTA hover: a 2px blue trace sweeps left→right beneath the label, 400ms, once.
- **Cards** — hover raises one stratum: border-top brightens, ambient shadow deepens. Never translateY.
- **Cursor instrument** (desktop, fine pointer only) — a 24px reticle that snaps to interactive targets with a 90ms magnetic ease. On evaluative elements it displays a live readout. Ships **only if** it is flawless at 120Hz; a janky custom cursor is worse than none.
- **Focus** — 2px signal ring, 3px offset. Visible on every interactive element, always, no exceptions.
- **Scroll reveal** — 24px rise + fade, 620ms, 60ms stagger. Fires **once** (`IntersectionObserver` + unobserve). Elements that re-animate on every scroll-past are the most common polish failure on ambitious landing pages.

### 10.4 Reduced motion

`prefers-reduced-motion: reduce` is not a degraded mode — it is a first-class variant.

- All transforms → opacity-only crossfades ≤120ms
- Strata Field → static tier 1
- Live Evaluation → final decomposed state, immediately
- Evidence Column → unpinned stack, all layers visible
- Counters → final values, no count-up

**Acceptance test:** with reduced motion on, the page must communicate **100% of its argument**. If any claim only lands via animation, that claim was never properly designed.

---

## 11. Signature UI Components — The Ownable Patterns

Six components that exist nowhere else. These are the brand's design IP.

### 11.1 `<StrataField>` — the background system
Six-tier depth field with signal traces. §2.1. Ownable because it encodes the name.

### 11.2 `<EvidenceColumn>` — layered score decomposition
A score that excavates into criteria → evidence → signals → history. §6.2. **The single most valuable component**; reusable inside the product itself, not just marketing.

### 11.3 `<SignalCard>` — the problem/mechanism card
Replaces the icon-title-description card. Structure: muted problem statement → signal-blue mechanism → live micro-visual → receipted detail. Renders on a sediment surface with a lit top edge.

### 11.4 `<ReceiptedStat>` — the checkable number
Every stat is expandable to its source. §5.1 / Law 3. A trust mechanism disguised as a component.

### 11.5 `<Constellation>` — relational module map
Radial system map where hover reveals real dependencies. §6.3. Argues "one system" structurally rather than in copy.

### 11.6 `<VerdictMeter>` — the honest score
A score display that **cannot render without its breakdown**. The API makes the criteria array required — you physically cannot use it to show a bare number. A design system that enforces the brand's ethic in its type signature.

```tsx
// Not optional. This is the point.
interface VerdictMeterProps {
  score: number;
  max: number;
  criteria: Array<{ label: string; earned: number; possible: number; evidence: string }>;
  band: 'developing' | 'competent' | 'strong' | 'exceptional';
}
```

---

## 12. Responsive Experience

**Not** desktop-shrunk. Three genuinely distinct compositions.

| Breakpoint | Range | Composition |
|---|---|---|
| `xs` | 320–479 | Single column, 16px gutters, all pinning off, Live Evaluation → 3-frame carousel |
| `sm` | 480–767 | Single column, 20px gutters, stats 2×2 |
| `md` | 768–1023 | Two-column where content allows, Constellation → vertical spine |
| `lg` | 1024–1279 | Full layout, pinning enabled, rail hidden |
| `xl` | 1280–1727 | Depth Rail appears, asymmetric hero, full Constellation |
| `2xl` | 1728+ | Max content 1440px; extra width goes to the Strata Field, never to line length |

**Mobile-specific decisions:**
- **All scroll-pinning disabled below 1024px.** Non-negotiable. Pinned sections on touch break the scroll contract.
- Live Evaluation becomes a **swipeable 3-frame sequence** (answer → signals → verdict). Swiping *is* the interaction — better than autoplay on mobile.
- Evidence Column → six stacked cards, same beats, same copy.
- Constellation → vertical spine with alternating branches.
- Touch targets ≥ 48×48px. Primary CTA full-width, 56px.
- Sticky bottom `Start free` bar appears after 40% scroll depth, dismissible.
- Respects `save-data` and `deviceMemory < 4` → forces tier-1 field, skips Monaco, uses static code output.
- Safe-area insets honoured (`env(safe-area-inset-*)` — already established in `src/index.css`).

**Tablet:** treated as a first-class layout, not a stretched phone. Landscape iPad gets the two-column hero; portrait gets stacked with the instrument at full width.

---

## 13. Accessibility, Performance, Scalability

### 13.1 Accessibility — WCAG 2.2 AA minimum, AAA on body text

- **Contrast:** body text ≥ 7:1 (AAA), all text ≥ 4.5:1, UI boundaries ≥ 3:1. **Signal blue on bedrock must be verified at every usage size** — it is the most likely failure point.
- **Semantics:** one `<h1>`, no skipped levels, `<section>` + `aria-labelledby` throughout, landmark regions.
- **Keyboard:** every interaction reachable and operable. Skip-to-content first in tab order. Focus never trapped. Pinned sections must not swallow tab focus — a common and serious failure in scroll-driven pages.
- **Screen readers:** decorative strata `aria-hidden`. The Live Evaluation exposes a text-equivalent live region announcing the verdict and breakdown once (`aria-live="polite"`), not per frame.
- **Motion:** §10.4. Also honour `prefers-reduced-transparency` and `prefers-contrast: more`.
- **Zoom:** 400% zoom, no horizontal scroll, no content loss.
- **Forms:** labels always visible (never placeholder-only), errors announced and programmatically associated.

**Test matrix:** axe-core in CI · manual NVDA/Chrome + VoiceOver/Safari · full keyboard-only pass · 400% zoom · reduced-motion pass · forced-colors mode.

### 13.2 Performance budgets

| Metric | Target | Ceiling |
|---|---|---|
| LCP | < 1.2s | 1.8s |
| INP | < 120ms | 200ms |
| CLS | **0** | 0.02 |
| TTFB | < 200ms | 500ms |
| JS (initial, gzip) | < 90KB | 140KB |
| CSS (critical, inline) | < 14KB | 18KB |
| Total (above fold) | < 220KB | 320KB |
| Lighthouse (mobile) | ≥ 96 | 92 |

**Tactics:**
- LCP element is the **headline text** — no image, no shader, no font-swap dependency. Fonts `preload`ed with `size-adjust` metric overrides so fallback→webfont swap causes **zero** shift.
- Everything below the fold is `React.lazy` + `IntersectionObserver`-triggered, with a 200px rootMargin.
- Monaco (~2MB) loads **only** on interaction with the code section. Never in the initial graph.
- Strata Field mounts in `requestIdleCallback` after LCP.
- Images: AVIF with WebP fallback, explicit `width`/`height`, `fetchpriority="high"` only on the hero.
- `content-visibility: auto` + `contain-intrinsic-size` on every off-screen section.
- CI gate: Lighthouse CI on every PR; budget regression fails the build.

### 13.3 Scalability

- **Content-driven:** all section content lives in typed TS modules (`src/content/landing/*.ts`), not JSX. Adding a ninth module = one object. Ready for CMS or i18n without refactor.
- **Token-driven:** every visual value is a CSS custom property. A rebrand is a token-file edit.
- **Composition-driven:** sections are independent, order-agnostic components taking only content props. Reordering the page is reordering an array.
- **i18n-ready:** no text baked into components, no text in images, logical properties (`margin-inline`) throughout for RTL.
- **Experiment-ready:** section variants selectable by prop, so A/B tests need no forked components.

---

## 14. Design Tokens

Drop-in replacement for the landing surface. Extends the existing brand base (`#171b3c`) rather than replacing it.

```css
:root {
  /* ══ BEDROCK / DEPTH ══ */
  --bedrock:        hsl(230 45% 8%);      /* deepest ground */
  --bedrock-2:      hsl(228 42% 10%);
  --substrate:      hsl(226 38% 12%);
  --sediment:       hsl(226 34% 15%);
  --sediment-2:     hsl(226 30% 19%);
  --brand-base:     #171b3c;              /* established: PWA theme, icons */

  /* ══ SIGNAL (the only accent) ══ */
  --signal:         hsl(213 96% 64%);     /* established brand blue */
  --signal-bright:  hsl(211 100% 74%);
  --signal-deep:    hsl(217 90% 52%);
  --signal-dim:     hsl(213 96% 64% / 0.12);
  --signal-glow:    hsl(213 96% 64% / 0.20);
  --signal-trace:   hsl(207 100% 80%);

  /* ══ EVALUATIVE (meaning only — never decorative) ══ */
  --band-exceptional: hsl(158 72% 48%);
  --band-strong:      hsl(152 69% 45%);
  --band-competent:   hsl(38 92% 60%);
  --band-developing:  hsl(14 88% 60%);
  --band-critical:    hsl(0 84% 62%);

  /* ══ TEXT ══ */
  --ink:            hsl(220 30% 97%);     /* 15.8:1 on bedrock */
  --ink-2:          hsl(220 18% 78%);     /* 9.1:1  — body */
  --ink-3:          hsl(220 14% 60%);     /* 5.2:1  — secondary */
  --ink-4:          hsl(220 12% 44%);     /* 3.1:1  — non-text only */

  /* ══ EDGES ══ */
  --edge:           hsl(226 30% 24%);
  --edge-lit:       hsl(226 28% 32%);     /* top edge — the thickness cue */
  --edge-subtle:    hsl(226 28% 19%);

  /* ══ TYPE ══ */
  --font-display: 'Outfit', system-ui, sans-serif;   /* established */
  --font-body:    'Outfit', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;  /* established */

  --t-hero:   clamp(2.75rem, 6.2vw, 5.5rem);
  --t-h1:     clamp(2.25rem, 4.6vw, 3.75rem);
  --t-h2:     clamp(1.75rem, 3.2vw, 2.75rem);
  --t-h3:     clamp(1.25rem, 2vw, 1.625rem);
  --t-lead:   clamp(1.0625rem, 1.5vw, 1.3125rem);
  --t-body:   1rem;
  --t-small:  0.875rem;
  --t-micro:  0.75rem;

  --lh-tight: 1.04;   /* display */
  --lh-snug:  1.22;   /* headings */
  --lh-base:  1.62;   /* body */
  --tr-tight: -0.03em;
  --tr-wide:  0.14em; /* eyebrows, labels */

  /* ══ SPACE (1.5 ratio) ══ */
  --s-1: 0.25rem; --s-2: 0.5rem;  --s-3: 0.75rem; --s-4: 1rem;
  --s-5: 1.5rem;  --s-6: 2rem;    --s-7: 3rem;    --s-8: 4rem;
  --s-9: 6rem;    --s-10: 8rem;   --s-11: 12rem;

  /* ══ RADII ══ */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
  --radius-xl: 24px; --radius-full: 999px;

  /* ══ ELEVATION (per stratum) ══ */
  --elev-s2: 0 1px 2px hsl(230 50% 3% / .40);
  --elev-s3: 0 1px 2px hsl(230 50% 3% / .50), 0 8px 24px -8px hsl(230 50% 3% / .40);
  --elev-s4: 0 2px 4px hsl(230 50% 3% / .55), 0 16px 40px -12px hsl(230 50% 3% / .50);
  --elev-s5: 0 4px 8px hsl(230 50% 3% / .60), 0 28px 64px -16px hsl(230 50% 3% / .55);

  /* ══ MOTION ══ */
  --m-instant:    90ms;  --m-quick:  180ms; --m-base: 320ms;
  --m-deliberate: 620ms; --m-rise:  1400ms;
  --e-out:   cubic-bezier(.22, 1, .36, 1);
  --e-rise:  cubic-bezier(.19, 1, .22, 1);
  --e-sharp: cubic-bezier(.4, 0, .2, 1);

  /* ══ LAYOUT ══ */
  --content-max: 1440px;
  --measure: 68ch;
  --gutter: clamp(1rem, 4vw, 3rem);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --m-instant: 1ms; --m-quick: 1ms; --m-base: 120ms;
    --m-deliberate: 120ms; --m-rise: 120ms;
  }
}
```

**Typography rules:**
- Display: Outfit 200–300 at large sizes. Thin weight at 5rem reads as expensive; bold at 5rem reads as loud.
- Body: Outfit 400, `--lh-base`, max `--measure`. Never full-width paragraphs.
- Mono: JetBrains Mono for all data — scores, code, transcripts, metrics. **Consistency here is a major premium signal**: numbers must never be set in the body face.
- Eyebrows: 12px/600, `--tr-wide`, uppercase, `--ink-3`.
- Optical alignment on all display type (`text-wrap: balance` on headings, `pretty` on paragraphs).

**Iconography:** `lucide-react` (already a dependency), 1.5px stroke, 20/24px only, `currentColor` always. Custom icons only for the eight modules — drawn on the same 24px grid at 1.5px so they sit in the same family. **No filled icons. No gradient icons.**

**Light mode:** invert the depth model — bedrock becomes `hsl(220 30% 97%)`, sediment becomes white with a lit top edge and *deeper* shadows to preserve stratification. Signal blue darkens to `hsl(217 90% 48%)` for contrast. The strata metaphor must survive; light mode is a re-lighting, not a colour swap.

---

## 15. Conversion Strategy & Engagement Flow

### 15.1 Ladder of commitment

Four rungs, each costing more than the last, each returning more value:

1. **Watch** (0 cost) — the hero evaluation runs unprompted
2. **Touch** (1 click) — expand a stat, inspect a score band, run the code demo
3. **Try** (0 fields) — answer one real question in-page, get a real score, **no signup**
4. **Join** (email or OAuth) — to *save* the result

Rung 3 is the strategy. **The visitor gets a genuine evaluation before giving anything.** Signup is then framed as preservation — "save this evaluation to your history" — not as a gate. Asking to keep something you already own is a fundamentally easier ask than asking for access to something you haven't seen.

### 15.2 CTA placement

| Position | CTA | Rationale |
|---|---|---|
| Nav (persistent) | `Start Free` | Always available, never insistent |
| Hero | `Start free — no card` + `Watch it score` | Primary + zero-commitment alt |
| After Evidence Column | `Score my answer →` | Peak comprehension moment |
| After Code Evaluation | `Run your own code →` | Immediately post-demonstration |
| After Weakness Mirror | `See your blind spots →` | Peak emotional resonance |
| Pricing | `Start Free` per tier | Decision point |
| Close | `Start Free` (single) | Final |
| Mobile sticky | `Start free` after 40% | Persistent without obstruction |

Seven placements across ~1,700vh. Roughly one per 240vh — present, never nagging.

### 15.3 Friction removal

Stated at every CTA: **no card · free tier · bring your own key**. Google OAuth first (already implemented), email second. Signup form: one field. Everything else deferred to onboarding.

### 15.4 What is deliberately absent

No exit-intent modal. No countdown timer. No fake "3 people viewing." No newsletter interstitial. No cookie banner beyond legal minimum. No chat widget bubble.

Each of these buys a small conversion lift and costs a large amount of the "serious instrument" positioning that the entire design is built to establish. **The premium read is the conversion strategy.**

### 15.5 Measurement

Track: scroll depth per section, Evidence Column completion rate, Live Evaluation interaction rate, code demo run rate, CTA click by position, try-before-signup → signup conversion.

**North star: `try-rate` (rung 3 completion).** It predicts activation better than signups, because a visitor who has seen their own real score has already experienced the product.

Test in this order: (1) headline variants, (2) hero instrument vs. static, (3) Weakness Mirror present vs. absent, (4) pricing position. Test one thing at a time; a page this integrated produces uninterpretable results under multivariate testing.

---

## 16. Technical Implementation & Frontend Architecture

### 16.1 Stack decision

**Use the existing stack.** React 18 + Vite + TS + Tailwind + shadcn/ui + framer-motion is already in `package.json` and is entirely sufficient. Introducing Next.js/Astro for this page would fragment the codebase, duplicate the design system, and complicate deploy — for a marketing gain that route-level code-splitting and pre-rendering already deliver.

**Add exactly two dependencies:**
- `@react-three/fiber` + `three` — **only** if the tier-3 Strata Field ships. ~140KB gz, lazy-loaded post-LCP, never in the initial graph. If this budget is contested, ship tier 2 (pure CSS/SVG) — it is 85% as good at 0% of the cost, and this is the correct default.
- `vite-plugin-ssg` (or Vite SSR + a prerender step) — renders `/landing` to static HTML at build time. Satisfies Law 5, LCP, and SEO in one move.

**Explicitly not adding:** GSAP/ScrollTrigger (framer-motion's `useScroll` covers every scroll-linked need here), Lenis smooth-scroll (hijacks native scrolling, hurts accessibility, and ages badly), Lottie, any animation library beyond framer-motion.

### 16.2 File structure

```
src/
  pages/
    Landing.tsx                    # composes sections from an ordered array
  content/landing/
    index.ts                       # typed content registry
    hero.ts  modules.ts  agents.ts  faq.ts  pricing.ts  proof.ts
    fixtures/
      evaluation.json              # Live Evaluation fixtures (≤22KB)
  components/landing/
    _primitives/
      StrataField.tsx              # tiered background
      Stratum.tsx                  # depth-aware wrapper
      SignalTrace.tsx
      Reveal.tsx                   # IntersectionObserver, fires once
    _components/
      SignalCard.tsx
      ReceiptedStat.tsx
      VerdictMeter.tsx
      EvidenceColumn.tsx
      Constellation.tsx
      DepthRail.tsx
    sections/
      Nav.tsx  Hero.tsx  SignalBar.tsx  EvidenceSection.tsx
      ModulesSection.tsx  AgentsSection.tsx  TheatreSection.tsx
      CodeSection.tsx  MirrorSection.tsx  DifferenceSection.tsx
      ArchitectureSection.tsx  PrivacySection.tsx  ProofSection.tsx
      PricingSection.tsx  FaqSection.tsx  CloseSection.tsx  Footer.tsx
  styles/
    landing-tokens.css             # §14, imported by index.css
  hooks/
    useStratum.ts                  # scroll parallax by depth index
    useReveal.ts
    useCapabilityTier.ts           # WebGL / memory / save-data / reduced-motion
```

### 16.3 Key patterns

**Capability detection, once, at root:**

```ts
export type Tier = 0 | 1 | 2 | 3;

export function useCapabilityTier(): Tier {
  const [tier, setTier] = useState<Tier>(1); // safe default; upgrade after mount
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const conn = (navigator as any).connection;
    if (mq.matches || conn?.saveData) return;            // stay at 1
    const mem = (navigator as any).deviceMemory ?? 4;
    const fine = matchMedia('(pointer: fine)').matches;
    if (mem < 4) return;
    if (mem >= 8 && fine && hasWebGL2()) setTier(3);
    else setTier(2);
  }, []);
  return tier;
}
```

**Depth-aware parallax** — one hook, driven by stratum index, applied everywhere. This is what makes the page move as a single volume:

```ts
const RATE = [0, 0.02, 0.04, 0.06, 0.08, 0.10] as const;

export function useStratum(depth: 0|1|2|3|4|5) {
  const { scrollYProgress } = useScroll();
  return useTransform(scrollYProgress, [0, 1], [0, -RATE[depth] * 1000]);
}
```

**Reveal fires exactly once** — the most common polish bug on scroll-driven pages:

```ts
export function useReveal<T extends Element>(rootMargin = '-10% 0px') {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.unobserve(el); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, rootMargin]);
  return [ref, shown] as const;
}
```

**Section lazy-loading** — everything below the fold:

```tsx
const EvidenceSection = lazy(() => import('@/components/landing/sections/EvidenceSection'));
// wrapped in <Suspense fallback={<SectionSkeleton h={2200} />} />
// skeleton height must match rendered height exactly → CLS stays 0
```

### 16.4 Rendering & routing

- Pre-render `/landing` to static HTML at build; hydrate progressively.
- Serve at `/` as the primary marketing entry (current `/` → `public/docs/index.html` redirect should be revisited — docs are not a landing page).
- Retire `public/landing.html` once the React page ships, keeping a redirect.
- `Cache-Control: public, max-age=0, must-revalidate` on HTML; `immutable` on hashed assets.
- Preload: fonts (2 weights, subset `latin`), hero critical CSS inline.

### 16.5 Quality gates (CI)

1. `tsc -b --noEmit` — clean
2. `eslint` — clean
3. `axe-core` — zero violations
4. Lighthouse CI — mobile ≥ 96, budgets enforced
5. Bundle-size check — fails on >5% regression
6. Visual regression on the 6 breakpoints
7. Reduced-motion snapshot test

---

## 17. Design System & Component Library

### 17.1 Layers

```
TOKENS          landing-tokens.css — the only place raw values exist
   ↓
PRIMITIVES      Stratum · SignalTrace · Reveal · StrataField
   ↓
COMPONENTS      SignalCard · ReceiptedStat · VerdictMeter ·
                EvidenceColumn · Constellation · DepthRail
   ↓
SECTIONS        16 composed sections, content-prop driven
   ↓
PAGE            Landing.tsx — an ordered array of sections
```

### 17.2 Contribution rules

1. **No raw values in components.** Every colour, duration, radius, and space value references a token. Enforced by lint rule.
2. **Content never lives in JSX.** It lives in `src/content/landing/`. A component holding a sentence is a bug.
3. **Every component declares its stratum.** `<Stratum depth={3}>` is required, not optional — it drives parallax, elevation, and blur consistently.
4. **Every animated component ships a reduced-motion path** in the same file. Not a separate component; a branch.
5. **Every interactive component ships a keyboard path and a focus style.** No exceptions, no follow-ups.
6. **Components that display evaluation must require the breakdown** (§11.6). The type system enforces the brand ethic.

### 17.3 Relationship to shadcn/ui

shadcn primitives (Dialog, Tooltip, Accordion, Tabs) are used unchanged for behaviour and accessibility. The landing tokens re-skin them. **Do not fork shadcn components** for the landing page — override via CSS custom properties so app and marketing stay visually synchronised and accessibility fixes propagate.

### 17.4 Documentation

Each component ships a `.mdx` with: purpose, stratum, props, reduced-motion behaviour, keyboard behaviour, and a "do not use for" note. The last one prevents the slow decay where `VerdictMeter` ends up rendering a pricing figure.

---

## 18. Future-Proofing

**What actually dates a landing page:** not resolution or framework version, but *borrowed trends*. Glassmorphism dated in three years. Neumorphism in two. Gradient-mesh heroes are dating now.

**What does not date:** typographic discipline, a consistent light model, meaningful motion, and a visual language derived from what the product genuinely does. The Strata system is safe for the same reason it is ownable — it is not borrowed.

**Structural durability measures:**

- **Tokens as the sole source of truth** — a full rebrand touches one file.
- **Content/presentation separation** — copy, pricing, and modules change without touching components.
- **Capability tiers** — the page already handles hardware it has never seen, in both directions. A 2031 device gets tier 3; a constrained one gets tier 1. No rewrite needed for either.
- **Progressive enhancement to zero** — Law 5 means the page survives a JS bundle failure, a shader deprecation, a CSS feature removal.
- **No trend dependencies** — nothing in this spec relies on a technique whose popularity is load-bearing.
- **Semantic HTML** — outlives every framework it will be rendered by. If React is replaced in 2030, the markup is the migration path.

**Deliberately anticipated:**
- View Transitions API — the section architecture is already compatible; adopt when Baseline-stable.
- CSS `@scope` / container queries — components are already container-relative; migration is mechanical.
- Higher-density and HDR displays — everything vector or shader-based; `color()` / P3 upgrade is a token edit.
- Agentic browsing — semantic markup and JSON-LD (already present in `index.html`) mean AI agents can parse the page's claims correctly. This matters more each year and almost nobody is designing for it.

**Review cadence:** copy and proof quarterly; tokens and motion annually; the core strata metaphor **should not be revisited** — its stability is its value.

---

## 19. Build Roadmap

| Phase | Scope | Output |
|---|---|---|
| **1 — Foundation** | Tokens, primitives, `useStratum`/`useReveal`/`useCapabilityTier`, Stratum wrapper, tier-1/2 Strata Field | Design system live, one section proving it |
| **2 — Hero** | Nav, Hero, Live Evaluation instrument (+fixtures), Signal Bar | The eight seconds work. **Ship-ready as a standalone teaser.** |
| **3 — Argument** | Evidence Column, Modules, Agents, Difference | The core sell |
| **4 — Demonstration** | Interview Theatre, Code Evaluation, Weakness Mirror | The proof |
| **5 — Trust & Close** | Architecture, Privacy, Proof, Pricing, FAQ, Close, Footer | Complete page |
| **6 — Polish** | Tier-3 field, cursor instrument, a11y audit, perf tuning, visual regression | Launch |

**Sequencing rationale:** Phase 2 is independently shippable — hero + stat bar is a legitimate teaser page and validates the hardest technical work (the instrument) before the remaining fourteen sections depend on it.

---

## Appendix A — Review Checklist

Before any section ships:

- [ ] Every element declares a stratum
- [ ] Every animation has a stated cause (Law 2)
- [ ] Every number is receipted or removed (Law 3)
- [ ] ≤3 simultaneously animating elements in viewport
- [ ] ≥120px of deliberate empty space
- [ ] Renders completely with JS disabled
- [ ] Communicates 100% of its argument with reduced motion
- [ ] Full keyboard operability, visible focus throughout
- [ ] Body text ≥ 7:1 contrast; all text ≥ 4.5:1
- [ ] Zero layout shift on load
- [ ] Correct at 320px, 768px, 1440px, 1920px
- [ ] Content lives in `src/content/`, not JSX
- [ ] No raw colour/duration/space values in the component
- [ ] Nothing from the §2.4 anti-pattern list

---

## Appendix B — Copy Bank

**Eyebrows:** `Interview Intelligence` · `Platform Modules` · `The Agent Layer` · `Under the Hood` · `Your Data, Your Keys`

**Section headlines:**
- `Every score decomposes.`
- `Eight modules. One standard.`
- `Six agents. One job each.`
- `It runs your code. Actually runs it.`
- `The part you won't like.`
- `Your keys. Your device. Your data.`
- `You already know the answer.`

**Microcopy:** `no card required` · `bring your own key` · `nothing leaves your device` · `expand to see the source` · `scroll to excavate` · `click any layer`

**Banned:** revolutionary · game-changing · unleash · supercharge · next-level · cutting-edge · 10x · seamless · effortless · powered by AI · leverage · empower

---

*This document specifies the design. Ambiguity in implementation resolves toward the six laws in §1 — in order.*
