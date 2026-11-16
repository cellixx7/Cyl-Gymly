/* Cyl Gymly — configuração por prompt (sem interface).
 * O app não fala com nenhuma IA: ele monta um texto (prompt) para a pessoa colar numa IA de chat e,
 * depois, lê o código JSON que a IA devolveu. Aqui ficam as funções puras desse caminho:
 *   buildPrompt    → texto do prompt (primeira configuração ou atualização com os dados atuais)
 *   exportSetup    → configuração atual no mesmo formato que a IA devolve
 *   extractJson    → acha e lê o JSON dentro do texto colado
 *   validateSetup  → confere cada campo; o que não serve vira aviso e fica de fora
 *   applySetup     → aplica numa CÓPIA dos dados (quem chama decide gravar)
 * Roda no navegador/WebView (window.HSetup) e no Node (require) para os testes.
 */
(function (root) {
'use strict';
const C = (typeof module !== 'undefined' && module.exports) ? require('./core.js') : root.HCore;
const S = {};

S.SETUP_FORMAT = 1;
S.APP_ID = 'CylGymly';
S.MAX_CHARS = 400000;
S.MAX_PLANS = 12;
S.MAX_EXERCISES = 30;
S.MAX_FOODS = 300;
S.MAX_MEALS = 12;
S.MAX_ITEMS = 30;
S.MEAL_TYPES = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Pré-treino', 'Pós-treino', 'Outro'];
S.REMINDER_IDS = ['treino', 'refeicoes', 'agua', 'aplicacao'];
S.REST_FIXED = [45, 60, 75, 90, 120, 150, 180];
S.REST_BASE = [30, 45, 60, 75, 90, 120];
S.REST_STEP = [5, 10, 15, 20, 30, 45, 60];
const WD_KEYS = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const WD_EN = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WD_NAMES = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

// ------------------------------------------------------------------ utilidades
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
S.norm = norm;
const keyNorm = k => norm(k).replace(/[^a-z0-9]/g, '');
// Lê um campo aceitando variações de nome (maiúsculas, acentos, sublinhados e alguns sinônimos).
function reader(o) {
  const m = {};
  if (isObj(o)) Object.keys(o).forEach(k => { m[keyNorm(k)] = o[k]; });
  return function () {
    for (let i = 0; i < arguments.length; i++) { const v = m[keyNorm(arguments[i])]; if (v !== undefined && v !== null && v !== '') return v; }
    return undefined;
  };
}
const text = (v, max) => {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  return s ? s.slice(0, max || 200) : null;
};
const bool = v => {
  if (typeof v === 'boolean') return v;
  const n = norm(v);
  if (['sim', 'true', '1', 'ativo', 'ligado', 'on'].includes(n)) return true;
  if (['nao', 'false', '0', 'inativo', 'desligado', 'off'].includes(n)) return false;
  return null;
};
function wdOf(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 7 ? v : (v === 0 ? 7 : null);
  const n = norm(v);
  if (/^[1-7]$/.test(n)) return Number(n);
  let i = WD_KEYS.indexOf(n.slice(0, 3)); if (i > 0) return i;
  i = WD_EN.indexOf(n.slice(0, 3)); return i > 0 ? i : null;
}
S.weekdayOf = wdOf;
const nearest = (list, v) => list.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
const round1 = n => Math.round(n * 10) / 10;
const fmtBr = s => C.isDate(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '—';
const numBr = n => n == null || !Number.isFinite(n) ? '—' : String(round1(n)).replace('.', ',');
let seq = 0;
const newId = p => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

// ------------------------------------------------------------------ leitura do texto colado
// Aceita o JSON puro, dentro de um bloco ```json ... ``` ou no meio de uma resposta com texto em volta.
S.extractJson = raw => {
  const fail = error => ({ ok: false, error });
  if (typeof raw !== 'string' || !raw.trim()) return fail('Cole aqui o código que a IA gerou.');
  if (raw.length > S.MAX_CHARS) return fail('O texto colado é grande demais para ser uma configuração deste app.');
  let t = raw.replace(/^﻿/, '');
  const blocks = []; const re = /```[a-zA-Z]*\s*([\s\S]*?)```/g; let m;
  while ((m = re.exec(t))) if (m[1].indexOf('{') >= 0) blocks.push(m[1]);
  if (blocks.length) t = blocks.sort((a, b) => b.length - a.length)[0];
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0) return fail('Não encontrei um código JSON no texto colado. Copie o bloco inteiro que a IA gerou, da primeira chave { até a última }.');
  if (b <= a) return fail('O código parece ter sido cortado (falta o final). Peça à IA: “gere o JSON completo de novo” e copie tudo.');
  let body = t.slice(a, b + 1);
  const fixes = [
    s => s,
    s => s.replace(/[“”„‟]/g, '"').replace(/ /g, ' '),
    s => s.replace(/^\s*\/\/.*$/gm, ''),
    s => s.replace(/,\s*([}\]])/g, '$1')
  ];
  for (const f of fixes) {
    body = f(body);
    try { const obj = JSON.parse(body); return isObj(obj) ? { ok: true, obj } : fail('O código colado não é uma configuração (esperava um objeto JSON).'); } catch (e) { /* tenta o próximo conserto */ }
  }
  const open = (body.match(/[{[]/g) || []).length, close = (body.match(/[}\]]/g) || []).length;
  return fail(open > close
    ? 'O código está incompleto: parece ter sido cortado ao copiar. Peça à IA: “gere o JSON completo de novo” e copie tudo.'
    : 'O código tem um erro de formato e não pôde ser lido. Peça à IA: “corrija o JSON para que seja válido” e cole de novo.');
};

// ------------------------------------------------------------------ validação
/* Devolve { ok, errors, warnings, setup }. "setup" só traz as seções que vieram e passaram na conferência.
 * Campo inválido não derruba o resto: vira aviso (mostrado antes de aplicar) e é ignorado.
 * Só há erro quando o conteúdo não é uma configuração ou quando nada dele pôde ser aproveitado.
 */
