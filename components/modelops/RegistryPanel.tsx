import {
  AccuracyStatement,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Pill,
  type Column,
} from "@/components";
import type { AccuracyHeadline } from "@/lib/accuracy";

import { benchmarksFor, type Benchmark, type RegistryRow } from "./data";
import { dateOnly, fixed, integer, pct, plural, signedPoints } from "./format";

/**
 * MODEL REGISTRY -- planning grain.
 *
 * The registry row is the thing that makes a forecast arguable rather than
 * oracular: engine, horizon, target column, the exact feature list, the row
 * count it was fitted on, the moment it was trained, and the full backtest.
 * All of it is read from model_registry at request time.
 *
 * FOUR BENCHMARKS, NOT ONE (and never just the flattering one)
 * -----------------------------------------------------------
 * Every model card carries all four comparisons the pipeline scored on the
 * identical row mask, in a fixed order that puts the mechanical benchmarks
 * first and the authored one last. Seasonal naive, drift and the 13-week
 * rolling mean are rules nobody tuned; the manual baseline was written by the
 * dataset designer and calibrated by bisection to hit a target. Beating the
 * manual baseline by twenty-four points therefore proves something about the
 * fixture. Beating seasonal naive by five proves something about the model,
 * and it is the harder of the two.
 *
 * PART H: the headline accuracy is never printed alone anywhere on this card.
 * It reaches the screen only through <AccuracyStatement variant="bars"/>,
 * which puts the seasonal-naive margin in the same block, and the table below
 * repeats the benchmark set rather than the headline.
 */

const BENCHMARK_COLUMNS: readonly Column<Benchmark>[] = [
  {
    key: "label",
    header: "Benchmark",
    cell: (row) => (
      <span className="flex items-center gap-[7px]">
        <span className="text-copy font-extrabold text-ink">{row.label}</span>
        {row.constructed ? (
          <Pill variant="amber">authored</Pill>
        ) : (
          <Pill variant="violet">nobody constructed it</Pill>
        )}
      </span>
    ),
  },
  {
    key: "rule",
    header: "What it does",
    cell: (row) => <span className="text-mute">{row.rule}</span>,
  },
  {
    key: "pct",
    header: "Accuracy",
    numeric: true,
    cell: (row) => <span className="font-bold">{pct(row.pct)}</span>,
  },
  {
    key: "margin",
    header: "Model over it",
    numeric: true,
    cell: (row) =>
      row.marginPoints === null ? (
        <span className="text-mute">--</span>
      ) : (
        <Pill
          variant={row.constructed ? "grey" : "up"}
          tabular
          title={
            row.constructed
              ? "Large because the baseline was calibrated to a target, not because the gap is hard-won."
              : "The margin that carries the proof."
          }
        >
          {signedPoints(row.marginPoints)} pts
        </Pill>
      ),
  },
];

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-label font-bold text-mute">{label}</div>
      <div className="mt-[2px] text-copy font-bold text-ink">{children}</div>
    </div>
  );
}

