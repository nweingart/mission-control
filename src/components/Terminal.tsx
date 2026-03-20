import { useRef, useEffect } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  title?: string;
  onInput?: (input: string) => void;
  onOutputReceived?: (content: string) => void;
  sessionId?: string | null;
}

export default function Terminal({ title = 'Claude Code', onInput, onOutputReceived, sessionId }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Use refs to always have current values in callbacks
  const onInputRef = useRef(onInput);
  const onOutputReceivedRef = useRef(onOutputReceived);
  const sessionIdRef = useRef(sessionId);

  // Keep refs up to date
  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  useEffect(() => {
    onOutputReceivedRef.current = onOutputReceived;
  }, [onOutputReceived]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Initialize xterm and set up output listener
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal with settings optimized for Claude Code's TUI
    const isDark = document.documentElement.classList.contains('dark');
    const xterm = new XTerm({
      theme: isDark ? {
        background: '#0c0c0c',
        foreground: '#e4e4e4',
        cursor: '#22c55e',
        cursorAccent: '#0c0c0c',
        selectionBackground: '#282828',
        black: '#0c0c0c',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e4',
        brightBlack: '#585858',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f5f5f5',
      } : {
        background: '#0c0c0c',
        foreground: '#e4e4e4',
        cursor: '#22c55e',
        cursorAccent: '#0c0c0c',
        selectionBackground: '#282828',
        black: '#0c0c0c',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e4',
        brightBlack: '#585858',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f5f5f5',
      },
      fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      convertEol: false,
      allowProposedApi: true,
    });

    // Load addons
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    // Unicode support for Claude's spinner and box drawing
    const unicode11Addon = new Unicode11Addon();
    xterm.loadAddon(unicode11Addon);
    xterm.unicode.activeVersion = '11';

    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Report initial size to PTY
    const reportSize = () => {
      if (sessionIdRef.current && fitAddonRef.current) {
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          window.api.claude.resize(sessionIdRef.current, dims.cols, dims.rows);
        }
      }
    };

    // Report size after fit
    reportSize();

    // Handle input from terminal
    xterm.onData((data) => {
      if (onInputRef.current && sessionIdRef.current) {
        onInputRef.current(data);
      }
    });

    // Subscribe to Claude output - write directly to xterm
    const handleOutput = (data: { sessionId: string; type: string; content: string }) => {
      if (data?.content) {
        xterm.write(data.content);
        // Notify parent component of output for auto-complete detection
        if (onOutputReceivedRef.current) {
          onOutputReceivedRef.current(data.content);
        }
      }
    };

    console.log('[Terminal] Registering output listener');
    window.api.claude.onOutput(handleOutput);

    // Handle resize - update both xterm and PTY
    const handleResize = () => {
      fitAddon.fit();
      reportSize();
    };
    window.addEventListener('resize', handleResize);

    // Observe container for size changes
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      reportSize();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      window.api.claude.removeListeners();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Report terminal size when sessionId changes
  // This ensures the PTY knows the correct dimensions before Claude starts drawing
  useEffect(() => {
    if (sessionId && fitAddonRef.current) {
      // Fit the terminal first
      fitAddonRef.current.fit();
      // Then report the size to the PTY
      const dims = fitAddonRef.current.proposeDimensions();
      if (dims) {
        console.log('[Terminal] Reporting size for new session:', dims.cols, 'x', dims.rows);
        window.api.claude.resize(sessionId, dims.cols, dims.rows);
      }
    }
  }, [sessionId]);

  // Focus terminal when clicking
  const handleClick = () => {
    xtermRef.current?.focus();
  };

  return (
    <div className="overflow-hidden border border-border h-full flex flex-col bg-surface-light">
      {/* Header */}
      <div className="bg-surface px-4 py-2 flex items-center justify-between border-b border-border flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 bg-spectrum-red"></div>
            <div className="w-3 h-3 bg-spectrum-yellow"></div>
            <div className="w-3 h-3 bg-spectrum-green"></div>
          </div>
          <span className="text-ink-muted text-[13px] font-display uppercase tracking-wider">{title}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[13px] text-ink-muted font-display uppercase tracking-wider">claude-code</span>
          {sessionId && <div className="w-2 h-2 bg-success animate-pulse"></div>}
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0 p-2"
        onClick={handleClick}
        style={{ cursor: 'text' }}
      />
    </div>
  );
}
