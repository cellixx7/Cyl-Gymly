// Testes unitários das regras (core.js). Rodar: node --test tests/unit
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const H = require(path.join(__dirname, '../../app/src/main/assets/www/core.js'));
// Usa os planos e alimentos reais do app
global.window = {};
require(path.join(__dirname, '../../app/src/main/assets/www/foods.js'));

function baseDb(over) {
  return Object.assign({
    version: 2,
    profile: { startDate: '2026-11-09', startWeight: 115, targetWeight: 90, heightCm: 173, age: 22 },
    schedule: { 1: 'A', 3: 'B', 5: 'C' },
    scheduleHistory: [{ from: '2026-11-09', schedule: { 1: 'A', 3: 'B', 5: 'C' } }],
    plans: [{ id: 'A', name: 'A', exercises: [{ name: 'Supino', sets: 2, reps: '12' }] }, { id: 'B', name: 'B', exercises: [] }, { id: 'C', name: 'C', exercises: [] }],
    sessions: [], meals: [], water: [], foods: [], weights: [], measurements: [], medLogs: [], symptomLogs: [], energyLogs: [], reviews: [], nutritionGoals: [],
    settings: { reminders: [] }, medication: {}
  }, over || {});
}
let n = 0;
const ses = (date, status, extra) => Object.assign({ id: 's' + (++n), date, planId: 'A', planName: 'A', status, exercises: [] }, extra || {});

