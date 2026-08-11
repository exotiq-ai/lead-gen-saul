import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const leadDetailPath = new URL('../../app/dashboard/leads/[id]/LeadDetailClient.tsx', import.meta.url)
const scorePanelPath = new URL('../../components/leads/detail/ScoreBreakdownPanel.tsx', import.meta.url)

test('lead detail stacks the call workflow above the score panel on mobile', async () => {
  const source = await readFile(leadDetailPath, 'utf8')

  assert.match(
    source,
    /className="flex flex-1 flex-col lg:flex-row gap-0 px-0 sm:px-2 lg:px-6 pb-8"/,
    'the two lead-detail columns should stack until the desktop sidebar breakpoint',
  )
  assert.match(
    source,
    /<main className="order-1 lg:order-2 flex-1 flex flex-col gap-4 min-w-0 w-full">/,
    'the mobile call workflow should be full width and appear before the score panel',
  )
})

test('score panel becomes full-width and non-sticky below the desktop breakpoint', async () => {
  const source = await readFile(scorePanelPath, 'utf8')

  assert.match(
    source,
    /className="order-2 lg:order-1 w-full lg:w-72 shrink-0 flex flex-col gap-4 lg:sticky lg:top-6 lg:mr-6 max-h-none overflow-visible lg:max-h-\[calc\(100vh-80px\)\] lg:overflow-y-auto"/,
  )
  assert.doesNotMatch(
    source,
    /style=\{\{ maxHeight: 'calc\(100vh - 80px\)', overflowY: 'auto' \}\}/,
    'mobile should not inherit the desktop viewport-height scroller',
  )
})
