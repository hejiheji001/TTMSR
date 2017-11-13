cd %~dp0
netstat -aon|findstr /i "3000"&&taskkill /f /t /im node.exe
node -v
start app.vbs
start http://localhost:3000