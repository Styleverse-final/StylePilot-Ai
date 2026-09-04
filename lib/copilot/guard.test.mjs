/**
 * Proof that an ungrounded number is rejected IN CODE.
 *
 * Run:  node lib/copilot/guard.test.mjs
 *
 * This compiles and exercises the shipped guard rather than describing it. The
 * point of the exercise is the negative case: a number that appears nowhere in
 * the retrieved context must be refused no matter how plausible it looks, and
 * no prompt instruction is involved in that refusal.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = mkdtempSync(join(tmpdir(), "sv-guard-"));
execFileSync(
  "npx",
  ["tsc", "lib/copilot/guard.ts", "--outDir", out, "--module", "esnext",
   "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
  // shell: true because on Windows npx is a .cmd, which spawnSync cannot
  // execute directly (EINVAL).
  { stdio: "inherit", shell: true },
);

const guard = await import(pathToFileURL(join(out, "guard.js")).href);
const { groundedNumbers, checkGrounding, extractRoute, sentences } = guard;

// The context a planner's session actually retrieved.
const CONTEXT = {
  model_registry: [
    {
      model_id: "SPD_planning_grain",
      metrics: {
        ai_accuracy_vs_demand: 0.825641835665342,
        benchmark_comparison: { seasonal_naive: 0.777398761321388, mase_model: 0.8802744255234545 },
      },
    },
  ],
  value_summary: [{ total_margin_inr: 448950000, unit_change_pct: 5.4706 }],
};

const allowed = groundedNumbers(CONTEXT);
let failures = 0;

const check = (label, text, expectGrounded) => {
  const verdict = checkGrounding(text, allowed);
  const ok = verdict.grounded === expectGrounded;
  if (!ok) failures += 1;
  const detail = verdict.grounded ? "" : `  offending=${verdict.offending.join(",")}`;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}\n        "${text}"${detail}`);
};

console.log("\nGROUNDED -- these quote the context at various precisions:");
check("percentage, 1dp", "Accuracy is 82.6% at the planning grain.", true);
check("fraction, 4dp", "The blend scored 0.8256 against demand.", true);
check("fraction, 2dp", "MASE is 0.88, below the naive benchmark.", true);
check("seasonal naive", "Seasonal naive reaches 77.7%.", true);
check("crore scaling", "Margin protected is 44.9 crore.", true);
check("small integer", "All 6 categories are covered.", true);
check("calendar year", "The backtest ends in 2026.", true);

console.log("\nUNGROUNDED -- these must be refused:");
check("invented percentage", "Accuracy is 91.4% at the planning grain.", false);
check("invented rupees", "We protected 512.3 crore of margin.", false);
check("plausible but absent", "MASE is 0.71, comfortably below 1.", false);
check("fabricated unit change", "Units rose 7.9% across the portfolio.", false);
check("precise invention", "Coverage measured 0.9134 against nominal.", false);

console.log("\nSENTENCE SPLITTING -- a decimal is not a full stop:");
const parts = sentences("SPD scored 0.8256 on demand. Naive got 0.7774. Done.");
const decimalIntact = parts.length === 3 && parts[0].includes("0.8256");
console.log(`  ${decimalIntact ? "PASS" : "FAIL"}  split into ${parts.length}: ${JSON.stringify(parts)}`);
if (!decimalIntact) failures += 1;

console.log("\nROUTE VALIDATION:");
const good = extractRoute("Look at the buy plan. NAVIGATE:/buy");
const bad = extractRoute("Try this. NAVIGATE:/admin/secrets");
console.log(`  ${good.route === "/buy" ? "PASS" : "FAIL"}  whitelisted route kept: ${good.route}`);
console.log(`  ${bad.route === null ? "PASS" : "FAIL"}  invalid route dropped: ${bad.route}`);
console.log(`  ${!good.text.includes("NAVIGATE") && !bad.text.includes("NAVIGATE") ? "PASS" : "FAIL"}  directive stripped from both`);
if (good.route !== "/buy") failures += 1;
if (bad.route !== null) failures += 1;
if (good.text.includes("NAVIGATE") || bad.text.includes("NAVIGATE")) failures += 1;

rmSync(out, { recursive: true, force: true });
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
