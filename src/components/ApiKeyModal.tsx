import React, { useState } from 'react';
import { Key, Eye, EyeOff, ExternalLink, X } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedApiKey: string;
  onSave: (apiKey: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  savedApiKey,
  onSave,
}) => {
  const [keyInput, setKeyInput] = useState(savedApiKey);
  const [showKey, setShowKey] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(keyInput.trim());
    onClose();
  };

  const handleClear = () => {
    setKeyInput('');
    onSave('');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        <div className="modal-header">
          <div className="title-area">
            <Key size={20} className="header-icon" />
            <h3>Gemini APIキー設定</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="description">
            このアプリの分析・チャット機能は Google Gemini API を使用しています。
            入力されたAPIキーはサーバーには送信されず、お使いのブラウザ（LocalStorage）にのみ安全に保存されます。
          </p>
          
          <div className="api-key-source-info">
            <p>APIキーをお持ちでない場合は、Google AI Studio から無料で取得できます：</p>
            <a 
              href="https://aistudio.google.com/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-link"
            >
              Google AI Studio でキーを取得する <ExternalLink size={14} style={{ marginLeft: '4px' }} />
            </a>
          </div>

          <div className="input-group-container">
            <label htmlFor="apiKeyInput">APIキー</label>
            <div className="input-with-icon">
              <input
                id="apiKeyInput"
                type={showKey ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button 
                type="button" 
                className="icon-btn-toggle" 
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {!keyInput && (
              <span className="warning-text">
                ⚠️ キーが設定されていないため、現在はサンプルデータによる「デモモード」で動作しています。
              </span>
            )}
          </div>
        </div>

        <div className="modal-footer">
          {savedApiKey && (
            <button className="btn btn-secondary delete-btn" onClick={handleClear}>
              キーを削除
            </button>
          )}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              キャンセル
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              保存して適用
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
