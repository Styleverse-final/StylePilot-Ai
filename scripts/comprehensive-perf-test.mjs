import fs from 'fs';
import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// Load .env.local
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

// Helper to obtain SSR cookies for an employee
async function getAuthCookieHeader(employeeId = 'EMP-SPD-0001') {
  const email = `${employeeId.toLowerCase()}@styleverse.ai`;
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email
  });
  if (linkErr) throw linkErr;

  const { data: authData, error: authErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink'
  });
  if (authErr) throw authErr;

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

  return Object.entries(cookiesObj).map(([k, v]) => `${k}=${v}`).join('; ');
}

// HTTP request timing helper
function measureRequest(urlStr, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const start = performance.now();
    let ttfb = null;
    let firstByteReceived = false;

    const req = client.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'StyleVerse-PerfTest/1.0',
        ...headers
      }
    }, (res) => {
      let bodySize = 0;
      res.on('data', (chunk) => {
        if (!firstByteReceived) {
          firstByteReceived = true;
          ttfb = performance.now() - start;
        }
        bodySize += chunk.length;
      });

      res.on('end', () => {
        const total = performance.now() - start;
        if (!firstByteReceived) ttfb = total;
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          ttfb: Math.round(ttfb * 10) / 10,
          totalTime: Math.round(total * 10) / 10,
          bodySize,
          location: res.headers.location || null
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: null,
        error: err.message,
        ttfb: null,
        totalTime: performance.now() - start,
        bodySize: 0
      });
    });

    req.end();
  });
}

const ALL_ROUTES = [
  { path: '/login', protected: false },
  { path: '/icon.svg', protected: false },
  { path: '/api/cron/agents', protected: false },
  { path: '/', protected: true, name: 'Command Centre (Dashboard)' },
  { path: '/portfolio', protected: true, name: 'Portfolio' },
  { path: '/workbench', protected: true, name: 'Workbench' },
  { path: '/signals', protected: true, name: 'Signals' },
  { path: '/buy', protected: true, name: 'Buy Approvals' },
  { path: '/allocation', protected: true, name: 'Allocation' },
  { path: '/markdown', protected: true, name: 'Markdown' },
  { path: '/exceptions', protected: true, name: 'Exceptions' },
  { path: '/scenarios', protected: true, name: 'Scenarios' },
  { path: '/learning', protected: true, name: 'Learning' },
  { path: '/adoption', protected: true, name: 'Adoption' },
  { path: '/governance', protected: true, name: 'Governance' },
  { path: '/downstream', protected: true, name: 'Downstream' },
  { path: '/model-ops', protected: true, name: 'Model Ops' },
];

