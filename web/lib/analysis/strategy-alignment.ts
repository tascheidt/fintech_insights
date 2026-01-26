/**
 * Strategy Alignment Analysis
 * 
 * Compares company hiring patterns to their stated strategy to identify
 * alignment, divergence, or new directions. This is the key differentiator
 * for the weekly digest.
 */

import { CompanyJobData } from "./digest";
import { CompanyNewsContext } from "./company-news";

export interface StrategyAlignment {
  companyName: string;
  alignment: "aligned" | "divergent" | "new_direction" | "unknown";
  statedStrategy: string;         // What they say they're doing
  hiringSignal: string;           // What hiring tells us
  interpretation: string;         // What this means
  confidenceLevel: "high" | "medium" | "low";
}

/**
 * Analyze strategy alignment for a single company
 */
export async function analyzeStrategyAlignment(
  companyData: CompanyJobData,
  newsContext: CompanyNewsContext
): Promise<StrategyAlignment> {
  // If no stated strategy found, return unknown
  if (!newsContext.statedStrategy) {
    return {
      companyName: companyData.company_name,
      alignment: "unknown",
      statedStrategy: "No publicly stated strategy found",
      hiringSignal: `${companyData.jobs.length} new jobs posted`,
      interpretation: "Insufficient public information to compare hiring to strategy",
      confidenceLevel: "low",
    };
  }

  // Analyze hiring patterns
  const departments = companyData.jobs
    .map(j => j.standardized_department)
    .filter(Boolean);
  const topDepartment = departments.reduce((acc, dept) => {
    acc[dept] = (acc[dept] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topDept = Object.entries(topDepartment)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "Various";
  
  const techStack = companyData.jobs
    .flatMap(j => j.tech_stack)
    .filter(Boolean);
  const topTech = techStack.reduce((acc, tech) => {
    acc[tech] = (acc[tech] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topTechStack = Object.entries(topTech)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tech]) => tech)
    .join(", ") || "Various";

  const hiringSignal = `${companyData.jobs.length} new jobs, primarily ${topDept} roles${topTechStack !== "Various" ? ` using ${topTechStack}` : ""}`;

  // Simple keyword matching to determine alignment
  // In production, this would use LLM for better analysis
  const strategyLower = newsContext.statedStrategy.toLowerCase();
  const deptLower = topDept.toLowerCase();
  
  // Check for alignment keywords
  const alignedKeywords = [
    "ai", "machine learning", "ml", "artificial intelligence",
    "compliance", "regulatory", "risk",
    "product", "engineering", "development",
    "sales", "revenue", "growth",
    "customer", "user experience", "ux",
  ];
  
  let alignment: StrategyAlignment["alignment"] = "unknown";
  let interpretation = "";
  let confidence: StrategyAlignment["confidenceLevel"] = "medium";
  
  // Check if hiring matches stated strategy
  const strategyMatchesDept = alignedKeywords.some(keyword => 
    strategyLower.includes(keyword) && deptLower.includes(keyword)
  );
  
  if (strategyMatchesDept) {
    alignment = "aligned";
    interpretation = `Hiring in ${topDept} aligns with stated ${newsContext.statedStrategy.substring(0, 50)}... strategy`;
    confidence = "high";
  } else if (companyData.jobs.length > 5 && !strategyMatchesDept) {
    // Significant hiring that doesn't match strategy suggests divergence or new direction
    alignment = "divergent";
    interpretation = `Hiring focuses on ${topDept} but stated strategy emphasizes different areas. May signal shift or preparation for new initiatives.`;
    confidence = "medium";
  } else if (companyData.jobs.length > 0 && !newsContext.statedStrategy.includes(topDept)) {
    // New hiring in areas not mentioned in strategy
    alignment = "new_direction";
    interpretation = `Hiring in ${topDept} suggests new strategic direction not yet publicly announced`;
    confidence = "medium";
  } else {
    alignment = "unknown";
    interpretation = "Unable to determine alignment from available information";
    confidence = "low";
  }

  return {
    companyName: companyData.company_name,
    alignment,
    statedStrategy: newsContext.statedStrategy,
    hiringSignal,
    interpretation,
    confidenceLevel: confidence,
  };
}
