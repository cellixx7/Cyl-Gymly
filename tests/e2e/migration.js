// Compatibilidade: dados criados pela versão 1.0 abrem na versão nova sem perda.
// Uso: node tests/e2e/migration.js <index.html da v1.0> [index.html novo]
const { chromium } = require('playwright');
const path = require('path');
const oldApp = path.resolve(process.argv[2]);
const newApp = path.resolve(process.argv[3] || path.join(__dirname, '../../app/src/main/assets/www/index.html'));
const KEY = 'treinosaude-data';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // 1) uso típico na v1.0
  await p.goto('file://' + oldApp);
  await p.click('[data-act=obDone]');
  await p.click('[data-act=addWater][data-ml="300"]');
  await p.click('[data-tab=train]');
  await p.click('[data-act=startCheckin] >> nth=-1');
  await p.click('[data-act=scale][data-name=ci_energy][data-v="4"]');
  await p.click('[data-act=chip][data-name=ci_ate][data-v="sim"]');
  await p.click('[data-act=checkinNext]');
  await p.fill('[data-set="0:0:kg"]', '40'); await p.click('[data-act=toggleSet] >> nth=0');
  await p.click('#rest [data-act=restStop]').catch(() => { });
  await p.click('[data-act=finishSession]'); await p.click('[data-act=finishSave]');
  await p.waitForTimeout(1000);
  // injeta uma foto com a v1.0 já fechada (para o app antigo não regravar por cima)
  const oldErrs = errs.splice(0);
  await p.goto('file://' + path.dirname(oldApp) + '/'); // listagem da pasta (mesma origem file://)
  await p.evaluate(() => { localStorage.setItem('ts-photo-pold1', 'data:image/jpeg;base64,AAAA'); });
  await p.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.meals[0].photoIds = ['pold1']; localStorage.setItem(k, JSON.stringify(d)); }, KEY);
  const v1 = await p.evaluate(k => localStorage.getItem(k), KEY);
  // 2) abre a versão nova com os mesmos dados
  errs.length = 0; // ignora erros da página de listagem do Chromium
  await p.goto('file://' + newApp);
  const res = await p.evaluate(k => ({ raw: localStorage.getItem(k), recovery: !!document.querySelector('[data-recovery]'), onboarding: !!document.querySelector('[data-act=obDone]'), view: document.querySelector('#view').textContent }), KEY);
  const a = JSON.parse(v1);
  await p.click('[data-act=addWater][data-ml="200"]'); // primeira gravação na versão nova
  const after = JSON.parse(await p.evaluate(k => localStorage.getItem(k), KEY));
  const out = {
    v1_version: a.version, recovery_shown: res.recovery, onboarding_shown_again: res.onboarding,
    new_version: after.version, scheduleHistory_added: Array.isArray(after.scheduleHistory) && after.scheduleHistory.length === 1,
    validation_errors: await p.evaluate(d => window.HCore.validateDb(d).errors, after),
    preserved: {}
  };
  for (const k of ['meals', 'sessions', 'weights', 'foods', 'plans', 'nutritionGoals', 'symptomLogs', 'medLogs', 'energyLogs', 'reviews', 'profile', 'schedule', 'medication'])
    out.preserved[k] = JSON.stringify(after[k]) === JSON.stringify(a[k]);
  out.preserved.water = JSON.stringify(after.water.slice(0, a.water.length)) === JSON.stringify(a.water) && after.water.length === a.water.length + 1;
  if (!out.preserved.meals) out.meals_diff = a.meals.map((m, i) => { const n = after.meals[i]; const d = {}; Object.keys(Object.assign({}, m, n)).forEach(k => { if (JSON.stringify(m[k]) !== JSON.stringify(n && n[k])) d[k] = [m[k], n && n[k]]; }); return d; }).filter(d => Object.keys(d).length);
  out.photo_still_present = await p.evaluate(() => localStorage.getItem('ts-photo-pold1') === 'data:image/jpeg;base64,AAAA');
  out.page_errors = errs; out.old_app_errors = oldErrs;
  console.log(JSON.stringify(out, null, 2));
  const ok = out.v1_version === 1 && !out.recovery_shown && !out.onboarding_shown_again && out.new_version === 2 && out.scheduleHistory_added && !out.validation_errors.length && Object.values(out.preserved).every(Boolean) && out.photo_still_present && !errs.length;
  console.log(ok ? 'MIGRAÇÃO OK' : 'MIGRAÇÃO FALHOU');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
