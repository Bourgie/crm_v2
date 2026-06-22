@echo off
title PequeñosCRM Pro
cd /d "%~dp0"
echo.
echo  ════════════════════════════════════════
echo    PequeñosCRM Pro — Iniciando...
echo  ════════════════════════════════════════
echo.
echo  Red LOCAL (misma red WiFi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
  set IP=%%a
  goto :gotip
)
:gotip
set IP=%IP: =%
echo    http://%IP%:3000
echo.
echo  Red REMOTA (Tailscale):
for /f %%a in ('powershell -command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like '100.*'}).IPAddress" 2^>nul') do (
  echo    http://%%a:3000
)
echo.
echo  ════════════════════════════════════════
echo.
npm start
pause
