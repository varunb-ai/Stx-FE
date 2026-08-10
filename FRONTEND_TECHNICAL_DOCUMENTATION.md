# Frontend Technical Documentation

This document describes the current frontend architecture for InterviewAstfe / Stratax AI.

It reflects the code that exists today in the Vite + React + TypeScript application, including bootstrap, routing, shared providers, backend wrappers, feature modules, persistence, global browser events, and PWA or static-docs behavior.

---

## 1. Tech Stack

Current stack:

- Runtime and UI: React 18, TypeScript, Vite
- Styling: TailwindCSS, shadcn/ui, Radix UI primitives
- Animation: framer-motion
- Charts: Recharts
- Data access: direct wrapper-based fetch calls via `strataxClient.ts` and feature API modules
- Shared provider only: TanStack Query is mounted in the app shell, but most feature fetching is still direct-wrapper based rather than query-driven
- PWA: manifest + custom service worker + install prompt context
- Hosting target: static hosting such as Firebase Hosting, with SPA rewrites plus a static docs entry under `public/docs`

---

## 2. Frontend Layout

Relevant frontend directories:

```text
src/
  App.tsx
  main.tsx
  overlayHost.tsx
  pages/
  components/
  context/
  hooks/
  lib/
  types/
public/
  docs/index.html
  manifest.webmanifest
  sw.js
  icons/
  splash/
scripts/
  generate-icons.mjs
  generate-splash.mjs
  generate-byok-demo-video.mjs
```

Important layout notes:

- `src/pages` contains route-level wrappers and standalone auth or utility pages.
- `src/components` contains most feature logic.
- `src/lib` contains backend clients, rendering helpers, storage helpers, and deprecated browser-side runner stubs.
- `public/docs/index.html` is a separate static documentation experience and is not rendered by React.

---

## 3. Bootstrap and App Shell

### 3.1 Entry Point

`src/main.tsx` is the runtime entry point.

Provider and wrapper order:

- `AuthProvider`
- `ErrorBoundary`
- `App`
- `EvaluationOverlayHost`

Bootstrap behavior:

- `setupAuthListener()` is called before render so global `auth:logout` events can redirect users to `/login`.
- `EvaluationOverlayHost` mounts a global evaluation overlay controller that other components can trigger without prop drilling.
- Service worker registration happens only in production.
- In development, service workers are proactively unregistered to prevent stale asset caches.

### 3.2 App Shell

`src/App.tsx` mounts the global shell.

Global shell providers and surfaces:

- `QueryClientProvider`
- `TooltipProvider`
- `PwaInstallProvider`
- `Toaster`
- `UpgradeModal`
- `DemoGateModal`
- `RateLimitWarning`
- `BrowserRouter`

This file also owns the routing table and static docs redirection behavior.

### 3.3 Static Docs and Landing Behavior

The current frontend no longer uses `/` as the React landing page.

Current behavior:

- `/` serves the **static landing page** at `/landing.html`. This is the
  production entry point: `firebase.json` rewrites `/` → `/landing.html` before
  the SPA ever loads, and `LandingRedirect` does the same locally. (This section
  previously claimed `/` went to the docs entry, which was never true of
  production.)
- `/docs/*` redirects to the static docs entry at `/docs/index.html`
- `/landing` is a legacy alias that now redirects to `/landing.html`.
  `src/pages/Index.tsx` remains in the tree but is no longer routed — it was a
  second landing page that nothing linked to.

This split is intentional and should be preserved when editing routes or hosting rewrites.

---

## 4. Routing

Routes are defined in `src/App.tsx`.

