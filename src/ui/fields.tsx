import { useEffect, useState, type ReactNode } from 'react'

/** A length field shown in centimeters and stored in meters. Commits on blur or Enter. */
export function CmField({ label, value, onChange, min = 1, max = 5000 }: {
  label: string
  value: number
  onChange: (meters: number) => void
  min?: number
  max?: number
}) {
  const [text, setText] = useState(String(Math.round(value * 100)))
  useEffect(() => setText(String(Math.round(value * 100))), [value])
  const commit = () => {
    const v = parseFloat(text)
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)) / 100)
    else setText(String(Math.round(value * 100)))
  }
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-unit">
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <em>cm</em>
      </span>
    </label>
  )
}

export const SWATCHES = ['#f4f1ec', '#e9e5e1', '#bdb8bb', '#d8cfd6', '#f1dcd9', '#e6d3bd', '#c9a883', '#9c7a5b', '#6f6a66', '#3f3b39']

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div className="field color-field">
      <span>{label}</span>
      <div className="swatches">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className={c.toLowerCase() === value.toLowerCase() ? 'swatch on' : 'swatch'}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} 직접 고르기`} />
      </div>
    </div>
  )
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  )
}
