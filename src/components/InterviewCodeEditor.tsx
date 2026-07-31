import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MonacoEditor } from './MonacoEditor';
import { apiExecuteCode } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Code2,
  Play,
  CheckCircle2,
  CircleX,
  Clock,
  Loader2,
  Lightbulb,
  TriangleAlert,
  TrendingUp,
  Terminal,
  Send,
  ListChecks,
} from 'lucide-react';
import type {
  Question,
  CodeTestResult,
  CodeEvaluationFeedback,
} from '@/lib/practiceModeApi';
import {
  Panel,
  PanelHead,
  PanelBody,
  Seam,
  Eyebrow,
  Chip,
  PxButton,
  Grid,
  StatTile,
  MeterRow,
  FindingList,
} from './practice/PracticeKit';
import { toneColor, toneVar, type PxTone } from './practice/tones';

/** Score→tone, matching the rest of Practice Mode. */
const scoreTone = (value: number): PxTone => {
  if (value >= 85) return 'positive';
  if (value >= 70) return 'accent';
  if (value >= 50) return 'caution';
  return 'critical';
};

interface InterviewCodeEditorProps {
  question: Question;
  onSubmit: (code: string, timeTaken: number) => Promise<void>;
  isSubmitting?: boolean;
  testResults?: CodeTestResult[];
  evaluation?: CodeEvaluationFeedback;
  timeRemaining: number;
  onTimeUp?: () => void;
}

