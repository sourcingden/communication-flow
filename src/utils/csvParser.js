import Papa from 'papaparse';

export function detectFileType(filename, headers) {
  const name = filename.toLowerCase();
  const h = headers.map(h => h.toLowerCase());

  if (name.includes('week_over_week') || (h.includes('is plan') || h.includes('is_plan') || h.some(x => x.includes('plan')))) {
    return 'week_over_week';
  }
  if (name.includes('pipeline_by_credited') || name.includes('pipeline') && name.includes('daily')) {
    return 'pipeline_daily';
  }
  if (name.includes('submitted_to_client') || name.includes('submitted')) {
    return 'submitted';
  }
  return 'unknown';
}

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
      complete: (results) => {
        if (results.errors.length && results.data.length === 0) {
          reject(new Error(results.errors[0].message));
          return;
        }
        const fileType = detectFileType(file.name, results.meta.fields || []);
        resolve({ type: fileType, data: results.data, filename: file.name });
      },
      error: reject,
    });
  });
}

function normalizeKey(obj, candidates) {
  for (const key of candidates) {
    const found = Object.keys(obj).find(k => k.toLowerCase().trim() === key.toLowerCase());
    if (found) return obj[found];
  }
  return undefined;
}

function extractNxjId(str) {
  if (!str) return null;
  const match = String(str).match(/NXJ[-\s]?(\d+)/i);
  return match ? `NXJ-${match[1]}` : String(str).trim() || null;
}

export function mergeData(parsedFiles) {
  const vacancies = {};

  const ensure = (id, title) => {
    if (!vacancies[id]) {
      vacancies[id] = {
        id,
        title: title || id,
        isPlan: null,
        isFact: null,
        newLeadCount: null,
        newLeadLastMoved: null,
        isStage: {},
        submitCount: null,
        activeWeeks: null,
        copilotPipeline: null,
        isConversionRate: null,
        rawStages: {},
        dataSource: [],
      };
    }
    if (title && vacancies[id].title === id) {
      vacancies[id].title = title;
    }
  };

  for (const { type, data } of parsedFiles) {
    if (type === 'week_over_week') {
      for (const row of data) {
        const id = extractNxjId(normalizeKey(row, ['nxj id', 'job id', 'requisition id', 'id', 'nxj_id']));
        const title = normalizeKey(row, ['job title', 'title', 'vacancy', 'position', 'role']);
        const plan = parseFloat(normalizeKey(row, ['is plan', 'is_plan', 'plan is', 'interviews scheduled plan', 'plan']));
        const fact = parseFloat(normalizeKey(row, ['is fact', 'is_fact', 'fact is', 'interviews scheduled fact', 'fact', 'actual']));
        if (!id) continue;
        ensure(id, title);
        vacancies[id].isPlan = isNaN(plan) ? vacancies[id].isPlan : plan;
        vacancies[id].isFact = isNaN(fact) ? vacancies[id].isFact : fact;
        vacancies[id].dataSource.push('week_over_week');
      }
    }

    if (type === 'pipeline_daily') {
      for (const row of data) {
        const id = extractNxjId(normalizeKey(row, ['nxj id', 'job id', 'requisition id', 'id', 'nxj_id']));
        const title = normalizeKey(row, ['job title', 'title', 'vacancy', 'position', 'role']);
        const stage = normalizeKey(row, ['stage', 'pipeline stage', 'current stage']);
        const count = parseInt(normalizeKey(row, ['count', 'candidates', 'total', 'num candidates', 'candidate count']));
        const lastMoved = normalizeKey(row, ['last moved', 'last_moved', 'date', 'last activity', 'updated at', 'last updated']);
        if (!id) continue;
        ensure(id, title);
        if (stage) {
          vacancies[id].rawStages[stage] = count || 0;
        }
        const stageNorm = (stage || '').toLowerCase();
        if (stageNorm.includes('new lead') || stageNorm.includes('new_lead')) {
          vacancies[id].newLeadCount = count || vacancies[id].newLeadCount;
          if (lastMoved) vacancies[id].newLeadLastMoved = lastMoved;
        }
        vacancies[id].dataSource.push('pipeline_daily');
      }
    }

    if (type === 'submitted') {
      for (const row of data) {
        const id = extractNxjId(normalizeKey(row, ['nxj id', 'job id', 'requisition id', 'id', 'nxj_id']));
        const title = normalizeKey(row, ['job title', 'title', 'vacancy', 'position', 'role']);
        const count = parseInt(normalizeKey(row, ['submitted', 'submit count', 'total submitted', 'count', 'clients submitted', 'submitted to client']));
        const createdAt = normalizeKey(row, ['created at', 'created_at', 'open date', 'posted date', 'opened']);
        if (!id) continue;
        ensure(id, title);
        vacancies[id].submitCount = isNaN(count) ? vacancies[id].submitCount : count;
        if (createdAt) {
          const weeks = Math.floor((Date.now() - new Date(createdAt)) / (7 * 24 * 3600 * 1000));
          vacancies[id].activeWeeks = weeks;
        }
        vacancies[id].dataSource.push('submitted');
      }
    }
  }

  return Object.values(vacancies);
}
