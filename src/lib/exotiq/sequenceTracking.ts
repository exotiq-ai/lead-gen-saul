type EnrollmentRow = { status?: string | null; mode?: string | null }
type ActionRow = { status?: string | null; action_kind?: string | null; due_at?: string | null }
type AttemptRow = { status?: string | null }
type EventRow = { event_type?: string | null; status?: string | null }
type SuppressionRow = { active?: boolean | null }

function countBy<T>(rows: T[], value: (row: T) => string | null | undefined) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = value(row)?.trim() || 'unknown'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

export function emailAttemptReachedProvider(status: string | null | undefined) {
  return status === 'provider_accepted' || status === 'delivered'
}

export function summarizeSequenceTracking(input: {
  enrollments: EnrollmentRow[]
  actions: ActionRow[]
  attempts: AttemptRow[]
  events: EventRow[]
  suppressions: SuppressionRow[]
  now?: string
}) {
  const now = new Date(input.now || new Date().toISOString()).getTime()
  if (!Number.isFinite(now)) throw new Error('invalid tracking summary time')
  const attemptStatuses = countBy(input.attempts, (row) => row.status)
  const eventTypes = countBy(input.events, (row) => row.event_type)
  const eventStatuses = countBy(input.events, (row) => row.status)

  return {
    enrollments: {
      total: input.enrollments.length,
      by_status: countBy(input.enrollments, (row) => row.status),
      by_mode: countBy(input.enrollments, (row) => row.mode),
    },
    actions: {
      total: input.actions.length,
      by_status: countBy(input.actions, (row) => row.status),
      by_kind: countBy(input.actions, (row) => row.action_kind),
      overdue_pending: input.actions.filter((row) => {
        if (row.status !== 'pending' || !row.due_at) return false
        const due = new Date(row.due_at).getTime()
        return Number.isFinite(due) && due < now
      }).length,
    },
    email_attempts: {
      total: input.attempts.length,
      by_status: attemptStatuses,
      provider_handoffs: input.attempts.filter((row) => emailAttemptReachedProvider(row.status)).length,
      delivered: attemptStatuses.delivered || 0,
      hard_bounced: attemptStatuses.hard_bounced || 0,
      complained: attemptStatuses.complained || 0,
      unsubscribed: attemptStatuses.unsubscribed || 0,
      replied: attemptStatuses.replied || 0,
      failed: attemptStatuses.failed || 0,
    },
    events: {
      total: input.events.length,
      by_type: eventTypes,
      by_status: eventStatuses,
      replies: eventTypes.reply || 0,
      appointments: eventTypes.appointment || 0,
      opportunities: eventTypes.opportunity || 0,
      quarantined: eventStatuses.quarantined || 0,
    },
    active_suppressions: input.suppressions.filter((row) => row.active === true).length,
  }
}
