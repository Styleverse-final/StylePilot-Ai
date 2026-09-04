"use client";

import { Pill } from "@/components/Pill";

import {
  formatFractionPct,
  formatSignedFractionPct,
  formatUnits,
} from "./format";
import {
  CURVE_DEPTH_CEILING,
  LEVER_BOUNDS,
  PRICE_FRACTION_FLOOR,
  isExtrapolatingUpward,
  isPriceFractionClamped,
  priceFraction,
  realisedPriceFraction,
  type CategoryBase,
  type LeverState,
} from "./model";

/**
 * The four levers, each carrying the reason it is allowed to move a number.
 *
 * Two of these are FITTED and two are not, and the screen refuses to let
 * them look alike. Price and promotion depth run through the per-category
 * elasticity that Part D regressed out of observed promotions, so the pill
 * beside them names the table. The marketing index has no fitted response
 * anywhere in this dataset -- the model's own feature list, printed on this
 * page, contains price, promotion, search, social, competitor and weather
 * terms and no marketing term -- so it is labelled an assumption, in amber,
 * and the planner is told they are testing a belief rather than reading a
 * measurement. Capacity is neither: it is an arithmetic ceiling and involves
 * no curve at all.
 *
 * The sliders are expressed as a CHANGE against the plan's own price point.
 * That is what lets the fitted intercept cancel out of the ratio, and it is
 * why there is no "current depth" field to fill in: the forecast rows do not
 * carry one, and a screen that asked for it would be asking the planner to
 * supply the number the whole page is meant to derive.
 */

export type LeversProps = {
  levers: LeverState;
  onChange: (next: LeverState) => void;
  /** Base plan units, so the capacity cap can be shown in real units. */
  baseUnits: number;
  /** Categories in the selection, for the fitted-coefficient summary. */
  bases: readonly CategoryBase[];
  /** Horizon the plan covers, read from the forecast rows. */
  horizonWeeks: number;
  /** What the registry says about marketing features. Checked, not asserted. */
  marketing: {
    checked: boolean;
    featureCount: number;
    marketingFeatures: readonly string[];
    modelVersion: string | null;
  };
};

const ROW_CLASS = "border-b border-rule py-[13px] last:border-b-0";
const HEAD_CLASS =
  "flex items-baseline justify-between gap-[10px] text-[12px] font-bold text-ink";
const NOTE_CLASS = "mt-[6px] text-[11px] font-semibold leading-[1.55] text-mute";
const SLIDER_CLASS =
  "mt-[9px] w-full accent-orange cursor-pointer disabled:cursor-not-allowed disabled:opacity-40";
const SCALE_CLASS =
  "mt-[3px] flex justify-between text-[10px] font-bold text-mute tabular-nums";

function Scale({ low, high }: { low: string; high: string }) {
  return (
    <div className={SCALE_CLASS}>
      <span>{low}</span>
      <span>{high}</span>
    </div>
  );
}

