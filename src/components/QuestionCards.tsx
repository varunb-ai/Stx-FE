/**
 * A generated set of practice questions, rendered inside the copilot transcript.
 *
 * The backend returns these under `ui_action: "render_question_cards"`, and the
 * turn's `answer` is only a one-line preamble -- the questions live in
 * `ui_payload`, so this component owns displaying them.
 *
 * Deliberately not a port of the old Search Intelligence layout. That was a
 * 50/50 split pane: list on the left, answer on the right. It works in a
 * full-height tab and not in a chat column, so a card expands in place here
 * instead. The visual language (card treatment, badges, section labels) is kept
 * so the two do not look like different products while both exist.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Check, ChevronDown, Copy, MessageSquarePlus, Mic } from "lucide-react";
import type { EnhancedQuestion } from "@/lib/api";
import { formatAnswerMarkdown } from "@/lib/answerMarkdown";
import { useToast } from "@/hooks/use-toast";

interface QuestionCardsProps {
  /** The topic the set was generated for, shown in the header. */
  query?: string;
  questions: EnhancedQuestion[];
  className?: string;
  /**
   * Start a follow-up about one card.
   *
   * The cards travel in `ui_payload`, not in the conversation text, so the model
   * cannot see them on the next turn. Typing "explain question 3" gives it
   * nothing to resolve; this hands over the question itself.
   */
  onAskAbout?: (question: string) => void;
  /**
   * Practise one card aloud in Practice Mode.
   *
   * Not offered on coding cards: practice scores code by executing it, which
   * needs a Judge0 key the server does not have, so a coding drill would return
   * a guaranteed zero.
   */
  onPractise?: (question: EnhancedQuestion) => void;
}

const SECTION_LABEL =
  "text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 mb-2";

export const QuestionCards = ({
  query,
  questions,
  className = "",
  onAskAbout,
  onPractise,
}: QuestionCardsProps) => {
  // One open at a time: a set of twenty long answers is unreadable otherwise.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  if (!Array.isArray(questions) || questions.length === 0) return null;

  const copyAnswer = async (q: EnhancedQuestion, idx: number) => {
    const body = [q.question, "", q.answer, (q as any).code_solution || ""]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(body);
      setCopiedIndex(idx);
      window.setTimeout(() => setCopiedIndex((c) => (c === idx ? null : c)), 1500);
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Your browser blocked clipboard access.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
        <BookOpen className="h-3.5 w-3.5 text-primary/60" />
        <span className="font-semibold">
          {questions.length} practice question{questions.length === 1 ? "" : "s"}
        </span>
        {query ? <span className="truncate text-muted-foreground/50">· {query}</span> : null}
      </div>

      {questions.map((q, idx) => {
        const isOpen = openIndex === idx;
        const codeSolution = (q as any).code_solution as string | undefined;
        return (
          <Card
            key={`${idx}-${q.question.slice(0, 40)}`}
            className={`group/card border border-border/30 bg-card/40 backdrop-blur-sm transition-all duration-300 ease-out hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 ${
              isOpen ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20" : ""
            }`}
          >
            <CardContent className="p-0">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full text-left p-4 flex items-start gap-3"
              >
                <span className="mt-0.5 text-[10px] font-bold tabular-nums text-muted-foreground/50 w-5 shrink-0">
                  {idx + 1}
                </span>
                <span className="flex-1 min-w-0 space-y-2.5">
                  <span
                    className={`block text-sm font-medium transition-colors ${
                      isOpen ? "text-foreground" : "line-clamp-2 group-hover/card:text-foreground"
                    }`}
                  >
                    {q.question}
                  </span>
                  <span className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
                    {q.topic ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-primary/8 text-primary/80 border-0"
                      >
                        {q.topic}
                      </Badge>
                    ) : null}
                    {(q as any).difficulty ? (
                      <Badge variant="outline" className="text-[10px] border-border/30 bg-card/50">
                        {(q as any).difficulty}
                      </Badge>
                    ) : null}
                    {q.source ? (
                      <span className="text-[10px] text-muted-foreground/50">{q.source}</span>
                    ) : null}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-300 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen ? (
                <div className="px-4 pb-4 -mt-1 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="border-t border-border/30 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className={SECTION_LABEL}>Model Answer</h4>
                      <div className="flex items-center gap-1">
                        {onPractise && !(q as any).is_coding_question ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1.5 text-xs text-primary hover:bg-primary/10"
                            onClick={() => onPractise(q)}
                          >
                            <Mic className="h-3.5 w-3.5" />
                            Practise this
                          </Button>
                        ) : null}
                        {onAskAbout ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 gap-1.5 text-xs text-primary hover:bg-primary/10"
                            onClick={() => onAskAbout(q.question)}
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                            Ask about this
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => copyAnswer(q, idx)}
                          aria-label="Copy question and answer"
                        >
                          {copiedIndex === idx ? (
                            <Check className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div
                      className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: formatAnswerMarkdown(q.answer || "") }}
                    />
                  </div>

                  {codeSolution ? (
                    <div className="border-t border-border/30 pt-4 mt-4">
                      <h4 className={SECTION_LABEL}>Code Implementation</h4>
                      <div
                        className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: formatAnswerMarkdown(codeSolution) }}
                      />
                    </div>
                  ) : null}

                  {Array.isArray((q as any).follow_up_questions) &&
                  (q as any).follow_up_questions.length > 0 ? (
                    <div className="border-t border-border/30 pt-4 mt-4">
                      <h4 className={SECTION_LABEL}>Follow-ups</h4>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                        {((q as any).follow_up_questions as string[]).map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default QuestionCards;
