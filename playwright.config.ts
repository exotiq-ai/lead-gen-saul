import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for Saul LeadGen e2e.
 *
 * Dashboard routes are exercised with all Supabase + GHL APIs mocked at the
 * network layer (see e2e/fixtures/mockApi). No Docker or real credentials.
 *
 * Local default: `next build` + `next start` (avoids dev HMR cross-origin
 * issues when baseURL is http://127.0.0.1:3000). Override with BASE_URL to
 * hit an existing server (e.g. preview deploy).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list']] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Stage 4d: regression-guard the mobile sidebar + approval flow at
      // an iPhone-12-ish viewport so we don't silently regress mobile
      // padding or the hamburger toggle.
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],
  // Production server: dev mode blocks cross-origin HMR from 127.0.0.1, so
  // client JS never hydrates and SWR-driven UI stays on skeletons. CI passes
  // BASE_URL and starts `next start` after downloading the `next` job's
  // `.next` artifact (no second full build inside Playwright).
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command:
          'npm run build && npm run start -- -p 3000',
        url: 'http://127.0.0.1:3000',
        timeout: 600_000,
        reuseExistingServer: !process.env.CI,
        env: {
          NEXT_TELEMETRY_DISABLED: '1',
          // Placeholder Supabase — real calls are mocked in e2e/fixtures/mockApi.
          NEXT_PUBLIC_SUPABASE_URL: '',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        },
      },
})
