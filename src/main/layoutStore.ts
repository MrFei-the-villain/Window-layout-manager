import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { SavedLayout, Schedule, AppSettings, DEFAULT_SETTINGS } from './types';

interface StoreFileLayouts {
  layouts: SavedLayout[];
  currentLayoutId?: string;
}

const SETTINGS_FILE = 'settings.json';
const LAYOUTS_FILE = 'layouts.json';

/**
 * Two backends are supported:
 *  - Default: single `layouts.json` inside userData
 *  - Custom folder: one file per layout (`<id>.json`) in user-chosen folder
 *
 * Both backends store settings in a single `settings.json` in userData.
 */
export class LayoutStore {
  private userDataPath: string;
  private defaultLayoutsPath: string;
  private settingsPath: string;
  private settings: AppSettings;
  private data: StoreFileLayouts = { layouts: [] };

  constructor() {
    this.userDataPath = app.getPath('userData');
    this.defaultLayoutsPath = path.join(this.userDataPath, LAYOUTS_FILE);
    this.settingsPath = path.join(this.userDataPath, SETTINGS_FILE);
    this.settings = this.loadSettings();
    this.data = this.loadLayouts();
  }

  // ---------- Settings ----------

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.error('[WLM] Error loading settings:', error);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings(): void {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('[WLM] Error saving settings:', error);
    }
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
    // If the layout folder changed, reload layouts from the new backend.
    if ('layoutFolder' in updates) {
      this.data = this.loadLayouts();
    }
    return this.getSettings();
  }

  // ---------- Layouts (storage backend switching) ----------

  private get isFolderBackend(): boolean {
    return !!(this.settings.layoutFolder && this.settings.layoutFolder.trim());
  }

  private get currentLayoutsPath(): string {
    return this.isFolderBackend ? this.settings.layoutFolder! : this.defaultLayoutsPath;
  }

  private loadLayouts(): StoreFileLayouts {
    try {
      const file = this.currentLayoutsPath;
      if (this.isFolderBackend) {
        if (!fs.existsSync(file) || !fs.statSync(file).isDirectory()) {
          console.warn('[WLM] Layout folder does not exist or is not a directory:', file);
          return { layouts: [] };
        }
        const entries = fs.readdirSync(file).filter(f => f.toLowerCase().endsWith('.json') && f !== 'index.json');
        const layouts: SavedLayout[] = [];
        for (const entry of entries) {
          try {
            const content = fs.readFileSync(path.join(file, entry), 'utf-8');
            const layout = JSON.parse(content) as SavedLayout;
            layouts.push(layout);
          } catch (err) {
            console.error('[WLM] Failed to read layout file', entry, err);
          }
        }
        return this.readIndexFile(file, layouts);
      }

      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('[WLM] Error loading layout data:', error);
    }
    return { layouts: [] };
  }

  private readIndexFile(folder: string, layouts: SavedLayout[]): StoreFileLayouts {
    const indexPath = path.join(folder, 'index.json');
    let currentLayoutId: string | undefined;
    try {
      if (fs.existsSync(indexPath)) {
        const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        if (typeof parsed.currentLayoutId === 'string') {
          currentLayoutId = parsed.currentLayoutId;
        }
      }
    } catch (err) {
      console.error('[WLM] Error reading index.json:', err);
    }
    return { layouts, currentLayoutId };
  }

  private writeIndexFile(folder: string, currentLayoutId: string | undefined): void {
    try {
      const indexPath = path.join(folder, 'index.json');
      fs.writeFileSync(indexPath, JSON.stringify({ currentLayoutId }, null, 2));
    } catch (err) {
      console.error('[WLM] Error writing index.json:', err);
    }
  }

  private saveLayoutsData(): void {
    try {
      const file = this.currentLayoutsPath;
      if (this.isFolderBackend) {
        if (!fs.existsSync(file)) fs.mkdirSync(file, { recursive: true });
        // Sync the folder with the in-memory list: write each layout, delete files
        // for layouts that no longer exist.
        const keepIds = new Set(this.data.layouts.map(l => l.id));
        const existing = fs.readdirSync(file).filter(f => f.toLowerCase().endsWith('.json') && f !== 'index.json');
        for (const f of existing) {
          const id = f.replace(/\.json$/i, '');
          if (!keepIds.has(id)) {
            try { fs.unlinkSync(path.join(file, f)); } catch { /* ignore */ }
          }
        }
        for (const layout of this.data.layouts) {
          fs.writeFileSync(
            path.join(file, `${layout.id}.json`),
            JSON.stringify(layout, null, 2)
          );
        }
        this.writeIndexFile(file, this.data.currentLayoutId);
      } else {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(this.data, null, 2));
      }
    } catch (error) {
      console.error('[WLM] Error saving layout data:', error);
    }
  }

  // ---------- Public layout API ----------

  saveLayout(layout: Omit<SavedLayout, 'id'>): SavedLayout {
    try {
      const newLayout: SavedLayout = {
        ...layout,
        id: uuidv4()
      };
      this.data.layouts.push(newLayout);
      this.data.currentLayoutId = newLayout.id;
      this.saveLayoutsData();
      return newLayout;
    } catch (error) {
      console.error('[WLM] saveLayout error:', error);
      throw new Error(`Failed to save layout: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getAllLayouts(): SavedLayout[] {
    return [...this.data.layouts].sort((a, b) => b.createdAt - a.createdAt);
  }

  getLayout(id: string): SavedLayout | undefined {
    return this.data.layouts.find(l => l.id === id);
  }

  deleteLayout(id: string): boolean {
    const index = this.data.layouts.findIndex(l => l.id === id);
    if (index === -1) return false;
    this.data.layouts.splice(index, 1);
    if (this.data.currentLayoutId === id) {
      this.data.currentLayoutId = undefined;
    }
    this.saveLayoutsData();
    return true;
  }

  updateLayout(id: string, updates: Partial<SavedLayout>): SavedLayout | undefined {
    const layout = this.data.layouts.find(l => l.id === id);
    if (!layout) return undefined;
    Object.assign(layout, updates, { updatedAt: Date.now() });
    this.saveLayoutsData();
    return layout;
  }

  setLayoutSchedules(id: string, schedules: Schedule[]): SavedLayout | undefined {
    return this.updateLayout(id, { schedules });
  }

  getCurrentLayoutName(): string | null {
    if (!this.data.currentLayoutId) return null;
    const layout = this.getLayout(this.data.currentLayoutId);
    return layout?.name || null;
  }

  getCurrentLayout(): SavedLayout | undefined {
    if (!this.data.currentLayoutId) return undefined;
    return this.getLayout(this.data.currentLayoutId);
  }

  getMostRecentLayout(): SavedLayout | undefined {
    if (this.data.currentLayoutId) {
      const current = this.getLayout(this.data.currentLayoutId);
      if (current) return current;
    }
    const sorted = [...this.data.layouts].sort((a, b) => b.createdAt - a.createdAt);
    return sorted[0];
  }

  setCurrentLayout(id: string): void {
    this.data.currentLayoutId = id;
    this.saveLayoutsData();
  }
}
