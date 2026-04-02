#!/bin/bash
echo "============================================"
echo "  BotAnon - Stopping..."
echo "============================================"
echo ""

echo "[INFO] Stopping bot (node processes)..."
# FIX Bug #22: Only kill node processes running the bot, not ALL node.exe
OS="$(uname -s)"
case "$OS" in
    CYGWIN*|MINGW*|MSYS*)
        # Windows - use wmic to find and kill only the BotAnon node process
        wmic process where "name='node.exe' and commandline like '%BotAnon%'" call terminate 2>/dev/null || \
        taskkill //f //fi "WINDOWTITLE eq BotAnon*" //im node.exe 2>/dev/null || \
        echo "[WARN] Could not kill node process. Please close it manually."
        ;;
    *)
        # Linux/macOS - use pkill with specific pattern
        pkill -f "node index.js" 2>/dev/null || true
        ;;
esac

if [ $? -eq 0 ]; then
    echo "[OK] Bot stopped."
else
    echo "[INFO] No running bot process found."
fi

# Read DB_MODE
if [ -f .env ]; then
  export $(grep -v '^#' .env | tr -d '\r' | grep 'DB_MODE=' | xargs)
fi
DB_MODE=${DB_MODE:-sqlite}

if [[ "$DB_MODE" == "postgresql" ]]; then
    echo ""
    read -p "[?] Stop PostgreSQL service too? (y/N): " STOP_PG
    if [[ "$STOP_PG" =~ ^[Yy]$ ]]; then
        echo "[INFO] Stopping PostgreSQL service..."
        # FIX Bug #19: Use platform-specific commands for stopping PostgreSQL
        case "$OS" in
            Linux*)
                if command -v systemctl &>/dev/null; then
                    systemctl stop postgresql 2>/dev/null || systemctl stop postgresql-17 2>/dev/null || true
                elif command -v service &>/dev/null; then
                    service postgresql stop 2>/dev/null || service postgresql-17 stop 2>/dev/null || true
                fi
                ;;
            Darwin*)
                if command -v pg_ctl &>/dev/null; then
                    pg_ctl -D /opt/homebrew/var/postgres stop 2>/dev/null || pg_ctl -D /usr/local/var/postgres stop 2>/dev/null || true
                elif command -v brew &>/dev/null; then
                    brew services stop postgresql 2>/dev/null || true
                fi
                ;;
            CYGWIN*|MINGW*|MSYS*)
                net stop postgresql-x64-17 2>/dev/null || net stop postgresql 2>/dev/null || true
                ;;
        esac
        if [ $? -eq 0 ]; then
            echo "[OK] PostgreSQL service stopped."
        else
            echo "[WARN] Could not stop PostgreSQL service (may require Admin rights)."
        fi
    fi
fi

echo ""
echo "[DONE] All stopped."
