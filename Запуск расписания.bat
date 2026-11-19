@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Умное расписание дефектолога

echo ============================================
echo   Умное расписание дефектолога
echo   Не закрывайте это окно, пока работаете
echo   с приложением. Для остановки - закройте
echo   окно или нажмите Ctrl+C.
echo ============================================
echo.

if not exist node_modules (
  echo Первый запуск: устанавливаю зависимости...
  call npm install
  if errorlevel 1 (
    echo.
    echo ОШИБКА: не удалось установить зависимости.
    echo Проверьте, что установлен Node.js ^(https://nodejs.org^)
    pause
    exit /b 1
  )
)

rem Открываем браузер через несколько секунд после старта сервера
start "" cmd /c "timeout /t 5 /nobreak >nul & start "" http://127.0.0.1:5173"

npm run dev
pause
