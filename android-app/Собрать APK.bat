@echo off
chcp 65001 >nul
cd /d %~dp0
echo === Сборка веб-бандла и синхронизация ===
call npm run cap:sync || exit /b 1
echo === Сборка APK ===
cd android
call gradlew assembleDebug || exit /b 1
echo.
echo Готово: android\app\build\outputs\apk\debug\app-debug.apk
pause
