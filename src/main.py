"""Main CLI entry point for The Fintech Talent Brief."""

import os
import sys
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, List

import click
import yaml
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.database import DatabaseOperations
from src.scrapers import get_scraper
from src.analysis import StrategicAnalyzer, JobCategorizer
from src.reports import ReportGenerator, EmailDelivery


# Load environment variables
load_dotenv()

# Set up logging
def setup_logging(log_level: str = "INFO", log_file: Optional[str] = None):
    """Configure logging for the application."""
    handlers = [logging.StreamHandler()]
    if log_file:
        handlers.append(logging.FileHandler(log_file))

    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers
    )


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent


def load_config() -> dict:
    """Load configuration from YAML files."""
    root = get_project_root()

    # Load companies config
    companies_path = root / "config" / "companies.yaml"
    with open(companies_path) as f:
        companies_config = yaml.safe_load(f)

    # Load settings config
    settings_path = root / "config" / "settings.yaml"
    with open(settings_path) as f:
        settings_config = yaml.safe_load(f)

    return {
        "companies": companies_config.get("companies", []),
        "settings": settings_config
    }


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose logging")
@click.option("--log-file", type=click.Path(), help="Log file path")
@click.pass_context
def cli(ctx, verbose, log_file):
    """The Fintech Talent Brief — hiring intelligence for fintech."""
    ctx.ensure_object(dict)

    log_level = "DEBUG" if verbose else "INFO"
    if log_file is None:
        log_file = get_project_root() / "logs" / "fintech_talent_brief.log"
    setup_logging(log_level, str(log_file))

    # Load config and initialize database
    config = load_config()
    ctx.obj["config"] = config

    db_path = get_project_root() / config["settings"]["database"]["path"]
    db_path.parent.mkdir(parents=True, exist_ok=True)
    ctx.obj["db"] = DatabaseOperations(str(db_path))


@cli.command()
@click.option("--company", "-c", multiple=True, help="Specific company slug(s) to collect")
@click.option("--analyze/--no-analyze", default=True, help="Run strategic analysis on new postings")
@click.option("--categorize/--no-categorize", default=False, help="Categorize postings for templates")
@click.pass_context
def collect(ctx, company, analyze, categorize):
    """Collect job postings from all configured companies."""
    logger = logging.getLogger("collect")
    db = ctx.obj["db"]
    config = ctx.obj["config"]

    companies = config["companies"]
    if company:
        companies = [c for c in companies if c["slug"] in company]

    if not companies:
        logger.error("No companies to collect from")
        return

    logger.info(f"Starting collection for {len(companies)} companies")

    new_postings = []
    closed_postings = []

    for company_config in companies:
        logger.info(f"Processing {company_config['name']}...")

        # Upsert company in database
        db.upsert_company({
            "name": company_config["name"],
            "slug": company_config["slug"],
            "country": company_config["country"],
            "ats_type": company_config["ats_type"],
            "ats_identifier": company_config.get("ats_identifier"),
            "careers_url": company_config.get("careers_url")
        })

        # Get company from DB
        company_obj = db.get_company_by_slug(company_config["slug"])
        if not company_obj:
            logger.error(f"Failed to get company {company_config['slug']} from database")
            continue

        try:
            # Get scraper
            scraper = get_scraper(
                ats_type=company_config["ats_type"],
                ats_identifier=company_config.get("ats_identifier", company_config["slug"]),
                company_name=company_config["name"]
            )

            # Fetch jobs
            jobs = scraper.fetch_jobs()
            logger.info(f"  Found {len(jobs)} job postings")

            # Upsert each job
            active_external_ids = []
            for job in jobs:
                job_dict = job.to_dict()
                posting, is_new = db.upsert_job_posting(company_obj.id, job_dict)
                active_external_ids.append(job.external_id)
                if is_new:
                    new_postings.append({
                        "company_name": company_config["name"],
                        "company_id": company_obj.id,
                        "posting": posting
                    })

            # Mark inactive postings
            closed = db.mark_inactive_postings(company_obj.id, active_external_ids)
            if closed:
                logger.info(f"  Marked {len(closed)} postings as closed")
                closed_postings.extend(closed)

        except Exception as e:
            logger.error(f"  Error processing {company_config['name']}: {e}")
            continue

    logger.info(f"Collection complete: {len(new_postings)} new, {len(closed_postings)} closed")

    # Run strategic analysis on new postings
    if analyze and new_postings:
        logger.info("Running strategic analysis on new postings...")
        try:
            analyzer = StrategicAnalyzer()

            for item in new_postings:
                # Analyze all active companies
                company_config = next(
                    (c for c in config["companies"] if c["name"] == item["company_name"]),
                    None
                )
                if not company_config:
                    continue

                posting = item["posting"]
                result = analyzer.analyze_posting(
                    company_name=item["company_name"],
                    job_title=posting.title,
                    department=posting.department,
                    location=posting.location,
                    description=posting.description_text or posting.description_html or ""
                )

                if result:
                    db.add_strategic_insight(posting.id, result.to_dict())
                    logger.info(f"  Analyzed: {posting.title} -> {result.category}")

        except Exception as e:
            logger.error(f"Error during strategic analysis: {e}")

    # Categorize for templates
    if categorize and new_postings:
        logger.info("Categorizing postings for template library...")
        try:
            categorizer = JobCategorizer()

            for item in new_postings:
                posting = item["posting"]
                result = categorizer.categorize_posting(
                    job_title=posting.title,
                    company_name=item["company_name"],
                    description=posting.description_text or posting.description_html or ""
                )

                if result:
                    db.add_job_template(posting.id, result.to_dict())
                    logger.info(f"  Categorized: {posting.title} -> {result.role_category}")

        except Exception as e:
            logger.error(f"Error during categorization: {e}")

    click.echo(f"Done! {len(new_postings)} new postings, {len(closed_postings)} closed.")


