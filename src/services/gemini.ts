import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AnalysisSheetData } from '../mockData';

let cachedModels: string[] | null = null;
let lastUsedApiKey: string | null = null;

/**
 * Returns a prioritized list of supported Gemini model names for the API key.
 * Dynamically queries the API on first load and caches the result for subsequent access.
 */
export async function getSupportedModelsOrdered(apiKey: string): Promise<string[]> {
  const defaultList = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
  
  if (cachedModels && lastUsedApiKey === apiKey) {
    return cachedModels;
  }
  
  lastUsedApiKey = apiKey;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      cachedModels = defaultList;
      return defaultList;
    }
    
    const data = await response.json();
    if (data && Array.isArray(data.models)) {
      const models = data.models;
      const supportedModels = models
        .filter((m: any) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => m.name.replace(/^models\//, ''));

      console.log("Dynamically discovered supported models:", supportedModels);

      // Only allow stable text generation models to avoid preview/experimental errors
      const allowedModels = [
        'gemini-1.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash-8b',
        'gemini-1.5-pro'
      ];

      const ordered: string[] = [];
      for (const model of allowedModels) {
        if (supportedModels.includes(model)) {
          ordered.push(model);
        }
      }

      if (ordered.length > 0) {
        cachedModels = ordered;
        return ordered;
      }
    }
  } catch (error) {
    console.warn("Failed to fetch models dynamically, using fallback list:", error);
  }
  cachedModels = defaultList;
  return defaultList;
}


/**
 * Verifies the Gemini API key and returns the best supported model name.
 */
export async function getBestSupportedModel(apiKey: string): Promise<string> {
  const models = await getSupportedModelsOrdered(apiKey);
  return models[0] || 'gemini-1.5-flash';
}

export interface GeminiCacheInfo {
  name: string;
  expires: string;
  model: string;
}

/**
 * Creates a Gemini Context Cache using the REST API.
 * The model name must be a versioned model (e.g., gemini-1.5-flash-001).
 */
export async function createGeminiCache(
  apiKey: string,
  content: string,
  modelName: string
): Promise<GeminiCacheInfo> {
  // Ensure the model is a versioned caching-supported model
  let targetModel = 'models/gemini-1.5-flash-001';
  if (modelName.includes('pro')) {
    targetModel = 'models/gemini-1.5-pro-001';
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: targetModel,
      contents: [
        {
          role: 'user',
          parts: [{ text: content }]
        }
      ],
      ttl: '3600s', // 1 hour TTL
      displayName: 'baseball_analysis_pinned_docs_cache'
    })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const errorMsg = errorBody.error?.message || response.statusText;
    throw new Error(`Failed to create context cache: ${errorMsg}`);
  }

  const data = await response.json();
  return {
    name: data.name,
    expires: data.expireTime,
    model: targetModel
  };
}

/**
 * Extends the TTL of an existing Gemini Context Cache using the PATCH API.
 */
export async function extendGeminiCacheTTL(
  apiKey: string,
  cacheName: string
): Promise<void> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${cacheName}?key=${apiKey}&updateMask=ttl`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ttl: '3600s' // extend for another 1 hour
      })
    });
    
    if (response.ok) {
      console.log(`Successfully extended TTL for context cache: ${cacheName}`);
    } else {
      console.warn(`Failed to extend TTL for cache ${cacheName}:`, response.statusText);
    }
  } catch (error) {
    console.warn(`Failed to extend TTL for cache ${cacheName}:`, error);
  }
}

/**
 * Analyzes the text content of a document and returns a structured analysis sheet.
 * Tries multiple models sequentially if quota limit (429) or other API errors occur.
 * 
 * @param content Extracted document text
 * @param apiKey Gemini API Key
 * @param isHandThrowOnly Whether this session contains hand-thrown batting data only
 * @param cacheName Optional cached content resource name
 * @returns Structured AnalysisSheetData
 */
export async function analyzeDocument(
  content: string,
  apiKey: string,
  isHandThrowOnly: boolean = false,
  cacheName?: string
): Promise<AnalysisSheetData> {
  const modelNames = await getSupportedModelsOrdered(apiKey);
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const prompt = `あなたは極めて優秀なプロ野球のテクニカルコーチおよびバイオメカニクスアナリストです。
提示されたRapsodo（ラプソード）の測定データ（球速、回転数、回転効率、変化量、打球速度、打撃データなど）を詳細に読み込み、客観的かつ物理・動作理論に基づいた「選手用データ分析シート」を作成してください。

