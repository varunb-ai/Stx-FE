---
title: StrataxFE
emoji: "🧠"
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Stratax AI - AI Interview Assistant

A React + Vite frontend for the Stratax AI interview platform, with a docs-first public entry, a protected application workspace, installable PWA support, and feature areas for AI-assisted answers, Live Practice, mock interviews, code execution, architecture generation, and progress tracking.

## Highlights

- Static documentation UI at `/docs`, with the React marketing page at `/landing`
- Mobile-first UX with a fixed composer and compact reading experience
- AI answer generation with streaming display and rich formatting
- Live Practice for voice and coding rounds with required media consent and optional proctoring
- Interview Intelligence for role/company search and targeted prep
- Backend-only code runner with Visualize (trace timeline + locals)
- Architecture Generator for Mermaid-based system-design outputs
- Progress dashboard with attempts summary, heatmap-style history, and next-session recommendations
- Inline edit-and-compare flow (Original vs Latest)
- Resume/profile upload for context (PDF/DOC/TXT)
- Voice capture (Web Speech API when available)
- History browsing and session management
- PWA installability for Android/iOS (Add to Home screen / Install)

## Tech Stack

- React + TypeScript (Vite)
- TailwindCSS + shadcn/ui (Radix primitives)
- `lucide-react` icons
- Service Worker + Web App Manifest (PWA)
- Firebase Hosting or any static hosting platform

## Project Structure

```text
src/
  App.tsx                     # Router, docs redirect, global modals/providers
  main.tsx                    # App bootstrap + SW registration
  components/
    InterviewAssistant.tsx    # Main screen shell & state
    PracticeMode.tsx          # Live Practice voice/coding sessions + proctoring UX
    RoundSelection.tsx        # Round-based Live Practice launcher
    InterviewIntelligence.tsx # Search, topic/company prep, history tabs
    ArchitectureGenerator.tsx # Multi-view diagram generation flow
    SearchBar.tsx             # Mobile composer, mic/upload/send
    AnswerCard.tsx            # Streamed answer, inline edit, actions
    ThemeToggle.tsx           # Dark/light
    ui/*                      # shadcn ui primitives
  context/*                   # Auth and PWA install providers
  pages/
    Progress.tsx              # Attempts summary, heatmap, next-session plan
    Auth.tsx                  # Login/register shell
    Index.tsx                 # React landing page mounted at /landing
  hooks/*                     # Theme, toast, mic helpers
  lib/api.ts                  # Assistant/history/intelligence/code APIs
  lib/strataxClient.ts        # Shared fetch wrapper + guest/session headers
  lib/progressApi.ts          # Progress summary/heatmap normalization
  lib/architectureApi.ts      # Architecture generation APIs
public/
  docs/index.html             # Static documentation UI served at /docs
  manifest.webmanifest        # PWA manifest
  sw.js                       # Service worker (cache core assets)
  icons/                      # App icons (192/512/maskable)
```

## Routes and Documentation

- `/` and `/docs/*` resolve to the static documentation experience in `public/docs/index.html`
- `/landing` is the React landing page
- `/app` is the main authenticated workspace
- `/run`, `/architecture`, and `/progress` are protected feature routes
- `/auth/google/callback`, `/auth/verify-email`, and `/auth/reset-password` support auth flows
- `FRONTEND_TECHNICAL_DOCUMENTATION.md` is the current frontend architecture reference

## Key Features

- Answer generation with streaming UI and markdown-like formatting (headings, lists, code, tables)
- Live Practice sessions for voice and coding questions, with consent-gated camera/screen capture and optional integrity monitoring
- Progress dashboard with attempts, performance history, weekly heatmap, and next-session recommendations
- Inline editing of the last question with Cancel and Send controls
- Version navigation (Original/Latest) for edited responses
- History sidebar with delete, mobile overlay
- Mobile long-press quick actions (copy/edit)
- PWA offline core caching, standalone launch, and install surfaces

## Getting Started

