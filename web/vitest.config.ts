import {defineConfig} from 'vitest/config'

// Unit tests only; Playwright owns e2e/.
export default defineConfig({test: {exclude: ['e2e/**', 'node_modules/**', '.next/**']}})
