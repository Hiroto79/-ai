import type { HittingPlayer, PitchingPlayer } from './services/csvParser';

export interface DocumentItem {
  id: string;
  title: string;
  fileName: string;
  fileType: 'pdf' | 'text';
  content: string;
  uploadedAt: string;
}

export interface AnalysisSheetData {
  summary: string;
  keyMetrics: string;
  mechanics: string;
  strengths: string;
  improvements: string;
  trainingPlan: string;
}

export interface CoachPersona {
  id: string;
  name: string;
  role: string;
  avatar: string;
  description: string;
  systemPrompt: string;
  initialMessage: string;
}

export const MOCK_PERSONAS: CoachPersona[] = [
  {
    id: 'headcoach',
    name: '黒木 監督',
    role: '昭和学院 元プロ技術指導者',
    avatar: '⚾',
    description: 'フォームの崩れやボールの回転軸のズレなど、バイオメカニクスの観点から妥協のない技術指導を行います。甲子園出場・プロ志向 of 選手向けの厳しい指導です。',
    systemPrompt: `あなたは昭和学院高校野球部の特別技術顧問「黒木監督」です。元プロ選手で、データに基づくバイオメカニクス指導を得意とします。
ユーザーが提示する昭和学院のRapsodo測定データ（チーム全体の打撃・投球データ）に対し、以下のトーンで対話します。
- 技術に妥協せず、感覚論ではなく「回転効率」「変化量」「進入角度（アタックアングル）」といった物理的な数値に切り込みます。
- 「シミズのストレートは一線級だが、ミヤコは回転効率が78%と低くシュート回転で垂れているぞ」「打撃ではタカハシのバット速度は素晴らしいが、チーム平均のアジャスト率が低すぎる」など、名指しで具体的な数値を鋭く分析します。
- 丁寧な敬語ですが、毅然とした厳しい態度。しかし言葉の端々に選手たちの成長を強く望む情熱が溢れています。
- 「縦の変化量とは何か」などの測定用語の定義や動作的な意味、練習方法について質問された場合は、バイオメカニクスの観点（手首の角度、リリース時の指先の押し込みなど）から、厳しくも具体的に、中高生でも動作のイメージができるように身体の動かし方に落とし込んで解説してください。`,
    initialMessage: '昭和学院の6月測定データを確認したぞ。打撃・投球ともに個々の強みとチーム全体の大きな課題が浮き彫りになっている。まずはどちらの分析データから指導を始めようか？'
  },
  {
    id: 'mentor',
    name: 'エミリ コーチ',
    role: '温かい育成メンター',
    avatar: '🧢',
    description: 'チームの良い数値や選手それぞれの成長ポイントを見つけ出し、前向きな姿勢でやる気を引き出す優しい指導者です。',
    systemPrompt: `あなたは昭和学院高校野球部の「エミリコーチ」です。選手のポテンシャルを引き出し、主体的な練習意欲を高めるメンタリングを得意とします。
ユーザーが提示する昭和学院のデータに対し、以下のトーンで対話します。
- 非常に親しみやすくポジティブで、共感的な言葉遣い。
- 課題よりも、まず「清水くんの制球率100%と縦変化47.5cmは本当に素晴らしいですね！」「高橋くんのバット速度106.2km/hはチームの希望です！」といった好データ・成長箇所を最大に褒めちぎります。
- 選手たちのモチベーションを第一に考え、日頃の努力の成果を見つけるフィードバックを行います。
- 「縦の変化量とは何か」などの用語について質問された場合は、難しい物理用語は避け、「ボールがどれだけ重力でお辞儀せずにキャッチャーまで届くかということだよ！」「ボールの下をしっかり押し込めるとホップするよ！」といった感覚的・直感的な例えを用いて、優しく噛み砕いて解説してください。`,
    initialMessage: '測定お疲れ様でした！今回の昭和学院のデータ、本当に素晴らしいポテンシャルを秘めた選手がたくさんいますね！一緒に楽しく数値を読み解いていきましょう！'
  },
  {
    id: 'analyst',
    name: '橘 アナリスト',
    role: 'データ解析・セイバーメトリクス専門',
    avatar: '📊',
    description: 'ピッチデザイン（ホップ・スライド成分）やバレルゾーンの統計データに基づき、データを論理的に読み解いてチームの勝率を高める戦略を提案します。',
    systemPrompt: `あなたは昭和学院野球部専属のデータアナリスト「橘マサト」です。セイバーメトリクスとトラッキングシステム（Rapsodo）の専門家です。
ユーザーが提示する昭和学院のデータに対し、以下のトーンで対話します。
- 理路整然としており、客観的な数値をベースにした無駄のない話し方。
- ピッチデザイン（球速比、ホップ成分・スライド成分の適正値）や、バレルゾーン（打球速度158km/h以上、角度26〜30度）の統計データを重視します。
- チーム全体の課題を「改善インパクト」と「実行難易度」で整理し、超具体的なマイルストーンを提示します。
- 「結論から言うと、現在のチームデータから優先すべきアジェンダは3つあります。1つ目は...」のように構造化して話します。
- 「縦の変化量とは何か」などの用語や物理指標の意味について質問された場合は、まずその定義（重力による自由落下からの変化の差分など）を論理的に解説し、それが野球のパフォーマンス（空振り率やゴロ率など）にどう統計的・数値的に影響するのかを理路整然と解説してください。`,
    initialMessage: 'データアナリストの橘です。昭和学院の測定データを統計・バイオメカニクスの観点から解析します。チーム全体の得点力向上および失点率低下のためのロードマップを設計しましょう。'
  }
];

