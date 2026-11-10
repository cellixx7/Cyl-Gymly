#!/usr/bin/env python3
"""Testes no emulador Android (variante depurável do APK, mesmo código da versão final).
Pré-requisitos: emulador ligado, app 1.0 instalado com dados e depois atualizado para a 1.1 (debug).
Uso: python3 tests/android/run_android.py <arquivo-com-data.json-da-v1.0>"""
import json, os, re, shlex, subprocess, sys, time
ADB = '/home/user/android-sdk/platform-tools/adb'
PKG = 'br.app.treinosaude'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'output'); os.makedirs(OUT, exist_ok=True)
results = []

def adb(*a, timeout=180):
    return subprocess.run([ADB, *a], capture_output=True, text=True, timeout=timeout).stdout
def sh(cmd, timeout=180): return adb('shell', cmd, timeout=timeout)
def runas(cmd): return adb('shell', 'run-as ' + PKG + ' sh -c ' + shlex.quote(cmd))
def files(): return runas('ls files files/backups')
def data_raw(): return runas('cat files/data.json')

def launch(wait=12):
    sh('am start -W -n %s/.MainActivity' % PKG)
    for _ in range(30):
        pid = sh('pidof ' + PKG).strip()
        if pid: break
        time.sleep(2)
    time.sleep(wait)
    adb('forward', '--remove-all'); adb('forward', 'tcp:9333', 'localabstract:webview_devtools_remote_' + pid)
    for _ in range(20):
        if js('document.readyState') == 'complete': return pid
        time.sleep(2)
    return pid
def stop(): sh('am force-stop ' + PKG); time.sleep(2)
def js(expr):
    r = subprocess.run(['node', os.path.join(HERE, 'cdp.js'), expr], capture_output=True, text=True, timeout=120)
    return r.stdout.strip()
def jsj(expr):
    v = js('JSON.stringify(' + expr + ')')
    try: return json.loads(v)
    except Exception: return v
def check(name, ok, detail=''):
    results.append({'name': name, 'ok': bool(ok), 'detail': detail})
    print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else '  -> ' + str(detail)[:300]))

v1 = json.load(open(sys.argv[1]))

# ---- 1) atualização 1.0 -> 1.1 mantém os dados
pid = launch()
st = jsj("{rec: !!document.querySelector('[data-recovery]'), onb: !!document.querySelector('[data-act=obDone]')}")
check('Atualização 1.0→1.1: abre normalmente, sem recuperação nem boas-vindas', st == {'rec': False, 'onb': False}, st)
js("document.querySelector('[data-act=addWater][data-ml=\"200\"]').click()")
time.sleep(1)
d = json.loads(data_raw())
same = {k: json.dumps(d.get(k), sort_keys=True) == json.dumps(v1.get(k), sort_keys=True) for k in ['meals', 'weights', 'sessions', 'foods', 'plans', 'profile', 'schedule', 'nutritionGoals']}
same['water'] = d['water'][:len(v1['water'])] == v1['water'] and len(d['water']) == len(v1['water']) + 1
check('Atualização: todos os registros da 1.0 preservados após a 1ª gravação', all(same.values()), same)
check('Atualização: estrutura migrada (versão 2, histórico de dias)', d.get('version') == 2 and len(d.get('scheduleHistory', [])) == 1, (d.get('version'), d.get('scheduleHistory')))

# ---- 2) fechamento forçado logo após registrar
js("document.querySelector('[data-act=addWater][data-ml=\"500\"]').click()")
stop(); pid = launch()
n = jsj("JSON.parse(AndroidBridge.loadData()).water.length")
check('Fechamento forçado logo após registrar: registro mantido', n == len(v1['water']) + 2, n)

# ---- 3) sessão: valor digitado e app vai para segundo plano (onPause grava o pendente)
js("""(function(){const q=s=>document.querySelector(s);q('[data-tab=train]').click();
q('[data-act=startCheckin][data-plan=A]') ? q('[data-act=startCheckin][data-plan=A]').click() : document.querySelectorAll('[data-act=startCheckin]')[0].click();
q('[data-act=scale][data-name=ci_energy][data-v=\"4\"]').click();q('[data-act=chip][data-name=ci_ate][data-v=sim]').click();q('[data-act=chip][data-name=ci_water][data-v=sim]').click();
q('[data-act=checkinNext]').click();return 'ok'})()""")
time.sleep(1)
js("""(function(){window.__st=window.setTimeout;window.setTimeout=function(){return 0};const i=document.querySelector('[data-set=\"0:0:kg\"]');i.value='37,5';i.dispatchEvent(new Event('input',{bubbles:true}));window.setTimeout=window.__st;return 'ok'})()""")
before = json.loads(data_raw())['sessions']
pending_on_disk = any(s.get('status') == 'em_andamento' and s['exercises'][0]['sets'][0]['kg'] == '37,5' for s in before)
sh('input keyevent KEYCODE_HOME'); time.sleep(4); stop()
after = json.loads(data_raw())['sessions']
ok = any(s.get('status') == 'em_andamento' and s['exercises'][0]['sets'][0]['kg'] == '37,5' for s in after)
check('Sessão: carga digitada é gravada ao sair do app (onPause), mesmo sem esperar o salvamento automático', ok and not pending_on_disk, {'antes_no_disco': pending_on_disk, 'depois': ok})
pid = launch()
js("document.querySelector('[data-tab=train]').click()")
cont = jsj("!!document.querySelector('[data-act=openSession]')")
js("document.querySelector('[data-act=openSession]').click()")
val = jsj("document.querySelector('[data-set=\"0:0:kg\"]').value")
check('Sessão interrompida é retomada após reabrir, com a carga digitada', cont and val == '37,5', (cont, val))

