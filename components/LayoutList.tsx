import { useState, useEffect, useRef } from 'react';
import { SavedLayout } from '../types';

interface LayoutListProps {
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  refreshKey: number;
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
      // Small delay to ensure click event has fully completed
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
        const parts = [];
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
        </div>
      ))}
    </div>
  );
}
