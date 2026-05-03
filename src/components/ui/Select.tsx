'use client'

import {
  useState,
  useRef,
  useEffect,
  useId,
  type KeyboardEvent,
} from 'react'
import { motion, AnimatePresence, type Variants, type Transition } from 'framer-motion'
import { CaretDown, Check } from '@phosphor-icons/react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  options: SelectOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
  id?: string
}

const panelVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -4,
    scale: 0.98,
    transition: { duration: 0.12 } as Transition,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 28 } as Transition,
  },
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  disabled = false,
  className = '',
  id: externalId,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const generatedId = useId()
  const id = externalId ?? generatedId
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedOption = options.find((o) => o.value === value)

  function toggle() {
    if (disabled) return
    setOpen((prev) => {
      if (!prev) setFocusedIndex(selectedOption ? options.indexOf(selectedOption) : 0)
      return !prev
    })
  }

  function select(option: SelectOption) {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open && focusedIndex >= 0) {
          select(options[focusedIndex])
        } else {
          toggle()
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (!open) {
          setOpen(true)
          setFocusedIndex(0)
        } else {
          setFocusedIndex((i) => {
            const next = i + 1
            return next < options.length ? next : i
          })
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (open) {
          setFocusedIndex((i) => {
            const prev = i - 1
            return prev >= 0 ? prev : 0
          })
        }
        break
      case 'Home':
        e.preventDefault()
        if (open) setFocusedIndex(0)
        break
      case 'End':
        e.preventDefault()
        if (open) setFocusedIndex(options.length - 1)
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  // Scroll focused item into view
  useEffect(() => {
    if (!open || focusedIndex < 0) return
    const item = listRef.current?.children[focusedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex, open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleOutsideClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block mb-1.5 text-xs font-medium text-[var(--color-saul-text-secondary)]"
        >
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={[
          'w-full flex items-center justify-between gap-2 h-9 px-3 rounded-[6px] text-sm transition-colors duration-150 outline-none',
          'bg-[var(--color-saul-bg-700)] border border-[var(--color-saul-border-strong)] text-[var(--color-saul-text-primary)]',
          'hover:border-[var(--color-saul-border-stronger)] focus-visible:border-[var(--color-saul-cyan)] focus-visible:ring-1 focus-visible:ring-[var(--color-saul-cyan)]',
          open ? 'border-[var(--color-saul-border-stronger)]' : '',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span
          className={
            selectedOption
              ? 'text-[var(--color-saul-text-primary)]'
              : 'text-[var(--color-saul-text-tertiary)]'
          }
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          className="text-[var(--color-saul-text-secondary)] shrink-0"
        >
          <CaretDown size={14} weight="bold" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="select-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="absolute z-50 left-0 right-0 mt-1.5 rounded-[8px] border border-[var(--color-saul-border-strong)] bg-[var(--color-saul-bg-700)] shadow-[0_8px_32px_var(--color-saul-shadow)] overflow-hidden"
          >
            <ul
              ref={listRef}
              id={`${id}-listbox`}
              role="listbox"
              aria-label={label ?? 'Options'}
              className="max-h-60 overflow-y-auto py-1"
            >
              {options.map((option, index) => {
                const isSelected = option.value === value
                const isFocused = index === focusedIndex

                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    onClick={() => select(option)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={[
                      'flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer transition-colors duration-100 select-none',
                      isSelected
                        ? 'text-[var(--color-saul-cyan)] bg-[color-mix(in_srgb,var(--color-saul-cyan)_8%,transparent)]'
                        : 'text-[var(--color-saul-text-primary)]',
                      isFocused && !isSelected
                        ? 'bg-[var(--color-saul-overlay-low)]'
                        : '',
                      option.disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <Check
                        size={13}
                        weight="bold"
                        className="text-[var(--color-saul-cyan)] shrink-0"
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
