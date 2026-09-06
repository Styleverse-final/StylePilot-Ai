import type { ReactElement } from "react";

/**
 * One drawn glyph per nav route, plus the three chrome marks the bar needs.
 *
 * WHY THIS IS NOT IN navItems.ts
 * ------------------------------
 * That file's header explains at length why it holds no client code: a server
 * component reads PRIMARY_NAV from it, and a plain constant exported from a
 * client module comes back undefined across the boundary -- /model-ops
 * returned a 500 reading "PRIMARY_NAV is not iterable" the last time those two
 * were mixed. Putting JSX in navItems.ts would turn it into a .tsx that Next
 * may treat as client, re-opening exactly that failure for a decoration.
 *
 * So the nav MODEL stays pure data over there and the DRAWING lives here,
 * joined by href. The cost is that a new route needs a line in two files; the
 * lookup below degrades to null rather than throwing when it only gets one, so
 * a missing glyph is a tab without an icon, not a broken nav.
 *
 * Hand-drawn rather than pulled from an icon package, matching the four sets
 * already in components/{dashboard,buy,allocation,exceptions}/icons.tsx --
 * seventeen 16px marks do not justify a dependency, and these inherit
 * currentColor so each one takes its tab's tone without a second colour being
 * declared anywhere.
 *
 * Every glyph here is decorative: the tab carries its own text label, so all of
 * them are aria-hidden and none is announced twice.
 */

const BASE = {
  viewBox: "0 0 18 18",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
  className: "h-[15px] w-[15px] flex-none",
} as const;

/** Dashboard: four panes of a command centre. */
function DashboardIcon() {
  return (
    <svg {...BASE}>
      <rect x="2.4" y="2.4" width="5.6" height="6.6" rx="1.5" />
      <rect x="10" y="2.4" width="5.6" height="4.2" rx="1.5" />
      <rect x="2.4" y="11" width="5.6" height="4.6" rx="1.5" />
      <rect x="10" y="8.6" width="5.6" height="7" rx="1.5" />
    </svg>
  );
}

/** Workbench: a surface with a tool laid across it. */
function WorkbenchIcon() {
  return (
    <svg {...BASE}>
      <path d="M2.4 6.6h13.2" />
      <path d="M3.6 6.6v8M14.4 6.6v8" />
      <path d="M2.4 6.6l2-3.2h9.2l2 3.2" />
      <path d="M6.6 10.2h4.8" />
    </svg>
  );
}

