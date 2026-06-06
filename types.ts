export interface WindowInfo {
  id: string;
  title: string;
  processName: string;
  smartName?: string;
  processPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  monitorId: string;
  isMinimized: boolean;
  isMaximized: boolean;
  hwnd: number;
}

export interface MonitorInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isPrimary: boolean;
  displayFrequency: number;
  scaleFactor: number;
}

export interface SavedLayout {
  id: string;
  name: string;
  windows: WindowInfo[];
  monitors: MonitorInfo[];
  createdAt: number;
  updatedAt?: number;
  autoSwitchOnMonitorChange?: boolean;
  tags?: string[];
}

export interface RestoreResult {
  success: boolean;
  restoredCount: number;
  launchedCount?: number;
  failedCount: number;
  errors: string[];
}

declare global {
  interface Window {
    electronAPI: {
      getAllWindows: () => Promise<WindowInfo[]>;
      getMonitors: () => Promise<MonitorInfo[]>;
      saveLayout: (name: string, windowIds?: string[]) => Promise<SavedLayout>;
      getLayouts: () => Promise<SavedLayout[]>;
      restoreLayout: (layoutId: string) => Promise<RestoreResult>;
      restoreLayoutWithLaunch: (layoutId: string) => Promise<RestoreResult>;
      deleteLayout: (layoutId: string) => Promise<boolean>;
      updateLayout: (layoutId: string, updates: Partial<SavedLayout>) => Promise<SavedLayout | undefined>;
      getCurrentLayoutName: () => Promise<string | null>;
      getMostRecentLayout: () => Promise<SavedLayout | undefined>;
      getDebugInfo: () => Promise<any>;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      isMaximized: () => Promise<boolean>;
      onQuickSaveLayout: (callback: () => void) => () => void;
      onQuickRestoreLayout: (callback: () => void) => () => void;
    };
  }
}

export {};
