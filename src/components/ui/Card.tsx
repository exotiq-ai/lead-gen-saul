'use client'

import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion'

interface CardProps {
  children: ReactNode
  className?: string
  interactive?: boolean
  spotlight?: boolean
  onClick?: () => void
}

export function Card({
  children,
  className = '',
  interactive = false,
  spotlight = false,
  onClick,
}: CardProps) {
  if (spotlight) {
    return (
      <SpotlightCard
        interactive={interactive}
        className={className}
        onClick={onClick}
      >
        {children}
      </SpotlightCard>
    )
  }

  return (
    <div
      className={[
        'rounded-[8px] border border-[var(--color-saul-border)] bg-[var(--color-saul-bg-700)] transition-all duration-200',
        interactive
          ? 'cursor-pointer hover:border-[var(--color-saul-border-strong)] hover:shadow-[0_4px_24px_var(--color-saul-shadow-soft)]'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

function SpotlightCard({
  children,
  className = '',
  interactive = false,
  onClick,
}: Omit<CardProps, 'spotlight'>) {
  const ref = useRef<HTMLDivElement>(null)

  const mouseX = useMotionValue(-500)
  const mouseY = useMotionValue(-500)

  const springX = useSpring(mouseX, { damping: 25, stiffness: 180 })
  const springY = useSpring(mouseY, { damping: 25, stiffness: 180 })

  const overlayOpacity = useTransform(mouseX, (v) => (v === -500 ? 0 : 1))

  const gradientBg = useTransform(
    [springX, springY],
    ([x, y]: number[]) =>
      `radial-gradient(280px circle at ${x}px ${y}px, rgba(0,212,170,0.09), transparent 70%)`
  )

  const borderGradient = useTransform(
    [springX, springY],
    ([x, y]: number[]) =>
      `radial-gradient(220px circle at ${x}px ${y}px, rgba(0,212,170,0.3), transparent 65%)`
  )

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    mouseX.set(e.clientX - rect.left)
    mouseY.set(e.clientY - rect.top)
  }

  function handleMouseLeave() {
    mouseX.set(-500)
    mouseY.set(-500)
  }

  return (
    <div
      ref={ref}
      className={[
        'relative rounded-[8px] bg-[var(--color-saul-bg-700)] transition-shadow duration-200 overflow-hidden',
        interactive ? 'cursor-pointer hover:shadow-[0_4px_24px_var(--color-saul-shadow)]' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {/* Border layer — spotlight illuminate */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[8px]"
        style={{
          padding: '1px',
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          background: borderGradient,
          opacity: overlayOpacity,
        }}
      />
      {/* Static base border */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[8px] border border-[var(--color-saul-border)]"
      />
      {/* Spotlight fill */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[8px]"
        style={{ background: gradientBg, opacity: overlayOpacity }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
