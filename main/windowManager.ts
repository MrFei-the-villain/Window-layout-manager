import { screen, app } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { WindowInfo, MonitorInfo, SavedLayout, RestoreResult } from './types';

const execAsync = promisify(exec);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

const SMART_APP_NAMES: Record<string, string> = {
  'chrome': 'Google Chrome',
  'msedge': 'Microsoft Edge',
  'firefox': 'Mozilla Firefox',
  'brave': 'Brave Browser',
  'opera': 'Opera',
  'discord': 'Discord',
  'slack': 'Slack',
  'teams': 'Microsoft Teams',
  'spotify': 'Spotify',
  'vscodium': 'VSCode',
  'code': 'VSCode',
  'notepad++': 'Notepad++',
  'notepad': 'Notepad',
  'explorer': 'File Explorer',
  'powershell': 'PowerShell',
  'cmd': 'Command Prompt',
  'windowsterminal': 'Windows Terminal',
  'devenv': 'Visual Studio',
  'idea': 'IntelliJ IDEA',
  'pycharm': 'PyCharm',
  'webstorm': 'WebStorm',
  'sublime_text': 'Sublime Text',
  'atom': 'Atom',
  'figma': 'Figma',
  'photoshop': 'Adobe Photoshop',
  'illustrator': 'Adobe Illustrator',
  'acrobat': 'Adobe Acrobat',
  'excel': 'Microsoft Excel',
  'winword': 'Microsoft Word',
  'powerpnt': 'Microsoft PowerPoint',
  'outlook': 'Microsoft Outlook',
  'putty': 'PuTTY',
  'wsl': 'WSL',
  'virtualbox': 'VirtualBox',
  'vmware': 'VMware',
  'docker': 'Docker Desktop',
  'postman': 'Postman',
  'obsidian': 'Obsidian',
  'notion': 'Notion',
  'obs': 'OBS Studio',
  'steam': 'Steam',
  'epicgameslauncher': 'Epic Games',
  'origin': 'Origin',
  'gog': 'GOG Galaxy',
};

const SYSTEM_APPS_TO_FILTER = [
  'window layout manager',
  'shellexperiencehost',
  'searchui',
  'searchhost',
  'startmenuexperiencehost',
  'cortana',
  'textinputhost',
  'applicationframehost',
  'systemsettings',
  'ms-settings:',
  'windows.immersive.controlpanel',
  'pwaurimanager',
  'runtimebroker',
  'taskhostw',
  'sihost',
  'ctfmon',
  'dwm',
  'explorer',
  'windowmgr',
  'systemidleprocess',
  'registry',
  'svchost',
  'services',
  'lsass',
  'conhost',
  'fontdrvhost',
  'wmiprvse',
  'audiodg',
  'winlogon',
  'csrss',
  'smss',
  'spoolsv',
  'securityhealthservice',
  'msmpeng',
  'nissrv',
  'searchindexer',
  'wmiadap',
  'dllhost',
  'rundll32',
  'mmc',
  'taskmgr',
  'displayswitch',
  'sethc',
  'magnify',
  'narrator',
  'appidtel',
  'igfxtray',
  'windows.internal.shell.TabProxyWindow',
  'lockscreen',
  'splash',
];

export class WindowManager {
  private cachedWindows: WindowInfo[] = [];

  private isSystemApp(processName: string): boolean {
    const lower = processName.toLowerCase();
    return SYSTEM_APPS_TO_FILTER.some(app => lower.includes(app));
  }

  private getSmartName(processName: string): string {
    const lower = processName.toLowerCase();
    for (const [key, value] of Object.entries(SMART_APP_NAMES)) {
      if (lower.includes(key)) {
        return value;
      }
    }
    return processName;
  }