返されるデータは必ず、以下のJSONキーを持つ有効なJSONオブジェクトでなければなりません。余計なマークダウン装飾（\`\`\`json など）を一切含めず、純粋なJSON文字列として返してください。

【重要な指示ルール（厳守）】
1. 【でっち上げ（嘘）の完全禁止】：
   - 動画や映像が存在しないため、ボールの軌道に対するバッターのフォームや打ち方（例：腰が開いている、ひじが下がっているなど）、あるいは「インコースのボールに対する反応」「アウトコースのスイング遅れ」など、提示データに直接現れていないコース別・コース傾向の憶測による技術指導やハルシネーションは絶対に書かないでください。
   - ${isHandThrowOnly ? `※【超重要・絶対厳守】この測定セッションは「手投げ/置きT/トス」形式であるため、実戦のコース配球（内角、外角、インコース、アウトコース、高め、低め、コース別など）は存在せず、データも無意味です。分析結果のいかなる場所（総合評価、強み、改善点、練習メニュー、キー指標など全て）においても、「内角」「外角」「インコース」「アウトコース」「高め」「低め」という言葉および配球コース・高低に関する概念を「絶対」に使用しないでください。「内角高めに対する打撃」や「外角球に対する軌道」といった記述は厳禁です。単にバットとボールの物理的な衝突データ（アジャスト率、バット速度、打球角度、アタックアングル、飛距離）のみに集中してください。` : `測定形式が「手投げ/トス/置きT」などの手投げ測定（打撃データ）の場合、投手の球速や対戦投手、実戦形式のコース（インコース、アウトコース、高め、低めなど）に関する言及は絶対にしないでください。単にバットとボールの衝突データ（アジャスト率、バット速度、打球角度）のみに集中してください。`}
   - 前回セッションの比較用データ（前回セッション、過去の測定データ等）が提示されている場合は、最新のデータと前回のデータを各項目で比較し、数値の推移（向上した点、依然として残る課題など）を成長軌道として客観的に分析してください。比較データが提示されていない（またはすべて 0 や空欄など）場合は、勝手に前回との比較（「前回に比べて向上した」「前回の課題が改善された」など）を絶対にしないでください。現在のセッションの数値データのみに基づいた客観的フィードバックを行ってください。
2. 分析シートに表示欄がないため、AI分析のすべての文章において「リリースポイント（リリース位置の高さ・左右）」に関する言及は一切行わないでください（CSVデータに含まれていても言及は不要です）。リリースに関する言及をする場合は、分析シート上にある「リリース発射角度（縦/横）」や、そこから派生するボールの変化軌道・変化量にのみ集中してください。
3. 総合評価（summary）は、単に「クイックタイムがどう」といった特定の部分的数値に偏るのではなく、測定データ全体（球速帯、回転効率、球種ごとの変化量バランス、または長打を狙える打球速度・角度の再現性など）を多角的に網羅した、客観的かつ中身の濃い深く詳細な総括（3文程度）を記述してください。

JSONキーの説明：
- "summary": セッション全体の多角的な総括、または現在の技術的パフォーマンスの核心を突く具体的で中身の濃い総合評価（3文程度）。前回データが無い場合は前回比較に一切触れないこと。
- "keyMetrics": 投球または打撃における主要な測定指標（例：球種ごとの球速、回転数、回転効率、変化量、または打球の平均/最大初速、角度、飛距離、スピン量など）を要約して整理した文字列。
- "mechanics": リリース発射角度（縦・横）と回転効率（スピンエフィシエンシー）や変化軌道、またはバットの進入角度（アタックアングル）や打撃面など、物理的・動作学的な分析。
- "strengths": 今回の測定で際立って優秀な数値、あるいは前回のセッションから特に向上した強み（前回データが無い場合は「特に向上した〜」ではなく純粋な強みのみを記述）。
- "improvements": 回転軸のズレ（ジャイロ成分）、ボールがシュート方向に抜ける問題、打球角度の低さ、バックスピン過多による飛距離ロスなど、修正すべき技術的課題。
- "trainingPlan": 技術課題を改善し測定数値を向上させるための、具体的な練習方法や修正ドリル（箇条書きで複数）。

分析対象の資料テキスト：
"""
${content}
"""`;

  let lastError: any = null;

  for (const modelName of modelNames) {
    try {
      let finalModelName = modelName;
      if (cacheName) {
        if (modelName.includes('pro')) {
          finalModelName = 'gemini-1.5-pro-001';
        } else {
          finalModelName = 'gemini-1.5-flash-001';
        }
      }

      console.log(`Analyzing baseball data with Gemini model: ${finalModelName}${cacheName ? ' (using cache)' : ''}`);
      const model = genAI.getGenerativeModel({
        model: finalModelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        }
      });
      
      // Promise race to enforce 60s timeout reliably
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`API request timed out after 60 seconds`)), 60000)
      );

      const generatePromise = (async () => {
        let result;
        if (cacheName) {
          result = await model.generateContent({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }]
              }
            ],
            cachedContent: cacheName
          });
        } else {
          result = await model.generateContent(prompt);
        }
        return result.response.text();
      })();

      const responseText = await Promise.race([generatePromise, timeoutPromise]);
      
      // Parse the JSON output
      const rawData = JSON.parse(responseText.trim());
      
      // Helper to ensure values are strings (joins arrays with newlines if needed)
      const ensureString = (val: any): string => {
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) {
          return val.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('\n');
        }
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      };

      // Clean course-related hallucinations from text
      const cleanHalucinations = (text: string): string => {
        if (!text) return "";
        let cleaned = text;
        
        // Always apply simple replacements
        const replacements = [
          { pattern: /内角高め/g, replacement: "芯で捉えた球" },
          { pattern: /内角低め/g, replacement: "芯で捉えた球" },
          { pattern: /外角高め/g, replacement: "芯で捉えた球" },
          { pattern: /外角低め/g, replacement: "芯で捉えた球" },
          { pattern: /内角球/g, replacement: "ミートできた球" },
          { pattern: /外角球/g, replacement: "ミートできた球" },
          { pattern: /インコース/g, replacement: "スイング軌道上のコース" },
          { pattern: /アウトコース/g, replacement: "スイング軌道上のコース" },
          { pattern: /内角/g, replacement: "捉えたボール" },
          { pattern: /外角/g, replacement: "アジャストしたボール" },
          { pattern: /インサイドアウト/g, replacement: "滑らかなスイング軌道" },
          { pattern: /コース別/g, replacement: "打球別" },
          { pattern: /腰が開いている/g, replacement: "インパクトの瞬間に" },
          { pattern: /ひじが下がっている/g, replacement: "スイング軌道において" },
        ];
        
        if (isHandThrowOnly) {
          replacements.push(
            { pattern: /コース/g, replacement: "打球ゾーン" },
            { pattern: /インサイド/g, replacement: "スイング軌道" },
            { pattern: /アウトサイド/g, replacement: "スイング軌道" }
          );
        }

        for (const item of replacements) {
          cleaned = cleaned.replace(item.pattern, item.replacement);
        }
        return cleaned;
      };

      // Normalize snake_case keys from AI to camelCase expected by the app
      const parsedData: AnalysisSheetData = {
        summary: cleanHalucinations(ensureString(rawData.summary || rawData.summary_text)),
        keyMetrics: cleanHalucinations(ensureString(rawData.keyMetrics || rawData.key_metrics || rawData.metrics)),
        mechanics: cleanHalucinations(ensureString(rawData.mechanics || rawData.mechanics_analysis)),
        strengths: cleanHalucinations(ensureString(rawData.strengths || rawData.strength)),
        improvements: cleanHalucinations(ensureString(rawData.improvements || rawData.improvement)),
        trainingPlan: cleanHalucinations(ensureString(rawData.trainingPlan || rawData.training_plan || rawData.plan))
      };

      // Validation: If major contents are empty, treat as generation failure to fall back to next model
      if (!parsedData.summary.trim() && !parsedData.keyMetrics.trim() && !parsedData.mechanics.trim()) {
        throw new Error("AI returned empty or invalid analysis structure (missing major keys).");
      }

      return parsedData;
    } catch (error: any) {
      console.warn(`Gemini model ${modelName} analysis failed. Trying next model. Error:`, error);
      lastError = error;
    }
  }

  console.error("All Gemini models failed for document analysis. Last error:", lastError);
  const apiErrorMsg = lastError?.message || lastError?.toString() || "Unknown error";
  throw new Error(`AIによる野球データ解析に失敗しました。利用可能なすべてのAIモデルでクォータ制限またはエラーが発生しました。\n\n詳細エラー: ${apiErrorMsg}\n\n時間をおいて再試行するか、APIキーをご確認ください。`);
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

