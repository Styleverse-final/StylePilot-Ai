# StyleVerse AI -- Performance Audit & Enhancement Guide

This document captures the empirical performance baseline of the StyleVerse AI web platform and outlines concrete, prioritized engineering recommendations to further optimize response latencies, database load, and client-side rendering.

---

## 1. Empirical Performance Baseline

The baseline was established via end-to-end automated profiling on **Next.js 16 (Turbopack)** deployed to **Vercel Mumbai (`bom1`)** communicating with **Supabase PostgreSQL in AWS Mumbai (`ap-south-1`)**.

### Summary Matrix

| Metric Area | Measured Value | Standard / Target | Status |
| :--- | :--- | :--- | :---: |
| **Turbopack Build Time** | 3.4s compilation + 9.4s types | < 30s | 🟢 Exceptional |
| **Total Client Static Bundle** | 0.89 MB (770 KB JS, 44.9 KB CSS) | < 1.5 MB | 🟢 Lean |
| **Production Server Latency** | 205ms – 710ms across 17 routes | < 1000ms | 🟢 Sub-second |
| **Concurrency & Throughput** | 13.4 – 29.3 req/s (10 clients) | 100% 200 OK | 🟢 Resilient |
| **First Contentful Paint (FCP)** | 748ms (Public) / 1,308ms (Dashboard) | < 1.8s (Google Good) | 🟢 Fast |
| **Client JS Heap Size** | 2.59 MB (Login) / 16.29 MB (Dashboard)| < 50 MB | 🟢 Low Memory |

---

### Route Latency Profile (Production vs Localhost)

Tested with live authenticated Supabase SSR sessions (`EMP-SPD-0001` & `EMP-SPD-0067`):

| Route / Screen | Auth Scope | Payload | Vercel (`bom1`) TTFB | Vercel Total Latency | Local Dev (Cross-region) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`/login`** | Public | 13.2 KB | **146 ms** | **238 ms** | 432 ms |
| **`/` (Command Centre)** | Planner | 137.4 KB | **222 ms** | **548 ms** | 2,377 ms |
| **`/portfolio`** | Planner / CMPO | 48.0 KB | **174 ms** | **205 ms** | 1,134 ms |
| **`/workbench`** | Planner | 101.8 KB | **240 ms** | **408 ms** | 2,272 ms |
| **`/signals`** | Planner | 245.2 KB | **503 ms** | **710 ms** | 2,181 ms |
| **`/buy` (Approvals)** | Planner | 229.2 KB | **189 ms** | **594 ms** | 1,333 ms |
| **`/allocation`** | Planner | 107.8 KB | **209 ms** | **348 ms** | 1,321 ms |
| **`/markdown`** | Planner | 125.4 KB | **202 ms** | **512 ms** | 2,855 ms |
| **`/exceptions`** | Planner | 138.2 KB | **270 ms** | **458 ms** | 1,599 ms |
| **`/scenarios`** | Planner | 122.7 KB | **252 ms** | **682 ms** | 2,829 ms |
| **`/learning`** | Planner | 89.4 KB | **248 ms** | **306 ms** | 1,543 ms |
| **`/adoption`** | Planner | 170.2 KB | **250 ms** | **435 ms** | 1,346 ms |
| **`/governance`** | Planner | 281.0 KB | **174 ms** | **378 ms** | 6,303 ms |
| **`/downstream`** | Planner | 248.9 KB | **278 ms** | **419 ms** | 3,901 ms |
| **`/model-ops`** | Planner | 336.5 KB | **239 ms** | **439 ms** | 3,475 ms |
| **`/api/cron/agents`** | Cron Key | 0 KB | **124 ms** | **124 ms** | 132 ms |
| **`/icon.svg`** | Static | 0.5 KB | **70 ms** | **70 ms** | 5 ms |

---

## 2. Prioritized Enhancement Roadmap

