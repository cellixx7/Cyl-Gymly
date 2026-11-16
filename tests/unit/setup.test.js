// Testes unitários da configuração por prompt (setup.js). Rodar: node --test tests/unit/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const W = path.join(__dirname, '../../app/src/main/assets/www/');
const H = require(W + 'core.js');
const S = require(W + 'setup.js');

function baseDb(over) {
  return Object.assign({
    app: 'TreinoSaude', version: 3,
    profile: { name: '', age: null, sex: '', heightCm: null, startWeight: 80, targetWeight: 75, startDate: '2026-11-01' },
    schedule: { 1: 'A', 3: 'B' }, scheduleHistory: [{ from: '2026-11-01', schedule: { 1: 'A', 3: 'B' } }],
    plans: [{ id: 'A', name: 'Full Body A', warmup: '', notes: '', exercises: [{ id: 'e1', name: 'Leg press', sets: 2, reps: '12' }] }, { id: 'B', name: 'Full Body B', warmup: '', notes: '', exercises: [{ id: 'e2', name: 'Supino', sets: 2, reps: '10' }] }],
    foods: [{ id: 'f0', name: 'Ovo cozido', base: 'g', kcal: 146, p: 13.3, c: 0.6, f: 9.5, units: [{ name: 'unidade (~50 g)', g: 50 }], source: 'TACO (aprox.)' },
      { id: 'f1', name: 'Arroz branco cozido', base: 'g', kcal: 128, p: 2.5, c: 28.1, f: 0.2, units: [] }],
    sessions: [], meals: [], mealPlan: [], water: [], weights: [], measurements: [], medLogs: [], symptomLogs: [], energyLogs: [], reviews: [], nutritionGoals: [],
    medication: { name: '', startDate: '', weekday: '', doseText: '', notes: '' },
    settings: { restEnabled: true, restSeconds: 90, onboarded: false, theme: 'auto', reminders: [
      { id: 'treino', enabled: false, title: 'Dia de treino', text: 't', hour: 17, minute: 0, days: [1, 3, 5] },
      { id: 'refeicoes', enabled: false, title: 'Registrar refeições', text: 't', hour: 20, minute: 30, days: [] },
      { id: 'agua', enabled: false, title: 'Água', text: 't', hour: 15, minute: 0, days: [] },
      { id: 'aplicacao', enabled: false, title: 'Aplicação', text: 't', hour: 9, minute: 0, days: [] }] }
  }, over || {});
}
const FULL = {
  app: 'CylGymly', tipo: 'configuracao', formato: 1,
  perfil: { nome: 'Ana', idade: 30, sexo: 'Feminino', alturaCm: 165, pesoInicialKg: 78.5, pesoAtualKg: 78.5, pesoDesejadoKg: 68, dataInicio: '2026-11-16' },
  metas: { kcal: 1800, proteinaG: 120, carboidratosG: 190, gordurasG: 60, aguaMl: 2500 },
  planos: [{ id: 'A', nome: 'Pernas', aquecimento: '5 min', orientacoes: 'leve', exercicios: [{ nome: 'Leg press', series: 3, repeticoes: '10-12' }, { nome: 'Mesa flexora', series: 3, repeticoes: 12 }] },
    { id: 'B', nome: 'Superiores', exercicios: [{ nome: 'Supino', series: 3, repeticoes: '10' }] }],
  diasDeTreino: { seg: 'A', ter: null, qua: 'B', qui: null, sex: 'Pernas', sab: null, dom: null },
  descanso: { ativo: true, modo: 'progressivo', baseSegundos: 50, acrescimoSegundos: 15 },
  lembretes: [{ id: 'treino', ativo: true, horario: '18:30', dias: ['seg', 'qua', 'sex'] }, { id: 'agua', ativo: true, horario: '9:00', dias: [] }],
  tratamento: { medicamento: 'Remédio X', diaAplicacao: 'qui', dosePrescrita: 'conforme receita' },
  alimentos: [{ nome: 'Iogurte grego', base: 'g', kcal: 97, proteinaG: 9, carboidratosG: 3.9, gordurasG: 5, medidas: [{ nome: 'pote', gramas: 100 }] },
    { nome: 'ovo cozido', base: 'g', kcal: 150, proteinaG: 13, carboidratosG: 1, gordurasG: 10, medidas: [] }],
  cardapio: [{ refeicao: 'Café da manhã', horario: '07:00', itens: [
    { alimento: 'Ovo cozido', quantidade: '2 unidades', gramas: 100, kcal: 999, proteinaG: 99, carboidratosG: 9, gordurasG: 9 },
    { alimento: 'Iogurte grego', quantidade: '1 pote', gramas: 100, kcal: 97, proteinaG: 9, carboidratosG: 3.9, gordurasG: 5 },
    { alimento: 'Salada', quantidade: '1 prato', kcal: 60, proteinaG: 1, carboidratosG: 3, gordurasG: 5 }] }],
  tema: 'escuro'
};
const run = (obj, db, opts) => { const v = S.validateSetup(obj, db); assert.ok(v.ok, v.errors.join('; ')); return { v, r: S.applySetup(db, v.setup, Object.assign({ today: '2026-11-16' }, opts)) }; };

