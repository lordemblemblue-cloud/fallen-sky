export default function PageHeading({ eyebrow, title, description, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-1.5 font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}