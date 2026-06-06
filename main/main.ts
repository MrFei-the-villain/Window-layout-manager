import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { WindowManager } from './windowManager';
import { LayoutStore } from './layoutStore';
import { MonitorWatcher } from './monitorWatcher';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let windowManager: WindowManager;
let layoutStore: LayoutStore;
let monitorWatcher: MonitorWatcher;
let isQuitting = false;

// --- Single-instance lock ---
// When a new instance is launched, the previous instance quits and the
// new instance becomes the active one. This avoids stale state from a
// previous run and prevents two tray icons / IPC handlers from fighting.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running. The running instance will
  // receive a 'second-instance' event and quit itself, releasing the
  // lock. We poll for the lock to be released, then continue bootstrap
  // as the new active instance. If the previous instance is hung and
  // doesn't quit, give up after a few seconds.
  console.log('[WLM] Another instance is running. Waiting for it to quit so this one can take over...');
  let attempts = 0;
  const maxAttempts = 50; // 5s total
  const retryInterval = setInterval(() => {
    attempts++;
    if (app.requestSingleInstanceLock()) {
      clearInterval(retryInterval);
      console.log('[WLM] Acquired lock after', attempts, 'attempt(s). Bootstrapping as new active instance.');
      // We are now the new active instance. The previous one is gone.
      app.on('second-instance', () => {
        console.log('[WLM] Second instance detected — quitting this instance so the new one can take over.');
        isQuitting = true;
        try { monitorWatcher?.stop(); } catch { /* ignore */ }
        app.quit();
      });
      bootstrap();
    } else if (attempts >= maxAttempts) {
      clearInterval(retryInterval);
      console.error('[WLM] Previous instance did not quit in time. Exiting.');
      app.quit();
    }
  }, 100);
} else {
  // We are the first/only instance. When another instance starts,
  // quit so the new one can take over.
  app.on('second-instance', () => {
    console.log('[WLM] Second instance detected — quitting this instance so the new one can take over.');
    isQuitting = true;
    try { monitorWatcher?.stop(); } catch { /* ignore */ }
    app.quit();
  });

  bootstrap();
}

function bootstrap(): void {
  const createWindow = (): void => {
    mainWindow = new BrowserWindow({
      width: 900,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      frame: false,
      transparent: false,
      resizable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, '../assets/icon.png')
    });

    if (process.env.NODE_ENV === 'development') {
      mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
    } else {
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault();
        mainWindow?.hide();
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  };

  const createTray = (): void => {
    const iconPath = path.join(__dirname, '../assets/icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Window Layout Manager', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Save Current Layout', click: () => mainWindow?.webContents.send('quick-save-layout') },
      { label: 'Restore Last Layout', click: () => mainWindow?.webContents.send('quick-restore-layout') },
      { type: 'separator' },
      { label: 'Quit', click: () => {
        isQuitting = true;
        app.quit();
      }}
    ]);

    tray.setToolTip('Window Layout Manager');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      mainWindow?.show();
    });
  };

  const setupIpcHandlers = (): void => {
    ipcMain.handle('get-all-windows', async () => {
      try {
        const result = await windowManager.getAllWindows();
        console.log('[WLM] IPC get-all-windows returning:', result.length, 'windows');
        return result;
      } catch (error) {
        console.error('[WLM] IPC get-all-windows error:', error);
        return [];
      }
    });

    ipcMain.handle('get-debug-info', async () => {
      return windowManager.getDebugInfo();
    });

    ipcMain.handle('get-monitors', async () => {
      return windowManager.getMonitors();
    });

    ipcMain.handle('save-layout', async (_event, name: string, windowIds?: string[]) => {
      try {
        console.log('[WLM] save-layout called with name:', name, 'windowIds count:', windowIds?.length || 0);
        const windows = await windowManager.getAllWindows();
        const monitors = windowManager.getMonitors();
        const selectedWindows = windowIds
          ? windows.filter((w) => windowIds.includes(w.id))
          : windows;

        if (selectedWindows.length === 0) {
          return {
            id: '',
            name: name || '',
            windows: [],
            monitors: [],
            createdAt: Date.now(),
            error: 'No windows to save'
          };
        }

        const layout = layoutStore.saveLayout({
          name,
          windows: selectedWindows,
          monitors,
          createdAt: Date.now()
        });
        console.log('[WLM] save-layout success:', layout.id);
        return layout;
      } catch (error) {
        console.error('[WLM] save-layout error:', error);
        throw new Error(`Failed to save layout: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    ipcMain.handle('get-layouts', async () => {
      return layoutStore.getAllLayouts();
    });

    ipcMain.handle('restore-layout', async (_event, layoutId: string) => {
      const layout = layoutStore.getLayout(layoutId);
      if (!layout) return { success: false, restoredCount: 0, launchedCount: 0, failedCount: 0, errors: ['Layout not found'] };

      const result = await windowManager.restoreLayout(layout, false);
      layoutStore.setCurrentLayout(layoutId);
      return result;
    });

    ipcMain.handle('restore-layout-with-launch', async (_event, layoutId: string) => {
      const layout = layoutStore.getLayout(layoutId);
      if (!layout) return { success: false, restoredCount: 0, launchedCount: 0, failedCount: 0, errors: ['Layout not found'] };

      const result = await windowManager.restoreLayout(layout, true);
      layoutStore.setCurrentLayout(layoutId);
      return result;
    });

    ipcMain.handle('delete-layout', async (_event, layoutId: string) => {
      return layoutStore.deleteLayout(layoutId);
    });

    ipcMain.handle('update-layout', async (_event, layoutId: string, updates: any) => {
      return layoutStore.updateLayout(layoutId, updates);
    });

    ipcMain.handle('get-current-layout-name', async () => {
      return layoutStore.getCurrentLayoutName();
    });

    ipcMain.handle('get-most-recent-layout', async () => {
      return layoutStore.getMostRecentLayout();
    });

    ipcMain.handle('minimize-window', () => {
      mainWindow?.minimize();
    });

    ipcMain.handle('maximize-window', () => {
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow?.maximize();
      }
    });

    ipcMain.handle('close-window', () => {
      mainWindow?.hide();
    });

    ipcMain.handle('is-maximized', () => {
      return mainWindow?.isMaximized() ?? false;
    });
  };

  app.whenReady().then(() => {
    windowManager = new WindowManager();
    layoutStore = new LayoutStore();
    monitorWatcher = new MonitorWatcher();

    createWindow();
    createTray();
    setupIpcHandlers();

    monitorWatcher.start();
  });

  app.on('window-all-closed', () => {
    // Stay alive in tray even when window is closed.
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    try { monitorWatcher?.stop(); } catch { /* ignore */ }
  });
}
