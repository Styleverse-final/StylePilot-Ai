import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Banner, Card, CardBody, ModelStrip, PageHeader } from "@/components";
import type { KpiItem } from "@/components";
import { AttributeSpreadPanel } from "@/components/downstream/AttributeSpread";
import {
  CoveragePanel,
  PullForwardPanel,
  TransferPanel,
} from "@/components/downstream/Derivations";
import { FunctionCard } from "@/components/downstream/FunctionCard";
import { SourceLedger, ThresholdLedger } from "@/components/downstream/Provenance";
import {
  attributeSample,
  attributeSpreads,
  brandsOnScreen,
  correlationCut,
  dimensionPairs,
  getBrandNames,
  getCategoryNames,
  getHandoffRows,
  getSignalSeries,
  getThresholdParameters,
  groupRows,
  latestGeneratedAt,
  pullForwardChecks,
  requirementChecks,
  sellThroughRange,
  signalCoverage,
  sourceTables,
  thresholdUses,
  transferCandidates,
  transferChecks,
  weeksOnScreen,
  type HandoffRead,
  type SignalSeries,
  type ThresholdParameter,
} from "@/components/downstream/data";
import {
  FUNCTION_LABEL,
  FUNCTION_ORDER,
  formatTimestamp,
  plural,
} from "@/components/downstream/format";
import {
  CHECKS,
  LEXICON_TERMS,
  summariseReview,
} from "@/components/downstream/review";
import { getAccuracyHeadline, type AccuracyHeadline } from "@/lib/accuracy";
import { createServerAnonClient } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Downstream impact",
};

/**
 * DOWNSTREAM IMPACT
 *
 * The weekly handoff to the four functions that receive merchandising's
 * output: Design, Marketing, Retail Operations and Manufacturing. Every
 * sentence on this screen was written by the batch job into
 * downstream_handoff and is read here at request time through
 * createServerAnonClient(), so row level security decides which brands a
 * reader sees. A brand planner reads their own brand; a group CMPO reads
 * both. Nothing on this page reaches past that.
 *
 * WHAT THIS SCREEN IS FOR, BEYOND DISPLAYING ROWS
 * ----------------------------------------------
 * A handoff is the one artefact in this system read by somebody who will not
 * open the warehouse. That is its value and its danger: the figures arrive
 * already computed, already worded, and nobody downstream re-runs the query.
 * So the screen does three things a list of insights would not.
 *
 *   1. It prints the receipt. Every row shows its source_table and its
 *      supporting metric verbatim, under the sentence rather than behind a
 *      disclosure, because a receipt one click away is a receipt nobody reads.
 *   2. It argues with its own content. Rows that overclaim are rendered WITH
 *      the objection attached rather than dropped, so a reader can see what
 *      was questioned and disagree with the questioning.
 *   3. It repeats the arithmetic. Where a sentence divides two numbers that
 *      are both in the row, the division is done again on screen.
 *
 * THE ONE THAT MATTERS MOST
 * -------------------------
 * The Design rows are ATTRIBUTE OBSERVATIONS. They rank fabric, silhouette
 * and colour by sell-through over a closed window, and the measured spread
 * between best and worst is modest -- the panel computes the range from the
 * rows rather than asserting it. That supports "over-indexes", "appears more
 * often among the strongest sellers". It does not support "drives", "causes"
 * or "will lift", because nothing in the window was held still while it was
 * measured, and in some dimensions the attribute at the top of sell-through
 * is also the one that was discounted hardest. The panel says so, per
 * dimension, computed.
 *
 * PART H
 * ------
 * Accuracy appears here only through <ModelStrip accuracy={AccuracyHeadline}/>
 * and only when a single brand is in scope: two registry entries with
 * different fold counts have no mean, and inventing one is the exact failure
 * the accuracy module exists to prevent. Most of these rows are queries over
 * a closed window rather than model output, and the strip's why panel says
 * which ones are not.
 */

