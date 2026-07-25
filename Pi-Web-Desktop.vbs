' Pi Web Desktop - Silent launcher
' Double-click this file to start Pi Web Desktop.
' No console window will appear at all.

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Path to electron.exe and main.js
electronPath = fso.BuildPath(fso.BuildPath(fso.BuildPath(appDir, "node_modules"), "electron"), "dist\electron.exe")
mainPath = fso.BuildPath(fso.BuildPath(appDir, "electron"), "main.js")

' Verify electron binary exists
If Not fso.FileExists(electronPath) Then
    MsgBox "Electron binary not found." & vbCrLf & "Path: " & electronPath & vbCrLf & "Please run 'npm install' in the pi-web directory first.", vbCritical, "Pi Web Desktop"
    WScript.Quit 1
End If

' Clear ELECTRON_RUN_AS_NODE so Electron runs as a GUI app, not plain Node.js
Dim env
Set env = shell.Environment("Process")
On Error Resume Next
env.Remove("ELECTRON_RUN_AS_NODE")
On Error GoTo 0

' Launch Electron directly - it is a GUI subsystem program, no console window at all
' Window style 1 = normal (not 0=hidden, which would hide Electron's own window)
shell.Run """" & electronPath & """ """ & mainPath & """", 1, False

Set fso = Nothing
Set shell = Nothing
Set env = Nothing
