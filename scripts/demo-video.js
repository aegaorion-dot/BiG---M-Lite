'use strict';
// Records one ~60s fullscreen walkthrough that starts from an EMPTY workspace and
// ends with a governed, source-grounded tax estimate. Muse is not called while
// recording: the official documents already discovered for this persona are
// reused from the qualification run, with their original provenance intact.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(ROOT, 'research', 'live-tax-discovery');
const OUT = path.join(ROOT, 'research', 'demo-videos');
const PERIOD = {periodStart: '2026-01-01', periodEnd: '2026-12-31'};

const PERSONAS = {
  maya: {
    language: 'id-ID', dictionary: 'id',
    facts: {displayName: 'Maya', language: 'id', orgName: 'Maya Bakery', businessType: 'kuliner', subjectType: 'INDIVIDUAL', activities: ['CAFE_OPERATOR'], jurisdiction: 'ID', currency: 'IDR', customer: 'Bakery counter sales', supplier: 'Baking ingredients supplier', saleDescription: 'Bakery and pastry sales', purchaseDescription: 'Ingredients and packaging', referencePrefix: 'MAYA'},
    sales: [['2026-01-15', '168000000'], ['2026-04-15', '180000000'], ['2026-07-15', '157000000']],
    purchases: [['2026-01-20', '67000000'], ['2026-04-20', '71500000'], ['2026-07-20', '63500000']],
  },
  nikos: {
    language: 'en', dictionary: 'en',
    facts: {displayName: 'Nikos', language: 'en', orgName: 'Nikos Consulting', businessType: 'freelancer', subjectType: 'INDIVIDUAL', activities: ['FREELANCER'], jurisdiction: 'US', currency: 'USD', customer: 'Advisory clients', supplier: 'Software and subcontractors', saleDescription: 'Consulting services invoiced', purchaseDescription: 'Software subscriptions and subcontractor fees', referencePrefix: 'NIKOS'},
    sales: [['2026-01-20', '36500'], ['2026-04-20', '39500'], ['2026-07-20', '32900']],
    purchases: [['2026-01-25', '12300'], ['2026-04-25', '13200'], ['2026-07-25', '11500']],
  },
  haruto: {
    language: 'ja', dictionary: 'ja',
    facts: {displayName: 'Haruto', language: 'ja', orgName: 'Haruto Shoten', businessType: 'small-business', subjectType: 'INDIVIDUAL', activities: ['CAFE_OPERATOR'], jurisdiction: 'JP', currency: 'JPY', customer: 'Store counter sales', supplier: 'Wholesale goods supplier', saleDescription: 'Retail goods sold', purchaseDescription: 'Wholesale goods purchased', referencePrefix: 'HARUTO'},
    sales: [['2026-01-25', '9300000'], ['2026-04-25', '9650000'], ['2026-07-25', '9400000']],
    purchases: [['2026-01-28', '5550000'], ['2026-04-28', '5750000'], ['2026-07-28', '5400000']],
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function removeDir(dir) {
  for (let attempt = 0; attempt < 25; attempt++) {
    try { fs.rmSync(dir, {recursive: true, force: true}); return; } catch { await sleep(300); }
  }
  fs.rmSync(dir, {recursive: true, force: true});
}

function latestRun(persona) {
  return fs.readdirSync(BASE)
    .filter((name) => name.startsWith(persona + '-') && fs.existsSync(path.join(BASE, name, 'workspace', 'store.json')))
    .sort()
    .at(-1);
}

function ffmpeg() {
  const found = cp.spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], {encoding: 'utf8'});
  const first = (found.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
  return first || null;
}

function dictionaries() {
  const source = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const inline = (name) => {
    const start = source.indexOf('var ' + name + '=') + ('var ' + name + '=').length;
    let depth = 0, index = start, quote = null;
    for (; index < source.length; index++) {
      const char = source[index];
      if (quote) {
        if (char === '\\') { index++; continue; }
        if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
      if (char === '{') depth++;
      else if (char === '}') { depth--; if (depth === 0) { index++; break; } }
    }
    return new Function('return ' + source.slice(start, index))();
  };
  return {en: inline('EN'), id: inline('ID'), 'ar-MA': inline('AR'), 'el-GR': require('../public/i18n/el-ui.js'), ja: require('../public/i18n/ja-ui.js')};
}

async function main() {
  if (typeof WebSocket !== 'function') throw Error('Node needs --experimental-websocket for the recorder');
  const persona = process.argv[2];
  if (!PERSONAS[persona]) throw Error('Usage: node --experimental-websocket scripts/demo-video.js <maya|nikos|haruto>');
  const encoder = ffmpeg();
  if (!encoder) throw Error('ffmpeg is required to encode the recording');

  require('../src/web/environment').loadEnvironment(path.join(ROOT, '.env'));
  process.env.BIGM_REGULATORY_POLICY = 'HACKATHON_DEMO';
  process.env.BIGM_CONFIGURATION_AUTO_RESEARCH = '0';

  const spec = PERSONAS[persona];
  const facts = spec.facts;
  const runName = latestRun(persona);
  if (!runName) throw Error('No qualification run with a persisted workspace for ' + persona);
  const runWorkspace = path.join(BASE, runName, 'workspace');

  const workDir = path.join(OUT, persona);
  const frameDir = path.join(workDir, 'frames');
  await removeDir(workDir);
  fs.mkdirSync(workDir, {recursive: true});
  fs.mkdirSync(frameDir, {recursive: true});
  // Start from an empty workspace: no profile, no postings. Only the official
  // documents and governed content already discovered are carried over.
  for (const sidecar of ['configuration-research', 'tax']) {
    const from = path.join(runWorkspace, sidecar);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(workDir, sidecar), {recursive: true});
  }
  const persistPath = path.join(workDir, 'store.json');

  const {createWebStore} = require('../src/web/store');
  const store = createWebStore({persistPath, orgId: 'org-' + persona + '-demo', demoTaxCatalogs: false});
  if (store.workspaceProfile().activated) throw Error('Workspace must start empty for ' + persona);
  const orgId = 'org-' + persona + '-demo';
  const {server} = require('../src/web/server').createServer({store});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/';

  const candidates = [process.env.BIGM_CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  const binary = candidates.find((candidate) => fs.existsSync(candidate));
  if (!binary) throw Error('Set BIGM_CHROME_PATH to an installed Chromium browser');
  const profileDir = path.join(workDir, 'profile-' + crypto.randomUUID());
  fs.mkdirSync(profileDir, {recursive: true});
  const browser = cp.spawn(binary, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--hide-scrollbars', '--mute-audio', '--window-size=1366,768', '--remote-debugging-port=0',
    '--user-data-dir=' + profileDir, 'about:blank'], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});

  let socket;
  let close;
  let recording = false;
  const collected = [];
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(Error('Browser startup timed out')), 20000);
      browser.stderr.on('data', (chunk) => {
        text += chunk.toString();
        const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      browser.on('error', () => reject(Error('Browser could not start')));
      browser.on('exit', () => reject(Error('Browser exited before connection')));
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, {once: true});
      socket.addEventListener('error', () => reject(Error('Browser connection failed')), {once: true});
    });
    let next = 0;
    const pending = new Map();
    let sessionId = null;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Page.screencastFrame') {
        const {data, metadata, sessionId: frameSession} = message.params;
        if (recording) {
          const name = 'f' + String(collected.length).padStart(5, '0') + '.jpg';
          fs.writeFileSync(path.join(frameDir, name), Buffer.from(data, 'base64'));
          collected.push({name, at: Math.round(metadata.timestamp * 1000)});
        }
        socket.send(JSON.stringify({id: ++next, method: 'Page.screencastFrameAck', params: {sessionId: frameSession}, sessionId}));
        return;
      }
      if (message.method === 'Page.javascriptDialogOpening' && sessionId) {
        socket.send(JSON.stringify({id: ++next, method: 'Page.handleJavaScriptDialog', params: {accept: true}, sessionId}));
        return;
      }
      if (!message.id) return;
      const work = pending.get(message.id);
      if (!work) return;
      pending.delete(message.id);
      clearTimeout(work.timer);
      message.error ? work.reject(Error(message.error.message)) : work.resolve(message.result);
    });
    const send = (method, params = {}, sid) => new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('Browser command timed out: ' + method));
      }, 30000);
      pending.set(id, {resolve, reject, timer});
      socket.send(JSON.stringify({id, method, params, ...(sid ? {sessionId: sid} : {})}));
    });
    close = () => send('Browser.close');
    const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
    sessionId = (await send('Target.attachToTarget', {targetId, flatten: true})).sessionId;
    const page = (method, params) => send(method, params, sessionId);
    await page('Runtime.enable');
    await page('Page.enable');
    await page('Emulation.setDeviceMetricsOverride', {width: 1366, height: 768, deviceScaleFactor: 1, mobile: false});

    const evaluate = async (expression) => {
      const result = await page('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
      if (result.exceptionDetails) throw Error('Browser expression failed: ' + expression.slice(0, 110));
      return result.result?.value;
    };
    const until = async (expression, attempts = 200) => {
      for (let attempt = 0; attempt < attempts; attempt++) {
        if (await evaluate(expression)) return;
        await sleep(50);
      }
      throw Error('UI did not become ready: ' + expression.slice(0, 110));
    };
    const ready = "(()=>{const c=document.querySelector('#pageContent');return Boolean(document.querySelector('#appShell')&&c&&c.children.length>0);})()";
    const openPage = async (name) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const clicked = await evaluate("(()=>{const b=document.querySelector('#primaryNav [data-page=\"" + name + "\"]');if(!b)return false;b.click();return true;})()");
        if (clicked) break;
        await sleep(100);
      }
      await until("document.querySelector('#primaryNav [data-page=\"" + name + "\"][aria-current=\"page\"]')&&" + ready);
    };
    const typeInto = async (selector, text) => {
      await evaluate("(()=>{const el=document.querySelector(" + JSON.stringify(selector) + ");if(!el)return false;el.focus();el.value='';return true;})()");
      await page('Input.insertText', {text});
      await sleep(150);
    };
    const selectValue = async (selector, value) => evaluate("(()=>{const el=document.querySelector(" + JSON.stringify(selector) + ");if(!el)return false;el.value=" + JSON.stringify(value) + ";el.dispatchEvent(new Event('change',{bubbles:true}));return true;})()");
    const scrollTo = async (selector) => evaluate("(()=>{const el=document.querySelector(" + JSON.stringify(selector) + ");if(!el)return false;el.scrollIntoView({block:'center',behavior:'auto'});return true;})()");
    const scrollCard = async (text) => evaluate("(()=>{const list=[...document.querySelectorAll('#pageContent article, #pageContent section')].filter((a)=>{const h=a.querySelector('h2');return h&&h.textContent.trim().indexOf(" + JSON.stringify(text) + ')===0;});const card=list[list.length-1];if(!card)return false;card.scrollIntoView({block:"center",behavior:"auto"});return true;})()');

    await page('Page.navigate', {url});
    await until(ready);
    await until("document.querySelector('#pageContent .hero-banner')!==null");
    // The empty workspace must fall back to English before the profile exists.
    await until("document.documentElement.lang==='en'");
    const dict = dictionaries()[spec.dictionary] ?? {};
    const label = (key, fallback) => dict[key] ?? fallback;

    const started = Date.now();
    const frames = [];
    const mark = (label) => console.error('MARK', label, Date.now() - started, 'ms frames', frames.length);
    const interval = 100;
    recording = true;
    const capture = (async () => {
      while (recording) {
        const target = started + frames.length * interval;
        const now = Date.now();
        if (now < target - 20) { await sleep(target - now); continue; }
        try {
          const shot = await page('Page.captureScreenshot', {format: 'jpeg', quality: 65, captureBeyondViewport: false});
          const name = 'f' + String(frames.length).padStart(5, '0') + '.jpg';
          fs.writeFileSync(path.join(frameDir, name), Buffer.from(shot.data, 'base64'));
          frames.push({name, at: Date.now()});
        } catch { await sleep(40); }
      }
    })();

    // 1. Empty workspace: no profile, no records, no estimate.
    mark('empty');
    await sleep(3000);
    // 2. Business setup through the real form.
    await evaluate("(()=>{const b=document.querySelector('[data-action=\"onboarding\"]');if(b)b.click();return Boolean(b);})()");
    await until("document.querySelector('#setName')!==null");
    await sleep(1200);
    await typeInto('#setName', facts.orgName);
    await sleep(800);
    await selectValue('#setBiz', facts.businessType);
    await sleep(700);
    await selectValue('#setCur', facts.currency);
    await sleep(700);
    await selectValue('#setWork', facts.jurisdiction);
    await sleep(700);
    await evaluate("(()=>{const b=document.querySelector('#setupSave');if(b)b.click();return Boolean(b);})()");
    await sleep(1400);
    mark('form');
    // 3. Facts only the taxpayer knows, then the governed configuration proposal.
    store.editProfile({slot: 'user.displayName', value: facts.displayName, actor: facts.displayName});
    store.editProfile({slot: 'user.language', value: facts.language, actor: facts.displayName});
    store.editProfile({slot: 'org.subjectType', value: facts.subjectType, actor: facts.displayName});
    store.editProfile({slot: 'org.activities', value: facts.activities, actor: facts.displayName});
    store.editProfile({slot: 'modules.enabled', value: ['sales', 'purchase', 'accounting', 'reports', 'import'], actor: facts.displayName});
    store.editProfile({slot: 'accounting.periodStart', value: PERIOD.periodStart, actor: facts.displayName});
    store.editProfile({slot: 'accounting.periodEnd', value: PERIOD.periodEnd, actor: facts.displayName});
    for (const basis of ['REGISTRATION', 'BUSINESS_WORK_LOCATION', 'TAX_RESIDENCE', 'SOURCE']) store.editProfile({basis, countryCode: facts.jurisdiction, actor: facts.displayName});
    await sleep(600);
    await evaluate("(()=>{const b=document.querySelector('#setupPropose');if(b)b.click();return Boolean(b);})()");
    await sleep(2200);
    mark('propose');
    if (!store.workspaceProfile().activated) throw Error('Onboarding did not activate the workspace');
    // 4. Activation switches the whole UI to the confirmed profile language.
    await until("document.documentElement.lang===" + JSON.stringify(spec.language));
    await sleep(2000);
    mark('language');
    // 5. Posted activity, profit and the governed demo estimate.
    for (const [date, amount] of spec.sales) await store.createSale({id: persona + '-sale-' + date, orgId, date, jurisdiction: facts.jurisdiction, currency: facts.currency, customer: facts.customer, invoiceRef: facts.referencePrefix + '-S-' + date, description: facts.saleDescription, amountMajor: amount}, {actor: facts.displayName});
    for (const [date, amount] of spec.purchases) await store.createPurchase({id: persona + '-purchase-' + date, orgId, date, jurisdiction: facts.jurisdiction, currency: facts.currency, supplier: facts.supplier, billRef: facts.referencePrefix + '-P-' + date, description: facts.purchaseDescription, amountMajor: amount}, {actor: facts.displayName});
    const prepared = store.configuration.refreshEstimates();
    const calculated = (prepared.estimates ?? []).filter((entry) => entry.status === 'CALCULATED');
    if (!calculated.length) throw Error('No calculated tax estimate for ' + persona + ': ' + prepared.status);
    mark('postings');
    await page('Page.reload');
    await until(ready);
    await sleep(1400);
    await scrollTo('.metric-grid');
    await sleep(2400);
    await scrollTo('.chart-card');
    await sleep(2000);
    mark('dashboard-light');
    // 6. Night mode.
    await evaluate("(()=>{const b=document.querySelector('#themeToggle');if(b)b.click();return true;})()");
    await sleep(1400);
    await evaluate("(()=>{window.scrollTo({top:0});return true;})()");
    await sleep(1200);
    await scrollTo('.metric-grid');
    await sleep(1800);
    await scrollTo('.chart-card');
    await sleep(1600);
    mark('night');
    // 7. Records, reports and the tax estimate with its official source.
    await openPage('transactions');
    await sleep(1800);
    await evaluate("(()=>{const t=document.querySelector('#pageContent .data-table-wrap');if(t)t.scrollIntoView({block:'center',behavior:'auto'});return true;})()");
    await sleep(1800);
    await openPage('reports');
    await sleep(2200);
    await openPage('tax');
    await sleep(1000);
    await scrollCard(label('taxEstimate', 'Estimated tax'));
    await sleep(6500);
    mark('tax');
    // 8. Confirm language and jurisdiction in settings.
    await openPage('settings');
    await sleep(1600);
    await scrollTo('#languageSelect');
    await sleep(1800);
    mark('settings');
    recording = false;
    await capture;
    if (!frames.length) throw Error('Screen capture produced no frames');
    const elapsed = (frames.at(-1).at - started) / 1000;
    const fps = Math.max(1, frames.length / elapsed);
    const output = path.join(workDir, persona + '-demo.mp4');
    const args = ['-y', '-loglevel', 'error', '-framerate', fps.toFixed(3), '-i', path.join(frameDir, 'f%05d.jpg'),
      '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output];
    await new Promise((resolve, reject) => {
      const job = cp.spawn(encoder, args, {windowsHide: true, stdio: ['ignore', 'inherit', 'inherit']});
      job.on('exit', (code) => (code === 0 ? resolve() : reject(Error('ffmpeg exited with ' + code))));
      job.on('error', reject);
    });
    const estimate = calculated[0];
    const evidence = {
      schemaVersion: 'demo-video/1',
      persona,
      startedFromEmpty: true,
      reusedMuseRun: runName,
      liveMuseCallsWhileRecording: 0,
      language: spec.language,
      theme: 'night',
      estimate: {
        taxType: estimate.taxType,
        taxAmount: estimate.taxAmount,
        taxableBase: estimate.taxableBase,
        rules: (estimate.appliedRules ?? []).map((rule) => rule.packId + ':' + rule.governanceStatus),
        sources: (estimate.legalSources ?? []).length,
      },
      viewport: {width: 1366, height: 768},
      seconds: Number(elapsed.toFixed(2)),
      frames: frames.length,
      fps: Number(fps.toFixed(2)),
      pages: ['home', 'setup', 'transactions', 'reports', 'tax', 'settings'],
      video: path.relative(ROOT, output).replace(/\\/g, '/'),
      videoBytes: fs.statSync(output).size,
      recordedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(workDir, persona + '-demo.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    fs.rmSync(frameDir, {recursive: true, force: true});
    console.log(JSON.stringify(evidence));
  } finally {
    recording = false;
    if (close) try { await close(); } catch {}
    if (socket) socket.close();
    if (browser.exitCode === null) {
      await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), sleep(2000)]);
      if (browser.exitCode === null) browser.kill();
    }
    server.close();
    for (let attempt = 0; attempt < 20; attempt++) {
      try { fs.rmSync(profileDir, {recursive: true, force: true}); break; } catch { await sleep(250); }
    }
  }
}

main().catch((error) => {
  console.error('RECORDER_FAILED', error.message);
  process.exit(1);
});
