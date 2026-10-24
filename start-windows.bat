@echo off
cd /d "%~dp0"
where py >nul 2>nul && (py -3 serve.py & goto :eof)
where python >nul 2>nul && (python serve.py & goto :eof)
echo Python 3 non trovato / not found. Installa da https://www.python.org/downloads/ (spunta "Add to PATH").
pause
