"""Job posting scrapers for various ATS platforms."""

from .base import BaseScraper, JobData
from .lever import LeverScraper
from .greenhouse import GreenhouseScraper
from .workable import WorkableScraper
from .custom import QuestradeScraper, TangerineScraper

__all__ = [
    "BaseScraper",
    "JobData",
    "LeverScraper",
    "GreenhouseScraper",
    "WorkableScraper",
    "QuestradeScraper",
    "TangerineScraper",
]


def get_scraper(ats_type: str, ats_identifier: str, company_name: str) -> BaseScraper:
    """Factory function to get the appropriate scraper."""
    scrapers = {
        "lever": LeverScraper,
        "greenhouse": GreenhouseScraper,
        "workable": WorkableScraper,
    }

    # Custom scrapers by company
    custom_scrapers = {
        "questrade": QuestradeScraper,
        "tangerine": TangerineScraper,
    }

    # Handle custom and workday types
    if ats_type in ("custom", "workday"):
        scraper_class = custom_scrapers.get(ats_identifier.lower())
        if scraper_class:
            return scraper_class(company_name)
        raise ValueError(f"No custom scraper for: {ats_identifier}")

    scraper_class = scrapers.get(ats_type)
    if scraper_class:
        return scraper_class(ats_identifier, company_name)

    raise ValueError(f"Unknown ATS type: {ats_type}")
