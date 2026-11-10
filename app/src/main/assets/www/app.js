/* Treino & Saúde — app pessoal offline.
 * Todos os dados ficam no celular (arquivo interno do app). Nada é enviado para a internet.
 * O app não sugere metas numéricas de nutrição e nunca recomenda doses de medicamento.
 */
(function () {
'use strict';

const B = window.AndroidBridge || null;
const STORE_KEY = 'treinosaude-data';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

// ---------------------------------------------------------------- utilidades (regras em core.js)
const H = window.HCore;
const pad = H.pad, isoDate = H.isoDate, today = H.today, nowTime = H.nowTime, parseD = H.parseD, addDays = H.addDays,
  diffDays = H.diffDays, wd = H.wd, weekStart = H.weekStart, esc = H.esc, num = H.num;
const WD_SHORT = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WD_LONG = ['', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const fmtD = s => H.isDate(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—';
const fmtDs = s => H.isDate(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';
const fmtLong = s => { const d = parseD(s); return WD_LONG[wd(s)] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()]; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const r0 = n => n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('pt-BR');
const r1 = n => n == null || !Number.isFinite(n) ? '—' : (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const sign = n => (n > 0 ? '+' : '') + r1(n);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const byDate = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));
const fmtNum = n => n == null ? '' : String(n).replace('.', ',');

// ---------------------------------------------------------------- dados
const MEAL_TYPES = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Pré-treino', 'Pós-treino', 'Outro'];
const SYMPTOMS = [
  ['nausea', 'Náusea / enjoo'], ['saciedade', 'Saciedade precoce'], ['apetite_baixo', 'Apetite muito reduzido'],
  ['constipacao', 'Constipação (intestino preso)'], ['diarreia', 'Diarreia'], ['refluxo', 'Refluxo / azia'],
  ['fraqueza', 'Fraqueza'], ['energia_baixa', 'Queda de energia'], ['dif_proteina', 'Dificuldade de comer proteína'],
  ['dif_agua', 'Dificuldade de beber água'], ['tontura', 'Tontura']
];
const INTENS = ['Não', 'Leve', 'Moderado', 'Forte'];
const RED_FLAGS = [
  ['dor_abdominal', 'Dor abdominal forte e persistente'], ['vomitos', 'Vômitos repetidos'],
  ['sem_liquidos', 'Não consigo ingerir líquidos'], ['tontura_intensa', 'Tontura intensa'],
  ['dor_peito', 'Dor no peito'], ['amarelado', 'Olhos ou pele amarelados']
];
const STATUS = { concluida: 'Concluído', parcial: 'Parcial', adiada: 'Adiado', nao_realizada: 'Não realizado', em_andamento: 'Em andamento' };
const STATUS_ICON = { concluida: '✓', parcial: '½', adiada: '↷', nao_realizada: '–', em_andamento: '▶' };

function freshDb() {
  const foods = window.SEED_FOODS.map((f, i) => ({
    id: 'f' + i, name: f[0], base: f[1], kcal: f[2], p: f[3], c: f[4], f: f[5],
    units: f[6].map(u => ({ name: u[0], g: u[1] })), source: 'TACO (aprox.)'
  }));
  const plans = window.SEED_PLANS.map(p => ({
    id: p.id, name: p.name, warmup: p.warmup, notes: p.notes,
    exercises: p.exercises.map(e => ({ id: uid(), name: e[0], sets: e[1], reps: e[2] }))
  }));
  const schedule = { 1: 'A', 3: 'B', 5: 'C' };
  return {
    app: 'TreinoSaude', version: H.DB_VERSION, createdAt: new Date().toISOString(),
    profile: { name: '', age: 22, sex: 'Masculino', heightCm: 173, startWeight: 115, targetWeight: 90, startDate: '2026-11-09', firstReview: '2026-12-07' },
    nutritionGoals: [], // histórico: {from, kcal, protein, carbs, fat, water}
    foods, meals: [], water: [], plans,
    schedule, scheduleHistory: [{ from: '2026-11-09', schedule: Object.assign({}, schedule) }],
    sessions: [], weights: [], measurements: [],
    medication: { startDate: '', weekday: '', doseText: '', notes: '' },
    medLogs: [], symptomLogs: [], energyLogs: [], reviews: [],
    settings: { restEnabled: true, restSeconds: 90, reminders: defaultReminders(), onboarded: false, theme: 'auto' }
  };
}

function defaultReminders() {
  return [
    { id: 'treino', enabled: false, title: 'Dia de treino', text: 'Hoje tem treino planejado. Faça no horário que for melhor para você.', hour: 17, minute: 0, days: [1, 3, 5] },
    { id: 'refeicoes', enabled: false, title: 'Registrar refeições', text: 'Que tal anotar o que comeu hoje?', hour: 20, minute: 30, days: [] },
    { id: 'agua', enabled: false, title: 'Água', text: 'Lembrete para beber água.', hour: 15, minute: 0, days: [] },
    { id: 'aplicacao', enabled: false, title: 'Aplicação (conforme prescrição)', text: 'Hoje é o dia de aplicação definido com seu médico.', hour: 9, minute: 0, days: [] }
  ];
}

// Completa campos ausentes (nunca remove nem altera registros existentes).
function ensureShape(d) {
  d = H.migrate(d);
  const base = freshDb();
  for (const k of Object.keys(base)) if (d[k] === undefined) d[k] = base[k];
  for (const k of Object.keys(base.profile)) if (d.profile[k] === undefined) d.profile[k] = base.profile[k];
  for (const k of Object.keys(base.settings)) if (d.settings[k] === undefined) d.settings[k] = base.settings[k];
  if (!d.medication || typeof d.medication !== 'object') d.medication = base.medication;
  return d;
}

// ---------------------------------------------------------------- persistência
/* Estados possíveis ao abrir:
 *  - primeiro uso: nada salvo → base nova;
 *  - base válida → carrega;
 *  - base ilegível/inválida → MODO DE RECUPERAÇÃO: nada é gravado por cima até o usuário escolher
 *    restaurar uma cópia, importar um backup ou (com confirmação) começar do zero. O conteúdo
 *    ilegível é guardado à parte antes de qualquer gravação.
 */
let db;
const store = { recovery: null, saveError: false, dirty: false };
function readStorage() {
  try {
    if (B) {
      if (B.loadState) { const st = JSON.parse(B.loadState()); return st; }
      const raw = B.loadData();
      return raw ? { status: 'ok', data: raw } : { status: 'missing' };
    }
    const raw = localStorage.getItem(STORE_KEY);
    return raw == null || raw === '' ? { status: 'missing' } : { status: 'ok', data: raw };
  } catch (e) { return { status: 'error', error: String(e && e.message || e) }; }
}
function loadDb() {
  const st = readStorage();
  if (st.status === 'missing') {
    db = freshDb();
    if (st.hasBackups) store.recovery = { reason: 'O arquivo principal de dados não foi encontrado, mas existem cópias automáticas.', raw: null, missingWithBackups: true };
    return;
  }
  if (st.status !== 'ok') { db = freshDb(); store.recovery = { reason: 'Não foi possível ler os dados salvos (' + (st.error || 'erro de leitura') + ').', raw: null }; return; }
  let parsed;
  try { parsed = JSON.parse(st.data); } catch (e) { db = freshDb(); store.recovery = { reason: 'Os dados salvos estão corrompidos ou incompletos.', raw: st.data }; return; }
  const v = H.validateDb(parsed);
  if (v.errors.length) { db = freshDb(); store.recovery = { reason: 'Os dados salvos têm problemas de estrutura: ' + v.errors.slice(0, 3).join('; '), raw: st.data }; return; }
  db = ensureShape(parsed);
}
// Grava e confere o resultado. Em caso de falha, mostra aviso fixo e tenta de novo na próxima alteração.
function persist() {
  clearTimeout(persistTimer); persistTimer = null;
  if (store.recovery) { showSaveError('Modo de recuperação: nada é salvo até você escolher uma opção.'); return false; }
  db.updatedAt = new Date().toISOString();
  let ok = false;
  try {
    const s = JSON.stringify(db);
    if (B) ok = B.saveData(s) === true;
    else { webDailyBackup(); localStorage.setItem(STORE_KEY, s); ok = localStorage.getItem(STORE_KEY) === s; }
  } catch (e) { ok = false; }
  store.dirty = !ok;
  if (ok) hideSaveError(); else showSaveError('Falha ao salvar! Seus últimos registros ainda não foram gravados. Não feche o app; tente de novo ou exporte um backup.');
  return ok;
}
function webDailyBackup() {
  try {
    const key = 'ts-backup-backup-' + today() + '.json';
    if (localStorage.getItem(key) != null) return;
    const prev = localStorage.getItem(STORE_KEY);
    if (!prev) return;
    try { JSON.parse(prev); } catch (e) { return; }
    localStorage.setItem(key, prev);
    webBackups().filter(n => n.startsWith('backup-')).slice(3).forEach(n => localStorage.removeItem('ts-backup-' + n));
  } catch (e) { /* sem espaço: segue sem a cópia */ }
}
let persistTimer = null;
function persistSoon() { store.dirty = true; clearTimeout(persistTimer); persistTimer = setTimeout(persist, 400); }
function flushPending() { if (persistTimer || store.dirty) persist(); }
window.flushPending = flushPending;
document.addEventListener('visibilitychange', () => { if (document.hidden) flushPending(); });
window.addEventListener('pagehide', flushPending);
window.addEventListener('beforeunload', flushPending);
function showSaveError(msg) {
  store.saveError = true;
  const el = $('#save-error'); if (!el) return;
  el.querySelector('span').textContent = msg; el.classList.remove('hidden');
}
function hideSaveError() { store.saveError = false; const el = $('#save-error'); if (el) el.classList.add('hidden'); }

// fotos
const PHOTO_ID = H.SAFE_ID;
function getPhoto(id) { if (!PHOTO_ID.test(id)) return ''; if (B) return B.getPhoto(id); try { return localStorage.getItem('ts-photo-' + id) || ''; } catch (e) { return ''; } }
function putPhoto(id, data) { if (!PHOTO_ID.test(id)) return false; if (B) return B.putPhoto(id, data) === true; try { localStorage.setItem('ts-photo-' + id, data); return true; } catch (e) { return false; } }
function delPhoto(id) { if (!PHOTO_ID.test(id)) return; if (B) B.deletePhoto(id); else try { localStorage.removeItem('ts-photo-' + id); } catch (e) { } }
function hasPhoto(id) { return !!getPhoto(id); }
function listStoredPhotos() {
  if (B) { try { return B.listPhotos ? JSON.parse(B.listPhotos()) : []; } catch (e) { return []; } }
  const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('ts-photo-')) out.push(k.slice(9)); } } catch (e) { }
  return out;
}

// ---------------------------------------------------------------- regras de dados
function goalFor(date) {
  const g = db.nutritionGoals.filter(x => x.from <= date).sort((a, b) => a.from.localeCompare(b.from));
  return g.length ? g[g.length - 1] : { kcal: null, protein: null, carbs: null, fat: null, water: null };
}
function hasGoals(g) { return ['kcal', 'protein', 'carbs', 'fat', 'water'].some(k => g[k] != null); }
const dayTotals = date => H.dayTotals(db, date);
const itemCalc = H.itemCalc;
const planById = id => db.plans.find(p => p.id === id);
const planName = id => (planById(id) || {}).name || ('Treino ' + id);
const plannedFor = date => H.plannedFor(db, date);
const sessionsOn = date => db.sessions.filter(s => s.date === date);
const attended = H.isAttended;
function currentWeight() {
  const w = db.weights.slice().sort(byDate);
  return w.length ? w[w.length - 1].kg : db.profile.startWeight;
}
function lastExercise(name, excludeId) {
  const ss = db.sessions.filter(s => s.id !== excludeId && attended(s)).sort(byDate);
  for (let i = ss.length - 1; i >= 0; i--) {
    const e = ss[i].exercises.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (e && e.sets.some(st => st.done)) return { date: ss[i].date, ex: e, light: !!ss[i].light };
  }
  return null;
}
function bestSet(ex) {
  const done = ex.sets.filter(s => s.done && (num(s.kg) != null || num(s.reps) != null));
  if (!done.length) return null;
  return done.reduce((a, b) => ((num(b.kg) || 0) > (num(a.kg) || 0) || ((num(b.kg) || 0) === (num(a.kg) || 0) && (num(b.reps) || 0) > (num(a.reps) || 0))) ? b : a);
}
function plannedDates(from, to) { return H.datesBetween(from, to).filter(d => plannedFor(d)); }
// Semana: dias planejados cumpridos (nunca passa do total planejado) + extras à parte.
function weekStats(ws) {
  const we = addDays(ws, 6);
  const a = H.adherence(db, ws, we, today());
  const plannedWeek = plannedDates(ws, we).length;
  return { planned: plannedWeek, done: Math.min(a.fulfilled, plannedWeek), extras: a.extras.length, adh: a };
}
function nextPlanned(fromDate) {
  for (let i = 0; i < 14; i++) { const d = addDays(fromDate, i); const p = plannedFor(d); if (p && !sessionsOn(d).length) return { date: d, plan: p }; }
  return null;
}
// Aplica uma alteração e grava; se a gravação falhar, desfaz na memória para tela e disco continuarem iguais.
function commit(mutator) {
  const snapshot = JSON.stringify(db);
  mutator();
  if (!persist()) { db = JSON.parse(snapshot); return false; }
  return true;
}

// ---------------------------------------------------------------- UI base
const ui = { tab: 'home', foodDate: today(), weekOf: weekStart(today()), prog: 'peso', strengthEx: '', sessionId: null };
let sheet = null; // {render, onClose}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}
let lastFocus = null;
// Abrir uma folha nova encerra a anterior (chamando o onClose dela), para não deixar rascunhos/fotos pendentes.
function openSheet(s) {
  if (sheet && sheet.onClose) { const prev = sheet; sheet = null; prev.onClose('replaced'); }
  if (!$('#sheet-wrap').classList.contains('hidden')) { /* já aberta */ } else lastFocus = document.activeElement;
  sheet = s; $('#sheet-wrap').classList.remove('hidden'); refreshSheet(true);
  const f = $('#sheet [autofocus], #sheet input, #sheet button'); if (f && !s.mounted) try { f.focus({ preventScroll: true }); } catch (e) { }
}
function refreshSheet(top) {
  if (!sheet) return;
  const el = $('#sheet'); const st = el.scrollTop;
  el.innerHTML = '<div class="sheet-head"><h2 id="sheet-title">' + esc(sheet.title) + '</h2><button class="icon-btn" data-act="closeSheet" aria-label="Fechar">✕</button></div>' + sheet.render();
  enhanceA11y(el);
  el.scrollTop = top ? 0 : st;
  if (sheet.mounted) sheet.mounted(el);
}
function closeSheet() {
  const s = sheet; sheet = null; $('#sheet-wrap').classList.add('hidden'); $('#sheet').innerHTML = '';
  if (s && s.onClose) s.onClose('closed');
  if (lastFocus && document.contains(lastFocus)) try { lastFocus.focus({ preventScroll: true }); } catch (e) { }
}
// msg é TEXTO (escapado aqui). Para conteúdo formatado, passe opts.html já montado com esc().
function confirmBox(msg, okLabel, onOk, danger, opts) {
  opts = opts || {};
  openSheet({ title: opts.title || 'Confirmar', render: () => (opts.html || '<p>' + esc(msg) + '</p>') + '<div class="btns"><button class="btn ghost" data-act="closeSheet">Cancelar</button><button class="btn ' + (danger ? 'danger' : '') + '" data-act="confirmOk">' + esc(okLabel) + '</button></div>', ok: onOk, onClose: opts.onCancel ? (why => { if (!confirmBox._ok) opts.onCancel(why); confirmBox._ok = false; }) : null });
}
function go(tab) {
  flushPending();
  if (tab === 'daily') { const r = db.sessions.find(s => s.status === 'em_andamento'); if (r) { tab = 'session'; ui.sessionId = r.id; } }
  ui.tab = tab; closeSheet(); render(); window.scrollTo(0, 0);
}

window.appBack = function () {
  if (sheet) { closeSheet(); return true; }
  if (ui.tab === 'session') { go('home'); return true; }
  if (ui.tab !== 'home') { go('home'); return true; }
  return false;
};

function bar(val, goal, color) {
  const pct = goal ? clamp(val / goal * 100, 0, 100) : 0;
  return '<div class="bar"><i style="width:' + pct + '%;background:' + (color || 'var(--pri)') + '"></i></div>';
}
// missing = itens sem esse valor → total parcial (marcado com *)
function macroLine(label, val, goal, unit, color, missing) {
  let right = r0(val) + (missing ? '*' : '') + (goal ? ' / ' + r0(goal) : '') + ' ' + unit;
  let diff = '';
  if (goal) { const d = goal - val; diff = d >= 0 ? 'faltam ' + r0(d) + ' ' + unit : r0(-d) + ' ' + unit + ' acima da meta'; }
  return '<div class="macro"><div class="row between"><span>' + label + '</span><span><b>' + right + '</b></span></div>' +
    (goal ? bar(val, goal, color) + '<div class="tiny muted">' + diff + (missing ? ' (parcial)' : '') + '</div>' : '') + '</div>';
}
function scaleHtml(name, val, max, labels) {
  let h = '<div class="scale" role="group" data-scale="' + esc(name) + '">';
  for (let i = 1; i <= max; i++) h += '<button type="button" data-act="scale" data-name="' + esc(name) + '" data-v="' + esc(i) + '" aria-pressed="' + (val === i) + '" class="' + (val === i ? 'on' : '') + '">' + i + '</button>';
  h += '</div>';
  if (labels) h += '<div class="row between tiny muted"><span>' + labels[0] + '</span><span>' + labels[1] + '</span></div>';
  return h;
}
function chipsHtml(name, options, val) {
  return '<div class="chips">' + options.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return '<button type="button" class="chip ' + (val === v ? 'on' : '') + '" aria-pressed="' + (val === v) + '" data-act="chip" data-name="' + esc(name) + '" data-v="' + esc(v) + '">' + esc(l) + '</button>';
  }).join('') + '</div>';
}
const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
const checked = id => { const el = document.getElementById(id); return !!(el && el.checked); };

// ---- validação de formulários: mensagem junto ao campo, foco no campo, nada é corrigido em silêncio
class FieldError extends Error { }
function fieldErr(id, msg) {
  const el = document.getElementById(id); if (!el) { toast(msg); return; }
  el.setAttribute('aria-invalid', 'true');
  let m = document.getElementById(id + '-err');
  if (!m) { m = document.createElement('div'); m.id = id + '-err'; m.className = 'field-err'; m.setAttribute('role', 'alert'); el.insertAdjacentElement('afterend', m); }
  m.textContent = msg; el.setAttribute('aria-describedby', m.id);
  try { el.focus(); } catch (e) { }
}
function clearErrs() { $$('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid')); $$('.field-err').forEach(e => e.parentNode.removeChild(e)); }
function field(id, kind, opts) { const r = H.check(kind, val(id), opts); if (!r.ok) { fieldErr(id, r.msg); throw new FieldError(r.msg); } return r.value; }
function dateField(id, opts) {
  opts = opts || {}; const v = val(id);
  if (!v && !opts.required) return null;
  if (!H.isDate(v)) { fieldErr(id, 'Data inválida'); throw new FieldError(); }
  if (opts.notFuture && v > addDays(today(), 1)) { fieldErr(id, 'A data não pode estar no futuro'); throw new FieldError(); }
  return v;
}
function form(fn) { clearErrs(); try { return fn(); } catch (e) { if (e instanceof FieldError) return null; throw e; } }

// ---- acessibilidade: liga rótulos aos campos e aos grupos de botões
let a11ySeq = 0;
function enhanceA11y(root) {
  $$('label:not(.check)', root).forEach(l => {
    if (l.htmlFor) return;
    const n = l.nextElementSibling;
    if (!n) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName)) { if (!n.id) n.id = 'f' + (++a11ySeq); l.htmlFor = n.id; }
    else if (n.matches('.chips,.scale')) { if (!l.id) l.id = 'l' + (++a11ySeq); n.setAttribute('aria-labelledby', l.id); n.setAttribute('role', 'group'); }
  });
  $$('input:not([aria-label]), textarea:not([aria-label])', root).forEach(i => { if (!$('label[for="' + i.id + '"]') && i.placeholder) i.setAttribute('aria-label', i.placeholder); });
}

// gráfico de linhas simples em SVG
function lineChart(series, opts) {
  opts = opts || {};
  const W = 340, H = opts.h || 180, L = 36, R = 8, T = 10, Bm = 22;
  const pts = series.flatMap(s => s.pts);
  if (pts.length < 1) return '<p class="muted small">Sem dados suficientes para o gráfico ainda.</p>';
  let xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  if (opts.goal != null) ys = ys.concat([opts.goal]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 1; x1 += 1; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const padY = (y1 - y0) * 0.1 || 1; y0 -= padY; y1 += padY;
  const X = x => L + (x - x0) / (x1 - x0) * (W - L - R);
  const Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - Bm);
  let g = '';
  for (let i = 0; i <= 3; i++) {
    const yv = y0 + (y1 - y0) * i / 3, yy = Y(yv);
    g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line)" stroke-width="1"/>';
    g += '<text x="' + (L - 4) + '" y="' + (yy + 4) + '" text-anchor="end">' + r1(yv) + '</text>';
  }
  if (opts.goal != null) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(opts.goal) + '" y2="' + Y(opts.goal) + '" stroke="var(--ok)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="' + (W - R) + '" y="' + (Y(opts.goal) - 4) + '" text-anchor="end">meta ' + r1(opts.goal) + '</text>';
  const fx = opts.fmtX || (x => fmtDs(isoDate(new Date(x))));
  g += '<text x="' + L + '" y="' + (H - 6) + '">' + fx(x0 + (Math.min(...xs) === Math.max(...xs) ? 1 : 0)) + '</text>';
  g += '<text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + fx(x1 - (Math.min(...xs) === Math.max(...xs) ? 1 : 0)) + '</text>';
  for (const s of series) {
    if (!s.pts.length) continue;
    const d = s.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    g += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.width || 2) + '" ' + (s.dash ? 'stroke-dasharray="4 3"' : '') + ' stroke-linejoin="round"/>';
    if (s.dots) g += s.pts.map(p => '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="3" fill="' + s.color + '"/>').join('');
  }
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' + g + '</svg>' +
    (series.length > 1 || opts.legend ? '<div class="row wrap tiny muted">' + series.filter(s => s.label).map(s => '<span><span style="display:inline-block;width:12px;height:3px;background:' + s.color + ';vertical-align:middle"></span> ' + s.label + '</span>').join(' &nbsp; ') + '</div>' : '');
}
const tOf = s => parseD(s).getTime();

