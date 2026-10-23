import { useRef, useState } from 'react'
import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react'
import { evalPlusMinus } from '@/lib/arithmetic'

/** A plain decimal number ("12", "-3", "2.5", ".5"); no exponents, so "1e9" is not accepted. */
const PLAIN_NUMBER = /^-?(\d+\.?\d*|\.\d+)$/

/** Sanity ceiling for reps/weight boxes, so a typo can't store something absurd. */
const DEFAULT_MAX = 9999

/** Lets a reps/weight input accept a quick "10+5"-style expression, resolved to a
 *  single number on blur/Enter. Give each box a unique `key` (e.g. `reps-${i}`) so
 *  only the box currently being edited shows its raw typed text — every other box
 *  keeps rendering straight from the real numeric state.
 *  Escape cancels the edit. Text that is neither a number nor a +/- expression
 *  (e.g. "3x10") reverts to the previous value instead of saving a partial parse. */
export function useArithmeticField() {
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const cancelled = useRef(false)

  function fieldProps(
    key: string,
    value: number,
    commit: (n: number) => void,
    opts?: { min?: number; max?: number; integer?: boolean }
  ) {
    const min = opts?.min ?? 0
    const max = opts?.max ?? DEFAULT_MAX
    const isEditing = editKey === key

    const resolve = () => {
      if (cancelled.current) { cancelled.current = false; setEditKey(null); return }
      // Accept a decimal comma ("1,5") as well as a dot.
      const text = editText.trim().replace(',', '.')
      let n: number
      if (text === '') n = min
      else {
        const evaluated = evalPlusMinus(text)
        n = evaluated ?? (PLAIN_NUMBER.test(text) ? parseFloat(text) : NaN)
      }
      // Unparseable input: keep the previous value rather than committing a guess.
      if (!Number.isFinite(n)) { setEditKey(null); return }
      const rounded = opts?.integer ? Math.round(n) : Math.round(n * 100) / 100
      commit(Math.min(max, Math.max(min, rounded)))
      setEditKey(null)
    }

    return {
      value: isEditing ? editText : value === 0 ? '' : String(value),
      onChange: (e: ChangeEvent<HTMLInputElement>) => { setEditKey(key); setEditText(e.target.value) },
      onFocus: (e: FocusEvent<HTMLInputElement>) => { cancelled.current = false; setEditKey(key); setEditText(value === 0 ? '' : String(value)); e.target.select() },
      onBlur: resolve,
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur() }
      },
    }
  }

  return { fieldProps }
}
