/* Cyl Gymly (antes Healthym / Treino & Saúde) — núcleo de regras, sem interface.
 * Funções puras: datas, números, validação, nutrição, frequência, força, backup e migração.
 * Roda no navegador/WebView (window.HCore) e no Node (require) para os testes automatizados.
 */
(function (root) {
'use strict';
const C = {};

C.FORMAT_VERSION = 1;   // formato do arquivo de backup exportado
C.DB_VERSION = 2;       // versão da estrutura de dados (2 = histórico de dias de treino)
C.MAX_BACKUP_BYTES = 60 * 1024 * 1024;
C.MAX_PHOTO_CHARS = 8 * 1024 * 1024;
C.MAX_STRING = 5000;
C.SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
C.STATUSES = ['concluida', 'parcial', 'adiada', 'nao_realizada', 'em_andamento'];
C.ATTENDED = ['concluida', 'parcial'];

// ------------------------------------------------------------------ texto
C.esc = v => String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));

// ------------------------------------------------------------------ datas (sempre no fuso local)
const pad = n => String(n).padStart(2, '0');
C.pad = pad;
C.isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
C.today = () => C.isoDate(new Date());
C.nowTime = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
C.isDate = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return y >= 1900 && y <= 2200 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};
C.isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
// meio-dia local evita erros de horário de verão
C.parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
C.addDays = (s, n) => { const d = C.parseD(s); d.setDate(d.getDate() + n); return C.isoDate(d); };
C.diffDays = (a, b) => Math.round((C.parseD(b) - C.parseD(a)) / 864e5);
C.wd = s => { const g = C.parseD(s).getDay(); return g === 0 ? 7 : g; }; // 1 = segunda ... 7 = domingo
C.weekStart = s => C.addDays(s, 1 - C.wd(s));
C.datesBetween = (from, to) => { const out = []; for (let d = from; d <= to; d = C.addDays(d, 1)) out.push(d); return out; };
C.localDateOfIso = iso => { const d = new Date(iso); return isNaN(d) ? null : C.isoDate(d); };

// ------------------------------------------------------------------ números
// Aceita "114,5" ou "114.5". Rejeita separador de milhar, notação científica, NaN e Infinity.
C.parseNumber = raw => {
  if (raw == null) return { empty: true, value: null, valid: true };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { empty: false, value: raw, valid: true } : { empty: false, value: null, valid: false };
  const s = String(raw).trim();
  if (s === '') return { empty: true, value: null, valid: true };
  if (!/^-?\d{1,7}([.,]\d{1,4})?$/.test(s)) return { empty: false, value: null, valid: false };
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) ? { empty: false, value: v, valid: true } : { empty: false, value: null, valid: false };
};
C.num = raw => { const r = C.parseNumber(raw); return r.valid ? r.value : null; };

C.RANGES = {
  weight: [30, 400, 'kg'], height: [100, 250, 'cm'], age: [10, 120, 'anos', true], measure: [10, 300, 'cm'],
  waterMl: [1, 5000, 'ml', true], qty: [0.01, 5000, ''], kcalItem: [0, 10000, 'kcal'], macroItem: [0, 1000, 'g'],
  per100kcal: [0, 900, 'kcal'], per100macro: [0, 100, 'g'], unitG: [0.1, 5000, 'g'],
  sets: [1, 20, 'séries', true], reps: [0, 500, 'repetições', true], kg: [0, 1000, 'kg'], sleep: [0, 24, 'h'],
  goalKcal: [0, 20000, 'kcal'], goalMacro: [0, 2000, 'g'], goalWater: [0, 20000, 'ml'], rest: [15, 600, 's', true]
};
// Valida um campo. Nunca corrige o valor em silêncio: devolve erro com mensagem.
C.check = (kind, raw, opts) => {
  opts = opts || {};
  const r = C.parseNumber(raw);
  if (r.empty) return opts.required ? { ok: false, value: null, msg: 'Campo obrigatório' } : { ok: true, value: null };
  if (!r.valid) return { ok: false, value: null, msg: 'Use apenas números, por exemplo 114,5' };
  const [min, max, unit, integer] = C.RANGES[kind] || [-Infinity, Infinity, ''];
  if ((integer || opts.integer) && !Number.isInteger(r.value)) return { ok: false, value: null, msg: 'Use um número inteiro' };
  if (r.value < min || r.value > max) return { ok: false, value: null, msg: 'Valor deve ficar entre ' + String(min).replace('.', ',') + ' e ' + String(max).replace('.', ',') + (unit ? ' ' + unit : '') };
  return { ok: true, value: r.value };
};

