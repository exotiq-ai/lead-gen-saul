import { z, treeifyError } from 'zod'
import { NextResponse } from 'next/server'

export function searchParamsToRecord(searchParams: URLSearchParams): Record<string, string> {
  return Object.fromEntries(searchParams.entries())
}

export function parseQuery<T extends z.ZodTypeAny>(
  schema: T,
  url: string | URL,
):
  | { success: true; data: z.infer<T> }
  | { success: false; response: NextResponse } {
  const u = typeof url === 'string' ? new URL(url) : url
  const raw = searchParamsToRecord(u.searchParams)
  const result = schema.safeParse(raw)
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Validation failed',
          details: treeifyError(result.error),
        },
        { status: 400 },
      ),
    }
  }
  return { success: true, data: result.data }
}

export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; response: NextResponse }
> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    }
  }
  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Validation failed',
          details: treeifyError(result.error),
        },
        { status: 400 },
      ),
    }
  }
  return { success: true, data: result.data }
}
