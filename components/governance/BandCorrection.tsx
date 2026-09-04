import { Card, CardBody, CardHeader, DataTable, Pill } from "@/components";
import type { Column } from "@/components";
import type { AutonomyBand, PolicyParameter } from "@/lib/queries";

import { BAND_ROUNDING_TOLERANCE_PP } from "./constants";
import { Muted, Quote } from "./Layout";
import {
  quotedBandInr,
  quotedBandPp,
  quotesDifferentValueBand,
  quotesSupersededBand,
  type LedgerEntry,
} from "./data";
import {
  ARROW,
  DASH,
  MIDDOT,
  formatBandPp,
  formatCount,
  formatDate,
  formatInr,
  formatTimestamp,
  plural,
} from "./format";

/**
 * THE BAND MOVED. THE LEDGER DID NOT.
 *
 * Most of the allocation agent's rows carry override_reason text that reads
 * "...inside the 2.0pp band...". The band is not 2.0pp any more: it is
 * 1.25pp for Speed and 1.12pp for Eco, each derived from the 25th
 * percentile of the share shifts that brand actually proposes.
 *
 * The obvious move is to hide those rows, or to rewrite them, or to filter
 * the panel down to the ones that agree with today's number. All three are
 * wrong, and the reason they are wrong is the reason this panel exists.
 * planner_decision is append-only. A row records what was true when it was
 * written, and on the day it was written the band WAS 2.0pp and the agent
 * WAS inside it. Editing the row would make the ledger agree with the
 * present at the cost of the only property that makes it evidence.
 *
 * So the correction is a ROW, not an edit. policy_parameter carries
 * allocation_band_pp per brand with computed_value, applied_value, the
 * derivation in `basis`, and an override_reason that records what was
 * superseded and why. This panel puts that row beside the count of ledger
 * entries still quoting the old number, and the pair is the whole argument:
 * you do not edit the past, you record what changed, and the trail explains
 * itself to the next person who reads it.
 *
 * HOW THE STALE ROWS ARE FOUND
 * ----------------------------
 * By reading the figure out of the reason text and comparing it with the
 * band in force -- never by searching for the literal string "2.0pp". A
 * hardcoded "2.0" would stop finding anything the next time the band moved
 * and would report a confident zero. See quotedBandPp() in data.ts.
 */

export type BandVintage = {
  /** The band width the reason text quotes, to the precision it quotes it. */
  quoted: number;
  count: number;
  superseded: boolean;
  firstAt: string | null;
  lastAt: string | null;
};

export type BrandCorrection = {
  brandId: string;
  /** The policy_parameter row that records the change. Null if unreadable. */
  policy: PolicyParameter | null;
  /** The band in force now, from autonomy_band.max_shift_pp. */
  inForce: number | null;
  bandOwnerName: string | null;
  vintages: BandVintage[];
  /** Ledger rows quoting a percentage-point band, the ones tabled above. */
  quotingRows: number;
  supersededRows: number;
  /** The rupee band in force for this brand's exception agent. */
  valueInForce: number | null;
  /** Rows quoting a rupee band, and how many quote a different figure. */
  valueQuotingRows: number;
  valueDifferentRows: number;
};

/**
 * Group the agent rows that quote a band, per brand, and mark which of the
 * figures they quote are superseded.
 *
 * Both kinds of quoted band are collected. The percentage-point ones are
 * tabled, because a policy_parameter row records what happened to them; the
 * rupee ones are counted and explained, because nothing was superseded
 * there -- that band is a median that moves with the queue. A panel that
 * silently ignored the rupee rows would leave a reader wondering whether it
 * had missed them.
 */
