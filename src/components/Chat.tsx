import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  hideInput?: boolean;
}

const MAX_MESSAGE_LENGTH = 10000;

// Typing indicator with pulsing animation
function TypingIndicator() {
  return (
    <div className="flex items-center space-x-1.5 px-2 py-1">
      <div className="w-2 h-2 bg-terracotta-400 rounded-full animate-pulse" style={{ animationDuration: '1s' }}></div>
      <div className="w-2 h-2 bg-terracotta-400 rounded-full animate-pulse" style={{ animationDuration: '1s', animationDelay: '0.2s' }}></div>
      <div className="w-2 h-2 bg-terracotta-400 rounded-full animate-pulse" style={{ animationDuration: '1s', animationDelay: '0.4s' }}></div>
      <span className="text-sm text-charcoal-300 ml-2 italic">Thinking...</span>
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
      {/* AI Avatar - Crossed Hammers */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full mr-2 shadow-md overflow-hidden">
          <svg className="w-8 h-8" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="coralGradChat" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#E8927C' }} />
                <stop offset="100%" style={{ stopColor: '#D4806A' }} />
              </linearGradient>
              <linearGradient id="handleGradChat" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: '#8B7355' }} />
                <stop offset="50%" style={{ stopColor: '#9C8465' }} />
                <stop offset="100%" style={{ stopColor: '#8B7355' }} />
              </linearGradient>
            </defs>
            <circle cx="100" cy="100" r="95" fill="#1E1E1E" stroke="#E8927C" strokeWidth="3" />
            <g transform="rotate(-40, 100, 100)">
              <rect x="92" y="55" width="16" height="110" rx="3" fill="url(#handleGradChat)" stroke="#6B5D4D" strokeWidth="1" />
              <rect x="70" y="35" width="60" height="28" rx="4" fill="url(#coralGradChat)" stroke="#C97563" strokeWidth="1.5" />
            </g>
            <g transform="rotate(40, 100, 100)">
              <rect x="92" y="55" width="16" height="110" rx="3" fill="url(#handleGradChat)" stroke="#6B5D4D" strokeWidth="1" />
              <rect x="70" y="35" width="60" height="28" rx="4" fill="url(#coralGradChat)" stroke="#C97563" strokeWidth="1.5" />
            </g>
          </svg>
        </div>
      )}

      <div className="flex flex-col max-w-[75%]">
        <div
          className={`rounded-2xl px-4 py-3 shadow-md transition-all duration-200 ${
            isUser
              ? 'bg-gradient-to-br from-charcoal-700 to-charcoal-800 border border-terracotta-500/20 text-cream-50'
              : 'bg-gradient-to-br from-cream-50 to-cream-100 text-charcoal-900'
          }`}
        >
          <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
        </div>

        {/* Timestamp - shows on hover */}
        <div
          className={`text-xs mt-1 transition-opacity duration-200 ${
            isUser ? 'text-right text-charcoal-500' : 'text-left text-charcoal-500'
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
          <div className="text-center text-charcoal-400 mt-8 italic">
            Start a conversation...
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="flex items-start animate-fade-in">
            <div className="flex-shrink-0 w-8 h-8 rounded-full mr-2 shadow-md overflow-hidden">
              <svg className="w-8 h-8" viewBox="0 0 200 200">
                <defs>
                  <linearGradient id="coralGradLoading" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: '#E8927C' }} />
                    <stop offset="100%" style={{ stopColor: '#D4806A' }} />
                  </linearGradient>
                  <linearGradient id="handleGradLoading" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style={{ stopColor: '#8B7355' }} />
                    <stop offset="50%" style={{ stopColor: '#9C8465' }} />
                    <stop offset="100%" style={{ stopColor: '#8B7355' }} />
                  </linearGradient>
                </defs>
                <circle cx="100" cy="100" r="95" fill="#1E1E1E" stroke="#E8927C" strokeWidth="3" />
                <g transform="rotate(-40, 100, 100)">
                  <rect x="92" y="55" width="16" height="110" rx="3" fill="url(#handleGradLoading)" stroke="#6B5D4D" strokeWidth="1" />
                  <rect x="70" y="35" width="60" height="28" rx="4" fill="url(#coralGradLoading)" stroke="#C97563" strokeWidth="1.5" />
                </g>
                <g transform="rotate(40, 100, 100)">
                  <rect x="92" y="55" width="16" height="110" rx="3" fill="url(#handleGradLoading)" stroke="#6B5D4D" strokeWidth="1" />
                  <rect x="70" y="35" width="60" height="28" rx="4" fill="url(#coralGradLoading)" stroke="#C97563" strokeWidth="1.5" />
                </g>
              </svg>
            </div>
            <div className="bg-gradient-to-br from-cream-50 to-cream-100 rounded-2xl shadow-md">
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!hideInput && (
        <form onSubmit={handleSubmit} className="border-t border-charcoal-700 p-4 bg-charcoal-800/50">
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
                className="w-full resize-none rounded-xl border border-charcoal-600 bg-charcoal-800 text-cream-50 placeholder:text-charcoal-500 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-terracotta-500/50 focus:border-terracotta-500/50 disabled:bg-charcoal-700 disabled:cursor-not-allowed transition-all duration-200"
              />
              {showCharCount && (
                <span className={`absolute bottom-2 right-3 text-xs ${isOverLimit ? 'text-rust-500' : 'text-charcoal-500'}`}>
                  {input.length.toLocaleString()}/{MAX_MESSAGE_LENGTH.toLocaleString()}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading || isOverLimit}
              className="p-3 bg-terracotta-500 text-charcoal-950 rounded-xl hover:bg-terracotta-400 disabled:bg-charcoal-700 disabled:text-charcoal-500 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-terracotta-500/20"
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
