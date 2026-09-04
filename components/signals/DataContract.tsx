import { Card, CardBody, CardHeader, DataTable, Pill } from "@/components";
import type { Column } from "@/components";

import {
  PRODUCTION_CONTRACT,
  UNTABLED,
  type ContractRow,
  type UntabledFigure,
} from "./contract";
import { joinNames, plural } from "./format";
import { SIGNAL_KINDS, type SignalKind } from "./types";

/**
 * THE PRODUCTION DATA CONTRACT -- DESCRIBED, NOT BUILT.
 *
 * This is the honest-scoping section, and the failure mode it guards against
 * is specific: a table of sources and cadences, rendered in the same visual
 * language as the tables above it, reads as an integration that exists.
 * Nothing here exists. There is no search API key, no listening feed, no
 * crawler and no scheduler; there are four columns on signal_intelligence
 * filled from the case dataset's own signals sheet.
 *
 * So the card is marked as a plan in its header, in its opening sentence and
 * in the empty-source column of every row, and the strongest claim it makes
 * is about what a real feed would have to control for.
 *
 * WHY THE PILOT'S CHOICE IS THE RIGHT ONE FOR A PILOT, NOT AN APOLOGY.
 * Reading the signals out of the same fixture that generated the demand is
 * what makes the causal question askable at all. Because both sides come
 * from one dataset, a measured correlation between them is a property of the
 * data that a reader can go and recompute -- which is exactly what the lead
 * table above does. Wire in a live feed and the first thing you lose is the
 * ability to check: the lead becomes a claim about a vendor's index, and a
 * reader has no way to reproduce it. The feeds come after the mechanism is
 * shown to work, not before.
 *
 * The accuracy-control column is the part worth reading. Each of these
 * sources fails in a way that looks like demand moving, and a signal that
 * fails silently is worse than no signal, because the model will happily fit
 * to a vendor's own re-basing and call it a trend.
 */

/** The contract row plus whether the pilot's column carries anything today. */
type Row = ContractRow & { kind: SignalKind | null; populated: boolean };

export type ProductionContractProps = {
  /** Series that carry at least one value in the reader's scope. */
  populated: readonly SignalKind[];
};

