import { Card, CardBody, CardHeader, DataTable, Pill, Why } from "@/components";
import type { Column } from "@/components";

import type { ThresholdUse } from "./data";
import { pct, plural } from "./format";

/**
 * WHERE EACH SENTENCE CAME FROM, AND WHETHER YOU COULD CHECK IT HERE.
 *
 * source_table is the most valuable column in downstream_handoff and the
 * easiest to render uselessly. Printing "sku_weekly + sku" under an insight
 * looks like provenance and is not: those are the tables the OFFLINE SCORING
 * JOB read, in the pipeline's own names, and a reader who goes looking for
 * them in this application will not find several of them.
 *
 * So the ledger below does the one thing that makes the column worth
 * printing: it says, for each pipeline source, whether this application can
 * see anything equivalent. Two of the six cannot be checked here at all, and
 * a reader who assumes otherwise and fails to find the table is worse off
 * than one who was told.
 */

/**
 * THE ONE THING ON THIS SCREEN THAT IS NOT READ FROM A TABLE.
 *
 * This maps each source_table string the pipeline writes onto the tables this
 * application can actually query. It is a fact about the SCHEMA, established
 * by reading information_schema.columns against the project at build time and
 * not re-checked at request time -- the anon client has no business
 * introspecting the catalogue on a page render, and a page that did would be
 * asserting the same thing more expensively.
 *
 * What was checked, and what it found:
 *
 *   * `sku_weekly` and `sku` -- NO counterpart. There is no sku-week fact
 *     table in this schema, and dim_sku carries no fabric, silhouette or
 *     colour_family column: a search of every column name in the public
 *     schema for those three words returns nothing. The DESIGN attribute
 *     rankings therefore cannot be recomputed here at all.
 *   * `store_weekly` and `store` -- NO counterpart. There is no store or
 *     store-week table in this schema. The RETAIL_OPS cover figures cannot be
 *     recomputed here either.
 *   * `grain` -- fact_demand_weekly. Checked: the per-category demand and
 *     manual-plan totals reproduce exactly over the window the rows name, and
 *     each availability figure reproduces as the mean of availability_ratio
 *     over the thirteen weeks ending at the last week the table holds.
 *   * `signals_cat` -- signal_intelligence. Checked: every lead length and
 *     correlation in the MARKETING rows reproduces from it exactly.
 *   * `channel` -- dim_channel. Checked: the three lead times reproduce.
 *   * `buy_recommendations` -- recommendation, rec_type BUY_QUANTITY.
 *     Checked: the requirement and manual totals reproduce from the payload.
 *
 * A source_table value not in this map renders as "no note recorded", never
 * as an assumption. That matters more than the map itself: the map can go
 * stale, and the failure mode of a stale map must be silence rather than a
 * confident wrong answer.
 */
const SOURCE_PROVENANCE: Readonly<
  Record<string, { appTables: string | null; note: string }>
> = {
  "sku_weekly + sku": {
    appTables: null,
    note:
      "No counterpart in this application's schema. There is no sku-week fact table here, and dim_sku carries no fabric, silhouette or colour_family column, so these rankings cannot be recomputed on this screen. They stand on the pipeline run that produced them.",
  },
  "store_weekly + store + channel": {
    appTables: null,
    note:
      "Only the channel part has a counterpart here, on dim_channel. Nothing in this schema holds store-level inventory or sales, so the cover weeks, the regional medians and the transfer sizes cannot be recomputed on this screen -- the panel that checks those moves works inside each row rather than against a table. They stand on the pipeline run that produced them.",
  },
  grain: {
    appTables: "fact_demand_weekly",
    note:
      "Readable here. The per-category demand and manual-plan totals reproduce from it exactly over the window the rows name, and each 13-week availability figure reproduces as the mean of availability_ratio over the thirteen weeks ending at the last week the table holds.",
  },
  "signals_cat + grain": {
    appTables: "signal_intelligence + fact_demand_weekly",
    note:
      "Readable here. Every measured lead length and correlation quoted in these rows reproduces from signal_intelligence.",
  },
  "channel + grain": {
    appTables: "dim_channel + fact_demand_weekly",
    note: "Readable here. The three channel lead times reproduce from dim_channel.",
  },
  "buy_recommendations + grain": {
    appTables: "recommendation + fact_demand_weekly",
    note:
      "Readable here. The 12-week requirement and the manual total reproduce exactly as sums over the BUY_QUANTITY payloads. Both are forward-horizon figures, which is the point of the windows-disagree flag on that row: the trailing window the sentence names sums to a different manual total in fact_demand_weekly.",
  },
};