| Route | Component | Access | Notes |
| --- | --- | --- | --- |
| `/` | `LandingRedirect` | public | Forces the static landing page (`/landing.html`) |
| `/landing` | `LandingHtmlRedirect` | public | Legacy alias → `/landing.html` |
| `/login` | `src/pages/Auth.tsx` | guest-only | Wrapped with `ProtectedRoute requireAuth={false}` |
| `/auth/google/callback` | `src/pages/GoogleCallback.tsx` | public | OAuth popup callback bridge |
| `/auth/verify-email` | `src/pages/VerifyEmail.tsx` | public | Email verification flow |
| `/auth/reset-password` | `src/pages/ResetPassword.tsx` | public | Password reset flow |
| `/app` | `src/components/InterviewAssistant.tsx` | protected | Main authenticated workspace |
| `/run` | `src/pages/Runner.tsx` | protected | Wrapper around `CodeRunner` |
| `/architecture` | `src/pages/Architecture.tsx` | protected | Wrapper around `ArchitectureGenerator` |
| `/progress` | `src/pages/Progress.tsx` | protected | Progress analytics dashboard |
| `/docs/*` | `DocsRedirect` | public | Forces static docs HTML |
| `*` | `src/pages/NotFound.tsx` | public | Catch-all fallback |

### 4.1 Route Guard Behavior

`src/components/ProtectedRoute.tsx` provides route gating.

Behavior:

- Shows a loading spinner while auth state is resolving.
- Redirects unauthenticated users away from protected routes.
- Redirects authenticated users away from guest-only routes such as `/login`.

---

## 5. Shared State, Context, and Hooks

### 5.1 Auth Context

`src/context/AuthContext.tsx` owns frontend auth state.

Stored state:

- `user`
- `token`
- `loading`

Core behaviors:

- On mount or token change, calls `/auth/me` when a JWT exists.
- Stores `token`, `userId`, and `tier` in `localStorage` after login or registration.
- Supports popup-based Google login using `window.open` and `postMessage`.
- Avoids force logout for transient backend or network failures when `/auth/me` fails for non-auth reasons.

### 5.2 PWA Install Context

`src/context/PwaInstallContext.tsx` wraps installability state.

Responsibilities:

- Tracks deferred `beforeinstallprompt` events.
- Detects standalone mode with `display-mode` and iOS `navigator.standalone`.
- Detects iOS separately to provide Share -> Add to Home Screen instructions.
- Exposes `promptInstall()` and user-facing install helper text.

### 5.3 Custom Hooks

| Hook | Purpose |
| --- | --- |
| `use-toast.ts` | App-wide toast helpers |
| `use-mobile.tsx` | Mobile viewport and device checks |
| `useSpeechRecognition.ts` | Web Speech API wrapper for continuous recognition |
| `useTeleprompterStream.ts` | Word-chunk streaming for teleprompter display |
| `useTheme.ts` | Theme persistence and dark-mode handling |

Implementation notes:

- `useSpeechRecognition` is a browser capability wrapper and degrades safely when unsupported.
- `useTeleprompterStream` is used for progressive text reveal rather than server streaming.

---

## 6. API and Backend Integration Layers

### 6.1 `strataxClient.ts`

`src/lib/strataxClient.ts` is the main fetch wrapper used by current frontend features.

Responsibilities:

- Resolves `STRATAX_API_BASE_URL` from `VITE_API_BASE_URL`.
- Builds headers consistently for JSON and non-JSON requests.
- Attaches JWT auth when available.
- Attaches stable guest identity headers.

Stable guest identity headers:

- `X-Stratax-Guest-Id`
- `X-Client-Id`
- `X-User-ID`

Additional wrapper behavior:

- Attaches BYOK provider keys only when allowed by auth or explicit BYOK connection state.
- Captures `X-Stratax-Session-Id` response headers and stores the effective session id.
- Emits global browser events for auth expiry, demo gating, BYOK requirements, and session tracking.
- Throws `StrataxApiError` for normalized non-OK responses when `throwOnError !== false`.

Important design detail:

- Guest identity is intentionally stable via local storage so sessions and history do not bounce across requests when cookies are unreliable.

### 6.2 `authApi.ts` and `authHelpers.ts`

These files provide auth-specific helpers outside the unified client.

`authApi.ts` responsibilities:

- Wraps `/auth/*` endpoints.
- Handles password reset and email verification helpers.
- Emits `auth:logout`, `ratelimit:warning`, and `ratelimit:exceeded`.

`authHelpers.ts` responsibilities:

- Provides token helpers.
- Installs the global `auth:logout` listener used during bootstrap.

### 6.3 Feature API Modules

