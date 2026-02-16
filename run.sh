#!/bin/bash
# The Fintech Talent Brief - Run Script

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Activate virtual environment
source .venv/bin/activate

# Run the CLI with any passed arguments
python -m src.main "$@"