// ------------------------------------------------------------------ nutrição
const NUTR = ['kcal', 'p', 'c', 'f'];
C.itemCalc = (food, grams) => {
  if (!food || grams == null || !Number.isFinite(grams) || grams < 0) return { kcal: null, p: null, c: null, f: null };
  const k = grams / 100;
  const out = {};
  NUTR.forEach(n => { out[n] = Number.isFinite(food[n]) ? food[n] * k : null; });
  return out;
};
// Item livre: valores não informados ficam null (desconhecidos), nunca zero.
C.manualItem = v => {
  const item = { foodId: null, name: v.name, amountLabel: v.amountLabel || '', estimated: !!v.estimated, kcal: v.kcal, p: v.p, c: v.c, f: v.f, kcalSource: null };
  ['kcal', 'p', 'c', 'f'].forEach(k => { if (item[k] === undefined) item[k] = null; });
  if (item.kcal != null) item.kcalSource = 'informado';
  else if (item.p != null && item.c != null && item.f != null) { item.kcal = item.p * 4 + item.c * 4 + item.f * 9; item.kcalSource = 'calculado'; }
  return item;
};
C.totals = items => {
  const t = { kcal: 0, p: 0, c: 0, f: 0, missing: { kcal: 0, p: 0, c: 0, f: 0 }, nItems: items.length, estimated: false, noValues: 0 };
  for (const i of items) {
    let known = 0;
    for (const n of NUTR) {
      if (i[n] != null && Number.isFinite(i[n])) { t[n] += i[n]; known++; } else t.missing[n]++;
    }
    if (!known) t.noValues++;
    if (i.estimated && known) t.estimated = true;
  }
  t.partial = NUTR.some(n => t.missing[n] > 0);
  return t;
};
C.dayTotals = (db, date) => {
  const meals = db.meals.filter(m => m.date === date);
  const t = C.totals(meals.flatMap(m => m.items));
  const waters = db.water.filter(w => w.date === date);
  t.water = waters.reduce((a, w) => a + (Number.isFinite(w.ml) ? w.ml : 0), 0);
  t.nWater = waters.length;
  t.nMeals = meals.length;
  return t;
};

// ------------------------------------------------------------------ dias de treino e frequência
// O histórico de dias de treino permite mudar os dias sem reescrever o passado.
C.scheduleFor = (db, date) => {
  const h = (db.scheduleHistory || []).filter(x => x.from <= date).sort((a, b) => a.from.localeCompare(b.from));
  return h.length ? h[h.length - 1].schedule : (db.schedule || {});
};
C.plannedFor = (db, date) => {
  if (date < db.profile.startDate) return null;
  return C.scheduleFor(db, date)[C.wd(date)] || null;
};
C.isAttended = s => C.ATTENDED.includes(s.status);

/* Regra de frequência (documentada também no relatório):
 * - Conta DIAS, não sessões: dois treinos no mesmo dia = um dia.
 * - Dia planejado cumprido = há sessão concluída OU parcial nesse dia (parcial conta, e é mostrada à parte).
 * - Remarcação: treino feito em dia não planejado cobre um dia planejado perdido DA MESMA SEMANA (seg–dom),
 *   primeiro o indicado em "makeupFor", depois o mais antigo. Treino que não cobre nenhum dia vira "extra".
 * - O dia de hoje só entra na conta se já foi cumprido (senão aparece como pendente).
 * - O percentual nunca passa de 100%.
 */
