"use client";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

export function SegmentedControl<T extends string>({ label, value, options, onChange, className = "" }: {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return <div className={className} role="radiogroup" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? "active" : ""} onClick={() => onChange(option.value)}><span>{option.label}</span>{option.description && <small>{option.description}</small>}</button>)}
  </div>;
}
