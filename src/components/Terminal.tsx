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
    const xterm = new XTerm({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: '#264f78',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#ffffff',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
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
    <div className="rounded-lg overflow-hidden border border-charcoal-600 h-full flex flex-col bg-charcoal-950">
      {/* Header */}
      <div className="bg-charcoal-900 px-4 py-2 flex items-center justify-between border-b border-charcoal-600 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
          </div>
          <span className="text-charcoal-300 text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-charcoal-400">claude-code</span>
          {sessionId && <div className="w-2 h-2 rounded-full bg-sage-500 animate-pulse"></div>}
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