export function Levers({
  levers,
  onChange,
  baseUnits,
  bases,
  horizonWeeks,
  marketing,
}: LeversProps) {
  const fitted = bases.filter((base) => base.fit !== null);
  const pooled = fitted.filter((base) => base.fit?.isPooledFallback);
  const unfitted = bases.filter((base) => base.fit === null);

  const capacityUnits =
    levers.capacityShare === null ? null : levers.capacityShare * baseUnits;

  const set = (patch: Partial<LeverState>): void =>
    onChange({ ...levers, ...patch });

  return (
    <div>
      {/* ------------------------------------------------ price change */}
      <div className={ROW_CLASS}>
        <div className={HEAD_CLASS}>
          <span>Price change</span>
          <span className="tabular-nums">
            {formatSignedFractionPct(levers.priceChange)}
          </span>
        </div>
        <input
          type="range"
          className={SLIDER_CLASS}
          aria-label="Price change against the plan's own price point"
          min={LEVER_BOUNDS.priceChange.min}
          max={LEVER_BOUNDS.priceChange.max}
          step={LEVER_BOUNDS.priceChange.step}
          value={levers.priceChange}
          onChange={(event) =>
            set({ priceChange: Number.parseFloat(event.target.value) })
          }
        />
        <Scale
          low={formatSignedFractionPct(LEVER_BOUNDS.priceChange.min, 0)}
          high={formatSignedFractionPct(LEVER_BOUNDS.priceChange.max, 0)}
        />
        <div className="mt-[7px]">
          <Pill variant="violet">Fitted per category</Pill>
        </div>
        <p className={NOTE_CLASS}>
          Moves the realised price against the plan&apos;s own point, and the
          demand response is the fitted curve read as a ratio, so the intercept
          cancels and the coefficient is the whole of it.
          {/* The model's own predicate, not the sign of one lever. A price
              rise under a promotion deep enough to swallow it lands below the
              plan price and is no extrapolation at all; the realised price is
              what decides. */}
          {isExtrapolatingUpward(levers) ? (
            <>
              {" "}
              <b className="text-amber">
                At a realised price of{" "}
                {formatFractionPct(realisedPriceFraction(levers))} of plan the
                curve is being read outside the discounts it was fitted on.
              </b>{" "}
              Every promotion in the regression was a price cut; a rise is an
              extrapolation and is shown as one rather than hidden.
            </>
          ) : null}
        </p>
      </div>

      {/* --------------------------------------------- promotion depth */}
      <div className={ROW_CLASS}>
        <div className={HEAD_CLASS}>
          <span>Promotion depth</span>
          <span className="tabular-nums">
            {formatFractionPct(levers.promoDepth)}
          </span>
        </div>
        <input
          type="range"
          className={SLIDER_CLASS}
          aria-label="Incremental promotion depth on top of the plan"
          min={LEVER_BOUNDS.promoDepth.min}
          max={LEVER_BOUNDS.promoDepth.max}
          step={LEVER_BOUNDS.promoDepth.step}
          value={levers.promoDepth}
          onChange={(event) =>
            set({ promoDepth: Number.parseFloat(event.target.value) })
          }
        />
        <Scale
          low="0%"
          high={formatFractionPct(LEVER_BOUNDS.promoDepth.max, 0)}
        />
        <div className="mt-[7px]">
          <Pill variant="violet">Same curve as markdown timing</Pill>
        </div>
        <p className={NOTE_CLASS}>
          log(uplift) = intercept + coefficient {"×"} log(1 - depth), fitted
          per category on promotions whose outcome had already happened. The
          slider stops at {formatFractionPct(CURVE_DEPTH_CEILING, 0)} because
          that is the ceiling the pipeline solves the curve over -- a case
          premise about how far the fit may be pushed, not a measured limit.
          {isPriceFractionClamped(levers) ? (
            <>
              {" "}
              <b className="text-amber">
                A price cut and this depth together ask for{" "}
                {formatFractionPct(priceFraction(levers))} of the plan price,
                below the {formatFractionPct(PRICE_FRACTION_FLOOR, 0)} floor
                that same ceiling puts under the curve.
              </b>{" "}
              Every figure on this screen was costed at{" "}
              {formatFractionPct(realisedPriceFraction(levers))} instead -- the
              units, the revenue and the markdown alike, so they describe one
              price rather than two.
            </>
          ) : null}
        </p>
      </div>

      {/* --------------------------------------------- marketing index */}
      <div className={ROW_CLASS}>
        <div className={HEAD_CLASS}>
          <span>Marketing index</span>
          <span className="tabular-nums">
            {levers.marketingIndex.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          className={SLIDER_CLASS}
          aria-label="Marketing index"
          min={LEVER_BOUNDS.marketingIndex.min}
          max={LEVER_BOUNDS.marketingIndex.max}
          step={LEVER_BOUNDS.marketingIndex.step}
          value={levers.marketingIndex}
          onChange={(event) =>
            set({ marketingIndex: Number.parseFloat(event.target.value) })
          }
        />
        <Scale
          low={LEVER_BOUNDS.marketingIndex.min.toFixed(2)}
          high={LEVER_BOUNDS.marketingIndex.max.toFixed(2)}
        />
        <div className="mt-[7px]">
          <Pill variant={marketing.marketingFeatures.length > 0 ? "violet" : "amber"}>
            {marketing.marketingFeatures.length > 0
              ? "The model does carry a marketing term"
              : "Assumption, not a fit"}
          </Pill>
        </div>
        <p className={NOTE_CLASS}>
          {marketing.checked ? (
            marketing.marketingFeatures.length > 0 ? (
              <>
                The registry row for{" "}
                <span className="font-mono text-[10.5px]">
                  {marketing.modelVersion}
                </span>{" "}
                does list a marketing feature (
                {marketing.marketingFeatures.join(", ")}), so this caption is
                wrong and the lever should be re-derived from the model rather
                than passed through. It is still passing through one-for-one
                until it is.
              </>
            ) : (
              <>
                Checked against the model, not assumed: none of the{" "}
                <b className="text-ink tabular-nums">
                  {marketing.featureCount}
                </b>{" "}
                features on{" "}
                <span className="font-mono text-[10.5px]">
                  {marketing.modelVersion}
                </span>{" "}
                is a marketing term, so nothing here measures a marketing
                response. The index passes through one-for-one -- 1.10 is a 10%
                lift -- and that pass-through is a stated case premise you are
                testing, not something the model learned.
              </>
            )
          ) : (
            <>
              The registry row behind this forecast is not readable in your
              scope, so this screen cannot check whether the model carries a
              marketing feature. The index passes through one-for-one and is
              treated as an assumption, which is the safe reading when the
              evidence is unavailable.
            </>
          )}
        </p>
      </div>

      {/* ---------------------------------------------- capacity cap */}
      <div className={ROW_CLASS}>
        <div className={HEAD_CLASS}>
          <span>Capacity cap</span>
          <span className="tabular-nums">
            {levers.capacityShare === null
              ? "None"
              : formatFractionPct(levers.capacityShare, 0)}
          </span>
        </div>
        <input
          type="range"
          className={SLIDER_CLASS}
          aria-label="Capacity cap as a share of the base plan"
          min={LEVER_BOUNDS.capacityShare.min}
          max={LEVER_BOUNDS.capacityShare.max}
          step={LEVER_BOUNDS.capacityShare.step}
          value={levers.capacityShare ?? 1}
          disabled={levers.capacityShare === null}
          onChange={(event) =>
            set({ capacityShare: Number.parseFloat(event.target.value) })
          }
        />
        <Scale
          low={formatFractionPct(LEVER_BOUNDS.capacityShare.min, 0)}
          high={formatFractionPct(LEVER_BOUNDS.capacityShare.max, 0)}
        />
        <label className="mt-[8px] flex items-center gap-[7px] text-[11px] font-bold text-body">
          <input
            type="checkbox"
            className="accent-orange"
            checked={levers.capacityShare !== null}
            onChange={(event) =>
              set({ capacityShare: event.target.checked ? 1 : null })
            }
          />
          Apply a capacity cap
        </label>
        <p className={NOTE_CLASS}>
          {capacityUnits === null ? (
            <>
              Off. With no cap the plan is whatever the levers above ask for,
              which is the right default: a constraint you did not impose should
              never quietly shape the answer.
            </>
          ) : (
            <>
              A ceiling of <b className="text-ink">{formatUnits(capacityUnits)}</b>{" "}
              units over {horizonWeeks} weeks, applied pro rata across the plan.
              This lever runs no curve: units above the ceiling simply cannot be
              made, and they land in lost sales.
            </>
          )}
        </p>
      </div>

      {/* ------------------------------------------------- fit summary */}
      <div className="border-t border-rule pt-[13px] text-[11px] font-semibold leading-[1.6] text-mute">
        <b className="text-ink">
          {fitted.length} of {bases.length}{" "}
          {bases.length === 1 ? "category" : "categories"} in this selection
          carry a fitted curve
        </b>
        <br />
        {pooled.length > 0 ? (
          <>
            {pooled.map((base) => base.categoryName).join(", ")}{" "}
            {pooled.length === 1 ? "ships" : "ship"} the pooled coefficient
            instead of an own fit, and the result table says so on every row it
            touches rather than applying it quietly.
          </>
        ) : (
          <>
            None of them fell back to the pooled coefficient, so every price
            response below is the category&apos;s own.
          </>
        )}
        {unfitted.length > 0 ? (
          <>
            {" "}
            {unfitted.map((base) => base.categoryName).join(", ")} has no
            elasticity row at all, so the price and promotion levers leave it
            unmoved; only the marketing index reaches it.
          </>
        ) : null}
        <br />
        <br />
        The ends of these sliders are a range to explore in, not a limit the
        data measured. The one exception is the promotion depth ceiling, which
        is where the pipeline stops solving the curve.
      </div>
    </div>
  );
}

export default Levers;
