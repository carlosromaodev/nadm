// Local visual inspection against the supplied prototype, in an isolated headless Chrome.
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const output = '/tmp/nadm-design-qa';
await mkdir(output, { recursive: true });
const profile = await mkdtemp('/tmp/nadm-visual-chrome-');
const ownedChrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
let chromeURL;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    chromeURL = 'http://127.0.0.1:' + port;
    await fetch(chromeURL + '/json/version'); break;
  } catch { chromeURL = undefined; await new Promise(done => setTimeout(done, 500)); }
}
if (!chromeURL) { ownedChrome.kill(); throw new Error('Chrome de teste não iniciou.'); }
const target = await (await fetch(chromeURL + '/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done, fail) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', fail, { once: true }); });
let id = 0;
const pending = new Map();
const errors = [];
const networkFailures = [];
ws.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
  if (data.method === 'Network.responseReceived' && data.params.response.status >= 400) networkFailures.push({ url: data.params.response.url, status: data.params.response.status });
  if (data.id && pending.has(data.id)) {
    const { done, fail, timer } = pending.get(data.id);
    clearTimeout(timer); pending.delete(data.id);
    data.error ? fail(new Error(data.error.message)) : done(data.result);
  }
});
function send(method, params = {}) {
  return new Promise((done, fail) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); fail(new Error(`Timed out: ${method}`)); }, 90000);
    pending.set(key, { done, fail, timer }); ws.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Browser evaluation failed');
  return result.result.value;
}
async function reference(screen, variant, skin) {
  const source = await readFile('design/Design de app personalizado (2)/NaDMScreen.dc.html', 'utf8');
  const dom = new JSDOM(source);
  const document = dom.window.document;
  const code = document.querySelector('script[data-dc-script]').textContent;
  const Component = vm.runInNewContext(code + '\nComponent', { DCLogic: class { setState() {} } });
  const component = new Component(); component.props = { screen, variant, skin, tab: 'conteudo' };
  const values = component.renderVals();
  const value = (expression, context) => {
    const path = expression.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    return path.split('.').reduce((object, key) => object?.[key], context);
  };
  const bind = (text, context) => text.replace(/\{\{(.*?)\}\}/g, (_, expression) => {
    const result = value(expression, context); return result == null || typeof result === 'function' ? '' : String(result);
  });
  function render(node, context) {
    if (node.nodeType === 3) { node.textContent = bind(node.textContent, context); return; }
    if (node.nodeType !== 1) return;
    if (node.tagName === 'SC-IF') {
      if (!value(node.getAttribute('value').replace(/[{}]/g, ''), context)) { node.remove(); return; }
    }
    if (node.tagName === 'SC-FOR') {
      const list = value(node.getAttribute('list').replace(/[{}]/g, ''), context) ?? [];
      for (const item of list) for (const child of [...node.childNodes]) {
        const clone = child.cloneNode(true); node.before(clone); render(clone, { ...context, [node.getAttribute('as')]: item });
      }
      node.remove(); return;
    }
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      else node.setAttribute(attr.name, bind(attr.value, context));
    }
    for (const child of [...node.childNodes]) render(child, context);
    if (['SC-IF', 'HELMET', 'X-DC'].includes(node.tagName)) node.replaceWith(...node.childNodes);
  }
  const root = document.querySelector('x-dc'); render(root, { ...values, skin });
  document.querySelectorAll('script').forEach(node => node.remove());
  const phone = document.querySelector('[data-skin]');
  const screenNode = phone.firstElementChild;
  // Compare the app canvas; device bezel, status bar and home indicator belong to the mockup presentation.
  screenNode.firstElementChild.remove();
  if (screenNode.lastElementChild?.getAttribute('style')?.includes('height:26px')) screenNode.lastElementChild.remove();
  phone.setAttribute('style', 'height:100dvh;width:100%;max-width:420px;margin:auto');
  screenNode.setAttribute('style', 'height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);color:var(--ink);font-family:Nunito,system-ui,sans-serif');
  const style = document.createElement('style'); style.textContent = 'body{margin:0;background:var(--bg)}*{box-sizing:border-box}'; document.head.append(style);
  const path = resolve(output, `reference-${screen}-${skin}.html`);
  await writeFile(path, dom.serialize()); return `file://${path}`;
}

try {
  const [mode = 'app', route = '/entrar', widthText = '390', skin = 'dark', actor = ''] = process.argv.slice(2);
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: Number(widthText), height: 844, deviceScaleFactor: 1, mobile: false });
  const setup = mode !== 'reference' ? await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('nadm.theme',${JSON.stringify(skin)});${actor ? `localStorage.setItem('nadm.dev-user',${JSON.stringify(actor === 'creator' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222')});localStorage.setItem('nadm.mode',${JSON.stringify(actor)});` : ''}` }) : null;
  const url = mode === 'reference' ? await reference(route, actor || 'cheio', skin) : 'http://127.0.0.1:3001' + route;
  await send('Page.navigate', { url });
  const deadline = Date.now() + 85000;
  while (Date.now() < deadline) {
    if (await evaluate("document.readyState === 'complete' && document.body.innerText.length > 10 && !document.querySelector('svg[role=status]')")) break;
    await new Promise(done => setTimeout(done, 500));
  }
  await evaluate('document.fonts.ready');
  await new Promise(done => setTimeout(done, 1500));
  if (setup) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.identifier });
  if (mode !== 'reference') await evaluate(`document.documentElement.setAttribute('data-skin', ${JSON.stringify(skin)})`);
  if (mode === 'flow') {
    const { verifyFlows } = await import('./visual-qa-flows.mjs');
    await verifyFlows({ send, evaluate });
  }
  if (mode === 'update') {
    const { verifyUpdatedDesign } = await import('./visual-qa-update.mjs');
    await verifyUpdatedDesign({ send, evaluate });
  }
  const result = await evaluate(`({title:document.title,path:location.pathname,text:document.body.innerText.slice(0,3500),overflow:document.documentElement.scrollWidth>innerWidth || [...document.querySelectorAll('main')].some(e=>e.scrollWidth>e.clientWidth+1),shellWidth:document.querySelector('.app-frame')?.getBoundingClientRect().width,accessibility:{mainCount:document.querySelectorAll('main').length,imagesWithoutAlt:document.querySelectorAll('img:not([alt])').length,unnamedControls:[...document.querySelectorAll('button,input,select,textarea')].filter(e=>e.getBoundingClientRect().width>0 && !e.innerText?.trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.labels?.length).map(e=>e.outerHTML.slice(0,180))},buttons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({text:e.innerText,aria:e.getAttribute('aria-label')}))})`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const path = resolve(output, `${mode}-${route.replace(/[^a-zA-Z0-9]/g, '-')}-${widthText}-${skin}.png`);
  await writeFile(path, Buffer.from(shot.data, 'base64'));
  await writeFile(path.replace(/\.png$/, '.json'), JSON.stringify({ screenshot: path, errors, networkFailures, ...result }, null, 2));
  console.log(JSON.stringify({ screenshot: path, errors, networkFailures, ...result }, null, 2));
  if (errors.length) process.exitCode = 1;
  if (result.overflow) process.exitCode = 1;
} finally {
  await send('Page.close').catch(() => {}); ws.close();
  ownedChrome?.kill();
}
