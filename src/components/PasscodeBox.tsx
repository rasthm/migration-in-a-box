import { useState } from 'react'
import { setPasscode } from '../engine/aiClient'

// Shown only when the online version asks for a passcode before AI can be used.
export function PasscodeBox({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault()
        setPasscode(value.trim())
        onSaved()
      }}
    >
      <input type="password" value={value} placeholder="AI passcode" autoComplete="off" onChange={(e) => setValue(e.target.value)} />
      <button className="primary" disabled={!value.trim()}>
        Save and try again
      </button>
    </form>
  )
}
