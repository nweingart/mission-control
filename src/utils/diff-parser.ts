export interface DiffLine {
  type: 'context' | 'addition' | 'deletion' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  isBinary: boolean;
}

export function parseUnifiedDiff(raw: string): DiffFile[] {
  if (!raw || !raw.trim()) return [];

  const files: DiffFile[] = [];

  // Split on "diff --git" boundaries
  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split('\n');
    if (lines.length === 0) continue;

    // First line is "a/path b/path"
    const headerLine = lines[0];
    const pathMatch = headerLine.match(/^a\/(.+?) b\/(.+?)$/);
    if (!pathMatch) continue;

    const file: DiffFile = {
      oldPath: pathMatch[1],
      newPath: pathMatch[2],
      status: 'modified',
      additions: 0,
      deletions: 0,
      hunks: [],
      isBinary: false,
    };

    let i = 1;

    // Parse header lines (index, mode, similarity, rename, ---, +++)
    while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
      const line = lines[i];

      if (line.startsWith('Binary files')) {
        file.isBinary = true;
      }
      if (line.startsWith('new file')) {
        file.status = 'added';
      }
      if (line.startsWith('deleted file')) {
        file.status = 'deleted';
      }
      if (line.startsWith('rename from') || line.startsWith('similarity index')) {
        file.status = 'renamed';
      }
      if (line.startsWith('--- /dev/null')) {
        file.status = 'added';
      }
      if (line.startsWith('+++ /dev/null')) {
        file.status = 'deleted';
      }

      i++;
    }

    // Parse hunks
    while (i < lines.length) {
      const line = lines[i];
      if (!line.startsWith('@@')) break;

      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (!hunkMatch) {
        i++;
        continue;
      }

      const hunk: DiffHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newCount: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1,
        lines: [],
      };

      // Add the header context (function name etc.) if present
      if (hunkMatch[5]?.trim()) {
        hunk.lines.push({ type: 'header', content: hunkMatch[5].trim() });
      }

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      i++;
      while (i < lines.length) {
        const diffLine = lines[i];

        // Stop at next hunk or next file
        if (diffLine.startsWith('@@') || diffLine.startsWith('diff --git')) break;

        // Skip "\ No newline at end of file"
        if (diffLine.startsWith('\\ No newline')) {
          i++;
          continue;
        }

        if (diffLine.startsWith('+')) {
          hunk.lines.push({
            type: 'addition',
            content: diffLine.slice(1),
            newLineNumber: newLine,
          });
          newLine++;
          file.additions++;
        } else if (diffLine.startsWith('-')) {
          hunk.lines.push({
            type: 'deletion',
            content: diffLine.slice(1),
            oldLineNumber: oldLine,
          });
          oldLine++;
          file.deletions++;
        } else {
          // Context line (starts with space) or empty line
          const content = diffLine.length > 0 ? diffLine.slice(1) : '';
          hunk.lines.push({
            type: 'context',
            content,
            oldLineNumber: oldLine,
            newLineNumber: newLine,
          });
          oldLine++;
          newLine++;
        }

        i++;
      }

      file.hunks.push(hunk);
    }

    files.push(file);
  }

  return files;
}
