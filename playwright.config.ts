import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for Saul LeadGen e2e.
 *
 * The full pipeline walk (discover -> enrich -> score -> draft ->
 * approve -> mark_sent) runs against the dev server with all Supabase
 * + GHL APIs mocked at the network layer. This keeps CI hermetic --
 * no Docker, no real DB, no GHL credentials needed -- and the same
 * tests can target a real preview deploy by setting BASE_URL.
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
  // Boot Next dev server unless BASE_URL points elsewhere.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:3000',
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          // Force placeholder Supabase env vars so lib/supabase/{client,server}
          // returns the no-op client; we mock at the route level.
          NEXT_PUBLIC_SUPABASE_URL: '',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        },
      },
})
