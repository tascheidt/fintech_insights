"""Generate reports from job posting data."""

import json
import csv
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
import logging

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Generate HTML and CSV reports from job posting data."""

    def __init__(self, db_ops, template_dir: Optional[str] = None):
        """Initialize the report generator.

        Args:
            db_ops: DatabaseOperations instance
            template_dir: Path to Jinja2 templates directory
        """
        self.db = db_ops

        # Set up Jinja2 environment
        if template_dir is None:
            template_dir = Path(__file__).parent.parent.parent / "templates"

        self.jinja_env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=select_autoescape(['html', 'xml'])
        )

    def generate_weekly_report(
        self,
        since_date: Optional[datetime] = None,
        strategic_only: bool = True
    ) -> Dict[str, Any]:
        """Generate data for the weekly strategic report.

        Args:
            since_date: Start date for the report period (default: 7 days ago)
            strategic_only: Only include Canadian strategic companies

        Returns:
            Dictionary with report data
        """
        if since_date is None:
            since_date = datetime.utcnow() - timedelta(days=7)

        # Get new postings
        new_postings = self.db.get_new_postings_since(since_date, strategic_only=strategic_only)

        # Get closed postings
        closed_postings = self.db.get_closed_postings_since(since_date, strategic_only=strategic_only)

        # Get insights
        insights = self.db.get_insights_since(since_date)

        # Group by company
        postings_by_company = {}
        for posting in new_postings:
            company_name = posting.company.name if posting.company else "Unknown"
            if company_name not in postings_by_company:
                postings_by_company[company_name] = []
            postings_by_company[company_name].append({
                "title": posting.title,
                "department": posting.department,
                "location": posting.location,
                "url": posting.url,
                "first_seen": posting.first_seen_date.strftime("%Y-%m-%d") if posting.first_seen_date else None
            })

        # Group insights by category
        insights_by_category = {}
        for insight in insights:
            category = insight.category or "other"
            if category not in insights_by_category:
                insights_by_category[category] = []
            insights_by_category[category].append({
                "company": insight.job_posting.company.name if insight.job_posting.company else "Unknown",
                "title": insight.job_posting.title,
                "summary": insight.insight_summary,
                "signals": json.loads(insight.strategic_signals) if insight.strategic_signals else [],
                "is_new_direction": insight.is_new_direction,
                "confidence": insight.confidence
            })

        # Get company stats
        company_stats = self.db.get_posting_counts_by_company()

        # Get trends
        trends = self.db.get_posting_trends(days=30)

        return {
            "report_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "period_start": since_date.strftime("%Y-%m-%d"),
            "period_end": datetime.utcnow().strftime("%Y-%m-%d"),
            "summary": {
                "new_postings_count": len(new_postings),
                "closed_postings_count": len(closed_postings),
                "companies_with_activity": len(postings_by_company),
                "insights_generated": len(insights)
            },
            "new_postings_by_company": postings_by_company,
            "closed_postings_count": len(closed_postings),
            "insights_by_category": insights_by_category,
            "company_stats": company_stats,
            "trends_30_day": trends
        }

    def render_html_report(self, report_data: Dict[str, Any]) -> str:
        """Render the report data as HTML.

        Args:
            report_data: Data from generate_weekly_report()

        Returns:
            HTML string
        """
        try:
            template = self.jinja_env.get_template("email_report.html")
            return template.render(**report_data)
        except Exception as e:
            logger.error(f"Error rendering HTML template: {e}")
            # Fallback to basic HTML
            return self._generate_basic_html(report_data)

    def _generate_basic_html(self, data: Dict[str, Any]) -> str:
        """Generate basic HTML report without Jinja2 template."""
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Fintech Job Intelligence Report - {data['report_date']}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }}
        h1 {{ color: #1a1a2e; border-bottom: 2px solid #4a69bd; padding-bottom: 10px; }}
        h2 {{ color: #4a69bd; margin-top: 30px; }}
        h3 {{ color: #666; }}
        .summary-box {{ background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        .summary-stat {{ display: inline-block; margin-right: 30px; }}
        .stat-number {{ font-size: 2em; font-weight: bold; color: #4a69bd; }}
        .stat-label {{ color: #666; font-size: 0.9em; }}
        .company-section {{ margin: 20px 0; padding: 15px; background: #fff; border: 1px solid #eee; border-radius: 8px; }}
        .posting-item {{ padding: 10px 0; border-bottom: 1px solid #eee; }}
        .posting-title {{ font-weight: 600; color: #1a1a2e; }}
        .posting-meta {{ color: #666; font-size: 0.9em; }}
        .insight {{ background: #f0f7ff; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #4a69bd; }}
        .new-direction {{ border-left-color: #e74c3c; background: #fff5f5; }}
        .signal-tag {{ display: inline-block; background: #e9ecef; padding: 3px 8px; border-radius: 4px; margin: 2px; font-size: 0.85em; }}
        a {{ color: #4a69bd; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    <h1>Fintech Competitive Intelligence Report</h1>
    <p>Report Period: {data['period_start']} to {data['period_end']}</p>

    <div class="summary-box">
        <div class="summary-stat">
            <div class="stat-number">{data['summary']['new_postings_count']}</div>
            <div class="stat-label">New Postings</div>
        </div>
        <div class="summary-stat">
            <div class="stat-number">{data['summary']['closed_postings_count']}</div>
            <div class="stat-label">Closed Postings</div>
        </div>
        <div class="summary-stat">
            <div class="stat-number">{data['summary']['companies_with_activity']}</div>
            <div class="stat-label">Active Companies</div>
        </div>
        <div class="summary-stat">
            <div class="stat-number">{data['summary']['insights_generated']}</div>
            <div class="stat-label">Insights Generated</div>
        </div>
    </div>
"""

        # New postings by company
        if data['new_postings_by_company']:
            html += "<h2>New Job Postings by Company</h2>"
            for company, postings in data['new_postings_by_company'].items():
                html += f'<div class="company-section"><h3>{company} ({len(postings)} new)</h3>'
                for posting in postings:
                    html += f'''
                    <div class="posting-item">
                        <div class="posting-title">
                            <a href="{posting.get('url', '#')}" target="_blank">{posting['title']}</a>
                        </div>
                        <div class="posting-meta">
                            {posting.get('department', '')} | {posting.get('location', '')} | Posted: {posting.get('first_seen', '')}
                        </div>
                    </div>'''
                html += "</div>"

        # Strategic insights
        if data['insights_by_category']:
            html += "<h2>Strategic Insights</h2>"
            for category, insights in data['insights_by_category'].items():
                html += f"<h3>{category.replace('-', ' ').title()}</h3>"
                for insight in insights:
                    new_class = ' new-direction' if insight.get('is_new_direction') else ''
                    signals_html = ''.join([f'<span class="signal-tag">{s}</span>' for s in insight.get('signals', [])])
                    html += f'''
                    <div class="insight{new_class}">
                        <strong>{insight['company']}</strong> - {insight['title']}<br>
                        <p>{insight['summary']}</p>
                        <div>{signals_html}</div>
                        <small>Confidence: {insight.get('confidence', 'medium')}</small>
                    </div>'''

        # 30-day trends
        if data.get('trends_30_day'):
            trends = data['trends_30_day']
            html += f"""
    <h2>30-Day Trends</h2>
    <div class="summary-box">
        <p>New postings: {trends['new_postings']} | Closed: {trends['closed_postings']} | Net change: {trends['net_change']:+d}</p>
    </div>
"""

        html += """
    <hr>
    <p style="color: #999; font-size: 0.85em;">
        Generated by Fintech Job Intelligence System<br>
        This report tracks job postings from Canadian fintech competitors for strategic analysis.
    </p>
</body>
</html>
"""
        return html

    def export_to_csv(self, output_path: str, days: int = 30) -> str:
        """Export job postings to CSV.

        Args:
            output_path: Path for the output CSV file
            days: Number of days to include

        Returns:
            Path to the created CSV file
        """
        since = datetime.utcnow() - timedelta(days=days)
        postings = self.db.get_new_postings_since(since, strategic_only=False)

        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Company', 'Title', 'Department', 'Team', 'Location',
                'Location Type', 'Commitment', 'Posted Date', 'First Seen',
                'Is Active', 'URL'
            ])

            for posting in postings:
                writer.writerow([
                    posting.company.name if posting.company else '',
                    posting.title,
                    posting.department or '',
                    posting.team or '',
                    posting.location or '',
                    posting.location_type or '',
                    posting.commitment or '',
                    posting.posted_date.strftime('%Y-%m-%d') if posting.posted_date else '',
                    posting.first_seen_date.strftime('%Y-%m-%d') if posting.first_seen_date else '',
                    'Yes' if posting.is_active else 'No',
                    posting.url or ''
                ])

        logger.info(f"Exported {len(postings)} postings to {output_path}")
        return output_path

    def export_templates_csv(self, output_path: str, category: Optional[str] = None) -> str:
        """Export job templates to CSV for reference.

        Args:
            output_path: Path for the output CSV file
            category: Optional category filter

        Returns:
            Path to the created CSV file
        """
        with self.db.get_session() as session:
            from ..database.models import JobTemplate, JobPosting, Company

            query = session.query(JobTemplate).join(JobPosting).join(Company)
            if category:
                query = query.filter(JobTemplate.role_category == category)

            templates = query.order_by(JobTemplate.quality_score.desc()).all()

            with open(output_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    'Category', 'Quality Score', 'Company', 'Title',
                    'Summary', 'Responsibilities', 'Requirements', 'URL'
                ])

                for template in templates:
                    sections = json.loads(template.extracted_sections) if template.extracted_sections else {}
                    posting = template.job_posting
                    writer.writerow([
                        template.role_category,
                        template.quality_score,
                        posting.company.name if posting.company else '',
                        posting.title,
                        sections.get('summary', ''),
                        '; '.join(sections.get('responsibilities', [])),
                        '; '.join(sections.get('requirements', [])),
                        posting.url or ''
                    ])

            logger.info(f"Exported {len(templates)} templates to {output_path}")
            return output_path
