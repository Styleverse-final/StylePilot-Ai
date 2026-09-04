import Link from "next/link";

import { Card, CardBody } from "@/components";

import type { PortfolioScope } from "./types";

/**
 * THE BRAND SWITCHER -- group CMPO only, and not because a role string says
 * so on this line.
 *
 * WHY IT IS A URL AND NOT A useState
 * ----------------------------------
 * Client state cannot be adjudicated. If the selected brand lived in a
 * useState, the server would have to be told which brand to fetch by the
 * browser, and the only thing standing between a curious reader and another
 * brand's figures would be code the browser is running. Putting the
 * selection in the query string makes it a REQUEST: the page reads it, the
 * server resolves it against what dim_brand handed back under row level
 * security, and Postgres decides the rest. `?brand=SPD` typed by an ECO CMPO
 * does not show SpeedStyle -- the policy returns one row, `resolveScope`
 * finds no match, and the screen says the URL asked for something this
 * session cannot read.
 *
 * It also makes the view linkable, which is what a group CMPO actually does
 * with it: send someone the brand.
 *
 * WHY IT DOES NOT CHECK THE ROLE
 * ------------------------------
 * The tabs are built from `scope.brands`, which is whatever dim_brand
 * returned. A brand CMPO gets one row and this component renders nothing; a
 * group CMPO gets two and it renders two plus the portfolio. If a third
 * brand joined the pilot tomorrow, or if the policy changed, the switcher
 * would follow without an edit here -- and there is no arrangement of these
 * links that can produce data the policy would not already have returned.
 */

const BASE =
  "inline-flex items-center gap-[7px] rounded-pill px-[14px] py-[7px] text-copy font-bold transition-colors duration-[120ms]";
const ACTIVE = "bg-ink text-white";
const IDLE = "bg-cream text-body hover:bg-hover";

function Tab({
  href,
  active,
  label,
  hint,
}: {
  href: string;
  active: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`${BASE} ${active ? ACTIVE : IDLE}`}
    >
      {label}
      {hint === undefined ? null : (
        <span
          className={`text-label font-semibold ${active ? "text-white/70" : "text-mute"}`}
        >
          {hint}
        </span>
      )}
    </Link>
  );
}

export type BrandSwitcherProps = {
  scope: PortfolioScope;
};

export function BrandSwitcher({ scope }: BrandSwitcherProps) {
  // One readable brand is not a choice. A single disabled tab would imply
  // there is somewhere else to go, which for a brand CMPO there is not.
  if (scope.brands.length < 2) return null;

  return (
    <Card className="mb-[16px]">
      <CardBody className="flex flex-wrap items-center gap-x-[10px] gap-y-[10px]">
        <span className="mr-[4px] text-label font-bold text-mute">Scope</span>

        <Tab
          href="/portfolio"
          active={scope.selected === null}
          label="Both brands"
          hint={`${scope.brands.length} in your scope`}
        />

        {scope.brands.map((brand) => (
          <Tab
            key={brand.brandId}
            href={`/portfolio?brand=${encodeURIComponent(brand.brandId)}`}
            active={scope.selected === brand.brandId}
            label={brand.brandName}
            hint={brand.brandId}
          />
        ))}

        <span className="ml-auto max-w-[52ch] text-small font-semibold leading-[1.5] text-mute">
          The selection travels in the URL so row level security decides it,
          not the browser. Every figure below is re-read for the scope you
          pick.
        </span>
      </CardBody>
    </Card>
  );
}

export default BrandSwitcher;