export const MOCK_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc-pitching',
    title: 'チーム投球分析 (昭和学院 2026.6)',
    fileName: '昭和学院_PITCHING_2026.6.txt',
    fileType: 'text',
    content: `昭和学院高校野球部 PITCHING測定結果レポート
計測日：2026年6月21日 (打者なし)

--- チーム全体平均データ (ストレートクイック時) ---
・右投手平均: 投球速度 121.4 km/h, 総回転数 1,891 rpm, リリース高さ 1.19 m
・左投手平均: 投球速度 111.2 km/h, 総回転数 1,722 rpm, リリース高さ 1.35 m

--- 選手別ストレート測定データ（抜粋） ---

1. シミズ (右投) - エース級のホップ成分
   - 投球速度: 平均 133.8 km/h (最大: 134.6 km/h)
   - 回転数: 平均 2,096 rpm, 回転効率: 98.7%
   - 変化量: 縦変化 46.9 cm (ホップ成分強), 横変化 27.1 cm (シュート成分)
   - 制球率: 100.0%

2. ミヤコ (右投) - 球速はあるが回転効率に課題
   - 投球速度: 平均 125.4 km/h (最大: 126.6 km/h)
   - 回転数: 平均 2,194 rpm, 回転効率: 73.1% (ジャイロ成分多め)
   - 変化量: 縦変化 36.3 cm, 横変化 15.1 cm
   - 制球率: 40.0%

3. ナカオ (左投) - 左の本格派
   - 投球速度: 平均 115.3 km/h (最大: 116.6 km/h)
   - 回転数: 平均 1,977 rpm, 回転効率: 78.5%
   - 変化量: 縦変化 28.9 cm, 横変化 -39.6 cm (大きく逃げる)
   - 制球率: 40.0%

4. ワケ (右投) - 技巧派サイド
   - 投球速度: 平均 114.3 km/h (最大: 117.0 km/h)
   - 回転効率: 91.2%, 縦変化 24.8 cm, 横変化 30.8 cm
   - 制球率: 60.0%`,
    uploadedAt: '2026-06-25 12:00'
  },
  {
    id: 'doc-batting',
    title: 'チーム打撃分析 (昭和学院 2026.6)',
    fileName: '昭和学院_HITTING_2026.6.txt',
    fileType: 'text',
    content: `昭和学院高校野球部 HITTING測定結果レポート
計測日：2026年6月21日 (手投げ/トス/置きT)

--- 選手別打撃測定データ（手投げ・トス時の平均/最大値） ---

1. タカハシ マサユキ - チームトップの長打力
   - 打球速度: 平均 130.8 km/h (最大: 145.8 km/h)
   - バット速度: 105.1 km/h (最大: 126.2 km/h)
   - 打球角度: 18.7 deg
   - アッパースイング度: 16.0 deg (長距離打者タイプ)
   - アジャスト率: 33.3%

2. アリタ ケンゴ - 安定したラインドライブヒッター
   - 打球速度: 平均 127.9 km/h (最大: 136.4 km/h)
   - バット速度: 102.7 km/h (最大: 106.1 km/h)
   - 打球角度: 17.9 deg
   - アッパースイング度: 11.0 deg (中距離打者タイプ)
   - アジャスト率: 50.0%

3. マツイ タクマ - コンタクト力とバット速度向上が課題
   - 打球速度: 平均 115.9 km/h (最大: 112.6 km/h)
   - バット速度: 87.2 km/h (最大: 89.3 km/h)
   - 打球角度: 15.0 deg
   - アッパースイング度: 13.0 deg
   - アジャスト率: 16.7%

4. ゾウメン ユウキ - 低い強い打球が特徴
   - 打球速度: 平均 134.0 km/h (最大: 133.8 km/h)
   - バット速度: 101.8 km/h (最大: 108.0 km/h)
   - 打球角度: 6.5 deg (低スピン・ライナー)
   - アッパースイング度: 7.0 deg (短距離打者タイプ)
   - アジャスト率: 50.0%`,
    uploadedAt: '2026-06-25 12:15'
  }
];

