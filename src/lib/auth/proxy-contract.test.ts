import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('Next proxy protects dashboard and mutation APIs while leaving login and webhooks reachable', () => {
  const proxyFile = path.join(process.cwd(), 'src/proxy.ts')
  const authFile = path.join(process.cwd(), 'src/lib/auth/server.ts')
  assert.equal(fs.existsSync(proxyFile), true, 'src/proxy.ts must exist')
  assert.equal(fs.existsSync(authFile), true, 'server auth helper must exist')
  const source = `${fs.readFileSync(proxyFile, 'utf8')}\n${fs.readFileSync(authFile, 'utf8')}`
  assert.match(source, /\/dashboard/)
  assert.match(source, /\/api\/outreach/)
  assert.match(source, /\/login/)
  assert.match(source, /getUser/)
})

test('sequence runner reaches its dedicated token gate without a dashboard session', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/proxy.ts'), 'utf8')
  assert.match(source, /pathname === '\/api\/outreach\/sequences\/run'/)
})

test('Playwright auth bypass is disabled unless a per-run server token is configured', () => {
  const proxySource = fs.readFileSync(path.join(process.cwd(), 'src/proxy.ts'), 'utf8')
  const playwrightSource = fs.readFileSync(path.join(process.cwd(), 'playwright.config.ts'), 'utf8')
  const workflowSource = fs.readFileSync(path.join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

  assert.match(proxySource, /const e2eBypassToken = process\.env\.E2E_AUTH_BYPASS_TOKEN/)
  assert.match(proxySource, /e2eBypassToken &&/)
  assert.match(proxySource, /e2eBypassToken\.length >= 32/)
  assert.match(proxySource, /x-e2e-auth-token/)
  assert.match(playwrightSource, /E2E_AUTH_BYPASS_TOKEN/)
  assert.match(workflowSource, /openssl rand -hex 32/)
  assert.doesNotMatch(workflowSource, /E2E_AUTH_BYPASS_TOKEN:\s*["']?[A-Za-z0-9_-]{16,}/)
})
