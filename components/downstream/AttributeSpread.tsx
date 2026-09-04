import { Card, CardBody, CardHeader, DataTable, Pill } from "@/components";
import type { Column } from "@/components";

import type { AttributeSpread, DimensionPair, SpreadRange } from "./data";
import { ARROW, humaniseKey, pct, plural, ratio } from "./format";

/**
 * WHAT THE ATTRIBUTE ROWS ACTUALLY SAY.
 *
 * This is the panel the rest of the screen exists to protect. Design's
 * handoff is the one a reader most wants to turn into a rule -- "brief linen,
 * drop navy" -- and the measurement underneath it will not carry a rule.
 *
 * THE MEASUREMENT
 * ---------------
 * Each row ranks the attribute levels of one dimension by sell-through over a
 * closed 26-week window and reports the ratio of the top to the bottom. Those
 * ratios sit close to each other and close to 1: the range is drawn below and
 * it is narrow. A narrow range is still a real difference and it is worth a
 * designer's attention. It is not a lever.
 *
 * THREE REASONS IT IS NOT A LEVER, ALL VISIBLE IN THE ROWS
 * -------------------------------------------------------
 *   1. Nothing was held still. Fabric, silhouette and colour are chosen
 *      together, bought together, placed together and discounted together.
 *      A ranking over the whole assortment cannot separate one of them from
 *      the rest, so "linen sold through best" and "the linen styles were the
 *      ones the buy went long on" are the same observation.
 *   2. The discount is in the number. Sell-through counts units moved at any
 *      price. The table under the chart puts the two rankings side by side,
 *      and where the top attribute by sell-through is also the attribute that
 *      was marked down hardest, the sell-through ranking is partly a record
 *      of the markdown calendar.
 *   3. The window has closed. These are the last 26 weeks. Nothing here
 *      forecasts the next 26, and the model that does forecast has its own
 *      accuracy, its own benchmark and its own interval, none of which
 *      transfer to an attribute ranking.
 *
 * So every sentence on this panel is observational. Attributes "rank",
 * "over-index", "appear more often". Nothing drives, causes or will lift, and
 * that is a constraint on the writing, not a hedge about the data: the data
 * is fine, it simply answers a different question from the one a range brief
 * asks.
 *
 * WHY ONLY SELL-THROUGH IS CHARTED
 * --------------------------------
 * The markdown-share rows carry ratios several times larger, and drawing them
 * on the same axis would invite exactly the comparison that does not hold: a
 * share can sit near zero, so its top-to-bottom ratio is governed by the
 * smallest denominator rather than by any spread worth acting on. They are in
 * the cards, marked, and deliberately not on this chart.
 */

const W = 700;
const PAD = { l: 136, r: 66, t: 36, b: 14 } as const;
const LANE = 50;
const BRAND_HEAD = 26;

const PLOT_W = W - PAD.l - PAD.r;

const INK = "#231F1C";
const ORANGE = "#D04A02";
const RULE = "#F0EBE5";
const RULE2 = "#E5DED7";
const MUTE = "#8D857D";

const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

type Lane =
  | { kind: "brand"; label: string; y: number }
  | { kind: "spread"; spread: AttributeSpread; y: number };

/** Lay the lanes out top to bottom, inserting a brand rule when it changes. */
function layout(
  spreads: readonly AttributeSpread[],
  brandLabel: (brandId: string | null) => string,
  showBrands: boolean,
): { lanes: Lane[]; height: number } {
  const lanes: Lane[] = [];
  let y = PAD.t;
  let current: string | null | undefined;

  for (const spread of spreads) {
    if (showBrands && spread.brandId !== current) {
      current = spread.brandId;
      lanes.push({ kind: "brand", label: brandLabel(spread.brandId), y });
      y += BRAND_HEAD;
    }
    lanes.push({ kind: "spread", spread, y });
    y += LANE;
  }
  return { lanes, height: y + PAD.b };
}

const px = (value: number) => PAD.l + Math.max(0, Math.min(1, value)) * PLOT_W;

