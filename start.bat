@echo off
echo Freeing ports 3002 and 5173...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo Starting backend (port 3002)...
start "FRAME Backend" cmd /k "cd /d "C:\Claude Video-Photo Edit Generator\server" && npm run dev"

timeout /t 2 /nobreak >nul

echo Starting frontend (port 5173)...
start "FRAME Frontend" cmd /k "cd /d "C:\Claude Video-Photo Edit Generator\client" && npm run dev"

echo.
echo Both servers launching. Open http://localhost:5173 in your browser.
