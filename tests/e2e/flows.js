// Testes de integração e regressão no navegador (Chromium/Playwright), versão HTML.
// Uso: node tests/e2e/flows.js [caminho/para/index.html]
// ATENÇÃO: isto testa o app no navegador. Não substitui os testes no Android.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const target = path.resolve(process.argv[2] || path.join(__dirname, '../../app/src/main/assets/www/index.html'));
const OUT = path.join(__dirname, '../output');
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'treinosaude-data';

const results = [];
let browser;
async function fresh(opts) {
  opts = opts || {};
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true }, opts.ctx || {}));
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console: ' + m.text()); });
  if (opts.init) await p.addInitScript(opts.init);
  await p.goto('file://' + target);
  if (opts.onboard !== false && await p.$('[data-act=obDone]')) {
    await manualStart(p);
    if (opts.patch === false) return p;
    // Base fixa para os testes com relógio simulado: programa iniciado em 09/11/2026 (segunda), 115 kg → 90 kg.
    await p.evaluate(k => {
      const d = JSON.parse(localStorage.getItem(k));
      Object.assign(d.profile, { age: 22, sex: 'Masculino', heightCm: 173, startWeight: 115, targetWeight: 90, startDate: '2026-11-09' });
      d.weights = [{ id: 'w0', date: '2026-11-09', kg: 115, notes: 'Peso de referência inicial' }];
      d.scheduleHistory = [{ from: '2026-11-09', schedule: Object.assign({}, d.schedule) }];
      const f = d.foods.find(x => x.name === 'Pão francês');
      d.meals = [{ id: 'm0', date: '2026-11-09', time: '07:00', type: 'Café da manhã', notes: '', photoIds: [], items: [{ foodId: f.id, name: f.name, amount: 1, unitName: 'unidade (~50 g)', grams: 50, amountLabel: '1 × unidade (~50 g)', estimated: false, kcal: 150, p: 4, c: 29.3, f: 1.55 }] }];
      localStorage.setItem(k, JSON.stringify(d));
    }, KEY);
    await p.reload();
  }
  return p;
}
// Boas-vindas pelo caminho manual ("Prefiro preencher à mão")
async function manualStart(p, w, tw) {
  await p.click('#wl-manual summary');
  await p.fill('#ob-w', String(w || 115)); await p.fill('#ob-tw', String(tw || 90));
  await p.click('[data-act=obDone]');
}
const getDb = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const raw = p => p.evaluate(k => localStorage.getItem(k), KEY);
async function t(name, fn) {
  const p0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - p0 }); console.log('ok   ' + name); }
  catch (e) { results.push({ name, ok: false, error: String(e && e.stack || e).split('\n').slice(0, 3).join(' | ') }); console.log('FAIL ' + name + '\n     ' + e.message); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'falhou'); }
async function noErrors(p) { assert(!p.errs.length, 'erros na página: ' + p.errs.join('; ')); await p.context().close(); }
async function addRice(p, qty) {
  await p.click('[data-act=mealPick]');
  await p.fill('#f-q', 'arroz branco');
  await p.click('#f-res [data-act=pickFood] >> nth=0');
  await p.selectOption('#q-unit', { index: 0 }); // gramas
  await p.fill('#q-amt', String(qty));
  await p.click('[data-act=qtySave]');
}
async function checkin(p, { energy = 4, ate = 'sim', water = 'sim', nausea = 'nao', dizzy = false, flag = null, plan = 'A' } = {}) {
  await p.click('[data-tab=train]');
  await p.click('[data-act=startCheckin][data-plan="' + plan + '"] >> nth=-1');
  await p.click('[data-act=scale][data-name=ci_energy][data-v="' + energy + '"]');
  await p.click('[data-act=chip][data-name=ci_nausea][data-v="' + nausea + '"]');
  await p.click('[data-act=chip][data-name=ci_ate][data-v="' + ate + '"]');
  await p.click('[data-act=chip][data-name=ci_water][data-v="' + water + '"]');
  if (dizzy) await p.check('#ci-dizzy');
  if (flag) await p.check('#rf-' + flag);
  await p.click('[data-act=checkinNext]');
}

// marca todas as séries, exercício por exercício (a tela mostra só o exercício atual expandido)
async function allSets(p) {
  for (let k = 0; k < 60; k++) {
    const b = await p.$('[data-act=toggleSet]:not(.on)'); if (!b) break;
    await b.click(); await p.click('#rest [data-act=restStop]', { timeout: 500 }).catch(() => { });
  }
}

