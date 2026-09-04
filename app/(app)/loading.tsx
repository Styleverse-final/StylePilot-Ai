/**
 * The skeleton every screen in this segment shows while it renders.
 *
 * WHY THIS EXISTS
 * ---------------
 * These pages are server-rendered against live, RLS-scoped queries, so a
 * navigation takes between one and five seconds depending on whether the
 * lambda is warm. Without a loading file, Next holds the PREVIOUS page on
 * screen for that entire time with nothing moving: the tab you clicked does
 * not light up, no spinner appears, and the app reads as broken rather than
 * busy. That is a perception problem, not a performance one, and it is fixed
 * separately from the latency itself.
 *
 * This does not make anything faster. It makes the wait legible: the header
 * shape and the row rhythm appear immediately, the nav responds, and the
 * content fills in underneath. A reader can tell the difference between "it
 * is working" and "it is stuck", which they currently cannot.
 *
 * DELIBERATELY NOT A SPINNER. A spinner says only that something is
 * happening. A skeleton in the shape of the page says what is coming, so the
 * eye is already in the right place when the rows land -- and on screens that
 * are mostly a table, the shape is the useful part.
 */

function Bar({ w, h = 12 }: { w: string; h?: number }) {
  return (
    <div
      className="animate-pulse rounded-pill bg-rule"
      style={{ width: w, height: `${h}px` }}
    />
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading this screen</span>

      {/* The page header: eyebrow, title, then a row of KPI blocks. */}
      <div className="mb-[18px]">
        <Bar w="140px" h={10} />
        <div className="mt-[9px]">
          <Bar w="230px" h={22} />
        </div>
        <div className="mt-[15px] flex flex-wrap gap-[26px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <Bar w="92px" h={9} />
              <div className="mt-[6px]">
                <Bar w="118px" h={18} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The work itself: a table's worth of rows, at the real row rhythm. */}
      <div className="rounded-card border border-rule bg-white px-[14px] py-[10px]">
        <div className="flex items-center gap-[14px] border-b border-rule pb-[9px]">
          <Bar w="8px" h={8} />
          <Bar w="180px" h={9} />
          <Bar w="90px" h={9} />
          <div className="ml-auto flex gap-[14px]">
            <Bar w="80px" h={9} />
            <Bar w="70px" h={9} />
          </div>
        </div>

        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-[14px] border-b border-rule py-[9px] last:border-b-0"
            style={{ opacity: Math.max(0.25, 1 - i * 0.06) }}
          >
            <Bar w="8px" h={8} />
            <Bar w={`${150 + ((i * 37) % 90)}px`} h={11} />
            <Bar w="72px" h={11} />
            <div className="ml-auto flex gap-[14px]">
              <Bar w="86px" h={11} />
              <Bar w="64px" h={11} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
