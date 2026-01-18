export { analyzeJob, type AnalyzeResult } from "./strategic";
export { 
  analyzeJobAdvanced, 
  analyzeJobsAdvanced,
  type AdvancedAnalyzeResult,
  type AnalyzeJobOptions 
} from "./advanced-strategic";
export {
  buildHistoricalContext,
  detectHiringTrends,
  getRecentExecutiveHires,
  getDepartmentBreakdown,
  formatHistoricalContextForPrompt,
  type HistoricalContext,
  type HiringTrend,
  type ExecutiveHire,
  type DepartmentStats,
} from "./context-builder";