// ---------------------------------------------------------------- render principal
const VIEWS = {};
const APP_NAME = 'Cyl Gymly';
function render() {
  flushPending();
  applyTheme();
  if (store.recovery) { renderRecovery(); return; }
  $('#tabbar').classList.remove('hidden');
  $$('#tabbar button').forEach(b => { const on = b.dataset.tab === ui.tab || (ui.tab === 'session' && b.dataset.tab === 'daily'); b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const titles = { home: APP_NAME, food: 'Alimentação', train: 'Treino', daily: 'Treino diário', session: 'Treino diário', progress: 'Evolução', health: 'Saúde', settings: 'Configurações' };
  $('#title').textContent = titles[ui.tab] || APP_NAME;
  $('#view').innerHTML = VIEWS[ui.tab]();
  enhanceA11y($('#view'));
  if (VIEWS[ui.tab + 'Mounted']) VIEWS[ui.tab + 'Mounted']();
  workoutSync();
}
function applyTheme() {
  const t = db && db.settings && db.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
}

// ---- tela de recuperação (dados ilegíveis): nada é gravado até o usuário decidir
function renderRecovery() {
  const r = store.recovery;
  $('#tabbar').classList.add('hidden');
  $('#title').textContent = APP_NAME + ' — recuperação';
  let backups = [];
  backups = restorableBackups();
  $('#view').innerHTML = '<div class="card bad" data-recovery><h3>Seus dados não foram carregados</h3><p>' + esc(r.reason) + '</p>' +
    '<p class="small">Para proteger suas informações, o app <b>não gravou nada por cima</b>. Escolha uma opção abaixo.</p></div>' +
    (backups.length ? '<h2>Restaurar uma cópia automática</h2><ul class="list card">' + backups.slice(0, 20).map(n => '<li class="row between"><span>' + esc(backupLabel(n)) + '</span><button class="btn sec sm" data-act="restoreLocal" data-n="' + esc(n) + '">Restaurar</button></li>').join('') + '</ul>' : '<p class="muted small">Nenhuma cópia automática encontrada.</p>') +
    '<div class="btns"><button class="btn" data-act="importBackup">Importar arquivo de backup</button></div>' +
    (r.raw ? '<div class="btns"><button class="btn ghost" data-act="exportRaw">Salvar o conteúdo ilegível (para análise)</button></div>' : '') +
    '<details class="card"><summary><b>Começar do zero</b></summary><p class="small">Cria uma base nova. ' + (r.raw ? 'O conteúdo ilegível é guardado à parte antes, sem ser apagado.' : '') + '</p><button class="btn danger block" data-act="recoveryFresh">Começar do zero</button></details>';
  enhanceA11y($('#view'));
}
// Cópias que podem ser restauradas, da mais útil para a menos: diárias (mais recente primeiro), depois as feitas
// antes de restaurações. Cópias de conteúdo ilegível (corrupt-*) ficam guardadas, mas não são oferecidas.
function restorableBackups() {
  let all = [];
  try { all = B ? JSON.parse(B.listBackups()) : webBackups(); } catch (e) { all = []; }
  const by = p => all.filter(n => n.startsWith(p)).sort().reverse();
  return by('backup-').concat(by('pre-restore-'));
}
function backupLabel(n) {
  const m = String(n).match(/(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2})(\d{2}))?/);
  const kind = /^pre-restore/.test(n) ? 'Antes de uma restauração · ' : /^corrupt/.test(n) ? 'Conteúdo ilegível · ' : 'Cópia do dia · ';
  return kind + (m ? m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] + ':' + m[5] : '') : n);
}
// No navegador as cópias de segurança ficam no próprio armazenamento do navegador
function webBackups() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('ts-backup-')) out.push(k.slice(10)); } } catch (e) { } return out.sort().reverse(); }
function readLocalBackup(n) { if (B) return B.readBackup(n); try { return localStorage.getItem('ts-backup-' + n) || ''; } catch (e) { return ''; } }
// Cópia de segurança antes de operações que substituem dados (restauração, começar do zero)
function writeSafetyBackup(kind, content) {
  if (content == null) return true;
  if (B) return B.saveSafetyBackup ? B.saveSafetyBackup(kind, content) === true : false;
  const st = new Date();
  const name = kind + '-' + isoDate(st) + '-' + pad(st.getHours()) + pad(st.getMinutes()) + pad(st.getSeconds()) + '.json';
  try { localStorage.setItem('ts-backup-' + name, content); return true; } catch (e) { return false; }
}

// ================================================================ INÍCIO
VIEWS.home = function () {
  const t = today(), p = db.profile;
  const cw = currentWeight(), lost = p.startWeight - cw, total = p.startWeight - p.targetWeight;
  const pct = total > 0 ? clamp(lost / total * 100, 0, 100) : 0;
  const g = goalFor(t), tot = dayTotals(t);
  const plan = plannedFor(t), sess = sessionsOn(t);
  const ws = weekStats(weekStart(t));
  let h = '<p class="muted" style="margin:4px 0 0">' + fmtLong(t) + (p.name ? ' · Olá, ' + esc(p.name) : '') + '</p>';

  if (!hasGoals(g)) h += '<div class="card warn small"><b>Metas nutricionais ainda não definidas.</b> Defina os valores (de preferência com seu nutricionista ou médico) em <a href="#" data-act="goSettings">Configurações</a>. Até lá, o app mostra só os totais.</div>';

  // treino
  h += '<div class="card"><div class="row between"><h3>Treino de hoje</h3><span class="badge">' + ws.done + ' de ' + ws.planned + ' na semana' + (ws.extras ? ' · +' + ws.extras + ' extra' : '') + '</span></div>';
  const running = db.sessions.find(s => s.status === 'em_andamento');
  if (running) h += '<p>Sessão em andamento: <b>' + esc(running.planName) + '</b></p><button class="btn block" data-act="openSession" data-id="' + esc(running.id) + '">Continuar treino</button>';
  else if (sess.length) h += sess.map(s => '<p class="st-' + esc(s.status) + '"><b>' + STATUS_ICON[s.status] + ' ' + esc(s.planName) + '</b> — ' + STATUS[s.status] + '</p>').join('') + '<button class="btn sec block" data-act="pickPlan" data-date="' + esc(t) + '">Fazer outro treino</button>';
  else if (plan) h += '<p><b>' + esc(planName(plan)) + '</b> · horário livre</p><button class="btn block" data-act="startCheckin" data-plan="' + esc(plan) + '" data-date="' + esc(t) + '">Iniciar treino</button>';
  else {
    const np = nextPlanned(addDays(t, 1));
    h += '<p class="muted">Hoje não há treino planejado. Descanso também faz parte.' + (np ? '<br>Próximo: <b>' + WD_LONG[wd(np.date)] + ' (' + fmtDs(np.date) + ') — ' + esc(planName(np.plan)) + '</b>' : '') + '</p>' +
      '<button class="btn ghost block" data-act="pickPlan" data-date="' + esc(t) + '">Treinar hoje mesmo assim</button>';
  }
  h += '<div style="margin-top:10px">' + bar(ws.done, ws.planned || 1) + '</div></div>';

  // alimentação
  h += '<div class="card"><div class="row between"><h3>Alimentação hoje</h3><a href="#" data-act="tab" data-tab="food" class="small">ver tudo</a></div>';
  h += macroLine('<b style="color:var(--p)">Proteína</b>', tot.p, g.protein, 'g', 'var(--p)', tot.missing.p);
  h += macroLine('Calorias', tot.kcal, g.kcal, 'kcal', null, tot.missing.kcal);
  h += '<div class="grid2 small"><div>Carboidratos: <b>' + r0(tot.c) + (tot.missing.c ? '*' : '') + (g.carbs ? '/' + r0(g.carbs) : '') + ' g</b></div><div>Gorduras: <b>' + r0(tot.f) + (tot.missing.f ? '*' : '') + (g.fat ? '/' + r0(g.fat) : '') + ' g</b></div></div>';
  h += totalsNote(tot);
  h += '</div>';

  // água
  h += '<div class="card"><div class="row between"><h3>Água</h3><b>' + r0(tot.water) + (g.water ? ' / ' + r0(g.water) : '') + ' ml</b></div>' + (g.water ? bar(tot.water, g.water, 'var(--w)') : '') +
    '<div class="water-btns" style="margin-top:10px">' + [200, 300, 500].map(ml => '<button class="btn sec sm" data-act="addWater" data-ml="' + esc(ml) + '">+' + ml + '</button>').join('') + '<button class="btn sec sm" data-act="waterCustom">outro</button></div></div>';

  // peso
  h += '<div class="card"><div class="row between"><h3>Peso</h3><a href="#" data-act="tab" data-tab="progress" class="small">evolução</a></div>' +
    '<div class="row between"><div><div class="big">' + r1(cw) + ' kg</div><div class="small muted">meta ' + r1(p.targetWeight) + ' kg · ' + (lost >= 0 ? r1(lost) + ' kg a menos desde o início' : r1(-lost) + ' kg acima do inicial') + '</div></div>' +
    '<button class="btn sec sm" data-act="addWeight">Registrar</button></div><div style="margin-top:8px">' + bar(pct, 100, 'var(--ok)') + '</div><div class="tiny muted">' + r0(pct) + '% do caminho até a meta</div></div>';

  // saúde / medicação
  const med = db.medication;
  if (med.weekday && Number(med.weekday) === wd(t) && !db.medLogs.some(m => m.date === t)) {
    h += '<div class="card soft"><b>Hoje é o dia de aplicação definido com seu médico.</b><div class="btns"><button class="btn sm" data-act="addMedLog">Registrar aplicação</button></div></div>';
  }
  const rv = reviewDue();
  if (rv) h += '<div class="card soft"><b>Avaliação de 4 semanas disponível</b> (' + fmtDs(rv.start) + ' a ' + fmtDs(rv.end) + ').<div class="btns"><button class="btn sm" data-act="openReview" data-start="' + esc(rv.start) + '">Ver avaliação</button></div></div>';

  h += '<div class="fab-row"><button class="btn" data-act="newMeal">+ Refeição</button><button class="btn sec" data-act="addEnergy">Como estou hoje</button></div>';
  return h;
};

// ================================================================ ALIMENTAÇÃO
// Aviso de totais parciais/estimados: ausência de registro nunca vira "zero".
function totalsNote(tot) {
  const parts = [];
  if (tot.noValues) parts.push(tot.noValues + ' item(ns) sem quantidade/valores não entram na soma');
  const miss = [['kcal', 'calorias'], ['p', 'proteína'], ['c', 'carboidratos'], ['f', 'gorduras']].filter(([k]) => tot.missing[k] > tot.noValues).map(([k, l]) => l);
  if (miss.length) parts.push('* total parcial de ' + miss.join(', ') + ' (há itens sem esse valor)');
  if (tot.estimated) parts.push('inclui quantidades estimadas');
  return parts.length ? '<p class="tiny muted">' + esc(parts.join(' · ')) + '.</p>' : '';
}
VIEWS.food = function () {
  const d = ui.foodDate, g = goalFor(d), tot = dayTotals(d);
  let h = '<div class="row between"><button class="btn ghost sm" data-act="foodDate" data-n="-1">‹</button><div style="text-align:center"><b>' + (d === today() ? 'Hoje' : fmtLong(d)) + '</b><div class="tiny muted">' + fmtD(d) + '</div></div><button class="btn ghost sm" data-act="foodDate" data-n="1">›</button></div>';
  h += '<div class="card">' + macroLine('<b style="color:var(--p)">Proteína</b>', tot.p, g.protein, 'g', 'var(--p)', tot.missing.p) + macroLine('Calorias', tot.kcal, g.kcal, 'kcal', null, tot.missing.kcal) +
    macroLine('Carboidratos', tot.c, g.carbs, 'g', 'var(--c)', tot.missing.c) + macroLine('Gorduras', tot.f, g.fat, 'g', 'var(--f)', tot.missing.f) +
    totalsNote(tot) +
    (!hasGoals(g) ? '<p class="tiny muted">Sem metas definidas para esta data. <a href="#" data-act="goSettings">Definir metas</a></p>' : '') + '</div>';

  const waters = db.water.filter(w => w.date === d).sort(byDate);
  h += '<div class="card"><div class="row between"><h3>Água</h3><b>' + r0(tot.water) + (g.water ? ' / ' + r0(g.water) : '') + ' ml</b></div>' + (g.water ? bar(tot.water, g.water, 'var(--w)') : '') +
    '<div class="water-btns" style="margin-top:10px">' + [200, 300, 500].map(ml => '<button class="btn sec sm" data-act="addWater" data-ml="' + esc(ml) + '">+' + ml + '</button>').join('') + '<button class="btn sec sm" data-act="waterCustom">outro</button></div>' +
    (waters.length ? '<div class="tiny muted" style="margin-top:8px">' + waters.map(w => esc(w.time || '') + ' · ' + r0(w.ml) + ' ml <a href="#" data-act="delWater" data-id="' + esc(w.id) + '" aria-label="Remover ' + r0(w.ml) + ' ml">remover</a>').join(' &nbsp;|&nbsp; ') + '</div>' : '') +
    (tot.nWater ? '' : '<div class="tiny muted" style="margin-top:6px">Sem registro de água neste dia (o que não quer dizer que você não bebeu).</div>') + '</div>';

  const meals = db.meals.filter(m => m.date === d).sort(byDate);
  h += '<div class="fab-row"><button class="btn" data-act="newMeal">+ Adicionar refeição</button><button class="btn sec" data-act="copyMeal">Repetir refeição</button></div>';
  if (!meals.length) h += '<p class="muted">Nenhuma refeição registrada neste dia.</p>';
  for (const m of meals) {
    const mt = H.totals(m.items);
    h += '<div class="card tap" role="button" tabindex="0" data-act="editMeal" data-id="' + esc(m.id) + '"><div class="row between"><h3>' + (m.favorite ? '★ ' : '') + esc(m.time) + ' · ' + esc(m.type) + '</h3><span class="small"><b>' + r0(mt.kcal) + (mt.missing.kcal ? '*' : '') + ' kcal</b> · <span style="color:var(--p)">' + r0(mt.p) + (mt.missing.p ? '*' : '') + ' g prot.</span></span></div>' +
      '<div class="small muted">' + m.items.map(i => esc(i.name) + (i.amountLabel ? ' (' + (i.estimated ? '~' : '') + esc(i.amountLabel) + ')' : ' (qtd. ?)')).join(', ') + '</div>' +
      (mt.partial ? '<div class="tiny muted">* valores parciais: há itens sem informação</div>' : '') +
      (m.photoIds && m.photoIds.length ? '<div class="row" style="margin-top:6px">' + m.photoIds.map(pid => '<img class="photo-thumb" data-photo="' + esc(pid) + '" alt="foto">').join('') + '</div>' : '') +
      (m.notes ? '<div class="tiny muted" style="margin-top:4px">' + esc(m.notes) + '</div>' : '') + '</div>';
  }
  h += '<details class="card"><summary><b>Ideias práticas e acessíveis</b></summary><ul class="small">' +
    '<li>Fontes de proteína que costumam caber no bolso: ovos, frango, sardinha em lata, carne moída, fígado, leite e iogurte natural, feijão com arroz.</li>' +
    '<li>Treino sem garantia de comprar comida depois? Leve de casa algo simples: ovo cozido, sanduíche de pão com ovo ou frango desfiado, banana, leite.</li>' +
    '<li>Cozinhar de uma vez (ex.: frango desfiado, ovos cozidos, feijão) facilita os dias corridos.</li>' +
    '<li>Com pouco apetite, refeições menores e mais frequentes podem ajudar a manter a proteína e a água. Converse com seu médico ou nutricionista sobre isso.</li>' +
    '<li>Não é preciso suplemento para começar. Comida de verdade resolve.</li></ul></details>';
  return h;
};
VIEWS.foodMounted = function () {
  $$('img[data-photo]').forEach(img => { const s = getPhoto(img.dataset.photo); if (s) img.src = s; else { const t = document.createElement('span'); t.className = 'tiny muted'; t.textContent = '(foto indisponível)'; img.replaceWith(t); } });
};

// ---- editor de refeição
let draft = null;
function guessMealType() {
  const h = new Date().getHours();
  return h < 10 ? 'Café da manhã' : h < 12 ? 'Lanche da manhã' : h < 15 ? 'Almoço' : h < 18 ? 'Lanche da tarde' : h < 22 ? 'Jantar' : 'Ceia';
}
/* Ciclo de vida das fotos na edição:
 *  - fotos novas ficam "temporárias" (_newPhotos) até salvar; ao cancelar, são apagadas;
 *  - fotos originais removidas só são apagadas DEPOIS que a refeição foi gravada com sucesso;
 *  - se a gravação falhar, nada é apagado.
 */
function mealEditor(meal) {
  draft = meal ? JSON.parse(JSON.stringify(meal)) : { id: null, date: ui.foodDate, time: ui.foodDate === today() ? nowTime() : '12:00', type: guessMealType(), items: [], notes: '', photoIds: [] };
  if (!Array.isArray(draft.photoIds)) draft.photoIds = [];
  draft._mode = 'main'; draft._q = ''; draft._food = null; draft._editIdx = null; draft._newPhotos = []; draft._removedPhotos = []; draft._saved = false;
  const myDraft = draft;
  openSheet({ title: meal ? 'Editar refeição' : 'Nova refeição', render: renderMealSheet, mounted: mountMealSheet, isMeal: true,
    onClose: () => { if (!myDraft._saved) myDraft._newPhotos.forEach(delPhoto); if (draft === myDraft) draft = null; } });
}
function renderMealSheet() {
  const d = draft;
  if (d._mode === 'pick') return renderFoodPicker();
  if (d._mode === 'qty') return renderQty();
  if (d._mode === 'manual') return renderManual();
  if (d._mode === 'newfood') return foodForm(null, 'mealNewFoodSave');
  let h = '<label>Tipo de refeição</label>' + chipsHtml('mealType', MEAL_TYPES, d.type) +
    '<div class="grid2"><div><label>Data</label><input type="date" id="m-date" value="' + esc(d.date) + '"></div><div><label>Horário</label><input type="time" id="m-time" value="' + esc(d.time) + '"></div></div>';
  h += '<h2>Alimentos</h2>';
  if (!d.items.length) h += '<p class="muted small">Nenhum alimento ainda.</p>';
  const nv = (v, u) => v == null ? '?' : r1(v) + (u || '');
  h += '<ul class="list">' + d.items.map((i, idx) => '<li class="row between"><div class="grow tap" role="button" tabindex="0" aria-label="Editar quantidade de ' + esc(i.name) + '" data-act="editItem" data-i="' + esc(idx) + '"><b>' + esc(i.name) + '</b><div class="small muted">' + (i.amountLabel ? (i.estimated ? '~' : '') + esc(i.amountLabel) : 'quantidade não informada') + ' · ' +
    ([i.kcal, i.p, i.c, i.f].some(v => v != null) ? (i.kcal != null ? r0(i.kcal) + ' kcal' + (i.kcalSource === 'calculado' ? ' (calc.)' : '') : '? kcal') + ' · P ' + nv(i.p) + ' · C ' + nv(i.c) + ' · G ' + nv(i.f) : 'sem valores') + (i.estimated ? ' · estimativa' : '') + '</div></div><button class="icon-btn" data-act="rmItem" data-i="' + esc(idx) + '" aria-label="Remover ' + esc(i.name) + '">✕</button></li>').join('') + '</ul>';
  if (d.items.length) { const t = H.totals(d.items); h += '<div class="card soft small"><b>Total:</b> ' + r0(t.kcal) + (t.missing.kcal ? '*' : '') + ' kcal · <b>Proteína ' + r1(t.p) + (t.missing.p ? '*' : '') + ' g</b> · Carb. ' + r1(t.c) + (t.missing.c ? '*' : '') + ' g · Gord. ' + r1(t.f) + (t.missing.f ? '*' : '') + ' g' + (t.partial ? '<div class="tiny">* parcial: há itens sem esse valor</div>' : '') + '</div>'; }
  h += '<div class="btns"><button class="btn sec" data-act="mealPick">+ Alimento</button><button class="btn ghost" data-act="mealManual">+ Item livre</button></div>';
  h += '<h2>Foto (referência)</h2><p class="tiny muted">A foto fica guardada só no celular, para ajudar você a lembrar e preencher. O app não reconhece alimentos automaticamente nesta versão.</p>';
  h += '<div class="row wrap">' + d.photoIds.map((pid, i) => '<div style="position:relative"><img class="photo-thumb" alt="Foto ' + (i + 1) + ' da refeição" data-photo="' + esc(pid) + '"><button class="icon-btn" style="position:absolute;top:-6px;right:-6px;background:var(--card);border:1px solid var(--line)" data-act="rmPhoto" data-id="' + esc(pid) + '" aria-label="Remover foto ' + (i + 1) + '">✕</button></div>').join('') + '</div>';
  h += '<div class="btns"><button class="btn ghost" data-act="photo" data-src="camera">Câmera</button><button class="btn ghost" data-act="photo" data-src="gallery">Galeria</button></div>';
  h += '<label>Observações</label><textarea id="m-notes" placeholder="Ex.: comi metade, estava sem fome...">' + esc(d.notes) + '</textarea>';
  h += '<label class="check"><input type="checkbox" id="m-fav" ' + (d.favorite ? 'checked' : '') + '> ★ Refeição favorita (aparece primeiro em “Repetir refeição”)</label>';
  h += '<div class="btns">' + (d.id ? '<button class="btn danger" data-act="delMeal">Excluir</button>' : '') + '<button class="btn ghost" data-act="closeSheet">Cancelar</button><button class="btn" data-act="saveMeal">Salvar refeição</button></div>';
  return h;
}
function mountMealSheet(el) {
  $$('img[data-photo]', el).forEach(img => { const s = getPhoto(img.dataset.photo); if (s) img.src = s; });
  const q = $('#f-q', el);
  if (q) { q.focus(); q.addEventListener('input', () => { draft._q = q.value; $('#f-res').innerHTML = foodResults(q.value); }); }
  const qa = $('#q-amt', el);
  if (qa) { const up = () => { $('#q-prev').innerHTML = qtyPreview(); }; qa.addEventListener('input', up); $('#q-unit').addEventListener('change', up); qa.focus(); }
}
function syncMainFields() {
  if (draft._mode !== 'main') return;
  if ($('#m-date')) { draft.date = val('m-date'); draft.time = val('m-time'); draft.notes = val('m-notes'); draft.favorite = checked('m-fav'); }
}
function recentFoodIds() {
  const ids = [];
  db.meals.slice().sort(byDate).reverse().forEach(m => m.items.forEach(i => { if (i.foodId && !ids.includes(i.foodId)) ids.push(i.foodId); }));
  return ids;
}
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function foodResults(q) {
  let list;
  if (!q) { const rec = recentFoodIds(); list = rec.map(id => db.foods.find(f => f.id === id)).filter(Boolean).concat(db.foods.filter(f => !rec.includes(f.id))); }
  else { const n = norm(q); list = db.foods.filter(f => norm(f.name).includes(n)); }
  if (!list.length) return '<p class="muted small">Nada encontrado. Cadastre o alimento ou use “item livre”.</p>';
  return list.slice(0, 60).map(f => '<div class="food-res tap" data-act="pickFood" data-id="' + esc(f.id) + '"><b>' + esc(f.name) + '</b><div class="tiny muted">100 ' + f.base + ': ' + r0(f.kcal) + ' kcal · P ' + r1(f.p) + ' · C ' + r1(f.c) + ' · G ' + r1(f.f) + '</div></div>').join('');
}
function renderFoodPicker() {
  return '<button class="btn ghost sm" data-act="mealBack">‹ Voltar</button><label>Buscar alimento</label><input id="f-q" placeholder="Ex.: arroz, ovo, frango" value="' + esc(draft._q) + '">' +
    '<div class="btns"><button class="btn ghost sm" data-act="mealNewFood">+ Cadastrar novo alimento</button></div><div id="f-res">' + foodResults(draft._q) + '</div>';
}
function renderQty() {
  const f = draft._food, it = draft._editIdx != null ? draft.items[draft._editIdx] : null;
  const units = [{ name: f.base, g: 1 }].concat(f.units || []);
  const selU = it ? it.unitName : (f.units && f.units[0] ? f.units[0].name : f.base);
  const amt = it ? (it.amount == null ? '' : it.amount) : (f.units && f.units[0] ? 1 : 100);
  return '<button class="btn ghost sm" data-act="mealBack">‹ Voltar</button><h3 style="margin-top:12px">' + esc(f.name) + '</h3><p class="tiny muted">Valores por 100 ' + f.base + ': ' + r0(f.kcal) + ' kcal · P ' + r1(f.p) + ' g · C ' + r1(f.c) + ' g · G ' + r1(f.f) + ' g' + (f.source ? ' · fonte: ' + esc(f.source) : '') + '</p>' +
    '<div class="grid2"><div><label>Quantidade</label><input id="q-amt" inputmode="decimal" value="' + esc(amt) + '" placeholder="em branco = não sei"></div><div><label>Medida</label><select id="q-unit">' +
    units.map(u => '<option value="' + esc(u.name) + '" ' + (u.name === selU ? 'selected' : '') + '>' + esc(u.name === f.base ? f.base + ' (gramas/ml)' : u.name) + '</option>').join('') + '</select></div></div>' +
    '<label class="check"><input type="checkbox" id="q-est" ' + (it && it.estimated ? 'checked' : '') + '> Quantidade estimada (aproximada)</label>' +
    '<div id="q-prev" class="card soft small">' + qtyPreview(amt, selU) + '</div><button class="btn block" data-act="qtySave">' + (it ? 'Atualizar item' : 'Adicionar') + '</button>';
}
// Quantidade: vazio = "não sei" (fica sem valores); valor inválido = erro (nunca vira outro número).
function qtyCompute(amtRaw, unitName) {
  const f = draft._food;
  const raw = amtRaw != null ? amtRaw : val('q-amt');
  const chk = H.check('qty', raw);
  const un = unitName || val('q-unit');
  if (!chk.ok) return { invalid: true, msg: chk.msg, grams: null, label: '', amount: null, unitName: un };
  const amt = chk.value;
  if (amt == null) return { grams: null, label: '', amount: null, unitName: un };
  const u = un === f.base ? { name: f.base, g: 1 } : (f.units || []).find(x => x.name === un);
  if (!u) return { invalid: true, msg: 'Medida desconhecida', grams: null, label: '', amount: null, unitName: un };
  const grams = amt * u.g;
  if (grams > 5000) return { invalid: true, msg: 'Quantidade grande demais (mais de 5 kg ou 5 litros)', grams: null, label: '', amount: null, unitName: un };
  const label = u.name === f.base ? r1(amt) + ' ' + f.base : r1(amt) + ' × ' + u.name.replace(/\s*\(.*\)/, '') + ' (~' + r0(grams) + ' ' + f.base + ')';
  return { grams, label, amount: amt, unitName: un };
}
function qtyPreview(a, u) {
  const q = qtyCompute(a, u);
  if (q.invalid) return esc(q.msg);
  if (q.grams == null) return 'Sem quantidade: o item fica registrado, mas não entra na soma.';
  const c = itemCalc(draft._food, q.grams);
  return '<b>' + r0(c.kcal) + ' kcal</b> · <b>Proteína ' + r1(c.p) + ' g</b> · Carb. ' + r1(c.c) + ' g · Gord. ' + r1(c.f) + ' g';
}
function renderManual() {
  const it = draft._editIdx != null ? draft.items[draft._editIdx] : {};
  const v = k => it[k] == null || (k === 'kcal' && it.kcalSource === 'calculado') ? '' : fmtNum(Math.round(it[k] * 10) / 10);
  return '<button class="btn ghost sm" data-act="mealBack">‹ Voltar</button><p class="small muted">Use para algo que não está na lista. Preencha só o que souber; campos em branco ficam como “sem valor”.</p>' +
    '<label>Nome</label><input id="mi-name" value="' + esc(it.name || '') + '" placeholder="Ex.: marmita do restaurante">' +
    '<label>Quantidade (texto livre)</label><input id="mi-amt" value="' + esc(it.amountLabel || '') + '" placeholder="Ex.: 1 prato médio">' +
    '<div class="grid2"><div><label>Calorias (kcal)</label><input id="mi-k" inputmode="decimal" value="' + esc(v('kcal')) + '"></div><div><label>Proteína (g)</label><input id="mi-p" inputmode="decimal" value="' + esc(v('p')) + '"></div>' +
    '<div><label>Carboidratos (g)</label><input id="mi-c" inputmode="decimal" value="' + esc(v('c')) + '"></div><div><label>Gorduras (g)</label><input id="mi-f" inputmode="decimal" value="' + esc(v('f')) + '"></div></div>' +
    '<label class="check"><input type="checkbox" id="mi-est" ' + (it.estimated ? 'checked' : '') + '> Valores estimados</label><button class="btn block" data-act="manualSave">' + (draft._editIdx != null ? 'Atualizar item' : 'Adicionar') + '</button>';
}

