@echo off
rem 无人生还：士兵岛 —— M1 一键启动
cd /d %~dp0
start "" /min python -m http.server 8000
timeout /t 2 >nul
start "" http://localhost:8000/
