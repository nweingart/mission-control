import { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import type { ChatMessage } from '../types';
import houstonAvatar from '../assets/houston-avatar.webp';

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  hideInput?: boolean;
}

const MAX_MESSAGE_LENGTH = 10000;

// Typing indicator with pulsing animation and rotating status messages
function TypingIndicator() {
  const messages = [
    'Thinking...',
    'Reviewing your project...',
    'Searching the codebase...',
    'Reading docs...',
    'Drafting a response...',
    'Almost there...',
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev < messages.length - 1 ? prev + 1 : prev));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center space-x-1.5 px-2 py-1">
      <div className="w-2 h-2 bg-spectrum-orange animate-pulse" style={{ animationDuration: '1s' }}></div>
      <div className="w-2 h-2 bg-spectrum-orange animate-pulse" style={{ animationDuration: '1s', animationDelay: '0.2s' }}></div>
      <div className="w-2 h-2 bg-spectrum-orange animate-pulse" style={{ animationDuration: '1s', animationDelay: '0.4s' }}></div>
      <span className="text-sm text-ink-muted ml-2 italic">{messages[index]}</span>
    </div>
  );
}

// Message bubble component with hover timestamp
function MessageBubble({ message }: { message: ChatMessage }) {
  const [showTimestamp, setShowTimestamp] = useState(false);
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      {/* AI Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 mr-2 rounded-full overflow-hidden border-[3px] border-spectrum-blue"><img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" /></div>
      )}

      <div className="flex flex-col max-w-[75%]">
        <div
          className={`px-4 py-3 transition-all duration-200 ${
            isUser
              ? 'bg-surface border border-border text-ink'
              : 'bg-surface-light text-ink'
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
          ) : (
            <Markdown components={{
              p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              em: ({ children }) => <em>{children}</em>,
              ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc">{children}</ul>,
              ol: ({ children }) => <ol className="my-1.5 ml-4 list-decimal">{children}</ol>,
              li: ({ children }) => <li className="my-0.5">{children}</li>,
              code: ({ children }) => <code className="bg-surface/50 px-1 rounded text-[13px]">{children}</code>,
              pre: ({ children }) => <pre className="bg-surface/50 p-2 rounded my-1.5 overflow-x-auto text-[13px]">{children}</pre>,
              h1: ({ children }) => <p className="font-semibold text-base my-2">{children}</p>,
              h2: ({ children }) => <p className="font-semibold text-sm my-2">{children}</p>,
              h3: ({ children }) => <p className="font-semibold text-sm my-1.5">{children}</p>,
            }}>{message.content}</Markdown>
          )}
        </div>

        {/* Timestamp - shows on hover */}
        <div
          className={`text-xs mt-1 transition-opacity duration-200 ${
            isUser ? 'text-right text-ink-muted' : 'text-left text-ink-muted'
          } ${showTimestamp ? 'opacity-100' : 'opacity-0'}`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export default function Chat({ messages, onSendMessage, isLoading = false, placeholder = 'Type a message...', hideInput = false }: ChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed && trimmed.length <= MAX_MESSAGE_LENGTH && !isLoading) {
      onSendMessage(trimmed);
      setInput('');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_MESSAGE_LENGTH) {
      setInput(value);
    }
  };

  const isOverLimit = input.length > MAX_MESSAGE_LENGTH;
  const showCharCount = input.length > MAX_MESSAGE_LENGTH * 0.8;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-ink-muted mt-8 italic">
            Start a conversation...
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="flex items-start animate-fade-in">
            <div className="flex-shrink-0 w-7 h-7 mr-2 rounded-full overflow-hidden border-[3px] border-spectrum-blue"><img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" /></div>
            <div className="bg-surface-light">
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!hideInput && (
        <form onSubmit={handleSubmit} className="border-t border-border-subtle p-4 bg-surface-card/50">
          <div className="flex space-x-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isLoading}
                rows={2}
                maxLength={MAX_MESSAGE_LENGTH}
                className="input-inset w-full resize-none placeholder:text-ink-muted disabled:bg-surface disabled:cursor-not-allowed"
              />
              {showCharCount && (
                <span className={`absolute bottom-2 right-3 text-xs ${isOverLimit ? 'text-error' : 'text-ink-muted'}`}>
                  {input.length.toLocaleString()}/{MAX_MESSAGE_LENGTH.toLocaleString()}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading || isOverLimit}
              className="btn-solid-primary p-3 disabled:bg-surface disabled:text-ink-muted disabled:cursor-not-allowed transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
