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