export function ProductionContract({ populated }: ProductionContractProps) {
  const rows: Row[] = PRODUCTION_CONTRACT.map((row) => {
    const meta = SIGNAL_KINDS.find((candidate) => candidate.column === row.column);
    return {
      ...row,
      kind: meta?.kind ?? null,
      populated: meta ? populated.includes(meta.kind) : false,
    };
  });

  const live = rows.filter((row) => row.populated);
  const empty = rows.filter((row) => !row.populated);

  const columns: ReadonlyArray<Column<Row>> = [
    {
      key: "signal",
      header: "Signal",
      headerClassName: "w-[170px]",
      cell: (row) => (
        <div>
          <div className="font-bold text-ink">{row.label}</div>
          <div className="font-mono text-[10.5px] text-mute">{row.column}</div>
          <div className="mt-[5px]">
            {row.populated ? (
              <Pill variant="grey">Filled from the fixture</Pill>
            ) : (
              <Pill variant="amber">No values in scope</Pill>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source it would come from",
      cell: (row) => (
        <span className="text-[11.5px] leading-[1.55] text-body">{row.source}</span>
      ),
    },
    {
      key: "cadence",
      header: "Cadence",
      headerClassName: "w-[180px]",
      cell: (row) => (
        <span className="text-[11.5px] leading-[1.55] text-body">{row.cadence}</span>
      ),
    },
    {
      key: "control",
      header: "What would have to be controlled for",
      cell: (row) => (
        <span className="text-[11.5px] leading-[1.55] text-body">
          {row.accuracyControl}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Production data contract"
        subtitle="What would have to replace the pilot's feed at scale -- written as a requirement, because none of it is built"
        actions={<Pill variant="amber">Planned, not built</Pill>}
      />
      <CardBody>
        <p className="max-w-[100ch] text-copy leading-[1.6] text-body">
          <b className="text-ink">Nothing in this table is running.</b> There
          is no search API key in this deployment, no social listening
          subscription, no competitor crawler and no scheduler behind any of
          it. Every value on this screen comes from four columns of{" "}
          <span className="font-mono text-[11.5px]">signal_intelligence</span>,
          filled once from the case dataset&apos;s own signals sheet. The rows
          below say what a real feed would have to provide and, more usefully,
          what it would have to control for.
        </p>
        <p className="mt-[10px] max-w-[100ch] text-copy leading-[1.6] text-body">
          <b className="text-ink">
            The pilot reads the dataset&apos;s own signals on purpose.
          </b>{" "}
          Because the signal and the demand come out of one dataset, the
          relationship between them is a property of the data rather than a
          claim about somebody&apos;s integration -- which is what makes the
          measured leads above checkable. A reader can recompute every
          correlation on this screen from rows they can query. Wire in a
          vendor index and that ends: the lead becomes a statement about a
          feed nobody outside the pipeline can see. The feeds belong after the
          mechanism has been shown to work, not before it, and the honest
          order is the one this pilot takes.
        </p>
        <p className="mt-[10px] max-w-[100ch] text-copy leading-[1.6] text-body">
          <b className="text-ink">Read the last column first.</b> Each of these
          sources fails in a way that looks like demand moving -- an index
          re-based to a new window, a platform growing its own reach, a crawl
          that missed a site, a price basket that quietly changed shape. A
          model has no way to tell those apart from a trend and will fit to
          them, so the controls below are the difference between a signal and
          a plausible-looking one, not operational detail to be settled later.
        </p>

        <div className="mt-[16px] -mx-[20px]">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.column}
            caption="Production data contract: source, cadence and accuracy control per signal"
            empty="No signal is described."
          />
        </div>

        <p className="mt-[14px] max-w-[100ch] text-copy leading-[1.6] text-body">
          There are {plural(rows.length, "row", "rows")} because
          signal_intelligence carries {plural(rows.length, "series", "series")},
          and a feed with no column behind it is not listed here as though the
          pilot had one.{" "}
          {live.length === rows.length
            ? "All of them carry values in your scope."
            : live.length === 0
              ? "None of them carries a value in your scope, so every row below describes a column that is currently empty for you."
              : `${joinNames(live.map((row) => row.label))} carry values in your scope; ${joinNames(empty.map((row) => row.label))} ${empty.length === 1 ? "does" : "do"} not, so ${empty.length === 1 ? "that row describes" : "those rows describe"} a column that is empty for you rather than a series you can check.`}{" "}
          The one thing this section would gain from being built is the ability
          to re-measure the leads on a moving series -- and that is also the
          thing most likely to move them, which is why the admission gate
          re-tests rather than assumes.
        </p>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------ untabled list

/**
 * WHAT HAS NO TABLE BEHIND IT, EXHAUSTIVELY.
 *
 * A claim of exhaustiveness is worth less than nothing if it is written by
 * hand next to a list somebody later adds to, because a reader who trusts it
 * stops checking. So the sentence and the list are the same object: this
 * panel renders every entry in UNTABLED, and each entry interpolates the
 * constant the screen actually uses rather than restating its value. Adding
 * a constant to contract.ts without adding it here is the mistake that file
 * is arranged to make hard.
 *
 * The admission threshold is deliberately absent, and the panel says so:
 * min_actionable_corr is read back from downstream_handoff rather than typed,
 * so listing it here would be a false confession -- which damages a
 * provenance claim as badly as a false denial.
 */
export function UntabledFigures() {
  const columns: ReadonlyArray<Column<UntabledFigure>> = [
    {
      key: "what",
      header: "Figure",
      headerClassName: "w-[210px]",
      cell: (row) => (
        <div>
          <div className="font-bold text-ink">{row.what}</div>
          <div className="mt-[3px] text-[11.5px] font-extrabold tabular-nums text-orangeD">
            {row.value}
          </div>
        </div>
      ),
    },
    {
      key: "why",
      header: "Why no table holds it",
      cell: (row) => (
        <span className="text-[11.5px] leading-[1.55] text-body">{row.whyNoTable}</span>
      ),
    },
    {
      key: "where",
      header: "Where it appears on this screen",
      headerClassName: "w-[260px]",
      cell: (row) => (
        <span className="text-[11.5px] leading-[1.55] text-body">{row.where}</span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="What has no table behind it"
        subtitle="The complete list, rendered from the same array the screen reads its values out of"
        actions={<Pill variant="grey">{UNTABLED.length} figures</Pill>}
      />
      <CardBody>
        <p className="max-w-[100ch] text-copy leading-[1.6] text-body">
          Every other figure on this screen is read from Postgres at request
          time under your row level security: each measured lead and its
          correlation, every index value and momentum reading, every
          confidence band, the momentum bracket the band rule turns on, the
          counts in every panel, the admission threshold itself, and the model
          accuracy wherever it appears. These{" "}
          {UNTABLED.length} are the exceptions, and this is the whole list --
          not a selection from it. The panel is rendered from the array the
          rest of the screen imports its values from, so a figure cannot be
          added to the code and quietly left out of this table.
        </p>
        <div className="mt-[16px] -mx-[20px]">
          <DataTable
            columns={columns}
            rows={UNTABLED}
            rowKey={(row) => row.id}
            caption="Figures on this screen with no table behind them, and why"
            empty="Every figure on this screen is read from a table."
          />
        </div>
        <p className="mt-[14px] max-w-[100ch] text-copy leading-[1.6] text-body">
          <b className="text-ink">
            The admission threshold is not on this list, and that is the point
            of having one.
          </b>{" "}
          It would be the obvious candidate -- a cut-off of the kind that
          usually is typed into a web application -- but the pipeline run that
          measured these leads recorded the bar it applied them against, and
          this screen reads it back from{" "}
          <span className="font-mono text-[11.5px]">
            downstream_handoff.supporting_metric
          </span>
          . Listing it here to look thorough would be as misleading as
          omitting something that belongs: a provenance claim is only useful
          while every line of it is true, because its whole function is to
          tell a reader which numbers they still need to check.
        </p>
      </CardBody>
    </Card>
  );
}

export default ProductionContract;
