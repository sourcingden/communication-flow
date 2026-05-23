import { useState, useCallback } from 'react';
import CommandCenter from './components/CommandCenter';
import VacancyGrid from './components/VacancyGrid';
import SlackPanel from './components/SlackPanel';
import SettingsModal from './components/SettingsModal';
import { parseCSV, mergeData } from './utils/csvParser';
import { computeFlag } from './utils/flagEngine';
import { SAMPLE_VACANCIES } from './utils/sampleData';
import './App.css';

const DEFAULT_CHANNEL_MAP = {
  'NXJ-136': '#wsc-fullstack',
  'NXJ-130': '#wsc-android',
  'NXJ-137': '#wsc-fs-dev',
  'default': '#sourcing-updates',
};

function withFlags(vacancies) {
  return vacancies.map(v => ({ ...v, flagResult: computeFlag(v) }));
}

const INITIAL_VACANCIES = withFlags(SAMPLE_VACANCIES);

export default function App() {
  const [vacancies, setVacancies] = useState(INITIAL_VACANCIES);
  const [isDemo, setIsDemo] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selected, setSelected] = useState(null);
  const [channelMap, setChannelMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('channelMap')) || DEFAULT_CHANNEL_MAP;
    } catch {
      return DEFAULT_CHANNEL_MAP;
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const processFiles = useCallback(async (files) => {
    setError(null);
    try {
      const parsed = await Promise.all(Array.from(files).map(parseCSV));
      const merged = mergeData(parsed);
      if (merged.length === 0) {
        setError('Не вдалося розпізнати вакансії у файлі. Перевірте формат CSV.');
        return;
      }
      setVacancies(withFlags(merged));
      setIsDemo(false);
      setLastUpdated(new Date());
      setSelected(null);
    } catch (e) {
      setError(`Помилка парсингу: ${e.message}`);
    }
  }, []);

  const handleUpload = (e) => processFiles(e.target.files);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  const handleSaveChannelMap = (map) => {
    setChannelMap(map);
    localStorage.setItem('channelMap', JSON.stringify(map));
  };

  const counts = vacancies.reduce(
    (acc, v) => { acc[v.flagResult.level]++; return acc; },
    { critical: 0, warning: 0, ok: 0 }
  );

  return (
    <div
      className={`app ${dragOver ? 'drag-active' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Pipeline Monitor</h1>
          <span className="header-sub">Sourcing Command Center</span>
        </div>
        <button className="settings-btn" onClick={() => setShowSettings(true)}>
          ⚙ Channel Map
        </button>
      </header>

      <CommandCenter
        counts={counts}
        lastUpdated={lastUpdated}
        onUpload={handleUpload}
        isDemo={isDemo}
      />

      {error && (
        <div className="error-bar">⚠ {error}</div>
      )}

      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-hint">Відпустіть CSV файли</div>
        </div>
      )}

      <div className="main-layout">
        <div className="grid-section">
          <VacancyGrid
            vacancies={vacancies}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <div className="panel-section">
          <SlackPanel
            vacancy={selected}
            channelMap={channelMap}
            onClose={() => setSelected(null)}
          />
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          channelMap={channelMap}
          onSave={handleSaveChannelMap}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
