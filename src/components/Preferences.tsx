import { useEffect, useState } from 'react';
import { AppSettings } from '../types';

interface PreferencesProps {
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function Preferences({ addToast }: PreferencesProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await window.electronAPI.getSettings();
        if (!cancelled) setSettings(s);
      } catch (err) {
        console.error('Failed to load settings:', err);
        addToast('Failed to load preferences', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [addToast]);

  const update = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    setSaving(true);
    // Optimistic update
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    try {
      const updated = await window.electronAPI.updateSettings(patch);
      setSettings(updated);
    } catch (err) {
      console.error('Failed to save settings:', err);
      addToast('Failed to save preferences', 'error');
      // Revert
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  };

  const handleChooseFolder = async () => {
    try {
      const folder = await window.electronAPI.chooseLayoutFolder();
      if (folder) {
        await update({ layoutFolder: folder });
        addToast(`Layouts will now be stored in ${folder}`, 'success');
      }
    } catch (err) {
      console.error('Choose folder failed:', err);
      addToast('Failed to choose folder', 'error');
    }
  };

  const handleClearFolder = async () => {
    await update({ layoutFolder: null });
    addToast('Reverted to default storage location', 'info');
  };

  const handleOpenFolder = async () => {
    try {
      await window.electronAPI.openLayoutFolder();
    } catch (err) {
      console.error('Open folder failed:', err);
      addToast('Failed to open folder', 'error');
    }
  };

  if (loading || !settings) {
    return <div className="loading">Loading preferences...</div>;
  }

  return (
    <div className="preferences">
      <div className="preferences-card">
        <h2 className="preferences-title">Preferences</h2>

        <section className="pref-section">
          <h3>Startup</h3>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.startWithWindows}
              disabled={saving}
              onChange={(e) => update({ startWithWindows: e.target.checked })}
            />
            <span className="toggle-text">Start with Windows</span>
          </label>
          <p className="toggle-hint">
            Launch Window Layout Manager automatically when you sign in to Windows.
          </p>

          <label className={`toggle-label indent ${!settings.startWithWindows ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={settings.startMinimized}
              disabled={saving || !settings.startWithWindows}
              onChange={(e) => update({ startMinimized: e.target.checked })}
            />
            <span className="toggle-text">Start minimized to tray</span>
          </label>
          <p className="toggle-hint">
            When enabled, the app launches in the background. Open it from the system tray icon.
          </p>
        </section>

        <section className="pref-section">
          <h3>Layout storage</h3>
          <p className="pref-description">
            By default, layouts are stored in the app's user data folder. Choose a custom folder
            (for example, a synced OneDrive or Dropbox folder) to back up or share your layouts.
          </p>

          <div className="folder-row">
            <code className="folder-path" title={settings.layoutFolder || 'Default (app user data)'}>
              {settings.layoutFolder || 'Default (app user data)'}
            </code>
            <button className="btn btn-secondary" onClick={handleOpenFolder} disabled={saving}>
              Open
            </button>
            <button className="btn btn-primary" onClick={handleChooseFolder} disabled={saving}>
              {settings.layoutFolder ? 'Change...' : 'Choose folder...'}
            </button>
            {settings.layoutFolder && (
              <button className="btn btn-secondary" onClick={handleClearFolder} disabled={saving}>
                Reset to default
              </button>
            )}
          </div>
          <p className="toggle-hint">
            When using a custom folder, each layout is saved as its own JSON file, plus an
            <code> index.json</code> tracking the current layout.
          </p>
        </section>

        <section className="pref-section">
          <h3>Scheduled layouts</h3>

          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.schedulesEnabled}
              disabled={saving}
              onChange={(e) => update({ schedulesEnabled: e.target.checked })}
            />
            <span className="toggle-text">Enable scheduled layout restores</span>
          </label>
          <p className="toggle-hint">
            Configure restore schedules for individual layouts on the Saved Layouts tab.
          </p>
        </section>
      </div>
    </div>
  );
}