// ------------------------------------------------------------ leitura do texto colado
test('texto colado: JSON puro, em bloco de código e com conversa em volta', () => {
  assert.deepEqual(S.extractJson('{"a":1}').obj, { a: 1 });
  assert.deepEqual(S.extractJson('Aqui está:\n```json\n{"a":{"b":[1,2]}}\n```\nCopie o código acima.').obj, { a: { b: [1, 2] } });
  assert.deepEqual(S.extractJson('Pronto! {"a":1} Qualquer coisa, avise.').obj, { a: 1 });
});
test('texto colado: conserta aspas curvas e vírgula sobrando', () => {
  assert.deepEqual(S.extractJson('{“a”: 1, "b": [1, 2,], }').obj, { a: 1, b: [1, 2] });
});
test('texto colado: vazio, sem JSON, cortado e grande demais dão mensagem clara', () => {
  assert.equal(S.extractJson('').ok, false);
  assert.match(S.extractJson('oi, tudo bem?').error, /Não encontrei/);
  assert.match(S.extractJson('{"perfil": {"nome": "Ana", "idade": 3').error, /cortado/);
  assert.match(S.extractJson('{"a": [1, 2}').error, /incompleto|erro de formato/);
  assert.equal(S.extractJson('{"a":"' + 'x'.repeat(S.MAX_CHARS) + '"}').ok, false);
  assert.equal(S.extractJson('[1,2]').ok, false);
});

// ------------------------------------------------------------ validação
test('validação: configuração completa é aceita sem avisos', () => {
  const v = S.validateSetup(FULL, baseDb());
  assert.ok(v.ok); assert.deepEqual(v.warnings, []);
  assert.deepEqual(Object.keys(v.setup).sort(), ['foods', 'goals', 'mealPlan', 'medication', 'plans', 'profile', 'reminders', 'rest', 'schedule', 'theme']);
  assert.deepEqual(v.setup.schedule, { 1: 'A', 3: 'B', 5: 'A' }, 'dia aceita id ou nome do treino');
  assert.equal(v.setup.rest.base, 45, 'descanso é ajustado para um valor que a tela oferece');
  assert.deepEqual(v.setup.reminders[1], { id: 'agua', enabled: true, hour: 9, minute: 0, days: [] });
});
test('validação: campo fora do limite vira aviso e fica de fora; o resto é aproveitado', () => {
  const v = S.validateSetup({ perfil: { idade: 300, alturaCm: '1,65', pesoAtualKg: '82,5 kg', pesoDesejadoKg: 70, sexo: 'outro' }, metas: { kcal: -5, proteinaG: 120 } }, baseDb());
  assert.ok(v.ok);
  assert.deepEqual(v.setup.profile, { currentWeight: 82.5, targetWeight: 70 });
  assert.deepEqual(v.setup.goals, { protein: 120 });
  assert.equal(v.warnings.length, 4);
});
test('validação: nada aproveitável, backup e formato mais novo são recusados', () => {
  assert.equal(S.validateSetup({ qualquer: 1 }, baseDb()).ok, false);
  assert.equal(S.validateSetup([], baseDb()).ok, false);
  assert.match(S.validateSetup({ app: 'TreinoSaude', data: { profile: {} } }, baseDb()).errors[0], /backup/);
  assert.match(S.validateSetup({ formato: 9, perfil: { idade: 30 } }, baseDb()).errors[0], /versão mais nova/);
});
test('validação: alimento sem macros ou impossível é ignorado; calorias incoerentes geram aviso', () => {
  const v = S.validateSetup({ alimentos: [
    { nome: 'Sem valores' }, { nome: 'Impossível', kcal: 100, proteinaG: 60, carboidratosG: 60, gordurasG: 10 },
    { nome: 'Estranho', kcal: 800, proteinaG: 10, carboidratosG: 10, gordurasG: 1 }, { nome: 'Bom', base: 'ml', kcal: 35, proteinaG: 3.4, carboidratosG: 4.9, gordurasG: 0.1, medidas: [{ nome: 'copo', gramas: 200 }, { nome: 'x', gramas: -1 }] },
    { nome: 'bom', kcal: 35, proteinaG: 3.4, carboidratosG: 4.9, gordurasG: 0.1 }] }, baseDb());
  assert.deepEqual(v.setup.foods.map(f => f.name), ['Estranho', 'Bom']);
  assert.deepEqual(v.setup.foods[1].units, [{ name: 'copo', g: 200 }]);
  assert.equal(v.setup.foods[1].base, 'ml');
  assert.equal(v.warnings.length, 5);
});
test('validação: plano sem exercícios e dia apontando para treino inexistente', () => {
  const v = S.validateSetup({ planos: [{ nome: 'Vazio', exercicios: [] }, { nome: 'Ok', exercicios: [{ nome: 'Remada', series: 99 }] }], diasDeTreino: { seg: 'Ok', ter: 'Z', xyz: 'Ok', qua: 'descanso' } }, baseDb());
  assert.equal(v.setup.plans.length, 1);
  assert.equal(v.setup.plans[0].exercises[0].sets, 3, 'séries inválidas caem no padrão, com aviso');
  assert.deepEqual(v.setup.schedule, { 1: v.setup.plans[0].id });
  assert.ok(v.warnings.length >= 4);
});
test('validação: textos com HTML passam como texto e têm tamanho limitado', () => {
  const v = S.validateSetup({ perfil: { nome: '<img src=x onerror=alert(1)>' + 'a'.repeat(500) }, planos: [{ nome: 'P', exercicios: [{ nome: '<b>x</b>', series: 2 }] }] }, baseDb());
  assert.equal(v.setup.profile.name.length, 60);
  assert.ok(H.esc(v.setup.plans[0].exercises[0].name).indexOf('<') < 0);
});