// ---- formulário de alimento (cadastro)
function foodForm(f, saveAct) {
  f = f || { name: '', base: 'g', kcal: '', p: '', c: '', f: '', units: [] };
  const n = x => x === '' || x == null ? '' : String(x);
  return (saveAct === 'mealNewFoodSave' ? '<button class="btn ghost sm" data-act="mealBack">‹ Voltar</button>' : '') +
    '<p class="small muted">Informe os valores por 100 g (ou 100 ml). Você encontra na tabela nutricional da embalagem ou em tabelas como a TACO.</p>' +
    '<label>Nome</label><input id="fd-name" value="' + esc(f.name) + '">' +
    '<label>Base</label><select id="fd-base"><option value="g" ' + (f.base === 'g' ? 'selected' : '') + '>por 100 g</option><option value="ml" ' + (f.base === 'ml' ? 'selected' : '') + '>por 100 ml</option></select>' +
    '<div class="grid2"><div><label>Calorias (kcal)</label><input id="fd-k" inputmode="decimal" value="' + esc(n(f.kcal)) + '"></div><div><label>Proteína (g)</label><input id="fd-p" inputmode="decimal" value="' + esc(n(f.p)) + '"></div>' +
    '<div><label>Carboidratos (g)</label><input id="fd-c" inputmode="decimal" value="' + esc(n(f.c)) + '"></div><div><label>Gorduras (g)</label><input id="fd-f" inputmode="decimal" value="' + esc(n(f.f)) + '"></div></div>' +
    '<label>Medidas caseiras (uma por linha: nome = gramas)</label><textarea id="fd-units" placeholder="unidade = 50&#10;colher de sopa = 15">' + esc((f.units || []).map(u => u.name + ' = ' + u.g).join('\n')) + '</textarea>' +
    '<div class="btns">' + (f.id && saveAct !== 'mealNewFoodSave' ? '<button class="btn danger" data-act="delFood" data-id="' + esc(f.id) + '">Excluir</button>' : '') + '<button class="btn" data-act="' + esc(saveAct) + '" data-id="' + esc(f.id || '') + '">Salvar alimento</button></div>';
}
// Valida o cadastro de alimento. Editar um alimento NÃO altera refeições já registradas (elas guardam os próprios valores).
function readFoodForm(existing) {
  const r = form(() => {
    const name = val('fd-name'); if (!name) { fieldErr('fd-name', 'Informe o nome'); throw new FieldError(); }
    const req = { required: true };
    const k = field('fd-k', 'per100kcal', req), p = field('fd-p', 'per100macro', req), c = field('fd-c', 'per100macro', req), g = field('fd-f', 'per100macro', req);
    if (p + c + g > 101) { fieldErr('fd-p', 'Proteína + carboidratos + gorduras passam de 100 g em 100 g'); throw new FieldError(); }
    const units = [];
    const lines = val('fd-units').split('\n').map(l => l.trim()).filter(Boolean);
    for (const l of lines) {
      const a = l.split('=');
      const chk = a.length === 2 ? H.check('unitG', a[1]) : { ok: false };
      if (!a[0] || !a[0].trim() || !chk.ok || chk.value == null) { fieldErr('fd-units', 'Linha inválida: "' + l.slice(0, 40) + '". Use: nome = gramas'); throw new FieldError(); }
      units.push({ name: a[0].trim(), g: chk.value });
    }
    return { name, base: val('fd-base') === 'ml' ? 'ml' : 'g', kcal: k, p, c, f: g, units };
  });
  if (!r) return null;
  const f = existing || { id: 'u' + uid(), source: 'cadastrado por você' };
  Object.assign(f, r);
  if (!existing) db.foods.push(f);
  return f;
}

// ================================================================ TREINO
VIEWS.train = function () {
  const t = today(), ws = ui.weekOf;
  let h = '<div class="row between"><button class="btn ghost sm" data-act="week" data-n="-7">‹</button><b>Semana de ' + fmtDs(ws) + ' a ' + fmtDs(addDays(ws, 6)) + '</b><button class="btn ghost sm" data-act="week" data-n="7">›</button></div>';
  h += '<div class="week" style="margin-top:8px">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i), pl = plannedFor(d), ss = sessionsOn(d);
    const st = ss.length ? ss.map(s => '<span class="st-' + esc(s.status) + '">' + STATUS_ICON[s.status] + '</span>').join('') : (pl && d < t ? '<span class="muted">·</span>' : '');
    const dm = dayMinutes(d);
    h += '<div class="day tap ' + (d === t ? 'today' : '') + '" data-act="dayInfo" data-date="' + esc(d) + '">' + WD_SHORT[i + 1] + '<b>' + d.slice(8) + '</b>' + (pl ? '<span class="badge">' + esc(pl) + '</span>' : '<span class="tiny muted">livre</span>') + '<div>' + st + '</div>' + (dm ? '<div class="tiny muted">' + fmtMin(dm) + '</div>' : '') + '</div>';
  }
  h += '</div><p class="tiny muted">✓ concluído · ½ parcial · ↷ adiado · – não realizado. Toque em um dia para ver ou registrar.</p>';

  const running = db.sessions.find(s => s.status === 'em_andamento');
  if (running) h += '<div class="card soft"><b>Sessão em andamento:</b> ' + esc(running.planName) + '<div class="btns"><button class="btn" data-act="openSession" data-id="' + esc(running.id) + '">Continuar</button></div></div>';

  // pendências da semana (sem cobrança)
  const pend = [];
  for (let d = weekStart(t); d < t; d = addDays(d, 1)) if (plannedFor(d) && !sessionsOn(d).length) pend.push(d);
  if (pend.length && !running) {
    h += '<div class="card"><h3>Sem registro nesta semana</h3><p class="small muted">Tudo bem acontecer. Você pode fazer hoje, registrar como adiado ou como não realizado — sem problema.</p>' +
      pend.map(d => '<div class="row between" style="margin:6px 0"><span>' + WD_SHORT[wd(d)] + ' ' + fmtDs(d) + ' · ' + esc(planName(plannedFor(d))) + '</span><span class="row"><button class="btn sec sm" data-act="startCheckin" data-plan="' + esc(plannedFor(d)) + '" data-date="' + esc(t) + '" data-makeup="' + esc(d) + '">Fazer hoje</button><button class="btn ghost sm" data-act="markDay" data-date="' + esc(d) + '" data-st="adiada">Adiado</button><button class="btn ghost sm" data-act="markDay" data-date="' + esc(d) + '" data-st="nao_realizada">Não fiz</button></span></div>').join('') + '</div>';
  }

  h += '<h2>Iniciar um treino</h2><div class="grid3">' + db.plans.map(p => '<button class="btn ' + (plannedFor(t) === p.id ? '' : 'sec') + '" data-act="startCheckin" data-plan="' + esc(p.id) + '" data-date="' + esc(t) + '">' + esc(p.name) + '</button>').join('') + '</div>';
  h += '<p class="tiny muted">Horário livre. Você pode fazer qualquer treino em qualquer dia.</p>';

  h += '<h2>Planos atuais</h2>';
  for (const p of db.plans) {
    const days = Object.keys(db.schedule).filter(k => db.schedule[k] === p.id).map(k => WD_SHORT[k]).join(', ');
    h += '<details class="card"><summary><b>' + esc(p.name) + '</b> <span class="muted small">' + (days || 'sem dia fixo') + '</span></summary>' +
      '<p class="small muted">Aquecimento: ' + esc(p.warmup || '—') + '</p><table><tr><th>Exercício</th><th>Séries</th><th>Reps</th></tr>' +
      p.exercises.map(e => '<tr><td>' + esc(e.name) + '</td><td>' + e.sets + '</td><td>' + esc(e.reps) + '</td></tr>').join('') + '</table>' +
      (p.notes ? '<p class="small muted">' + esc(p.notes) + '</p>' : '') + '</details>';
  }
  h += '<p class="small"><a href="#" data-act="goSettings">Editar planos e dias em Configurações</a></p>';

  h += trainTimeCard();
  const hist = db.sessions.filter(s => s.status !== 'em_andamento').sort(byDate).reverse().slice(0, 15);
  h += '<h2>Histórico</h2>';
  if (!hist.length) h += '<p class="muted small">Nenhuma sessão registrada ainda.</p>';
  h += '<ul class="list">' + hist.map(s => '<li class="tap row between" data-act="viewSession" data-id="' + esc(s.id) + '"><span>' + fmtDs(s.date) + ' · <b>' + esc(s.planName) + '</b>' + (s.light ? ' <span class="badge warn">leve</span>' : '') + (timeLine(s) ? '<div class="tiny muted">' + timeLine(s) + '</div>' : '') + '</span><span class="st-' + s.status + ' small">' + STATUS_ICON[s.status] + ' ' + STATUS[s.status] + '</span></li>').join('') + '</ul>';

  h += '<details class="card"><summary><b>Fases e progressão</b></summary><table><tr><th>Fase estimada</th><th>Frequência</th><th>Objetivo</th></tr>' +
    '<tr><td>Semanas 1–4</td><td>3×/sem</td><td>Adaptação e disciplina</td></tr><tr><td>Semanas 5–8</td><td>3–4×/sem</td><td>Consolidar; se adequado, 4º dia</td></tr>' +
    '<tr><td>Meses 3–4</td><td>4–5×/sem</td><td>Força e volume</td></tr><tr><td>Meses 5–6</td><td>4–5×/sem</td><td>Rotina sustentável</td></tr><tr><td>Opcional</td><td>até 6×/sem</td><td>Só com benefício e boa recuperação</td></tr></table>' +
    '<p class="small muted">A progressão depende da sua adaptação, não só do calendário. Quatro sessões bem feitas podem bastar por muito tempo. Veja os critérios na avaliação de 4 semanas (aba Evolução).</p></details>';
  return h;
};

// ---- check-in antes do treino
let checkin = null;
function startCheckin(planId, date, makeupFor) {
  if (db.sessions.find(s => s.status === 'em_andamento')) { toast('Já existe uma sessão em andamento.'); return; }
  checkin = { planId, date, makeupFor: makeupFor || null, energy: null, nausea: 'nao', ate: null, water: null, dizzy: false, flags: {} };
  openSheet({ title: 'Como você está agora?', render: renderCheckin });
}
function renderCheckin() {
  const c = checkin;
  let h = '<p class="small muted">' + esc(planName(c.planId)) + '. Responda rapidinho para o app ajustar o treino de hoje.</p>';
  h += '<label>Energia agora</label>' + scaleHtml('ci_energy', c.energy, 5, ['muito baixa', 'ótima']);
  h += '<label>Enjoo / náusea</label>' + chipsHtml('ci_nausea', [['nao', 'Não'], ['leve', 'Leve'], ['forte', 'Forte']], c.nausea);
  h += '<label>Comeu algo nas últimas horas?</label>' + chipsHtml('ci_ate', [['sim', 'Sim'], ['pouco', 'Pouco'], ['nao', 'Não']], c.ate);
  h += '<label>Bebeu água hoje?</label>' + chipsHtml('ci_water', [['sim', 'Sim'], ['pouco', 'Pouco'], ['nao', 'Quase nada']], c.water);
  h += '<label class="check"><input type="checkbox" id="ci-dizzy" ' + (c.dizzy ? 'checked' : '') + '> Estou com tontura ou mal-estar</label>';
  h += '<label>Sinais de alerta (marque se tiver algum)</label>' + RED_FLAGS.map(([k, l]) => '<label class="check"><input type="checkbox" id="rf-' + k + '" ' + (c.flags[k] ? 'checked' : '') + '> ' + l + '</label>').join('');
  h += '<button class="btn block" data-act="checkinNext" style="margin-top:12px">Continuar</button>';
  return h;
}
function readCheckinFlags() {
  checkin.dizzy = checked('ci-dizzy');
  RED_FLAGS.forEach(([k]) => { checkin.flags[k] = checked('rf-' + k); });
}
function alertHtml() {
  return '<div class="card bad"><b>Pare e procure atendimento médico se tiver:</b><ul class="small">' + RED_FLAGS.map(f => '<li>' + f[1] + '</li>').join('') + '</ul><p class="small">Efeitos colaterais relevantes devem ser comunicados ao seu médico.</p></div>';
}
function checkinNext() {
  readCheckinFlags();
  const c = checkin;
  if (c.energy == null || c.ate == null || c.water == null) { toast('Responda energia, alimentação e água'); return; }
  const red = Object.values(c.flags).some(Boolean);
  if (red) {
    sheet.title = 'Não treine agora';
    sheet.render = () => alertHtml() + '<p>Esses sinais precisam de avaliação médica. Não force o treino. Se for urgente, procure um pronto-atendimento ou ligue 192 (SAMU).</p>' +
      '<div class="btns"><button class="btn sec" data-act="checkinPostpone">Marcar treino como adiado</button><button class="btn" data-act="closeSheet">Entendi</button></div>';
    return refreshSheet(true);
  }
  const reasons = [];
  if (c.dizzy) reasons.push('tontura ou mal-estar');
  if (c.nausea === 'forte') reasons.push('enjoo forte');
  if (c.nausea === 'leve') reasons.push('enjoo leve');
  if (c.energy <= 2) reasons.push('energia baixa');
  if (c.ate === 'nao') reasons.push('sem comer nas últimas horas');
  if (c.ate === 'pouco') reasons.push('comeu pouco');
  if (c.water === 'nao') reasons.push('pouca água');
  if (!reasons.length) { createSession(false); return; }
  const blockTraining = c.dizzy || c.nausea === 'forte';
  sheet.title = blockTraining ? 'Hoje é melhor adiar' : 'Que tal ir mais leve hoje?';
  sheet.render = () => '<div class="card warn"><b>Você indicou:</b> ' + reasons.join(', ') + '.</div>' +
    (blockTraining
      ? '<p>Com tontura, mal-estar ou enjoo forte, o melhor é <b>não treinar agora</b>. Descanse, hidrate-se se conseguir e tente outro dia. Se os sintomas forem intensos ou não passarem, procure atendimento médico.</p><div class="btns"><button class="btn" data-act="checkinPostpone">Adiar o treino</button><button class="btn ghost" data-act="checkinSymptom">Registrar sintomas</button></div>'
      : '<p>Você pode fazer uma <b>versão leve</b> (1 série por exercício, carga menor, descanso maior) ou <b>adiar</b>. Se comeu pouco, um lanche simples antes pode ajudar.</p>' +
        '<div class="btns"><button class="btn" data-act="checkinLight">Treino leve</button><button class="btn sec" data-act="checkinPostpone">Adiar</button></div>' +
        '<button class="btn ghost block" style="margin-top:8px" data-act="checkinNormal">Estou bem — treino normal</button><p class="tiny muted">Se durante o treino sentir tontura, dor no peito ou mal-estar, pare imediatamente.</p>');
  refreshSheet(true);
}
function createSession(light) {
  const p = planById(checkin.planId);
  if (!p) { toast('Plano não encontrado'); return; }
  if (db.sessions.find(s => s.status === 'em_andamento')) { closeSheet(); toast('Já existe uma sessão em andamento. Finalize ou descarte antes.'); return; }
  const s = {
    id: uid(), date: checkin.date, planId: p.id, planName: p.name, status: 'em_andamento', light, warmupDone: false, makeupFor: checkin.makeupFor || null,
    startedAt: new Date().toISOString(), endedAt: null, notes: light ? 'Versão leve (check-in: ' + checkinSummary() + ')' : '',
    checkin: { energy: checkin.energy, nausea: checkin.nausea, ate: checkin.ate, water: checkin.water },
    exercises: p.exercises.map(e => {
      const last = lastExercise(e.name);
      const lb = last ? bestSet(last.ex) : null;
      const n = light ? 1 : e.sets;
      return { name: e.name, targetSets: n, targetReps: e.reps, rpe: null, notes: '', discomfort: false,
        sets: Array.from({ length: n }, () => ({ kg: lb && lb.kg != null && lb.kg !== '' ? (light ? '' : lb.kg) : '', reps: '', done: false })) };
    })
  };
  db.sessions.push(s); persist();
  closeSheet(); ui.sessionId = s.id; ui.tab = 'session'; render(); window.scrollTo(0, 0);
}
function checkinSummary() {
  const c = checkin;
  return 'energia ' + c.energy + '/5, enjoo ' + c.nausea + ', comeu ' + c.ate + (c.water ? ', água ' + c.water : '');
}

// ---- tela da sessão: exercício atual em destaque; os outros em lista (já feito / pular / fazer agora)
const SKIP_REASONS = { ocupada: 'Ocupada', sem_maquina: 'Sem máquina', outro: 'Outro' };
const exState = e => e.skip ? 'skipped' : (e.sets.length && e.sets.every(x => x.done)) ? 'done' : 'pending';
function currentEx(s) {
  const f = ui.focusEx;
  if (f && f.sid === s.id && s.exercises[f.i] && !s.exercises[f.i].skip) return f.i;
  return s.exercises.findIndex(e => exState(e) === 'pending');
}
function setsTxt(e) { return e.sets.filter(x => x.done).map(x => (x.kg !== '' ? x.kg + '×' : '') + (x.reps || '?')).join(', '); }
function skipTxt(e) { return e.skip ? (SKIP_REASONS[e.skip.reason] || 'Outro') + (e.skip.note ? ': ' + e.skip.note : '') : ''; }
function sessionCounts(s) {
  const ex = s.exercises.filter(e => !e.skip);
  return { total: ex.reduce((a, e) => a + e.sets.length, 0), done: ex.reduce((a, e) => a + e.sets.filter(x => x.done).length, 0) };
}
// texto "o que vem agora": exercício atual e série seguinte
function nowText(s) {
  const i = currentEx(s); if (i < 0) return 'Todos os exercícios feitos ou pulados';
  const e = s.exercises[i], k = e.sets.findIndex(x => !x.done);
  return e.name + (k >= 0 ? ' — série ' + (k + 1) + ' de ' + e.sets.length : ' — feito');
}
function exCard(s, ei) {
  const e = s.exercises[ei], editing = exState(e) !== 'pending';
  const last = lastExercise(e.name, s.id);
  const lastTxt = last ? setsTxt(last.ex).replace(/×/g, ' kg × ') : '';
  let h = '<div class="card current" aria-current="step"><div class="row between"><h3>▶ ' + esc(e.name) + '</h3><span class="small muted">' + esc(e.targetSets) + ' × ' + esc(e.targetReps) + ' · ' + e.sets.filter(x => x.done).length + '/' + e.sets.length + '</span></div>' +
    (lastTxt ? '<div class="tiny muted">Última vez (' + fmtDs(last.date) + '): ' + esc(lastTxt) + '</div>' : '<div class="tiny muted">Primeira vez: escolha uma carga confortável.</div>') +
    '<div class="set-row tiny muted"><span>#</span><span>Carga (kg)</span><span>Reps</span><span></span></div>';
  e.sets.forEach((st, si) => {
    h += '<div class="set-row"><span class="muted">' + (si + 1) + '</span><input inputmode="decimal" aria-label="Carga em kg, série ' + (si + 1) + '"' + (setValueOk('kg', st.kg) ? '' : ' aria-invalid="true"') + ' data-set="' + ei + ':' + si + ':kg" value="' + esc(st.kg) + '" placeholder="kg"><input inputmode="numeric" aria-label="Repetições, série ' + (si + 1) + '"' + (setValueOk('reps', st.reps) ? '' : ' aria-invalid="true"') + ' data-set="' + ei + ':' + si + ':reps" value="' + esc(st.reps) + '" placeholder="' + esc(String(e.targetReps).split(/[–-]/)[0]) + '"><button class="done-btn ' + (st.done ? 'on' : '') + '" data-act="toggleSet" data-e="' + esc(ei) + '" data-s="' + esc(si) + '" aria-pressed="' + !!st.done + '" aria-label="Série ' + (si + 1) + ' feita">✓</button></div>';
  });
  h += '<div class="row"><button class="btn ghost sm" data-act="addSet" data-e="' + esc(ei) + '">+ série</button>' + (e.sets.length > 1 ? '<button class="btn ghost sm" data-act="rmSet" data-e="' + esc(ei) + '">− série</button>' : '') + '</div>';
  h += '<label>Esforço percebido (1 = muito leve · 10 = máximo). Na adaptação, mire em 6–7.</label><div class="scale">' +
    Array.from({ length: 10 }, (_, i) => '<button type="button" class="' + (e.rpe === i + 1 ? 'on' : '') + '" data-act="rpe" data-e="' + esc(ei) + '" data-v="' + (i + 1) + '">' + (i + 1) + '</button>').join('') + '</div>';
  h += '<label class="check"><input type="checkbox" data-efield="' + ei + ':discomfort" ' + (e.discomfort ? 'checked' : '') + '> Senti dor ou desconforto</label>' +
    '<input data-efield="' + ei + ':notes" value="' + esc(e.notes) + '" placeholder="Observações (opcional)">';
  h += '<div class="btns">' + (editing ? '<button class="btn sec" data-act="exFocusNext">Ir para o próximo</button>' : '<button class="btn ghost" data-act="exSkip" data-e="' + esc(ei) + '">Pular</button><button class="btn sec" data-act="exDone" data-e="' + esc(ei) + '">✓ Já feito</button>') + '</div></div>';
  return h;
}
VIEWS.session = function () {
  const s = db.sessions.find(x => x.id === ui.sessionId);
  if (!s) { ui.tab = 'daily'; return VIEWS.daily(); }
  const p = planById(s.planId) || {};
  const live = s.status === 'em_andamento' && !s.prevStatus && !s.timesUnknown && s.startedAt;
  const mins = live ? Math.max(0, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000)) : 0;
  const c = sessionCounts(s), cur = currentEx(s);
  let h = '<div class="card soft"><div class="row between"><h3>' + esc(s.planName) + (s.light ? ' · leve' : '') + '</h3><span class="small">' + fmtDs(s.date) + '</span></div>' +
    (live ? '<div class="small">Início ' + hhmm(s.startedAt) + ' · ' + fmtMin(mins) + ' de treino</div>' : '') +
    '<div class="small" aria-live="polite">' + c.done + ' de ' + c.total + ' séries feitas' + (c.total - c.done ? ' · faltam ' + (c.total - c.done) : ' · todas feitas') + '</div>' +
    '<label class="check"><input type="checkbox" data-sfield="warmupDone" ' + (s.warmupDone ? 'checked' : '') + '> Aquecimento: ' + esc(p.warmup || '5 minutos') + '</label>' +
    '<p class="tiny muted">' + esc(p.notes || '') + ' Pare se sentir tontura, dor no peito ou mal-estar.</p></div>';
  h += cur >= 0 ? exCard(s, cur) : '<div class="card ok"><b>Todos os exercícios estão feitos ou pulados.</b><p class="small">Toque em “Finalizar sessão” quando terminar. Pulados podem ser feitos agora, se der.</p></div>';
  const idx = s.exercises.map((e, i) => i).filter(i => i !== cur);
  const pend = idx.filter(i => exState(s.exercises[i]) === 'pending'), done = idx.filter(i => exState(s.exercises[i]) === 'done'), skip = idx.filter(i => exState(s.exercises[i]) === 'skipped');
  if (pend.length) h += '<h2>Próximos</h2><ul class="list card exlist">' + pend.map(i => { const e = s.exercises[i], n = e.sets.filter(x => x.done).length; return '<li class="row between"><span class="tap grow" data-act="exFocus" data-e="' + i + '" role="button" tabindex="0"><b>' + esc(e.name) + '</b><div class="tiny muted">' + esc(e.targetSets) + ' × ' + esc(e.targetReps) + (n ? ' · ' + n + '/' + e.sets.length + ' feitas' : '') + '</div></span><span class="row"><button class="btn ghost sm" data-act="exSkip" data-e="' + i + '">Pular</button><button class="btn sec sm" data-act="exDone" data-e="' + i + '" aria-label="Já feito: ' + esc(e.name) + '">✓ Feito</button></span></li>'; }).join('') + '</ul>';
  if (done.length) h += '<h2>Feitos</h2><ul class="list card exlist">' + done.map(i => { const e = s.exercises[i]; return '<li class="tap row between" data-act="exFocus" data-e="' + i + '" role="button" tabindex="0"><span><span class="st-concluida">✓</span> ' + esc(e.name) + '</span><span class="tiny muted">' + esc(setsTxt(e) || 'sem valores') + '</span></li>'; }).join('') + '</ul>';
  if (skip.length) h += '<h2>Pulados</h2><ul class="list card exlist">' + skip.map(i => { const e = s.exercises[i]; return '<li class="row between"><span><span class="st-adiada">↷</span> ' + esc(e.name) + '<div class="tiny muted">Motivo: ' + esc(skipTxt(e)) + '</div></span><button class="btn sec sm" data-act="exUnskip" data-e="' + i + '">Fazer agora</button></li>'; }).join('') + '</ul>';
  h += '<label>Observações da sessão</label><textarea data-sfield="notes">' + esc(s.notes) + '</textarea>';
  h += '<div class="btns"><button class="btn danger" data-act="cancelSession">Descartar</button><button class="btn" data-act="finishSession">Finalizar sessão</button></div>';
  return h;
};