export const MOCK_ANALYSIS_SHEETS: Record<string, AnalysisSheetData> = {
  'doc-pitching': {
    summary: 'エース投手が球速（最大134.6km/h）、回転効率（98.7%）、縦変化（46.9cm）、制球率（100%）とすべての指標においてチームを牽引。しかし、全体として一部の主力投手を筆頭に回転効率の低さ（73.1%）と制球率（中堅平均40%前後）の低下が目立ち、空振りを奪える「ノビのあるストレート」と制球力の向上がチーム投手陣全体の急務である。',
    keyMetrics: '・右投手チーム平均: クイック球速 121.4 km/h, 総回転 1,891 rpm, リリース高 1.19 m\n・左投手チーム平均: クイック球速 111.2 km/h, 総回転 1,722 rpm, リリース高 1.35 m\n・エース投手: 平均 133.8 km/h, 回転効率 98.7%, 縦変化 46.9 cm, 横変化 27.1 cm, 制球率 100%\n・主力投手B: 平均 125.4 km/h, 回転効率 73.1%, 縦変化 36.3 cm, 横変化 15.1 cm, 制球率 40%',
    mechanics: 'エース投手はボールの下を正しく押し込めており、ホップ成分（縦変化46.9cm）が極めて優秀。一方、他の主力投手は回転数は2,194rpmとエースを上回るポテンシャルがありながら、回転効率が73.1%と低く、回転軸が傾いてジャイロ成分が発生。結果としてストレートがシュート気味（横変化15.1cm）に抜け、縦の変化が約10cmも小さくなっている。また、左投手陣はリリース窓が右投手より高め（1.35m）で、横の変化量（-39.6cm）を活かしたサイド・スライド軌道が特徴。',
    strengths: 'エース投手のホップするストレートと制球力の完成度は非常に高く、高めの空振りを高い確率で奪える。左投手陣の大きな横スライダー成分（横変化-39.6cm）は左打者の外角へ逃げる絶対的なボールとして有効。また、シンカー軌道の球種も低い回転数でブレーキが効いている。',
    improvements: '一部の控え投手陣の「球質の改善（回転効率の向上）」と「制球力（ストライク率）の改善」。特に一部の投手はリリースの瞬間に手首が寝て指先が外側に抜ける癖があり、これがシュート回転と制球力低下の主因。左投手陣も制球率40%付近を脱却し、安定して外角ゾーンへ投げ込めるメカニクスが必要。',
    trainingPlan: '1. 【回転効率の向上】指先2本でボールの回転軸を正しく垂直に弾く感覚を掴むため、重いボール（加重ボール）を用いたスロースロー調整を導入。\n2. 【制球率改善ドリル】リリースポイントの安定を目指し、下半身の踏み込み位置をマウンド上に固定するステップボード練習。\n3. 【ピッチデザイン】ストレートの軌道トンネルから大きく横に曲がるスライダー、沈むチェンジアップのリリースの一貫性をブルペンで測定・最適化する。'
  },
  'doc-batting': {
    summary: '最高打球速度 145.8km/h や 平均 134.0km/h など、強い打球を打てるスイング力を持つ選手がいる一方、チーム全体のアジャスト率（平均30%前後）の低さが最大の課題。アッパースイング度が大きい長距離タイプの選手は角度が出るがミート率が低く、短距離タイプの選手はアジャスト率は高いが角度が低いため、個々の適性に応じたスイング進入角の設計が必要。',
    keyMetrics: '・長距離打者タイプ平均: 平均打球速度 130.8 km/h, バット速度 105.1 km/h, 角度 18.7度, スイング角 16.0度, アジャスト 33.3%\n・中距離打者タイプ平均: 平均打球速度 127.9 km/h, バット速度 102.7 km/h, 角度 17.9度, スイング角 11.0度, アジャスト 50.0%\n・技術的課題のある選手平均: 平均打球速度 115.9 km/h, バット速度 87.2 km/h, 角度 15.0度, スイング角 13.0度, アジャスト 16.7%\n・低スピン・ライナー型平均: 平均打球速度 134.0 km/h, バット速度 101.8 km/h, 角度 6.5度, スイング角 7.0度, アジャスト 50.0%',
    mechanics: 'スイング起動時のアッパースイング度が大きい選手は、ボールの軌道の下を叩く傾向があり、これがアジャスト率の低さ（30%台）を招いている。逆にアッパースイング度が極めて小さい選手はボールを上から捉えすぎているため、打球初速は速いものの角度が上がらずゴロが多い。また、スイング全体のバット速度が80km/h台と不足している選手は、体幹主導の回転ができていないため、スイング時の腕の振りに頼って衝突効率が落ちている。',
    strengths: 'チームの上位打者は最大打球速度（145.8km/h）およびバット速度（126.2km/h）が非常に高く、低反発バットに対応できる高い身体能力を示している。また、アッパースイング角11度前後で安定しているレベルヒッターは、中距離打者として最も適した打撃軌道（角度17.9度・飛距離85m）を高いアジャスト率（50.0%）で実現している。',
    improvements: '1. スイング軌道が大きい打者は、スイング進入軌道と投球の入射角を合致させ、高めのボールに対するコンタクト力（アジャスト率）を高めること。\n2. 角度不足の打者は、スイング進入角度を+3〜5度高め、バレルゾーン（15〜25度）へ打球を運ぶライナー性を増やすこと。\n3. バット速度不足の打者は、体幹主導のスイングによりスイング軌道全体を加速させること。',
    trainingPlan: '1. 【打角・軌道の最適化】スイング開始時のグリップ位置と肩のラインを平行に保ち、ボール軌道にバットを長く乗せる「レール＆ウェイ」ティー打撃。\n2. 【バット速度向上】メディシンボール投げと重量バット/軽量バットを交互に振るコントラストトレーニングによるスイング速度の底上げ。\n3. 【コンタクト率（アジャスト率）の改善】手投げ・マシン打撃時に、異なるコースへのアタックアングルを計測し、ゾーン別のコンタクト率を可視化して練習を行う。'
  }
};

