export default function Panel({ title, action, className = "", children }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}