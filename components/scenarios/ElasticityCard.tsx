import { Pill } from "@/components/Pill";

import { formatUnits } from "./format";
import type { CategoryBase } from "./model";

/**
 * The fitted curve, category by category, with the evidence behind each row.
 *
 * Elasticity here is estimated from observed promotions, not assumed, and
 * the table says so by showing the things that would let a merchant argue
 * with it: the coefficient the scenario actually multiplies by, the
 * category's OWN r-squared, the number of promotions behind it, and whether
 * the row shipped the pooled coefficient instead of its own fit.
 *
 * The pooled flag is the point of the panel. A category whose regression did
 * not clear the pipeline's defensibility floor borrows the brand-wide curve,
 * and its own weak r-squared is kept on the row rather than replaced by the
 * pooled one -- so the table shows both the number that shipped and the
 * evidence that forced the substitution. On this dataset exactly one row
 * carries it, and this screen names it wherever its answer is used.
 */

export type ElasticityCardProps = {
  bases: readonly CategoryBase[];
};

export function ElasticityCard({ bases }: ElasticityCardProps) {
  if (bases.length === 0) return null;

  // The worked example below is read from the table above it rather than
  // written into this file. A -1.2 was quoted here for every brand, and no
  // SPD category is anywhere near it -- SPD spans -0.64 to -0.94 -- so an SPD
  // merchant was being taught the shape of their price response with a
  // coefficient their own book does not contain. The largest category with
  // its OWN fit is used, falling back to a pooled one, and where the
  // selection carries no fit at all the illustration simply is not made.
  const illustration =
    bases.find((base) => base.fit !== null && !base.fit.isPooledFallback) ??
    bases.find((base) => base.fit !== null) ??
    null;
  const illustrationFit = illustration?.fit ?? null;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-rule px-[14px] py-[10px] text-left text-[10.5px] font-extrabold tracking-[0.04em] text-mute">
                Category
              </th>
              <th className="border-b border-rule px-[14px] py-[10px] text-right text-[10.5px] font-extrabold tracking-[0.04em] text-mute">
                Coefficient
              </th>
              <th className="border-b border-rule px-[14px] py-[10px] text-right text-[10.5px] font-extrabold tracking-[0.04em] text-mute">
                Intercept
              </th>
              <th className="border-b border-rule px-[14px] py-[10px] text-right text-[10.5px] font-extrabold tracking-[0.04em] text-mute">
                Own R{"²"}
              </th>
              <th className="border-b border-rule px-[14px] py-[10px] text-right text-[10.5px] font-extrabold tracking-[0.04em] text-mute">
                Promotions
              </th>
              <th className="border-b border-rule px-[14px] py-[10px] text-right text-[10.5px] font-extrabold tracking-[0.04em] text-mute">
                Demand units
              </th>
            </tr>
          </thead>
          <tbody>
            {bases.map((base) => {
              const fit = base.fit;
              return (
                <tr
                  key={base.categoryId}
                  className="transition-colors duration-[120ms] hover:bg-shell"
                >
                  <td className="border-b border-rule px-[14px] py-[11px] text-[12.5px]">
                    <span className="font-extrabold text-ink">
                      {base.categoryName}
                    </span>
                    {fit?.isPooledFallback ? (
                      <span className="ml-[8px] align-middle">
                        <Pill variant="amber">Pooled</Pill>
                      </span>
                    ) : null}
                    {fit === null ? (
                      <span className="ml-[8px] align-middle">
                        <Pill variant="grey">No fit</Pill>
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b border-rule px-[14px] py-[11px] text-right text-[12.5px] font-bold tabular-nums text-ink">
                    {fit === null ? "--" : fit.coefficient.toFixed(3)}
                  </td>
                  <td className="border-b border-rule px-[14px] py-[11px] text-right text-[12.5px] tabular-nums text-body">
                    {fit === null ? "--" : fit.intercept.toFixed(3)}
                  </td>
                  <td className="border-b border-rule px-[14px] py-[11px] text-right text-[12.5px] tabular-nums text-body">
                    {fit?.rSquared == null ? "--" : fit.rSquared.toFixed(4)}
                  </td>
                  <td className="border-b border-rule px-[14px] py-[11px] text-right text-[12.5px] tabular-nums text-body">
                    {fit?.nObservations == null ? "--" : fit.nObservations}
                  </td>
                  <td className="border-b border-rule px-[14px] py-[11px] text-right text-[12.5px] tabular-nums text-body">
                    {formatUnits(base.demandUnits)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-rule px-[20px] py-[16px] text-[11.5px] leading-[1.65] text-body">
        <p className="max-w-[96ch]">
          {illustrationFit === null || illustration === null ? (
            <>
              No category in this selection carries a fitted coefficient, so
              there is no worked example to read one off -- and a coefficient
              from somewhere else would be teaching the shape of a price
              response this selection does not have.
            </>
          ) : (
            <>
              {illustration.categoryName}&apos;s coefficient of{" "}
              <span className="tabular-nums">
                {illustrationFit.coefficient.toFixed(3)}
              </span>{" "}
              in the table above means a 1% cut in the realised price buys
              about{" "}
              <span className="tabular-nums">
                {Math.abs(illustrationFit.coefficient).toFixed(2)}%
              </span>{" "}
              more units.
            </>
          )}{" "}
          The sign is the economics: the regressor is log(1 - depth), so a
          deeper cut makes it more negative and only a NEGATIVE coefficient
          describes a price response at all. Promotions whose outcome had not
          yet happened were excluded from the fit, which is why the promotion
          counts are smaller than the number of promotions on the books.
        </p>
        <p className="mt-[7px] max-w-[96ch]">
          The last column is the stored p50 demand this fit is applied to. It is
          not the plan: the plan adds the safety stock the buy screen already
          commits, so every plan-unit figure elsewhere on this screen is larger
          than the demand shown here by exactly that much.
        </p>
        <p className="mt-[7px] max-w-[96ch]">
          Where a row is marked <b className="text-ink">Pooled</b>, the
          category&apos;s own regression did not clear the pipeline&apos;s
          defensibility floor and it ships the brand-wide coefficient instead.
          Its own R{"²"} is left on the row so the substitution can be
          checked rather than taken on trust, and every result on this screen
          that used it is flagged.
        </p>
      </div>
    </div>
  );
}

export default ElasticityCard;
