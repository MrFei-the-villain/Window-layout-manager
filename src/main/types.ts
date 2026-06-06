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

export interface Schedule {
  /** Unique id for this schedule entry */
  id: string;
  /** "HH:MM" 24-hour local time */
  time: string;
  /** Days of the week the schedule fires on. 0 = Sunday, 6 = Saturday */
  days: number[];
  /** When true, scheduled restore will also launch apps that are not running */
  launchApps: boolean;
}

export interface SavedLayout {
  id: string;
  name: string;
  windows: WindowInfo[];
  monitors: MonitorInfo[];
  createdAt: number;
  updatedAt?: number;
  tags?: string[];
  /** Optional global hotkey accelerator, e.g. "CommandOrControl+Alt+1" */
  hotkey?: string;
  /** Scheduled auto-restore entries */
  schedules?: Schedule[];
}

export interface LayoutStoreData {
  layouts: SavedLayout[];
  currentLayoutId?: string;
}

export interface AppSettings {
  startWithWindows: boolean;
  startMinimized: boolean;
  /** Optional custom folder for layout JSON files. When set, layouts are
   *  read/written as individual files in this folder. When null/empty, the
   *  default userData/layouts.json store is used. */
  layoutFolder: string | null;
  /** Master switch for the scheduled-restore feature */
  schedulesEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  startWithWindows: false,
  startMinimized: false,
  layoutFolder: null,
  schedulesEnabled: true,
};

export interface RestoreResult {
  success: boolean;
  restoredCount: number;
  launchedCount?: number;
  failedCount: number;
  errors: string[];
}
