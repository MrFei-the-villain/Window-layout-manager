import { screen } from 'electron';
import { MonitorInfo } from './types';

type MonitorChangeCallback = (config: MonitorInfo[]) => void;

export class MonitorWatcher {
  private interval: NodeJS.Timeout | null = null;
  private lastMonitorConfig: string = '';
  private callbacks: MonitorChangeCallback[] = [];

  start(): void {
    this.lastMonitorConfig = this.getMonitorConfigHash();

    this.interval = setInterval(() => {
      this.checkMonitorChange();
    }, 2000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private getMonitorConfigHash(): string {
    const displays = screen.getAllDisplays();
    return displays
      .map(d => `${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y}`)
      .sort()
      .join('|');
  }

  private checkMonitorChange(): void {
    const currentConfig = this.getMonitorConfigHash();

    if (currentConfig !== this.lastMonitorConfig) {
      this.lastMonitorConfig = currentConfig;
      const displays = screen.getAllDisplays();
      const primaryDisplay = screen.getPrimaryDisplay();
      const monitors: MonitorInfo[] = displays.map((display, index) => ({
        id: `monitor_${index}`,
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        isPrimary: display.id === primaryDisplay.id,
        displayFrequency: display.displayFrequency || 60,
        scaleFactor: display.scaleFactor || 1,
      }));
      this.callbacks.forEach(cb => cb(monitors));
    }
  }

  on(event: 'change', callback: MonitorChangeCallback): void {
    if (event === 'change') {
      this.callbacks.push(callback);
    }
  }

  off(event: 'change', callback: MonitorChangeCallback): void {
    if (event === 'change') {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    }
  }
}
