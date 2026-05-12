import { formatNonNegativeDecimalString, formatNonNegativeIntString } from '../../utils/digitsInput'

/**
 * ช่องตัวเลขแบบ text + inputMode — ตัดเลข 0 นำหน้าให้สอดคล้องกับ digitsInput
 * @param {'int'|'decimal'} variant
 * @param {string|number} value
 * @param {(next: string) => void} onChange คืนค่าเป็นสตริงที่ normalize แล้ว
 */
export default function NumericTextField({
  variant = 'int',
  value,
  onChange,
  className = '',
  placeholder,
  disabled,
  required,
  id,
  name,
  'aria-label': ariaLabel,
  onBlur,
  onFocus,
  autoFocus,
  ...rest
}) {
  const raw = value === undefined || value === null ? '' : String(value)
  const display =
    variant === 'decimal'
      ? raw === ''
        ? ''
        : formatNonNegativeDecimalString(raw)
      : formatNonNegativeIntString(raw)

  const handleChange = (e) => {
    const next =
      variant === 'decimal'
        ? formatNonNegativeDecimalString(e.target.value)
        : formatNonNegativeIntString(e.target.value)
    onChange(next)
  }

  return (
    <input
      type="text"
      inputMode={variant === 'decimal' ? 'decimal' : 'numeric'}
      autoComplete="off"
      {...rest}
      id={id}
      name={name}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={onFocus}
      autoFocus={autoFocus}
    />
  )
}
