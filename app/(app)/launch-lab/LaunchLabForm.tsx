"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The bundle selector, as a controlled client component.
 *
 * IT WAS A PLAIN SERVER-RENDERED <form method="get"> AND THAT HAD A REAL
 * BUG: uncontrolled <select defaultValue> gets snapped back to the
 * server-rendered value when React 19 hydration lands, so a planner who
 * changed the dropdowns inside the hydration window had their choices
 * silently reverted -- Estimate then submitted the defaults, the same page
 * rendered, and the screen read as a refresh loop. The failure was
 * timing-dependent, which is the worst kind: fast clickers hit it every
 * time, slow ones never.
 *
 * Controlled state cannot be reverted by hydration, because the state IS
 * the value. Submission goes through router.push, so the same-URL case is
 * a visible no-op rather than a full reload that looks like a glitch.
 */

type Props = {
  categories: readonly string[];
  fabrics: readonly string[];
  silhouettes: readonly string[];
  colours: readonly string[];
  category: string;
  fabric: string;
  silhouette: string;
  colour: string;
};

function Field({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-[5px] block text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-mute">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[38px] w-full rounded-inner border border-rule2 bg-white px-[10px] text-[12.5px] font-semibold text-ink"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LaunchLabForm(props: Props) {
  const router = useRouter();
  const [category, setCategory] = useState(props.category);
  const [fabric, setFabric] = useState(props.fabric);
  const [silhouette, setSilhouette] = useState(props.silhouette);
  const [colour, setColour] = useState(props.colour);
  const [pending, setPending] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    const params = new URLSearchParams({ category, fabric, silhouette, colour });
    router.push(`/launch-lab?${params.toString()}`);
    // The server re-renders the results; the button un-sticks when the new
    // page props arrive and this component remounts with fresh state.
  };

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-5 items-end gap-[12px] max-[1140px]:grid-cols-2"
    >
      <Field label="Category" options={props.categories} value={category} onChange={setCategory} />
      <Field label="Fabric" options={props.fabrics} value={fabric} onChange={setFabric} />
      <Field label="Silhouette" options={props.silhouettes} value={silhouette} onChange={setSilhouette} />
      <Field label="Colour family" options={props.colours} value={colour} onChange={setColour} />
      <button
        type="submit"
        disabled={pending}
        className="h-[38px] rounded-pill bg-orange px-[18px] text-[12.5px] font-extrabold text-white transition-colors duration-[120ms] hover:bg-orangeD disabled:opacity-60"
      >
        {pending ? "Estimating…" : "Estimate"}
      </button>
    </form>
  );
}

export default LaunchLabForm;