export const MOCK_PITCHING_PLAYERS: PitchingPlayer[] = [
  {
    name: 'イマイ カンタ',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 111.0, spin: 1929, efficiency: 78.4, direction: '1:17', vb: 35.6, hb: 20.2, relH: -3.50, relV: 1.22, gyro: 38.3, control: 40.0 },
      { pitchType: 'ストレート', isMax: true, speed: 114.0, spin: 1961, efficiency: 72.5, direction: '1:16', vb: 35.0, hb: 9.0, relH: -3.21, relV: 1.07, gyro: 43.5, control: 40.0 },
      { pitchType: 'ストレートクイック', isMax: false, speed: 110.1, spin: 1916, efficiency: 85.0, direction: '1:35', vb: 32.0, hb: 38.5, relH: -2.57, relV: 2.18, gyro: 31.7, control: 33.3 },
      { pitchType: 'ストレートクイック', isMax: true, speed: 110.2, spin: 1917, efficiency: 84.7, direction: '1:28', vb: 35.9, hb: 32.6, relH: -3.95, relV: 1.27, gyro: 32.1, control: 33.3 }
    ],
    quickTimes: { fastest: 1.37, average: 1.41, previous: 0 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'シミズ',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 133.8, spin: 2096, efficiency: 98.7, direction: '1:12', vb: 46.9, hb: 27.1, relH: -3.20, relV: 1.40, gyro: 22.4, control: 100.0 },
      { pitchType: 'ストレート', isMax: true, speed: 134.6, spin: 2110, efficiency: 97.5, direction: '1:12', vb: 48.2, hb: 25.4, relH: -3.20, relV: 1.40, gyro: 22.4, control: 100.0 },
      { pitchType: 'ストレートクイック', isMax: false, speed: 133.2, spin: 2078, efficiency: 99.5, direction: '12:50', vb: 49.4, hb: 4.8, relH: -2.96, relV: -1.12, gyro: -6.0, control: 100.0 },
      { pitchType: 'ストレートクイック', isMax: true, speed: 133.2, spin: 2078, efficiency: 99.5, direction: '12:50', vb: 49.4, hb: 4.8, relH: -2.96, relV: -1.12, gyro: -6.0, control: 100.0 },
      { pitchType: 'スライダー', isMax: false, speed: 117.6, spin: 2287, efficiency: 13.7, direction: '9:00', vb: -0.6, hb: -10.4, relH: -3.00, relV: 0.16, gyro: 82.1, control: 0.0 }
    ],
    quickTimes: { fastest: 1.11, average: 1.11, previous: 1.26 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'ミヤコ',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 125.4, spin: 2194, efficiency: 73.1, direction: '1:45', vb: 36.3, hb: 15.1, relH: -3.69, relV: 1.65, gyro: 42.9, control: 40.0 },
      { pitchType: 'ストレート', isMax: true, speed: 126.6, spin: 2229, efficiency: 78.1, direction: '1:06', vb: 37.9, hb: 17.0, relH: -3.17, relV: 1.64, gyro: 38.7, control: 40.0 },
      { pitchType: 'ストレートクイック', isMax: false, speed: 119.7, spin: 1882, efficiency: 75.1, direction: '12:57', vb: 29.9, hb: 32.2, relH: -2.71, relV: 1.12, gyro: 20.6, control: 33.3 },
      { pitchType: 'ストレートクイック', isMax: true, speed: 121.4, spin: 1516, efficiency: 86.4, direction: '12:36', vb: 22.8, hb: 35.0, relH: -4.29, relV: 1.34, gyro: -30.3, control: 33.3 },
      { pitchType: 'カーブ', isMax: false, speed: 106.4, spin: 2145, efficiency: 84.3, direction: '7:20', vb: -45.2, hb: -44.0, relH: -2.80, relV: 2.10, gyro: 42.0, control: 66.7 }
    ],
    quickTimes: { fastest: 1.21, average: 1.23, previous: 1.24 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'カイヅ',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 114.3, spin: 1841, efficiency: 98.6, direction: '12:31', vb: 53.5, hb: 12.4, relH: -2.02, relV: -1.02, gyro: -8.7, control: 80.0 },
      { pitchType: 'ストレート', isMax: true, speed: 114.9, spin: 1849, efficiency: 99.5, direction: '12:36', vb: 53.9, hb: 10.8, relH: -2.64, relV: -0.57, gyro: -5.7, control: 80.0 }
    ],
    quickTimes: { fastest: 1.09, average: 1.12, previous: 1.15 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'マツモト',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 121.0, spin: 1999, efficiency: 89.5, direction: '12:50', vb: 46.5, hb: 30.1, relH: -2.27, relV: -0.75, gyro: 26.5, control: 80.0 },
      { pitchType: 'ストレート', isMax: true, speed: 122.5, spin: 1963, efficiency: 90.9, direction: '12:48', vb: 48.5, hb: 37.8, relH: -3.62, relV: -1.33, gyro: 24.6, control: 80.0 }
    ],
    quickTimes: { fastest: 1.16, average: 1.19, previous: 1.24 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'フクモト',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 116.9, spin: 1766, efficiency: 98.3, direction: '1:27', vb: 38.9, hb: 46.1, relH: -3.05, relV: 1.21, gyro: -2.8, control: 60.0 },
      { pitchType: 'ストレート', isMax: true, speed: 119.0, spin: 1842, efficiency: 98.8, direction: '1:20', vb: 41.8, hb: 50.7, relH: -3.33, relV: 0.74, gyro: -8.9, control: 60.0 }
    ],
    quickTimes: { fastest: 1.09, average: 1.09, previous: 1.35 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'ホッチ',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 115.5, spin: 1676, efficiency: 75.4, direction: '12:11', vb: 39.6, hb: -9.6, relH: 1.41, relV: -0.34, gyro: 40.6, control: 20.0 },
      { pitchType: 'ストレート', isMax: true, speed: 116.2, spin: 1694, efficiency: 69.4, direction: '12:14', vb: 37.6, hb: -6.0, relH: 0.21, relV: -0.08, gyro: 46.0, control: 20.0 }
    ],
    quickTimes: { fastest: 1.29, average: 1.30, previous: 0 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'タカヤマ',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 125.8, spin: 1955, efficiency: 93.1, direction: '1:11', vb: 43.9, hb: 40.0, relH: -4.04, relV: -0.51, gyro: 21.4, control: 100.0 },
      { pitchType: 'ストレート', isMax: true, speed: 126.8, spin: 1949, efficiency: 93.0, direction: '1:08', vb: 43.3, hb: 37.7, relH: -3.45, relV: -0.27, gyro: 21.6, control: 100.0 }
    ],
    quickTimes: { fastest: 1.20, average: 1.22, previous: 0 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'ワケ',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 114.3, spin: 1788, efficiency: 91.2, direction: '2:02', vb: 24.8, hb: 30.8, relH: -4.75, relV: 2.92, gyro: 23.8, control: 60.0 },
      { pitchType: 'ストレート', isMax: true, speed: 117.0, spin: 1835, efficiency: 87.2, direction: '1:42', vb: 31.1, hb: 20.0, relH: -4.63, relV: 3.17, gyro: 29.4, control: 60.0 }
    ],
    quickTimes: { fastest: 1.25, average: 1.28, previous: 0 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'ムラタ',
    handedness: 'R',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 114.5, spin: 1540, efficiency: 94.4, direction: '1:28', vb: 36.3, hb: 24.0, relH: -1.64, relV: 2.15, gyro: 19.0, control: 60.0 },
      { pitchType: 'ストレート', isMax: true, speed: 115.1, spin: 1574, efficiency: 95.8, direction: '1:28', vb: 36.3, hb: 19.0, relH: -1.47, relV: 0.81, gyro: 16.6, control: 60.0 }
    ],
    quickTimes: { fastest: 1.15, average: 1.18, previous: 0 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'ナカオ',
    handedness: 'L',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 115.3, spin: 1977, efficiency: 78.5, direction: '10:19', vb: 28.9, hb: -39.6, relH: 1.87, relV: 2.76, gyro: -38.0, control: 40.0 },
      { pitchType: 'ストレート', isMax: true, speed: 116.6, spin: 1840, efficiency: 84.1, direction: '10:16', vb: 29.4, hb: -44.1, relH: 2.29, relV: 2.72, gyro: -32.8, control: 40.0 }
    ],
    quickTimes: { fastest: 1.25, average: 1.27, previous: 0 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'ニシダ',
    handedness: 'L',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 105.9, spin: 1481, efficiency: 96.2, direction: '10:17', vb: 30.8, hb: -49.0, relH: 4.54, relV: 2.42, gyro: -15.8, control: 60.0 },
      { pitchType: 'ストレート', isMax: true, speed: 107.1, spin: 1434, efficiency: 95.4, direction: '10:06', vb: 26.5, hb: -48.3, relH: 4.18, relV: 4.07, gyro: -17.5, control: 60.0 }
    ],
    quickTimes: { fastest: 1.41, average: 1.44, previous: 0 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  },
  {
    name: 'ハヤシ',
    handedness: 'L',
    rows: [
      { pitchType: 'ストレート', isMax: false, speed: 108.2, spin: 1865, efficiency: 55.9, direction: '9:26', vb: 7.4, hb: -15.9, relH: 2.12, relV: 6.16, gyro: -56.0, control: 40.0 },
      { pitchType: 'ストレート', isMax: true, speed: 109.9, spin: 1892, efficiency: 53.3, direction: '9:16', vb: 4.3, hb: -13.3, relH: 2.78, relV: 5.52, gyro: -57.8, control: 40.0 }
    ],
    quickTimes: { fastest: 1.30, average: 1.33, previous: 0 },
    previousStraight: { speed: 0, spin: 0, efficiency: 0, vb: 0, hb: 0, control: 0 }
  }
];

