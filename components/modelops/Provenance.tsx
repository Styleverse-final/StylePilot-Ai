import { Card, CardBody, CardHeader, Pill, Why } from "@/components";

import { UNTABLED } from "./constants";
import { plural } from "./format";

/**
 * PROVENANCE -- the panel that makes the exhaustiveness claim checkable.
 *
 * A screen that says "every figure here comes from a query" is making a claim
 * the reader cannot verify without reading the source. A screen that says
 * "every figure comes from a query EXCEPT these three, and here they are with
 * the files they live in" is making a claim the reader can check in about a
 * minute, which is the only kind worth making.
 *
 * The count and the list are both generated from UNTABLED in ./constants, so
 * the sentence cannot go stale: adding an untabled figure adds a row here,
 * and removing one removes it. A false provenance claim is worse than a
 * missing one, because it stops the reader checking at all.
 */

export function Provenance() {
  const count = UNTABLED.length;

  return (
    <Card className="mb-[16px]">
      <CardHeader
        title="Where these numbers come from"
        subtitle="Read at request time under your own row level security"
        actions={
          <Pill variant="violet">
            {count} {plural(count, "figure")} without a table
          </Pill>
        }
      />
      <CardBody>
        <Why
          lead="Every accuracy, benchmark, coverage figure, threshold, escalation count and timestamp on this screen is selected from Postgres when the page renders"
          label="under whose permissions"
          className="block max-w-[92ch]"
        >
          It is read through the anon client carrying your session cookie
          &mdash; so row level security decides what you see, and a figure you
          cannot read simply is not here. The model is scored offline in batch;
          nothing on this page calls a model, and there is no prediction
          endpoint behind it.
        </Why>
        <p className="mt-[9px] max-w-[92ch] text-copy leading-[1.6] text-body">
          <b className="text-ink">
            {count} {plural(count, "figure is", "figures are")} authored rather
            than read, and {count === 1 ? "it is" : "they are"} listed below
            with the file {count === 1 ? "it lives" : "each lives"} in.
          </b>{" "}
          The list is generated from the constants those panels render from, so
          it cannot drift from THOSE figures. It is not a proof that nothing
          else on the page is a literal: a number typed directly into a
          sentence elsewhere would not appear here, and at least one has. The
          earlier wording called these all of them, which claimed a page-wide
          guarantee this list does not have.
        </p>

        <div className="mt-[13px]">
          {UNTABLED.map((figure) => (
            <div
              key={figure.id}
              className="border-b border-rule py-[12px] last:border-b-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
                <span className="text-copy font-extrabold text-ink">
                  {figure.label}
                </span>
                <span className="rounded-pill bg-cream px-[9px] py-[3px] font-mono text-[10px] font-bold text-body">
                  {figure.source}
                </span>
              </div>
              <div className="mt-[3px] max-w-[96ch] text-copy font-semibold leading-[1.6] text-ink2">
                {figure.value}
              </div>
              <p className="mt-[3px] max-w-[96ch] text-small font-semibold leading-[1.6] text-mute">
                {figure.why}
              </p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

export default Provenance;