// ---- treino diário: a sessão em andamento, o treino da agenda de hoje ou descanso
VIEWS.daily = function () {
  const t = today(), running = db.sessions.find(s => s.status === 'em_andamento');
  if (running) { ui.tab = 'session'; ui.sessionId = running.id; return VIEWS.session(); }
  const pl = plannedFor(t), ss = sessionsOn(t), att = ss.filter(attended);
  let h = '<p class="small muted">' + fmtLong(t) + '</p>';
  if (att.length) {
    h += '<div class="card ok"><h3>Treino de hoje feito ✓</h3><ul class="list">' + att.map(s => '<li class="tap row between" data-act="viewSession" data-id="' + esc(s.id) + '"><b>' + esc(s.planName) + '</b><span class="small">' + (timeLine(s) || STATUS[s.status]) + '</span></li>').join('') + '</ul></div>';
    h += '<button class="btn ghost block" data-act="pickPlan" data-date="' + esc(t) + '">Fazer outro treino</button>';
  } else if (pl && !ss.length) {
    const p = planById(pl) || { exercises: [] };
    h += '<div class="card current"><div class="row between"><h3>Hoje: ' + esc(p.name || pl) + '</h3><span class="badge">na agenda</span></div>' +
      '<p class="small muted">Aquecimento: ' + esc(p.warmup || '5 minutos') + '</p><ul class="list">' + p.exercises.map(e => '<li class="row between"><span>' + esc(e.name) + '</span><span class="small muted">' + e.sets + ' × ' + esc(e.reps) + '</span></li>').join('') + '</ul>' +
      '<div class="btns"><button class="btn ghost" data-act="skipDay" data-plan="' + esc(pl) + '">Pular o treino de hoje</button><button class="btn" data-act="startCheckin" data-plan="' + esc(pl) + '" data-date="' + esc(t) + '">Iniciar treino</button></div><p class="tiny muted">Horário livre: comece quando for melhor para você. O app registra a hora de início e de fim.</p></div>';
  } else if (pl) {
    const s = ss[0];
    h += '<div class="card"><h3>Treino de hoje: ' + esc(STATUS[s.status]) + '</h3>' + (s.notes ? '<p class="small muted">' + esc(s.notes) + '</p>' : '') + '<button class="btn sec block" data-act="pickPlan" data-date="' + esc(t) + '">Treinar mesmo assim</button></div>';
  } else {
    h += '<div class="card soft"><h3>Hoje é dia de descanso</h3><p class="small">Não tem treino na agenda hoje. Descansar também faz parte: é na recuperação que o corpo se adapta.</p><button class="btn ghost block" data-act="pickPlan" data-date="' + esc(t) + '">Quero treinar mesmo assim</button></div>';
  }
  h += trainTimeCard();
  return h;
};

// ---- horários: início e fim de cada sessão, tempo por dia
const hhmm = iso => { const d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function sessionMinutes(s) {
  if (!attended(s) || !s.startedAt || !s.endedAt || s.timesUnknown) return 0;
  const m = (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60000;
  return m > 0 && m <= 360 ? Math.round(m) : 0;
}
const dayMinutes = d => sessionsOn(d).reduce((a, s) => a + sessionMinutes(s), 0);
function fmtMin(m) { m = Math.round(m); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + pad(m % 60) : ''); }
function timeLine(s) {
  if (!s.startedAt || s.timesUnknown || s.status === 'adiada' || s.status === 'nao_realizada') return '';
  const m = sessionMinutes(s);
  return hhmm(s.startedAt) + (s.endedAt ? '–' + hhmm(s.endedAt) : '') + (m ? ' · ' + fmtMin(m) : '');
}
function trainTimeCard() {
  const t = today(), days = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
  const mins = days.map(dayMinutes), max = Math.max(...mins, 1), total = mins.reduce((a, b) => a + b, 0), n = mins.filter(Boolean).length;
  const ws = weekStart(t); let wk = 0; for (let d = ws; d <= t; d = addDays(d, 1)) wk += dayMinutes(d);
  return '<div class="card"><h3>Tempo de treino</h3><p class="small">Esta semana: <b>' + fmtMin(wk) + '</b>' + (n ? ' · média de ' + fmtMin(total / n) + ' por dia treinado (últimos 7 dias)' : '') + '</p>' +
    '<ul class="list timelist">' + days.map((d, i) => '<li class="row between"><span class="small">' + WD_SHORT[wd(d)] + ' ' + fmtDs(d) + '</span><span class="grow tbar"><i style="width:' + (mins[i] / max * 100).toFixed(0) + '%"></i></span><span class="small" style="min-width:56px;text-align:right">' + (mins[i] ? fmtMin(mins[i]) : '—') + '</span></li>').join('') + '</ul>' +
    '<p class="tiny muted">Conta do início ao fim de cada sessão registrada. Dá para corrigir os horários tocando na sessão no histórico.</p></div>';
}

function setValueOk(k, v) { return H.check(k === 'kg' ? 'kg' : 'reps', v, k === 'reps' ? { integer: true } : null).ok; }
function markSetInput(el) { const k = el.dataset.set.split(':')[2]; if (setValueOk(k, el.value)) el.removeAttribute('aria-invalid'); else el.setAttribute('aria-invalid', 'true'); }
function invalidSetValues(s) { let n = 0; s.exercises.forEach(e => e.sets.forEach(st => { if (!setValueOk('kg', st.kg)) n++; if (!setValueOk('reps', st.reps)) n++; })); return n; }
// descanso entre séries: fixo ou progressivo (ex.: 45 s, 1 min, 1 min 15 s). Conta pelo relógio,
// então continua certo com o app em segundo plano; o Android avisa no fim mesmo com a tela apagada.
let rest = null, restTick = null;
function restSecondsFor(si) {
  const st = db.settings;
  if (st.restMode === 'prog') return Math.min(600, (st.restBase != null ? st.restBase : 45) + si * (st.restStep != null ? st.restStep : 15));
  return st.restSeconds || 90;
}
function fmtSecs(n) { const m = Math.floor(n / 60), r = n % 60; return m ? m + ' min' + (r ? ' ' + r + ' s' : '') : r + ' s'; }
const fmtClock = n => Math.floor(n / 60) + ':' + pad(n % 60);
const restLeftS = () => rest ? Math.max(0, Math.ceil((rest.endsAt - Date.now()) / 1000)) : 0;
function startRest(si, next) {
  if (!db.settings.restEnabled) return;
  const secs = restSecondsFor(si);
  rest = { endsAt: Date.now() + secs * 1000, total: secs, si, next: next || '' };
  $('#rest').classList.remove('hidden'); document.body.classList.add('resting');
  clearInterval(restTick); restTick = setInterval(drawRest, 500); drawRest(); workoutSync();
}
function drawRest() {
  if (!rest) return;
  const left = restLeftS();
  if (left <= 0) { const n = rest.next, hidden = document.hidden; stopRest(); if (!hidden) { try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) { } toast('Descanso concluído' + (n ? ' — ' + n : '')); } return; }
  $('#rest').innerHTML = '<span class="rest-txt"><span>Descanso ' + fmtClock(left) + '</span>' + (rest.next ? '<span class="tiny">Próxima: ' + esc(rest.next) + '</span>' : '') + '</span><span class="row"><button data-act="restAdd">+15 s</button><button data-act="restStop">Pular</button></span>';
  if (pipOn) renderPip();
}
function stopRest() { clearInterval(restTick); restTick = null; rest = null; $('#rest').classList.add('hidden'); document.body.classList.remove('resting'); workoutSync(); if (pipOn) renderPip(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && rest) drawRest(); });

// ---- treino fora do app: notificação fixa + janela flutuante (picture-in-picture) no Android
let lastSync = '', lastPip = null, pipOn = false, pipTick = null;
const runningSession = () => db && db.sessions && db.sessions.find(x => x.status === 'em_andamento' && !x.prevStatus);
function workoutSync() {
  if (!B || !B.workoutStatus || store.recovery) return;
  const s = runningSession();
  let st = { active: false };
  if (s) { const c = sessionCounts(s); st = { active: true, title: s.planName + ' · ' + c.done + '/' + c.total + ' séries', text: nowText(s), restEndsAt: rest ? rest.endsAt : 0, next: rest && rest.next ? rest.next : nowText(s) }; }
  const j = JSON.stringify(st);
  if (j !== lastSync) { lastSync = j; try { B.workoutStatus(j); } catch (e) { } }
  const pip = !!s && db.settings.pipEnabled !== false;
  if (pip !== lastPip && B.setPip) { lastPip = pip; try { B.setPip(pip); } catch (e) { } }
}
function renderPip() {
  const s = runningSession(), el = $('#pip');
  if (!s) { el.innerHTML = '<div class="pip-big">Treino encerrado</div>'; return; }
  const c = sessionCounts(s), mins = s.startedAt && !s.timesUnknown ? Math.max(0, Math.round((Date.now() - Date.parse(s.startedAt)) / 60000)) : null;
  el.innerHTML = '<div class="pip-top">' + esc(s.planName) + ' · ' + c.done + '/' + c.total + (mins != null ? ' · ' + mins + ' min' : '') + '</div>' +
    (rest ? '<div class="pip-label">Descanso</div><div class="pip-big">' + fmtClock(restLeftS()) + '</div><div class="pip-next">Próxima: ' + esc(rest.next) + '</div>'
      : '<div class="pip-label">Agora</div><div class="pip-next pip-now">' + esc(nowText(s)) + '</div>');
}
window.onPip = v => {
  pipOn = v === '1' || v === true;
  document.body.classList.toggle('in-pip', pipOn);
  clearInterval(pipTick); pipTick = null;
  if (pipOn) { closeSheet(); renderPip(); pipTick = setInterval(renderPip, 1000); } else render();
};
window.openRunningSession = () => { if (store.recovery) return; if (runningSession()) go('daily'); };

function finishSessionSheet() {
  const s = db.sessions.find(x => x.id === ui.sessionId);
  const skipped = s.exercises.filter(e => e.skip).length;
  const all = !skipped && s.exercises.every(e => e.sets.every(st => st.done)), any = s.exercises.some(e => e.sets.some(st => st.done));
  let stSel = all ? 'concluida' : 'parcial';
  openSheet({
    title: 'Finalizar sessão', stSel,
    render: function () {
      const bad = invalidSetValues(s);
      return '<p class="small muted">' + (all ? 'Todas as séries marcadas. Muito bem!' : any ? 'Algumas séries não foram marcadas. Tudo bem — registre como parcial se for o caso.' : 'Nenhuma série marcada.') + (skipped ? ' ' + skipped + ' exercício(s) pulado(s).' : '') + '</p>' +
        (s.startedAt && !s.timesUnknown && !s.prevStatus ? '<p class="small">Início ' + hhmm(s.startedAt) + ' · fim agora (' + hhmm(new Date().toISOString()) + ') · ' + fmtMin(Math.max(0, (Date.now() - Date.parse(s.startedAt)) / 60000)) + '</p>' : '') +
        (bad ? '<div class="card warn small">' + bad + ' valor(es) de carga/repetições não são números válidos (marcados em vermelho). Eles ficam guardados como digitados, mas não entram nos cálculos de força. Volte e corrija, se quiser.</div>' : '') +
        '<label>Como ficou a sessão?</label>' + chipsHtml('finSt', [['concluida', 'Concluída'], ['parcial', 'Parcial'], ['nao_realizada', 'Não realizada']], this.stSel) +
        '<button class="btn block" style="margin-top:14px" data-act="finishSave">Salvar</button>';
    }
  });
}

