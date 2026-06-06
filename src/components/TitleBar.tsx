export function TitleBar({ onSaveClick }: { onSaveClick: () => void }) {
  const handleMinimize = async () => {
    await window.electronAPI.minimizeWindow();
  };

  const handleMaximize = async () => {
    await window.electronAPI.maximizeWindow();
  };

  const handleClose = async () => {
    await window.electronAPI.closeWindow();
  };

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <svg
          className="title-bar-icon-svg"
          width="18"
          height="18"
          viewBox="0 0 512 512"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect width="512" height="512" rx="96" ry="96" fill="currentColor" opacity="0.15"/>
          <g fill="none" stroke="currentColor" stroke-width="36" stroke-linecap="round" stroke-linejoin="round">
            <line x1="124" y1="372" x2="204" y2="372"/>
            <rect x="256" y="252" width="80" height="80" rx="6" ry="6"/>
            <line x1="408" y1="252" x2="488" y2="332"/>
            <line x1="488" y1="252" x2="408" y2="332"/>
          </g>
        </svg>
        <span className="title-bar-title">Window Layout Manager</span>
      </div>
      <div className="title-bar-actions">
        <button className="title-bar-btn save-btn" onClick={onSaveClick} title="Save Current Layout">
          <span className="btn-icon">💾</span>
          <span className="btn-text">Save Layout</span>
        </button>
        <div className="window-controls">
          <button 
            className="title-bar-btn window-control-btn" 
            onClick={handleMinimize}
            title="Minimize"
            aria-label="Minimize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1"/>
            </svg>
          </button>
          <button 
            className="title-bar-btn window-control-btn" 
            onClick={handleMaximize}
            title="Maximize"
            aria-label="Maximize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none"/>
            </svg>
          </button>
          <button 
            className="title-bar-btn window-control-btn close-btn" 
            onClick={handleClose}
            title="Close"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1"/>
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
