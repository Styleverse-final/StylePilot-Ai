"use client";

import { useMemo, useState } from "react";

import { Card } from "../Card";
import { Chip } from "../Chip";
import { ExceptionTableRow } from "./ExceptionTableRow";
import { breachWeeks, formatCount } from "./format";
import { SearchIcon, SlidersIcon } from "./icons";
import type { ExceptionView } from "./types";

/**
 * The exception queue: the toolbar and the ranked list.
 *
 * THE ORDER IS THE ARGUMENT OF THE SCREEN. Rows arrive already sorted by
 * value at stake, descending, straight from getExceptions(), and that is what
 * this component renders until a reader deliberately asks for something else.
 * Filtering and searching never re-sort; the two other orders live behind a
 * labelled control, and while one of them is in force the toolbar says so in
 * words and offers the value ranking back in one click. An order nobody chose
 * is never anything but the money order.
 *
 * FILTERING AND SEARCHING ARE LENSES, NOT QUERIES. The rows a planner may see
 * are already in hand -- RLS decided that set on the server -- and narrowing a
 * set of rows in the browser cannot widen it. A chip or a search term is a
 * lens on what was fetched, never a second read with a different scope, which
 * is also why every count in the toolbar is counted off `rows` rather than
 * quoted from a portfolio total the planner cannot act on.
 *
 * THE LIST IS CAPPED AT TWELVE AND SAYS SO. Twelve rows is about what a
 * screen holds, and the ranking means the thirteenth is by construction worth
 * less than the twelfth. The rest are one click away and the button carries
 * the count and the money still below the fold, so the cap is a fold rather
 * than a filter -- nothing is hidden that the reader is not told about.
 */

type Filter = "ALL" | "STOCKOUT" | "OVERSTOCK" | "HIGH" | "OPEN";

/** What the list can be ordered by. VALUE, descending, is the server's own. */
type SortKey = "VALUE" | "BREACH" | "SEVERITY";
type SortDir = "desc" | "asc";

const SORT_LABEL: Record<SortKey, string> = {
  VALUE: "value at stake",
  BREACH: "distance past the threshold",
  SEVERITY: "severity",
};

/** Highest first for each key, which is what "desc" means on this screen. */
const SORT_DESC_HINT: Record<SortKey, string> = {
  VALUE: "most money first",
  BREACH: "furthest past first",
  SEVERITY: "highest first",
};

const SORT_ASC_HINT: Record<SortKey, string> = {
  VALUE: "least money first",
  BREACH: "closest to the threshold first",
  SEVERITY: "lowest first",
};

/** How many rows show before the fold. */
const FOLD = 12;

const SEVERITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const UP_DOWN = String.fromCharCode(0x21c5); // up down arrow
const DOWN = String.fromCharCode(0x2193);
const UP = String.fromCharCode(0x2191);

export type ExceptionQueueProps = {
  rows: readonly ExceptionView[];
  /** Names the scope in the empty-state sentence, e.g. "SpeedStyle". */
  scopeLabel: string;
  /**
   * recommendation.id a deep link asked to land on, or null. It opens one
   * row; it filters nothing and it changes no order. An id that is not among
   * `rows` -- stale, or outside this session's scope -- simply matches
   * nothing, which is why there is no "not found" branch anywhere below.
   */
  initialOpenId?: number | null;
};

function matches(row: ExceptionView, filter: Filter): boolean {
  switch (filter) {
    case "STOCKOUT":
      return row.isStockout;
    case "OVERSTOCK":
      return !row.isStockout;
    case "HIGH":
      return row.severity === "HIGH";
    case "OPEN":
      return row.status === null;
    default:
      return true;
  }
}

/**
 * Everything about a row a search term could reasonably be aiming at: the
 * series, the action, and the pipeline's own sentence -- so "ACTV", "West"
 * and "availability" all find their rows. Lower-cased once per row rather
 * than once per keystroke per row.
 */
