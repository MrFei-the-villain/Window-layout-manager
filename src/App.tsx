import { useState, useEffect } from 'react';
import { LayoutList } from './components/LayoutList';
import { WindowList } from './components/WindowList';
import { SaveLayoutModal } from './components/SaveLayoutModal';
import { TitleBar } from './components/TitleBar';
import { About } from './components/About';
import { Toast } from './components/Toast';

export type TabType = 'layouts' | 'windows' | 'about';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('layouts');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [layoutRefreshKey, setLayoutRefreshKey] = useState(0);

  const addToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  useEffect(() => {
    const cleanupSave = window.electronAPI.onQuickSaveLayout(() => {
      setShowSaveModal(true);
    });

    const cleanupRestore = window.electronAPI.onQuickRestoreLayout(async () => {
      const layout = await window.electronAPI.getMostRecentLayout();
      if (layout) {
        const result = await window.electronAPI.restoreLayout(layout.id);
        if (result.success) {
          addToast(`Restored ${result.restoredCount} windows`, 'success');
        } else {
          addToast('Failed to restore layout', 'error');
        }
      }
    });

    return () => {
      cleanupSave();
      cleanupRestore();
    };
  }, []);

  return (
    <div className="app">
      <TitleBar onSaveClick={() => setShowSaveModal(true)} />

      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'layouts' ? 'active' : ''}`}
          onClick={() => setActiveTab('layouts')}
        >
          <span className="tab-icon">📁</span>
          Saved Layouts
        </button>
        <button
          className={`tab ${activeTab === 'windows' ? 'active' : ''}`}
          onClick={() => setActiveTab('windows')}
        >
          <span className="tab-icon">🪟</span>
          Current Windows
        </button>
        <button
          className={`tab ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          <span className="tab-icon">ℹ️</span>
          About
        </button>
      </div>

      <div className="content">
        <div style={{ display: activeTab === 'layouts' ? 'block' : 'none' }}>
          <LayoutList addToast={addToast} refreshKey={layoutRefreshKey} />
        </div>
        <div style={{ display: activeTab === 'windows' ? 'block' : 'none' }}>
          <WindowList />
        </div>
        <div style={{ display: activeTab === 'about' ? 'block' : 'none' }}>
          <About addToast={addToast} />
        </div>
      </div>

      {showSaveModal && (
        <SaveLayoutModal
          onClose={() => setShowSaveModal(false)}
          addToast={addToast}
          onSaved={() => setLayoutRefreshKey(k => k + 1)}
        />
      )}

      <div className="toast-container">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} />
        ))}
      </div>
    </div>
  );
}
