import { useEffect, useMemo, useState } from 'react'

export default function ProductSearchCombobox({
  products = [],
  value = '',
  onChange,
  placeholder = 'ค้นหาสินค้า...'
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => products.find((p) => p.id === value) || null, [products, value])
  useEffect(() => {
    setQ(selected ? `${selected.id} — ${selected.name}` : '')
  }, [selected?.id, selected?.name])
  const filtered = useMemo(() => {
    const term = String(q || '').trim().toLowerCase()
    if (!term) return products.slice(0, 60)
    return products
      .filter((p) => `${p.id} ${p.name}`.toLowerCase().includes(term))
      .slice(0, 60)
  }, [products, q])

  return (
    <div className="relative">
      <input
        type="text"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120)
        }}
        placeholder={placeholder}
        className="w-full border rounded p-2 text-sm"
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto border rounded bg-white shadow">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">ไม่พบสินค้า</div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange?.(p.id)
                setQ(`${p.id} — ${p.name}`)
                setOpen(false)
              }}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-emerald-50 border-b last:border-b-0"
            >
              <span className="font-mono text-gray-600 mr-2">{p.id}</span>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

