import type { ReactNode } from "react";

/**
 * DataTable
 *
 * Ports the bare `table` / `th` / `td` rules from the production design
 * system: 10.5px/800 mute headers with .04em tracking over a rule, 12.5px
 * body cells over a rule, no rule on the last row, and a shell tint on row
 * hover. Numeric columns are right-aligned AND tabular so digits line up.
 *
 * Generic over the row type: `columns` is typed against `T`, so a cell
 * renderer cannot reach for a field the row does not have.
 */

export type ColumnAlign = "left" | "right";

export type Column<T> = {
  /** Stable identity for the column. Also the React key. */
  key: string;
  header?: ReactNode;
  /** Renders the cell for one row. */
  cell: (row: T, index: number) => ReactNode;
  /**
   * Numeric columns are right-aligned and get tabular figures.
   * Set `align` explicitly to override the alignment only.
   */
  numeric?: boolean;
  align?: ColumnAlign;
  /** Applied to both the th and every td in the column. */
  className?: string;
  /** Applied to the th only, e.g. "w-[120px]". */
  headerClassName?: string;
};

export type DataTableProps<T> = {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T, index: number) => string;
  /** Optional per-row class, e.g. to tint an escalated row. */
  rowClassName?: (row: T, index: number) => string | undefined;
  /** Shown in place of the body when `rows` is empty. */
  empty?: ReactNode;
  /** Caption for assistive technology. Visually hidden. */
  caption?: string;
  className?: string;
};

function alignmentClass<T>(column: Column<T>): string {
  const align: ColumnAlign = column.align ?? (column.numeric ? "right" : "left");
  const parts: string[] = [align === "right" ? "text-right" : "text-left"];
  if (column.numeric) parts.push("tabular-nums");
  return parts.join(" ");
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  empty,
  caption,
  className,
}: DataTableProps<T>) {
  return (
    <div className={`overflow-x-auto${className ? ` ${className}` : ""}`}>
      <table className="w-full border-collapse">
        {caption === undefined ? null : (
          <caption className="sr-only">{caption}</caption>
        )}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-[14px] py-[10px] text-[10.5px] font-extrabold tracking-[0.04em] text-mute whitespace-nowrap border-b border-rule ${alignmentClass(
                  column,
                )}${column.className ? ` ${column.className}` : ""}${
                  column.headerClassName ? ` ${column.headerClassName}` : ""
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-[14px] py-[18px] text-[12.5px] text-mute font-semibold"
              >
                {empty ?? "Nothing to show."}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const extra = rowClassName?.(row, index);
              return (
                <tr
                  key={rowKey(row, index)}
                  className={`hover:bg-shell transition-colors duration-[120ms]${
                    extra ? ` ${extra}` : ""
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-[14px] py-[11px] text-[12.5px] text-ink border-b border-rule ${alignmentClass(
                        column,
                      )}${column.className ? ` ${column.className}` : ""}`}
                    >
                      {column.cell(row, index)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Ports `.sname`: the 12.5px/800 leading identifier cell, with an optional
 * muted qualifier rendered from `<em>` at 600 weight and normal style.
 */
export type SeriesNameProps = {
  children?: ReactNode;
  qualifier?: ReactNode;
  className?: string;
};

export function SeriesName({ children, qualifier, className }: SeriesNameProps) {
  return (
    <span className={`text-[12.5px] font-extrabold text-ink${className ? ` ${className}` : ""}`}>
      {children}
      {qualifier === undefined ? null : (
        <span className="not-italic text-mute font-semibold"> {qualifier}</span>
      )}
    </span>
  );
}
