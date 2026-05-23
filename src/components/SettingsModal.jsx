import { useState } from 'react';

export default function SettingsModal({ channelMap, onSave, onClose }) {
  const [rows, setRows] = useState(() =>
    Object.entries(channelMap).map(([id, channel]) => ({ id, channel }))
  );

  const addRow = () => setRows([...rows, { id: '', channel: '' }]);
  const removeRow = (i) => setRows(rows.filter((_, idx) => idx !== i));
  const updateRow = (i, field, val) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    setRows(next);
  };

  const handleSave = () => {
    const map = {};
    for (const { id, channel } of rows) {
      if (id.trim() && channel.trim()) {
        map[id.trim()] = channel.trim().startsWith('#') ? channel.trim() : `#${channel.trim()}`;
      }
    }
    if (!map['default']) map['default'] = '#sourcing-updates';
    onSave(map);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Channel Mapping</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <p className="modal-hint">Прив'язка вакансій до Slack-каналів. Дефолт — #sourcing-updates.</p>
        <table className="mapping-table">
          <thead>
            <tr><th>NXJ ID</th><th>Slack Channel</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={row.id}
                    onChange={e => updateRow(i, 'id', e.target.value)}
                    placeholder="NXJ-136 або default"
                    className="map-input"
                  />
                </td>
                <td>
                  <input
                    value={row.channel}
                    onChange={e => updateRow(i, 'channel', e.target.value)}
                    placeholder="#channel-name"
                    className="map-input"
                  />
                </td>
                <td>
                  <button className="remove-btn" onClick={() => removeRow(i)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-footer">
          <button className="btn-add" onClick={addRow}>+ Додати</button>
          <button className="btn-save" onClick={handleSave}>Зберегти</button>
        </div>
      </div>
    </div>
  );
}
