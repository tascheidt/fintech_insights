#!/bin/bash
# Setup cron jobs for Fintech Job Intelligence System

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Setting up cron jobs for Fintech Job Intelligence System..."
echo "Project directory: $PROJECT_DIR"
echo ""

# Make scripts executable
chmod +x "$SCRIPT_DIR/daily_collect.sh"
chmod +x "$SCRIPT_DIR/weekly_report.sh"

# Create cron entries
DAILY_CRON="0 6 * * * $SCRIPT_DIR/daily_collect.sh"
WEEKLY_CRON="0 8 * * 1 $SCRIPT_DIR/weekly_report.sh"

# Check if cron entries already exist
CURRENT_CRON=$(crontab -l 2>/dev/null || true)

if echo "$CURRENT_CRON" | grep -q "daily_collect.sh"; then
    echo "Daily collection cron job already exists"
else
    echo "Adding daily collection cron job (6:00 AM daily)"
    (echo "$CURRENT_CRON"; echo "$DAILY_CRON") | crontab -
fi

CURRENT_CRON=$(crontab -l 2>/dev/null || true)

if echo "$CURRENT_CRON" | grep -q "weekly_report.sh"; then
    echo "Weekly report cron job already exists"
else
    echo "Adding weekly report cron job (8:00 AM Mondays)"
    (echo "$CURRENT_CRON"; echo "$WEEKLY_CRON") | crontab -
fi

echo ""
echo "Current cron jobs:"
crontab -l

echo ""
echo "Setup complete! The system will now:"
echo "  - Collect job postings daily at 6:00 AM"
echo "  - Send weekly reports every Monday at 8:00 AM"
echo ""
echo "To view logs: tail -f $PROJECT_DIR/logs/*.log"
echo "To remove cron jobs: crontab -e"