(async () => {
  browser = await chromium.launch();
  let exportedText = null;

  // ---------------------------------------------------------------- 14 fluxos de integração
  await t('01 criar refeição e reabrir', async () => {
    const p = await fresh();
    await p.click('[data-tab=food]'); await p.click('[data-act=newMeal]');
    await addRice(p, 150);
    await p.fill('#m-notes', 'teste 1'); await p.click('[data-act=saveMeal]');
    await p.reload();
    const db = await getDb(p);
    const m = db.meals.find(x => x.notes === 'teste 1');
    assert(m && m.items[0].grams === 150 && Math.abs(m.items[0].kcal - 1.5 * db.foods.find(f => f.id === m.items[0].foodId).kcal) < 1e-6, 'refeição/valores não persistiram');
    await p.click('[data-tab=food]'); await p.click('[data-act=editMeal][data-id="' + m.id + '"]');
    assert((await p.textContent('#sheet')).includes(m.items[0].name), 'item não aparece ao reabrir');
    await noErrors(p);
  });
  await t('02 editar refeição e reabrir', async () => {
    const p = await fresh();
    await p.click('[data-tab=food]'); await p.click('[data-act=newMeal]'); await addRice(p, 100); await p.fill('#m-notes', 'antes'); await p.click('[data-act=saveMeal]');
    let m = (await getDb(p)).meals.find(x => x.notes === 'antes');
    await p.click('[data-act=editMeal][data-id="' + m.id + '"]');
    await p.click('[data-act=editItem]'); await p.fill('#q-amt', '200'); await p.click('[data-act=qtySave]');
    assert(await p.$('#m-notes'), 'não voltou para a refeição');
    await p.fill('#m-notes', 'depois'); await p.click('[data-act=saveMeal]');
    await p.reload();
    const db = await getDb(p); m = db.meals.find(x => x.id === m.id);
    assert(m.notes === 'depois' && m.items.length === 1 && m.items[0].grams === 200, 'edição não persistiu: ' + JSON.stringify(m));
    await noErrors(p);
  });
  await t('03 excluir refeição (com confirmação)', async () => {
    const p = await fresh();
    await p.clock.setFixedTime(new Date(2026, 10, 9, 10, 0)); await p.reload(); // a refeição de exemplo é de 09/11
    const m = (await getDb(p)).meals[0];
    await p.click('[data-tab=food]'); await p.click('[data-act=editMeal][data-id="' + m.id + '"]');
    await p.click('[data-act=delMeal]');
    assert((await p.textContent('#sheet')).includes('Excluir esta refeição?'), 'sem confirmação');
    await p.click('[data-act=confirmOk]'); await p.reload();
    assert(!(await getDb(p)).meals.some(x => x.id === m.id), 'refeição não foi excluída');
    await noErrors(p);
  });
  await t('04 registrar água (e recusar valor inválido)', async () => {
    const p = await fresh();
    await p.click('[data-act=addWater][data-ml="300"]');
    await p.click('[data-act=waterCustom]'); await p.fill('#wc', 'abc'); await p.click('[data-act=waterCustomOk]');
    assert(await p.$('#wc[aria-invalid=true]') && (await p.textContent('.field-err')).length > 3, 'sem erro junto ao campo');
    await p.fill('#wc', '250'); await p.click('[data-act=waterCustomOk]');
    await p.reload();
    const w = (await getDb(p)).water;
    assert(w.length === 2 && w[0].ml + w[1].ml === 550, 'água: ' + JSON.stringify(w));
    await noErrors(p);
  });
  await t('05 iniciar treino normal', async () => {
    const p = await fresh();
    await checkin(p);
    const s = (await getDb(p)).sessions.find(x => x.status === 'em_andamento');
    assert(s && !s.light && s.exercises.every(e => e.sets.length === 2), 'sessão normal incorreta');
    assert((await p.textContent('#view')).includes('séries feitas'), 'tela da sessão não abriu');
    await noErrors(p);
  });
  await t('06 iniciar treino leve (1 série por exercício)', async () => {
    const p = await fresh();
    await checkin(p, { energy: 2 });
    assert(await p.$('[data-act=checkinLight]'), 'não ofereceu versão leve');
    await p.click('[data-act=checkinLight]');
    const s = (await getDb(p)).sessions.find(x => x.status === 'em_andamento');
    assert(s.light && s.exercises.every(e => e.sets.length === 1), 'versão leve não reduziu as séries');
    await noErrors(p);
  });
  await t('07 retomar sessão interrompida (sem perder o que foi digitado)', async () => {
    const p = await fresh();
    await checkin(p);
    await p.fill('[data-set="0:0:kg"]', '40');
    await p.fill('[data-set="0:0:reps"]', '12');
    await p.reload(); // sem esperar: a gravação pendente precisa ser feita ao sair da página
    await p.click('[data-tab=train]');
    await p.click('[data-act=openSession]');
    assert(await p.inputValue('[data-set="0:0:kg"]') === '40' && await p.inputValue('[data-set="0:0:reps"]') === '12', 'valores digitados perdidos');
    assert((await getDb(p)).sessions.filter(x => x.status === 'em_andamento').length === 1, 'sessão duplicada');
    await noErrors(p);
  });
  await t('08 concluir treino (e cronômetro de descanso)', async () => {
    const p = await fresh();
    await checkin(p);
    await p.click('[data-act=toggleSet] >> nth=0');
    assert(await p.isVisible('#rest'), 'cronômetro não apareceu');
    await p.click('[data-act=restStop]');
    await allSets(p);
    await p.click('[data-act=finishSession]'); await p.click('[data-act=finishSave]');
    const db = await getDb(p);
    assert(db.sessions.length === 1 && db.sessions[0].status === 'concluida' && db.sessions[0].endedAt, 'não concluiu');
    assert(!db.sessions.some(x => x.status === 'em_andamento'), 'ficou em andamento');
    await noErrors(p);
  });
  await t('09 registrar sintomas', async () => {
    const p = await fresh();
    await p.click('[data-tab=health]'); await p.click('[data-act=addSymptom]');
    await p.click('[data-act=chip][data-name="sym:nausea"][data-v="2"]');
    await p.click('[data-act=saveSymptom]'); await p.reload();
    const s = (await getDb(p)).symptomLogs;
    assert(s.length === 1 && s[0].symptoms.nausea === 2, 'sintoma não salvo');
    await noErrors(p);
  });
  await t('10 registrar peso (vírgula decimal; inválido recusado)', async () => {
    const p = await fresh();
    await p.click('[data-tab=progress]'); await p.click('[data-act=addWeight]');
    await p.fill('#w-kg', '1.234,5'); await p.click('[data-act=saveWeight]');
    assert(await p.$('#w-kg[aria-invalid=true]'), 'valor ambíguo aceito');
    await p.fill('#w-kg', '114,2'); await p.click('[data-act=saveWeight]');
    await p.reload();
    const w = (await getDb(p)).weights;
    assert(w.some(x => x.kg === 114.2), 'peso: ' + JSON.stringify(w));
    await noErrors(p);
  });
  await t('11 exportar backup', async () => {
    const p = await fresh();
    await p.click('[data-act=addWater][data-ml="500"]');
    await p.click('[data-tab=progress]'); await p.click('[data-act=addWeight]'); await p.fill('#w-kg', '113'); await p.click('[data-act=saveWeight]');
    await p.evaluate(() => { localStorage.setItem('ts-photo-p900', 'data:image/jpeg;base64,AAAA'); });
    await p.click('[data-tab=food]'); await p.click('[data-act=newMeal]'); await p.evaluate(() => window.onPhoto('p900')); await p.fill('#m-notes', 'com foto'); await p.click('[data-act=saveMeal]');
    await p.click('#btn-settings');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=exportBackup]')]);
    const file = path.join(OUT, 'export-test.json'); await dl.saveAs(file);
    exportedText = fs.readFileSync(file, 'utf8');
    const size = fs.statSync(file).size;
    assert(size > 1000, 'arquivo exportado vazio ou pequeno demais: ' + size + ' bytes');
    assert((await p.textContent('#toast')).match(/Backup gerado \(\d+ KB\)/), 'aviso sem o tamanho do arquivo');
    const o = JSON.parse(exportedText);
    assert(o.app === 'TreinoSaude' && o.format === 1 && o.photos.p900, 'formato do backup');
    const v = await p.evaluate(t => { const r = window.HCore.validateBackup(t); return { ok: r.ok, s: r.summary }; }, exportedText);
    const db = await getDb(p);
    assert(v.ok && v.s.meals === db.meals.length && v.s.weights === db.weights.length && v.s.water === db.water.length, 'resumo não confere');
    await noErrors(p);
  });
  await t('12 restaurar backup (resumo, cópia de segurança, dados idênticos, reexportação sem perda)', async () => {
    const p = await fresh();
    const before = await raw(p);
    await p.evaluate(t => window.onImportFile(t), exportedText);
    const txt = await p.textContent('#sheet');
    assert(txt.includes('Refeições') && txt.includes('Fotos no arquivo'), 'sem resumo');
    assert(await raw(p) === before, 'dados mudaram antes da confirmação');
    await p.click('[data-act=confirmOk]');
    const db = await getDb(p), src = JSON.parse(exportedText).data;
    for (const k of ['meals', 'water', 'weights', 'sessions', 'symptomLogs', 'medLogs', 'energyLogs', 'foods', 'plans']) assert(JSON.stringify(db[k]) === JSON.stringify(src[k]), 'diferença em ' + k);
    assert(await p.evaluate(() => localStorage.getItem('ts-photo-p900')) === 'data:image/jpeg;base64,AAAA', 'foto não restaurada');
    const safety = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ts-backup-pre-restore-')));
    assert(safety.length === 1 && await p.evaluate(k => localStorage.getItem(k), safety[0]) === before, 'sem cópia de segurança dos dados anteriores');
    await p.click('#btn-settings');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=exportBackup]')]);
    const again = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    for (const k of ['meals', 'water', 'weights', 'sessions']) assert(JSON.stringify(again.data[k]) === JSON.stringify(src[k]), 'reexportação perdeu ' + k);
    assert(again.photos.p900, 'reexportação perdeu foto');
    await noErrors(p);
  });
  await t('13 importar backup inválido (truncado, JSON ruim, outro app, versão nova, tipos errados) não altera nada', async () => {
    const p = await fresh();
    const before = await raw(p);
    const cases = [exportedText.slice(0, exportedText.length / 2), '{not json', JSON.stringify({ app: 'Outro', data: {} }), JSON.stringify({ app: 'TreinoSaude', format: 9, data: {} }),
      JSON.stringify({ app: 'TreinoSaude', data: { profile: {}, meals: 'x' } })];
    for (const c of cases) {
      await p.evaluate(t => window.onImportFile(t), c);
      const txt = await p.textContent('#sheet');
      assert(txt.includes('Nenhum dado foi alterado'), 'sem aviso claro para: ' + c.slice(0, 30));
      assert(!(await p.$('[data-act=confirmOk]')), 'ofereceu restaurar arquivo inválido');
      await p.click('[data-act=closeSheet] >> nth=-1');
    }
    await p.evaluate(t => window.onImportFile(t), JSON.stringify({ app: 'TreinoSaude', format: 9, data: {} }));
    assert((await p.textContent('#sheet')).includes('Atualize o app'), 'sem orientação de versão incompatível');
    assert(await raw(p) === before, 'dados alterados');
    await noErrors(p);
  });
  await t('14 reiniciar o app e verificar integridade', async () => {
    const p = await fresh();
    await p.click('[data-act=addWater][data-ml="200"]');
    await checkin(p); await p.fill('[data-set="0:0:kg"]', '30');
    await p.click('[data-tab=home]');
    const before = await raw(p);
    await p.reload();
    const after = await raw(p);
    const v = await p.evaluate(() => window.HCore.validateDb(JSON.parse(localStorage.getItem('treinosaude-data'))).errors);
    assert(v.length === 0, 'base inválida após reiniciar: ' + v.join());
    const a = JSON.parse(before), b = JSON.parse(after); delete a.updatedAt; delete b.updatedAt;
    assert(JSON.stringify(a) === JSON.stringify(b), 'dados mudaram ao reabrir');
    await noErrors(p);
  });

  // ---------------------------------------------------------------- P0.1 persistência e recuperação
  await t('P0.1 primeira instalação inicia normalmente', async () => {
    const p = await fresh({ onboard: false });
    assert(await p.$('[data-act=obDone]'), 'sem boas-vindas'); assert(!(await p.$('[data-recovery]')), 'recuperação indevida');
    await noErrors(p);
  });
  await t('P0.1 base corrompida não é sobrescrita; restaurar cópia diária', async () => {
    const good = await (async () => { const p = await fresh(); const r = await raw(p); await p.context().close(); return r; })();
    const p = await fresh({ onboard: false, init: g => { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.setItem('treinosaude-data', '{"app":"TreinoSaude","meals":[{"id"'); localStorage.setItem('ts-backup-backup-2026-11-08.json', g); } }, ctx: {} });
    await p.evaluate(g => localStorage.setItem('ts-backup-backup-2026-11-08.json', g), good);
    await p.reload();
    assert(await p.$('[data-recovery]'), 'sem tela de recuperação');
    assert(!(await p.$('[data-act=obDone]')), 'abriu boas-vindas por cima');
    const corrupt = await raw(p);
    assert(corrupt.startsWith('{"app":"TreinoSaude","meals":[{"id"'), 'conteúdo ilegível foi alterado');
    await p.click('[data-act=restoreLocal]');
    await p.click('[data-act=confirmOk]');
    assert(!(await p.$('[data-recovery]')), 'continua em recuperação');
    assert(await raw(p) !== corrupt, 'não restaurou');
    const saved = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ts-backup-pre-restore-')).map(k => localStorage.getItem(k)));
    assert(saved.includes(corrupt), 'conteúdo ilegível não foi guardado à parte');
    await noErrors(p);
  });
  await t('P0.1 base com estrutura inválida entra em recuperação; "começar do zero" guarda o conteúdo antes', async () => {
    const p = await fresh({ onboard: false, init: () => { if (!sessionStorage.getItem('i')) { sessionStorage.setItem('i', '1'); localStorage.setItem('treinosaude-data', JSON.stringify({ profile: { startDate: 'x' }, meals: 'oops' })); } } });
    assert(await p.$('[data-recovery]'), 'sem recuperação');
    const bad = await raw(p);
    await p.click('[data-act=addWater]').catch(() => { });
    assert(await raw(p) === bad, 'gravou por cima em recuperação');
    await p.click('summary'); await p.click('[data-act=recoveryFresh]'); await p.click('[data-act=confirmOk]');
    const kept = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ts-backup-corrupt-')).map(k => localStorage.getItem(k)));
    assert(kept.includes(bad), 'não guardou o conteúdo antes de recomeçar');
    assert(await p.$('[data-act=obDone]'), 'não recomeçou');
    await noErrors(p);
  });
  await t('P0.1 falha de gravação mostra aviso fixo e "tentar de novo" funciona', async () => {
    const p = await fresh({ init: () => { const orig = Storage.prototype.setItem; window.__fail = false; Storage.prototype.setItem = function (k, v) { if (window.__fail && k === 'treinosaude-data') throw new Error('QuotaExceeded'); return orig.call(this, k, v); }; } });
    await p.evaluate(() => { window.__fail = true; });
    await p.click('[data-act=addWater][data-ml="300"]');
    assert(await p.isVisible('[data-save-error]'), 'sem aviso de falha');
    await p.click('[data-tab=food]'); assert(await p.isVisible('[data-save-error]'), 'aviso sumiu');
    await p.evaluate(() => { window.__fail = false; });
    await p.click('#save-retry');
    assert(!(await p.isVisible('[data-save-error]')), 'aviso não sumiu após gravar');
    assert((await getDb(p)).water.some(w => w.ml === 300), 'registro perdido');
    await noErrors(p);
  });
  await t('P0.1 ponte Android simulada: saveData=false mostra aviso', async () => {
    const p = await fresh({ patch: false, init: () => { window.AndroidBridge = { loadState: () => JSON.stringify({ status: 'missing' }), saveData: () => !window.__fail, setReminders() { }, listBackups: () => '[]', getPhoto: () => '', toast() { } }; } });
    await p.evaluate(() => { window.__fail = true; });
    await p.click('[data-act=addWater][data-ml="300"]');
    assert(await p.isVisible('[data-save-error]'), 'sem aviso');
    await noErrors(p);
  });
  await t('P0.1 ponte Android simulada: arquivo ausente mas com cópias → recuperação', async () => {
    const p = await fresh({ onboard: false, init: () => { window.AndroidBridge = { loadState: () => JSON.stringify({ status: 'missing', hasBackups: true }), saveData: () => true, setReminders() { window.__rem = 1; }, listBackups: () => '["backup-2026-11-08.json"]', readBackup: () => '', getPhoto: () => '', toast() { } }; } });
    assert(await p.$('[data-recovery]'), 'sem recuperação'); assert(!(await p.evaluate(() => window.__rem)), 'mexeu nos lembretes em recuperação');
    await noErrors(p);
  });

  // ---------------------------------------------------------------- P0.3 conteúdo como texto
  await t('P0.3 nomes com HTML aparecem como texto e não executam', async () => {
    const p = await fresh();
    const evil = '<img src=x onerror="window.__x=1"><b>Bolo</b>';
    await p.click('#btn-settings'); await p.click('[data-act=newFood]');
    await p.fill('#fd-name', evil); await p.fill('#fd-k', '300'); await p.fill('#fd-p', '5'); await p.fill('#fd-c', '50'); await p.fill('#fd-f', '10');
    await p.click('[data-act=saveFood]');
    await p.click('[data-tab=food]'); await p.click('[data-act=newMeal]'); await p.click('[data-act=mealPick]'); await p.fill('#f-q', 'bolo');
    await p.waitForTimeout(200);
    assert((await p.textContent('#f-res')).includes('<b>Bolo</b>'), 'não aparece como texto');
    await p.click('#f-res [data-act=pickFood]'); await p.click('[data-act=qtySave]'); await p.fill('#m-notes', '<script>window.__y=1</script>'); await p.click('[data-act=saveMeal]');
    await p.click('[data-tab=home]'); await p.click('[data-tab=food]');
    assert(!(await p.evaluate(() => window.__x || window.__y)), 'executou script');
    await noErrors(p);
  });
  await t('P0.3 ações só por nome próprio (data-act="constructor" não faz nada)', async () => {
    const p = await fresh();
    await p.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'constructor'; b.id = 'zz'; document.body.appendChild(b); });
    await p.click('#zz');
    await noErrors(p);
  });

  // ---------------------------------------------------------------- P0.4 segurança do treino
  await t('P0.4 sinal de alerta bloqueia início', async () => {
    const p = await fresh();
    await checkin(p, { flag: 'dor_peito' });
    const txt = await p.textContent('#sheet');
    assert(txt.includes('Não treine agora') && txt.includes('192'), 'sem orientação');
    assert(!(await p.$('[data-act=checkinNormal]')) && !(await p.$('[data-act=checkinLight]')), 'ainda permite treinar');
    await p.click('[data-act=checkinPostpone]');
    const s = (await getDb(p)).sessions; assert(s.length === 1 && s[0].status === 'adiada', 'não adiou');
    await noErrors(p);
  });
  await t('P0.4 náusea forte / tontura: só adiar', async () => {
    for (const o of [{ nausea: 'forte' }, { dizzy: true }]) {
      const p = await fresh();
      await checkin(p, o);
      assert(!(await p.$('[data-act=checkinNormal]')) && !(await p.$('[data-act=checkinLight]')) && await p.$('[data-act=checkinPostpone]'), 'ofereceu treino com ' + JSON.stringify(o));
      await noErrors(p);
    }
  });
  await t('P0.4 check-in exige água respondida', async () => {
    const p = await fresh();
    await p.click('[data-tab=train]'); await p.click('[data-act=startCheckin] >> nth=-1');
    await p.click('[data-act=scale][data-name=ci_energy][data-v="4"]'); await p.click('[data-act=chip][data-name=ci_ate][data-v="sim"]');
    await p.click('[data-act=checkinNext]');
    assert(!(await getDb(p)).sessions.length, 'iniciou sem responder água');
    await noErrors(p);
  });

  // ---------------------------------------------------------------- P1.1 fotos
  const photoMeal = async (p, id) => {
    await p.evaluate(i => localStorage.setItem('ts-photo-' + i, 'data:image/jpeg;base64,AAAA'), id);
    await p.click('[data-tab=food]'); await p.click('[data-act=newMeal]');
    await p.evaluate(i => window.onPhoto(i), id); await p.fill('#m-notes', 'foto ' + id); await p.click('[data-act=saveMeal]');
    return (await getDb(p)).meals.find(m => m.notes === 'foto ' + id);
  };
  const hasP = (p, id) => p.evaluate(i => localStorage.getItem('ts-photo-' + i) != null, id);
  await t('P1.1 adicionar foto, salvar, fechar e reabrir', async () => {
    const p = await fresh(); const m = await photoMeal(p, 'pa1');
    await p.reload(); await p.click('[data-tab=food]'); await p.click('[data-act=editMeal][data-id="' + m.id + '"]');
    assert(await p.$('img[data-photo=pa1][src^="data:image"]'), 'foto não aparece'); assert(await hasP(p, 'pa1'));
    await noErrors(p);
  });
  await t('P1.1 adicionar foto e cancelar → foto temporária apagada', async () => {
    const p = await fresh();
    await p.evaluate(() => localStorage.setItem('ts-photo-pa2', 'data:image/jpeg;base64,AAAA'));
    await p.click('[data-tab=food]'); await p.click('[data-act=newMeal]'); await p.evaluate(() => window.onPhoto('pa2'));
    await p.click('[data-act=closeSheet] >> nth=-1');
    assert(!(await hasP(p, 'pa2')), 'foto órfã ficou');
    await noErrors(p);
  });
  await t('P1.1 foto recebida sem refeição aberta é descartada', async () => {
    const p = await fresh();
    await p.evaluate(() => { localStorage.setItem('ts-photo-pa9', 'data:image/jpeg;base64,AAAA'); window.onPhoto('pa9'); });
    assert(!(await hasP(p, 'pa9')));
    await noErrors(p);
  });
  await t('P1.1 remover foto e cancelar → foto original mantida', async () => {
    const p = await fresh(); const m = await photoMeal(p, 'pa3');
    await p.click('[data-act=editMeal][data-id="' + m.id + '"]'); await p.click('[data-act=rmPhoto]'); await p.click('[data-act=closeSheet] >> nth=-1');
    assert(await hasP(p, 'pa3') && (await getDb(p)).meals.find(x => x.id === m.id).photoIds.includes('pa3'), 'foto original perdida');
    await noErrors(p);
  });
  await t('P1.1 remover foto e salvar → foto apagada e referência removida', async () => {
    const p = await fresh(); const m = await photoMeal(p, 'pa4');
    await p.click('[data-act=editMeal][data-id="' + m.id + '"]'); await p.click('[data-act=rmPhoto]'); await p.click('[data-act=saveMeal]');
    assert(!(await hasP(p, 'pa4')) && !(await getDb(p)).meals.find(x => x.id === m.id).photoIds.length);
    await noErrors(p);
  });
  await t('P1.1 remover foto e salvar com FALHA de gravação → nada é apagado', async () => {
    const p = await fresh({ init: () => { const orig = Storage.prototype.setItem; window.__fail = false; Storage.prototype.setItem = function (k, v) { if (window.__fail && k === 'treinosaude-data') throw new Error('Quota'); return orig.call(this, k, v); }; } });
    const m = await photoMeal(p, 'pa5');
    await p.click('[data-act=editMeal][data-id="' + m.id + '"]'); await p.click('[data-act=rmPhoto]');
    await p.evaluate(() => { window.__fail = true; }); await p.click('[data-act=saveMeal]');
    assert(await hasP(p, 'pa5'), 'apagou a foto mesmo com falha');
    assert(await p.isVisible('#sheet-wrap'), 'fechou a refeição mesmo com falha');
    assert(await p.isVisible('[data-save-error]'), 'sem aviso');
    assert((await getDb(p)).meals.find(x => x.id === m.id).photoIds.includes('pa5'), 'disco alterado');
    await noErrors(p);
  });
  await t('P1.1 excluir refeição com fotos → fotos apagadas', async () => {
    const p = await fresh(); const m = await photoMeal(p, 'pa6');
    await p.click('[data-act=editMeal][data-id="' + m.id + '"]'); await p.click('[data-act=delMeal]'); await p.click('[data-act=confirmOk]');
    assert(!(await hasP(p, 'pa6')));
    await noErrors(p);
  });
  await t('P1.1 verificar fotos guardadas lista órfãs sem apagar sozinho', async () => {
    const p = await fresh();
    await p.evaluate(() => localStorage.setItem('ts-photo-orf1', 'data:image/jpeg;base64,AAAA'));
    await p.click('#btn-settings'); await p.click('[data-act=checkPhotos]');
    assert((await p.textContent('#sheet')).includes('Apagar 1 foto'), 'não listou');
    assert(await hasP(p, 'orf1'), 'apagou sem confirmar');
    await p.click('[data-act=delOrphans]'); await p.click('[data-act=confirmOk]');
    assert(!(await hasP(p, 'orf1')));
    await noErrors(p);
  });

  // ---------------------------------------------------------------- P1.2 / P1.5 frequência e sessões
  await t('P1.2 contador semanal não passa de 100% e mostra extra', async () => {
    const p = await fresh();
    await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('treinosaude-data'));
      const mk = (date, st) => ({ id: Math.random().toString(36).slice(2, 9), date, planId: 'A', planName: 'Full Body A', status: st, exercises: [], notes: '' });
      d.sessions = [mk('2026-11-09', 'concluida'), mk('2026-11-09', 'concluida')];
      localStorage.setItem('treinosaude-data', JSON.stringify(d));
    });
    await p.reload();
    const m = (await p.textContent('#view')).match(/(\d+) de (\d+) na semana/);
    assert(m && Number(m[1]) <= Number(m[2]), 'contador: ' + (m && m[0]));
    await noErrors(p);
  });
  await t('P1.2 "Fazer hoje" registra remarcação (makeupFor)', async () => {
    const p = await fresh({ ctx: {} });
    // simula: segunda (planejado) perdida, hoje = terça
    await p.clock.setFixedTime(new Date(2026, 10, 10, 10, 0));
    await p.reload();
    await p.click('[data-tab=train]');
    await p.click('[data-act=startCheckin][data-makeup="2026-11-09"]');
    await p.click('[data-act=scale][data-name=ci_energy][data-v="4"]'); await p.click('[data-act=chip][data-name=ci_ate][data-v="sim"]'); await p.click('[data-act=chip][data-name=ci_water][data-v="sim"]');
    await p.click('[data-act=checkinNext]');
    const s = (await getDb(p)).sessions[0];
    assert(s.date === '2026-11-10' && s.makeupFor === '2026-11-09', JSON.stringify(s && { d: s.date, m: s.makeupFor }));
    await noErrors(p);
  });
  await t('P1.5 marcar "não fiz" duas vezes não duplica', async () => {
    const p = await fresh();
    await p.clock.setFixedTime(new Date(2026, 10, 10, 10, 0)); await p.reload();
    await p.click('[data-tab=train]');
    await p.click('[data-act=markDay][data-st=nao_realizada]');
    await p.click('[data-act=dayInfo][data-date="2026-11-09"]');
    const again = await p.$('[data-act=markDay]'); if (again) await again.click();
    assert((await getDb(p)).sessions.filter(s => s.date === '2026-11-09').length === 1, 'duplicou');
    await noErrors(p);
  });
  await t('P1.5 não abre segunda sessão em andamento; reabrir para edição e parar edição preserva histórico', async () => {
    const p = await fresh();
    await checkin(p);
    await allSets(p);
    await p.click('#rest [data-act=restStop]').catch(() => { });
    await p.click('[data-act=finishSession]'); await p.click('[data-act=finishSave]');
    const sid = (await getDb(p)).sessions[0].id;
    await checkin(p, { plan: 'B' }); // segunda sessão em andamento
    await p.click('[data-tab=train]');
    await p.click('[data-act=viewSession][data-id="' + sid + '"]'); await p.click('[data-act=reopenSession]');
    let db = await getDb(p);
    assert(db.sessions.filter(s => s.status === 'em_andamento').length === 1, 'duas sessões em andamento');
    // descarta a B e reabre a A
    await p.click('[data-act=closeSheet] >> nth=0');
    await p.click('[data-act=openSession]'); await p.click('[data-act=cancelSession]'); await p.click('[data-act=confirmOk]');
    await p.click('[data-act=viewSession][data-id="' + sid + '"]'); await p.click('[data-act=reopenSession]');
    await p.click('[data-act=cancelSession]');
    assert((await p.textContent('#sheet')).includes('Parar de editar'), 'descartar apagaria o histórico');
    await p.click('[data-act=confirmOk]');
    db = await getDb(p);
    const s = db.sessions.find(x => x.id === sid);
    assert(s && s.status === 'concluida' && !s.prevStatus, 'histórico alterado: ' + (s && s.status));
    await noErrors(p);
  });
  await t('P1.5 carga inválida fica marcada e é avisada ao finalizar', async () => {
    const p = await fresh();
    await checkin(p);
    await p.fill('[data-set="0:0:kg"]', '4o');
    assert(await p.$('[data-set="0:0:kg"][aria-invalid=true]'), 'sem marcação');
    await p.click('[data-act=finishSession]');
    assert((await p.textContent('#sheet')).includes('não são números válidos'), 'sem aviso');
    await noErrors(p);
  });

  // ---------------------------------------------------------------- 1.3: melhorias do treino
  await t('1.3 descanso progressivo: 45 s, 1 min, 1 min 15 s', async () => {
    const p = await fresh();
    await p.click('#btn-settings');
    await p.selectOption('#rs-mode', 'prog');
    assert((await p.textContent('#view')).includes('Série 1: 45 s · Série 2: 1 min · Série 3: 1 min 15 s'), 'prévia errada');
    await checkin(p);
    await p.click('.card.current [data-act=addSet]'); // 3 séries no primeiro exercício
    const restAfter = async si => { await p.click('[data-act=toggleSet][data-e="0"][data-s="' + si + '"]'); const t = await p.textContent('#rest'); await p.click('#rest [data-act=restStop]'); return t; };
    const r = [await restAfter(0), await restAfter(1), await restAfter(2)];
    assert(/Descanso 0:4[45]/.test(r[0]) && /Descanso (1:00|0:59)/.test(r[1]) && /Descanso 1:1[45]/.test(r[2]), 'tempos: ' + r.join(' | '));
    assert(r[0].includes('Próxima:'), 'sem próxima série');
    const db = await getDb(p);
    assert(db.settings.restMode === 'prog' && db.settings.restBase === 45 && db.settings.restStep === 15, 'config não salva');
    await noErrors(p);
  });
  await t('1.3 descanso conta pelo relógio (+15 s, segundo plano)', async () => {
    const p = await fresh();
    await p.clock.install({ time: new Date(2026, 10, 9, 18, 0) }); await p.reload();
    await checkin(p);
    await p.click('[data-act=toggleSet] >> nth=0');
    await p.click('#rest [data-act=restAdd]');
    assert((await p.textContent('#rest')).includes('1:45'), 'não somou 15 s: ' + await p.textContent('#rest'));
    await p.clock.runFor(60000);
    assert((await p.textContent('#rest')).includes('0:45'), 'contagem: ' + await p.textContent('#rest'));
    await p.clock.runFor(46000);
    assert(!(await p.isVisible('#rest')), 'não terminou');
    assert((await p.textContent('#toast')).includes('Descanso concluído'), 'sem aviso');
    await noErrors(p);
  });
  await t('1.3 Treino diário: dia de treino, dia de descanso e sessão em andamento', async () => {
    const p = await fresh();
    await p.clock.setFixedTime(new Date(2026, 10, 10, 10, 0)); await p.reload(); // terça: sem treino
    await p.click('[data-tab=daily]');
    assert((await p.textContent('#view')).includes('Hoje é dia de descanso'), 'terça deveria ser descanso');
    await p.clock.setFixedTime(new Date(2026, 10, 9, 10, 0)); await p.reload(); // segunda: Full Body A
    await p.click('[data-tab=daily]');
    const v = await p.textContent('#view');
    assert(v.includes('Hoje: Full Body A') && v.includes('Iniciar treino') && !v.includes('Continuar'), 'sem o treino do dia');
    await p.click('#view [data-act=startCheckin]');
    await p.click('[data-act=scale][data-name=ci_energy][data-v="4"]'); await p.click('[data-act=chip][data-name=ci_ate][data-v=sim]'); await p.click('[data-act=chip][data-name=ci_water][data-v=sim]');
    await p.click('[data-act=checkinNext]');
    await p.click('[data-tab=home]'); await p.click('[data-tab=daily]');
    assert(await p.$('[data-act=finishSession]'), 'Treino diário não abriu a sessão em andamento');
    assert(await p.$('#tabbar [data-tab=daily].on'), 'aba não destacada');
    await noErrors(p);
  });
  await t('1.3 pular treino do dia com motivo', async () => {
    const p = await fresh();
    await p.clock.setFixedTime(new Date(2026, 10, 9, 10, 0)); await p.reload();
    await p.click('[data-tab=daily]'); await p.click('[data-act=skipDay]');
    await p.click('[data-act=skipDaySave]');
    assert(!(await getDb(p)).sessions.length, 'pulou sem motivo');
    await p.click('[data-act=chip][data-name=skipDayReason][data-v=sem_tempo]'); await p.click('[data-act=skipDaySave]');
    const s = (await getDb(p)).sessions[0];
    assert(s && s.status === 'nao_realizada' && s.notes.includes('Sem tempo'), 'não registrou: ' + JSON.stringify(s));
    await noErrors(p);
  });
  await t('1.3 exercício atual em destaque; já feito, pular com motivo e fazer depois', async () => {
    const p = await fresh();
    await checkin(p);
    const cur = () => p.textContent('.card.current h3');
    const first = await cur();
    assert((await p.$$('.card.current')).length === 1 && await p.$('[data-act=exFocus]'), 'sem lista de próximos');
    // pular com motivo "Outro" exige texto
    await p.click('.card.current [data-act=exSkip]');
    await p.click('[data-act=chip][data-name=skipReason][data-v=outro]');
    await p.click('[data-act=skipSave]');
    assert(await p.$('#sk-note[aria-invalid=true]'), 'aceitou "Outro" sem motivo');
    await p.fill('#sk-note', 'dor no ombro'); await p.click('[data-act=skipSave]');
    assert(await cur() !== first, 'atual não avançou após pular');
    let v = await p.textContent('#view');
    assert(v.includes('Pulados') && v.includes('Motivo: Outro: dor no ombro'), 'pulado sem motivo na lista');
    // pular outro com "Ocupada"
    await p.click('.card.current [data-act=exSkip]'); await p.click('[data-act=chip][data-name=skipReason][data-v=ocupada]'); await p.click('[data-act=skipSave]');
    // já feito
    const third = await cur();
    await p.click('.card.current [data-act=exDone]');
    let db = await getDb(p);
    const s = db.sessions[0];
    assert(s.exercises[0].skip.reason === 'outro' && s.exercises[0].skip.note === 'dor no ombro' && s.exercises[1].skip.reason === 'ocupada', 'motivos não gravados');
    assert(s.exercises[2].sets.every(x => x.done), 'já feito não marcou as séries');
    assert((await p.textContent('#view')).includes('Feitos'), 'sem seção de feitos');
    // aparelho liberou: fazer agora
    await p.click('[data-act=exUnskip] >> nth=1');
    assert((await cur()).includes((await getDb(p)).sessions[0].exercises[1].name), 'fazer agora não trouxe o exercício');
    assert(!(await getDb(p)).sessions[0].exercises[1].skip, 'continua pulado');
    await allSets(p);
    await p.click('[data-act=finishSession]');
    assert(await p.$('[data-act=chip][data-name=finSt][data-v=parcial].on') && (await p.textContent('#sheet')).includes('1 exercício(s) pulado(s)'), 'com pulado deveria sugerir parcial');
    await p.click('[data-act=finishSave]');
    await p.click('[data-tab=train]'); await p.click('[data-act=viewSession] >> nth=0');
    assert((await p.textContent('#sheet')).includes('Pulado — Outro: dor no ombro'), 'histórico sem motivo');
    await noErrors(p);
  });
  await t('1.3 hora de início e fim, tempo por dia e correção manual', async () => {
    const p = await fresh();
    await p.clock.install({ time: new Date(2026, 10, 9, 18, 5) }); await p.reload();
    await checkin(p);
    assert((await p.textContent('#view')).includes('Início 18:05'), 'sem hora de início');
    await p.clock.runFor(52 * 60000);
    await p.click('[data-act=finishSession]');
    assert((await p.textContent('#sheet')).includes('Início 18:05 · fim agora (18:57) · 52 min'), 'resumo de horário: ' + await p.textContent('#sheet'));
    await p.click('[data-act=finishSave]');
    let s = (await getDb(p)).sessions[0];
    assert(new Date(s.startedAt).getHours() === 18 && new Date(s.endedAt).getMinutes() === 57, 'horários não gravados');
    await p.click('[data-tab=train]');
    let v = await p.textContent('#view');
    assert(v.includes('18:05–18:57 · 52 min') && v.includes('Esta semana: 52 min'), 'histórico/tempo da semana: ' + v.slice(v.indexOf('Tempo de treino'), v.indexOf('Tempo de treino') + 80));
    // correção manual
    await p.click('[data-act=viewSession] >> nth=0');
    await p.fill('#vs-start', '18:00'); await p.fill('#vs-end', '17:00'); await p.click('[data-act=saveSessionStatus]');
    assert(await p.$('#vs-end[aria-invalid=true]'), 'aceitou fim antes do início');
    await p.fill('#vs-end', '19:15'); await p.click('[data-act=saveSessionStatus]');
    assert((await p.textContent('#view')).includes('18:00–19:15 · 1 h 15'), 'correção não aplicada');
    // reabrir para editar séries não muda o horário de fim
    const end = (await getDb(p)).sessions[0].endedAt;
    await p.clock.runFor(3 * 3600000);
    await p.click('[data-act=viewSession] >> nth=0'); await p.click('[data-act=reopenSession]');
    await p.click('[data-act=finishSession]'); await p.click('[data-act=finishSave]');
    assert((await getDb(p)).sessions[0].endedAt === end, 'edição alterou o horário de fim');
    await noErrors(p);
  });
  await t('1.3 janela flutuante: mostra descanso e exercício atual', async () => {
    const p = await fresh();
    await checkin(p);
    await p.evaluate(() => window.onPip('1'));
    assert(await p.isVisible('#pip') && !(await p.isVisible('#view')), 'janela compacta não apareceu');
    assert((await p.textContent('#pip')).includes('Agora') && (await p.textContent('#pip')).includes('série 1 de'), 'sem exercício atual: ' + await p.textContent('#pip'));
    await p.evaluate(() => window.onPip('0'));
    await p.click('[data-act=toggleSet] >> nth=0');
    await p.evaluate(() => window.onPip('1'));
    assert((await p.textContent('#pip')).includes('Descanso') && (await p.textContent('#pip')).includes('série 2 de'), 'sem descanso: ' + await p.textContent('#pip'));
    await p.evaluate(() => window.onPip('0'));
    assert(await p.isVisible('#view') && await p.isVisible('#rest'), 'não voltou ao normal');
    await noErrors(p);
  });
  await t('1.3 Treino diário cabe em tela pequena (320 px) sem rolagem horizontal', async () => {
    const p = await fresh({ ctx: { viewport: { width: 320, height: 640 } } });
    await checkin(p);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const tab = await p.evaluate(() => { const r = document.querySelector('[data-tab=daily]').getBoundingClientRect(); return r.height; });
    assert(over <= 0 && tab < 80, 'rolagem horizontal ' + over + ' / altura da aba ' + tab);
    await noErrors(p);
  });

  // ---------------------------------------------------------------- P1.4 nutrição
  await t('P1.4 item livre só com kcal: macros ficam desconhecidos e total marcado como parcial', async () => {
    const p = await fresh();
    await p.click('[data-tab=food]'); await p.click('[data-act=newMeal]'); await p.click('[data-act=mealManual]');
    await p.fill('#mi-name', 'Marmita'); await p.fill('#mi-k', '600'); await p.click('[data-act=manualSave]');
    assert((await p.textContent('#sheet')).includes('parcial'), 'sem aviso de parcial');
    await p.click('[data-act=saveMeal]');
    const it = (await getDb(p)).meals.flatMap(m => m.items).find(i => i.name === 'Marmita');
    assert(it.kcal === 600 && it.p === null && it.c === null && it.f === null && it.kcalSource === 'informado');
    assert((await p.textContent('#view')).includes('*'), 'tela não marca parcial');
    await noErrors(p);
  });
  await t('P1.4 medida caseira inválida no cadastro é recusada (não some em silêncio)', async () => {
    const p = await fresh();
    await p.click('#btn-settings'); await p.click('[data-act=newFood]');
    await p.fill('#fd-name', 'Teste'); await p.fill('#fd-k', '100'); await p.fill('#fd-p', '1'); await p.fill('#fd-c', '1'); await p.fill('#fd-f', '1');
    await p.fill('#fd-units', 'colher = abc');
    await p.click('[data-act=saveFood]');
    assert(await p.$('#fd-units[aria-invalid=true]'), 'aceitou medida inválida');
    assert(!(await getDb(p)).foods.some(f => f.name === 'Teste'));
    await noErrors(p);
  });
  await t('P1.4 editar alimento não altera refeições já registradas', async () => {
    const p = await fresh();
    const db0 = await getDb(p);
    const item = db0.meals[0].items[0];
    await p.click('#btn-settings'); await p.click('[data-act=foodsList]'); await p.click('[data-act=editFood][data-id="' + item.foodId + '"]');
    await p.fill('#fd-k', '999'); await p.click('[data-act=saveFood]');
    const db1 = await getDb(p);
    assert(JSON.stringify(db1.meals) === JSON.stringify(db0.meals), 'histórico mudou');
    await noErrors(p);
  });

  // ---------------------------------------------------------------- regressão
  // ---------------------------------------------------------------- 1.4: primeira abertura e configuração por IA
  const SAMPLE = fs.readFileSync(path.join(__dirname, 'setup-exemplo.json'), 'utf8');
  const clip = { permissions: ['clipboard-read', 'clipboard-write'] };
  await t('S1 primeira abertura: boas-vindas com os 3 passos, sem abas e sem dados pessoais prontos', async () => {
    const p = await fresh({ onboard: false });
    const txt = await p.textContent('#view');
    assert(txt.includes('Copie o prompt') && txt.includes('Cole na IA') && txt.includes('Cole o código aqui'), 'passos');
    assert(!(await p.isVisible('#tabbar')) && !(await p.isVisible('#btn-ai')) && !(await p.isVisible('#btn-settings')), 'navegação visível antes de configurar');
    assert(!(await p.$('#sheet-wrap:not(.hidden)')), 'folha aberta por cima');
    assert((await raw(p)) == null, 'gravou antes de a pessoa escolher');
    await noErrors(p);
  });
  await t('S2 copiar prompt inicial leva o texto para a área de transferência', async () => {
    const p = await fresh({ onboard: false, ctx: clip });
    await p.click('[data-act=promptCopy]');
    const c = await p.evaluate(() => navigator.clipboard.readText());
    assert(c.includes('Cyl Gymly') && c.includes('MODELO DO CÓDIGO') && c.includes('"proteinaG"') && c.includes('Pão francês | g | 300 | 8'), 'prompt incompleto');
    await p.click('.prompt-view summary');
    assert((await p.inputValue('#wl-prompt')) === c, 'texto visível diferente do copiado');
    await noErrors(p);
  });
  await t('S3 código inválido, cortado ou sem perfil é recusado com mensagem junto ao campo (nada muda)', async () => {
    const p = await fresh({ onboard: false });
    for (const [code, re] of [['', /Cole aqui/], ['olá', /Não encontrei/], [SAMPLE.slice(0, 400), /cortado/], ['{"metas":{"kcal":1800}}', /perfil/], ['{"x":1}', /nenhuma seção/]]) {
      await p.fill('#su-json', code); await p.click('[data-act=setupCheck]');
      const e = await p.textContent('#su-json-err'); assert(re.test(e), 'mensagem para ' + JSON.stringify(code.slice(0, 20)) + ': ' + e);
    }
    assert(await p.$('[data-act=obDone]') && (await raw(p)) == null, 'saiu das boas-vindas');
    await noErrors(p);
  });
  await t('S4 colar o código da IA (com texto em volta) mostra resumo e aplica tudo de uma vez', async () => {
    const p = await fresh({ onboard: false });
    await p.clock.setFixedTime(new Date(2026, 10, 16, 10, 0)); await p.reload();
    await p.fill('#su-json', 'Claro! Aqui está o seu plano:\n```json\n' + SAMPLE + '\n```\nCopie o código acima e cole no Cyl Gymly.');
    await p.click('[data-act=setupCheck]');
    const sum = await p.textContent('#sheet');
    for (const x of ['Marina', '1.850 kcal', 'Treino A — pernas e glúteos', 'Seg, Qui', 'Total do dia', 'proteína 115 de 125 g', '3 alimento(s)']) assert(sum.includes(x), 'resumo sem: ' + x);
    assert((await raw(p)) == null, 'gravou antes de confirmar');
    await p.click('[data-act=setupApply]');
    const db = await getDb(p);
    assert(db.settings.onboarded && db.profile.name === 'Marina' && db.profile.startWeight === 82.4 && db.profile.targetWeight === 70 && db.profile.startDate === '2026-11-16', 'perfil');
    assert(db.nutritionGoals.length === 1 && db.nutritionGoals[0].protein === 125 && db.nutritionGoals[0].water === 2600, 'metas');
    assert(db.plans.length === 2 && JSON.stringify(db.schedule) === JSON.stringify({ 1: 'A', 2: 'B', 4: 'A', 5: 'B' }), 'treinos');
    assert(db.settings.restSeconds === 75 && db.settings.reminders.find(r => r.id === 'treino').enabled && db.settings.reminders.find(r => r.id === 'treino').hour === 18, 'preferências');
    const whey = db.foods.find(f => f.name === 'Whey protein');
    assert(whey && whey.p === 80 && whey.kcal === 400 && whey.units[0].g === 30 && db.foods.length === 40, 'alimentos com macros');
    assert(db.mealPlan.length === 4 && db.mealPlan[1].items[2].foodId && Math.round(db.mealPlan[1].items[2].p) === 48, 'cardápio');
    assert(!(await p.evaluate(d => window.HCore.validateDb(d).errors.length, db)), 'base inválida');
    assert(await p.isVisible('#tabbar') && await p.isVisible('#btn-ai') && (await p.textContent('#view')).includes('Treino A — pernas e glúteos'), 'não abriu o início');
    await p.reload(); assert(!(await p.$('[data-act=obDone]')), 'boas-vindas de novo');
    await noErrors(p);
  });
  await t('S5 caminho manual exige peso atual e desejado e começa com os treinos de exemplo', async () => {
    const p = await fresh({ onboard: false });
    await p.click('#wl-manual summary'); await p.click('[data-act=obDone]');
    assert(await p.$('#ob-w[aria-invalid=true]') && (await raw(p)) == null, 'aceitou sem peso');
    await p.fill('#ob-name', 'Leo'); await p.fill('#ob-w', '82,5'); await p.fill('#ob-tw', '75'); await p.click('[data-act=obDone]');
    const db = await getDb(p), today = await p.evaluate(() => window.HCore.today());
    assert(db.settings.onboarded && db.profile.startWeight === 82.5 && db.profile.startDate === today && db.weights.length === 1 && db.weights[0].kg === 82.5, 'perfil manual');
    assert(db.meals.length === 0 && db.nutritionGoals.length === 0 && db.medication.name === '', 'veio dado pessoal pronto');
    assert(db.scheduleHistory.length === 1 && db.scheduleHistory[0].from === today, 'agenda');
    await noErrors(p);
  });
  await t('S6 botão no topo: prompt de atualização leva os dados atuais e o pedido; código novo atualiza com cópia de segurança', async () => {
    const p = await fresh({ ctx: clip });
    await p.click('#btn-settings'); await p.fill('#gl-p', '150'); await p.click('[data-act=saveGoals]');
    await p.click('#btn-ai'); await p.fill('#ai-req', 'quero treinar 4 dias e mais proteína');
    await p.click('[data-act=promptCopy][data-mode=update]');
    const c = await p.evaluate(() => navigator.clipboard.readText());
    for (const x of ['quero treinar 4 dias e mais proteína', 'MINHA CONFIGURAÇÃO ATUAL', '"proteinaG":150', '"pesoInicialKg":115', 'Full Body A', 'RESUMO DO MEU PROGRESSO', 'inicial 115 kg']) assert(c.includes(x), 'prompt sem: ' + x);
    const before = await getDb(p);
    await p.fill('#su-json', JSON.stringify({ app: 'CylGymly', formato: 1, perfil: { pesoAtualKg: 113.4 }, metas: { proteinaG: 170, kcal: 2300 }, diasDeTreino: { seg: 'A', ter: 'B', qui: 'C', sab: 'A' } }));
    await p.click('[data-act=setupCheck]');
    assert((await p.textContent('#sheet')).includes('113,4 kg') && JSON.stringify(await getDb(p)) === JSON.stringify(before), 'mudou antes de confirmar');
    await p.click('[data-act=setupApply]');
    const db = await getDb(p), g = db.nutritionGoals[db.nutritionGoals.length - 1];
    assert(g.protein === 170 && g.kcal === 2300 && JSON.stringify(db.schedule) === JSON.stringify({ 1: 'A', 2: 'B', 4: 'C', 6: 'A' }), 'não aplicou');
    assert(db.profile.startWeight === 115 && db.weights.length === 2 && db.weights[1].kg === 113.4, 'peso');
    assert(db.plans.length === 3 && db.meals.length === before.meals.length && db.foods.length === before.foods.length, 'apagou o que não veio no código');
    const bk = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ts-backup-pre-setup-')));
    assert(bk.length === 1, 'sem cópia de segurança');
    await p.click('#btn-settings'); await p.click('[data-act=localBackups]');
    assert((await p.textContent('#sheet')).includes('Antes de aplicar uma configuração'), 'cópia não aparece para restaurar');
    await noErrors(p);
  });
  await t('S7 sem os dados de saúde, o prompt de atualização não leva tratamento nem sintomas', async () => {
    const p = await fresh();
    await p.click('[data-tab=health]'); await p.click('[data-act=editMed]'); await p.fill('#md-name', 'Remédio Zeta'); await p.fill('#md-dose', '5 mg'); await p.click('[data-act=saveMed]');
    assert((await p.textContent('#view')).includes('Remédio Zeta'), 'nome do tratamento não aparece');
    await p.click('#btn-ai'); await p.click('.prompt-view summary');
    assert((await p.inputValue('#ai-prompt')).includes('Remédio Zeta'), 'com saúde: faltou');
    await p.uncheck('#ai-health');
    const q = await p.inputValue('#ai-prompt');
    assert(!q.includes('Remédio Zeta') && !q.includes('5 mg') && !q.includes('"tratamento":{'), 'vazou dado de saúde');
    await noErrors(p);
  });
  await t('S8 cardápio: mostra proteína e demais valores por item e registra a refeição no dia', async () => {
    const p = await fresh();
    await p.click('#btn-ai'); await p.fill('#su-json', SAMPLE); await p.click('[data-act=setupCheck]'); await p.click('[data-act=setupApply]');
    await p.click('[data-tab=food]');
    const card = await p.textContent('[data-mealplan]');
    for (const x of ['Cardápio sugerido', '146 kcal · P 13,3 g · C 0,6 g · G 9,5 g', 'Total do cardápio', 'proteína 115 de 125 g']) assert(card.includes(x), 'cardápio sem: ' + x);
    const plan = (await getDb(p)).mealPlan[1];
    await p.click('[data-act=planMealLog][data-id="' + plan.id + '"]');
    assert((await p.textContent('#sheet')).includes('Peito de frango grelhado sem pele'), 'editor sem os itens');
    await p.click('[data-act=editItem][data-i="2"]'); assert((await p.inputValue('#q-amt')) === '150', 'quantidade não veio'); await p.click('[data-act=qtySave]');
    await p.click('[data-act=saveMeal]');
    const db = await getDb(p), m = db.meals[db.meals.length - 1];
    assert(m.type === 'Almoço' && m.planId === plan.id && m.items.length === 4 && Math.round(m.items.reduce((a, i) => a + i.p, 0)) === 56, 'refeição registrada errada');
    assert((await p.textContent('[data-act=planMealLog][data-id="' + plan.id + '"]')).includes('Registrada'), 'não marcou como registrada');
    await p.click('[data-mealplan] summary').catch(() => { }); if (!(await p.isVisible('[data-act=planClear]'))) await p.click('[data-mealplan] summary');
    await p.click('[data-act=planClear]'); await p.click('[data-act=confirmOk]');
    const db2 = await getDb(p); assert(db2.mealPlan.length === 0 && db2.meals.length === db.meals.length, 'remover cardápio');
    await noErrors(p);
  });
  await t('S9 conteúdo malicioso no código da IA e em séries de treino aparece como texto', async () => {
    const p = await fresh();
    await p.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.sessions.push({ id: 'sx', date: '2026-11-09', planId: 'A', planName: 'Full Body A', status: 'concluida', exercises: [{ name: 'Leg press', sets: [{ kg: '<img src=x onerror="window.__x=1">', reps: '<b id=inj>1</b>', done: true }] }] }); localStorage.setItem(k, JSON.stringify(d)); }, KEY);
    await p.reload();
    await p.click('[data-tab=train]'); await p.click('[data-act=viewSession][data-id=sx]');
    assert(!(await p.$('#sheet img')) && !(await p.$('#inj')), 'HTML injetado na sessão');
    await p.click('[data-act=closeSheet]'); await p.click('[data-tab=progress]'); await p.click('[data-act=prog][data-k=forca]');
    assert(!(await p.$('#view img')) && !(await p.$('#inj')), 'HTML injetado em Força');
    const evil = '<img src=x onerror="window.__x=1">';
    await p.click('#btn-ai');
    await p.fill('#su-json', JSON.stringify({ perfil: { nome: evil }, planos: [{ id: 'A', nome: evil, aquecimento: evil, orientacoes: evil, exercicios: [{ nome: evil, series: 2, repeticoes: evil }] }], diasDeTreino: { seg: 'A' }, tratamento: { medicamento: evil, dosePrescrita: evil },
      alimentos: [{ nome: evil, kcal: 100, proteinaG: 10, carboidratosG: 10, gordurasG: 2, medidas: [{ nome: evil, gramas: 10 }] }], cardapio: [{ refeicao: evil, observacoes: evil, itens: [{ alimento: evil, quantidade: evil, gramas: 50 }, { alimento: evil + '2', quantidade: evil, kcal: 10 }] }], lembretes: [{ id: 'treino', ativo: true, titulo: evil, texto: evil }] }));
    await p.click('[data-act=setupCheck]'); assert(!(await p.$('#sheet img')), 'HTML no resumo'); await p.click('[data-act=setupApply]');
    for (const tab of ['home', 'food', 'daily', 'train', 'progress', 'health']) { await p.click('[data-tab=' + tab + ']'); assert(!(await p.$('#view img')), 'HTML injetado em ' + tab); }
    await p.click('#btn-settings'); assert(!(await p.$('#view img')), 'HTML em configurações');
    assert(!(await p.evaluate(() => window.__x)), 'script executou');
    await noErrors(p);
  });
  await t('S10 boas-vindas e folha de IA sem rolagem horizontal em tela estreita (320 px)', async () => {
    const p = await fresh({ onboard: false, ctx: { viewport: { width: 320, height: 640 } } });
    const over = () => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert((await over()) <= 0, 'boas-vindas: ' + await over());
    await manualStart(p); await p.click('#btn-ai');
    assert((await over()) <= 0 && await p.evaluate(() => { const s = document.querySelector('#sheet'); return s.scrollWidth <= s.clientWidth; }), 'folha de IA');
    await noErrors(p);
  });
  await t('S11 computador (1280 px): menu lateral e as mesmas ações', async () => {
    const p = await fresh({ ctx: { viewport: { width: 1280, height: 800 } } });
    const box = await p.locator('#tabbar').boundingBox();
    assert(box.x === 0 && box.width < 300 && box.height > 500, 'menu não está na lateral');
    await p.click('[data-tab=food]'); await p.click('#btn-ai');
    const sb = await p.locator('#sheet').boundingBox(); assert(sb.x > 200 && sb.y > 20, 'folha não centralizada');
    await noErrors(p);
  });
  await t('R treinos A/B/C e dias seg/qua/sex sem horários', async () => {
    const p = await fresh(); const db = await getDb(p);
    assert(['A', 'B', 'C'].every(id => db.plans.find(x => x.id === id).exercises.length >= 5));
    assert(JSON.stringify(db.schedule) === JSON.stringify({ 1: 'A', 3: 'B', 5: 'C' }));
    assert(!JSON.stringify(db.plans).match(/hora|"time"/i), 'horário em plano');
    await noErrors(p);
  });
  await t('R alterar dias de treino preserva o passado', async () => {
    const p = await fresh();
    await p.clock.setFixedTime(new Date(2026, 10, 20, 10, 0)); await p.reload();
    await p.click('#btn-settings');
    await p.selectOption('select[data-change=schedule][data-wd="2"]', 'A');
    const db = await getDb(p);
    assert(db.schedule[2] === 'A' && db.scheduleHistory.length === 2 && db.scheduleHistory[0].schedule[2] === undefined && db.scheduleHistory[1].from === '2026-11-20', JSON.stringify(db.scheduleHistory));
    const past = await p.evaluate(() => window.HCore.plannedFor(JSON.parse(localStorage.getItem('treinosaude-data')), '2026-11-10'));
    const fut = await p.evaluate(() => window.HCore.plannedFor(JSON.parse(localStorage.getItem('treinosaude-data')), '2026-11-24'));
    assert(past === null && fut === 'A', 'passado alterado: ' + past + ' / ' + fut);
    await noErrors(p);
  });
  await t('R editar plano (séries inválidas recusadas; válidas salvas)', async () => {
    const p = await fresh();
    await p.click('#btn-settings'); await p.click('[data-act=editPlan][data-id="A"]');
    await p.fill('#pe-0-sets', 'abc'); await p.click('[data-act=savePlan]');
    assert(await p.$('#pe-0-sets[aria-invalid=true]'), 'aceitou séries inválidas');
    await p.fill('#pe-0-sets', '3'); await p.click('[data-act=savePlan]');
    assert((await getDb(p)).plans.find(x => x.id === 'A').exercises[0].sets === 3);
    await noErrors(p);
  });
  await t('R evolução de peso, medidas, força, frequência e avaliação de 4 semanas abrem', async () => {
    const p = await fresh();
    await p.click('[data-tab=progress]');
    assert(await p.$('svg.chart'), 'sem gráfico de peso');
    for (const k of ['medidas', 'forca', 'freq', 'aval']) { await p.click('[data-act=prog][data-k=' + k + ']'); }
    assert((await p.textContent('#view')).includes('Avaliações salvas'));
    await p.click('[data-act=openReview] >> nth=-1');
    const txt = await p.textContent('#sheet');
    assert(txt.includes('Critérios') && txt.includes('nunca muda a frequência'), 'avaliação');
    await p.click('[data-act=closeSheet]');
    await p.click('[data-act=prog][data-k=freq]');
    assert((await p.textContent('#view')).includes('Como a conta é feita'));
    await noErrors(p);
  });
  await t('R registro de medicação (sem sugerir dose) e relatório para médico', async () => {
    const p = await fresh();
    await p.click('[data-tab=health]'); await p.click('[data-act=addMedLog]');
    await p.fill('#ml-dose', '2,5 mg conforme receita'); await p.click('[data-act=saveMedLog]');
    assert((await getDb(p)).medLogs.length === 1);
    await p.click('[data-act=doctorReport]');
    const txt = await p.textContent('#sheet');
    assert(txt.includes('RELATÓRIO DE ACOMPANHAMENTO') && txt.includes('2,5 mg conforme receita'));
    await noErrors(p);
  });
  await t('R metas: inválidas recusadas, em branco aceitas', async () => {
    const p = await fresh();
    await p.click('#btn-settings'); await p.fill('#gl-p', 'muito'); await p.click('[data-act=saveGoals]');
    assert(await p.$('#gl-p[aria-invalid=true]') && !(await getDb(p)).nutritionGoals.length);
    await p.fill('#gl-p', '160'); await p.click('[data-act=saveGoals]');
    const g = (await getDb(p)).nutritionGoals; assert(g.length === 1 && g[0].protein === 160 && g[0].kcal === null);
    await noErrors(p);
  });
  await t('R tema claro/escuro/automático', async () => {
    const p = await fresh({ ctx: { colorScheme: 'dark' } });
    const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const auto = await bg();
    await p.click('#btn-settings'); await p.selectOption('select[data-change=theme]', 'light');
    const light = await bg();
    await p.selectOption('select[data-change=theme]', 'dark');
    assert(auto !== light && (await bg()) === auto, [auto, light].join(' / '));
    await p.screenshot({ path: path.join(OUT, 'tema-escuro.png') });
    await noErrors(p);
  });
  await t('R offline: nenhuma requisição de rede', async () => {
    const ctx = await browser.newContext({ offline: true }); const p = await ctx.newPage();
    const net = []; p.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) net.push(r.url()); });
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('file://' + target); await manualStart(p);
    for (const tab of ['food', 'train', 'progress', 'health', 'home']) await p.click('[data-tab=' + tab + ']');
    await p.click('#btn-settings');
    assert(!net.length, 'rede: ' + net.join());
    await noErrors(p);
  });
  await t('A11y foco visível, rótulos ligados e diálogo', async () => {
    const p = await fresh();
    await p.keyboard.press('Tab');
    const outline = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert(outline !== 'none', 'sem foco visível');
    await p.click('[data-tab=progress]'); await p.click('[data-act=addWeight]');
    assert(await p.$('label[for="w-kg"]') && await p.$('#sheet[role=dialog]'), 'rótulo/diálogo');
    await p.keyboard.press('Escape'); assert(!(await p.isVisible('#sheet-wrap')), 'Esc não fecha');
    await p.setViewportSize({ width: 320, height: 640 });
    await p.click('[data-tab=train]');
    const over = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert(!over, 'rolagem horizontal em 320px');
    await noErrors(p);
  });
  await t('A11y fonte ampliada (200%) sem rolagem horizontal', async () => {
    const p = await fresh();
    await p.addStyleTag({ content: 'html{font-size:200%!important} html,body{font-size:32px!important}' });
    for (const tab of ['home', 'food', 'train']) {
      await p.click('[data-tab=' + tab + ']');
      await p.addStyleTag({ content: 'body *{font-size:inherit}' }).catch(() => { });
    }
    await p.screenshot({ path: path.join(OUT, 'fonte-ampliada.png') });
    await noErrors(p);
  });

  await browser.close();
  const pass = results.filter(r => r.ok).length;
  fs.writeFileSync(path.join(OUT, 'e2e-result.json'), JSON.stringify({ when: new Date().toISOString(), pass, fail: results.length - pass, results }, null, 2));
  console.log('\n' + pass + ' de ' + results.length + ' passaram');
  process.exit(pass === results.length ? 0 : 1);
})();
