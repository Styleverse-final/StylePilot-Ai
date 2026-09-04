import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * WHY CLICKING A TAB TWICE USED TO COST TWICE.
     *
     * Next's client router cache keeps the payload of a route you have
     * already visited, so going back to it is instant. Two defaults meant
     * this app never got that:
     *
     *   - `dynamic` has defaulted to 0 seconds since Next 15 -- no reuse at
     *     all for a route that is not statically generated. Every screen here
     *     is server-rendered per request against RLS-scoped queries, so every
     *     screen is dynamic.
     *   - adding app/(app)/loading.tsx turned the cache OFF for everything
     *     below the first loading boundary. That is the documented behaviour
     *     ("With loading.js ... Off by default"), and it is the price of the
     *     skeleton: the skeleton made the wait legible and guaranteed the
     *     wait happened every single time.
     *
     * So a planner clicking Workbench -> Exceptions -> Workbench paid three
     * full server renders for two distinct screens. Measured on production:
     * an RSC payload fetch, which is exactly what a tab click does, cost
     * 1,035-1,998ms -- barely less than loading the page cold.
     *
     * 30 seconds is the value Next itself shipped as the default until v15.
     *
     * IS STALE DATA A RISK HERE? No, and it is worth saying why rather than
     * hoping. Every write path in this app -- recordDecision, the buy
     * approvals, the governance and scenario actions -- calls revalidatePath
     * for the route it wrote to, which drops that entry from this cache. A
     * decision you just committed is never served from a stale payload. What
     * this does cache is a screen you looked at and came back to without
     * changing anything, which is the case that was costing a full render.
     *
     * This is not the same lever as the earlier round-trip work. That cut the
     * cost of a request; this removes the request.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