export function buildCorrections(
  entries: readonly LedgerEntry[],
  policies: readonly PolicyParameter[],
  bands: readonly AutonomyBand[],
  ownerNames: Map<string, string>,
): BrandCorrection[] {
  const byBrand = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    if (entry.actorType !== "agent") continue;
    if (quotedBandPp(entry) === null && quotedBandInr(entry) === null) continue;
    const brand = entry.brandId ?? "";
    const list = byBrand.get(brand);
    if (list) list.push(entry);
    else byBrand.set(brand, [entry]);
  }

  const out: BrandCorrection[] = [];
  for (const [brandId, all] of byBrand) {
    const rows = all.filter((row) => quotedBandPp(row) !== null);
    const valueRows = all.filter((row) => quotedBandInr(row) !== null);

    const band =
      bands.find(
        (b) => b.brand_id === brandId && b.max_shift_pp !== null && b.max_shift_pp > 0,
      ) ?? null;
    const inForce = band?.max_shift_pp ?? null;

    // The rupee band belongs to a different agent, so it is looked up on its
    // own band row rather than assumed to sit on the allocation one.
    const valueBand =
      bands.find(
        (b) => b.brand_id === brandId && b.max_value_inr !== null && b.max_value_inr > 0,
      ) ?? null;
    const valueInForce = valueBand?.max_value_inr ?? null;

    const counts = new Map<number, LedgerEntry[]>();
    for (const row of rows) {
      const quoted = quotedBandPp(row);
      if (quoted === null) continue;
      const list = counts.get(quoted);
      if (list) list.push(row);
      else counts.set(quoted, [row]);
    }

    const vintages: BandVintage[] = [...counts.entries()]
      .map(([quoted, list]) => {
        const times = list
          .map((row) => row.decidedAt)
          .filter((value): value is string => typeof value === "string")
          .sort();
        return {
          quoted,
          count: list.length,
          superseded: quotesSupersededBand(quoted, inForce),
          firstAt: times[0] ?? null,
          lastAt: times.at(-1) ?? null,
        };
      })
      .sort((a, b) => b.quoted - a.quoted);

    out.push({
      brandId,
      policy:
        policies.find(
          (p) => p.param_name === "allocation_band_pp" && p.brand_id === brandId,
        ) ?? null,
      inForce,
      bandOwnerName: band?.owner_employee_id
        ? (ownerNames.get(band.owner_employee_id) ?? band.owner_employee_id)
        : null,
      vintages,
      quotingRows: rows.length,
      supersededRows: vintages
        .filter((v) => v.superseded)
        .reduce((sum, v) => sum + v.count, 0),
      valueInForce,
      valueQuotingRows: valueRows.length,
      valueDifferentRows: valueRows.filter((row) =>
        quotesDifferentValueBand(quotedBandInr(row), valueInForce),
      ).length,
    });
  }

  return out.sort((a, b) => a.brandId.localeCompare(b.brandId));
}

const VINTAGE_COLUMNS: ReadonlyArray<Column<BandVintage>> = [
  {
    key: "band",
    header: "Band quoted in the row",
    cell: (row) => (
      <span className="font-extrabold tabular">{formatBandPp(row.quoted, 1)}</span>
    ),
  },
  {
    key: "state",
    header: "Against the band in force",
    cell: (row) =>
      row.superseded ? (
        <Pill variant="amber">Superseded</Pill>
      ) : (
        <Pill variant="up">Current, written shorter</Pill>
      ),
  },
  {
    key: "count",
    header: "Ledger entries",
    numeric: true,
    cell: (row) => formatCount(row.count),
  },
  {
    key: "window",
    header: "Written between",
    cell: (row) =>
      row.firstAt === null ? (
        DASH
      ) : (
        <span className="text-mute font-semibold">
          {formatTimestamp(row.firstAt)}
          {row.lastAt && row.lastAt !== row.firstAt
            ? ` ${ARROW} ${formatTimestamp(row.lastAt)}`
            : ""}
        </span>
      ),
  },
];

function BrandPanel({ correction }: { correction: BrandCorrection }) {
  const { policy } = correction;

  return (
    <div className="border-b border-rule px-[20px] py-[18px] last:border-b-0">
      <div className="mb-[10px] flex flex-wrap items-center gap-[9px]">
        <h4 className="text-h3 font-extrabold text-ink">{correction.brandId}</h4>
        <Pill variant="violet" tabular>
          band in force {formatBandPp(correction.inForce)}
        </Pill>
        {correction.supersededRows > 0 ? (
          <Pill variant="amber" tabular>
            {formatCount(correction.supersededRows)} entries quote the old one
          </Pill>
        ) : null}
        {correction.bandOwnerName ? (
          <span className="text-small font-semibold text-mute">
            {MIDDOT} owned by {correction.bandOwnerName}
          </span>
        ) : null}
      </div>

      <DataTable
        columns={VINTAGE_COLUMNS}
        rows={correction.vintages}
        rowKey={(row) => `${correction.brandId}-${row.quoted}`}
        caption={`Band widths quoted in ${correction.brandId} allocation agent decision rows`}
        empty="No allocation-agent row in your scope quotes a band."
      />

      {policy ? (
        <div className="mt-[14px]">
          <Muted className="mb-[6px]">
            The corrective row, from{" "}
            <span className="font-mono text-[11px] text-ink">
              policy_parameter.allocation_band_pp
            </span>{" "}
            {MIDDOT} set by{" "}
            <span className="font-bold text-ink">{policy.set_by ?? "unrecorded"}</span>{" "}
            {MIDDOT} recorded {formatDate(policy.set_at)}
          </Muted>

          <dl className="mb-[10px] grid grid-cols-[auto_auto] justify-start gap-x-[18px] gap-y-[4px] text-copy">
            <dt className="font-semibold text-mute">Computed</dt>
            <dd className="font-extrabold text-ink tabular">
              {formatBandPp(policy.computed_value)}
            </dd>
            <dt className="font-semibold text-mute">Applied</dt>
            <dd className="font-extrabold text-ink tabular">
              {formatBandPp(policy.applied_value)}
            </dd>
          </dl>

          <Quote className="mb-[8px]">
            <span className="font-bold text-ink">Basis. </span>
            {policy.basis}
          </Quote>
          {policy.override_reason ? (
            <Quote>
              <span className="font-bold text-ink">What changed. </span>
              {policy.override_reason}
            </Quote>
          ) : null}
        </div>
      ) : (
        <Muted className="mt-[12px]">
          No allocation_band_pp row is readable for {correction.brandId}, so the
          band above is shown from autonomy_band alone and this panel cannot
          say what it superseded. policy_parameter is readable to any
          authenticated user by policy, so this would mean the row is genuinely
          absent rather than hidden from you.
        </Muted>
      )}

      {correction.valueQuotingRows > 0 ? (
        <Muted className="mt-[12px] max-w-[92ch]">
          <span className="font-bold text-ink">The other band, and why it is not in that table. </span>
          The exception agent writes a RUPEE band into its reasons the same way:{" "}
          <span className="tabular text-ink">
            {formatCount(correction.valueQuotingRows)}
          </span>{" "}
          of your {correction.brandId} entries quote one, and{" "}
          <span className="tabular text-ink">
            {formatCount(correction.valueDifferentRows)}
          </span>{" "}
          of those name a figure other than the{" "}
          <span className="tabular text-ink">
            {formatInr(correction.valueInForce)}
          </span>{" "}
          in force.{" "}
          {correction.valueDifferentRows === 0
            ? "None of them names a different figure."
            : // WHAT IS KNOWN, AND WHAT IS NOT.
              //
              // This sentence used to explain the gap away: the rupee band is
              // the median open exception, recomputed each run, so it moves
              // with the queue and nothing was overturned. The first half is
              // the band's own stated derivation and is true. The second half
              // -- that therefore no threshold changed -- is an assertion
              // about pipeline behaviour that nothing in this database
              // records, and it happens to be the reading that makes the gap
              // go away. That is exactly the kind of claim this screen exists
              // to refuse.
              "Whether those rows are stale is not recorded. The band's stated derivation is the median open exception for the brand, which moves when the queue moves -- so a different figure may mean the median shifted rather than that anyone changed a threshold. But no row anywhere records when this band changed or why, unlike the allocation band above, which carries a policy_parameter entry naming what it superseded and on what date. Without that, the honest statement is the count and the gap: these rows quote a different figure, and the trail does not say which of the two explanations applies."}
        </Muted>
      ) : null}
    </div>
  );
}