// ================================================================ EVOLUÇÃO
VIEWS.progress = function () {
  const segs = [['peso', 'Peso'], ['medidas', 'Medidas'], ['forca', 'Força'], ['freq', 'Frequência'], ['aval', 'Avaliação']];
  let h = '<div class="seg">' + segs.map(([k, l]) => '<button class="' + (ui.prog === k ? 'on' : '') + '" data-act="prog" data-k="' + esc(k) + '">' + l + '</button>').join('') + '</div>';
  return h + PROG[ui.prog]();
};
const PROG = {};
PROG.peso = function () {
  const p = db.profile, w = db.weights.slice().sort(byDate);
  const cw = currentWeight(), lost = p.startWeight - cw, rem = cw - p.targetWeight;
  let h = '<div class="card"><div class="grid3"><div><div class="tiny muted">Inicial</div><div class="mid">' + r1(p.startWeight) + '</div></div><div><div class="tiny muted">Atual</div><div class="mid">' + r1(cw) + '</div></div><div><div class="tiny muted">Meta</div><div class="mid">' + r1(p.targetWeight) + '</div></div></div>' +
    '<p class="small">Variação total: <b>' + sign(-lost) + ' kg</b> · ' + (rem > 0 ? 'faltam <b>' + r1(rem) + ' kg</b>' : '<b>meta alcançada!</b>') + '</p>' +
    bar(clamp(lost / ((p.startWeight - p.targetWeight) || 1) * 100, 0, 100), 100, 'var(--ok)') + '</div>';
  const pts = [[tOf(p.startDate), p.startWeight]].concat(w.filter(x => x.date !== p.startDate || true).map(x => [tOf(x.date), x.kg]));
  // média móvel de 7 dias
  const avg = w.map(x => { const win = w.filter(y => y.date <= x.date && y.date > addDays(x.date, -7)); return [tOf(x.date), sum(win, y => y.kg) / win.length]; });
  h += '<div class="card"><h3>Evolução do peso</h3>' + lineChart([{ pts: w.length ? w.map(x => [tOf(x.date), x.kg]) : pts, color: 'var(--pri)', dots: true, label: 'registros' }, { pts: w.length > 2 ? avg : [], color: 'var(--p)', width: 2.5, label: w.length > 2 ? 'média de 7 dias' : '' }], { goal: p.targetWeight }) +
    '<p class="tiny muted">Oscilações de um dia para o outro são normais (água, sal, intestino) e não significam fracasso. Observe a tendência ao longo das semanas. Pesar-se uma vez por semana, no mesmo horário e condições, costuma bastar.</p></div>';
  h += '<button class="btn block" data-act="addWeight">Registrar peso</button>';
  h += '<ul class="list card">' + (w.length ? w.slice().reverse().map((x, i, arr) => {
    const prev = arr[i + 1]; const d = prev ? x.kg - prev.kg : x.kg - p.startWeight;
    return '<li class="tap row between" data-act="editWeight" data-id="' + esc(x.id) + '"><span>' + fmtD(x.date) + '</span><span><b>' + r1(x.kg) + ' kg</b> <span class="small muted">' + sign(d) + ' · total ' + sign(x.kg - p.startWeight) + '</span></span></li>';
  }).join('') : '<li class="muted small">Nenhum registro ainda. Peso inicial de referência: ' + r1(p.startWeight) + ' kg (' + fmtD(p.startDate) + ').</li>') + '</ul>';
  return h;
};
const MEAS = [['waist', 'Cintura'], ['abdomen', 'Abdômen'], ['hip', 'Quadril'], ['chest', 'Peito'], ['arm', 'Braços'], ['thigh', 'Coxas']];
PROG.medidas = function () {
  const m = db.measurements.slice().sort(byDate);
  let h = '<p class="small muted">Registro opcional, em centímetros. Medidas ajudam a ver mudanças que a balança não mostra.</p><button class="btn block" data-act="addMeas">Registrar medidas</button>';
  if (!m.length) return h + '<p class="muted small">Nenhuma medida registrada.</p>';
  const first = m[0], last = m[m.length - 1];
  h += '<div class="card"><h3>Primeira × última</h3><table><tr><th></th><th>' + fmtDs(first.date) + '</th><th>' + fmtDs(last.date) + '</th><th>Dif.</th></tr>' +
    MEAS.map(([k, l]) => '<tr><td>' + l + '</td><td>' + r1(first[k]) + '</td><td>' + r1(last[k]) + '</td><td>' + (first[k] != null && last[k] != null ? sign(last[k] - first[k]) : '—') + '</td></tr>').join('') + '</table></div>';
  const wpts = m.filter(x => x.waist != null).map(x => [tOf(x.date), x.waist]);
  if (wpts.length > 1) h += '<div class="card"><h3>Cintura (cm)</h3>' + lineChart([{ pts: wpts, color: 'var(--pri)', dots: true }]) + '</div>';
  h += '<ul class="list card">' + m.slice().reverse().map(x => '<li class="tap" data-act="editMeas" data-id="' + esc(x.id) + '"><b>' + fmtD(x.date) + '</b><div class="small muted">' + MEAS.filter(([k]) => x[k] != null).map(([k, l]) => l + ' ' + r1(x[k])).join(' · ') + '</div></li>').join('') + '</ul>';
  return h;
};
PROG.forca = function () {
  const names = [...new Set(db.sessions.filter(attended).flatMap(s => s.exercises.filter(e => e.sets.some(x => x.done)).map(e => e.name)))];
  if (!names.length) return '<p class="muted" style="margin-top:12px">Registre sessões de treino para ver a evolução de força aqui.</p>';
  if (!names.includes(ui.strengthEx)) ui.strengthEx = names[0];
  const rows = db.sessions.filter(attended).sort(byDate).map(s => ({ s, e: s.exercises.find(e => e.name === ui.strengthEx) })).filter(r => r.e && r.e.sets.some(x => x.done));
  const pts = rows.map(r => { const b = bestSet(r.e); return b && num(b.kg) != null ? [tOf(r.s.date), num(b.kg)] : null; }).filter(Boolean);
  const vol = rows.map(r => [tOf(r.s.date), sum(r.e.sets.filter(x => x.done), x => (num(x.kg) || 0) * (num(x.reps) || 0))]);
  let h = '<label>Exercício</label><select id="str-ex" data-change="strengthEx">' + names.map(n => '<option ' + (n === ui.strengthEx ? 'selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>';
  h += '<div class="card"><h3>Maior carga por sessão (kg)</h3>' + lineChart([{ pts, color: 'var(--pri)', dots: true }]) + '</div>';
  if (vol.some(v => v[1] > 0)) h += '<div class="card"><h3>Volume (kg × reps somados)</h3>' + lineChart([{ pts: vol, color: 'var(--p)', dots: true }]) + '</div>';
  h += '<div class="card"><table><tr><th>Data</th><th>Séries feitas</th><th>Esforço</th></tr>' + rows.slice().reverse().map(r => '<tr><td>' + fmtDs(r.s.date) + '</td><td>' + r.e.sets.filter(x => x.done).map(x => (x.kg !== '' ? x.kg + '×' : '') + (x.reps || '?')).join(', ') + '</td><td>' + (r.e.rpe || '—') + (r.e.discomfort ? ' ⚠' : '') + '</td></tr>').join('') + '</table></div>';
  h += '<p class="tiny muted">Quedas persistentes de desempenho pedem revisão de recuperação, alimentação, sono e planejamento. Queda de força, isoladamente, não confirma perda muscular.</p>';
  return h;
};
PROG.freq = function () {
  const t = today(); const ws0 = weekStart(t);
  const weeks = []; for (let i = 7; i >= 0; i--) { const ws = addDays(ws0, -7 * i); if (addDays(ws, 6) >= weekStart(db.profile.startDate)) weeks.push({ ws, ...weekStats(ws) }); }
  const W = 340, CH = 160, bw = (W - 20) / Math.max(weeks.length, 1);
  const maxV = Math.max(3, ...weeks.map(w => Math.max(w.planned, w.done)));
  let svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + CH + '" role="img" aria-label="Dias planejados e cumpridos por semana">';
  weeks.forEach((w, i) => {
    const x = 10 + i * bw, hp = w.planned / maxV * (CH - 40), hd = w.done / maxV * (CH - 40);
    svg += '<rect x="' + (x + 4) + '" y="' + (CH - 22 - hp) + '" width="' + (bw / 2 - 5) + '" height="' + hp + '" fill="var(--line)" rx="3"/>';
    svg += '<rect x="' + (x + bw / 2) + '" y="' + (CH - 22 - hd) + '" width="' + (bw / 2 - 5) + '" height="' + hd + '" fill="var(--pri)" rx="3"/>';
    svg += '<text x="' + (x + bw / 2) + '" y="' + (CH - 6) + '" text-anchor="middle">' + fmtDs(w.ws) + '</text>';
    svg += '<text x="' + (x + bw / 2) + '" y="' + (CH - 26 - Math.max(hp, hd)) + '" text-anchor="middle">' + w.done + '/' + w.planned + '</text>';
  });
  svg += '</svg>';
  const from = addDays(t, -27) < db.profile.startDate ? db.profile.startDate : addDays(t, -27);
  const a = H.adherence(db, from, t, t);
  const list = (arr, f) => arr.length ? arr.map(f).join(', ') : '—';
  return '<div class="card"><h3>Treinos por semana</h3>' + svg + '<div class="row tiny muted"><span><span style="display:inline-block;width:10px;height:10px;background:var(--line)"></span> dias planejados</span><span><span style="display:inline-block;width:10px;height:10px;background:var(--pri)"></span> dias cumpridos (inclui parciais e remarcados)</span></div></div>' +
    '<div class="card"><div class="kv"><span>Últimas 4 semanas (desde ' + fmtDs(from) + ')</span><b>' + a.fulfilled + ' de ' + a.planned + ' dias' + (a.rate != null ? ' · ' + r0(a.rate * 100) + '%' : '') + '</b></div>' +
    '<div class="kv"><span>No dia planejado</span><b>' + a.hits.length + (a.partialDays.length ? ' (' + a.partialDays.length + ' parcial)' : '') + '</b></div>' +
    '<div class="kv"><span>Remarcados na mesma semana</span><b>' + a.makeups.length + '</b></div>' +
    '<div class="kv"><span>Treinos extras (fora da conta)</span><b>' + a.extras.length + '</b></div>' +
    '<div class="kv"><span>Adiados / não realizados</span><b>' + a.postponed.length + ' / ' + a.notDone.length + '</b></div>' +
    '<div class="kv"><span>Sem registro</span><b>' + a.unregistered.length + '</b></div>' +
    (a.pendingToday ? '<p class="tiny muted">Hoje tem treino planejado; ele só entra na conta depois de feito.</p>' : '') +
    (a.makeups.length ? '<p class="tiny muted">Remarcações: ' + esc(list(a.makeups, m => fmtDs(m.planned) + ' → ' + fmtDs(m.done))) + '</p>' : '') +
    '<details><summary class="tiny">Como a conta é feita</summary><p class="tiny muted">Conta dias, não sessões. Um dia planejado conta como cumprido se teve treino concluído ou parcial. Treino feito em outro dia da mesma semana cobre um dia planejado perdido; o que sobra aparece como extra. O percentual nunca passa de 100%. Adiado e não realizado não contam como feitos, mas não são “falta grave”: perder um treino não apaga o seu progresso.</p></details></div>';
};

// ---- avaliação de 4 semanas
function cycleOf(date) { const n = Math.floor(diffDays(db.profile.startDate, date) / 28); return { n, start: addDays(db.profile.startDate, n * 28), end: addDays(db.profile.startDate, n * 28 + 27) }; }
function reviewDue() {
  const t = today(); if (t < addDays(db.profile.startDate, 28)) return null;
  const c = cycleOf(t); const start = addDays(c.start, -28), end = addDays(c.start, -1);
  if (db.reviews.some(r => r.start === start)) return null;
  if (diffDays(c.start, t) > 10) return null; // não insistir
  return { start, end };
}
function computeReview(start) {
  const end = addDays(start, 27), t = today(), effEnd = end < t ? end : t;
  const p = db.profile;
  const wIn = db.weights.filter(w => w.date <= effEnd).sort(byDate);
  const wBefore = db.weights.filter(w => w.date < start).sort(byDate);
  const wStartP = wBefore.length ? wBefore[wBefore.length - 1].kg : p.startWeight;
  const wNow = wIn.length ? wIn[wIn.length - 1].kg : p.startWeight;
  const adh = H.adherence(db, start, end, t);
  const planned = adh.planned;
  const sess = db.sessions.filter(s => s.date >= start && s.date <= effEnd);
  const done = adh.fulfilled, full = sess.filter(s => s.status === 'concluida').length, part = sess.filter(s => s.status === 'parcial').length;
  const attend = adh.rate;
  // força: cada exercício comparado com a regra do core (carga, repetições e séries; sessões leves fora)
  const names = [...new Set(sess.filter(attended).flatMap(s => s.exercises.map(e => e.name)))];
  let up = 0, same = 0, down = 0, persistent = 0, inconc = 0, insuf = 0; const drops = [];
  names.forEach(n => {
    const tr = H.strengthTrend(H.exerciseEntries(db, n, start, effEnd));
    if (tr.status === 'evoluindo') up++; else if (tr.status === 'estavel') same++;
    else if (tr.status === 'queda') down++; else if (tr.status === 'queda_persistente') { down++; persistent++; drops.push(n); }
    else if (tr.status === 'inconclusivo') inconc++; else insuf++;
  });
  const energies = db.energyLogs.filter(e => e.date >= start && e.date <= effEnd);
  const eAvg = energies.length ? sum(energies, e => e.energy) / energies.length : null;
  const sleepAvg = energies.filter(e => e.sleepHours != null).length ? sum(energies, e => e.sleepHours) / energies.filter(e => e.sleepHours != null).length : null;
  const soreAvg = energies.filter(e => e.soreness).length ? sum(energies, e => e.soreness) / energies.filter(e => e.soreness).length : null;
  const nDays = diffDays(start, effEnd) + 1;
  let daysLogged = 0, protHit = 0, protDays = 0, waterHit = 0, waterDays = 0, protSum = 0;
  for (let d = start; d <= effEnd; d = addDays(d, 1)) {
    const tot = dayTotals(d), g = goalFor(d);
    if (tot.nMeals) { daysLogged++; protSum += tot.p; }
    if (g.protein && tot.nMeals) { protDays++; if (tot.p >= g.protein) protHit++; }
    if (g.water) { waterDays++; if (tot.water >= g.water) waterHit++; }
  }
  const meas = db.measurements.filter(m => m.date <= effEnd).sort(byDate);
  return { start, end, effEnd, wStartP, wNow, startW: p.startWeight, planned, done, full, part, attend, up, same, down, persistent, drops, inconc, insuf, adh, nWeights: db.weights.filter(w => w.date >= start && w.date <= effEnd).length, eAvg, sleepAvg, soreAvg, nEnergy: energies.length,
    nDays, daysLogged, protHit, protDays, waterHit, waterDays, protAvg: daysLogged ? protSum / daysLogged : null,
    measFirst: meas[0] || null, measLast: meas[meas.length - 1] || null, symptoms: db.symptomLogs.filter(s => s.date >= start && s.date <= effEnd).length };
}
function reviewSheet(start, existing) {
  const R = computeReview(start);
  const st = { checks: existing ? Object.assign({}, existing.checks) : { recovery: null, nutrition: null, sleep: null } };
  openSheet({
    title: 'Avaliação de 4 semanas',
    render: function () {
      const weekN = Math.floor(diffDays(db.profile.startDate, R.effEnd) / 7) + 1;
      const compared = R.up + R.same + R.down;
      const c1 = R.attend != null && R.attend >= 0.8, c3 = compared ? (R.persistent === 0 && R.down <= R.up + R.same) : null;
      const all = c1 && c3 === true && st.checks.recovery === 'sim' && st.checks.nutrition === 'sim' && st.checks.sleep === 'sim';
      const answered = ['recovery', 'nutrition', 'sleep'].every(k => st.checks[k]);
      let h = '<p class="small muted">Período: ' + fmtD(R.start) + ' a ' + fmtD(R.end) + (R.effEnd < R.end ? ' (parcial, até hoje)' : '') + ' · semana ' + weekN + ' desde o início</p>';
      h += '<div class="card"><h3>Corpo</h3><div class="kv"><span>Peso inicial (programa)</span><b>' + r1(R.startW) + ' kg</b></div><div class="kv"><span>Início do período</span><b>' + r1(R.wStartP) + ' kg</b></div><div class="kv"><span>Atual</span><b>' + r1(R.wNow) + ' kg</b></div><div class="kv"><span>Variação no período</span><b>' + sign(R.wNow - R.wStartP) + ' kg</b></div>' +
        (R.measLast ? '<div class="kv"><span>Cintura (primeira → última)</span><b>' + r1(R.measFirst.waist) + ' → ' + r1(R.measLast.waist) + ' cm</b></div>' : '') + '</div>';
      h += '<div class="card"><h3>Treinos</h3><div class="kv"><span>Planejados</span><b>' + R.planned + '</b></div><div class="kv"><span>Feitos</span><b>' + R.done + ' (' + R.full + ' completos, ' + R.part + ' parciais)</b></div><div class="kv"><span>Comparecimento</span><b>' + (R.attend != null ? r0(R.attend * 100) + '%' : '—') + '</b></div>' +
        '<div class="kv"><span>Remarcados / extras</span><b>' + R.adh.makeups.length + ' / ' + R.adh.extras.length + '</b></div>' +
        '<div class="kv"><span>Adiados / não realizados / sem registro</span><b>' + R.adh.postponed.length + ' / ' + R.adh.notDone.length + ' / ' + R.adh.unregistered.length + '</b></div>' +
        '<div class="kv"><span>Exercícios evoluindo / estáveis / caindo</span><b>' + R.up + ' / ' + R.same + ' / ' + R.down + '</b></div>' +
        ((R.inconc || R.insuf) ? '<div class="kv"><span>Inconclusivos / dados insuficientes</span><b>' + R.inconc + ' / ' + R.insuf + '</b></div>' : '') +
        (R.persistent ? '<div class="card warn small">Queda persistente em: ' + esc(R.drops.join(', ')) + '. Vale revisar recuperação, alimentação, sono e planejamento. Queda de força, isoladamente, não confirma perda muscular.</div>' : '') + '</div>';
      h += '<div class="card"><h3>Energia e recuperação</h3><div class="kv"><span>Energia média (1–5)</span><b>' + r1(R.eAvg) + '</b></div><div class="kv"><span>Sono médio</span><b>' + (R.sleepAvg != null ? r1(R.sleepAvg) + ' h' : '—') + '</b></div><div class="kv"><span>Dor muscular média (1–5)</span><b>' + r1(R.soreAvg) + '</b></div><div class="kv"><span>Registros de sintomas</span><b>' + R.symptoms + '</b></div></div>';
      h += '<div class="card"><h3>Alimentação (conforme registros)</h3><p class="tiny muted">Dias sem registro não são tratados como “comeu zero”: só não há informação.</p><div class="kv"><span>Dias com refeições registradas</span><b>' + R.daysLogged + ' de ' + R.nDays + '</b></div><div class="kv"><span>Proteína média nos dias registrados</span><b>' + r0(R.protAvg) + ' g</b></div>' +
        (R.protDays ? '<div class="kv"><span>Dias na meta de proteína</span><b>' + R.protHit + ' de ' + R.protDays + '</b></div>' : '') + (R.waterDays ? '<div class="kv"><span>Dias na meta de água</span><b>' + R.waterHit + ' de ' + R.waterDays + '</b></div>' : '') + '</div>';
      h += '<h2>Critérios para aumentar a frequência</h2>';
      const ck = (ok, txt) => '<div class="row" style="margin:6px 0"><span class="badge ' + (ok === true ? 'ok' : ok === false ? 'bad' : '') + '">' + (ok === true ? 'ok' : ok === false ? 'não' : '?') + '</span><span class="small">' + txt + '</span></div>';
      h += ck(R.attend != null ? c1 : null, '1. Comparecimento ≥ 80% das sessões planejadas');
      h += '<div class="small" style="margin-top:8px">2. A recuperação muscular está adequada?</div>' + chipsHtml('rvRecovery', [['sim', 'Sim'], ['nao', 'Não']], st.checks.recovery);
      h += ck(c3, '3. Cargas e repetições estáveis ou evoluindo' + (c3 == null ? ' (dados insuficientes: é preciso pelo menos 2 sessões comparáveis do mesmo exercício)' : ''));
      h += '<div class="small" style="margin-top:8px">4. Alimentação e hidratação estão adequadas?</div>' + chipsHtml('rvNutrition', [['sim', 'Sim'], ['nao', 'Não']], st.checks.nutrition);
      h += '<div class="small" style="margin-top:8px">5. Sono, energia e tempo disponível permitem mais um dia?</div>' + chipsHtml('rvSleep', [['sim', 'Sim'], ['nao', 'Não']], st.checks.sleep);
      let sug;
      if (!answered) sug = 'Responda as perguntas acima para ver a sugestão.';
      else if (c3 == null || R.attend == null) sug = '<b>Ainda faltam dados</b> para avaliar todos os critérios. Sugestão: manter a frequência atual e continuar registrando.';
      else if (all && weekN >= 4) sug = '<b>Os critérios foram atendidos.</b> Se você quiser e se sentir bem, pode considerar adicionar um dia de treino (por exemplo, passar para 4×/semana). Manter a frequência atual também é uma ótima escolha.';
      else if (all) sug = '<b>Indo bem!</b> Os critérios estão sendo atendidos, mas o período de adaptação ainda não terminou. Sugestão: manter a frequência atual por enquanto.';
      else sug = '<b>Sugestão: manter a frequência atual</b> e ajustar o planejamento (recuperação, alimentação, sono ou horários) antes de aumentar.';
      st.suggestion = sug.replace(/<[^>]+>/g, '');
      h += '<div class="card soft">' + sug + '<p class="tiny muted">O app nunca muda a frequência de treino sozinho. Qualquer mudança é decisão sua (de preferência com seu profissional de educação física).</p></div><label>Anotações</label><textarea id="rv-notes">' + esc(existing ? existing.notes : '') + '</textarea>';
      h += '<div class="btns"><button class="btn sec" data-act="rvShare">Compartilhar</button><button class="btn" data-act="rvSave">Salvar avaliação</button></div>';
      return h;
    },
    R, st, existing
  });
}
function reviewText(R, st, notes) {
  return 'AVALIAÇÃO DE 4 SEMANAS — ' + APP_NAME + '\nPeríodo: ' + fmtD(R.start) + ' a ' + fmtD(R.effEnd) + '\n\n' +
    'Peso: inicial ' + r1(R.startW) + ' kg · início do período ' + r1(R.wStartP) + ' kg · atual ' + r1(R.wNow) + ' kg (' + sign(R.wNow - R.wStartP) + ' kg no período)\n' +
    'Treinos: ' + R.done + ' de ' + R.planned + ' planejados (' + R.full + ' completos, ' + R.part + ' parciais)' + (R.attend != null ? ' · ' + r0(R.attend * 100) + '%' : '') + '\n' +
    'Força: ' + R.up + ' exercícios evoluindo, ' + R.same + ' estáveis, ' + R.down + ' caindo' + (R.persistent ? ' (queda persistente: ' + R.drops.join(', ') + ')' : '') + (R.insuf ? ', ' + R.insuf + ' com dados insuficientes' : '') + '\n' +
    'Energia média: ' + r1(R.eAvg) + '/5 · Sono médio: ' + (R.sleepAvg != null ? r1(R.sleepAvg) + ' h' : '—') + '\n' +
    'Alimentação: ' + R.daysLogged + ' de ' + R.nDays + ' dias registrados · proteína média ' + r0(R.protAvg) + ' g\n' +
    'Recuperação adequada: ' + (st.checks.recovery || '?') + ' · Alimentação/hidratação adequadas: ' + (st.checks.nutrition || '?') + ' · Sono/energia/tempo: ' + (st.checks.sleep || '?') + '\n\n' +
    'Sugestão: ' + (st.suggestion || '') + (notes ? '\n\nAnotações: ' + notes : '');
}
PROG.aval = function () {
  const t = today(), c = cycleOf(t < db.profile.startDate ? db.profile.startDate : t);
  let h = '<div class="card"><p class="small">A cada 4 semanas o app junta seus registros e verifica os critérios para manter ou revisar a frequência de treino.</p><div class="kv"><span>Início do programa</span><b>' + fmtD(db.profile.startDate) + '</b></div><div class="kv"><span>Ciclo atual</span><b>' + fmtDs(c.start) + ' a ' + fmtDs(c.end) + '</b></div><div class="kv"><span>Próxima avaliação</span><b>' + fmtD(addDays(c.end, 1)) + '</b></div></div>';
  if (c.n > 0) h += '<button class="btn block" data-act="openReview" data-start="' + esc(addDays(c.start, -28)) + '">Avaliar ciclo anterior (' + fmtDs(addDays(c.start, -28)) + '–' + fmtDs(addDays(c.start, -1)) + ')</button>';
  h += '<button class="btn sec block" style="margin-top:8px" data-act="openReview" data-start="' + esc(c.start) + '">Ver prévia do ciclo atual</button>';
  h += '<h2>Avaliações salvas</h2>' + (db.reviews.length ? '<ul class="list card">' + db.reviews.slice().sort((a, b) => b.start.localeCompare(a.start)).map(r => '<li class="tap" data-act="openSavedReview" data-id="' + esc(r.id) + '"><b>' + fmtDs(r.start) + ' a ' + fmtDs(addDays(r.start, 27)) + '</b><div class="small muted">' + esc(r.suggestion) + '</div></li>').join('') + '</ul>' : '<p class="muted small">Nenhuma ainda.</p>');
  return h;
};

// ================================================================ SAÚDE
VIEWS.health = function () {
  const med = db.medication, t = today();
  const logs = db.medLogs.slice().sort(byDate);
  const last = logs[logs.length - 1];
  let h = '<div class="card"><div class="row between"><h3>Mounjaro (tirzepatida)</h3><button class="btn ghost sm" data-act="editMed">Editar</button></div>' +
    '<p class="tiny muted">O app só registra o que você informa. Ele não recomenda, não calcula e não altera doses. Siga sempre a prescrição do seu médico.</p>' +
    '<div class="kv"><span>Início do tratamento</span><b>' + (med.startDate ? fmtD(med.startDate) : 'não informado') + '</b></div>' +
    '<div class="kv"><span>Dia de aplicação</span><b>' + (med.weekday ? WD_LONG[med.weekday] : 'não definido') + '</b></div>' +
    '<div class="kv"><span>Dose prescrita (informada por você)</span><b>' + (med.doseText ? esc(med.doseText) : '—') + '</b></div>' +
    (last ? '<div class="kv"><span>Última aplicação</span><b>' + fmtDs(last.date) + ' (' + diffDays(last.date, t) + ' dia(s) atrás)</b></div>' : '') +
    '<div class="btns"><button class="btn" data-act="addMedLog">Registrar aplicação</button></div></div>';
  if (last && diffDays(last.date, t) <= 3) h += '<div class="card soft small">Primeiros dias após a aplicação: vale observar e registrar como você está (apetite, enjoo, energia, água).</div>';

  h += '<div class="fab-row"><button class="btn sec" data-act="addSymptom">Registrar sintomas</button><button class="btn sec" data-act="addEnergy">Energia e sono</button></div>';
  const tot = dayTotals(t), g = goalFor(t);
  h += '<div class="card"><div class="row between"><h3>Hidratação hoje</h3><b>' + r0(tot.water) + (g.water ? ' / ' + r0(g.water) : '') + ' ml</b></div>' + (g.water ? bar(tot.water, g.water, 'var(--w)') : '') + '<div class="water-btns" style="margin-top:8px">' + [200, 300, 500].map(ml => '<button class="btn sec sm" data-act="addWater" data-ml="' + esc(ml) + '">+' + ml + '</button>').join('') + '<button class="btn sec sm" data-act="waterCustom">outro</button></div></div>';
  h += alertHtml();

  // histórico recente combinado
  const ev = [];
  db.medLogs.forEach(m => ev.push({ date: m.date, time: m.time, html: '<b>Aplicação</b>' + (m.doseText ? ' · ' + esc(m.doseText) : '') + (m.site ? ' · ' + esc(m.site) : ''), act: 'editMedLog', id: m.id }));
  db.symptomLogs.forEach(s => ev.push({ date: s.date, time: s.time, html: '<b>Sintomas</b> · ' + (symptomSummary(s) || 'nenhum') + (s.appetite ? ' · apetite ' + esc(s.appetite) : ''), act: 'editSymptom', id: s.id }));
  db.energyLogs.forEach(e => ev.push({ date: e.date, time: e.time || '', html: '<b>Energia ' + e.energy + '/5</b>' + (e.sleepHours != null ? ' · sono ' + r1(e.sleepHours) + ' h' : '') + (e.soreness ? ' · dor muscular ' + e.soreness + '/5' : ''), act: 'editEnergy', id: e.id }));
  ev.sort(byDate).reverse();
  h += '<h2>Histórico recente</h2>' + (ev.length ? '<ul class="list card">' + ev.slice(0, 25).map(e => '<li class="tap" data-act="' + esc(e.act) + '" data-id="' + esc(e.id) + '"><span class="small muted">' + fmtDs(e.date) + ' ' + esc(e.time || '') + '</span><div class="small">' + e.html + '</div></li>').join('') + '</ul>' : '<p class="muted small">Nada registrado ainda.</p>');
  h += '<button class="btn block" data-act="doctorReport">Relatório para o médico</button>';
  return h;
};
function symptomSummary(s) {
  return SYMPTOMS.filter(([k]) => s.symptoms && s.symptoms[k] > 0).map(([k, l]) => l.split(' (')[0].split(' /')[0] + ' (' + INTENS[s.symptoms[k]].toLowerCase() + ')').join(', ');
}

function symptomSheet(existing) {
  const s = existing ? JSON.parse(JSON.stringify(existing)) : { id: null, date: today(), time: nowTime(), symptoms: {}, flags: {}, appetite: null, hydration: null, trainingImpact: null, notes: '' };
  openSheet({
    title: 'Sintomas e apetite', s,
    render: function () {
      const s = this.s;
      let h = '<div class="grid2"><div><label>Data</label><input type="date" id="sy-date" value="' + esc(s.date) + '"></div><div><label>Hora</label><input type="time" id="sy-time" value="' + esc(s.time) + '"></div></div>';
      h += SYMPTOMS.map(([k, l]) => '<label>' + l + '</label>' + chipsHtml('sym:' + k, INTENS.map((x, i) => [String(i), x]), String(s.symptoms[k] || 0))).join('');
      h += '<label>Apetite</label>' + chipsHtml('symApp', ['Muito reduzido', 'Reduzido', 'Normal', 'Aumentado'], s.appetite);
      h += '<label>Conseguiu beber água?</label>' + chipsHtml('symHyd', ['Bem', 'Com dificuldade', 'Quase nada'], s.hydration);
      h += '<label>Impacto no treino</label>' + chipsHtml('symTrain', ['Nenhum', 'Leve', 'Treinei mais leve', 'Não treinei'], s.trainingImpact);
      h += '<label>Sinais de alerta</label>' + RED_FLAGS.map(([k, l]) => '<label class="check"><input type="checkbox" id="syf-' + k + '" ' + (s.flags && s.flags[k] ? 'checked' : '') + '> ' + l + '</label>').join('');
      h += '<label>Observações</label><textarea id="sy-notes">' + esc(s.notes) + '</textarea>';
      h += '<div class="btns">' + (s.id ? '<button class="btn danger" data-act="delSymptom">Excluir</button>' : '') + '<button class="btn" data-act="saveSymptom">Salvar</button></div>';
      return h;
    }
  });
}
function energySheet(existing) {
  const e = existing ? Object.assign({}, existing) : { id: null, date: today(), time: nowTime(), energy: null, sleepHours: null, sleepQuality: null, soreness: null, notes: '' };
  openSheet({
    title: 'Energia, sono e recuperação', e,
    render: function () {
      const e = this.e;
      return '<label>Data</label><input type="date" id="en-date" value="' + esc(e.date) + '">' +
        '<label>Energia hoje</label>' + scaleHtml('en_energy', e.energy, 5, ['muito baixa', 'ótima']) +
        '<label>Horas de sono na última noite</label><input id="en-sleep" inputmode="decimal" value="' + esc(e._sleepRaw != null ? e._sleepRaw : fmtNum(e.sleepHours)) + '" placeholder="ex.: 7">' +
        '<label>Qualidade do sono</label>' + scaleHtml('en_sq', e.sleepQuality, 5, ['ruim', 'ótima']) +
        '<label>Dor muscular / cansaço do treino</label>' + scaleHtml('en_sore', e.soreness, 5, ['nenhuma', 'muita']) +
        '<label>Observações</label><textarea id="en-notes">' + esc(e.notes) + '</textarea>' +
        '<div class="btns">' + (e.id ? '<button class="btn danger" data-act="delEnergy">Excluir</button>' : '') + '<button class="btn" data-act="saveEnergy">Salvar</button></div>';
    }
  });
}
function medSheet() {
  const m = db.medication;
  openSheet({
    title: 'Dados do tratamento',
    render: () => '<p class="small muted">Todos os campos são opcionais. Registre apenas o que foi definido pelo seu médico.</p>' +
      '<label>Data de início</label><input type="date" id="md-start" value="' + esc(m.startDate) + '">' +
      '<label>Dia de aplicação</label><select id="md-wd"><option value="">não definido</option>' + [1, 2, 3, 4, 5, 6, 7].map(i => '<option value="' + esc(i) + '" ' + (String(m.weekday) === String(i) ? 'selected' : '') + '>' + WD_LONG[i] + '</option>').join('') + '</select>' +
      '<label>Dose prescrita (como está na receita)</label><input id="md-dose" value="' + esc(m.doseText) + '" placeholder="copie da prescrição médica">' +
      '<label>Observações / orientações do médico</label><textarea id="md-notes">' + esc(m.notes) + '</textarea>' +
      '<button class="btn block" data-act="saveMed" style="margin-top:12px">Salvar</button>'
  });
}
function medLogSheet(existing) {
  const l = existing || { id: null, date: today(), time: nowTime(), doseText: db.medication.doseText, site: '', notes: '' };
  openSheet({
    title: 'Registrar aplicação',
    render: () => '<p class="tiny muted">Registre a dose exatamente como prescrita pelo médico. O app não sugere doses.</p><div class="grid2"><div><label>Data</label><input type="date" id="ml-date" value="' + esc(l.date) + '"></div><div><label>Hora</label><input type="time" id="ml-time" value="' + esc(l.time) + '"></div></div>' +
      '<label>Dose aplicada (conforme prescrição)</label><input id="ml-dose" value="' + esc(l.doseText) + '">' +
      '<label>Local</label><select id="ml-site">' + ['', 'Abdômen', 'Coxa', 'Braço'].map(s => '<option ' + (l.site === s ? 'selected' : '') + '>' + s + '</option>').join('') + '</select>' +
      '<label>Observações</label><textarea id="ml-notes">' + esc(l.notes) + '</textarea>' +
      '<div class="btns">' + (l.id ? '<button class="btn danger" data-act="delMedLog" data-id="' + esc(l.id) + '">Excluir</button>' : '') + '<button class="btn" data-act="saveMedLog" data-id="' + esc(l.id || '') + '">Salvar</button></div>'
  });
}
function doctorReportText(days) {
  const t = today(), from = days ? addDays(t, -(days - 1)) : (db.medication.startDate || db.profile.startDate);
  const inR = x => x.date >= from && x.date <= t;
  const m = db.medication, p = db.profile;
  let s = 'RELATÓRIO DE ACOMPANHAMENTO — ' + APP_NAME + '\nRegistros feitos pelo próprio paciente.\nPeríodo: ' + fmtD(from) + ' a ' + fmtD(t) + '\n\n';
  s += 'Paciente: ' + (p.name || '—') + ' · ' + p.age + ' anos · ' + p.sex + ' · ' + p.heightCm + ' cm\n';
  s += 'Tratamento: Mounjaro (tirzepatida)\n  Início: ' + (m.startDate ? fmtD(m.startDate) : 'não informado') + '\n  Dia de aplicação: ' + (m.weekday ? WD_LONG[m.weekday] : 'não definido') + '\n  Dose prescrita (informada): ' + (m.doseText || '—') + '\n';
  const ml = db.medLogs.filter(inR).sort(byDate);
  s += '\nAPLICAÇÕES (' + ml.length + ')\n' + (ml.map(x => '  ' + fmtD(x.date) + ' ' + (x.time || '') + ' · ' + (x.doseText || 'dose não informada') + (x.site ? ' · ' + x.site : '') + (x.notes ? ' · ' + x.notes : '')).join('\n') || '  nenhuma registrada') + '\n';
  const sl = db.symptomLogs.filter(inR).sort(byDate);
  s += '\nSINTOMAS (' + sl.length + ' registros)\n';
  SYMPTOMS.forEach(([k, l]) => { const hits = sl.filter(x => x.symptoms && x.symptoms[k] > 0); if (hits.length) s += '  ' + l + ': ' + hits.length + ' registro(s), máx. ' + INTENS[Math.max(...hits.map(x => x.symptoms[k]))].toLowerCase() + ' (' + hits.map(x => fmtDs(x.date)).join(', ') + ')\n'; });
  const fl = sl.filter(x => x.flags && Object.values(x.flags).some(Boolean));
  if (fl.length) s += '  SINAIS DE ALERTA: ' + fl.map(x => fmtDs(x.date) + ' — ' + RED_FLAGS.filter(([k]) => x.flags[k]).map(f => f[1]).join(', ')).join('; ') + '\n';
  const app = sl.filter(x => x.appetite); if (app.length) s += '  Apetite: ' + app.map(x => fmtDs(x.date) + ' ' + x.appetite.toLowerCase()).join(', ') + '\n';
  const hy = sl.filter(x => x.hydration); if (hy.length) s += '  Ingestão de água: ' + hy.map(x => fmtDs(x.date) + ' ' + x.hydration.toLowerCase()).join(', ') + '\n';
  sl.filter(x => x.notes).forEach(x => { s += '  Obs. ' + fmtDs(x.date) + ': ' + x.notes + '\n'; });
  const el = db.energyLogs.filter(inR);
  s += '\nENERGIA E SONO\n  Energia média: ' + (el.length ? r1(sum(el, x => x.energy) / el.length) + '/5 (' + el.length + ' registros)' : '—') + '\n';
  const sh = el.filter(x => x.sleepHours != null); if (sh.length) s += '  Sono médio: ' + r1(sum(sh, x => x.sleepHours) / sh.length) + ' h\n';
  let wd2 = 0, wsum = 0, pd = 0, psum = 0;
  for (let d = from; d <= t; d = addDays(d, 1)) { const tt = dayTotals(d); if (tt.water) { wd2++; wsum += tt.water; } if (tt.nMeals) { pd++; psum += tt.p; } }
  s += '\nALIMENTAÇÃO E ÁGUA (conforme registros)\n  Água: média ' + (wd2 ? r0(wsum / wd2) + ' ml/dia em ' + wd2 + ' dias com registro' : 'sem registros') + '\n  Proteína: média ' + (pd ? r0(psum / pd) + ' g/dia em ' + pd + ' dias com registro' : 'sem registros') + '\n';
  const w = db.weights.filter(inR).sort(byDate);
  s += '\nPESO\n  ' + (w.length ? w.map(x => fmtDs(x.date) + ': ' + r1(x.kg) + ' kg').join(' · ') : 'sem registros no período') + '\n  Peso inicial de referência: ' + r1(p.startWeight) + ' kg (' + fmtD(p.startDate) + ')\n';
  const ss = db.sessions.filter(inR);
  s += '\nTREINOS\n  ' + ss.filter(attended).length + ' sessões feitas (' + ss.filter(x => x.light).length + ' em versão leve), ' + ss.filter(x => x.status === 'adiada').length + ' adiadas, ' + ss.filter(x => x.status === 'nao_realizada').length + ' não realizadas\n';
  return s;
}

// ================================================================ CONFIGURAÇÕES
VIEWS.settings = function () {
  const p = db.profile, g = goalFor(today());
  const gv = k => g[k] == null ? '' : g[k];
  let h = '<div class="card"><h3>Perfil</h3><div class="grid2">' +
    '<div><label>Nome (opcional)</label><input id="pf-name" value="' + esc(p.name) + '"></div><div><label>Idade</label><input id="pf-age" inputmode="numeric" value="' + esc(p.age) + '"></div>' +
    '<div><label>Sexo biológico</label><select id="pf-sex">' + ['Masculino', 'Feminino'].map(s => '<option ' + (p.sex === s ? 'selected' : '') + '>' + s + '</option>').join('') + '</select></div><div><label>Altura (cm)</label><input id="pf-h" inputmode="decimal" value="' + esc(p.heightCm) + '"></div>' +
    '<div><label>Peso inicial (kg)</label><input id="pf-sw" inputmode="decimal" value="' + esc(p.startWeight) + '"></div><div><label>Peso desejado (kg)</label><input id="pf-tw" inputmode="decimal" value="' + esc(p.targetWeight) + '"></div>' +
    '<div><label>Início do programa</label><input type="date" id="pf-sd" value="' + esc(p.startDate) + '"></div></div><button class="btn block" style="margin-top:10px" data-act="saveProfile">Salvar perfil</button></div>';

  h += '<div class="card"><h3>Metas nutricionais diárias</h3><p class="small muted">Defina os valores com seu nutricionista ou médico. O app não sugere números. Deixe em branco o que não quiser acompanhar. Alterações valem a partir de hoje; o histórico anterior é mantido.</p><div class="grid2">' +
    '<div><label>Calorias (kcal)</label><input id="gl-k" inputmode="decimal" value="' + esc(gv('kcal')) + '"></div><div><label>Proteína (g)</label><input id="gl-p" inputmode="decimal" value="' + esc(gv('protein')) + '"></div>' +
    '<div><label>Carboidratos (g)</label><input id="gl-c" inputmode="decimal" value="' + esc(gv('carbs')) + '"></div><div><label>Gorduras (g)</label><input id="gl-f" inputmode="decimal" value="' + esc(gv('fat')) + '"></div>' +
    '<div><label>Água (ml)</label><input id="gl-w" inputmode="decimal" value="' + esc(gv('water')) + '"></div></div><button class="btn block" style="margin-top:10px" data-act="saveGoals">Salvar metas</button>' +
    (db.nutritionGoals.length ? '<details style="margin-top:8px"><summary class="small">Histórico de metas</summary><table><tr><th>Desde</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>Água</th></tr>' + db.nutritionGoals.slice().sort((a, b) => b.from.localeCompare(a.from)).map(x => '<tr><td>' + fmtDs(x.from) + '</td><td>' + r0(x.kcal) + '</td><td>' + r0(x.protein) + '</td><td>' + r0(x.carbs) + '</td><td>' + r0(x.fat) + '</td><td>' + r0(x.water) + '</td></tr>').join('') + '</table></details>' : '') + '</div>';

  h += '<div class="card"><h3>Dias de treino</h3><p class="small muted">Escolha qual treino fica em cada dia. Horários são sempre livres.</p>' +
    [1, 2, 3, 4, 5, 6, 7].map(i => '<div class="row between" style="margin:6px 0"><span>' + WD_LONG[i] + '</span><select style="width:55%" data-change="schedule" data-wd="' + esc(i) + '"><option value="">descanso</option>' + db.plans.map(p => '<option value="' + esc(p.id) + '" ' + (db.schedule[i] === p.id ? 'selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>').join('') + '</div>';

  h += '<div class="card"><h3>Planos e exercícios</h3><ul class="list">' + db.plans.map(p => '<li class="tap row between" data-act="editPlan" data-id="' + esc(p.id) + '"><span><b>' + esc(p.name) + '</b> <span class="small muted">' + p.exercises.length + ' exercícios</span></span><span>›</span></li>').join('') + '</ul><button class="btn sec block" data-act="newPlan">+ Novo plano</button></div>';

  h += '<div class="card"><h3>Alimentos</h3><p class="small muted">' + db.foods.length + ' alimentos cadastrados. Os iniciais têm valores aproximados da tabela TACO — confira e ajuste se precisar.</p><div class="btns"><button class="btn sec" data-act="foodsList">Ver e editar</button><button class="btn ghost" data-act="newFood">+ Novo</button></div></div>';

  { const st = db.settings, prog = st.restMode === 'prog', base = st.restBase != null ? st.restBase : 45, step = st.restStep != null ? st.restStep : 15;
    h += '<div class="card"><h3>Descanso entre séries</h3><label class="check"><input type="checkbox" id="rs-on" data-change="restOn" ' + (st.restEnabled ? 'checked' : '') + '> Mostrar cronômetro ao marcar uma série</label>' +
      '<label for="rs-mode">Tipo</label><select id="rs-mode" data-change="restMode"><option value="fixo"' + (prog ? '' : ' selected') + '>Fixo (o mesmo em todas as séries)</option><option value="prog"' + (prog ? ' selected' : '') + '>Progressivo (aumenta a cada série)</option></select>' +
      (prog ? '<div class="grid2"><div><label for="rs-base">Após a 1ª série</label><select id="rs-base" data-change="restBase">' + [30, 45, 60, 75, 90, 120].map(v => '<option value="' + v + '"' + (base === v ? ' selected' : '') + '>' + fmtSecs(v) + '</option>').join('') + '</select></div><div><label for="rs-step">Acréscimo por série</label><select id="rs-step" data-change="restStep">' + [5, 10, 15, 20, 30, 45, 60].map(v => '<option value="' + v + '"' + (step === v ? ' selected' : '') + '>+' + fmtSecs(v) + '</option>').join('') + '</select></div></div>' +
        '<p class="small muted">' + [0, 1, 2, 3].map(i => 'Série ' + (i + 1) + ': ' + fmtSecs(restSecondsFor(i))).join(' · ') + '</p>'
        : '<label for="rs-sec">Tempo</label><select id="rs-sec" data-change="restSec">' + [45, 60, 75, 90, 120, 150, 180].map(v => '<option value="' + v + '"' + ((st.restSeconds || 90) === v ? ' selected' : '') + '>' + fmtSecs(v) + '</option>').join('') + '</select>') +
      (B && B.pipSupported && B.pipSupported() ? '<label class="check"><input type="checkbox" data-change="pipOn" ' + (st.pipEnabled !== false ? 'checked' : '') + '> Janela flutuante ao sair do app durante o treino (cronômetro e exercício atual por cima dos outros apps)</label>' : '') +
      '<p class="tiny muted">Durante o treino, o app mostra uma notificação com o exercício atual e a contagem do descanso, e avisa com vibração quando o descanso acaba, mesmo com a tela apagada.</p></div>'; }

  h += '<div class="card"><h3>Lembretes</h3><p class="small muted">Opcionais e desligados por padrão. Funcionam sem internet.</p><ul class="list">' + db.settings.reminders.map((r, i) => '<li class="row between"><span class="tap grow" data-act="editReminder" data-i="' + esc(i) + '"><b>' + esc(r.title) + '</b><div class="small muted">' + pad(r.hour) + ':' + pad(r.minute) + ' · ' + (r.days.length ? r.days.map(d => WD_SHORT[d]).join(', ') : 'todos os dias') + '</div></span><input type="checkbox" data-change="remToggle" data-i="' + esc(i) + '" ' + (r.enabled ? 'checked' : '') + '></li>').join('') + '</ul></div>';

  h += '<div class="card"><h3>Backup e restauração</h3><p class="small muted">Seus dados ficam só neste celular. O app guarda uma cópia automática por dia (no celular, últimos 14 dias). Para não perder nada se trocar de celular ou desinstalar o app, exporte um backup de vez em quando e guarde em outro lugar (Google Drive, e-mail, computador).</p>' +
    '<label class="check"><input type="checkbox" id="bk-photos" checked> Incluir fotos das refeições</label>' +
    '<div class="btns"><button class="btn" data-act="exportBackup">Exportar backup</button><button class="btn sec" data-act="importBackup">Importar backup</button></div>' +
    '<button class="btn ghost block" style="margin-top:8px" data-act="localBackups">Cópias automáticas</button><button class="btn ghost block" style="margin-top:8px" data-act="checkPhotos">Verificar fotos guardadas</button></div>';

  h += '<div class="card"><h3>Aparência</h3><label>Tema</label><select data-change="theme">' + [['auto', 'Automático (igual ao celular)'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => '<option value="' + v + '" ' + ((db.settings.theme || 'auto') === v ? 'selected' : '') + '>' + l + '</option>').join('') + '</select><p class="tiny muted">O tamanho do texto segue a configuração de fonte do celular.</p></div>';
  h += '<div class="card small muted"><b>Sobre</b><p>' + APP_NAME + ' 1.3.1 (antes Healthym / “Treino &amp; Saúde”) — app pessoal, gratuito, sem anúncios e sem login. Funciona sem internet e não envia dados para lugar nenhum. Não substitui acompanhamento médico ou nutricional. Nunca recomenda doses de medicamento.</p></div>';
  return h;
};

function planSheet(plan) {
  const p = plan ? JSON.parse(JSON.stringify(plan)) : { id: null, name: 'Novo treino', warmup: '5 minutos', notes: '', exercises: [] };
  openSheet({
    title: plan ? 'Editar plano' : 'Novo plano', p,
    render: function () {
      const p = this.p;
      return '<label>Nome</label><input id="pl-name" value="' + esc(p.name) + '"><label>Aquecimento</label><input id="pl-warm" value="' + esc(p.warmup) + '"><label>Orientações</label><textarea id="pl-notes">' + esc(p.notes) + '</textarea>' +
        '<h2>Exercícios</h2>' + p.exercises.map((e, i) => '<div class="card"><input id="pe-' + i + '-name" data-pe="' + i + ':name" value="' + esc(e.name) + '" placeholder="Nome do exercício" aria-label="Nome do exercício ' + (i + 1) + '"><div class="row" style="margin-top:6px"><div class="grow"><label>Séries</label><input id="pe-' + i + '-sets" data-pe="' + i + ':sets" inputmode="numeric" value="' + esc(e.sets) + '"></div><div class="grow"><label>Repetições</label><input id="pe-' + i + '-reps" data-pe="' + i + ':reps" value="' + esc(e.reps) + '"></div></div>' +
          '<div class="row" style="margin-top:6px"><button class="btn ghost sm" data-act="peMove" data-i="' + esc(i) + '" data-d="-1">↑</button><button class="btn ghost sm" data-act="peMove" data-i="' + esc(i) + '" data-d="1">↓</button><span class="grow"></span><button class="btn danger sm" data-act="peDel" data-i="' + esc(i) + '">Remover</button></div></div>').join('') +
        '<button class="btn sec block" data-act="peAdd">+ Exercício</button><p class="tiny muted">Mudar o plano não altera o histórico das sessões já registradas.</p>' +
        '<div class="btns">' + (p.id && db.plans.length > 1 ? '<button class="btn danger" data-act="delPlan">Excluir plano</button>' : '') + '<button class="btn" data-act="savePlan">Salvar plano</button></div>';
    }
  });
}
function readPlanSheet() {
  const p = sheet.p;
  p.name = val('pl-name'); p.warmup = val('pl-warm'); p.notes = val('pl-notes');
  $$('[data-pe]').forEach(el => { const [i, k] = el.dataset.pe.split(':'); p.exercises[i][k] = el.value.trim(); });
}
function reminderSheet(i) {
  const r = JSON.parse(JSON.stringify(db.settings.reminders[i]));
  openSheet({
    title: 'Lembrete', r, i,
    render: function () {
      const r = this.r;
      return '<label>Título</label><input id="rm-title" value="' + esc(r.title) + '"><label>Texto</label><input id="rm-text" value="' + esc(r.text) + '">' +
        '<label>Horário</label><input type="time" id="rm-time" value="' + esc(pad(r.hour) + ':' + pad(r.minute)) + '">' +
        '<label>Dias (nenhum marcado = todos os dias)</label><div class="chips">' + [1, 2, 3, 4, 5, 6, 7].map(d => '<button type="button" class="chip ' + (r.days.includes(d) ? 'on' : '') + '" data-act="remDay" data-d="' + esc(d) + '">' + WD_SHORT[d] + '</button>').join('') + '</div>' +
        (r.id === 'treino' ? '<button class="btn ghost sm" style="margin-top:6px" data-act="remTrainDays">Usar meus dias de treino</button>' : '') +
        (r.id === 'aplicacao' && db.medication.weekday ? '<button class="btn ghost sm" style="margin-top:6px" data-act="remMedDay">Usar o dia de aplicação</button>' : '') +
        '<label class="check"><input type="checkbox" id="rm-on" ' + (r.enabled ? 'checked' : '') + '> Ativado</label><button class="btn block" data-act="saveReminder">Salvar</button>';
    }
  });
}
// Guarda a grade de dias a partir de hoje; dias anteriores continuam com a grade antiga.
function recordSchedule() {
  const t = today();
  db.scheduleHistory = (db.scheduleHistory || []).filter(h => h.from !== t);
  db.scheduleHistory.push({ from: t, schedule: JSON.parse(JSON.stringify(db.schedule)) });
}
function syncReminders() { if (B && B.setReminders) B.setReminders(JSON.stringify(db.settings.reminders)); }

function onboarding() {
  openSheet({
    title: 'Bem-vindo!',
    render: () => '<p>Este é o seu app pessoal de treino e saúde. Tudo fica guardado <b>só no seu celular</b>, funciona sem internet e não tem anúncios.</p>' +
      '<div class="card soft small">Já deixei preenchido com o seu ponto de partida: 22 anos, 173 cm, 115 kg, meta de 90 kg, Full Body A/B/C às segundas, quartas e sextas, início em 09/11/2026 e primeira avaliação em 07/12/2026. Você pode mudar tudo em Configurações.</div>' +
      '<label class="check"><input type="checkbox" id="ob-hist" checked> Importar as refeições de 09/11/2026 descritas no planejamento (quantidades do almoço ficam em branco)</label>' +
      '<label class="check"><input type="checkbox" id="ob-w" checked> Registrar 115 kg como peso de 09/11/2026</label>' +
      '<p class="small muted">As metas nutricionais começam em branco: defina-as com seu nutricionista ou médico em Configurações.</p>' +
      '<p class="small muted">Este app não substitui acompanhamento médico ou nutricional e nunca recomenda doses de medicamento.</p>' +
      '<button class="btn block" data-act="obDone">Começar</button>'
  });
}
function seedHistory() {
  const F = n => db.foods.find(f => f.name === n);
  const it = (name, amount, unitName, estimated) => {
    const f = F(name); draft = { _food: f };
    const q = qtyCompute(amount, unitName); const c = itemCalc(f, q.grams);
    return { foodId: f.id, name: f.name, amount: q.amount, unitName: q.unitName, grams: q.grams, amountLabel: q.label, estimated: !!estimated, ...c };
  };
  const none = name => { const f = F(name); return { foodId: f.id, name: f.name, amount: null, unitName: f.base, grams: null, amountLabel: '', estimated: false, kcal: null, p: null, c: null, f: null }; };
  const d = '2026-11-09';
  db.meals.push({ id: uid(), date: d, time: '07:00', type: 'Café da manhã', photoIds: [],
    notes: 'Do planejamento: ~300 ml de café com leite (mais leite que café) e 2½ colheres de sopa de açúcar. A divisão leite/café, o tipo de leite e o peso das colheres são estimativas — ajuste se souber.',
    items: [it('Pão francês', 1, 'unidade (~50 g)'), it('Ovo frito', 1, 'unidade (~50 g)'), it('Leite de vaca integral', 180, 'ml', true), it('Café coado (sem açúcar)', 120, 'ml', true), it('Açúcar refinado', 2.5, 'colher de sopa (~12 g)', true)] });
  db.meals.push({ id: uid(), date: d, time: '09:30', type: 'Lanche da manhã', photoIds: [], notes: 'Menos de meia xícara de café com duas colheres pequenas e rasas de açúcar (estimativa).',
    items: [it('Café coado (sem açúcar)', 70, 'ml', true), it('Açúcar refinado', 2, 'colher de chá (~4 g)', true)] });
  db.meals.push({ id: uid(), date: d, time: '12:30', type: 'Almoço', photoIds: [], notes: 'Quantidades não confirmadas. Toque em cada item para informar, se quiser.',
    items: [none('Arroz branco cozido'), none('Carne de porco (lombo) assada'), none('Feijão tropeiro'), none('Batata palha / chips (industrializada)'), none('Cenoura cozida'), none('Batata inglesa cozida')] });
  draft = null;
}

// ================================================================ ações (cliques)
const A = {};
A.closeSheet = () => closeSheet();
A.confirmOk = () => { const f = sheet.ok; confirmBox._ok = true; closeSheet(); confirmBox._ok = false; f(); };
A.tab = el => go(el.dataset.tab);
A.goSettings = () => go('settings');
A.scale = el => {
  const n = el.dataset.name, v = Number(el.dataset.v);
  if (n.startsWith('ci_')) { readCheckinFlags(); checkin[n.slice(3)] = v; }
  else if (n === 'en_energy') sheet.e.energy = v; else if (n === 'en_sq') sheet.e.sleepQuality = v; else if (n === 'en_sore') sheet.e.soreness = v;
  if (n.startsWith('en_')) { sheet.e._sleepRaw = val('en-sleep'); sheet.e.notes = val('en-notes'); sheet.e.date = val('en-date'); }
  refreshSheet();
};
A.chip = el => {
  const n = el.dataset.name, v = el.dataset.v;
  if (n === 'mealType') { syncMainFields(); draft.type = v; }
  else if (n.startsWith('ci_')) { readCheckinFlags(); checkin[n.slice(3)] = v; }
  else if (n.startsWith('sym')) {
    const s = sheet.s; readSymptomFields(s);
    if (n.startsWith('sym:')) s.symptoms[n.slice(4)] = Number(v);
    else if (n === 'symApp') s.appetite = v; else if (n === 'symHyd') s.hydration = v; else if (n === 'symTrain') s.trainingImpact = v;
  }
  else if (n === 'finSt') sheet.stSel = v;
  else if (n === 'skipReason') { sheet.note = val('sk-note') || sheet.note; sheet.reason = v; }
  else if (n === 'skipDayReason') { sheet.note = val('sd-note') || sheet.note; sheet.reason = v; }
  else if (n.startsWith('rv')) { sheet.st.checks[{ rvRecovery: 'recovery', rvNutrition: 'nutrition', rvSleep: 'sleep' }[n]] = v; sheet.st.notesTmp = val('rv-notes'); }
  refreshSheet();
  if (n.startsWith('rv') && sheet.st.notesTmp != null) $('#rv-notes').value = sheet.st.notesTmp;
};
// água
function addWater(ml) { db.water.push({ id: uid(), date: ui.tab === 'food' ? ui.foodDate : today(), time: nowTime(), ml }); persist(); render(); toast('+' + ml + ' ml de água'); }
A.addWater = el => addWater(Number(el.dataset.ml));
A.waterCustom = () => openSheet({ title: 'Água', render: () => '<label>Quantidade (ml)</label><input id="wc" inputmode="numeric" placeholder="ex.: 250"><button class="btn block" style="margin-top:10px" data-act="waterCustomOk">Adicionar</button>', mounted: el => $('#wc', el).focus() });
A.waterCustomOk = () => { const ml = form(() => field('wc', 'waterMl', { required: true })); if (ml == null) return; closeSheet(); addWater(ml); };
A.delWater = el => { db.water = db.water.filter(w => w.id !== el.dataset.id); persist(); render(); };
// alimentação
A.foodDate = el => { ui.foodDate = addDays(ui.foodDate, Number(el.dataset.n)); render(); };
A.newMeal = () => { if (ui.tab !== 'food') { ui.foodDate = today(); } mealEditor(null); };
A.editMeal = el => mealEditor(db.meals.find(m => m.id === el.dataset.id));
A.copyMeal = () => {
  const all = db.meals.slice().sort(byDate).reverse();
  const recent = all.filter(m => m.favorite).concat(all.filter(m => !m.favorite).slice(0, 20));
  openSheet({ title: 'Repetir refeição', render: () => recent.length ? '<p class="small muted">Escolha uma refeição para copiar para ' + fmtDs(ui.foodDate) + '. Você pode ajustar antes de salvar.</p><ul class="list">' + recent.map(m => '<li class="tap" role="button" tabindex="0" data-act="copyMealPick" data-id="' + esc(m.id) + '"><b>' + (m.favorite ? '★ ' : '') + fmtDs(m.date) + ' ' + esc(m.time) + ' · ' + esc(m.type) + '</b><div class="small muted">' + m.items.map(i => esc(i.name)).join(', ') + '</div></li>').join('') + '</ul>' : '<p class="muted">Nenhuma refeição registrada ainda.</p>' });
};
A.copyMealPick = el => {
  const m = JSON.parse(JSON.stringify(db.meals.find(x => x.id === el.dataset.id)));
  closeSheet(); m.id = null; m.date = ui.foodDate; m.time = ui.foodDate === today() ? nowTime() : m.time; m.photoIds = []; m.notes = ''; m.favorite = false;
  mealEditor(null); Object.assign(draft, { date: m.date, time: m.time, type: m.type, items: m.items }); refreshSheet(true);
};
A.mealPick = () => { syncMainFields(); draft._mode = 'pick'; draft._editIdx = null; refreshSheet(true); };
A.mealManual = () => { syncMainFields(); draft._mode = 'manual'; draft._editIdx = null; refreshSheet(true); };
A.mealBack = () => { draft._mode = draft._mode === 'newfood' ? 'pick' : 'main'; draft._editIdx = draft._mode === 'main' ? null : draft._editIdx; refreshSheet(true); };
A.mealNewFood = () => { draft._mode = 'newfood'; refreshSheet(true); };
A.mealNewFoodSave = () => { const f = readFoodForm(null); if (!f) return; persist(); draft._food = f; draft._mode = 'qty'; draft._editIdx = null; refreshSheet(true); };
A.pickFood = el => { draft._food = db.foods.find(f => f.id === el.dataset.id); draft._mode = 'qty'; refreshSheet(true); };
A.qtySave = () => {
  clearErrs();
  const q = qtyCompute();
  if (q.invalid) { fieldErr('q-amt', q.msg); return; }
  const f = draft._food, c = itemCalc(f, q.grams);
  const item = { foodId: f.id, name: f.name, amount: q.amount, unitName: q.unitName, grams: q.grams, amountLabel: q.label, estimated: checked('q-est'), ...c };
  if (draft._editIdx != null) draft.items[draft._editIdx] = item; else draft.items.push(item);
  draft._mode = 'main'; draft._editIdx = null; draft._q = ''; refreshSheet(true);
};
A.manualSave = () => {
  const v = form(() => {
    const name = val('mi-name'); if (!name) { fieldErr('mi-name', 'Informe o nome'); throw new FieldError(); }
    return { name, amountLabel: val('mi-amt'), estimated: checked('mi-est'), kcal: field('mi-k', 'kcalItem'), p: field('mi-p', 'macroItem'), c: field('mi-c', 'macroItem'), f: field('mi-f', 'macroItem') };
  });
  if (!v) return;
  const item = H.manualItem(v);
  if (draft._editIdx != null) draft.items[draft._editIdx] = item; else draft.items.push(item);
  draft._mode = 'main'; draft._editIdx = null; refreshSheet(true);
};
A.editItem = el => {
  syncMainFields(); const i = Number(el.dataset.i), it = draft.items[i];
  draft._editIdx = i;
  const f = it.foodId && db.foods.find(x => x.id === it.foodId);
  if (f) { draft._food = f; draft._mode = 'qty'; } else draft._mode = 'manual';
  refreshSheet(true);
};
A.rmItem = el => { syncMainFields(); draft.items.splice(Number(el.dataset.i), 1); refreshSheet(); };
A.photo = el => {
  syncMainFields();
  if (B) { B.pickPhoto(el.dataset.src); return; }
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; if (el.dataset.src === 'camera') inp.capture = 'environment';
  inp.onchange = () => {
    const file = inp.files[0]; if (!file) return;
    const img = new Image(); img.onload = () => {
      const s = Math.min(1, 1024 / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = img.width * s; cv.height = img.height * s;
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); const id = 'p' + Date.now();
      if (putPhoto(id, cv.toDataURL('image/jpeg', 0.7))) window.onPhoto(id); else toast('Não foi possível guardar a foto (espaço cheio?)');
    }; img.src = URL.createObjectURL(file);
  };
  inp.click();
};
// Foto recebida: só entra numa refeição aberta; sem refeição aberta, é apagada (não fica foto órfã).
window.onPhoto = id => {
  id = String(id || '');
  if (!PHOTO_ID.test(id)) return;
  if (draft && sheet && sheet.isMeal) { draft.photoIds.push(id); draft._newPhotos.push(id); refreshSheet(); }
  else delPhoto(id);
};
A.rmPhoto = el => {
  syncMainFields(); const id = el.dataset.id;
  draft.photoIds = draft.photoIds.filter(p => p !== id);
  if (draft._newPhotos.includes(id)) { draft._newPhotos = draft._newPhotos.filter(p => p !== id); delPhoto(id); }
  else draft._removedPhotos.push(id); // original: só apaga depois de salvar com sucesso
  refreshSheet();
};
const photoInUse = (id, exceptMealId) => db.meals.some(m => m.id !== exceptMealId && (m.photoIds || []).includes(id));
A.saveMeal = () => {
  syncMainFields();
  const ok = form(() => {
    dateField('m-date', { required: true, notFuture: true });
    const t = val('m-time'); if (t && !H.isTime(t)) { fieldErr('m-time', 'Horário inválido'); throw new FieldError(); }
    return true;
  });
  if (!ok) return;
  const d = draft;
  if (!d.items.length && !d.photoIds.length && !d.notes) return toast('Adicione pelo menos um alimento, foto ou observação');
  const old = d.id ? db.meals.find(x => x.id === d.id) : null;
  const m = Object.assign({}, old || {}, { id: d.id || uid(), date: d.date, time: d.time, type: d.type, items: d.items, notes: d.notes, photoIds: d.photoIds.slice(), favorite: !!d.favorite });
  if (!commit(() => { const i = db.meals.findIndex(x => x.id === m.id); if (i >= 0) db.meals[i] = m; else db.meals.push(m); })) {
    return toast('Não foi possível salvar. A refeição continua aberta: tente de novo.');
  }
  d._saved = true;
  d._removedPhotos.forEach(id => { if (!photoInUse(id)) delPhoto(id); });
  ui.foodDate = m.date; closeSheet(); render(); toast('Refeição salva');
};
A.delMeal = () => {
  const id = draft.id;
  confirmBox('Excluir esta refeição?', 'Excluir', () => {
    const m = db.meals.find(x => x.id === id); if (!m) return;
    const photos = (m.photoIds || []).slice();
    if (commit(() => { db.meals = db.meals.filter(x => x.id !== id); })) { photos.forEach(pid => { if (!photoInUse(pid)) delPhoto(pid); }); toast('Refeição excluída'); }
    else toast('Não foi possível excluir. Nada foi alterado.');
    render();
  }, true);
};
// treino
A.week = el => { ui.weekOf = addDays(ui.weekOf, Number(el.dataset.n)); render(); };
A.startCheckin = el => startCheckin(el.dataset.plan, el.dataset.date, el.dataset.makeup || null);
A.pickPlan = el => openSheet({ title: 'Qual treino?', render: () => '<div class="grid3">' + db.plans.map(p => '<button class="btn sec" data-act="startCheckin" data-plan="' + esc(p.id) + '" data-date="' + esc(el.dataset.date) + '">' + esc(p.name) + '</button>').join('') + '</div>' });
A.checkinNext = () => checkinNext();
A.checkinLight = () => createSession(true);
A.checkinNormal = () => createSession(false);
// Marca um dia sem treino (adiado / não realizado) sem criar registros repetidos.
function markNoTraining(date, planId, status, notes) {
  if (sessionsOn(date).some(s => attended(s) || s.status === 'em_andamento')) return false;
  const ex = sessionsOn(date).find(s => s.status === 'adiada' || s.status === 'nao_realizada');
  if (ex) { ex.status = status; if (notes) ex.notes = notes; }
  else db.sessions.push({ id: uid(), date, planId, planName: planName(planId), status, light: false, exercises: [], notes: notes || '', startedAt: new Date().toISOString() });
  return true;
}
A.checkinPostpone = () => {
  const d = checkin.makeupFor || checkin.date;
  markNoTraining(d, checkin.makeupFor ? (plannedFor(d) || checkin.planId) : checkin.planId, 'adiada', 'Adiado após check-in (' + checkinSummary() + ')');
  persist(); closeSheet(); render(); toast('Treino adiado. Descanse e cuide-se.');
};
A.checkinSymptom = () => { closeSheet(); symptomSheet(null); };
A.openSession = el => { ui.sessionId = el.dataset.id; go('session'); };
A.toggleSet = el => {
  const s = db.sessions.find(x => x.id === ui.sessionId), st = s.exercises[el.dataset.e].sets[el.dataset.s];
  st.done = !st.done;
  if (st.done && (st.reps === '' || st.reps == null)) { const m = String(s.exercises[el.dataset.e].targetReps).match(/\d+/); st.reps = m ? m[0] : ''; }
  const e = s.exercises[el.dataset.e];
  if (st.done && exState(e) === 'done' && ui.focusEx && ui.focusEx.i === Number(el.dataset.e)) ui.focusEx = null;
  persist(); render();
  if (st.done) startRest(Number(el.dataset.s), nowText(s)); else workoutSync();
};
const curSession = () => db.sessions.find(x => x.id === ui.sessionId);
A.exFocus = el => { const s = curSession(); ui.focusEx = { sid: s.id, i: Number(el.dataset.e) }; render(); window.scrollTo(0, 0); };
A.exFocusNext = () => { ui.focusEx = null; render(); window.scrollTo(0, 0); };
// "Já feito": marca as séries que faltam (as repetições vazias recebem o alvo, como ao tocar no ✓ de cada série)
A.exDone = el => {
  const s = curSession(), e = s.exercises[el.dataset.e];
  const m = String(e.targetReps).match(/\d+/);
  e.sets.forEach(st => { if (!st.done) { st.done = true; if (st.reps === '' || st.reps == null) st.reps = m ? m[0] : ''; } });
  if (ui.focusEx && ui.focusEx.i === Number(el.dataset.e)) ui.focusEx = null;
  persist(); render(); window.scrollTo(0, 0); toast(e.name + ': feito');
};
A.exSkip = el => {
  const s = curSession(), ei = Number(el.dataset.e), e = s.exercises[ei];
  openSheet({ title: 'Pular: ' + e.name, ei, reason: null, note: '', render: function () {
    return '<label>Motivo</label>' + chipsHtml('skipReason', Object.keys(SKIP_REASONS).map(k => [k, SKIP_REASONS[k]]), this.reason) +
      (this.reason === 'outro' ? '<label for="sk-note">Qual o motivo?</label><input id="sk-note" maxlength="120" value="' + esc(this.note) + '" placeholder="Escreva o motivo">' : '') +
      '<p class="tiny muted">O exercício vai para “Pulados”. Se der depois (por exemplo, quando o aparelho liberar), toque em “Fazer agora”.</p>' +
      '<button class="btn block" style="margin-top:10px" data-act="skipSave">Pular exercício</button>';
  }, mounted: el2 => { const i = $('#sk-note', el2); if (i) i.focus(); } });
};
A.skipSave = () => {
  const s = curSession(), e = s.exercises[sheet.ei];
  if (!sheet.reason) return toast('Escolha um motivo');
  const note = sheet.reason === 'outro' ? val('sk-note') : '';
  if (sheet.reason === 'outro' && !note) { const i = $('#sk-note'); i.setAttribute('aria-invalid', 'true'); i.focus(); return toast('Escreva o motivo'); }
  e.skip = { reason: sheet.reason, note, at: new Date().toISOString() };
  if (ui.focusEx && ui.focusEx.i === sheet.ei) ui.focusEx = null;
  persist(); closeSheet(); render(); window.scrollTo(0, 0); toast(e.name + ': pulado');
};
A.exUnskip = el => { const s = curSession(), i = Number(el.dataset.e); delete s.exercises[i].skip; ui.focusEx = { sid: s.id, i }; persist(); render(); window.scrollTo(0, 0); };
// pular o treino do dia (com motivo); fica registrado como "não realizado"
A.skipDay = el => {
  openSheet({ title: 'Pular o treino de hoje', plan: el.dataset.plan, reason: null, note: '', render: function () {
    return '<label>Motivo</label>' + chipsHtml('skipDayReason', [['sem_tempo', 'Sem tempo'], ['indisposicao', 'Cansaço ou indisposição'], ['outro', 'Outro']], this.reason) +
      (this.reason === 'outro' ? '<label for="sd-note">Qual o motivo?</label><input id="sd-note" maxlength="120" value="' + esc(this.note) + '">' : '') +
      '<p class="tiny muted">Fica registrado como “não realizado”, sem cobrança. Dá para mudar depois no histórico.</p><button class="btn block" style="margin-top:10px" data-act="skipDaySave">Pular hoje</button>';
  } });
};
A.skipDaySave = () => {
  if (!sheet.reason) return toast('Escolha um motivo');
  const lbl = { sem_tempo: 'Sem tempo', indisposicao: 'Cansaço ou indisposição' }[sheet.reason];
  const note = sheet.reason === 'outro' ? val('sd-note') : lbl;
  if (!note) { $('#sd-note').focus(); return toast('Escreva o motivo'); }
  if (!markNoTraining(today(), sheet.plan, 'nao_realizada', 'Pulado — motivo: ' + note)) { closeSheet(); return toast('Hoje já tem treino registrado.'); }
  persist(); closeSheet(); render(); toast('Treino de hoje pulado');
};
A.addSet = el => { const e = db.sessions.find(x => x.id === ui.sessionId).exercises[el.dataset.e]; const l = e.sets[e.sets.length - 1] || {}; e.sets.push({ kg: l.kg || '', reps: '', done: false }); persist(); render(); };
A.rmSet = el => { const e = db.sessions.find(x => x.id === ui.sessionId).exercises[el.dataset.e]; e.sets.pop(); persist(); render(); };
A.rpe = el => { const e = db.sessions.find(x => x.id === ui.sessionId).exercises[el.dataset.e]; const v = Number(el.dataset.v); e.rpe = e.rpe === v ? null : v; persist(); render(); };
A.restAdd = () => { if (rest) { rest.endsAt += 15000; rest.total += 15; drawRest(); workoutSync(); } };
A.restStop = () => stopRest();
A.finishSession = () => finishSessionSheet();
A.finishSave = () => {
  const s = db.sessions.find(x => x.id === ui.sessionId);
  s.status = sheet.stSel; if (!s.prevStatus && !s.timesUnknown) s.endedAt = new Date().toISOString(); delete s.prevStatus; ui.focusEx = null; persist(); stopRest(); closeSheet(); ui.sessionId = null; go('daily');
  toast(s.status === 'concluida' ? 'Treino concluído. Bom trabalho!' : 'Sessão registrada');
};
A.cancelSession = () => {
  const s = db.sessions.find(x => x.id === ui.sessionId);
  // sessão antiga reaberta para edição: "descartar" só desfaz a reabertura, não apaga o histórico
  if (s && s.prevStatus) return confirmBox('Parar de editar esta sessão? Ela volta ao status anterior (' + STATUS[s.prevStatus] + '), com as séries como estão agora.', 'Parar edição', () => { s.status = s.prevStatus; delete s.prevStatus; persist(); stopRest(); go('daily'); });
  confirmBox('Descartar esta sessão? Os dados dela serão apagados.', 'Descartar', () => { db.sessions = db.sessions.filter(x => x.id !== ui.sessionId); persist(); stopRest(); go('daily'); }, true);
};
A.markDay = el => { const d = el.dataset.date, p = plannedFor(d) || db.plans[0].id; if (!markNoTraining(d, p, el.dataset.st)) toast('Este dia já tem treino registrado.'); else persist(); closeSheet(); render(); };
A.dayInfo = el => {
  const d = el.dataset.date, pl = plannedFor(d), ss = sessionsOn(d);
  openSheet({ title: fmtLong(d), render: () => '<p>' + (pl ? 'Planejado: <b>' + esc(planName(pl)) + '</b>' : 'Sem treino planejado (dia livre).') + '</p>' +
    (ss.length ? '<ul class="list">' + ss.map(s => '<li class="tap row between" data-act="viewSession" data-id="' + esc(s.id) + '"><b>' + esc(s.planName) + '</b><span class="st-' + esc(s.status) + '">' + STATUS_ICON[s.status] + ' ' + STATUS[s.status] + '</span></li>').join('') + '</ul>' : '') +
    (d <= today() ? '<div class="btns">' + (d === today() ? '<button class="btn" data-act="pickPlan" data-date="' + esc(d) + '">Iniciar treino</button>' : '<button class="btn sec" data-act="pickPlanPast" data-date="' + esc(d) + '">Registrar treino feito</button>') + '</div>' +
      (pl && !ss.length ? '<div class="btns"><button class="btn ghost" data-act="markDay" data-date="' + esc(d) + '" data-st="adiada">Marcar adiado</button><button class="btn ghost" data-act="markDay" data-date="' + esc(d) + '" data-st="nao_realizada">Marcar não realizado</button></div>' : '') : '<p class="small muted">Dia futuro. Lembre-se: horário livre.</p>') });
};
A.pickPlanPast = el => openSheet({ title: 'Qual treino você fez?', render: () => '<div class="grid3">' + db.plans.map(p => '<button class="btn sec" data-act="pastSession" data-plan="' + esc(p.id) + '" data-date="' + esc(el.dataset.date) + '">' + esc(p.name) + '</button>').join('') + '</div>' });
A.pastSession = el => { checkin = { planId: el.dataset.plan, date: el.dataset.date, makeupFor: null, energy: null, nausea: '', ate: '', water: '' }; createSession(false); const s = curSession(); if (s) { s.startedAt = null; s.timesUnknown = true; persist(); render(); } };
A.viewSession = el => {
  const s = db.sessions.find(x => x.id === el.dataset.id);
  openSheet({ title: s.planName + ' · ' + fmtDs(s.date), stSel: s.status, render: function () {
    return (s.exercises.length ? '<table><tr><th>Exercício</th><th>Séries</th><th>Esf.</th></tr>' + s.exercises.map(e => '<tr><td>' + esc(e.name) + (e.discomfort ? ' ⚠' : '') + (e.notes ? '<div class="tiny muted">' + esc(e.notes) + '</div>' : '') + (e.skip ? '<div class="tiny muted">↷ Pulado — ' + esc(skipTxt(e)) + '</div>' : '') + '</td><td>' + (setsTxt(e) || '—') + '</td><td>' + (e.rpe || '—') + '</td></tr>').join('') + '</table>' : '<p class="muted small">Sem exercícios registrados.</p>') +
      (s.exercises.length ? '<div class="grid2"><div><label for="vs-start">Início</label><input type="time" id="vs-start" value="' + (s.timesUnknown ? '' : hhmm(s.startedAt || '')) + '"></div><div><label for="vs-end">Fim</label><input type="time" id="vs-end" value="' + (s.timesUnknown ? '' : hhmm(s.endedAt || '')) + '"></div></div>' + (sessionMinutes(s) ? '<p class="small muted">Duração: ' + fmtMin(sessionMinutes(s)) + '</p>' : '') : '') +
      (s.notes ? '<p class="small">' + esc(s.notes) + '</p>' : '') + '<label>Status</label>' + chipsHtml('finSt', Object.keys(STATUS).filter(k => k !== 'em_andamento').map(k => [k, STATUS[k]]), this.stSel) +
      '<div class="btns"><button class="btn danger" data-act="delSession" data-id="' + esc(s.id) + '">Excluir</button>' + (s.exercises.length ? '<button class="btn sec" data-act="reopenSession" data-id="' + esc(s.id) + '">Editar séries</button>' : '') + '<button class="btn" data-act="saveSessionStatus" data-id="' + esc(s.id) + '">Salvar</button></div>';
  } });
};
A.saveSessionStatus = el => {
  const s = db.sessions.find(x => x.id === el.dataset.id);
  if (s.exercises.length) {
    const a = val('vs-start'), b = val('vs-end');
    const oa = s.timesUnknown ? '' : hhmm(s.startedAt || ''), ob = s.timesUnknown ? '' : hhmm(s.endedAt || '');
    if (a !== oa || b !== ob) { // só mexe nos horários se a pessoa mudou
      if (!a || !b) return toast('Preencha início e fim (ou deixe como estava)');
      const st = new Date(s.date + 'T' + a + ':00'), en = new Date(s.date + 'T' + b + ':00');
      if (!(en > st)) { $('#vs-end').setAttribute('aria-invalid', 'true'); return toast('O fim precisa ser depois do início'); }
      if (en - st > 6 * 3600000) return toast('Duração acima de 6 horas — confira os horários');
      s.startedAt = st.toISOString(); s.endedAt = en.toISOString(); delete s.timesUnknown;
    }
  }
  s.status = sheet.stSel; persist(); closeSheet(); render();
};
A.reopenSession = el => {
  const s = db.sessions.find(x => x.id === el.dataset.id);
  const other = db.sessions.find(x => x.status === 'em_andamento' && x.id !== s.id);
  if (other) return toast('Finalize a sessão em andamento (' + other.planName + ') antes de editar outra.');
  s.prevStatus = s.status; s.status = 'em_andamento'; persist(); ui.sessionId = s.id; go('session');
};
A.delSession = el => { const id = el.dataset.id; confirmBox('Excluir esta sessão do histórico?', 'Excluir', () => { db.sessions = db.sessions.filter(x => x.id !== id); persist(); render(); }, true); };
// peso / medidas
function weightSheet(w) {
  w = w || { id: null, date: today(), kg: '', notes: '' };
  openSheet({ title: w.id ? 'Editar peso' : 'Registrar peso', render: () => '<div class="grid2"><div><label>Data</label><input type="date" id="w-date" value="' + esc(w.date) + '"></div><div><label>Peso (kg)</label><input id="w-kg" inputmode="decimal" value="' + esc(w.kg) + '" placeholder="ex.: 114,5"></div></div><label>Observações</label><input id="w-notes" value="' + esc(w.notes) + '">' +
    '<div class="btns">' + (w.id ? '<button class="btn danger" data-act="delWeight" data-id="' + esc(w.id) + '">Excluir</button>' : '') + '<button class="btn" data-act="saveWeight" data-id="' + esc(w.id || '') + '">Salvar</button></div>', mounted: el => { if (!w.id) $('#w-kg', el).focus(); } });
}
A.addWeight = () => weightSheet(null);
A.editWeight = el => weightSheet(db.weights.find(x => x.id === el.dataset.id));
A.saveWeight = el => {
  const r = form(() => ({ date: dateField('w-date', { required: true, notFuture: true }), kg: field('w-kg', 'weight', { required: true }) }));
  if (!r) return;
  const id = el.dataset.id; const w = id ? db.weights.find(x => x.id === id) : { id: uid() };
  Object.assign(w, { date: r.date, kg: r.kg, notes: val('w-notes') }); if (!id) db.weights.push(w);
  persist(); closeSheet(); render(); toast('Peso registrado');
};
A.delWeight = el => { db.weights = db.weights.filter(x => x.id !== el.dataset.id); persist(); closeSheet(); render(); };
function measSheet(m) {
  m = m || { id: null, date: today() };
  openSheet({ title: 'Medidas (cm)', render: () => '<label>Data</label><input type="date" id="ms-date" value="' + esc(m.date) + '"><div class="grid2">' + MEAS.map(([k, l]) => '<div><label>' + l + '</label><input id="ms-' + k + '" inputmode="decimal" value="' + esc((m[k] == null ? '' : m[k])) + '"></div>').join('') + '</div><label>Observações</label><input id="ms-notes" value="' + esc(m.notes || '') + '">' +
    '<div class="btns">' + (m.id ? '<button class="btn danger" data-act="delMeas" data-id="' + esc(m.id) + '">Excluir</button>' : '') + '<button class="btn" data-act="saveMeas" data-id="' + esc(m.id || '') + '">Salvar</button></div>' });
}
A.addMeas = () => measSheet(null);
A.editMeas = el => measSheet(db.measurements.find(x => x.id === el.dataset.id));
A.saveMeas = el => {
  const r = form(() => { const o = { date: dateField('ms-date', { required: true, notFuture: true }) }; MEAS.forEach(([k]) => { o[k] = field('ms-' + k, 'measure'); }); return o; });
  if (!r) return;
  if (MEAS.every(([k]) => r[k] == null)) return toast('Preencha pelo menos uma medida');
  const id = el.dataset.id, m = id ? db.measurements.find(x => x.id === id) : { id: uid() };
  Object.assign(m, r); m.notes = val('ms-notes');
  if (!id) db.measurements.push(m); persist(); closeSheet(); render();
};
A.delMeas = el => { db.measurements = db.measurements.filter(x => x.id !== el.dataset.id); persist(); closeSheet(); render(); };
A.prog = el => { ui.prog = el.dataset.k; render(); };
A.openReview = el => reviewSheet(el.dataset.start, db.reviews.find(r => r.start === el.dataset.start));
A.openSavedReview = el => { const r = db.reviews.find(x => x.id === el.dataset.id); reviewSheet(r.start, r); };
A.rvSave = () => {
  const s = sheet, r = s.existing || { id: uid(), start: s.R.start };
  Object.assign(r, { checks: s.st.checks, suggestion: s.st.suggestion, notes: val('rv-notes'), savedAt: new Date().toISOString(), text: reviewText(s.R, s.st, val('rv-notes')) });
  if (!s.existing) db.reviews.push(r); persist(); closeSheet(); render(); toast('Avaliação salva');
};
A.rvShare = () => share('Avaliação de 4 semanas', reviewText(sheet.R, sheet.st, val('rv-notes')));
function share(title, text) {
  if (B) return B.shareText(title, text);
  if (navigator.share) return navigator.share({ title, text }).catch(() => { });
  try { navigator.clipboard.writeText(text); toast('Copiado'); } catch (e) { }
}
// saúde
A.editMed = () => medSheet();
A.saveMed = () => { Object.assign(db.medication, { startDate: val('md-start'), weekday: val('md-wd'), doseText: val('md-dose'), notes: val('md-notes') }); persist(); closeSheet(); render(); };
A.addMedLog = () => medLogSheet(null);
A.editMedLog = el => medLogSheet(db.medLogs.find(x => x.id === el.dataset.id));
A.saveMedLog = el => {
  const id = el.dataset.id, l = id ? db.medLogs.find(x => x.id === id) : { id: uid() };
  Object.assign(l, { date: val('ml-date') || today(), time: val('ml-time'), doseText: val('ml-dose'), site: val('ml-site'), notes: val('ml-notes') });
  if (!id) db.medLogs.push(l); persist(); closeSheet(); render(); toast('Aplicação registrada');
};
A.delMedLog = el => { db.medLogs = db.medLogs.filter(x => x.id !== el.dataset.id); persist(); closeSheet(); render(); };
function readSymptomFields(s) {
  s.date = val('sy-date') || s.date; s.time = val('sy-time') || s.time; s.notes = val('sy-notes');
  s.flags = s.flags || {}; RED_FLAGS.forEach(([k]) => { if ($('#syf-' + k)) s.flags[k] = checked('syf-' + k); });
}
A.addSymptom = () => symptomSheet(null);
A.editSymptom = el => symptomSheet(db.symptomLogs.find(x => x.id === el.dataset.id));
A.saveSymptom = () => {
  const s = sheet.s; readSymptomFields(s);
  const red = Object.values(s.flags).some(Boolean);
  if (!s.id) { s.id = uid(); db.symptomLogs.push(s); } else { const i = db.symptomLogs.findIndex(x => x.id === s.id); db.symptomLogs[i] = s; }
  persist(); closeSheet(); render();
  if (red) openSheet({ title: 'Atenção', render: () => alertHtml() + '<p>Você marcou um sinal de alerta. <b>Procure atendimento médico</b> e comunique seu médico assistente. Em emergência, ligue 192 (SAMU).</p><button class="btn block" data-act="closeSheet">Entendi</button>' });
  else if ((s.symptoms.nausea >= 2 || s.symptoms.tontura >= 1 || s.symptoms.fraqueza >= 2)) toast('Registrado. Se for treinar hoje, prefira ir mais leve ou adiar.');
  else toast('Registrado');
};
A.delSymptom = () => { const id = sheet.s.id; db.symptomLogs = db.symptomLogs.filter(x => x.id !== id); persist(); closeSheet(); render(); };
A.addEnergy = () => energySheet(db.energyLogs.find(e => e.date === today()) || null);
A.editEnergy = el => energySheet(db.energyLogs.find(x => x.id === el.dataset.id));
A.saveEnergy = () => {
  const e = sheet.e;
  const r = form(() => ({ date: dateField('en-date', { required: true, notFuture: true }), sleep: field('en-sleep', 'sleep') }));
  if (!r) return;
  if (e.energy == null) return toast('Escolha seu nível de energia');
  e.date = r.date; e.sleepHours = r.sleep; e.notes = val('en-notes'); delete e._sleepRaw;
  if (!e.id) { e.id = uid(); db.energyLogs.push(e); } else { const i = db.energyLogs.findIndex(x => x.id === e.id); db.energyLogs[i] = e; }
  persist(); closeSheet(); render(); toast('Registrado');
};
A.delEnergy = () => { const id = sheet.e.id; db.energyLogs = db.energyLogs.filter(x => x.id !== id); persist(); closeSheet(); render(); };
A.doctorReport = () => {
  let days = 30;
  openSheet({ title: 'Relatório para o médico', render: () => '<div class="chips">' + [[7, '7 dias'], [14, '14 dias'], [30, '30 dias'], [0, 'Desde o início']].map(([d, l]) => '<button class="chip ' + (days === d ? 'on' : '') + '" data-act="drDays" data-d="' + esc(d) + '">' + l + '</button>').join('') + '</div><div class="pre" style="margin-top:10px">' + esc(doctorReportText(days)) + '</div><div class="btns"><button class="btn" data-act="drShare">Compartilhar / enviar</button></div>', setDays: d => { days = d; }, getDays: () => days });
};
A.drDays = el => { sheet.setDays(Number(el.dataset.d)); refreshSheet(); };
A.drShare = () => share('Relatório de acompanhamento', doctorReportText(sheet.getDays()));
// configurações
A.saveProfile = () => {
  const p = db.profile;
  const r = form(() => ({ age: field('pf-age', 'age'), heightCm: field('pf-h', 'height'), startWeight: field('pf-sw', 'weight', { required: true }), targetWeight: field('pf-tw', 'weight', { required: true }), startDate: dateField('pf-sd', { required: true }) }));
  if (!r) return;
  Object.assign(p, { name: val('pf-name'), sex: val('pf-sex') }, r);
  persist(); toast('Perfil salvo');
};
A.saveGoals = () => {
  const g = form(() => ({ from: today(), kcal: field('gl-k', 'goalKcal'), protein: field('gl-p', 'goalMacro'), carbs: field('gl-c', 'goalMacro'), fat: field('gl-f', 'goalMacro'), water: field('gl-w', 'goalWater') }));
  if (!g) return;
  db.nutritionGoals = db.nutritionGoals.filter(x => x.from !== g.from); db.nutritionGoals.push(g); persist(); render(); toast('Metas salvas (valem a partir de hoje)');
};
A.editPlan = el => planSheet(planById(el.dataset.id));
A.newPlan = () => planSheet(null);
A.peAdd = () => { readPlanSheet(); sheet.p.exercises.push({ id: uid(), name: '', sets: 2, reps: '12' }); refreshSheet(); };
A.peDel = el => { readPlanSheet(); sheet.p.exercises.splice(Number(el.dataset.i), 1); refreshSheet(); };
A.peMove = el => { readPlanSheet(); const a = sheet.p.exercises, i = Number(el.dataset.i), j = i + Number(el.dataset.d); if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; refreshSheet(); };
A.savePlan = () => {
  readPlanSheet(); const p = sheet.p;
  const ok = form(() => {
    if (!p.name) { fieldErr('pl-name', 'Informe o nome do plano'); throw new FieldError(); }
    p.exercises.forEach((e, i) => { if (!e.name && String(e.sets) === '' && !e.reps) return; if (!e.name) { fieldErr('pe-' + i + '-name', 'Informe o nome do exercício'); throw new FieldError(); } e.sets = field('pe-' + i + '-sets', 'sets', { required: true }); });
    return true;
  });
  if (!ok) return;
  p.exercises = p.exercises.filter(e => e.name);
  if (!p.id) { const used = db.plans.map(x => x.id); let id = 'D'; for (const c of 'DEFGHIJKLMNOPQRSTUVWXYZ') if (!used.includes(c)) { id = c; break; } p.id = id; db.plans.push(p); }
  else db.plans[db.plans.findIndex(x => x.id === p.id)] = p;
  persist(); closeSheet(); render(); toast('Plano salvo');
};
A.delPlan = () => {
  const id = sheet.p.id;
  confirmBox('Excluir este plano? O histórico de sessões é mantido.', 'Excluir', () => { db.plans = db.plans.filter(x => x.id !== id); Object.keys(db.schedule).forEach(k => { if (db.schedule[k] === id) delete db.schedule[k]; }); recordSchedule(); persist(); render(); }, true);
};
A.foodsList = () => {
  let q = '';
  openSheet({ title: 'Alimentos', render: () => '<input id="fl-q" placeholder="Buscar" value="' + esc(q) + '"><div id="fl-res">' + listFoods(q) + '</div>', mounted: el => { const i = $('#fl-q', el); i.addEventListener('input', () => { q = i.value; $('#fl-res').innerHTML = listFoods(q); }); } });
};
function listFoods(q) { const n = norm(q || ''); return db.foods.filter(f => norm(f.name).includes(n)).map(f => '<div class="food-res tap" data-act="editFood" data-id="' + esc(f.id) + '"><b>' + esc(f.name) + '</b><div class="tiny muted">100 ' + f.base + ': ' + r0(f.kcal) + ' kcal · P ' + r1(f.p) + ' · C ' + r1(f.c) + ' · G ' + r1(f.f) + ' · ' + esc(f.source || '') + '</div></div>').join(''); }
A.newFood = () => openSheet({ title: 'Novo alimento', render: () => foodForm(null, 'saveFood') });
A.editFood = el => { const f = db.foods.find(x => x.id === el.dataset.id); openSheet({ title: 'Editar alimento', render: () => foodForm(f, 'saveFood') }); };
A.saveFood = el => { const f = el.dataset.id ? db.foods.find(x => x.id === el.dataset.id) : null; if (f) f.source = (f.source || '').includes('editado') ? f.source : (f.source || '') + ' · editado'; if (!readFoodForm(f)) return; persist(); closeSheet(); render(); toast('Alimento salvo'); };
A.delFood = el => { const id = el.dataset.id; confirmBox('Excluir este alimento da lista? Refeições já registradas não mudam.', 'Excluir', () => { db.foods = db.foods.filter(f => f.id !== id); persist(); render(); }, true); };
A.editReminder = el => reminderSheet(Number(el.dataset.i));
A.remDay = el => { const r = sheet.r, d = Number(el.dataset.d); readRem(); r.days = r.days.includes(d) ? r.days.filter(x => x !== d) : r.days.concat(d).sort(); refreshSheet(); };
A.remTrainDays = () => { readRem(); sheet.r.days = Object.keys(db.schedule).filter(k => db.schedule[k]).map(Number).sort(); refreshSheet(); };
A.remMedDay = () => { readRem(); sheet.r.days = [Number(db.medication.weekday)]; refreshSheet(); };
function readRem() { const r = sheet.r; r.title = val('rm-title'); r.text = val('rm-text'); const [hh, mm] = (val('rm-time') || '09:00').split(':'); r.hour = Number(hh); r.minute = Number(mm); r.enabled = checked('rm-on'); }
A.saveReminder = () => { readRem(); db.settings.reminders[sheet.i] = sheet.r; persist(); syncReminders(); closeSheet(); render(); toast('Lembrete salvo'); };
A.exportBackup = () => {
  flushPending();
  const withPhotos = checked('bk-photos');
  const photos = {}; let missing = 0;
  if (withPhotos) db.meals.forEach(m => (m.photoIds || []).forEach(id => { const d = getPhoto(id); if (d) photos[id] = d; else missing++; }));
  const payload = JSON.stringify({ app: 'TreinoSaude', appName: APP_NAME, format: H.FORMAT_VERSION, exportedAt: new Date().toISOString(), exportedLocalDate: today(), data: db, photos });
  const name = 'treino-saude-backup-' + today() + '.json';
  if (missing) toast(missing + ' foto(s) não foram encontradas no aparelho e ficaram fora do backup');
  saveFile(name, payload);
};
// Exportação: no Android o conteúdo vai para um arquivo temporário antes do seletor; no navegador, download.
function saveFile(name, content) {
  if (!content) return toast('Erro ao exportar: nada para gravar');
  if (B) { if (B.exportFile(name, content, 'application/json') === false) toast('Erro ao exportar: não foi possível preparar o arquivo'); return; }
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000); // só libera depois que o navegador terminou de baixar
  toast('Backup gerado (' + fmtSize(new Blob([content]).size) + ') — veja a pasta de downloads');
}
function fmtSize(n) { return n < 1024 ? n + ' bytes' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
window.onExportDone = r => {
  r = String(r || '');
  if (r.startsWith('ok')) { const n = Number(r.split(':')[1]); toast('Backup exportado' + (n ? ' (' + fmtSize(n) + ')' : '')); }
  else if (r === 'cancel') toast('Exportação cancelada');
  else if (r === 'error:empty') toast('Erro ao exportar: o conteúdo se perdeu. Nenhum arquivo vazio foi deixado — tente de novo.');
  else toast('Erro ao exportar: não foi possível gravar no local escolhido. Tente outra pasta.');
};
A.importBackup = () => {
  if (B) { B.importFile(); return; }
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; if (f.size > H.MAX_BACKUP_BYTES) return window.onImportError('Arquivo grande demais para ser um backup deste app.'); f.text().then(window.onImportFile); }; inp.click();
};
window.onImportError = msg => restoreFailed({ errors: [String(msg)] });
window.onImportFile = text => startRestore(text);
function restoreFailed(v) {
  openSheet({ title: 'Backup não restaurado', render: () => '<div class="card bad"><b>' + (v.incompatible ? 'Versão incompatível' : 'O arquivo tem problemas') + '</b><ul class="small">' + v.errors.slice(0, 10).map(e => '<li>' + esc(e) + '</li>').join('') + '</ul></div>' +
    '<p class="small"><b>Nenhum dado foi alterado.</b></p>' + (v.incompatible ? '<p class="small">Atualize o app para a versão mais recente e tente de novo.</p>' : '') + '<button class="btn block" data-act="closeSheet">Fechar</button>' });
}
// Passo 1: valida TUDO antes de tocar nos dados ativos e mostra um resumo para confirmar.
function startRestore(text) {
  const v = H.validateBackup(text);
  if (!v.ok) return restoreFailed(v);
  const s = v.summary;
  const when = v.exportedAt ? fmtD(H.localDateOfIso(v.exportedAt)) : 'sem data';
  const row = (l, n) => '<div class="kv"><span>' + esc(l) + '</span><b>' + esc(n) + '</b></div>';
  const html = '<p>Restaurar este backup? <b>Os dados atuais serão substituídos.</b> Antes, o app guarda uma cópia de segurança deles.</p>' +
    '<div class="card">' + row('Criado em', when) + row('Período', s.firstDate ? fmtD(s.firstDate) + ' a ' + fmtD(s.lastDate) : '—') +
    row('Refeições', s.meals) + row('Registros de água', s.water) + row('Pesos', s.weights) + row('Medidas', s.measurements) + row('Sessões de treino', s.sessions) +
    row('Aplicações', s.medLogs) + row('Sintomas', s.symptomLogs) + row('Energia/sono', s.energyLogs) + row('Fotos no arquivo', s.photosInFile) + '</div>' +
    (s.photoRefsMissingInFile.length ? '<p class="small muted">' + s.photoRefsMissingInFile.length + ' foto(s) citadas nas refeições não estão no arquivo (aparecerão como “foto indisponível”, a menos que já existam neste aparelho).</p>' : '') +
    (v.warnings.length ? '<details class="card"><summary class="small">Avisos (' + v.warnings.length + ')</summary><ul class="small">' + v.warnings.slice(0, 15).map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></details>' : '');
  confirmBox('', 'Restaurar', () => doRestore(v), true, { title: 'Confirmar restauração', html });
}
// Passo 2: cópia de segurança → fotos → troca dos dados → gravação conferida. Se algo falhar, nada muda.
function doRestore(v) {
  const prevDb = db, prevRecovery = store.recovery;
  const current = prevRecovery ? prevRecovery.raw : JSON.stringify(db);
  if (current != null && !writeSafetyBackup('pre-restore', current)) {
    return restoreFailed({ errors: ['Não foi possível guardar uma cópia de segurança dos dados atuais, então a restauração foi cancelada.'] });
  }
  let photoFail = 0;
  Object.keys(v.photos).forEach(id => { if (!putPhoto(id, v.photos[id])) photoFail++; });
  db = ensureShape(v.data); store.recovery = null;
  if (!persist()) {
    db = prevDb; store.recovery = prevRecovery; render();
    return restoreFailed({ errors: ['Não foi possível gravar os dados restaurados. Seus dados anteriores continuam como estavam.'] });
  }
  syncReminders(); ui.tab = 'home'; closeSheet(); render();
  const missing = (db.meals || []).reduce((a, m) => a + (m.photoIds || []).filter(id => !hasPhoto(id)).length, 0);
  toast('Backup restaurado' + (photoFail ? ' · ' + photoFail + ' foto(s) não puderam ser gravadas' : '') + (missing ? ' · ' + missing + ' foto(s) indisponíveis' : ''));
}
A.localBackups = () => {
  const list = restorableBackups();
  openSheet({ title: 'Cópias automáticas', render: () => (list.length ? '<p class="small muted">' + (B ? 'Uma cópia por dia de uso (últimos 14 dias), mais cópias feitas antes de restaurações.' : 'No navegador ficam as últimas 3 cópias diárias, mais cópias feitas antes de restaurações.') + ' Restaurar mostra um resumo antes de substituir qualquer coisa.</p><ul class="list">' + list.map(n => '<li class="row between"><span>' + esc(backupLabel(n)) + '</span><button class="btn sec sm" data-act="restoreLocal" data-n="' + esc(n) + '">Restaurar</button></li>').join('') + '</ul>' : '<p class="muted">Nenhuma cópia ainda.</p>') });
};
A.restoreLocal = el => {
  const n = el.dataset.n, t = readLocalBackup(n);
  if (!t) return toast('Não foi possível ler esta cópia');
  let text = t;
  try { const o = JSON.parse(t); if (o && o.app !== 'TreinoSaude') text = JSON.stringify({ app: 'TreinoSaude', format: 1, data: o }); } catch (e) { /* inválida: a validação explica */ }
  startRestore(text);
};
// modo de recuperação
A.exportRaw = () => {
  const raw = store.recovery && store.recovery.raw; if (!raw) return;
  const name = 'treino-saude-dados-ilegiveis-' + today() + '.json';
  saveFile(name, raw);
};
A.recoveryFresh = () => confirmBox('Começar do zero? Uma base nova será criada.' + (store.recovery && store.recovery.raw ? ' O conteúdo ilegível é guardado à parte (em “Cópias automáticas”) antes.' : ''), 'Começar do zero', () => {
  const raw = store.recovery && store.recovery.raw;
  if (raw && !writeSafetyBackup('corrupt', raw)) return restoreFailed({ errors: ['Não foi possível guardar o conteúdo ilegível à parte. Nada foi alterado.'] });
  const prev = store.recovery;
  db = freshDb(); store.recovery = null;
  if (!persist()) { store.recovery = prev; render(); return restoreFailed({ errors: ['Não foi possível gravar a base nova.'] }); }
  render(); onboarding();
}, true);
// fotos sem refeição (nunca apagadas automaticamente)
A.checkPhotos = () => {
  const refs = new Set(db.meals.flatMap(m => m.photoIds || []));
  if (draft && draft.photoIds) draft.photoIds.forEach(id => refs.add(id));
  const stored = listStoredPhotos();
  const orphans = stored.filter(id => !refs.has(id));
  const missing = [...refs].filter(id => !stored.includes(id)).length;
  openSheet({ title: 'Fotos guardadas', render: () => '<div class="kv"><span>Fotos no aparelho</span><b>' + stored.length + '</b></div><div class="kv"><span>Sem refeição ligada</span><b>' + orphans.length + '</b></div><div class="kv"><span>Citadas mas não encontradas</span><b>' + missing + '</b></div>' +
    (orphans.length ? '<p class="small muted">Fotos sem refeição podem sobrar de versões anteriores. Elas só são apagadas se você confirmar.</p><button class="btn danger block" data-act="delOrphans">Apagar ' + orphans.length + ' foto(s) sem refeição</button>' : '<p class="small muted">Nenhuma foto sobrando.</p>'), orphans });
};
A.delOrphans = () => { const list = sheet.orphans.slice(); confirmBox('Apagar ' + list.length + ' foto(s) que não estão ligadas a nenhuma refeição? Isso não pode ser desfeito.', 'Apagar', () => { list.forEach(delPhoto); toast(list.length + ' foto(s) apagadas'); }, true); };
A.obDone = () => {
  if (checked('ob-hist')) seedHistory();
  if (checked('ob-w')) db.weights.push({ id: uid(), date: '2026-11-09', kg: 115, notes: 'Peso de referência inicial' });
  db.settings.onboarded = true; persist(); closeSheet(); render();
};

// ---------------------------------------------------------------- eventos
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el) { e.preventDefault(); const k = el.dataset.act; if (Object.prototype.hasOwnProperty.call(A, k)) A[k](el, e); return; }
  const tb = e.target.closest('#tabbar button'); if (tb) { go(tb.dataset.tab); return; }
  if (e.target.id === 'sheet-wrap') closeSheet();
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape' && sheet) closeSheet();
});
$('#btn-settings').addEventListener('click', () => go('settings'));
$('#save-retry').addEventListener('click', () => { if (persist()) toast('Dados salvos'); });
document.addEventListener('change', e => {
  const el = e.target, c = el.dataset.change;
  if (c === 'schedule') { if (el.value) db.schedule[el.dataset.wd] = el.value; else delete db.schedule[el.dataset.wd]; recordSchedule(); persist(); toast('Dias de treino atualizados (valem a partir de hoje)'); }
  else if (c === 'theme') { db.settings.theme = el.value; persist(); applyTheme(); }
  else if (c === 'restOn') { db.settings.restEnabled = el.checked; persist(); }
  else if (c === 'restSec') { db.settings.restSeconds = Number(el.value); persist(); }
  else if (c === 'restMode') { db.settings.restMode = el.value; if (el.value === 'prog') { if (db.settings.restBase == null) db.settings.restBase = 45; if (db.settings.restStep == null) db.settings.restStep = 15; } persist(); render(); }
  else if (c === 'restBase') { db.settings.restBase = Number(el.value); persist(); render(); }
  else if (c === 'restStep') { db.settings.restStep = Number(el.value); persist(); render(); }
  else if (c === 'pipOn') { db.settings.pipEnabled = el.checked; persist(); workoutSync(); }
  else if (c === 'remToggle') { db.settings.reminders[el.dataset.i].enabled = el.checked; persist(); syncReminders(); toast(el.checked ? 'Lembrete ativado' : 'Lembrete desativado'); }
  else if (c === 'strengthEx') { ui.strengthEx = el.value; render(); }
  else if (el.dataset.sfield === 'warmupDone') { const s = db.sessions.find(x => x.id === ui.sessionId); s.warmupDone = el.checked; persist(); }
  else if (el.dataset.efield && el.type === 'checkbox') { const [ei, k] = el.dataset.efield.split(':'); db.sessions.find(x => x.id === ui.sessionId).exercises[ei][k] = el.checked; persist(); }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (ui.tab !== 'session') return;  // (o Treino diário com sessão em andamento abre a própria sessão)
  const s = db.sessions.find(x => x.id === ui.sessionId); if (!s) return;
  if (el.dataset.set) { const [ei, si, k] = el.dataset.set.split(':'); s.exercises[ei].sets[si][k] = el.value.trim(); markSetInput(el); persistSoon(); }
  else if (el.dataset.efield && el.type !== 'checkbox') { const [ei, k] = el.dataset.efield.split(':'); s.exercises[ei][k] = el.value; persistSoon(); }
  else if (el.dataset.sfield === 'notes') { s.notes = el.value; persistSoon(); }
});

// ---------------------------------------------------------------- início
loadDb();
render();
if (!store.recovery) {
  if (!db.settings.onboarded) onboarding();
  syncReminders();
  if (B && B.takeOpenSession && B.takeOpenSession()) window.openRunningSession();
}
})();
