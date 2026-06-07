interface AboutProps {
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function About({ addToast: _addToast }: AboutProps) {
  return (
    <div className="about">
      <div className="about-card">
        <div className="about-header">
          <svg
            className="about-icon-svg"
            width="48"
            height="48"
            viewBox="0 0 512 512"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect width="512" height="512" rx="96" ry="96" fill="currentColor" opacity="0.15"/>
            <g fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">
              <line x1="124" y1="292" x2="204" y2="292"/>
              <rect x="256" y="252" width="80" height="80" rx="6" ry="6"/>
              <line x1="408" y1="252" x2="488" y2="332"/>
              <line x1="488" y1="252" x2="408" y2="332"/>
            </g>
          </svg>
          <div>
            <h2>Window Layout Manager</h2>
            <p className="about-version">Version 1.1.1</p>
          </div>
        </div>

        <p className="about-tagline">
          Save and restore window positions across monitors and sessions.
        </p>

        <div className="about-section">
          <h3>What it does</h3>
          <ul className="about-list">
            <li>Captures the position, size, and monitor of every open window.</li>
            <li>Saves the snapshot as a named layout you can restore later.</li>
            <li>Restores layouts by repositioning existing windows — no duplicates.</li>
            <li>Un-minimizes windows that are already running instead of relaunching them.</li>
            <li>Optionally launches apps that aren't running when you restore a layout.</li>
          </ul>
        </div>

        <div className="about-section">
          <h3>How to use</h3>
          <ol className="about-list">
            <li>Arrange your windows the way you want them.</li>
            <li>Click <strong>Save Layout</strong> in the title bar and give it a name.</li>
            <li>From the <strong>Saved Layouts</strong> tab, click <strong>Restore</strong>.</li>
            <li>Toggle <strong>Launch apps that are not running</strong> to start any closed apps automatically.</li>
          </ol>
        </div>

        <div className="about-section">
          <h3>Tips</h3>
          <ul className="about-list">
            <li>Minimized windows will be un-minimized and repositioned when restoring — no new windows are spawned.</li>
            <li>The system tray icon offers quick Save and Restore shortcuts.</li>
            <li>Layouts are stored locally and persist across app restarts.</li>
          </ul>
        </div>

        <div className="about-section about-footer">
          <p className="hint-text">
            Built with Electron, React, and a small PowerShell helper for window positioning.
          </p>
        </div>
      </div>
    </div>
  );
}
