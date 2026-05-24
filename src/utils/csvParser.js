import Papa from 'papaparse';

// ─── File type detection by Ashby filename ───────────────────────────────────
export function detectFileType(filename) {
  const n = filename.toLowerCase();
  if (n.includes('all_open_jobs'))               return 'job_list';
  if (n.includes('scheduled_initial_screens'))    return 'initial_screens';
  if (n.includes('submitted_to_client'))          return 'submitted';
  if (n.includes('interviewing_activity'))        return 'interviewing';
  if (n.includes('pipeline_by_credited_to'))      return 'pipeline';
  if (n.includes('week_over_week'))               return 'wow';
  // Fallback: inspect headers
  return 'unknown';
}

// ─── Raw CSV parse ────────────────────────────────────────────────────────────
export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      complete: results => {
        if (results.errors.length && results.data.length === 0) {
          reject(new Error(results.errors[0].message));
          return;
        }
        let type = detectFileType(file.name);
        // Fallback header-based detection
        if (type === 'unknown') {
          const h = (results.meta.fields || []).join('|').toLowerCase();
          if (h.includes("job's requisition id"))      type = 'job_list';
          else if (h.includes('week of') && h.includes('stage group')) type = 'pipeline';
          else if (h.includes('day') && h.includes('count'))           type = 'initial_screens';
        }
        resolve({ type, data: results.data, filename: file.name, fields: results.meta.fields || [] });
      },
      error: reject,
    });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeTitle(t) {
  return (t || '').toLowerCase().trim()
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ');
}

function parseAshbyDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Parse a `->` tree row into its path parts + numeric count
function treeRow(row, fields) {
  const pathKey = fields[0];
  const path = (row[pathKey] || '').trim();
  // Split on " -> " with optional surrounding whitespace
  const parts = path.split(/\s*->\s*/).map(p => p.trim()).filter(Boolean);
  const count = parseInt(row[fields[1]] || row['Count'] || '0') || 0;
  return { parts, count };
}

// ─── scheduled_initial_screens_daily parser ──────────────────────────────────
// Tree: [ Date, Job, Stage?, ... ]  →  depth-2 rows = total IS per job per day
function extractInitialScreens(data, fields) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const result = new Map(); // jobTitle → { total, lastDate }

  for (const row of data) {
    const { parts, count } = treeRow(row, fields);
    // Depth exactly 2: [date, jobTitle]  ← job-level daily total
    if (parts.length !== 2 || count === 0) continue;
    const date = parseAshbyDate(parts[0]);
    if (!date || date < sevenDaysAgo) continue;
    const job = parts[1];
    if (!result.has(job)) result.set(job, { total: 0, lastDate: null });
    const e = result.get(job);
    e.total += count;
    if (!e.lastDate || date > e.lastDate) e.lastDate = date;
  }
  return result;
}

// ─── submitted_to_client_daily parser ────────────────────────────────────────
// Pivot: col[0] = " -> Sourcer -> Job -> ...", col[1..n] = date columns
// Depth-2 rows = [Sourcer, Job] → sum all date cols
function extractSubmits(data, fields) {
  const pathKey = fields[0];
  const dateCols = fields.slice(1);
  const result = new Map(); // jobTitle → total

  for (const row of data) {
    const path = (row[pathKey] || '').trim();
    const parts = path.split(/\s*->\s*/).map(p => p.trim()).filter(Boolean);
    if (parts.length !== 2) continue; // [sourcer, job]
    const job = parts[1];
    const sum = dateCols.reduce((acc, col) => acc + (parseInt(row[col]) || 0), 0);
    result.set(job, (result.get(job) || 0) + sum);
  }
  return result;
}

