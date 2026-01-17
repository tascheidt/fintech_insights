"""Base scraper interface for all ATS platforms."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Any
import logging
import html2text


logger = logging.getLogger(__name__)


@dataclass
class JobData:
    """Standardized job posting data structure."""
    external_id: str
    title: str
    department: Optional[str] = None
    team: Optional[str] = None
    location: Optional[str] = None
    location_type: Optional[str] = None  # remote, hybrid, onsite
    description_html: Optional[str] = None
    description_text: Optional[str] = None
    commitment: Optional[str] = None  # full-time, part-time, contract
    posted_date: Optional[datetime] = None
    url: Optional[str] = None
    raw_data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for database insertion."""
        return {
            "external_id": self.external_id,
            "title": self.title,
            "department": self.department,
            "team": self.team,
            "location": self.location,
            "location_type": self.location_type,
            "description_html": self.description_html,
            "description_text": self.description_text,
            "commitment": self.commitment,
            "posted_date": self.posted_date,
            "url": self.url,
        }


class BaseScraper(ABC):
    """Abstract base class for all job scrapers."""

    def __init__(self, company_name: str):
        self.company_name = company_name
        self.h2t = html2text.HTML2Text()
        self.h2t.ignore_links = False
        self.h2t.ignore_images = True
        self.h2t.body_width = 0  # Don't wrap text

    @abstractmethod
    def fetch_jobs(self) -> List[JobData]:
        """
        Fetch all current job postings.
        Returns a list of JobData objects.
        """
        pass

    def html_to_text(self, html: str) -> str:
        """Convert HTML to plain text."""
        if not html:
            return ""
        return self.h2t.handle(html).strip()

    def detect_location_type(self, location: str, description: str = "") -> Optional[str]:
        """Detect if a role is remote, hybrid, or onsite."""
        if not location:
            location = ""
        combined = f"{location} {description}".lower()

        if "remote" in combined:
            if "hybrid" in combined:
                return "hybrid"
            return "remote"
        elif "hybrid" in combined:
            return "hybrid"
        elif location:
            return "onsite"
        return None

    def normalize_commitment(self, commitment: str) -> Optional[str]:
        """Normalize commitment type to standard values."""
        if not commitment:
            return None
        commitment = commitment.lower()
        if "full" in commitment:
            return "full-time"
        elif "part" in commitment:
            return "part-time"
        elif "contract" in commitment or "temp" in commitment:
            return "contract"
        elif "intern" in commitment:
            return "internship"
        return commitment

    def log_fetch_result(self, job_count: int):
        """Log the result of a fetch operation."""
        logger.info(f"[{self.company_name}] Fetched {job_count} job postings")