/** Exceptions: the mark that means "a human is needed here". */
function ExceptionsIcon() {
  return (
    <svg {...BASE}>
      <path d="M7.7 2.9L1.9 13a1.5 1.5 0 0 0 1.3 2.2h11.6a1.5 1.5 0 0 0 1.3-2.2L10.3 2.9a1.5 1.5 0 0 0-2.6 0z" />
      <path d="M9 6.9v3.4" />
      <circle cx="9" cy="12.7" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Buy: an open carton, because a buy is units committed. */
function BuyIcon() {
  return (
    <svg {...BASE}>
      <path d="M2.4 5.9L9 2.6l6.6 3.3v6.2L9 15.4l-6.6-3.3z" />
      <path d="M2.4 5.9L9 9.2l6.6-3.3M9 9.2v6.2" />
    </svg>
  );
}

/** Allocation: one source splitting to many doors. */
function AllocationIcon() {
  return (
    <svg {...BASE}>
      <circle cx="9" cy="3.6" r="1.7" />
      <path d="M9 5.3v3.1M4.2 12.1V9.9a1.5 1.5 0 0 1 1.5-1.5h6.6a1.5 1.5 0 0 1 1.5 1.5v2.2" />
      <circle cx="4.2" cy="13.9" r="1.7" />
      <circle cx="13.8" cy="13.9" r="1.7" />
    </svg>
  );
}

/** Markdown: a price tag. */
function MarkdownIcon() {
  return (
    <svg {...BASE}>
      <path d="M8.4 2.4H3.9a1.5 1.5 0 0 0-1.5 1.5v4.5c0 .4.16.78.44 1.06l5.6 5.6a1.5 1.5 0 0 0 2.12 0l4.5-4.5a1.5 1.5 0 0 0 0-2.12l-5.6-5.6A1.5 1.5 0 0 0 8.4 2.4z" />
      <circle cx="5.9" cy="5.9" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Scenarios: one present, two futures. */
function ScenariosIcon() {
  return (
    <svg {...BASE}>
      <circle cx="3.9" cy="9" r="1.6" />
      <path d="M5.5 9h2.3c1 0 1.6-.5 2.2-1.3l1.3-1.8" />
      <path d="M5.5 9h2.3c1 0 1.6.5 2.2 1.3l1.3 1.8" />
      <circle cx="13.5" cy="5.2" r="1.6" />
      <circle cx="13.5" cy="12.8" r="1.6" />
    </svg>
  );
}

/** Signals: what the market is broadcasting. */
function SignalsIcon() {
  return (
    <svg {...BASE}>
      <circle cx="9" cy="12.6" r="1.5" />
      <path d="M5.8 9.4a4.5 4.5 0 0 1 6.4 0" />
      <path d="M3.4 7a7.9 7.9 0 0 1 11.2 0" />
    </svg>
  );
}

/** Learning: the curve the model climbs. */
function LearningIcon() {
  return (
    <svg {...BASE}>
      <path d="M2.6 14.2V3.4" />
      <path d="M2.6 14.2h12.8" />
      <path d="M5 12c1.8 0 3.1-1.4 4.2-3.6C10.3 6.2 11.9 4.6 14.6 4.6" />
    </svg>
  );
}

/** Governance: the ledger the programme answers to. */
function GovernanceIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 2.4l5.8 2.4v3.9c0 3.4-2.4 6-5.8 6.9-3.4-.9-5.8-3.5-5.8-6.9V4.8z" />
      <path d="M6.7 8.9l1.7 1.7 3-3.2" />
    </svg>
  );
}

/** Model ops: the machine under the forecast. */
function ModelOpsIcon() {
  return (
    <svg {...BASE}>
      <rect x="5.4" y="5.4" width="7.2" height="7.2" rx="1.8" />
      <path d="M7.6 2.6v2.8M10.4 2.6v2.8M7.6 12.6v2.8M10.4 12.6v2.8" />
      <path d="M2.6 7.6h2.8M2.6 10.4h2.8M12.6 7.6h2.8M12.6 10.4h2.8" />
    </svg>
  );
}

/** Adoption: the people using it. */
function AdoptionIcon() {
  return (
    <svg {...BASE}>
      <circle cx="7" cy="6.2" r="2.4" />
      <path d="M2.6 14.4c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4" />
      <path d="M12.2 4.3a2.4 2.4 0 0 1 0 4.5M13.4 10.9c1.3.6 2 1.9 2 3.5" />
    </svg>
  );
}

/** Downstream: where the decision lands after it leaves here. */
function DownstreamIcon() {
  return (
    <svg {...BASE}>
      <path d="M9 2.8v9.3" />
      <path d="M5.6 8.9L9 12.3l3.4-3.4" />
      <path d="M2.8 15.2h12.4" />
    </svg>
  );
}

/** Portfolio: the whole business, in a case. */
function PortfolioIcon() {
  return (
    <svg {...BASE}>
      <rect x="2.4" y="4.6" width="13.2" height="10.8" rx="1.8" />
      <path d="M6.6 4.6V3.4a1.2 1.2 0 0 1 1.2-1.2h2.4a1.2 1.2 0 0 1 1.2 1.2v1.2" />
      <path d="M2.4 8.8h13.2" />
    </svg>
  );
}

/**
 * href -> glyph. A route with no entry renders no icon; see the header for why
 * that is a deliberate degradation rather than a thrown error.
 */
const BY_HREF: Readonly<Record<string, () => ReactElement>> = {
  "/": DashboardIcon,
  "/workbench": WorkbenchIcon,
  "/exceptions": ExceptionsIcon,
  "/buy": BuyIcon,
  "/allocation": AllocationIcon,
  "/markdown": MarkdownIcon,
  "/scenarios": ScenariosIcon,
  "/signals": SignalsIcon,
  "/learning": LearningIcon,
  "/governance": GovernanceIcon,
  "/model-ops": ModelOpsIcon,
  "/adoption": AdoptionIcon,
  "/downstream": DownstreamIcon,
  "/portfolio": PortfolioIcon,
};

export function iconFor(href: string): ReactElement | null {
  const Glyph = BY_HREF[href];
  return Glyph ? <Glyph /> : null;
}

// ------------------------------------------------------- the chrome marks

/**
 * The More menu's chevron.
 *
 * Drawn, where it used to be String.fromCharCode(0x25be). That character is
 * BLACK DOWN-POINTING SMALL TRIANGLE, and a text glyph in a control brings
 * three problems a path does not: it renders at whatever weight and baseline
 * the font happens to give it, it is absent from some fonts and falls back to
 * a box, and it is real text -- so a screen reader is free to announce it
 * after the word "More".
 */
export function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      {...BASE}
      className={`h-[11px] w-[11px] flex-none${className ? ` ${className}` : ""}`}
    >
      <path d="M4.6 6.9L9 11.3l4.4-4.4" />
    </svg>
  );
}

/** The narrow-viewport nav trigger. */
export function MenuIcon() {
  return (
    <svg {...BASE} className="h-[16px] w-[16px] flex-none">
      <path d="M3 5.2h12M3 9h12M3 12.8h12" />
    </svg>
  );
}

/** Dismisses the narrow-viewport panel. */
export function CloseIcon() {
  return (
    <svg {...BASE} className="h-[16px] w-[16px] flex-none">
      <path d="M4.6 4.6l8.8 8.8M13.4 4.6l-8.8 8.8" />
    </svg>
  );
}
