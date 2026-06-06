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
  tags?: string[];
}

export interface LayoutStoreData {
  layouts: SavedLayout[];
  currentLayoutId?: string;
}

export interface RestoreResult {
  success: boolean;
  restoredCount: number;
  launchedCount?: number;
  failedCount: number;
  errors: string[];
}
