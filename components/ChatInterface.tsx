import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, ShoppingBag, ExternalLink } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full bg-white border-t border-gray-200 shadow-inner">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10">
            <ShoppingBag className="mx-auto h-10 w-10 mb-2 opacity-50" />
            <p>سوالی درباره دکوراسیون دارید؟<br/>مثلاً: «فرش آبی به این اتاق میاد؟»</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-br-none'
                  : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.text}</div>
              
              {/* Grounding/Shopping Links */}
              {msg.groundingMetadata?.web && msg.groundingMetadata.web.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold mb-2 text-gray-500">لینک‌های پیشنهادی:</p>
                  <div className="flex flex-col gap-2">
                    {msg.groundingMetadata.web.map((link, idx) => (
                      <a 
                        key={idx}
                        href={link.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-xs text-blue-600 hover:text-blue-800 bg-blue-50 p-2 rounded transition-colors"
                      >
                        <ExternalLink size={12} className="mr-2 flex-shrink-0" />
                        <span className="truncate ml-1">{link.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl px-4 py-3 rounded-bl-none border border-gray-200 flex items-center">
              <Loader2 className="animate-spin h-4 w-4 text-gray-400 mr-2" />
              <span className="text-xs text-gray-500">در حال نوشتن...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-3 bg-white border-t flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="پیامی بنویسید..."
          className="flex-1 bg-gray-100 text-right rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="p-2 bg-primary text-white rounded-full disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default ChatInterface;