import { Card, CardBody, CardHeader, Pill } from "@/components";

import type { PolicyParameter } from "./data";
import { fixed, humanise, pct, plural, timestamp, toNumber } from "./format";

/**
 * POLICY PARAMETER, AS AN AUDIT SURFACE.
 *
 * Every threshold the recommendation system resolves through is a row here,
 * and every row carries six things: what the derivation produced, what is
 * actually running, the derivation itself, the reason for any gap between
 * the two, who set it and when. This panel renders all six for every row.
 *
 * WHY THE OVERRIDES LEAD RATHER THAN HIDE
 * ---------------------------------------
 * The most interesting row on this screen is service_level. The newsvendor
 * ratio computes 0.5682 for SpeedStyle from the brand's own unit economics,
 * and the value in force is 0.85. That gap is not an embarrassment and it is
 * not a bug: the two-cost ratio prices an unsold unit at one markdown and
 * stops, and never prices the customer who found the shelf empty. Planning
 * holds the higher level until the cost of a lost customer is measured
 * rather than assumed, and the row says so in its own words.
 *
 * A system that hid that gap would be claiming its thresholds are purely
 * derived, which is false of every planning system ever built. A system that
 * showed the applied value alone would be hiding the derivation. This shows
 * both, side by side, with the reason attached -- which is what makes a
 * threshold arguable instead of merely enforced.
 *
 * Nothing is hardcoded: the override flag is computed in lib/queries from the
 * two stored values, and the "clearest example" below is chosen from the rows
 * rather than named in the source. See headlineOverride for the rule.
 */

/**
 * The one param_name this file refers to by name, and only to explain that
 * its two columns do not mean what they mean on every other row. It is a
 * name, not a number: the figures still come from the row.
 */
const MEASUREMENT_PARAM = "interval_coverage_calibrated";

/** How far applied departs from computed, as a share of the derivation. */
function gapShare(parameter: PolicyParameter): number | null {
  const computed = toNumber(parameter.computed_value);
  const applied = toNumber(parameter.applied_value);
  if (computed === null || applied === null || computed === 0) return null;
  return Math.abs(applied - computed) / Math.abs(computed);
}

/**
 * How many OTHER thresholds on the same brand cite this one by name, in
 * their own derivation or in the reason for their own override.
 *
 * This is the whole selection rule, and it is a claim about importance that
 * the rows can settle. A threshold nothing else names is a local decision:
 * a cover ceiling capped at half a category's merchandisable life has a
 * proportionally enormous gap between derivation and applied value, and
 * changing it moves one category. A threshold other rows are computed FROM
 * is a decision the rest of the policy layer inherits, and changing it moves
 * everything downstream of it. Ranking on the gap alone would lead with the
 * widest arithmetic rather than the widest consequence.
 */
function citedByOthers(
  parameter: PolicyParameter,
  parameters: readonly PolicyParameter[],
): number {
  return parameters.filter((other) => {
    if (other.id === parameter.id) return false;
    if (other.brand_id !== parameter.brand_id) return false;
    return `${other.basis ?? ""} ${other.override_reason ?? ""}`.includes(
      parameter.param_name,
    );
  }).length;
}

/**
 * The override worth leading with: among rows running at a value their
 * derivation did not produce AND carrying a stated reason, the one the most
 * other thresholds are derived from, and where that ties, the one whose
 * applied value departs furthest from its derivation.
 *
 * Chosen from the rows, so a changed policy table changes the example and
 * nothing in this file has to be edited to keep up with it.
 */
export function headlineOverride(
  parameters: readonly PolicyParameter[],
): PolicyParameter | null {
  const candidates = parameters.filter(
    (parameter) => parameter.is_overridden && parameter.override_reason,
  );

  let best: PolicyParameter | null = null;
  let bestCited = -1;
  let bestGap = -1;

  for (const parameter of candidates) {
    const gap = gapShare(parameter);
    if (gap === null) continue;
    const cited = citedByOthers(parameter, parameters);
    if (cited > bestCited || (cited === bestCited && gap > bestGap)) {
      best = parameter;
      bestCited = cited;
      bestGap = gap;
    }
  }
  return best;
}