  private shouldFilterWindow(w: any, monitors: MonitorInfo[]): boolean {
    if (w.IsMinimized) return true;
    if (this.isSystemApp(w.ProcessName)) return true;
    if (!w.Title || w.Title.trim() === '') return true;
    if (w.ProcessName === 'Window Layout Manager') return true;
    if (w.Width < 100 || w.Height < 100) return true;
    
    if (w.Width > 100 && w.Height > 100) {
      const monitor = monitors.find(m => 
        Math.abs(m.x - (w.MonitorX || 0)) < 10 && Math.abs(m.y - (w.MonitorY || 0)) < 10
      ) || monitors[0];
      
      if (monitor) {
        const sameRes = Math.abs(w.Width - monitor.width) < 5 && Math.abs(w.Height - monitor.height) < 5;
        const atOrigin = w.X === monitor.x && w.Y === monitor.y;
        if (sameRes && atOrigin) {
          const titleLower = (w.Title || '').toLowerCase();
          if (
            titleLower.includes('start') ||
            titleLower.includes('settings') ||
            titleLower.includes('search') ||
            titleLower.includes('cortana') ||
            titleLower.includes('notification') ||
            titleLower.includes('task view') ||
            titleLower.includes('quick settings') ||
            titleLower.includes('widget')
          ) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  async getAllWindows(): Promise<WindowInfo[]> {
    try {
      console.log('[WLM] getAllWindows called');
      const monitors = this.getMonitors();
      console.log('[WLM] getAllWindows: monitors =', monitors.length);
      let rawWindows: any[] = [];

      rawWindows = await this.enumViaCSharpPS();
      console.log('[WLM] getAllWindows: C# returned', rawWindows.length, 'windows');

      if (rawWindows.length === 0) {
        console.log('[WLM] C# method returned 0, trying simple PS fallback...');
        rawWindows = await this.enumViaSimplePS();
        console.log('[WLM] getAllWindows: Simple PS returned', rawWindows.length, 'windows');
      }

      const beforeFilter = rawWindows.length;
      this.cachedWindows = rawWindows
        .filter((w: any) => !this.shouldFilterWindow(w, monitors))
        .map((w: any) => this.mapToWindowInfo(w, monitors));

      console.log(`[WLM] Found ${this.cachedWindows.length} windows (raw: ${beforeFilter}, filtered: ${beforeFilter - this.cachedWindows.length})`);
      return this.cachedWindows;
    } catch (error) {
      console.error('[WLM] Error getting windows:', error);
      return [];
    }
  }

  private async enumViaCSharpPS(): Promise<any[]> {
    const scriptPath = path.join(app.getPath('temp'), 'wlm_enum.ps1');
    const script = `Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;

public static class WinEnum {
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);
    [DllImport("user32.dll")] private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct MONITORINFO {
        public int cbSize; public RECT rcMonitor; public RECT rcWork; public int dwFlags;
    }
    private const uint MONITOR_DEFAULTTONEAREST = 2;
    public static string Collect() {
        var results = new List<object>();
        foreach (var proc in Process.GetProcesses()) {
            try {
                if (proc.MainWindowHandle == IntPtr.Zero) continue;
                if (!IsWindowVisible(proc.MainWindowHandle)) continue;
                int len = GetWindowTextLength(proc.MainWindowHandle);
                if (len == 0) continue;
                var title = new StringBuilder(len + 1);
                GetWindowText(proc.MainWindowHandle, title, len + 1);
                RECT rect;
                GetWindowRect(proc.MainWindowHandle, out rect);
                int width = rect.Right - rect.Left;
                int height = rect.Bottom - rect.Top;
                IntPtr monitor = MonitorFromWindow(proc.MainWindowHandle, MONITOR_DEFAULTTONEAREST);
                MONITORINFO mi = new MONITORINFO();
                mi.cbSize = Marshal.SizeOf(mi);
                GetMonitorInfo(monitor, ref mi);
                string procPath = "";
                try { procPath = proc.MainModule.FileName; } catch { }
                results.Add(new {
                    Hwnd = proc.MainWindowHandle.ToInt64(),
                    Title = title.ToString(),
                    ProcessName = proc.ProcessName,
                    ProcessPath = procPath,
                    X = rect.Left,
                    Y = rect.Top,
                    Width = width,
                    Height = height,
                    MonitorX = mi.rcMonitor.Left,
                    MonitorY = mi.rcMonitor.Top,
                    IsMinimized = IsIconic(proc.MainWindowHandle),
                    IsMaximized = IsZoomed(proc.MainWindowHandle)
                });
            } catch { }
        }
        var ser = new System.Web.Script.Serialization.JavaScriptSerializer();
        ser.MaxJsonLength = Int32.MaxValue;
        return ser.Serialize(results);
    }
}
"@ -ReferencedAssemblies System.Web.Extensions

[WinEnum]::Collect()
`;
    try {
      await writeFileAsync(scriptPath, script, 'utf8');
      console.log('[WLM] C# PS: Script written to', scriptPath);
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
        { timeout: 30000 }
      );
      console.log('[WLM] C# PS: stdout length =', stdout.length, 'stderr length =', stderr?.length || 0);
      const trimmed = stdout.trim();
      if (!trimmed) {
        console.log('[WLM] C# PS: Empty output');
        return [];
      }
      const result = JSON.parse(trimmed);
      const windows = Array.isArray(result) ? result : [result];
      console.log(`[WLM] C# method found ${windows.length} raw windows`);
      return windows;
    } catch (e) {
      console.error('[WLM] C# PS failed:', (e as Error).message?.substring(0, 500));
      console.error('[WLM] C# PS error stack:', (e as Error).stack?.substring(0, 500));
      return [];
    } finally {
      try { await unlinkAsync(scriptPath); } catch {}
    }
  }

  private async enumViaSimplePS(): Promise<any[]> {
    const scriptPath = path.join(app.getPath('temp'), 'wlm_simple.ps1');
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WRect {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint f);
    [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr h, ref MI i);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Auto)] public struct MI { public int s; public RECT m,w; public int f; }
}
"@
$procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' }
$results = @()
foreach ($p in $procs) {
    try {
        $hwnd = $p.MainWindowHandle
        $r = [WRect+RECT]::new()
        [WRect]::GetWindowRect($hwnd, [ref]$r) | Out-Null
        $mon = [WRect]::MonitorFromWindow($hwnd, 2)
        $mi = [WRect+MI]::new()
        $mi.s = [Runtime.InteropServices.Marshal]::SizeOf($mi)
        [WRect]::GetMonitorInfo($mon, [ref]$mi) | Out-Null
        $w = $r.R - $r.L
        $h = $r.B - $r.T
        $results += [PSCustomObject]@{
            Hwnd        = $hwnd.ToInt64()
            Title       = $p.MainWindowTitle
            ProcessName = $p.ProcessName
            ProcessPath = if($p.Path){$p.Path}else{''}
            X           = $r.L
            Y           = $r.T
            Width       = $w
            Height      = $h
            MonitorX    = $mi.m.L
            MonitorY    = $mi.m.T
            IsMinimized = [WRect]::IsIconic($hwnd)
            IsMaximized = [WRect]::IsZoomed($hwnd)
        }
    } catch {}
}
$results | ConvertTo-Json -Depth 2
`;
    try {
      await writeFileAsync(scriptPath, script, 'utf8');
      console.log('[WLM] Simple PS: Script written to', scriptPath);
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
        { timeout: 20000 }
      );
      console.log('[WLM] Simple PS: stdout length =', stdout.length, 'stderr length =', stderr?.length || 0);
      const trimmed = stdout.trim();
      if (!trimmed) {
        console.log('[WLM] Simple PS: Empty output');
        return [];
      }
      const result = JSON.parse(trimmed);
      const windows = Array.isArray(result) ? result : [result];
      console.log(`[WLM] Simple PS found ${windows.length} raw windows`);
      return windows;
    } catch (e) {
      console.error('[WLM] Simple PS failed:', (e as Error).message?.substring(0, 500));
      console.error('[WLM] Simple PS error stack:', (e as Error).stack?.substring(0, 500));
      return [];
    } finally {
      try { await unlinkAsync(scriptPath); } catch {}
    }
  }

  private mapToWindowInfo(w: any, monitors: MonitorInfo[]): WindowInfo {
    const monitor = monitors.find(m => 
      Math.abs(m.x - (w.MonitorX || 0)) < 10 && Math.abs(m.y - (w.MonitorY || 0)) < 10
    ) || monitors[0];

    return {
      id: `${w.ProcessName}_${w.Hwnd}`,
      title: w.Title || '',
      processName: w.ProcessName || '',
      smartName: this.getSmartName(w.ProcessName || ''),
      processPath: w.ProcessPath || '',
      x: w.X || 0,
      y: w.Y || 0,
      width: w.Width || 0,
      height: w.Height || 0,
      monitorId: monitor?.id || 'unknown',
      isMinimized: w.IsMinimized || false,
      isMaximized: w.IsMaximized || false,
      hwnd: w.Hwnd || 0
    };
  }

  getMonitors(): MonitorInfo[] {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    return displays.map((display, index) => ({
      id: `monitor_${index}`,
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      isPrimary: display.id === primaryDisplay.id,
      displayFrequency: display.displayFrequency || 60,
      scaleFactor: display.scaleFactor || 1
    }));
  }

  async getDebugInfo(): Promise<any> {
    const info: any = {
      step1_monitors: null as any,
      step2_csharp_raw: null as any,
      step3_simple_raw: null as any,
      step4_final_windows: null as any,
      step5_filtered: null as any,
      tempPath: '',
      tempWrite: '',
      platform: process.platform,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      powershellTest: null as any,
    };

    try {
      info.tempPath = app.getPath('temp');
    } catch (e: any) {
      info.tempPathError = e.message;
    }

    try {
      const testPath = path.join(app.getPath('temp'), 'wlm_test.txt');
      await writeFileAsync(testPath, 'test', 'utf8');
      const content = fs.readFileSync(testPath, 'utf8');
      fs.unlinkSync(testPath);
      info.tempWrite = content === 'test' ? 'OK' : 'MISMATCH: got "' + content + '"';
    } catch (e: any) {
      info.tempWriteError = e.message;
    }

    try {
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | ConvertTo-Json -Depth 2"`,
        { timeout: 15000 }
      );
      const trimmed = stdout.trim();
      info.powershellDirect = {
        stdoutLength: stdout.length,
        stderrLength: stderr?.length || 0,
        stderrPreview: stderr?.substring(0, 500),
      };
      const parsed = trimmed ? JSON.parse(trimmed) : [];
      info.powershellDirect.windowCount = Array.isArray(parsed) ? parsed.length : 1;
      info.powershellDirect.windowNames = Array.isArray(parsed) 
        ? parsed.slice(0, 5).map((p: any) => p.ProcessName) 
        : [parsed.ProcessName];
    } catch (e: any) {
      info.powershellDirectError = e.message.substring(0, 300);
    }

    try {
      info.step1_monitors = this.getMonitors();
    } catch (e: any) {
      info.step1Error = e.message;
    }

    try {
      const raw = await this.enumViaCSharpPS();
      info.step2_csharp_raw = {
        count: raw.length,
        first3: raw.slice(0, 3)
      };
    } catch (e: any) {
      info.step2Error = e.message.substring(0, 300);
    }

    try {
      const raw = await this.enumViaSimplePS();
      info.step3_simple_raw = {
        count: raw.length,
        first3: raw.slice(0, 3)
      };
    } catch (e: any) {
      info.step3Error = e.message.substring(0, 300);
    }

    try {
      const monitors = this.getMonitors();
      let rawWindows: any[] = [];

      const csharpRaw = await this.enumViaCSharpPS();
      if (csharpRaw.length > 0) {
        rawWindows = csharpRaw;
        info.step4_source = 'csharp';
      } else {
        rawWindows = await this.enumViaSimplePS();
        info.step4_source = 'simple';
      }

      info.step4_rawWindows = {
        count: rawWindows.length,
        first3: rawWindows.slice(0, 3)
      };

      const allWindows = rawWindows
        .filter((w: any) => w.Title && w.ProcessName && w.ProcessName !== 'Window Layout Manager')
        .map((w: any) => this.mapToWindowInfo(w, monitors));

      info.step5_filtered = {
        count: allWindows.length,
        first3: allWindows.slice(0, 3)
      };

      this.cachedWindows = allWindows;
    } catch (e: any) {
      info.step4Error = e.message.substring(0, 300);
    }

    return info;
  }

  async restoreLayout(layout: SavedLayout, launchApps: boolean = true): Promise<RestoreResult> {
    const result: RestoreResult = {
      success: true,
      restoredCount: 0,
      failedCount: 0,
      launchedCount: 0,
      errors: []
    };

    // Phase 1: Try to find and position existing visible windows
    const currentWindows = await this.getAllWindows();
    const matchedWindows = new Set<string>();
    // Track which processes already had a window matched, so we don't re-launch
    // a process that is already running (possibly minimized).
    const matchedProcesses = new Set<string>();

    for (const savedWindow of layout.windows) {
      try {
        // Try to find matching window by title prefix
        let targetWindow = currentWindows.find(w =>
          !matchedWindows.has(w.id) &&
          w.processName === savedWindow.processName &&
          w.title.toLowerCase().includes(savedWindow.title.toLowerCase().substring(0, 20))
        );

        // Fall back to process-name match
        if (!targetWindow) {
          targetWindow = currentWindows.find(w =>
            !matchedWindows.has(w.id) &&
            w.processName === savedWindow.processName
          );
        }

        if (targetWindow) {
          matchedWindows.add(targetWindow.id);
          matchedProcesses.add(targetWindow.processName.toLowerCase());
          const restored = await this.positionWindow(targetWindow, savedWindow, layout.monitors);
          if (restored) {
            result.restoredCount++;
            await new Promise(resolve => setTimeout(resolve, 150));
          } else {
            result.failedCount++;
            result.errors.push(`Could not position window: ${savedWindow.title}`);
          }
          continue;
        }
      } catch (error) {
        result.failedCount++;
        result.errors.push(`Error restoring ${savedWindow.title}: ${error}`);
      }
    }

    // Phase 2: For every saved window that wasn't matched to a visible
    // window, check if the process is already running (e.g. minimized).
    // If so, un-minimize + position its existing window. Only launch a
    // new instance when the process is not running at all.
    if (launchApps) {
      for (const savedWindow of layout.windows) {
        if (!savedWindow.processName) continue;
        const procKey = savedWindow.processName.toLowerCase();
        if (matchedProcesses.has(procKey)) continue;

        try {
          // First: try to un-minimize an existing instance
          const restoredFromExisting = await this.restoreMinimizedWindow(savedWindow);
          if (restoredFromExisting) {
            matchedProcesses.add(procKey);
            result.restoredCount++;
            await new Promise(resolve => setTimeout(resolve, 150));
            continue;
          }

          // Process is not running — launch a new instance
          if (!savedWindow.processPath) {
            result.failedCount++;
            result.errors.push(`No path to launch: ${savedWindow.smartName || savedWindow.processName}`);
            continue;
          }
          console.log(`[WLM] Launching: ${savedWindow.processPath}`);
          const launched = await this.launchApp(savedWindow);
          if (launched) {
            result.launchedCount = (result.launchedCount || 0) + 1;
            result.restoredCount++;
            matchedProcesses.add(procKey);
          } else {
            result.failedCount++;
            result.errors.push(`Could not launch: ${savedWindow.smartName || savedWindow.processName}`);
          }
        } catch (error) {
          result.failedCount++;
          result.errors.push(`Error handling ${savedWindow.smartName || savedWindow.processName}: ${error}`);
        }
      }
    }

    result.success = result.restoredCount > 0 || (result.launchedCount || 0) > 0;
    return result;
  }

  /**
   * Find a process's existing window (including minimized ones) and
   * un-minimize + position it. Returns true if a window was restored.
   *
   * Uses EnumWindows to enumerate ALL top-level windows (visible and
   * minimized) and matches by process name. This is more robust than
   * Get-Process because it doesn't depend on MainWindowHandle / Title.
   */
  private async restoreMinimizedWindow(savedWindow: WindowInfo): Promise<boolean> {
    const { processName, hwnd: savedHwnd } = savedWindow;
    const scriptPath = path.join(app.getPath('temp'), `wlm_unmin_${Date.now()}.ps1`);

    // Quote the process name for PowerShell (escape single quotes)
    const safeProcName = processName.replace(/'/g, "''");
    const safeSavedHwnd = Number(savedHwnd) || 0;

    // Enumerate all top-level windows via EnumWindows, group hwnds by
    // process name, then pick the saved hwnd or first match. Then
    // un-minimize and position.
    const script = `Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class WU {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);

    public static List<IntPtr> FindHwndsForProcess(string procName, Int64 savedHwnd) {
         var result = new List<IntPtr>();
         var procByPid = new Dictionary<uint, string>();
         EnumWindows((h, l) => {
             uint pid;
             GetWindowThreadProcessId(h, out pid);
             string name;
             if (!procByPid.TryGetValue(pid, out name)) {
                 try {
                     var p = System.Diagnostics.Process.GetProcessById((int)pid);
                     name = p.ProcessName;
                 } catch { name = ""; }
                 procByPid[pid] = name;
             }
             if (string.Equals(name, procName, StringComparison.OrdinalIgnoreCase)) {
                 // Include any top-level window for this process. We can't
                 // filter by title because minimized windows frequently
                 // report an empty title, but they ARE still real windows.
                 result.Add(h);
             }
             return true;
         }, IntPtr.Zero);
         return result;
     }
}
"@
$procName = "${safeProcName}"
$savedHwnd = [Int64]${safeSavedHwnd}
$targetX = ${Math.round(savedWindow.x)}
$targetY = ${Math.round(savedWindow.y)}
$targetW = ${savedWindow.width}
$targetH = ${savedWindow.height}

$hwnds = [WU]::FindHwndsForProcess($procName, $savedHwnd)
if ($hwnds.Count -eq 0) {
    Write-Output "no-window"
    exit 0
}

# Pick best candidate: prefer exact saved-hwnd match, else first
$hwnd = $null
foreach ($h in $hwnds) {
    if ($h.ToInt64() -eq $savedHwnd) { $hwnd = $h; break }
}
if (-not $hwnd) { $hwnd = $hwnds[0] }

# Un-minimize / un-maximize first
[WU]::ShowWindow($hwnd, 9) | Out-Null   # SW_RESTORE
Start-Sleep -Milliseconds 250
if ([WU]::IsIconic($hwnd)) { [WU]::ShowWindow($hwnd, 9) | Out-Null; Start-Sleep -Milliseconds 200 }
if ([WU]::IsZoomed($hwnd)) { [WU]::ShowWindow($hwnd, 9) | Out-Null; Start-Sleep -Milliseconds 200 }

# Reposition
[WU]::SetWindowPos($hwnd, [IntPtr]::Zero, $targetX, $targetY, $targetW, $targetH, 0x40 -bor 0x4) | Out-Null
Start-Sleep -Milliseconds 100
[WU]::MoveWindow($hwnd, $targetX, $targetY, $targetW, $targetH, $true) | Out-Null
Start-Sleep -Milliseconds 100
[WU]::SetForegroundWindow($hwnd) | Out-Null

Write-Output ("restored:" + $hwnd.ToInt64())
`;

    try {
      await writeFileAsync(scriptPath, script, 'utf8');
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
        { timeout: 15000 }
      );
      const trimmed = (stdout || '').trim();
      console.log(`[WLM] restoreMinimizedWindow(${processName}) stdout="${trimmed}" stderr="${(stderr || '').substring(0, 200)}"`);
      const ok = trimmed.startsWith('restored:');
      return ok;
    } catch (error) {
      console.error(`[WLM] restoreMinimizedWindow failed for ${processName}:`, error);
      return false;
    } finally {
      try { await unlinkAsync(scriptPath); } catch { }
    }
  }

  private async launchApp(savedWindow: WindowInfo): Promise<boolean> {
    const { processPath, title, x, y, width, height, monitorId } = savedWindow;
    
    if (!processPath) {
      console.log(`[WLM] No processPath for: ${title}`);
      return false;
    }

    try {
      // Launch the application
      await execAsync(`start "" "${processPath}"`, { timeout: 5000 });
      console.log(`[WLM] Launched: ${processPath}`);

      // Wait for the window to appear (up to 10 seconds)
      const maxWait = 10000;
      const interval = 500;
      let attempts = 0;
      let newWindow: WindowInfo | null = null;

      while (attempts * interval < maxWait) {
        await new Promise(resolve => setTimeout(resolve, interval));
        const windows = await this.getAllWindows();
        
        // Find a newly opened window matching this process
        const found = windows.find(w => 
          w.processPath.toLowerCase() === processPath.toLowerCase() &&
          !w.isMinimized
        );
        newWindow = found || null;

        if (newWindow) break;
        attempts++;
      }

      if (newWindow) {
        // Position the newly launched window
        console.log(`[WLM] Positioning launched window: ${newWindow.title}`);
        return await this.positionWindow(newWindow, savedWindow, []);
      }

      console.log(`[WLM] Window did not appear for: ${processPath}`);
      return false;
    } catch (error) {
      console.error(`[WLM] Failed to launch ${processPath}:`, error);
      return false;
    }
  }

  private async positionWindow(targetWindow: WindowInfo, savedWindow: WindowInfo, savedMonitors: MonitorInfo[]): Promise<boolean> {
    const currentMonitors = this.getMonitors();
    const savedMonitor = savedMonitors.find(m => m.id === savedWindow.monitorId);
    const currentMonitor = currentMonitors.find(m => 
      savedMonitor && Math.abs(m.width - savedMonitor.width) < 100 && 
      Math.abs(m.height - savedMonitor.height) < 100
    ) || currentMonitors[0];

    let newX = savedWindow.x;
    let newY = savedWindow.y;
    let newWidth = savedWindow.width;
    let newHeight = savedWindow.height;

    if (savedMonitor && currentMonitor) {
      const offsetX = currentMonitor.x - savedMonitor.x;
      const offsetY = currentMonitor.y - savedMonitor.y;
      newX = savedWindow.x + offsetX;
      newY = savedWindow.y + offsetY;
    }

    // If the window was saved as maximized, restore to that size on the current monitor
    const wasMaximized = savedWindow.isMaximized;
    
    // Get the actual current monitor's dimensions (subtract taskbar space)
    const usableHeight = currentMonitor ? currentMonitor.height - 40 : newHeight;
    
    console.log(`[WLM] Positioning "${savedWindow.title}" -> (${Math.round(newX)}, ${Math.round(newY)}) ${newWidth}x${newHeight}, wasMaximized=${wasMaximized}`);

    const scriptPath = path.join(app.getPath('temp'), 'wlm_restore.ps1');
    const script = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class WR {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int X, int Y, int cx, int cy, uint f);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
}
"@
$hwnd = [IntPtr]${targetWindow.hwnd}
$targetX = ${Math.round(newX)}
$targetY = ${Math.round(newY)}
$targetW = ${newWidth}
$targetH = ${newHeight}
$shouldMaximize = $${wasMaximized ? 'true' : 'false'}

