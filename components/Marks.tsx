/**
 * Marks -- the four small shapes a header KPI can carry under its value.
 *
 * WHY FOUR SHAPES AND NOT ONE SPARKLINE EVERYWHERE
 * ------------------------------------------------
 * A trend line is a claim that a number was measured repeatedly. Two of the
 * dashboard's four KPIs cannot support that claim, and will not from the data
 * as it stands:
 *
 *   model_registry holds four versions trained inside the same two minutes,
 *   so accuracy has no retrain series -- only a position against the two
 *   benchmarks it is scored beside.
 *
 *   value_summary carries generated_at NULL on every row and holds one row
 *   per scope, so margin has no history and not even an as-of date -- only a
 *   composition, which is a real fact about the figure.
 *
 * Drawing a curve on those two would put decoration exactly where this app
 * everywhere else puts evidence. <Track> and <SplitBar> give them the same
 * visual weight as a series without asserting movement; <Sparkline> and
 * <Bars> are for the two KPIs where the movement is genuinely recorded.
 *
 * Every mark takes its colour from the current text colour, so a card sets
 * the tone once and the mark follows. All four are pure SVG with no ids, no
 * gradients and no measurement, which keeps them server-rendered and stable
 * between renders.
 */

/** The shared viewBox. Marks stretch to the card; strokes do not. */
const W = 100;
const H = 20;

export type MarkProps = {
  /** Required. The mark is an image and must say what it shows. */
  label: string;
  className?: string;
};

/** Normalise to 0..1 within a domain that is never zero-width. */
function scale(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  const span = max - min;
  if (span <= 0) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / span));
}

// --------------------------------------------------------------- sparkline

export type SparklineProps = MarkProps & {
  /** Chronological. Fewer than two points draws nothing, not a flat line. */
  points: readonly number[];
};

/**
 * A recorded series. The area under it is the same colour at low opacity
 * rather than a gradient, so there is no defs id to collide with when
 * several marks render on one screen.
 */
export function Sparkline({ points, label, className }: SparklineProps) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const step = W / (points.length - 1);
  const xy = points.map((value, index) => {
    const x = index * step;
    // 2px of headroom top and bottom so the stroke is never clipped.
    const y = H - 2 - scale(value, min, max) * (H - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={`h-[20px] w-full${className ? ` ${className}` : ""}`}
    >
      <path
        d={`M0,${H} L${xy.join(" L")} L${W},${H} Z`}
        fill="currentColor"
        fillOpacity={0.14}
      />
      <polyline
        points={xy.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// -------------------------------------------------------------------- bars

export type BarsProps = MarkProps & {
  /** Chronological counts. An empty series draws nothing. */
  values: readonly number[];
};

/**
 * A recorded series of counts. Bars rather than a line because a count per
 * day is discrete: there is no value between Tuesday and Wednesday to
 * interpolate. The last bar is the most recent and is drawn solid.
 */
export function Bars({ values, label, className }: BarsProps) {
  if (values.length === 0) return null;

  const max = Math.max(...values, 1);
  const gap = values.length > 24 ? 0.6 : 1.4;
  const width = (W - gap * (values.length - 1)) / values.length;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={`h-[20px] w-full${className ? ` ${className}` : ""}`}
    >
      {values.map((value, index) => {
        // A recorded zero keeps a 1px foot, so an empty day reads as a day
        // with nothing in it rather than as a day with no data.
        const height = Math.max(1, (value / max) * (H - 2));
        return (
          <rect
            key={index}
            x={index * (width + gap)}
            y={H - height}
            width={width}
            height={height}
            fill="currentColor"
            fillOpacity={index === values.length - 1 ? 1 : 0.42}
          />
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------- track

export type TrackTick = {
  at: number;
  /** Drawn taller and solid. Use for the figure the KPI is reporting. */
  primary?: boolean;
};

export type TrackProps = MarkProps & {
  ticks: readonly TrackTick[];
  /** [min, max] of the axis. Pad it at the call site; this does not guess. */
  domain: readonly [number, number];
};

/**
 * A position, not a movement. One rail with the reported figure marked on it
 * and its benchmarks beside it -- the comparison drawn, where a series would
 * have been invented.
 */
export function Track({ ticks, domain, label, className }: TrackProps) {
  const [min, max] = domain;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={`h-[20px] w-full${className ? ` ${className}` : ""}`}
    >
      <rect
        x={0}
        y={H / 2 - 1.5}
        width={W}
        height={3}
        rx={1.5}
        fill="currentColor"
        fillOpacity={0.16}
      />
      {ticks.map((tick, index) => {
        const x = scale(tick.at, min, max) * W;
        const height = tick.primary ? H - 4 : H - 11;
        return (
          <rect
            key={index}
            x={Math.max(0, Math.min(W - 2, x - 1))}
            y={(H - height) / 2}
            width={2}
            height={height}
            rx={1}
            fill="currentColor"
            fillOpacity={tick.primary ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- splitbar

export type SplitSegment = {
  value: number;
  /** Named so the legend beside the bar and the bar cannot drift apart. */
  label: string;
};

export type SplitBarProps = MarkProps & {
  segments: readonly SplitSegment[];
};

/**
 * How one figure divides. Legitimate only where the segments genuinely sum
 * to the whole -- markdown avoided and lost sales recovered are both margin
 * and do; projected against realised are different units and do not, which
 * is why that pair is never drawn this way.
 */
export function SplitBar({ segments, label, className }: SplitBarProps) {
  const total = segments.reduce(
    (sum, part) => sum + Math.max(0, part.value),
    0,
  );
  if (total <= 0) return null;

  // Widths first, then the running offsets derived from them. A cursor
  // mutated inside the map below would be a reassignment during render, which
  // the compiler refuses -- and with two segments the cost of summing the
  // prefix each time is nothing.
  const widths = segments.map((part) => (Math.max(0, part.value) / total) * W);
  const offsets = widths.map((_, index) =>
    widths.slice(0, index).reduce((sum, width) => sum + width, 0),
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={`h-[20px] w-full${className ? ` ${className}` : ""}`}
    >
      {segments.map((part, index) => {
        const width = widths[index];
        return (
          <rect
            key={part.label}
            x={offsets[index]}
            y={H / 2 - 4}
            // A hairline between segments, taken off the right edge.
            width={Math.max(0, width - (index === segments.length - 1 ? 0 : 1))}
            height={8}
            rx={2}
            fill="currentColor"
            fillOpacity={index === 0 ? 1 : 0.38}
          />
        );
      })}
    </svg>
  );
}