```
+-------------------------------------------------------------------------+
| Tier 1: Database & Query Latency Optimization (Immediate 30-50% cut)    |
|   - Point lookup for identity in AppLayout (eliminate 450-row scan)     |
|   - Single-wave fetch for getSignalWeeks (PAGE_SIZE = 2000)             |
|   - In-memory tag caching for recommendation count pip                  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Tier 2: Shell & Middleware Overhead Reductions                          |
|   - Fast-path for Next.js router prefetch headers in proxy.ts           |
|   - Token expiry window check before calling GoTrue getUser()           |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Tier 3: React 19 Streaming & Progressive Hydration                      |
|   - Stream Header & KPIs immediately in chunk 1                         |
|   - Wrap secondary data panels in <Suspense fallback={<CardSkeleton />}>|
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Tier 4: Client Bundle & Runtime Hygiene                                 |
|   - Dynamic import for Copilot Drawer ({ ssr: false })                  |
|   - Add "type": "module" to package.json to remove postcss warning      |
+-------------------------------------------------------------------------+
```

---

## 3. Detailed Technical Recommendations

### Tier 1: High-Impact Database & Query Optimizations

#### Recommendation 1.1: Replace Full Table Scan in `AppLayout` with Indexed Point Lookups
- **File**: [`app/(app)/layout.tsx`](file:///c:/Antigravity/StylePilot-Ai/app/%28app%29/layout.tsx#L61-L75)
- **Current Behavior**:
  ```ts
  const [adoption, brands] = await Promise.all([
    sb.from("planner_adoption").select("employee_id, role"),
    sb.from("dim_brand").select("brand_id, brand_name"),
  ]);
  ```
  Every request loads all 450 employee records across the network, just so JavaScript can do `.find(r => r.employee_id === planner.employeeId)`.
- **Proposed Change**:
  Resolve `planner` first (or use its cached session state), and query only the exact matching row:
  ```ts
  const [roleResult, brandResult] = await Promise.all([
    sb.from("planner_adoption")
      .select("role")
      .eq("employee_id", planner.employeeId)
      .maybeSingle(),
    sb.from("dim_brand")
      .select("brand_name")
      .eq("brand_id", planner.brandId)
      .maybeSingle(),
  ]);

  const welcomeRole = roleResult.data?.role ?? null;
  const welcomeCompany = brandResult.data?.brand_name ?? null;
  ```
- **Estimated Gain**: Slashes network payload and query execution time by ~30–60ms on every screen render.

---

#### Recommendation 1.2: Collapse `getSignalWeeks` Pagination into a Single Query
- **File**: [`components/signals/data.ts`](file:///c:/Antigravity/StylePilot-Ai/components/signals/data.ts#L35-L75)
- **Current Behavior**:
  ```ts
  const PAGE_SIZE = 1000;
  ```
  The dataset has 1,248 signal rows. `readAll` makes an initial request for rows `0..999`, receives 1,000 rows, and then initiates a **second sequential round-trip** for rows `1000..1999`.
- **Proposed Change**:
  Set `PAGE_SIZE = 2000` (or `1500`). PostgREST handles 2,000 rows comfortably within a single response.
  ```ts
  const PAGE_SIZE = 2000;
  ```
- **Estimated Gain**: Eliminates an entire sequential HTTP round-trip on `/signals`, reducing total latency from **~710ms down to ~450ms (~35% reduction)**.

---

#### Recommendation 1.3: Tagged Cache for the Exception Pip Count
- **File**: [`app/(app)/layout.tsx`](file:///c:/Antigravity/StylePilot-Ai/app/%28app%29/layout.tsx#L37-L50)
- **Current Behavior**:
  `countExceptions()` issues an exact `count` query on `recommendation` table where `rec_type = 'EXCEPTION'` on every navigation.
- **Proposed Change**:
  Wrap `countExceptions` using Next.js `unstable_cache`:
  ```ts
  import { unstable_cache } from 'next/cache';

  const getCachedExceptionCount = unstable_cache(
    async () => {
      const sb = await createServerAnonClient();
      const { count } = await sb
        .from("recommendation")
        .select("id", { count: "exact", head: true })
        .eq("rec_type", "EXCEPTION");
      return count ?? undefined;
    },
    ['exception-badge-count'],
    { revalidate: 60, tags: ['exceptions-count'] }
  );
  ```
  In server actions where decisions are committed (`recordDecision`), call `revalidateTag('exceptions-count')`.
- **Estimated Gain**: Removes 1 database query from the layout on all internal tab switches.

---

### Tier 2: Shell & Proxy/Middleware Overhead Reductions

#### Recommendation 2.1: Router Prefetch Fast-Path in `proxy.ts`
- **File**: [`proxy.ts`](file:///c:/Antigravity/StylePilot-Ai/proxy.ts#L95)
- **Current Behavior**:
  Next.js router emits prefetch requests when links hover into view. `proxy.ts` calls `supabase.auth.getUser()` on every request, executing a remote HTTPS request to Supabase GoTrue Auth service.
- **Proposed Change**:
  Inspect the request headers:
  ```ts
  const isPrefetch = request.headers.get('next-router-prefetch') === '1' ||
                     request.headers.get('purpose') === 'prefetch';
  ```
  If `isPrefetch` is true, check cookie presence and decode the JWT locally to verify that expiration (`exp`) is in the future, bypassing the remote GoTrue network call.
- **Estimated Gain**: Prefetch requests drop from **~150ms to < 20ms**, making tab switches perceive as instantaneous.

---

### Tier 3: React 19 Streaming & Progressive Hydration

#### Recommendation 3.1: Granular `<Suspense>` Boundaries for Heavy Cards
- **Files**: [`app/(app)/signals/page.tsx`](file:///c:/Antigravity/StylePilot-Ai/app/%28app%29/signals/page.tsx), [`app/(app)/page.tsx`](file:///c:/Antigravity/StylePilot-Ai/app/%28app%29/page.tsx)
- **Current Architecture**:
  The page components await all queries (`readSignalScope`, `getAccuracyHeadline`, etc.) at the top of the component before emitting any JSX.
- **Proposed Architecture**:
  Return the PageHeader, Summary KPI row, and layout shell immediately. Move secondary, complex visual panels (`SignalHistory`, `EvidenceTabs`, `AccuracyPanel`) into asynchronous Server Components wrapped in `<Suspense fallback={<CardSkeleton />}>`.
- **Estimated Gain**:
  - **TTFB drops to < 180ms**.
  - **First Contentful Paint (FCP) drops from 1,308ms to ~380ms**.

---

### Tier 4: Client Bundle & Runtime Hygiene

#### Recommendation 4.1: Lazy-Load the Copilot Drawer
- **File**: [`app/(app)/layout.tsx`](file:///c:/Antigravity/StylePilot-Ai/app/%28app%29/layout.tsx#L4)
- **Current Behavior**:
  The Copilot drawer includes markdown parsing, stream decoders, and keyboard shortcuts loaded on every page upfront.
- **Proposed Change**:
  Use `next/dynamic` to load the drawer component only when activated (or on idle):
  ```tsx
  import dynamic from "next/dynamic";

  const CopilotDrawer = dynamic(
    () => import("@/components/CopilotDrawer").then((mod) => mod.CopilotDrawer),
    { ssr: false }
  );
  ```
- **Estimated Gain**: Cuts ~45 KB of client JavaScript from the critical hydration path.

#### Recommendation 4.2: Add `"type": "module"` in `package.json`
- **File**: [`package.json`](file:///c:/Antigravity/StylePilot-Ai/package.json)
- **Current Behavior**:
  During `next build`, Node issues a warning that `postcss.config.js` is typeless and must be reparsed as an ES module.
- **Proposed Change**:
  Add `"type": "module"` to `package.json`.
- **Estimated Gain**: Eliminates build-time module resolution warnings and optimizes Turbopack startup.

---

## 4. Implementation Effort vs Impact Matrix

| Recommendation | Category | Implementation Effort | Latency Impact | Risk |
| :--- | :---: | :---: | :---: | :---: |
| **1.1 Scope `AppLayout` Identity Lookups** | Database | Low (15 mins) | High (-40ms all routes) | Zero |
| **1.2 Single-Wave `PAGE_SIZE = 2000`** | Database | Low (5 mins) | High (-260ms on `/signals`) | Zero |
| **1.3 Cache Nav Exception Count** | Cache | Medium (30 mins) | Medium (-30ms tab switches) | Low |
| **2.1 Prefetch Fast-Path in `proxy.ts`** | Middleware | Medium (45 mins) | High (-130ms on prefetches) | Low |
| **3.1 `<Suspense>` Streaming Boundaries** | Frontend | Medium (1 hour) | High (-800ms to first paint) | Low |
| **4.1 Dynamic Copilot Drawer** | Bundle | Low (15 mins) | Medium (-45 KB client JS) | Zero |
| **4.2 `"type": "module"` in `package.json`**| Tooling | Low (2 mins) | Low (Cleaner builds) | Zero |

---

*Authored following empirical performance profiling on StyleVerse AI (Next.js 16 / Supabase).*
