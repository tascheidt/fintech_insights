#!/bin/bash
# Weekly report script for The Fintech Talent Brief
# Generates and sends the weekly strategic intelligence report

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/weekly_report_$(date +%Y%m%d).log"

cd "$PROJECT_DIR"

echo "=== Weekly Report Started: $(date) ===" >> "$LOG_FILE"

# Activate virtual environment
source .venv/bin/activate

# Generate and send weekly report
python -m src.main report --type weekly --days 7 >> "$LOG_FILE" 2>&1

echo "=== Weekly Report Completed: $(date) ===" >> "$LOG_FILE"

# Keep only last 12 weeks of logs
find "$PROJECT_DIR/logs" -name "weekly_report_*.log" -mtime +84 -delete 2>/dev/null || true
