import { Card, CardBody, CardHeader, Pill } from "@/components";

import { Finding } from "./Layout";
import {
  DASH,
  formatCrore,
  formatMultiple,
  formatSignedCrore,
  formatSignedPct,
  joinWords,
  plural,
} from "./format";
import type { ValueRow, ValueView } from "./types";

/**
 * UNITS AND HOLDING COST -- the price of the margin above.
 *
 * The case constrains holding cost. A screen that showed protected margin
 * and left the inventory consequence to a footnote would be selling, not
 * reporting, so the cost gets a block of its own directly under the bridge
 * and at the same size.
 *
 * THE RATIO IS STATED AND IS NOT ALLOWED TO DO THE ARGUING
 * --------------------------------------------------------
 * Protected margin over the holding-cost change is a large multiple, and a
 * large multiple is exactly the kind of figure that ends an argument early.
 * Two things stop it doing that here.
 *
 * First, the portfolio multiple is bigger than either brand's, because one
 * brand's holding cost FALLS and nets against the other's rise. The multiple
 * is therefore a property of the netting, not of the model, and the brand
 * multiples are shown beside it so a reader can see that for themselves.
 *
 * Second, where a brand's holding cost falls, no multiple is shown at all.
 * Dividing protected margin by a negative cost yields a negative "ratio"
 * that is arithmetically real and commercially meaningless, and printing one
 * would be worse than printing nothing.
 *
 * THE BRANDS MOVE IN OPPOSITE DIRECTIONS
 * --------------------------------------
 * The portfolio unit change is a NET. One brand buys more, the other buys
 * less, and a single portfolio percentage hides that completely. The chart
 * is built around a zero axis for exactly this reason: bars on opposite
 * sides of a line cannot be mistaken for a trend in one direction.
 */

const ZERO_RULE = "#E5DED7";
const MUTE = "#8D857D";
const INK = "#231F1C";
const ORANGE = "#D04A02";
const STONE = "#B4A99F";
const AMBER = "#9A6B08";
const GREEN = "#2FA45B";

type Bar = {
  key: string;
  label: string;
  value: number | null;
  display: string;
  /** Rendered heavier, with a rule above it: the net of the rows before it. */
  isNet?: boolean;
};

type Palette = { positive: string; negative: string };

const W = 356;
const GUTTER = 104;
const PLOT_R = W - 10;
const ZERO_X = GUTTER + (PLOT_R - GUTTER) / 2;
const HALF = ZERO_X - GUTTER - 6;
const HEAD = 24;
const ROW_H = 46;
const FOOT = 14;