// ------------------------------------------------------------ datas
test('datas: virada de mês, de ano e ano bissexto', () => {
  assert.equal(H.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(H.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(H.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(H.addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(H.diffDays('2026-11-09', '2026-12-07'), 28);
});
test('datas: horário de verão não desloca o dia (meio-dia local)', () => {
  // qualquer fuso: somar 1 dia 400 vezes deve dar exatamente 400 dias
  let d = '2026-01-01'; for (let i = 0; i < 400; i++) d = H.addDays(d, 1);
  assert.equal(H.diffDays('2026-01-01', d), 400);
});
test('datas: semana começa na segunda; domingo = 7', () => {
  assert.equal(H.wd('2026-11-09'), 1);
  assert.equal(H.wd('2026-11-15'), 7);
  assert.equal(H.weekStart('2026-11-15'), '2026-11-09');
  assert.equal(H.weekStart('2027-01-01'), '2026-12-28'); // semana atravessando o ano
});
test('datas: validação rejeita datas impossíveis', () => {
  assert.ok(H.isDate('2028-02-29'));
  assert.ok(!H.isDate('2027-02-29'));
  assert.ok(!H.isDate('2026-13-01'));
  assert.ok(!H.isDate('ontem'));
  assert.ok(!H.isDate('2026-1-1'));
  assert.ok(H.isTime('23:59')); assert.ok(!H.isTime('24:00')); assert.ok(!H.isTime('7:00'));
});
test('datas: data local de um ISO', () => {
  const iso = new Date(2026, 10, 9, 23, 30).toISOString();
  assert.equal(H.localDateOfIso(iso), '2026-11-09');
  assert.equal(H.localDateOfIso('lixo'), null);
});

// ------------------------------------------------------------ números
test('números: vírgula e ponto decimais', () => {
  assert.equal(H.num('114,5'), 114.5);
  assert.equal(H.num('114.5'), 114.5);
  assert.equal(H.num(' 80 '), 80);
});
test('números: rejeita separador de milhar, texto, NaN, Infinity, notação científica', () => {
  for (const bad of ['1.234,5', '1,234.5', 'abc', '12a', 'NaN', 'Infinity', '1e3', '--1', '1,2,3']) {
    assert.equal(H.parseNumber(bad).valid, false, bad);
  }
  assert.equal(H.parseNumber(NaN).valid, false);
  assert.equal(H.parseNumber(Infinity).valid, false);
});
test('números: vazio é "não informado", não zero', () => {
  assert.deepEqual(H.check('weight', ''), { ok: true, value: null });
  assert.equal(H.check('weight', '', { required: true }).ok, false);
});
test('números: faixas e inteiros', () => {
  assert.equal(H.check('weight', '29').ok, false);
  assert.equal(H.check('weight', '400').ok, true);
  assert.equal(H.check('weight', '401').ok, false);
  assert.equal(H.check('waterMl', '250,5').ok, false); // água em ml inteiro
  assert.equal(H.check('sets', '2').value, 2);
  assert.equal(H.check('sets', '0').ok, false);
  assert.equal(H.check('qty', '0').ok, false);
  assert.equal(H.check('kg', '-5').ok, false);
  assert.match(H.check('weight', 'abc').msg, /números/);
});

// ------------------------------------------------------------ macros
test('macros: cálculo por 100 g', () => {
  const food = { kcal: 130, p: 2.5, c: 28, f: 0.2 };
  const r = H.itemCalc(food, 150);
  assert.equal(r.kcal, 195); assert.ok(Math.abs(r.p - 3.75) < 1e-9);
  assert.deepEqual(H.itemCalc(food, null), { kcal: null, p: null, c: null, f: null });
});
test('macros: item livre só com calorias mantém macros desconhecidos (null)', () => {
  const it = H.manualItem({ name: 'Marmita', kcal: 600 });
  assert.equal(it.kcal, 600); assert.equal(it.p, null); assert.equal(it.c, null); assert.equal(it.f, null);
  assert.equal(it.kcalSource, 'informado');
});
test('macros: kcal só é calculada (4/4/9) com os três macros', () => {
  assert.equal(H.manualItem({ name: 'x', p: 10, c: 20 }).kcal, null);
  const it = H.manualItem({ name: 'x', p: 10, c: 20, f: 5 });
  assert.equal(it.kcal, 165); assert.equal(it.kcalSource, 'calculado');
});
test('macros: totais parciais contam o que falta por nutriente', () => {
  const t = H.totals([{ kcal: 600, p: null, c: null, f: null }, { kcal: 100, p: 10, c: 5, f: 2, estimated: true }, { kcal: null, p: null, c: null, f: null }]);
  assert.equal(t.kcal, 700); assert.equal(t.p, 10);
  assert.equal(t.missing.kcal, 1); assert.equal(t.missing.p, 2);
  assert.equal(t.noValues, 1); assert.ok(t.partial); assert.ok(t.estimated);
});
test('macros: zero informado é diferente de não informado', () => {
  const t = H.totals([{ kcal: 0, p: 0, c: 0, f: 0 }]);
  assert.equal(t.partial, false); assert.equal(t.noValues, 0);
});

// ------------------------------------------------------------ água
test('água: soma do dia e "sem registro" separado', () => {
  const db = baseDb({ water: [{ id: 'w1', date: '2026-11-09', ml: 300 }, { id: 'w2', date: '2026-11-09', ml: 200 }, { id: 'w3', date: '2026-11-10', ml: 500 }] });
  const t = H.dayTotals(db, '2026-11-09');
  assert.equal(t.water, 500); assert.equal(t.nWater, 2);
  const e = H.dayTotals(db, '2026-11-11');
  assert.equal(e.water, 0); assert.equal(e.nWater, 0); // tela mostra "sem registro", não "bebeu 0"
});

// ------------------------------------------------------------ frequência
test('frequência: semana normal 3 de 3', () => {
  const db = baseDb({ sessions: [ses('2026-11-09', 'concluida'), ses('2026-11-11', 'concluida'), ses('2026-11-13', 'parcial')] });
  const a = H.adherence(db, '2026-11-09', '2026-11-15', '2026-11-16');
  assert.equal(a.planned, 3); assert.equal(a.fulfilled, 3); assert.equal(a.rate, 1);
  assert.deepEqual(a.partialDays, ['2026-11-13']);
});
test('frequência: dois treinos no mesmo dia contam um dia; nunca passa de 100%', () => {
  const db = baseDb({ sessions: [ses('2026-11-09', 'concluida'), ses('2026-11-09', 'concluida'), ses('2026-11-10', 'concluida'), ses('2026-11-11', 'concluida'), ses('2026-11-13', 'concluida')] });
  const a = H.adherence(db, '2026-11-09', '2026-11-15', '2026-11-16');
  assert.equal(a.fulfilled, 3); assert.equal(a.rate, 1); assert.deepEqual(a.extras, ['2026-11-10']);
});
test('frequência: remarcação na mesma semana cobre o dia perdido', () => {
  const db = baseDb({ sessions: [ses('2026-11-10', 'concluida'), ses('2026-11-11', 'concluida'), ses('2026-11-13', 'concluida')] });
  const a = H.adherence(db, '2026-11-09', '2026-11-15', '2026-11-16');
  assert.equal(a.fulfilled, 3); assert.deepEqual(a.makeups, [{ planned: '2026-11-09', done: '2026-11-10' }]); assert.equal(a.extras.length, 0);
});
test('frequência: remarcação explícita (makeupFor) tem prioridade', () => {
  const db = baseDb({ sessions: [ses('2026-11-12', 'concluida', { makeupFor: '2026-11-11' }), ses('2026-11-13', 'concluida')] });
  const a = H.adherence(db, '2026-11-09', '2026-11-15', '2026-11-16');
  assert.deepEqual(a.makeups.find(m => m.done === '2026-11-12'), { planned: '2026-11-11', done: '2026-11-12' });
  assert.deepEqual(a.unregistered, ['2026-11-09']);
});
test('frequência: treino de outra semana não cobre falta', () => {
  const db = baseDb({ sessions: [ses('2026-11-17', 'concluida')] });
  const a = H.adherence(db, '2026-11-09', '2026-11-22', '2026-11-23');
  assert.ok(a.unregistered.includes('2026-11-09'));
  assert.ok(a.makeups.every(m => H.weekStart(m.planned) === H.weekStart(m.done)));
});
test('frequência: adiado, não realizado e sem registro ficam separados e não contam como feitos', () => {
  const db = baseDb({ sessions: [ses('2026-11-09', 'adiada'), ses('2026-11-11', 'nao_realizada')] });
  const a = H.adherence(db, '2026-11-09', '2026-11-15', '2026-11-16');
  assert.deepEqual(a.postponed, ['2026-11-09']); assert.deepEqual(a.notDone, ['2026-11-11']); assert.deepEqual(a.unregistered, ['2026-11-13']);
  assert.equal(a.fulfilled, 0); assert.equal(a.rate, 0);
});
test('frequência: hoje só entra depois de feito', () => {
  const db = baseDb();
  const a = H.adherence(db, '2026-11-09', '2026-11-15', '2026-11-09');
  assert.equal(a.planned, 0); assert.equal(a.pendingToday, '2026-11-09'); assert.equal(a.rate, null); assert.equal(a.futurePlanned, 2);
  db.sessions.push(ses('2026-11-09', 'concluida'));
  assert.equal(H.adherence(db, '2026-11-09', '2026-11-15', '2026-11-09').rate, 1);
});
test('frequência: mudar os dias não reescreve o passado', () => {
  const db = baseDb();
  db.schedule = { 2: 'A', 4: 'B', 6: 'C' };
  db.scheduleHistory.push({ from: '2026-11-16', schedule: { 2: 'A', 4: 'B', 6: 'C' } });
  assert.equal(H.plannedFor(db, '2026-11-09'), 'A'); // segunda da semana antiga
  assert.equal(H.plannedFor(db, '2026-11-16'), null); // segunda da semana nova
  assert.equal(H.plannedFor(db, '2026-11-17'), 'A');
  assert.equal(H.plannedFor(db, '2026-11-01'), null); // antes do início
});
test('frequência: nunca aumenta sozinha (nenhuma função altera a grade)', () => {
  const db = baseDb({ sessions: Array.from({ length: 28 }, (_, i) => ses(H.addDays('2026-11-09', i), 'concluida')) });
  const before = JSON.stringify(db.schedule) + JSON.stringify(db.scheduleHistory);
  H.adherence(db, '2026-11-09', '2026-12-06', '2026-12-07');
  assert.equal(JSON.stringify(db.schedule) + JSON.stringify(db.scheduleHistory), before);
});

// ------------------------------------------------------------ força
const ex = (date, sets, extra) => ses(date, 'concluida', Object.assign({ exercises: [{ name: 'Supino', rpe: 7, sets: sets.map(([kg, reps]) => ({ kg: String(kg), reps: String(reps), done: true })) }] }, extra || {}));
test('força: mais carga com mesmas reps = melhor; menos reps na mesma carga = pior', () => {
  const db = baseDb({ sessions: [ex('2026-11-09', [[20, 12], [20, 12]]), ex('2026-11-11', [[22, 12], [22, 12]]), ex('2026-11-13', [[22, 10]])] });
  const e = H.exerciseEntries(db, 'supino');
  assert.equal(H.compareEntries(e[0], e[1]), 'melhor');
  assert.equal(H.compareEntries(e[1], e[2]), 'pior');
});
test('força: mais carga com menos reps é inconclusivo; mesma carga/reps com mais séries é melhor', () => {
  const a = { topKg: 20, repsAtTop: 12, nSets: 2 }, b = { topKg: 25, repsAtTop: 8, nSets: 2 };
  assert.equal(H.compareEntries(a, b), 'inconclusivo');
  assert.equal(H.compareEntries(a, { topKg: 20, repsAtTop: 12, nSets: 3 }), 'melhor');
  assert.equal(H.compareEntries(a, { topKg: 20, repsAtTop: 12, nSets: 2 }), 'igual');
  assert.equal(H.compareEntries(a, { topKg: null, repsAtTop: 15, nSets: 2 }), 'inconclusivo');
});
test('força: sessões leves e não concluídas ficam fora da comparação', () => {
  const db = baseDb({ sessions: [ex('2026-11-09', [[20, 12]]), ex('2026-11-11', [[10, 12]], { light: true }), Object.assign(ex('2026-11-13', [[5, 5]]), { status: 'adiada' })] });
  assert.equal(H.exerciseEntries(db, 'Supino').length, 1);
});
test('força: carga digitada inválida é ignorada, não vira zero', () => {
  const db = baseDb({ sessions: [ex('2026-11-09', [['abc', 12], [20, 10]])] });
  const e = H.exerciseEntries(db, 'Supino')[0];
  assert.equal(e.topKg, 20); assert.equal(e.repsAtTop, 10);
});
test('força: dados insuficientes e queda persistente', () => {
  assert.equal(H.strengthTrend([]).status, 'insuficiente');
  assert.equal(H.strengthTrend([{ topKg: 20, repsAtTop: 12, nSets: 2 }]).status, 'insuficiente');
  const t = H.strengthTrend([{ topKg: 20, repsAtTop: 12, nSets: 2 }, { topKg: 20, repsAtTop: 10, nSets: 2 }, { topKg: 20, repsAtTop: 8, nSets: 2 }]);
  assert.equal(t.status, 'queda_persistente');
  assert.equal(H.strengthTrend([{ topKg: 20, repsAtTop: 12, nSets: 2 }, { topKg: 20, repsAtTop: 10, nSets: 2 }]).status, 'queda');
  assert.equal(H.TREND_LABEL.insuficiente, 'dados insuficientes');
});

// ------------------------------------------------------------ critérios da avaliação (frequência ≥ 80%)
test('avaliação: 80% de comparecimento em 4 semanas', () => {
  const days = H.datesBetween('2026-11-09', '2026-12-06').filter(d => [1, 3, 5].includes(H.wd(d))); // 12 dias
  const db = baseDb({ sessions: days.slice(0, 10).map(d => ses(d, 'concluida')) });
  const a = H.adherence(db, '2026-11-09', '2026-12-06', '2026-12-07');
  assert.equal(a.planned, 12); assert.equal(a.fulfilled, 10); assert.ok(a.rate >= 0.8);
  const db2 = baseDb({ sessions: days.slice(0, 9).map(d => ses(d, 'concluida')) });
  assert.ok(H.adherence(db2, '2026-11-09', '2026-12-06', '2026-12-07').rate < 0.8);
});

// ------------------------------------------------------------ validação da base, migração e backup
test('validação: base do app atual passa sem erros', () => {
  const foods = window.SEED_FOODS.map((f, i) => ({ id: 'f' + i, name: f[0], base: f[1], kcal: f[2], p: f[3], c: f[4], f: f[5], units: f[6].map(u => ({ name: u[0], g: u[1] })) }));
  const plans = window.SEED_PLANS.map(p => ({ id: p.id, name: p.name, exercises: p.exercises.map(e => ({ name: e[0], sets: e[1], reps: e[2] })) }));
  const db = baseDb({ foods, plans });
  assert.deepEqual(H.validateDb(db).errors, []);
});
test('validação: tipos errados, ids perigosos e datas inválidas são recusados', () => {
  assert.ok(H.validateDb(baseDb({ meals: 'x' })).errors.length);
  assert.ok(H.validateDb(baseDb({ weights: [{ id: 'w1', date: 'ontem', kg: 'abc' }] })).errors.length);
  const db = baseDb(); db.plans[0].id = 'A"><img src=x onerror=alert(1)>';
  assert.ok(H.validateDb(db).errors.some(e => /identificador/.test(e)));
  assert.ok(H.validateDb(baseDb({ water: [{ id: 'a', date: '2026-11-09', ml: 1 }, { id: 'a', date: '2026-11-09', ml: 1 }] })).errors.some(e => /repetido/.test(e)));
  assert.ok(H.validateDb(baseDb({ notes: 'x'.repeat(6000) })).errors.length);
  assert.ok(H.validateDb(null).errors.length);
});
test('migração: não destrutiva e idempotente', () => {
  const v1 = baseDb({ version: 1, meals: [{ id: 'm1', date: '2026-11-09', time: '07:00', items: [{ name: 'Pão', kcal: 150, p: 4, c: 29, f: 2 }] }] });
  delete v1.scheduleHistory; delete v1.settings.theme;
  const snap = JSON.stringify(v1);
  const m = H.migrate(v1);
  assert.equal(JSON.stringify(v1), snap, 'original intacto');
  assert.equal(m.version, 2); assert.equal(m.settings.theme, 'auto');
  assert.deepEqual(m.scheduleHistory, [{ from: '2026-11-09', schedule: v1.schedule }]);
  assert.deepEqual(m.meals, v1.meals);
  assert.deepEqual(H.migrate(m), m);
});
test('backup: arquivo cortado, de outro app, de versão mais nova ou grande demais é recusado', () => {
  const good = JSON.stringify({ app: 'TreinoSaude', format: 1, data: baseDb() });
  assert.equal(H.validateBackup(good.slice(0, good.length - 10)).ok, false);
  assert.equal(H.validateBackup(JSON.stringify({ app: 'Outro', data: baseDb() })).ok, false);
  const newer = H.validateBackup(JSON.stringify({ app: 'TreinoSaude', format: 2, data: baseDb() }));
  assert.equal(newer.ok, false); assert.ok(newer.incompatible);
  const newerDb = H.validateBackup(JSON.stringify({ app: 'TreinoSaude', data: baseDb({ version: 99 }) }));
  assert.ok(newerDb.incompatible);
  assert.equal(H.validateBackup('x'.repeat(100), { maxBytes: 50 }).ok, false);
  assert.equal(H.validateBackup('').ok, false);
});
test('backup: válido devolve resumo, migra e filtra fotos inválidas', () => {
  const db = baseDb({ version: 1, meals: [{ id: 'm1', date: '2026-11-09', time: '07:00', items: [], photoIds: ['p1', 'p2'] }], weights: [{ id: 'w1', date: '2026-11-10', kg: 114.5 }] });
  const r = H.validateBackup(JSON.stringify({ app: 'TreinoSaude', exportedAt: '2026-11-10T12:00:00Z', data: db, photos: { p1: 'data:image/jpeg;base64,AAAA', 'bad id': 'data:image/jpeg;base64,AAAA', p3: '<script>' } }));
  assert.ok(r.ok);
  assert.equal(r.summary.meals, 1); assert.equal(r.summary.weights, 1);
  assert.equal(r.summary.firstDate, '2026-11-09'); assert.equal(r.summary.lastDate, '2026-11-10');
  assert.deepEqual(Object.keys(r.photos), ['p1']);
  assert.deepEqual(r.summary.photoRefsMissingInFile, ['p2']);
  assert.equal(r.data.version, 2);
  assert.ok(r.warnings.some(w => /foto/.test(w)));
});
test('backup: formato antigo (v1.0, sem "format") continua aceito', () => {
  const r = H.validateBackup(JSON.stringify({ app: 'TreinoSaude', exportedAt: '2026-11-10T12:00:00Z', data: baseDb({ version: 1 }), photos: {} }));
  assert.ok(r.ok, r.errors.join());
});
test('texto: esc neutraliza HTML', () => {
  assert.equal(H.esc('<img src=x onerror="a">\'`&'), '&lt;img src=x onerror=&quot;a&quot;&gt;&#39;&#96;&amp;');
  assert.equal(H.esc(null), '');
});
