"""Workable ATS scraper for companies like Starling Bank."""

import requests
from datetime import datetime
from typing import List, Optional
import logging

from .base import BaseScraper, JobData


logger = logging.getLogger(__name__)


class WorkableScraper(BaseScraper):
    """Scraper for Workable ATS job boards."""

    BASE_URL = "https://apply.workable.com/api/v3/accounts"

    def __init__(self, company_slug: str, company_name: str):
        super().__init__(company_name)
        self.company_slug = company_slug
        self.jobs_url = f"{self.BASE_URL}/{company_slug}/jobs"

    def fetch_jobs(self) -> List[JobData]:
        """Fetch all job postings from Workable."""
        try:
            all_jobs = []
            has_more = True
            token = None

            while has_more:
                payload = {"query": "", "location": [], "department": [], "worktype": []}
                if token:
                    payload["token"] = token

                response = requests.post(
                    self.jobs_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=30
                )
                response.raise_for_status()
                data = response.json()

                results = data.get("results", [])
                for job in results:
                    job_data = self._parse_job(job)
                    if job_data:
                        all_jobs.append(job_data)

                # Check for pagination
                paging = data.get("paging", {})
                token = paging.get("next")
                has_more = token is not None

            self.log_fetch_result(len(all_jobs))
            return all_jobs

        except requests.RequestException as e:
            logger.error(f"[{self.company_name}] Error fetching from Workable: {e}")
            return []

    def _parse_job(self, job: dict) -> Optional[JobData]:
        """Parse a single job posting from Workable API response."""
        try:
            # Extract location
            location = job.get("location", {})
            if isinstance(location, dict):
                location_parts = []
                if location.get("city"):
                    location_parts.append(location["city"])
                if location.get("country"):
                    location_parts.append(location["country"])
                location = ", ".join(location_parts) if location_parts else ""
            else:
                location = str(location) if location else ""

            # Work type (remote, hybrid, on-site)
            worktype = job.get("worktype", "")
            location_type = self._map_worktype(worktype)

            # Department
            department = job.get("department", "")
            if isinstance(department, list):
                department = department[0] if department else ""

            # Description - need to fetch full job details
            description_html = job.get("description", "")
            shortcode = job.get("shortcode", "")

            # Get full details if we have a shortcode
            if shortcode and not description_html:
                description_html = self._fetch_job_details(shortcode)

            # Parse posted date
            posted_date = None
            published_on = job.get("published_on")
            if published_on:
                try:
                    posted_date = datetime.fromisoformat(published_on.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass

            # Build URL
            url = f"https://apply.workable.com/{self.company_slug}/j/{shortcode}/" if shortcode else ""

            return JobData(
                external_id=shortcode or job.get("id", ""),
                title=job.get("title", ""),
                department=department,
                team=None,
                location=location,
                location_type=location_type,
                description_html=description_html,
                description_text=self.html_to_text(description_html),
                commitment=self._extract_employment_type(job),
                posted_date=posted_date,
                url=url,
                raw_data=job
            )

        except Exception as e:
            logger.error(f"[{self.company_name}] Error parsing job: {e}")
            return None

    def _fetch_job_details(self, shortcode: str) -> str:
        """Fetch full job details including description."""
        try:
            url = f"{self.BASE_URL}/{self.company_slug}/jobs/{shortcode}"
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            data = response.json()
            return data.get("description", "")
        except Exception as e:
            logger.warning(f"[{self.company_name}] Could not fetch details for {shortcode}: {e}")
            return ""

    def _map_worktype(self, worktype: str) -> Optional[str]:
        """Map Workable work type to standard location type."""
        if not worktype:
            return None
        worktype = worktype.lower()
        if "remote" in worktype:
            return "remote"
        elif "hybrid" in worktype:
            return "hybrid"
        elif "on-site" in worktype or "onsite" in worktype:
            return "onsite"
        return None

    def _extract_employment_type(self, job: dict) -> Optional[str]:
        """Extract employment type from job data."""
        employment_type = job.get("employment_type", "")
        if employment_type:
            return self.normalize_commitment(employment_type)

        # Check title
        title = job.get("title", "").lower()
        if "intern" in title:
            return "internship"
        elif "contract" in title:
            return "contract"

        return "full-time"
