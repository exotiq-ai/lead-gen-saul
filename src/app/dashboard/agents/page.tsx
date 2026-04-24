import { Robot } from '@phosphor-icons/react/dist/ssr'

export default function AgentsPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex items-center justify-center w-14 h-14 rounded-[10px] bg-[var(--color-saul-bg-700)] border border-[rgba(255,255,255,0.06)]">
          <Robot size={28} weight="regular" className="text-[var(--color-saul-cyan)]" />
        </span>
        <div>
          <h2 className="text-[20px] font-semibold text-[var(--color-saul-text-primary)] font-mono tracking-tight">
            Agents
          </h2>
          <p className="text-[14px] text-[var(--color-saul-text-secondary)] mt-1">
            Coming Soon — AI agent run logs &amp; configuration
          </p>
        </div>
        <div className="mt-2 px-4 py-1.5 rounded-full bg-[rgba(0,212,170,0.08)] border border-[rgba(0,212,170,0.15)]">
          <span className="text-[12px] font-semibold text-[var(--color-saul-cyan)] tracking-wide uppercase">
            In development
          </span>
        </div>
      </div>
    </div>
  )
}
