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
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#eaeaea',
        cursor: '#eaeaea',
        cursorAccent: '#1a1a2e',
        selectionBackground: '#44475a',
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
    <div className="rounded-lg overflow-hidden border border-charcoal-600">
      {/* Terminal header */}
      <div className="bg-charcoal-950 px-4 py-2 flex items-center space-x-2">
        <div className="flex space-x-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <span className="text-charcoal-300 text-sm ml-2">{title}</span>
      </div>

      {/* Terminal content */}
      <div
        ref={terminalRef}
        style={{ height, backgroundColor: '#1a1a2e' }}
        className="p-2"
      />
    </div>
  );
}