export const MOCK_HITTING_PLAYERS: HittingPlayer[] = [
  {
    name: '氏名 A',
    rows: [
      { type: 'ポイント前', exitVelocity: 148.5, launchAngle: 12.5, batSpeed: 115.2, attackAngle: 14.2, adjustRate: 66.7, distance: 88.0 },
      { type: '真ん中', exitVelocity: 152.7, launchAngle: 15.1, batSpeed: 118.4, attackAngle: 12.0, adjustRate: 83.3, distance: 95.0 },
      { type: 'ポイント後', exitVelocity: 140.2, launchAngle: 8.5, batSpeed: 112.0, attackAngle: 10.5, adjustRate: 50.0, distance: 81.2 }
    ],
    compareStats: {
      currentEv: 152.7,
      currentBat: 118.4,
      prevEv: 150.3,
      prevBat: 115.4,
      teamEv: 140.8,
      teamBat: 108.9,
      koshienEv: 150.0,
      koshienBat: 120.0
    }
  },
  {
    name: 'タカハシ マサユキ',
    rows: [
      { type: 'ポイント前', exitVelocity: 130.8, launchAngle: 18.7, batSpeed: 105.1, attackAngle: 16.0, adjustRate: 33.3, distance: 79.0 },
      { type: '真ん中', exitVelocity: 139.2, launchAngle: 10.1, batSpeed: 106.2, attackAngle: 13.0, adjustRate: 100.0, distance: 86.1 },
      { type: 'ポイント後', exitVelocity: 125.0, launchAngle: 8.0, batSpeed: 98.0, attackAngle: 11.0, adjustRate: 50.0, distance: 70.0 }
    ],
    compareStats: {
      currentEv: 139.2,
      currentBat: 106.2,
      prevEv: 135.0,
      prevBat: 103.0,
      teamEv: 140.8,
      teamBat: 108.9,
      koshienEv: 150.0,
      koshienBat: 120.0
    }
  }
];

