import { useEffect, useRef, useState } from 'react'

// Speak instead of typing: the browser's own speech-to-text (Chrome and Edge). It is a browser
// feature, not our AI: Chrome sends the audio to Google, Edge to Microsoft, to turn it into text.
// The button is hidden in browsers without it (Firefox).

// The parts of the Web Speech API used here (TypeScript's DOM types include the events, not the recogniser).
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => Recognition
const Speech = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
const RecognitionClass = Speech.SpeechRecognition ?? Speech.webkitSpeechRecognition

const LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'ml-IN', label: 'മലയാളം' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'gu-IN', label: 'ગુજરાતી' },
]

// onText gets each finished sentence, to add to what is already typed.
export function VoiceButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false)
  const [lang, setLang] = useState('en-IN')
  const [heard, setHeard] = useState('') // words still being recognised, shown live
  const [error, setError] = useState('')
  const rec = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => () => rec.current?.abort(), [])
  if (!RecognitionClass) return null

  const start = () => {
    setError('')
    const r = new RecognitionClass()
    r.lang = lang
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim()
        if (e.results[i].isFinal) onTextRef.current(text)
        else live += ` ${text}`
      }
      setHeard(live.trim())
    }
    r.onerror = (e) => {
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone is blocked. Allow it from the 🔒 icon in the address bar.'
          : e.error === 'no-speech'
            ? 'Did not hear anything. Try again.'
            : e.error === 'network'
              ? 'Speech-to-text needs the internet.'
              : `Speech-to-text stopped (${e.error}).`,
      )
    }
    r.onend = () => {
      setListening(false)
      setHeard('')
    }
    rec.current = r
    r.start()
    setListening(true)
  }

  return (
    <div className="voice">
      <div className="voice-row">
        <button type="button" className={`mic ${listening ? 'on' : ''}`} disabled={disabled} onClick={() => (listening ? rec.current?.stop() : start())}>
          {listening ? '■ Stop' : '🎤 Speak'}
        </button>
        <select aria-label="Language you speak" value={lang} disabled={listening} onChange={(e) => setLang(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      {listening && <p className="small heard">{heard ? `“${heard}”` : 'Listening… speak now'}</p>}
      {error && <p className="small note">{error}</p>}
      <p className="muted small">Speech is turned into text by your browser (Chrome sends it to Google).</p>
    </div>
  )
}