| File | Responsibility |
| --- | --- |
| `src/lib/api.ts` | Main product API layer for assistant Q and A, history, intelligence search, code execution, profile upload, and Mermaid rendering |
| `src/lib/mockInterviewApi.ts` | Mock interview session lifecycle, hints, progress, summaries, and history |
| `src/lib/practiceModeApi.ts` | Practice sessions, code and voice responses, proctoring events, proctoring snapshots, and live session helpers |
| `src/lib/practiceProctoring.ts` | Client-side proctoring controller with heartbeat, status polling, face + object detection, and event posting |
| `src/lib/progressApi.ts` | Progress summary, heatmap, and next-session recommendation normalization |
| `src/lib/architectureApi.ts` | Architecture generation, recommended views, available views, Mermaid rendering, and markdown download |
| `src/lib/resumeContextStorage.ts` | Persisted `ResumeContext` helpers |
| `src/lib/intelligenceConfig.ts` | Interview Intelligence feature gates sourced from env or defaults |
| `src/lib/utils.ts` | Shared class utility plus PDF export pipeline and Mermaid export helpers |
| `src/lib/runner.ts` | Deprecated browser-side Judge0-style runner stub |
| `src/lib/pyodideRunner.ts` | Deprecated browser-side Pyodide runner stub |
| `src/lib/objectDetection.ts` | Worker-backed COCO-SSD object/person detection for proctoring |
| `src/workers/objectDetector.worker.ts` | Off-main-thread inference; loads the model from this origin |

### 6.4 Global Browser Events

The frontend uses browser events as a cross-cutting coordination mechanism.

| Event | Emitted By | Purpose |
| --- | --- | --- |
| `auth:logout` | `strataxClient.ts`, `authApi.ts`, `authHelpers.ts` | Centralized forced logout flow |
| `ratelimit:exceeded` | `App.tsx`, `authApi.ts` | Upgrade or rate-limit UI |
| `ratelimit:warning` | `authApi.ts` | Early warning for quota exhaustion |
| `demo:limit-reached` | `strataxClient.ts`, `practiceProctoring.ts` | Guest or demo gating modal flow |
| `demo:unavailable` | `strataxClient.ts` | Demo unavailable modal flow |
| `byok:required` | `strataxClient.ts` | Opens or prompts API key onboarding or settings |
| `stratax:session` | `strataxClient.ts` | Broadcasts effective session id updates |
| `practice:screen-share-lock` | `PracticeMode.tsx` | Prevents unsafe navigation during locked Live Practice flows |

---

## 7. Route Pages and What They Do

### 7.1 `src/pages/Index.tsx`

This is the React landing page mounted at `/landing`.

Responsibilities:

- Renders the marketing-style feature overview.
- Shows `UserProfile` in the fixed header when authenticated.
- Clears stale body scroll-lock styles on mount to recover from modal or overlay crashes.

The feature list is a local `features` array (title, description, icon,
gradient). It currently advertises: AI Assistant, Mirror Mode, Interview
Intelligence, Real-time Practice, Mock Interviews, Advanced Code Studio,
Progress & Analytics, and System Architecture AI.

> Keep these descriptions honest about behaviour, because they are product
> claims. Two in particular are load-bearing and easy to get wrong:
> **Practice** advertises proctoring as optional and states that camera
> analysis happens in the browser — true of *detection*, which posts signals
> only, but note that session **recording** does upload camera and screen to
> `/api/practice/session/{id}/media` when enabled, so "no video leaves your
> machine" would be false. **Code Studio** names the supported languages, which
> must stay in step with `GET /api/code/languages`.

### 7.2 `src/pages/Auth.tsx`

Auth shell page that switches between the `Login` and `Register` components.

It is presentation-heavy and designed as a split-screen auth experience.

### 7.3 `src/pages/GoogleCallback.tsx`

Popup-only OAuth bridge page.

Responsibilities:

- Reads auth payload from query params.
- Posts success or failure back to `window.opener`.
- Closes itself after handoff.

### 7.4 `src/pages/VerifyEmail.tsx`

Token-driven email verification page.

Responsibilities:

- Reads `token` from query params.
- Calls `verifyEmailToken()`.
- Shows success or error state and navigation actions.

### 7.5 `src/pages/ResetPassword.tsx`

Password reset page.

