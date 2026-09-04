import { Card, CardBody, CardHeader } from "@/components";

import { formatCeiling, type BandTally } from "./model";

/**
 * Portfolio movement -- the shape of the whole board, not just the open cell.
 *
 * Ports `.arow` / `.bar`: a labelled count over a single proportional bar.
 * The split that matters is autonomous against escalated, so it leads, and
 * the escalated rows are then broken by direction because "nine regions are
 * being emptied" and "nine regions are being filled" are different weeks.
 *
 * The denominator is what row level security returned, and the footnote says
 * so. A planner scoped to one region sees a smaller board than a category
 * manager, and that is the system working: widening the count by reading
 * past the caller's scope would make the number bigger and the product
 * dishonest.
 */

type MovementRow = {
  label: string;
  count: number;
  fill: string;
};

export type PortfolioMovementProps = {
  counts: BandTally;
  total: number;
  ceilingPp: number | null;
  /** Rows whose payload carried no readable split. */
  unreadable: number;
};

export function PortfolioMovement({
  counts,
  total,
  ceilingPp,
  unreadable,
}: PortfolioMovementProps) {
  const rows: MovementRow[] = [
    {
      label:
        ceilingPp === null
          ? "Inside a band (none published)"
          : `Executed by the agent, under ${formatCeiling(ceilingPp)}`,
      count: counts.within,
      fill: "bg-violet",
    },
    { label: "Escalated, shift in", count: counts.escalatedShiftIn, fill: "bg-green" },
    { label: "Escalated, shift out", count: counts.escalatedShiftOut, fill: "bg-red" },
  ];

  if (counts.escalatedOther > 0) {
    rows.push({
      label: "Escalated, held at current share",
      count: counts.escalatedOther,
      fill: "bg-[#C9BDB2]",
    });
  }

  return (
    <Card>
      <CardHeader
        title="Portfolio movement"
        subtitle={`${total} category ${String.fromCharCode(0xd7)} channel ${String.fromCharCode(
          0xd7,
        )} region cells in your scope`}
      />
      <CardBody>
        {total === 0 ? (
          <p className="text-[12.5px] leading-[1.6] text-body">
            Nothing in scope to move.
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.label}
              className="border-b border-rule py-[11px] last:border-b-0"
            >
              <div className="mb-[7px] flex items-center justify-between gap-[10px] text-[12px]">
                <span className="font-bold text-ink">{row.label}</span>
                <b className="font-extrabold tabular-nums text-ink">{row.count}</b>
              </div>
              <div className="h-[8px] overflow-hidden rounded-pill bg-cream">
                <i
                  className={`block h-full rounded-pill ${row.fill}`}
                  style={{ width: `${(row.count / total) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}

        <div className="mt-[12px] text-[11.5px] font-semibold leading-[1.6] text-mute">
          Counted over the rows row level security returned to you, which is
          your brand plus your region and the categories you own. A colleague
          with a different scope sees a different denominator, and neither
          number is the portfolio&apos;s.
          {unreadable > 0
            ? ` ${unreadable} row${unreadable === 1 ? "" : "s"} carried no readable split and ${
                unreadable === 1 ? "is" : "are"
              } left off rather than drawn as zero.`
            : ""}
        </div>
      </CardBody>
    </Card>
  );
}

export default PortfolioMovement;
