import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('magic link request uses SSR client so PKCE verifier survives callback', () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/auth/magic-link/route.ts'), 'utf8')
  assert.match(route, /createRouteAuthClient/)
  assert.doesNotMatch(route, /createClient\s*\(/)
  assert.match(route, /return response/)
})
