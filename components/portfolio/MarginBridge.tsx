import { Card, CardBody, CardHeader, Pill } from "@/components";

import { Finding, Provenance } from "./Layout";
import {
  DASH,
  formatCrore,
  formatShare,
  plural,
} from "./format";
import type { ValueRow, ValueView } from "./types";

/**
 * THE MARGIN BRIDGE -- current plan to protected plan.
 *
 * WHY THE TWO LEVERS ARE NEVER ADDED INTO ONE BAR
 * -----------------------------------------------
 * markdown_avoided_margin_inr and lost_sales_recovered_margin_inr are both
 * margin, so summing them is arithmetically legitimate -- value_summary
 * itself does it, and total_margin_inr is that sum. But they came from two
 * different mechanisms and they are bought with different things. Markdown
 * avoided is margin the business keeps by not discounting stock it would
 * otherwise have had to clear. Lost sales recovered is revenue the business
 * captures by having stock where a customer wanted it, converted to margin
 * at that brand's own gross margin before it was combined. One is a cost
 * that did not happen; the other is a sale that did.
 *
 * Collapsed into a single "value delivered" bar, a CMPO cannot tell which
 * lever moved -- and on this data the answer differs sharply by brand, which
 * is precisely the kind of thing a portfolio view exists to expose. So the
 * bridge has two steps and the split is stated as a share underneath.
 *
 * WHAT THE BRIDGE STARTS FROM
 * ---------------------------
 * value_summary records the CHANGE, not the level. No table in this schema
 * holds the absolute margin of the manual plan, so the bridge opens at the
 * plan as it stands rather than at a rupee figure, and says so. Inventing a
 * base to make the waterfall look like a P&L would have been the easy move
 * and a fabricated one.
 *
 * The holding cost that pays for part of this is NOT in the bridge. It is
 * not margin, it is not netted out of the total by value_summary, and it has
 * its own block below -- where the two brands turn out to move in opposite
 * directions.
 */

type Step = {
  label: string;
  delta: number;
  tone: "markdown" | "lost" | "total";
  note?: string;
};

const FILL: Record<Step["tone"], string> = {
  markdown: "#5B4B8A", // violet -- a cost that did not happen
  lost: "#D04A02", // orange -- a sale that did
  total: "#231F1C", // ink -- the arrival, not a third lever
};

const RULE = "#F0EBE5";
const RULE2 = "#E5DED7";
const MUTE = "#8D857D";
const INK = "#231F1C";

type Geometry = {
  width: number;
  height: number;
  pad: { l: number; r: number; t: number; b: number };
  valueSize: number;
  labelSize: number;
};

const FULL: Geometry = {
  width: 680,
  height: 268,
  pad: { l: 18, r: 18, t: 34, b: 52 },
  valueSize: 13,
  labelSize: 11,
};

const COMPACT: Geometry = {
  width: 340,
  height: 208,
  pad: { l: 12, r: 12, t: 28, b: 44 },
  valueSize: 11.5,
  labelSize: 10,
};

function steps(row: ValueRow): Step[] {
  const markdown = row.markdownAvoidedInr ?? 0;
  const lost = row.lostSalesRecoveredInr ?? 0;
  const total = row.totalMarginInr ?? markdown + lost;
  return [
    { label: "Markdown avoided", delta: markdown, tone: "markdown" },
    { label: "Lost sales recovered", delta: lost, tone: "lost" },
    { label: "Margin protected", delta: total, tone: "total" },
  ];
}

/**
 * The waterfall itself. Two floating steps and an arrival column on one
 * scale, so the height of a bar is comparable to the height of the total
 * beside it rather than to its own axis.
 */
