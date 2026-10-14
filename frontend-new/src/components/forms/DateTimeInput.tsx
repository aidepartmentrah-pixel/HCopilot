import { useEffect, useRef } from 'react'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'
import { useController, useFormContext, type FieldValues, type Path } from 'react-hook-form'
import styles from './Controls.module.css'
import './DateTimeInput.css'

/** Local "YYYY-MM-DDTHH:mm" — what the form stores and the API receives. */
export function toLocalDatetimeString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface DateTimeInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  invalid?: boolean
  /** Forbid picking anything later than "now" (re-evaluated every time the picker opens). */
  maxNow?: boolean
}

/**
 * flatpickr-backed date+time picker. The browser-native <input type="datetime-local">
 * has no time selector in Firefox and varies across OS/browser versions; this renders
 * the same calendar + clock everywhere, offline included (bundled, no CDN).
 */
export function DateTimeInput({ id, value, onChange, onBlur, disabled, invalid, maxNow }: DateTimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const fpRef = useRef<flatpickr.Instance | null>(null)
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  useEffect(() => {
    onChangeRef.current = onChange
    onBlurRef.current = onBlur
  })

  useEffect(() => {
    if (!inputRef.current) return
    const fp = flatpickr(inputRef.current, {
      enableTime: true,
      time_24hr: false,
      minuteIncrement: 1,
      allowInput: false,
      dateFormat: 'Y-m-d\\TH:i',
      altInput: true,
      altFormat: 'M j, Y — h:i K',
      altInputClass: `${styles.control} dt-input`,
      onOpen: (_d, _s, inst) => {
        if (maxNow) inst.set('maxDate', new Date())
      },
      onChange: (_d, str) => onChangeRef.current(str),
      onClose: () => onBlurRef.current?.(),
    })
    if (maxNow) fp.set('maxDate', new Date())
    fpRef.current = fp
    return () => {
      fp.destroy()
      fpRef.current = null
    }
  }, [maxNow])

  // Keep the picker in sync with form state (reset, load, programmatic set).
  useEffect(() => {
    const fp = fpRef.current
    if (!fp) return
    if (!value) fp.clear(false)
    else if (fp.input.value !== value) fp.setDate(value, false)
  }, [value, maxNow])

  useEffect(() => {
    const alt = fpRef.current?.altInput
    if (alt) {
      alt.disabled = !!disabled
      alt.classList.toggle(styles.invalid, !!invalid)
      if (id) alt.id = `${id}-display`
    }
  }, [disabled, invalid, id])

  return <input ref={inputRef} id={id} type="text" defaultValue={value} />
}

interface FormDateTimeInputProps<T extends FieldValues> extends Omit<DateTimeInputProps, 'value' | 'onChange' | 'onBlur'> {
  name: Path<T>
}

/** DateTimeInput bound to the surrounding react-hook-form context. */
export function FormDateTimeInput<T extends FieldValues>({ name, ...rest }: FormDateTimeInputProps<T>) {
  const { control } = useFormContext<T>()
  const { field } = useController({ name, control })
  return <DateTimeInput {...rest} value={(field.value as string | undefined) ?? ''} onChange={field.onChange} onBlur={field.onBlur} />
}
