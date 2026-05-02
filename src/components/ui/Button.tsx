'use client'

import { useRef, type ButtonHTMLAttributes } from 'react'
import React from 'react'
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  type MotionProps,
} from 'framer-motion'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof MotionProps> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  children?: React.ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-saul-cyan)] text-[var(--color-saul-text-on-accent)] font-semibold border border-[var(--color-saul-cyan)] hover:bg-[var(--color-saul-cyan-400)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]',
  secondary:
    'bg-[var(--color-saul-bg-600)] text-[var(--color-saul-text-primary)] font-medium border border-[var(--color-saul-border-strong)] hover:border-[var(--color-saul-border-stronger)] hover:bg-[var(--color-saul-overlay)] shadow-[inset_0_1px_0_var(--color-saul-overlay-low)]',
  ghost:
    'bg-transparent text-[var(--color-saul-text-secondary)] font-medium border border-transparent hover:border-[var(--color-saul-border-strong)] hover:text-[var(--color-saul-text-primary)] hover:bg-[var(--color-saul-overlay-low)]',
  danger:
    'bg-[color-mix(in_srgb,var(--color-saul-danger)_12%,transparent)] text-[var(--color-saul-danger)] font-medium border border-[color-mix(in_srgb,var(--color-saul-danger)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-saul-danger)_20%,transparent)] shadow-[inset_0_1px_0_var(--color-saul-overlay-low)]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2.5',
}

const MAGNETIC_STRENGTH = 0.35

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)

  const springConfig = { type: 'spring' as const, stiffness: 100, damping: 20 }
  const x = useSpring(useTransform(rawX, (v) => v * MAGNETIC_STRENGTH), springConfig)
  const y = useSpring(useTransform(rawY, (v) => v * MAGNETIC_STRENGTH), springConfig)

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    rawX.set(e.clientX - rect.left - rect.width / 2)
    rawY.set(e.clientY - rect.top - rect.height / 2)
  }

  function handleMouseLeave() {
    rawX.set(0)
    rawY.set(0)
  }

  const isDisabled = disabled || loading

  return (
    <motion.button
      ref={ref}
      style={{ x, y }}
      whileTap={{ scale: 0.98 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      disabled={isDisabled}
      className={[
        'relative inline-flex items-center justify-center rounded-[6px] transition-colors duration-150 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-saul-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-saul-bg-800)]',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...(props as MotionProps)}
    >
      {loading && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <LoadingDots />
        </span>
      )}
      <span className={loading ? 'invisible' : 'flex items-center gap-[inherit]'}>
        {children}
      </span>
    </motion.button>
  )
}

function LoadingDots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-current"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.18,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  )
}
