import { Card, CardBody, CardHeader } from "@/components";

import { PROGRAMME_TAG, ROADMAP, ROADMAP_SOURCE } from "./constants";

/**
 * SIX-MONTH BUILD.
 *
 * The only panel on this screen where nothing is measured, and it says so in
 * its own first line rather than in a caption underneath. It is a delivery
 * plan: no table in the pilot schema holds a phase, a wave size or a
 * programme budget, so there is nothing to read and nothing to check. It is
 * transcribed from the visual specification rather than paraphrased, so what
 * you see is what that document says.
 *
 * It is deliberately the LAST card on the screen. Every measured figure sits
 * above it, so a reader who stops before reaching this one has still seen
 * everything that came out of a query.
 *
 * Ports `.phase` and `.pnum`: an 88px period column, a bold title and a body
 * line, ruled between rows.
 */

export function Roadmap() {
  return (
    <Card>
      <CardHeader
        title="Six-month build"
        subtitle="Pilot in production at month 2, full capability at month 6"
        actions={
          <span className="rounded-pill bg-cream px-[12px] py-[5px] text-small font-semibold text-body whitespace-nowrap">
            {PROGRAMME_TAG}
          </span>
        }
      />
      <CardBody>
        <p className="mb-[12px] max-w-[92ch] rounded-quote bg-shell px-[14px] py-[11px] text-copy leading-[1.6] text-body">
          <b className="text-ink">Nothing on this card is measured.</b> It is a
          plan, transcribed verbatim from{" "}
          <span className="font-mono text-[10.5px]">{ROADMAP_SOURCE}</span>{" "}
          &mdash; the phase descriptions, both wave sizes and the two rupee
          figures in the tag above. The pilot schema has no table for a
          delivery date, a wave size or a programme budget, so there is nothing
          here for a query to return and nothing here you can check against a
          row. Everything above this card came out of one.
        </p>

        <div>
          {ROADMAP.map((phase) => (
            <div
              key={phase.period}
              className="grid grid-cols-[88px_1fr] gap-[14px] border-b border-rule py-[13px] last:border-b-0"
            >
              <div className="pt-[2px] text-label font-extrabold text-orange">
                {phase.period}
              </div>
              <div>
                <div className="mb-[2px] text-copy font-extrabold text-ink">
                  {phase.title}
                </div>
                <div className="max-w-[92ch] text-copy leading-[1.6] text-body">
                  {phase.detail}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-[12px] max-w-[92ch] text-small font-semibold leading-[1.6] text-mute">
          Where this build has already reached: months 1 and 2 are what the
          registry, the policy table and this application are evidence of, and
          month 5 is what{" "}
          <span className="font-mono text-[10.5px]">agent_run</span> is evidence
          of. The rest is a plan and is drawn as one.
        </p>
      </CardBody>
    </Card>
  );
}

export default Roadmap;
