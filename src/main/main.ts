import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, globalShortcut, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { WindowManager } from './windowManager';
import { LayoutStore } from './layoutStore';
import { MonitorWatcher } from './monitorWatcher';
import { AppSettings, Schedule, SavedLayout } from './types';

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
  app.on('second-instance', () => {
    console.log('[WLM] Second instance detected — quitting this instance so the new one can take over.');
    isQuitting = true;
    try { monitorWatcher?.stop(); } catch { /* ignore */ }
    app.quit();
  });

  bootstrap();
}

// ---------- Startup arguments ----------
// We support `--hidden` (passed by our own login item entry when the
// user has "Start minimized" enabled) to begin life in the tray.
const startedHidden = process.argv.includes('--hidden') || process.argv.includes('--openAsHidden');

function bootstrap(): void {
  // Build a deferred-start wrapper. The window is created hidden
  // immediately if we were launched with --hidden, so the tray icon is
  // the only thing the user sees. They can open the main window from
  // the tray at any time.
  const createWindow = (): void => {
    mainWindow = new BrowserWindow({
      width: 900,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      frame: false,
      transparent: false,
      resizable: true,
      show: !startedHidden,
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
    // Tray icons should be native 16x16 for crisp rendering on standard DPI
    // displays. We have a dedicated rasterized asset for exactly this size.
    // NOTE: the assets live at the asar root, not inside dist/, so we need
    // TWO levels of "..": __dirname is dist/main/, so ../../assets/ is correct.
    const iconPath = path.join(__dirname, '../../assets/icon-16.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);

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

  // ---------- Login item (Start with Windows) ----------
  function applyLoginItemSettings(s: AppSettings): void {
    try {
      // If startWithWindows is on, register our app. The args flag carries
      // `--hidden` so the launched process starts minimized (handled in
      // `startedHidden` above).
      const args = s.startMinimized ? ['--hidden'] : [];
      app.setLoginItemSettings({
        openAtLogin: s.startWithWindows,
        openAsHidden: s.startMinimized,
        args
      });
    } catch (error) {
      console.error('[WLM] Failed to set login item settings:', error);
    }
  }

  // ---------- Global hotkeys ----------
  // We register/unregister hotkeys for layouts as they change. The accelerator
  // format follows Electron's `globalShortcut` rules (e.g. "CommandOrControl+Alt+1").
  function registerAllHotkeys(): void {
    globalShortcut.unregisterAll();
    if (!layoutStore) return;
    const layouts = layoutStore.getAllLayouts();
    for (const layout of layouts) {
      if (layout.hotkey && layout.hotkey.trim()) {
        const ok = globalShortcut.register(layout.hotkey, () => {
          console.log('[WLM] Hotkey fired for layout:', layout.name);
          triggerLayoutRestore(layout, false);
        });
        if (!ok) {
          console.warn('[WLM] Failed to register hotkey', layout.hotkey, 'for layout', layout.name);
        }
      }
    }
  }

  async function triggerLayoutRestore(layout: SavedLayout, launchApps: boolean): Promise<void> {
    try {
      const result = launchApps
        ? await windowManager.restoreLayout(layout, true)
        : await windowManager.restoreLayout(layout, false);
      console.log('[WLM] Hotkey restore result:', result);
      // Briefly show the main window so the user gets visual feedback.
      if (mainWindow) {
        mainWindow.show();
        mainWindow.webContents.send('hotkey-restored', { layoutName: layout.name, result });
      }
    } catch (error) {
      console.error('[WLM] Hotkey restore error:', error);
    }
  }

  // ---------- Scheduler ----------
  // Track which (scheduleId, dayKey) tuples have already fired today so
  // we don't keep re-firing while the loop is ticking at sub-minute granularity.
  const firedToday = new Map<string, string>(); // scheduleId -> "YYYY-MM-DD"
  let schedulerTimer: NodeJS.Timeout | null = null;

  function dayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function parseHHMM(s: string): { h: number; m: number } | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return { h, m: mm };
  }

  function tickScheduler(): void {
    if (!layoutStore) return;
    const settings = layoutStore.getSettings();
    if (!settings.schedulesEnabled) return;
    const layouts = layoutStore.getAllLayouts();
    const now = new Date();
    const dayK = dayKey(now);

    for (const layout of layouts) {
      const schedules = layout.schedules || [];
      for (const sched of schedules) {
        const parsed = parseHHMM(sched.time);
        if (!parsed) continue;
        if (!sched.days.includes(now.getDay())) continue;
        if (now.getHours() === parsed.h && now.getMinutes() === parsed.m) {
          if (firedToday.get(sched.id) === dayK) continue;
          firedToday.set(sched.id, dayK);
          console.log('[WLM] Schedule fired:', sched.time, 'layout:', layout.name, 'launchApps:', sched.launchApps);
          triggerLayoutRestore(layout, !!sched.launchApps);
        }
      }
    }
  }

  function startScheduler(): void {
    stopScheduler();
    // Tick every 20s — fine enough to not miss minute boundaries, but
    // not so often that we waste cycles.
    schedulerTimer = setInterval(tickScheduler, 20 * 1000);
    // Also tick once on startup in case the app was launched into a time
    // that matches a schedule (e.g. the user rebooted at 09:00).
    setTimeout(tickScheduler, 2000);
  }

  function stopScheduler(): void {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  }

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
      const ok = layoutStore.deleteLayout(layoutId);
      if (ok) registerAllHotkeys();
      return ok;
    });

    ipcMain.handle('update-layout', async (_event, layoutId: string, updates: any) => {
      const updated = layoutStore.updateLayout(layoutId, updates);
      if (updated && 'hotkey' in updates) {
        registerAllHotkeys();
      }
      return updated;
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

    // ---------- Settings IPC ----------

    ipcMain.handle('get-settings', async () => {
      return layoutStore.getSettings();
    });

    ipcMain.handle('update-settings', async (_event, updates: Partial<AppSettings>) => {
      const updated = layoutStore.updateSettings(updates);
      // Re-apply login item registration when relevant flags change.
      if ('startWithWindows' in updates || 'startMinimized' in updates) {
        applyLoginItemSettings(updated);
      }
      return updated;
    });

    ipcMain.handle('choose-layout-folder', async () => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose folder for layout JSON files',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Use this folder'
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const folder = result.filePaths[0];
      try {
        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
        return folder;
      } catch (err) {
        console.error('[WLM] Failed to use chosen folder:', err);
        return null;
      }
    });

    ipcMain.handle('open-layout-folder', async () => {
      const settings = layoutStore.getSettings();
      const folder = settings.layoutFolder;
      if (folder && fs.existsSync(folder)) {
        await shell.openPath(folder);
      } else {
        // No custom folder set: open the default layouts directory.
        const defaultFolder = path.join(app.getPath('userData'));
        await shell.openPath(defaultFolder);
      }
    });

    // ---------- Hotkey IPC ----------

    ipcMain.handle('set-layout-hotkey', async (_event, layoutId: string, hotkey: string | null) => {
      const layout = layoutStore.getLayout(layoutId);
      if (!layout) return { ok: false, error: 'Layout not found' };

      if (hotkey && hotkey.trim()) {
        // Validate by attempting a trial registration, then roll it back
        // if we re-register everything anyway in registerAllHotkeys().
        const trial = globalShortcut.register(hotkey, () => { /* noop */ });
        if (!trial) {
          return { ok: false, error: `Hotkey "${hotkey}" is already in use by another application` };
        }
        globalShortcut.unregister(hotkey);
      }

      layoutStore.updateLayout(layoutId, { hotkey: hotkey || undefined });
      registerAllHotkeys();
      return { ok: true };
    });

    // ---------- Schedule IPC ----------

    ipcMain.handle('set-layout-schedules', async (_event, layoutId: string, schedules: Schedule[]) => {
      return layoutStore.setLayoutSchedules(layoutId, schedules);
    });
  };

  app.whenReady().then(() => {
    windowManager = new WindowManager();
    layoutStore = new LayoutStore();
    monitorWatcher = new MonitorWatcher();

    createWindow();
    createTray();
    setupIpcHandlers();
    applyLoginItemSettings(layoutStore.getSettings());
    registerAllHotkeys();
    startScheduler();

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
    stopScheduler();
    try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
  });
}
