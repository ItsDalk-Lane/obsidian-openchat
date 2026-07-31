import "server-only";

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function normalizeSelectedPath(output: string): string | null {
  const value = output.trim();
  return value ? value : null;
}

function isCancelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("-128") || message.toLowerCase().includes("cancel");
}

async function pickOnMacOS(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'set chosenFolder to choose folder with prompt "Select a directory"',
      "-e",
      "POSIX path of chosenFolder",
    ]);
    return normalizeSelectedPath(stdout);
  } catch (error) {
    if (isCancelError(error)) return null;
    throw error;
  }
}

async function pickOnWindows(): Promise<string | null> {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = 'Select a directory'",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }",
  ].join("; ");
  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", script]);
  return normalizeSelectedPath(stdout);
}

async function tryLinuxCommand(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args);
    return normalizeSelectedPath(stdout);
  } catch (error) {
    if (isCancelError(error)) return null;
    return null;
  }
}

async function pickOnLinux(): Promise<string | null> {
  const byZenity = await tryLinuxCommand("zenity", ["--file-selection", "--directory", "--title", "Select a directory"]);
  if (byZenity) return byZenity;

  const byKdialog = await tryLinuxCommand("kdialog", ["--getexistingdirectory", ".", "--title", "Select a directory"]);
  if (byKdialog) return byKdialog;

  const byYad = await tryLinuxCommand("yad", ["--file-selection", "--directory", "--title", "Select a directory"]);
  if (byYad) return byYad;

  return null;
}

export async function pickDirectoryViaSystemDialog(): Promise<string | null> {
  if (process.platform === "darwin") return pickOnMacOS();
  if (process.platform === "win32") return pickOnWindows();
  if (process.platform === "linux") return pickOnLinux();
  return null;
}
