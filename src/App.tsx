import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Runner from "./pages/Runner";
import ArchitecturePage from "./pages/Architecture";
import Auth from "./pages/Auth";
import GoogleCallback from "./pages/GoogleCallback";
import VerifyEmail from "./pages/VerifyEmail";
import ResetPassword from "./pages/ResetPassword";
import Progress from "./pages/Progress";
import { InterviewAssistant } from "./components/InterviewAssistant";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { UpgradeModal } from "./components/UpgradeModal";
import { RateLimitWarning } from "./components/RateLimitWarning";
import { ShowcaseSection } from "./components/ShowcaseSection";
import { PwaInstallProvider } from "./context/PwaInstallContext";


import { useEffect } from "react";

const queryClient = new QueryClient();

/**
 * Redirects `/` to the static landing page.
 * In production, Firebase Hosting serves `/landing.html` at `/`.
 * Locally, Vite serves the SPA for `/`, so we force-load the static landing page.
 */
const LandingRedirect = () => {
  useEffect(() => {
    if (window.location.pathname === '/') {
      window.location.replace('/landing.html');
    }
  }, []);
  return null;
};

/** Sends the legacy `/landing` alias to the canonical static landing page. */
const LandingHtmlRedirect = () => {
  useEffect(() => {
    window.location.replace('/landing.html');
  }, []);
  return null;
};

/**
 * Redirects `/docs` to the static docs entrypoint.
 * Locally, Vite serves the SPA for `/docs`, so we force-load the static docs HTML.
 */
const DocsRedirect = () => {
  useEffect(() => {
    if (window.location.pathname !== '/docs/index.html') {
      window.location.replace('/docs/index.html');
    }
  }, []);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <PwaInstallProvider>
        <Toaster />
        <UpgradeModal />
        <RateLimitWarning onUpgradeClick={() => {
          // Trigger upgrade modal
          window.dispatchEvent(new CustomEvent('ratelimit:exceeded', {
            detail: {
              message: 'You are approaching your rate limit.',
              current_usage: 0,
              limit: 0,
              tier: 'free'
            }
          }));
        }} />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={
              <ProtectedRoute requireAuth={false}>
                <Auth />
              </ProtectedRoute>
            } />
            <Route path="/auth/google/callback" element={<GoogleCallback />} />
            <Route path="/auth/verify-email" element={<VerifyEmail />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<LandingRedirect />} />
            {/* Legacy alias. `public/landing.html` is the canonical landing
                page — both the Firebase rewrite for `/` and LandingRedirect
                above point at it — so this alias sends visitors there rather
                than rendering a second, separately-maintained landing page
                that nothing links to. `src/pages/Index.tsx` is kept in the
                tree but is no longer routed. */}
            <Route path="/landing" element={<LandingHtmlRedirect />} />
            <Route path="/app" element={
              <InterviewAssistant />
            } />
            <Route path="/run" element={
              <ProtectedRoute>
                <Runner />
              </ProtectedRoute>
            } />
            <Route path="/architecture" element={
              <ProtectedRoute>
                <ArchitecturePage />
              </ProtectedRoute>
            } />
            <Route path="/progress" element={
              <ProtectedRoute>
                <Progress />
              </ProtectedRoute>
            } />
            <Route path="/docs/*" element={<DocsRedirect />} />
            {/* Deliberately unguarded, and the only route that shows real
                product output without a key. `/app` bounces visitors who have
                not configured one, so without this there is nowhere for them to
                see what the product does. Renders a baked fixture — no backend
                call, nothing to rate-limit. */}
            <Route path="/showcase" element={<ShowcaseSection />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </PwaInstallProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
