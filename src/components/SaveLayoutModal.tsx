import { useState, useEffect, useRef } from 'react';
import { WindowInfo } from '../types';

interface SaveLayoutModalProps {
  onClose: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onSaved: () => void;
}

export function SaveLayoutModal({ onClose, addToast, onSaved }: SaveLayoutModalProps) {
  const [name, setName] = useState('');
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selectedWindows, setSelectedWindows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWindows();
  }, []);

  // Focus the name input once loading is done, so the input is mounted
  // and stable when we focus it. Re-runs after the window list arrives.
  useEffect(() => {
    if (loading) return;
    // Use a couple of rafs to make sure focus lands after the final paint
    // and isn't swallowed by an in-flight state update.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = nameInputRef.current;
        if (el && document.activeElement !== el) {
          el.focus({ preventScroll: true });
          try { el.select(); } catch { /* ignore */ }
        }
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [loading]);

  const loadWindows = async () => {
    try {
      const data = await window.electronAPI.getAllWindows();
      setWindows(data);
      setSelectedWindows(new Set(data.map(w => w.id)));
    } catch (err) {
      console.error('Failed to load windows:', err);
      addToast('Failed to load windows', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleWindow = (windowId: string) => {
    const newSelected = new Set(selectedWindows);
    if (newSelected.has(windowId)) {
      newSelected.delete(windowId);
    } else {
      newSelected.add(windowId);
    }
    setSelectedWindows(newSelected);
  };

  const toggleAll = () => {
    if (selectedWindows.size === windows.length) {
      setSelectedWindows(new Set());
    } else {
      setSelectedWindows(new Set(windows.map(w => w.id)));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      addToast('Please enter a layout name', 'error');
      return;
    }

    if (selectedWindows.size === 0) {
      addToast('Please select at least one window', 'error');
      return;
    }

    setSaving(true);
    try {
      const windowIds = Array.from(selectedWindows);
      console.log('Saving layout:', name.trim(), 'with', windowIds.length, 'windows');
      const result = await window.electronAPI.saveLayout(name.trim(), windowIds);
      
      if (result && (result as any).error) {
        addToast(`Failed to save: ${(result as any).error}`, 'error');
        return;
      }
      
      addToast(`Layout "${name}" saved with ${windowIds.length} windows`, 'success');
      onSaved();
      onClose();
    } catch (error) {
      console.error('Save layout error:', error);
      addToast(`Failed to save layout: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Save Layout</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="layout-name-input">Layout Name</label>
            <input
              id="layout-name-input"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() && selectedWindows.size > 0) {
                  handleSave();
                }
              }}
              placeholder="e.g., Work Mode, Gaming Setup"
              className="input"
            />
          </div>

          <div className="window-selection">
            <div className="selection-header">
              <label>Select Windows ({selectedWindows.size}/{windows.length})</label>
              <button className="btn btn-small btn-secondary" onClick={toggleAll}>
                {selectedWindows.size === windows.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {loading ? (
              <div className="loading-small">Loading windows...</div>
            ) : (
              <div className="window-select-list">
                {windows.map(win => (
                  <label key={win.id} className="window-select-item">
                    <input
                      type="checkbox"
                      checked={selectedWindows.has(win.id)}
                      onChange={() => toggleWindow(win.id)}
                    />
                    <span className="checkbox-custom"></span>
                    <div className="window-select-info">
                      <span className="window-select-title">{win.title}</span>
                      <span className="window-select-process">{win.processName}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleSave}
            disabled={saving || !name.trim() || selectedWindows.size === 0}
          >
            {saving ? 'Saving...' : '💾 Save Layout'}
          </button>
        </div>
      </div>
    </div>
  );
}
