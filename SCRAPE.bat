@echo off
echo ╔════════════════════════════════════════╗
echo ║   BetMines Double Tracker - SCRAPER    ║
echo ╚════════════════════════════════════════╝
echo.
cd /d "%~dp0"
npm run scrape
echo.
pause
