export { analyzeJob, type AnalyzeResult } from "./strategic";
export { 
  analyzeJobAdvanced, 
  analyzeJobsAdvanced,
  type AdvancedAnalyzeResult,
  type AnalyzeJobOptions 
} from "./advanced-strategic";
export {
  categorizePosting,
  quickCategorize,
  ROLE_CATEGORIES,
  type JobCategoryResult,
  type RoleCategory,
  type ExtractedSections
} from "./categorizer";
export {
  buildHistoricalContext,
  buildExtendedHistoricalContext,
  detectHiringTrends,
  getRecentExecutiveHires,
  getDepartmentBreakdown,
  formatHistoricalContextForPrompt,
  formatExtendedContextForPrompt,
  type HistoricalContext,
  type ExtendedHistoricalContext,
  type HiringTrend,
  type ExecutiveHire,
  type DepartmentStats,
  type FunctionStats,
  type FunctionTrend,
  type GroupStats,
} from "./context-builder";
export {
  ROLE_CATEGORIES as FUNCTION_CATEGORIES,
  quickCategorize as quickCategorizeFunction,
  getCategoryGroup,
  getCategoryLabel,
  categorizeJobs,
  getGroupStats,
  CATEGORY_GROUPS,
} from "./function-categories";
export {
  detectCompanyType,
  performDeepResearch,
  formatResearchForPrompt,
  type CompanyType,
  type ResearchResult,
  type VerifiedSource,
  type FinancialContext,
  type DeepResearchOptions,
} from "./company-research";
export {
  generateCompanyInsight,
  getCompanyInsight,
  getCompanyInsights,
  getNextCompanyForInsight,
  type CompanyInsight,
  type GenerateCompanyInsightOptions,
  type FunctionChange,
  type Discrepancy,
  type AlignmentAnalysis,
} from "./company-insights";
