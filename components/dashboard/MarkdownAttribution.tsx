import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components";

import { formatCount, formatCrore, plural } from "./format";
import { ProgressRow } from "./ProgressRow";

/**
 * MarkdownAttribution -- block 7.
 *
 * WHERE THE THREE SHARES COME FROM, AND WHY THEY ARE THE ONE CONSTANT HERE
 * -----------------------------------------------------------------------
 * 45 / 35 / 20 is the case brief's OWN attribution of markdown loss. It is a
 * premise of the exercise, not a measurement this system made: no table in
 * the pilot schema carries it, and inventing a query that happened to return
 * those three numbers would be worse than naming them for what they are. So
 * they live here, in one place, labelled as the case's claim on the card
 * itself, and they are the only figures on this screen that do not come from
 * a query.
 *
 * Everything measured sits beside them: the live count and value at stake of
 * the recommendations this product is currently raising against each driver,
 * read under the planner's own scope. The share drives the bar; the live
 * figures prove the coverage is real rather than asserted.
 */

type Driver = {
  key: string;
  label: string;
  /** The case brief's stated share of markdown loss, as a percentage. */
  casePct: number;
  href: string;
  covers: string;
};

const CASE_ATTRIBUTION: readonly Driver[] = [
  {
    key: "buy",
    label: "Buy quantity",
    casePct: 45,
    href: "/buy",
    covers: "Buy plan",
  },
  {
    key: "allocation",
    label: "Allocation",
    casePct: 35,
    href: "/allocation",
    covers: "Allocation optimiser",
  },
  {
    key: "response",
    label: "Slow in-season response",
    casePct: 20,
    href: "/markdown",
    covers: "Markdown optimiser and exceptions",
  },
];

export type DriverCoverage = {
  /** Open recommendations this product is raising against the driver. */
  openCount: number;
  /** Value at stake across those rows. Null when none carry a value figure. */
  openValueInr: number | null;
};

export type MarkdownAttributionProps = {
  /** Keyed by the driver key above: "buy" | "allocation" | "response". */
  coverage: Readonly<Record<string, DriverCoverage>>;
};

export function MarkdownAttribution({ coverage }: MarkdownAttributionProps) {
  const covered = CASE_ATTRIBUTION.filter(
    (driver) => (coverage[driver.key]?.openCount ?? 0) > 0,
  ).length;

  return (
    <Card>
      <CardHeader
        title="Where markdown comes from"
        subtitle="The case brief's attribution, against what the product now covers"
      />
      <CardBody>
        {CASE_ATTRIBUTION.map((driver) => {
          const live = coverage[driver.key];
          return (
            <ProgressRow
              key={driver.key}
              label={driver.label}
              value={`${driver.casePct}% of loss`}
              fraction={driver.casePct / 100}
              note={
                <>
                  Covered by{" "}
                  <Link
                    href={driver.href}
                    className="font-bold text-orangeD underline decoration-peach underline-offset-2 hover:decoration-orange"
                  >
                    {driver.covers}
                  </Link>
                  {live && live.openCount > 0 ? (
                    <>
                      {" "}
                      &middot; {formatCount(live.openCount)} open{" "}
                      {plural(
                        live.openCount,
                        "recommendation",
                        "recommendations",
                      )}{" "}
                      in your scope
                      {live.openValueInr === null ? (
                        <>, scored in percentage points rather than rupees</>
                      ) : (
                        <> carrying {formatCrore(live.openValueInr)}</>
                      )}
                    </>
                  ) : (
                    <> &middot; nothing open in your scope right now</>
                  )}
                </>
              }
            />
          );
        })}
        <p className="mt-[12px] max-w-[72ch] text-[11.5px] font-semibold leading-[1.6] text-mute">
          The three shares are the case brief&rsquo;s own attribution of
          markdown loss and are the one set of figures on this screen that is
          not read from the database; no table carries them. All three drivers
          are covered by a screen that can act on them, and {covered} of{" "}
          {CASE_ATTRIBUTION.length} currently have open work in your scope.
        </p>
      </CardBody>
    </Card>
  );
}

export { CASE_ATTRIBUTION };
export default MarkdownAttribution;
