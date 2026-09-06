import type { ReactNode } from "react";

import type { AccuracyHeadline } from "@/lib/accuracy";

import { KpiCard, type KpiCardDensity } from "./KpiCard";
import { Kpi } from "./KpiRow";
import { Track } from "./Marks";
import { Pill } from "./Pill";
import { Why } from "./Why";

/**
 * AccuracyStatement -- Part H, made unavoidable.
 *
 * The headline accuracy is never rendered on its own anywhere in this app.
 * The manual baseline was authored and calibrated to a target, so a +24
 * point margin over it proves less than it looks; seasonal naive is a
 * benchmark nobody constructed and the margin over it is small. This
 * component always shows the two together, in that order of emphasis, so a
 * screen cannot accidentally quote the flattering number alone.
 *
 * `variant="inline"` is the KPI form for a page header; `variant="bars"` is
 * the accuracy card, with model, seasonal naive and manual on three bars;
 * `variant="compact"` is one line for a dense screen.
 *
 * THE COMPACT VARIANT STILL OBEYS PART H, and that is the whole reason it
 * exists in this file rather than being hand-rolled on the two dense screens.
 * It renders "82.6% . +4.8 vs seasonal naive" -- headline and margin, always
 * together, in the same breath. What moves behind the disclosure is the fold
 * count, MASE and the manual comparison, none of which is the thing Part H
 * protects. A screen that wanted the headline alone still cannot get it.
 */

export type AccuracyStatementProps = {
  accuracy: AccuracyHeadline;
  variant?: "inline" | "bars" | "compact" | "card";
  /**
   * bars only. Move the per-bar reasoning and the MASE line behind a single
   * <Why>, leaving the three percentages and their bars visible.
   *
   * OPT-IN, and deliberately so. variant="bars" also renders on /signals, the
   * dashboard accuracy card and the model-ops registry panel, where the notes
   * under each bar are the point of the panel. Only the Workbench right rail
   * asks for them collapsed, so only the Workbench passes this.
   *
   * Part H is unaffected either way: the headline percentage and the margin
   * over seasonal naive are on the BARS, which stay visible.
   */
  notesBehindWhy?: boolean;
  /**
   * inline only. Where the headline is decomposed -- normally "#id" for the
   * accuracy panel on the same screen. Part H is why this exists: the header
   * figure is the summary of an argument made in full further down, and a
   * reader who wants the argument should not have to go looking for it.
   */
  href?: string;
  /** card only. Link text for the panel the card opens onto. */
  hrefLabel?: string;
  /** card only. The 16px glyph for the card tile. */
  icon?: ReactNode;
  /**
   * card only. "stacked" is the command centre's tall card with the benchmark
   * rail drawn under the value; "inline" is the buy plan's short one, tile at
   * the left, which drops the rail so the accuracy card stands the same
   * height as the four measures beside it.
   *
   * Part H is untouched by the choice. Dropping the MARK is not dropping the
   * margin: the +x.x vs naive pill sits against the headline in both forms,
   * the three percentages stay in the basis line, and the full comparison is
   * still one press away in the card's own panel.
   */
  cardVariant?: "stacked" | "inline";
  /** card only. "plain" is the single white surface of the buy plan's strip. */
  cardSurface?: "tint" | "plain";
  /**
   * card only. "compact" is the workbench's: the same card with less chrome,
   * for a strip of five that has to hold one line in a narrower column.
   *
   * Part H is untouched. Nothing that shrinks carries an argument -- the
   * headline stays at 21px, the seasonal-naive pill beside it is unchanged,
   * and the basis line and the disclosure under them are the same words.
   */
  cardDensity?: KpiCardDensity;
  /**
   * card + cardVariant="inline" only. Draw the fold count, MASE and the
   * manual margin as the card's basis line instead of leaving them to the
   * disclosure.
   *
   * OPT-IN, because it costs a line of height every card in a strip then has
   * to match. The buy plan's five cards stand beside four measures that carry
   * no basis, so it does not ask for it; the allocation strip's do, and on
   * that screen the line is what stops "82.6%" being read as a single
   * measurement rather than the mean of several folds.
   *
   * Part H is unaffected in both directions: this only PROMOTES figures that
   * were already one press away, and the headline still cannot render without
   * the seasonal-naive margin beside it.
   */
  cardBasis?: boolean;
  className?: string;
};

