import { useEffect, useMemo, useState } from 'react'
import Icon from '../common/Icon'
import {
  mergeEmailIntoAllowedViewerText,
  parseAllowedViewerEmailsFromText
} from '../../utils/helpers'
import { searchCustomersForVisibilityPicker } from '../../services/userDirectoryService'

export default function AllowedViewerEmailPicker({ value, onChange, disabled = false }) {
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)

  const selected = useMemo(() => parseAllowedViewerEmailsFromText(value), [value])

  useEffect(() => {
    if (disabled) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const list = await searchCustomersForVisibilityPicker(search, 20)
        if (!cancelled) {
          const selectedSet = new Set(selected)
          setSuggestions(list.filter((c) => !selectedSet.has(c.email)))
        }
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search, selected, disabled])

  const addEmail = (email) => {
    onChange(mergeEmailIntoAllowedViewerText(value, email))
    setSearch('')
    setSuggestions([])
  }

  const removeEmail = (email) => {
    onChange(selected.filter((e) => e !== email).join('\n'))
  }

  const showDropdown = !disabled && search.trim().length > 0

  return (
    <div className={`space-y-2 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1 max-w-full text-xs bg-white border border-amber-200 text-amber-950 rounded-full pl-2.5 pr-1 py-0.5"
            >
              <span className="truncate">{email}</span>
              <button
                type="button"
                onClick={() => removeEmail(email)}
                className="shrink-0 p-0.5 rounded-full hover:bg-amber-100 text-amber-800"
                aria-label={`ลบ ${email}`}
              >
                <Icon icon="fa-times" className="text-[10px]" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="พิมพ์อีเมลหรือชื่อเพื่อค้นหา..."
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          autoComplete="off"
        />
        {loading && search.trim() && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">...</span>
        )}
        {showDropdown && (
          <ul className="absolute z-20 left-0 right-0 mt-1 border border-gray-200 rounded-lg shadow-lg bg-white max-h-40 overflow-y-auto text-sm">
            {suggestions.length === 0 && !loading ? (
              <li className="px-3 py-2 text-gray-500 text-xs">ไม่พบอีเมลที่ตรงกัน</li>
            ) : (
              suggestions.map((c) => (
                <li key={c.email}>
                  <button
                    type="button"
                    onClick={() => addEmail(c.email)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b border-gray-50 last:border-0"
                  >
                    <span className="block font-medium text-gray-900 truncate">{c.email}</span>
                    {c.username ? (
                      <span className="block text-xs text-gray-500 truncate">
                        {c.username} · {c.userType}
                      </span>
                    ) : (
                      <span className="block text-xs text-gray-500">{c.userType}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
        placeholder="หรือวางอีเมลหลายรายการ (คั่นด้วยเว้นวรรค / บรรทัด / ,)"
      />
    </div>
  )
}