function DivergingBars({
  bars,
  palette,
  axisLabel,
  caption,
}: {
  bars: readonly Bar[];
  palette: Palette;
  axisLabel: string;
  caption: string;
}) {
  const height = HEAD + bars.length * ROW_H + FOOT;
  const max = bars.reduce(
    (widest, bar) => Math.max(widest, Math.abs(bar.value ?? 0)),
    0,
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="block h-auto w-full"
      role="img"
      aria-label={caption}
    >
      <title>{caption}</title>

      <text x={0} y={12} fontSize={10} fontWeight={800} fill={MUTE}>
        {axisLabel}
      </text>

      <line
        x1={ZERO_X}
        x2={ZERO_X}
        y1={HEAD - 4}
        y2={HEAD + bars.length * ROW_H}
        stroke={ZERO_RULE}
        strokeWidth={1}
      />

      {bars.map((bar, index) => {
        const top = HEAD + index * ROW_H;
        const mid = top + ROW_H / 2;
        const value = bar.value ?? 0;
        const width = max > 0 ? (Math.abs(value) / max) * HALF : 0;
        const positive = value >= 0;
        const x = positive ? ZERO_X : ZERO_X - width;
        const fill = positive ? palette.positive : palette.negative;
        const labelX = positive ? ZERO_X + width + 7 : ZERO_X - width - 7;

        return (
          <g key={bar.key}>
            {bar.isNet ? (
              <line
                x1={0}
                x2={PLOT_R}
                y1={top + 2}
                y2={top + 2}
                stroke={ZERO_RULE}
                strokeWidth={1}
              />
            ) : null}

            <text
              x={0}
              y={mid + 4}
              fontSize={11}
              fontWeight={bar.isNet ? 800 : 700}
              fill={bar.isNet ? INK : MUTE}
            >
              {bar.label}
            </text>

            {bar.value === null ? (
              <text
                x={ZERO_X + 8}
                y={mid + 4}
                fontSize={11}
                fontWeight={700}
                fill={MUTE}
              >
                not recorded
              </text>
            ) : (
              <>
                <rect
                  x={x}
                  y={mid - 9}
                  width={Math.max(1.5, width)}
                  height={18}
                  rx={4}
                  fill={fill}
                />
                <text
                  x={labelX}
                  y={mid + 4}
                  textAnchor={positive ? "start" : "end"}
                  fontSize={11.5}
                  fontWeight={800}
                  fill={INK}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {bar.display}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Protected margin against the holding cost that pays for it.
 *
 * Returns null where the cost fell rather than rose: a multiple over a
 * negative denominator is not a multiple, and this screen prints nothing
 * rather than a number a reader would have to know to discount.
 */
function multiple(row: ValueRow): string | null {
  const cost = row.holdingCostInr;
  const margin = row.totalMarginInr;
  if (typeof cost !== "number" || typeof margin !== "number") return null;
  if (cost <= 0) return null;
  return formatMultiple(margin, cost);
}

export type UnitsAndHoldingProps = {
  value: ValueView;
};

export function UnitsAndHolding({ value }: UnitsAndHoldingProps) {
  const brands = value.brands;
  const net = value.portfolioCoversScope ? value.portfolio : null;
  const rows: ValueRow[] = net ? [...brands, net] : brands;

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Units bought and the cost of holding them"
          subtitle="value_summary, read with your own session"
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No value_summary row came back for your scope, so there is nothing
            to weigh the protected margin against. What would appear here is
            the change in units the plan commits to and the holding cost that
            change carries, per brand and as a net, with the multiple between
            protected margin and that cost stated rather than implied.
          </p>
        </CardBody>
      </Card>
    );
  }

  const unitBars: Bar[] = rows.map((row) => ({
    key: `u-${row.brandId ?? row.label}`,
    label: row.label,
    value: row.unitChangePct,
    display: formatSignedPct(row.unitChangePct),
    isNet: row.scope === "PORTFOLIO",
  }));

  const costBars: Bar[] = rows.map((row) => ({
    key: `h-${row.brandId ?? row.label}`,
    label: row.label,
    value: row.holdingCostInr,
    display: formatSignedCrore(row.holdingCostInr),
    isNet: row.scope === "PORTFOLIO",
  }));

  // Which way each brand moves, read off the rows. If both brands ever moved
  // the same way, the sentence below stops claiming they diverge.
  const up = brands.filter((row) => (row.unitChangePct ?? 0) > 0);
  const down = brands.filter((row) => (row.unitChangePct ?? 0) < 0);
  const diverging = up.length > 0 && down.length > 0;

  const brandMultiples = brands
    .map((row) => ({ row, text: multiple(row) }))
    .filter((entry): entry is { row: ValueRow; text: string } => entry.text !== null);
  const releases = brands.filter(
    (row) => typeof row.holdingCostInr === "number" && row.holdingCostInr < 0,
  );
  const netMultiple = net ? multiple(net) : null;

  return (
    <Card>
      <CardHeader
        title="Units bought, and the cost of holding them"
        subtitle="The protected margin above is not free. This is what it costs to carry."
        actions={
          netMultiple ? (
            <Pill variant="amber">{netMultiple} margin to holding cost</Pill>
          ) : undefined
        }
      />
      <CardBody>
        <div className="grid grid-cols-2 gap-[26px] max-[1140px]:grid-cols-1">
          <DivergingBars
            bars={unitBars}
            palette={{ positive: ORANGE, negative: STONE }}
            axisLabel="UNITS AGAINST THE MANUAL PLAN"
            caption={`Change in units against the manual plan: ${rows
              .map((row) => `${row.label} ${formatSignedPct(row.unitChangePct)}`)
              .join(", ")}.`}
          />
          <DivergingBars
            bars={costBars}
            palette={{ positive: AMBER, negative: GREEN }}
            axisLabel="HOLDING COST OVER THE HORIZON"
            caption={`Change in holding cost: ${rows
              .map((row) => `${row.label} ${formatSignedCrore(row.holdingCostInr)}`)
              .join(", ")}.`}
          />
        </div>

        {diverging ? (
          <Finding label="Read the brands, not the net">
            {joinWords(up.map((row) => row.label))}{" "}
            {plural(up.length, "buys", "buy")} more{" "}
            {up
              .map((row) => `(${formatSignedPct(row.unitChangePct)})`)
              .join(", ")}
            , while {joinWords(down.map((row) => row.label))}{" "}
            {plural(down.length, "buys", "buy")} less{" "}
            {down
              .map((row) => `(${formatSignedPct(row.unitChangePct)})`)
              .join(", ")}
            .{" "}
            {net
              ? `The portfolio figure of ${formatSignedPct(
                  net.unitChangePct,
                )} is the net of those two, and on its own it describes neither brand. `
              : ""}
            The direction is a consequence of the forecast, not a policy: where
            the model reads demand above the manual plan it commits more units
            and accepts the carry; where it reads demand below, it releases
            stock and the holding cost falls with it.
          </Finding>
        ) : null}

        <Finding label="What the multiple does and does not prove">
          {netMultiple && net ? (
            <>
              Across the scope, {formatCrore(net.totalMarginInr)} of protected
              margin is carried on {formatSignedCrore(net.holdingCostInr)} of
              additional holding cost {DASH} a multiple of {netMultiple}.{" "}
            </>
          ) : (
            <>
              The multiple between protected margin and additional holding cost
              is shown per brand rather than as one portfolio figure.{" "}
            </>
          )}
          {brandMultiples.length > 0 ? (
            <>
              At brand level it is{" "}
              {joinWords(
                brandMultiples.map((entry) => `${entry.text} for ${entry.row.label}`),
              )}
              .{" "}
            </>
          ) : null}
          {releases.length > 0 ? (
            <>
              No multiple is shown for{" "}
              {joinWords(releases.map((row) => row.label))}, because{" "}
              {plural(releases.length, "its", "their")} holding cost{" "}
              {plural(releases.length, "falls", "fall")} rather than rises{" "}
              {DASH} that is a release of working capital, not a cost, and a
              ratio over a negative denominator would be arithmetic pretending
              to be a finding.{" "}
              {netMultiple
                ? `It is also why the portfolio multiple is the largest number in this paragraph: the release nets against the rise before the division happens. The brand figures are the ones to argue with.`
                : ""}
            </>
          ) : null}
        </Finding>

        <Finding label="Why the cost is beside the margin and not inside it">
          value_summary reports the holding-cost change alongside the protected
          margin rather than netting it out, and this screen keeps that
          separation. They are different kinds of claim: the margin is a
          projection over the forward horizon, while the carry is an
          arithmetic consequence of units multiplied by a per-unit-week rate.
          Netting them would produce one number that looks more decisive and
          hides which half a reader should challenge. The rate itself, and the
          absolute unit counts behind these percentages, are quoted verbatim
          in the derivation under the bridge above {DASH} they live in that
          stored sentence and in no column, so they are not re-typed into a
          figure here.
        </Finding>
      </CardBody>
    </Card>
  );
}

export default UnitsAndHolding;
