# Window Layout Manager

A Windows application to save and restore window layouts across monitors and sessions.

## Features

- **Save Layouts**: Capture current window positions and sizes
- **Restore Layouts**: Instantly restore saved window arrangements
- **Multi-Monitor Support**: Works with multiple monitors
- **Auto-Switch**: Automatically switch layouts when monitor configuration changes
- **System Tray**: Quick access from system tray

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package as Windows installer
npm run package
```

## Usage

1. Click "Save Layout" to capture your current window arrangement
2. Give your layout a name (e.g., "Work Mode", "Gaming Setup")
3. Select which windows to include in the layout
4. Click "Restore" on any saved layout to reposition windows

## System Tray

- Double-click tray icon to open the main window
- Right-click for quick actions:
  - Save Current Layout
  - Restore Last Layout
  - Quit
