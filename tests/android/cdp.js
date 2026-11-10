// Executa JavaScript dentro do WebView do app no emulador (variante depurável), via DevTools.
// Uso: node tests/android/cdp.js "<expressão JS>"
// Requer: adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
const expr = process.argv[2];
(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json();
  const page = list.find(x => x.type === 'page' && /index\.html/.test(x.url));
  if (!page) throw new Error('página do app não encontrada: ' + JSON.stringify(list.map(x => x.url)));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  const res = await new Promise((ok) => {
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) ok(d); };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });
  ws.close();
  if (res.result && res.result.exceptionDetails) { console.log('EXC ' + JSON.stringify(res.result.exceptionDetails.exception && res.result.exceptionDetails.exception.description || res.result.exceptionDetails.text)); process.exit(2); }
  const v = res.result && res.result.result ? res.result.result.value : res;
  console.log(typeof v === 'string' ? v : JSON.stringify(v));
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
