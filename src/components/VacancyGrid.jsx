const SEVERITY_ORDER = { critical: 0, warning: 1, ok: 2 };
const FLAG_ICON = { critical: '🔴', warning: '🟡', ok: '🟢' };

export default function VacancyGrid({ vacancies, selected, onSelect }) {
  const sorted = [...vacancies].sort(
    (a, b) => SEVERITY_ORDER[a.flagResult.level] - SEVERITY_ORDER[b.flagResult.level]
  );

  return (
    <div className="vacancy-grid-wrap">
      <table className="vacancy-grid">
        <thead>
          <tr>
            <th>NXJ ID</th>
            <th>Назва</th>
            <th>IS план</th>
            <th>IS факт</th>
            <th>New Lead</th>
            <th>Прапор</th>
            <th>Дія</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((v) => (
            <VacancyRow
              key={v.id}
              vacancy={v}
              isSelected={selected?.id === v.id}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VacancyRow({ vacancy, isSelected, onSelect }) {
  const { level, flags } = vacancy.flagResult;
  const firstFlag = flags[0];

  return (
    <>
      <tr
        className={`vacancy-row ${level} ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelect(vacancy)}
      >
        <td className="monospace">{vacancy.id}</td>
        <td>{vacancy.title}</td>
        <td className="num">{vacancy.isPlan ?? '—'}</td>
        <td className="num">{vacancy.isFact ?? '—'}</td>
        <td className="num">{vacancy.newLeadCount ?? '—'}</td>
        <td>
          <span className="flag-badge">
            {FLAG_ICON[level]} {level.toUpperCase()}
          </span>
        </td>
        <td>
          <button
            className="action-btn"
            onClick={(e) => { e.stopPropagation(); onSelect(vacancy); }}
          >
            Slack ↗
          </button>
        </td>
      </tr>
      {isSelected && (
        <tr className={`detail-row ${level}`}>
          <td colSpan={7}>
            <div className="detail-content">
              {flags.length > 0 ? (
                <ul className="flags-list">
                  {flags.map((f, i) => (
                    <li key={i} className={`flag-item ${f.severity}`}>
                      {FLAG_ICON[f.severity]} {f.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="ok-msg">✅ Вакансія в нормі — рух є, IS на плані.</span>
              )}
              {Object.keys(vacancy.rawStages).length > 0 && (
                <div className="stages">
                  {Object.entries(vacancy.rawStages).map(([stage, count]) => (
                    <span key={stage} className="stage-chip">
                      {stage}: <strong>{count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