function RangeChart({
  spreads,
  brandLabel,
  showBrands,
}: {
  spreads: readonly AttributeSpread[];
  brandLabel: (brandId: string | null) => string;
  showBrands: boolean;
}) {
  const { lanes, height } = layout(spreads, brandLabel, showBrands);
  const gridBottom = height - PAD.b + 4;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      role="img"
      aria-labelledby="attr-spread-title attr-spread-desc"
      className="block"
    >
      <title id="attr-spread-title">
        Measured sell-through range by attribute dimension
      </title>
      <desc id="attr-spread-desc">
        {spreads
          .map(
            (spread) =>
              `${brandLabel(spread.brandId)} ${humaniseKey(spread.dim)}: ` +
              `${spread.bottomLabel} ${pct(spread.bottomValue)} to ` +
              `${spread.topLabel} ${pct(spread.topValue)}, a ${ratio(spread.spread)} range.`,
          )
          .join(" ")}
      </desc>

      {/* Axis. The full 0-100% scale is drawn on purpose: a chart zoomed to
          the data would make a 1.6x range look like a chasm. */}
      {TICKS.map((tick) => (
        <g key={tick}>
          <line
            x1={px(tick)}
            x2={px(tick)}
            y1={PAD.t - 10}
            y2={gridBottom}
            stroke={tick === 0 ? RULE2 : RULE}
            strokeWidth="1"
          />
          <text
            x={px(tick)}
            y={PAD.t - 18}
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="700"
            fill={MUTE}
          >
            {`${tick * 100}%`}
          </text>
        </g>
      ))}

      {lanes.map((lane) => {
        if (lane.kind === "brand") {
          return (
            <text
              key={`brand-${lane.label}-${lane.y}`}
              x={12}
              y={lane.y + 14}
              fontSize="10.5"
              fontWeight="800"
              fill={INK}
            >
              {lane.label}
            </text>
          );
        }

        const { spread } = lane;
        const left = px(Math.min(spread.bottomValue, spread.topValue));
        const right = px(Math.max(spread.bottomValue, spread.topValue));

        return (
          <g key={`spread-${spread.rowId}`}>
            <text
              x={PAD.l - 12}
              y={lane.y + 13}
              textAnchor="end"
              fontSize="11"
              fontWeight="800"
              fill={INK}
            >
              {humaniseKey(spread.dim)}
            </text>

            <rect
              x={PAD.l}
              y={lane.y + 4}
              width={PLOT_W}
              height="9"
              rx="4.5"
              fill={RULE}
            />
            <rect
              x={left}
              y={lane.y + 4}
              width={Math.max(2, right - left)}
              height="9"
              rx="4.5"
              fill={ORANGE}
            />
            {/* End caps: the two attribute levels the range is measured
                between, so the eye lands on the endpoints and not the middle,
                which is not a value anything was measured at. */}
            <circle cx={left} cy={lane.y + 8.5} r="3.5" fill={ORANGE} />
            <circle cx={right} cy={lane.y + 8.5} r="3.5" fill={ORANGE} />

            <text
              x={W - PAD.r + 10}
              y={lane.y + 13}
              fontSize="11"
              fontWeight="800"
              fill={INK}
            >
              {ratio(spread.spread)}
            </text>

            <text
              x={PAD.l}
              y={lane.y + 31}
              fontSize="9.5"
              fontWeight="600"
              fill={MUTE}
            >
              {`${spread.bottomLabel} ${pct(spread.bottomValue)}  ${ARROW}  ${spread.topLabel} ${pct(spread.topValue)}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The coincidence check, in words, one row per brand and dimension. */
function CoincidenceTable({
  pairs,
  brandLabel,
}: {
  pairs: readonly DimensionPair[];
  brandLabel: (brandId: string | null) => string;
}) {
  const columns: Column<DimensionPair>[] = [
    {
      key: "dim",
      header: "Dimension",
      cell: (pair) => (
        <div>
          <div className="font-bold text-ink">{humaniseKey(pair.dim)}</div>
          <div className="text-[10.5px] font-semibold text-mute">
            {brandLabel(pair.brandId)}
          </div>
        </div>
      ),
    },
    {
      key: "sell",
      header: "Top by sell-through",
      cell: (pair) =>
        pair.sell ? (
          <>
            {pair.sell.topLabel}{" "}
            <span className="tabular-nums text-mute">
              {pct(pair.sell.topValue)}
            </span>
          </>
        ) : (
          <span className="text-mute">no sell-through row</span>
        ),
    },
    {
      key: "markdown",
      header: "Top by markdown share",
      cell: (pair) =>
        pair.markdown ? (
          <>
            {pair.markdown.topLabel}{" "}
            <span className="tabular-nums text-mute">
              {pct(pair.markdown.topValue)}
            </span>
          </>
        ) : (
          <span className="text-mute">no markdown row</span>
        ),
    },
    {
      key: "verdict",
      header: "Reading",
      cell: (pair) =>
        pair.sell === null || pair.markdown === null ? (
          <span className="text-mute">Not comparable</span>
        ) : pair.coincides ? (
          <Pill variant="amber">Same attribute tops both</Pill>
        ) : (
          <Pill variant="grey">Different attribute</Pill>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={pairs}
      rowKey={(pair) => `${pair.brandId ?? "-"}|${pair.dim}`}
      caption="Top attribute by sell-through against top attribute by markdown share, per brand and dimension"
      empty="No DESIGN rows are in scope, so there is nothing to cross-check."
    />
  );
}

export type AttributeSpreadPanelProps = {
  spreads: readonly AttributeSpread[];
  pairs: readonly DimensionPair[];
  range: SpreadRange | null;
  sample: { styles: number | null; weeks: number | null; levels: number | null };
  brandLabel: (brandId: string | null) => string;
  brandCount: number;
};

export function AttributeSpreadPanel({
  spreads,
  pairs,
  range,
  sample,
  brandLabel,
  brandCount,
}: AttributeSpreadPanelProps) {
  const sell = spreads.filter((spread) => spread.kind === "sell_through");

  if (sell.length === 0) {
    return (
      <Card className="mb-[16px]">
        <CardHeader
          title="Attribute observations"
          subtitle="What the Design handoff measured, and what it will not carry"
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No attribute rows are readable in your scope this week. What would
            appear here is one range per brand per dimension, over the three
          dimensions the handoff carries -- fabric, silhouette and
            colour family -- drawn from the top and bottom sell-through level
            over the pipeline&apos;s 26-week window, together with the check
            below it that asks whether the attribute at the top of sell-through
            is also the one that was marked down hardest.
          </p>
        </CardBody>
      </Card>
    );
  }

  const coinciding = pairs.filter((pair) => pair.coincides);
  const comparable = pairs.filter(
    (pair) => pair.sell !== null && pair.markdown !== null,
  );

  return (
    <Card className="mb-[16px]">
      <CardHeader
        title="Attribute observations, not predictions"
        subtitle={
          range
            ? `Measured sell-through range ${ratio(range.min)} to ${ratio(range.max)} across ${plural(range.count, "brand-dimension row", "brand-dimension rows")}`
            : "Measured sell-through range across the brand-dimension rows in scope"
        }
        actions={<Pill variant="violet">Observational</Pill>}
      />

      <CardBody>
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          Each bar spans the bottom and the top attribute level of one
          dimension, on the full nought-to-hundred scale rather than zoomed to
          the data, because a range this narrow drawn on its own axis would
          look like a chasm.{" "}
          {range ? (
            <>
              The widest dimension on screen separates its best and worst
              levels by {ratio(range.max)} and the tightest by{" "}
              {ratio(range.min)}.
            </>
          ) : null}{" "}
          That is a real difference and a modest one. It is enough for an
          attribute to over-index on sell-through and to appear more often
          among the strongest sellers; it is not enough to say the attribute
          produced the outcome, because nothing in the window was held still
          while it was measured
          {sample.styles !== null && sample.weeks !== null ? (
            <>
              {" "}
              -- these are {sample.styles} styles ranked over {sample.weeks}{" "}
              weeks of ordinary trading, not an experiment
            </>
          ) : null}
          .
        </p>

        <div className="mt-[16px] overflow-x-auto">
          <RangeChart
            spreads={sell}
            brandLabel={brandLabel}
            showBrands={brandCount > 1}
          />
        </div>
      </CardBody>

      <CardHeader
        title="Does the discount explain the ranking?"
        subtitle="Top level by sell-through against top level by markdown share"
      />
      <CoincidenceTable pairs={pairs} brandLabel={brandLabel} />

      <CardBody className="border-t border-rule">
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          Sell-through counts units that moved, at any price. So the question
          worth asking of a sell-through ranking is whether the attribute at
          the top is also the one that was discounted hardest -- and in{" "}
          {comparable.length === 0
            ? "none of the rows on screen, because none carries both rankings"
            : `${coinciding.length} of the ${comparable.length} ${
                comparable.length === 1
                  ? "brand-dimension row"
                  : "brand-dimension rows"
              } on screen`}
          {coinciding.length > 0 ? (
            <>
              {" "}
              it is:{" "}
              {coinciding
                .map(
                  (pair) =>
                    `${pair.sell?.topLabel ?? ""} leads both on ${brandLabel(pair.brandId)} ${humaniseKey(pair.dim).toLowerCase()}`,
                )
                .join(", ")}
              . For those, the ranking is at least partly a record of the
              markdown calendar rather than of what customers reached for, and
              a brief written from it would be briefing last season&apos;s
              discount decisions back into the range.
            </>
          ) : (
            <> it is not, which is the weaker of the two confounds to carry.</>
          )}{" "}
          Neither reading is available from these rows alone. Separating an
          attribute from the price it was sold at needs the price and promotion
          history at style level, which the handoff does not carry and this
          screen therefore does not claim.
        </p>
      </CardBody>
    </Card>
  );
}

export default AttributeSpreadPanel;
