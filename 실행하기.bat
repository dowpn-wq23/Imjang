@echo off
cd /d "%~dp0"
title 임장지도

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist .env goto run
copy .env.example .env >nul
echo.
echo  [처음 실행] 설정 파일을 메모장으로 엽니다.
echo  API 키를 = 뒤에 붙여넣고, 저장 후 메모장을 닫아주세요.
echo.
notepad .env

:run
echo.
echo  임장지도를 켭니다. 잠시 후 브라우저가 열립니다.
echo  끝낼 때는 이 검은 창을 닫으세요.
echo.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
exit /b

:nonode
echo.
echo  Node.js가 설치되어 있지 않습니다.
echo  https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
echo.
pause
