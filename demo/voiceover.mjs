// Makes the demo narration with ElevenLabs, one MP3 per scene in demo/build/.
// Run from the migration-in-a-box folder:  node --env-file=.env.local demo/voiceover.mjs [narration.json] [out prefix]
// The SDK reads ELEVENLABS_API_KEY from the environment; the key is never in this file.
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const VOICE_NAME = process.env.ELEVENLABS_VOICE_NAME ?? 'rasthm'
const MODEL = 'eleven_v4'

const client = new ElevenLabsClient()
const [narrationFile = 'narration.json', prefix = 'voice'] = process.argv.slice(2)
const scenes = JSON.parse(readFileSync(join(here, narrationFile), 'utf8'))

// Find the voice by name in this account (the user's own "rasthm" voice).
const { voices } = await client.voices.search({ search: VOICE_NAME })
const voice = voices.find((v) => v.name?.toLowerCase() === VOICE_NAME.toLowerCase()) ?? voices[0]
if (!voice) throw new Error(`No voice named "${VOICE_NAME}" in this ElevenLabs account.`)
console.log(`Voice: ${voice.name} (${voice.voiceId})`)

mkdirSync(join(here, 'build'), { recursive: true })
for (const [i, scene] of scenes.entries()) {
  const audio = await client.textToSpeech.convert(voice.voiceId, {
    text: scene.text,
    modelId: MODEL,
    // the neighbouring sentences keep the tone even across scenes
    previousText: scenes[i - 1]?.text,
    nextText: scenes[i + 1]?.text,
  })
  const out = join(here, 'build', `${prefix}${String(i + 1).padStart(2, '0')}.mp3`)
  await finished(Readable.fromWeb(audio).pipe(createWriteStream(out)))
  console.log(`scene ${i + 1}: ${out}`)
}