C.adherence = (db, from, to, todayStr) => {
  todayStr = todayStr || C.today();
  const end = to < todayStr ? to : todayStr;
  const res = { from, to, planned: 0, fulfilled: 0, hits: [], makeups: [], partialDays: [], extras: [], postponed: [], notDone: [], unregistered: [], pendingToday: null, futurePlanned: 0, rate: null };
  if (end < from) { res.futurePlanned = C.datesBetween(from, to).filter(d => C.plannedFor(db, d)).length; return res; }
  const sessions = db.sessions.filter(s => s.date >= from && s.date <= end);
  const byDate = {};
  sessions.forEach(s => { (byDate[s.date] = byDate[s.date] || []).push(s); });
  const attendedDates = new Set(sessions.filter(C.isAttended).map(s => s.date));
  const plannedAll = C.datesBetween(from, end).filter(d => C.plannedFor(db, d));
  const plannedSet = new Set(plannedAll);
  const missed = [];
  for (const d of plannedAll) {
    if (attendedDates.has(d)) {
      res.hits.push(d);
      const att = byDate[d].filter(C.isAttended);
      if (att.every(s => s.status === 'parcial')) res.partialDays.push(d);
    } else missed.push(d);
  }
  const free = [...attendedDates].filter(d => !plannedSet.has(d)).sort();
  const used = new Set(), coveredMissed = new Set();
  // 1) remarcação explícita
  for (const f of free) {
    const s = byDate[f].find(x => C.isAttended(x) && x.makeupFor && missed.includes(x.makeupFor) && !coveredMissed.has(x.makeupFor) && C.weekStart(x.makeupFor) === C.weekStart(f));
    if (s) { used.add(f); coveredMissed.add(s.makeupFor); res.makeups.push({ planned: s.makeupFor, done: f }); }
  }
  // 2) remarcação automática na mesma semana
  for (const m of missed) {
    if (coveredMissed.has(m)) continue;
    const f = free.find(x => !used.has(x) && C.weekStart(x) === C.weekStart(m));
    if (f) { used.add(f); coveredMissed.add(m); res.makeups.push({ planned: m, done: f }); }
  }
  res.extras = free.filter(f => !used.has(f));
  for (const m of missed) {
    if (coveredMissed.has(m)) continue;
    if (m === todayStr) { res.pendingToday = m; continue; }
    const st = (byDate[m] || []).map(s => s.status);
    if (st.includes('adiada')) res.postponed.push(m);
    else if (st.includes('nao_realizada')) res.notDone.push(m);
    else res.unregistered.push(m);
  }
  res.planned = plannedAll.length - (res.pendingToday ? 1 : 0);
  res.fulfilled = res.hits.length + res.makeups.length;
  res.rate = res.planned ? Math.min(1, res.fulfilled / res.planned) : null;
  res.futurePlanned = to > end ? C.datesBetween(C.addDays(end, 1), to).filter(d => C.plannedFor(db, d)).length : 0;
  return res;
};

