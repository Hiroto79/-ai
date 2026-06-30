import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, RefreshCw, Sparkles, User } from 'lucide-react';
import type { DocumentItem, CoachPersona } from '../mockData';
import type { ChatMessage } from '../services/gemini';

interface CoachChatProps {
  document: DocumentItem | null;
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  activePersona: CoachPersona;
  isResponding: boolean;
  onClearChat: () => void;
}

export const CoachChat: React.FC<CoachChatProps> = ({
  document,
  messages,
  onSendMessage,
  activePersona,
  isResponding,
  onClearChat,
}) => {
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isResponding]);

  if (!document) {
    return (
      <div className="chat-empty-container glass-panel">
        <MessageSquare size={48} className="empty-icon" />
        <h3>AIコーチに相談する</h3>
        <p>資料を選択すると、AIコーチが内容を踏まえて個別のアドバイスを提供します。</p>
      </div>
    );
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isResponding) return;

    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handlePresetQuestion = (question: string) => {
    if (isResponding) return;
    onSendMessage(question);
  };

  const presetQuestions = [
    "測定データとアップロードした論文を比較し、科学的アドバイスをください。",
    "論文の理論を現在の測定数値を持つ選手にどう適用できますか？",
    "変化球の回転効率とジャイロ成分の活かし方について教えてください。",
    "このデータが示す強みと課題を、論文の知見に基づいて提案してください。"
  ];

  return (
    <div className="chat-panel glass-panel">
      {/* Persona Selection Header */}
      <div className="chat-header">
        <div className="persona-info-header">
          <span className="persona-avatar-large">{activePersona.avatar}</span>
          <div className="persona-text-header">
            <h4>{activePersona.name}</h4>
            <span className="persona-role-badge">{activePersona.role}</span>
          </div>
        </div>

        <div className="chat-header-actions">
          <button 
            className="btn btn-secondary btn-icon btn-sm" 
            onClick={onClearChat} 
            title="会話履歴をクリア"
          >
            <RefreshCw size={14} />
            クリア
          </button>
        </div>
      </div>

      {/* Persona Description */}
      <div className="persona-desc-bar">
        <p>{activePersona.description}</p>
      </div>

      {/* Chat Messages Log */}
      <div className="chat-messages-container">
        {messages.length === 0 ? (
          <div className="chat-initial-state">
            <span className="avatar-huge">{activePersona.avatar}</span>
            <h4>{activePersona.name} に質問してみましょう</h4>
            <p className="initial-message">「{activePersona.initialMessage}」</p>
            
            <div className="preset-questions-grid">
              <p className="grid-label">クイック質問の例：</p>
              {presetQuestions.map((q, idx) => (
                <button 
                  key={idx} 
                  className="preset-q-btn"
                  onClick={() => handlePresetQuestion(q)}
                  disabled={isResponding}
                >
                  <Sparkles size={12} />
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages-list">
            {/* System initial message display */}
            <div className="message-wrapper assistant">
              <span className="message-avatar">{activePersona.avatar}</span>
              <div className="message-content-bubble">
                <p>{activePersona.initialMessage}</p>
              </div>
            </div>

            {messages.map((msg, index) => (
              <div key={index} className={`message-wrapper ${msg.role === 'user' ? 'user' : 'assistant'}`}>
                <span className="message-avatar">
                  {msg.role === 'user' ? <User size={16} /> : activePersona.avatar}
                </span>
                <div className="message-content-bubble">
                  <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                </div>
              </div>
            ))}
            
            {isResponding && (
              <div className="message-wrapper assistant responding">
                <span className="message-avatar">{activePersona.avatar}</span>
                <div className="message-content-bubble loading-bubble">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Chat Input Area */}
      <form onSubmit={handleSend} className="chat-input-form">
        <input
          type="text"
          placeholder={`${activePersona.name} に質問や相談を入力...`}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isResponding}
        />
        <button 
          type="submit" 
          className="btn btn-primary send-btn"
          disabled={!inputText.trim() || isResponding}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
