'use client'

import {useActionState} from 'react'
import {MESSAGE_MAX, NAME_MAX} from '@/lib/adopt'
import {submitAdoption, type AdoptState} from '../actions'

export function AdoptForm({slug, petName}: {slug: string; petName: string}) {
  const [state, action, pending] = useActionState<AdoptState, FormData>(submitAdoption, {status: 'idle'})

  if (state.status === 'submitted') {
    return (
      <div className="notice" role="status">
        <p style={{margin: 0}}>
          Thank you! Your note for {petName} is <strong>awaiting moderation</strong>. A person at the shelter reads every note before it
          appears; until then it stays private.
        </p>
      </div>
    )
  }

  const e = state.errors ?? {}
  return (
    <form action={action} className="adopt" noValidate>
      <input type="hidden" name="slug" value={slug} />
      {/* Honeypot: hidden from people and assistive tech, tempting to bots. */}
      <div aria-hidden="true" style={{position: 'absolute', left: '-10000px'}}>
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {e.form && (
        <p className="notice" role="alert">
          {e.form}
        </p>
      )}
      <label>
        Your name, as it should appear
        <input
          name="displayName"
          maxLength={NAME_MAX}
          required
          defaultValue={state.values?.displayName}
          aria-invalid={!!e.displayName}
          aria-describedby={e.displayName ? 'name-error' : undefined}
        />
      </label>
      {e.displayName && (
        <p id="name-error" className="error">
          {e.displayName}
        </p>
      )}
      <label>
        A note for {petName}
        <textarea
          name="message"
          rows={4}
          maxLength={MESSAGE_MAX}
          required
          defaultValue={state.values?.message}
          aria-invalid={!!e.message}
          aria-describedby={e.message ? 'message-error' : 'message-hint'}
        />
      </label>
      <p id="message-hint" className="small muted">
        Up to {MESSAGE_MAX} characters. No links or contact details. Be kind to everyone, including the people who report and fix
        potholes.
      </p>
      {e.message && (
        <p id="message-error" className="error">
          {e.message}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send adoption note'}
      </button>
    </form>
  )
}
