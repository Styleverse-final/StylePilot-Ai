/**
 * ThreadBand
 *
 * Ports `.threads`, `.th` and `.tkey`. One thin bar per decision, shuffled
 * so the dispositions interleave rather than block, over a legend that names
 * each disposition and its count. It is a picture of a week's decision
 * volume, not a chart: the bars carry no axis and no scale, only proportion.
 *
 * The shuffle is the same fixed permutation used by the design reference
 * (index * 7919 + 13), so the band renders identically on the server and in
 * the browser and never trips hydration.
 */

export type ThreadClass = {
  /** Stable key, e.g. "agent" | "review" | "escalated". */
  key: string;
  /** Legend text, e.g. "221 agent-executed". */
  label: string;
  /** Number of bars to draw for this disposition. */
  count: number;
  /** CSS colour for the bar and the legend swatch. */
  color: string;
  /** Bar height as a fraction of the 36px band. Defaults to 1. */
  height?: number;
};

export type ThreadBandProps = {
  classes: ReadonlyArray<ThreadClass>;
  /** Required: the band is role="img" and carries no text of its own. */
  ariaLabel: string;
  /** Cap on rendered bars. Keeps very large weeks from bloating the DOM. */
  maxBars?: number;
  className?: string;
};

function shuffledIndexes(length: number): number[] {
  const order: number[] = Array.from({ length }, (_unused, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = (i * 7919 + 13) % (i + 1);
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  return order;
}

export function ThreadBand({
  classes,
  ariaLabel,
  maxBars = 900,
  className,
}: ThreadBandProps) {
  const total = classes.reduce((acc, entry) => acc + Math.max(0, entry.count), 0);
  const scale = total > maxBars && total > 0 ? maxBars / total : 1;

  const flat: ThreadClass[] = [];
  for (const entry of classes) {
    const bars = Math.max(0, Math.round(entry.count * scale));
    for (let i = 0; i < bars; i += 1) flat.push(entry);
  }
  const order = shuffledIndexes(flat.length);

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex items-end gap-[1.5px] h-[36px] mt-[12px]"
      >
        {order.map((sourceIndex, position) => {
          const entry = flat[sourceIndex];
          return (
            <span
              key={`${entry.key}-${position}`}
              className="flex-1 rounded-[1px]"
              style={{
                backgroundColor: entry.color,
                height: `${Math.round((entry.height ?? 1) * 100)}%`,
              }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-[16px] mt-[10px] text-[11.5px] text-mute font-semibold">
        {classes.map((entry) => (
          <span key={entry.key}>
            <i
              aria-hidden="true"
              className="inline-block w-[8px] h-[8px] rounded-[2px] mr-[6px]"
              style={{ backgroundColor: entry.color }}
            />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  );
}