function Waterfall({
  row,
  geometry,
  caption,
}: {
  row: ValueRow;
  geometry: Geometry;
  caption: string;
}) {
  const bars = steps(row);
  const { width, height, pad } = geometry;
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const total = bars[bars.length - 1].delta;
  const ceiling = total > 0 ? total * 1.06 : 1;
  const y = (value: number) => pad.t + plotH * (1 - value / ceiling);

  const slot = plotW / bars.length;
  const barW = Math.min(slot * 0.56, 108);

  // Each floating step starts where the steps before it finished; the
  // arrival column starts at zero because it is the whole height, not a
  // third increment. The running total is derived per step rather than
  // carried in a mutable accumulator -- three bars make the cost nil and it
  // keeps the render a pure function of `bars`.
  const drawn = bars.map((bar, index) => {
    const priorSum = bars
      .slice(0, index)
      .reduce(
        (sum, earlier) =>
          earlier.tone === "total" ? sum : sum + earlier.delta,
        0,
      );
    const from = bar.tone === "total" ? 0 : priorSum;
    const to = bar.tone === "total" ? bar.delta : priorSum + bar.delta;
    const x = pad.l + slot * index + (slot - barW) / 2;
    const top = y(Math.max(from, to));
    const bottom = y(Math.min(from, to));
    return { bar, x, top, height: Math.max(2, bottom - top), from, to };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-auto w-full"
      role="img"
      aria-label={caption}
    >
      <title>{caption}</title>

      {/* The zero line is the manual plan as it stands, not a rupee value. */}
      <line
        x1={pad.l}
        x2={width - pad.r}
        y1={y(0)}
        y2={y(0)}
        stroke={RULE2}
        strokeWidth={1}
      />

      {drawn.map((item, index) => {
        const next = drawn[index + 1];
        return (
          <g key={item.bar.label}>
            {next && item.bar.tone !== "total" ? (
              <line
                x1={item.x + barW}
                x2={next.x}
                y1={y(item.to)}
                y2={y(item.to)}
                stroke={RULE}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : null}

            <rect
              x={item.x}
              y={item.top}
              width={barW}
              height={item.height}
              rx={5}
              fill={FILL[item.bar.tone]}
              opacity={item.bar.tone === "total" ? 0.92 : 1}
            />

            <text
              x={item.x + barW / 2}
              y={item.top - 9}
              textAnchor="middle"
              fontSize={geometry.valueSize}
              fontWeight={800}
              fill={INK}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatCrore(item.bar.delta)}
            </text>

            <text
              x={item.x + barW / 2}
              y={height - pad.b + 18}
              textAnchor="middle"
              fontSize={geometry.labelSize}
              fontWeight={700}
              fill={item.bar.tone === "total" ? INK : MUTE}
            >
              {item.bar.label}
            </text>
          </g>
        );
      })}

      <text
        x={pad.l}
        y={y(0) + 15}
        fontSize={geometry.labelSize}
        fontWeight={700}
        fill={MUTE}
      >
        The manual plan as it stands
      </text>
    </svg>
  );
}

function splitLine(row: ValueRow): string {
  const markdown = row.markdownAvoidedInr;
  const lost = row.lostSalesRecoveredInr;
  const total = row.totalMarginInr;
  if (markdown === null || lost === null || total === null) return "";
  return `${formatShare(markdown, total)} markdown avoided, ${formatShare(lost, total)} lost sales recovered`;
}

/** Which lever carries this row, named from the row rather than assumed. */
function dominantLever(row: ValueRow): "markdown" | "lost" | null {
  const markdown = row.markdownAvoidedInr;
  const lost = row.lostSalesRecoveredInr;
  if (markdown === null || lost === null) return null;
  return markdown >= lost ? "markdown" : "lost";
}

const LEVER_WORDS: Record<"markdown" | "lost", string> = {
  markdown: "markdown it did not have to take",
  lost: "sales it would otherwise have missed",
};

export type MarginBridgeProps = {
  value: ValueView;
  /** True when one brand is selected, so the brand strip is redundant. */
  singleBrand: boolean;
};

export function MarginBridge({ value, singleBrand }: MarginBridgeProps) {
  const headline = value.headline;

  if (!headline) {
    return (
      <Card>
        <CardHeader
          title="Margin bridge"
          subtitle="value_summary, read with your own session"
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No value_summary row came back for your scope. What would appear
            here is the bridge from the manual plan to the protected plan:
            markdown avoided as one step, lost sales recovered as a second,
            and the two arriving at the total margin the pilot is projected to
            protect over the forward horizon. Nothing is estimated in the
            meantime and no placeholder total is shown, because a bridge
            assembled without its rows would be a drawing rather than a
            figure.
          </p>
        </CardBody>
      </Card>
    );
  }

  const lever = dominantLever(headline);
  const brands = value.brands;
  const showBrandStrip = !singleBrand && brands.length > 1;

  // The two brands are protected by different mechanisms on this data. That
  // is read off the rows rather than written down, so it stops being said the
  // moment it stops being true.
  const levers = brands
    .map((row) => ({ row, lever: dominantLever(row) }))
    .filter((entry): entry is { row: ValueRow; lever: "markdown" | "lost" } =>
      entry.lever !== null,
    );
  const leversDiffer =
    levers.length > 1 && new Set(levers.map((entry) => entry.lever)).size > 1;

  return (
    <Card>
      <CardHeader
        title={`Margin bridge ${DASH} ${headline.label}`}
        subtitle="From the manual plan as it stands to the plan the model protects"
        actions={
          <Pill variant="up">{formatCrore(headline.totalMarginInr)} protected</Pill>
        }
      />
      <CardBody>
        <Waterfall
          row={headline}
          geometry={FULL}
          caption={`Margin bridge for ${headline.label}: markdown avoided ${formatCrore(
            headline.markdownAvoidedInr,
          )}, lost sales recovered ${formatCrore(
            headline.lostSalesRecoveredInr,
          )}, total margin protected ${formatCrore(headline.totalMarginInr)}.`}
        />

        <div className="mt-[10px] text-small font-semibold text-mute">
          {splitLine(headline)}
        </div>

        <Finding>
          The bridge opens at the manual plan rather than at a rupee figure,
          because value_summary records the change and no table in this schema
          holds the absolute margin of the plan it changes. The two steps are
          both margin and they are still kept apart: markdown avoided is a
          cost that did not happen, already expressed as margin; lost sales
          recovered is revenue that was captured and converted at the brand&apos;s
          own gross margin before it was combined. Adding the raw revenue to
          the margin instead would have inflated this total by a large
          multiple and produced a number no P&amp;L would recognise; the
          conversion happens in the pipeline, and the rate it used is in the
          derivation quoted below rather than restated here.
          {lever
            ? ` On these rows ${headline.label} is carried mostly by ${LEVER_WORDS[lever]}.`
            : ""}
        </Finding>

        {showBrandStrip ? (
          <>
            <div className="mt-[22px] border-t border-rule pt-[18px]">
              <div className="text-micro font-extrabold tracking-[0.06em] text-mute">
                THE SAME BRIDGE, PER BRAND
              </div>
              <div className="mt-[12px] grid grid-cols-2 gap-[18px] max-[1140px]:grid-cols-1">
                {brands.map((row) => (
                  <div key={row.brandId ?? row.label}>
                    <div className="mb-[4px] flex items-baseline justify-between gap-[10px]">
                      <span className="text-copy font-extrabold text-ink">
                        {row.label}
                      </span>
                      <span className="text-small font-extrabold tabular text-ink">
                        {formatCrore(row.totalMarginInr)}
                      </span>
                    </div>
                    <Waterfall
                      row={row}
                      geometry={COMPACT}
                      caption={`Margin bridge for ${row.label}: markdown avoided ${formatCrore(
                        row.markdownAvoidedInr,
                      )}, lost sales recovered ${formatCrore(
                        row.lostSalesRecoveredInr,
                      )}, total ${formatCrore(row.totalMarginInr)}.`}
                    />
                    <div className="mt-[6px] text-small font-semibold text-mute">
                      {splitLine(row)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {leversDiffer ? (
              <Finding label="Why the split matters">
                The {plural(levers.length, "brand", "brands")} are not
                protected by the same mechanism.{" "}
                {levers
                  .map(
                    (entry) =>
                      `${entry.row.label} is mostly ${LEVER_WORDS[entry.lever]} (${splitLine(entry.row)})`,
                  )
                  .join("; ")}
                . A single portfolio bar would have averaged those into one
                number that describes neither brand, and the operational
                consequence differs: one is a buying and allocation story, the
                other is a clearance-timing story, and they are worked by
                different people.
              </Finding>
            ) : null}
          </>
        ) : null}

        {!value.portfolioCoversScope && value.portfolio ? (
          <Finding label="On the group row you can also read">
            value_summary carries a portfolio row that sums every pilot brand,
            and its read policy lets any signed-in user see it {DASH} which is
            why its presence proves nothing about scope and the arithmetic is
            checked instead. Its total does not equal the sum of the brand rows
            on this screen, so it is not headlined:{" "}
            {singleBrand
              ? "you have narrowed to one brand, and the group figure covers more than what is shown here."
              : "it covers a brand your session cannot read, and showing it as yours would be a scope error dressed up as a bigger number."}
          </Finding>
        ) : null}

        <Provenance summary="The derivation stored beside these figures, verbatim">
          {value.portfolio && value.portfolioCoversScope ? (
            <p className="mb-[8px]">{value.portfolio.basis}</p>
          ) : null}
          {brands.map((row) => (
            <p key={row.brandId ?? row.label} className="mb-[8px] last:mb-0">
              {row.basis}
            </p>
          ))}
          {brands.length === 0 && value.portfolio ? (
            <p>{value.portfolio.basis}</p>
          ) : null}
        </Provenance>
      </CardBody>
    </Card>
  );
}

export default MarginBridge;