Responsibilities:

- Reads the reset token from query params.
- Validates password length and confirmation client-side.
- Submits through `resetPasswordWithToken()`.

### 7.6 `src/pages/Runner.tsx`

Thin wrapper around `CodeRunner`.

### 7.7 `src/pages/Architecture.tsx`

Thin wrapper around `ArchitectureGenerator`.

### 7.8 `src/pages/Progress.tsx`

Analytics dashboard page for practice history and recommendations.

### 7.9 `src/pages/NotFound.tsx`

Fallback route surface.

---

## 8. Core Feature Modules

### 8.1 Interview Assistant Workspace

Primary file: `src/components/InterviewAssistant.tsx`

This is the main authenticated workspace under `/app`.

Main tabs:

- Answer
- Intelligence
- Mock Interview
- Practice

Responsibilities:

- Creates and adopts session ids.
- Loads session history and caches history and session lists locally.
- Persists workspace state such as selected tab, question mode, sidebar state, and answer visibility.
- Supports deep-link-like tab opening through router location state using `openTab`.
- Coordinates answer generation, PDF export, onboarding, BYOK prompts, session deletion, and history archive behavior.

Notable implementation details:

- Listens for `practice:screen-share-lock` and applies navigation restrictions while Live Practice requires focus.
- Uses local caches such as `ia_sessions_cache`, `ia_history_cache`, and per-session archive keys.
- Maintains deleted-session blacklists to smooth eventual-consistency issues from backend deletes.

### 8.2 Answer Rendering, Mermaid, and PDF Export

Primary files:

- `src/components/AnswerCard.tsx`
- `src/components/MermaidEditor.tsx`
- `src/lib/utils.ts`

Responsibilities:

- Renders answers with structured formatting and content-aware blocks.
- Supports Mermaid diagrams, code blocks, copy actions, edit or compare flows, and download flows.
- Uses backend-first Mermaid rendering with fallback handling for reliability.
- Supports PDF export for answers and archived sessions.

Important PDF and Mermaid details:

- Mermaid source is preserved on DOM nodes via `data-mermaid-source`.
- PDF generation loads `html2pdf.js` on demand.
- Mermaid diagrams are converted to PNG or sanitized SVG-compatible content for reliable PDF rendering.
- `utils.ts` includes special handling for `foreignObject` conversion so SVG text survives export.

### 8.3 Interview Intelligence

Primary file: `src/components/InterviewIntelligence.tsx`

Key API entry points:

- `apiGetTopics`
- `apiGetQuestionsByTopic`
- `apiSearchQuestions`
- `apiSearchQuestionsEnhanced`
- `apiGetCompanies`
- `apiGetHistoryTabs`
- `apiSaveHistoryTab`
- `apiDeleteHistoryTab`
- `apiDeleteAllHistory`

Responsibilities:

- Supports topic browsing and query-driven search.
- Supports enhanced search with credibility filters, company filters, reranking, and query expansion flags.
- Maintains its own saved history-tab model.
- Attempts richer streaming or status UX and falls back to HTTP search flow when needed.
- Refreshes or manually saves history tabs when backend responses do not return a `tab_id`.

### 8.4 Code Runner and Evaluation Overlay

Primary files:

- `src/components/CodeRunner.tsx`
- `src/components/MonacoEditor.tsx`
- `src/components/ExecutionVisualizer.tsx`
- `src/components/OutputExplanation.tsx`
- `src/overlayHost.tsx`

Current execution model:

- Code execution is backend-only via `apiExecuteCode()`.
- Browser-side runners in `runner.ts` and `pyodideRunner.ts` are deprecated and should not be reintroduced into active feature code.

Capabilities:

- Multi-language editing and execution.
- **The language list is served by the backend** (`apiListCodeLanguages()` →
  `GET /api/code/languages`), not hardcoded. `RUNNER_LANGUAGES` remains only as
  the pre-flight placeholder and offline fallback, surfaced in the toolbar as
  an "offline list" hint. A hardcoded dropdown maintained separately from the
  server is how the UI came to offer C# and SQL that the backend did not
  support — picking either ran the source through a Python interpreter and
  returned a `SyntaxError`. Anything the server adds now appears without a
  frontend release.