// ─── pipeline_by_credited_to_daily parser ────────────────────────────────────
// Structured CSV: Week of | Credited To | Job | Stage Group | Recruiter | Source | Count
function extractPipeline(data) {
  const JOB   = "Job Consideration's Job";
  const STAGE = "Job Consideration's Current Interview Stage Group";
  const WEEK  = "Week of";
  const COUNT = "Count";

  // All unique weeks, sorted ascending
  const weeks = [...new Set(data.map(r => r[WEEK]).filter(Boolean))].sort();
  const currentWeek = weeks.at(-1);
  const prevWeek    = weeks.at(-2) ?? null;

  // currentWeek stage counts per job
  const stageMap   = new Map(); // jobTitle → { stageName: count }
  // prevWeek New Lead per job
  const prevNLMap  = new Map(); // jobTitle → count
  // how many distinct weeks each job appears
  const weekCounts = new Map(); // jobTitle → Set<week>

  for (const row of data) {
    const job   = row[JOB];
    const stage = row[STAGE];
    const week  = row[WEEK];
    const count = parseInt(row[COUNT]) || 0;
    if (!job || !stage || !week) continue;

    // Count distinct weeks per job
    if (!weekCounts.has(job)) weekCounts.set(job, new Set());
    weekCounts.get(job).add(week);

    if (week === currentWeek) {
      if (!stageMap.has(job)) stageMap.set(job, {});
      stageMap.get(job)[stage] = (stageMap.get(job)[stage] || 0) + count;
    }
    if (prevWeek && week === prevWeek && stage === 'New Lead') {
      prevNLMap.set(job, (prevNLMap.get(job) || 0) + count);
    }
  }

  return { stageMap, prevNLMap, weekCounts, currentWeek };
}

