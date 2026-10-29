@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
echo.
echo  ACM Contabil — build Android semnat
echo  ===================================

rem ---- Unelte necesare ----
where node >nul 2>&1 || (echo  Lipsește Node.js. Instalează-l de pe https://nodejs.org, apoi rulează din nou. & pause & exit /b 1)
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platform-tools" (
  echo  Nu găsesc Android SDK în "%ANDROID_HOME%".
  echo  Instalează Android Studio de pe https://developer.android.com/studio și deschide-l o dată,
  echo  ca să descarce SDK-ul. Apoi rulează din nou acest fișier.
  pause & exit /b 1
)
if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined JAVA_HOME (echo  Nu găsesc Java. Instalează Android Studio ^(include Java^) sau setează JAVA_HOME. & pause & exit /b 1)
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "BT="
for /f "delims=" %%d in ('dir /b /ad /o:n "%ANDROID_HOME%\build-tools" 2^>nul') do set "BT=%ANDROID_HOME%\build-tools\%%d"
if not defined BT (echo  Lipsesc Build Tools. În Android Studio: Settings - Android SDK - SDK Tools - Android SDK Build-Tools. & pause & exit /b 1)

rem ---- Cheia de semnare (rămâne doar pe acest calculator, în afara proiectului) ----
set "KEYDIR=%USERPROFILE%\.acm-keys"
set "KS=%KEYDIR%\acm-contabil.jks"
if not exist "%KS%" (
  echo.
  echo  Nu există încă o cheie de semnare. O creez acum.
  echo  Alege o parolă puternică și NOTEAZ-O. Fără cheie și parolă nu mai poți publica actualizări ale aplicației.
  echo.
  if not exist "%KEYDIR%" mkdir "%KEYDIR%"
  keytool -genkeypair -v -keystore "%KS%" -alias acm-contabil -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=ACM CODE SRL, O=ACM CODE SRL, L=Oradea, C=RO" || goto :eroare
  echo.
  echo  Cheia a fost creată în %KS%
  echo  Fă-i o copie de rezervă ^(stick, cloud criptat^).
)

rem ---- Proiectul Android ----
echo.
echo  [1/4] Instalez dependențele...
call npm install --no-audit --no-fund || goto :eroare
if not exist android (
  echo  [2/4] Creez proiectul Android...
  call npx cap add android || goto :eroare
  call node scripts\android-camera.cjs || goto :eroare
  call npx --yes @capacitor/assets generate --android --iconBackgroundColor "#0e6b6b" --iconBackgroundColorDark "#0e6b6b" --splashBackgroundColor "#f3f5f8" --splashBackgroundColorDark "#0e1115" || goto :eroare
) else (
  echo  [2/4] Proiectul Android există deja.
)
call npx cap sync android || goto :eroare

echo  [3/4] Compilez varianta release...
pushd android
call gradlew.bat assembleRelease bundleRelease --no-daemon || (popd & goto :eroare)
popd

echo  [4/4] Semnez...
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "VER=%%v"
if not exist release mkdir release
set "APK=release\ACM-Contabil-%VER%.apk"
set "AAB=release\ACM-Contabil-%VER%.aab"
"%BT%\zipalign.exe" -f -p 4 android\app\build\outputs\apk\release\app-release-unsigned.apk "%APK%" || goto :eroare
echo  Introdu parola cheii pentru APK:
call "%BT%\apksigner.bat" sign --ks "%KS%" --ks-key-alias acm-contabil "%APK%" || goto :eroare
copy /y android\app\build\outputs\bundle\release\app-release.aab "%AAB%" >nul
echo  Introdu parola cheii pentru pachetul Google Play ^(AAB^):
jarsigner -keystore "%KS%" "%AAB%" acm-contabil || goto :eroare

echo.
echo  Gata:
echo    %APK%  — se instalează direct pe telefon
echo    %AAB%  — pentru Google Play
explorer release
pause
exit /b 0

:eroare
echo.
echo  Build-ul a eșuat. Copiază mesajul de mai sus și trimite-l în chat.
pause
exit /b 1