# Step 1: If window is currently maximized, restore it first
if ([WR]::IsZoomed($hwnd)) {
    [WR]::ShowWindow($hwnd, 9) | Out-Null  # SW_RESTORE
    Start-Sleep -Milliseconds 250
}

# Step 2: If window is minimized, restore it
if ([WR]::IsIconic($hwnd)) {
    [WR]::ShowWindow($hwnd, 9) | Out-Null  # SW_RESTORE
    Start-Sleep -Milliseconds 250
}

# Step 3: Force window to target position and size
# Use SetWindowPos with SWP_SHOWWINDOW (0x40) and SWP_NOZORDER (0x4) flags
[WR]::SetWindowPos($hwnd, [IntPtr]::Zero, $targetX, $targetY, $targetW, $targetH, 0x40 -bor 0x4) | Out-Null
Start-Sleep -Milliseconds 100

# Step 4: Verify the move worked - if not, try again with MoveWindow
[WR]::MoveWindow($hwnd, $targetX, $targetY, $targetW, $targetH, $true) | Out-Null
Start-Sleep -Milliseconds 100

# Step 5: If should be maximized, maximize it now
if ($shouldMaximize) {
    [WR]::ShowWindow($hwnd, 3) | Out-Null  # SW_MAXIMIZE
    Start-Sleep -Milliseconds 200
}

