import React, { useState, useRef } from 'react';
import { 
  FileText, Plus, Settings, BookOpen, AlertCircle, FileUp, Trash2
} from 'lucide-react';
import type { DocumentItem } from '../mockData';

interface SidebarProps {
  documents: DocumentItem[];
  activeId: string | null;
  onSelectDocument: (id: string) => void;
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  onAddText: (title: string, text: string) => void;
  onOpenSettings: () => void;
  hasApiKey: boolean;
  isProcessing: boolean;
  onDeleteDocument: (id: string, e: React.MouseEvent) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  activeId,
  onSelectDocument,
  onUploadFiles,
  onAddText,
  onOpenSettings,
  hasApiKey,
  isProcessing,
  onDeleteDocument,
}) => {
  const [isPaperDragOver, setIsPaperDragOver] = useState(false);
  const [isCsvDragOver, setIsCsvDragOver] = useState(false);
  const [showDirectInput, setShowDirectInput] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  
  const paperInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handlePaperDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsPaperDragOver(true);
  };

  const handlePaperDragLeave = () => {
    setIsPaperDragOver(false);
  };

  const handlePaperDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsPaperDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const allowedFiles = Array.from(e.dataTransfer.files).filter(file => 
        file.name.toLowerCase().endsWith('.pdf') || 
        file.name.toLowerCase().endsWith('.txt') || 
        file.name.toLowerCase().endsWith('.md')
      );
      if (allowedFiles.length > 0) {
        await onUploadFiles(allowedFiles);
      } else {
        alert("論文・資料アップロードは PDF, TXT, Markdown のみ対応しています。");
      }
    }
  };

  const handleCsvDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCsvDragOver(true);
  };

  const handleCsvDragLeave = () => {
    setIsCsvDragOver(false);
  };

  const handleCsvDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsCsvDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const allowedFiles = Array.from(e.dataTransfer.files).filter(file => 
        file.name.toLowerCase().endsWith('.csv')
      );
      if (allowedFiles.length > 0) {
        await onUploadFiles(allowedFiles);
      } else {
        alert("測定データアップロードは CSV ファイルのみ対応しています。");
      }
    }
  };

  const handlePaperFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFiles(e.target.files);
    }
  };

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFiles(e.target.files);
    }
  };

  const handleAddTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    
    onAddText(newTitle.trim(), newContent.trim());
    setNewTitle('');
    setNewContent('');
    setShowDirectInput(false);
  };

  const triggerPaperSelect = () => {
    paperInputRef.current?.click();
  };

  const triggerCsvSelect = () => {
    csvInputRef.current?.click();
  };

  return (
    <aside className="sidebar glass-panel">
      {/* Header / Logo */}
      <div className="sidebar-header">
        <div className="logo-container">
          <svg className="logo-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="26" height="26">
            <defs>
              <linearGradient id="ai-gradient-sidebar" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <circle cx="24" cy="24" r="16" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5"/>
            <path d="M15.5 10 A16.5 16.5 0 0 0 15.5 38" fill="none" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="2,2"/>
            <path d="M32.5 10 A16.5 16.5 0 0 1 32.5 38" fill="none" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="2,2"/>
            <path d="M8 28 C 16 10, 32 10, 40 28" fill="none" stroke="url(#ai-gradient-sidebar)" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="8" cy="28" r="2.5" fill="#4f46e5" stroke="#ffffff" strokeWidth="1"/>
            <circle cx="24" cy="14" r="2.5" fill="#818cf8" stroke="#ffffff" strokeWidth="1"/>
            <circle cx="40" cy="28" r="2.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1"/>
            <path d="M24 6 L24.7 7.3 L26 8 L24.7 8.7 L24 10 L23.3 8.7 L22 8 L23.3 7.3 Z" fill="#fbbf24"/>
          </svg>
          <h2>AI 分析アシスタント</h2>
        </div>
        <p className="subtitle">論文・資料の解析 & AIコーチ</p>
      </div>

      {/* API Status Alert */}
      <div 
        className={`api-status-banner ${hasApiKey ? 'api-configured' : 'api-demo'}`}
        onClick={onOpenSettings}
        title="クリックして設定を開く"
      >
        <AlertCircle size={14} />
        <span>{hasApiKey ? 'Gemini API 有効' : 'デモモード動作中 (キー未設定)'}</span>
      </div>

      {/* Upload Areas */}
      <div className="upload-zone-wrapper">
        {/* 1. Paper / Literature Upload Zone */}
        <div 
          className={`upload-zone compact ${isPaperDragOver ? 'drag-active' : ''} ${isProcessing ? 'processing' : ''}`}
          onDragOver={handlePaperDragOver}
          onDragLeave={handlePaperDragLeave}
          onDrop={handlePaperDrop}
          onClick={isProcessing ? undefined : triggerPaperSelect}
        >
          <input 
            type="file" 
            ref={paperInputRef} 
            style={{ display: 'none' }} 
            accept=".pdf,.txt,.md"
            multiple
            onChange={handlePaperFileChange}
            disabled={isProcessing}
          />
          {isProcessing ? (
            <div className="upload-loading-state">
              <div className="spinner"></div>
              <p>資料を読み込み・解析中...</p>
            </div>
          ) : (
            <>
              <FileText size={18} className="upload-icon" />
              <p className="main-instruction">📖 論文・指導資料の追加</p>
              <p className="sub-instruction">クリック / ドラッグ＆ドロップ</p>
              <span className="file-formats">PDF, TXT, Markdown</span>
            </>
          )}
        </div>

        {/* 2. CSV Rapsodo Data Upload Zone */}
        <div 
          className={`upload-zone compact ${isCsvDragOver ? 'drag-active' : ''} ${isProcessing ? 'processing' : ''}`}
          onDragOver={handleCsvDragOver}
          onDragLeave={handleCsvDragLeave}
          onDrop={handleCsvDrop}
          onClick={isProcessing ? undefined : triggerCsvSelect}
        >
          <input 
            type="file" 
            ref={csvInputRef} 
            style={{ display: 'none' }} 
            accept=".csv"
            multiple
            onChange={handleCsvFileChange}
            disabled={isProcessing}
          />
          {isProcessing ? (
            <div className="upload-loading-state">
              <div className="spinner"></div>
              <p>測定データを読み込み中...</p>
            </div>
          ) : (
            <>
              <FileUp size={18} className="upload-icon" />
              <p className="main-instruction">📊 Rapsodo測定データの追加</p>
              <p className="sub-instruction">クリック / ドラッグ＆ドロップ</p>
              <span className="file-formats">CSVファイルのみ</span>
            </>
          )}
        </div>
      </div>

      {/* Direct Input Toggle Button */}
      <button 
        className="btn btn-secondary direct-input-toggle-btn"
        onClick={() => setShowDirectInput(!showDirectInput)}
      >
        <Plus size={16} />
        {showDirectInput ? 'テキスト入力を閉じる' : 'テキストを直接入力'}
      </button>

      {/* Direct Text Input Form */}
      {showDirectInput && (
        <form onSubmit={handleAddTextSubmit} className="direct-input-form glass-panel">
          <h4>新規テキスト入力</h4>
          <input
            type="text"
            placeholder="資料のタイトル"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
          <textarea
            placeholder="分析したい文章や論文のテキストをここに貼り付けてください..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            required
            rows={5}
          />
          <div className="form-actions">
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={() => setShowDirectInput(false)}
            >
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              追加して分析
            </button>
          </div>
        </form>
      )}

      {/* Document List */}
      <div className="document-list-container">
        <h3>
          <BookOpen size={16} /> 読み込んだ資料 ({documents.length})
        </h3>
        {documents.length === 0 ? (
          <p className="empty-message">資料がありません。上のエリアからアップロードするか、テキストを入力してください。</p>
        ) : (
          <ul className="document-list">
            {documents.map((doc) => (
              <li 
                key={doc.id}
                className={`document-item ${activeId === doc.id ? 'active' : ''}`}
                onClick={() => onSelectDocument(doc.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <FileText size={16} className="doc-icon" style={{ flexShrink: 0 }} />
                  <div className="doc-info" style={{ minWidth: 0 }}>
                    <span className="doc-title" title={doc.title} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.title}
                    </span>
                    <span className="doc-meta">{doc.uploadedAt} • {doc.fileType.toUpperCase()}</span>
                  </div>
                </div>
                <button 
                  className="delete-doc-btn"
                  onClick={(e) => onDeleteDocument(doc.id, e)}
                  title="この資料を削除"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #8b9bb4)',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: '8px',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                    opacity: 0.6
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ef4444';
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted, #8b9bb4)';
                    e.currentTarget.style.opacity = '0.6';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sidebar Footer Settings */}
      <div className="sidebar-footer">
        <button className="btn btn-secondary settings-btn" onClick={onOpenSettings}>
          <Settings size={16} />
          設定 (APIキー)
        </button>
      </div>
    </aside>
  );
};
