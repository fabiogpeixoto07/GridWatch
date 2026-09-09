import type { ButtonHTMLAttributes } from "react";

export function Button({ className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`ds-button ${className}`.trim()} {...props} />;
}