// ------------------------------------------------------------ aplicação
test('aplicar (primeira vez): preenche tudo e a base continua válida', () => {
  const db = baseDb(), { r } = run(FULL, db, { first: true });
  const d = r.db;
  assert.deepEqual(H.validateDb(d).errors, []);
  assert.equal(d.settings.onboarded, true);
  assert.deepEqual([d.profile.name, d.profile.age, d.profile.sex, d.profile.heightCm, d.profile.startWeight, d.profile.targetWeight, d.profile.startDate], ['Ana', 30, 'Feminino', 165, 78.5, 68, '2026-11-16']);
  assert.deepEqual(d.weights.map(w => [w.date, w.kg]), [['2026-11-16', 78.5]]);
  assert.deepEqual(d.nutritionGoals, [{ from: '2026-11-16', kcal: 1800, protein: 120, carbs: 190, fat: 60, water: 2500 }]);
  assert.deepEqual(d.plans.map(p => [p.id, p.name, p.exercises.length]), [['A', 'Pernas', 2], ['B', 'Superiores', 1]]);
  assert.equal(d.plans[0].exercises[1].reps, '12');
  assert.deepEqual(d.schedule, { 1: 'A', 3: 'B', 5: 'A' });
  assert.deepEqual(d.scheduleHistory, [{ from: '2026-11-16', schedule: { 1: 'A', 3: 'B', 5: 'A' } }]);
  assert.deepEqual([d.settings.restMode, d.settings.restBase, d.settings.restStep, d.settings.theme], ['prog', 45, 15, 'dark']);
  const rem = d.settings.reminders.find(x => x.id === 'treino');
  assert.deepEqual([rem.enabled, rem.hour, rem.minute, rem.days, rem.title], [true, 18, 30, [1, 3, 5], 'Dia de treino']);
  assert.deepEqual([d.medication.name, d.medication.weekday, d.medication.doseText], ['Remédio X', '4', 'conforme receita']);
  assert.equal(db.settings.onboarded, false, 'a base original não é alterada');
});
test('aplicar: alimentos entram com proteína e demais valores; mesmo nome é atualizado, nenhum é apagado', () => {
  const { r } = run(FULL, baseDb(), { first: true });
  const foods = r.db.foods;
  assert.equal(foods.length, 3);
  const ovo = foods.find(f => f.id === 'f0'), iog = foods.find(f => f.name === 'Iogurte grego');
  assert.deepEqual([ovo.name, ovo.kcal, ovo.p, ovo.source], ['Ovo cozido', 150, 13, 'IA (estimativa)']);
  assert.deepEqual(ovo.units, [{ name: 'unidade (~50 g)', g: 50 }], 'medidas antigas ficam quando a IA não manda outras');
  assert.deepEqual([iog.kcal, iog.p, iog.c, iog.f, iog.units[0].g], [97, 9, 3.9, 5, 100]);
});
test('aplicar: cardápio — item da lista é calculado pelo alimento; item livre usa os valores da IA', () => {
  const { r } = run(FULL, baseDb(), { first: true });
  const m = r.db.mealPlan[0];
  assert.deepEqual([m.label, m.time, m.items.length], ['Café da manhã', '07:00', 3]);
  const [ovo, iog, sal] = m.items;
  assert.deepEqual([ovo.foodId, ovo.grams, ovo.kcal, ovo.p, ovo.estimated], ['f0', 100, 150, 13, false], 'os 999 kcal inventados no item são descartados');
  assert.equal(ovo.amountLabel, '2 unidades (~100 g)');
  assert.ok(iog.foodId && iog.foodId !== 'f0');
  assert.deepEqual([sal.foodId, sal.kcal, sal.p, sal.c, sal.f, sal.estimated], [null, 60, 1, 3, 5, true]);
  const t = S.mealPlanTotals(r.db.mealPlan);
  assert.equal(Math.round(t.kcal), 307); assert.equal(Math.round(t.p), 23);
});
test('aplicar (atualização): só o que veio muda; metas e agenda valem a partir de hoje', () => {
  const db = baseDb({ nutritionGoals: [{ from: '2026-11-01', kcal: 2000, protein: 100, carbs: null, fat: null, water: 2000 }], weights: [{ id: 'w1', date: '2026-11-10', kg: 79 }] });
  db.settings.onboarded = true;
  const { r } = run({ perfil: { pesoAtualKg: 77.2 }, metas: { proteinaG: 130 }, diasDeTreino: { ter: 'B' } }, db, {});
  const d = r.db;
  assert.deepEqual([d.profile.startWeight, d.profile.startDate, d.profile.targetWeight], [80, '2026-11-01', 75]);
  assert.deepEqual(d.weights.map(w => [w.date, w.kg]), [['2026-11-10', 79], ['2026-11-16', 77.2]]);
  assert.deepEqual(d.nutritionGoals[1], { from: '2026-11-16', kcal: 2000, protein: 130, carbs: null, fat: null, water: 2000 });
  assert.equal(d.nutritionGoals.length, 2);
  assert.deepEqual(d.schedule, { 2: 'B' });
  assert.equal(H.plannedFor(d, '2026-11-09'), 'A', 'o passado continua com a agenda antiga');
  assert.equal(H.plannedFor(d, '2026-11-16'), null); assert.equal(H.plannedFor(d, '2026-11-17'), 'B');
  assert.equal(d.plans.length, 2); assert.equal(d.foods.length, 2);
});
test('aplicar: lembrete de treino acompanha os novos dias só quando seguia os antigos', () => {
  const db = baseDb(); db.settings.reminders[0].days = [1, 3];
  assert.deepEqual(run({ diasDeTreino: { ter: 'A', qui: 'B' } }, db, {}).r.db.settings.reminders[0].days, [2, 4]);
  db.settings.reminders[0].days = [6];
  assert.deepEqual(run({ diasDeTreino: { ter: 'A', qui: 'B' } }, db, {}).r.db.settings.reminders[0].days, [6]);
});
test('aplicar: trocar os planos tira da agenda os treinos que deixaram de existir e preserva sessões', () => {
  const db = baseDb({ sessions: [{ id: 's1', date: '2026-11-02', planId: 'B', planName: 'Full Body B', status: 'concluida', exercises: [] }] });
  const { r } = run({ planos: [{ id: 'A', nome: 'Novo A', exercicios: [{ nome: 'Agachamento', series: 3, repeticoes: '8' }] }] }, db, {});
  assert.deepEqual(r.db.schedule, { 1: 'A' });
  assert.deepEqual(r.db.sessions, db.sessions);
  assert.equal(r.db.scheduleHistory.length, 2);
  assert.deepEqual(H.validateDb(r.db).errors, []);
});
test('aplicar: mesmo peso de hoje não duplica pesagem', () => {
  const db = baseDb({ weights: [{ id: 'w1', date: '2026-11-16', kg: 79 }] });
  assert.equal(run({ perfil: { pesoAtualKg: 79 } }, db, {}).r.db.weights.length, 1);
  const d = run({ perfil: { pesoAtualKg: 78 } }, db, {}).r.db;
  assert.deepEqual(d.weights, [{ id: 'w1', date: '2026-11-16', kg: 78 }]);
});

