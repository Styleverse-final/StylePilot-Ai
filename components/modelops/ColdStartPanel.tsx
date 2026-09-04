import { Banner, Card, CardBody, CardHeader, Pill } from "@/components";

import type { ColdStartRow } from "./data";
import { dateOnly, integer, pct, plural, signedPoints } from "./format";

/**
 * MODEL REGISTRY -- cold start, kept deliberately apart.
 *
 * WHY THIS IS A SEPARATE CARD AND NOT TWO MORE TABLE ROWS
 * ------------------------------------------------------
 * The cold-start models sit in the same registry table as the planning
 * models, and that is the only thing they have in common with them. They
 * predict a different target (first-eight-week volume for a style with no
 * history) over a different horizon, scored on a different row mask, and
 * they land near 51% where the planning models land near 83%. Any layout
 * that puts the four rows in one table invites a mean across them, and that
 * mean would describe nothing that exists.
 *
 * So they get their own card, their own tint, and their own benchmark: the
 * category median a planner would reach for if the model were not there. On
 * this data the model does NOT clear that benchmark, and the card says so in
 * the first line rather than in a footnote. That is the finding, and it is
 * the reason the product manages launch risk with a small initial buy and a
 * mandatory re-forecast after two weeks of actuals instead of with this
 * model's number.
 */

export type ColdStartPanelProps = {
  rows: readonly ColdStartRow[];
  brandNames: Record<string, string>;
  /**
   * Folds behind the planning-grain accuracy, so the closing paragraph can
   * contrast the two scoring regimes without asserting a count this card
   * cannot see. Null when the planning rows disagree or record none, in which
   * case the sentence drops the number rather than guessing it.
   */
  planningFoldCount: number | null;
};

/** One horizon when every cold-start row agrees on it, null when they do not. */
function agreedHorizon(rows: readonly ColdStartRow[]): number | null {
  const values = new Set(
    rows
      .map((row) => row.entry.horizon_weeks)
      .filter((value): value is number => typeof value === "number"),
  );
  return values.size === 1 ? [...values][0] : null;
}

function Metric({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: "ink" | "mute";
  note?: string;
}) {
  return (
    <div>
      <div className="text-label font-bold text-mute">{label}</div>
      <div
        className={`mt-[2px] text-kpi font-extrabold tabular ${
          tone === "mute" ? "text-mute" : "text-ink"
        }`}
      >
        {value}
      </div>
      {note ? (
        <div className="mt-[2px] text-small font-semibold text-mute">{note}</div>
      ) : null}
    </div>
  );
}

export function ColdStartPanel({
  rows,
  brandNames,
  planningFoldCount,
}: ColdStartPanelProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Cold start"
          subtitle="Launch forecasting for styles with no history"
        />
        <CardBody>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No cold-start model is registered in your scope. When one is, it
            appears here rather than in the planning-grain section above, with
            its own accuracy and its own benchmark &mdash; the two grains are
            not comparable and are never averaged.
          </p>
        </CardBody>
      </Card>
    );
  }

  const shortfalls = rows.filter(
    (row) => row.marginPoints !== null && row.marginPoints < 0,
  );
  const horizon = agreedHorizon(rows);

  return (
    <Card>
      <CardHeader
        title="Cold start, held separately"
        subtitle="A different target, a different grain, and an accuracy that must never be averaged with the planning models"
        actions={<Pill variant="amber">not comparable</Pill>}
      />

      <CardBody>
        {shortfalls.length > 0 ? (
          <Banner variant="amber" icon="!" title="This model does not beat its benchmark.">
            {shortfalls.length === rows.length
              ? "On both pilot brands"
              : `On ${shortfalls.length} of ${rows.length} pilot ${plural(rows.length, "brand")}`}
            , the attribute model scores BELOW the naive category median
            &mdash; the number a planner would reach for if the model were not
            there. It is registered and shown rather than quietly dropped,
            because a launch estimate is still produced from it and a reader
            is entitled to know how much weight it carries. Launch risk is
            managed by a small initial buy plus a mandatory re-forecast once
            actuals arrive, not by this model&rsquo;s number &mdash; the
            registry row states that policy in its own words below.
          </Banner>
        ) : null}

        <div className="flex flex-col gap-[16px]">
          {rows.map((row) => (
            <div
              key={row.entry.model_id}
              className="rounded-inner bg-shell px-[16px] py-[14px]"
            >
              <div className="mb-[11px] flex flex-wrap items-baseline gap-[9px]">
                <span className="text-h3 font-extrabold text-ink">
                  {brandNames[row.brandId] ?? row.brandId}
                </span>
                <span className="font-mono text-[11px] font-bold text-mute">
                  {row.entry.model_id}
                </span>
                <span className="text-small font-semibold text-mute">
                  {row.entry.engine} &middot; {row.entry.horizon_weeks}-week
                  horizon &middot; trained {dateOnly(row.entry.trained_at)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-[14px] min-[760px]:grid-cols-4">
                <Metric
                  label="Cold-start accuracy"
                  value={pct(row.accuracy)}
                  note={`1 - WAPE on ${integer(row.test)} held-out ${plural(
                    row.test ?? 0,
                    "style",
                  )}`}
                />
                <Metric
                  label="Naive category median"
                  value={pct(row.categoryMedian)}
                  tone="mute"
                  note="the benchmark it must separate from"
                />
                <Metric
                  label="Margin"
                  value={
                    row.marginPoints === null
                      ? "--"
                      : `${signedPoints(row.marginPoints)} pts`
                  }
                  tone={
                    row.marginPoints !== null && row.marginPoints < 0 ? "mute" : "ink"
                  }
                  note={
                    row.marginPoints !== null && row.marginPoints < 0
                      ? "below the median it is meant to beat"
                      : "over the median"
                  }
                />
                <Metric
                  label="Styles seen"
                  value={integer(row.styles)}
                  note={`${row.featureCount} attribute ${plural(
                    row.featureCount,
                    "feature",
                  )}, no history`}
                />
              </div>

              {row.note ? (
                <p className="mt-[12px] max-w-[92ch] border-t border-rule pt-[11px] text-copy leading-[1.6] text-body">
                  <span className="font-bold text-ink">
                    Recorded on the registry row:
                  </span>{" "}
                  {row.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <p className="mt-[14px] max-w-[92ch] text-copy leading-[1.6] text-body">
          Neither figure above belongs in the same average as the planning
          grain. The planning models are scored at
          brand&nbsp;&gt;&nbsp;category&nbsp;&gt;&nbsp;channel&nbsp;&gt;&nbsp;region&nbsp;&gt;&nbsp;week
          {planningFoldCount === null
            ? " over a rolling-origin backtest"
            : ` over ${planningFoldCount} rolling-origin folds`}
          ; these are scored on{" "}
          {horizon === null
            ? "launch volume"
            : `first-${horizon}-week volume`}{" "}
          per style, on the held-out counts shown above. A blended &ldquo;model
          accuracy&rdquo; across both would be a number with no population
          behind it, so this screen never computes one.
        </p>
      </CardBody>
    </Card>
  );
}

export default ColdStartPanel;