@cli.command()
@click.option("--type", "report_type", type=click.Choice(["weekly", "full"]), default="weekly")
@click.option("--days", default=7, help="Number of days to include in report")
@click.option("--preview", is_flag=True, help="Preview report without sending email")
@click.option("--output", "-o", type=click.Path(), help="Save HTML report to file")
@click.pass_context
def report(ctx, report_type, days, preview, output):
    """Generate and optionally send reports."""
    logger = logging.getLogger("report")
    db = ctx.obj["db"]
    config = ctx.obj["config"]

    since_date = datetime.now(timezone.utc) - timedelta(days=days)

    logger.info(f"Generating {report_type} report for last {days} days...")

    generator = ReportGenerator(db, str(get_project_root() / "templates"))

    # Generate report data
    report_data = generator.generate_weekly_report(
        since_date=since_date,
        strategic_only=(report_type == "weekly")
    )

    # Render HTML
    html_content = generator.render_html_report(report_data)

    # Save to file if requested
    if output:
        with open(output, 'w', encoding='utf-8') as f:
            f.write(html_content)
        click.echo(f"Report saved to {output}")

    # Preview mode - just show summary
    if preview:
        click.echo("\n--- Report Preview ---")
        click.echo(f"Period: {report_data['period_start']} to {report_data['period_end']}")
        click.echo(f"New postings: {report_data['summary']['new_postings_count']}")
        click.echo(f"Closed postings: {report_data['summary']['closed_postings_count']}")
        click.echo(f"Companies with activity: {report_data['summary']['companies_with_activity']}")
        click.echo(f"Insights generated: {report_data['summary']['insights_generated']}")

        if not output:
            # Save preview to temp file
            preview_path = get_project_root() / "data" / f"report_preview_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
            with open(preview_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            click.echo(f"\nFull HTML report saved to: {preview_path}")
        return

    # Send email
    recipients = os.getenv("EMAIL_TO", "").split(",")
    recipients = [r.strip() for r in recipients if r.strip()]

    if not recipients:
        click.echo("No email recipients configured (set EMAIL_TO in .env)")
        if not output:
            preview_path = get_project_root() / "data" / f"report_{datetime.now().strftime('%Y%m%d')}.html"
            with open(preview_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            click.echo(f"Report saved to: {preview_path}")
        return

    emailer = EmailDelivery()
    if emailer.send_weekly_report(recipients, html_content, report_data['report_date']):
        click.echo(f"Report sent to {len(recipients)} recipient(s)")
    else:
        click.echo("Failed to send email - check logs for details")


@cli.command()
@click.option("--days", default=30, help="Number of days to export")
@click.option("--output", "-o", type=click.Path(), required=True, help="Output CSV file path")
@click.option("--strategic-only", is_flag=True, help="Only include strategic companies")
@click.pass_context
def export(ctx, days, output, strategic_only):
    """Export job postings to CSV."""
    logger = logging.getLogger("export")
    db = ctx.obj["db"]

    generator = ReportGenerator(db)
    generator.export_to_csv(output, days=days)
    click.echo(f"Exported to {output}")


@cli.command()
@click.pass_context
def stats(ctx):
    """Show current statistics."""
    db = ctx.obj["db"]

    click.echo("\n=== Fintech Talent Brief Statistics ===\n")

    # Company stats
    company_stats = db.get_posting_counts_by_company()
    click.echo("Active Job Postings by Company:")
    click.echo("-" * 40)
    for company, counts in sorted(company_stats.items()):
        click.echo(f"  {company}: {counts['active']} active / {counts['total']} total")

    # Trends
    trends = db.get_posting_trends(days=30)
    click.echo(f"\n30-Day Trends:")
    click.echo("-" * 40)
    click.echo(f"  New postings: {trends['new_postings']}")
    click.echo(f"  Closed postings: {trends['closed_postings']}")
    click.echo(f"  Net change: {trends['net_change']:+d}")

    # Template categories
    categories = db.get_all_categories()
    if categories:
        click.echo(f"\nTemplate Categories: {len(categories)}")
        click.echo("-" * 40)
        for cat in sorted(categories):
            click.echo(f"  - {cat}")


@cli.command()
@click.pass_context
def init(ctx):
    """Initialize the database and seed companies."""
    logger = logging.getLogger("init")
    db = ctx.obj["db"]
    config = ctx.obj["config"]

    click.echo("Initializing database...")

    # Seed companies from config
    for company_config in config["companies"]:
        db.upsert_company({
            "name": company_config["name"],
            "slug": company_config["slug"],
            "country": company_config["country"],
            "ats_type": company_config["ats_type"],
            "ats_identifier": company_config.get("ats_identifier"),
            "careers_url": company_config.get("careers_url")
        })
        click.echo(f"  Added: {company_config['name']}")

    click.echo(f"\nInitialized with {len(config['companies'])} companies")


@cli.command()
@click.pass_context
def test_email(ctx):
    """Test email configuration."""
    click.echo("Testing email configuration...")

    emailer = EmailDelivery()

    if not emailer.is_configured():
        click.echo("Email not configured. Set SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM in .env")
        return

    if emailer.test_connection():
        click.echo("SMTP connection successful!")

        recipients = os.getenv("EMAIL_TO", "").split(",")
        recipients = [r.strip() for r in recipients if r.strip()]

        if recipients:
            # Send test email
            test_html = """
            <html>
            <body>
                <h1>Test Email</h1>
                <p>This is a test email from The Fintech Talent Brief.</p>
                <p>If you're seeing this, email delivery is working correctly!</p>
            </body>
            </html>
            """
            if emailer.send_report(recipients, "Test - The Fintech Talent Brief", test_html):
                click.echo(f"Test email sent to {recipients}")
            else:
                click.echo("Failed to send test email")
        else:
            click.echo("No recipients configured (set EMAIL_TO in .env)")
    else:
        click.echo("SMTP connection failed - check credentials")


@cli.command()
@click.option("--company", "-c", required=True, help="Company slug to test")
@click.pass_context
def test_scraper(ctx, company):
    """Test scraper for a specific company."""
    logger = logging.getLogger("test_scraper")
    config = ctx.obj["config"]

    company_config = next(
        (c for c in config["companies"] if c["slug"] == company),
        None
    )

    if not company_config:
        click.echo(f"Company '{company}' not found in config")
        return

    click.echo(f"Testing scraper for {company_config['name']}...")

    try:
        scraper = get_scraper(
            ats_type=company_config["ats_type"],
            ats_identifier=company_config.get("ats_identifier", company_config["slug"]),
            company_name=company_config["name"]
        )

        jobs = scraper.fetch_jobs()

        click.echo(f"\nFound {len(jobs)} job postings:")
        click.echo("-" * 60)

        for job in jobs[:10]:  # Show first 10
            click.echo(f"  - {job.title}")
            if job.department:
                click.echo(f"    Department: {job.department}")
            if job.location:
                click.echo(f"    Location: {job.location}")
            click.echo()

        if len(jobs) > 10:
            click.echo(f"  ... and {len(jobs) - 10} more")

    except Exception as e:
        click.echo(f"Error: {e}")


if __name__ == "__main__":
    cli()
