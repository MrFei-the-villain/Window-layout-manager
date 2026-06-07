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

/** Convert a 24-hour "HH:MM" string to 12-hour "H:MM" (no leading zero on hour). */
function to12Hour(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return '9:00';
  const h24 = parseInt(m[1], 10);
  const mm = m[2];
  const h12 = ((h24 + 11) % 12) + 1; // 0->12, 13->1, 12->12
  return `${h12}:${mm}`;
}

/** "AM" | "PM" from a 24-hour "HH:MM" string. */
function meridiemOf(hhmm: string): 'AM' | 'PM' {
  const m = /^(\d{1,2})/.exec((hhmm || '').trim());
  if (!m) return 'AM';
  return parseInt(m[1], 10) >= 12 ? 'PM' : 'AM';
}

/** Combine a 12-hour "H:MM" string and a meridiem into a 24-hour "HH:MM" string. */
function to24Hour(h12: string, meridiem: 'AM' | 'PM'): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((h12 || '').trim());
  if (!m) return '09:00';
  let h = parseInt(m[1], 10) % 12; // 12 -> 0
  if (meridiem === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
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

  // ---- Schedule draft state ----
  // Edits to the schedule's time/meridiem live in a per-schedule draft map
  // until the user clicks "Set". This prevents the time being committed
  // to the store on every keystroke or wheel tick.
  type ScheduleDraft = { hour: number; minute: number; mer: 'AM' | 'PM' };
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, ScheduleDraft>>({});

  const getDraft = (sched: Schedule): ScheduleDraft => {
    if (scheduleDrafts[sched.id]) return scheduleDrafts[sched.id];
    const cur12 = to12Hour(sched.time);
    const [hh, mm] = cur12.split(':').map(s => parseInt(s, 10) || 0);
    return { hour: hh, minute: mm, mer: meridiemOf(sched.time) };
  };

  const updateDraft = (sched: Schedule, patch: Partial<ScheduleDraft>) => {
    setScheduleDrafts(d => ({
      ...d,
      [sched.id]: { ...getDraft(sched), ...patch }
    }));
  };

  const clearDraft = (schedId: string) => {
    setScheduleDrafts(d => {
      if (!(schedId in d)) return d;
      const { [schedId]: _drop, ...rest } = d;
      return rest;
    });
  };

  const commitDraft = async (layout: SavedLayout, sched: Schedule) => {
    const draft = getDraft(sched);
    const safeHour = Math.max(1, Math.min(12, draft.hour || 1));
    const safeMin = Math.max(0, Math.min(59, isNaN(draft.minute) ? 0 : draft.minute));
    const time = to24Hour(
      `${safeHour}:${String(safeMin).padStart(2, '0')}`,
      draft.mer
    );
    await updateSchedule(layout, sched.id, { time });
    // Drop the draft so subsequent renders pull from the freshly-saved value.
    clearDraft(sched.id);
  };

  // ---- Wheel throttle ----
  // The native wheel fires many events per second. We collapse them so the
  // user gets exactly one increment per `wheelThrottleMs` of motion, which
  // makes dialing in a time feel deliberate rather than frantic.
  const wheelThrottleMs = 200;
  const lastWheelRef = useRef<number>(0);

  const throttledWheel = (handler: (delta: number) => void) => (e: React.WheelEvent) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheelRef.current < wheelThrottleMs) return;
    lastWheelRef.current = now;
    handler(e.deltaY < 0 ? 1 : -1);
  };

  /** Adjust a 12-hour hour value (1..12) by `delta`, wrapping inside the range. */
  const bumpHour12 = (h: number, delta: number): number => {
    let next = h + delta;
    if (next < 1) next = 12;
    if (next > 12) next = 1;
    return next;
  };

  /** Adjust a minute value (0..59) by `delta`, NOT wrapping the hour. */
  const bumpMinute = (m: number, delta: number): number => {
    let next = m + delta;
    while (next < 0) next += 60;
    while (next > 59) next -= 60;
    return next;
  };

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
        <AppIcon size={96} className="empty-icon-img" />
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
                    {(() => {
                      const draft = getDraft(sched);
                      const mer = draft.mer;
                      const hh = draft.hour;
                      const mm = draft.minute;
                      const isDirty = !!scheduleDrafts[sched.id];
                      return (
                        <>
                          <input
                            type="number"
                            className="input time-hour"
                            min={1}
                            max={12}
                            step={1}
                            value={hh}
                            onChange={(e) => updateDraft(sched, { hour: parseInt(e.target.value, 10) })}
                            onBlur={(e) => updateDraft(sched, { hour: parseInt(e.target.value, 10) })}
                            onWheel={throttledWheel((d) => updateDraft(sched, { hour: bumpHour12(draft.hour, d) }))}
                            aria-label="Hour"
                          />
                          <span className="time-separator">:</span>
                          <input
                            type="number"
                            className="input time-minute"
                            min={0}
                            max={59}
                            step={1}
                            value={mm}
                            onChange={(e) => updateDraft(sched, { minute: parseInt(e.target.value, 10) })}
                            onBlur={(e) => updateDraft(sched, { minute: parseInt(e.target.value, 10) })}
                            onWheel={throttledWheel((d) => updateDraft(sched, { minute: bumpMinute(draft.minute, d) }))}
                            aria-label="Minute"
                          />
                          <select
                            className="input meridiem-select"
                            value={mer}
                            onChange={(e) => updateDraft(sched, { mer: e.target.value as 'AM' | 'PM' })}
                            aria-label="AM or PM"
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                          <button
                            className="btn btn-small btn-primary schedule-set"
                            onClick={() => commitDraft(layout, sched)}
                            disabled={!isDirty}
                            title={isDirty ? 'Save the schedule time' : 'No changes to save'}
                          >
                            Set
                          </button>
                          {isDirty && (
                            <button
                              className="btn btn-small btn-secondary schedule-cancel"
                              onClick={() => clearDraft(sched.id)}
                              title="Discard changes and revert to the saved time"
                            >
                              Cancel
                            </button>
                          )}
                        </>
                      );
                    })()}
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
                      onClick={() => { clearDraft(sched.id); removeSchedule(layout, sched.id); }}
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
