"""Custom scrapers for companies without standard ATS APIs."""

import requests
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List, Optional
import logging
import re
import json

from .base import BaseScraper, JobData


logger = logging.getLogger(__name__)


class QuestradeScraper(BaseScraper):
    """Scraper for Questrade careers page."""

    CAREERS_URL = "https://www.questrade.com/about-us/careers"
    # Questrade uses Workday - let's try their API
    WORKDAY_URL = "https://questrade.wd3.myworkdayjobs.com/wday/cxs/questrade/Questrade/jobs"

    def __init__(self, company_name: str):
        super().__init__(company_name)

    def fetch_jobs(self) -> List[JobData]:
        """Fetch all job postings from Questrade."""
        try:
            # Try Workday API first
            jobs = self._fetch_from_workday()
            if jobs:
                self.log_fetch_result(len(jobs))
                return jobs

            # Fallback to HTML scraping
            logger.info(f"[{self.company_name}] Falling back to HTML scraping")
            return self._fetch_from_html()

        except Exception as e:
            logger.error(f"[{self.company_name}] Error fetching jobs: {e}")
            return []

    def _fetch_from_workday(self) -> List[JobData]:
        """Fetch jobs from Workday API."""
        try:
            all_jobs = []
            offset = 0
            limit = 20

            while True:
                payload = {
                    "appliedFacets": {},
                    "limit": limit,
                    "offset": offset,
                    "searchText": ""
                }

                response = requests.post(
                    self.WORKDAY_URL,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    timeout=30
                )

                if response.status_code != 200:
                    break

                data = response.json()
                job_postings = data.get("jobPostings", [])

                if not job_postings:
                    break

                for job in job_postings:
                    job_data = self._parse_workday_job(job)
                    if job_data:
                        all_jobs.append(job_data)

                total = data.get("total", 0)
                offset += limit
                if offset >= total:
                    break

            return all_jobs

        except Exception as e:
            logger.warning(f"[{self.company_name}] Workday API failed: {e}")
            return []

    def _parse_workday_job(self, job: dict) -> Optional[JobData]:
        """Parse a Workday job posting."""
        try:
            external_id = job.get("bulletFields", [""])[0] if job.get("bulletFields") else ""
            if not external_id:
                external_id = job.get("externalPath", "").split("/")[-1]

            title = job.get("title", "")
            location = job.get("locationsText", "")

            # Get posted date from bullet fields
            posted_date = None
            bullet_fields = job.get("bulletFields", [])
            for field in bullet_fields:
                if "posted" in field.lower():
                    # Try to parse date
                    date_match = re.search(r"(\w+ \d+, \d{4})", field)
                    if date_match:
                        try:
                            posted_date = datetime.strptime(date_match.group(1), "%B %d, %Y")
                        except ValueError:
                            pass

            # Build URL
            external_path = job.get("externalPath", "")
            url = f"https://questrade.wd3.myworkdayjobs.com/Questrade{external_path}" if external_path else ""

            return JobData(
                external_id=external_id or title,
                title=title,
                department=None,
                team=None,
                location=location,
                location_type=self.detect_location_type(location, ""),
                description_html=None,  # Would need to fetch individually
                description_text=None,
                commitment="full-time",
                posted_date=posted_date,
                url=url,
                raw_data=job
            )

        except Exception as e:
            logger.error(f"[{self.company_name}] Error parsing Workday job: {e}")
            return None

    def _fetch_from_html(self) -> List[JobData]:
        """Fallback HTML scraping."""
        try:
            response = requests.get(self.CAREERS_URL, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "lxml")

            jobs = []
            # Look for job listings - structure may vary
            job_links = soup.find_all("a", href=re.compile(r"jobs|careers|position"))

            for link in job_links:
                title = link.get_text(strip=True)
                href = link.get("href", "")
                if title and len(title) > 5:  # Filter out navigation links
                    jobs.append(JobData(
                        external_id=href or title,
                        title=title,
                        url=href if href.startswith("http") else f"https://www.questrade.com{href}"
                    ))

            self.log_fetch_result(len(jobs))
            return jobs

        except Exception as e:
            logger.error(f"[{self.company_name}] HTML scraping failed: {e}")
            return []