- Each entry shows its **resolved runtime** (`Python · 3.14.0`) and a `step`
  badge where line-tracing exists, so a candidate can see which runtime will
  judge them before typing.
- Runs are **cancellable**. `apiExecuteCode()` accepts an `AbortSignal`; the Run
  button becomes `Stop · 3.4s` while executing. A second click aborts the
  in-flight request rather than racing it, and an abort reports "Run stopped."
  instead of surfacing `AbortError` as if the code had crashed. The backend
  independently caps a request at 45 seconds (`504`).
- Run is disabled when the server reports `enabled: false`.
- Saved code, stdin, language, and result state in local storage.
- Python trace visualization with step timeline and locals inspection.
- Separate runner session id stored in local storage.
- Notes panel, timer, and shortcut affordances for interview practice.

Evaluation overlay behavior:

- `overlayHost.tsx` exposes a global controller.
- Evaluations stream into `EvaluationOverlay`.
- Results are cached locally under `eval_cache_v1`.

### 8.5 Mock Interview

Primary files:

- `src/components/MockInterviewMode.tsx`
- `src/lib/mockInterviewApi.ts`

Phases:

- Setup
- Interview
- Feedback
- Summary
- History

Responsibilities:

- Supports voice input via `useSpeechRecognition`.
- Supports coding answers through `apiExecuteCode()`.
- Tracks hints, follow-ups, feedback trajectory, per-question history, and progress data.
- Persists resumable session state in local storage.

Resume behavior:

- Loads saved resume context from `resumeContextStorage.ts`.
- Reuses `ResumeUpload` for claim-aware interview setup.

### 8.6 Practice Mode

Primary files:

- `src/components/PracticeMode.tsx`
- `src/components/RoundSelection.tsx`
- `src/components/InterviewCodeEditor.tsx`
- `src/components/InstantScoreBreakdown.tsx`
- `src/components/RoundInfoGuide.tsx`
- `src/lib/practiceModeApi.ts`
- `src/lib/practiceProctoring.ts`

Capabilities:

- Session-based practice for voice and coding questions.
- Explicit Live Practice consent before start.
- **Proctoring is the candidate's choice.** No start endpoint refuses over it;
  the answer is recorded (`SESSION_STARTED_WITH_PROCTORING` /
  `SESSION_STARTED_WITHOUT_PROCTORING`) and persisted to
  `PracticeAttemptRecord.proctored` so Progress can tell a supervised score
  from an unsupervised one. These endpoints used to answer **403** unless the
  browser confirmed both permissions, which made practising impossible without
  a webcam or on a locked-down machine.
- Per-question voice recording, code execution, and completion summaries.
- Next-session handoff from the Progress page.

Camera preview:

- Draggable by its header (pointer events, so touch works) and collapsible;
  both persist in local storage. Position is clamped on drag *and* on window
  resize so the panel can never end up somewhere it cannot be grabbed back.
- Collapsing **hides** the `<video>` rather than unmounting it — unmounting
  detaches the stream and forces a restart on every expand.
- `getUserMedia` asks for 640x480 at an ideal 30fps
  (`PRACTICE_CAMERA_CONSTRAINTS`). A bare `{ video: true }` lets the browser
  pick a resolution and a possibly variable frame rate, which reads as a choppy
  feed.
- The `srcObject` effect depends on the stream alone. It previously also
  depended on `sessionId` and `phase` and reassigned the *same* MediaStream,
  tearing down the element's pipeline and visibly stuttering the preview at
  every phase transition.

Proctoring model:

- Backend snapshots are authoritative through `PracticeProctoringSnapshot`.
- The client controller posts events, heartbeats, and status checks.
- The UI surfaces three escalation levels.

Detection (all on-device; frames are never uploaded for analysis):

- **Faces** — `@vladmandic/face-api` `tinyFaceDetector`, or the native
  `FaceDetector` where available. Emits `MULTIPLE_FACES` and `FACE_MISSING`
  (the latter after two consecutive empty frames, so a blink is not a
  violation).