function haystack(row: ExceptionView): string {
  return [
    row.category,
    row.channel,
    row.region,
    row.actionLabel,
    row.rationale ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

// breachWeeks() used to live here, where only the sort could see it -- so the
// queue could be ordered by a distance the rows never printed. It is now in
// ./format beside the spellings, imported above by this file for the sort and
// applied on the server for the figure each row shows, which is the same
// function reaching both.

function severityRank(row: ExceptionView): number {
  return row.severity === null ? 0 : (SEVERITY_RANK[row.severity] ?? 0);
}

export function ExceptionQueue({
  rows,
  scopeLabel,
  initialOpenId = null,
}: ExceptionQueueProps) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("VALUE");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [panelOpen, setPanelOpen] = useState(false);
  // A deep link can name a row that ranks below the fold, and the fold is the
  // one thing standing between that link and the row it points at. Opening it
  // unfolds the list -- it hides nothing, filters nothing and reorders
  // nothing -- and only when the named row is actually there to be reached.
  // The reader can fold it back with the same button as ever.
  const [showAll, setShowAll] = useState(
    () =>
      initialOpenId !== null &&
      rows.findIndex((row) => row.id === initialOpenId) >= FOLD,
  );

  const isDefaultOrder = sortKey === "VALUE" && sortDir === "desc";

  const counts = useMemo(
    () => ({
      ALL: rows.length,
      STOCKOUT: rows.filter((r) => r.isStockout).length,
      OVERSTOCK: rows.filter((r) => !r.isStockout).length,
      HIGH: rows.filter((r) => r.severity === "HIGH").length,
      OPEN: rows.filter((r) => r.status === null).length,
    }),
    [rows],
  );

  const searchable = useMemo(
    () => rows.map((row) => ({ row, text: haystack(row) })),
    [rows],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const kept = searchable
      .filter(({ row }) => matches(row, filter))
      .filter(({ text }) => term === "" || text.includes(term))
      .map(({ row }) => row);

    if (isDefaultOrder) return kept;

    // The incoming order is the tiebreak, so two rows that cannot be
    // separated by the chosen key stay in their money order rather than
    // shuffling between renders.
    const position = new Map(kept.map((row, index) => [row, index]));
    const measure = (row: ExceptionView): number | null =>
      sortKey === "VALUE"
        ? row.valueAtStakeInr
        : sortKey === "BREACH"
          ? breachWeeks(row)
          : severityRank(row);

    return [...kept].sort((a, b) => {
      const left = measure(a);
      const right = measure(b);
      // A row with nothing to compare goes last in either direction.
      if (left === null && right === null) {
        return (position.get(a) ?? 0) - (position.get(b) ?? 0);
      }
      if (left === null) return 1;
      if (right === null) return -1;
      if (left !== right) return sortDir === "desc" ? right - left : left - right;
      return (position.get(a) ?? 0) - (position.get(b) ?? 0);
    });
  }, [searchable, filter, query, isDefaultOrder, sortKey, sortDir]);

  if (rows.length === 0) {
    return (
      <Card>
        <div className="px-[20px] py-[18px]">
          <div className="text-[13px] font-extrabold text-ink mb-[3px]">
            No exceptions are in your scope.
          </div>
          <p
            className="text-[12.5px] text-body leading-[1.6]"
            style={{ maxWidth: "88ch" }}
          >
            Nothing is raised against {scopeLabel} for the categories, channels
            and regions you own. That is a real answer, not a failed load: the
            queue is read with your own session, so it shows what you are
            accountable for and nothing else. A planner scoped to one region
            can legitimately see an empty list while the portfolio has plenty.
          </p>
        </div>
      </Card>
    );
  }

  const chips: ReadonlyArray<{ key: Filter; label: string }> = [
    { key: "ALL", label: `All ${formatCount(counts.ALL)}` },
    { key: "STOCKOUT", label: `Stockout ${formatCount(counts.STOCKOUT)}` },
    { key: "OVERSTOCK", label: `Overstock ${formatCount(counts.OVERSTOCK)}` },
    { key: "HIGH", label: `High ${formatCount(counts.HIGH)}` },
    { key: "OPEN", label: `Undecided ${formatCount(counts.OPEN)}` },
  ];

  const folded = showAll ? visible : visible.slice(0, FOLD);
  const hidden = visible.length - folded.length;

  const sortValue = (key: SortKey) => {
    // Same key twice flips the direction; a new key starts at its own
    // "highest first", which is the reading everyone means the first time.
    if (key === sortKey) {
      setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const restoreRanking = () => {
    setSortKey("VALUE");
    setSortDir("desc");
  };

  return (
    <>
      <div className="mb-[14px] flex flex-wrap items-center gap-[8px]">
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            pressed={filter === chip.key}
            onPressedChange={() => setFilter(chip.key)}
          >
            {chip.label}
          </Chip>
        ))}

        <div className="ml-auto flex items-center gap-[8px]">
          <label className="flex h-[38px] w-[300px] items-center gap-[9px] rounded-pill bg-white px-[15px] shadow-raised max-[1240px]:w-[220px]">
            <span aria-hidden="true" className="flex-none text-mute">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search series, region, or keyword..."
              aria-label="Search the exceptions in your scope"
              className="w-full bg-transparent text-[12px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-mute"
            />
          </label>

          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
            aria-controls="exception-sort-panel"
            aria-label={panelOpen ? "Hide the ordering options" : "Ordering options"}
            className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-pill shadow-raised transition-colors duration-[120ms] ${
              panelOpen || !isDefaultOrder
                ? "bg-ink text-white"
                : "bg-white text-body hover:bg-hover"
            }`}
          >
            <SlidersIcon />
          </button>
        </div>
      </div>

      {panelOpen ? (
        <div
          id="exception-sort-panel"
          className="mb-[14px] rounded-inner bg-white px-[16px] py-[13px] shadow-raised"
        >
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[8px]">
            <span className="text-label font-bold text-mute">Order by</span>
            {(["VALUE", "BREACH", "SEVERITY"] as const).map((key) => (
              <Chip
                key={key}
                pressed={sortKey === key}
                onPressedChange={() => sortValue(key)}
              >
                {SORT_LABEL[key]}
                {sortKey === key ? (
                  <span aria-hidden="true" className="ml-[6px]">
                    {sortDir === "desc" ? DOWN : UP}
                  </span>
                ) : null}
              </Chip>
            ))}
            {isDefaultOrder ? null : (
              <button
                type="button"
                onClick={restoreRanking}
                className="ml-auto rounded-pill bg-cream px-[11px] py-[6px] text-[11px] font-extrabold text-orangeD transition-colors duration-[120ms] hover:bg-peach"
              >
                Restore the value ranking
              </button>
            )}
          </div>
          <p className="mt-[9px] max-w-[92ch] text-small font-semibold leading-[1.55] text-mute">
            The list arrives ordered by value at stake, descending, because that
            is the order a planner can stop working down. The other two orders
            are here for reading the queue a different way -- they change
            nothing about which rows are in it, and pressing a key twice
            reverses it. Currently {SORT_LABEL[sortKey]},{" "}
            {sortDir === "desc" ? SORT_DESC_HINT[sortKey] : SORT_ASC_HINT[sortKey]}
            .
          </p>
        </div>
      ) : null}

      {isDefaultOrder ? null : (
        <p className="mb-[10px] flex flex-wrap items-baseline gap-x-[9px] text-[12px] font-semibold text-mute">
          <span>
            Ordered by {SORT_LABEL[sortKey]},{" "}
            {sortDir === "desc" ? SORT_DESC_HINT[sortKey] : SORT_ASC_HINT[sortKey]}
            , not by value at stake.
          </span>
          <button
            type="button"
            onClick={restoreRanking}
            className="font-bold text-orangeD underline underline-offset-2"
          >
            Restore the value ranking
          </button>
        </p>
      )}

      <Card>
        {visible.length === 0 ? (
          <div className="px-[20px] py-[18px] text-[12.5px] text-body leading-[1.6]">
            {query.trim() === ""
              ? "No row in your scope matches that filter. The other chips still have rows behind them."
              : `No row in your scope matches "${query.trim()}" under that filter. The search reads the series, the action and the rationale sentence -- nothing else about a row is text.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              {/*
                A real header row. The card layout had none, so every row had
                to re-label its own numbers -- which is a large part of why a
                row was 150px tall. Labelling once at the top is what buys the
                density, and the rank column is what makes the ordering legible
                without counting.
              */}
              <thead>
                <tr className="border-b border-rule bg-shell text-label font-extrabold text-mute">
                  <th className="py-[9px] pl-[18px] pr-[10px] text-left w-[42px]">
                    #
                  </th>
                  <th className="py-[9px] pr-[12px] text-left">Series</th>
                  <th className="py-[9px] pr-[12px] text-left">Action</th>
                  <th
                    className="py-[9px] pr-[12px] text-right whitespace-nowrap"
                    aria-sort={
                      sortKey === "VALUE"
                        ? sortDir === "desc"
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={() => sortValue("VALUE")}
                      className="inline-flex items-center gap-[5px] rounded-pill px-[6px] py-[2px] font-extrabold text-mute transition-colors duration-[120ms] hover:bg-hover hover:text-ink"
                    >
                      Value at stake
                      <span aria-hidden="true" className="text-[11px] leading-none">
                        {sortKey === "VALUE"
                          ? sortDir === "desc"
                            ? DOWN
                            : UP
                          : UP_DOWN}
                      </span>
                    </button>
                  </th>
                  <th className="py-[9px] pr-[12px] text-right whitespace-nowrap">
                    Cover / ceiling
                  </th>
                  <th className="py-[9px] pr-[12px] text-left">Why</th>
                  <th className="py-[9px] pr-[18px] text-right">Decision</th>
                </tr>
              </thead>
              <tbody>
                {folded.map((row, index) => (
                  <ExceptionTableRow
                    key={row.id ?? `row-${index}`}
                    row={row}
                    rank={index + 1}
                    initialOpen={row.id !== null && row.id === initialOpenId}
                  />
                ))}
              </tbody>
            </table>

            {hidden > 0 || showAll ? (
              <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[7px] px-[18px] py-[12px]">
                <button
                  type="button"
                  onClick={() => setShowAll((value) => !value)}
                  className="rounded-pill bg-cream px-[13px] py-[6px] text-[11.5px] font-extrabold text-ink transition-colors duration-[120ms] hover:bg-peach hover:text-orangeD"
                >
                  {showAll
                    ? `Show the first ${formatCount(FOLD)}`
                    : `Show all ${formatCount(visible.length)}`}
                </button>
                <span className="text-small font-semibold text-mute">
                  {showAll
                    ? `All ${formatCount(visible.length)} rows are listed.`
                    : `${formatCount(hidden)} more row${
                        hidden === 1 ? "" : "s"
                      } below this one${
                        isDefaultOrder ? ", each worth less than the last" : ""
                      }.`}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </>
  );
}

export default ExceptionQueue;
