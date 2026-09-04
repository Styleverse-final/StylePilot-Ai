"use client";

import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";

import type { ScopeTriple } from "./data";
import type { ScenarioScope } from "./note";

/**
 * Category, channel and region, each with an "every one" option.
 *
 * The options are not a list of what exists. They are built from the
 * (category, channel, region) triples the SIGNED-IN PLANNER can actually
 * read -- the page enumerates them from `forecast` under RLS -- so a pairing
 * this session cannot see is never offered. That is the difference between
 * teaching someone they are out of scope and teaching them the product is
 * broken.
 *
 * Cascading falls out of the same list: choosing a category narrows the
 * channels to the ones that exist for it, and the pair narrows the regions.
 * A choice that does not survive the narrowing falls back to "every", which
 * is always valid, rather than to some arbitrary first option the planner
 * did not ask for.
 *
 * The selection lives in the URL, so a scenario setup is shareable and the
 * forecast read stays on the server.
 */

export type ScopeFiltersProps = {
  triples: readonly ScopeTriple[];
  labels: {
    category: Readonly<Record<string, string>>;
    channel: Readonly<Record<string, string>>;
    region: Readonly<Record<string, string>>;
  };
  selected: ScenarioScope;
  /** Series the current selection resolves to, stated under the controls. */
  seriesCount: number;
  /** Series readable in total, so the narrowing is legible. */
  readableSeries: number;
};

const ALL = "__all__";

const FIELD_CLASS =
  "w-full rounded-full bg-cream px-[12px] py-[9px] text-[11.5px] font-semibold text-body border-none outline-none appearance-none cursor-pointer";
const LABEL_CLASS = "mb-[4px] text-[11.5px] font-semibold text-mute";

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function ScopeFilters({
  triples,
  labels,
  selected,
  seriesCount,
  readableSeries,
}: ScopeFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const categories = useMemo(
    () => uniqueSorted(triples.map((triple) => triple.category)),
    [triples],
  );

  const channels = useMemo(
    () =>
      uniqueSorted(
        triples
          .filter(
            (triple) =>
              selected.category === null || triple.category === selected.category,
          )
          .map((triple) => triple.channel),
      ),
    [triples, selected.category],
  );

  const regions = useMemo(
    () =>
      uniqueSorted(
        triples
          .filter(
            (triple) =>
              (selected.category === null ||
                triple.category === selected.category) &&
              (selected.channel === null || triple.channel === selected.channel),
          )
          .map((triple) => triple.region),
      ),
    [triples, selected.category, selected.channel],
  );

  /** Keep a choice that still exists; otherwise widen it to "every". */
  function resolve(next: Partial<ScenarioScope>): ScenarioScope {
    const category = next.category !== undefined ? next.category : selected.category;

    const channelOptions = uniqueSorted(
      triples
        .filter((triple) => category === null || triple.category === category)
        .map((triple) => triple.channel),
    );
    const wantedChannel =
      next.channel !== undefined ? next.channel : selected.channel;
    const channel =
      wantedChannel === null || channelOptions.includes(wantedChannel)
        ? wantedChannel
        : null;

    const regionOptions = uniqueSorted(
      triples
        .filter(
          (triple) =>
            (category === null || triple.category === category) &&
            (channel === null || triple.channel === channel),
        )
        .map((triple) => triple.region),
    );
    const wantedRegion = next.region !== undefined ? next.region : selected.region;
    const region =
      wantedRegion === null || regionOptions.includes(wantedRegion)
        ? wantedRegion
        : null;

    return { category, channel, region };
  }

  function goTo(next: Partial<ScenarioScope>): void {
    const target = resolve(next);
    const query = new URLSearchParams();
    if (target.category !== null) query.set("category", target.category);
    if (target.channel !== null) query.set("channel", target.channel);
    if (target.region !== null) query.set("region", target.region);
    const search = query.toString();
    startTransition(() => {
      router.push(search.length > 0 ? `/scenarios?${search}` : "/scenarios");
    });
  }

  function readValue(raw: string): string | null {
    return raw === ALL ? null : raw;
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
          value={selected.category ?? ALL}
          onChange={(event) => goTo({ category: readValue(event.target.value) })}
        >
          <option value={ALL}>Every category you can read</option>
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
          value={selected.channel ?? ALL}
          onChange={(event) => goTo({ channel: readValue(event.target.value) })}
        >
          <option value={ALL}>Every channel</option>
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
          value={selected.region ?? ALL}
          onChange={(event) => goTo({ region: readValue(event.target.value) })}
        >
          <option value={ALL}>Every region</option>
          {regions.map((id) => (
            <option key={id} value={id}>
              {labels.region[id] ?? id}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-rule pt-[12px] text-[11.5px] font-semibold leading-[1.6] text-mute">
        <b className="text-ink tabular-nums">
          {seriesCount} of {readableSeries} series
        </b>
        <br />
        These options are the combinations your session can actually read. An
        out-of-scope pairing is never offered, and the base plan below is built
        from exactly the series counted here -- not from the brand.
      </div>
    </div>
  );
}

export default ScopeFilters;
