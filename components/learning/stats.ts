// Statistics for the learning module. Pure arithmetic, no I/O.
//
// WHY THE P-VALUE IS COMPUTED HERE RATHER THAN QUOTED
// ---------------------------------------------------
// The learning screen makes one claim that is easy to fake and expensive to
// get wrong: that planners further through their capability path override
// the model less often. The correlation behind that claim is small, the
// sample is eleven people, and neither coefficient survives a significance
// test. If the significance test were a sentence typed into JSX, the number
// would stop tracking the data the moment anyone commits another decision.
// So the whole chain -- Pearson r, the t statistic, the two-tailed p from
// the regularised incomplete beta, and the sample size that WOULD be needed
// -- is derived from the rows on screen, every request.
//
// Nothing in this file filters, winsorises, jitters or drops an outlier.
// An honest weak correlation is a finding; an engineered strong one falls
// apart the first time someone re-runs it.

// ------------------------------------------------------------- descriptive

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** Sample standard deviation (n - 1). Null below two observations. */
export function stdev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  let sum = 0;
  for (const value of values) sum += (value - m) * (value - m);
  return Math.sqrt(sum / (values.length - 1));
}

/** The median, by the usual midpoint convention. Null on an empty list. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** How many distinct values a series actually takes. Variation, counted. */
export function distinctCount(values: readonly number[]): number {
  return new Set(values.map((v) => Math.round(v * 1e9) / 1e9)).size;
}

// --------------------------------------------- log gamma and incomplete beta
//
// Lanczos approximation and the Lentz continued fraction for the regularised
// incomplete beta, in the standard formulation. These exist so the p-value
// below is a real p-value rather than a lookup table with three entries.

const LANCZOS: readonly number[] = [
  76.18009172947146, -86.50532032941677, 24.01409824083091,
  -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
];

function lnGamma(value: number): number {
  let y = value;
  let tmp = value + 5.5;
  tmp -= (value + 0.5) * Math.log(tmp);
  let series = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) {
    y += 1;
    series += LANCZOS[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * series) / value);
}

const MAX_ITERATIONS = 300;
const EPSILON = 3e-16;
const TINY = 1e-300;

/** Continued fraction for the incomplete beta, evaluated by Lentz's method. */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITERATIONS; m += 1) {
    const m2 = 2 * m;

    let numerator = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;

    numerator = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;

    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) break;
  }

  return h;
}

/** Regularised incomplete beta I_x(a, b). */
function incompleteBeta(a: number, b: number, x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    lnGamma(a + b) -
      lnGamma(a) -
      lnGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-tailed p for Student's t on `df` degrees of freedom. */
export function studentTwoTailedP(t: number, df: number): number | null {
  if (!Number.isFinite(t) || df <= 0) return null;
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

// -------------------------------------------------------------- correlation

export type Correlation = {
  /** Pairs behind the coefficient. */
  n: number;
  /** Pearson product-moment correlation. */
  r: number;
  /** r * sqrt(n - 2) / sqrt(1 - r^2). */
  t: number;
  /** n - 2. */
  df: number;
  /** Two-tailed p. Null only if the t statistic is undefined. */
  p: number | null;
};

/**
 * Pearson r over paired series, with the significance test attached.
 *
 * Returns null rather than a coefficient when either series is constant --
 * a correlation with a zero-variance input is undefined, and printing 0.00
 * there would be a claim the data does not make.
 */
export function pearson(
  xs: readonly number[],
  ys: readonly number[],
): Correlation | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;

  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  if (mx === null || my === null) return null;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return null;

  const r = sxy / Math.sqrt(sxx * syy);
  const df = n - 2;
  const denominator = Math.sqrt(Math.max(1 - r * r, Number.MIN_VALUE));
  const t = (r * Math.sqrt(df)) / denominator;

  return { n, r, t, df, p: studentTwoTailedP(t, df) };
}

export type LinearFit = { slope: number; intercept: number };

/** Ordinary least squares. Null when x has no variance to regress on. */
export function leastSquares(
  xs: readonly number[],
  ys: readonly number[],
): LinearFit | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  if (mx === null || my === null) return null;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  if (sxx <= 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

const SEARCH_CEILING = 200000;

/**
 * The smallest sample that would make a correlation of this size significant.
 *
 * Answers the question the screen has to answer honestly: "what would it
 * take to actually test this?" Found by search rather than by a closed form,
 * because the critical t moves with the degrees of freedom as n grows and
 * the two have to be solved together. Null if no sample up to the ceiling
 * would do it, which is the correct answer for r at or near zero.
 */
export function sampleSizeForSignificance(
  r: number,
  alpha = 0.05,
): number | null {
  const magnitude = Math.abs(r);
  if (!Number.isFinite(magnitude) || magnitude <= 0 || magnitude >= 1) {
    return null;
  }
  const scale = magnitude / Math.sqrt(1 - magnitude * magnitude);

  // Geometric bracket, then bisection: the p-value falls monotonically in n
  // for a fixed r, so a bracket is enough to pin the crossing exactly.
  let high = 4;
  while (high < SEARCH_CEILING) {
    const p = studentTwoTailedP(scale * Math.sqrt(high - 2), high - 2);
    if (p !== null && p < alpha) break;
    high *= 2;
  }
  if (high >= SEARCH_CEILING) return null;

  let low = Math.max(3, Math.floor(high / 2));
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    const p = studentTwoTailedP(scale * Math.sqrt(mid - 2), mid - 2);
    if (p !== null && p < alpha) high = mid;
    else low = mid;
  }
  return high;
}

/** "0.53" / "<0.001", so a p-value never renders as "0". */
export function formatP(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "--";
  if (p < 0.001) return "<0.001";
  return p.toFixed(p < 0.01 ? 3 : 2);
}

/** "-0.210", always signed, so the direction of a coefficient is unmissable. */
export function formatR(r: number): string {
  const rounded = Math.round(r * 1000) / 1000;
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}${Math.abs(rounded).toFixed(3)}`;
}
