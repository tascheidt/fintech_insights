"""Greenhouse ATS scraper for companies like Monzo, Revolut."""

import requests
from datetime import datetime
from typing import List, Optional
import logging

from .base import BaseScraper, JobData


logger = logging.getLogger(__name__)


class GreenhouseScraper(BaseScraper):
    """Scraper for Greenhouse ATS job boards."""

    BASE_URL = "https://boards-api.greenhouse.io/v1/boards"

    def __init__(self, company_slug: str, company_name: str):
        super().__init__(company_name)
        self.company_slug = company_slug
        self.jobs_url = f"{self.BASE_URL}/{company_slug}/jobs"

    def fetch_jobs(self) -> List[JobData]:
        """Fetch all job postings from Greenhouse."""
        try:
            # First, get the list of all jobs
            response = requests.get(
                self.jobs_url,
                params={"content": "true"},  # Include job content
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            jobs_list = data.get("jobs", [])

            jobs = []
            for job in jobs_list:
                job_data = self._parse_job(job)
                if job_data:
                    jobs.append(job_data)

            self.log_fetch_result(len(jobs))
            return jobs

        except requests.RequestException as e:
            logger.error(f"[{self.company_name}] Error fetching from Greenhouse: {e}")
            return []

    def _parse_job(self, job: dict) -> Optional[JobData]:
        """Parse a single job posting from Greenhouse API response."""
        try:
            # Extract location
            location_data = job.get("location", {})
            location = location_data.get("name", "") if isinstance(location_data, dict) else str(location_data)

            # Extract departments
            departments = job.get("departments") or []
            department = departments[0].get("name", "") if departments else ""

            # Get offices for additional location context
            offices = job.get("offices") or []
            if offices and not location:
                location = offices[0].get("name", "")

            # Get description content
            description_html = job.get("content", "")

            # Parse posted date
            posted_date = None
            updated_at = job.get("updated_at")
            if updated_at:
                try:
                    posted_date = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            # Construct URL
            job_id = job.get("id", "")
            url = job.get("absolute_url", "")

            return JobData(
                external_id=str(job_id),
                title=job.get("title", ""),
                department=department,
                team=None,  # Greenhouse doesn't have a separate team field
                location=location,
                location_type=self.detect_location_type(location, description_html),
                description_html=description_html,
                description_text=self.html_to_text(description_html),
                commitment=self._extract_commitment(job),
                posted_date=posted_date,
                url=url,
                raw_data=job
            )

        except Exception as e:
            logger.error(f"[{self.company_name}] Error parsing job: {e}")
            return None

    def _extract_commitment(self, job: dict) -> Optional[str]:
        """Extract commitment type from job metadata."""
        # Greenhouse often includes this in metadata or custom fields
        metadata = job.get("metadata") or []
        for meta in metadata:
            if meta and meta.get("name", "").lower() in ["employment type", "commitment", "type"]:
                return self.normalize_commitment(meta.get("value", ""))

        # Check title for hints
        title = job.get("title", "").lower()
        if "intern" in title:
            return "internship"
        elif "contract" in title:
            return "contract"
        elif "part-time" in title or "part time" in title:
            return "part-time"

        return "full-time"  # Default assumption
