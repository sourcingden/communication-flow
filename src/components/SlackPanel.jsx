import { useState } from 'react';
import { generateSlackMessage } from '../utils/flagEngine';

export default function SlackPanel({ vacancy, channelMap, onClose }) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [editedMsg, setEditedMsg] = useState(() =>
    vacancy ? generateSlackMessage(vacancy, vacancy.flagResult) : ''
  );

  if (!vacancy) {
    return (
      <div className="slack-panel empty">
        <p>Оберіть вакансію з таблиці, щоб побачити Slack-повідомлення.</p>
      </div>
    );
  }

  const channel = channelMap[vacancy.id] || channelMap['default'] || '#sourcing-updates';

  const handleCopy = () => {
    navigator.clipboard.writeText(editedMsg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    setSending(true);
    // Placeholder — real Slack API call would go through backend or Slack MCP
    await new Promise(r => setTimeout(r, 800));
    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <div className="slack-panel">
      <div className="panel-header">
        <div>
          <span className="panel-title">Slack-повідомлення</span>
          <span className="channel-badge">{channel}</span>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <textarea
        className="slack-msg"
        value={editedMsg}
        onChange={e => setEditedMsg(e.target.value)}
        rows={10}
      />

      <div className="panel-actions">
        <button className="btn-copy" onClick={handleCopy}>
          {copied ? '✓ Скопійовано' : 'Copy'}
        </button>
        <button className="btn-send" onClick={handleSend} disabled={sending || sent}>
          {sent ? '✓ Надіслано' : sending ? 'Надсилання...' : `Send to ${channel}`}
        </button>
      </div>
    </div>
  );
}
