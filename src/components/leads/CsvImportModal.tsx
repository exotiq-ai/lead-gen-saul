'use client'

import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadSimple, X, CheckCircle, SpinnerGap, Warning } from '@phosphor-icons/react'

interface CsvImportModalProps {
  open: boolean
  onClose: () => void
  tenantId: string
  onSuccess: () => void
}

interface ParsedLead {
  company_name: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  city?: string
  state?: string
  source?: string
}

type ModalState = 'upload' | 'preview' | 'importing' | 'done' | 'error'

// ---------------------------------------------------------------------------
// Header mapping (case-insensitive, flexible naming)
// ---------------------------------------------------------------------------
const HEADER_MAP: Record<string, keyof ParsedLead> = {
  company_name: 'company_name',
  company: 'company_name',
  business_name: 'company_name',
  business: 'company_name',
  first_name: 'first_name',
  first: 'first_name',
  firstname: 'first_name',
  last_name: 'last_name',
  last: 'last_name',
  lastname: 'last_name',
  email: 'email',
  email_address: 'email',
  phone: 'phone',
  phone_number: 'phone',
  city: 'city',
  state: 'state',
  source: 'source',
}

function parseCsv(text: string): ParsedLead[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''))
  const fieldMap = headers.map((h) => HEADER_MAP[h] ?? null)

  if (!fieldMap.includes('company_name')) return []

  const leads: ParsedLead[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    const lead: Record<string, string> = {}
    for (let j = 0; j < fieldMap.length; j++) {
      const field = fieldMap[j]
      if (field && cols[j]) lead[field] = cols[j]
    }
    if (lead.company_name) leads.push(lead as unknown as ParsedLead)
  }
  return leads
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CsvImportModal({ open, onClose, tenantId, onSuccess }: CsvImportModalProps) {
  const [state, setState] = useState<ModalState>('upload')
  const [leads, setLeads] = useState<ParsedLead[]>([])
  const [importedCount, setImportedCount] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setState('upload')
    setLeads([])
    setImportedCount(0)
    setErrorMsg('')
    setDragOver(false)
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const processFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseCsv(text)
      if (parsed.length === 0) {
        setErrorMsg('No valid leads found. Make sure your CSV has a "company_name" or "company" column header.')
        setState('error')
        return
      }
      setLeads(parsed)
      setState('preview')
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) processFile(file)
  }, [processFile])

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  const handleImport = useCallback(async () => {
    setState('importing')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, leads }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setImportedCount(data.imported)
      setState('done')
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 1500)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed')
      setState('error')
    }
  }, [tenantId, leads, onSuccess, handleClose])

  if (!open) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60"
          onClick={handleClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.15 }}
          className="relative z-10 bg-[var(--color-saul-bg-700)] border border-[var(--color-saul-border-strong)] rounded-xl shadow-2xl max-w-[640px] w-full mx-4 p-6"
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-[var(--color-saul-text-tertiary)] hover:text-[var(--color-saul-text-primary)] transition-colors"
          >
            <X size={18} weight="bold" />
          </button>

          <h2 className="text-[16px] font-semibold text-[var(--color-saul-text-primary)] mb-4">
            Import Leads from CSV
          </h2>

          {/* Upload state */}
          {state === 'upload' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={[
                'flex flex-col items-center justify-center gap-3 p-10 rounded-lg border-2 border-dashed transition-colors duration-150 cursor-pointer',
                dragOver
                  ? 'border-[var(--color-saul-cyan)] bg-[color-mix(in_srgb,var(--color-saul-cyan)_6%,transparent)]'
                  : 'border-[var(--color-saul-border-strong)] hover:border-[var(--color-saul-border-stronger)]',
              ].join(' ')}
              onClick={() => fileRef.current?.click()}
            >
              <UploadSimple size={32} weight="light" className="text-[var(--color-saul-text-secondary)]" />
              <p className="text-[13px] text-[var(--color-saul-text-secondary)]">
                Drag a CSV file here, or <span className="text-[var(--color-saul-cyan)] font-medium">browse</span>
              </p>
              <p className="text-[11px] text-[var(--color-saul-text-tertiary)]">
                Required column: company_name (or company, business_name)
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          )}

          {/* Preview state */}
          {state === 'preview' && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-[var(--color-saul-text-secondary)]">
                <span className="text-[var(--color-saul-cyan)] font-bold">{leads.length}</span> leads ready to import
              </p>

              <div className="overflow-x-auto rounded-lg border border-[var(--color-saul-border)]">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[var(--color-saul-bg-800)]">
                      <th className="px-3 py-2 text-left text-[var(--color-saul-text-secondary)] font-medium">Company</th>
                      <th className="px-3 py-2 text-left text-[var(--color-saul-text-secondary)] font-medium">Email</th>
                      <th className="px-3 py-2 text-left text-[var(--color-saul-text-secondary)] font-medium">City</th>
                      <th className="px-3 py-2 text-left text-[var(--color-saul-text-secondary)] font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.slice(0, 10).map((lead, i) => (
                      <tr key={i} className="border-t border-[var(--color-saul-border-soft)]">
                        <td className="px-3 py-1.5 text-[var(--color-saul-text-primary)] truncate max-w-[180px]">{lead.company_name}</td>
                        <td className="px-3 py-1.5 text-[var(--color-saul-text-secondary)] truncate max-w-[160px]">{lead.email || '—'}</td>
                        <td className="px-3 py-1.5 text-[var(--color-saul-text-secondary)]">{lead.city || '—'}</td>
                        <td className="px-3 py-1.5 text-[var(--color-saul-text-secondary)]">{lead.state || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {leads.length > 10 && (
                  <p className="px-3 py-2 text-[11px] text-[var(--color-saul-text-tertiary)] border-t border-[var(--color-saul-border-soft)]">
                    ...and {leads.length - 10} more
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={reset}
                  className="px-4 py-2 text-[13px] font-medium text-[var(--color-saul-text-secondary)] rounded-[6px] border border-[var(--color-saul-border-strong)] hover:border-[var(--color-saul-border-stronger)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="px-4 py-2 text-[13px] font-semibold text-[var(--color-saul-text-on-accent)] bg-[var(--color-saul-cyan)] rounded-[6px] hover:brightness-110 transition-all"
                >
                  Import {leads.length} leads
                </button>
              </div>
            </div>
          )}

          {/* Importing state */}
          {state === 'importing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <SpinnerGap size={28} className="text-[var(--color-saul-cyan)] animate-spin" />
              <p className="text-[13px] text-[var(--color-saul-text-secondary)]">
                Importing {leads.length} leads...
              </p>
            </div>
          )}

          {/* Done state */}
          {state === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle size={32} weight="fill" className="text-[var(--color-saul-success)]" />
              <p className="text-[14px] font-medium text-[var(--color-saul-text-primary)]">
                {importedCount} leads imported!
              </p>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Warning size={28} weight="fill" className="text-[var(--color-saul-danger)]" />
              <p className="text-[13px] text-[var(--color-saul-danger)]">{errorMsg}</p>
              <button
                onClick={reset}
                className="mt-2 px-4 py-2 text-[13px] font-medium text-[var(--color-saul-text-secondary)] rounded-[6px] border border-[var(--color-saul-border-strong)] hover:border-[var(--color-saul-border-stronger)] transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
