import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientPath = new URL('../../app/dashboard/road-trip/RoadTripPageClient.tsx', import.meta.url)
const sidebarPath = new URL('../../components/dashboard/Sidebar.tsx', import.meta.url)

test('road-trip navigation carries only city state and never adds tenant parameters', async () => {
  const [client, sidebar] = await Promise.all([
    readFile(clientPath, 'utf8'),
    readFile(sidebarPath, 'utf8'),
  ])

  assert.doesNotMatch(client, /tenant=/)
  assert.match(sidebar, /href === '\/dashboard\/road-trip'[\s\S]{0,40}\? href/)
})
