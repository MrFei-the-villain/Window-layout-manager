import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { SavedLayout, LayoutStoreData } from './types';

export class LayoutStore {
  private dataPath: string;
  private data: LayoutStoreData;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dataPath = path.join(userDataPath, 'layouts.json');
    this.data = this.loadData();
  }

  private loadData(): LayoutStoreData {
    try {
      if (fs.existsSync(this.dataPath)) {
        const content = fs.readFileSync(this.dataPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading layout data:', error);
    }

    return {
      layouts: []
    };
  }

  private saveData(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving layout data:', error);
    }
  }

  saveLayout(layout: Omit<SavedLayout, 'id'>): SavedLayout {
    try {
      const newLayout: SavedLayout = {
        ...layout,
        id: uuidv4()
      };

      this.data.layouts.push(newLayout);
      this.data.currentLayoutId = newLayout.id;
      this.saveData();

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

    this.data.layouts.splice(index, index >= 0 ? 1 : 0);

    if (this.data.currentLayoutId === id) {
      this.data.currentLayoutId = undefined;
    }

    this.saveData();
    return true;
  }

  updateLayout(id: string, updates: Partial<SavedLayout>): SavedLayout | undefined {
    const layout = this.data.layouts.find(l => l.id === id);
    if (!layout) return undefined;

    Object.assign(layout, updates, { updatedAt: Date.now() });
    this.saveData();
    return layout;
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
    this.saveData();
  }
}