function FeatureList({ features }: { features: readonly string[] }) {
  if (features.length === 0) {
    return (
      <p className="text-small font-semibold text-mute">
        This registry row carries no feature list, so none is shown. A feature
        count invented from the model&rsquo;s description would be the one
        thing on this card that could not be checked.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-[4px]">
      {features.map((feature) => (
        <span
          key={feature}
          className="rounded-pill bg-cream px-[7px] py-[2px] font-mono text-[10px] font-semibold text-body"
        >
          {feature}
        </span>
      ))}
    </div>
  );
}

export type RegistryPanelProps = {
  row: RegistryRow;
  /** The Part H statement for THIS registry row, matched on model_version. */
  accuracy: AccuracyHeadline | null;
  brandName: string;
};

export function RegistryPanel({ row, accuracy, brandName }: RegistryPanelProps) {
  const entry = row.entry;
  const benchmarks = benchmarksFor(entry);

  return (
    <Card>
      <CardHeader
        title={`${brandName} · planning grain`}
        subtitle={entry.accuracy_metric}
        actions={<Pill variant="orange">{entry.engine}</Pill>}
      />

      <CardBody>
        <div className="grid grid-cols-2 gap-x-[18px] gap-y-[13px] min-[900px]:grid-cols-4">
          <Fact label="Model id">
            <span className="font-mono text-[11px]">{entry.model_id}</span>
          </Fact>
          <Fact label="Version">
            <span className="font-mono text-[11px]">{entry.model_version}</span>
          </Fact>
          <Fact label="Horizon">{entry.horizon_weeks} weeks ahead</Fact>
          <Fact label="Trained">{dateOnly(entry.trained_at)}</Fact>
          <Fact label="Target">
            <span className="font-mono text-[11px]">{entry.target_column}</span>
          </Fact>
          <Fact label="Features">
            {row.featureCount} {plural(row.featureCount, "column")}
          </Fact>
          <Fact label="Training rows">{integer(entry.n_train_rows)}</Fact>
          <Fact label="Backtest folds">
            {row.folds.length > 0
              ? `${row.folds.length} rolling origin`
              : "not recorded"}
          </Fact>
        </div>

        <div className="mt-[16px] border-t border-rule pt-[14px]">
          <div className="mb-[4px] text-label font-bold text-mute">
            The target is unconstrained demand, not sales
          </div>
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            <span className="font-mono text-[11px] font-bold">
              {entry.target_column}
            </span>{" "}
            is what customers wanted, recovered from censored sales before the
            features were built. Fitting on sales would teach the model that a
            week the shelf was empty was a week nobody wanted the garment, and
            every buy quantity downstream would inherit that.
          </p>
        </div>
      </CardBody>

      {accuracy === null ? (
        <CardBody className="border-t border-rule">
          <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
            No accuracy statement is available for this registry row, so none
            is shown. Accuracy on this screen comes from one place and travels
            attached to the margin over seasonal naive; where that statement
            cannot be built, the card says nothing about accuracy rather than
            reading a number out of the metrics blob on its own.
          </p>
        </CardBody>
      ) : (
        <CardBody className="border-t border-rule">
          <div className="mb-[10px] text-label font-bold text-mute">
            Accuracy, and the two comparisons that frame it
          </div>
          <AccuracyStatement accuracy={accuracy} variant="bars" />
        </CardBody>
      )}

      <div className="border-t border-rule">
        <div className="px-[20px] pb-[6px] pt-[14px]">
          <div className="text-label font-bold text-mute">
            All four benchmarks, scored on the identical row mask
          </div>
          <p className="mt-[4px] max-w-[92ch] text-copy leading-[1.6] text-body">
            Three of these are mechanical rules nobody tuned, and they are
            listed first. The manual baseline is last because it was authored
            by the dataset designer and calibrated to a target, which is why
            the margin over it is the biggest number on the card and the least
            informative one.
          </p>
        </div>
        <DataTable
          columns={BENCHMARK_COLUMNS}
          rows={benchmarks}
          rowKey={(benchmark) => benchmark.key}
          rowClassName={(benchmark) => (benchmark.constructed ? "bg-amberW/40" : undefined)}
          caption={`Benchmark comparison for ${entry.model_id}`}
          empty="This registry row carries no benchmark_comparison block, so no comparison is shown."
        />
        <div className="px-[20px] pb-[16px] pt-[12px] text-small font-semibold leading-[1.6] text-mute">
          MASE {fixed(entry.metrics.benchmark_comparison?.mase_model, 3)} against
          seasonal naive at{" "}
          {fixed(entry.metrics.benchmark_comparison?.mase_snaive, 3)}. MASE is
          scale free, so it is the one figure on this card that compares
          directly across brands; below 1.00 beats the benchmark on its own
          scale.
        </div>
      </div>

      <CardBody className="border-t border-rule" flush>
        <details className="group">
          <summary className="cursor-pointer list-none px-[20px] py-[13px] text-small font-extrabold text-orangeD">
            The {row.featureCount} feature{row.featureCount === 1 ? "" : "s"},
            named
            <span className="ml-[6px] text-[10px] font-bold text-mute">
              (as stored on the registry row)
            </span>
          </summary>
          <div className="px-[20px] pb-[16px]">
            <FeatureList features={row.features} />
          </div>
        </details>
      </CardBody>
    </Card>
  );
}

export default RegistryPanel;
