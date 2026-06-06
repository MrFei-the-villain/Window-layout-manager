import { useState, useEffect, useRef, useCallback } from 'react';
import { WindowInfo, MonitorInfo } from '../types';

export function WindowList() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showVisual, setShowVisual] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const isLoadingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadWindows();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!loading) {
      const interval = setInterval(() => {
        loadWindows();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [loading]);

  const loadWindows = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      const [windowData, monitorData] = await Promise.all([
        window.electronAPI.getAllWindows().catch(e => {
          console.error('getAllWindows failed:', e);
          return [] as WindowInfo[];
        }),
        window.electronAPI.getMonitors().catch(e => {
          console.error('getMonitors failed:', e);
          return [] as MonitorInfo[];
        })
      ]);

      if (!mountedRef.current) return;

      setWindows(windowData || []);
      setMonitors(monitorData || []);
      setError(null);
      setLastRefresh(Date.now());
    } catch (e) {
      console.error('loadWindows error:', e);
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      isLoadingRef.current = false;
    }
  }, []);

  const filteredWindows = windows.filter(w => 
    !w.isMinimized &&
    (w.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.processName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getMonitorLabel = (monitorId: string) => {
    const monitor = monitors.find(m => m.id === monitorId);
    if (!monitor) return 'Unknown';
    return monitor.isPrimary ? 'Primary' : `Monitor ${monitors.indexOf(monitor) + 1}`;
  };

  const getDisplayName = (win: WindowInfo): string => {
    return win.smartName || win.processName;
  };

  const getWindowColor = (processName: string): string => {
    const colors = [
      { bg: '#6366f1', text: '#ffffff' }, // Indigo
      { bg: '#8b5cf6', text: '#ffffff' }, // Violet
      { bg: '#ec4899', text: '#ffffff' }, // Pink
      { bg: '#f43f5e', text: '#ffffff' }, // Rose
      { bg: '#ef4444', text: '#ffffff' }, // Red
      { bg: '#f97316', text: '#ffffff' }, // Orange
      { bg: '#eab308', text: '#000000' }, // Yellow
      { bg: '#22c55e', text: '#ffffff' }, // Green
      { bg: '#14b8a6', text: '#ffffff' }, // Teal
      { bg: '#06b6d4', text: '#ffffff' }, // Cyan
      { bg: '#3b82f6', text: '#ffffff' }, // Blue
      { bg: '#a855f7', text: '#ffffff' }, // Purple
    ];
    let hash = 0;
    for (let i = 0; i < processName.length; i++) {
      hash = processName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length].bg;
  };

  const getWindowTextColor = (processName: string): string => {
    const colors = [
      { bg: '#6366f1', text: '#ffffff' },
      { bg: '#8b5cf6', text: '#ffffff' },
      { bg: '#ec4899', text: '#ffffff' },
      { bg: '#f43f5e', text: '#ffffff' },
      { bg: '#ef4444', text: '#ffffff' },
      { bg: '#f97316', text: '#ffffff' },
      { bg: '#eab308', text: '#000000' },
      { bg: '#22c55e', text: '#ffffff' },
      { bg: '#14b8a6', text: '#ffffff' },
      { bg: '#06b6d4', text: '#ffffff' },
      { bg: '#3b82f6', text: '#ffffff' },
      { bg: '#a855f7', text: '#ffffff' },
    ];
    let hash = 0;
    for (let i = 0; i < processName.length; i++) {
      hash = processName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length].text;
  };

  // Detect if window is snapped (matches a snap layout)
  // Uses strict position-based matching
  const getSnapType = (win: WindowInfo, monitor: MonitorInfo): string | null => {
    // Use a tolerance of 10px (accounts for window border/frame variations)
    const tolerance = 10;
    
    // Calculate relative position and size
    const relX = win.x - monitor.x;
    const relY = win.y - monitor.y;
    const relRight = relX + win.width;
    const relBottom = relY + win.height;
    
    const halfW = monitor.width / 2;
    const halfH = monitor.height / 2;
    const thirdW = monitor.width / 3;
    const quarterW = monitor.width / 4;
    
    // Window sizes (allowing for small variations)
    const isSize = (w: number, h: number) => 
      Math.abs(win.width - w) < tolerance && Math.abs(win.height - h) < tolerance;
    
    // Position checks (relative to monitor)
    const near = (a: number, b: number) => Math.abs(a - b) < tolerance;
    
    // FULL SCREEN (maximized) - covers entire monitor at origin
    if (near(relX, 0) && near(relY, 0) && 
        near(win.width, monitor.width) && near(win.height, monitor.height)) {
      return 'maximized';
    }
    
    // LEFT HALF (50% width, full height, at left edge)
    if (near(relX, 0) && near(relY, 0) && 
        near(win.width, halfW) && near(win.height, monitor.height)) {
      return 'left-half';
    }
    
    // RIGHT HALF (50% width, full height, at right)
    if (near(relX, halfW) && near(relY, 0) && 
        near(win.width, halfW) && near(win.height, monitor.height)) {
      return 'right-half';
    }
    
    // TOP-LEFT QUARTER (50% x 50%)
    if (near(relX, 0) && near(relY, 0) && 
        near(win.width, halfW) && near(win.height, halfH)) {
      return 'top-left';
    }
    
    // TOP-RIGHT QUARTER
    if (near(relX, halfW) && near(relY, 0) && 
        near(win.width, halfW) && near(win.height, halfH)) {
      return 'top-right';
    }
    
    // BOTTOM-LEFT QUARTER
    if (near(relX, 0) && near(relY, halfH) && 
        near(win.width, halfW) && near(win.height, halfH)) {
      return 'bottom-left';
    }
    
    // BOTTOM-RIGHT QUARTER
    if (near(relX, halfW) && near(relY, halfH) && 
        near(win.width, halfW) && near(win.height, halfH)) {
      return 'bottom-right';
    }
    
    // THREE EQUAL COLUMNS (33% width each, full height)
    if (near(win.height, monitor.height) && near(relY, 0)) {
      if (near(relX, 0) && near(win.width, thirdW)) return 'three-col-1';
      if (near(relX, thirdW) && near(win.width, thirdW)) return 'three-col-2';
      if (near(relX, thirdW * 2) && near(win.width, thirdW)) return 'three-col-3';
    }
    
    // FOUR COLUMNS (25% width each, full height)
    if (near(win.height, monitor.height) && near(relY, 0)) {
      if (near(relX, 0) && near(win.width, quarterW)) return 'four-col-1';
      if (near(relX, quarterW) && near(win.width, quarterW)) return 'four-col-2';
      if (near(relX, quarterW * 2) && near(win.width, quarterW)) return 'four-col-3';
      if (near(relX, quarterW * 3) && near(win.width, quarterW)) return 'four-col-4';
    }
    
    // 25-50-25 LAYOUT (three columns with wide center)
    if (near(win.height, monitor.height) && near(relY, 0)) {
      if (near(relX, 0) && near(win.width, quarterW)) return 'wide-3-left';
      if (near(relX, quarterW) && near(win.width, halfW)) return 'wide-3-center';
      if (near(relX, quarterW * 3) && near(win.width, quarterW)) return 'wide-3-right';
    }
    
    // 50-25-25 PRIORITY LAYOUT
    if (near(relX, 0) && near(relY, 0) && 
        near(win.width, halfW) && near(win.height, halfH)) {
      return 'priority-left';
    }
    if (near(relX, halfW) && near(relY, 0) && 
        near(win.width, quarterW) && near(win.height, halfH)) {
      return 'priority-tr';
    }
    if (near(relX, halfW) && near(relY, halfH) && 
        near(win.width, quarterW) && near(win.height, halfH)) {
      return 'priority-br';
    }
    
    // 25-25-50 PRIORITY LAYOUT
    if (near(relX, halfW) && near(relY, 0) && 
        near(win.width, halfW) && near(win.height, monitor.height)) {
      return 'priority-right';
    }
    if (near(relX, 0) && near(relY, 0) && 
        near(win.width, quarterW) && near(win.height, halfH)) {
      return 'priority-tl';
    }
    if (near(relX, 0) && near(relY, halfH) && 
        near(win.width, quarterW) && near(win.height, halfH)) {
      return 'priority-bl';
    }

    return null;
  };
  
  // Get border radius based on snap type
  const getBorderRadius = (snapType: string | null): string => {
    if (!snapType) return '6px';
    // Sharper corners for snapped windows
    if (snapType === 'maximized') return '0px';
    return '3px';
  };

  const renderVisualLayout = () => {
    if (monitors.length === 0) {
      return (
        <div className="visual-layout-container">
          <div className="visual-layout-empty">No monitors detected</div>
        </div>
      );
    }

    const scaleFactor = 0.15;
    
    const minX = Math.min(...monitors.map(m => m.x));
    const minY = Math.min(...monitors.map(m => m.y));
    const maxX = Math.max(...monitors.map(m => m.x + m.width));
    const maxY = Math.max(...monitors.map(m => m.y + m.height));
    
    const totalWidth = (maxX - minX) * scaleFactor;
    const totalHeight = (maxY - minY) * scaleFactor;

    const windowsWithMonitor = windows
      .filter(w => !w.isMinimized)
      .map(win => {
        const assignedMonitor = monitors.find(m => m.id === win.monitorId);
        if (assignedMonitor) return { ...win, resolvedMonitor: assignedMonitor };
        const fallbackMonitor = monitors.find(m => {
          const inBounds = win.x >= m.x && win.x < m.x + m.width && win.y >= m.y && win.y < m.y + m.height;
          return inBounds;
        }) || monitors[0];
        return { ...win, resolvedMonitor: fallbackMonitor };
      });

    return (
      <div className="visual-layout-container">
        <div 
          className="visual-layout"
          style={{
            width: totalWidth,
            height: totalHeight,
            minWidth: totalWidth,
            minHeight: totalHeight
          }}
        >
          <div className="layout-grid-pattern" />
          
          {monitors.map((monitor, monitorIdx) => {
            const monitorWindows = windowsWithMonitor.filter(
              w => w.resolvedMonitor.id === monitor.id
            );

            return (
              <div
                key={monitor.id}
                className={`monitor-display ${monitor.isPrimary ? 'primary' : ''}`}
                style={{
                  left: (monitor.x - minX) * scaleFactor,
                  top: (monitor.y - minY) * scaleFactor,
                  width: monitor.width * scaleFactor,
                  height: monitor.height * scaleFactor
                }}
              >
                <div className="monitor-header">
                  <span className="monitor-label-visual">
                    {monitor.isPrimary ? '🖥️ Primary' : `📺 Monitor ${monitorIdx + 1}`}
                  </span>
                  <span className="monitor-res">
                    {monitor.width}×{monitor.height}
                  </span>
                </div>
                
                {monitorWindows.map(win => {
                  const relX = (win.x - monitor.x) * scaleFactor;
                  const relY = (win.y - monitor.y) * scaleFactor;
                  const relYWithHeader = relY + 22; // Account for monitor header (22px)
                  const winWidth = win.width * scaleFactor;
                  const winHeight = win.height * scaleFactor; // Don't subtract header from height
                  const snapType = getSnapType(win, monitor);
                  const isSnapped = snapType !== null;
                  const borderRadius = getBorderRadius(snapType);
                  
                  return (
                    <div
                      key={win.id}
                      className={`window-rect ${win.isMaximized ? 'maximized' : ''} ${isSnapped ? 'snapped' : ''}`}
                      style={{
                        left: relX,
                        top: relYWithHeader,
                        width: Math.max(winWidth, 30),
                        height: Math.max(winHeight, 20),
                        backgroundColor: getWindowColor(win.processName),
                        color: getWindowTextColor(win.processName),
                        borderRadius: borderRadius
                      }}
                      title={`${win.title} (${getDisplayName(win)})\n${win.width}×${win.height} at (${win.x}, ${win.y})${isSnapped ? `\nSnap: ${snapType}` : ''}`}
                    >
                      <span className="window-rect-label">
                        {getDisplayName(win).length > 12 
                          ? getDisplayName(win).substring(0, 12) 
                          : getDisplayName(win)}
                      </span>
                      {isSnapped && <span className="snap-indicator" title={`Snapped: ${snapType}`}>📐</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="window-list-container">
        <div className="loading">Scanning windows...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="window-list-container">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>Failed to scan windows</h3>
          <p className="error-message">{error}</p>
          <button className="btn btn-primary" onClick={loadWindows}>
            🔄 Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="window-list-container">
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search windows..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <button className="btn btn-secondary" onClick={loadWindows} disabled={isLoadingRef.current}>
          🔄 Refresh
        </button>
        <button 
          className={`btn ${showVisual ? 'btn-primary' : 'btn-secondary'}`} 
          onClick={() => setShowVisual(!showVisual)}
        >
          🗺️ Visual
        </button>
        <button 
          className={`btn ${showDebug ? 'btn-primary' : 'btn-secondary'}`} 
          onClick={async () => {
            const info = await window.electronAPI.getDebugInfo();
            setDebugInfo(info);
            setShowDebug(!showDebug);
          }}
        >
          🔧 Debug
        </button>
      </div>

      <div className="monitor-info">
        {monitors.map((monitor, idx) => (
          <div key={monitor.id} className={`monitor-badge ${monitor.isPrimary ? 'primary' : ''}`}>
            {monitor.isPrimary ? 'Primary' : `Monitor ${idx + 1}`}: {monitor.width}x{monitor.height}
          </div>
        ))}
      </div>

      {showVisual && renderVisualLayout()}

      <div className="window-count">
        {filteredWindows.length} window{filteredWindows.length !== 1 ? 's' : ''} detected
        {lastRefresh > 0 && (
          <span className="refresh-time"> — updated {Math.round((Date.now() - lastRefresh) / 1000)}s ago</span>
        )}
      </div>

      {showDebug && debugInfo && (
        <div className="debug-panel">
          <h4>🔧 Debug Info</h4>
          <div className="debug-summary">
            <div className="debug-step">
              <span className="step-label">Step 1 - Monitors:</span>
              <span className={`step-value ${debugInfo.step1_monitors ? 'success' : 'error'}`}>
                {debugInfo.step1Error ? '❌ ' + debugInfo.step1Error.substring(0, 50) : (debugInfo.step1_monitors?.length || 0) + ' monitors'}
              </span>
            </div>
            <div className="debug-step">
              <span className="step-label">Step 2 - C# PS Raw:</span>
              <span className={`step-value ${debugInfo.step2Error ? 'error' : (debugInfo.step2_csharp_raw?.count > 0 ? 'success' : 'warning')}`}>
                {debugInfo.step2Error ? '❌ ' + debugInfo.step2Error.substring(0, 50) : (debugInfo.step2_csharp_raw?.count || 0) + ' windows'}
              </span>
            </div>
            <div className="debug-step">
              <span className="step-label">Step 3 - Simple PS Raw:</span>
              <span className={`step-value ${debugInfo.step3Error ? 'error' : (debugInfo.step3_simple_raw?.count > 0 ? 'success' : 'warning')}`}>
                {debugInfo.step3Error ? '❌ ' + debugInfo.step3Error.substring(0, 50) : (debugInfo.step3_simple_raw?.count || 0) + ' windows'}
              </span>
            </div>
            <div className="debug-step">
              <span className="step-label">Step 4 - Used Source:</span>
              <span className="step-value info">{debugInfo.step4_source || 'none'}</span>
            </div>
            <div className="debug-step">
              <span className="step-label">Step 5 - Final Filtered:</span>
              <span className={`step-value ${(debugInfo.step5_filtered?.count || 0) > 0 ? 'success' : 'error'}`}>
                {(debugInfo.step5_filtered?.count || 0) + ' windows'}
              </span>
            </div>
          </div>
          
          <div className="debug-details">
            <div className="debug-section">
              <strong>PowerShell Direct Test:</strong>
              {debugInfo.powershellDirect ? (
                <div>
                  Found {debugInfo.powershellDirect.windowCount} windows
                  <div>Process names: {debugInfo.powershellDirect.windowNames?.join(', ')}</div>
                  <div>stdout: {debugInfo.powershellDirect.stdoutLength} bytes, stderr: {debugInfo.powershellDirect.stderrLength} bytes</div>
                  {debugInfo.powershellDirect.stderrPreview && (
                    <details>
                      <summary>Show stderr</summary>
                      <pre>{debugInfo.powershellDirect.stderrPreview}</pre>
                    </details>
                  )}
                </div>
              ) : debugInfo.powershellDirectError ? (
                <div className="error">❌ {debugInfo.powershellDirectError}</div>
              ) : null}
            </div>
            
            <div className="debug-section">
              <strong>Environment:</strong>
              <div>tempWrite: {debugInfo.tempWrite || debugInfo.tempWriteError || 'unknown'}</div>
              <div>tempPath: {debugInfo.tempPath}</div>
              <div>Platform: {debugInfo.platform}</div>
              <div>Electron: {debugInfo.electronVersion}</div>
              <div>Node: {debugInfo.nodeVersion}</div>
            </div>
            
            {debugInfo.step2_csharp_raw?.first3?.length > 0 && (
              <div className="debug-section">
                <details>
                  <summary>C# Raw Windows (first 3)</summary>
                  <pre>{JSON.stringify(debugInfo.step2_csharp_raw.first3, null, 2)}</pre>
                </details>
              </div>
            )}
            
            {debugInfo.step3_simple_raw?.first3?.length > 0 && (
              <div className="debug-section">
                <details>
                  <summary>Simple PS Raw Windows (first 3)</summary>
                  <pre>{JSON.stringify(debugInfo.step3_simple_raw.first3, null, 2)}</pre>
                </details>
              </div>
            )}
            
            {debugInfo.step5_filtered?.first3?.length > 0 && (
              <div className="debug-section">
                <details>
                  <summary>Final Filtered Windows (first 3)</summary>
                  <pre>{JSON.stringify(debugInfo.step5_filtered.first3, null, 2)}</pre>
                </details>
              </div>
            )}
          </div>
        </div>
      )}

      {filteredWindows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🪟</div>
          <h3>No Windows Detected</h3>
          <p>Make sure you have visible application windows open.</p>
          <button className="btn btn-primary" onClick={loadWindows} style={{ marginTop: 12 }}>
            🔄 Rescan
          </button>
        </div>
      ) : (
        <div className="window-list">
          {filteredWindows.map(win => (
            <div key={win.id} className="window-item">
              <div className="window-icon">
                {win.isMinimized ? '📁' : win.isMaximized ? '⬜' : '🪟'}
              </div>
              <div className="window-info">
                <div className="window-title">{win.title}</div>
                <div className="window-meta">
                  <span className="process-name">{getDisplayName(win)}</span>
                  <span className="separator">•</span>
                  <span className="monitor-label">{getMonitorLabel(win.monitorId)}</span>
                  <span className="separator">•</span>
                  <span className="dimensions">{win.width}×{win.height}</span>
                </div>
              </div>
              <div className="window-position">
                ({win.x}, {win.y})
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
