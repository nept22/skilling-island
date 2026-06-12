@echo off
rem Starts the dev server. Double-click this or run it from any terminal.
set "PATH=%LOCALAPPDATA%\Programs\node-v24.16.0-win-x64;%PATH%"
cd /d "%~dp0"
npm run dev