export function BandCorrection({
  corrections,
}: {
  corrections: readonly BrandCorrection[];
}) {
  const stale = corrections.reduce((sum, c) => sum + c.supersededRows, 0);
  const quoting = corrections.reduce((sum, c) => sum + c.quotingRows, 0);

  return (
    <Card>
      <CardHeader
        title="The band moved. The ledger did not."
        subtitle="A superseded threshold, corrected by a row rather than an edit"
      />
      <CardBody className="border-b border-rule">
        <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
          {quoting === 0 ? (
            <>
              None of the agent entries you can read quotes a percentage-point
              band in its reason text, so there is nothing here to reconcile.
              Where they do -- the allocation agent writes the band it acted
              inside into every reason -- this panel compares the figure in the
              text with the band in force and shows the policy row that records
              any change.
            </>
          ) : (
            <>
              {plural(stale, "entry", "entries")} in your scope
              {stale === 1 ? " quotes" : " quote"} a share-shift band that is no
              longer the one in force, out of {formatCount(quoting)} that quote
              a percentage-point band at all.{" "}
              <span className="font-bold text-ink">
                Those rows are correct history and they have not been touched.
              </span>{" "}
              The band was wider when they were written and the agent was
              genuinely inside it; the band is narrower now because it was
              re-derived from the shift distribution rather than chosen as a
              round number. Both figures are in the table below, read from the
              rows themselves. planner_decision is append-only, so the correction
              is recorded as its own row in policy_parameter and printed
              underneath each brand below. That is the property worth having:
              you do not edit the past, you record what changed, and the trail
              explains itself to whoever reads it next.
            </>
          )}
        </p>
        <Muted className="mt-[10px]">
          Stale rows are found by reading the figure out of the reason text and
          comparing it with autonomy_band.max_shift_pp, never by searching for
          the literal string &ldquo;2.0pp&rdquo; -- a hardcoded number would
          report a confident zero the next time the band moved. The agent writes
          the band to one decimal place, so a quoted figure within{" "}
          <span className="tabular text-ink">
            {BAND_ROUNDING_TOLERANCE_PP.toFixed(2)}pp
          </span>{" "}
          of the band in force is treated as the same band written shorter
          rather than as a superseded one, which is how the newest entries --
          written after the change, quoting the new band to one decimal --
          stay out of the superseded count.
        </Muted>
      </CardBody>

      {corrections.length === 0 ? (
        <CardBody>
          <Muted>
            No allocation-agent entries are readable in your scope, so there are
            no band vintages to compare. This panel would list, per brand, every
            band width quoted in the ledger, which of them are superseded, and
            the policy_parameter row recording the change.
          </Muted>
        </CardBody>
      ) : (
        corrections.map((correction) => (
          <BrandPanel key={correction.brandId} correction={correction} />
        ))
      )}
    </Card>
  );
}