export type SourceRow = { table: string; count: number };

export function SourceLedger({ sources }: { sources: readonly SourceRow[] }) {
  const columns: Column<SourceRow>[] = [
    {
      key: "pipeline",
      header: "Pipeline source",
      cell: (row) => (
        <span className="font-mono text-[11px] font-bold text-ink">{row.table}</span>
      ),
    },
    {
      key: "rows",
      header: "Rows",
      numeric: true,
      cell: (row) => row.count,
      headerClassName: "w-[70px]",
    },
    {
      key: "app",
      header: "Readable in this app",
      cell: (row) => {
        const known = SOURCE_PROVENANCE[row.table];
        if (!known) return <Pill variant="grey">No note recorded</Pill>;
        return known.appTables === null ? (
          <Pill variant="amber">Not in this schema</Pill>
        ) : (
          <span className="font-mono text-[11px] text-body">{known.appTables}</span>
        );
      },
    },
    {
      key: "note",
      header: "What that means",
      cell: (row) => (
        <span className="text-[11.5px] leading-[1.55] text-body">
          {SOURCE_PROVENANCE[row.table]?.note ??
            "This screen has no note for this source, so it makes no claim about whether the figures can be checked here."}
        </span>
      ),
    },
  ];

  return (
    <Card className="mb-[16px]">
      <CardHeader
        title="Where each sentence came from"
        subtitle="source_table names the batch job's inputs, in the pipeline's names, not this application's"
      />
      <CardBody>
        {/* The claim is one sentence; the audit of the claim is 250 words.
            A reader who wants to check needs all of it, and a reader who
            wants the table needs none of it, so the first sentence stays and
            the rest opens on request. */}
        <Why
          lead="Every figure in the four handoff cards on this screen was read from downstream_handoff at request time, and every row carries the source it was computed from"
          label="what is authored rather than read"
          className="block max-w-[96ch]"
        >
          That column is only worth printing if it tells you whether you could
          go and check -- so this ledger says so. Two of these sources have no
          counterpart in the schema this application reads: the attribute rows
          and the store rows cannot be recomputed on this screen, and are shown
          as what the pipeline recorded rather than as something re-derived
          here.
          <span className="mt-[9px] block">
          Nothing on this screen is a typed-in figure: every number you can read
          was returned by a query or computed here from numbers that were. What
          is authored rather than read is exactly this, and nothing else. One,
          the two maps in the ledgers &mdash; which pipeline source has a
          counterpart in this schema, and where each threshold&apos;s derivation
          is recorded &mdash; both established by reading the catalogue at build
          time. Two, the four function names, their one-line remits and the
          sentence under each saying what the receiving function does with the
          handoff. Three, the word list the editorial scan matches insight text
          against, printed in full where that scan is described. Four, the
          tolerances the recomputation panels judge agreement by &mdash; a unit
          of stock on the pull-forward, a twentieth of a week on the transfers,
          both narrower than the rounding in the rows &mdash; and the second
          test in the completeness panel, that a signal must lead demand by at
          least a week, which is the handoff&apos;s own reason for dismissing a
          zero-week lead rather than a rule this screen invented.
          </span>
        </Why>
        <div className="mt-[14px]">
          <DataTable
            columns={columns}
            rows={sources}
            rowKey={(row) => row.table}
            caption="Handoff source tables and whether they are readable in this application"
            empty="No rows are in scope, so no source is named."
          />
        </div>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------- thresholds

function formatThresholdValue(value: string, unit: ThresholdUse["unit"]): string {
  if (unit === "fraction") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? pct(parsed) : value;
  }
  if (unit === "weeks") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed)
      ? `${parsed} ${parsed === 1 ? "week" : "weeks"}`
      : value;
  }
  return value;
}

