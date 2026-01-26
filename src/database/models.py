"""SQLAlchemy models for the job posting database."""

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, relationship, Session


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class Company(Base):
    """Companies being tracked for job postings."""

    __tablename__ = "companies"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    country = Column(String(10), nullable=False)  # CA, UK, US, etc.
    ats_type = Column(String(50), nullable=False)  # lever, greenhouse, workable, custom
    ats_identifier = Column(String(255))
    careers_url = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    job_postings = relationship("JobPosting", back_populates="company", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Company(name='{self.name}', country='{self.country}')>"


class JobPosting(Base):
    """Individual job postings from tracked companies."""

    __tablename__ = "job_postings"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    external_id = Column(String(255), nullable=False)  # ID from the ATS
    title = Column(String(500), nullable=False)
    department = Column(String(255))
    team = Column(String(255))
    location = Column(String(500))
    location_type = Column(String(50))  # remote, hybrid, onsite
    description_html = Column(Text)
    description_text = Column(Text)
    commitment = Column(String(100))  # full-time, part-time, contract
    posted_date = Column(DateTime)
    first_seen_date = Column(DateTime, default=datetime.utcnow)
    last_seen_date = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_date = Column(DateTime)
    is_active = Column(Boolean, default=True)
    url = Column(String(1000))

    # Relationships
    company = relationship("Company", back_populates="job_postings")
    strategic_insights = relationship("StrategicInsight", back_populates="job_posting", cascade="all, delete-orphan")
    events = relationship("PostingEvent", back_populates="job_posting", cascade="all, delete-orphan")
    templates = relationship("JobTemplate", back_populates="job_posting", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("company_id", "external_id", name="uq_company_external_id"),
    )

    def __repr__(self):
        return f"<JobPosting(title='{self.title}', company_id={self.company_id})>"


class StrategicInsight(Base):
    """LLM-generated strategic analysis of job postings."""

    __tablename__ = "strategic_insights"

    id = Column(Integer, primary_key=True)
    job_posting_id = Column(Integer, ForeignKey("job_postings.id"), nullable=False)
    run_date = Column(DateTime, default=datetime.utcnow)
    category = Column(String(100))  # expansion, new-product, operational, etc.
    insight_summary = Column(Text)
    strategic_signals = Column(Text)  # JSON array
    is_new_direction = Column(Boolean, default=False)
    confidence = Column(String(20))  # high, medium, low

    # Relationships
    job_posting = relationship("JobPosting", back_populates="strategic_insights")

    def __repr__(self):
        return f"<StrategicInsight(category='{self.category}', job_posting_id={self.job_posting_id})>"


class PostingEvent(Base):
    """Track when job postings appear, disappear, or change."""

    __tablename__ = "posting_events"

    id = Column(Integer, primary_key=True)
    job_posting_id = Column(Integer, ForeignKey("job_postings.id"), nullable=False)
    event_type = Column(String(50), nullable=False)  # new, closed, updated
    event_date = Column(DateTime, default=datetime.utcnow)
    details = Column(Text)

    # Relationships
    job_posting = relationship("JobPosting", back_populates="events")

    def __repr__(self):
        return f"<PostingEvent(type='{self.event_type}', job_posting_id={self.job_posting_id})>"


class JobTemplate(Base):
    """Categorized job templates for reference when creating your own postings."""

    __tablename__ = "job_templates"

    id = Column(Integer, primary_key=True)
    job_posting_id = Column(Integer, ForeignKey("job_postings.id"), nullable=False)
    role_category = Column(String(100))  # product-marketing, engineering, etc.
    extracted_sections = Column(Text)  # JSON: responsibilities, requirements, etc.
    quality_score = Column(Integer)  # 1-5 rating
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    job_posting = relationship("JobPosting", back_populates="templates")

    def __repr__(self):
        return f"<JobTemplate(category='{self.role_category}', job_posting_id={self.job_posting_id})>"


def init_db(db_path: str) -> None:
    """Initialize the database and create all tables."""
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    return engine
