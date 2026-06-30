import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { AnalysisSheet } from './components/AnalysisSheet';
import { CoachChat } from './components/CoachChat';
import { ApiKeyModal } from './components/ApiKeyModal';
import { 
  MOCK_DOCUMENTS, 
  MOCK_ANALYSIS_SHEETS, 
  MOCK_PERSONAS,
  MOCK_PITCHING_PLAYERS,
  MOCK_HITTING_PLAYERS
} from './mockData';
import type { 
  DocumentItem, 
  AnalysisSheetData, 
  CoachPersona, 
} from './mockData';
import { extractTextFromPdf } from './services/pdfParser';
import { 
  convertCsvToMarkdown, 
  parseHittingPlayers, 
  parsePitchingPlayers,
  generatePitchingSummaryMarkdown,
  generateHittingSummaryMarkdown
} from './services/csvParser';
import type { HittingPlayer, PitchingPlayer } from './services/csvParser';
import { analyzeDocument, chatWithCoach } from './services/gemini';
import type { ChatMessage } from './services/gemini';
import {
  isSupabaseConfigured,
  seedDatabaseIfEmpty,
  fetchDocuments,
  fetchAnalysisSheets,
  fetchPlayers,
  saveDocument,
  saveAnalysisSheet,
  savePlayersList,
  deleteDocument
} from './services/supabase';
import './App.css';

const LOCAL_STORAGE_KEY = 'gemini_analysis_coach_api_key';
const LOGIN_STORAGE_KEY = 'app_logged_in_status';

