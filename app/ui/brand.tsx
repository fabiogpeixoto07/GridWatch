type BrandProps = {
  className?: string;
};

export function Brand({ className }: BrandProps) {
  return (
    <div className={className} aria-label="GridWatch">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span>GRID<span>{"//"}</span>WATCH</span>
    </div>
  );
}
