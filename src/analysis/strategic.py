"""Strategic analysis of job postings using Gemini AI."""

import json
import logging
import os
from typing import Dict, Any, Optional, List
from dataclasses import dataclass

import google.generativeai as genai

logger = logging.getLogger(__name__)


@dataclass
class StrategicInsightResult:
    """Result of strategic analysis."""
    category: str
    insight_summary: str
    strategic_signals: List[str]
    is_new_direction: bool
    confidence: str  # high, medium, low

    def to_dict(self) -> Dict[str, Any]:
        return {
            "category": self.category,
            "insight_summary": self.insight_summary,
            "strategic_signals": json.dumps(self.strategic_signals),
            "is_new_direction": self.is_new_direction,
            "confidence": self.confidence,
        }


class StrategicAnalyzer:
    """Analyze job postings for strategic intelligence using Gemini."""

    STRATEGIC_CATEGORIES = [
        "expansion",  # Geographic or market expansion
        "new-product",  # New product development
        "technology",  # Tech stack or platform changes
        "operational",  # Scaling operations
        "compliance",  # Regulatory/compliance focus
        "customer",  # Customer experience/support
        "data",  # Data/analytics focus
        "marketing",  # Go-to-market activities
        "leadership",  # Executive/leadership hires
        "other",  # Doesn't fit other categories
    ]

    ANALYSIS_PROMPT = """You are a competitive intelligence analyst specializing in the fintech industry.
Analyze the following job posting and identify strategic signals.

Company: {company_name}
Job Title: {job_title}
Department: {department}
Location: {location}
Job Description:
{description}

Based on this job posting, provide analysis in the following JSON format:
{{
    "category": "<one of: expansion, new-product, technology, operational, compliance, customer, data, marketing, leadership, other>",
    "insight_summary": "<2-3 sentence summary of what this hire signals about company strategy>",
    "strategic_signals": ["<signal 1>", "<signal 2>", "<signal 3>"],
    "is_new_direction": <true/false - is this a new strategic direction or continuation of existing strategy>,
    "confidence": "<high/medium/low - how confident are you in this analysis>"
}}

Strategic signals to look for:
- New market entry (hiring in new locations)
- New product development (specific domain expertise, new tech stacks)
- Scaling operations (multiple similar roles, operations/support)
- Regulatory preparation (compliance, legal, risk roles)
- Technology shifts (new languages, platforms, infrastructure)
- Customer focus (CX, support, success roles)
- Data capabilities (analytics, ML/AI, data engineering)

Respond ONLY with valid JSON, no other text."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.0-flash"):
        """Initialize the analyzer with Gemini API."""
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(model)
        self.model_name = model

    def analyze_posting(
        self,
        company_name: str,
        job_title: str,
        department: Optional[str],
        location: Optional[str],
        description: str
    ) -> Optional[StrategicInsightResult]:
        """Analyze a single job posting for strategic insights."""
        try:
            prompt = self.ANALYSIS_PROMPT.format(
                company_name=company_name,
                job_title=job_title,
                department=department or "Not specified",
                location=location or "Not specified",
                description=description[:5000] if description else "No description available"
            )

            response = self.model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=1024,
                )
            )

            # Parse the JSON response
            response_text = response.text.strip()

            # Handle markdown code blocks
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1])

            result = json.loads(response_text)

            return StrategicInsightResult(
                category=result.get("category", "other"),
                insight_summary=result.get("insight_summary", ""),
                strategic_signals=result.get("strategic_signals", []),
                is_new_direction=result.get("is_new_direction", False),
                confidence=result.get("confidence", "medium")
            )

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response as JSON: {e}")
            logger.debug(f"Response was: {response.text if 'response' in dir() else 'N/A'}")
            return None
        except Exception as e:
            logger.error(f"Error analyzing posting '{job_title}': {e}")
            return None

    def analyze_batch(
        self,
        postings: List[Dict[str, Any]],
        company_name: str
    ) -> List[tuple[int, StrategicInsightResult]]:
        """Analyze a batch of job postings.

        Args:
            postings: List of dicts with keys: id, title, department, location, description_text

        Returns:
            List of (posting_id, result) tuples for successful analyses
        """
        results = []
        for posting in postings:
            result = self.analyze_posting(
                company_name=company_name,
                job_title=posting.get("title", ""),
                department=posting.get("department"),
                location=posting.get("location"),
                description=posting.get("description_text", "")
            )
            if result:
                results.append((posting["id"], result))
                logger.info(f"Analyzed: {posting.get('title')} -> {result.category}")

        return results

    def generate_trend_summary(
        self,
        company_name: str,
        recent_postings: List[Dict[str, Any]],
        historical_context: Optional[str] = None
    ) -> Optional[str]:
        """Generate a summary of hiring trends for a company."""
        if not recent_postings:
            return None

        prompt = f"""Analyze the hiring trends for {company_name} based on their recent job postings.

Recent postings (last 30 days):
"""
        for posting in recent_postings[:20]:  # Limit to 20 most recent
            prompt += f"- {posting.get('title', 'Unknown')} ({posting.get('department', 'N/A')})\n"

        if historical_context:
            prompt += f"\nHistorical context:\n{historical_context}\n"

        prompt += """
Provide a brief (3-5 sentences) analysis of:
1. What areas the company appears to be investing in
2. Any notable shifts in hiring focus
3. What this might signal about their strategy

Keep the analysis concise and actionable."""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.4,
                    max_output_tokens=500,
                )
            )
            return response.text.strip()

        except Exception as e:
            logger.error(f"Error generating trend summary for {company_name}: {e}")
            return None
