@echo off
echo ============================================
echo   BotAnon - Stopping...
echo ============================================
echo.

:: Kill all node processes running the bot
echo [INFO] Stopping bot (node processes)...
taskkill /f /im node.exe >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Bot stopped.
) else (
    echo [INFO] No running bot process found.
)

:: Read DB_MODE from .env
for /f "tokens=1,2 delims==" %%a in ('findstr /i "DB_MODE" .env') do set %%a=%%b
set DB_MODE=%DB_MODE: =%

:: If PostgreSQL mode, optionally stop the service
if /i "%DB_MODE%"=="postgresql" (
    echo.
    set /p STOP_PG="[?] Stop PostgreSQL service too? (y/N): "
    if /i "%STOP_PG%"=="y" (
        echo [INFO] Stopping PostgreSQL service...
        net stop postgresql-x64-17 >nul 2>&1
        if %errorlevel%==0 (
            echo [OK] PostgreSQL service stopped.
        ) else (
            echo [WARN] Could not stop PostgreSQL service.
        )
    )
)

echo.
echo [DONE] All stopped.
pause
