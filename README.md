# The Fintech Talent Brief

A competitive intelligence tool that tracks job postings from Canadian and international fintech companies, analyzes them for strategic insights, and builds a repository of job templates.

## Features

- **Automated Job Collection**: Scrapes job postings from multiple ATS platforms (Lever, Greenhouse, Workable, Workday)
- **Strategic Analysis**: Uses Gemini AI to analyze postings for competitive intelligence signals
- **Longitudinal Tracking**: Maintains historical data to track hiring trends over time
- **Job Template Library**: Categorizes and stores job descriptions for reference when writing your own postings
- **Automated Reporting**: Generates HTML reports and sends via email
- **Scheduled Execution**: Cron-based scheduling for daily collection and weekly reports

## Companies Tracked

### Canadian Fintechs (Strategic Analysis)
- Wealthsimple
- Questrade
- Tangerine (pending ATS verification)

### International Fintechs (Templates Only)
- Monzo
- Starling Bank

*Note: Koho, Neo Financial, and Revolut are pending ATS identifier verification*

## Installation

```bash
# Clone or create the project directory
cd /path/to/Fintech_insights

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment variables
cp .env.example .env  # Then edit .env with your credentials
```

## Configuration

### Environment Variables (.env)

```bash
# Gemini API for strategic analysis
GEMINI_API_KEY=your_gemini_api_key

# Email configuration (for reports)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
EMAIL_FROM=your_email@gmail.com
EMAIL_TO=recipient@company.com
```

### Companies (config/companies.yaml)

Add or modify companies to track by editing `config/companies.yaml`. Each company needs:
- `name`: Display name
- `slug`: URL-safe identifier
- `country`: Country code (CA, UK, US)
- `is_active`: Whether the company is actively being tracked
- `ats_type`: Platform type (lever, greenhouse, workable, custom)
- `ats_identifier`: Company's identifier on the ATS platform

## Usage

### Initialize Database

```bash
./run.sh init
```

### Collect Job Postings

```bash
# Collect from all companies with strategic analysis
./run.sh collect --analyze

# Collect from specific company
./run.sh collect -c wealthsimple

# Collect without analysis
./run.sh collect --no-analyze
```

### Generate Reports

```bash
# Preview weekly report
./run.sh report --preview

# Generate and save report
./run.sh report -o data/report.html

# Send report via email
./run.sh report --type weekly
```

### View Statistics

```bash
./run.sh stats
```

### Export Data

```bash
# Export to CSV
./run.sh export -o data/jobs_export.csv --days 30
```

### Test Scrapers

```bash
# Test a specific company's scraper
./run.sh test-scraper -c wealthsimple
```

### Test Email Configuration

```bash
./run.sh test-email
```

## Scheduling

### Setup Automated Jobs

```bash
# Set up cron jobs for daily collection and weekly reports
./scripts/setup_cron.sh
```

This configures:
- **Daily at 6:00 AM**: Collect job postings and run strategic analysis
- **Weekly on Mondays at 8:00 AM**: Generate and send weekly report

### Manual Scheduling

Add to crontab (`crontab -e`):

```cron
# Daily collection at 6 AM
0 6 * * * /path/to/Fintech_insights/scripts/daily_collect.sh

# Weekly report on Mondays at 8 AM
0 8 * * 1 /path/to/Fintech_insights/scripts/weekly_report.sh
```

## Project Structure

```
Fintech_insights/
├── config/
│   ├── companies.yaml    # Company configurations
│   └── settings.yaml     # Application settings
├── src/
│   ├── scrapers/         # ATS-specific scrapers
│   ├── database/         # SQLAlchemy models and operations
│   ├── analysis/         # Gemini-powered strategic analysis
│   ├── reports/          # Report generation and email delivery
│   └── main.py           # CLI entry point
├── templates/
│   └── email_report.html # HTML email template
├── scripts/
│   ├── daily_collect.sh  # Daily collection script
│   ├── weekly_report.sh  # Weekly report script
│   └── setup_cron.sh     # Cron setup helper
├── data/
│   └── jobs.db           # SQLite database
├── logs/                 # Application logs
├── requirements.txt
└── run.sh               # Main run script
```

## Database Schema

- **companies**: Tracked companies and their ATS configurations
- **job_postings**: Individual job listings with full descriptions
- **strategic_insights**: AI-generated analysis of strategic implications
- **posting_events**: Timeline of posting appearances/closures
- **job_templates**: Categorized job descriptions for reference

## Strategic Analysis Categories

The Gemini AI categorizes postings into:

- `expansion`: Geographic or market expansion signals
- `new-product`: New product development indicators
- `technology`: Tech stack or platform changes
- `operational`: Scaling operations
- `compliance`: Regulatory/compliance focus
- `customer`: Customer experience investments
- `data`: Data/analytics capabilities
- `marketing`: Go-to-market activities
- `leadership`: Executive/leadership hires

## Adding New Companies

1. Find the company's ATS platform (usually visible in job application URLs)
2. Identify the company's identifier on that platform
3. Add entry to `config/companies.yaml`
4. Test with `./run.sh test-scraper -c company-slug`

### Finding ATS Identifiers

- **Lever**: Check `jobs.lever.co/{identifier}` - try company name variations
- **Greenhouse**: Check `boards.greenhouse.io/{identifier}/jobs`
- **Workable**: Check `apply.workable.com/{identifier}`

## Troubleshooting

### Scraper Returns 404
The company may have changed ATS platforms or identifiers. Check their careers page directly.

### No Insights Generated
Ensure `GEMINI_API_KEY` is set correctly in `.env` and the company has `is_active: true`.

### Email Not Sending
Verify SMTP credentials. For Gmail, use an App Password with 2FA enabled.

### Database Locked
SQLite doesn't handle concurrent writes well. Ensure only one process runs at a time.

## Contributing

To add support for new ATS platforms:

1. Create a new scraper in `src/scrapers/`
2. Implement the `BaseScraper` interface
3. Add to the scraper factory in `src/scrapers/__init__.py`

## License

Internal use only - proprietary competitive intelligence tool.
