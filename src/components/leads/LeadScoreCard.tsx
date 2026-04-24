'use client'

interface LeadScoreCardProps {
  score: number
  className?: string
}

function getScoreTier(score: number): { tier: number; label: string; bg: string; border: string; text: string } {
  if (score >= 80) {
    return {
      tier: 1,
      label: 'Tier 1',
      bg: 'bg-[rgba(0,212,170,0.10)]',
      border: 'border-[rgba(0,212,170,0.22)]',
      text: 'text-[var(--color-saul-cyan)]',
    }
  }
  if (score >= 60) {
    return {
      tier: 2,
      label: 'Tier 2',
      bg: 'bg-[rgba(59,130,246,0.10)]',
      border: 'border-[rgba(59,130,246,0.22)]',
      text: 'text-[#3B82F6]',
    }
  }
  if (score >= 40) {
    return {
      tier: 3,
      label: 'Tier 3',
      bg: 'bg-[rgba(255,174,66,0.10)]',
      border: 'border-[rgba(255,174,66,0.22)]',
      text: 'text-[var(--color-saul-warning)]',
    }
  }
  return {
    tier: 4,
    label: 'Tier 4',
    bg: 'bg-[rgba(255,71,87,0.10)]',
    border: 'border-[rgba(255,71,87,0.22)]',
    text: 'text-[var(--color-saul-danger)]',
  }
}

export function LeadScoreCard({ score, className = '' }: LeadScoreCardProps) {
  const config = getScoreTier(score)

  return (
    <div
      className={[
        'inline-flex flex-col items-center justify-center min-w-[48px] px-2.5 py-1.5',
        'rounded-[5px] border',
        config.bg,
        config.border,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className={[
          'text-[15px] font-mono font-bold leading-none tabular-nums',
          config.text,
        ].join(' ')}
      >
        {score}
      </span>
      <span className="text-[9px] font-medium tracking-wide uppercase text-[var(--color-saul-text-tertiary)] mt-0.5 leading-none">
        {config.label}
      </span>
    </div>
  )
}

export { getScoreTier }
