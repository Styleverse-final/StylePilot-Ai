"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * SeriesPicker
 *
 * Ports the "Change series" `.tag` control in the reference markup. The
 * selected cell lives in the URL rather than in component state, so the board
 * stays a server render: every figure on it is read under the caller's own
 * session on each navigation, and a planner can link a colleague straight to
 * the cell they are arguing about.
 *
 * Only cells the caller can actually see are offered. The option list is
 * built from the rows row level security returned, so this control can never
 * navigate to something the reader is not entitled to read.
 */

export type SeriesOption = {
  /** `${categoryId}|${channelId}`. */
  value: string;
  label: string;
  /** Regions visible in that cell, for the option's trailing count. */
  regions: number;
  /** Rows in that cell the agent will not commit on its own. */
  escalating: number;
};

export type SeriesPickerProps = {
  options: readonly SeriesOption[];
  value: string;
  /** Route the selection is written back to. */
  path: string;
};

/**
 * One string, built in JavaScript rather than out of JSX fragments: an
 * <option> may only contain text, so adjacent expressions there are not
 * worth the risk.
 */
function optionText(option: SeriesOption): string {
  const regions = `${option.regions} region${option.regions === 1 ? "" : "s"}`;
  const review = option.escalating > 0 ? `, ${option.escalating} to review` : "";
  return `${option.label} (${regions}${review})`;
}

export function SeriesPicker({ options, value, path }: SeriesPickerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-[7px]">
      <span className="sr-only">Category and channel</span>
      <select
        value={value}
        disabled={pending || options.length === 0}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(() => {
            router.push(`${path}?series=${encodeURIComponent(next)}`, {
              scroll: false,
            });
          });
        }}
        className="max-w-[260px] rounded-pill bg-cream px-[12px] py-[5px] text-[11.5px] font-semibold text-body outline-none transition-colors duration-[120ms] hover:bg-hover disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {optionText(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default SeriesPicker;
