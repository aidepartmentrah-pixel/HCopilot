import { Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePatients } from '@/hooks/usePatients'
import { useHistory } from '@/hooks/useHistory'
import { useClickOutside } from '@/hooks/useClickOutside'
import styles from './GlobalSearch.module.css'

interface SearchResult {
  stayId: number
  patientId: number
  name: string
  status: 'Active' | 'Discharged'
  meta: string
}

/**
 * Real search over data this app already fetches elsewhere (usePatients /
 * useHistory) — there is no dedicated backend search endpoint yet (§8/§12
 * only ask for the UI location + "connect only the scopes currently
 * supported"), so this scopes to patient name / patient ID / stay ID
 * across active + discharged stays, client-side. Selecting a result opens
 * its Full Record, which already resolves either source by stay id.
 */
export function GlobalSearch() {
  const navigate = useNavigate()
  const { data: activeData, isLoading: activeLoading, isError: activeError } = usePatients()
  const { data: historyData, isLoading: historyLoading, isError: historyError } = useHistory()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setOpen(false))

  const results = useMemo<SearchResult[]>(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []

    const active: SearchResult[] = (activeData?.patients ?? []).map((p) => ({
      stayId: p.stay_id,
      patientId: p.patient_id,
      name: p.name,
      status: 'Active',
      meta: [p.age != null ? `${p.age}y` : null, p.gender].filter(Boolean).join(' · '),
    }))
    const discharged: SearchResult[] = (historyData?.patients ?? []).map((p) => ({
      stayId: p.stay_id,
      patientId: p.subject_id,
      name: p.name,
      status: 'Discharged',
      meta: [p.age != null ? `${p.age}y` : null, p.gender].filter(Boolean).join(' · '),
    }))

    return [...active, ...discharged]
      .filter(
        (r) =>
          r.name?.toLowerCase().includes(term) ||
          String(r.patientId).includes(term) ||
          String(r.stayId).includes(term),
      )
      .slice(0, 8)
  }, [query, activeData, historyData])

  const isLoading = activeLoading || historyLoading
  const isError = activeError && historyError

  function selectResult(result: SearchResult) {
    setQuery('')
    setOpen(false)
    navigate(`/history/${result.stayId}`)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectResult(results[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={styles.wrapper} ref={containerRef}>
      <Search className={styles.icon} size={16} aria-hidden="true" />
      <input
        type="search"
        className={styles.input}
        placeholder="Search patients, MRN, or visit ID…"
        aria-label="Search patients, MRN, or visit ID"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="global-search-results"
        dir="auto"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlighted(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && query.trim() && (
        <div id="global-search-results" role="listbox" className={styles.results}>
          {isLoading && <div className={styles.status}>Searching…</div>}
          {!isLoading && isError && <div className={styles.status}>Search is temporarily unavailable.</div>}
          {!isLoading && !isError && results.length === 0 && <div className={styles.status}>No matches.</div>}
          {!isLoading &&
            !isError &&
            results.map((r, i) => (
              <button
                key={`${r.status}-${r.stayId}`}
                type="button"
                role="option"
                aria-selected={i === highlighted}
                className={[styles.result, i === highlighted ? styles.resultActive : ''].filter(Boolean).join(' ')}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => selectResult(r)}
              >
                <span className={styles.resultName} dir="auto">
                  {r.name}
                </span>
                <span className={styles.resultMeta}>
                  #{r.patientId} · {r.status}
                  {r.meta ? ` · ${r.meta}` : ''}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