function Bar({
  label,
  pct,
  tone,
  note,
}: {
  label: string;
  pct: number;
  tone: "model" | "bench" | "manual";
  note?: string;
}) {
  const fill =
    tone === "model"
      ? "bg-orange"
      : tone === "bench"
        ? "bg-violet"
        : "bg-[#D8CCC2]";
  return (
    <div className="py-[11px] border-b border-rule last:border-b-0">
      <div className="flex items-baseline justify-between gap-[10px] mb-[6px]">
        <span className="text-copy font-bold">{label}</span>
        <span className="text-copy font-extrabold tabular">
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-[8px] rounded-pill bg-cream overflow-hidden">
        <div
          className={`h-full rounded-pill ${fill}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      {note ? (
        <div className="mt-[5px] text-small font-semibold text-mute">{note}</div>
      ) : null}
    </div>
  );
}

export function AccuracyStatement({
  accuracy: a,
  variant = "inline",
  notesBehindWhy = false,
  href,
  hrefLabel,
  icon,
  cardVariant = "stacked",
  cardSurface = "tint",
  cardDensity = "default",
  cardBasis = false,
  className,
}: AccuracyStatementProps) {
  /**
   * The fold count, MASE and the manual margin, on one line.
   *
   * Composed once and used by both the flat header KPI and the inline card,
   * so the two forms of the same statement cannot drift apart -- and so the
   * fold count is omitted in both when the registry row carries no by_fold.
   * No fold count is better than an invented one.
   */
  const basisLine = (
    <>
      {a.foldCount === null ? null : <>mean of {a.foldCount} folds &middot; </>}
      MASE {a.mase.toFixed(2)} &middot; +{a.vsManualPoints.toFixed(1)} vs manual
    </>
  );

  if (variant === "compact") {
    return (
      <Why
        className={className}
        lead={
          <>
            <b className="text-copy font-extrabold text-ink tabular">
              {a.headlinePct.toFixed(1)}%
            </b>{" "}
            <span className="text-mute">&middot;</span>{" "}
            <b className="font-extrabold text-green">
              +{a.vsSeasonalNaivePoints.toFixed(1)}
            </b>{" "}
            vs seasonal naive
          </>
        }
        label="detail"
      >
        Mean of {a.foldCount === null ? "the registry's" : a.foldCount}{" "}
        rolling-origin {a.foldCount === null ? "folds" : "folds"}, MASE{" "}
        {a.mase.toFixed(2)} against seasonal naive at{" "}
        {a.maseSeasonalNaive.toFixed(2)}; below 1.00 beats the benchmark on its
        own scale. The authored manual baseline sits at {a.manualPct.toFixed(1)}
        %, so the margin over it is {a.vsManualPoints.toFixed(1)} points -- a
        bigger number that proves less, because that baseline was calibrated to
        a target by the dataset designer. Seasonal naive is the benchmark nobody
        constructed, which is why its margin is the one on the line above.
      </Why>
    );
  }

  if (variant === "card") {
    // The three figures the bars variant plots, on one rail. Padding the
    // domain keeps the outermost tick off the edge of the mark; it is
    // computed from the figures rather than fixed, because a brand whose
    // manual baseline is closer would otherwise draw three marks on top of
    // one another.
    const lo = Math.min(a.manualPct, a.seasonalNaivePct, a.headlinePct);
    const hi = Math.max(a.manualPct, a.seasonalNaivePct, a.headlinePct);
    const pad = Math.max(4, (hi - lo) * 0.25);

    return (
      <KpiCard
        className={className}
        tone="green"
        variant={cardVariant}
        surface={cardSurface}
        density={cardDensity}
        icon={icon}
        label="Forecast accuracy"
        value={`${a.headlinePct.toFixed(1)}%`}
        /* The margin that proves it, never separated from the headline. */
        pill={
          <Pill
            variant="up"
            tabular
            title="Percentage points above seasonal naive, scored on the same rows."
          >
            +{a.vsSeasonalNaivePoints.toFixed(1)} vs naive
          </Pill>
        }
        mark={
          cardVariant === "inline" ? undefined : (
            <Track
              label={`Model at ${a.headlinePct.toFixed(1)} percent, seasonal naive at ${a.seasonalNaivePct.toFixed(1)}, manual baseline at ${a.manualPct.toFixed(1)}`}
              domain={[Math.max(0, lo - pad), Math.min(100, hi + pad)]}
              ticks={[
                { at: a.manualPct },
                { at: a.seasonalNaivePct },
                { at: a.headlinePct, primary: true },
              ]}
            />
          )
        }
        /* The stacked card states the three figures under its mark. The
           inline card has no mark to caption and stands in a row of four
           other measures that carry none, so the rail moves into the panel
           below rather than being dropped: the numbers are the same, one
           press further in. */
        basis={
          cardVariant === "inline" ? (
            cardBasis ? basisLine : undefined
          ) : (
            <>
              model {a.headlinePct.toFixed(1)} &middot; naive{" "}
              {a.seasonalNaivePct.toFixed(1)} &middot; manual{" "}
              {a.manualPct.toFixed(1)}
            </>
          )
        }
        detail={
          <>
            {cardVariant === "inline" ? (
              <span className="mb-[6px] block">
                {`Model ${a.headlinePct.toFixed(1)}%, seasonal naive ${a.seasonalNaivePct.toFixed(1)}%, authored manual baseline ${a.manualPct.toFixed(1)}% -- all three scored on the identical row mask.`}
              </span>
            ) : null}
            <span className="block">
              No trend is drawn because none exists to draw: the registry holds
              four model versions trained inside the same two minutes, so there
              is no retrain history. What the mark shows instead is where the
              model sits against the two benchmarks it was scored beside on the
              identical row mask.
            </span>
            <span className="mt-[6px] block">
              {`MASE ${a.mase.toFixed(3)} against seasonal naive at ${a.maseSeasonalNaive.toFixed(3)}; below 1.00 beats the benchmark on its own scale.`}
              {a.foldCount === null
                ? null
                : ` Mean of ${a.foldCount} rolling-origin folds.`}
            </span>
            <span className="mt-[6px] block">
              {`The authored manual baseline sits at ${a.manualPct.toFixed(1)}%, so the margin over it is ${a.vsManualPoints.toFixed(1)} points -- a bigger number that proves less, because that baseline was calibrated to a target by the dataset designer.`}
            </span>
          </>
        }
        href={href}
        hrefLabel={hrefLabel}
      />
    );
  }

  if (variant === "inline") {
    return (
      <Kpi
        className={className}
        label="Forecast accuracy"
        href={href}
        linkLabel="Forecast accuracy, against both benchmarks"
        value={`${a.headlinePct.toFixed(1)}%`}
        /* The margin that proves it, never separated from the headline. */
        pill={
          <Pill
            variant="up"
            tabular
            title="Percentage points above seasonal naive, scored on the same rows."
          >
            +{a.vsSeasonalNaivePoints.toFixed(1)} vs naive
          </Pill>
        }
        hint={basisLine}
      />
    );
  }

  const SEASONAL_NOTE = `The benchmark nobody constructed. Margin +${a.vsSeasonalNaivePoints.toFixed(1)} points -- this is the comparison that proves the model works.`;
  const MANUAL_NOTE = `Authored by the dataset designer and calibrated to a target, so the +${a.vsManualPoints.toFixed(1)} point margin proves less than its size suggests.`;
  const MASE_LINE = `MASE ${a.mase.toFixed(3)} against seasonal naive at ${a.maseSeasonalNaive.toFixed(3)}; below 1.00 beats the benchmark on its own scale. Drift ${a.driftPct.toFixed(1)}% and 13-week rolling mean ${a.rolling13Pct.toFixed(1)}% are the other two benchmarks scored on the identical row mask.`;

  return (
    <div className={className}>
      <Bar label="StyleVerse model" pct={a.headlinePct} tone="model" />
      <Bar
        label="Seasonal naive"
        pct={a.seasonalNaivePct}
        tone="bench"
        note={notesBehindWhy ? undefined : SEASONAL_NOTE}
      />
      <Bar
        label="Manual baseline"
        pct={a.manualPct}
        tone="manual"
        note={notesBehindWhy ? undefined : MANUAL_NOTE}
      />
      {notesBehindWhy ? (
        <Why
          lead="Seasonal naive is the benchmark that counts"
          label="why, and the other three scores"
          className="mt-[9px] block"
        >
          <span className="block">{SEASONAL_NOTE}</span>
          <span className="mt-[6px] block">{MANUAL_NOTE}</span>
          <span className="mt-[6px] block">{MASE_LINE}</span>
        </Why>
      ) : (
        <div className="pt-[11px] text-small font-semibold text-mute leading-[1.6]">
          {MASE_LINE}
        </div>
      )}
    </div>
  );
}

export default AccuracyStatement;
