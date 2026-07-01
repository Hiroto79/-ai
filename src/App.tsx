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
import { analyzeDocument, chatWithCoach, getBestSupportedModel, createGeminiCache, extendGeminiCacheTTL } from './services/gemini';
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

  // Pinned/Memorized reference documents for context caching
  const [pinnedDocIds, setPinnedDocIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('gemini_analysis_pinned_doc_ids');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [activeCache, setActiveCache] = useState<{
    name: string;
    expires: string;
    model: string;
    textHash: string;
  } | null>(null);

  const [savedTokensCount, setSavedTokensCount] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('gemini_analysis_saved_tokens_count');
      return stored ? parseInt(stored, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [isFreeTierRestriction, setIsFreeTierRestriction] = useState<boolean>(false);

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

  const getCombinedPinnedContent = (): string => {
    const pinnedDocs = documents.filter(doc => pinnedDocIds.includes(doc.id));
    if (pinnedDocs.length === 0) return '';
    return pinnedDocs
      .map(doc => `=== 記憶された参照資料: ${doc.title} ===\n${doc.content}\n====================================`)
      .join('\n\n');
  };

  const getPinnedTokensCount = (): number => {
    const pinnedDocs = documents.filter(doc => pinnedDocIds.includes(doc.id));
    const combinedLength = pinnedDocs.reduce((acc, doc) => acc + doc.content.length, 0);
    return Math.round(combinedLength * 1.5);
  };

  const getOrUpdateContextCache = async (apiKeyToUse: string, currentModel: string): Promise<string | null> => {
    const combinedContent = getCombinedPinnedContent();
    if (!combinedContent) return null;

    // Estimate token count. 1 character ≈ 1.5 tokens in Japanese.
    // Explicit Context Caching requires minimum 32,768 tokens for Gemini 1.5.
    const estimatedTokens = combinedContent.length * 1.5;
    if (estimatedTokens < 32768) {
      console.log(`Pinned content is small (~${Math.round(estimatedTokens)} tokens). Caching skipped, using standard prompt injection.`);
      return null;
    }

    // Determine target caching model
    let targetModel = 'gemini-1.5-flash-001';
    if (currentModel.includes('pro')) {
      targetModel = 'gemini-1.5-pro-001';
    }

    // Generate a simple hash of the combined text to detect changes
    const contentHash = combinedContent.length + '_' + combinedContent.substring(0, 100) + '_' + combinedContent.substring(combinedContent.length - 100);

    // If cache is active and has matching hash/model/expiration, reuse it!
    if (activeCache && 
        activeCache.textHash === contentHash && 
        activeCache.model === 'models/' + targetModel && 
        new Date(activeCache.expires).getTime() > Date.now() + 60000 // has at least 1 min remaining
    ) {
      console.log("Reusing active context cache:", activeCache.name);
      
      // Fire-and-forget: Extend the cache TTL on Gemini server so it stays alive, preventing expiration
      extendGeminiCacheTTL(apiKeyToUse, activeCache.name).then(() => {
        // Update local expires timestamp to prevent redundant calls
        setActiveCache(prev => prev ? {
          ...prev,
          expires: new Date(Date.now() + 3600000).toISOString() // reset to +1 hour locally
        } : null);
      }).catch(err => console.warn("Failed to extend TTL:", err));

      return activeCache.name;
    }

    console.log("Creating new Gemini context cache for pinned reference documents...");
    try {
      const cacheInfo = await createGeminiCache(apiKeyToUse, combinedContent, targetModel);
      
      setActiveCache({
        name: cacheInfo.name,
        expires: cacheInfo.expires,
        model: cacheInfo.model,
        textHash: contentHash
      });
      setIsFreeTierRestriction(false);
      
      console.log("Context cache created successfully:", cacheInfo.name, "expires at:", cacheInfo.expires);
      return cacheInfo.name;
    } catch (err) {
      console.warn("Failed to create context cache, will fall back to direct context prompt injection:", err);
      setIsFreeTierRestriction(true);
      return null;
    }
  };

  const handleTogglePinDocument = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening/selecting the doc
    setPinnedDocIds(prev => {
      const next = prev.includes(docId) 
        ? prev.filter(id => id !== docId) 
        : [...prev, docId];
      localStorage.setItem('gemini_analysis_pinned_doc_ids', JSON.stringify(next));
      return next;
    });
  };

  const handleUnpinAllDocuments = () => {
    setPinnedDocIds([]);
    localStorage.removeItem('gemini_analysis_pinned_doc_ids');
    setActiveCache(null); // invalidate caching context locally too
  };

  // Chat Histories key format: `${docId}-${personaId}`
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const activePersona = MOCK_PERSONAS[0];

  // Loading States
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);
  const [showAnalysisCompletedToast, setShowAnalysisCompletedToast] = useState(false);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

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
  // For analysis views (individual / team), force fallback to a CSV if activeDocId points to a PDF
  const resolvedDocId = (() => {
    if (activeView === 'individual' || activeView === 'team') {
      if (!activeDocId) return 'doc-pitching';
      const doc = documents.find(d => d.id === activeDocId);
      const isCsv = doc?.fileName.toLowerCase().endsWith('.csv') || activeDocId === 'doc-pitching' || activeDocId === 'doc-batting';
      if (isCsv) return activeDocId;
      
      // Find the first available CSV document as fallback
      const firstCsv = documents.find(d => 
        d.fileName.toLowerCase().endsWith('.csv') || 
        d.id === 'doc-pitching' || 
        d.id === 'doc-batting'
      );
      return firstCsv ? firstCsv.id : 'doc-pitching';
    }
    return activeDocId;
  })();

  const resolvedDocument = documents.find(doc => doc.id === resolvedDocId) || null;
  const activeDocument = documents.find(doc => doc.id === activeDocId) || null;
  const activeSheetData = resolvedDocId ? (analysisSheets[resolvedDocId] || null) : null;
  
  // Get active chat log
  const chatKey = activeDocId ? `${activeDocId}-${activePersona.id}` : '';
  const currentMessages = chatKey ? (chatHistories[chatKey] || []) : [];

  // Trigger analysis for a document
  const runAnalysis = async (docId: string, content: string) => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);

    // Smooth pseudo-progress incrementer for the AI analysis stage
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      if (currentProgress < 95) {
        const step = Math.max(1, Math.round((95 - currentProgress) * 0.15));
        currentProgress += step;
        setAnalysisProgress(currentProgress);
      }
    }, 250);

    try {
      let finalContent = content;

      // Detect if this session belongs to hand-throw/tee batting only
      let isHandThrowOnly = false;
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
            
            // Check if all types belong to hand-throw/tee batting
            isHandThrowOnly = playersData.every(player => 
              player.rows.every(row => {
                const typeLower = row.type.toLowerCase();
                return typeLower.includes('手投げ') || typeLower.includes('置きt') || typeLower.includes('トス') || typeLower.includes('tee');
              })
            );
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
        // If there is an active comparison document for this docId, merge it for comparative AI analysis
        const compDocId = compareDocIds[docId];
        if (compDocId) {
          const compareDoc = documents.find(d => d.id === compDocId);
          if (compareDoc) {
            finalContent = `【最新の測定データ（今回のセッション）】\n${finalContent}\n\n【前回の測定データ（比較対象）】\n${compareDoc.content}`;
          }
        }
      }

      if (apiKey) {
        // Fetch or create context cache for pinned reference documents
        const bestModel = await getBestSupportedModel(apiKey).catch(() => 'gemini-1.5-flash');
        const cacheName = await getOrUpdateContextCache(apiKey, bestModel);

        let finalContentWithFallback = finalContent;
        if (!cacheName) {
          // Fallback: If cache was not created (e.g. content too small, or error),
          // we prepend reference papers directly to the analysis prompt
          const combinedPinned = getCombinedPinnedContent();
          if (combinedPinned) {
            finalContentWithFallback = `${combinedPinned}\n\n上記バイオメカニクス資料・論文を踏まえた上で、以下のデータを解析してください。\n\n${finalContent}`;
          }
        }

        // Run real analysis using Gemini API with hand-throw restriction flag and context cache
        const analyzed = await analyzeDocument(finalContentWithFallback, apiKey, isHandThrowOnly, cacheName || undefined);

        // If cache was used, increment the saved tokens counter
        if (cacheName) {
          const saved = getPinnedTokensCount();
          if (saved > 0) {
            setSavedTokensCount(prev => {
              const next = prev + saved;
              localStorage.setItem('gemini_analysis_saved_tokens_count', next.toString());
              return next;
            });
          }
        }

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

      // Success completion
      clearInterval(progressInterval);
      setAnalysisProgress(100);
      setShowAnalysisCompletedToast(true);
      setTimeout(() => {
        setAnalysisProgress(null);
        setShowAnalysisCompletedToast(false);
      }, 2000);

    } catch (error: any) {
      clearInterval(progressInterval);
      setAnalysisProgress(null);
      alert(error.message || "解析中にエラーが発生しました。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Upload multiple files handler
  const handleUploadFiles = async (files: FileList | File[]) => {
    const hasCsv = Array.from(files).some(f => f.name.toLowerCase().endsWith('.csv'));
    const hasPdf = Array.from(files).some(f => !f.name.toLowerCase().endsWith('.csv'));
    
    setIsProcessing(true);
    setUploadProgress(0);
    if (hasCsv) setIsUploadingCsv(true);
    if (hasPdf) setIsUploadingPdf(true);

    const loadedDocs: DocumentItem[] = [];
    const newHittingPlayers: Record<string, HittingPlayer[]> = {};
    const newPitchingPlayers: Record<string, PitchingPlayer[]> = {};
    const newSelectedPlayerNames: Record<string, string> = {};

    try {
      const totalFiles = files.length;
      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        let text = '';
        let csvRaw = '';
        
        // Base progress for starting this file
        const progressBase = Math.round((i / totalFiles) * 100);
        setUploadProgress(progressBase);
        
        if (file.name.endsWith('.pdf')) {
          text = await extractTextFromPdf(file, (pdfPercent) => {
            const overallPercent = Math.round(((i + (pdfPercent / 100)) / totalFiles) * 100);
            setUploadProgress(Math.min(99, overallPercent));
          });
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
      
      // Select the first imported CSV document as active if any CSV was uploaded
      const csvDoc = loadedDocs.find(doc => doc.fileName.toLowerCase().endsWith('.csv'));
      if (csvDoc) {
        setActiveDocId(csvDoc.id);
        setActiveView('individual');
      } else {
        // If only PDFs or research text files were uploaded, do not clear or switch the current CSV analysis sheet.
        // Instead, stay on files view to show success.
        setActiveView('files');
      }

      // Trigger analysis sequentially ONLY for imported CSV files
      const csvDocs = loadedDocs.filter(doc => doc.fileName.toLowerCase().endsWith('.csv'));
      const totalCsvs = csvDocs.length;
      for (let cIdx = 0; cIdx < totalCsvs; cIdx++) {
        const doc = csvDocs[cIdx];
        const analysisPercent = Math.round((cIdx / totalCsvs) * 100);
        setUploadProgress(analysisPercent);
        await runAnalysis(doc.id, doc.content);
      }

    } catch (error: any) {
      alert(error.message || "ファイルの処理中にエラーが発生しました。");
    } finally {
      setIsProcessing(false);
      setIsUploadingCsv(false);
      setIsUploadingPdf(false);
      setUploadProgress(null);
    }
  };

  // Add text directly
  const handleAddText = async (title: string, text: string) => {
    // Normalize consecutive spaces and carriage returns to save tokens
    const normalizedText = text
      .replace(/[ \t]+/g, ' ')
      .replace(/\r?\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      title,
      fileName: 'direct_input.txt',
      fileType: 'text',
      content: normalizedText,
      uploadedAt: new Date().toLocaleString('ja-JP', { hour12: false }).substring(0, 16)
    };

    if (isSupabaseConfigured) {
      await saveDocument(newDoc).catch(err => console.error("Error saving document:", err));
    }

    setDocuments(prev => [newDoc, ...prev]);
    setActiveDocId(newDoc.id);
    setActiveView('individual');

    // Auto trigger analysis
    await runAnalysis(newDoc.id, normalizedText);
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
      setPinnedDocIds(prev => {
        const next = prev.filter(id => id !== docId);
        localStorage.setItem('gemini_analysis_pinned_doc_ids', JSON.stringify(next));
        return next;
      });
      
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
        // Fetch or create context cache for pinned reference documents
        const bestModel = await getBestSupportedModel(apiKey).catch(() => 'gemini-1.5-flash');
        const cacheName = await getOrUpdateContextCache(apiKey, bestModel);

        let finalDocContent = activeDocument.content;
        if (!cacheName) {
          // Fallback: append reference papers directly as background context to docContent
          const combinedPinned = getCombinedPinnedContent();
          if (combinedPinned) {
            finalDocContent = `${combinedPinned}\n\n=== 選手/測定データ ===\n${activeDocument.content}`;
          }
        }

        // Real Gemini coach chat
        const responseText = await chatWithCoach(
          finalDocContent,
          currentMessages,
          messageText,
          activePersona.systemPrompt,
          apiKey,
          cacheName || undefined
        );

        // If cache was used, increment the saved tokens counter
        if (cacheName) {
          const saved = getPinnedTokensCount();
          if (saved > 0) {
            setSavedTokensCount(prev => {
              const next = prev + saved;
              localStorage.setItem('gemini_analysis_saved_tokens_count', next.toString());
              return next;
            });
          }
        }
        
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
          reply = "（デモモード回答）\nAI Technical Coachです。「縦の変化量（Vertical Break/ホップ成分）」について解説します。\n物理的には、ボールが重力によって自然に落下する軌道と比較して、空気抵抗（マグヌス効果による揚力）によってどれだけ上方向にホップしたかを示す数値です。\nストレートでこの数値が大きくプラスになると、打者は「ボールが浮き上がる」ように錯覚し、高めでの空振りを奪いやすくなります。リリースでのボールへの効率的な回転伝達が影響すると理論的に言われています。";
        } else if (isEff) {
          reply = "（デモモード回答）\nAI Technical Coachです。「回転効率（スピンエフィシエンシー）」ですね。\nこれは総回転数のうち、ボールを変化させる力（揚力）に有効に働いているバックスピン/トップスピン等の比率です。\nストレートでは100%に近いほどホップ成分が最大化されますが、スライダーやカットボール等の変化球では、回転効率があえて低く（ジャイロ成分が多く）なることで、バッターの手元で鋭く曲がり落ちる独特な軌道が生まれます。「回転効率が低い＝悪い」ではなく、球種ごとの目的（空振りを取るのか、ゴロを打たせるのか）に合わせて数値をデザインすることが重要です。";
        } else if (isGyro) {
          reply = "（デモモード回答）\nAI Technical Coachです。「ジャイロ角度」について解説します。\nボールの進行方向ベクトルと回転軸ベクトルのなす角度です。この角度が大きいほど（ジャイロ成分が多いほど）、揚力（ボールを浮き上がらせたり曲げたりする力）は小さくなります。\nストレートではジャイロ角度を0度に近づけることでノビが出ますが、カットボールやスライダー、フォーク等ではジャイロ角度があることで球速が維持され、打者の手元での鋭い変化（軌道のズレ）を生み出します。選手の狙いに応じて前向きに評価すべき指標です。";
        } else if (isAdjust) {
          reply = "（デモモード回答）\nAI Technical Coachです。「アジャスト率」について解説します。\nボールの進入軌道に対して、バットのスイングプレーン（面）がいかに長く合致したかを示す指標です。これが高ければ高いほど、インパクトのタイミングが多少ズレても芯で捉える確率が上がります。\nレベルスイングやスイング起動の安定が、このアジャスト率を向上させる要因として科学的論文でも言及されています。";
        } else if (isAttack) {
          reply = "（デモモード回答）\nAI Technical Coachです。「進入角度（アタックアングル）」ですね。\nボールのインパクト時の水平面に対するスイング角度です。一般的に投球の入射角（約-6度）に対し、アタックアングルが+6〜+12度の緩やかなアッパー軌道で衝突すると、打球速度と角度の組み合わせが「バレルゾーン」に入りやすく、長打の確率が統計的に最大化されます。打者それぞれのスイングスタイルと理想の打球特性に合わせて調整します。";
        } else {
          reply = `（デモモード回答）\nAI Technical Coachです。「${messageText}」についてのご質問ですね。\n映像データがないためフォームの直接的な指摘はできませんが、アップロードされた学術論文の知見と測定データのファクトを紐付け、データに基づいて客観的なメカニズムや次のステップを論理的・前向きにご提案いたします。具体的な球種や課題についてさらにお知らせください。\n\n※ Gemini API キーを設定すると、本物のAIデータコーチがあなたの質問に科学的かつ的確に個別フィードバックを行います。`;
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



  // Determine doc type consistently based on active document properties
  const isHitting = resolvedDocument
    ? (resolvedDocument.id.includes('hitting') || 
       resolvedDocument.title.includes('打撃') || 
       resolvedDocument.id.includes('batting') || 
       resolvedDocument.fileName.toLowerCase().includes('hitting') ||
       resolvedDocument.fileName.toLowerCase().includes('batting'))
    : false;

  // Handlers for individual players selection
  const activePlayersList = resolvedDocId 
    ? (isHitting
      ? (hittingPlayers[resolvedDocId] || []).map((p: HittingPlayer) => p.name)
      : (pitchingPlayers[resolvedDocId] || []).map((p: PitchingPlayer) => p.name)
      )
    : [];

  const currentSelectedPlayer = resolvedDocId ? (selectedPlayerNames[resolvedDocId] || '') : '';

  const activeHittingPlayerData = (isHitting && resolvedDocId)
    ? (hittingPlayers[resolvedDocId] || []).find((p: HittingPlayer) => p.name === currentSelectedPlayer) || null
    : null;

  const activePitchingPlayerData = (!isHitting && resolvedDocId)
    ? (pitchingPlayers[resolvedDocId] || []).find((p: PitchingPlayer) => p.name === currentSelectedPlayer) || null
    : null;

  // Active Team Name
  const activeTeamName = resolvedDocument ? getTeamNameFromFileName(resolvedDocument.fileName) : '';
  const activeCompareDocId = resolvedDocId ? (compareDocIds[resolvedDocId] || '') : '';

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
              document={resolvedDocument}
              sheetData={activeSheetData}
              onSaveSheet={(updatedData) => {
                if (resolvedDocId) {
                  setAnalysisSheets(prev => ({ ...prev, [resolvedDocId]: updatedData }));
                  if (isSupabaseConfigured) {
                    saveAnalysisSheet(resolvedDocId, updatedData).catch(err => console.error("Error saving analysis sheet:", err));
                  }
                }
              }}
              isAnalyzing={isAnalyzing}
              analysisProgress={analysisProgress}
              onReanalyze={handleReanalyze}
              isHitting={isHitting}
              players={activePlayersList}
              selectedPlayer={currentSelectedPlayer}
              onSelectPlayer={handleSelectPlayer}
              hittingPlayerData={activeHittingPlayerData}
              pitchingPlayerData={activePitchingPlayerData}
              onSavePlayerStats={handleSavePlayerStats}
              allPitchingPlayers={resolvedDocId ? pitchingPlayers[resolvedDocId] : []}
              allHittingPlayers={resolvedDocId ? hittingPlayers[resolvedDocId] : []}
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
              document={resolvedDocument}
              sheetData={activeSheetData}
              onSaveSheet={(updatedData) => {
                if (resolvedDocId) {
                  setAnalysisSheets(prev => ({ ...prev, [resolvedDocId]: updatedData }));
                  if (isSupabaseConfigured) {
                    saveAnalysisSheet(resolvedDocId, updatedData).catch(err => console.error("Error saving analysis sheet:", err));
                  }
                }
              }}
              isAnalyzing={isAnalyzing}
              analysisProgress={analysisProgress}
              onReanalyze={handleReanalyze}
              isHitting={isHitting}
              players={activePlayersList}
              selectedPlayer={currentSelectedPlayer}
              onSelectPlayer={handleSelectPlayer}
              hittingPlayerData={activeHittingPlayerData}
              pitchingPlayerData={activePitchingPlayerData}
              onSavePlayerStats={handleSavePlayerStats}
              allPitchingPlayers={resolvedDocId ? pitchingPlayers[resolvedDocId] : []}
              allHittingPlayers={resolvedDocId ? hittingPlayers[resolvedDocId] : []}
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
                    isUploadingCsv={isUploadingCsv}
                    isUploadingPdf={isUploadingPdf}
                    uploadProgress={uploadProgress}
                    onDeleteDocument={handleDeleteDocument}
                    pinnedDocIds={pinnedDocIds}
                    onTogglePinDocument={handleTogglePinDocument}
                    pinnedTokensCount={getPinnedTokensCount()}
                    savedTokensCount={savedTokensCount}
                    isCacheActive={!!activeCache && pinnedDocIds.length > 0 && new Date(activeCache.expires).getTime() > Date.now()}
                    isFreeTierRestriction={isFreeTierRestriction}
                    onUnpinAllDocuments={handleUnpinAllDocuments}
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

      {/* Background Analysis Progress Floating Indicator & Completed Toast */}
      {analysisProgress !== null && (
        <div className="floating-progress-container glass-panel" style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          padding: '16px 20px',
          borderRadius: '12px',
          width: '320px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(12px)',
          background: 'rgba(15, 23, 42, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="spinner pulse-glow" style={{ width: '18px', height: '18px', borderWidth: '2px', borderColor: '#3b82f6 transparent #3b82f6 transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                AIコーチがバックグラウンドで分析中...
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                他の画面を操作していても処理は継続されます
              </div>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3b82f6' }}>{analysisProgress}%</span>
          </div>
          <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${analysisProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
              borderRadius: '2px',
              transition: 'width 0.25s ease-out'
            }}></div>
          </div>
        </div>
      )}

      {showAnalysisCompletedToast && (
        <div className="completed-toast-container glass-panel" style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          padding: '14px 20px',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(16, 185, 129, 0.2)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          backdropFilter: 'blur(12px)',
          background: 'rgba(6, 78, 59, 0.9)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#ecfdf5',
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '0.75rem',
            fontWeight: 'bold'
          }}>✓</div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>AI分析が完了しました！</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(236,253,245,0.7)', marginTop: '1px' }}>
              「チーム全体 AIコーチ分析」から結果を確認できます
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
