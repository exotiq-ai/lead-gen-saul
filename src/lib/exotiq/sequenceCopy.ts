import type { ExotiqSequenceStep } from './sequence'

export type SequenceCopyContext = {
  firstName?: string | null
  companyName: string
  initialDraft: string
  mode: 'demo' | 'live'
  instagramUrl?: string | null
  phone?: string | null
}

function greeting(firstName?: string | null) {
  return firstName?.trim() || 'there'
}

export function parseApprovedDraft(raw: string) {
  const trimmed = raw.trim()
  const subjectMatch = trimmed.match(/^Subject:\s*(.+)\n+/i)
  if (subjectMatch) return { subject: subjectMatch[1].trim(), text: trimmed.slice(subjectMatch[0].length).trim() }
  const [firstLine, ...rest] = trimmed.split('\n')
  if (firstLine && rest.length && firstLine.length <= 90 && !firstLine.includes('.')) {
    return { subject: firstLine.replace(/^subject:\s*/i, '').trim(), text: rest.join('\n').trim() }
  }
  return { subject: `Quick operator question for ${trimmed ? '' : 'Exotiq'}`.trim(), text: trimmed }
}

export function sequenceActionPayload(step: ExotiqSequenceStep, context: SequenceCopyContext) {
  const name = greeting(context.firstName)
  const company = context.companyName.trim() || 'your fleet'
  if (step.key === 'email_1') {
    const approved = parseApprovedDraft(context.initialDraft)
    return {
      subject: context.mode === 'demo' ? `[DEMO] ${approved.subject}` : approved.subject,
      text: context.mode === 'demo'
        ? `Hi Gregory,\n\nThis is the authorized end-to-end Exotiq sequence test. It represents the approved first-touch message for ${company}.\n\n${approved.text}\n\nNo customer was contacted.`
        : approved.text,
    }
  }
  if (step.key === 'call_1') {
    return {
      title: `${context.mode === 'demo' ? '[DEMO] ' : ''}Call ${company}`,
      body: `Call ${name} at ${company}. Review the approved personalization and ask whether it is worth comparing notes for 15 minutes.${context.phone ? ` Phone: ${context.phone}` : ' Verify a callable number first.'}`,
    }
  }
  if (step.key === 'instagram_1') {
    return {
      title: `${context.mode === 'demo' ? '[DEMO] ' : ''}Instagram review and DM for ${company}`,
      body: `Review the operator profile and latest credible business signal before sending the approved DM manually.${context.instagramUrl ? ` Profile: ${context.instagramUrl}` : ' Instagram profile still needs verification.'}`,
    }
  }
  if (step.key === 'email_2') {
    return {
      subject: `${company} booking workflow`,
      text: `Hey ${name},\n\nOne reason I followed up: exotic rental demand often moves faster than the systems behind it. The expensive gap is usually between the first inquiry and a paid, verified booking with the right car, rate, deposit, and handoff confirmed.\n\nThat is the operator workflow Exotiq is built around. Worth comparing notes for 15 minutes?`,
    }
  }
  if (step.key === 'email_3') {
    return {
      subject: `Quick operator question`,
      text: `Hey ${name},\n\nI will keep this short. If pricing, availability, deposits, agreements, and follow-up are already clean at ${company}, there may not be much to fix.\n\nIf one of those still depends heavily on you or scattered tools, I can show you how Exotiq approaches it in 15 minutes.`,
    }
  }
  return {
    subject: `Closing the loop`,
    text: `Hey ${name},\n\nI have not heard back, so I will close the loop here. I reached out because ${company} looked like the kind of operator Exotiq was built to support.\n\nIf tightening the path from inquiry to paid, verified booking becomes a priority, reply anytime and I will send the short version.`,
  }
}