// ------------------------------------------------------------------ força
// Indicadores separados (carga, repetições, séries, volume, esforço). Sessões "leves" não entram na comparação.
C.exerciseEntries = (db, name, from, to) => {
  const key = String(name).toLowerCase();
  return db.sessions
    .filter(s => C.isAttended(s) && !s.light && (!from || s.date >= from) && (!to || s.date <= to))
    .sort((a, b) => (a.date + (a.startedAt || '')).localeCompare(b.date + (b.startedAt || '')))
    .map(s => {
      const e = (s.exercises || []).find(x => String(x.name).toLowerCase() === key);
      if (!e) return null;
      const sets = e.sets.filter(x => x.done).map(x => ({ kg: C.num(x.kg), reps: C.num(x.reps) }));
      if (!sets.length) return null;
      const kgs = sets.map(x => x.kg).filter(v => v != null);
      const topKg = kgs.length ? Math.max(...kgs) : null;
      const atTop = topKg == null ? sets : sets.filter(x => x.kg === topKg);
      const repsArr = atTop.map(x => x.reps).filter(v => v != null);
      return {
        date: s.date, sessionId: s.id, sets, nSets: sets.length, topKg,
        repsAtTop: repsArr.length ? Math.max(...repsArr) : null,
        totalReps: sets.reduce((a, x) => a + (x.reps || 0), 0),
        volume: sets.reduce((a, x) => a + (x.kg || 0) * (x.reps || 0), 0),
        rpe: Number.isFinite(e.rpe) ? e.rpe : null, discomfort: !!e.discomfort
      };
    }).filter(Boolean);
};
// Compara duas sessões do mesmo exercício: 'melhor' | 'igual' | 'pior' | 'inconclusivo'
C.compareEntries = (a, b) => {
  if ((a.topKg == null) !== (b.topKg == null)) return 'inconclusivo';
  if (a.repsAtTop == null || b.repsAtTop == null) return 'inconclusivo';
  if (a.topKg != null && b.topKg !== a.topKg) {
    if (b.topKg > a.topKg) return b.repsAtTop >= a.repsAtTop ? 'melhor' : 'inconclusivo';
    return b.repsAtTop <= a.repsAtTop ? 'pior' : 'inconclusivo';
  }
  if (b.repsAtTop !== a.repsAtTop) return b.repsAtTop > a.repsAtTop ? 'melhor' : 'pior';
  if (b.nSets !== a.nSets) return b.nSets > a.nSets ? 'melhor' : 'pior';
  return 'igual';
};
C.strengthTrend = entries => {
  if (entries.length < 2) return { status: 'insuficiente', n: entries.length };
  const first = entries[0], last = entries[entries.length - 1];
  const cmp = C.compareEntries(first, last);
  let persistent = false;
  if (entries.length >= 3) {
    const l3 = entries.slice(-3);
    persistent = C.compareEntries(l3[0], l3[1]) === 'pior' && C.compareEntries(l3[1], l3[2]) === 'pior';
  }
  const status = persistent ? 'queda_persistente' : { melhor: 'evoluindo', igual: 'estavel', pior: 'queda', inconclusivo: 'inconclusivo' }[cmp];
  return { status, n: entries.length, first, last };
};
C.TREND_LABEL = { evoluindo: 'evoluindo', estavel: 'estável', queda: 'queda pontual', queda_persistente: 'queda persistente', inconclusivo: 'inconclusivo', insuficiente: 'dados insuficientes' };

