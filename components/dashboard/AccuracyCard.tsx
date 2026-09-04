import { AccuracyStatement, Card, CardBody, CardHeader } from "@/components";
import type { AccuracyHeadline } from "@/lib/accuracy";
import type { Json } from "@/lib/database.types";
import type { ModelMetrics } from "@/lib/queries";

/**
 * AccuracyCard -- block 5, and the Part H surface of this screen.
 *
 * The headline accuracy is never rendered on its own here. <AccuracyStatement
 * variant="bars"/> puts the model, seasonal naive and the manual baseline on
 * three bars in that order, and states in words that the small margin over
 * seasonal naive is the one that proves the model works while the large
 * margin over the authored manual baseline proves less than its size.
 *
 * Under the bars, the same three benchmarks fold by fold. The design
 * reference draws this as inline SVG with a viewBox and no charting library,
 * and so does this -- except that the reference hardcodes its four folds and
 * this reads them from model_registry.metrics.by_fold. The y domain is
 * derived from the values present; there is no fixed axis and no fixed
 * target line, because both would be constants pretending to be data.
 */

const BAR_MODEL = "#D04A02";
const BAR_SNAIVE = "#B4A99F";
const BAR_MANUAL = "#D8CCC2";
const RULE = "#F0EBE5";
const MUTE = "#8D857D";

type Fold = {
  fold: number;
  label: string;
  modelPct: number;
  seasonalNaivePct: number;
  manualPct: number;
};

