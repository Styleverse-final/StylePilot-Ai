import { Fragment, type ReactNode } from "react";

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
 *
 * A ROW CAN BE CLICKED. `onRowClick` makes the whole row the target, not
 * just the control at its end. The control stays: it is what a keyboard and
 * a screen reader use, and it is what tells a reader the row opens at all.
 * The row click is the shortcut for everyone already pointing at the row.
 *
 * A ROW CAN OPEN. `expanded` renders a full-width panel in the row's own
 * position, as the next <tr>, rather than under the table. Where the detail
 * appears is not a detail: a panel at the foot of forty-eight rows makes a
 * reader scroll away from the row they clicked, read, and then scroll back
 * to find their place. Opening in place keeps the row and its argument on
 * screen together.
 *
 * A COLUMN CAN BE PINNED TO THE RIGHT EDGE. `stickyRight` keeps a column
 * visible while the rest of the table scrolls under it. It exists for action
 * columns: a table wide enough to scroll is a table where the button that
 * acts on the row is the first thing to disappear, and a control you cannot
 * see is a control you do not know is there. The pinned cells take the row's
 * own background through bg-inherit, so the hover tint and any row tint keep
 * running under them rather than stopping at a white block.
 *
 * SORTING IS OPTIONAL AND EXTERNAL. A column marked `sortable` renders its
 * header as a button with a caret pair, sets aria-sort, and calls
 * `onSortChange` with its own key. The table never reorders anything itself:
 * the owning screen holds the order, because on several of these screens the
 * default order IS the argument -- the exception queue ranks by value at
 * stake and a table that quietly re-sorted would be overwriting an editorial
 * decision with an interaction. Columns that do not opt in render exactly as
 * they did before this existed.
 */

export type ColumnAlign = "left" | "right";

/** Which way a sorted column is pointing. */
export type SortDirection = "asc" | "desc";

/**
 * Where a cell's content sits in a row taller than itself.
 *
 * "middle" is the default and is right for a table whose rows are all one
 * line. "top" is for a table where some cells stack two or three lines: with
 * middle alignment every cell centres itself independently, so the first line
 * of each column starts at a different height and the row reads as a ragged
 * pile rather than a row. Aligning to the top gives the eye one line to read
 * across, which is the whole point of a table.
 */
export type CellAlign = "middle" | "top";

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
  /**
   * Renders the header as a sort control. Requires `onSortChange` on the
   * table; without a handler the flag is ignored rather than rendering a
   * button that does nothing.
   */
  sortable?: boolean;
  /**
   * Overrides the table's vertical alignment for this column. A column of
   * controls -- a pill, a button -- usually wants "middle" even in a table
   * whose text columns align to the top.
   */
  valign?: CellAlign;
  /**
   * Pins the column to the right edge of the scroll container, so it stays
   * put while a wide table scrolls under it. Only the last column should
   * carry this.
   */
  stickyRight?: boolean;
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
  /** The key of the column the rows are currently ordered by. */
  sortKey?: string | null;
  /** Which way that column points. */
  sortDir?: SortDirection;
  /** Called with a column key when its header is pressed. */
  onSortChange?: (key: string) => void;
  /** Where cells sit in a taller row. Defaults to "middle". */
  valign?: CellAlign;
  /**
   * A panel to open directly under this row, spanning every column. Return
   * null for the rows that are not open. The cell it lands in carries no
   * padding of its own, so the panel sets its own.
   */
  expanded?: (row: T, index: number) => ReactNode;
  /**
   * Called when a row is clicked anywhere. The row is NOT given button
   * semantics: the column of real controls stays the accessible path, and a
   * row announced as a button would swallow the cells' own content.
   */
  onRowClick?: (row: T, index: number) => void;
};

/**
 * The two carets. The one the column is not pointing is dimmed rather than
 * removed, so the control keeps its width and the header row does not
 * shift by a pixel when the sort moves between columns.
 */
function SortCaret({ dir }: { dir?: SortDirection }) {
  return (
    <svg
      viewBox="0 0 10 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[11px] w-[9px] flex-none"
      aria-hidden="true"
    >
      <path d="M2 4.7 5 1.7l3 3" opacity={dir === "desc" ? 0.3 : 1} />
      <path d="M2 7.3 5 10.3l3-3" opacity={dir === "asc" ? 0.3 : 1} />
    </svg>
  );
}

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
  sortKey = null,
  sortDir = "desc",
  onSortChange,
  valign = "middle",
  expanded,
  onRowClick,
}: DataTableProps<T>) {
  // The rows only need an explicit ground when something is pinned over
  // them; every other table keeps exactly the markup it had, so a row tint
  // set through rowClassName cannot start losing to a background this
  // component introduced.
  const hasSticky = columns.some((column) => column.stickyRight === true);

  return (
    <div className={`overflow-x-auto${className ? ` ${className}` : ""}`}>
      <table className="w-full border-collapse">
        {caption === undefined ? null : (
          <caption className="sr-only">{caption}</caption>
        )}
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = column.sortable === true && onSortChange !== undefined;
              const active = sortable && sortKey === column.key;
              const right =
                (column.align ?? (column.numeric ? "right" : "left")) === "right";

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sortable
                      ? active
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                  className={`px-[14px] py-[10px] text-[10.5px] font-extrabold tracking-[0.04em] whitespace-nowrap border-b border-rule ${
                    active ? "text-ink" : "text-mute"
                  }${
                    column.stickyRight === true
                      ? " sticky right-0 z-[2] bg-white shadow-[-10px_0_12px_-10px_rgba(35,31,28,0.14)]"
                      : ""
                  } ${alignmentClass(column)}${
                    column.className ? ` ${column.className}` : ""
                  }${column.headerClassName ? ` ${column.headerClassName}` : ""}`}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.key)}
                      className={`inline-flex items-center gap-[5px] rounded-[6px] px-[3px] py-[2px] transition-colors duration-[120ms] hover:text-ink${
                        right ? " flex-row-reverse" : ""
                      }`}
                    >
                      {column.header}
                      <SortCaret dir={active ? sortDir : undefined} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
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
              const panel = expanded ? expanded(row, index) : null;
              return (
                <Fragment key={rowKey(row, index)}>
                <tr
                  onClick={
                    onRowClick ? () => onRowClick(row, index) : undefined
                  }
                  className={`${hasSticky ? "bg-white " : ""}${
                    onRowClick ? "cursor-pointer " : ""
                  }hover:bg-shell transition-colors duration-[120ms]${
                    extra ? ` ${extra}` : ""
                  }`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-[14px] py-[11px] text-[12.5px] text-ink border-b border-rule ${
                        (column.valign ?? valign) === "top"
                          ? "align-top"
                          : "align-middle"
                      }${
                        column.stickyRight === true
                          ? " sticky right-0 z-[1] bg-inherit shadow-[-10px_0_12px_-10px_rgba(35,31,28,0.14)]"
                          : ""
                      } ${alignmentClass(column)}${
                        column.className ? ` ${column.className}` : ""
                      }`}
                    >
                      {column.cell(row, index)}
                    </td>
                  ))}
                </tr>

                {panel ? (
                  <tr>
                    <td colSpan={columns.length} className="border-b border-rule p-0">
                      {panel}
                    </td>
                  </tr>
                ) : null}
                </Fragment>
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