async function run() {
  console.log('=== STYLEVERSE PERFORMANCE BENCHMARK SUITE ===\n');

  console.log('Step 1: Authenticating test accounts via Supabase SSR...');
  let plannerCookie = '';
  let cmpoCookie = '';
  try {
    plannerCookie = await getAuthCookieHeader('EMP-SPD-0001');
    console.log('  ✓ Authenticated EMP-SPD-0001 (Planner)');
    cmpoCookie = await getAuthCookieHeader('EMP-SPD-0067');
    console.log('  ✓ Authenticated EMP-SPD-0067 (CMPO)');
  } catch (err) {
    console.error('  ✗ Auth setup failed:', err);
  }

  const targets = [
    { name: 'Localhost (Port 3000)', base: 'http://localhost:3000' },
    { name: 'Live Production (Vercel Mumbai)', base: 'https://style-pilot-ai.vercel.app' }
  ];

  const results = {};

  for (const target of targets) {
    console.log(`\n======================================================`);
    console.log(`Testing Target: ${target.name} [${target.base}]`);
    console.log(`======================================================`);
    results[target.name] = [];

    // Test each route
    for (const r of ALL_ROUTES) {
      const url = `${target.base}${r.path}`;
      const headers = {};
      if (r.protected && plannerCookie) {
        headers['Cookie'] = plannerCookie;
      }

      // Warm up request (1st run)
      const warm1 = await measureRequest(url, headers);
      // Measured run 1
      const m1 = await measureRequest(url, headers);
      // Measured run 2
      const m2 = await measureRequest(url, headers);
      // Measured run 3
      const m3 = await measureRequest(url, headers);

      const validRuns = [m1, m2, m3].filter(x => x.statusCode !== null);
      const avgTtfb = validRuns.length ? Math.round(validRuns.reduce((a, b) => a + b.ttfb, 0) / validRuns.length) : 0;
      const avgTotal = validRuns.length ? Math.round(validRuns.reduce((a, b) => a + b.totalTime, 0) / validRuns.length) : 0;
      const minTotal = validRuns.length ? Math.min(...validRuns.map(x => x.totalTime)) : 0;
      const maxTotal = validRuns.length ? Math.max(...validRuns.map(x => x.totalTime)) : 0;

      const record = {
        path: r.path,
        name: r.name || r.path,
        status: m1.statusCode,
        location: m1.location,
        sizeKb: Math.round((m1.bodySize / 1024) * 10) / 10,
        coldTotal: warm1.totalTime,
        avgTtfb,
        avgTotal,
        minTotal,
        maxTotal,
        cacheControl: m1.headers ? m1.headers['cache-control'] : null,
        vercelId: m1.headers ? m1.headers['x-vercel-id'] : null
      };

      results[target.name].push(record);

      const statusTag = record.status === 200 ? '200 OK' : `${record.status} ${record.location || ''}`;
      console.log(`  ${r.path.padEnd(20)} | ${statusTag.padEnd(22)} | Size: ${(record.sizeKb + ' KB').padStart(8)} | TTFB: ${(record.avgTtfb + 'ms').padStart(7)} | Avg: ${(record.avgTotal + 'ms').padStart(7)} (min: ${record.minTotal}ms, max: ${record.maxTotal}ms)`);
    }
  }

  // Step 3: Concurrency / Throughput Test on Key Routes
  console.log(`\n======================================================`);
  console.log(`Step 3: Concurrency & Stress Benchmarks (Live Production)`);
  console.log(`======================================================`);
  
  const testEndpoints = [
    { label: '/login (Public SSR)', path: '/login', headers: {} },
    { label: '/ (Protected Dashboard)', path: '/', headers: { Cookie: plannerCookie } },
    { label: '/signals (Data-heavy Screen)', path: '/signals', headers: { Cookie: plannerCookie } },
  ];

  const concurrencyResults = [];

  for (const ep of testEndpoints) {
    const concurrency = 10;
    const totalRequests = 30;
    const url = `https://style-pilot-ai.vercel.app${ep.path}`;

    console.log(`\nRunning benchmark: ${ep.label} with ${concurrency} concurrent connections, ${totalRequests} total requests...`);

    const startBench = performance.now();
    let completed = 0;
    const times = [];
    const statusCounts = {};

    const queue = Array.from({ length: totalRequests }, (_, i) => i);
    async function worker() {
      while (queue.length > 0) {
        queue.shift();
        const res = await measureRequest(url, ep.headers);
        times.push(res.totalTime);
        statusCounts[res.statusCode] = (statusCounts[res.statusCode] || 0) + 1;
        completed++;
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const durationSec = (performance.now() - startBench) / 1000;
    times.sort((a, b) => a - b);

    const rps = Math.round((totalRequests / durationSec) * 10) / 10;
    const p50 = times[Math.floor(times.length * 0.5)];
    const p90 = times[Math.floor(times.length * 0.9)];
    const p99 = times[times.length - 1];

    console.log(`  Requests: ${totalRequests}, Duration: ${durationSec.toFixed(2)}s`);
    console.log(`  Throughput: ${rps} req/sec`);
    console.log(`  Latencies: p50=${p50}ms | p90=${p90}ms | p99=${p99}ms | min=${times[0]}ms | max=${times[times.length - 1]}ms`);
    console.log(`  Status codes:`, statusCounts);

    concurrencyResults.push({
      endpoint: ep.label,
      rps,
      p50,
      p90,
      p99,
      statusCounts
    });
  }

  // Write JSON report
  fs.writeFileSync('perf-benchmark-results.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    concurrencyResults
  }, null, 2));

  console.log('\n✓ Benchmark completed successfully. Saved to perf-benchmark-results.json');
}

run().catch(console.error);
