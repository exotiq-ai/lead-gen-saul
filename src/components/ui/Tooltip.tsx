'use client'

import {
  useState,
  useRef,
  useId,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: ReactNode
  position?: TooltipPosition
  children: ReactNode
  delay?: number
  className?: string
}

const OFFSET = 8

const positionStyles: Record<TooltipPosition, CSSProperties> = {
  top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', paddingBottom: `${OFFSET}px` },
  bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', paddingTop: `${OFFSET}px` },
  left: { right: '100%', top: '50%', transform: 'translateY(-50%)', paddingRight: `${OFFSET}px` },
  right: { left: '100%', top: '50%', transform: 'translateY(-50%)', paddingLeft: `${OFFSET}px` },
}

const animationVariants: Record<TooltipPosition, Variants> = {
  top: {
    hidden: { opacity: 0, y: 4, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1 },
  },
  bottom: {
    hidden: { opacity: 0, y: -4, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1 },
  },
  left: {
    hidden: { opacity: 0, x: 4, scale: 0.95 },
    visible: { opacity: 1, x: 0, scale: 1 },
  },
  right: {
    hidden: { opacity: 0, x: -4, scale: 0.95 },
    visible: { opacity: 1, x: 0, scale: 1 },
  },
}

export function Tooltip({
  content,
  position = 'top',
  children,
  delay = 300,
  className = '',
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()

  function show() {
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  const variants = animationVariants[position]

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-describedby={visible ? tooltipId : undefined}>{children}</span>

      <AnimatePresence>
        {visible && (
          <span
            style={positionStyles[position]}
            className="absolute z-50 pointer-events-none"
          >
            <motion.span
              id={tooltipId}
              role="tooltip"
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              className={[
                'inline-block whitespace-nowrap px-2.5 py-1.5 rounded-[4px] text-xs font-medium leading-none',
                'bg-[var(--color-saul-bg-900)] text-[var(--color-saul-text-primary)]',
                'border border-[var(--color-saul-border-strong)] shadow-[0_4px_16px_var(--color-saul-shadow)]',
                className,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {content}
            </motion.span>
          </span>
        )}
      </AnimatePresence>
    </span>
  )
}
