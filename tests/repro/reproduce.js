// Reproduz problemas da auditoria. Uso: node tests/repro/reproduce.js <caminho/para/index.html>
const { chromium } = require('playwright');
const target = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const res = {};
  async function fresh(init) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    p.on('dialog', d => d.dismiss());
    if (init) await p.addInitScript(init);
    await p.goto('file://' + target);
    return p;
  }
  // R1 armazenamento corrompido
  {
    const p = await fresh(() => { if (!sessionStorage.getItem('x')) { localStorage.setItem('treinosaude-data', '{"app":"TreinoSaude","meals":[{"id":"m1"'); sessionStorage.setItem('x', '1'); } });
    const before = await p.evaluate(() => localStorage.getItem('treinosaude-data'));
    const ob = await p.$('[data-act=obDone]'); if (ob) await ob.click();
    const btn = await p.$('[data-act=addWater]'); if (btn) await btn.click();
    const after = await p.evaluate(() => localStorage.getItem('treinosaude-data'));
    res.R1_corrupt_storage_overwritten = before !== after;
    res.R1_recovery_screen_shown = !!(await p.$('[data-recovery]'));
    await p.context().close();
  }
  // R2 falha de gravação no Android (bridge simulada)
  {
    const p = await fresh(() => { window.AndroidBridge = { loadData: () => '', loadState: () => JSON.stringify({ status: 'missing' }), saveData: () => false, setReminders() {}, listBackups: () => '[]', getPhoto: () => '', toast() {} }; });
    const ob = await p.$('[data-act=obDone]'); if (ob) await ob.click();
    await p.click('[data-act=addWater]');
    await p.waitForTimeout(3500);
    res.R2_persistent_save_error_visible = await p.evaluate(() => !!document.querySelector('[data-save-error]:not(.hidden)'));
    await p.context().close();
  }
  // R3 backup inválido (tipos errados)
  {
    const p = await fresh();
    const ob = await p.$('[data-act=obDone]'); if (ob) await ob.click();
    const before = await p.evaluate(() => localStorage.getItem('treinosaude-data'));
    await p.evaluate(() => window.onImportFile(JSON.stringify({ app: 'TreinoSaude', data: { profile: {}, meals: 'x', weights: [{ kg: 'abc', date: 'ontem' }] } })));
    const ok = await p.$('[data-act=confirmOk]'); if (ok) await ok.click();
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => localStorage.getItem('treinosaude-data'));
    res.R3_invalid_backup_accepted = before !== after;
    res.R3_page_errors = p.errs.slice(0, 3);
    await p.context().close();
  }
  // R4 XSS via backup (id de plano e data de exportação)
  {
    const p = await fresh();
    const ob = await p.$('[data-act=obDone]'); if (ob) await ob.click();
    const data = await p.evaluate(() => JSON.parse(localStorage.getItem('treinosaude-data')));
    data.plans[0].id = 'A"><img src=x onerror="window.__xss=1">';
    data.schedule = { 1: data.plans[0].id };
    await p.evaluate(d => window.onImportFile(JSON.stringify({ app: 'TreinoSaude', exportedAt: '<img src=y onerror="window.__xss2=1">', data: d })), data);
    await p.waitForTimeout(300);
    res.R4_xss_in_confirm = await p.evaluate(() => !!window.__xss2);
    const ok = await p.$('[data-act=confirmOk]'); if (ok) await ok.click();
    await p.click('[data-tab=train]').catch(() => {});
    await p.waitForTimeout(300);
    res.R4_xss_via_plan_id = await p.evaluate(() => !!window.__xss);
    await p.context().close();
  }
  // R5 item manual só com calorias
  {
    const p = await fresh();
    const ob = await p.$('[data-act=obDone]'); if (ob) await ob.click();
    await p.click('[data-tab=food]'); await p.click('[data-act=newMeal]'); await p.click('[data-act=mealManual]');
    await p.fill('#mi-name', 'Marmita'); await p.fill('#mi-k', '600'); await p.click('[data-act=manualSave]'); await p.click('[data-act=saveMeal]');
    const item = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('treinosaude-data')); const m = d.meals.find(x => x.items.some(i => i.name === 'Marmita')); return m.items.find(i => i.name === 'Marmita'); });
    res.R5_unknown_macros_became_zero = item.p === 0 && item.c === 0 && item.f === 0;
    await p.context().close();
  }
  // R6 frequência: 2 treinos no mesmo dia + 1 extra
  {
    const p = await fresh();
    const ob = await p.$('[data-act=obDone]'); if (ob) await ob.click();
    await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('treinosaude-data'));
      const mk = (date, st) => ({ id: Math.random().toString(36).slice(2), date, planId: 'A', planName: 'Full Body A', status: st, exercises: [], notes: '', startedAt: date });
      d.sessions = [mk('2026-11-09', 'concluida'), mk('2026-11-09', 'concluida'), mk('2026-11-10', 'concluida'), mk('2026-11-12', 'concluida')];
      localStorage.setItem('treinosaude-data', JSON.stringify(d));
    });
    await p.reload();
    const txt = await p.textContent('#view');
    const m = txt.match(/(\d+) de (\d+) na semana/);
    res.R6_week_counter = m ? m[0] : null;
    res.R6_over_100 = m ? Number(m[1]) > Number(m[2]) : null;
    await p.context().close();
  }
  // R8 foto adicionada e edição cancelada -> foto órfã
  {
    const p = await fresh();
    const ob = await p.$('[data-act=obDone]'); if (ob) await ob.click();
    await p.click('[data-tab=food]'); await p.click('[data-act=newMeal]');
    await p.evaluate(() => { localStorage.setItem('ts-photo-p123', 'data:image/jpeg;base64,AAAA'); window.onPhoto('p123'); });
    await p.click('[data-act=closeSheet]');
    res.R8_orphan_photo_after_cancel = await p.evaluate(() => localStorage.getItem('ts-photo-p123') != null);
    await p.context().close();
  }
  console.log(JSON.stringify(res, null, 2));
  await b.close();
})();
