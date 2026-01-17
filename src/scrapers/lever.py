"""Lever ATS scraper for companies like Wealthsimple, Koho, Neo Financial."""

import requests
from datetime import datetime
from typing import List, Optional
import logging

from .base import BaseScraper, JobData


logger = logging.getLogger(__name__)


class LeverScraper(BaseScraper):
    """Scraper for Lever ATS job boards."""

    BASE_URL = "https://api.lever.co/v0/postings"

    def __init__(self, company_slug: str, company_name: str):
        super().__init__(company_name)
        self.company_slug = company_slug
        self.api_url = f"{self.BASE_URL}/{company_slug}"

    def fetch_jobs(self) -> List[JobData]:
        """Fetch all job postings from Lever."""
        try:
            response = requests.get(
                self.api_url,
                params={"mode": "json"},
                timeout=30
            )
            response.raise_for_status()
            jobs_data = response.json()

            jobs = []
            for job in jobs_data:
                job_data = self._parse_job(job)
                if job_data:
                    jobs.append(job_data)

            self.log_fetch_result(len(jobs))
            return jobs

        except requests.RequestException as e:
            logger.error(f"[{self.company_name}] Error fetching from Lever: {e}")
            return []

    def _parse_job(self, job: dict) -> Optional[JobData]:
        """Parse a single job posting from Lever API response."""
        try:
            # Extract location
            location = job.get("categories", {}).get("location", "")
            if isinstance(location, list):
                location = ", ".join(location) if location else ""

            # Extract department/team
            department = job.get("categories", {}).get("department", "")
            team = job.get("categories", {}).get("team", "")

            # Get commitment type
            commitment = job.get("categories", {}).get("commitment", "")

            # Build description from lists
            description_html = job.get("descriptionPlain", "") or ""

            # Include lists (responsibilities, requirements, etc.)
            lists = job.get("lists", [])
            for lst in lists:
                list_name = lst.get("text", "")
                list_content = lst.get("content", "")
                if list_name and list_content:
                    description_html += f"\n\n## {list_name}\n{list_content}"

            # Additional description
            additional = job.get("additional", "")
            if additional:
                description_html += f"\n\n{additional}"

            # Parse posted date
            posted_date = None
            created_at = job.get("createdAt")
            if created_at:
                try:
                    posted_date = datetime.fromtimestamp(created_at / 1000)
                except (ValueError, TypeError):
                    pass

            return JobData(
                external_id=job.get("id", ""),
                title=job.get("text", ""),
                department=department,
                team=team,
                location=location,
                location_type=self.detect_location_type(location, description_html),
                description_html=description_html,
                description_text=self.html_to_text(description_html),
                commitment=self.normalize_commitment(commitment),
                posted_date=posted_date,
                url=job.get("hostedUrl", "") or job.get("applyUrl", ""),
                raw_data=job
            )

        except Exception as e:
            logger.error(f"[{self.company_name}] Error parsing job: {e}")
            return None
