"use client";

import { useId, useState, type ReactNode } from "react";

import type { AccuracyHeadline } from "@/lib/accuracy";

/**
 * ModelStrip
 *
 * WHY THIS EXISTS
 * ---------------
 * This is the component that stops StyleVerse reading as a database
 * front-end. A table of numbers with no provenance is a report; the same
 * numbers stamped with the model version that produced them, the moment
 * they were produced, and the confidence band they carry are a decision
 * you can argue with. Every core screen renders one, so a planner can
 * always answer three questions without leaving the page: which model
 * said this, when, and how sure was it. The "why" affordance carries the
 * fourth -- the reasoning -- one click away rather than in a separate
 * explainability tab nobody opens.
 *
 * It is deliberately quiet: one line, mute weight, no card. Provenance
 * should be omnipresent and unobtrusive, not a feature that demands
 * attention.
 *
 * Ports the visual language of `.mute`, `.pill` and `.quote` from the
 * production design system.
 */

export type ModelConfidence = "High" | "Medium" | "Low";

const CONFIDENCE_CLASS: Record<ModelConfidence, string> = {
  High: "bg-greenW text-green",
  Medium: "bg-amberW text-amber",
  Low: "bg-redW text-red",
};

export type ModelStripProps = {
  /** Registry identity, e.g. "ensemble_planning v4.2". Rendered monospace. */
  modelVersion: string;
  /**
   * When the numbers on this screen were produced. A Date is formatted in
   * `timeZone`; a string is rendered verbatim so a pre-formatted label such
   * as "Today 02:31" passes through untouched.
   */
  generatedAt: string | Date;
  /** Published confidence band. A Low band caps any opportunity grade. */
  confidence?: ModelConfidence;
  /**
   * Backtested accuracy, as the whole statement rather than a bare number.
   *
   * PART H, enforced by this type. The previous shape here was
   * `accuracyPct?: number`, which rendered "Accuracy 82.6%" alone -- the
   * one thing no screen may do. Every screen dodged it by remembering not
   * to pass the prop, which is a rule that holds only until the next screen
   * forgets. Taking AccuracyHeadline instead makes the bare form
   * unrepresentable: you cannot hand this strip a naked percentage, and
   * whatever you do hand it arrives with the seasonal-naive margin attached.
   */
  accuracy?: AccuracyHeadline;
  /** Expands under the strip when the reader asks why. */
  why?: ReactNode;
  /** IANA zone used to format a Date. Fixed so SSR and hydration agree. */
  timeZone?: string;
  className?: string;
};

function formatGeneratedAt(value: string | Date, timeZone: string): string {
  if (typeof value === "string") return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(value);
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-[3px] h-[3px] rounded-full bg-rule2 shrink-0"
    />
  );
}

export function ModelStrip({
  modelVersion,
  generatedAt,
  confidence,
  accuracy,
  why,
  timeZone = "Asia/Kolkata",
  className,
}: ModelStripProps) {
  const [open, setOpen] = useState<boolean>(false);
  const panelId = useId();

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px] bg-white rounded-full px-[16px] py-[9px] text-[11.5px] font-semibold text-mute">
        <span className="text-mute font-bold">Model</span>
        <span className="font-mono text-[11px] font-bold text-ink">
          {modelVersion}
        </span>

        <Dot />
        <span>
          Generated{" "}
          <span className="text-ink font-bold tabular-nums">
            {formatGeneratedAt(generatedAt, timeZone)}
          </span>
        </span>

        {confidence === undefined ? null : (
          <>
            <Dot />
            <span className="flex items-center gap-[6px]">
              Confidence
              <span
                className={`inline-block rounded-full px-[9px] py-[3px] text-[10.5px] font-extrabold whitespace-nowrap ${CONFIDENCE_CLASS[confidence]}`}
              >
                {confidence}
              </span>
            </span>
          </>
        )}

        {accuracy === undefined ? null : (
          <>
            <Dot />
            <span>
              Accuracy{" "}
              <span className="text-ink font-bold tabular-nums">
                {accuracy.headlinePct.toFixed(1)}%
              </span>{" "}
              {/* Never separated from the headline. Part H. */}
              <span className="text-ink font-bold tabular-nums">
                (+{accuracy.vsSeasonalNaivePoints.toFixed(1)} vs naive)
              </span>
            </span>
          </>
        )}

        {why === undefined ? null : (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((previous) => !previous)}
            className="ml-auto inline-flex items-center gap-[5px] rounded-full bg-cream hover:bg-hover px-[11px] py-[4px] text-[10.5px] font-extrabold text-orangeD transition-colors duration-[120ms]"
          >
            {open ? "Hide why" : "Why"}
            <span aria-hidden="true" className="text-[9px] leading-none">
              {open ? "^" : "v"}
            </span>
          </button>
        )}
      </div>

      {why === undefined ? null : (
        <div
          id={panelId}
          hidden={!open}
          className="bg-shell rounded-quote px-[14px] py-[11px] mt-[8px] max-w-[64ch] text-[12.5px] text-body leading-[1.55]"
        >
          {why}
        </div>
      )}
    </div>
  );
}