function Explain({ children }: { children: ReactNode }) {
  return (
    <Card className="mb-[16px]">
      <CardBody>
        <p className="max-w-[92ch] text-copy leading-[1.6] text-body">{children}</p>
      </CardBody>
    </Card>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-[8px] pb-[14px] pt-[26px]">
      <div className="text-small font-bold text-mute">{eyebrow}</div>
      <h2 className="mt-[2px] text-hero font-extrabold text-ink">{title}</h2>
      {children === undefined ? null : (
        <p className="mt-[7px] max-w-[92ch] text-copy leading-[1.6] text-body">
          {children}
        </p>
      )}
    </div>
  );
}

/** Header figures, all counted from the rows that came back. */
function headerKpis(
  read: HandoffRead,
  functions: number,
  flagged: number,
  marked: number,
): KpiItem[] {
  const brands = brandsOnScreen(read.rows);
  return [
    {
      label: "Insights in scope",
      value: String(read.rows.length),
      pill: `${plural(brands.length, "brand", "brands")}`,
    },
    {
      label: "Functions covered",
      value: `${functions} / ${FUNCTION_ORDER.length}`,
    },
    {
      // Counts EVERY row that renders a mark, flag or note, because that is
      // what the label says and what a reader sees on the cards. It used to
      // count flags alone while the cards also marked notes, so the number
      // under-reported its own screen.
      label: "Rendered with an objection",
      value: String(marked),
      tone: flagged > 0 ? "amber" : marked > 0 ? "violet" : "grey",
      pill:
        flagged > 0
          ? `${flagged} flagged, ${marked - flagged} noted`
          : marked > 0
            ? "notes only"
            : "none",
    },
  ];
}