// ------------------------------------------------------------ exportar e prompt
test('ida e volta: exportar a configuração e aplicar de novo não muda nada relevante', () => {
  const a = run(FULL, baseDb(), { first: true }).r.db;
  const out = S.exportSetup(a, { today: '2026-11-16', foods: true });
  const v = S.validateSetup(JSON.parse(JSON.stringify(out)), a);
  assert.ok(v.ok); assert.deepEqual(v.warnings, []);
  const b = S.applySetup(a, v.setup, { today: '2026-11-16' }).db;
  const strip = d => JSON.stringify([d.profile, d.nutritionGoals, d.plans.map(p => [p.id, p.name, p.warmup, p.notes, p.exercises.map(e => [e.name, e.sets, e.reps])]), d.schedule, d.medication,
    d.foods.map(f => [f.name, f.base, f.kcal, f.p, f.c, f.f, f.units]), d.mealPlan.map(m => [m.label, m.time, m.items.map(i => [i.name, i.grams, Math.round(i.kcal), i.foodId])]), d.weights.length, d.settings.reminders, d.settings.theme, d.settings.restMode]);
  assert.equal(strip(b), strip(a));
});
test('prompt inicial: pede entrevista, alimentos com macros e JSON no formato do app', () => {
  const p = S.buildPrompt(baseDb(), { mode: 'first', today: '2026-11-16' });
  ['3 a 5 perguntas', 'Nunca sugira, calcule ou altere dose', 'calorias, proteína, carboidratos e gorduras', '"cardapio"', '"proteinaG"', 'Ovo cozido | g | 146 | 13.3', 'bloco de código JSON'].forEach(x => assert.ok(p.includes(x), 'faltou: ' + x));
  assert.ok(!p.includes('MINHA CONFIGURAÇÃO ATUAL'));
  const model = S.extractJson(p.slice(p.indexOf('MODELO DO CÓDIGO'), p.indexOf('REGRAS DOS CAMPOS')));
  assert.ok(model.ok, 'o modelo dentro do prompt é um JSON válido');
  const v = S.validateSetup(model.obj, baseDb());
  assert.ok(v.ok); assert.deepEqual(v.warnings.filter(w => !/dataInicio|aponta para um treino/.test(w)), [], 'o próprio modelo passa na validação');
});
test('prompt de atualização: leva dados atuais, progresso e o pedido; saúde é opcional', () => {
  const db = run(FULL, baseDb(), { first: true }).r.db;
  db.symptomLogs.push({ id: 'y1', date: '2026-11-15', symptoms: { nausea: 2 } });
  const p = S.buildPrompt(db, { mode: 'update', today: '2026-11-16', request: 'quero treinar 4 dias' });
  ['quero treinar 4 dias', 'MINHA CONFIGURAÇÃO ATUAL', '"pesoAtualKg":78.5', 'RESUMO DO MEU PROGRESSO', 'Remédio X', 'nausea', 'substituem a lista inteira'].forEach(x => assert.ok(p.includes(x), 'faltou: ' + x));
  const q = S.buildPrompt(db, { mode: 'update', today: '2026-11-16', health: false });
  assert.ok(!q.includes('Remédio X') && !q.includes('nausea') && !q.includes('"tratamento":{"medicamento":"Remédio'));
  assert.ok(q.includes('revisão geral'));
});
test('resumo do progresso: peso, frequência, força e médias de alimentação', () => {
  const db = baseDb({ profile: { startWeight: 80, targetWeight: 75, startDate: '2026-11-02' }, scheduleHistory: [{ from: '2026-11-02', schedule: { 1: 'A', 3: 'B' } }],
    weights: [{ id: 'w1', date: '2026-11-03', kg: 80 }, { id: 'w2', date: '2026-11-15', kg: 78.6 }],
    sessions: [{ id: 's1', date: '2026-11-02', planId: 'A', planName: 'A', status: 'concluida', exercises: [{ name: 'Leg press', sets: [{ kg: '100', reps: '10', done: true }] }] },
      { id: 's2', date: '2026-11-09', planId: 'A', planName: 'A', status: 'concluida', exercises: [{ name: 'Leg press', rpe: 7, sets: [{ kg: '110', reps: '10', done: true }] }] }],
    meals: [{ id: 'm1', date: '2026-11-15', time: '12:00', items: [{ name: 'x', kcal: 600, p: 40, c: 60, f: 20 }] }], water: [{ id: 'a1', date: '2026-11-15', ml: 1500 }] });
  const t = S.progressSummary(db, { today: '2026-11-16' });
  ['atual 78,6 kg', 'variação de -1,4 kg', '2 de 4 dias planejados', 'Leg press: evoluindo (última: 110 kg × 10 reps', 'média de 600 kcal, 40 g de proteína', 'média de 1500 ml'].forEach(x => assert.ok(t.includes(x), 'faltou: ' + x + '\n' + t));
});
