import type { AccuracyHeadline } from "@/lib/accuracy";

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
  variant?: "inline" | "bars" | "compact";
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
    tone === "model" ? "bg-orange" : tone === "bench" ? "bg-violet" : "bg-[#D8CCC2]";
  return (
    <div className="py-[11px] border-b border-rule last:border-b-0">
      <div className="flex items-baseline justify-between gap-[10px] mb-[6px]">
        <span className="text-copy font-bold">{label}</span>
        <span className="text-copy font-extrabold tabular">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-[8px] rounded-pill bg-cream overflow-hidden">
        <div
          className={`h-full rounded-pill ${fill}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      {note ? <div className="mt-[5px] text-small font-semibold text-mute">{note}</div> : null}
    </div>
  );
}

export function AccuracyStatement({
  accuracy: a,
  variant = "inline",
  className,
}: AccuracyStatementProps) {
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
        own scale. The authored manual baseline sits at {a.manualPct.toFixed(1)}%,
        so the margin over it is {a.vsManualPoints.toFixed(1)} points -- a bigger
        number that proves less, because that baseline was calibrated to a
        target by the dataset designer. Seasonal naive is the benchmark nobody
        constructed, which is why its margin is the one on the line above.
      </Why>
    );
  }

  if (variant === "inline") {
    return (
      <div className={className}>
        <div className="text-label font-bold text-mute">Forecast accuracy</div>
        <div className="mt-[3px] flex items-center gap-[7px]">
          <b className="text-kpi font-extrabold tabular">{a.headlinePct.toFixed(1)}%</b>
          {/* The margin that proves it, never separated from the headline. */}
          <span className="rounded-pill bg-greenW px-[9px] py-[3px] text-th font-extrabold text-green whitespace-nowrap">
            +{a.vsSeasonalNaivePoints.toFixed(1)} vs naive
          </span>
        </div>
        <div className="mt-[3px] text-small font-semibold text-mute">
          {/* No fold count is better than an invented one: the registry row
              simply does not always carry by_fold. */}
          {a.foldCount === null ? null : <>mean of {a.foldCount} folds &middot; </>}
          MASE {a.mase.toFixed(2)} &middot; +{a.vsManualPoints.toFixed(1)} vs manual
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Bar label="StyleVerse model" pct={a.headlinePct} tone="model" />
      <Bar
        label="Seasonal naive"
        pct={a.seasonalNaivePct}
        tone="bench"
        note={`The benchmark nobody constructed. Margin +${a.vsSeasonalNaivePoints.toFixed(1)} points -- this is the comparison that proves the model works.`}
      />
      <Bar
        label="Manual baseline"
        pct={a.manualPct}
        tone="manual"
        note={`Authored by the dataset designer and calibrated to a target, so the +${a.vsManualPoints.toFixed(1)} point margin proves less than its size suggests.`}
      />
      <div className="pt-[11px] text-small font-semibold text-mute leading-[1.6]">
        MASE {a.mase.toFixed(3)} against seasonal naive at{" "}
        {a.maseSeasonalNaive.toFixed(3)}; below 1.00 beats the benchmark on its
        own scale. Drift {a.driftPct.toFixed(1)}% and 13-week rolling mean{" "}
        {a.rolling13Pct.toFixed(1)}% are the other two benchmarks scored on the
        identical row mask.
      </div>
    </div>
  );
}

export default AccuracyStatement;