- **Objects and people** — COCO-SSD in a Web Worker
  (`src/workers/objectDetector.worker.ts`, driven by `src/lib/objectDetection.ts`),
  with the model served from this origin at `/models/coco-ssd`. Emits
  `PHONE_DETECTED` (serious, after two consecutive sightings),
  `OBJECT_DETECTED` for laptops/books/screens (low), and `MULTIPLE_FACES` from
  the `person` class — which catches a second person turned away from the
  camera, something face detection structurally cannot do.
- Inference runs in a worker so it cannot stall the UI; frames are transferred
  as `ImageBitmap`s and tensors are disposed per frame (tfjs does not GC GPU
  memory). Object detection degrades to unavailable — never to a blocked
  interview — if the worker, WebGL, or the model cannot load.

> **Event names must match `PracticeProctoringEventType` exactly.** A name on
> only one side is silently discarded: the client sent `MULTIPLE_FACES_DETECTED`
> for the life of the feature and no server enum contained it, so every
> detection of a second person was rejected `422`. Detection ran every two
> seconds and every result was thrown away.

Note that *session recording* is separate from detection: when enabled, camera
and screen are recorded via `MediaRecorder` and uploaded to
`POST /api/practice/session/{id}/media`. Detection never uploads frames; the
recording feature does.

Escalation levels:

- Banner warning
- Serious or final warning modal
- Termination summary on completion

Additional proctoring details:

- The compact badge auto-expands on issues with debounce and minimum visible timing.
- Screen-share lock emits `practice:screen-share-lock` to block unsafe navigation.

Recording behavior:

- Voice questions may auto-start recording.
- Auto-start waits for TTS audio to finish before beginning recording.
- Countdown begins when recording actually starts, not when the question renders.

### 8.7 Architecture Generator

Primary files:

- `src/pages/Architecture.tsx`
- `src/components/ArchitectureGenerator.tsx`
- `src/components/MermaidEditor.tsx`
- `src/lib/architectureApi.ts`

Capabilities:

- Validates user-provided system descriptions.
- Loads available architecture views.
- Requests AI-recommended views.
- Generates multi-view architecture packages.
- Renders Mermaid diagrams for each view.
- Supports user level, diagram style, theme, and explanation toggles.
- Downloads generated architecture markdown.

### 8.8 Progress Dashboard

Primary files:

- `src/pages/Progress.tsx`
- `src/lib/progressApi.ts`

Responsibilities:

- Loads progress summary, heatmap and trend inputs, and next-session recommendation data.
- Shows attempts, score summary, best or worst dimension, and recommendation UI.
- Starts targeted practice by writing `practice_next_session_plan` and navigating back into `/app`.

Current resilience behavior:

- `progressApi.ts` accepts multiple backend wrapper shapes instead of assuming one summary schema.
- Heatmap parsing can normalize grouped or nested backend response forms.
- Requests use cache-busting and `no-store`.
- `Progress.tsx` derives fallback attempts and best or worst dimensions from heatmap rows when summary data is stale.
- The page retries when charts lag behind overview counts.

### 8.9 Account, Onboarding, and Upgrade Surfaces

Key components:

- `UserProfile.tsx`
- `ApiKeySettings.tsx`
- `BYOKOnboarding.tsx`
- `OnboardingOverlay.tsx`
- `UnlockAnswerEngine.tsx`
- `UpgradeModal.tsx`
- `DemoGateModal.tsx`
- `RateLimitWarning.tsx`
- `PoweredByBadge.tsx`

These components coordinate:

- User identity and tier display.
- Gemini and Groq BYOK setup.
- Onboarding completion state.
- Demo and rate-limit gating.
- Answer engine upsell and unlock flows.

---

## 9. Persistence Model

The frontend relies heavily on `localStorage` for continuity.

### 9.1 Identity and Auth

- `token`
- `userId`
- `tier`
- `stratax_guest_id`
- `stratax_user_id`
- `stratax_effective_session_id`

### 9.2 Interview Assistant Workspace

- `ia_session_id`
- `ia_question_mode`
- `ia_active_main_tab`
- `ia_desktop_sidebar_open`
- `ia_sessions_cache`
- `ia_deleted_sessions`
- `ia_history_cache`
- `ia_last_question`
- `ia_last_answer`
- `ia_show_answer`
- Per-session archive keys such as `ia_history_archive_<sessionId>`