export const InterviewCodeEditor = ({
  question,
  onSubmit,
  isSubmitting = false,
  testResults,
  evaluation,
  timeRemaining,
  onTimeUp,
}: InterviewCodeEditorProps) => {
  const { toast } = useToast();
  
  const defaultLang = question.programming_language || 'python';
  const [language, setLanguage] = useState(defaultLang);
  const [code, setCode] = useState(question.code_template || getDefaultTemplate(defaultLang));
  const [startTime] = useState(Date.now());
  const [activeTab, setActiveTab] = useState('editor');
  const [showHint, setShowHint] = useState(false);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);

  // Run code state
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [codeOutput, setCodeOutput] = useState('');
  const [showOutput, setShowOutput] = useState(false);
  const testCases = question.test_cases || [];
  const hints = question.hints || [];
  const constraints = question.constraints || [];

  // Auto-switch to results tab when evaluation is available
  useEffect(() => {
    if (evaluation) {
      setActiveTab('results');
    }
  }, [evaluation]);

  // Handle time up
  useEffect(() => {
    if (timeRemaining <= 0 && onTimeUp) {
      onTimeUp();
    }
  }, [timeRemaining, onTimeUp]);

  // When language changes, update the template if user hasn't typed custom code
  const handleLanguageChange = useCallback((newLang: string) => {
    const prevTemplate = getDefaultTemplate(language);
    // If code is still the default template, swap to the new language template
    if (code.trim() === prevTemplate.trim() || !code.trim()) {
      setCode(getDefaultTemplate(newLang));
    }
    setLanguage(newLang);
  }, [code, language]);

  const handleRunCode = useCallback(async () => {
    if (!code.trim()) {
      toast({ title: 'No code to run', description: 'Please write some code first.', variant: 'destructive' });
      return;
    }
    setIsRunningCode(true);
    setCodeOutput('');
    setShowOutput(true);

    try {
      const execLanguage = language === 'typescript' ? 'javascript' : language;
      const exec = await apiExecuteCode({ language: execLanguage, code, stdin: '' });

      const stdout = (exec.stdout ?? '').trim();
      const stderr = (exec.stderr ?? '').trim();

      if (exec.success) {
        const output = stdout || '(no output)';
        setCodeOutput(stderr ? `${output}\n\n[stderr]\n${stderr}` : output);
      } else {
        setCodeOutput(stderr || stdout || exec.status || 'Execution failed');
      }
    } catch (error: any) {
      setCodeOutput(`Error: ${error.message || 'Failed to execute code'}`);
    } finally {
      setIsRunningCode(false);
    }
  }, [code, language, toast]);

  const handleSubmit = async () => {
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);
    await onSubmit(code, timeTaken);
  };

  const handleShowNextHint = () => {
    if (currentHintIndex < hints.length - 1) {
      setCurrentHintIndex(currentHintIndex + 1);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Countdown pressure, on the same scale the rest of Practice Mode uses.
  const timerTone: PxTone = timeRemaining > 300 ? 'positive' : timeRemaining > 120 ? 'caution' : 'critical';

  const fileExtension =
    language === 'python' ? 'py'
      : language === 'cpp' || language === 'c' ? language
        : language === 'java' ? 'java'
          : language === 'go' ? 'go'
            : language === 'typescript' ? 'ts'
              : 'js';

  return (
    <div className="px space-y-3.5">

      {/* ── Prompt ── */}
      <Panel variant="raised" className="overflow-hidden">
        <Seam tone="neural" />
        <div className="px-4 sm:px-5 pt-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <Eyebrow tone="neural" icon={Code2}>
                Coding challenge
              </Eyebrow>
              <div className="mt-2 flex items-center gap-2">
                <Chip
                  className="capitalize"
                  tone={
                    question.difficulty === 'easy'
                      ? 'positive'
                      : question.difficulty === 'medium'
                        ? 'caution'
                        : 'critical'
                  }
                >
                  {question.difficulty ?? 'unrated'}
                </Chip>
                <Chip mono>{language}</Chip>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <label className="px-eyebrow">Language</label>
                <Select value={language} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="px-select px-select--sm w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                    <SelectItem value="typescript">TypeScript</SelectItem>
                    <SelectItem value="java">Java</SelectItem>
                    <SelectItem value="cpp">C++</SelectItem>
                    <SelectItem value="c">C</SelectItem>
                    <SelectItem value="go">Go</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <span
                className="px-num text-lg font-semibold inline-flex items-center gap-1.5"
                style={toneColor(timerTone)}
              >
                <Clock className="w-4 h-4" />
                {formatTime(timeRemaining)}
              </span>
            </div>
          </div>

          <p className="px-body mt-4 whitespace-pre-wrap text-[0.9375rem] px-ink">
            {question.question_text || question.text || 'No question text available'}
          </p>

          {constraints.length > 0 && (
            <div className="px-panel px-panel--inset mt-4 px-3.5 py-3">
              <Eyebrow tone="caution" icon={TriangleAlert}>
                Constraints
              </Eyebrow>
              <div className="mt-1.5">
                <FindingList items={constraints} tone="caution" />
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* ── Workspace ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="px-segment px-segment--block">
          <TabsTrigger value="editor" className="px-segment__item">Editor</TabsTrigger>
          <TabsTrigger value="tests" className="px-segment__item">
            Tests<span className="px-num opacity-60"> {testCases.length}</span>
          </TabsTrigger>
          <TabsTrigger value="hints" className="px-segment__item" disabled={hints.length === 0}>
            Hints<span className="px-num opacity-60"> {hints.length}</span>
          </TabsTrigger>
          <TabsTrigger value="results" className="px-segment__item" disabled={!evaluation}>
            Results
          </TabsTrigger>
        </TabsList>

        {/* Editor */}
        <TabsContent value="editor" className="mt-3.5">
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-[hsl(var(--px-line-soft))]">
              <span className="px-num text-[0.6875rem] px-ink-3">solution.{fileExtension}</span>
              <span className="px-eyebrow">Autosaved locally</span>
            </div>

            <div className="p-3 space-y-3">
              <MonacoEditor
                value={code}
                language={language}
                onChange={setCode}
                height="min(400px, 50vh)"
              />

              {showOutput && (
                <div className="px-panel px-panel--inset overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--px-line-soft))]">
                    <Eyebrow icon={Terminal}>Output</Eyebrow>
                    <button
                      onClick={() => setShowOutput(false)}
                      className="px-focusable px-note px-link transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <pre
                    className="px-num p-3 text-[0.8125rem] overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap"
                    style={{ background: 'hsl(224 48% 3%)', color: `hsl(${toneVar('positive')})` }}
                  >
                    {isRunningCode ? 'Running…' : (codeOutput || '(no output)')}
                  </pre>
                </div>
              )}
            </div>

            <div className="px-panel__foot flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="px-note">Write your solution, run it, then submit.</span>
              <div className="flex items-center gap-2">
                <PxButton variant="outline" onClick={handleRunCode} disabled={isRunningCode || !code.trim()}>
                  {isRunningCode ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running…
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run code
                    </>
                  )}
                </PxButton>
                <PxButton variant="primary" onClick={handleSubmit} disabled={isSubmitting || !code.trim()} className="min-w-36">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Submit code
                    </>
                  )}
                </PxButton>
              </div>
            </div>
          </Panel>
        </TabsContent>

        {/* Test cases */}
        <TabsContent value="tests" className="mt-3.5">
          <Panel className="overflow-hidden">
            <PanelHead
              eyebrow="Test cases"
              icon={ListChecks}
              tone="neural"
              title={`${testCases.length} case${testCases.length === 1 ? '' : 's'}`}
              description="Your solution is evaluated against these."
            />
            <PanelBody>
              <ScrollArea className="h-[400px] pr-3">
                <div className="space-y-2.5">
                  {testCases.map((testCase, idx) => (
                    <div key={idx} className="px-panel px-panel--inset px-3.5 py-3 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-num text-[0.6875rem] px-ink-3">
                          CASE {String(idx + 1).padStart(2, '0')}
                        </span>
                        {testCase.is_hidden && <Chip>Hidden</Chip>}
                      </div>
                      <div>
                        <Eyebrow>Input</Eyebrow>
                        <pre className="px-num mt-1.5 text-[0.8125rem] px-ink p-2.5 rounded-[var(--px-r-xs)] bg-[hsl(var(--px-surface))] border border-[hsl(var(--px-line-soft))] overflow-x-auto">
                          {testCase.input}
                        </pre>
                      </div>
                      {!testCase.is_hidden && (
                        <div>
                          <Eyebrow>Expected output</Eyebrow>
                          <pre className="px-num mt-1.5 text-[0.8125rem] px-ink p-2.5 rounded-[var(--px-r-xs)] bg-[hsl(var(--px-surface))] border border-[hsl(var(--px-line-soft))] overflow-x-auto">
                            {testCase.expected_output}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </PanelBody>
          </Panel>
        </TabsContent>

        {/* Hints */}
        <TabsContent value="hints" className="mt-3.5">
          <Panel tone="caution" className="overflow-hidden">
            <PanelHead
              eyebrow="Progressive hints"
              icon={Lightbulb}
              tone="caution"
              title="Reveal only what you need"
              description="Hints are recorded and may affect your evaluation score."
            />
            <PanelBody className="space-y-2.5">
              {hints.slice(0, currentHintIndex + 1).map((hint, idx) => (
                <div key={idx} className="px-panel px-panel--inset flex items-start gap-3 px-3.5 py-3">
                  <span className="px-row__index shrink-0">{idx + 1}</span>
                  <p className="px-body px-body--tight">{hint}</p>
                </div>
              ))}
              {currentHintIndex < hints.length - 1 && (
                <PxButton variant="outline" block onClick={handleShowNextHint}>
                  <Lightbulb className="w-4 h-4" />
                  Show next hint ({currentHintIndex + 1}/{hints.length})
                </PxButton>
              )}
            </PanelBody>
          </Panel>
        </TabsContent>

        {/* Results */}
        <TabsContent value="results" className="mt-3.5">
          {evaluation && (
            <div className="space-y-3.5">
              <Panel variant="raised" tone={evaluation.is_correct ? 'positive' : 'caution'} className="overflow-hidden">
                <Seam tone={evaluation.is_correct ? 'positive' : 'caution'} />
                <PanelHead
                  eyebrow="Verdict"
                  icon={evaluation.is_correct ? CheckCircle2 : TriangleAlert}
                  tone={evaluation.is_correct ? 'positive' : 'caution'}
                  title={evaluation.is_correct ? 'Solution accepted' : 'Needs improvement'}
                  actions={
                    <div className="text-right">
                      <div className="px-num text-2xl font-semibold px-ink leading-none">
                        {evaluation.overall_score}%
                      </div>
                      <div className="px-eyebrow mt-1">overall</div>
                    </div>
                  }
                />
                <PanelBody className="space-y-4">
                  <div className="space-y-3">
                    <MeterRow label="Correctness" value={evaluation.correctness_score} tone={scoreTone(evaluation.correctness_score)} />
                    <MeterRow label="Code quality" value={evaluation.code_quality_score} tone={scoreTone(evaluation.code_quality_score)} />
                    <MeterRow label="Efficiency" value={evaluation.efficiency_score} tone={scoreTone(evaluation.efficiency_score)} />
                  </div>

                  <div className="px-panel px-panel--inset flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="px-note">Test cases</span>
                    <span className="px-num text-[0.8125rem] font-semibold px-ink">
                      {evaluation.test_cases_passed} / {evaluation.test_cases_total} passed
                    </span>
                  </div>
                </PanelBody>
              </Panel>

              {testResults && testResults.length > 0 && (
                <Panel className="overflow-hidden">
                  <PanelHead eyebrow="Per-case results" icon={ListChecks} tone="neural" />
                  <PanelBody>
                    <ScrollArea className="h-[300px] pr-3">
                      <div className="space-y-2.5">
                        {testResults.map((result, idx) => (
                          <div
                            key={idx}
                            className="px-panel px-panel--inset px-3.5 py-3 space-y-2.5"
                            style={{ borderColor: `hsl(${toneVar(result.passed ? 'positive' : 'critical')} / 0.28)` }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-2">
                                {result.passed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5" style={toneColor('positive')} />
                                ) : (
                                  <CircleX className="w-3.5 h-3.5" style={toneColor('critical')} />
                                )}
                                <span className="px-num text-[0.75rem] font-semibold px-ink">
                                  Case {result.test_case_number}
                                </span>
                              </span>
                              {result.execution_time_ms && <Chip mono>{result.execution_time_ms}ms</Chip>}
                            </div>

                            <div>
                              <Eyebrow>Input</Eyebrow>
                              <pre className="px-num mt-1.5 text-[0.75rem] px-ink p-2 rounded-[var(--px-r-xs)] bg-[hsl(var(--px-surface))] border border-[hsl(var(--px-line-soft))] overflow-x-auto">
                                {result.input}
                              </pre>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Eyebrow>Expected</Eyebrow>
                                <pre className="px-num mt-1.5 text-[0.75rem] px-ink p-2 rounded-[var(--px-r-xs)] bg-[hsl(var(--px-surface))] border border-[hsl(var(--px-line-soft))] overflow-x-auto">
                                  {result.expected_output}
                                </pre>
                              </div>
                              <div>
                                <Eyebrow>Yours</Eyebrow>
                                <pre
                                  className="px-num mt-1.5 text-[0.75rem] px-ink p-2 rounded-[var(--px-r-xs)] border overflow-x-auto"
                                  style={{
                                    background: `hsl(${toneVar(result.passed ? 'positive' : 'critical')} / 0.08)`,
                                    borderColor: `hsl(${toneVar(result.passed ? 'positive' : 'critical')} / 0.24)`,
                                  }}
                                >
                                  {result.actual_output}
                                </pre>
                              </div>
                            </div>

                            {result.error_message && (
                              <p className="px-note" style={toneColor('critical')}>
                                {result.error_message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </PanelBody>
                </Panel>
              )}

              <Panel className="overflow-hidden">
                <PanelHead eyebrow="Analysis" icon={TrendingUp} tone="neural" title="AI feedback" />
                <PanelBody className="space-y-4">
                  <div>
                    <Eyebrow>Algorithm approach</Eyebrow>
                    <p className="px-body mt-1.5">{evaluation.approach_feedback}</p>
                  </div>

                  <Grid cols={2} gap="0.625rem">
                    <StatTile label="Time complexity" value={evaluation.time_complexity} tone="neural" />
                    <StatTile label="Space complexity" value={evaluation.space_complexity} tone="neural" />
                  </Grid>

                  {evaluation.code_quality_notes.length > 0 && (
                    <div>
                      <Eyebrow>Code quality</Eyebrow>
                      <div className="mt-1.5">
                        <FindingList items={evaluation.code_quality_notes} tone="accent" />
                      </div>
                    </div>
                  )}

                  <Grid cols={1} sm={2} gap="0.875rem">
                    {evaluation.edge_cases_handled.length > 0 && (
                      <div>
                        <Eyebrow tone="positive" icon={CheckCircle2}>Handled well</Eyebrow>
                        <div className="mt-1.5">
                          <FindingList items={evaluation.edge_cases_handled} tone="positive" />
                        </div>
                      </div>
                    )}
                    {evaluation.edge_cases_missed.length > 0 && (
                      <div>
                        <Eyebrow tone="caution" icon={TriangleAlert}>Missed cases</Eyebrow>
                        <div className="mt-1.5">
                          <FindingList items={evaluation.edge_cases_missed} tone="caution" />
                        </div>
                      </div>
                    )}
                  </Grid>

                  {evaluation.optimization_suggestions.length > 0 && (
                    <div>
                      <Eyebrow tone="accent" icon={Lightbulb}>Optimisation</Eyebrow>
                      <div className="mt-1.5">
                        <FindingList items={evaluation.optimization_suggestions} tone="accent" numbered />
                      </div>
                    </div>
                  )}

                  {evaluation.alternative_approaches.length > 0 && (
                    <div>
                      <Eyebrow tone="neural">Alternative approaches</Eyebrow>
                      <div className="mt-1.5">
                        <FindingList items={evaluation.alternative_approaches} tone="neural" />
                      </div>
                    </div>
                  )}

                  {evaluation.best_practices_violated.length > 0 && (
                    <div
                      className="px-panel px-panel--inset px-3.5 py-3"
                      style={{ borderColor: `hsl(${toneVar('caution')} / 0.3)` }}
                    >
                      <Eyebrow tone="caution" icon={TriangleAlert}>Best practices to consider</Eyebrow>
                      <div className="mt-1.5">
                        <FindingList items={evaluation.best_practices_violated} tone="caution" />
                      </div>
                    </div>
                  )}
                </PanelBody>
              </Panel>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Helper function to get default code template based on language
function getDefaultTemplate(language: string): string {
  const templates: Record<string, string> = {
    python: `def solution():
    # Write your code here
    pass

# Test your solution
if __name__ == "__main__":
    result = solution()
    print(result)`,
    
    javascript: `function solution() {
    // Write your code here
}

// Test your solution
console.log(solution());`,
    
    java: `public class Solution {
    public static void main(String[] args) {
        // Write your code here
    }
}`,
    
    cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your code here
    return 0;
}`,
    
    typescript: `function solution(): any {
    // Write your code here
}

// Test your solution
console.log(solution());`,
  };

  return templates[language.toLowerCase()] || templates.python;
}
