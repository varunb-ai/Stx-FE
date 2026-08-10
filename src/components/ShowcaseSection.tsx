/**
 * The product, shown to a visitor who has not brought an API key.
 *
 * Everything rendered here is real captured output from the backend
 * (`GET /api/demo/showcase`, baked into src/fixtures/showcase.json by
 * `npm run showcase:sync`). Nothing is written to look plausible: the copilot
 * answer, the mirror report and the code critique are genuine LLM responses, and
 * the practice score comes from the deterministic scoring engine, so it is exact
 * rather than representative.
 *
 * Two consequences that shape this component:
 *
 * 1. It makes no network call and needs no key, so it cannot rate-limit, fail on
 *    a cold backend, or cost anything. It renders identically for one visitor or
 *    ten thousand.
 * 2. Scores are shown *with* their decomposition, never as a bare number. The
 *    weights are the real ones the engine applied, and `why` holds the engine's
 *    own traces. A number without its derivation would be the one thing this
 *    product is supposed not to do.
 */

import { useState } from "react";
import DOMPurify from "dompurify";

import showcase from "@/fixtures/showcase.json";
import { formatAnswerMarkdown } from "@/lib/answerMarkdown";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type PerAnswer = {
  question_id: number;
  overall_score: number;
  measured_dimensions: string[];
};

type Showcase = {
  _meta?: { captured_at?: string; note?: string };
  practice: {
    overall_score: number;
    dimension_scores: Record<string, number>;
    measured_dimensions: string[];
    why: string[];
    improvement_plan: string[];
    weights_applied: Record<string, number>;
    unmeasured_dimensions: string[];
    per_answer: PerAnswer[];
  };
  copilot: { question: string; answer: string };
  mirror: { question: string; draft: string; report: string };
  code: {
    problem: string;
    language: string;
    code: string;
    critique: string;
    scores: Record<string, number>;
    scores_available: boolean;
    static_signals: Record<string, unknown>;
  };
};

const data = showcase as unknown as Showcase;

/**
 * Long-form captured text, collapsed by default so the page stays scannable.
 *
 * The captured responses are markdown — headings, bold, bullets, fenced code —
 * because that is what the models actually return and what the product renders
 * everywhere else. Shown as plain text they read as broken (`**Strengths**`,
 * `## Interview Mirror`), which on the one page meant to demonstrate quality is
 * the wrong first impression. `formatAnswerMarkdown` is the same renderer the
 * answer surfaces use, so the demo looks like the product rather than like an
 * approximation of it.
 *
 * It HTML-escapes its input before parsing; DOMPurify on top is defence in
 * depth, since the text originated from an LLM even though it is now a reviewed,
 * committed fixture.
 */
function Expandable({ text, lines = 8 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  // ~72 chars per line is a reasonable proxy for "does this overflow the clamp";
  // the exact figure only decides whether the toggle appears at all.
  const isLong = text.length > lines * 72;
  const html = DOMPurify.sanitize(formatAnswerMarkdown(text));

  return (
    <div>
      <div
        className="showcase-prose text-sm leading-relaxed text-muted-foreground"
        style={
          open || !isLong
            ? undefined
            : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }
        }
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {isLong && (
        <Button variant="link" size="sm" className="mt-1 h-auto p-0" onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : "Show the full response"}
        </Button>
      )}
    </div>
  );
}

function SectionHeading({ label, title, blurb }: { label: string; title: string; blurb: string }) {
  return (
    <div className="mb-4">
      <Badge variant="outline" className="mb-2 font-mono text-[10px] uppercase tracking-widest">
        {label}
      </Badge>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
    </div>
  );
}