function Value({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "computed" | "applied";
}) {
  return (
    <div>
      <div className="text-label font-bold text-mute">{label}</div>
      <div
        className={`mt-[1px] text-hero font-extrabold tabular ${
          tone === "applied" ? "text-orangeD" : "text-mute line-through decoration-rule2"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ParameterRow({ parameter }: { parameter: PolicyParameter }) {
  const computed = toNumber(parameter.computed_value);
  const applied = toNumber(parameter.applied_value);
  const overridden = parameter.is_overridden;

  return (
    <details
      className={`group border-b border-rule last:border-b-0 ${
        overridden ? "bg-amberW/35" : ""
      }`}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-[14px] gap-y-[6px] px-[20px] py-[12px] hover:bg-shell">
        <span
          aria-hidden="true"
          className={`h-[26px] w-[3px] shrink-0 rounded-pill ${
            overridden ? "bg-amber" : "bg-rule2"
          }`}
        />
        <span className="min-w-[230px] flex-1">
          <span className="block font-mono text-[11.5px] font-bold text-ink">
            {parameter.param_name}
          </span>
          <span className="block text-small font-semibold text-mute">
            {parameter.brand_id ?? "all brands"} &middot; set by{" "}
            {parameter.set_by ?? "unrecorded"} &middot; {timestamp(parameter.set_at)}
          </span>
        </span>

        <span className="flex items-center gap-[9px] tabular">
          <span className="text-right">
            <span className="block text-label font-bold text-mute">computed</span>
            <span
              className={`block text-copy font-extrabold ${
                overridden ? "text-mute" : "text-ink"
              }`}
            >
              {fixed(computed, 4)}
            </span>
          </span>
          <span aria-hidden="true" className="text-mute">
            &rarr;
          </span>
          <span className="text-right">
            <span className="block text-label font-bold text-mute">applied</span>
            <span
              className={`block text-copy font-extrabold ${
                overridden ? "text-orangeD" : "text-ink"
              }`}
            >
              {fixed(applied, 4)}
            </span>
          </span>
        </span>

        <span className="w-[112px] text-right">
          {overridden ? (
            <Pill variant="amber">overridden</Pill>
          ) : computed === null || applied === null ? (
            <Pill variant="grey">incomplete</Pill>
          ) : (
            <Pill variant="up">as derived</Pill>
          )}
        </span>
      </summary>

      <div className="px-[20px] pb-[16px] pl-[37px]">
        <div className="text-label font-bold text-mute">Basis</div>
        <p className="mt-[3px] max-w-[100ch] text-copy leading-[1.65] text-body">
          {parameter.basis}
        </p>

        {parameter.override_reason ? (
          <>
            <div className="mt-[11px] text-label font-bold text-amber">
              Why the applied value differs
            </div>
            <p className="mt-[3px] max-w-[100ch] text-copy leading-[1.65] text-body">
              {parameter.override_reason}
            </p>
          </>
        ) : overridden ? (
          <p className="mt-[11px] max-w-[100ch] text-copy leading-[1.65] text-red">
            The applied value differs from the derivation and no reason is
            recorded on the row. That is the one shape this table treats as a
            defect rather than as governance.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export type PolicyAuditProps = {
  parameters: readonly PolicyParameter[];
  brandNames: Record<string, string>;
};

export function PolicyAudit({ parameters, brandNames }: PolicyAuditProps) {
  const overridden = parameters.filter((parameter) => parameter.is_overridden);
  const unexplained = overridden.filter((parameter) => !parameter.override_reason);
  const headline = headlineOverride(parameters);
  const headlineCited =
    headline === null ? 0 : citedByOthers(headline, parameters);

  // Rows where computed and applied are a MEASUREMENT against its target
  // rather than a derivation against an override. They trip the same flag,
  // and left unexplained the reader would take the nominal for the number in
  // force -- which on the coverage row is precisely the trap this screen
  // exists to close.
  const measurement = parameters.filter(
    (parameter) => parameter.param_name === MEASUREMENT_PARAM,
  );

  // Overrides first, then alphabetically, so the rows that carry the
  // governance story are the ones you land on.
  const ordered = [...parameters].sort((a, b) => {
    if (a.is_overridden !== b.is_overridden) return a.is_overridden ? -1 : 1;
    const name = a.param_name.localeCompare(b.param_name);
    return name !== 0 ? name : (a.brand_id ?? "").localeCompare(b.brand_id ?? "");
  });

  return (
    <Card>
      <CardHeader
        title="Policy parameters, audited"
        subtitle="What the derivation produced, what is running, and who decided the difference"
        actions={
          <Pill variant={overridden.length > 0 ? "amber" : "up"}>
            {overridden.length} of {parameters.length} overridden
          </Pill>
        }
      />

      <CardBody>
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">
          Every threshold the recommendation engine resolves through is a row
          in <span className="font-mono text-[11px] font-bold">policy_parameter</span>,
          and every row carries its own derivation. {parameters.length}{" "}
          {plural(parameters.length, "row")} across{" "}
          {[...new Set(parameters.map((p) => p.brand_id))].length}{" "}
          {plural([...new Set(parameters.map((p) => p.brand_id))].length, "brand")}
          {overridden.length > 0 ? (
            <>
              , of which <b className="text-ink">{overridden.length}</b> run at
              a value the derivation did not produce. Those are the interesting
              ones and they are sorted to the top, tinted, and expandable to
              the reason recorded against them.
            </>
          ) : (
            <>, all of them running exactly at their derived value.</>
          )}{" "}
          The override flag is computed from the two stored values rather than
          set by hand, so a row cannot be quietly reclassified.
        </p>

        {unexplained.length > 0 ? (
          <p className="mt-[10px] max-w-[92ch] text-copy leading-[1.6] text-red">
            {unexplained.length}{" "}
            {plural(unexplained.length, "row runs", "rows run")} at an
            overridden value with no reason recorded. A threshold whose
            departure from its derivation is undocumented is the one thing this
            table is meant to make impossible to miss.
          </p>
        ) : overridden.length > 0 ? (
          <p className="mt-[10px] max-w-[92ch] text-copy leading-[1.6] text-body">
            Every overridden row carries a written reason. An override with a
            reason is governance; an override without one is drift, and there
            is none of the second kind here.
          </p>
        ) : null}

        {measurement.length === 0 ? null : (
          <p className="mt-[10px] max-w-[92ch] text-copy leading-[1.6] text-body">
            <b className="text-ink">
              Not every flagged row is an override, and{" "}
              <span className="font-mono text-[11px]">{MEASUREMENT_PARAM}</span>{" "}
              is the exception.
            </b>{" "}
            On {plural(measurement.length, "that row", "those rows")} the two
            columns are a measurement and its target, not a derivation and a
            decision:{" "}
            {measurement.map((row, index) => (
              <span key={row.id}>
                {index > 0 ? ", " : ""}
                {row.brand_id ?? "all brands"} measured{" "}
                <b className="tabular text-ink">{pct(row.computed_value)}</b>{" "}
                against the{" "}
                <b className="tabular text-ink">{pct(row.applied_value, 0)}</b>{" "}
                nominal
              </span>
            ))}
            . The band actually in force is the measured one; the nominal is
            what it is judged against. The flag fires because the two stored
            values differ, which they must, and it is explained here rather
            than left to read as a threshold somebody moved.
          </p>
        )}
      </CardBody>

      {headline === null ? null : (
        <CardBody className="border-t border-rule">
          <div className="rounded-inner bg-amberW px-[18px] py-[16px]">
            <div className="mb-[3px] text-label font-bold text-amber">
              The most interesting row on this screen
            </div>
            <div className="mb-[10px] flex flex-wrap items-baseline gap-[9px]">
              <span className="font-mono text-[13px] font-extrabold text-ink">
                {headline.param_name}
              </span>
              <span className="text-small font-semibold text-mute">
                {brandNames[headline.brand_id ?? ""] ?? headline.brand_id ?? "all brands"}{" "}
                &middot; {humanise(headline.set_by ?? "unrecorded")} &middot;{" "}
                {timestamp(headline.set_at)}
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-[22px]">
              {/* Labelled from the row, not from the parameter: the basis
                  below names the derivation, so this slot must not assert
                  which derivation it was. */}
              <Value
                label="What the derivation produced"
                value={fixed(headline.computed_value, 4)}
                tone="computed"
              />
              <span aria-hidden="true" className="pb-[6px] text-hero text-mute">
                &rarr;
              </span>
              <Value
                label="Value actually in force"
                value={fixed(headline.applied_value, 4)}
                tone="applied"
              />
            </div>

            <p className="mt-[12px] max-w-[96ch] text-copy leading-[1.65] text-body">
              <b className="text-ink">Basis.</b> {headline.basis}
            </p>
            {headline.override_reason ? (
              <p className="mt-[8px] max-w-[96ch] text-copy leading-[1.65] text-body">
                <b className="text-ink">Why it was overridden.</b>{" "}
                {headline.override_reason}
              </p>
            ) : null}
            <p className="mt-[10px] max-w-[96ch] text-small font-semibold leading-[1.6] text-mute">
              A parameter whose applied value differs from its derivation is
              the strongest evidence on this screen that the system is
              governed rather than merely computed. It is shown with both
              numbers and the reason, not resolved into a single figure that
              would look tidier and say less.
              {headlineCited > 0 ? (
                <>
                  {" "}
                  This row leads the screen because{" "}
                  {headlineCited === 1
                    ? "another threshold on this brand is"
                    : `${headlineCited} other thresholds on this brand are`}{" "}
                  derived from it by name, so the override propagates rather
                  than stopping at its own row &mdash; not because its gap is
                  the widest, which it is not.
                </>
              ) : null}
            </p>
          </div>
        </CardBody>
      )}

      <div className="border-t border-rule">
        {ordered.length === 0 ? (
          <p className="px-[20px] py-[18px] max-w-[92ch] text-copy leading-[1.6] text-body">
            No policy parameters are readable in your scope. When they are,
            every threshold appears here with its derivation, the value in
            force, and the reason for any difference between the two.
          </p>
        ) : (
          ordered.map((parameter) => (
            <ParameterRow key={parameter.id} parameter={parameter} />
          ))
        )}
      </div>
    </Card>
  );
}

export default PolicyAudit;
