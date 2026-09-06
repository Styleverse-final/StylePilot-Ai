"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * PanelSection -- a card's worth of content, without the card.
 *
 * Two panels that answer the same question belong on one surface. Splitting
 * them across two cards makes the reader join them up, and on a screen where
 * every block is a white rounded rectangle, two cards side by side read as
 * two subjects rather than one subject seen twice.
 *
 * This is the heading a block renders when a container is already providing
 * the surface. It deliberately mirrors <CardHeader> at one step down --
 * 14px/800 title over the same muted 11.5px line -- so a bare panel inside a
 * card and a card of its own look like the same component, which they are.
 *
 * COLLAPSIBLE, WHEN THE CALLER ASKS
 * ---------------------------------
 * A section that a reader consults rather than works can fold away, and the
 * agents card holds two of them stacked. `collapsible` turns the title into
 * the toggle; `defaultOpen` decides what the reader finds on arrival, because
 * a section that hides its own headline by default has not saved the reader
 * anything, it has just made them click to find out what is in it.
 *
 * The toggle is the TITLE BLOCK only, never the whole header row: `actions`
 * can hold a link or a control, and a button inside a button is invalid
 * markup whose inner control stops responding.
 */

/** Points down when open, right when closed. */
const CHEVRON = String.fromCharCode(0x2304);

export type PanelSectionProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-hand slot: a count pill, a link. */
  actions?: ReactNode;
  /** Let the reader fold this section away. */
  collapsible?: boolean;
  /** Only meaningful with `collapsible`. Open on arrival by default. */
  defaultOpen?: boolean;
  children?: ReactNode;
  className?: string;
};

export function PanelSection({
  title,
  subtitle,
  actions,
  collapsible = false,
  defaultOpen = true,
  children,
  className,
}: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const showBody = !collapsible || open;

  const heading = (
    <div className="min-w-0">
      <h3 className="text-h3 font-extrabold text-ink">{title}</h3>
      {subtitle === undefined ? null : (
        <div className="mt-[2px] text-small font-semibold text-mute">
          {subtitle}
        </div>
      )}
    </div>
  );

  return (
    <section
      className={`px-[20px] py-[15px]${className ? ` ${className}` : ""}`}
    >
      <div className="flex items-start justify-between gap-[14px]">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex min-w-0 items-start gap-[9px] text-left"
          >
            <span
              aria-hidden="true"
              className={`mt-[3px] text-[13px] leading-none text-mute transition-transform duration-[120ms] ${
                open ? "" : "-rotate-90"
              }`}
            >
              {CHEVRON}
            </span>
            {heading}
          </button>
        ) : (
          heading
        )}

        {actions === undefined ? null : (
          <div className="flex shrink-0 items-center gap-[8px]">{actions}</div>
        )}
      </div>

      {showBody ? (
        <div id={panelId} className="mt-[12px]">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default PanelSection;
