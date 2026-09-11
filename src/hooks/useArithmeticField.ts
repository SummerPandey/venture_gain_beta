import { useState } from 'react'
import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react'
import { evalPlusMinus } from '@/lib/arithmetic'

/** Lets a reps/weight input accept a quick "10+5"-style expression, resolved to a
 *  single number on blur/Enter. Give each box a unique `key` (e.g. `reps-${i}`) so
 *  only the box currently being edited shows its raw typed text — every other box
 *  keeps rendering straight from the real numeric state. */
export function useArithmeticField() {
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  function fieldProps(
    key: string,
    value: number,
    commit: (n: number) => void,
    opts?: { min?: number; integer?: boolean }
  ) {
    const min = opts?.min ?? 0
    const isEditing = editKey === key

    const resolve = () => {
      const evaluated = evalPlusMinus(editText)
      const raw = evaluated ?? parseFloat(editText)
      const n = Number.isFinite(raw) ? raw : min
      commit(Math.max(min, opts?.integer ? Math.round(n) : n))
      setEditKey(null)
    }

    return {
      value: isEditing ? editText : value === 0 ? '' : String(value),
      onChange: (e: ChangeEvent<HTMLInputElement>) => { setEditKey(key); setEditText(e.target.value) },
      onFocus: (e: FocusEvent<HTMLInputElement>) => { setEditKey(key); setEditText(value === 0 ? '' : String(value)); e.target.select() },
      onBlur: resolve,
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur() },
    }
  }

  return { fieldProps }
}
