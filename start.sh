#!/bin/bash
echo "============================================"
echo "  BotAnon - Starting..."
echo "============================================"
echo ""

# Read DB_MODE from .env, remove carriage returns, get value
if [ -f .env ]; then
  export $(grep -v '^#' .env | tr -d '\r' | grep 'DB_MODE=' | xargs)
fi

# Default to sqlite if not set
DB_MODE=${DB_MODE:-sqlite}
echo "[INFO] Database mode: $DB_MODE"

if [[ "$DB_MODE" == "postgresql" ]]; then
    echo "[INFO] Checking PostgreSQL service..."
    # FIX Bug #17: Use platform-specific commands for starting PostgreSQL
    OS="$(uname -s)"
    case "$OS" in
        Linux*)
            # Try systemctl first (systemd), then service command
            if command -v systemctl &>/dev/null; then
                systemctl start postgresql 2>/dev/null || systemctl start postgresql-17 2>/dev/null || true
            elif command -v service &>/dev/null; then
                service postgresql start 2>/dev/null || service postgresql-17 start 2>/dev/null || true
            fi
            ;;
        Darwin*)
            # macOS - use pg_ctl if available
            if command -v pg_ctl &>/dev/null; then
                pg_ctl -D /opt/homebrew/var/postgres start 2>/dev/null || pg_ctl -D /usr/local/var/postgres start 2>/dev/null || true
            elif command -v brew &>/dev/null; then
                brew services start postgresql 2>/dev/null || true
            fi
            ;;
        CYGWIN*|MINGW*|MSYS*)
            # Windows (Git Bash, Cygwin, MSYS) - use net start
            net start postgresql-x64-17 2>/dev/null || net start postgresql 2>/dev/null || true
            ;;
        *)
            echo "[WARN] Unknown OS ($OS). Please ensure PostgreSQL is running manually."
            ;;
    esac
    echo "[INFO] PostgreSQL start attempted (check status if needed)."
else
    echo "[INFO] SQLite mode - no external database service needed."
fi

echo ""

if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing dependencies..."
    npm install
    echo ""
fi

echo "[INFO] Starting bot..."
echo "[INFO] Press Ctrl+C to stop."
echo ""
node index.js
