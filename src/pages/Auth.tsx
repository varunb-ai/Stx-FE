import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Login } from '../components/Login';
import { Register } from '../components/Register';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Auth surface — Strata design system.
 *
 * Same doctrine as the landing page and the docs: depth is structural, one
 * accent hue, and type does the work. The previous version ran a purple →
 * pink → violet gradient with four coloured "feature" chips; that palette is
 * on the anti-pattern list and read as a different product to the one the
 * visitor just came from.
 *
 * Everything here resolves through the app's own theme tokens (background,
 * card, border, primary) rather than hardcoded dark values, so light mode
 * keeps working — the strata metaphor is a re-lighting, not a colour swap.
 */

/* The rubric, stated once. It is the product's signature component, and
   showing it here means the auth page argues the same thing the landing page
   does instead of listing adjectives. Weights mirror the real engine. */
const RUBRIC = [
  { name: 'correctness', weight: 45 },
  { name: 'delivery', weight: 25 },
  { name: 'clarity', weight: 15 },
  { name: 'structure', weight: 15 },
];

const SPECS = [
  ['8', 'modules'],
  ['6', 'agents'],
  ['13', 'round types'],
  ['10', 'runtimes'],
];

const MONO = "'JetBrains Mono', ui-monospace, monospace";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode'); // 'signin' or 'signup'
  const [showLogin, setShowLogin] = useState(mode !== 'signup');

  return (
    <div
      className="relative min-h-screen bg-background text-foreground overflow-x-clip"
      style={{ maxWidth: '100vw' }}
    >
      {/* ═══════════ S0 — THE STRATA FIELD ═══════════
          A near-still cross-section: sedimentary banding, a measured grid and
          one accent bloom. No drifting orbs, no particle field, no scan sweep. */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* Accent bloom */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            top: '-24vh',
            width: 'min(1100px, 145vw)',
            height: 'min(620px, 68vh)',
            filter: 'blur(96px)',
            background:
              'radial-gradient(60% 60% at 50% 40%, hsl(var(--primary) / 0.16) 0%, transparent 70%)',
          }}
        />
        {/* Sedimentary banding — the name, drawn */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'repeating-linear-gradient(180deg, hsl(var(--foreground) / 0.030) 0px, hsl(var(--foreground) / 0.030) 1px, transparent 1px, transparent 7px, hsl(var(--foreground) / 0.016) 7px, hsl(var(--foreground) / 0.016) 8px, transparent 8px, transparent 22px)',
            WebkitMaskImage:
              'linear-gradient(180deg, transparent, #000 16%, #000 64%, transparent 94%)',
            maskImage:
              'linear-gradient(180deg, transparent, #000 16%, #000 64%, transparent 94%)',
          }}
        />
        {/* Measured coordinate grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--primary) / 0.055) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary) / 0.055) 1px, transparent 1px)',
            backgroundSize: 'clamp(54px, 6vw, 88px) clamp(54px, 6vw, 88px)',
            WebkitMaskImage:
              'radial-gradient(125% 78% at 50% 0%, #000 24%, transparent 100%)',
            maskImage:
              'radial-gradient(125% 78% at 50% 0%, #000 24%, transparent 100%)',
          }}
        />
      </div>

      {/* ═══════════ CONTENT ═══════════ */}
      <div className="relative z-10 flex min-h-screen lg:h-screen">
        {/* ── Left: the argument ── */}
        <div className="hidden lg:flex lg:w-[54%] flex-col justify-center px-12 xl:px-20 lg:h-screen overflow-y-auto border-r border-border/60">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="py-10 max-w-xl"
          >
            <p
              className="inline-flex items-center gap-2 text-muted-foreground uppercase"
              style={{ fontFamily: MONO, fontSize: '0.68rem', letterSpacing: '0.16em' }}
            >
              <span
                className="inline-block bg-primary"
                style={{ width: 5, height: 5, rotate: '45deg' }}
              />
              Interview Intelligence Platform
            </p>

            {/* The weight shift carries the emphasis, so colour doesn't have to. */}
            <h1 className="mt-6 mb-6" style={{ letterSpacing: '-0.045em', lineHeight: 1.04 }}>
              <span className="block text-[2.9rem] xl:text-[3.4rem] font-extralight text-muted-foreground">
                Interviews are scored.
              </span>
              <span className="block text-[2.9rem] xl:text-[3.4rem] font-semibold text-foreground">
                Now the scoring{' '}
                <span className="relative inline-block">
                  shows its work
                  <motion.span
                    className="absolute left-0 right-0 bg-primary"
                    style={{ bottom: '-0.06em', height: 2, transformOrigin: 'left' }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.9, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  />
                </span>
                .
              </span>
            </h1>

            <p className="text-[1.05rem] leading-relaxed text-muted-foreground max-w-lg">
              Every answer you give — spoken, written or executed — decomposes into the
              evidence that produced its score. Sign in to pick up where your last
              session left off.
            </p>

            {/* ── The rubric, as an instrument ── */}
            <div
              className="mt-10 rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-5"
              style={{ borderTopColor: 'hsl(var(--border))', boxShadow: '0 8px 24px -8px hsl(220 40% 3% / 0.35)' }}
            >
              <div
                className="flex items-center justify-between text-muted-foreground uppercase mb-4"
                style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.16em' }}
              >
                <span className="text-primary">Published weights</span>
                <span>one rubric · every module</span>
              </div>

              {/* Row text is never animated from opacity 0 — only the bar fills.
                  A label that needs an animation frame to become legible is a
                  label that can fail to appear at all. */}
              <div className="space-y-2.5">
                {RUBRIC.map((r, i) => (
                  <div
                    key={r.name}
                    className="grid items-center gap-3"
                    style={{ gridTemplateColumns: '92px 1fr 34px' }}
                  >
                    <span
                      className="text-muted-foreground uppercase"
                      style={{ fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.08em' }}
                    >
                      {r.name}
                    </span>
                    <span className="block h-1 rounded-full bg-muted overflow-hidden">
                      <motion.span
                        className="block h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${r.weight * 2}%` }}
                        transition={{ delay: 0.4 + i * 0.08, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </span>
                    <span
                      className="text-right text-foreground tabular-nums"
                      style={{ fontFamily: MONO, fontSize: '0.68rem' }}
                    >
                      ·{r.weight}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-4 pt-3 border-t border-border/70 text-xs leading-relaxed text-muted-foreground">
                A dimension with no input is <span className="text-foreground">excluded</span> and
                the rest renormalised — never scored as zero.
              </p>
            </div>

            {/* ── Spec row ── */}
            <div className="mt-8 pt-5 border-t border-border/60 flex flex-wrap gap-x-6 gap-y-2">
              {SPECS.map(([n, label]) => (
                <span
                  key={label}
                  className="text-muted-foreground"
                  style={{ fontFamily: MONO, fontSize: '0.7rem', letterSpacing: '0.05em' }}
                >
                  <b className="text-foreground font-semibold">{n}</b> {label}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── Right: the form ── */}
        <div
          className="w-full lg:w-[46%] flex items-start justify-center px-4 sm:px-8 py-8 sm:py-12 lg:h-screen lg:overflow-y-auto"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md my-auto"
          >
            {/* Mobile brand header — the left panel is hidden below lg */}
            <div className="lg:hidden mb-8">
              {/* A brand lockup, so it carries the real mark rather than a glyph. */}
              <p
                className="inline-flex items-center gap-2.5 text-muted-foreground uppercase"
                style={{ fontFamily: MONO, fontSize: '0.62rem', letterSpacing: '0.16em' }}
              >
                <img
                  src="/icons/stratax-ai-192.png?v=16"
                  alt=""
                  width={24}
                  height={24}
                  className="w-6 h-6 rounded-md"
                  aria-hidden="true"
                />
                Stratax AI
              </p>
              <h2
                className="mt-3 text-[1.9rem] font-semibold text-foreground"
                style={{ letterSpacing: '-0.04em', lineHeight: 1.1 }}
              >
                Now the scoring shows its work.
              </h2>
            </div>

            <AnimatePresence mode="wait">
              {showLogin ? (
                <motion.div
                  key="login"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Login onSwitchToRegister={() => setShowLogin(false)} />
                </motion.div>
              ) : (
                <motion.div
                  key="register"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Register onSwitchToLogin={() => setShowLogin(true)} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