# Step 6: Bring to foreground
[WR]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 50
`;

    try {
      await writeFileAsync(scriptPath, script, 'utf8');
      await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 15000 });
      return true;
    } catch (error) {
      console.error('[WLM] Position failed:', error);
      return false;
    } finally {
      try { await unlinkAsync(scriptPath); } catch { }
    }
  }

  private detectSnapLayout(x: number, y: number, width: number, height: number, monitor: MonitorInfo): string | null {
    if (!monitor) return null;

    const tolerance = 30;
    const halfWidth = Math.round(monitor.width / 2);
    const halfHeight = Math.round(monitor.height / 2);
    const thirdWidth = Math.round(monitor.width / 3);
    const quarterWidth = Math.round(monitor.width / 4);
    const thirdHeight = Math.round(monitor.height / 3);

    // Windows 11 Snap Layout templates (Win+Z)
    // Template 1: Two columns (50-50)
    // Template 2: Three columns (33-33-33)
    // Template 3: Three columns (25-50-25)
    // Template 4: Four columns (25-25-25-25)
    // Template 5: Left column + two right columns (50-25-25)
    // Template 6: Two left columns + right column (25-25-50)

    // Check for maximized (full screen)
    if (Math.abs(width - monitor.width) < tolerance && Math.abs(height - monitor.height) < tolerance &&
        Math.abs(x - monitor.x) < tolerance && Math.abs(y - monitor.y) < tolerance) {
      return 'maximize';
    }

    // Template 4: Four columns (25-25-25-25)
    if (Math.abs(width - quarterWidth) < tolerance && Math.abs(height - monitor.height) < tolerance) {
      if (Math.abs(x - monitor.x) < tolerance) return 'fourCol1';
      if (Math.abs(x - (monitor.x + quarterWidth)) < tolerance) return 'fourCol2';
      if (Math.abs(x - (monitor.x + quarterWidth * 2)) < tolerance) return 'fourCol3';
      if (Math.abs(x - (monitor.x + quarterWidth * 3)) < tolerance) return 'fourCol4';
    }

    // Template 2: Three equal columns (33-33-33)
    if (Math.abs(width - thirdWidth) < tolerance && Math.abs(height - monitor.height) < tolerance) {
      if (Math.abs(x - monitor.x) < tolerance) return 'threeCol1';
      if (Math.abs(x - (monitor.x + thirdWidth)) < tolerance) return 'threeCol2';
      if (Math.abs(x - (monitor.x + thirdWidth * 2)) < tolerance) return 'threeCol3';
    }

    // Template 3: Three columns (25-50-25)
    if (Math.abs(height - monitor.height) < tolerance) {
      // Left column (25%)
      if (Math.abs(width - quarterWidth) < tolerance && Math.abs(x - monitor.x) < tolerance) {
        return 'threeColWide1';
      }
      // Center column (50%)
      if (Math.abs(width - halfWidth) < tolerance && Math.abs(x - (monitor.x + quarterWidth)) < tolerance) {
        return 'threeColWide2';
      }
      // Right column (25%)
      if (Math.abs(width - quarterWidth) < tolerance && Math.abs(x - (monitor.x + quarterWidth * 3)) < tolerance) {
        return 'threeColWide3';
      }
    }

    // Template 5: Left column (50%) + two right columns (25-25)
    // Left half
    if (Math.abs(width - halfWidth) < tolerance && Math.abs(height - monitor.height) < tolerance &&
        Math.abs(x - monitor.x) < tolerance && Math.abs(y - monitor.y) < tolerance) {
      return 'leftHalfRightQuarters1';
    }
    // Top-right quarter
    if (Math.abs(width - quarterWidth) < tolerance && Math.abs(height - halfHeight) < tolerance &&
        Math.abs(x - (monitor.x + halfWidth)) < tolerance && Math.abs(y - monitor.y) < tolerance) {
      return 'leftHalfRightQuarters2';
    }
    // Bottom-right quarter
    if (Math.abs(width - quarterWidth) < tolerance && Math.abs(height - halfHeight) < tolerance &&
        Math.abs(x - (monitor.x + halfWidth)) < tolerance && Math.abs(y - (monitor.y + halfHeight)) < tolerance) {
      return 'leftHalfRightQuarters3';
    }

    // Template 6: Two left columns (25-25) + right column (50%)
    // Top-left quarter
    if (Math.abs(width - quarterWidth) < tolerance && Math.abs(height - halfHeight) < tolerance &&
        Math.abs(x - monitor.x) < tolerance && Math.abs(y - monitor.y) < tolerance) {
      return 'leftQuartersRightHalf1';
    }
    // Bottom-left quarter
    if (Math.abs(width - quarterWidth) < tolerance && Math.abs(height - halfHeight) < tolerance &&
        Math.abs(x - monitor.x) < tolerance && Math.abs(y - (monitor.y + halfHeight)) < tolerance) {
      return 'leftQuartersRightHalf2';
    }
    // Right half
    if (Math.abs(width - halfWidth) < tolerance && Math.abs(height - monitor.height) < tolerance &&
        Math.abs(x - (monitor.x + halfWidth)) < tolerance && Math.abs(y - monitor.y) < tolerance) {
      return 'leftQuartersRightHalf3';
    }

    // Basic Win+Arrow snaps (fallback)
    // Left half
    if (Math.abs(width - halfWidth) < tolerance && Math.abs(height - monitor.height) < tolerance &&
        Math.abs(x - monitor.x) < tolerance && Math.abs(y - monitor.y) < tolerance) {
      return 'left';
    }

    // Right half
    if (Math.abs(width - halfWidth) < tolerance && Math.abs(height - monitor.height) < tolerance &&
        Math.abs(x - (monitor.x + halfWidth)) < tolerance && Math.abs(y - monitor.y) < tolerance) {
      return 'right';
    }

    // Top half
    if (Math.abs(width - monitor.width) < tolerance && Math.abs(height - halfHeight) < tolerance &&
        Math.abs(x - monitor.x) < tolerance && Math.abs(y - monitor.y) < tolerance) {
      return 'top';
    }

    // Bottom half
    if (Math.abs(width - monitor.width) < tolerance && Math.abs(height - halfHeight) < tolerance &&
        Math.abs(x - monitor.x) < tolerance && Math.abs(y - (monitor.y + halfHeight)) < tolerance) {
      return 'bottom';
    }

    // Corner quarters
    if (Math.abs(width - halfWidth) < tolerance && Math.abs(height - halfHeight) < tolerance) {
      if (Math.abs(x - monitor.x) < tolerance && Math.abs(y - monitor.y) < tolerance) return 'topLeft';
      if (Math.abs(x - (monitor.x + halfWidth)) < tolerance && Math.abs(y - monitor.y) < tolerance) return 'topRight';
      if (Math.abs(x - monitor.x) < tolerance && Math.abs(y - (monitor.y + halfHeight)) < tolerance) return 'bottomLeft';
      if (Math.abs(x - (monitor.x + halfWidth)) < tolerance && Math.abs(y - (monitor.y + halfHeight)) < tolerance) return 'bottomRight';
    }

    return null;
  }

  private async snapWindow(hwnd: number, snapType: string, monitor: MonitorInfo): Promise<boolean> {
    // Windows 11 snap layouts use Win+Z then number keys
    // Map snap types to [template number, position number]
    const snapLayoutMap: Record<string, [number, number]> = {
      // Template 1: Two columns (50-50)
      'left': [1, 1],
      'right': [1, 2],
      
      // Template 2: Three equal columns (33-33-33)
      'threeCol1': [2, 1],
      'threeCol2': [2, 2],
      'threeCol3': [2, 3],
      
      // Template 3: Three columns (25-50-25)
      'threeColWide1': [3, 1],
      'threeColWide2': [3, 2],
      'threeColWide3': [3, 3],
      
      // Template 4: Four columns (25-25-25-25)
      'fourCol1': [4, 1],
      'fourCol2': [4, 2],
      'fourCol3': [4, 3],
      'fourCol4': [4, 4],
      
      // Template 5: Left half + two right quarters (50-25-25)
      'leftHalfRightQuarters1': [5, 1],
      'leftHalfRightQuarters2': [5, 2],
      'leftHalfRightQuarters3': [5, 3],
      
      // Template 6: Two left quarters + right half (25-25-50)
      'leftQuartersRightHalf1': [6, 1],
      'leftQuartersRightHalf2': [6, 2],
      'leftQuartersRightHalf3': [6, 3],
    };

    // Check if this is a Windows 11 snap layout
    if (snapLayoutMap[snapType]) {
      return await this.snapWindowWin11(hwnd, snapLayoutMap[snapType]);
    }

    // Fall back to Win+Arrow for basic snaps
    const snapShortcuts: Record<string, string> = {
      'maximize': '{UP}',
      'top': '{UP}{UP}',
      'bottom': '{DOWN}',
      'topLeft': '{LEFT}{UP}',
      'topRight': '{RIGHT}{UP}',
      'bottomLeft': '{LEFT}{DOWN}',
      'bottomRight': '{RIGHT}{DOWN}'
    };

    const shortcut = snapShortcuts[snapType];
    if (!shortcut) return false;

    return await this.snapWindowWinArrow(hwnd, shortcut);
  }

  private async snapWindowWin11(hwnd: number, [templateNum, positionNum]: [number, number]): Promise<boolean> {
    const scriptPath = path.join(app.getPath('temp'), 'wlm_snap11.ps1');
    
    // Use proper SendKeys syntax for PowerShell
    const script = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class WSnap {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
}
"@
Add-Type -AssemblyName System.Windows.Forms

$hwnd = [IntPtr]${hwnd}

# Restore if minimized
if ([WSnap]::IsIconic($hwnd)) {
    [WSnap]::ShowWindow($hwnd, 9) | Out-Null
    Start-Sleep -Milliseconds 200
}

# Bring window to foreground and activate
[WSnap]::SetForegroundWindow($hwnd) | Out-Null
[WSnap]::BringWindowToTop($hwnd) | Out-Null
Start-Sleep -Milliseconds 300

# Send Win+Z to open snap layouts
[System.Windows.Forms.SendKeys]::SendWait("^{ESC}")
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait("z")
Start-Sleep -Milliseconds 400

# Select template number
[System.Windows.Forms.SendKeys]::SendWait("${templateNum}")
Start-Sleep -Milliseconds 250

# Select position number
[System.Windows.Forms.SendKeys]::SendWait("${positionNum}")
Start-Sleep -Milliseconds 150
`;

    try {
      await writeFileAsync(scriptPath, script, 'utf8');
      console.log(`[WLM] Win11 snap: template=${templateNum}, position=${positionNum}`);
      await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 15000 });
      return true;
    } catch (error) {
      console.error('[WLM] Win11 snap failed:', error);
      return false;
    } finally {
      try { await unlinkAsync(scriptPath); } catch { }
    }
  }

  private async snapWindowWinArrow(hwnd: number, shortcut: string): Promise<boolean> {
    const scriptPath = path.join(app.getPath('temp'), 'wlm_snap.ps1');
    
    // Parse shortcut like "{LEFT}", "{RIGHT}", "{UP}", "{DOWN}"
    const arrowKey = shortcut.replace(/[{}]/g, '');
    
    const script = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class WSnap {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
}
"@
Add-Type -AssemblyName System.Windows.Forms

$hwnd = [IntPtr]${hwnd}

# Restore if minimized
if ([WSnap]::IsIconic($hwnd)) {
    [WSnap]::ShowWindow($hwnd, 9) | Out-Null
    Start-Sleep -Milliseconds 150
}

# Bring window to foreground
[WSnap]::SetForegroundWindow($hwnd) | Out-Null
[WSnap]::BringWindowToTop($hwnd) | Out-Null
Start-Sleep -Milliseconds 200

# Send Win+Arrow key
[System.Windows.Forms.SendKeys]::SendWait("^{ESC}")
Start-Sleep -Milliseconds 50
[System.Windows.Forms.SendKeys]::SendWait("{${arrowKey}}")
Start-Sleep -Milliseconds 150
`;

    try {
      await writeFileAsync(scriptPath, script, 'utf8');
      console.log(`[WLM] WinArrow snap: ${arrowKey}`);
      await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 10000 });
      return true;
    } catch (error) {
      console.error('[WLM] Snap failed:', error);
      return false;
    } finally {
      try { await unlinkAsync(scriptPath); } catch { }
    }
  }

  async restoreLayoutSimple(layout: SavedLayout): Promise<RestoreResult> {
    // Restore without launching apps (original behavior)
    return this.restoreLayout(layout, false);
  }
}