/** A dimension band: score, the weight actually applied, and a proportional bar. */
function DimensionBand({ name, score, weight }: { name: string; score: number; weight?: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{name}</span>
        <span className="text-sm tabular-nums text-foreground">
          {score.toFixed(1)}
          {typeof weight === "number" && (
            <span className="ml-2 text-xs text-muted-foreground">×{weight}</span>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}

function PracticeCard() {
  const p = data.practice;
  // The coding answer: measured on correctness alone. Delivery, clarity and
  // structure are *excluded* rather than scored zero, and the weights are
  // renormalised over what was measured -- which is why a strong typed answer
  // is not dragged down by three dimensions it could never have exhibited.
  const codingAnswer = p.per_answer.find(
    (a) => a.measured_dimensions.length === 1 && a.measured_dimensions[0] === "correctness"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scored practice interview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-end gap-3">
          <span className="text-4xl font-semibold tabular-nums text-foreground">{p.overall_score}</span>
          <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
        </div>

        <div className="space-y-3">
          {Object.entries(p.dimension_scores).map(([name, score]) => (
            <DimensionBand key={name} name={name} score={score} weight={p.weights_applied?.[name]} />
          ))}
        </div>

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Why — the engine's own trace
          </p>
          <ul className="space-y-1">
            {p.why.map((line) => (
              <li key={line} className="text-sm text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </div>

        {codingAnswer && (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm text-foreground">
              The coding answer scored{" "}
              <span className="font-semibold tabular-nums">{codingAnswer.overall_score}</span> on{" "}
              <span className="font-mono text-xs">correctness</span> alone.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Delivery, clarity and structure are excluded, not scored zero — you cannot measure
              speaking pace on typed code. The remaining weights are renormalised, so a strong typed
              answer is judged on what it actually demonstrated.
            </p>
          </div>
        )}

        {p.improvement_plan?.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              What to fix next
            </p>
            <ul className="list-inside list-disc space-y-1">
              {p.improvement_plan.map((item) => (
                <li key={item} className="text-sm text-muted-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The critique ends with the raw `Scores: {...}` JSON the parser reads to build
 * `scores`. Rendering both means showing the same numbers twice, once as badges
 * and once as a JSON blob — so the machine-readable tail is dropped from the
 * prose. Only the trailing occurrence is removed; if the model never emitted one
 * the critique is returned untouched.
 */
function critiqueWithoutRawScores(critique: string): string {
  return critique.replace(/\n*^Scores:\s*\{[\s\S]*?\}\s*$/m, "").trimEnd();
}

function CodeCard() {
  const c = data.code;
  const total = c.scores?.total;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Code review — {c.problem}{" "}
          <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{c.language}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
          <code>{c.code.trim()}</code>
        </pre>

        {c.scores_available && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(c.scores)
              .filter(([k]) => k !== "total")
              .map(([k, v]) => (
                <Badge key={k} variant="secondary" className="font-mono text-[10px]">
                  {k} {v}
                </Badge>
              ))}
            {typeof total === "number" && (
              <Badge className="font-mono text-[10px]">total {total}</Badge>
            )}
          </div>
        )}

        <Expandable text={critiqueWithoutRawScores(c.critique)} lines={6} />
      </CardContent>
    </Card>
  );
}

export function ShowcaseSection() {
  const capturedAt = data._meta?.captured_at?.slice(0, 10);

  return (
    <section id="showcase" className="mx-auto w-full max-w-5xl px-4 py-12">
      <header className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          See it evaluate — no API key needed
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every response below is real output from the product, captured once and served as-is. The
          practice score is computed by the same deterministic engine that scores your own sessions,
          so it is exact rather than illustrative.
          {capturedAt && <span className="ml-1 text-muted-foreground/70">Captured {capturedAt}.</span>}
        </p>
      </header>

      <div className="space-y-10">
        <div>
          <SectionHeading
            label="Practice"
            title="A score you can take apart"
            blurb="The number is never the whole answer. Each dimension shows the weight actually applied and the trace that produced it."
          />
          <PracticeCard />
        </div>

        <div>
          <SectionHeading
            label="Copilot"
            title="Answers with the reasoning left in"
            blurb="A real system-design question, answered in full."
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">{data.copilot.question}</CardTitle>
            </CardHeader>
            <CardContent>
              <Expandable text={data.copilot.answer} />
            </CardContent>
          </Card>
        </div>

        <div>
          <SectionHeading
            label="Mirror"
            title="What a weak answer actually costs you"
            blurb="A deliberately thin behavioural answer, and the critique it earns — including how confident the assessment is."
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">{data.mirror.question}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  The draft
                </p>
                <p className="border-l-2 border-border pl-3 text-sm italic leading-relaxed text-muted-foreground">
                  {data.mirror.draft}
                </p>
              </div>
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  The report
                </p>
                <Expandable text={data.mirror.report} lines={10} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <SectionHeading
            label="Code"
            title="Static analysis, execution and critique"
            blurb="Scored per dimension, with the signals the analyser actually found."
          />
          <CodeCard />
        </div>
      </div>

      <footer className="mt-10 rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm text-foreground">Ready to be the one being evaluated?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You bring your own Groq or Gemini key, so your usage is yours — your own rate limit, your
          own spend, nothing shared with other users.
        </p>
        <Button asChild className="mt-3">
          <a href="/app">Connect a key and start</a>
        </Button>
      </footer>
    </section>
  );
}

export default ShowcaseSection;
