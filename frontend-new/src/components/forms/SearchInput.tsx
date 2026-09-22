import { Search, X } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import styles from './SearchInput.module.css'

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
}

export function SearchInput({ value, onChange, placeholder = 'Search…', ...rest }: SearchInputProps) {
  return (
    <div className={styles.wrapper}>
      <Search className={styles.searchIcon} size={16} aria-hidden="true" />
      <input
        type="search"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {value && (
        <button type="button" className={styles.clear} aria-label="Clear search" onClick={() => onChange('')}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}
