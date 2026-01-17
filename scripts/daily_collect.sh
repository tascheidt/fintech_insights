#!/bin/bash
# Daily job collection script for Fintech Job Intelligence System
# Runs daily to collect new job postings and generate strategic analysis

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/daily_collect_$(date +%Y%m%d).log"

cd "$PROJECT_DIR"

echo "=== Daily Collection Started: $(date) ===" >> "$LOG_FILE"

# Activate virtual environment
source .venv/bin/activate

# Run collection with analysis
python -m src.main collect --analyze >> "$LOG_FILE" 2>&1

echo "=== Daily Collection Completed: $(date) ===" >> "$LOG_FILE"

# Keep only last 30 days of logs
find "$PROJECT_DIR/logs" -name "daily_collect_*.log" -mtime +30 -delete 2>/dev/null || true