// Helper to extract team name from file name (A-Team_hitting.csv -> A-Team)
function getTeamNameFromFileName(fileName: string): string {
  if (!fileName) return '共通チーム';
  const cleanName = fileName.replace(/\.[^/.]+$/, ""); // strip extension
  
  // 1. Underscore delimited
  const parts = cleanName.split('_');
  if (parts.length > 1 && parts[0].trim() !== '') {
    const p0 = parts[0].trim();
    if (isNaN(Number(p0)) && p0.length > 2) {
      return p0;
    }
  }
  
  // 2. Space delimited (e.g. "昭和学院 HITTING 2026.6")
  const spaceParts = cleanName.split(' ');
  if (spaceParts.length > 1 && spaceParts[0].trim() !== '') {
    const firstWord = spaceParts[0].toLowerCase();
    const p0 = spaceParts[0].trim();
    if (firstWord !== 'hitting' && firstWord !== 'pitching' && firstWord !== 'group' && firstWord !== 'batting' && isNaN(Number(p0)) && p0.length > 2) {
      return p0;
    }
  }

  // 3. Keyword matching fallbacks
  if (fileName.includes('昭和学院')) return '昭和学院';
  if (fileName.includes('昌平')) return '昌平';
  if (fileName.includes('Aチーム')) return 'Aチーム';
  if (fileName.includes('Bチーム')) return 'Bチーム';
  
  return '共通チーム';
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem(LOGIN_STORAGE_KEY) === 'true';
  });
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword === '7911') {
      localStorage.setItem(LOGIN_STORAGE_KEY, 'true');
      setIsLoggedIn(true);
      setLoginError(false);
    } else {
      setLoginError(true);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  // State for API Key
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_KEY) || import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // App States
  const [documents, setDocuments] = useState<DocumentItem[]>(MOCK_DOCUMENTS);
  const [activeDocId, setActiveDocId] = useState<string | null>('doc-pitching');
  const [analysisSheets, setAnalysisSheets] = useState<Record<string, AnalysisSheetData>>(MOCK_ANALYSIS_SHEETS);
  
  // Custom baseball player data states (mapped by docId)
  const [hittingPlayers, setHittingPlayers] = useState<Record<string, HittingPlayer[]>>({});
  const [pitchingPlayers, setPitchingPlayers] = useState<Record<string, PitchingPlayer[]>>({});
  const [selectedPlayerNames, setSelectedPlayerNames] = useState<Record<string, string>>({});

  // Compare Document ID state (mapped by activeDocId)
  const [compareDocIds, setCompareDocIds] = useState<Record<string, string>>({});

  // Navigation View State
  const [activeView, setActiveView] = useState<'individual' | 'team' | 'coach' | 'files'>('individual');

  // Chat Histories key format: `${docId}-${personaId}`
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [activePersona, setActivePersona] = useState<CoachPersona>(MOCK_PERSONAS[0]);

  // Loading States
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isResponding, setIsResponding] = useState(false);

  // Load data from Supabase if configured, otherwise fall back to local mock data
  useEffect(() => {
    async function initData() {
      if (isSupabaseConfigured) {
        try {
          // 1. Seed database with mock data if completely empty
          await seedDatabaseIfEmpty().catch(err => {
            console.warn('Failed to seed database:', err);
          });

          // 2. Fetch documents
          let docs: DocumentItem[] = [];
          try {
            docs = await fetchDocuments();
            setDocuments(docs);
            if (docs.length > 0) {
              setActiveDocId(docs[0].id);
            } else {
              setActiveDocId(null);
            }
          } catch (docErr) {
            console.error('Failed to fetch documents from Supabase:', docErr);
            fallbackToLocalMock();
            return;
          }

          // 3. Fetch analysis sheets
          let sheets: Record<string, AnalysisSheetData> = {};
          try {
            sheets = await fetchAnalysisSheets();
            setAnalysisSheets(sheets);
          } catch (sheetErr) {
            console.error('Failed to fetch analysis sheets from Supabase:', sheetErr);
            setAnalysisSheets({});
          }

          // 4. Fetch players
          let playersData = { hitting: {} as Record<string, HittingPlayer[]>, pitching: {} as Record<string, PitchingPlayer[]> };
          try {
            playersData = await fetchPlayers();
            
            // Normalize names of hitting and pitching player names with team prefixes and clean grade suffixes
            let defaultTeam = '昌平';
            let detectedPrefix = '';
            // Scan hitting players first to see if any have a team prefix (like "昌平" or "昭和学院")
            const hittingDocIds = Object.keys(playersData.hitting);
            for (const hid of hittingDocIds) {
              const hplayers = playersData.hitting[hid] || [];
              for (const hp of hplayers) {
                if (hp.name) {
                  if (hp.name.startsWith('昌平')) {
                    detectedPrefix = '昌平';
                    break;
                  }
                  const spaceIdx = hp.name.indexOf(' ');
                  if (spaceIdx > 0) {
                    const firstPart = hp.name.substring(0, spaceIdx);
                    if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(firstPart)) {
                      detectedPrefix = firstPart;
                    }
                  }
                }
              }
              if (detectedPrefix) break;
            }
            if (detectedPrefix) {
              defaultTeam = detectedPrefix;
            } else {
              for (const d of docs) {
                const t = getTeamNameFromFileName(d.fileName);
                if (t && t !== '共通チーム' && isNaN(Number(t))) {
                  defaultTeam = t;
                  break;
                }
              }
            }

            // Normalize Hitting players
            const normalizedHitting: Record<string, HittingPlayer[]> = {};
            Object.keys(playersData.hitting).forEach(docId => {
              const doc = docs.find(d => d.id === docId);
              if (doc) {
                let teamName = getTeamNameFromFileName(doc.fileName);
                if (!teamName || teamName === '共通チーム') {
                  teamName = defaultTeam;
                }
                normalizedHitting[docId] = playersData.hitting[docId].map(p => {
                  let finalName = p.name;
                  // Clean name of trailing grade indicators
                  finalName = finalName.replace(/[\s_-]?([123１２３])年生?$/, '').replace(/[\s_-]([123１２３])$/, '').replace(/([123１２３])$/, '').trim();
                  
                  const cleanTeam = teamName.trim();
                  if (!finalName.includes(cleanTeam)) {
                    finalName = `${cleanTeam} ${finalName}`;
                  }
                  return { ...p, name: finalName };
                });
              } else {
                normalizedHitting[docId] = playersData.hitting[docId];
              }
            });
            setHittingPlayers(normalizedHitting);
            playersData.hitting = normalizedHitting;

            // Normalize Pitching players
            const normalizedPitching: Record<string, PitchingPlayer[]> = {};
            Object.keys(playersData.pitching).forEach(docId => {
              const doc = docs.find(d => d.id === docId);
              if (doc) {
                let teamName = getTeamNameFromFileName(doc.fileName);
                if (!teamName || teamName === '共通チーム') {
                  teamName = defaultTeam;
                }
                normalizedPitching[docId] = playersData.pitching[docId].map(p => {
                  let finalName = p.name;
                  // If name isカタカナ from old parser translation, translate back or map if possible
                  if (finalName === 'イマイ') finalName = 'imai kanta';
                  if (finalName === 'ワケ') finalName = 'wake kouki';
                  if (finalName === 'シミズ') finalName = 'shimizu kousei';
                  if (finalName === 'ホッチ') finalName = 'hocchi kanta';
                  if (finalName === 'イマイ カンタ') finalName = 'imai kanta';

                  // Clean name of trailing grade indicators
                  finalName = finalName.replace(/[\s_-]?([123１２３])年生?$/, '').replace(/[\s_-]([123１２３])$/, '').replace(/([123１２３])$/, '').trim();

                  const cleanTeam = teamName.trim();
                  if (!finalName.includes(cleanTeam)) {
                    finalName = `${cleanTeam} ${finalName}`;
                  }
                  return { ...p, name: finalName };
                });
              } else {
                normalizedPitching[docId] = playersData.pitching[docId];
              }
            });
            setPitchingPlayers(normalizedPitching);
            // Replace playersData.pitching with normalized data for default selection logic below
            playersData.pitching = normalizedPitching;
          } catch (playerErr) {
            console.error('Failed to fetch players from Supabase:', playerErr);
            setHittingPlayers({});
            setPitchingPlayers({});
          }

          // 5. Select default player names for each doc
          const defaultSelected: Record<string, string> = {};
          for (const doc of docs) {
            const isHittingDoc = doc.id.includes('hitting') || 
                                 doc.title.includes('打撃') || 
                                 doc.id.includes('batting') || 
                                 doc.fileName.toLowerCase().includes('hitting');
            if (isHittingDoc) {
              const plist = playersData.hitting[doc.id] || [];
              if (plist.length > 0) {
                defaultSelected[doc.id] = plist[0].name;
              }
            } else {
              const plist = playersData.pitching[doc.id] || [];
              if (plist.length > 0) {
                defaultSelected[doc.id] = plist[0].name;
              }
            }
          }
          setSelectedPlayerNames(defaultSelected);

        } catch (error) {
          console.error('Failed to initialize data from Supabase, falling back to local mocks:', error);
          fallbackToLocalMock();
        }
      } else {
        fallbackToLocalMock();
      }
    }

    function fallbackToLocalMock() {
      const normalizedPitching = MOCK_PITCHING_PLAYERS.map(p => {
        let name = p.name;
        if (name === 'イマイ') name = 'imai kanta';
        if (name === 'ワケ') name = 'wake kouki';
        if (name === 'シミズ') name = 'shimizu kousei';
        if (name === 'ホッチ') name = 'hocchi kanta';
        if (name === 'イマイ カンタ') name = 'imai kanta';
        
        return {
          ...p,
          name: `昭和学院 ${name}`
        };
      });

      setPitchingPlayers({ 'doc-pitching': normalizedPitching });
      setHittingPlayers({ 'doc-batting': MOCK_HITTING_PLAYERS });
      setSelectedPlayerNames({
        'doc-pitching': '昭和学院 imai kanta',
        'doc-batting': '昭和学院 matsumoto haruomi'
      });
      setDocuments(MOCK_DOCUMENTS);
      setAnalysisSheets(MOCK_ANALYSIS_SHEETS);
      setActiveDocId('doc-pitching');
    }

    initData();
  }, []);

  // Save API Key to localStorage
  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    if (key) {
      localStorage.setItem(LOCAL_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  };

  // Get active document details
  const activeDocument = documents.find(doc => doc.id === activeDocId) || null;
  const activeSheetData = activeDocId ? (analysisSheets[activeDocId] || null) : null;
  
  // Get active chat log
  const chatKey = activeDocId ? `${activeDocId}-${activePersona.id}` : '';
  const currentMessages = chatKey ? (chatHistories[chatKey] || []) : [];

  // Trigger analysis for a document
  const runAnalysis = async (docId: string, content: string) => {
    setIsAnalyzing(true);
    try {
      let finalContent = content;

      // Auto-cleanup for old, heavy raw CSV markdown tables inside existing documents
      const doc = documents.find(d => d.id === docId);
      const isCsvDoc = doc?.fileName.toLowerCase().endsWith('.csv') || 
                       docId === 'doc-pitching' || 
                       docId === 'doc-batting';

      if (isCsvDoc && doc) {
        const isHittingDoc = docId === 'doc-batting' || 
                             doc.title.includes('打撃') || 
                             doc.fileName.toLowerCase().includes('hitting');
                             
        let summaryContent = '';
        if (isHittingDoc) {
          const playersData = hittingPlayers[docId];
          if (playersData && playersData.length > 0) {
            summaryContent = generateHittingSummaryMarkdown(playersData);
          }
        } else {
          const playersData = pitchingPlayers[docId];
          if (playersData && playersData.length > 0) {
            summaryContent = generatePitchingSummaryMarkdown(playersData);
          }
        }

        // If the summary is different (meaning the doc still has old heavy content),
        // we replace it in state and Supabase
        if (summaryContent && doc.content !== summaryContent) {
          doc.content = summaryContent;
          finalContent = summaryContent;

          // Update react state
          setDocuments(prev => prev.map(d => d.id === docId ? { ...d, content: summaryContent } : d));

          // Sync back to Supabase
          if (isSupabaseConfigured) {
            saveDocument(doc).catch(err => console.error("Error updating old document content with summary:", err));
          }
        }
      }

      if (apiKey) {
        // Run real analysis using Gemini API
        const analyzed = await analyzeDocument(finalContent, apiKey);
        setAnalysisSheets(prev => ({
          ...prev,
          [docId]: analyzed
        }));
        if (isSupabaseConfigured) {
          await saveAnalysisSheet(docId, analyzed).catch(err => console.error("Error saving analysis sheet:", err));
        }
      } else {
        // Demo Mode: Mock delay and mock response
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const mockResponse: AnalysisSheetData = {
          summary: `【デモモード解析結果】「${documents.find(d => d.id === docId)?.title}」のデータ分析です。APIキーを登録すると、リアルタイムの高度なAI解析が実行されます。`,
          keyMetrics: "平均数値: 球速135.0km/h、回転数2100rpm、打撃の場合は打球速度130km/h程度と推定（デモ用ダミーデータ）。",
          mechanics: "リリース時の指のかかり、またはバットの進入角度に関する推測分析。ボールの回転効率をさらに高める動作修正の余地があります。",
          strengths: "特定の球種におけるホップ成分やスライダーの変化方向、あるいはジャストミート時の打球速度に十分なポテンシャルが見られます。",
          improvements: "リリース時の手首の角度の安定性、または打撃時の衝突効率（スイング軌道とボール軌道の不一致）に課題があります。",
          trainingPlan: "1. リリース時の指のかかりを意識したスロードリル\n2. スイングのアタックアングルを水平に近づけるティー打撃\n3. APIキーを設定し、実際の数値に基づく詳細な改善メニューを生成する"
        };

        setAnalysisSheets(prev => ({
          ...prev,
          [docId]: mockResponse
        }));
        if (isSupabaseConfigured) {
          await saveAnalysisSheet(docId, mockResponse).catch(err => console.error("Error saving analysis sheet:", err));
        }
      }
    } catch (error: any) {
      alert(error.message || "解析中にエラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Upload multiple files handler
  const handleUploadFiles = async (files: FileList | File[]) => {
    setIsProcessing(true);
    const loadedDocs: DocumentItem[] = [];
    const newHittingPlayers: Record<string, HittingPlayer[]> = {};
    const newPitchingPlayers: Record<string, PitchingPlayer[]> = {};
    const newSelectedPlayerNames: Record<string, string> = {};

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let text = '';
        let csvRaw = '';
        
        if (file.name.endsWith('.pdf')) {
          text = await extractTextFromPdf(file);
        } else if (file.name.endsWith('.csv')) {
          csvRaw = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('CSVファイルの読み込みに失敗しました'));
            reader.readAsText(file);
          });
          text = convertCsvToMarkdown(csvRaw);
        } else {
          // Read text file or markdown
          text = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsText(file);
          });
        }

        if (text.trim()) {
          const uniqueId = `doc-${Date.now()}-${i}`;
          // Determine if it is a hitting document (check file name first, then auto-detect by CSV headers)
          let isHittingDoc = file.name.toLowerCase().includes('hitting') || 
                             file.name.includes('打撃') || 
                             file.name.toLowerCase().includes('batting');

          if (file.name.endsWith('.csv') && csvRaw) {
            const firstLine = csvRaw.split(/\r?\n/)[0] || '';
            const headers = firstLine.split(',').map(h => h.trim().toLowerCase());
            
            const hasHittingKeywords = headers.some(h => 
              h.includes('exitvelocity') || 
              h.includes('launchangle') || 
              h.includes('バット') || 
              h.includes('アッパー') || 
              h.includes('ミート') ||
              h.includes('distance')
            );
            const hasPitchingKeywords = headers.some(h => 
              h.includes('pitchtype') || 
              h.includes('pitch type') || 
              h.includes('speed') || 
              h.includes('spin') || 
              h.includes('efficiency') || 
              h.includes('vb') || 
              h.includes('hb') ||
              h.includes('球種')
            );

            if (hasHittingKeywords && !hasPitchingKeywords) {
              isHittingDoc = true;
            } else if (hasPitchingKeywords && !hasHittingKeywords) {
              isHittingDoc = false;
            }
          }
          
          let finalContent = text;
          
          // Parse baseball players from CSV first to generate summary content
          if (file.name.endsWith('.csv') && csvRaw) {
            if (isHittingDoc) {
              let teamName = getTeamNameFromFileName(file.name);
              if (!teamName || teamName === '共通チーム') {
                let foundTeam = '昌平';
                const allHPlayers = Object.values(hittingPlayers).flat();
                for (const hp of allHPlayers) {
                  if (hp.name && hp.name.startsWith('昌平')) {
                    foundTeam = '昌平';
                    break;
                  }
                  if (hp.name && hp.name.includes(' ')) {
                    const firstPart = hp.name.split(' ')[0];
                    if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(firstPart)) {
                      foundTeam = firstPart;
                      break;
                    }
                  }
                }
                teamName = foundTeam;
              }
              const playersData = parseHittingPlayers(csvRaw, teamName);
              newHittingPlayers[uniqueId] = playersData;
              if (playersData.length > 0) {
                newSelectedPlayerNames[uniqueId] = playersData[0].name;
              }
              // Generate summary instead of raw table to save token size
              finalContent = generateHittingSummaryMarkdown(playersData);
            } else {
              let teamName = getTeamNameFromFileName(file.name);
              if (!teamName || teamName === '共通チーム') {
                let foundTeam = '昌平';
                let detectedPrefix = '';
                const allHPlayers = Object.values(hittingPlayers).flat();
                for (const hp of allHPlayers) {
                  if (hp.name && hp.name.startsWith('昌平')) {
                    detectedPrefix = '昌平';
                    break;
                  }
                  if (hp.name && hp.name.includes(' ')) {
                    const firstPart = hp.name.split(' ')[0];
                    if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(firstPart)) {
                      detectedPrefix = firstPart;
                      break;
                    }
                  }
                }
                if (detectedPrefix) {
                  foundTeam = detectedPrefix;
                } else {
                  for (const d of documents) {
                    const t = getTeamNameFromFileName(d.fileName);
                    if (t && t !== '共通チーム' && isNaN(Number(t))) {
                      foundTeam = t;
                      break;
                    }
                  }
                }
                teamName = foundTeam;
              }
              const playersData = parsePitchingPlayers(csvRaw, teamName);
              newPitchingPlayers[uniqueId] = playersData;
              if (playersData.length > 0) {
                newSelectedPlayerNames[uniqueId] = playersData[0].name;
              }
              // Generate summary instead of raw table to save token size
              finalContent = generatePitchingSummaryMarkdown(playersData);
            }
          }

          const newDoc: DocumentItem = {
            id: uniqueId,
            title: file.name.replace(/\.[^/.]+$/, ""), // Strip extension
            fileName: file.name,
            fileType: file.name.endsWith('.pdf') ? 'pdf' : 'text',
            content: finalContent,
            uploadedAt: new Date().toLocaleString('ja-JP', { hour12: false }).substring(0, 16)
          };
          loadedDocs.push(newDoc);

          if (isSupabaseConfigured) {
            // Save parent document first to prevent foreign key violation on players table
            await saveDocument(newDoc);
            
            // Then save child players list
            if (file.name.endsWith('.csv') && csvRaw) {
              if (isHittingDoc) {
                await savePlayersList(uniqueId, 'hitting', newHittingPlayers[uniqueId]);
              } else {
                await savePlayersList(uniqueId, 'pitching', newPitchingPlayers[uniqueId]);
              }
            }
          }
        }
      }

      if (loadedDocs.length === 0) {
        throw new Error('読み取れるテキストを含むファイルが見つかりませんでした。');
      }

      // Add all loaded docs to state
      setDocuments(prev => [...loadedDocs, ...prev]);
      
      // Update players states
      setHittingPlayers(prev => ({ ...prev, ...newHittingPlayers }));
      setPitchingPlayers(prev => ({ ...prev, ...newPitchingPlayers }));
      setSelectedPlayerNames(prev => ({ ...prev, ...newSelectedPlayerNames }));
      
      // Select the first imported document as active and go to Individual view
      const firstNewDoc = loadedDocs[0];
      setActiveDocId(firstNewDoc.id);
      setActiveView('individual');

      // Trigger analysis sequentially for all imported files
      for (const doc of loadedDocs) {
        await runAnalysis(doc.id, doc.content);
      }

    } catch (error: any) {
      alert(error.message || "ファイルの処理中にエラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  };

  // Add text directly
  const handleAddText = async (title: string, text: string) => {
    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      title,
      fileName: 'direct_input.txt',
      fileType: 'text',
      content: text,
      uploadedAt: new Date().toLocaleString('ja-JP', { hour12: false }).substring(0, 16)
    };

    if (isSupabaseConfigured) {
      await saveDocument(newDoc).catch(err => console.error("Error saving document:", err));
    }

    setDocuments(prev => [newDoc, ...prev]);
    setActiveDocId(newDoc.id);
    setActiveView('individual');

    // Auto trigger analysis
    await runAnalysis(newDoc.id, text);
  };

  // Delete document handler (with Supabase sync)
  const handleDeleteDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent trigger select
    
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    
    const confirmDelete = window.confirm(`資料「${doc.title}」を削除しますか？\nこの資料に紐づく選手データやAI分析結果もすべて削除されます。`);
    if (!confirmDelete) return;

    try {
      if (isSupabaseConfigured) {
        await deleteDocument(docId);
      }

      // Remove from states
      setDocuments(prev => prev.filter(d => d.id !== docId));
      
      setAnalysisSheets(prev => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });

      setHittingPlayers(prev => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });

      setPitchingPlayers(prev => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });

      // Switch active doc if the deleted one was selected
      if (activeDocId === docId) {
        const remainingDocs = documents.filter(d => d.id !== docId);
        if (remainingDocs.length > 0) {
          setActiveDocId(remainingDocs[0].id);
        } else {
          setActiveDocId(null);
        }
      }
    } catch (err: any) {
      alert(`削除に失敗しました: ${err.message || err}`);
    }
  };

  // Send message to coach
  const handleSendMessage = async (messageText: string) => {
    if (!activeDocId || !activeDocument || isResponding) return;

    const userMsg: ChatMessage = { role: 'user', content: messageText };
    const updatedHistory = [...currentMessages, userMsg];
    
    // Add user message to history immediately
    setChatHistories(prev => ({
      ...prev,
      [chatKey]: updatedHistory
    }));

    setIsResponding(true);

    try {
      if (apiKey) {
        // Real Gemini coach chat
        const responseText = await chatWithCoach(
          activeDocument.content,
          currentMessages,
          messageText,
          activePersona.systemPrompt,
          apiKey
        );
        
        const aiMsg: ChatMessage = { role: 'model', content: responseText };
        setChatHistories(prev => ({
          ...prev,
          [chatKey]: [...updatedHistory, aiMsg]
        }));
      } else {
        // Demo Mode response
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        let reply = '';
        const lowercaseMsg = messageText.toLowerCase();

        const isVb = lowercaseMsg.includes('縦の変化') || lowercaseMsg.includes('縦変化') || lowercaseMsg.includes('ホップ') || lowercaseMsg.includes('vb');
        const isEff = lowercaseMsg.includes('回転効率') || lowercaseMsg.includes('効率');
        const isGyro = lowercaseMsg.includes('ジャイロ');
        const isAdjust = lowercaseMsg.includes('アジャスト');
        const isAttack = lowercaseMsg.includes('進入角度') || lowercaseMsg.includes('アタックアングル') || lowercaseMsg.includes('アッパー');

        if (isVb) {
          if (activePersona.id === 'headcoach') {
            reply = `（デモモード解説）\n黒木だ。「縦の変化量（ホップ成分）」だな。これはボールが重力で自然に落ちる位置と比較して、どれだけ上向きに変化したかを示す物理的な数値だ。\nストレートの縦変化を高めるには、リリースで手首が寝ず、ボールの真後ろから指先で強く押し込んでバックスピン（回転効率）を高める必要がある。手首を立てて、ボールを「押し弾く」感覚を養うスロースロー調整をブルペンでやってみろ。`;
          } else if (activePersona.id === 'mentor') {
            reply = `（デモモード解説）\nエミリです！「縦の変化量」についてですね！\nこれはね、ボールがお辞儀（ドロップ）しないでキャッチャーミットまでピシッと届く「ノビの良さ」のことだよ！清水くんの数値がすごく高かったよね。\n縦変化を大きくするには、リリースの瞬間に人差し指と中指でボールの下をシュッと押し出すのがコツなんだ。指先でパチンと弾くキャッチボール練習から始めてみよう！`;
          } else {
            reply = `（デモモード解説）\n橘です。「縦の変化量（Vertical Break）」に関して説明します。\n物理的には「重力による自由落下軌道からの上方向への揚力（マグヌス効果）の差分」と定義されます。\nストレートでこの数値が40cmを超えると、打者は軌道の上を通過するように錯覚するため、高めでの空振り率（Whiff%）が有意に向上します。回転効率を上げることで最大化が可能です。`;
          }
        } else if (isEff) {
          if (activePersona.id === 'headcoach') {
            reply = `（デモモード解説）\n黒木だ。「回転効率」だな。\nボールの総回転のうち、揚力（変化させる力）に変換されている割合だ。ここが低いとジャイロ回転（スライド・シュート成分）が多くなり、ストレートがシュートして垂れる原因になる。指がボールの側面に滑り落ちないよう、人差し指と中指の均等な圧力でリリースする感覚を掴む必要がある。`;
          } else if (activePersona.id === 'mentor') {
            reply = `（デモモード解説）\nエミリです！「回転効率」についてですね！\nこれは、ボールが風を受けて浮き上がるパワーを、どれだけ無駄なく（100%近く）使えているかという割合だよ！\nストレートで回転効率が低いと、ボールがシュート回転して垂れちゃうんだ。シャドースイングでリリース時に親指がしっかり下を向くイメージで投げると改善するよ！`;
          } else {
            reply = `（デモモード解説）\n橘です。「回転効率（Spin Efficiency）」を解説します。\n総回転数（Total Spin）に対する有効回転数（Active Spin）の比率です。これが低下（ジャイロ角度が増加）すると揚力成分が減衰し、ストレートが垂れる軌道にシフトします。リリースのジャイロ角度を0度（効率100%）に近づける技術アプローチが求められます。`;
          }
        } else if (isGyro) {
          if (activePersona.id === 'headcoach') {
            reply = `（デモモード解説）\n黒木だ。「ジャイロ角度」だな。\nボールの進行方向に対する回転軸のズレ（螺旋回転の度合い）だ。この角度が大きいとストレートはホップ力を失う。リリースで手首が外や内にねじれるとジャイロ角度が大きくなるぞ。プレートから捕手へ、まっすぐ一直線に指先を押し通すイメージで投げろ。`;
          } else if (activePersona.id === 'mentor') {
            reply = `（デモモード解説）\nエミリです！「ジャイロ角度」ですね！\nこれはボールが弾丸やコマのように、進行方向へ向かって回転するネジのような角度のことだよ！\nストレートではジャイロ角度が小さい方がホップするんだけど、カットボールを投げるときにはあえて大きくするんだよ。ストレートでジャイロを減らしたいときは、縫い目に指をしっかりかけて真っ直ぐ押す感覚を磨こう！`;
          } else {
            reply = `（デモモード解説）\n橘です。「ジャイロ角度（Gyro Angle）」を解説します。\nボールの進行方向ベクトルと回転軸ベクトルのなす角です。角度が90度に近づくと揚力はゼロになり、重力落下に近い軌道をとります。フォーシーム（ストレート）でのホップ成分最大化には、この角度を極限まで0度に抑えることが前提条件となります。`;
          }
        } else if (isAdjust) {
          if (activePersona.id === 'headcoach') {
            reply = `（デモモード解説）\n黒木だ。「アジャスト率」だな。\nボールの軌道にバットの軌道をいかに長く合致させ、芯で確実にミートできたかという割合だ。ここが低い者はバットが「点」で入っている。バットのスイング軌道をボールの軌道と合致させ、インパクトゾーンを「線」にするスイングプレーンの修正ドリルを行え。`;
          } else if (activePersona.id === 'mentor') {
            reply = `（デモモード解説）\nエミリです！「アジャスト率」についてですね！\nピッチャーの投げるボールの軌道に、どれだけバットの軌道を合わせて芯で打てたかという確率（％）のことだよ！有田くんの50%は本当に安定しているね！\nアジャスト率を高めるには、上から叩きすぎず、ボールの通り道にバットの面を長く合わせるようにレベルスイングを意識してみよう！`;
          } else {
            reply = `（デモモード解説）\n橘です。「アジャスト率（Adjust Rate）」を解説します。\nボールの入射角（一般に-6度前後）とバットのスイング進入角の『軌道の一致度』を示すミート効率指標です。コンタクト時の衝突効率（Smash Factor）の安定性に直接寄与します。改善にはスイング平面を投球軌道と同調させる調整が必要です。`;
          }
        } else if (isAttack) {
          if (activePersona.id === 'headcoach') {
            reply = `（デモモード解説）\n黒木だ。「進入角度（アタックアングル）」だな。\nインパクトの瞬間にバットがどれだけアッパー（またはダウン）で入ったかを示す角度だ。アッパー度が大きすぎるとボールの上を叩くゴロや、下を擦るポップフライが増えアジャスト率が下がる。自分の進入角度とボールの入射角が一致するよう、体の軸でスイングプレーンを管理しろ。`;
          } else if (activePersona.id === 'mentor') {
            reply = `（デモモード解説）\nエミリです！「進入角度（アタックアングル）」ですね！\nバットがボールに対して、どれくらいアッパー（上向き）に当たったかという角度だよ！高橋くんの16度は力強い長打を打つのに最適だけど、アジャスト率を上げるには少し平らに当てるイメージも大切だよ。\nボールの軌道を体全体でなぞるようにバットを振り出してみよう！`;
          } else {
            reply = `（デモモード解説）\n橘です。「進入角度（Attack Angle）」について解説します。\nボール衝突時のバット軌道の水平面に対する傾斜角です。投球軌道の入射角（平均-6度）に対し、アタックアングルが+6〜+12度付近で衝突すると、統計的に最も長打（バレルゾーン）になりやすい理想の打球角度が生まれやすくなります。スイング全体の起動位置調整が重要です。`;
          }
        } else {
          if (activePersona.id === 'headcoach') {
            reply = `（デモモード回答）\n黒木だ。「${messageText}」についてだが、現在のスイング軌道や投球時の指のかかり方を感覚だけで修正しようとしても無理がある。まずはRapsodoの具体的な数値（回転効率や打球速度）を見つめ直せ。リリースの指先の向き、あるいはバットの進入角度に意識を向けた練習ドリルから始めるぞ。\n\n※ Gemini API キーを設定すると、本物のAI監督があなたの質問に個別に技術フィードバックを行います。`;
          } else if (activePersona.id === 'mentor') {
            reply = `（デモモード回答）\nエミリです！「${messageText}」という疑問、すごく前向きで素晴らしいですね！今回の測定データでも、特定の球種や芯で捉えた打球にはプロ顔負けの素晴らしい数値が出ていましたよ。まずは楽しんで次のステップへ進みましょう！\n\n※ Gemini API キーを設定すると、本物のAIメンターが個別の強みを活かす育成プランを一緒に考案します。`;
          } else {
            reply = `（デモモード回答）\n橘です。ご質問の「${messageText}」について、データから読み解くアプローチは2つあります。1つ目は球速帯とスピン量の相関関係の最適化。2つ目は打球角度（バレルゾーン）へ入れる確率の向上です。具体的にどちらの指標を優先的に改善したいですか？\n\n※ Gemini API キーを設定すると、本物のAIアナリストが詳細なデータロードマップを整理します。`;
          }
        }

        const aiMsg: ChatMessage = { role: 'model', content: reply };
        setChatHistories(prev => ({
          ...prev,
          [chatKey]: [...updatedHistory, aiMsg]
        }));
      }
    } catch (error: any) {
      alert(error.message || "AIの返答取得に失敗しました。");
    } finally {
      setIsResponding(false);
    }
  };

  const handleClearChat = () => {
    if (chatKey) {
      setChatHistories(prev => ({
        ...prev,
        [chatKey]: []
      }));
    }
  };

  // Re-run analysis manual trigger
  const handleReanalyze = () => {
    if (activeDocId && activeDocument) {
      runAnalysis(activeDocId, activeDocument.content);
    }
  };

  // Persona switch helper
  const handleChangePersona = (personaId: string) => {
    const nextPersona = MOCK_PERSONAS.find(p => p.id === personaId);
    if (nextPersona) {
      setActivePersona(nextPersona);
    }
  };

  // Determine doc type consistently based on active document properties
  const isHitting = activeDocument
    ? (activeDocument.id.includes('hitting') || 
       activeDocument.title.includes('打撃') || 
       activeDocument.id.includes('batting') || 
       activeDocument.fileName.toLowerCase().includes('hitting') ||
       activeDocument.fileName.toLowerCase().includes('batting'))
    : false;

  // Handlers for individual players selection
  const activePlayersList = activeDocId 
    ? (isHitting
      ? (hittingPlayers[activeDocId] || []).map((p: HittingPlayer) => p.name)
      : (pitchingPlayers[activeDocId] || []).map((p: PitchingPlayer) => p.name)
      )
    : [];

  const currentSelectedPlayer = activeDocId ? (selectedPlayerNames[activeDocId] || '') : '';

  const activeHittingPlayerData = (isHitting && activeDocId)
    ? (hittingPlayers[activeDocId] || []).find((p: HittingPlayer) => p.name === currentSelectedPlayer) || null
    : null;

  const activePitchingPlayerData = (!isHitting && activeDocId)
    ? (pitchingPlayers[activeDocId] || []).find((p: PitchingPlayer) => p.name === currentSelectedPlayer) || null
    : null;

  // Active Team Name
  const activeTeamName = activeDocument ? getTeamNameFromFileName(activeDocument.fileName) : '';
  const activeCompareDocId = activeDocId ? (compareDocIds[activeDocId] || '') : '';

  // Get other documents of the SAME team and SAME type that contain the SELECTED player
  const compareDocCandidates = documents.filter(doc => {
    if (!activeDocId || doc.id === activeDocId) return false;
    
    // Check if same team
    const teamName = getTeamNameFromFileName(doc.fileName);
    if (teamName !== activeTeamName) return false;

    // Check if same type (hitting/pitching)
    const isDocHitting = doc.id.includes('hitting') || 
                         doc.title.includes('打撃') || 
                         doc.id.includes('batting') || 
                         doc.fileName.toLowerCase().includes('hitting') ||
                         doc.fileName.toLowerCase().includes('batting') ||
                         (hittingPlayers[doc.id] && hittingPlayers[doc.id].length > 0);
    
    if (isDocHitting !== isHitting) return false;

    // Check if contains the currently selected player
    if (!currentSelectedPlayer) return false;

    if (isHitting) {
      const plist = hittingPlayers[doc.id] || [];
      return plist.some(p => p.name === currentSelectedPlayer);
    } else {
      const plist = pitchingPlayers[doc.id] || [];
      return plist.some(p => p.name === currentSelectedPlayer);
    }
  }).map(doc => {
    // Determine measurement date
    let dateStr = '';
    if (isHitting) {
      const plist = hittingPlayers[doc.id] || [];
      const p = plist.find(p => p.name === currentSelectedPlayer);
      if (p) dateStr = p.measurementDate || '';
    } else {
      const plist = pitchingPlayers[doc.id] || [];
      const p = plist.find(p => p.name === currentSelectedPlayer);
      if (p) dateStr = p.measurementDate || '';
    }
    if (!dateStr) {
      dateStr = doc.uploadedAt ? doc.uploadedAt.substring(0, 10) : '';
    }
    return {
      id: doc.id,
      title: doc.title,
      dateStr: dateStr
    };
  });

  const compareHittingPlayerData = (isHitting && activeCompareDocId)
    ? (hittingPlayers[activeCompareDocId] || []).find((p: HittingPlayer) => p.name === currentSelectedPlayer) || null
    : null;

  const comparePitchingPlayerData = (!isHitting && activeCompareDocId)
    ? (pitchingPlayers[activeCompareDocId] || []).find((p: PitchingPlayer) => p.name === currentSelectedPlayer) || null
    : null;

  const handleSelectPlayer = (name: string) => {
    if (activeDocId) {
      setSelectedPlayerNames(prev => ({
        ...prev,
        [activeDocId]: name
      }));
    }
  };

  const handleSelectCompareDoc = (docId: string) => {
    if (activeDocId) {
      setCompareDocIds(prev => ({
        ...prev,
        [activeDocId]: docId
      }));
    }
  };



  const handleSavePlayerStats = (playerName: string, updatedRows: any[], updatedExtra?: any, newName?: string) => {
    if (!activeDocId) return;
    const finalName = newName ? newName.trim() : playerName;

    if (newName && newName.trim() !== playerName) {
      setSelectedPlayerNames(prev => ({
        ...prev,
        [activeDocId]: finalName
      }));
    }

    if (!isHitting) {
      setPitchingPlayers(prev => {
        const docPlayers = prev[activeDocId] ? [...prev[activeDocId]] : [];
        const idx = docPlayers.findIndex(p => p.name === playerName);
        if (idx !== -1) {
          const updatedPlayer = { 
            ...docPlayers[idx], 
            name: finalName,
            rows: updatedRows,
            quickTimes: updatedExtra && updatedExtra.quickTimes ? updatedExtra.quickTimes : docPlayers[idx].quickTimes,
            previousStraight: updatedExtra && updatedExtra.previousStraight ? updatedExtra.previousStraight : docPlayers[idx].previousStraight,
            grade: updatedExtra && updatedExtra.grade !== undefined ? updatedExtra.grade : docPlayers[idx].grade
          };
          docPlayers[idx] = updatedPlayer;
          if (isSupabaseConfigured) {
            savePlayersList(activeDocId, 'pitching', docPlayers).catch(err => console.error("Error saving players list:", err));
          }
        }
        return { ...prev, [activeDocId]: docPlayers };
      });
    } else {
      setHittingPlayers(prev => {
        const docPlayers = prev[activeDocId] ? [...prev[activeDocId]] : [];
        const idx = docPlayers.findIndex(p => p.name === playerName);
        if (idx !== -1) {
          const existingRows = [...docPlayers[idx].rows];
          updatedRows.forEach(uRow => {
            const eIdx = existingRows.findIndex(r => r.type === uRow.type);
            if (eIdx !== -1) {
              existingRows[eIdx] = uRow;
            } else {
              existingRows.push(uRow);
            }
          });
          const updatedPlayer = { 
            ...docPlayers[idx], 
            name: finalName,
            rows: existingRows,
            courses: updatedExtra && updatedExtra.courses ? updatedExtra.courses : docPlayers[idx].courses,
            compareStats: updatedExtra && updatedExtra.compareStats ? updatedExtra.compareStats : docPlayers[idx].compareStats,
            grade: updatedExtra && updatedExtra.grade !== undefined ? updatedExtra.grade : docPlayers[idx].grade
          };
          docPlayers[idx] = updatedPlayer;
          if (isSupabaseConfigured) {
            savePlayersList(activeDocId, 'hitting', docPlayers).catch(err => console.error("Error saving players list:", err));
          }
        }
        return { ...prev, [activeDocId]: docPlayers };
      });
    }
  };
  if (!isLoggedIn) {
    return (
      <div className="login-screen-wrapper">
        <div className={`login-card ${isShaking ? 'shake-animation' : ''}`}>
          <div className="login-logo-container">
            <svg className="login-logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
              <defs>
                <linearGradient id="login-ai-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <circle cx="24" cy="24" r="16" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5"/>
              <path d="M15.5 10 A16.5 16.5 0 0 0 15.5 38" fill="none" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="2,2"/>
              <path d="M32.5 10 A16.5 16.5 0 0 1 32.5 38" fill="none" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="2,2"/>
              <path d="M8 28 C 16 10, 32 10, 40 28" fill="none" stroke="url(#login-ai-gradient)" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="8" cy="28" r="2.5" fill="#3b82f6" stroke="#ffffff" strokeWidth="1"/>
              <circle cx="24" cy="14" r="2.5" fill="#8b5cf6" stroke="#ffffff" strokeWidth="1"/>
              <circle cx="40" cy="28" r="2.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1"/>
              <path d="M24 6 L24.7 7.3 L26 8 L24.7 8.7 L24 10 L23.3 8.7 L22 8 L23.3 7.3 Z" fill="#fbbf24"/>
            </svg>
            <h2>野球 AI 分析システム</h2>
            <p className="login-subtitle font-outfit">Baseball AI Analysis & Coaching Portal</p>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <label htmlFor="pass-input">PASSWORD</label>
              <input
                id="pass-input"
                type="password"
                placeholder="パスワードを入力してください"
                value={loginPassword}
                onChange={(e) => {
                  setLoginPassword(e.target.value);
                  if (loginError) setLoginError(false);
                }}
                autoFocus
              />
            </div>
            {loginError && (
              <div className="login-error-message">
                ⚠️ パスワードが正しくありません。
              </div>
            )}
            <button type="submit" className="login-submit-btn">
              ログイン
            </button>
          </form>
          <div className="login-footer">
            © 2026 Baseball AI Coaching Assistant. All Rights Reserved.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container-refactored">
      {/* Top Navigation Bar */}
      <header className="navbar-top glass-panel">
        <div className="navbar-left">
          <svg className="navbar-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="32" height="32" style={{ marginRight: '4px' }}>
            <defs>
              <linearGradient id="ai-gradient-navbar" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <circle cx="24" cy="24" r="16" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5"/>
            <path d="M15.5 10 A16.5 16.5 0 0 0 15.5 38" fill="none" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="2,2"/>
            <path d="M32.5 10 A16.5 16.5 0 0 1 32.5 38" fill="none" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="2,2"/>
            <path d="M8 28 C 16 10, 32 10, 40 28" fill="none" stroke="url(#ai-gradient-navbar)" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="8" cy="28" r="2.5" fill="#4f46e5" stroke="#ffffff" strokeWidth="1"/>
            <circle cx="24" cy="14" r="2.5" fill="#818cf8" stroke="#ffffff" strokeWidth="1"/>
            <circle cx="40" cy="28" r="2.5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1"/>
            <path d="M24 6 L24.7 7.3 L26 8 L24.7 8.7 L24 10 L23.3 8.7 L22 8 L23.3 7.3 Z" fill="#fbbf24"/>
          </svg>
          <div className="navbar-brand">
            <h1>野球 AI 分析 & コーチ</h1>
            <span className="navbar-sub">Rapsodo & 論文マルチ分析</span>
          </div>
        </div>

        {/* View Tabs Selector */}
        <nav className="navbar-tabs">
          <button 
            className={`nav-tab-btn ${activeView === 'individual' ? 'active' : ''}`}
            onClick={() => setActiveView('individual')}
          >
            📋 選手個別レポート
          </button>
          <button 
            className={`nav-tab-btn ${activeView === 'team' ? 'active' : ''}`}
            onClick={() => setActiveView('team')}
          >
            👥 チーム全体分析
          </button>
          <button 
            className={`nav-tab-btn ${activeView === 'coach' ? 'active' : ''}`}
            onClick={() => setActiveView('coach')}
          >
            💬 AIコーチ指導
          </button>
          <button 
            className={`nav-tab-btn ${activeView === 'files' ? 'active' : ''}`}
            onClick={() => setActiveView('files')}
          >
            📁 測定データ管理
          </button>
        </nav>

        <div className="navbar-right">
          {/* Document Dropdown Selector */}
          <div className="navbar-doc-selector">
            <span className="select-label">分析データ:</span>
            <select
              value={activeDocId || ''}
              onChange={(e) => setActiveDocId(e.target.value || null)}
              className="navbar-dropdown-select"
            >
              {(() => {
                const allCsvDocs = documents.filter(doc => 
                  doc.fileName.toLowerCase().endsWith('.csv') || 
                  doc.id === 'doc-pitching' || 
                  doc.id === 'doc-batting' ||
                  (hittingPlayers[doc.id] && hittingPlayers[doc.id].length > 0) ||
                  (pitchingPlayers[doc.id] && pitchingPlayers[doc.id].length > 0)
                );

                const getIsHitting = (doc: DocumentItem) => {
                  return doc.id.includes('hitting') || 
                         doc.title.includes('打撃') || 
                         doc.id.includes('batting') || 
                         doc.fileName.toLowerCase().includes('hitting') ||
                         doc.fileName.toLowerCase().includes('batting') ||
                         (hittingPlayers[doc.id] && hittingPlayers[doc.id].length > 0);
                };

                const hittingDocs = allCsvDocs.filter(d => getIsHitting(d));
                const pitchingDocs = allCsvDocs.filter(d => !getIsHitting(d));

                const latestHitting = hittingDocs.length > 0 ? [hittingDocs[0]] : [];
                const latestPitching = pitchingDocs.length > 0 ? [pitchingDocs[0]] : [];

                const csvDocs = [...latestHitting, ...latestPitching];
                
                if (csvDocs.length === 0) {
                  return <option value="">（データなし）</option>;
                }
                
                return csvDocs.map(doc => {
                  const isHittingDoc = getIsHitting(doc);
                  
                  const teamName = getTeamNameFromFileName(doc.fileName);
                  
                  let dateStr = '';
                  if (isHittingDoc) {
                    const plist = hittingPlayers[doc.id] || [];
                    if (plist.length > 0) dateStr = plist[0].measurementDate || '';
                  } else {
                    const plist = pitchingPlayers[doc.id] || [];
                    if (plist.length > 0) dateStr = plist[0].measurementDate || '';
                  }
                  
                  if (!dateStr) {
                    dateStr = doc.uploadedAt ? doc.uploadedAt.substring(0, 10) : '';
                  }

                  const label = `${teamName !== '共通チーム' ? `[${teamName}] ` : ''}${isHittingDoc ? '🏏 打撃' : '⚾ 投球'} (${dateStr})`;
                  return (
                    <option key={doc.id} value={doc.id}>{label}</option>
                  );
                });
              })()}
            </select>
          </div>

          {/* Settings API Button */}
          <button 
            className={`btn btn-secondary btn-sm api-badge-btn ${apiKey ? 'api-configured' : 'api-demo'}`} 
            onClick={() => setIsSettingsOpen(true)}
          >
            {apiKey ? 'APIキー: 有効' : 'デモモード'}
          </button>
        </div>
      </header>

      {/* Main Spacious Viewport */}
      <main className="spacious-viewport">
        {activeView === 'individual' && (
          <div className="pdf-sheet-centered-wrapper">
            <AnalysisSheet
              document={activeDocument}
              sheetData={activeSheetData}
              onSaveSheet={(updatedData) => {
                if (activeDocId) {
                  setAnalysisSheets(prev => ({ ...prev, [activeDocId]: updatedData }));
                  if (isSupabaseConfigured) {
                    saveAnalysisSheet(activeDocId, updatedData).catch(err => console.error("Error saving analysis sheet:", err));
                  }
                }
              }}
              isAnalyzing={isAnalyzing}
              onReanalyze={handleReanalyze}
              isHitting={isHitting}
              players={activePlayersList}
              selectedPlayer={currentSelectedPlayer}
              onSelectPlayer={handleSelectPlayer}
              hittingPlayerData={activeHittingPlayerData}
              pitchingPlayerData={activePitchingPlayerData}
              onSavePlayerStats={handleSavePlayerStats}
              allPitchingPlayers={activeDocId ? pitchingPlayers[activeDocId] : []}
              allHittingPlayers={activeDocId ? hittingPlayers[activeDocId] : []}
              forceView="individual"
              compareDocId={activeCompareDocId}
              compareDocCandidates={compareDocCandidates}
              onSelectCompareDoc={handleSelectCompareDoc}
              compareHittingPlayerData={compareHittingPlayerData}
              comparePitchingPlayerData={comparePitchingPlayerData}
              allCompareHittingPlayers={activeCompareDocId ? hittingPlayers[activeCompareDocId] : []}
            />
          </div>
        )}

        {activeView === 'team' && (
          <div className="team-sheet-centered-wrapper">
            <AnalysisSheet
              document={activeDocument}
              sheetData={activeSheetData}
              onSaveSheet={(updatedData) => {
                if (activeDocId) {
                  setAnalysisSheets(prev => ({ ...prev, [activeDocId]: updatedData }));
                  if (isSupabaseConfigured) {
                    saveAnalysisSheet(activeDocId, updatedData).catch(err => console.error("Error saving analysis sheet:", err));
                  }
                }
              }}
              isAnalyzing={isAnalyzing}
              onReanalyze={handleReanalyze}
              isHitting={isHitting}
              players={activePlayersList}
              selectedPlayer={currentSelectedPlayer}
              onSelectPlayer={handleSelectPlayer}
              hittingPlayerData={activeHittingPlayerData}
              pitchingPlayerData={activePitchingPlayerData}
              onSavePlayerStats={handleSavePlayerStats}
              allPitchingPlayers={activeDocId ? pitchingPlayers[activeDocId] : []}
              allHittingPlayers={activeDocId ? hittingPlayers[activeDocId] : []}
              forceView="team"
              compareDocId={activeCompareDocId}
              compareDocCandidates={compareDocCandidates}
              onSelectCompareDoc={handleSelectCompareDoc}
              compareHittingPlayerData={compareHittingPlayerData}
              comparePitchingPlayerData={comparePitchingPlayerData}
              allCompareHittingPlayers={activeCompareDocId ? hittingPlayers[activeCompareDocId] : []}
            />
          </div>
        )}

        {activeView === 'coach' && (
          <div className="coach-chat-full-wrapper">
            <CoachChat
              document={activeDocument}
              messages={currentMessages}
              onSendMessage={handleSendMessage}
              activePersona={activePersona}
              onChangePersona={handleChangePersona}
              isResponding={isResponding}
              onClearChat={handleClearChat}
            />
          </div>
        )}

        {activeView === 'files' && (
          <div className="files-management-centered-wrapper">
            <div className="files-dashboard glass-panel">
              <div className="dashboard-header">
                <h2>📁 測定データ・資料の管理</h2>
                <p>Rapsodo測定結果のCSVファイルや野球指導の論文・資料PDFをアップロードしてください。</p>
              </div>
              <div className="dashboard-grid">
                <div className="dashboard-left">
                  <Sidebar
                    documents={documents}
                    activeId={activeDocId}
                    onSelectDocument={setActiveDocId}
                    onUploadFiles={handleUploadFiles}
                    onAddText={handleAddText}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    hasApiKey={!!apiKey}
                    isProcessing={isProcessing}
                    onDeleteDocument={handleDeleteDocument}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        savedApiKey={apiKey}
        onSave={handleSaveApiKey}
      />
    </div>
  );
}
