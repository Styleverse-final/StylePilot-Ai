/**
 * The command centre's own skeleton.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM app/(app)/loading.tsx
 * ---------------------------------------------------------
 * The shared skeleton draws what fourteen of the fifteen screens are: a title,
 * a flat row of KPI figures, a chip row and a long table. The dashboard stopped
 * being that. Its header is a band of four cards about 140px tall, and under it
 * sit a hero, an agents panel and a twelve-row queue -- so the shared skeleton
 * was standing 90px short at the top and 300px wrong in the middle, and every
 * navigation to the landing screen ended with the content shoving itself into
 * place.
 *
 * A route group is how you give one page its own loading UI without giving it
 * its own URL: (dashboard) is a grouping folder, so the path is still "/".
 *
 * Same rules as the shared one: one animation on the root rather than one per
 * bar, and shapes at the real dimensions, because a skeleton that is the wrong
 * size is worse than none -- it promises a layout and then breaks it.
 */

function Bar({ w, h = 12 }: { w: string; h?: number }) {
  return (
    <div
      className="rounded-pill bg-rule"
      style={{ width: w, height: `${h}px` }}
    />
  );
}

/** One KPI card: tile and label, value, mark, basis. */
function KpiCardSkeleton() {
  return (
    <div className="rounded-card bg-white p-[14px]">
      <div className="flex items-center gap-[9px]">
        <div className="h-[30px] w-[30px] rounded-[10px] bg-rule" />
        <Bar w="96px" h={10} />
      </div>
      <div className="mt-[9px]">
        <Bar w="118px" h={20} />
      </div>
      <div className="mt-[11px]">
        <Bar w="100%" h={20} />
      </div>
      <div className="mt-[9px]">
        <Bar w="80%" h={10} />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading the command centre</span>

      {/* Title row: two-tone heading and strapline at left, dated card and
          Ask button at right. */}
      <div className="flex items-center gap-[22px] px-[8px] pb-[18px] pt-[22px]">
        <div>
          <Bar w="240px" h={24} />
          <div className="mt-[7px]">
            <Bar w="180px" h={9} />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-[10px]">
          <div className="h-[44px] w-[190px] rounded-inner bg-white" />
          <div className="h-[38px] w-[168px] rounded-pill bg-white" />
        </div>
      </div>

      {/* The KPI band. */}
      <div className="mb-[16px] grid grid-cols-4 gap-[12px] px-[8px] max-[1140px]:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>

      {/* Hero beside the agents panel. */}
      <div className="mb-[16px] grid grid-cols-[292px_1fr] gap-[16px] max-[1140px]:grid-cols-1">
        <div className="h-[268px] rounded-card bg-white" />
        <div className="h-[268px] rounded-card bg-white" />
      </div>

      {/* The queue: header, chip row, twelve rows at the real rhythm. */}
      <div className="overflow-hidden rounded-card bg-white">
        <div className="border-b border-rule px-[20px] py-[14px]">
          <Bar w="150px" h={13} />
          <div className="mt-[5px]">
            <Bar w="330px" h={9} />
          </div>
        </div>
        <div className="flex gap-[7px] border-b border-rule px-[20px] py-[11px]">
          {[92, 100, 76, 96].map((w, i) => (
            <div
              key={i}
              className="h-[27px] rounded-pill bg-cream"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-[14px] border-b border-rule px-[14px] py-[7px] last:border-b-0"
            style={{ height: "44px", opacity: Math.max(0.3, 1 - i * 0.05) }}
          >
            <Bar w={`${140 + ((i * 37) % 80)}px`} h={11} />
            <Bar w="110px" h={11} />
            <div className="ml-auto flex items-center gap-[14px]">
              <Bar w="70px" h={11} />
              <div className="h-[26px] w-[74px] rounded-pill bg-rule" />
              <div className="h-[26px] w-[86px] rounded-pill bg-cream" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