function isJsonObject(value: Json | undefined): value is { [k: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pct(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 1000) / 10
    : null;
}

/** "2025-W40..2025-W51" -> "W40-51". Anything else falls back to the index. */
function foldLabel(weeks: Json | undefined, fold: number): string {
  if (typeof weeks === "string") {
    const match = weeks.match(/W(\d+).*?W(\d+)/);
    if (match) return `W${match[1]}-${match[2]}`;
  }
  return `Fold ${fold}`;
}

/**
 * Narrow metrics.by_fold. A fold missing any of the three accuracies is
 * dropped rather than defaulted -- a bar drawn from a zero would read as a
 * measurement.
 */
export function parseFolds(metrics: ModelMetrics | null | undefined): Fold[] {
  const raw = metrics?.by_fold;
  if (!Array.isArray(raw)) return [];

  const out: Fold[] = [];
  for (const entry of raw) {
    if (!isJsonObject(entry)) continue;
    const modelPct = pct(entry.ai_accuracy_vs_demand);
    const seasonalNaivePct = pct(entry.seasonal_naive_accuracy);
    const manualPct = pct(entry.manual_accuracy_vs_demand);
    if (modelPct === null || seasonalNaivePct === null || manualPct === null) {
      continue;
    }
    const fold =
      typeof entry.fold === "number" && Number.isFinite(entry.fold)
        ? entry.fold
        : out.length + 1;
    out.push({
      fold,
      label: foldLabel(entry.weeks, fold),
      modelPct,
      seasonalNaivePct,
      manualPct,
    });
  }
  return out.sort((a, b) => a.fold - b.fold);
}

function FoldChart({
  folds,
  meanPct,
}: {
  folds: readonly Fold[];
  meanPct: number;
}) {
  const width = 300;
  const height = 170;
  const pad = { l: 6, r: 6, t: 14, b: 22 };
  const bandWidth = (width - pad.l - pad.r) / folds.length;

  const values = folds.flatMap((f) => [
    f.modelPct,
    f.seasonalNaivePct,
    f.manualPct,
  ]);
  const rawLow = Math.min(...values, meanPct);
  const rawHigh = Math.max(...values, meanPct);
  const spread = Math.max(rawHigh - rawLow, 1);
  const low = Math.max(0, rawLow - spread * 0.35);
  const high = Math.min(100, rawHigh + spread * 0.2);

  const y = (value: number) =>
    pad.t + (height - pad.t - pad.b) * (1 - (value - low) / (high - low));
  const base = y(low);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Model, seasonal naive and the manual baseline by fold, across ${folds.length} rolling-origin folds`}
    >
      <line
        x1={pad.l}
        x2={width - pad.r}
        y1={y(meanPct)}
        y2={y(meanPct)}
        stroke={BAR_MODEL}
        strokeWidth={1.2}
        strokeDasharray="3 3"
      />
      <text
        x={width - pad.r}
        y={y(meanPct) - 5}
        fontSize={8.5}
        fill={BAR_MODEL}
        textAnchor="end"
        fontWeight={800}
      >
        {`model mean ${meanPct.toFixed(1)}%`}
      </text>
      <line
        x1={pad.l}
        x2={width - pad.r}
        y1={base}
        y2={base}
        stroke={RULE}
        strokeWidth={1}
      />
      {folds.map((fold, index) => {
        const x = pad.l + index * bandWidth;
        const w = bandWidth * 0.2;
        return (
          <g key={fold.fold}>
            <rect
              x={x + bandWidth * 0.12}
              y={y(fold.manualPct)}
              width={w}
              height={Math.max(0, base - y(fold.manualPct))}
              fill={BAR_MANUAL}
              rx={2}
            />
            <rect
              x={x + bandWidth * 0.38}
              y={y(fold.seasonalNaivePct)}
              width={w}
              height={Math.max(0, base - y(fold.seasonalNaivePct))}
              fill={BAR_SNAIVE}
              rx={2}
            />
            <rect
              x={x + bandWidth * 0.64}
              y={y(fold.modelPct)}
              width={w}
              height={Math.max(0, base - y(fold.modelPct))}
              fill={BAR_MODEL}
              rx={2}
            />
            <text
              x={x + bandWidth / 2}
              y={height - 7}
              fontSize={8.5}
              fill={MUTE}
              textAnchor="middle"
              fontWeight={700}
            >
              {fold.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-[5px]">
      <i
        aria-hidden="true"
        className="inline-block h-[9px] w-[9px] rounded-[2px]"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export type AccuracyCardProps = {
  accuracy: AccuracyHeadline | null;
  /** metrics for the SAME registry row the headline came from. */
  metrics: ModelMetrics | null;
};

export function AccuracyCard({ accuracy, metrics }: AccuracyCardProps) {
  const folds = parseFolds(metrics);

  return (
    <Card>
      <CardHeader
        title="Accuracy against benchmarks"
        subtitle={
          accuracy && accuracy.foldCount !== null
            ? `${accuracy.foldCount} folds, rolling origin`
            : "Rolling origin backtest"
        }
      />
      <CardBody>
        {accuracy === null ? (
          <p className="text-[12.5px] leading-[1.6] text-body">
            No planning-grain model is visible in your scope, so there is no
            backtest to show. Accuracy is never estimated on this screen; if
            the registry row is not readable, the card says so.
          </p>
        ) : (
          <>
            <AccuracyStatement accuracy={accuracy} variant="bars" />

            {folds.length === 0 ? null : (
              <div className="mt-[16px] border-t border-rule pt-[14px]">
                <div className="mb-[6px] text-[11px] font-bold text-mute">
                  Fold by fold, same row mask
                </div>
                <FoldChart folds={folds} meanPct={accuracy.headlinePct} />
                <div className="mt-[8px] flex flex-wrap gap-[12px] text-[11px] font-semibold text-body">
                  <LegendSwatch color={BAR_MODEL} label="Model" />
                  <LegendSwatch color={BAR_SNAIVE} label="Seasonal naive" />
                  <LegendSwatch color={BAR_MANUAL} label="Manual baseline" />
                </div>
                <p className="mt-[10px] text-[11.5px] font-semibold leading-[1.6] text-mute">
                  The headline is the mean of these folds, not a selected best
                  one. Every fold is scored on the same rows, so the three
                  bars in a group are directly comparable.
                </p>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export default AccuracyCard;