export default async function DownstreamPage() {
  const sb = await createServerAnonClient();

  let read: HandoffRead = { rows: [], unknownFunctions: [], returned: 0 };
  let brandNames: Record<string, string> = {};
  let categoryNames: Record<string, string> = {};
  let parameters: ThresholdParameter[] = [];
  let series: SignalSeries[] = [];
  let headlines: AccuracyHeadline[] = [];
  let readError: string | null = null;

  // THREE OF THE FIVE READS BELOW NEED NOTHING FROM THE HANDOFF ROWS.
  //
  // getBrandNames, getCategoryNames and the registry are dimension and
  // annotation reads with no brand filter, yet they sat inside a Promise.all
  // that could not start until getHandoffRows had returned. Starting them here
  // overlaps them with the gate read entirely. The other two stay where they
  // are: getThresholdParameters and getSignalSeries take brandIds, and that
  // narrowing is what stops them widening past what RLS returned.
  //
  // .catch() at creation, so a rejection cannot escape unhandled in the window
  // before its await. The try/catch below still decides what a failure means.
  const brandsPromise = getBrandNames(sb).catch(() => ({}) as Record<string, string>);
  const categoriesPromise = getCategoryNames(sb).catch(() => ({}) as Record<string, string>);
  const registryPromise = getAccuracyHeadline(sb).catch(() => [] as AccuracyHeadline[]);

  try {
    // The handoff read comes first and alone, because everything after it is
    // scoped to the brands it returned. Deriving that list from the rows
    // rather than from the reader's role is what stops the threshold ledger
    // and the completeness check widening past what row level security has
    // already decided this reader may see: policy_parameter is readable by
    // any authenticated user, so an unfiltered read there would print a
    // threshold for a brand whose insights had been withheld.
    read = await getHandoffRows(sb);
    const brandIds = brandsOnScreen(read.rows);

    const [brands, categories, params, signals, registry] = await Promise.all([
      brandsPromise,
      categoriesPromise,
      getThresholdParameters(sb, brandIds),
      getSignalSeries(sb, brandIds),
      registryPromise,
    ]);

    brandNames = brands;
    categoryNames = categories;
    parameters = params;
    series = signals;
    headlines = registry;
  } catch (error) {
    readError = error instanceof Error ? error.message : String(error);
  }

  const rows = read.rows;
  const brandIds = brandsOnScreen(rows);
  const brandLabel = (brandId: string | null): string =>
    brandId === null ? "Brand not recorded" : (brandNames[brandId] ?? brandId);
  const categoryLabel = (categoryId: string): string =>
    categoryNames[categoryId] ?? categoryId;

  const structural = CHECKS.filter((check) => check.kind === "structural");
  const lexicalChecks = CHECKS.filter((check) => check.kind === "lexical");
  const groups = groupRows(rows, FUNCTION_ORDER);
  const review = summariseReview(rows.map((row) => row.review));
  const spreads = attributeSpreads(rows);
  const pairs = dimensionPairs(spreads);
  const sources = sourceTables(rows);
  const uses = thresholdUses(rows, parameters);
  const cut = correlationCut(rows);
  const coverage = signalCoverage(rows, series, cut);
  const missingCoverage = coverage.filter(
    (row) => row.namedIn === null && row.qualifies === true,
  );
  const isoWeeks = weeksOnScreen(rows);
  const generatedAt = latestGeneratedAt(rows);

  // Which cards the flags are in, so the banner can point rather than warn.
  const flaggedIn = [
    ...new Set(
      rows
        .filter((row) => row.review.some((mark) => mark.level === "flag"))
        .map((row) => FUNCTION_LABEL[row.fn]),
    ),
  ];

  // One brand on screen, one registry entry: only then does a single accuracy
  // figure describe what the reader is looking at. Two brands get none, and
  // the strip says why rather than quietly averaging them.
  const accuracy =
    brandIds.length === 1
      ? (headlines.find((headline) => headline.brandId === brandIds[0]) ?? null)
      : null;

  const stripVersion =
    isoWeeks.length === 1
      ? `downstream_handoff batch ${isoWeeks[0]}`
      : `downstream_handoff batch (${plural(isoWeeks.length, "week", "weeks")})`;

  return (
    <>
      <PageHeader
        eyebrow="Cross-functional"
        title="Downstream impact"
        kpis={
          rows.length > 0
            ? headerKpis(read, groups.length, review.flagged, review.marked)
            : undefined
        }
      />

      <Banner
        variant="violet"
        icon={<span aria-hidden="true">&rarr;</span>}
        title="Merchandising decisions are inputs to four other functions."
        measureCh={96}
      >
        A demand read that stays inside planning is worth a fraction of one
        that reaches Design&apos;s brief, Marketing&apos;s calendar, Retail&apos;s
        cover and Manufacturing&apos;s capacity call. These are generated
        weekly and delivered as structured handoffs, not meeting notes &mdash;
        which is why each one travels with the table it was computed from and
        the arithmetic that produced it. The reader of a handoff is the one
        person in this system who will not re-run the query.
      </Banner>

      {readError ? (
        <Explain>
          The handoff could not be read: {readError}. Nothing has been hidden
          or approximated &mdash; the screen is showing you the failure rather
          than an empty set of cards, which would look exactly like a quiet
          week in which the four functions were sent nothing.
        </Explain>
      ) : rows.length === 0 ? (
        <Explain>
          No handoff rows are readable in your scope. That is a legitimate
          state rather than an error: downstream_handoff is filtered to the
          brand on your planner record, and a group CMPO or CoE admin reads
          every brand. What would appear here is four cards &mdash; Design,
          Marketing, Retail Operations and Manufacturing &mdash; each holding
          this week&apos;s insights for the brands you can see, every one of
          them stamped with the table it was computed from and the metric
          string behind the sentence.
          {read.returned > 0 ? (
            <>
              {" "}
              The read did return {plural(read.returned, "row", "rows")}, but
              none of them carries one of the four function values this screen
              knows how to render, so none is shown under a heading invented
              for it.
            </>
          ) : null}
        </Explain>
      ) : (
        <>
          {read.unknownFunctions.length > 0 ? (
            <Banner
              variant="amber"
              icon="!"
              title="The batch job is writing a function this screen does not render"
              measureCh={96}
            >
              {read.unknownFunctions.join(", ")} came back from the read and is
              not one of the four functions below, so those rows are not
              rendered: putting them under a heading this screen invented would
              be worse than saying they exist and are missing. Somebody who
              owns the pipeline needs to say which function that is and who
              receives it.
            </Banner>
          ) : null}

          {review.flagged > 0 ? (
            <Banner
              variant="amber"
              icon="!"
              title={`${plural(review.flagged, "row is", "rows are")} rendered with an objection attached`}
              measureCh={96}
            >
              Every insight below was checked against its own supporting metric
              before it reached this page, and{" "}
              {plural(review.flagged, "row", "rows")} of {review.scanned} did
              not survive the check cleanly
              {flaggedIn.length > 0 ? (
                <>
                  , {flaggedIn.length === 1 ? "all of them in the" : "across the"}{" "}
                  {flaggedIn.join(" and ")}{" "}
                  {flaggedIn.length === 1 ? "card" : "cards"}
                </>
              ) : null}
              . They are shown anyway, with the objection directly beneath at
              the same size. Withholding them
              would leave you unable to see what was suppressed or to disagree
              with the suppression; passing them through unmarked would make
              this screen the last place a wrong claim could have been caught
              and wasn&apos;t. What each check does, and what it cannot do, is
              set out further down.
            </Banner>
          ) : null}

          <SectionHeading
            eyebrow="Design and creative"
            title="Attribute rows are observations, not instructions"
          >
            This is the handoff a reader most wants to turn into a rule, and
            the measurement underneath it will not carry one. Read this panel
            before the Design card: it draws the measured spread between the
            best and worst level of each dimension, and then asks the question
            that decides how much the ranking is worth &mdash; whether the
            attribute at the top of sell-through is also the one that was
            marked down hardest.
          </SectionHeading>

          <AttributeSpreadPanel
            spreads={spreads}
            pairs={pairs}
            range={sellThroughRange(spreads)}
            sample={attributeSample(spreads)}
            brandLabel={brandLabel}
            brandCount={brandIds.length}
          />

          <SectionHeading
            eyebrow="The weekly handoff"
            title={
              groups.length === FUNCTION_ORDER.length
                ? "All four functions, as they would be sent"
                : `${plural(groups.length, "function", "functions")}, as they would be sent`
            }
          >
            Grouped by function and then by brand, in the order the pipeline
            wrote them. Under every sentence sits the table it was computed
            from and the metric string it was computed with, because those two
            are what make it possible for the receiving function to argue.
            {isoWeeks.length === 1 ? (
              <>
                {" "}
                Everything here is {isoWeeks[0]}; a card holding a different
                week would say so on the row.
              </>
            ) : (
              <>
                {" "}
                The rows on screen span {isoWeeks.join(", ")}, and each row
                carries its own week beside its source.
              </>
            )}
          </SectionHeading>

          <div className="grid grid-cols-2 items-start gap-[16px] max-[1140px]:grid-cols-1">
            {groups.map((group) => (
              <FunctionCard
                key={group.fn}
                group={group}
                brandLabel={brandLabel}
                showBrands={brandIds.length > 1}
              />
            ))}
          </div>

          <SectionHeading
            eyebrow="Checked against themselves"
            title="The arithmetic inside the sentences, done again"
          >
            Three of these claims can be checked without leaving the row: a
            pull-forward is a lead time&apos;s share of a horizon, a transfer
            is a gap between one store&apos;s cover and its regional median at
            that store&apos;s own sell rate, and a channel split either
            accounts for the whole requirement or it does not. Each is
            recomputed below from the same metric string that is printed under
            the sentence, so a disagreement here would be about arithmetic
            rather than about which copy of the data is fresher.
            {missingCoverage.length > 0 ? (
              <>
                {" "}
                The last panel asks the opposite question &mdash; whether a
                sentence is missing &mdash; and finds{" "}
                {plural(missingCoverage.length, "category", "categories")} that
                {missingCoverage.length === 1 ? " qualifies" : " qualify"} for a
                campaign window and{" "}
                {missingCoverage.length === 1 ? "is" : "are"} named nowhere.
              </>
            ) : null}
          </SectionHeading>

          <PullForwardPanel
            checks={pullForwardChecks(rows)}
            requirements={requirementChecks(rows)}
            brandLabel={brandLabel}
          />

          <TransferPanel
            checks={transferChecks(rows)}
            candidates={transferCandidates(rows)}
            brandLabel={brandLabel}
          />

          <CoveragePanel
            rows={coverage}
            cut={cut}
            brandLabel={brandLabel}
            categoryLabel={categoryLabel}
          />

          <Card className="mb-[16px]">
            <CardBody>
              <p className="max-w-[96ch] text-copy leading-[1.6] text-body">
                <span className="font-bold text-ink">
                  What the editorial check is, and what it is not.
                </span>{" "}
                Every row was put through {CHECKS.length} tests before it
                reached this page.{" "}
                {structural.length === 1 ? "One is" : `${structural.length} are`}{" "}
                structural, working only from fields the row already carries:
                one {structural.map((check) => check.what).join("; one ")}. None
                of them reaches outside the row, so none can be wrong about
                what it compares. The
                remaining {lexicalChecks.length === 1 ? "one" : lexicalChecks.length}{" "}
                {lexicalChecks.length === 1 ? "is" : "are"} a word list,
                matched against the sentence:{" "}
                <span className="font-mono text-[11px] text-ink2">
                  {LEXICON_TERMS.join(", ")}
                </span>
                . A word list is blunt in both directions. It will miss a
                causal claim phrased without any of those words, and it will
                fire on an innocent sentence that happens to use one. It is
                reported here rather than presented as a guarantee, because a
                check whose limits are hidden reads as one.{" "}
                {review.flagged === 0
                  ? "Nothing in this week's rows matched, which is a fact about this week rather than a property of the pipeline."
                  : `${plural(review.flagged, "row", "rows")} of ${review.scanned} carry a flag and ${plural(review.noted, "row", "rows")} carry a note; the difference is that a flag says the sentence claims more than the metric supports, and a note says the figure is sound but easy to read as something it is not.`}
              </p>
            </CardBody>
          </Card>

          <SectionHeading
            eyebrow="Provenance"
            title="Where each sentence came from, and whether you could check it"
          >
            source_table is the most valuable column in this table and the
            easiest to render uselessly. It names the tables the offline
            scoring job read, in the pipeline&apos;s own names, and several of
            those have no counterpart in the schema this application can query
            &mdash; so the ledger says which, rather than leaving a reader to
            go looking for a table that is not there.
          </SectionHeading>

          <SourceLedger sources={sources} />
          <ThresholdLedger uses={uses} />

          <ModelStrip
            className="mt-[16px]"
            modelVersion={stripVersion}
            generatedAt={formatTimestamp(generatedAt)}
            accuracy={accuracy ?? undefined}
            why={
              <>
                The timestamp is the batch run that WROTE these rows, not a
                training run and not the moment you loaded the page. There is
                no model call behind this screen: the insights and their
                supporting metrics are read from downstream_handoff, and the
                figures derived on screen are recomputed from those same rows.
                A handful of thresholds and labels are authored and marked
                where they appear &mdash; this used to say downstream_handoff
                and nothing else produced a number here, which was not true.
                Most of these sentences are queries over a window that has
                already closed &mdash; a sell-through ranking, an availability
                ratio, a store&apos;s cover &mdash; and a query over closed
                weeks has no forecast accuracy to quote, because it is not
                forecasting anything.{" "}
                {accuracy
                  ? `The one place the model does reach this screen is the capacity requirement, which is the sum of that brand's buy recommendations; the accuracy shown is the registry entry for ${accuracy.modelVersion}, quoted with the margin over seasonal naive attached, because the headline alone would overstate how much of that requirement rests on the model being right.`
                  : brandIds.length > 1
                    ? `The capacity requirement is the one figure here that descends from the model, and ${plural(brandIds.length, "brand is", "brands are")} in scope, so no accuracy is shown: separate registry entries do not have a mean, and printing one brand's would silently describe the other's rows too.`
                    : "The capacity requirement is the one figure here that descends from the model, and no registry entry is readable in your scope, so no accuracy is shown rather than an approximate one."}
              </>
            }
          />
        </>
      )}
    </>
  );
}