// ------------------------------------------------------------------ validação da base
function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
C.validateDb = d => {
  const errors = [], warnings = [];
  const err = m => { if (errors.length < 30) errors.push(m); };
  if (!isObj(d)) return { errors: ['Conteúdo não é um objeto de dados'], warnings };
  if (!isObj(d.profile)) err('Perfil ausente ou inválido');
  else {
    const p = d.profile;
    if (!C.isDate(p.startDate)) err('Perfil: data de início inválida');
    ['startWeight', 'targetWeight'].forEach(k => { if (!(Number.isFinite(p[k]) && p[k] >= 30 && p[k] <= 400)) err('Perfil: ' + k + ' inválido'); });
    if (p.heightCm != null && !(Number.isFinite(p.heightCm) && p.heightCm >= 100 && p.heightCm <= 250)) err('Perfil: altura inválida');
  }
  if (d.version != null && !(Number.isInteger(d.version) && d.version >= 1)) err('Versão dos dados inválida');
  const ARR = ['nutritionGoals', 'foods', 'meals', 'water', 'plans', 'sessions', 'weights', 'measurements', 'medLogs', 'symptomLogs', 'energyLogs', 'reviews', 'scheduleHistory'];
  ARR.forEach(k => { if (d[k] != null && !Array.isArray(d[k])) err(k + ' deveria ser uma lista'); });
  if (errors.length) return { errors, warnings };

  // strings muito longas (proteção contra arquivos adulterados)
  let longStr = false;
  (function walk(x, depth) {
    if (depth > 12) { longStr = true; return; }
    if (typeof x === 'string') { if (x.length > C.MAX_STRING) longStr = true; return; }
    if (Array.isArray(x)) x.forEach(y => walk(y, depth + 1));
    else if (isObj(x)) Object.keys(x).forEach(k => walk(x[k], depth + 1));
  })(d, 0);
  if (longStr) err('Há textos longos demais ou estrutura profunda demais');

  const fin = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
  const nullFin = (v, min, max) => v == null || fin(v, min, max);
  const uniq = (list, name) => {
    const seen = new Set();
    list.forEach((r, i) => {
      if (!isObj(r)) return err(name + ' #' + (i + 1) + ': registro inválido');
      if (typeof r.id !== 'string' || !C.SAFE_ID.test(r.id)) return err(name + ' #' + (i + 1) + ': identificador inválido');
      if (seen.has(r.id)) err(name + ': identificador repetido (' + r.id + ')');
      seen.add(r.id);
    });
  };
  const dated = (list, name) => list.forEach((r, i) => { if (isObj(r) && !C.isDate(r.date)) err(name + ' #' + (i + 1) + ': data inválida'); });

  const meals = d.meals || [], foods = d.foods || [], plans = d.plans || [], sessions = d.sessions || [];
  uniq(meals, 'Refeições'); dated(meals, 'Refeições');
  meals.forEach((m, i) => {
    if (!isObj(m)) return;
    if (m.time != null && m.time !== '' && !C.isTime(m.time)) err('Refeições #' + (i + 1) + ': horário inválido');
    if (!Array.isArray(m.items)) return err('Refeições #' + (i + 1) + ': itens inválidos');
    m.items.forEach((it, j) => {
      if (!isObj(it) || typeof it.name !== 'string') return err('Refeições #' + (i + 1) + ' item ' + (j + 1) + ': inválido');
      ['kcal', 'p', 'c', 'f'].forEach(k => { if (!nullFin(it[k], 0, 100000)) err('Refeições #' + (i + 1) + ' item ' + (j + 1) + ': valor de ' + k + ' inválido'); });
      if (!nullFin(it.grams, 0, 100000)) err('Refeições #' + (i + 1) + ' item ' + (j + 1) + ': quantidade inválida');
    });
    if (m.photoIds != null && (!Array.isArray(m.photoIds) || m.photoIds.some(p => typeof p !== 'string' || !C.SAFE_ID.test(p)))) err('Refeições #' + (i + 1) + ': referência de foto inválida');
  });
  uniq(d.water || [], 'Água'); dated(d.water || [], 'Água');
  (d.water || []).forEach((w, i) => { if (isObj(w) && !fin(w.ml, 1, 20000)) err('Água #' + (i + 1) + ': quantidade inválida'); });
  uniq(d.weights || [], 'Pesos'); dated(d.weights || [], 'Pesos');
  (d.weights || []).forEach((w, i) => { if (isObj(w) && !fin(w.kg, 30, 400)) err('Pesos #' + (i + 1) + ': peso inválido'); });
  uniq(d.measurements || [], 'Medidas'); dated(d.measurements || [], 'Medidas');
  (d.measurements || []).forEach((m, i) => { if (isObj(m)) ['waist', 'abdomen', 'hip', 'chest', 'arm', 'thigh'].forEach(k => { if (!nullFin(m[k], 10, 300)) err('Medidas #' + (i + 1) + ': ' + k + ' inválido'); }); });
  uniq(foods, 'Alimentos');
  foods.forEach((f, i) => {
    if (!isObj(f)) return;
    if (typeof f.name !== 'string' || !f.name) err('Alimentos #' + (i + 1) + ': nome inválido');
    if (f.base !== 'g' && f.base !== 'ml') err('Alimentos #' + (i + 1) + ': base inválida');
    if (!fin(f.kcal, 0, 900)) err('Alimentos #' + (i + 1) + ': calorias inválidas');
    ['p', 'c', 'f'].forEach(k => { if (!fin(f[k], 0, 100)) err('Alimentos #' + (i + 1) + ': ' + k + ' inválido'); });
    if (f.units != null && (!Array.isArray(f.units) || f.units.some(u => !isObj(u) || typeof u.name !== 'string' || !fin(u.g, 0.1, 5000)))) err('Alimentos #' + (i + 1) + ': medidas caseiras inválidas');
  });
  uniq(plans, 'Planos');
  const planIds = new Set(plans.map(p => p && p.id));
  plans.forEach((p, i) => {
    if (!isObj(p)) return;
    if (typeof p.name !== 'string') err('Planos #' + (i + 1) + ': nome inválido');
    if (!Array.isArray(p.exercises) || p.exercises.some(e => !isObj(e) || typeof e.name !== 'string' || !(Number.isInteger(e.sets) && e.sets >= 1 && e.sets <= 20))) err('Planos #' + (i + 1) + ': exercícios inválidos');
  });
  const checkSchedule = (s, where) => {
    if (!isObj(s)) return err(where + ': dias de treino inválidos');
    Object.keys(s).forEach(k => {
      if (!/^[1-7]$/.test(k)) err(where + ': dia da semana inválido');
      else if (s[k] != null && (typeof s[k] !== 'string' || !C.SAFE_ID.test(s[k]))) err(where + ': plano inválido');
      else if (s[k] && !planIds.has(s[k])) warnings.push(where + ': dia ' + k + ' aponta para plano inexistente');
    });
  };
  if (d.schedule != null) checkSchedule(d.schedule, 'Dias de treino');
  (d.scheduleHistory || []).forEach((h, i) => { if (!isObj(h) || !C.isDate(h.from)) err('Histórico de dias #' + (i + 1) + ': inválido'); else checkSchedule(h.schedule, 'Histórico de dias #' + (i + 1)); });
  uniq(sessions, 'Sessões'); dated(sessions, 'Sessões');
  sessions.forEach((s, i) => {
    if (!isObj(s)) return;
    if (!C.STATUSES.includes(s.status)) err('Sessões #' + (i + 1) + ': status inválido');
    if (typeof s.planId !== 'string' || !C.SAFE_ID.test(s.planId)) err('Sessões #' + (i + 1) + ': plano inválido');
    if (s.makeupFor != null && !C.isDate(s.makeupFor)) err('Sessões #' + (i + 1) + ': remarcação inválida');
    if (!Array.isArray(s.exercises)) return err('Sessões #' + (i + 1) + ': exercícios inválidos');
    s.exercises.forEach((e, j) => {
      if (!isObj(e) || typeof e.name !== 'string' || !Array.isArray(e.sets)) return err('Sessões #' + (i + 1) + ' exercício ' + (j + 1) + ': inválido');
      if (e.rpe != null && !(Number.isInteger(e.rpe) && e.rpe >= 1 && e.rpe <= 10)) err('Sessões #' + (i + 1) + ' exercício ' + (j + 1) + ': esforço inválido');
      e.sets.forEach(st => {
        if (!isObj(st)) return err('Sessões #' + (i + 1) + ': série inválida');
        ['kg', 'reps'].forEach(k => { if (st[k] != null && typeof st[k] !== 'string' && typeof st[k] !== 'number') err('Sessões #' + (i + 1) + ': série inválida'); });
        if (st.kg !== '' && st.kg != null && C.num(st.kg) == null) warnings.push('Sessão de ' + s.date + ': carga "' + String(st.kg).slice(0, 20) + '" não é número e será ignorada nos cálculos');
      });
    });
  });
  if (sessions.filter(s => isObj(s) && s.status === 'em_andamento').length > 1) warnings.push('Mais de uma sessão em andamento');
  uniq(d.medLogs || [], 'Aplicações'); dated(d.medLogs || [], 'Aplicações');
  uniq(d.symptomLogs || [], 'Sintomas'); dated(d.symptomLogs || [], 'Sintomas');
  (d.symptomLogs || []).forEach((s, i) => { if (isObj(s) && s.symptoms != null && (!isObj(s.symptoms) || Object.values(s.symptoms).some(v => !(Number.isInteger(v) && v >= 0 && v <= 3)))) err('Sintomas #' + (i + 1) + ': intensidade inválida'); });
  uniq(d.energyLogs || [], 'Energia'); dated(d.energyLogs || [], 'Energia');
  (d.energyLogs || []).forEach((e, i) => {
    if (!isObj(e)) return;
    if (!(Number.isInteger(e.energy) && e.energy >= 1 && e.energy <= 5)) err('Energia #' + (i + 1) + ': nível inválido');
    if (!nullFin(e.sleepHours, 0, 24)) err('Energia #' + (i + 1) + ': horas de sono inválidas');
    ['sleepQuality', 'soreness'].forEach(k => { if (e[k] != null && !(Number.isInteger(e[k]) && e[k] >= 1 && e[k] <= 5)) err('Energia #' + (i + 1) + ': ' + k + ' inválido'); });
  });
  (d.nutritionGoals || []).forEach((g, i) => {
    if (!isObj(g) || !C.isDate(g.from)) return err('Metas #' + (i + 1) + ': inválida');
    ['kcal', 'protein', 'carbs', 'fat', 'water'].forEach(k => { if (!nullFin(g[k], 0, 20000)) err('Metas #' + (i + 1) + ': ' + k + ' inválido'); });
  });
  if (d.medication != null && !isObj(d.medication)) err('Dados do tratamento inválidos');
  if (d.settings != null) {
    if (!isObj(d.settings)) err('Configurações inválidas');
    else if (d.settings.reminders != null) {
      if (!Array.isArray(d.settings.reminders)) err('Lembretes inválidos');
      else d.settings.reminders.forEach((r, i) => {
        if (!isObj(r) || !(Number.isInteger(r.hour) && r.hour >= 0 && r.hour <= 23) || !(Number.isInteger(r.minute) && r.minute >= 0 && r.minute <= 59) || !Array.isArray(r.days) || r.days.some(x => !(Number.isInteger(x) && x >= 1 && x <= 7))) err('Lembrete #' + (i + 1) + ': inválido');
      });
    }
  }
  const foodIds = new Set(foods.map(f => f && f.id));
  const orphanFood = meals.reduce((a, m) => a + ((m && Array.isArray(m.items)) ? m.items.filter(it => it && it.foodId && !foodIds.has(it.foodId)).length : 0), 0);
  if (orphanFood) warnings.push(orphanFood + ' item(ns) de refeição apontam para alimento que não está mais na lista (os valores registrados são mantidos)');
  return { errors, warnings };
};