class TangerineScraper(BaseScraper):
    """Scraper for Tangerine (Scotiabank) careers."""

    # Tangerine jobs are on Scotiabank's career site
    WORKDAY_URL = "https://scotiabank.wd3.myworkdayjobs.com/wday/cxs/scotiabank/scotiabankcareers/jobs"

    def __init__(self, company_name: str):
        super().__init__(company_name)

    def fetch_jobs(self) -> List[JobData]:
        """Fetch Tangerine-related job postings from Scotiabank careers."""
        try:
            all_jobs = []
            offset = 0
            limit = 20

            while True:
                payload = {
                    "appliedFacets": {},
                    "limit": limit,
                    "offset": offset,
                    "searchText": "Tangerine"  # Filter for Tangerine jobs
                }

                response = requests.post(
                    self.WORKDAY_URL,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    timeout=30
                )

                if response.status_code != 200:
                    logger.warning(f"[{self.company_name}] Workday API returned {response.status_code}")
                    break

                data = response.json()
                job_postings = data.get("jobPostings", [])

                if not job_postings:
                    break

                for job in job_postings:
                    # Only include jobs with "Tangerine" in title or description
                    title = job.get("title", "").lower()
                    if "tangerine" in title:
                        job_data = self._parse_workday_job(job)
                        if job_data:
                            all_jobs.append(job_data)

                total = data.get("total", 0)
                offset += limit
                if offset >= total:
                    break

            self.log_fetch_result(len(all_jobs))
            return all_jobs

        except Exception as e:
            logger.error(f"[{self.company_name}] Error fetching jobs: {e}")
            return []

    def _extract_location_from_description(self, url: str) -> Optional[str]:
        """Fetch job details page and extract location from description.
        
        Looks for "Location(s):" pattern in the job description HTML/text.
        Returns extracted location string or None if not found.
        """
        try:
            if not url:
                return None
            
            # Fetch the job details page
            response = requests.get(url, timeout=30, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            
            if response.status_code != 200:
                return None
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Look for location in various patterns
            # Pattern 1: "Location(s): Canada : Ontario : Toronto"
            location_patterns = [
                r"Location\(s\):\s*([^\n]+)",
                r"Location:\s*([^\n]+)",
                r"Locations?:\s*([^\n]+)",
            ]
            
            # Search in text content
            text_content = soup.get_text()
            for pattern in location_patterns:
                match = re.search(pattern, text_content, re.IGNORECASE)
                if match:
                    location_text = match.group(1).strip()
                    # Clean up the location text
                    # Format: "Canada : Ontario : Toronto" -> "Toronto, Ontario, Canada"
                    parts = [p.strip() for p in location_text.split(":")]
                    if len(parts) >= 3:
                        # Reverse order: city, state, country
                        city = parts[-1] if parts[-1] else None
                        state = parts[-2] if len(parts) >= 2 and parts[-2] else None
                        country = parts[-3] if len(parts) >= 3 and parts[-3] else None
                        
                        # Build formatted location
                        formatted_parts = []
                        if city:
                            formatted_parts.append(city)
                        if state:
                            formatted_parts.append(state)
                        if country:
                            formatted_parts.append(country)
                        
                        if formatted_parts:
                            return ", ".join(formatted_parts)
                    elif location_text:
                        # Return as-is if format is different
                        return location_text
            
            # Pattern 2: Look for location in structured data attributes or specific divs
            location_divs = soup.find_all(['div', 'span', 'p'], 
                                         string=re.compile(r'Location', re.IGNORECASE))
            for div in location_divs:
                text = div.get_text()
                # Check if it contains location info (not just the word "Location")
                if ":" in text and len(text) > 15:
                    match = re.search(r"Location[^:]*:\s*([^\n]+)", text, re.IGNORECASE)
                    if match:
                        location_text = match.group(1).strip()
                        # Skip placeholder text
                        if location_text.lower() not in ["search by location", "select location"]:
                            return location_text
            
            return None
            
        except Exception as e:
            logger.debug(f"[{self.company_name}] Error extracting location from description: {e}")
            return None

    def _parse_workday_job(self, job: dict) -> Optional[JobData]:
        """Parse a Workday job posting."""
        try:
            external_id = ""
            bullet_fields = job.get("bulletFields", [])
            for field in bullet_fields:
                if re.match(r"^[A-Z0-9-]+$", field):
                    external_id = field
                    break

            if not external_id:
                external_path = job.get("externalPath", "")
                external_id = external_path.split("/")[-1] if external_path else job.get("title", "")

            title = job.get("title", "")
            
            # Build URL first (needed for location extraction)
            external_path = job.get("externalPath", "")
            url = f"https://scotiabank.wd3.myworkdayjobs.com/scotiabankcareers{external_path}" if external_path else ""
            
            # Try to extract location from description page first
            # Fallback to API location if extraction fails
            api_location = job.get("locationsText", "")
            extracted_location = self._extract_location_from_description(url)
            location = extracted_location if extracted_location else api_location

            # Get posted date
            posted_date = None
            for field in bullet_fields:
                if "posted" in field.lower():
                    date_match = re.search(r"(\w+ \d+, \d{4})", field)
                    if date_match:
                        try:
                            posted_date = datetime.strptime(date_match.group(1), "%B %d, %Y")
                        except ValueError:
                            pass

            return JobData(
                external_id=external_id,
                title=title,
                department=None,
                team=None,
                location=location,
                location_type=self.detect_location_type(location, ""),
                description_html=None,
                description_text=None,
                commitment="full-time",
                posted_date=posted_date,
                url=url,
                raw_data=job
            )

        except Exception as e:
            logger.error(f"[{self.company_name}] Error parsing job: {e}")
            return None


class WorkdayScraper(BaseScraper):
    """Generic Workday scraper that can be configured for different companies."""

    def __init__(self, company_name: str, workday_url: str, search_text: str = ""):
        super().__init__(company_name)
        self.workday_url = workday_url
        self.search_text = search_text

    def fetch_jobs(self) -> List[JobData]:
        """Fetch jobs from Workday API."""
        try:
            all_jobs = []
            offset = 0
            limit = 20

            while True:
                payload = {
                    "appliedFacets": {},
                    "limit": limit,
                    "offset": offset,
                    "searchText": self.search_text
                }

                response = requests.post(
                    self.workday_url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    timeout=30
                )

                if response.status_code != 200:
                    break

                data = response.json()
                job_postings = data.get("jobPostings", [])

                if not job_postings:
                    break

                for job in job_postings:
                    job_data = self._parse_job(job)
                    if job_data:
                        all_jobs.append(job_data)

                total = data.get("total", 0)
                offset += limit
                if offset >= total:
                    break

            self.log_fetch_result(len(all_jobs))
            return all_jobs

        except Exception as e:
            logger.error(f"[{self.company_name}] Error fetching jobs: {e}")
            return []

    def _parse_job(self, job: dict) -> Optional[JobData]:
        """Parse a Workday job posting."""
        try:
            external_id = job.get("externalPath", "").split("/")[-1]
            title = job.get("title", "")
            location = job.get("locationsText", "")

            return JobData(
                external_id=external_id or title,
                title=title,
                location=location,
                location_type=self.detect_location_type(location, ""),
                commitment="full-time",
                raw_data=job
            )

        except Exception as e:
            logger.error(f"[{self.company_name}] Error parsing job: {e}")
            return None
