@echo off
cd /d "%~dp0"
title 임장지도 - 아이폰 테스트

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist .env goto keys
copy .env.example .env >nul
echo.
echo  [처음 실행] 설정 파일을 메모장으로 엽니다.
echo  API 키를 = 뒤에 붙여넣고, 저장 후 메모장을 닫아주세요.
echo.
notepad .env

:keys
if exist mobile\node_modules goto run
echo.
echo  [처음 실행] 앱 부품을 설치합니다. 몇 분 걸립니다...
pushd mobile
call npm install --no-audit --no-fund
popd

:run
echo.
echo  1. 지도 서버를 새 창에서 켭니다. 그 창은 닫지 마세요.
start "임장지도 서버" cmd /k node server.js
echo  2. 잠시 뒤 아래에 QR코드가 나옵니다.
echo     아이폰 기본 카메라로 QR을 찍으면 Expo Go 앱에서 열립니다.
echo     아이폰과 이 PC는 같은 와이파이에 연결되어 있어야 합니다.
echo.
cd mobile
call npm run bundle-web
call npx expo start --lan
pause
exit /b

:nonode
echo.
echo  Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 LTS 버전을 설치하세요.
echo.
pause
