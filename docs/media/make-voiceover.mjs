// Voices the demo video from its captions, so narration and captions always match.
// Each caption line is synthesized with Gemini TTS (gemini-3.8-flash-tts, a stable model),
// placed at its caption's start time, and sped up only if it would overrun its window.
//
// Usage (from the repo root): node --env-file=.env.local docs/media/make-voiceover.mjs
// In:  docs/media/video/pothole-shelter-demo.mp4, docs/media/video/captions.srt
// Out: docs/media/video/pothole-shelter-demo-voiced.mp4 (not committed; uploaded separately)
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

const MODEL = 'gemini-3.8-flash-tts'
const VOICE = process.env.VOICE ?? 'Kore'
const key = process.env.GEMINI_API_KEY
if (!key) throw new Error('GEMINI_API_KEY is not set')

const dir = 'docs/media/video'
const work = join(dir, '.voice')
mkdirSync(work, {recursive: true})

const seconds = (t) => {
  const [h, m, rest] = t.split(':')
  const [s, ms] = rest.split(',')
  return +h * 3600 + +m * 60 + +s + +ms / 1000
}
const cues = readFileSync(join(dir, 'captions.srt'), 'utf8')
  .trim()
  .split(/\r?\n\r?\n/)
  .map((block) => {
    const lines = block.split(/\r?\n/)
    const [a, b] = lines[1].split(' --> ')
    return {start: seconds(a), end: seconds(b), text: lines.slice(2).join(' ')}
  })

const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString())

// The TTS model allows 10 requests a minute: wait out a 429 for the delay it names, then retry.
async function speak(text) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {'x-goog-api-key': key, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{parts: [{text}]}],
        generationConfig: {responseModalities: ['AUDIO'], speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: VOICE}}}},
      }),
    })
    const json = await res.json()
    if (!json.error) return Buffer.from(json.candidates[0].content.parts[0].inlineData.data, 'base64')
    const wait = Number(json.error.message.match(/retry in ([\d.]+)s/)?.[1])
    if (json.error.code !== 429 || !wait) throw new Error(json.error.message)
    console.log(`   rate limited; waiting ${Math.ceil(wait)}s`)
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000))
  }
  throw new Error('still rate limited after 6 attempts')
}

const fitted = []
for (const [i, cue] of cues.entries()) {
  // Voice files are keyed by voice + text, so re-runs only synthesize lines that changed.
  const hash = createHash('sha256').update(`${MODEL}|${VOICE}|${cue.text}`).digest('hex').slice(0, 10)
  const file = join(work, `cue-${String(i + 1).padStart(2, '0')}-${hash}.wav`)
  if (!existsSync(file)) writeFileSync(file, await speak(cue.text))
  const spoken = duration(file)
  const window = cue.end - cue.start
  // Speed up only when needed, and never past 1.35x (still natural); report anything tighter.
  const tempo = Math.min(Math.max(spoken / window, 1), 1.35)
  fitted.push({file, start: cue.start, tempo, spoken, window})
  console.log(`${String(i + 1).padStart(2)} ${spoken.toFixed(1)}s in ${window.toFixed(1)}s${tempo > 1 ? ` → ${tempo.toFixed(2)}x` : ''}${spoken / tempo > window + 0.3 ? '  ! still overruns' : ''}`)
}

// One mix: each line delayed to its start, at its tempo; video stream copied unchanged.
const inputs = fitted.flatMap((f) => ['-i', f.file])
const chains = fitted.map((f, i) => {
  const ms = Math.round(f.start * 1000)
  return `[${i + 1}:a]${f.tempo > 1 ? `atempo=${f.tempo.toFixed(3)},` : ''}adelay=${ms}|${ms}[a${i}]`
})
const filter = `${chains.join(';')};${fitted.map((_, i) => `[a${i}]`).join('')}amix=inputs=${fitted.length}:normalize=0,apad[aout]`
const out = join(dir, 'pothole-shelter-demo-voiced.mp4')
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, 'pothole-shelter-demo.mp4'), ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', out])
console.log(`voiced video: ${out} (${duration(out).toFixed(1)}s, voice ${VOICE}, ${MODEL})`)