S.validateSetup = (obj, db) => {
  const errors = [], warnings = [];
  const warn = m => { if (warnings.length < 40) warnings.push(m); };
  if (!isObj(obj)) return { ok: false, errors: ['O código colado não é uma configuração.'], warnings, setup: null };
  if (obj.app === 'TreinoSaude' && (isObj(obj.data) || isObj(obj.profile))) return { ok: false, errors: ['Este código é um backup completo do app, não uma configuração. Use Configurações > Importar backup.'], warnings, setup: null };
  const top = reader(obj);
  const fmt = top('formato', 'format');
  if (fmt != null && Number(fmt) > S.SETUP_FORMAT) return { ok: false, errors: ['Esta configuração foi feita para uma versão mais nova do app (formato ' + String(fmt).slice(0, 8) + '). Atualize o app.'], warnings, setup: null };
  db = db || {};
  const setup = {};
  const number = (label, kind, raw, opts) => {
    if (raw === undefined) return undefined;
    const r = C.check(kind, typeof raw === 'string' ? raw.trim().replace(/\s*(kg|cm|g|ml|kcal|anos|s)$/i, '') : raw, opts);
    if (!r.ok || r.value == null) { warn(label + ': valor "' + String(raw).slice(0, 20) + '" ignorado (' + (r.msg || 'vazio') + ')'); return undefined; }
    return r.value;
  };
  const date = (label, raw) => {
    if (raw === undefined) return undefined;
    let s = String(raw).trim();
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (br) s = br[3] + '-' + br[2] + '-' + br[1];
    if (!C.isDate(s)) { warn(label + ': data "' + String(raw).slice(0, 20) + '" ignorada (use AAAA-MM-DD)'); return undefined; }
    return s;
  };

  // ---- perfil
  const pRaw = top('perfil', 'profile');
  if (pRaw !== undefined) {
    if (!isObj(pRaw)) warn('perfil: formato inesperado, ignorado');
    else {
      const g = reader(pRaw), p = {};
      const name = g('nome', 'name'); if (name !== undefined) { const v = text(name, 60); if (v) p.name = v; }
      const set = (k, v) => { if (v !== undefined) p[k] = v; };
      set('age', number('perfil.idade', 'age', g('idade', 'age')));
      const sex = g('sexo', 'sex');
      if (sex !== undefined) { const n = norm(sex)[0]; if (n === 'm') p.sex = 'Masculino'; else if (n === 'f') p.sex = 'Feminino'; else warn('perfil.sexo: use "Masculino" ou "Feminino"'); }
      set('heightCm', number('perfil.alturaCm', 'height', g('alturaCm', 'altura', 'heightCm')));
      set('startWeight', number('perfil.pesoInicialKg', 'weight', g('pesoInicialKg', 'pesoInicial', 'startWeight')));
      set('currentWeight', number('perfil.pesoAtualKg', 'weight', g('pesoAtualKg', 'pesoAtual', 'peso', 'currentWeight')));
      set('targetWeight', number('perfil.pesoDesejadoKg', 'weight', g('pesoDesejadoKg', 'pesoDesejado', 'pesoMeta', 'targetWeight')));
      set('startDate', date('perfil.dataInicio', g('dataInicio', 'inicio', 'startDate')));
      if (Object.keys(p).length) setup.profile = p;
    }
  }

  // ---- metas nutricionais
  const gRaw = top('metas', 'metasNutricionais', 'goals');
  if (gRaw !== undefined) {
    if (!isObj(gRaw)) warn('metas: formato inesperado, ignorado');
    else {
      const g = reader(gRaw), goals = {};
      const set = (k, v) => { if (v !== undefined) goals[k] = v; };
      set('kcal', number('metas.kcal', 'goalKcal', g('kcal', 'calorias')));
      set('protein', number('metas.proteinaG', 'goalMacro', g('proteinaG', 'proteina', 'protein')));
      set('carbs', number('metas.carboidratosG', 'goalMacro', g('carboidratosG', 'carboidratos', 'carbs')));
      set('fat', number('metas.gordurasG', 'goalMacro', g('gordurasG', 'gorduras', 'gordura', 'fat')));
      set('water', number('metas.aguaMl', 'goalWater', g('aguaMl', 'agua', 'water')));
      if (Object.keys(goals).length) setup.goals = goals;
    }
  }

  // ---- planos de treino
  const plRaw = top('planos', 'treinos', 'plans');
  if (plRaw !== undefined) {
    if (!Array.isArray(plRaw)) warn('planos: deveria ser uma lista, ignorado');
    else {
      const plans = [], used = new Set();
      plRaw.slice(0, S.MAX_PLANS).forEach((raw, i) => {
        const where = 'planos #' + (i + 1);
        if (!isObj(raw)) return warn(where + ': formato inesperado, ignorado');
        const g = reader(raw), name = text(g('nome', 'name'), 60);
        if (!name) return warn(where + ': sem nome, ignorado');
        const exRaw = g('exercicios', 'exercises');
        const exercises = [];
        (Array.isArray(exRaw) ? exRaw : []).slice(0, S.MAX_EXERCISES).forEach((e, j) => {
          const ew = where + ' exercício ' + (j + 1);
          if (!isObj(e)) return warn(ew + ': formato inesperado, ignorado');
          const eg = reader(e), en = text(eg('nome', 'name', 'exercicio'), 80);
          if (!en) return warn(ew + ': sem nome, ignorado');
          const sets = number(ew + ' séries', 'sets', eg('series', 'sets'));
          const reps = text(eg('repeticoes', 'reps'), 30);
          exercises.push({ name: en, sets: sets === undefined ? 3 : sets, reps: reps || '10–12' });
        });
        if (!exercises.length) return warn(where + ' (' + name + '): sem exercícios válidos, ignorado');
        let id = text(g('id'), 64);
        if (!id || !C.SAFE_ID.test(id) || used.has(id)) { id = null; for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c) && !plRaw.some(x => isObj(x) && x.id === c)) { id = c; break; } if (!id) id = newId('p'); }
        used.add(id);
        plans.push({ id, name, warmup: text(g('aquecimento', 'warmup'), 200) || '', notes: text(g('orientacoes', 'observacoes', 'notes'), 600) || '', exercises });
      });
      if (plRaw.length > S.MAX_PLANS) warn('planos: só os ' + S.MAX_PLANS + ' primeiros foram considerados');
      if (plans.length) setup.plans = plans; else if (plRaw.length) warn('planos: nenhum plano válido; os treinos atuais foram mantidos');
    }
  }
  const planList = setup.plans || db.plans || [];
  const planRef = v => {
    if (v == null || v === '' || v === false) return null;
    const s = String(v).trim();
    const byId = planList.find(p => p.id === s) || planList.find(p => norm(p.id) === norm(s));
    if (byId) return byId.id;
    const byName = planList.find(p => norm(p.name) === norm(s));
    return byName ? byName.id : undefined;
  };

  // ---- dias de treino
  const sRaw = top('diasDeTreino', 'dias', 'agenda', 'schedule');
  if (sRaw !== undefined) {
    if (!isObj(sRaw)) warn('diasDeTreino: formato inesperado, ignorado');
    else {
      const schedule = {}; let any = false;
      Object.keys(sRaw).forEach(k => {
        const d = wdOf(k);
        if (!d) return warn('diasDeTreino: dia "' + k.slice(0, 15) + '" não reconhecido');
        any = true;
        if (/^(descanso|folga|livre|rest|nenhum|-)$/.test(norm(sRaw[k]))) return;
        const id = planRef(sRaw[k]);
        if (id === undefined) return warn('diasDeTreino: ' + WD_NAMES[d] + ' aponta para um treino que não existe ("' + String(sRaw[k]).slice(0, 20) + '")');
        if (id) schedule[d] = id;
      });
      if (any) setup.schedule = schedule;
    }
  }

  // ---- descanso entre séries
  const rRaw = top('descanso', 'rest');
  if (rRaw !== undefined) {
    if (!isObj(rRaw)) warn('descanso: formato inesperado, ignorado');
    else {
      const g = reader(rRaw), rest = {};
      const on = g('ativo', 'enabled'); if (on !== undefined) { const b = bool(on); if (b != null) rest.enabled = b; }
      const mode = g('modo', 'mode'); if (mode !== undefined) { const n = norm(mode); if (n.startsWith('prog')) rest.mode = 'prog'; else if (n.startsWith('fix')) rest.mode = 'fixo'; else warn('descanso.modo: use "fixo" ou "progressivo"'); }
      const sec = number('descanso.segundos', 'rest', g('segundos', 'seconds')); if (sec !== undefined) rest.seconds = nearest(S.REST_FIXED, sec);
      const base = number('descanso.baseSegundos', 'rest', g('baseSegundos', 'base')); if (base !== undefined) rest.base = nearest(S.REST_BASE, base);
      const step = number('descanso.acrescimoSegundos', 'restStep', g('acrescimoSegundos', 'acrescimo', 'step')); if (step !== undefined) rest.step = nearest(S.REST_STEP, step);
      if (Object.keys(rest).length) setup.rest = rest;
    }
  }

  // ---- lembretes
  const remRaw = top('lembretes', 'reminders');
  if (remRaw !== undefined) {
    if (!Array.isArray(remRaw)) warn('lembretes: deveria ser uma lista, ignorado');
    else {
      const reminders = [];
      remRaw.forEach((raw, i) => {
        const where = 'lembretes #' + (i + 1);
        if (!isObj(raw)) return warn(where + ': formato inesperado, ignorado');
        const g = reader(raw), id = norm(g('id', 'tipo')).replace(/[^a-z]/g, '');
        if (!S.REMINDER_IDS.includes(id)) return warn(where + ': tipo desconhecido (use ' + S.REMINDER_IDS.join(', ') + ')');
        if (reminders.some(r => r.id === id)) return warn(where + ': lembrete "' + id + '" repetido, ignorado');
        const r = { id };
        const on = g('ativo', 'enabled'); if (on !== undefined) { const b = bool(on); if (b != null) r.enabled = b; }
        const time = g('horario', 'hora', 'time');
        if (time !== undefined) { const t = String(time).trim().replace(/^(\d):/, '0$1:').replace(/h/i, ':').replace(/:$/, ':00'); if (C.isTime(t)) { r.hour = Number(t.slice(0, 2)); r.minute = Number(t.slice(3, 5)); } else warn(where + ': horário "' + String(time).slice(0, 10) + '" ignorado (use HH:MM)'); }
        const days = g('dias', 'days');
        if (days !== undefined) {
          if (!Array.isArray(days)) warn(where + ': dias deveria ser uma lista');
          else { const ds = []; days.forEach(d => { const w = wdOf(d); if (w && !ds.includes(w)) ds.push(w); else if (!w) warn(where + ': dia "' + String(d).slice(0, 12) + '" não reconhecido'); }); r.days = ds.length === 7 ? [] : ds.sort(); }
        }
        const title = text(g('titulo', 'title'), 60); if (title) r.title = title;
        const body = text(g('texto', 'mensagem', 'text'), 160); if (body) r.text = body;
        if (Object.keys(r).length > 1) reminders.push(r);
      });
      if (reminders.length) setup.reminders = reminders;
    }
  }

  // ---- tratamento (só registra o que a pessoa informou; o app nunca sugere dose)
  const mRaw = top('tratamento', 'medicacao', 'medication');
  if (mRaw !== undefined) {
    if (!isObj(mRaw)) warn('tratamento: formato inesperado, ignorado');
    else {
      const g = reader(mRaw), med = {};
      const name = text(g('medicamento', 'nome', 'name'), 80); if (name) med.name = name;
      const sd = date('tratamento.dataInicio', g('dataInicio', 'inicio', 'startDate')); if (sd !== undefined) med.startDate = sd;
      const day = g('diaAplicacao', 'dia', 'weekday'); if (day !== undefined) { const w = wdOf(day); if (w) med.weekday = String(w); else warn('tratamento.diaAplicacao: dia "' + String(day).slice(0, 12) + '" não reconhecido'); }
      const dose = text(g('dosePrescrita', 'dose', 'doseText'), 120); if (dose) med.doseText = dose;
      const notes = text(g('observacoes', 'orientacoes', 'notes'), 1000); if (notes) med.notes = notes;
      if (Object.keys(med).length) setup.medication = med;
    }
  }

  // ---- alimentos (valores por 100 g ou 100 ml)
  const fRaw = top('alimentos', 'foods');
  if (fRaw !== undefined) {
    if (!Array.isArray(fRaw)) warn('alimentos: deveria ser uma lista, ignorado');
    else {
      const foods = [], seen = new Set();
      fRaw.slice(0, S.MAX_FOODS).forEach((raw, i) => {
        if (!isObj(raw)) return warn('alimentos #' + (i + 1) + ': formato inesperado, ignorado');
        const g = reader(raw), name = text(g('nome', 'alimento', 'name'), 80);
        if (!name) return warn('alimentos #' + (i + 1) + ': sem nome, ignorado');
        const where = 'alimentos "' + name.slice(0, 30) + '"';
        if (seen.has(norm(name))) return warn(where + ': repetido, ficou só o primeiro');
        const base = norm(g('base', 'unidadeBase')) === 'ml' ? 'ml' : 'g';
        const req = { required: true };
        const kcal = C.check('per100kcal', g('kcal', 'calorias'), req), p = C.check('per100macro', g('proteinaG', 'proteina', 'p'), req),
          c = C.check('per100macro', g('carboidratosG', 'carboidratos', 'c'), req), f = C.check('per100macro', g('gordurasG', 'gorduras', 'gordura', 'f'), req);
        if (!kcal.ok || !p.ok || !c.ok || !f.ok) return warn(where + ': faltam calorias, proteína, carboidratos ou gorduras por 100 ' + base + ' (ou estão fora do limite); ignorado');
        if (p.value + c.value + f.value > 101) return warn(where + ': proteína + carboidratos + gorduras passam de 100 g em 100 ' + base + '; ignorado');
        const est = p.value * 4 + c.value * 4 + f.value * 9;
        if (Math.abs(est - kcal.value) > Math.max(40, kcal.value * 0.3)) warn(where + ': as calorias (' + Math.round(kcal.value) + ') não batem com os macros (≈' + Math.round(est) + ' kcal). Confira no rótulo.');
        const units = [];
        const uRaw = g('medidas', 'medidasCaseiras', 'units');
        (Array.isArray(uRaw) ? uRaw : []).slice(0, 8).forEach(u => {
          if (!isObj(u)) return;
          const ug = reader(u), un = text(ug('nome', 'medida', 'name'), 60), uv = C.check('unitG', ug('gramas', 'g', 'ml', 'quantidade'), req);
          if (un && uv.ok && norm(un) !== base && !units.some(x => norm(x.name) === norm(un))) units.push({ name: un, g: uv.value });
          else if (un && !uv.ok) warn(where + ': medida "' + un.slice(0, 20) + '" sem peso válido, ignorada');
        });
        seen.add(norm(name));
        foods.push({ name, base, kcal: kcal.value, p: p.value, c: c.value, f: f.value, units });
      });
      if (fRaw.length > S.MAX_FOODS) warn('alimentos: só os ' + S.MAX_FOODS + ' primeiros foram considerados');
      if (foods.length) setup.foods = foods;
    }
  }

  // ---- cardápio (plano alimentar): cada item com a porção e os valores DAQUELA porção
  const cRaw = top('cardapio', 'planoAlimentar', 'refeicoes', 'mealPlan');
  if (cRaw !== undefined) {
    if (!Array.isArray(cRaw)) warn('cardapio: deveria ser uma lista, ignorado');
    else {
      const known = (setup.foods || []).concat(db.foods || []);
      const findFood = n => known.find(f => norm(f.name) === norm(n));
      const mealPlan = [];
      cRaw.slice(0, S.MAX_MEALS).forEach((raw, i) => {
        const where = 'cardapio #' + (i + 1);
        if (!isObj(raw)) return warn(where + ': formato inesperado, ignorado');
        const g = reader(raw), label = text(g('refeicao', 'nome', 'tipo', 'type'), 40) || 'Refeição ' + (i + 1);
        let time = g('horario', 'hora', 'time');
        if (time !== undefined) { time = String(time).trim().replace(/^(\d):/, '0$1:'); if (!C.isTime(time)) { warn(where + ': horário "' + time.slice(0, 10) + '" ignorado (use HH:MM)'); time = ''; } } else time = '';
        const items = [];
        const iRaw = g('itens', 'alimentos', 'items');
        (Array.isArray(iRaw) ? iRaw : []).slice(0, S.MAX_ITEMS).forEach((it, j) => {
          const iw = where + ' item ' + (j + 1);
          if (!isObj(it)) return warn(iw + ': formato inesperado, ignorado');
          const ig = reader(it), name = text(ig('alimento', 'nome', 'name'), 80);
          if (!name) return warn(iw + ': sem nome, ignorado');
          const grams = number(iw + ' gramas', 'qty', ig('gramas', 'g', 'ml', 'grams'));
          let qty = ig('quantidade', 'porcao', 'medida', 'amount');
          qty = qty === undefined ? null : text(qty, 60);
          const food = findFood(name);
          const item = { name: food ? food.name : name, foodName: food ? food.name : null, grams: grams === undefined ? null : grams, qty };
          const vals = {};
          [['kcal', 'kcalItem', ['kcal', 'calorias']], ['p', 'macroItem', ['proteinaG', 'proteina', 'p']], ['c', 'macroItem', ['carboidratosG', 'carboidratos', 'c']], ['f', 'macroItem', ['gordurasG', 'gorduras', 'gordura', 'f']]]
            .forEach(([k, kind, names]) => { const v = number(iw + ' ' + k, kind, ig.apply(null, names)); vals[k] = v === undefined ? null : v; });
          if (food && item.grams != null) Object.assign(item, C.itemCalc(food, item.grams), { fromFood: true });
          else {
            const mi = C.manualItem({ name, kcal: vals.kcal, p: vals.p, c: vals.c, f: vals.f });
            Object.assign(item, { kcal: mi.kcal, p: mi.p, c: mi.c, f: mi.f, fromFood: false });
            if (item.kcal == null && item.p == null) warn(iw + ' (' + name.slice(0, 25) + '): sem valores nutricionais; não entra na soma');
          }
          items.push(item);
        });
        if (!items.length) return warn(where + ' (' + label + '): sem itens válidos, ignorado');
        mealPlan.push({ label, time, notes: text(g('observacoes', 'observacao', 'notes'), 300) || '', items });
      });
      if (cRaw.length > S.MAX_MEALS) warn('cardapio: só as ' + S.MAX_MEALS + ' primeiras refeições foram consideradas');
      if (mealPlan.length || !cRaw.length) setup.mealPlan = mealPlan;
    }
  }

  // ---- tema
  const th = top('tema', 'theme');
  if (th !== undefined) { const n = norm(th); const v = n.startsWith('clar') || n === 'light' ? 'light' : n.startsWith('escur') || n === 'dark' ? 'dark' : n.startsWith('auto') ? 'auto' : null; if (v) setup.theme = v; else warn('tema: use "auto", "claro" ou "escuro"'); }

  if (!Object.keys(setup).length) errors.push('Não encontrei nenhuma seção válida neste código (perfil, metas, planos, diasDeTreino, alimentos, cardapio...). Confira se copiou o bloco JSON inteiro gerado pela IA.');
  return { ok: !errors.length, errors, warnings, setup: errors.length ? null : setup };
};