// Migração NÃO destrutiva: só acrescenta campos; nunca remove nem altera registros existentes.
C.migrate = src => {
  const d = JSON.parse(JSON.stringify(src));
  if (!Array.isArray(d.scheduleHistory) || !d.scheduleHistory.length) {
    d.scheduleHistory = [{ from: (d.profile && d.profile.startDate) || C.today(), schedule: JSON.parse(JSON.stringify(d.schedule || {})) }];
  }
  if (!isObj(d.settings)) d.settings = {};
  if (!d.settings.theme) d.settings.theme = 'auto';
  if (!(d.version >= C.DB_VERSION)) d.version = C.DB_VERSION;
  return d;
};

C.summarize = d => {
  const count = k => Array.isArray(d[k]) ? d[k].length : 0;
  const dates = [];
  ['meals', 'water', 'weights', 'measurements', 'sessions', 'medLogs', 'symptomLogs', 'energyLogs'].forEach(k => (d[k] || []).forEach(r => { if (r && C.isDate(r.date)) dates.push(r.date); }));
  dates.sort();
  return {
    meals: count('meals'), water: count('water'), weights: count('weights'), measurements: count('measurements'),
    sessions: count('sessions'), medLogs: count('medLogs'), symptomLogs: count('symptomLogs'), energyLogs: count('energyLogs'),
    foods: count('foods'), plans: count('plans'), reviews: count('reviews'),
    photoRefs: (d.meals || []).reduce((a, m) => a + ((m && m.photoIds) || []).length, 0),
    firstDate: dates[0] || null, lastDate: dates[dates.length - 1] || null
  };
};

