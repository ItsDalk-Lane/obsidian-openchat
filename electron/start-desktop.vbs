' Pi Web Desktop - Silent launcher (no console window)
' Double-click to start the desktop app
' Logs are written to pi-web/logs/pi-web-desktop.log

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Find node.exe by checking common locations (no cmd /c, no window flash)
Dim userName, nodePath, candidates, candidate
userName = shell.ExpandEnvironmentStrings("%USERNAME%")

candidates = Array( _
    "C:\Program Files\nodejs\node.exe", _
    "C:\Users\" & userName & "\AppData\Local\Programs\nodejs\node.exe" _
)

nodePath = ""
For Each candidate In candidates
    If fso.FileExists(candidate) Then
        nodePath = candidate
        Exit For
    End If
Next

If nodePath = "" Then
    nodePath = "node"
End If

launcherPath = fso.BuildPath(scriptDir, "launcher.js")

Dim nodeCmd, launcherCmd
If InStr(nodePath, " ") > 0 Then
    nodeCmd = """" & nodePath & """"
Else
    nodeCmd = nodePath
End If
launcherCmd = """" & launcherPath & """"

shell.Run nodeCmd & " " & launcherCmd, 0, False

Set shell = Nothing
Set fso = Nothing
