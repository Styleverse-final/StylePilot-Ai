import type { ReactNode } from "react";

import { Card, CardBody } from "@/components";

/**
 * The three prose shapes this screen uses, kept in one place so the measure,
 * the weight and the spacing cannot drift between panels.
 *
 * Explain is a paragraph in a card: an empty state, a failure, or a caveat
 * that has to sit at the same visual weight as the number it qualifies.
 *
 * SectionHeading opens a block of the screen and says what question it
 * answers, in a planner's words rather than a table name.
 *
 * Finding is the one that matters most here. A CMPO screen full of figures
 * with no reading of them is a report; the reading is the deliverable, so it
 * gets its own surface, at body weight, immediately under the chart it comes
 * from. It is deliberately NOT a callout box with an alert colour -- an
 * observation is not an alarm, and nothing on this screen is an action.
 */

export function Explain({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">{children}</p>
      </CardBody>
    </Card>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-[8px] pb-[14px] pt-[26px]">
      <div className="text-small font-bold text-mute">{eyebrow}</div>
      <h2 className="mt-[2px] text-hero font-extrabold text-ink">{title}</h2>
      {children === undefined ? null : (
        <p className="mt-[7px] max-w-[96ch] text-copy leading-[1.6] text-body">
          {children}
        </p>
      )}
    </div>
  );
}

export function Finding({
  label = "What this says",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-[14px] border-t border-rule pt-[13px]">
      <div className="text-micro font-extrabold tracking-[0.06em] text-mute">
        {label.toUpperCase()}
      </div>
      <p className="mt-[5px] max-w-[96ch] text-copy leading-[1.6] text-body">
        {children}
      </p>
    </div>
  );
}

/**
 * A stored derivation, rendered verbatim behind a disclosure.
 *
 * value_summary.basis and policy_parameter.basis are prose the pipeline
 * wrote, and they carry figures that exist nowhere else as columns -- the
 * absolute unit counts, the holding rate per unit-week. Quoting the string
 * whole is the only honest way to surface those: re-typing a number out of a
 * sentence into a KPI would create a figure with no column behind it.
 */
export function Provenance({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="mt-[12px] rounded-quote bg-shell px-[14px] py-[11px]">
      <summary className="cursor-pointer text-small font-extrabold text-orangeD">
        {summary}
      </summary>
      <div className="mt-[8px] max-w-[100ch] text-small leading-[1.65] text-body">
        {children}
      </div>
    </details>
  );
}
