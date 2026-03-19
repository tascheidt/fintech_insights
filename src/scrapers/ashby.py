"""Ashby HQ ATS scraper."""

import requests
from datetime import datetime
from typing import List, Optional
import logging

from .base import BaseScraper, JobData


logger = logging.getLogger(__name__)


class AshbyScraper(BaseScraper):
    """Scraper for Ashby HQ job boards via their public posting API."""

    BASE_URL = "https://api.ashbyhq.com/posting-api/job-board"

    def __init__(self, company_slug: str, company_name: str):
        super().__init__(company_name)
        self.company_slug = company_slug
        self.api_url = f"{self.BASE_URL}/{company_slug}"

    def fetch_jobs(self) -> List[JobData]:
        """Fetch all job postings from Ashby."""
        try:
            response = requests.get(self.api_url, timeout=30)
            response.raise_for_status()
            data = response.json()

            jobs = []
            for job in data.get("jobs", []):
                job_data = self._parse_job(job)
                if job_data:
                    jobs.append(job_data)

            self.log_fetch_result(len(jobs))
            return jobs

        except requests.RequestException as e:
            logger.error(f"[{self.company_name}] Error fetching from Ashby: {e}")
            return []

    def _parse_job(self, job: dict) -> Optional[JobData]:
        """Parse a single job posting from Ashby API response."""
        try:
            location = job.get("location") or ""
            description_html = job.get("descriptionHtml") or ""

            # Determine location type
            if job.get("isRemote"):
                location_type = "remote"
            else:
                location_type = self.detect_location_type(location, description_html)

            # Normalize commitment from employmentType
            commitment = self.normalize_commitment(job.get("employmentType") or "")
            title_lower = (job.get("title") or "").lower()
            if "intern" in title_lower:
                commitment = "internship"
            elif "contract" in title_lower:
                commitment = "contract"
            elif "part-time" in title_lower or "part time" in title_lower:
                commitment = "part-time"

            # Parse published date
            posted_date = None
            published_at = job.get("publishedAt")
            if published_at:
                try:
                    posted_date = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            return JobData(
                external_id=job.get("id", ""),
                title=job.get("title", ""),
                department=job.get("department") or None,
                team=job.get("team") or None,
                location=location or None,
                location_type=location_type,
                description_html=description_html or None,
                description_text=self.html_to_text(description_html),
                commitment=commitment or "full-time",
                posted_date=posted_date,
                url=job.get("jobUrl") or job.get("applicationUrl") or None,
                raw_data=job,
            )

        except Exception as e:
            logger.error(f"[{self.company_name}] Error parsing Ashby job: {e}")
            return None
