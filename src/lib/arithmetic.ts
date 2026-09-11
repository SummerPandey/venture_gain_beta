/** Parses a quick "10+5" / "20 - 3.5" style expression into a single number.
 *  Chained +/- terms only — no *, /, or parens. Returns null for anything that
 *  isn't a genuine multi-term expression (including a plain "5"), so callers
 *  can fall back to normal number parsing for everything else. */
export function evalPlusMinus(input: string): number | null {
  const s = input.replace(/\s+/g, '')
  if (!/^-?\d*\.?\d+([+-]\d*\.?\d+)+$/.test(s)) return null
  const terms = s.match(/[+-]?\d*\.?\d+/g)
  if (!terms) return null
  const result = terms.reduce((sum, t) => sum + parseFloat(t), 0)
  return Number.isFinite(result) ? result : null
}
