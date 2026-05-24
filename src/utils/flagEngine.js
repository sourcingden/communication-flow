import { differenceInDays } from 'date-fns';

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return differenceInDays(new Date(), d);
}

export function computeFlag(vacancy) {
  const flags  = [];
  const days   = daysSince(vacancy.newLeadLastMoved);
  const nl     = vacancy.newLeadCount ?? 0;
  const isFact = vacancy.isFact;
  const isPlan = vacancy.isPlan;

  // ── 🔴 CRITICAL ──────────────────────────────────────────────────────────────

  // New Lead stuck > 5 days
  if (days !== null && days > 5 && nl > 0) {
    flags.push({
      severity: 'critical',
      code: 'NEW_LEAD_STUCK_CRITICAL',
      message: `New Lead без руху ${days} днів (${nl} кандидатів)`,
    });
  }

  // IS = 0 this week (with plan, or just zero with pipeline activity)
  if (isFact === 0) {
    if (isPlan !== null && isPlan >= 2) {
      flags.push({
        severity: 'critical',
        code: 'IS_ZERO_VS_PLAN',
        message: `IS за тиждень = 0 при плані ${isPlan}`,
      });
    } else if (nl > 0) {
      // No plan data, but there IS pipeline activity → IS=0 is still suspicious
      flags.push({
        severity: 'critical',
        code: 'IS_ZERO',
        message: 'IS за тиждень = 0, є кандидати в pipeline',
      });
    }
  }

  // Vacancy active > 3 weeks, Submit = 0
  if (
    vacancy.activeWeeks !== null &&
    vacancy.activeWeeks > 3 &&
    (vacancy.submitCount === 0 || vacancy.submitCount === null)
  ) {
    flags.push({
      severity: 'critical',
      code: 'NO_SUBMIT',
      message: `Вакансія активна ${vacancy.activeWeeks} тижнів, Submit = 0`,
    });
  }

  // ── 🟡 WARNING ───────────────────────────────────────────────────────────────

  // IS < 50% of plan (only when plan is known and IS is non-zero)
  if (
    isPlan !== null && isPlan > 0 &&
    isFact !== null && isFact > 0 &&
    isFact < isPlan * 0.5 &&
    !flags.some(f => f.code === 'IS_ZERO_VS_PLAN')
  ) {
    flags.push({
      severity: 'warning',
      code: 'IS_LOW',
      message: `IS факт ${isFact} < 50% плану (${isPlan})`,
    });
  }

  // New Lead stuck 3–5 days
  if (days !== null && days >= 3 && days <= 5 && nl > 0) {
    flags.push({
      severity: 'warning',
      code: 'NEW_LEAD_STUCK_WARNING',
      message: `New Lead без руху ${days} днів`,
    });
  }

  // Low New Lead → IS conversion (need decent sample size)
  if (nl >= 50 && isFact !== null && isFact >= 0) {
    const conversion = nl > 0 ? isFact / nl : 0;
    if (conversion < 0.05) {
      flags.push({
        severity: 'warning',
        code: 'LOW_CONVERSION',
        message: `Конверсія New Lead→IS ${(conversion * 100).toFixed(1)}% (${isFact} IS / ${nl} New Lead)`,
      });
    }
  }

  const criticals = flags.filter(f => f.severity === 'critical');
  const warnings  = flags.filter(f => f.severity === 'warning');

  if (criticals.length) return { level: 'critical', flags };
  if (warnings.length)  return { level: 'warning',  flags };
  return { level: 'ok', flags: [] };
}

export function generateSlackMessage(vacancy, flagResult) {
  const { flags } = flagResult;
  const isFact    = vacancy.isFact   !== null ? vacancy.isFact   : '—';
  const isPlan    = vacancy.isPlan   !== null ? vacancy.isPlan   : '—';
  const nl        = vacancy.newLeadCount !== null ? vacancy.newLeadCount : '—';
  const submits   = vacancy.submitCount  !== null ? vacancy.submitCount  : '—';

  const convRate  = (typeof vacancy.newLeadCount === 'number' && typeof vacancy.isFact === 'number' && vacancy.newLeadCount > 0)
    ? `конверсія New Lead→IS — ${((vacancy.isFact / vacancy.newLeadCount) * 100).toFixed(1)}%`
    : null;

  const situationParts = [
    nl !== '—' ? `${nl} кандидатів у New Lead` : null,
    convRate,
    submits !== '—' ? `${submits} Submit(s) до клієнта` : null,
  ].filter(Boolean);

  const flagText = flags.map(f => `• ${f.message}`).join('\n');

  return `[${vacancy.id} | ${vacancy.title}] Статус пайплайну
Ситуація: ${situationParts.join(', ') || 'потребує уваги'}.
IS план/факт: ${isPlan}/${isFact}.${flagText ? `\n🚨 Флаги:\n${flagText}` : ''}
Запущено: [заповнити — наприклад, новий Copilot сіквенс на X профілів].
Очікуємо: [заповнити — кількість відповідей до дати].
Якщо до [дата] без прогресу — ескалую на перегляд ICP.`;
}
