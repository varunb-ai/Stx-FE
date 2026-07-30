/**
 * Turns the copilot's navigation advice into something the user can act on.
 *
 * The copilot is told to point people at the right feature ("Head to Practice
 * Mode in the sidebar and hit Quick Start"). Until now that was prose — the
 * user still had to go find it, which is precisely the moment a confused user
 * gives up. These chips render the same suggestion as a button.
 *
 * Detection is deliberately conservative. "Practice explaining your answer out
 * loud" is coaching, not navigation, and must not produce a button. A feature
 * only surfaces when its name appears alongside a directional cue in the same
 * sentence.
 */

import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Mic,
  Search,
  SquarePen,
} from "lucide-react";

export type CopilotFeature =
  | "practice"
  | "mock-interview"
  | "questions"
  | "progress"
  | "mirror";

type FeatureDef = {
  id: CopilotFeature;
  label: string;
  hint: string;
  icon: typeof Mic;
  /** Names the copilot may use for this feature. */
  names: RegExp;
};

const FEATURES: FeatureDef[] = [
  {
    id: "practice",
    label: "Open Practice Mode",
    hint: "Scored practice session",
    icon: Mic,
    names: /\b(practice mode|live practice|quick[- ]start)\b/i,
  },
  {
    id: "mock-interview",
    label: "Start a Mock Interview",
    hint: "Full simulated interview",
    icon: ClipboardCheck,
    names: /\bmock interview\b/i,
  },
  {
    id: "questions",
    label: "Generate practice questions",
    hint: "A set on this topic, with answers",
    icon: Search,
    names: /\b(practice questions|interview questions|question bank|interview intelligence|search intelligence)\b/i,
  },
  {
    id: "progress",
    label: "View Progress",
    hint: "Heatmap and weak areas",
    icon: BarChart3,
    names: /\b(progress (page|section|tracker)|your progress|heatmap|weak areas)\b/i,
  },
  {
    id: "mirror",
    label: "Switch to Mirror Mode",
    hint: "Get your answer analysed",
    icon: SquarePen,
    names: /\bmirror mode\b/i,
  },
];

/**
 * Directional language. Without one of these near the feature name we assume
 * the copilot is talking *about* the feature rather than sending the user to it.
 */
const NAVIGATION_CUE =
  /\b(go to|head (to|over)|open|switch to|jump (in|to)|use|try|visit|navigate|find it in|check out|hit)\b|→/i;

const SENTENCE_SPLIT = /(?<=[.!?\n])\s+/;

export function detectSuggestedFeatures(answer: string): CopilotFeature[] {
  if (!answer || answer.length > 40_000) return [];

  // Ignore fenced code so a code sample mentioning "practice" cannot trigger a chip.
  const prose = answer.replace(/```[\s\S]*?```/g, " ");
  const sentences = prose.split(SENTENCE_SPLIT);

  const found: CopilotFeature[] = [];
  for (const feature of FEATURES) {
    const hit = sentences.some(
      (s) => feature.names.test(s) && NAVIGATION_CUE.test(s)
    );
    if (hit && !found.includes(feature.id)) found.push(feature.id);
  }

  // More than two buttons stops being guidance and becomes another menu.
  return found.slice(0, 2);
}

interface CopilotFeatureNavProps {
  answer: string;
  onNavigate: (feature: CopilotFeature) => void;
}

export function CopilotFeatureNav({ answer, onNavigate }: CopilotFeatureNavProps) {
  const suggested = detectSuggestedFeatures(answer);
  if (suggested.length === 0) return null;

  return (
    <div
      className="mt-3 flex flex-wrap gap-2"
      role="group"
      aria-label="Suggested next steps"
    >
      {suggested.map((id) => {
        const feature = FEATURES.find((f) => f.id === id);
        if (!feature) return null;
        const Icon = feature.icon;
        return (
          <Button
            key={id}
            variant="outline"
            size="sm"
            onClick={() => onNavigate(id)}
            className="h-auto gap-2 rounded-xl border-primary/30 bg-primary/5 py-2 pl-3 pr-2.5 text-left hover:bg-primary/10"
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex flex-col leading-tight">
              <span className="text-xs font-medium">{feature.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {feature.hint}
              </span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}
