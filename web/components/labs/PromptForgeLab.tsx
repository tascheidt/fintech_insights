"use client";

import { useMemo, useState } from "react";
import { Sparkles, Swords, Trophy, Rocket, ShieldAlert, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type PromptStage = "job-structure" | "tech-stack" | "weekly-digest";

interface PromptConfig {
  stage: PromptStage;
  model: string;
  promptTemplate: string;
  temperature: number;
  maxOutputTokens: number;
  version?: string;
  notes?: string;
  benchmarkScore?: number | null;
}

interface CompanyOption {
  id: string;
  name: string;
  slug: string;
}

interface ModelOption {
  value: string;
  label: string;
  summary: string;
  recommendedStages: readonly string[];
}

interface Metric {
  id: string;
  label: string;
  value: number;
  tone: "good" | "warn" | "bad";
  helper: string;
}

interface BattleSummary {
  score: number;
  metrics: Metric[];
  latencyMs: number;
}

interface JobPreview {
  jobId: string;
  title: string;
  currentTech: string[];
  candidateTech: string[];
  added: string[];
  removed: string[];
}

interface CategoryPreview {
  category: string;
  label: string;
  technologies: string[];
  narrativeSummary?: string;
}

interface DigestPreview {
  headline: string;
  body: string;
}

interface RunRecord {
  id: string;
  stage: PromptStage;
  arena: string;
  companyId: string;
  companyName: string;
  model: string;
  score: number;
  metrics: Metric[];
  createdAt: string;
  savedAsActive?: boolean;
  promotionIssueUrl?: string | null;
}

interface BattleResult {
  stage: PromptStage;
  arena: string;
  companyId: string;
  companyName: string;
  runId: string;
  runCreatedAt: string;
  baseline: BattleSummary;
  candidate: BattleSummary;
  previews: JobPreview[] | CategoryPreview[];
  jobCount?: number;
  inputTechnologyCount?: number;
}

interface PromptForgeInitialData {
  companies: readonly CompanyOption[];
  activeConfigs: {
    jobStructure: PromptConfig;
    techStack: PromptConfig;
    weeklyDigest: PromptConfig;
  };
  runs: readonly RunRecord[];
  modelOptions: readonly ModelOption[];
}

const ARENA_OPTIONS: Record<
  PromptStage,
  { value: string; label: string; summary: string; recommendedSampleSize: number }[]
> = {
  "job-structure": [
    {
      value: "noise-gauntlet",
      label: "Noise Gauntlet",
      summary: "Punish vague tech labels and reward explicit named tools.",
      recommendedSampleSize: 4,
    },
    {
      value: "signal-raid",
      label: "Signal Raid",
      summary: "Balance specificity, canonical names, and fintech depth.",
      recommendedSampleSize: 6,
    },
    {
      value: "boss-round",
      label: "Boss Round",
      summary: "Stress-test the prompt across a bigger slice of live jobs.",
      recommendedSampleSize: 10,
    },
  ],
  "tech-stack": [
    {
      value: "architect-arena",
      label: "Architect Arena",
      summary: "Push for sharper CTO-style synthesis and better stack framing.",
      recommendedSampleSize: 1,
    },
    {
      value: "fintech-due-diligence",
      label: "Due Diligence",
      summary: "Reward vendor, platform, and regulated-fintech interpretation.",
      recommendedSampleSize: 1,
    },
    {
      value: "boardroom-boss",
      label: "Boardroom Boss",
      summary: "Score for signal clarity, nuance, and non-generic narrative quality.",
      recommendedSampleSize: 1,
    },
  ],
  "weekly-digest": [
    {
      value: "continuity-check",
      label: "Continuity Check",
      summary: "Reward prompts that distinguish continuing hiring from actual change.",
      recommendedSampleSize: 1,
    },
    {
      value: "plain-language",
      label: "Plain Language",
      summary: "Push for simpler, objective writing grounded in the open roles.",
      recommendedSampleSize: 1,
    },
    {
      value: "new-signal-scan",
      label: "New Signal Scan",
      summary: "Stress-test whether the prompt only calls out new signals when earned.",
      recommendedSampleSize: 1,
    },
  ],
};

const PLACEHOLDERS: Record<PromptStage, string[]> = {
  "job-structure": ["{job_title}", "{raw_department}", "{description}", "{categories}"],
  "tech-stack": [
    "{company_name}",
    "{tech_data}",
    "{strategic_context}",
    "{total_jobs}",
    "{period_start}",
    "{period_end}",
  ],
  "weekly-digest": [
    "{company_name}",
    "{week_job_count}",
    "{current_open_job_count}",
    "{year_to_date_job_count}",
    "{weekly_role_themes}",
    "{open_role_themes}",
    "{year_to_date_role_themes}",
    "{continuing_themes}",
    "{new_themes}",
    "{sample_titles}",
  ],
};

function toneClass(tone: Metric["tone"]) {
  if (tone === "good") return "text-growth-500";
  if (tone === "warn") return "text-accent-soft-foreground";
  return "text-destructive";
}

function stageKey(stage: PromptStage) {
  if (stage === "job-structure") return "jobStructure";
  if (stage === "tech-stack") return "techStack";
  return "weeklyDigest";
}

function stageLabel(stage: PromptStage) {
  if (stage === "job-structure") return "Stage 1 extractor";
  if (stage === "tech-stack") return "Stage 2 synthesis";
  return "Weekly digest";
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PromptForgeLab({ initialData }: { initialData: PromptForgeInitialData }) {
  const [stage, setStage] = useState<PromptStage>("job-structure");
  const [companyId, setCompanyId] = useState(initialData.companies[0]?.id ?? "");
  const [arena, setArena] = useState(ARENA_OPTIONS["job-structure"][1].value);
  const [sampleSize, setSampleSize] = useState(ARENA_OPTIONS["job-structure"][1].recommendedSampleSize);
  const [drafts, setDrafts] = useState({
    jobStructure: initialData.activeConfigs.jobStructure,
    techStack: initialData.activeConfigs.techStack,
    weeklyDigest: initialData.activeConfigs.weeklyDigest,
  });
  const [activeConfigs, setActiveConfigs] = useState(drafts);
  const [runs, setRuns] = useState(initialData.runs);
  const [battle, setBattle] = useState<BattleResult | null>(null);
  const [loading, setLoading] = useState<"evaluate" | "save" | "reprocess" | "promote" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [reprocessScope, setReprocessScope] = useState<"company" | "all">("company");
  const [reprocessLimit, setReprocessLimit] = useState<string>("");
  const [triggerCodegen, setTriggerCodegen] = useState(true);

  const currentKey = stageKey(stage);
  const currentDraft = drafts[currentKey];
  const currentActive = activeConfigs[currentKey];
  const selectedCompany = initialData.companies.find((company) => company.id === companyId);
  const stageArenas = ARENA_OPTIONS[stage];

  const placeholderCheck = useMemo(() => {
    return PLACEHOLDERS[stage].filter((token) => !currentDraft.promptTemplate.includes(token));
  }, [currentDraft.promptTemplate, stage]);

  const scoreDelta = battle ? battle.candidate.score - battle.baseline.score : 0;
  const liveScore = battle?.baseline.score ?? currentActive.benchmarkScore ?? 0;
  const challengerScore = battle?.candidate.score ?? currentDraft.benchmarkScore ?? 0;

  function updateDraft(patch: Partial<PromptConfig>) {
    setDrafts((prev) => ({
      ...prev,
      [currentKey]: {
        ...prev[currentKey],
        ...patch,
      },
    }));
  }

  function resetDraft() {
    setDrafts((prev) => ({
      ...prev,
      [currentKey]: activeConfigs[currentKey],
    }));
    setStatusMessage("Draft reset to the current live configuration.");
  }

  function handleStageChange(nextStage: PromptStage) {
    setStage(nextStage);
    const nextArena = ARENA_OPTIONS[nextStage][0];
    setArena(nextArena.value);
    setSampleSize(nextArena.recommendedSampleSize);
    setBattle(null);
    setError(null);
    setStatusMessage(null);
  }

  async function runEvaluation() {
    if (!companyId) return;
    setLoading("evaluate");
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/admin/labs/prompt-forge/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          companyId,
          arena,
          sampleSize: stage === "job-structure" ? sampleSize : undefined,
          config: currentDraft,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Evaluation failed");
      }

      setBattle(data);
      setRuns((prev) => [
        {
          id: data.runId,
          stage,
          arena,
          companyId,
          companyName: data.companyName,
          model: currentDraft.model,
          score: data.candidate.score,
          metrics: data.candidate.metrics,
          createdAt: data.runCreatedAt,
        },
        ...prev.filter((run) => run.id !== data.runId),
      ]);
      setStatusMessage(`Battle complete. ${data.candidate.score > data.baseline.score ? "The challenger is winning." : "The live config is still ahead."}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setLoading(null);
    }
  }

  async function saveLiveConfig() {
    setLoading("save");
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/admin/labs/prompt-forge/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: battle?.runId,
          stage,
          benchmarkScore: battle?.candidate.score ?? null,
          config: currentDraft,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setActiveConfigs((prev) => ({
        ...prev,
        [currentKey]: {
          ...currentDraft,
          benchmarkScore: battle?.candidate.score ?? currentDraft.benchmarkScore ?? null,
        },
      }));
      setRuns((prev) =>
        prev.map((run) =>
          run.id === battle?.runId ? { ...run, savedAsActive: true } : run
        )
      );
      setStatusMessage(`Saved ${stageLabel(stage)} live config with model ${data.model}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(null);
    }
  }

  async function triggerReprocess() {
    setLoading("reprocess");
    setError(null);
    setStatusMessage(null);

    try {
      const limit = reprocessLimit.trim() ? Number(reprocessLimit) : undefined;
      const res = await fetch("/api/admin/labs/prompt-forge/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: reprocessScope === "company" ? companyId : undefined,
          activeOnly,
          limit: Number.isFinite(limit) ? limit : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Reprocess failed");
      }

      setStatusMessage(
        `Queued reprocess job for ${data.totalJobs} jobs. Track job run ${data.jobRunId} in the admin job execution history.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reprocess failed");
    } finally {
      setLoading(null);
    }
  }

  async function promoteToCode() {
    if (!battle?.runId) {
      setError("Run a battle first so Prompt Forge has a challenger to promote.");
      return;
    }

    setLoading("promote");
    setError(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/admin/labs/prompt-forge/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: battle.runId,
          stage,
          score: battle.candidate.score,
          metrics: battle.candidate.metrics,
          triggerCodegen,
          config: currentDraft,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Promotion failed");
      }

      setRuns((prev) =>
        prev.map((run) =>
          run.id === battle.runId ? { ...run, promotionIssueUrl: data.issueUrl } : run
        )
      );
      setStatusMessage(
        `${triggerCodegen ? "Promotion launched." : "GitHub issue created."} Review it at ${data.issueUrl}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promotion failed");
    } finally {
      setLoading(null);
    }
  }

  const battleProgress = battle ? battle.candidate.score : challengerScore;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
        <CardContent className="grid gap-6 p-8 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Prompt Forge control room
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight">Ship better prompts like a boss battle.</h2>
              <p className="max-w-2xl text-sm leading-7 text-slate-300">
                Tune live Gemini prompts, spar against the current champion, and deploy the winner straight into production.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Live score</p>
                <p className="mt-2 text-3xl font-semibold">{liveScore}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Challenger</p>
                <p className="mt-2 text-3xl font-semibold">{challengerScore}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Score delta</p>
                <p className={cn("mt-2 text-3xl font-semibold", scoreDelta >= 0 ? "text-growth-500" : "text-destructive")}>
                  {scoreDelta >= 0 ? "+" : ""}
                  {scoreDelta}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-[28px] border border-white/10 bg-black/20 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Battle meter</p>
                <p className="mt-1 text-lg font-semibold">{battle ? battle.companyName : selectedCompany?.name ?? "Pick a company"}</p>
              </div>
              <Trophy className="h-5 w-5 text-accent" />
            </div>
            <Progress value={battleProgress} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs text-slate-400">Arena</p>
                <p className="mt-1 font-medium">{stageArenas.find((option) => option.value === arena)?.label}</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-xs text-slate-400">Model</p>
                <p className="mt-1 font-medium">{currentDraft.model}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {(error || statusMessage) && (
        <Card className={cn(error ? "border-transparent bg-destructive/10" : "border-transparent bg-growth-500/10")}>
          <CardContent className="py-4 text-sm">
            {error ? <p className="text-destructive">{error}</p> : <p className="text-growth-500">{statusMessage}</p>}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="forge" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-2 bg-transparent p-0">
          <TabsTrigger value="forge">Forge</TabsTrigger>
          <TabsTrigger value="arena">Arena</TabsTrigger>
          <TabsTrigger value="scoreboard">Scoreboard</TabsTrigger>
          <TabsTrigger value="replay">Replay</TabsTrigger>
          <TabsTrigger value="ship">Ship Room</TabsTrigger>
        </TabsList>

        <TabsContent value="forge" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Loadout</h3>
                <p className="text-sm text-muted-foreground">Choose the stage, arena, and model for your next run.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant={stage === "job-structure" ? "default" : "outline"}
                    onClick={() => handleStageChange("job-structure")}
                  >
                    Stage 1 extractor
                  </Button>
                  <Button
                    type="button"
                    variant={stage === "tech-stack" ? "default" : "outline"}
                    onClick={() => handleStageChange("tech-stack")}
                  >
                    Stage 2 synthesis
                  </Button>
                  <Button
                    type="button"
                    variant={stage === "weekly-digest" ? "default" : "outline"}
                    onClick={() => handleStageChange("weekly-digest")}
                  >
                    Weekly digest
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Company</label>
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {initialData.companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Arena mode</label>
                  <Select
                    value={arena}
                    onValueChange={(value) => {
                      setArena(value);
                      const nextArena = stageArenas.find((option) => option.value === value);
                      if (nextArena) setSampleSize(nextArena.recommendedSampleSize);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stageArenas.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {stageArenas.find((option) => option.value === arena)?.summary}
                  </p>
                </div>

                {stage === "job-structure" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Sample size</label>
                    <Input
                      value={String(sampleSize)}
                      onChange={(event) => setSampleSize(Number(event.target.value || 1))}
                      type="number"
                      min={1}
                      max={12}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Model</label>
                  <Select value={currentDraft.model} onValueChange={(value) => updateDraft({ model: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {initialData.modelOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {initialData.modelOptions.find((option) => option.value === currentDraft.model)?.summary}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Temperature</label>
                    <Input
                      value={String(currentDraft.temperature)}
                      onChange={(event) => updateDraft({ temperature: Number(event.target.value || 0) })}
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Max output tokens</label>
                    <Input
                      value={String(currentDraft.maxOutputTokens)}
                      onChange={(event) => updateDraft({ maxOutputTokens: Number(event.target.value || 512) })}
                      type="number"
                      min={512}
                      max={64000}
                      step={256}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={runEvaluation} disabled={loading === "evaluate" || !companyId}>
                    {loading === "evaluate" ? "Battling..." : "Run battle"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetDraft}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset to live
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Prompt blade</h3>
                    <p className="text-sm text-muted-foreground">
                      Tune the live prompt directly. Placeholder lint keeps the blade from breaking.
                    </p>
                  </div>
                  <div className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                    {currentDraft.promptTemplate.length.toLocaleString()} chars
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={currentDraft.promptTemplate}
                  onChange={(event) => updateDraft({ promptTemplate: event.target.value })}
                  className="min-h-[420px] font-mono text-xs leading-6"
                />

                <div className="flex flex-wrap gap-2">
                  {PLACEHOLDERS[stage].map((token) => {
                    const missing = placeholderCheck.includes(token);
                    return (
                      <span
                        key={token}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-medium",
                          missing
                            ? "bg-destructive/10 text-destructive"
                            : "bg-growth-500/10 text-growth-500"
                        )}
                      >
                        {missing ? "Missing" : "Ready"} {token}
                      </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="arena" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {stageArenas.map((option) => (
              <Card
                key={option.value}
                className={cn(
                  "border-border/70 transition-colors",
                  option.value === arena && "border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-950"
                )}
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{option.label}</div>
                    <Swords className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">{option.summary}</p>
                  <Button
                    type="button"
                    variant={option.value === arena ? "default" : "outline"}
                    onClick={() => {
                      setArena(option.value);
                      setSampleSize(option.recommendedSampleSize);
                    }}
                  >
                    Equip arena
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Battle brief</h3>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p><strong className="text-foreground">Company:</strong> {selectedCompany?.name ?? "Select one above"}</p>
                <p><strong className="text-foreground">Stage:</strong> {stageLabel(stage)}</p>
                <p><strong className="text-foreground">Model:</strong> {currentDraft.model}</p>
                {stage === "job-structure" && (
                  <p><strong className="text-foreground">Jobs sampled:</strong> {sampleSize}</p>
                )}
                <p><strong className="text-foreground">Goal:</strong> Beat the live score without adding noise.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold">Battle results</h3>
                <p className="text-sm text-muted-foreground">
                  Compare the current live champion against your challenger build.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {!battle ? (
                  <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    Run a battle to unlock the diff view.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Live champion</p>
                        <p className="mt-2 text-3xl font-semibold">{battle.baseline.score}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{battle.baseline.latencyMs} ms</p>
                      </div>
                      <div className="rounded-2xl border bg-slate-950 p-4 text-white">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Challenger</p>
                        <p className="mt-2 text-3xl font-semibold">{battle.candidate.score}</p>
                        <p className="mt-1 text-xs text-slate-400">{battle.candidate.latencyMs} ms</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {battle.stage === "job-structure" ? (
                        (battle.previews as JobPreview[]).map((row) => (
                          <div key={row.jobId} className="rounded-2xl border p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-medium">{row.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Added: {row.added.join(", ") || "none"} | Removed: {row.removed.join(", ") || "none"}
                                </p>
                              </div>
                              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Live</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {row.currentTech.map((tech) => (
                                    <span key={tech} className="rounded-full bg-muted px-2 py-1 text-xs">{tech}</span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Challenger</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {row.candidateTech.map((tech) => (
                                    <span key={tech} className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-900">{tech}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : battle.stage === "tech-stack" ? (
                        (battle.previews as CategoryPreview[]).map((category) => (
                          <div key={category.category} className="rounded-2xl border p-4">
                            <p className="font-medium">{category.label}</p>
                            {category.narrativeSummary && (
                              <p className="mt-2 text-sm text-muted-foreground">{category.narrativeSummary}</p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {category.technologies.map((tech) => (
                                <span key={tech} className="rounded-full bg-muted px-2 py-1 text-xs">{tech}</span>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        (battle.previews as unknown as DigestPreview[]).map((preview, index) => (
                          <div key={index} className="rounded-2xl border p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Digest preview</p>
                            <p className="mt-2 font-medium">{preview.headline}</p>
                            <p className="mt-2 text-sm text-muted-foreground">{preview.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="scoreboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {(battle?.candidate.metrics ?? []).map((metric) => (
              <Card key={metric.id}>
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{metric.label}</p>
                  <p className={cn("mt-2 text-3xl font-semibold", toneClass(metric.tone))}>{metric.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{metric.helper}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Leaderboard</h3>
              <p className="text-sm text-muted-foreground">Recent runs across both stages, sorted by recency.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No battles logged yet.</p>
              ) : (
                runs.slice(0, 8).map((run, index) => (
                  <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                        #{index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{run.companyName}</p>
                        <p className="text-xs text-muted-foreground">
                          {stageLabel(run.stage)} | {run.arena} | {run.model}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xl font-semibold">{run.score}</p>
                        <p className="text-xs text-muted-foreground">{formatRelativeTime(run.createdAt)}</p>
                      </div>
                      {run.savedAsActive && (
                        <span className="rounded-full bg-growth-500/10 px-2.5 py-1 text-xs font-medium text-growth-500">
                          Live
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="replay" className="space-y-4">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Replay vault</h3>
              <p className="text-sm text-muted-foreground">
                Every battle stores the challenger configuration, metrics, and promotion state.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing in the vault yet.</p>
              ) : (
                runs.map((run) => (
                  <div key={run.id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{run.companyName}</p>
                        <p className="text-xs text-muted-foreground">
                          {stageLabel(run.stage)} | {run.model}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{run.score}</span>
                        {run.promotionIssueUrl && (
                          <a
                            href={run.promotionIssueUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"
                          >
                            GitHub issue
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {run.metrics.slice(0, 3).map((metric) => (
                        <div key={metric.id} className="rounded-xl bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">{metric.label}</p>
                          <p className={cn("mt-1 text-lg font-semibold", toneClass(metric.tone))}>{metric.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ship" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-1">
              <CardHeader>
                <h3 className="text-lg font-semibold">Promote to live</h3>
                <p className="text-sm text-muted-foreground">Save the currently equipped prompt and model into runtime settings.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border bg-muted/20 p-4 text-sm">
                  <p><strong>Stage:</strong> {stageLabel(stage)}</p>
                  <p><strong>Model:</strong> {currentDraft.model}</p>
                  <p><strong>Battle score:</strong> {battle?.candidate.score ?? "Not run yet"}</p>
                </div>
                <Button onClick={saveLiveConfig} disabled={loading === "save"}>
                  {loading === "save" ? "Saving..." : "Save as live config"}
                </Button>
              </CardContent>
            </Card>

            {stage === "job-structure" && (
              <Card className="xl:col-span-1">
                <CardHeader>
                  <h3 className="text-lg font-semibold">Silver layer reprocess</h3>
                  <p className="text-sm text-muted-foreground">Re-run Stage 1 across existing job postings, then refresh company tech stacks for the affected companies.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Scope</label>
                    <Select value={reprocessScope} onValueChange={(value: "company" | "all") => setReprocessScope(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company">Selected company only</SelectItem>
                        <SelectItem value="all">All companies</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Limit jobs (optional)</label>
                    <Input
                      value={reprocessLimit}
                      onChange={(event) => setReprocessLimit(event.target.value)}
                      placeholder="Leave blank for full scope"
                      type="number"
                      min={1}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border p-3">
                    <div>
                      <p className="text-sm font-medium">Active jobs only</p>
                      <p className="text-xs text-muted-foreground">Skip closed roles unless you need a full rebuild.</p>
                    </div>
                    <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
                  </div>

                  <Button onClick={triggerReprocess} disabled={loading === "reprocess"}>
                    {loading === "reprocess" ? "Reprocessing..." : "Kick off reprocess"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="xl:col-span-1">
              <CardHeader>
                <h3 className="text-lg font-semibold">Promote to code</h3>
                <p className="text-sm text-muted-foreground">Create a GitHub implementation spec and optionally trigger draft code generation.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-2xl border p-3">
                  <div>
                    <p className="text-sm font-medium">Trigger codegen workflow</p>
                    <p className="text-xs text-muted-foreground">Uses the same GitHub workflow chain as admin feedback implementation.</p>
                  </div>
                  <Switch checked={triggerCodegen} onCheckedChange={setTriggerCodegen} />
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4 text-sm">
                  <p><strong>Run:</strong> {battle?.runId ?? "Run a battle first"}</p>
                  <p><strong>Score:</strong> {battle?.candidate.score ?? "-"}</p>
                </div>

                <Button onClick={promoteToCode} disabled={loading === "promote"}>
                  <Rocket className="mr-2 h-4 w-4" />
                  {loading === "promote" ? "Promoting..." : "Create implementation spec"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
