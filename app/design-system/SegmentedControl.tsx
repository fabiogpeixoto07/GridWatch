export function SegmentedControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return <div className="ds-segmented" role="radiogroup" aria-label={label}>{options.map((option) => <button type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? "active" : ""} key={option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
