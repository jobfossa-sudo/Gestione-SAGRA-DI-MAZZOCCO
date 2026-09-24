@echo off
rem Accende tutto per provare le app sul computer, con dati finti:
rem Firebase locale (emulatori), app Comande e app Utenti.
rem Per spegnere basta chiudere le finestre che si aprono.
cd /d "%~dp0"

echo Preparo le funzioni del server...
call npm --prefix functions run build
if errorlevel 1 (
  echo Preparazione delle funzioni non riuscita: guarda l'errore qui sopra.
  pause
  exit /b 1
)

start "Firebase locale" cmd /k firebase emulators:start --only firestore,functions,auth
start "App Comande" cmd /k "cd apps\comande && npm run dev"
start "App Utenti" cmd /k "cd apps\utenti && npm run dev"

node functions\scripts\attendi-e-popola.js
if errorlevel 1 (
  pause
  exit /b 1
)

start "" http://127.0.0.1:5173
echo.
echo Tutto acceso.
echo   Comande: http://127.0.0.1:5173
echo   Utenti:  http://127.0.0.1:5174
echo   Dati:    http://127.0.0.1:4000
echo Utenti di prova: admin, cassa, cucina, griglia, bar, distribuzione, bancobar,
echo   bancobevande, jolly - password prova1234
echo.
pause
