import type { ReactNode } from "react";

/**
 * DriverBars / DriverBar
 *
 * Ports `.drv`, `.drvH` and `.trk`. Signed horizontal bars stated in units,
 * not percentages: the point of the panel is that the contributions sum to
 * the forecast, so the magnitude label is the unit count and the bar is only
 * there to rank them. Positive contributions run orange, negative run the
 * muted stone fill.
 *
 * Bars are scaled against the largest absolute contribution in the set, so
 * the widest bar always fills the track.
 */

export type Driver = {
  label: string;
  /** Signed contribution in units. Sign drives colour and prefix. */
  value: number;
};

/**
 * Indian-grouped integer formatting, implemented arithmetically rather than
 * via toLocaleString so the server and the client always agree and hydration
 * never mismatches. Returns the magnitude only.
 */
export function formatUnitsAbs(value: number): string {
  const digits = String(Math.round(Math.abs(value)));
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, digits.length - 3);
  const tail = digits.slice(digits.length - 3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

/** Signed variant of {@link formatUnitsAbs}. */
export function formatUnits(value: number): string {
  const magnitude = formatUnitsAbs(value);
  return value < 0 ? `-${magnitude}` : magnitude;
}

export type DriverBarProps = {
  driver: Driver;
  /** Largest absolute value in the set; the bar is scaled against it. */
  max: number;
  formatValue?: (value: number) => string;
};

export function DriverBar({
  driver,
  max,
  formatValue = formatUnitsAbs,
}: DriverBarProps) {
  const positive = driver.value >= 0;
  const width = max > 0 ? Math.min(100, (Math.abs(driver.value) / max) * 100) : 0;
  return (
    <div className="px-[20px] py-[12px] border-b border-rule last:border-b-0">
      <div className="flex items-baseline justify-between gap-[10px] mb-[6px]">
        <span className="text-[12px] font-bold text-ink">{driver.label}</span>
        <span
          className={`text-[11.5px] font-extrabold tabular-nums ${
            positive ? "text-orange" : "text-mute"
          }`}
        >
          {positive ? "+" : "-"}
          {formatValue(driver.value)}
        </span>
      </div>
      <div className="h-[7px] bg-cream rounded-full overflow-hidden">
        <i
          className={`block h-full rounded-full ${
            positive ? "bg-orange" : "bg-[#C9BDB2]"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export type DriverBarsProps = {
  drivers: ReadonlyArray<Driver>;
  /** Muted trailing note, e.g. "Exact tree SHAP in units, summing to the forecast." */
  footnote?: ReactNode;
  formatValue?: (value: number) => string;
  className?: string;
};

export function DriverBars({
  drivers,
  footnote,
  formatValue,
  className,
}: DriverBarsProps) {
  const max = drivers.reduce(
    (acc, driver) => Math.max(acc, Math.abs(driver.value)),
    0,
  );
  return (
    <div className={className}>
      {drivers.map((driver) => (
        <DriverBar
          key={driver.label}
          driver={driver}
          max={max}
          formatValue={formatValue}
        />
      ))}
      {footnote === undefined ? null : (
        <div className="px-[20px] py-[12px] border-b border-rule last:border-b-0">
          <div className="text-[11.5px] text-mute font-semibold leading-[1.6]">
            {footnote}
          </div>
        </div>
      )}
    </div>
  );
}