// Valida um arquivo de backup inteiro ANTES de qualquer alteração nos dados ativos.
C.validateBackup = (text, opts) => {
  opts = opts || {};
  const fail = (msg, extra) => Object.assign({ ok: false, errors: [msg], warnings: [] }, extra || {});
  if (typeof text !== 'string' || !text.length) return fail('Arquivo vazio.');
  if (text.length > (opts.maxBytes || C.MAX_BACKUP_BYTES)) return fail('Arquivo grande demais para ser um backup deste app.');
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return fail('O arquivo está incompleto ou não é um JSON válido (pode ter sido cortado durante a cópia).'); }
  if (!isObj(obj) || obj.app !== 'TreinoSaude') return fail('Este arquivo não é um backup do Cyl Gymly (antes Healthym / Treino & Saúde).');
  const format = obj.format == null ? 1 : obj.format;
  if (!Number.isInteger(format) || format < 1) return fail('Formato de backup desconhecido.');
  if (format > C.FORMAT_VERSION) return fail('Este backup foi criado por uma versão mais nova do app (formato ' + format + '). Atualize o app para restaurá-lo.', { incompatible: true });
  const data = isObj(obj.data) ? obj.data : (isObj(obj.profile) ? obj : null);
  if (!data) return fail('O backup não contém dados.');
  if (Number.isInteger(data.version) && data.version > C.DB_VERSION) return fail('Os dados vêm de uma versão mais nova do app (estrutura ' + data.version + '). Atualize o app para restaurá-los.', { incompatible: true });
  const v = C.validateDb(data);
  if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings };
  const warnings = v.warnings.slice();
  const photos = {};
  let badPhotos = 0;
  if (obj.photos != null) {
    if (!isObj(obj.photos)) return fail('Fotos do backup em formato inválido.');
    Object.keys(obj.photos).forEach(id => {
      const val = obj.photos[id];
      if (C.SAFE_ID.test(id) && typeof val === 'string' && val.length <= C.MAX_PHOTO_CHARS && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(val)) photos[id] = val;
      else badPhotos++;
    });
  }
  if (badPhotos) warnings.push(badPhotos + ' foto(s) inválida(s) ou grande(s) demais serão ignoradas.');
  const summary = C.summarize(data);
  const refs = (data.meals || []).flatMap(m => m.photoIds || []);
  summary.photosInFile = Object.keys(photos).length;
  summary.photoRefsMissingInFile = refs.filter(id => !photos[id]);
  return { ok: true, errors: [], warnings, data: C.migrate(data), photos, summary, exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : null, format };
};

if (typeof module !== 'undefined' && module.exports) module.exports = C;
else root.HCore = C;
})(typeof window !== 'undefined' ? window : this);
