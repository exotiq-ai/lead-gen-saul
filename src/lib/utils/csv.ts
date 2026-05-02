/**
 * CSV streaming helpers used by /api/exports/* routes.
 *
 * Why streaming: the Exotiq tenant has ~700 leads today; that's small,
 * but the GHL conversation log + lead_activities export grows linearly
 * with engagement. Loading them into memory first defeats the point of
 * having an export endpoint. Each route returns a Response wrapping a
 * ReadableStream of UTF-8 BOM + header row + N data rows.
 */

const TEXT_ENCODER = new TextEncoder()

// UTF-8 BOM. Excel needs it to detect UTF-8; without it special chars
// render as Latin-1 garbage.
const BOM = TEXT_ENCODER.encode('\uFEFF')

function escapeField(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s: string
  if (v instanceof Date) s = v.toISOString()
  else if (typeof v === 'object') s = JSON.stringify(v)
  else s = String(v)
  // Quote if contains comma, quote, or newline. Double up internal quotes.
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function csvRow(values: unknown[]): Uint8Array {
  return TEXT_ENCODER.encode(values.map(escapeField).join(',') + '\n')
}

export type StreamCsvOptions<T> = {
  filename: string
  headers: string[]
  rows: AsyncIterable<T>
  rowToValues: (row: T) => unknown[]
}

export function streamCsv<T>(opts: StreamCsvOptions<T>): Response {
  const { filename, headers, rows, rowToValues } = opts
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(BOM)
        controller.enqueue(csvRow(headers))
        for await (const row of rows) {
          controller.enqueue(csvRow(rowToValues(row)))
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** Async generator that pages through a Supabase table in chunks. */
export async function* paginate<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[] | null>,
  pageSize = 500,
): AsyncGenerator<T> {
  let offset = 0
  while (true) {
    const page = await fetchPage(offset, pageSize)
    if (!page || page.length === 0) return
    for (const row of page) yield row
    if (page.length < pageSize) return
    offset += pageSize
  }
}
