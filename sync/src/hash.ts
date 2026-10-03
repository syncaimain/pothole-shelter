import {createHash} from 'node:crypto'

/** JSON with object keys sorted at every level, so equal data always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    )
  }
  return v
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export const hashOf = (value: unknown) => sha256(canonicalJson(value))

export const sameData = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b)
