@echo off
echo ============================================
echo   BotAnon - Starting...
echo ============================================
echo.

:: Read DB_MODE from .env
for /f "tokens=1,2 delims==" %%a in ('findstr /i "DB_MODE" .env') do set %%a=%%b

:: Trim whitespace
set DB_MODE=%DB_MODE: =%

echo [INFO] Database mode: %DB_MODE%

:: If PostgreSQL mode, try to start the service
if /i "%DB_MODE%"=="postgresql" (
    echo [INFO] Starting PostgreSQL service...
    net start postgresql-x64-17 >nul 2>&1
    if %errorlevel%==0 (
        echo [OK] PostgreSQL service started.
    ) else (
        echo [WARN] PostgreSQL service may already be running or service name differs.
        echo [WARN] If connection fails, check your PostgreSQL service name and .env config.
    )
) else (
    echo [INFO] SQLite mode - no external database service needed.
)

echo.

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
    echo.
)

:: Start the bot
echo [INFO] Starting bot...
echo [INFO] Press Ctrl+C to stop.
echo.
node index.js
