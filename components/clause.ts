/**
 * The first clause of a stored rationale.
 *
 * LIFTED FROM components/exceptions/ExceptionTableRow.tsx, UNCHANGED. It was a
 * private module-level function there, which is why /buy and the dashboard's
 * prioritised-actions list render whole paragraphs while the exception queue
 * reads as one scannable line: the splitter existed but only one screen could
 * reach it.
 *
 * WHY IT IS NOT A SPLIT ON ".". Cutting "19.7 weeks" into "19." destroys the
 * number that made the row worth reading, so a period between two digits is
 * not a sentence boundary. The copilot's own sentence splitter needed the same
 * rule for the same reason.
 *
 * THE 24-CHARACTER FLOOR is the second guard. A rationale opening with a short
 * abbreviation would otherwise yield a head too short to mean anything, and a
 * head of four words is worse than the whole sentence -- so a boundary before
 * character 24 is skipped and the scan continues.
 *
 * `rest` is returned rather than discarded because the app's discipline is
 * that a stored rationale is never rewritten and never truncated out of reach:
 * the caller shows `head` and keeps `rest` available.
 */
export function firstClause(text: string): { head: string; rest: string } {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "." && ch !== ";") continue;
    const prev = text[i - 1];
    const next = text[i + 1];
    if (ch === "." && prev >= "0" && prev <= "9" && next >= "0" && next <= "9") {
      continue;
    }
    if (i > 24) {
      return { head: text.slice(0, i + 1), rest: text.slice(i + 1).trim() };
    }
  }
  return { head: text, rest: "" };
}
