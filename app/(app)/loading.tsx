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

/**
 * ONE ANIMATION, ON THE ROOT -- NOT SEVENTY-FIVE.
 *
 * animate-pulse used to sit on this Bar, so every bar in the skeleton ran its
 * own infinite opacity animation. At 75 bars that is 75 independent animations
 * on the compositor for the entire 1.1-1.8s a navigation takes, which is the
 * one moment the main thread is already busy streaming and hydrating the page
 * the reader asked for.
 *
 * They all pulse in unison anyway -- same duration, same start -- so a single
 * animation on the container is visually identical and costs one.
 */
function Bar({ w, h = 12 }: { w: string; h?: number }) {
  return (
    <div className="rounded-pill bg-rule" style={{ width: w, height: `${h}px` }} />
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
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

      {/* The filter chips above the table on /exceptions and /buy. Without a
          stand-in, 47px of chip row appears out of nothing and shoves the
          table down at the exact moment the reader starts reading it. */}
      <div className="mb-[16px] flex flex-wrap gap-[7px]">
        {[86, 104, 110, 78, 108].map((w, i) => (
          <div
            key={i}
            className="h-[31px] rounded-pill bg-white"
            style={{ width: `${w}px` }}
          />
        ))}
      </div>

      {/* The work itself: a table's worth of rows, at the real row rhythm.
          No border and no padding -- the real Card has neither, and painting
          them here means a 1px outline and 14px of inset vanish when the rows
          land. */}
      <div className="overflow-hidden rounded-card bg-white">
        <div className="flex items-center gap-[14px] border-b border-rule px-[14px] py-[9px]">
          <Bar w="8px" h={8} />
          <Bar w="180px" h={9} />
          <Bar w="90px" h={9} />
          <div className="ml-auto flex gap-[14px]">
            <Bar w="80px" h={9} />
            <Bar w="70px" h={9} />
          </div>
        </div>

        {/* 20 rows at 35px, matching the real table. It was 12 rows at 30px,
            so the skeleton stood 360px tall where the content arrives at 700px
            and the page grew under the reader on every navigation. */}
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-[14px] border-b border-rule px-[14px] py-[7px] last:border-b-0"
            style={{ height: "35px", opacity: Math.max(0.25, 1 - i * 0.04) }}
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
