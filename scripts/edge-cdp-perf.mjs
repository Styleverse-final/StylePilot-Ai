import { spawn } from 'child_process';
import http from 'http';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9222;

function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Launching headless Edge for DevTools Performance analysis...');
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    'about:blank'
  ]);

  edge.on('error', err => console.error('Edge process error:', err));

  // Wait for remote debugging to be ready and find/create a page target
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await wait(300);
    try {
      const targetList = await httpGet(`http://127.0.0.1:${PORT}/json`);
      const pageTarget = targetList.find(t => t.type === 'page');
      if (pageTarget?.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Could not find a valid page target in Edge DevTools');
    edge.kill();
    return;
  }
  console.log('Connected to Edge DevTools WebSocket:', wsUrl);

  const WsClass = globalThis.WebSocket;
  if (!WsClass) {
    console.log('WebSocket not available.');
    edge.kill();
    return;
  }

  const ws = new WsClass(wsUrl);
  let id = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  });

  await new Promise(r => ws.addEventListener('open', r));

  let loadFired = false;
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Page.loadEventFired') {
      loadFired = true;
    }
  });

  await send('Network.enable');
  await send('Page.enable');
  await send('Performance.enable');

  console.log('Navigating to https://style-pilot-ai.vercel.app/login ...');
  loadFired = false;
  await send('Page.navigate', { url: 'https://style-pilot-ai.vercel.app/login' });
  for (let i = 0; i < 50 && !loadFired; i++) await wait(100);
  await wait(1500);

  // Evaluate Navigation and Paint metrics
  const evalMetrics = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paints = performance.getEntriesByType('paint');
        const resources = performance.getEntriesByType('resource');
        
        let fp = null, fcp = null;
        for (const p of paints) {
          if (p.name === 'first-paint') fp = p.startTime;
          if (p.name === 'first-contentful-paint') fcp = p.startTime;
        }

        const totalResourceBytes = resources.reduce((acc, r) => acc + (r.transferSize || 0), 0);

        return {
          url: window.location.href,
          dns: nav ? Math.round(nav.domainLookupEnd - nav.domainLookupStart) : null,
          tcp: nav ? Math.round(nav.connectEnd - nav.connectStart) : null,
          ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
          download: nav ? Math.round(nav.responseEnd - nav.responseStart) : null,
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          loadComplete: nav ? Math.round(nav.loadEventEnd) : null,
          firstPaint: fp ? Math.round(fp) : null,
          firstContentfulPaint: fcp ? Math.round(fcp) : null,
          domNodes: document.querySelectorAll('*').length,
          resourceCount: resources.length,
          totalTransferKb: Math.round(totalResourceBytes / 1024)
        };
      })()
    `,
    returnByValue: true
  });

  console.log('\n=== REAL BROWSER CLIENT-SIDE PERFORMANCE (LOGIN SCREEN) ===');
  console.log(JSON.stringify(evalMetrics?.result?.value, null, 2));

  const cdpMetrics = await send('Performance.getMetrics');
  console.log('\n=== CDP ENGINE METRICS (LOGIN) ===');
  const metricMap = Object.fromEntries((cdpMetrics?.metrics || []).map(m => [m.name, m.value]));
  console.log('JS Heap Used Size:', ((metricMap.JSHeapUsedSize || 0) / 1024 / 1024).toFixed(2), 'MB');
  console.log('JS Heap Total Size:', ((metricMap.JSHeapTotalSize || 0) / 1024 / 1024).toFixed(2), 'MB');
  console.log('DOM Nodes:', metricMap.Nodes || 0);
  console.log('Layout Count:', metricMap.LayoutCount || 0);
  console.log('Recalc Style Count:', metricMap.RecalcStyleCount || 0);

  // STEP 2: Authenticated Dashboard Navigation
  console.log('\nNavigating to Authenticated Command Centre Dashboard (https://style-pilot-ai.vercel.app/) ...');
  
  // Load credentials from .env.local and generate session
  const fs = await import('fs');
  const { createClient } = await import('@supabase/supabase-js');
  const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8')
      .split('\n')
      .filter(l => l.includes('='))
      .map(l => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'emp-spd-0001@styleverse.ai'
  });
  const { data: authData } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink'
  });

  const { createServerClient } = await import('@supabase/ssr');
  const cookiesObj = {};
  const ssr = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Object.entries(cookiesObj).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) cookiesObj[c.name] = c.value;
      }
    }
  });

  await ssr.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token
  });

  for (const [cookieName, cookieVal] of Object.entries(cookiesObj)) {
    await send('Network.setCookie', {
      name: cookieName,
      value: cookieVal,
      domain: 'style-pilot-ai.vercel.app',
      path: '/',
      secure: true,
      httpOnly: false
    });
  }

  loadFired = false;
  await send('Page.navigate', { url: 'https://style-pilot-ai.vercel.app/' });
  for (let i = 0; i < 60 && !loadFired; i++) await wait(100);
  await wait(2500);

  const dashEval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paints = performance.getEntriesByType('paint');
        const resources = performance.getEntriesByType('resource');
        
        let fp = null, fcp = null;
        for (const p of paints) {
          if (p.name === 'first-paint') fp = p.startTime;
          if (p.name === 'first-contentful-paint') fcp = p.startTime;
        }

        const totalResourceBytes = resources.reduce((acc, r) => acc + (r.transferSize || 0), 0);

        return {
          url: window.location.href,
          title: document.title,
          ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
          domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          loadComplete: nav ? Math.round(nav.loadEventEnd) : null,
          firstPaint: fp ? Math.round(fp) : null,
          firstContentfulPaint: fcp ? Math.round(fcp) : null,
          domNodes: document.querySelectorAll('*').length,
          resourceCount: resources.length,
          totalTransferKb: Math.round(totalResourceBytes / 1024)
        };
      })()
    `,
    returnByValue: true
  });

  console.log('\n=== REAL BROWSER CLIENT-SIDE PERFORMANCE (AUTHENTICATED DASHBOARD) ===');
  console.log(JSON.stringify(dashEval?.result?.value, null, 2));

  const dashCdp = await send('Performance.getMetrics');
  console.log('\n=== CDP ENGINE METRICS (AUTHENTICATED DASHBOARD) ===');
  const dashMetricMap = Object.fromEntries((dashCdp?.metrics || []).map(m => [m.name, m.value]));
  console.log('JS Heap Used Size:', ((dashMetricMap.JSHeapUsedSize || 0) / 1024 / 1024).toFixed(2), 'MB');
  console.log('DOM Nodes:', dashMetricMap.Nodes || 0);
  console.log('Layout Count:', dashMetricMap.LayoutCount || 0);


  ws.close();
  edge.kill();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
