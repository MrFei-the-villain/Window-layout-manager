import { useState, useEffect, useRef } from 'react';
import { SavedLayout, Schedule } from '../types';

interface LayoutListProps {
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  refreshKey: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function newScheduleId(): string {
  return 'sch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function LayoutList({ addToast, refreshKey }: LayoutListProps) {
  const [layouts, setLayouts] = useState<SavedLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [launchApps, setLaunchApps] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLayouts();
  }, [refreshKey]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      const timer = setTimeout(() => {
        if (editInputRef.current) {
          editInputRef.current.focus();
          editInputRef.current.select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [editingId]);

  const loadLayouts = async () => {
    setLoading(true);
    const data = await window.electronAPI.getLayouts();
    setLayouts(data);
    setLoading(false);
  };

  const handleRestore = async (layoutId: string) => {
    setRestoringId(layoutId);
    try {
      const result = launchApps
        ? await window.electronAPI.restoreLayoutWithLaunch(layoutId)
        : await window.electronAPI.restoreLayout(layoutId);

      if (result.success) {
        const parts: string[] = [];
        if (result.restoredCount > 0) {
          parts.push(`${result.restoredCount} window${result.restoredCount > 1 ? 's' : ''} positioned`);
        }
        if (result.launchedCount && result.launchedCount > 0) {
          parts.push(`${result.launchedCount} app${result.launchedCount > 1 ? 's' : ''} launched`);
        }
        if (parts.length > 0) {
          addToast(parts.join(', '), 'success');
        } else {
          addToast('Layout restored', 'success');
        }
        if (result.failedCount > 0) {
          addToast(`${result.failedCount} window(s) could not be restored`, 'info');
        }
      } else {
        addToast('Failed to restore layout', 'error');
      }
    } catch {
      addToast('Error restoring layout', 'error');
    }
    setRestoringId(null);
  };

  const handleDelete = async (layoutId: string) => {
    if (confirm('Are you sure you want to delete this layout?')) {
      await window.electronAPI.deleteLayout(layoutId);
      setLayouts(layouts.filter(l => l.id !== layoutId));
      addToast('Layout deleted', 'info');
    }
  };

  const handleStartRename = (layout: SavedLayout) => {
    setEditingId(layout.id);
    setEditName(layout.name);
  };

  const handleFinishRename = async () => {
    if (editingId && editName.trim()) {
      const layout = layouts.find(l => l.id === editingId);
      if (layout && editName.trim() !== layout.name) {
        await window.electronAPI.updateLayout(editingId, { name: editName.trim() });
        setLayouts(layouts.map(l =>
          l.id === editingId ? { ...l, name: editName.trim() } : l
        ));
        addToast(`Layout renamed to "${editName.trim()}"`, 'success');
      }
    }
    setEditingId(null);
    setEditName('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishRename();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditName('');
    }
  };

  // ---- Hotkey editor ----
  const [hotkeyEditingId, setHotkeyEditingId] = useState<string | null>(null);
  const [hotkeyDraft, setHotkeyDraft] = useState('');

  const startHotkeyEdit = (layout: SavedLayout) => {
    setHotkeyEditingId(layout.id);
    setHotkeyDraft(layout.hotkey || '');
  };
  const cancelHotkeyEdit = () => {
    setHotkeyEditingId(null);
    setHotkeyDraft('');
  };
  const saveHotkey = async (layout: SavedLayout) => {
    const next = hotkeyDraft.trim() || null;
    const result = await window.electronAPI.setLayoutHotkey(layout.id, next);
    if (result.ok) {
      setLayouts(layouts.map(l => l.id === layout.id ? { ...l, hotkey: next || undefined } : l));
      addToast(next ? `Hotkey set: ${next}` : 'Hotkey cleared', 'success');
    } else {
      addToast(result.error || 'Failed to set hotkey', 'error');
    }
    cancelHotkeyEdit();
  };
  const clearHotkey = async (layout: SavedLayout) => {
    const result = await window.electronAPI.setLayoutHotkey(layout.id, null);
    if (result.ok) {
      setLayouts(layouts.map(l => l.id === layout.id ? { ...l, hotkey: undefined } : l));
      addToast('Hotkey cleared', 'info');
    }
  };

  // ---- Schedule editor ----
  const updateSchedules = async (layout: SavedLayout, schedules: Schedule[]) => {
    const updated = await window.electronAPI.setLayoutSchedules(layout.id, schedules);
    if (updated) {
      setLayouts(layouts.map(l => l.id === layout.id ? updated : l));
    }
  };

  const addSchedule = (layout: SavedLayout) => {
    const sched: Schedule = {
      id: newScheduleId(),
      time: '09:00',
      days: [1, 2, 3, 4, 5],
      launchApps: false
    };
    void updateSchedules(layout, [...(layout.schedules || []), sched]);
  };

  const removeSchedule = (layout: SavedLayout, schedId: string) => {
    void updateSchedules(
      layout,
      (layout.schedules || []).filter(s => s.id !== schedId)
    );
  };

  const updateSchedule = (
    layout: SavedLayout,
    schedId: string,
    patch: Partial<Schedule>
  ) => {
    const next = (layout.schedules || []).map(s =>
      s.id === schedId ? { ...s, ...patch } : s
    );
    void updateSchedules(layout, next);
  };

  const toggleDay = (layout: SavedLayout, schedId: string, day: number) => {
    const sched = (layout.schedules || []).find(s => s.id === schedId);
    if (!sched) return;
    const has = sched.days.includes(day);
    const days = has ? sched.days.filter(d => d !== day) : [...sched.days, day].sort();
    updateSchedule(layout, schedId, { days });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return <div className="loading">Loading layouts...</div>;
  }

  if (layouts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📁</div>
        <h3>No Saved Layouts</h3>
        <p>Click "Save Layout" to capture your current window arrangement.</p>
        <p className="hint">Layouts remember window positions, sizes, and monitor assignments.</p>
      </div>
    );
  }

  return (
    <div className="layout-list">
      <div className="layout-options">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={launchApps}
            onChange={(e) => setLaunchApps(e.target.checked)}
          />
          <span className="toggle-text">🚀 Launch apps that are not running</span>
        </label>
        <p className="toggle-hint">
          Minimized windows will be opened and repositioned — no duplicates are spawned.
        </p>
      </div>
      {layouts.map(layout => (
        <div key={layout.id} className="layout-card">
          <div className="layout-header">
            {editingId === layout.id ? (
              <div className="rename-wrapper">
                <input
                  ref={editInputRef}
                  type="text"
                  className="input rename-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  placeholder="Enter layout name"
                />
                <button
                  className="btn btn-small btn-primary rename-save"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleFinishRename}
                  title="Save (Enter)"
                >
                  ✓
                </button>
                <button
                  className="btn btn-small btn-secondary rename-cancel"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setEditingId(null);
                    setEditName('');
                  }}
                  title="Cancel (Esc)"
                >
                  ✕
                </button>
              </div>
            ) : (
              <h3
                className="layout-name editable"
                onClick={() => handleStartRename(layout)}
                title="Click to rename"
              >
                {layout.name}
              </h3>
            )}
            <span className="layout-count">{layout.windows.length} windows</span>
          </div>

          <div className="layout-details">
            <div className="detail-row">
              <span className="detail-label">Monitors:</span>
              <span className="detail-value">{layout.monitors.length}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Created:</span>
              <span className="detail-value">{formatDate(layout.createdAt)}</span>
            </div>
          </div>

          <div className="layout-windows">
            {layout.windows.slice(0, 4).map((win, idx) => (
              <div key={idx} className="window-chip" title={win.title}>
                {win.processName}
              </div>
            ))}
            {layout.windows.length > 4 && (
              <div className="window-chip more">
                +{layout.windows.length - 4} more
              </div>
            )}
          </div>

          <div className="layout-actions">
            <button
              className="btn btn-primary"
              onClick={() => handleRestore(layout.id)}
              disabled={restoringId === layout.id}
            >
              {restoringId === layout.id ? 'Restoring...' : '▶ Restore'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleStartRename(layout)}
            >
              ✏️ Rename
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleDelete(layout.id)}
            >
              🗑 Delete
            </button>
          </div>

          {/* Hotkey editor */}
          <div className="layout-row">
            <div className="layout-row-label">⌨ Hotkey:</div>
            {hotkeyEditingId === layout.id ? (
              <div className="hotkey-edit">
                <input
                  type="text"
                  className="input"
                  value={hotkeyDraft}
                  placeholder="e.g. CommandOrControl+Alt+1"
                  onChange={(e) => setHotkeyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveHotkey(layout);
                    else if (e.key === 'Escape') cancelHotkeyEdit();
                  }}
                  autoFocus
                />
                <button className="btn btn-small btn-primary" onClick={() => saveHotkey(layout)}>Save</button>
                <button className="btn btn-small btn-secondary" onClick={cancelHotkeyEdit}>Cancel</button>
              </div>
            ) : (
              <div className="hotkey-display">
                <code className="hotkey-value">{layout.hotkey || 'none'}</code>
                <button className="btn btn-small btn-secondary" onClick={() => startHotkeyEdit(layout)}>
                  {layout.hotkey ? 'Change' : 'Set'}
                </button>
                {layout.hotkey && (
                  <button className="btn btn-small btn-secondary" onClick={() => clearHotkey(layout)}>
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="row-hint">
            System-wide shortcut that restores this layout. Use Electron accelerator format
            (e.g. <code>CommandOrControl+Alt+1</code>). The app must be running for the hotkey to work.
          </p>

          {/* Schedule editor */}
          <div className="layout-row">
            <div className="layout-row-label">⏰ Schedule:</div>
            <div className="schedule-list">
              {(layout.schedules || []).length === 0 && (
                <span className="schedule-empty">No scheduled restores.</span>
              )}
              {(layout.schedules || []).map(sched => (
                <div key={sched.id} className="schedule-item">
                  <div className="schedule-time-row">
                    <input
                      type="time"
                      className="input time-input"
                      value={sched.time}
                      onChange={(e) => updateSchedule(layout, sched.id, { time: e.target.value })}
                    />
                    <label className="schedule-launch">
                      <input
                        type="checkbox"
                        checked={sched.launchApps}
                        onChange={(e) => updateSchedule(layout, sched.id, { launchApps: e.target.checked })}
                      />
                      <span>Launch apps</span>
                    </label>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => removeSchedule(layout, sched.id)}
                      title="Remove schedule"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="day-picker">
                    {DAY_LABELS.map((label, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`day-chip ${sched.days.includes(idx) ? 'active' : ''}`}
                        onClick={() => toggleDay(layout, sched.id, idx)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-small" onClick={() => addSchedule(layout)}>
                + Add schedule
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
