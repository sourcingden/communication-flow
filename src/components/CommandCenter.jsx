export default function CommandCenter({ counts, lastUpdated, onUpload, isDemo }) {
  return (
    <div className="command-center">
      <div className="cc-counters">
        <div className="counter critical">
          <span className="counter-icon">🔴</span>
          <span className="counter-num">{counts.critical}</span>
          <span className="counter-label">critical</span>
        </div>
        <div className="counter warning">
          <span className="counter-icon">🟡</span>
          <span className="counter-num">{counts.warning}</span>
          <span className="counter-label">warnings</span>
        </div>
        <div className="counter ok">
          <span className="counter-icon">🟢</span>
          <span className="counter-num">{counts.ok}</span>
          <span className="counter-label">ok</span>
        </div>
      </div>
      <div className="cc-right">
        {isDemo && (
          <span className="demo-badge">DEMO DATA</span>
        )}
        {lastUpdated && (
          <span className="cc-updated">
            Оновлено: {lastUpdated.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <label className="upload-btn">
          📂 Завантажити CSV
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={onUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>
    </div>
  );
}