// Totais do cardápio (um dia seguindo o plano)
S.mealPlanTotals = mealPlan => C.totals((mealPlan || []).flatMap(m => m.items || []));

// ------------------------------------------------------------------ aplicação
/* Aplica a configuração validada numa CÓPIA de db e devolve { db, changes }.
 * - perfil, metas, descanso, lembretes, tratamento e tema: só os campos enviados mudam;
 * - planos e cardápio: a lista enviada SUBSTITUI a atual (o histórico de sessões e refeições não muda);
 * - alimentos: entram na lista (os de mesmo nome são atualizados; nenhum é apagado);
 * - metas e dias de treino valem a partir de hoje: o passado continua com os valores antigos.
 */
S.applySetup = (src, setup, opts) => {
  opts = opts || {};
  const today = opts.today || C.today(), first = !!opts.first;
  const d = JSON.parse(JSON.stringify(src));
  const changes = [];
  const uid = opts.uid || (() => newId('s'));

  if (setup.profile) {
    const p = setup.profile, tgt = d.profile;
    ['name', 'age', 'sex', 'heightCm', 'targetWeight'].forEach(k => { if (p[k] !== undefined) tgt[k] = p[k]; });
    if (p.startDate !== undefined) tgt.startDate = p.startDate; else if (first) tgt.startDate = today;
    if (p.startWeight !== undefined) tgt.startWeight = p.startWeight; else if (first && p.currentWeight !== undefined) tgt.startWeight = p.currentWeight;
    if (p.currentWeight !== undefined) {
      const sorted = (d.weights || []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const last = sorted[sorted.length - 1];
      if (!last || last.kg !== p.currentWeight) {
        const sameDay = d.weights.find(w => w.date === today);
        if (sameDay) sameDay.kg = p.currentWeight; else d.weights.push({ id: uid(), date: today, kg: p.currentWeight, notes: 'Informado na configuração' });
      }
    }
    changes.push('Perfil atualizado');
  } else if (first) d.profile.startDate = today;

  if (setup.goals) {
    const cur = (d.nutritionGoals || []).filter(x => x.from <= today).sort((a, b) => a.from.localeCompare(b.from)).pop() || {};
    const g = { from: today, kcal: null, protein: null, carbs: null, fat: null, water: null };
    ['kcal', 'protein', 'carbs', 'fat', 'water'].forEach(k => { g[k] = setup.goals[k] !== undefined ? setup.goals[k] : (cur[k] == null ? null : cur[k]); });
    d.nutritionGoals = (d.nutritionGoals || []).filter(x => x.from !== today); d.nutritionGoals.push(g);
    changes.push('Metas nutricionais (valem a partir de hoje)');
  }

  let scheduleTouched = false;
  const daysOf = sch => Object.keys(sch || {}).filter(k => sch[k]).map(Number).sort();
  const oldDays = daysOf(d.schedule);
  if (setup.plans) {
    d.plans = setup.plans.map(p => ({ id: p.id, name: p.name, warmup: p.warmup, notes: p.notes, exercises: p.exercises.map(e => ({ id: uid(), name: e.name, sets: e.sets, reps: e.reps })) }));
    const ids = new Set(d.plans.map(p => p.id));
    Object.keys(d.schedule || {}).forEach(k => { if (!ids.has(d.schedule[k])) { delete d.schedule[k]; scheduleTouched = true; } });
    changes.push(d.plans.length + ' plano(s) de treino');
  }
  if (setup.schedule) {
    const ids = new Set(d.plans.map(p => p.id)), sch = {};
    Object.keys(setup.schedule).forEach(k => { if (ids.has(setup.schedule[k])) sch[k] = setup.schedule[k]; });
    d.schedule = sch; scheduleTouched = true;
    changes.push('Dias de treino');
  }
  if (scheduleTouched || first) {
    const from = first ? d.profile.startDate : today;
    const entry = { from, schedule: JSON.parse(JSON.stringify(d.schedule || {})) };
    d.scheduleHistory = first ? [entry] : (d.scheduleHistory || []).filter(h => h.from !== today).concat([entry]);
  }

  // lembrete de treino que seguia os dias antigos passa a seguir os novos (a não ser que o código traga outros dias)
  if (scheduleTouched) {
    const rem = (d.settings.reminders || []).find(x => x.id === 'treino');
    if (rem && Array.isArray(rem.days) && JSON.stringify(rem.days.slice().sort()) === JSON.stringify(oldDays)) rem.days = daysOf(d.schedule);
  }
  if (setup.rest) {
    const r = setup.rest, st = d.settings;
    if (r.enabled !== undefined) st.restEnabled = r.enabled;
    if (r.mode !== undefined) st.restMode = r.mode;
    if (r.seconds !== undefined) st.restSeconds = r.seconds;
    if (r.base !== undefined) st.restBase = r.base;
    if (r.step !== undefined) st.restStep = r.step;
    if (st.restMode === 'prog') { if (st.restBase == null) st.restBase = 45; if (st.restStep == null) st.restStep = 15; }
    changes.push('Descanso entre séries');
  }
  if (setup.reminders) {
    setup.reminders.forEach(r => {
      const cur = (d.settings.reminders || []).find(x => x.id === r.id);
      if (!cur) return;
      ['enabled', 'hour', 'minute', 'days', 'title', 'text'].forEach(k => { if (r[k] !== undefined) cur[k] = r[k]; });
    });
    changes.push('Lembretes');
  }
  if (setup.medication) {
    if (!isObj(d.medication)) d.medication = { startDate: '', weekday: '', doseText: '', notes: '' };
    Object.assign(d.medication, setup.medication);
    changes.push('Dados do tratamento');
  }

  if (setup.foods) {
    let added = 0, updated = 0;
    setup.foods.forEach(f => {
      const cur = d.foods.find(x => norm(x.name) === norm(f.name));
      if (cur) { Object.assign(cur, { base: f.base, kcal: f.kcal, p: f.p, c: f.c, f: f.f, units: f.units.length ? f.units : (cur.base === f.base ? cur.units || [] : []), source: 'IA (estimativa)' }); updated++; }
      else { d.foods.push({ id: 'ia' + uid(), name: f.name, base: f.base, kcal: f.kcal, p: f.p, c: f.c, f: f.f, units: f.units, source: 'IA (estimativa)' }); added++; }
    });
    changes.push('Alimentos: ' + added + ' novo(s)' + (updated ? ', ' + updated + ' atualizado(s)' : ''));
  }
  if (setup.mealPlan) {
    d.mealPlan = setup.mealPlan.map(m => ({
      id: uid(), label: m.label, time: m.time, notes: m.notes,
      items: m.items.map(it => {
        const food = it.foodName ? d.foods.find(f => norm(f.name) === norm(it.foodName)) : null;
        const label = [it.qty, it.grams != null && !(it.qty && /\d\s*(g|ml)\b/i.test(it.qty)) ? (it.qty ? '(~' : '') + numBr(it.grams) + ' ' + (food ? food.base : 'g') + (it.qty ? ')' : '') : null].filter(Boolean).join(' ');
        const calc = food && it.grams != null ? C.itemCalc(food, it.grams) : { kcal: it.kcal, p: it.p, c: it.c, f: it.f };
        const linked = !!(food && it.grams != null);
        return { foodId: linked ? food.id : null, name: food ? food.name : it.name, amount: linked ? it.grams : null, unitName: linked ? food.base : null, grams: it.grams, amountLabel: label, estimated: !linked,
          kcal: calc.kcal, p: calc.p, c: calc.c, f: calc.f, kcalSource: linked ? null : (it.kcal != null ? 'informado' : null) };
      })
    }));
    changes.push(d.mealPlan.length ? 'Cardápio com ' + d.mealPlan.length + ' refeição(ões)' : 'Cardápio removido');
  }
  if (setup.theme) { d.settings.theme = setup.theme; changes.push('Tema'); }

  d.settings.onboarded = true;
  d.settings.setupAt = opts.now || new Date().toISOString();
  return { db: d, changes };
};

// ------------------------------------------------------------------ configuração atual no formato da IA
S.exportSetup = (db, opts) => {
  opts = opts || {};
  const today = opts.today || C.today();
  const p = db.profile || {};
  const weights = (db.weights || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const cur = weights.length ? weights[weights.length - 1].kg : p.startWeight;
  const goal = (db.nutritionGoals || []).filter(x => x.from <= today).sort((a, b) => a.from.localeCompare(b.from)).pop() || {};
  const st = db.settings || {};
  const out = { app: S.APP_ID, tipo: 'configuracao', formato: S.SETUP_FORMAT };
  out.perfil = { nome: p.name || '', idade: p.age == null ? null : p.age, sexo: p.sex || null, alturaCm: p.heightCm == null ? null : p.heightCm, pesoInicialKg: p.startWeight, pesoAtualKg: cur, pesoDesejadoKg: p.targetWeight, dataInicio: p.startDate };
  out.metas = { kcal: goal.kcal == null ? null : goal.kcal, proteinaG: goal.protein == null ? null : goal.protein, carboidratosG: goal.carbs == null ? null : goal.carbs, gordurasG: goal.fat == null ? null : goal.fat, aguaMl: goal.water == null ? null : goal.water };
  out.planos = (db.plans || []).map(pl => ({ id: pl.id, nome: pl.name, aquecimento: pl.warmup || '', orientacoes: pl.notes || '', exercicios: (pl.exercises || []).map(e => ({ nome: e.name, series: e.sets, repeticoes: String(e.reps == null ? '' : e.reps) })) }));
  out.diasDeTreino = {};
  for (let i = 1; i <= 7; i++) out.diasDeTreino[WD_KEYS[i]] = (db.schedule || {})[i] || null;
  out.descanso = { ativo: st.restEnabled !== false, modo: st.restMode === 'prog' ? 'progressivo' : 'fixo', segundos: st.restSeconds || 90, baseSegundos: st.restBase != null ? st.restBase : 45, acrescimoSegundos: st.restStep != null ? st.restStep : 15 };
  out.lembretes = (st.reminders || []).filter(r => S.REMINDER_IDS.includes(r.id)).map(r => ({ id: r.id, ativo: !!r.enabled, horario: C.pad(r.hour) + ':' + C.pad(r.minute), dias: (r.days || []).map(x => WD_KEYS[x]), titulo: r.title || '', texto: r.text || '' }));
  if (opts.health !== false) {
    const m = db.medication || {};
    out.tratamento = { medicamento: m.name || '', dataInicio: m.startDate || null, diaAplicacao: m.weekday ? WD_KEYS[Number(m.weekday)] || null : null, dosePrescrita: m.doseText || '', observacoes: m.notes || '' };
  }
  out.cardapio = (db.mealPlan || []).map(m => ({ refeicao: m.label, horario: m.time || '', observacoes: m.notes || '', itens: (m.items || []).map(i => ({ alimento: i.name, quantidade: i.amountLabel || '', gramas: i.grams == null ? null : i.grams, kcal: i.kcal == null ? null : Math.round(i.kcal), proteinaG: i.p == null ? null : round1(i.p), carboidratosG: i.c == null ? null : round1(i.c), gordurasG: i.f == null ? null : round1(i.f) })) }));
  if (opts.foods) out.alimentos = (db.foods || []).map(f => ({ nome: f.name, base: f.base, kcal: f.kcal, proteinaG: f.p, carboidratosG: f.c, gordurasG: f.f, medidas: (f.units || []).map(u => ({ nome: u.name, gramas: u.g })) }));
  out.tema = st.theme === 'light' ? 'claro' : st.theme === 'dark' ? 'escuro' : 'auto';
  return out;
};

// Resumo do progresso em texto simples, para a IA ter contexto na atualização.
S.progressSummary = (db, opts) => {
  opts = opts || {};
  const today = opts.today || C.today();
  const p = db.profile || {}, L = [];
  const weights = (db.weights || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const cur = weights.length ? weights[weights.length - 1] : null;
  L.push('- Peso: inicial ' + numBr(p.startWeight) + ' kg em ' + fmtBr(p.startDate) + '; ' + (cur ? 'atual ' + numBr(cur.kg) + ' kg (registro de ' + fmtBr(cur.date) + ', variação de ' + (cur.kg - p.startWeight > 0 ? '+' : '') + numBr(cur.kg - p.startWeight) + ' kg)' : 'sem pesagens registradas') + '; desejado ' + numBr(p.targetWeight) + ' kg.');
  const w28 = weights.filter(w => w.date >= C.addDays(today, -27));
  if (w28.length >= 2) L.push('- Peso nos últimos 28 dias: de ' + numBr(w28[0].kg) + ' para ' + numBr(w28[w28.length - 1].kg) + ' kg (' + w28.length + ' pesagens).');
  if (C.isDate(p.startDate)) {
    const from = C.addDays(today, -27) < p.startDate ? p.startDate : C.addDays(today, -27);
    if (from <= today) {
      const a = C.adherence(db, from, today, today);
      L.push('- Treinos desde ' + fmtBr(from) + ': ' + a.fulfilled + ' de ' + a.planned + ' dias planejados cumpridos' + (a.rate != null ? ' (' + Math.round(a.rate * 100) + '%)' : '') + '; ' + a.extras.length + ' extra(s), ' + a.postponed.length + ' adiado(s), ' + a.notDone.length + ' não realizado(s), ' + a.unregistered.length + ' sem registro.');
      const names = [...new Set((db.sessions || []).filter(s => C.isAttended(s) && s.date >= from && s.date <= today).flatMap(s => (s.exercises || []).map(e => e.name)))].slice(0, 15);
      const lines = names.map(n => {
        const tr = C.strengthTrend(C.exerciseEntries(db, n, from, today));
        if (tr.n < 1) return null;
        const e = C.exerciseEntries(db, n, from, today), last = e[e.length - 1];
        return n + ': ' + C.TREND_LABEL[tr.status] + (last ? ' (última: ' + (last.topKg != null ? numBr(last.topKg) + ' kg × ' : '') + (last.repsAtTop != null ? last.repsAtTop : '?') + ' reps, ' + last.nSets + ' séries' + (last.rpe ? ', esforço ' + last.rpe + '/10' : '') + ')' : '');
      }).filter(Boolean);
      if (lines.length) L.push('- Força por exercício:\n' + lines.map(x => '    · ' + x).join('\n'));
    }
  }
  let n = 0; const sum = { kcal: 0, p: 0, c: 0, f: 0 }; let wd = 0, wsum = 0;
  for (let i = 0; i < 14; i++) {
    const t = C.dayTotals(db, C.addDays(today, -i));
    if (t.nMeals) { n++; sum.kcal += t.kcal; sum.p += t.p; sum.c += t.c; sum.f += t.f; }
    if (t.water) { wd++; wsum += t.water; }
  }
  L.push('- Alimentação registrada nos últimos 14 dias: ' + (n ? n + ' dia(s) com registro; média de ' + Math.round(sum.kcal / n) + ' kcal, ' + Math.round(sum.p / n) + ' g de proteína, ' + Math.round(sum.c / n) + ' g de carboidratos e ' + Math.round(sum.f / n) + ' g de gorduras por dia registrado (registros podem estar incompletos)' : 'nenhum registro') + '.');
  L.push('- Água nos últimos 14 dias: ' + (wd ? 'média de ' + Math.round(wsum / wd) + ' ml em ' + wd + ' dia(s) com registro' : 'sem registros') + '.');
  const en = (db.energyLogs || []).filter(e => e.date >= C.addDays(today, -13) && e.date <= today);
  if (en.length) {
    const sl = en.filter(e => e.sleepHours != null);
    L.push('- Energia média (1 a 5): ' + numBr(en.reduce((a, e) => a + e.energy, 0) / en.length) + (sl.length ? '; sono médio ' + numBr(sl.reduce((a, e) => a + e.sleepHours, 0) / sl.length) + ' h' : '') + ' (' + en.length + ' registros em 14 dias).');
  }
  if (opts.health !== false) {
    const sy = (db.symptomLogs || []).filter(s => s.date >= C.addDays(today, -27) && s.date <= today);
    if (sy.length) {
      const count = {};
      sy.forEach(s => Object.keys(s.symptoms || {}).forEach(k => { if (s.symptoms[k] > 0) count[k] = (count[k] || 0) + 1; }));
      const top = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 6).map(k => k.replace(/_/g, ' ') + ' (' + count[k] + '×)');
      L.push('- Sintomas registrados em 28 dias: ' + sy.length + ' registro(s)' + (top.length ? ': ' + top.join(', ') : '') + '.');
    }
  }
  return L.join('\n');
};

// ------------------------------------------------------------------ prompt
const MODEL = [
  '{',
  '  "app": "CylGymly", "tipo": "configuracao", "formato": 1,',
  '  "perfil": { "nome": "Ana", "idade": 30, "sexo": "Feminino", "alturaCm": 165, "pesoInicialKg": 78.5, "pesoAtualKg": 78.5, "pesoDesejadoKg": 68, "dataInicio": "AAAA-MM-DD" },',
  '  "metas": { "kcal": 1800, "proteinaG": 120, "carboidratosG": 190, "gordurasG": 60, "aguaMl": 2500 },',
  '  "planos": [',
  '    { "id": "A", "nome": "Treino A — pernas", "aquecimento": "5 minutos de caminhada leve", "orientacoes": "Descanso de 60 a 90 s. Termine cada série sentindo que ainda faria 2 ou 3 repetições.",',
  '      "exercicios": [ { "nome": "Leg press", "series": 3, "repeticoes": "10-12" }, { "nome": "Mesa flexora", "series": 3, "repeticoes": "12" } ] }',
  '  ],',
  '  "diasDeTreino": { "seg": "A", "ter": null, "qua": "B", "qui": null, "sex": "C", "sab": null, "dom": null },',
  '  "descanso": { "ativo": true, "modo": "fixo", "segundos": 90, "baseSegundos": 45, "acrescimoSegundos": 15 },',
  '  "lembretes": [',
  '    { "id": "treino", "ativo": true, "horario": "18:00", "dias": ["seg", "qua", "sex"] },',
  '    { "id": "refeicoes", "ativo": true, "horario": "20:30", "dias": [] },',
  '    { "id": "agua", "ativo": true, "horario": "15:00", "dias": [] },',
  '    { "id": "aplicacao", "ativo": false, "horario": "09:00", "dias": ["seg"] }',
  '  ],',
  '  "tratamento": { "medicamento": "", "dataInicio": null, "diaAplicacao": null, "dosePrescrita": "", "observacoes": "" },',
  '  "alimentos": [',
  '    { "nome": "Ovo cozido", "base": "g", "kcal": 146, "proteinaG": 13.3, "carboidratosG": 0.6, "gordurasG": 9.5, "medidas": [ { "nome": "unidade", "gramas": 50 } ] },',
  '    { "nome": "Leite desnatado", "base": "ml", "kcal": 35, "proteinaG": 3.4, "carboidratosG": 4.9, "gordurasG": 0.1, "medidas": [ { "nome": "copo", "gramas": 200 } ] }',
  '  ],',
  '  "cardapio": [',
  '    { "refeicao": "Café da manhã", "horario": "07:00", "observacoes": "",',
  '      "itens": [ { "alimento": "Ovo cozido", "quantidade": "2 unidades", "gramas": 100, "kcal": 146, "proteinaG": 13.3, "carboidratosG": 0.6, "gordurasG": 9.5 } ] }',
  '  ],',
  '  "tema": "auto"',
  '}'
].join('\n');

const FIELD_RULES = [
  '- "perfil": idade em anos inteiros; alturaCm de 100 a 250; pesos em kg de 30 a 400; sexo "Masculino" ou "Feminino"; dataInicio no formato AAAA-MM-DD.',
  '- "metas": valores DIÁRIOS. kcal de 0 a 20000; proteinaG, carboidratosG e gordurasG em gramas; aguaMl em mililitros.',
  '- "planos": de 1 a 12 treinos. "id" é uma letra (A, B, C...). Cada exercício tem "series" (inteiro de 1 a 20) e "repeticoes" como texto ("12", "10-12", "30 s").',
  '- "diasDeTreino": para cada dia (seg, ter, qua, qui, sex, sab, dom), o "id" do treino ou null para descanso.',
  '- "descanso": cronômetro entre séries. modo "fixo" usa "segundos" (45, 60, 75, 90, 120, 150 ou 180). modo "progressivo" usa "baseSegundos" (30, 45, 60, 75, 90 ou 120) e "acrescimoSegundos" por série (5, 10, 15, 20, 30, 45 ou 60).',
  '- "lembretes": os quatro "id" possíveis são "treino", "refeicoes", "agua" e "aplicacao". "horario" em HH:MM (24 h). "dias" vazio significa todos os dias.',
  '- "tratamento": preencha SOMENTE com o que eu disser que meu médico prescreveu. "diaAplicacao" é um dia da semana (seg...dom) ou null. Se eu não uso medicamento, deixe os campos vazios.',
  '- "alimentos": valores por 100 g (ou por 100 ml quando "base" for "ml"), no estado em que o alimento é consumido (cozido, grelhado, cru...). kcal de 0 a 900; proteinaG, carboidratosG e gordurasG de 0 a 100, sem somar mais de 100. Em "medidas", coloque pelo menos uma medida caseira com o peso em gramas (ou ml).',
  '- "cardapio": um dia típico de alimentação. Em cada item, "quantidade" é a porção em palavras, "gramas" é o peso dessa porção, e kcal, proteinaG, carboidratosG e gordurasG são os valores DESSA PORÇÃO (não por 100 g). O "alimento" deve ter exatamente o mesmo nome usado em "alimentos" (ou na lista de alimentos do app).',
  '- "tema": "auto", "claro" ou "escuro".'
].join('\n');

S.buildPrompt = (db, opts) => {
  opts = opts || {};
  const today = opts.today || C.today();
  const update = opts.mode === 'update';
  const foods = (db && db.foods) || [];
  const P = [];
  if (!update) {
    P.push('Você vai me ajudar a configurar o aplicativo Cyl Gymly, que uso para acompanhar treino, alimentação, peso e saúde. O app não tem inteligência artificial própria: você faz as perguntas, monta meu plano e, no final, gera um código JSON que eu vou colar no app para preencher tudo de uma vez.');
    P.push('COMO CONDUZIR A CONVERSA\n' +
      '1. Faça as perguntas em blocos curtos, de 3 a 5 perguntas por mensagem, em português simples, e espere minha resposta antes de seguir.\n' +
      '2. Se eu não souber ou não quiser responder algo, siga em frente e deixe esse campo de fora.\n' +
      '3. Siga esta ordem:\n' +
      '   a) Dados pessoais: nome (opcional), idade, sexo, altura, peso atual e peso desejado.\n' +
      '   b) Objetivo e rotina de treino: objetivo principal, experiência com musculação, quantos dias por semana e quais dias, quanto tempo por treino, onde treino e com quais equipamentos, lesões, dores ou limitações.\n' +
      '   c) Saúde: condições de saúde, medicamentos em uso (só o que foi prescrito pelo médico) e se tenho acompanhamento profissional.\n' +
      '   d) Alimentação: quantas refeições faço e em que horários, o que costumo comer em cada uma, alimentos de que gosto, que não como ou não posso comer, alergias e restrições, orçamento, se cozinho ou como fora, e quanta água bebo.\n' +
      '   e) Preferências do app: se quero lembretes (treino, refeições, água) e em quais horários, e quanto tempo de descanso entre as séries.\n' +
      '4. Antes de gerar o código, mostre um resumo curto do que você montou (metas diárias, divisão dos treinos e cardápio com calorias e proteína por refeição) e pergunte se quero ajustar algo.\n' +
      '5. Só depois da minha confirmação, gere o código final.');
  } else {
    P.push('Eu uso o aplicativo Cyl Gymly para acompanhar treino, alimentação, peso e saúde. Quero revisar e atualizar minha configuração. Abaixo estão os dados atuais do app e um resumo do meu progresso. No final, você vai gerar um código JSON que eu colo no app para atualizar tudo de uma vez.');
    const req = text(opts.request, 1500);
    P.push('O QUE EU QUERO MUDAR AGORA\n' + (req || 'Quero uma revisão geral: veja meu progresso e proponha ajustes nas metas, nos treinos e no cardápio.'));
    P.push('COMO CONDUZIR A CONVERSA\n' +
      '1. Leia os dados abaixo antes de perguntar. Não pergunte o que já está respondido neles.\n' +
      '2. Faça só as perguntas necessárias para entender o que mudou (de 3 a 5 por mensagem) e espere minha resposta.\n' +
      '3. Antes de gerar o código, mostre um resumo curto das mudanças propostas e o motivo de cada uma, e pergunte se quero ajustar algo.\n' +
      '4. Só depois da minha confirmação, gere o código final.');
  }
  P.push('CUIDADOS IMPORTANTES\n' +
    '- Metas de calorias, proteína, carboidratos, gorduras e água são estimativas. Diga em poucas palavras como chegou a elas. Prefira metas moderadas e sustentáveis; não proponha dietas extremas nem perda de peso muito rápida.\n' +
    '- Se eu tiver alguma condição de saúde ou usar medicamento, lembre que as metas devem ser confirmadas com meu médico ou nutricionista.\n' +
    '- Nunca sugira, calcule ou altere dose de medicamento. Registre apenas o que eu disser que foi prescrito.\n' +
    '- Monte treinos compatíveis com meu nível, meu tempo e minhas limitações. Para iniciantes, comece com volume baixo.');
  P.push('ALIMENTOS E VALORES NUTRICIONAIS\n' +
    '- Monte o cardápio com alimentos que eu realmente como e que cabem no meu orçamento.\n' +
    '- Todo alimento precisa vir com calorias, proteína, carboidratos e gorduras. Use como referência a Tabela Brasileira de Composição de Alimentos (TACO) ou o rótulo do produto. Se não tiver certeza de um valor, use a melhor estimativa e me avise fora do código.\n' +
    '- Inclua em "alimentos" todos os alimentos do cardápio e os outros que eu disser que como com frequência' + (foods.length ? ', exceto os que já estão na lista do app abaixo (esses você pode usar no cardápio com o mesmo nome)' : '') + '.\n' +
    '- A soma do cardápio deve ficar próxima das metas diárias, principalmente a proteína.');
  if (foods.length) P.push('ALIMENTOS QUE JÁ ESTÃO NO APP (nome | base | kcal | proteína | carboidratos | gorduras, por 100 g ou 100 ml)\n' + foods.slice(0, 200).map(f => f.name + ' | ' + f.base + ' | ' + round1(f.kcal) + ' | ' + round1(f.p) + ' | ' + round1(f.c) + ' | ' + round1(f.f)).join('\n'));
  if (update) {
    P.push('MINHA CONFIGURAÇÃO ATUAL (no mesmo formato do código que você vai gerar)\n' + JSON.stringify(S.exportSetup(db, { today, health: opts.health !== false })));
    P.push('RESUMO DO MEU PROGRESSO (gerado pelo app em ' + fmtBr(today) + ')\n' + S.progressSummary(db, { today, health: opts.health !== false }));
  }
  P.push('FORMATO DA RESPOSTA FINAL\n' +
    '- Entregue um único bloco de código JSON válido. Dentro do bloco: sem comentários, sem texto explicativo, aspas duplas, ponto como separador decimal (78.5), datas como AAAA-MM-DD e horários como HH:MM.\n' +
    '- Use exatamente os nomes de campos do modelo abaixo. Os valores do modelo são só exemplos.\n' +
    (update
      ? '- Envie só as seções que mudam; o que ficar de fora continua como está no app. Atenção: "planos" e "cardapio" substituem a lista inteira, então, se mexer em um treino ou em uma refeição, envie a lista completa. Em "alimentos", envie só os novos ou corrigidos.\n' +
        '- Não mude "dataInicio" nem "pesoInicialKg", a não ser que eu peça. Se eu informar meu peso de hoje, coloque em "pesoAtualKg".\n'
      : '- Preencha todas as seções que conseguir. Deixe de fora uma seção inteira se eu não quiser configurá-la. Use a data de hoje em "dataInicio", a não ser que eu diga que comecei antes, e repita meu peso atual em "pesoInicialKg".\n') +
    '- Depois do bloco de código, diga apenas: “Copie o código acima e cole no Cyl Gymly.”');
  P.push('MODELO DO CÓDIGO\n' + MODEL);
  P.push('REGRAS DOS CAMPOS\n' + FIELD_RULES);
  P.push(update ? 'Comece lendo meus dados e fazendo as primeiras perguntas.' : 'Comece agora com o primeiro bloco de perguntas.');
  return P.join('\n\n');
};

if (typeof module !== 'undefined' && module.exports) module.exports = S;
else root.HSetup = S;
})(typeof window !== 'undefined' ? window : this);
