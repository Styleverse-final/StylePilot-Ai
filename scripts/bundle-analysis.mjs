import fs from 'fs';
import path from 'path';

function getDirStats(dir) {
  let totalBytes = 0;
  let fileCount = 0;
  const files = [];

  function walk(current) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) walk(full);
      else {
        const sz = fs.statSync(full).size;
        totalBytes += sz;
        fileCount++;
        files.push({ name: full.replace(/\\/g, '/'), size: sz });
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  return { totalBytes, fileCount, files };
}

const staticStats = getDirStats('.next/static');
console.log('Total .next/static size:', (staticStats.totalBytes / 1024 / 1024).toFixed(2), 'MB across', staticStats.fileCount, 'files');

// Break down by chunk types:
let jsBytes = 0, cssBytes = 0, mediaBytes = 0;
for (const f of staticStats.files) {
  if (f.name.endsWith('.js')) jsBytes += f.size;
  else if (f.name.endsWith('.css')) cssBytes += f.size;
  else if (f.name.endsWith('.woff2') || f.name.endsWith('.woff') || f.name.endsWith('.svg')) mediaBytes += f.size;
}

console.log('  JavaScript chunks :', (jsBytes / 1024 / 1024).toFixed(2), 'MB');
console.log('  CSS stylesheets   :', (cssBytes / 1024).toFixed(1), 'KB');
console.log('  Fonts & media     :', (mediaBytes / 1024).toFixed(1), 'KB');

// Sort by largest files
staticStats.files.sort((a, b) => b.size - a.size);
console.log('\nTop 15 Largest Client Assets:');
for (const f of staticStats.files.slice(0, 15)) {
  const rel = f.name.replace(/^.*\.next\/static\//, '');
  console.log(`  ${(f.size / 1024).toFixed(1).padStart(7)} KB  ${rel}`);
}

// Let's check app-build-manifest.json
if (fs.existsSync('.next/app-build-manifest.json')) {
  const manifest = JSON.parse(fs.readFileSync('.next/app-build-manifest.json', 'utf8'));
  console.log('\n--- Route Chunk Allocations (app-build-manifest) ---');
  for (const [route, chunks] of Object.entries(manifest.pages)) {
    let routeJsSize = 0;
    for (const chunk of chunks) {
      const chunkPath = path.join('.next', chunk);
      if (fs.existsSync(chunkPath)) {
        routeJsSize += fs.statSync(chunkPath).size;
      }
    }
    console.log(`  ${route.padEnd(25)} : ${chunks.length} chunks, ${(routeJsSize / 1024).toFixed(1)} KB uncompressed`);
  }
}
