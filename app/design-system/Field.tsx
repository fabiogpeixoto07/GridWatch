import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export function Field({ label, hint, error, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: ReactNode }) {
  const id = useId(), messageId = `${id}-message`;
  return <label className={`ds-field ${error ? "invalid" : ""}`} htmlFor={id}><span>{label}</span><input {...input} id={id} aria-invalid={Boolean(error)} aria-describedby={hint || error ? messageId : undefined} />{(error || hint) && <small id={messageId}>{error ?? hint}</small>}</label>;
}
