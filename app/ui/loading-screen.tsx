import { Brand } from "./brand";

type LoadingScreenProps = {
  title: string;
  detail: string;
};

export function LoadingScreen({ title, detail }: LoadingScreenProps) {
  return (
    <main className="menu-shell editor-loading" aria-busy="true" aria-live="polite">
      <Brand className="menu-brand" />
      <div className="loading-card">
        <span className="loading-indicator" aria-hidden="true"><i /><i /><i /></span>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </main>
  );
}