# ---- 4) rotação
sh('settings put system accelerometer_rotation 0'); sh('settings put system user_rotation 1'); time.sleep(8)
pid2 = sh('pidof ' + PKG).strip()
sh('settings put system user_rotation 0'); time.sleep(8)
crash = 'FATAL EXCEPTION' in adb('logcat', '-d', '-b', 'crash')
d2 = json.loads(data_raw())
ok = pid2 and not crash and any(s['status'] == 'em_andamento' and s['exercises'][0]['sets'][0]['kg'] == '37,5' for s in d2['sessions'])
check('Rotação de tela: sem travar e sem perder a sessão', ok, {'pid': pid2, 'crash': crash})
pid = launch(6)

# ---- 5) ponte nativa: nomes de arquivo perigosos e conteúdo inválido
r = jsj("""{g: AndroidBridge.getPhoto('../data'), rb: AndroidBridge.readBackup('../data.json'), rb2: AndroidBridge.readBackup('..'),
 p: AndroidBridge.putPhoto('../../x', 'data:image/jpeg;base64,AAAA'), p2: AndroidBridge.putPhoto('ok1', 'javascript:alert(1)'),
 sb: AndroidBridge.saveSafetyBackup('../x', 'a'), sd: AndroidBridge.saveData('{ruim')}""")
AndroidDelete = js("AndroidBridge.deletePhoto('../data'); 'ok'")
fl = files()
check('Ponte nativa recusa caminhos indevidos e conteúdo inválido', r == {'g': '', 'rb': '', 'rb2': '', 'p': False, 'p2': False, 'sb': False, 'sd': False} and 'data.json' in fl, r)
try: json.loads(data_raw()); valid = True
except Exception: valid = False
check('Arquivo principal continua válido após tentativa de gravar conteúdo inválido', valid)

# ---- 6) arquivo principal corrompido
stop()
good_backups = [x for x in runas('ls files/backups').split() if x.startswith('backup-')]
runas("printf '{\"app\":\"TreinoSaude\",\"meals\":[{\"id\"' > files/data.json")
pid = launch()
rec = jsj("!!document.querySelector('[data-recovery]')")
txt = js("document.querySelector('#view').textContent.slice(0,160)")
corrupt = [x for x in runas('ls files/backups').split() if x.startswith('corrupt-')]
kept = runas('cat files/backups/' + corrupt[-1]) if corrupt else ''
still = data_raw()
check('Arquivo corrompido: tela de recuperação aparece', rec, txt)
check('Arquivo corrompido: cópia guardada em backups/corrupt-* e nada é sobrescrito', kept.startswith('{"app":"TreinoSaude","meals":[{"id"') and still == kept, {'corrupt': corrupt, 'still_same': still == kept})
js("document.querySelector('[data-act=restoreLocal]').click()")
summ = js("document.querySelector('#sheet').textContent")
js("document.querySelector('[data-act=confirmOk]').click()")
time.sleep(1)
try: dd = json.loads(data_raw()); okr = not jsj("!!document.querySelector('[data-recovery]')") and len(dd['meals']) >= 3
except Exception as e: okr = False
pre = [x for x in runas('ls files/backups').split() if x.startswith('pre-restore-')]
check('Recuperação: restaurar cópia automática mostra resumo, volta ao normal e guarda o ilegível antes', okr and 'Refeições' in summ and pre and runas('cat files/backups/' + pre[-1]).startswith('{"app":"TreinoSaude","meals":[{"id"'), {'pre': pre, 'summary': summ[:120]})

# ---- 7) arquivo principal ausente com cópias existentes
stop(); runas('mv files/data.json files/data.json.bak-test')
pid = launch()
rec = jsj("!!document.querySelector('[data-recovery]')")
check('Arquivo principal ausente (com cópias): recuperação em vez de base vazia', rec and 'data.json' not in runas('ls files').split(), rec)
stop(); runas('mv files/data.json.bak-test files/data.json')

# ---- 8) sem internet
sh('svc wifi disable'); sh('svc data disable'); sh('settings put global airplane_mode_on 1'); sh('am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true')
pid = launch()
js("['food','train','progress','health','home'].forEach(t=>document.querySelector('[data-tab='+t+']').click()); document.querySelector('[data-act=addWater][data-ml=\"300\"]').click(); 'ok'")
w = jsj("JSON.parse(AndroidBridge.loadData()).water.length")
errs = 'Uncaught' in adb('logcat', '-d', '-s', 'TreinoSaude')
check('Sem internet (modo avião): abre, navega e grava', isinstance(w, int) and w > 0 and not errs, {'water': w})
sh('settings put global airplane_mode_on 0'); sh('am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false'); sh('svc wifi enable'); sh('svc data enable')

# ---- 9) lembretes: agendamento no sistema
js("document.querySelector('#btn-settings').click(); const c=document.querySelector('[data-change=remToggle]'); c.click(); 'ok'")
time.sleep(2)
al = sh('dumpsys alarm')
check('Lembretes: ao ativar, o alarme é agendado no Android', PKG in al, '')

# ---- 10) relaunch final e integridade
stop(); pid = launch()
v = jsj("window.HCore.validateDb(JSON.parse(AndroidBridge.loadData())).errors")
check('Reabertura final: base íntegra (sem erros de validação)', v == [], v)
check('Nenhum travamento registrado (logcat crash)', 'FATAL EXCEPTION' not in adb('logcat', '-d', '-b', 'crash'))

json.dump({'when': time.strftime('%Y-%m-%d %H:%M'), 'device': sh('getprop ro.build.version.release').strip(), 'webview': js('navigator.userAgent'), 'results': results}, open(os.path.join(OUT, 'android-result.json'), 'w'), indent=2, ensure_ascii=False)
print('%d de %d passaram' % (sum(r['ok'] for r in results), len(results)))
