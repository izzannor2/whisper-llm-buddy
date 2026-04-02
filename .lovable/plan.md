

# Auto-Install Node.js in Start Scripts

## What Changes
Update `start.bat` and `start.sh` to automatically download and install Node.js when it's not found, instead of just showing an error and exiting.

## Changes

### 1. `start.bat` — Windows Auto-Install
Replace the Node.js check block (lines 15-24) with:
- Try `winget install OpenJS.NodeJS.LTS` first (available on Win 10/11)
- If winget unavailable, download the Node.js MSI installer via `curl` (ships with Windows 10+) and run it silently with `msiexec /i ... /quiet`
- After install, refresh PATH and re-check `node --version`
- If still not found, print manual install link and exit

### 2. `start.sh` — Linux/macOS Auto-Install
Replace the Node.js check block (lines 18-22) with:
- On macOS: use `brew install node` if Homebrew is available, otherwise download from nodejs.org
- On Linux: use the NodeSource setup script (`curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs`) for Debian/Ubuntu, or `dnf`/`yum` for Fedora/RHEL
- After install, re-check `node --version`
- If still not found, print manual install link and exit

## Technical Details
- Windows: `winget` is the preferred method (no admin needed for user-scope install). MSI fallback uses `/quiet` flag for unattended install.
- Linux: NodeSource is the standard way to get LTS Node.js on Debian-based distros.
- macOS: Homebrew is the standard. Falls back to direct download.
- Both scripts refresh PATH after install so the rest of the script can proceed without restarting the terminal.

## Files to Modify
- `start.bat` — Add auto-install logic for Windows
- `start.sh` — Add auto-install logic for Linux/macOS

