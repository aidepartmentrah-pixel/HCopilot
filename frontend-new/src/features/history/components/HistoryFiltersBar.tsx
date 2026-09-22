import { FilterBar } from '@/components/forms/FilterBar'
import { Input } from '@/components/forms/Input'
import { SearchInput } from '@/components/forms/SearchInput'
import { Select } from '@/components/forms/Select'
import type { HistoryFilters } from '../utils'
import styles from './HistoryFiltersBar.module.css'

interface HistoryFiltersBarProps {
  filters: HistoryFilters
  onChange: (filters: HistoryFilters) => void
  bedOptions: string[]
}

/** Only filters the real backend/data actually supports (§22, §35) — every option here comes from real loaded data, not invented. */
export function HistoryFiltersBar({ filters, onChange, bedOptions }: HistoryFiltersBarProps) {
  return (
    <FilterBar>
      <div className={styles.search}>
        <SearchInput
          value={filters.search}
          onChange={(v) => onChange({ ...filters, search: v })}
          placeholder="Search name, stay ID, or complaint…"
        />
      </div>
      <Select
        className={styles.filterControl}
        value={filters.acuity}
        onChange={(e) => onChange({ ...filters, acuity: e.target.value })}
        aria-label="Filter by acuity"
      >
        <option value="">All Acuities</option>
        {[1, 2, 3, 4, 5].map((a) => (
          <option key={a} value={a}>
            ESI {a}
          </option>
        ))}
      </Select>
      <Select
        className={styles.filterControl}
        value={filters.bed}
        onChange={(e) => onChange({ ...filters, bed: e.target.value })}
        aria-label="Filter by bed"
      >
        <option value="">All Beds</option>
        {bedOptions.map((b) => (
          <option key={b} value={b}>
            Bed {b}
          </option>
        ))}
      </Select>
      <Input
        type="date"
        className={styles.filterControl}
        aria-label="Arrival from"
        value={filters.dateFrom}
        onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
      />
      <Input
        type="date"
        className={styles.filterControl}
        aria-label="Arrival to"
        value={filters.dateTo}
        onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
      />
    </FilterBar>
  )
}
