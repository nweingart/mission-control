import { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface InteractiveTerminalProps {
  sessionId: string;
  onData?: (data: string) => void;
  onReady?: () => void; // Called when terminal is ready to receive output
  title?: string;
  height?: string;
}

export default function InteractiveTerminal({
  sessionId,
  onData,
  onReady,
  title = 'Terminal',
  height = '400px',
}: InteractiveTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string>(sessionId);

  // Keep sessionId ref in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Create terminal instance
    const isDark = document.documentElement.classList.contains('dark');
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
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
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle user input - send to PTY
    term.onData((data) => {
      onData?.(data);
    });

    // Handle paste (Cmd+V / Ctrl+V)
    term.attachCustomKeyEventHandler((event) => {
      // Check for paste shortcut
      if ((event.metaKey || event.ctrlKey) && event.key === 'v' && event.type === 'keydown') {
        navigator.clipboard.readText().then((text) => {
          if (text) {
            onData?.(text);
          }
        }).catch((err) => {
          console.error('Failed to read clipboard:', err);
        });
        return false; // Prevent default
      }

      // Check for copy shortcut
      if ((event.metaKey || event.ctrlKey) && event.key === 'c' && event.type === 'keydown') {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch((err) => {
            console.error('Failed to write to clipboard:', err);
          });
          return false; // Prevent default
        }
        // If no selection, let Ctrl+C pass through as interrupt signal
      }

      return true; // Allow other keys
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Set up output listener - use ref to always get current sessionId
    const handleOutput = (data: { sessionId: string; content: string }) => {
      // Use ref to get current sessionId (avoids stale closure)
      if (data.sessionId === sessionIdRef.current && xtermRef.current) {
        xtermRef.current.write(data.content);
      }
    };

    window.api.setup.onOutput(handleOutput);

    // Signal that terminal is ready
    onReady?.();

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onData, onReady]);

  // Refit when height changes
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 0);
    }
  }, [height]);

  return (
    <div className="overflow-hidden border border-border">
      {/* Terminal header */}
      <div className="bg-surface-light px-4 py-2 flex items-center space-x-2">
        <div className="flex space-x-1.5">
          <div className="w-3 h-3 bg-spectrum-red"></div>
          <div className="w-3 h-3 bg-spectrum-yellow"></div>
          <div className="w-3 h-3 bg-spectrum-green"></div>
        </div>
        <span className="text-ink-muted text-[13px] font-display uppercase tracking-wider ml-2">{title}</span>
      </div>

      {/* Terminal content */}
      <div
        ref={terminalRef}
        style={{ height }}
        className="p-2 bg-surface-light"
      />
    </div>
  );
}
