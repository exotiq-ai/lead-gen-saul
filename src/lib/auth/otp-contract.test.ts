import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('production login supports a six-digit OTP fallback', () => {
  const route = path.join(process.cwd(), 'src/app/api/auth/verify-otp/route.ts')
  const form = path.join(process.cwd(), 'src/app/login/LoginForm.tsx')
  const template = path.join(process.cwd(), 'supabase/templates/magic-link.html')
  assert.equal(fs.existsSync(route), true, 'OTP verification route must exist')
  const routeSource = fs.readFileSync(route, 'utf8')
  const formSource = fs.readFileSync(form, 'utf8')
  const templateSource = fs.readFileSync(template, 'utf8')
  assert.match(routeSource, /verifyOtp/)
  assert.match(routeSource, /isAllowedDashboardAdmin/)
  assert.match(routeSource, /type:\s*['"]email['"]/)
  assert.match(formSource, /Enter the 6-digit code/)
  assert.match(formSource, /\/api\/auth\/verify-otp/)
  assert.match(templateSource, /\{\{ \.Token \}\}/)
})
