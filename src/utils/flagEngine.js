import { differenceInDays } from 'date-fns';

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return differenceInDays(new Date(), d);
}

export function computeFlag(vacancy) {
  const flags = [];
  const days = daysSince(vacancy.newLeadLastMoved);

  // CRITICAL checks
  if (days !== null && days > 5 && vacancy.newLeadCount > 0) {
    flags.push({ severity: 'critical', code: 'NEW_LEAD_STUCK_CRITICAL', message: `New Lead без руху ${days} днів` });
  }
  if (vacancy.isFact === 0 && vacancy.isPlan >= 2) {
    flags.push({ severity: 'critical', code: 'IS_ZERO', message: `IS за тиждень = 0 при плані ${vacancy.isPlan}` });
  }
  if (vacancy.activeWeeks !== null && vacancy.activeWeeks > 3 && (vacancy.submitCount === 0 || vacancy.submitCount === null)) {
    flags.push({ severity: 'critical', code: 'NO_SUBMIT', message: `Вакансія активна ${vacancy.activeWeeks} тижнів, Submit = 0` });
  }

  // WARNING checks
  if (vacancy.isPlan > 0 && vacancy.isFact !== null && vacancy.isFact < vacancy.isPlan * 0.5 && !flags.some(f => f.code === 'IS_ZERO')) {
    flags.push({ severity: 'warning', code: 'IS_LOW', message: `IS факт ${vacancy.isFact} < 50% плану (${vacancy.isPlan})` });
  }
  if (days !== null && days >= 3 && days <= 5 && vacancy.newLeadCount > 0) {
    flags.push({ severity: 'warning', code: 'NEW_LEAD_STUCK_WARNING', message: `New Lead без руху ${days} днів` });
  }
  if (vacancy.newLeadCount > 50 && vacancy.isFact !== null && vacancy.newLeadCount > 0) {
    const conversion = vacancy.isFact / vacancy.newLeadCount;
    if (conversion < 0.05) {
      flags.push({ severity: 'warning', code: 'LOW_CONVERSION', message: `Конверсія New Lead→IS ${(conversion * 100).toFixed(1)}% < 5%` });
    }
  }

  const criticals = flags.filter(f => f.severity === 'critical');
  const warnings = flags.filter(f => f.severity === 'warning');

  if (criticals.length) return { level: 'critical', flags };
  if (warnings.length) return { level: 'warning', flags };
  return { level: 'ok', flags: [] };
}

export function generateSlackMessage(vacancy, flagResult) {
  const { flags } = flagResult;
  const issueText = flags.map(f => f.message).join('; ');
  const isFact = vacancy.isFact !== null ? vacancy.isFact : '—';
  const isPlan = vacancy.isPlan !== null ? vacancy.isPlan : '—';
  const newLeadInfo = vacancy.newLeadCount !== null ? `${vacancy.newLeadCount} кандидатів у New Lead` : '';
  const convRate = (vacancy.newLeadCount && vacancy.isFact)
    ? `конверсія в IS — ${((vacancy.isFact / vacancy.newLeadCount) * 100).toFixed(1)}% за останні 7 днів`
    : '';

  const situation = [newLeadInfo, convRate].filter(Boolean).join(', ');

  return `[${vacancy.id} | ${vacancy.title}] Статус пайплайну
Ситуація: ${situation || issueText || 'потребує уваги'}.
IS план/факт: ${isPlan}/${isFact}.
Запущено: [заповнити — наприклад, новий Copilot сіквенс].
Очікуємо: [заповнити — кількість відповідей до дати].
Якщо до [дата] немає прогресу — ескалую на перегляд ICP.`;
}