const SOURCE_LABEL: Record<ThresholdUse["source"], string> = {
  policy_parameter: "policy_parameter",
  dim_channel: "dim_channel",
  unrecorded: "not recorded anywhere",
};

/**
 * Every threshold a handoff sentence leans on, matched to the row that says
 * how it was chosen.
 *
 * The interesting line is the one with no match. A cut-off that appears in
 * the prose and in no governed table is a number nobody can dispute, because
 * there is nothing recording what it was derived from -- and a category that
 * falls just the wrong side of it is excluded from the calendar on that
 * unexamined basis. Naming the gap is the only thing this screen can do about
 * it, so it names it.
 */
export function ThresholdLedger({ uses }: { uses: readonly ThresholdUse[] }) {
  const ungoverned = uses.filter((use) => use.source === "unrecorded");

  const columns: Column<ThresholdUse>[] = [
    {
      key: "label",
      header: "Threshold",
      cell: (use) => (
        <div>
          <div className="font-bold text-ink">{use.label}</div>
          <div className="font-mono text-[10px] text-mute">{use.key}</div>
        </div>
      ),
    },
    {
      key: "value",
      header: "As quoted",
      cell: (use) => (
        <span className="tabular-nums font-bold text-ink">
          {use.values
            .map((value) => formatThresholdValue(value, use.unit))
            .join(", ")}
        </span>
      ),
    },
    {
      key: "rows",
      header: "Rows",
      numeric: true,
      cell: (use) => use.rowCount,
      headerClassName: "w-[70px]",
    },
    {
      key: "where",
      header: "Derivation recorded in",
      cell: (use) =>
        use.source === "unrecorded" ? (
          <Pill variant="amber">Not recorded</Pill>
        ) : (
          <span className="font-mono text-[11px] text-body">
            {SOURCE_LABEL[use.source]}
          </span>
        ),
    },
    {
      key: "basis",
      header: "How it was chosen",
      cell: (use) => {
        if (use.source === "unrecorded") {
          return (
            <span className="text-[11.5px] leading-[1.55] text-body">
              This cut-off appears inside the handoff rows and in no governed
              table, so nothing on record says how it was chosen or who may
              change it. A category sitting just under it is dropped from the
              campaign calendar on that basis.
            </span>
          );
        }
        if (use.source === "dim_channel") {
          return (
            <span className="text-[11.5px] leading-[1.55] text-body">
              A property of the channel rather than a policy: lead_time_weeks
              on dim_channel, which the pull-forward arithmetic reads directly.
            </span>
          );
        }
        const basis = use.params.find((param) => param.basis)?.basis ?? null;
        return basis ? (
          <span className="text-[11.5px] leading-[1.55] text-body">{basis}</span>
        ) : (
          <span className="text-[11.5px] text-mute">
            The policy row is not readable in your scope, so its derivation is
            not shown.
          </span>
        );
      },
    },
  ];

  return (
    <Card className="mb-[16px]">
      <CardHeader
        title="The thresholds these sentences lean on"
        subtitle="Each cut-off matched to the row that records how it was derived"
        actions={
          ungoverned.length > 0 ? (
            <Pill variant="amber">
              {plural(ungoverned.length, "ungoverned", "ungoverned")}
            </Pill>
          ) : null
        }
      />
      <CardBody>
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          Several of the handoff sentences turn on a threshold: a category is named
          because it fell under an availability floor, a store is named because
          its cover approached a replenishment floor, a signal is dismissed
          because its correlation fell short of a cut. Every one of those
          values is read from the handoff row itself. What differs is whether
          anything records how the value was arrived at.
        </p>
        <div className="mt-[14px]">
          <DataTable
            columns={columns}
            rows={uses}
            rowKey={(use) => use.key}
            caption="Thresholds quoted in the handoff rows and where their derivations are recorded"
            empty="No row in scope quotes a threshold."
          />
        </div>
      </CardBody>
    </Card>
  );
}
