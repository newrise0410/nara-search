'use client'

import type { ReactElement, ReactNode } from 'react'
import { splitNumUnit } from '@/lib/format'
import { tagClassName, type TagTone } from '@/lib/tag-color'

export function PageHeader({ title, sub, count }: { title: string; sub?: ReactNode; count?: string }): ReactElement {
  return (
    <div className="page-head">
      <div className="row">
        <h1 className="page-title">{title}</h1>
        {count ? <span className="mono muted">{count}</span> : null}
      </div>
      {sub ? <div className="page-sub">{sub}</div> : null}
    </div>
  )
}

export function Card({ pad, accent, className, children }: { pad?: 'sm' | 'md' | 'lg'; accent?: boolean; className?: string; children: ReactNode }): ReactElement {
  const classes = ['card', pad && pad !== 'md' ? `pad-${pad}` : '', accent ? 'is-accent' : '', className ?? ''].filter(Boolean).join(' ')
  return <div className={classes}>{children}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }): ReactElement {
  return <div className="section-title"><span>{children}</span>{right ? <span className="spacer">{right}</span> : null}</div>
}

export function Label({ children }: { children: ReactNode }): ReactElement {
  return <div className="label">{children}</div>
}

export function Tag({ tone = 'gray', children }: { tone?: TagTone; children: ReactNode }): ReactElement {
  return <span className={tagClassName(tone)}>{children}</span>
}

export function Num({ value, unit, className }: { value: string; unit?: string; className?: string }): ReactElement {
  const parsed = unit === undefined ? splitNumUnit(value) : { number: value, unit }
  const classes = className ?? ''
  if (!parsed.number) return <span className={classes}>{parsed.unit}</span>
  return <span className={classes}><span className="mono">{parsed.number}</span>{parsed.unit ? <span className="num-unit">{parsed.unit}</span> : null}</span>
}

export function Kpi({ label, value, unit, sub, children, onClick }: { label: string; value?: string; unit?: string; sub?: ReactNode; children?: ReactNode; onClick?: () => void }): ReactElement {
  const body = <>
    <div className="label">{label}</div>
    <div className="kpi-value">{children !== undefined ? children : <Num value={value ?? '-'} unit={unit} />}</div>
    {sub !== undefined ? <div className="kpi-sub">{sub}</div> : null}
  </>
  if (onClick) return <button type="button" className="kpi kpi-link" onClick={onClick} aria-label={`${label} 결과 보기`}>{body}</button>
  return (
    <div className="kpi">
      {body}
    </div>
  )
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div className="field">
      {htmlFor ? <label className="label" htmlFor={htmlFor}>{label}</label> : <div className="label">{label}</div>}
      {children}
      {hint !== undefined ? <div className="faint">{hint}</div> : null}
    </div>
  )
}

export interface SegmentedOption<T extends string> { value: T; label: string; disabled?: boolean }

export function Segmented<T extends string>({ options, value, onChange, ariaLabel, size }: { options: readonly SegmentedOption<T>[]; value: T; onChange: (value: T) => void; ariaLabel: string; size?: 'md' | 'sm' }): ReactElement {
  return (
    <div className={`seg${size === 'sm' ? ' seg-sm' : ''}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value
        return <button key={option.value} type="button" className={`seg-item${selected ? ' is-active' : ''}`} aria-pressed={selected} disabled={option.disabled} onClick={() => onChange(option.value)}>{option.label}</button>
      })}
    </div>
  )
}

export function Toggle({ checked, onChange, ariaLabel, disabled }: { checked: boolean; onChange: (checked: boolean) => void; ariaLabel: string; disabled?: boolean }): ReactElement {
  return <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} className="toggle" disabled={disabled} onClick={() => onChange(!checked)} />
}

export function StatusDot({ tone }: { tone: 'green' | 'yellow' | 'red' | 'gray' }): ReactElement {
  return <span className={`status-dot dot-${tone}`} aria-hidden="true" />
}

export function Empty({ children }: { children: ReactNode }): ReactElement {
  return <div className="empty">{children}</div>
}

export function Notice({ children }: { children: ReactNode }): ReactElement {
  return <div className="notice">{children}</div>
}
