"use client";

import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";

/**
 * ScopeSelectors -- category, then channel, then region.
 *
 * The options are not a list of everything that exists. They are built from
 * the (category, channel, region) triples the SIGNED-IN PLANNER can actually
 * read: the page enumerates them from `forecast` under RLS and hands them
 * down. A planner scoped to India North is therefore never offered Europe,
 * because offering a combination that returns an empty chart teaches them
 * the system is broken rather than that they are out of scope.
 *
 * Cascading falls out of that. Choosing a category narrows the channels to
 * the ones that exist for it, and the pair narrows the regions. When the
 * current choice survives the narrowing it is kept; when it does not, the
 * first surviving option is taken, so a selection is always valid.
 *
 * Navigation is a router push, not local state: the series lives in the URL,
 * which makes a chart shareable and keeps the fetch on the server.
 */

export type ScopeTriple = {
  category: string;
  channel: string;
  region: string;
};

export type ScopeLabels = {
  category: Readonly<Record<string, string>>;
  channel: Readonly<Record<string, string>>;
  region: Readonly<Record<string, string>>;
};

export type ScopeSelectorsProps = {
  triples: readonly ScopeTriple[];
  labels: ScopeLabels;
  selected: ScopeTriple;
  /**
   * The brand the triples belong to, carried through every navigation so a
   * reader who can see both brands does not silently fall back to the first
   * one the moment they change a category.
   */
  brand?: string;
};

const FIELD_CLASS =
  "w-full rounded-full bg-cream px-[12px] py-[9px] text-[11.5px] font-semibold text-body border-none outline-none appearance-none cursor-pointer disabled:cursor-not-allowed";

const LABEL_CLASS = "mb-[4px] text-[11.5px] font-semibold text-mute";

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function ScopeSelectors({
  triples,
  labels,
  selected,
  brand,
}: ScopeSelectorsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const categories = useMemo(
    () => uniqueSorted(triples.map((t) => t.category)),
    [triples],
  );

  const channels = useMemo(
    () =>
      uniqueSorted(
        triples.filter((t) => t.category === selected.category).map((t) => t.channel),
      ),
    [triples, selected.category],
  );

  const regions = useMemo(
    () =>
      uniqueSorted(
        triples
          .filter(
            (t) => t.category === selected.category && t.channel === selected.channel,
          )
          .map((t) => t.region),
      ),
    [triples, selected.category, selected.channel],
  );

  /** Keep what still exists; otherwise take the first surviving option. */
  function resolve(next: Partial<ScopeTriple>): ScopeTriple {
    const category = next.category ?? selected.category;

    const channelOptions = uniqueSorted(
      triples.filter((t) => t.category === category).map((t) => t.channel),
    );
    const wanted = next.channel ?? selected.channel;
    const channel = channelOptions.includes(wanted)
      ? wanted
      : (channelOptions[0] ?? wanted);

    const regionOptions = uniqueSorted(
      triples
        .filter((t) => t.category === category && t.channel === channel)
        .map((t) => t.region),
    );
    const wantedRegion = next.region ?? selected.region;
    const region = regionOptions.includes(wantedRegion)
      ? wantedRegion
      : (regionOptions[0] ?? wantedRegion);

    return { category, channel, region };
  }

  function goTo(next: Partial<ScopeTriple>): void {
    const target = resolve(next);
    const query = new URLSearchParams({
      category: target.category,
      channel: target.channel,
      region: target.region,
    });
    if (brand !== undefined) query.set("brand", brand);
    startTransition(() => {
      router.push(`/workbench?${query.toString()}`);
    });
  }

  return (
    <div
      className="flex flex-col gap-[11px]"
      aria-busy={pending}
      style={pending ? { opacity: 0.6 } : undefined}
    >
      <div>
        <div className={LABEL_CLASS}>Category</div>
        <select
          className={FIELD_CLASS}
          aria-label="Category"
          value={selected.category}
          onChange={(event) => goTo({ category: event.target.value })}
        >
          {categories.map((id) => (
            <option key={id} value={id}>
              {labels.category[id] ?? id}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className={LABEL_CLASS}>Channel</div>
        <select
          className={FIELD_CLASS}
          aria-label="Channel"
          value={selected.channel}
          onChange={(event) => goTo({ channel: event.target.value })}
        >
          {channels.map((id) => (
            <option key={id} value={id}>
              {labels.channel[id] ?? id}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className={LABEL_CLASS}>Region</div>
        <select
          className={FIELD_CLASS}
          aria-label="Region"
          value={selected.region}
          onChange={(event) => goTo({ region: event.target.value })}
        >
          {regions.map((id) => (
            <option key={id} value={id}>
              {labels.region[id] ?? id}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default ScopeSelectors;
