"""Job categorization for template library."""

import json
import logging
import os
import re
from typing import Dict, Any, Optional, List
from dataclasses import dataclass

import google.generativeai as genai

logger = logging.getLogger(__name__)


@dataclass
class JobCategoryResult:
    """Result of job categorization."""
    role_category: str
    extracted_sections: Dict[str, Any]
    quality_score: int  # 1-5

    def to_dict(self) -> Dict[str, Any]:
        return {
            "role_category": self.role_category,
            "extracted_sections": json.dumps(self.extracted_sections),
            "quality_score": self.quality_score,
        }


class JobCategorizer:
    """Categorize job postings and extract template sections."""

    # Common role categories in fintech
    ROLE_CATEGORIES = [
        "engineering-backend",
        "engineering-frontend",
        "engineering-fullstack",
        "engineering-mobile",
        "engineering-data",
        "engineering-ml",
        "engineering-devops",
        "engineering-security",
        "engineering-qa",
        "product-management",
        "product-design",
        "product-research",
        "marketing-growth",
        "marketing-product",
        "marketing-content",
        "marketing-brand",
        "sales",
        "customer-success",
        "customer-support",
        "operations",
        "finance",
        "legal-compliance",
        "hr-people",
        "data-analytics",
        "risk",
        "leadership",
        "other"
    ]

    CATEGORIZATION_PROMPT = """Analyze this job posting and categorize it for a job template library.

Job Title: {job_title}
Company: {company_name}
Description:
{description}

Provide analysis in JSON format:
{{
    "role_category": "<category from: {categories}>",
    "extracted_sections": {{
        "summary": "<1-2 sentence role summary>",
        "responsibilities": ["<responsibility 1>", "<responsibility 2>", ...],
        "requirements": ["<requirement 1>", "<requirement 2>", ...],
        "nice_to_have": ["<nice to have 1>", ...],
        "benefits": ["<benefit 1>", ...]
    }},
    "quality_score": <1-5 rating of how well-written this posting is>
}}

Quality scoring guide:
5 = Excellent: Clear, comprehensive, well-structured
4 = Good: Most sections present, clear language
3 = Average: Basic information, some gaps
2 = Below average: Vague or missing key sections
1 = Poor: Minimal useful information

Respond ONLY with valid JSON."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.0-flash"):
        """Initialize the categorizer with Gemini API."""
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment")

        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(model)

    def categorize_posting(
        self,
        job_title: str,
        company_name: str,
        description: str
    ) -> Optional[JobCategoryResult]:
        """Categorize a job posting and extract template sections."""
        try:
            prompt = self.CATEGORIZATION_PROMPT.format(
                job_title=job_title,
                company_name=company_name,
                description=description[:5000] if description else "No description",
                categories=", ".join(self.ROLE_CATEGORIES)
            )

            response = self.model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=1500,
                )
            )

            response_text = response.text.strip()

            # Handle markdown code blocks
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1])

            result = json.loads(response_text)

            return JobCategoryResult(
                role_category=result.get("role_category", "other"),
                extracted_sections=result.get("extracted_sections", {}),
                quality_score=result.get("quality_score", 3)
            )

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse categorization response: {e}")
            return None
        except Exception as e:
            logger.error(f"Error categorizing posting '{job_title}': {e}")
            return None

    def quick_categorize(self, job_title: str) -> str:
        """Quick categorization based on job title alone (no API call)."""
        title_lower = job_title.lower()

        # Engineering categories
        if any(w in title_lower for w in ["backend", "server", "api"]):
            return "engineering-backend"
        if any(w in title_lower for w in ["frontend", "front-end", "ui ", "react", "vue", "angular"]):
            return "engineering-frontend"
        if any(w in title_lower for w in ["full stack", "fullstack", "full-stack"]):
            return "engineering-fullstack"
        if any(w in title_lower for w in ["mobile", "ios", "android", "swift", "kotlin"]):
            return "engineering-mobile"
        if any(w in title_lower for w in ["data engineer", "etl", "pipeline"]):
            return "engineering-data"
        if any(w in title_lower for w in ["machine learning", "ml ", "ai ", "deep learning"]):
            return "engineering-ml"
        if any(w in title_lower for w in ["devops", "sre", "infrastructure", "platform", "cloud"]):
            return "engineering-devops"
        if any(w in title_lower for w in ["security", "infosec", "cybersecurity"]):
            return "engineering-security"
        if any(w in title_lower for w in ["qa ", "quality", "test engineer", "sdet"]):
            return "engineering-qa"
        if any(w in title_lower for w in ["software", "engineer", "developer"]) and not any(w in title_lower for w in ["data", "ml", "ai"]):
            return "engineering-fullstack"

        # Product categories
        if any(w in title_lower for w in ["product manager", "product lead", "pm ", "product owner"]):
            return "product-management"
        if any(w in title_lower for w in ["product design", "ux ", "ui/ux", "user experience"]):
            return "product-design"
        if any(w in title_lower for w in ["user research", "ux research"]):
            return "product-research"

        # Marketing categories
        if any(w in title_lower for w in ["growth", "acquisition", "performance marketing"]):
            return "marketing-growth"
        if any(w in title_lower for w in ["product market", "pmm"]):
            return "marketing-product"
        if any(w in title_lower for w in ["content", "copywriter", "editorial"]):
            return "marketing-content"
        if any(w in title_lower for w in ["brand", "creative"]):
            return "marketing-brand"
        if "marketing" in title_lower:
            return "marketing-growth"

        # Other categories
        if any(w in title_lower for w in ["sales", "account executive", "business development", "bdm"]):
            return "sales"
        if any(w in title_lower for w in ["customer success", "csm"]):
            return "customer-success"
        if any(w in title_lower for w in ["support", "customer service"]):
            return "customer-support"
        if any(w in title_lower for w in ["operations", "ops "]):
            return "operations"
        if any(w in title_lower for w in ["finance", "accounting", "controller"]):
            return "finance"
        if any(w in title_lower for w in ["legal", "compliance", "regulatory"]):
            return "legal-compliance"
        if any(w in title_lower for w in ["hr ", "people", "recruiter", "talent"]):
            return "hr-people"
        if any(w in title_lower for w in ["analyst", "analytics", "data scientist", "bi "]):
            return "data-analytics"
        if any(w in title_lower for w in ["risk", "fraud"]):
            return "risk"
        if any(w in title_lower for w in ["vp ", "director", "head of", "chief", "cto", "cfo", "ceo"]):
            return "leadership"

        return "other"

    def get_templates_by_category(
        self,
        postings: List[Dict[str, Any]],
        category: str,
        top_n: int = 5
    ) -> List[Dict[str, Any]]:
        """Get the top N templates for a given category, sorted by quality score."""
        matching = [p for p in postings if p.get("role_category") == category]
        sorted_postings = sorted(
            matching,
            key=lambda x: x.get("quality_score", 0),
            reverse=True
        )
        return sorted_postings[:top_n]
