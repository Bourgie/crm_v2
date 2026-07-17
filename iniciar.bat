@echo off
title FlexCRM
color 0A
echo.
echo  ============================================
echo     FlexCRM  iniciando...
echo  ============================================
echo.
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Node.js no esta instalado.
    echo  Descargalo en: https://nodejs.org
    pause & exit /b 1
)
if not exist "node_modules" (
    echo  Instalando dependencias (primera vez, ~30 seg)...
    npm install
    echo.
)
if not exist "data" mkdir data
echo  Servidor iniciado en: http://localhost:3000
echo.
echo  Usuarios de prueba:
echo    admin  /  admin123  (Administrador)
echo    marcos /  vend123   (Vendedor)
echo.
echo  Presiona Ctrl+C para detener.
echo.
timeout /t 2 /nobreak >nul
start http://localhost:3000
node server.js
pause