Prerequisites: Node 18+, pnpm or npm, and a modern browser.

Install and run:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

Environment:

- Create `.env` if your API endpoints require configuration. Default API functions live in `src/lib/api.ts` and can be adapted to your backend.

## PWA Setup

- Manifest: `public/manifest.webmanifest` contains app name, colors, scope, `display: standalone`, and icons.
- Icons: place exact filenames in `public/icons/`.
- Required icon filenames:
  - `stratax-ai-192.png` at 192x192
  - `stratax-ai-512.png` at 512x512
- Service worker: `public/sw.js` provides cache-first handling for core assets.
- Registration: handled in `src/main.tsx`.

Install on mobile:

- Android/Chrome: Menu (⋮) -> Add to Home screen, or use the in-app Install button when shown.
- iOS/Safari: Share -> Add to Home Screen.

## Deployment

- Any static host works, including Firebase Hosting, Vercel, Netlify, or Cloudflare Pages.
- Ensure HTTPS and that `/.well-known` and `manifest.webmanifest` are served without redirects.

### Hugging Face Spaces (Private)

If you make the Space private, the frontend must be served from the same origin as the backend through Hugging Face's authenticated reverse proxy. Otherwise the browser will see `404` for API calls.

This repo includes a Docker Space setup (`Dockerfile` + `nginx.conf`) that serves the built Vite app on port `7860` with SPA routing.

Steps:

1. Create a new Hugging Face Space and choose Docker as the SDK.
2. Push this repo to that Space, or connect the GitHub repository.
3. In Space Settings -> Variables, set `VITE_API_BASE_URL` to an empty value, or leave it unset so `*.hf.space` defaults to same-origin.
4. Rebuild the Space.

Notes:

- When hosted on HF, API requests should be relative (`/api/...`) so they go through HF auth.
- If the backend is private, it must be served from the same Space or origin as these `/api/...` routes.

### Firebase Hosting (example)

```bash
npm run build
firebase deploy
```

## Android Play Store (TWA) - Optional

Use Trusted Web Activity (Bubblewrap) to ship the PWA as a Play Store app.

1. Install Bubblewrap: `npm i -g @bubblewrap/cli`
2. Initialize: `bubblewrap init --manifest=https://YOUR_DOMAIN/manifest.webmanifest`
3. Build the Android App Bundle: `bubblewrap build`
4. Host `/.well-known/assetlinks.json` with your signing certificate fingerprint.
5. Upload the bundle in Google Play Console and complete the store listing.

## Architecture Notes

- `InterviewAssistant` orchestrates session, history, and UI layout.
- `App.tsx` owns route protection, static docs redirection, and global upgrade/rate-limit surfaces.
- `SearchBar` manages input, mic, upload, and send controls.
- `AnswerCard` renders streamed content with sanitization, formatting, and inline edit controls.
- `strataxClient.ts` centralizes guest/session headers, auth, BYOK handling, and cross-cutting browser events.
- Feature API modules in `src/lib` handle assistant, progress, practice, intelligence, auth, and architecture requests.
- Code execution is backend-only via `POST /api/code/execute` with no browser-side Pyodide or Judge0 integration.

## Accessibility & Performance

- Keyboard and touch-friendly controls with large hit targets on mobile
- Content streaming avoids layout jumps while final render converts to semantic blocks
- Lighthouse-friendly PWA configuration and production-only service worker registration

## Customization

- Theme: adjust Tailwind config and `ThemeToggle`
- Branding: replace icons in `public/icons/` and update manifest colors
- Copy and headers: update titles in `index.html` and visible labels in `InterviewAssistant.tsx`

## Troubleshooting

- Install app missing: verify icon filenames and sizes, HTTPS, and a responding service worker. Clear site data, reload, and interact once.
- Gray letter icon: verify PNG names match the manifest exactly and reinstall.
- Service worker cache issues: bump `CACHE_NAME` in `public/sw.js` and reload.

## License

Internal project - all rights reserved.



