import React from "react";

export default function Panel({ title, count, className = "", children }) {
  return (
    <section className={`flex flex-col rounded-lg border border-border bg-card ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold tracking-tight">{title}</h2>
        {count != null && (
          <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
        )}
      </header>
      <div className="flex-1 p-2">{children}</div>
    </section>
  );
}