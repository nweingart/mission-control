import { useState } from 'react';
import type { DiffFile, DiffHunk, DiffLine } from '../utils/diff-parser';

interface DiffViewerProps {
  files: DiffFile[];
  loading: boolean;
  error: string | null;
}

function statusIcon(status: DiffFile['status']): { label: string; color: string } {
  switch (status) {
    case 'added':
      return { label: 'A', color: 'text-success bg-success/15' };
    case 'deleted':
      return { label: 'D', color: 'text-error bg-error/15' };
    case 'renamed':
      return { label: 'R', color: 'text-accent bg-accent/15' };
    default:
      return { label: 'M', color: 'text-ink-muted bg-surface' };
  }
}

export default function DiffViewer({ files, loading, error }: DiffViewerProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-ink-muted">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading diff...
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-error">{error}</div>;
  }

  if (files.length === 0) {
    return <div className="p-4 text-sm text-ink-muted">No file changes</div>;
  }

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs text-ink-muted px-1">
        <span>{files.length} file{files.length !== 1 ? 's' : ''} changed</span>
        {totalAdditions > 0 && <span className="text-success">+{totalAdditions}</span>}
        {totalDeletions > 0 && <span className="text-error">-{totalDeletions}</span>}
      </div>

      {/* File list */}
      {files.map((file, idx) => (
        <FileSection key={idx} file={file} defaultExpanded={files.length <= 3} />
      ))}
    </div>
  );
}

function FileSection({ file, defaultExpanded }: { file: DiffFile; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { label, color } = statusIcon(file.status);

  const displayPath = file.status === 'renamed' && file.oldPath !== file.newPath
    ? `${file.oldPath} → ${file.newPath}`
    : file.newPath;

  return (
    <div className="border border-border overflow-hidden">
      {/* File header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-surface/80 transition-colors text-left"
      >
        <svg
          className={`w-3 h-3 text-ink-muted flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className={`text-[10px] font-mono font-bold w-4 h-4 flex items-center justify-center flex-shrink-0 ${color}`}>
          {label}
        </span>
        <span className="text-xs font-mono text-ink truncate flex-1">{displayPath}</span>
        <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
          {file.additions > 0 && <span className="text-success">+{file.additions}</span>}
          {file.deletions > 0 && <span className="text-error">-{file.deletions}</span>}
        </div>
      </button>

      {/* Hunks */}
      {expanded && (
        <div className="border-t border-border">
          {file.isBinary ? (
            <div className="px-3 py-2 text-xs text-ink-muted italic">Binary file</div>
          ) : file.hunks.length === 0 ? (
            <div className="px-3 py-2 text-xs text-ink-muted italic">No content changes</div>
          ) : (
            file.hunks.map((hunk, i) => <HunkView key={i} hunk={hunk} />)
          )}
        </div>
      )}
    </div>
  );
}

function HunkView({ hunk }: { hunk: DiffHunk }) {
  return (
    <div>
      {/* Hunk header */}
      <div className="px-3 py-0.5 bg-accent/10 text-xs font-mono text-accent select-none">
        {hunk.header}
      </div>

      {/* Lines */}
      <table className="w-full border-collapse">
        <tbody>
          {hunk.lines.map((line, i) => (
            <LineRow key={i} line={line} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineRow({ line }: { line: DiffLine }) {
  if (line.type === 'header') {
    return null;
  }

  let rowBg = '';
  let prefix = ' ';
  if (line.type === 'addition') {
    rowBg = 'bg-success/10';
    prefix = '+';
  } else if (line.type === 'deletion') {
    rowBg = 'bg-error/10';
    prefix = '-';
  }

  return (
    <tr className={rowBg}>
      <td className="w-[1px] whitespace-nowrap px-1.5 text-right text-[11px] font-mono text-ink-muted/60 select-none align-top border-r border-border/30">
        {line.oldLineNumber ?? ''}
      </td>
      <td className="w-[1px] whitespace-nowrap px-1.5 text-right text-[11px] font-mono text-ink-muted/60 select-none align-top border-r border-border/30">
        {line.newLineNumber ?? ''}
      </td>
      <td className="w-[1px] whitespace-nowrap px-1 text-[11px] font-mono select-none align-top text-ink-muted/80">
        {prefix}
      </td>
      <td className="px-1 text-xs font-mono whitespace-pre overflow-x-auto">
        {line.content}
      </td>
    </tr>
  );
}
