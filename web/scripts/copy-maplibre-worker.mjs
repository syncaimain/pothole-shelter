// MapLibre 6 parses tiles in a module Web Worker loaded by URL, which the Next/Turbopack
// bundle does not emit (the browser got an HTML 404 page: "non-JavaScript MIME type").
// Copy the worker and the shared chunk it imports from the installed package, so the
// served files always match the library version in the bundle.
import {copyFileSync, mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const require = createRequire(import.meta.url)
const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.css'))
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maplibre')
mkdirSync(out, {recursive: true})
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(join(dist, f), join(out, f))
console.log(`maplibre worker ${require('maplibre-gl/package.json').version} → public/maplibre`)
