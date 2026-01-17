"""Database operations for CRUD functionality."""

import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session, joinedload

from .models import Base, Company, JobPosting, StrategicInsight, PostingEvent, JobTemplate


class DatabaseOperations:
    """Handle all database operations."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.engine = create_engine(f"sqlite:///{db_path}")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def get_session(self) -> Session:
        """Get a new database session."""
        return self.SessionLocal()

    # Company operations
    def upsert_company(self, company_data: Dict[str, Any]) -> Company:
        """Insert or update a company."""
        with self.get_session() as session:
            company = session.query(Company).filter_by(slug=company_data["slug"]).first()
            if company:
                for key, value in company_data.items():
                    setattr(company, key, value)
            else:
                company = Company(**company_data)
                session.add(company)
            session.commit()
            session.refresh(company)
            return company

    def get_company_by_slug(self, slug: str) -> Optional[Company]:
        """Get a company by its slug."""
        with self.get_session() as session:
            return session.query(Company).filter_by(slug=slug).first()

    def get_all_companies(self) -> List[Company]:
        """Get all tracked companies."""
        with self.get_session() as session:
            return session.query(Company).all()

    def get_strategic_companies(self) -> List[Company]:
        """Get companies tracked for strategic analysis."""
        with self.get_session() as session:
            return session.query(Company).filter_by(track_for_strategy=True).all()

    # Job posting operations
    def upsert_job_posting(self, company_id: int, job_data: Dict[str, Any]) -> tuple[JobPosting, bool]:
        """
        Insert or update a job posting.
        Returns (job_posting, is_new) tuple.
        """
        with self.get_session() as session:
            existing = session.query(JobPosting).filter_by(
                company_id=company_id,
                external_id=job_data["external_id"]
            ).first()

            is_new = existing is None

            if existing:
                # Update existing posting
                existing.last_seen_date = datetime.utcnow()
                existing.is_active = True
                # Update other fields if they changed
                for key, value in job_data.items():
                    if key not in ["external_id"] and hasattr(existing, key):
                        setattr(existing, key, value)
                session.commit()
                session.refresh(existing)
                return existing, False
            else:
                # Create new posting
                job = JobPosting(company_id=company_id, **job_data)
                session.add(job)
                session.commit()
                session.refresh(job)

                # Record new posting event
                event = PostingEvent(
                    job_posting_id=job.id,
                    event_type="new",
                    details=f"New posting: {job.title}"
                )
                session.add(event)
                session.commit()

                return job, True

    def mark_inactive_postings(self, company_id: int, active_external_ids: List[str]) -> List[JobPosting]:
        """Mark postings as inactive if they're no longer in the active list."""
        with self.get_session() as session:
            closed_postings = []
            active_postings = session.query(JobPosting).filter(
                JobPosting.company_id == company_id,
                JobPosting.is_active == True,
                ~JobPosting.external_id.in_(active_external_ids)
            ).all()

            for posting in active_postings:
                posting.is_active = False
                posting.closed_date = datetime.utcnow()

                # Record closed event
                event = PostingEvent(
                    job_posting_id=posting.id,
                    event_type="closed",
                    details=f"Posting closed: {posting.title}"
                )
                session.add(event)
                closed_postings.append(posting)

            session.commit()
            return closed_postings

    def get_active_postings_by_company(self, company_id: int) -> List[JobPosting]:
        """Get all active job postings for a company."""
        with self.get_session() as session:
            return session.query(JobPosting).filter_by(
                company_id=company_id,
                is_active=True
            ).all()

    def get_new_postings_since(self, since: datetime, strategic_only: bool = False) -> List[JobPosting]:
        """Get new job postings since a given date."""
        with self.get_session() as session:
            query = session.query(JobPosting).options(
                joinedload(JobPosting.company)
            ).filter(
                JobPosting.first_seen_date >= since
            )
            if strategic_only:
                query = query.join(Company).filter(Company.track_for_strategy == True)
            # Use list() to ensure all data is loaded before session closes
            return list(query.all())

    def get_closed_postings_since(self, since: datetime, strategic_only: bool = False) -> List[JobPosting]:
        """Get closed job postings since a given date."""
        with self.get_session() as session:
            query = session.query(JobPosting).options(
                joinedload(JobPosting.company)
            ).filter(
                JobPosting.closed_date >= since
            )
            if strategic_only:
                query = query.join(Company).filter(Company.track_for_strategy == True)
            return list(query.all())

    def get_postings_without_insights(self, strategic_only: bool = True) -> List[JobPosting]:
        """Get postings that haven't been analyzed yet."""
        with self.get_session() as session:
            query = session.query(JobPosting).options(
                joinedload(JobPosting.company)
            ).outerjoin(
                StrategicInsight
            ).filter(
                StrategicInsight.id == None,
                JobPosting.is_active == True
            )
            if strategic_only:
                query = query.join(Company).filter(Company.track_for_strategy == True)
            return list(query.all())

    # Strategic insight operations
    def add_strategic_insight(self, job_posting_id: int, insight_data: Dict[str, Any]) -> StrategicInsight:
        """Add a strategic insight for a job posting."""
        with self.get_session() as session:
            insight = StrategicInsight(job_posting_id=job_posting_id, **insight_data)
            session.add(insight)
            session.commit()
            session.refresh(insight)
            return insight

    def get_insights_since(self, since: datetime) -> List[StrategicInsight]:
        """Get all insights generated since a given date."""
        with self.get_session() as session:
            query = session.query(StrategicInsight).options(
                joinedload(StrategicInsight.job_posting).joinedload(JobPosting.company)
            ).filter(
                StrategicInsight.run_date >= since
            )
            return list(query.all())

    # Job template operations
    def add_job_template(self, job_posting_id: int, template_data: Dict[str, Any]) -> JobTemplate:
        """Add a job template categorization."""
        with self.get_session() as session:
            template = JobTemplate(job_posting_id=job_posting_id, **template_data)
            session.add(template)
            session.commit()
            session.refresh(template)
            return template

    def get_templates_by_category(self, category: str) -> List[JobTemplate]:
        """Get all templates in a category."""
        with self.get_session() as session:
            return session.query(JobTemplate).filter_by(role_category=category).all()

    def get_all_categories(self) -> List[str]:
        """Get all unique template categories."""
        with self.get_session() as session:
            results = session.query(JobTemplate.role_category).distinct().all()
            return [r[0] for r in results if r[0]]

    # Statistics
    def get_posting_counts_by_company(self) -> Dict[str, Dict[str, int]]:
        """Get posting counts (active/total) by company."""
        with self.get_session() as session:
            companies = session.query(Company).all()
            stats = {}
            for company in companies:
                active = session.query(JobPosting).filter_by(
                    company_id=company.id, is_active=True
                ).count()
                total = session.query(JobPosting).filter_by(
                    company_id=company.id
                ).count()
                stats[company.name] = {"active": active, "total": total}
            return stats

    def get_posting_trends(self, days: int = 30) -> Dict[str, Any]:
        """Get posting trends over the last N days."""
        from datetime import timedelta
        with self.get_session() as session:
            since = datetime.utcnow() - timedelta(days=days)

            new_count = session.query(JobPosting).filter(
                JobPosting.first_seen_date >= since
            ).count()

            closed_count = session.query(JobPosting).filter(
                JobPosting.closed_date >= since
            ).count()

            return {
                "period_days": days,
                "new_postings": new_count,
                "closed_postings": closed_count,
                "net_change": new_count - closed_count
            }
