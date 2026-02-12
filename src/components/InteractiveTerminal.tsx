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
        background: '#1C1A18',
        foreground: '#E8E4DC',
        cursor: '#58B26C',
        cursorAccent: '#1C1A18',
        selectionBackground: '#3A3630',
        black: '#1C1A18',
        red: '#E45848',
        green: '#58B26C',
        yellow: '#DA9E3E',
        blue: '#529ED6',
        magenta: '#6CB2E4',
        cyan: '#529ED6',
        white: '#E8E4DC',
        brightBlack: '#766E64',
        brightRed: '#F07868',
        brightGreen: '#72C886',
        brightYellow: '#E8B258',
        brightBlue: '#72B8E8',
        brightMagenta: '#88C8F0',
        brightCyan: '#72B8E8',
        brightWhite: '#F4F0E8',
      } : {
        background: '#F5F0E4',
        foreground: '#26211C',
        cursor: '#449256',
        cursorAccent: '#F5F0E4',
        selectionBackground: '#D6DCEE',
        black: '#26211C',
        red: '#CC4434',
        green: '#449256',
        yellow: '#C0822A',
        blue: '#3E8AC2',
        magenta: '#2A6C9E',
        cyan: '#3E8AC2',
        white: '#FEFBF4',
        brightBlack: '#8E8678',
        brightRed: '#D4685A',
        brightGreen: '#5AAE6C',
        brightYellow: '#D09838',
        brightBlue: '#5AA0CE',
        brightMagenta: '#4A8AB8',
        brightCyan: '#5AA0CE',
        brightWhite: '#FEFBF4',
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