/**
 * Handles chat communication between the user and the selected AI Coach persona.
 * Tries multiple models sequentially if quota limit (429) or other API errors occur.
 * 
 * @param docContent The context document text
 * @param history Previous message history
 * @param userMessage New message from user
 * @param systemPrompt Character prompt for the coach
 * @param apiKey Gemini API Key
 * @param cacheName Optional cached content resource name
 * @returns AI Coach response string
 */
export async function chatWithCoach(
  docContent: string,
  history: ChatMessage[],
  userMessage: string,
  systemPrompt: string,
  apiKey: string,
  cacheName?: string
): Promise<string> {
  const modelNames = await getSupportedModelsOrdered(apiKey);
  const genAI = new GoogleGenerativeAI(apiKey);

  // Prepare context block
  const documentContext = `【分析対象資料】
"""
${docContent}
"""`;

  // Keep only the last 8 messages (4 turns) of the prior chat history to save tokens
  const maxHistoryTurns = 8;
  const slicedHistory = history.length > maxHistoryTurns 
    ? history.slice(history.length - maxHistoryTurns) 
    : history;

  // Start chat with history
  const formattedHistory = [
    {
      role: 'user',
      parts: [{ text: `${documentContext}\n\n上記の資料を基に対話を開始します。私のメッセージに対してフィードバックをしてください。` }]
    },
    {
      role: 'model',
      parts: [{ text: '理解しました。提示された資料の内容を完全に把握しました。設定されたペルソナとして、資料に基づいた高度なコーチング・フィードバックを提供します。' }]
    },
    // Convert sliced prior history (skipping context init)
    ...slicedHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }))
  ];

  let lastError: any = null;

  for (const modelName of modelNames) {
    try {
      let finalModelName = modelName;
      if (cacheName) {
        if (modelName.includes('pro')) {
          finalModelName = 'gemini-1.5-pro-001';
        } else {
          finalModelName = 'gemini-1.5-flash-001';
        }
      }

      console.log(`Chatting with Gemini model: ${finalModelName}${cacheName ? ' (using cache)' : ''}`);
      const model = genAI.getGenerativeModel({
        model: finalModelName,
        systemInstruction: `${systemPrompt}
    
* あなたはユーザーが提供した「分析対象資料」のコンテキストを完全に把握しています。
* ユーザーとの会話においては、必ずこの資料` + '의' + ` 記述や背景を考慮に入れつつ、あなたの設定されたペルソナ（口調、性格、役割）に従ってフィードバックを行ってください。
* もし資料と無関係な日常会話を振られた場合でも、可能な限り資料の知見やその応用に関連付けた展開に引き込んでください。`
      });

      // Promise race to enforce 60s timeout reliably
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Chat request timed out after 60 seconds`)), 60000)
      );

      const sendPromise = (async () => {
        if (cacheName) {
          // If context caching is active, we bypass stateful startChat and use stateless generateContent
          const result = await model.generateContent({
            contents: [...formattedHistory, { role: 'user', parts: [{ text: userMessage }] }],
            cachedContent: cacheName
          });
          return result.response.text();
        } else {
          const chat = model.startChat({
            history: formattedHistory,
            generationConfig: {
              temperature: 0.7,
            }
          });
          const result = await chat.sendMessage(userMessage);
          return result.response.text();
        }
      })();

      return await Promise.race([sendPromise, timeoutPromise]);
    } catch (error: any) {
      console.warn(`Gemini model ${modelName} chat failed. Trying next model. Error:`, error);
      lastError = error;
    }
  }

  console.error("All Gemini models failed for coach chat. Last error:", lastError);
  const apiErrorMsg = lastError?.message || lastError?.toString() || "Unknown error";
  throw new Error(`AIコーチとの通信に失敗しました。利用可能なすべてのAIモデルでクォータ制限またはエラーが発生しました。\n\n詳細エラー: ${apiErrorMsg}`);
}