// ─── Main merge ───────────────────────────────────────────────────────────────
export function mergeData(parsedFiles) {
  const vacancies  = {};        // key: NXJ-ID (or normalized title if no ID)
  const titleToId  = new Map(); // normalizedTitle → NXJ-ID
  const openTitles = new Set(); // normalizedTitle of open jobs

  // ── Pass 1: build ID map from job_list ──────────────────────────────────────
  const sorted = [
    ...parsedFiles.filter(f => f.type === 'job_list'),
    ...parsedFiles.filter(f => f.type !== 'job_list'),
  ];
  const hasJobList = sorted.some(f => f.type === 'job_list');
  const hasInitialScreens = sorted.some(f => f.type === 'initial_screens');
  const hasSubmitted      = sorted.some(f => f.type === 'submitted');

  for (const { type, data } of sorted) {
    if (type !== 'job_list') continue;
    for (const row of data) {
      const title  = row["Job's Job"];
      const nxjId  = (row["Job's Requisition ID"] || '').trim();
      const status = (row["Job's Job Status"] || '').toLowerCase();
      if (!title) continue;
      const norm = normalizeTitle(title);
      if (nxjId) titleToId.set(norm, nxjId);
      if (status === 'open') openTitles.add(norm);
    }
  }

  // Helper: get or create a vacancy entry
  const ensure = (titleRaw, hintId) => {
    const norm = normalizeTitle(titleRaw);
    const id   = hintId || titleToId.get(norm) || `UNKNOWN-${norm.slice(0, 30)}`;
    if (!vacancies[id]) {
      vacancies[id] = {
        id,
        title: titleRaw || id,
        isPlan: null,
        isFact: null,
        newLeadCount: null,
        newLeadLastMoved: null,
        submitCount: null,
        activeWeeks: null,
        rawStages: {},
        dataSource: [],
        _norm: norm,
      };
    }
    // Upgrade title if we now have a better one
    if (titleRaw && vacancies[id].title === id) vacancies[id].title = titleRaw;
    return id;
  };

  // ── Pass 2: process each file ────────────────────────────────────────────────
  for (const { type, data, fields } of sorted) {

    // ── job_list ──────────────────────────────────────────────────────────────
    if (type === 'job_list') {
      for (const row of data) {
        const title  = row["Job's Job"];
        const nxjId  = (row["Job's Requisition ID"] || '').trim();
        const status = (row["Job's Job Status"] || '').toLowerCase();
        if (!title || status !== 'open') continue;
        const id = ensure(title, nxjId || undefined);
        vacancies[id].dataSource.push('job_list');
      }
    }

    // ── pipeline_by_credited_to_daily ─────────────────────────────────────────
    if (type === 'pipeline') {
      const { stageMap, prevNLMap, weekCounts, currentWeek } = extractPipeline(data);
      const cwDate = parseAshbyDate(currentWeek);

      for (const [jobTitle, stages] of stageMap) {
        const id = ensure(jobTitle);
        const v  = vacancies[id];

        v.rawStages   = { ...v.rawStages, ...stages };
        v.activeWeeks = weekCounts.get(jobTitle)?.size ?? null;
        v.dataSource.push('pipeline');

        const currentNL = stages['New Lead'] || 0;
        if (currentNL > 0) {
          v.newLeadCount = currentNL;
          const prevNL   = prevNLMap.get(jobTitle) || 0;

          if (cwDate) {
            if (prevNL > 0 && currentNL < prevNL) {
              // Movement happened in current week → lastMoved ≈ midpoint of current week
              const mid = new Date(cwDate.getTime() + 3.5 * 24 * 3600 * 1000);
              v.newLeadLastMoved = mid.toISOString();
            } else if (prevNL > 0 && currentNL >= prevNL) {
              // No decrease → stuck since at least the previous week
              const prevWeekMid = new Date(cwDate.getTime() - 3.5 * 24 * 3600 * 1000);
              v.newLeadLastMoved = prevWeekMid.toISOString();
            } else {
              // First time seeing this job → use current week start
              v.newLeadLastMoved = cwDate.toISOString();
            }
          }
        }
      }
    }

    // ── scheduled_initial_screens_daily ──────────────────────────────────────
    if (type === 'initial_screens') {
      const isData = extractInitialScreens(data, fields);
      for (const [jobTitle, { total }] of isData) {
        const id = ensure(jobTitle);
        vacancies[id].isFact = (vacancies[id].isFact ?? 0) + total;
        vacancies[id].dataSource.push('initial_screens');
      }
    }

    // ── submitted_to_client_daily ─────────────────────────────────────────────
    if (type === 'submitted') {
      const submitData = extractSubmits(data, fields);
      for (const [jobTitle, total] of submitData) {
        const id = ensure(jobTitle);
        vacancies[id].submitCount = (vacancies[id].submitCount ?? 0) + total;
        vacancies[id].dataSource.push('submitted');
      }
    }

    // ── interviewing_activity ─────────────────────────────────────────────────
    // Tree: [ Date, Job, Sourcer, SourceType, Stage, Interviewer, Decision, Reason ]
    // Depth-2 rows = total interviews scheduled per job per day (last 7 days)
    if (type === 'interviewing') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      for (const row of data) {
        const { parts, count } = treeRow(row, fields);
        if (parts.length !== 2 || count === 0) continue;
        const date = parseAshbyDate(parts[0]);
        if (!date || date < sevenDaysAgo) continue;
        const id = ensure(parts[1]);
        // Only add if initial_screens didn't already provide isFact
        if (vacancies[id].isFact === null) {
          vacancies[id].isFact = (vacancies[id].isFact ?? 0) + count;
        }
        vacancies[id].dataSource.push('interviewing');
      }
    }

    // ── week_over_week_trends (IS plan vs fact) ───────────────────────────────
    if (type === 'wow') {
      for (const row of data) {
        const keys = Object.keys(row);
        const titleKey = keys.find(k => /title|job|vacancy|position/i.test(k));
        const idKey    = keys.find(k => /nxj|requisition|job.?id/i.test(k));
        const planKey  = keys.find(k => /plan/i.test(k));
        const factKey  = keys.find(k => /fact|actual/i.test(k));
        const title = row[titleKey] || row[idKey];
        const nxjId = row[idKey];
        if (!title) continue;
        const id = ensure(title, nxjId?.trim());
        if (planKey) vacancies[id].isPlan = parseFloat(row[planKey]) || null;
        if (factKey) vacancies[id].isFact = parseFloat(row[factKey]) || null;
        vacancies[id].dataSource.push('wow');
      }
    }
  }

  // ── Post-processing ──────────────────────────────────────────────────────────
  // Zero-fill isFact / submitCount for jobs we scanned but found nothing
  for (const v of Object.values(vacancies)) {
    if (hasInitialScreens && v.isFact === null) v.isFact = 0;
    if (hasSubmitted && v.submitCount === null) v.submitCount = 0;
  }

  // If we have a job list, keep only open jobs
  const allVacs = Object.values(vacancies).filter(v => !v.id.startsWith('UNKNOWN-') || !hasJobList);
  if (hasJobList && openTitles.size > 0) {
    return allVacs.filter(v => openTitles.has(v._norm));
  }
  return allVacs;
}
