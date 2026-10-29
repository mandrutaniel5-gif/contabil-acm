@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo.
echo  ACM Contabil — build Windows
echo  ============================
where node >nul 2>&1 || (echo  Lipsește Node.js. Instalează-l de pe https://nodejs.org ^(versiunea LTS^), apoi rulează din nou. & pause & exit /b 1)

echo  [1/2] Instalez dependențele...
call npm install --no-audit --no-fund || goto :eroare

echo  [2/2] Construiesc installer-ul...
call npx electron-builder --win nsis --x64 --publish never || goto :eroare

echo.
echo  Gata. Installer-ul este în folderul dist:
dir /b dist\*.exe
explorer dist
pause
exit /b 0

:eroare
echo.
echo  Build-ul a eșuat. Copiază mesajul de mai sus și trimite-l în chat.
pause
exit /b 1
