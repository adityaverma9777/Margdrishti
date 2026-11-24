@echo off
cd /d "%~dp0backend"
set PYTHONPATH=%cd%
python -m uvicorn src.server:app --host 127.0.0.1 --port 8001 --reload
