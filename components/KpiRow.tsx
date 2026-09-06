import Link from "next/link";
import { Children, Fragment, type ReactNode } from "react";

/**
 * KpiRow / Kpi
 *
 * Ports `.kpirow` and `.kpi` from the production design system: a wrapping
 * row of label-over-value pairs, the value at 19px/800 with an optional
 * trailing pill. Numeric values carry tabular figures so columns of KPIs do
 * not shimmer between renders.
 *
 * THREE THINGS THE PORTED MARKUP DID NOT HAVE, AND WHY THEY ARE HERE NOW.
 *
 *   SEPARATORS. Four numbers on one line with nothing between them read as
 *   one run-on figure -- "46 of 99 in scope" sat hard against "Awaiting your
 *   decision" and the eye had to parse the words to find the boundary. A
 *   hairline between items does that work instead. It is drawn by this row
 *   rather than by each item, so a Kpi rendered on its own carries no stray
 *   edge.
 *
 *   A BASIS LINE. `hint` is the third line under a value -- the 11.5px muted
 *   line the accuracy KPI always had. When only one item in a row has it the
 *   row's bottom edge is ragged; more importantly, a number in a header is a
 *   claim, and the line under it says what the claim rests on.
 *
 *   A DESTINATION. `href` makes the whole item a link to wherever the number
 *   is explained -- normally "#panel-id", the block on the same screen that
 *   decomposes it. A header KPI is a summary of something; being unable to
 *   reach that something from the summary is the gap this closes. The link is
 *   an overlay rather than a wrapper so the label/value markup is untouched,
 *   and it carries its own accessible name because an overlay has no text.
 */

/** Marks an item that leads somewhere further down the same screen. */
const DOWN_ARROW = String.fromCharCode(0x2193);

export type KpiRowProps = {
  children?: ReactNode;
  className?: string;
};

export function KpiRow({ children, className }: KpiRowProps) {
  // A header's KPIs are a fixed list authored in the page, so position is a
  // stable identity here; nothing reorders or is inserted between renders.
  const items = Children.toArray(children);

  return (
    <div
      className={`flex flex-wrap items-stretch gap-x-[12px] gap-y-[10px]${
        className ? ` ${className}` : ""
      }`}
    >
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <div aria-hidden="true" className="my-[6px] w-px shrink-0 bg-rule2" />
          ) : null}
          {item}
        </Fragment>
      ))}
    </div>
  );
}

export type KpiProps = {
  label: ReactNode;
  value: ReactNode;
  /** Trailing badge, normally a <Pill>. */
  pill?: ReactNode;
  /**
   * The 11.5px muted line under the value: what the number is measured over,
   * or where it came from. Not a caption -- a basis.
   */
  hint?: ReactNode;
  /**
   * Where this number is explained. A "#id" is an anchor to a panel on the
   * same screen and stays a plain <a>; anything else routes through <Link>.
   */
  href?: string;
  /**
   * Accessible name for that link. Defaults to the label when the label is a
   * string; pass it explicitly when the label is a node.
   */
  linkLabel?: string;
  /** Tabular figures on the value. On by default. */
  tabular?: boolean;
  className?: string;
};

/**
 * Padding is unconditional, not only on linked items: a row that mixes the
 * two would otherwise sit its values on two different baselines. The row's
 * gap is reduced to match, so the spacing between values is unchanged from
 * the ported design.
 */
const ITEM = "relative rounded-inner px-[10px] py-[7px]";
const ITEM_LINKED =
  " transition-colors duration-[120ms] hover:bg-hover has-[a:focus-visible]:bg-hover";
const OVERLAY = "absolute inset-0 rounded-inner";

export function Kpi({
  label,
  value,
  pill,
  hint,
  href,
  linkLabel,
  tabular = true,
  className,
}: KpiProps) {
  const name =
    linkLabel ?? (typeof label === "string" ? label : undefined);
  const isAnchor = href !== undefined && href.startsWith("#");

  return (
    <div
      className={`${ITEM}${href ? ITEM_LINKED : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      {href === undefined ? null : isAnchor ? (
        <a href={href} aria-label={name} className={OVERLAY} />
      ) : (
        <Link href={href} aria-label={name} className={OVERLAY} />
      )}

      <div className="flex items-center gap-[5px] text-label font-bold text-mute">
        {label}
        {href === undefined ? null : (
          <span aria-hidden="true" className="text-[9px] leading-none text-mute/55">
            {DOWN_ARROW}
          </span>
        )}
      </div>

      <div className="mt-[3px] flex items-center gap-[7px]">
        <b
          className={`text-kpi font-extrabold text-ink${tabular ? " tabular-nums" : ""}`}
        >
          {value}
        </b>
        {pill}
      </div>

      {hint === undefined ? null : (
        <div className="mt-[3px] text-small font-semibold text-mute">{hint}</div>
      )}
    </div>
  );
}
