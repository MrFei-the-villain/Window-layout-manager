import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAllWindows: () => ipcRenderer.invoke('get-all-windows'),
  getMonitors: () => ipcRenderer.invoke('get-monitors'),
  saveLayout: (name: string, windowIds?: string[]) =>
    ipcRenderer.invoke('save-layout', name, windowIds),
  getLayouts: () => ipcRenderer.invoke('get-layouts'),
  restoreLayout: (layoutId: string) =>
    ipcRenderer.invoke('restore-layout', layoutId),
  restoreLayoutWithLaunch: (layoutId: string) =>
    ipcRenderer.invoke('restore-layout-with-launch', layoutId),
  deleteLayout: (layoutId: string) =>
    ipcRenderer.invoke('delete-layout', layoutId),
  updateLayout: (layoutId: string, updates: any) =>
    ipcRenderer.invoke('update-layout', layoutId, updates),
  getCurrentLayoutName: () => ipcRenderer.invoke('get-current-layout-name'),
  getMostRecentLayout: () => ipcRenderer.invoke('get-most-recent-layout'),
  getDebugInfo: () => ipcRenderer.invoke('get-debug-info'),

  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),

  onQuickSaveLayout: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('quick-save-layout', handler);
    return () => { ipcRenderer.removeListener('quick-save-layout', handler); };
  },
  onQuickRestoreLayout: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('quick-restore-layout', handler);
    return () => { ipcRenderer.removeListener('quick-restore-layout', handler); };
  },
  onHotkeyRestored: (callback: (payload: { layoutName: string; result: any }) => void) => {
    const handler = (_e: unknown, payload: { layoutName: string; result: any }) => callback(payload);
    ipcRenderer.on('hotkey-restored', handler);
    return () => { ipcRenderer.removeListener('hotkey-restored', handler); };
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (updates: any) => ipcRenderer.invoke('update-settings', updates),
  chooseLayoutFolder: () => ipcRenderer.invoke('choose-layout-folder'),
  openLayoutFolder: () => ipcRenderer.invoke('open-layout-folder'),

  // Hotkeys
  setLayoutHotkey: (layoutId: string, hotkey: string | null) =>
    ipcRenderer.invoke('set-layout-hotkey', layoutId, hotkey),

  // Schedules
  setLayoutSchedules: (layoutId: string, schedules: any[]) =>
    ipcRenderer.invoke('set-layout-schedules', layoutId, schedules)
});