### 9.3 BYOK and Onboarding

- `user_api_key`
- `gemini_api_key`
- `api_keys_connected`
- Onboarding completion flags
- `pwa_install_banner_dismissed_until`

### 9.4 Mock Interview

- `mock_interview_user_id`
- `mock_interview_session`
- `mock_interview_history_<userId>`
- `mock_interview_stats`

### 9.5 Practice and Progress

- `practice_next_session_plan`
- `practice_last_domain`
- Practice-session confidence state keys
- `stratax_resume_context`

### 9.6 Code Runner and Evaluation

- `ia_runner_session_id`
- `code-runner-source`
- `code-runner-stdin`
- `code-runner-language`
- `code-runner-result`
- `code-runner-explanation`
- `code-runner-trace-events`
- `code-runner-trace-enabled`
- `code-runner-trace-max-events`
- `code-runner-timer-seconds`
- `code-runner-timer-active`
- `interview-notes`
- `eval_cache_v1`

### 9.7 Theme and Miscellaneous UI

- `theme`

---

## 10. PWA, Docs, Build Tooling, and Environment

### 10.1 PWA Runtime Behavior

Relevant files:

- `public/manifest.webmanifest`
- `public/sw.js`
- `src/context/PwaInstallContext.tsx`
- `src/main.tsx`

Current behavior:

- Service worker registers only in production.
- Development explicitly unregisters service workers.
- Install prompting is controlled from React via `beforeinstallprompt`.
- Standalone detection supports both regular browsers and iOS Safari.

### 10.2 Static Docs Surface

Relevant files:

- `public/docs/index.html`
- `src/App.tsx`

Current behavior:

- Static docs are served separately from the React route tree.
- `/` and `/docs/*` redirect to `/docs/index.html`.
- This is intentional and should be preserved when editing routes or hosting rewrites.

### 10.3 Build and Asset Scripts

Important scripts from `package.json`:

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run icons:generate`
- `npm run icons:generate:circle`
- `npm run splash:generate`
- `npm run generate:byok-video`

### 10.4 Environment Variables

Current frontend environment variables:

- `VITE_API_BASE_URL`
- `VITE_AUTH_API_URL`

`VITE_AUTH_API_URL` should generally align with the same backend used by `VITE_API_BASE_URL` so JWT validation and product APIs remain consistent.

---

## 11. Error Handling and Conventions

### 11.1 Error Handling Patterns

- Prefer `strataxFetch()` and `buildStrataxHeaders()` for new backend calls.
- Treat 404 history or session misses gracefully where possible instead of crashing the UI.
- Do not force logout on every 401. Logout only when the response clearly indicates JWT or session expiry.
- Emit UI-driving browser events for cross-cutting concerns instead of prop drilling global state.
- Wrap media, storage, and service worker actions in best-effort `try/catch` blocks.

### 11.2 Current Architectural Conventions

- Pages are thin wrappers. Feature logic lives in components.
- The app uses direct wrapper-based data fetching more than React Query.
- Backend-only execution is the current rule for code running and evaluation.
- Client-side runner files in `src/lib/runner.ts` and `src/lib/pyodideRunner.ts` are intentionally deprecated.
- Mermaid rendering should prefer the backend rendering path. Browser-side Mermaid is fallback-only and carefully constrained.

### 11.3 Sensitive Data Rule

- Do not put execution-provider secrets or sandbox credentials into Vite environment variables.
- Any `VITE_*` value is shipped to the browser bundle.

---

## 12. Summary

The frontend is organized around a small set of shared runtime layers and a feature-heavy component tree.

Key takeaways:

- `main.tsx` and `App.tsx` provide the shell, providers, and routing.
- `strataxClient.ts` is the main integration point for backend requests, session headers, and global browser events.
- `InterviewAssistant.tsx` is the main product workspace.
- Specialized feature modules handle intelligence search, Live Practice, mock interviews, architecture generation, code execution, and analytics.
- Static docs and the React app intentionally coexist as separate entry experiences.

When extending the frontend, prefer building on the existing routing, storage, and backend-wrapper patterns rather than introducing parallel abstractions.
