import React from 'react';

/** Shared markdown rendering components for professional document look */
export const docComponents = {
  h1: ({ children, ...props }: React.ComponentPropsWithoutRef<'h1'>) => (
    <div className="mb-8 pb-4 border-b-2 border-border">
      <h1 className="text-2xl font-bold text-ink tracking-tight" {...props}>{children}</h1>
    </div>
  ),
  h2: ({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) => (
    <div className="mt-10 mb-4">
      <h2 className="text-lg font-bold text-ink uppercase tracking-wide" {...props}>{children}</h2>
      <div className="mt-2 h-px bg-border" />
    </div>
  ),
  h3: ({ children, ...props }: React.ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="text-base font-semibold text-ink mt-6 mb-2" {...props}>{children}</h3>
  ),
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
    <p className="text-sm text-ink-secondary leading-relaxed mb-3" {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
    <ul className="space-y-1.5 mb-4 ml-1" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => (
    <ol className="space-y-2 mb-4 ml-1 list-none" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
    <li className="text-sm text-ink-secondary leading-relaxed flex items-start gap-2" {...props}>
      <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 bg-ink-muted" />
      <span className="flex-1">{children}</span>
    </li>
  ),
  strong: ({ children, ...props }: React.ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-ink" {...props}>{children}</strong>
  ),
  hr: () => <div className="my-8 border-t border-border" />,
  code: ({ children, ...props }: React.ComponentPropsWithoutRef<'code'>) => (
    <code className="bg-surface-light border border-border text-xs font-mono px-1.5 py-0.5" {...props}>{children}</code>
  ),
  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
    <pre className="bg-surface-light border border-border p-4 text-xs font-mono overflow-auto mb-4" {...props}>{children}</pre>
  ),
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-auto mb-4 border border-border">
      <table className="w-full text-sm" {...props}>{children}</table>
    </div>
  ),
  th: ({ children, ...props }: React.ComponentPropsWithoutRef<'th'>) => (
    <th className="bg-surface-light text-left text-xs font-semibold text-ink uppercase tracking-wider px-4 py-2.5 border-b border-border" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<'td'>) => (
    <td className="px-4 py-2 text-sm text-ink-secondary border-b border-border" {...props}>{children}</td>
  ),
  blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="border-l-[3px] border-border-strong bg-surface-light px-4 py-3 mb-4 text-sm text-ink-muted italic" {...props}>{children}</blockquote>
  ),
};
