'use strict';
// Records a short clip where Muse is actually called live through the product UI:
// the assistant answers a tax question, then the discovered configuration and its
// official source are shown.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'research', 'demo-videos', 'muse-live');
const OUT = path.join(WORK, 'muse-live.mp4');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ffmpegPath() {
  const found = cp.spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], {encoding: 'utf8'});
  return (found.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || null;
}

async function main() {
  if (typeof WebSocket !== 'function') throw Error('Node needs --experimental-websocket');
  const encoder = ffmpegPath();
  require('../src/web/environment').loadEnvironment(path.join(ROOT, '.env'));
  process.env.BIGM_REGULATORY_POLICY = 'HACKATHON_DEMO';
  process.env.BIGM_DEMO_TAX_CATALOGS = '0';
  process.env.BIGM_CONFIGURATION_AUTO_RESEARCH = '0';

  const sourceStore = path.join(ROOT, 'research', 'live-tax-discovery', 'nikos-2026-2026-11-01T08-37-35-216Z', 'workspace', 'store.json');
  const raw = JSON.parse(fs.readFileSync(sourceStore, 'utf8'));
  const orgId = raw.scopeOrgId;
  delete raw.configuration;
  delete raw.packApprovals;
  fs.rmSync(path.join(WORK, 'configuration-research'), {recursive: true, force: true});
  fs.rmSync(path.join(WORK, 'tax'), {recursive: true, force: true});
  fs.writeFileSync(path.join(WORK, 'store.json'), JSON.stringify(raw, null, 2), 'utf8');
  const {createWebStore} = require('../src/web/store');
  const store = createWebStore({persistPath: path.join(WORK, 'store.json'), orgId, demoTaxCatalogs: false});
  const {server} = require('../src/web/server').createServer({store});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/';

  const binary = [process.env.BIGM_CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find((p) => fs.existsSync(p));
  const profileDir = path.join(WORK, 'profile-' + crypto.randomUUID());
  fs.mkdirSync(profileDir, {recursive: true});
  const browser = cp.spawn(binary, ['--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions',
    '--hide-scrollbars', '--mute-audio', '--app=' + url, '--window-position=0,0', '--window-size=1366,768',
    '--remote-debugging-port=0', '--user-data-dir=' + profileDir], {windowsHide: false, stdio: ['ignore', 'ignore', 'pipe']});

  let socket, close;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(Error('Browser startup timed out')), 20000);
      browser.stderr.on('data', (chunk) => {
        text += chunk.toString();
        const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve) => socket.addEventListener('open', resolve, {once: true}));
    let next = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const work = pending.get(message.id);
      if (!work) return;
      pending.delete(message.id);
      message.error ? work.reject(Error(message.error.message)) : work.resolve(message.result);
    });
    const send = (method, params = {}, sid) => new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, {resolve, reject});
      socket.send(JSON.stringify({id, method, params, ...(sid ? {sessionId: sid} : {})}));
    });
    close = () => send('Browser.close');
    const targets = await send('Target.getTargets');
    const target = targets.targetInfos.find((info) => info.type === 'page' && info.url.startsWith('http'));
    const {sessionId} = await send('Target.attachToTarget', {targetId: target.targetId, flatten: true});
    const page = (method, params) => send(method, params, sessionId);
    await page('Runtime.enable');
    await page('Page.enable');
    const evaluate = async (expression) => {
      const result = await page('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
      if (result.exceptionDetails) throw Error('expression failed');
      return result.result?.value;
    };
    const until = async (expression, attempts = 400) => {
      for (let i = 0; i < attempts; i++) {
        if (await evaluate(expression)) return true;
        await sleep(100);
      }
      return false;
    };
    const ready = "(()=>{const c=document.querySelector('#pageContent');return Boolean(document.querySelector('#appShell')&&c&&c.children.length>0);})()";
    const openPage = async (name) => {
      for (let i = 0; i < 80; i++) {
        const clicked = await evaluate("(()=>{const b=document.querySelector('#primaryNav [data-page=\"" + name + "\"]');if(!b)return false;b.click();return true;})()");
        if (clicked) break;
        await sleep(100);
      }
      await until("document.querySelector('#primaryNav [data-page=\"" + name + "\"][aria-current=\"page\"]')&&" + ready);
    };

    await until(ready);
    await until("document.querySelectorAll('.metric-card').length>0");

    const rawVideo = path.join(WORK, 'screen2.mp4');
    const grab = cp.spawn(encoder, ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', '30',
      '-offset_x', '0', '-offset_y', '0', '-video_size', '1366x768', '-i', 'desktop',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', rawVideo],
      {windowsHide: true, stdio: ['pipe', 'ignore', 'inherit']});
    await sleep(1200);
    const started = Date.now();

    const scrollCard = (needle) => "(()=>{const cards=[...document.querySelectorAll('#pageContent section.card, #pageContent article')];const card=cards.find((c)=>{const h=c.querySelector('h2');return h&&new RegExp(" + JSON.stringify(needle) + ",'i').test(h.textContent);});if(card)card.scrollIntoView({block:'center',behavior:'auto'});return Boolean(card);})()";

    // 1. Before: the panel says Muse has not researched this workspace yet.
    await openPage('setup');
    await sleep(1500);
    await evaluate("(()=>{window.scrollTo({top:0});return true;})()");
    await sleep(3500);

    // 2. The user asks Muse to research, and the panel follows the real run.
    const askFrom = (Date.now() - started) / 1000;
    await evaluate("(()=>{const b=document.querySelector('#museResearchStart');if(b)b.click();return Boolean(b);})()");
    let finished = false;
    let sawRunning = false;
    await sleep(2500);
    for (let i = 0; i < 1600; i++) {
      await sleep(1000);
      const status = await evaluate("window.__bigmResearchStatus||null");
      if (status === 'RUNNING') sawRunning = true;
      if ((Date.now() - started) / 1000 > 480) break;
      if (sawRunning && status && status !== 'RUNNING') { finished = true; break; }
    }
    const askTo = (Date.now() - started) / 1000;
    await sleep(1500);
    await evaluate("(()=>{window.scrollTo({top:0});return true;})()");
    await sleep(3000);

    // 3. What was found, and where it came from.
    await evaluate(scrollCard('configuration'));
    await sleep(3500);
    grab.stdin.write('q');
    await new Promise((resolve) => { grab.once('exit', resolve); setTimeout(resolve, 8000); });

    const preRoll = 1.2;
    const speed = 8;
    const cutFrom = Math.max(0, askFrom + preRoll - 0.4);
    const cutTo = Math.max(cutFrom + 1, askTo + preRoll);
    const filter = "[0:v]trim=0:" + cutFrom.toFixed(2) + ",setpts=PTS-STARTPTS[a];" +
      "[0:v]trim=" + cutFrom.toFixed(2) + ":" + cutTo.toFixed(2) + ",setpts=(PTS-STARTPTS)/" + speed + "[b];" +
      "[0:v]trim=" + cutTo.toFixed(2) + ",setpts=PTS-STARTPTS[c];" +
      "[a][b][c]concat=n=3:v=1:a=0,crop=1366:718:0:0,fps=30[out]";
    await new Promise((resolve, reject) => {
      const job = cp.spawn(encoder, ['-y', '-loglevel', 'error', '-i', rawVideo, '-filter_complex', filter, '-map', '[out]',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT],
        {windowsHide: true, stdio: ['ignore', 'inherit', 'inherit']});
      job.on('exit', (code) => (code === 0 ? resolve() : reject(Error('ffmpeg ' + code))));
      job.on('error', reject);
    });
    const ffprobe = encoder.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
    const probe = cp.spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', OUT], {encoding: 'utf8'});
    const view = store.configuration.view();
    const chat = (view.candidates ?? []).map((c) => c.packId).join(',');
    const evidence = {
      schemaVersion: 'muse-live-clip/1',
      persona: 'nikos',
      liveMuseResearch: true,
      researchSeconds: Number((askTo - askFrom).toFixed(1)),
      finished,
      discoveredPacks: chat,
      video: path.relative(ROOT, OUT).replace(/\\/g, '/'),
      duration: Number((probe.stdout || '0').trim()),
      videoBytes: fs.statSync(OUT).size,
      recordedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(WORK, 'muse-live.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
    fs.rmSync(rawVideo, {force: true});
    console.log(JSON.stringify(evidence));
  } finally {
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
  console.error('CLIP_FAILED', error.message);
  process.exit(1);
});
