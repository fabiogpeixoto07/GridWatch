"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Dialog({ title, children, actions, onClose }: { title: string; children: ReactNode; actions: ReactNode; onClose: () => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((item) => !item.hasAttribute("disabled"));
      if (!items.length) return;
      const next = event.shiftKey ? items.at(-1) : items[0];
      if ((event.shiftKey && document.activeElement === items[0]) || (!event.shiftKey && document.activeElement === items.at(-1))) { event.preventDefault(); next?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);
  return <div className="editor-import-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={panelRef}><strong id={titleId}>{title}</strong>{children}<div>{actions}</div></section></div>;
}
