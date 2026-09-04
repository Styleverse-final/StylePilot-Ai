import type { ReactNode } from "react";

import { Card, CardBody } from "@/components";

/**
 * The two prose wrappers this screen uses, ported from the pattern the buy
 * and learning screens already established: a plain card for a paragraph
 * that has to be read, and a section heading that carries its own
 * explanation rather than sitting above an unexplained panel.
 *
 * They live here rather than in @/components because only the governance
 * screen uses them so far. If a third screen wants them they should be
 * promoted, not copied a fourth time.
 */

export function Explain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
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

/** Ports `.quote`: the shell-tinted block a reason is printed in. */
export function Quote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-shell rounded-quote px-[14px] py-[11px] text-copy leading-[1.55] text-body max-w-[74ch]${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </div>
  );
}

/** Ports `.mute`: the 11.5px/600 muted line used for provenance. */
export function Muted({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-small font-semibold leading-[1.6] text-mute${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </div>
  );
}
