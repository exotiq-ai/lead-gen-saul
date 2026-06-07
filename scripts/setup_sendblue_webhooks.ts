import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import process from 'node:process'
import { addSendblueWebhook, listSendblueWebhooks } from '../src/lib/sendblue/client'

loadEnv({ path: path.resolve(process.cwd(), '.env.local') })
loadEnv({ path: path.resolve(process.cwd(), '.env') })

function arg(name: string) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const publicUrl = arg('--url') || process.env.SENDBLUE_WEBHOOK_PUBLIC_URL
  const secret = process.env.SENDBLUE_WEBHOOK_SECRET
  if (!publicUrl) {
    const current = await listSendblueWebhooks()
    console.log(JSON.stringify({ ok: current.ok, mode: 'list-only', current: current.ok ? current.raw.webhooks ?? current.raw : current }, null, 2))
    console.log('Set SENDBLUE_WEBHOOK_PUBLIC_URL or pass --url after the webhook route is deployed.')
    return
  }
  const url = new URL('/api/webhooks/sendblue', publicUrl)
  if (secret) url.searchParams.set('secret', secret)
  const receive = await addSendblueWebhook('receive', url.toString())
  const outbound = await addSendblueWebhook('outbound', url.toString())
  const current = await listSendblueWebhooks()
  console.log(JSON.stringify({
    ok: receive.ok && outbound.ok && current.ok,
    registered_url_host: url.host,
    receive: receive.ok ? 'ok' : receive,
    outbound: outbound.ok ? 'ok' : outbound,
    webhook_counts: current.ok && current.raw.webhooks ? Object.fromEntries(Object.entries(current.raw.webhooks as Record<string, unknown>).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k, (v as unknown[]).length])) : null,
  }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
