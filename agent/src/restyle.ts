// The bio writer. Gemini restyles a pet's fact-template bio into the shelter's voice; the
// fact guard then decides whether the restyle may replace the template. The template is
// always the fallback, so a rejected or failed restyle costs nothing but the attempt.
import {createGoogle} from '@ai-sdk/google'
import {generateText} from 'ai'
import {checkBio, MAX_BIO, type GuardResult} from './factGuard.ts'

/** Pinned, dated, non-preview model (GUIDANCE F21). Its version string is fetched and recorded per run. */
export const MODEL_ID = 'gemini-3.7-flash'

export const SYSTEM = `You write short adoption-shelter bios for potholes. Each pothole is a real complaint filed with NYC 311.

Rewrite the bio you are given in a warm, gently playful shelter voice. Rules, all of which are checked:
- Keep every fact exactly: names, dates, numbers and street names must appear exactly as given. Add no new facts,
  places, dates, numbers, people, feelings attributed to real people, or events.
- Keep the city's quoted note word for word, inside double quotes.
- Celebrate repairs. Never mock, blame or criticise the residents who report potholes or the crews who fix them.
  The joke is the shelter, never the people.
- At most ${MAX_BIO - 100} characters. Plain text, no links, no emoji, no headings.
Reply with the bio only.`

/** The model's version as Google reports it (e.g. "3.7-flash-08-2026"); the generate response gives only the id. */
export async function modelVersion(apiKey: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}`, {headers: {'x-goog-api-key': apiKey}})
  if (!res.ok) throw new Error(`model lookup failed: HTTP ${res.status}`)
  const json = (await res.json()) as {version?: string}
  return json.version ?? 'unknown'
}

export type Generate = (template: string) => Promise<string>

export function geminiGenerate(apiKey: string): Generate {
  const google = createGoogle({apiKey})
  return async (template) => {
    const r = await generateText({
      model: google(MODEL_ID),
      system: SYSTEM,
      prompt: template,
      // Most of the budget goes to the model's reasoning; a small cap returns empty text.
      maxOutputTokens: 4096,
      temperature: 0.7,
    })
    return r.text.trim()
  }
}

export interface RestyleOutcome {
  bio?: string
  guard: GuardResult
}

/** One attempt: generate, then check. A failed generation is reported, never thrown. */
export async function restyle(generate: Generate, template: string): Promise<RestyleOutcome> {
  let text: string
  try {
    text = await generate(template)
  } catch (err) {
    return {guard: {ok: false, reasons: [`generation failed: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`]}}
  }
  const guard = checkBio(text, template)
  return guard.ok ? {bio: text, guard} : {guard}
}
