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
      body: `Call ${name} at ${company}. Review the approved personalization, lead with the Drive Exotiq launch, and ask directly for a 15-minute conversation.${context.phone ? ` Phone: ${context.phone}` : ' Verify a callable number first.'}`,
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
      subject: `The operation behind Drive Exotiq`,
      text: `Hey ${name},\n\nDrive Exotiq is more than another place to list your cars. The renter-facing platform connects to the Exotiq Command Center, so pricing, bookings and day-to-day fleet operations stay together. One connected system, not another silo.\n\nDo you have 15 minutes this week to discuss how this could fit ${company}?\n\nGregory`,
    }
  }
  if (step.key === 'email_3') {
    return {
      subject: `Cars, fleets and Drive Exotiq`,
      text: `Hey ${name},\n\nThe cars are why I’m in this business. Building a better way to rent them and run the fleet is why I built Exotiq.\n\nWith Drive Exotiq launched, I’m bringing select luxury and exotic rental fleets onto the platform. I’d enjoy comparing notes on what you’re building at ${company}.\n\nCould we connect for 15 minutes next week?\n\nGregory`,
    }
  }
  return {
    subject: `Drive Exotiq + ${company}`,
    text: `Hey ${name},\n\nI’ll leave it here. Drive Exotiq is live for luxury and exotic rentals, with the Exotiq Command Center connecting the rental operation behind it.\n\nIf you’d like to revisit onboarding ${company}, reply here and we can arrange a short call.\n\nGregory`,
  }
}
