/**
 * What the downstream language check actually flags, across all 43 rows.
 *
 * Run:  node components/downstream/review.test.mjs
 *
 * This exists because the previous version of the check reported a clean scan
 * on a corpus it could not read: zero of the shipped patterns matched any of
 * the 43 stored insights, including six that instruct the receiving function
 * outright. A language check that never fires is indistinguishable from clean
 * source text, and the only way to tell them apart is to run it and say the
 * number out loud.
 *
 * The fixture is the real table, exported verbatim.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const out = mkdtempSync(join(tmpdir(), "sv-review-"));

// review.ts imports a type through the "@/" alias, so the compile needs the
// project's path mapping. A throwaway tsconfig is simpler than unpicking the
// import, and it compiles the file exactly as the app does.
const tsconfig = join(out, "tsconfig.json");
writeFileSync(
  tsconfig,
  JSON.stringify({
    compilerOptions: {
      outDir: out,
      module: "esnext",
      target: "es2022",
      moduleResolution: "bundler",
      skipLibCheck: true,
      jsx: "react-jsx",
      baseUrl: resolve("."),
      paths: { "@/*": ["./*"] },
    },
    files: [resolve("components/downstream/review.ts")],
  }),
);
execFileSync("npx", ["tsc", "-p", tsconfig], { stdio: "inherit", shell: true });

// With baseUrl set, tsc mirrors the source tree under outDir, so the emitted
// file is not at the root. Find it rather than guessing.
function findEmitted(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findEmitted(full);
      if (found) return found;
    } else if (entry.name === "review.js") {
      return full;
    }
  }
  return null;
}
const emitted = findEmitted(out);
if (!emitted) throw new Error("review.js was not emitted under " + out);

// review.ts pulls formatUnitsAbs from a component module for its DETAIL
// strings. That is irrelevant to pattern matching and dragging a React module
// into this harness would prove nothing, so the import is redirected to a
// local stub. The patterns under test are untouched.
const stubPath = join(out, "stub.js");
writeFileSync(stubPath, "export const formatUnitsAbs = (n) => String(n);\n");
const stubHref = pathToFileURL(stubPath).href;
const emittedSource = readFileSync(emitted, "utf8").replace(
  /from\s+["']@\/components\/DriverBars["']/g,
  `from ${JSON.stringify(stubHref)}`,
);
writeFileSync(emitted, emittedSource);

const review = await import(pathToFileURL(emitted).href);
const { reviewInsight, LEXICON_TERMS } = review;

const rows = JSON.parse(
  readFileSync("components/downstream/handoffs.fixture.json", "utf8"),
);

console.log(`\nPublished lexicon (derived from the running patterns), ${LEXICON_TERMS.length} terms:`);
console.log("  " + LEXICON_TERMS.join(", "));

let flagged = 0;
const byFunction = {};
const hits = [];

for (const row of rows) {
  const result = reviewInsight({ insight: row.insight, metric: {} });
  const marks = (result.marks ?? result ?? []).filter(
    (m) => m && (m.kind === "flag" || m.severity === "flag" || m.label),
  );
  const lexical = marks.filter((m) =>
    ["Causal verb", "Prediction", "Overstated", "Prescriptive"].includes(m.label),
  );
  if (lexical.length > 0) {
    flagged += 1;
    byFunction[row.function] = (byFunction[row.function] ?? 0) + 1;
    hits.push({ id: row.id, fn: row.function, brand: row.brand_id,
                labels: lexical.map((m) => m.label).join("+"),
                quote: lexical.map((m) => m.quote).filter(Boolean).join(", "),
                insight: row.insight });
  }
}

console.log(`\nFLAGGED: ${flagged} of ${rows.length} stored insights`);
for (const [fn, n] of Object.entries(byFunction).sort()) {
  console.log(`   ${fn}: ${n}`);
}
console.log("\nRows flagged:");
for (const h of hits) {
  console.log(`  #${h.id} ${h.fn}/${h.brand}  [${h.labels}] ${h.quote ? `"${h.quote}"` : ""}`);
  console.log(`      ${h.insight.slice(0, 150)}`);
}
if (flagged === 0) {
  console.log("\n  Zero flagged. With a list this size that is a finding about");
  console.log("  the source text, not evidence the check works.");
}

rmSync(out, { recursive: true, force: true });
