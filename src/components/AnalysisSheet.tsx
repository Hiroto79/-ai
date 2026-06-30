import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, Clipboard, Edit2, Check, RefreshCw, BookOpen, Layers, Sparkles, User, Database, Printer, ArrowUpDown
} from 'lucide-react';
import type { DocumentItem, AnalysisSheetData } from '../mockData';
import type { HittingPlayer, PitchingPlayer, HittingStatsRow, PitchingStatsRow, QuickTimes, PreviousStraightStats, HittingCompareStats } from '../services/csvParser';


interface AnalysisSheetProps {
  document: DocumentItem | null;
  sheetData: AnalysisSheetData | null;
  onSaveSheet: (data: AnalysisSheetData) => void;
  isAnalyzing: boolean;
  onReanalyze: () => void;
  isHitting: boolean; // Add isHitting prop
  players: string[];
  selectedPlayer: string;
  onSelectPlayer: (name: string) => void;
  hittingPlayerData: HittingPlayer | null;
  pitchingPlayerData: PitchingPlayer | null;
  onSavePlayerStats: (playerName: string, updatedRows: any[], updatedExtra?: any, newName?: string) => void;
  forceView?: 'individual' | 'team';
  allPitchingPlayers?: PitchingPlayer[];
  allHittingPlayers?: HittingPlayer[];
  allCompareHittingPlayers?: HittingPlayer[];
  compareDocId?: string;
  compareDocCandidates?: Array<{ id: string; title: string; dateStr: string }>;
  onSelectCompareDoc?: (docId: string) => void;
  compareHittingPlayerData?: HittingPlayer | null;
  comparePitchingPlayerData?: PitchingPlayer | null;
  analysisProgress?: number | null;
}

type TabType = 'individual' | 'sheet' | 'original';

const getPitchColor = (type: string): string => {
  const t = type.toLowerCase();
  if (t.includes('ストレート') || t.includes('クイック')) return '#ff0000'; // 赤
  if (t.includes('ツーシーム') || t.includes('ワンシーム')) return '#5bc0de'; // 水色
  if (t.includes('シュート') || t.includes('フォーク')) return '#d9d9d9'; // グレー
  if (t.includes('カット')) return '#2e6da4'; // 青
  if (t.includes('スプリット')) return '#f0ad4e'; // オレンジ
  if (t.includes('スライダー') || t.includes('スラ')) return '#9b59b6'; // 紫
  if (t.includes('チェンジ')) return '#f1c40f'; // 黄色
  if (t.includes('カーブ')) return '#2ecc71'; // 明るい緑
  return '#3b82f6';
};

const getPitchClass = (type: string): string => {
  const t = type.toLowerCase();
  if (t.includes('チェンジ')) return 'changeup';
  if (t.includes('シュート')) return 'shoot';
  if (t.includes('スプリット')) return 'split';
  if (t.includes('フォーク')) return 'fork';
  if (t.includes('ストレート')) return 'straight';
  if (t.includes('クイック')) return 'quick';
  if (t.includes('ツーシーム')) return 'twoseam';
  if (t.includes('ワンシーム')) return 'oneseam';
  if (t.includes('カット')) return 'cut';
  if (t.includes('スライダー') || t.includes('スラ')) return 'slider';
  if (t.includes('カーブ')) return 'curve';
  if (t.includes('シンカー')) return 'sinker';
  return '';
};

// Returns white or black text color depending on pitch background
const getPitchTextColor = (pitchType: string): string => {
  const cls = getPitchClass(pitchType);
  return ['changeup', 'shoot', 'split', 'fork'].includes(cls) ? '#000000' : '#ffffff';
};

const formatQuickTime = (val: string | number | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '-';
  const num = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(num) ? '-' : num.toFixed(2);
};

const renderNobleScatterPlot = (rows: PitchingStatsRow[], isPrint = false, printSize = 280) => {
  const w = isPrint ? Math.max(280, printSize) : 320;
  const h = isPrint ? Math.max(280, printSize) : 320;
  const pad = isPrint ? 38 : 40;
  
  // scale: -70 to +70
  const toX = (val: number) => pad + ((val + 70) / 140) * (w - 2 * pad);
  const toY = (val: number) => h - pad - ((val + 70) / 140) * (h - 2 * pad);

  const getAvgRow = (type: string) => rows.find(r => r.pitchType === type && !r.isMax);

  const pitchOrder = [
    'ストレート',
    'ストレートクイック',
    'ツーシーム',
    'ワンシーム',
    'カットボール',
    'スライダー',
    'カーブ',
    'スプリット',
    'フォーク',
    'チェンジアップ',
    'シンカー',
    'シュート'
  ];

  // Get all unique pitch types from rows (for avg, i.e. !isMax)
  const uniquePitchTypes = Array.from(new Set(
    rows.filter(r => !r.isMax).map(r => r.pitchType)
  )).sort((a, b) => {
    let idxA = pitchOrder.indexOf(a);
    let idxB = pitchOrder.indexOf(b);
    if (idxA === -1) idxA = 999;
    if (idxB === -1) idxB = 999;
    if (idxA !== idxB) return idxA - idxB;
    return String(a).localeCompare(String(b), 'ja');
  });

  const orderedPoints = uniquePitchTypes.map(pitchType => {
    const row = getAvgRow(pitchType);
    if (!row) return null;
    return {
      x: toX(row.hb),
      y: toY(row.vb),
      color: getPitchColor(pitchType),
      label: pitchType
    };
  }).filter((pt): pt is NonNullable<typeof pt> => pt !== null);

  return (
    <div className="noble-scatter-wrapper">
      <div className="noble-chart-title">変化量チャートと球種別平均値</div>
      <div className="noble-svg-container">
        <svg width={w} height={h} style={{ background: '#fff' }}>
          {/* Grid background */}
          <rect x={pad} y={pad} width={w - 2 * pad} height={h - 2 * pad} fill="none" stroke="#000" strokeWidth="1.5" />
          
          <line x1={toX(-35)} y1={pad} x2={toX(-35)} y2={h - pad} stroke="#ddd" strokeWidth="1" strokeDasharray="2 2" />
          <line x1={toX(35)} y1={pad} x2={toX(35)} y2={h - pad} stroke="#ddd" strokeWidth="1" strokeDasharray="2 2" />
          <line x1={pad} y1={toY(-35)} x2={w - pad} y2={toY(-35)} stroke="#ddd" strokeWidth="1" strokeDasharray="2 2" />
          <line x1={pad} y1={toY(35)} x2={w - pad} y2={toY(35)} stroke="#ddd" strokeWidth="1" strokeDasharray="2 2" />

          {/* Axes */}
          <line x1={toX(-70)} y1={toY(0)} x2={toX(70)} y2={toY(0)} stroke="#000" strokeWidth="1" />
          <line x1={toX(0)} y1={toY(-70)} x2={toX(0)} y2={toY(70)} stroke="#000" strokeWidth="1" />

          {/* X Labels */}
          <text x={toX(-70)} y={h - pad + 15} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">-70</text>
          <text x={toX(-35)} y={h - pad + 15} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">-35</text>
          <text x={toX(0)} y={h - pad + 15} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">0</text>
          <text x={toX(35)} y={h - pad + 15} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">35</text>
          <text x={toX(70)} y={h - pad + 15} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">70</text>

          {/* Y Labels */}
          <text x={pad - 8} y={toY(-70) + 4} textAnchor="end" fontSize="10" fontWeight="bold" fill="#000">-70</text>
          <text x={pad - 8} y={toY(-35) + 4} textAnchor="end" fontSize="10" fontWeight="bold" fill="#000">-35</text>
          <text x={pad - 8} y={toY(0) + 4} textAnchor="end" fontSize="10" fontWeight="bold" fill="#000">0</text>
          <text x={pad - 8} y={toY(35) + 4} textAnchor="end" fontSize="10" fontWeight="bold" fill="#000">35</text>
          <text x={pad - 8} y={toY(70) + 4} textAnchor="end" fontSize="10" fontWeight="bold" fill="#000">70</text>

          {/* Axes titles */}
          <text x={w / 2} y={h - 5} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#000">横の変化量</text>
          <text x={12} y={h / 2} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#000" transform={`rotate(-90, 12, ${h / 2})`}>縦の変化量</text>

          {/* Dot plot */}
          {orderedPoints.map((pt, idx) => (
            <circle key={idx} cx={pt.x} cy={pt.y} r={6.5} fill={pt.color} stroke="#fff" strokeWidth="1" />
          ))}
        </svg>
      </div>

      {/* Sub table under Scatter Plot */}
      <table className="noble-sub-table" style={{ marginTop: 'auto' }}>
        <thead>
          <tr>
            <th style={{ width: '80px' }}>球種<br/>(平均値)</th>
            <th>回転数</th>
            <th>回転効率</th>
            <th>縦の<br/>変化量</th>
            <th>横の<br/>変化量</th>
          </tr>
        </thead>
        <tbody>
          {uniquePitchTypes.map((pitchType, idx) => {
            const row = getAvgRow(pitchType);
            if (!row) return null;
            const pitchColor = getPitchColor(row.pitchType);
            return (
              <tr key={idx}>
                <td 
                  className={`pitch-name-cell ${getPitchClass(row.pitchType)}`}
                  style={{ 
                    backgroundColor: pitchColor, 
                    color: getPitchTextColor(row.pitchType),
                    fontWeight: 'bold',
                    fontSize: row.pitchType.length > 5 ? '9px' : (row.pitchType === 'チェンジアップ' ? '10px' : 'inherit'),
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    padding: row.pitchType.length > 5 ? '8px 2px' : '8px 6px'
                  }}
                >
                  {row.pitchType === 'ストレートクイック' ? 'クイック' : row.pitchType}
                </td>
                <td>{row.spin}</td>
                <td>{row.efficiency.toFixed(1)}</td>
                <td>{row.vb.toFixed(1)}</td>
                <td>{row.hb.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const renderNobleVelocityChart = (rows: PitchingStatsRow[], isPrint = false, printH = 280) => {
  const w = 120;
  const h = isPrint ? printH : 440;
  const pad = 20;

  const getAvgRow = (type: string) => rows.find(r => r.pitchType === type && !r.isMax);

  const pitchOrder = [
    'ストレート',
    'ストレートクイック',
    'ツーシーム',
    'ワンシーム',
    'カットボール',
    'スライダー',
    'カーブ',
    'スプリット',
    'フォーク',
    'チェンジアップ',
    'シンカー',
    'シュート'
  ];

  // Get all unique pitch types from rows (for avg, i.e. !isMax)
  const uniquePitchTypes = Array.from(new Set(
    rows.filter(r => !r.isMax).map(r => r.pitchType)
  )).sort((a, b) => {
    let idxA = pitchOrder.indexOf(a);
    let idxB = pitchOrder.indexOf(b);
    if (idxA === -1) idxA = 999;
    if (idxB === -1) idxB = 999;
    if (idxA !== idxB) return idxA - idxB;
    return String(a).localeCompare(String(b), 'ja');
  });

  const straightRow = getAvgRow('ストレート');
  const straightSpeed = straightRow ? straightRow.speed : (rows.find(r => !r.isMax)?.speed || 111.0);

  // 動的スケール算出
  const maxVal = Math.ceil(straightSpeed / 10) * 10;
  const minVal = maxVal - 50;
  const toY = (val: number) => h - pad - ((val - minVal) / 50) * (h - 2 * pad);

  const ticks: number[] = [];
  for (let v = minVal; v <= maxVal; v += 5) {
    ticks.push(v);
  }

  const points = uniquePitchTypes.map(pitchType => {
    const row = getAvgRow(pitchType);
    if (!row) return null;
    return {
      row,
      label: pitchType,
      color: getPitchColor(pitchType)
    };
  }).filter((p): p is NonNullable<typeof p> => p !== null);

  return (
    <div className="noble-velocity-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
      <div className="noble-chart-title">球速緩急差（平均値）</div>
      
      <div className="noble-velocity-row" style={{ display: 'flex', gap: '10px', width: isPrint ? '390px' : '360px', alignItems: 'flex-start' }}>
        {/* Left: SVG Velocity scale */}
        <div className="noble-velocity-plot-container" style={{ width: '120px', flexShrink: 0 }}>
          <svg width={w} height={h} style={{ background: '#fff' }}>
            <line x1={80} y1={pad} x2={80} y2={h - pad} stroke="#000" strokeWidth="1.5" />

            {ticks.map((val) => {
              const y = toY(val);
              return (
                <g key={val}>
                  <line x1={74} y1={y} x2={80} y2={y} stroke="#000" strokeWidth="1" />
                  <text x={65} y={y + 4} textAnchor="end" fontSize="12" fontWeight="bold" fill="#000">{val}</text>
                </g>
              );
            })}

            {points.map((pt, idx) => {
              if (!pt.row) return null;
              const y = toY(pt.row.speed);
              return (
                <circle key={idx} cx={80} cy={y} r={7.5} fill={pt.color} stroke="#fff" strokeWidth="1" />
              );
            })}

            <text x={80} y={h - 2} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#000">投球速度</text>
          </svg>
        </div>

        {/* Right: Table ratios */}
        <div className="noble-velocity-right-content" style={{ width: isPrint ? '260px' : '230px', flexShrink: 0, display: 'flex', flexDirection: 'column', marginTop: isPrint ? '60px' : '80px' }}>
          {/* Table ratios */}
          <div className="noble-velocity-table-container">
            <table className="noble-ratio-table" style={{ width: '100%', margin: 0, tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ height: isPrint ? '42px' : '52px' }}>
                  <th style={{ width: '33.33%', verticalAlign: 'middle', padding: '0 4px' }}>球種</th>
                  <th style={{ width: '33.33%', verticalAlign: 'middle', padding: '0 4px' }}>投球速度</th>
                  <th style={{ width: '33.33%', fontSize: '8px', lineHeight: '1.05', verticalAlign: 'middle', padding: '0 2px' }}>ストレートに<br/>対する割合<br/>(%)</th>
                </tr>
              </thead>
              <tbody>
                {points.map((pt, idx) => {
                  if (!pt.row) return null;
                  const ratio = (pt.row.speed / straightSpeed) * 100;
                  return (
                    <tr key={idx}>
                      <td 
                        className={`pitch-name-cell ${getPitchClass(pt.label)}`}
                        style={{ 
                          width: '33.33%',
                          backgroundColor: pt.color,
                          color: getPitchTextColor(pt.label),
                          fontWeight: 'bold',
                          fontSize: pt.label.length > 5 ? '9px' : (pt.label === 'チェンジアップ' ? '10px' : 'inherit'),
                          whiteSpace: 'nowrap',
                          textAlign: 'center',
                          padding: pt.label.length > 5 ? '8px 2px' : '8px 6px'
                        }}
                      >
                        {pt.label === 'ストレートクイック' ? 'クイック' : pt.label}
                      </td>
                      <td style={{ width: '33.33%', backgroundColor: '#ffffff' }}>{pt.row.speed.toFixed(1)}</td>
                      <td style={{ width: '33.33%', backgroundColor: '#ffffff' }}>{ratio.toFixed(1) === '100.0' ? '100' : ratio.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Standards Bar (Restored to 360px, but styled with smaller font sizes & safety borders) */}
      <div className="noble-standards-bar" style={{ width: isPrint ? '390px' : '360px', marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingBottom: '2px' }}>
        {(() => {
          const labelFontSize = isPrint ? '4.8px' : '8.2px';
          const valFontSize = isPrint ? '5.2px' : '8.5px';
          return (
            <>
              <div className="standards-title" style={{ fontSize: isPrint ? '8px' : '9.5px', fontWeight: 'bold', color: '#111', marginBottom: '2px', marginRight: '2px' }}>緩急比基準（％）</div>
              <table className="noble-standards-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #222', tableLayout: 'fixed', fontSize: labelFontSize, textAlign: 'center' }}>
                <tbody>
                  <tr className="std-names-row" style={{ height: isPrint ? '18px' : '22px' }}>
                    <td style={{ width: '12.5%', backgroundColor: '#00b0f0', color: '#fff', fontWeight: 'bold', border: '1px solid #222', fontSize: labelFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px', whiteSpace: 'nowrap' }}>ツーシーム</td>
                    <td style={{ width: '12.5%', backgroundColor: '#d9d9d9', color: '#000', fontWeight: 'bold', border: '1px solid #222', fontSize: labelFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px', whiteSpace: 'nowrap' }}>シュート</td>
                    <td style={{ width: '12.5%', backgroundColor: '#2f5597', color: '#fff', fontWeight: 'bold', border: '1px solid #222', fontSize: labelFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px', whiteSpace: 'nowrap' }}>カット</td>
                    <td style={{ width: '12.5%', backgroundColor: '#ffc000', color: '#000', fontWeight: 'bold', border: '1px solid #222', fontSize: labelFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px', whiteSpace: 'nowrap' }}>スプリット</td>
                    <td style={{ width: '12.5%', backgroundColor: '#d9d9d9', color: '#000', fontWeight: 'bold', border: '1px solid #222', fontSize: labelFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px', whiteSpace: 'nowrap' }}>フォーク</td>
                    <td style={{ width: '12.5%', backgroundColor: '#7030a0', color: '#fff', fontWeight: 'bold', border: '1px solid #222', fontSize: labelFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px', whiteSpace: 'nowrap' }}>スラ（縦）</td>
                    <td style={{ width: '12.5%', backgroundColor: '#fce4d6', color: '#000', fontWeight: 'bold', border: '1px solid #222', fontSize: labelFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px', whiteSpace: 'nowrap' }}>チェンジ</td>
                    <td style={{ width: '12.5%', backgroundColor: '#00b050', color: '#fff', fontWeight: 'bold', border: '1px solid #222', fontSize: labelFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px', whiteSpace: 'nowrap' }}>カーブ</td>
                  </tr>
                  <tr className="std-vals-row" style={{ height: isPrint ? '18px' : '22px', backgroundColor: '#ffffff', color: '#000', fontWeight: 'bold' }}>
                    <td style={{ width: '12.5%', border: '1px solid #222', fontSize: valFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px' }}>99</td>
                    <td style={{ width: '12.5%', border: '1px solid #222', fontSize: valFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px' }}>97 99</td>
                    <td style={{ width: '12.5%', border: '1px solid #222', fontSize: valFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px' }}>95</td>
                    <td style={{ width: '12.5%', border: '1px solid #222', fontSize: valFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px' }}>93</td>
                    <td style={{ width: '12.5%', border: '1px solid #222', fontSize: valFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px' }}>92</td>
                    <td style={{ width: '12.5%', border: '1px solid #222', fontSize: valFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px' }}>90 (91)</td>
                    <td style={{ width: '12.5%', border: '1px solid #222', fontSize: valFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px' }}>90</td>
                    <td style={{ width: '12.5%', border: '1px solid #222', fontSize: valFontSize, padding: isPrint ? '1.5px 0.1px' : '3px 0.5px' }}>85</td>
                  </tr>
                </tbody>
              </table>
            </>
          );
        })()}
      </div>
    </div>
  );
};


const renderNobleHittingScatter = (
  rows: HittingStatsRow[],
  isPrevious = false,
  compareRows: HittingStatsRow[] | null = null,
  rawHits: { exitVelocity: number; launchAngle: number; type?: string }[] | null = null,
  compareRawHits: { exitVelocity: number; launchAngle: number; type?: string }[] | null = null,
  playerName = ''
) => {
  const w = 310;
  const h = 240;
  const pad = 40;

  // X scale: 20 to 200
  const toX = (val: number) => pad + ((val - 20) / 180) * (w - 2 * pad);
  // Y scale: -60 to 60
  const toY = (val: number) => h - pad - ((val + 60) / 120) * (h - 2 * pad);

  const getLaunchAngleColor = (la: number) => {
    if (la <= 0) return '#2d8a4e'; // マイナス打球
    if (la <= 6) return '#facc15'; // ゴロ
    if (la <= 14) return '#ff0000'; // 低ライナー
    if (la <= 24) return '#3b82f6'; // 高ライナー
    if (la <= 50) return '#800080'; // フライ
    return '#000000'; // ポップフライ
  };

  // Deterministic pseudo-random number generator to simulate individual swings when missing
  const createRng = (seedStr: string) => {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    return () => {
      const x = Math.sin(hash++) * 10000;
      return x - Math.floor(x);
    };
  };

  const getOrGenerateRawHits = (
    pts: { exitVelocity: number; launchAngle: number; type?: string }[] | null,
    avgRows: HittingStatsRow[] | null,
    seed: string
  ) => {
    if (pts && pts.length > 0) return pts;
    if (!avgRows || avgRows.length === 0) return [];
    
    const generated: { exitVelocity: number; launchAngle: number; type?: string }[] = [];
    avgRows.forEach(r => {
      if (r.type !== '前回（置きT）') {
        const rng = createRng(seed + r.type);
        // Generate 6 dots representing individual swings
        for (let i = 0; i < 6; i++) {
          const evOffset = (rng() * 16) - 8; // +/- 8 km/h
          const laOffset = (rng() * 24) - 12; // +/- 12 degrees
          generated.push({
            exitVelocity: Math.round((r.exitVelocity + evOffset) * 10) / 10,
            launchAngle: Math.round((r.launchAngle + laOffset) * 10) / 10,
            type: r.type
          });
        }
      }
    });
    return generated;
  };

  const finalRawHits = getOrGenerateRawHits(rawHits, rows, playerName + '-current');
  const finalCompareRawHits = getOrGenerateRawHits(compareRawHits, compareRows, playerName + '-previous');

  const mockDots: { ev: number; la: number; color: string; isCompare?: boolean; isAverage?: boolean; type?: string }[] = [];

  if (!isPrevious) {
    // 1. Render all comparison raw hits in light gray first (drawn underneath)
    if (finalCompareRawHits && finalCompareRawHits.length > 0) {
      finalCompareRawHits.forEach(pt => {
        mockDots.push({ ev: pt.exitVelocity, la: pt.launchAngle, color: '#e2e8f0', isCompare: true });
      });
    }

    // 2. Render all current raw hits in color
    if (finalRawHits && finalRawHits.length > 0) {
      finalRawHits.forEach(pt => {
        mockDots.push({ ev: pt.exitVelocity, la: pt.launchAngle, color: getLaunchAngleColor(pt.launchAngle) });
      });
    }

    // 3. Overlay current averages as distinct highlighted dots
    rows.forEach(r => {
      if (r.type !== '前回（置きT）') {
        mockDots.push({ ev: r.exitVelocity, la: r.launchAngle, color: getLaunchAngleColor(r.launchAngle), isAverage: true, type: r.type });
      }
    });
  } else {
    // Previous plot (Right Chart)
    // 1. Render comparison raw hits in color
    if (finalCompareRawHits && finalCompareRawHits.length > 0) {
      finalCompareRawHits.forEach(pt => {
        mockDots.push({ ev: pt.exitVelocity, la: pt.launchAngle, color: getLaunchAngleColor(pt.launchAngle) });
      });
    } else if (finalRawHits && finalRawHits.length > 0) {
      // Fallback: original current raw hits in light gray
      finalRawHits.forEach(pt => {
        mockDots.push({ ev: pt.exitVelocity, la: pt.launchAngle, color: '#e2e8f0', isCompare: true });
      });
    }

    // 2. Overlay previous averages as distinct highlighted dots
    if (compareRows) {
      compareRows.forEach(r => {
        if (r.type !== '前回（置きT）') {
          mockDots.push({ ev: r.exitVelocity, la: r.launchAngle, color: getLaunchAngleColor(r.launchAngle), isAverage: true, type: r.type });
        }
      });
    }
  }

  return (
    <svg width={w} height={h} style={{ background: '#fff' }}>
      <rect x={pad} y={pad} width={w - 2 * pad} height={h - 2 * pad} fill="none" stroke="#222" strokeWidth="1" />
      
      {/* Vertical text label "打球角度" */}
      <g fontSize="11" fontWeight="bold" fill="#000" textAnchor="middle">
        <text x={12} y={h / 2 - 24}>打</text>
        <text x={12} y={h / 2 - 8}>球</text>
        <text x={12} y={h / 2 + 8}>角</text>
        <text x={12} y={h / 2 + 24}>度</text>
      </g>

      {[20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map(val => (
        <line key={val} x1={toX(val)} y1={pad} x2={toX(val)} y2={h - pad} stroke="#eee" strokeWidth="0.5" />
      ))}
      {[-60, -40, -20, 0, 20, 40, 60].map(val => (
        <line key={val} x1={pad} y1={toY(val)} x2={w - pad} y2={toY(val)} stroke="#eee" strokeWidth="0.5" />
      ))}

      <line x1={pad} y1={toY(0)} x2={w - pad} y2={toY(0)} stroke="#444" strokeWidth="1" />

      {[20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map(val => (
        <text key={val} x={toX(val)} y={h - pad + 12} textAnchor="middle" fontSize="8" fill="#555">{val}</text>
      ))}
      {[-60, -40, -20, 0, 20, 40, 60].map(val => (
        <text key={val} x={pad - 4} y={toY(val) + 3} textAnchor="end" fontSize="8" fill="#555">{val}</text>
      ))}

      <text x={w / 2} y={h - 2} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#000">打球速度</text>

      {mockDots.map((pt, idx) => {
        if (pt.isAverage) {
          return (
            <circle 
              key={idx} 
              cx={toX(pt.ev)} 
              cy={toY(pt.la)} 
              r={2.8} 
              fill={pt.color} 
            />
          );
        }
        return (
          <circle 
            key={idx} 
            cx={toX(pt.ev)} 
            cy={toY(pt.la)} 
            r={2.8} 
            fill={pt.color} 
            fillOpacity={pt.isCompare ? 0.35 : 0.75}
          />
        );
      })}
    </svg>
  );
};

const renderNobleHittingMatrix = (compareStats: HittingCompareStats) => {
  const w = 350;
  const h = 280;
  const pad = 45;

  const toX = (val: number) => pad + ((val - 100) / 60) * (w - 2 * pad);
  const toY = (val: number) => h - pad - ((val - 70) / 60) * (h - 2 * pad);

  return (
    <svg width={w} height={h} style={{ background: '#fff' }}>
      <rect x={pad} y={toY(90)} width={(w-2*pad)/3} height={(h-2*pad)/3} fill="#d5e8f9" opacity="0.6" />
      <rect x={pad + 2*(w-2*pad)/3} y={pad} width={(w-2*pad)/3} height={(h-2*pad)/3} fill="#f9d5d5" opacity="0.6" />

      <rect x={pad} y={pad} width={w - 2 * pad} height={h - 2 * pad} fill="none" stroke="#222" strokeWidth="1.5" />

      <line x1={toX(120)} y1={pad} x2={toX(120)} y2={h - pad} stroke="#222" strokeWidth="1" />
      <line x1={toX(140)} y1={pad} x2={toX(140)} y2={h - pad} stroke="#222" strokeWidth="1" />
      <line x1={pad} y1={toY(90)} x2={w - pad} y2={toY(90)} stroke="#222" strokeWidth="1" />
      <line x1={pad} y1={toY(110)} x2={w - pad} y2={toY(110)} stroke="#222" strokeWidth="1" />

      <line x1={toX(140)} y1={toY(70)} x2={toX(160)} y2={toY(90)} stroke="#222" strokeWidth="1" />

      <text x={toX(100)} y={h - pad + 12} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#000">100</text>
      <text x={toX(120)} y={h - pad + 12} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#000">120</text>
      <text x={toX(140)} y={h - pad + 12} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#000">140</text>
      <text x={toX(160)} y={h - pad + 12} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#000">160</text>
      <text x={w/2} y={h - 5} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#000">打球速度</text>

      <text x={pad - 5} y={toY(70) + 3} textAnchor="end" fontSize="11" fontWeight="bold" fill="#000">70</text>
      <text x={pad - 5} y={toY(90) + 3} textAnchor="end" fontSize="11" fontWeight="bold" fill="#000">90</text>
      <text x={pad - 5} y={toY(110) + 3} textAnchor="end" fontSize="11" fontWeight="bold" fill="#000">110</text>
      <text x={pad - 5} y={toY(130) + 3} textAnchor="end" fontSize="11" fontWeight="bold" fill="#000">130</text>
      <text x={12} y={h/2} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#000" transform={`rotate(-90, 12, ${h/2})`}>バット速度</text>

      <text x={toX(110)} y={toY(80) + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#444">低</text>
      <text x={toX(130)} y={toY(100) + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#444">中</text>

      <defs>
        <linearGradient id="grad-top" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#ff0000" />
        </linearGradient>
        <linearGradient id="grad-right" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#ff0000" />
        </linearGradient>
      </defs>
      <rect x={pad} y={pad - 12} width={w - 2 * pad} height={6} fill="url(#grad-top)" />
      <polygon points={`${w-pad},${pad-13} ${w-pad+5},${pad-9} ${w-pad},${pad-5}`} fill="#ff0000" />

      <rect x={w - pad + 6} y={pad} width={6} height={h - 2 * pad} fill="url(#grad-right)" />
      <polygon points={`${w-pad+5},${pad} ${w-pad+9},${pad-5} ${w-pad+13},${pad}`} fill="#ff0000" />

      <circle cx={toX(compareStats.currentEv)} cy={toY(compareStats.currentBat)} r={6} fill="#000" stroke="#fff" strokeWidth="1" />
      <circle cx={toX(compareStats.prevEv)} cy={toY(compareStats.prevBat)} r={6} fill="#888" stroke="#fff" strokeWidth="1" />
      <circle cx={toX(compareStats.teamEv)} cy={toY(compareStats.teamBat)} r={6} fill="#f1c40f" stroke="#fff" strokeWidth="1" />
      <circle cx={toX(compareStats.koshienEv)} cy={toY(compareStats.koshienBat)} r={6} fill="#ff0000" stroke="#fff" strokeWidth="1" />
    </svg>
  );
};

const getHittingRowsForPattern = (
  rows: HittingStatsRow[],
  pattern: 'toss_tee' | 'height' | 'point'
): HittingStatsRow[] => {
  const baseRow = rows.find(r => r.type === '真ん中') || 
                  rows.find(r => r.type === '手投げ') || 
                  rows.find(r => r.type === '置きT') || 
                  (rows.length > 0 ? rows[0] : null) || {
                    type: 'base',
                    exitVelocity: 120.0,
                    launchAngle: 15.0,
                    batSpeed: 100.0,
                    attackAngle: 10.0,
                    adjustRate: 50.0,
                    distance: 70.0
                  };

  const getOrGenerate = (type: string, scale: { ev: number; la: number; bat: number; attack: number; adjust: number; dist: number }) => {
    const existing = rows.find(r => r.type === type);
    if (existing) return { ...existing };
    return {
      type,
      exitVelocity: Math.round((baseRow.exitVelocity * scale.ev) * 10) / 10,
      launchAngle: Math.round((baseRow.launchAngle * scale.la) * 10) / 10,
      batSpeed: Math.round((baseRow.batSpeed * scale.bat) * 10) / 10,
      attackAngle: Math.round((baseRow.attackAngle * scale.attack) * 10) / 10,
      adjustRate: Math.round(Math.min(100, Math.max(0, baseRow.adjustRate * scale.adjust)) * 10) / 10,
      distance: Math.round((baseRow.distance * scale.dist) * 10) / 10
    };
  };

  if (pattern === 'toss_tee') {
    return [
      getOrGenerate('手投げ', { ev: 1.0, la: 1.0, bat: 1.0, attack: 1.0, adjust: 1.0, dist: 1.0 }),
      getOrGenerate('前回（置きT）', { ev: 0.98, la: 0.92, bat: 0.98, attack: 0.98, adjust: 1.0, dist: 0.92 }),
      getOrGenerate('置きT', { ev: 0.95, la: 0.9, bat: 0.95, attack: 0.95, adjust: 1.2, dist: 0.9 })
    ];
  } else if (pattern === 'height') {
    return [
      getOrGenerate('高め', { ev: 0.98, la: 1.3, bat: 0.97, attack: 1.1, adjust: 0.9, dist: 0.95 }),
      getOrGenerate('真ん中', { ev: 1.0, la: 1.0, bat: 1.0, attack: 1.0, adjust: 1.0, dist: 1.0 }),
      getOrGenerate('低め', { ev: 0.95, la: 0.8, bat: 0.96, attack: 0.9, adjust: 0.95, dist: 0.92 })
    ];
  } else {
    return [
      getOrGenerate('ポイント前', { ev: 0.97, la: 1.2, bat: 0.98, attack: 1.2, adjust: 0.8, dist: 0.93 }),
      getOrGenerate('真ん中', { ev: 1.0, la: 1.0, bat: 1.0, attack: 1.0, adjust: 1.0, dist: 1.0 }),
      getOrGenerate('ポイント後', { ev: 0.92, la: 0.6, bat: 0.95, attack: 0.8, adjust: 0.95, dist: 0.85 })
    ];
  }
};


export const AnalysisSheet: React.FC<AnalysisSheetProps> = ({
  document,
  sheetData,
  onSaveSheet,
  isAnalyzing,
  onReanalyze,
  players,
  selectedPlayer,
  onSelectPlayer,
  hittingPlayerData,
  pitchingPlayerData,
  onSavePlayerStats,
  forceView,
  allPitchingPlayers: allPitchingPlayersRaw = [],
  allHittingPlayers: allHittingPlayersRaw = [],
  allCompareHittingPlayers = [],
  isHitting: isHittingProp,
  compareDocId,
  compareDocCandidates,
  onSelectCompareDoc,
  compareHittingPlayerData,
  comparePitchingPlayerData,
  analysisProgress
}) => {
  const [localActiveTab, setLocalActiveTab] = useState<TabType>('individual');
  const activeTab = forceView ? (forceView === 'team' ? 'sheet' : 'individual') : localActiveTab;
  const setActiveTab = setLocalActiveTab;
  const [teamSubView, setTeamSubView] = useState<'roster' | 'ai'>('roster');

  const [summaryPageSize, setSummaryPageSize] = useState(15);
  const [pitcherOrderList, setPitcherOrderList] = useState<string[]>([]);
  const [hitterOrderList, setHitterOrderList] = useState<string[]>([]);

  const allPitchingPlayers = pitcherOrderList.length > 0 
    ? pitcherOrderList.map(name => allPitchingPlayersRaw.find(p => p.name === name)).filter((p): p is typeof allPitchingPlayersRaw[0] => p !== undefined)
    : allPitchingPlayersRaw;

  const allHittingPlayers = hitterOrderList.length > 0
    ? hitterOrderList.map(name => allHittingPlayersRaw.find(p => p.name === name)).filter((p): p is typeof allHittingPlayersRaw[0] => p !== undefined)
    : allHittingPlayersRaw;

  const [isEditing, setIsEditing] = useState(false);
  const [editedSheetData, setEditedSheetData] = useState<AnalysisSheetData | null>(null);
  const [editedName, setEditedName] = useState<string>('');
  
  // Edited values for individual tables
  const [hittingPattern, setHittingPattern] = useState<'toss_tee' | 'height' | 'point'>('toss_tee');
  const [editedHittingRows, setEditedHittingRows] = useState<HittingStatsRow[]>([]);
  const [editedPitchingRows, setEditedPitchingRows] = useState<PitchingStatsRow[]>([]);
  
  // Edited values for extra graphics
  const [editedQuickTimes, setEditedQuickTimes] = useState<QuickTimes | null>(null);
  const [editedPreviousStraight, setEditedPreviousStraight] = useState<PreviousStraightStats>({
    speed: 0,
    spin: 0,
    efficiency: 0,
    vb: 0,
    hb: 0,
    control: 0
  });
  const [editedCompareStats, setEditedCompareStats] = useState<HittingCompareStats>({
    currentEv: 0,
    currentBat: 0,
    prevEv: 0,
    prevBat: 0,
    teamEv: 0,
    teamBat: 0,
    koshienEv: 0,
    koshienBat: 0
  });

  const [copied, setCopied] = useState(false);
  const [editedPlayerNames, setEditedPlayerNames] = useState<Record<string, string>>({});
  const [editedPlayerGrades, setEditedPlayerGrades] = useState<Record<string, string>>({});
  const [focusedHittingField, setFocusedHittingField] = useState<string | null>(null);
  const [isPrintingBulk, setIsPrintingBulk] = useState(false);

  const handleBulkPrint = () => {
    setIsPrintingBulk(true);
  };

  useEffect(() => {
    if (isPrintingBulk) {
      const timer = setTimeout(() => {
        window.print();
        setIsPrintingBulk(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isPrintingBulk]);

  const [customPitchingTitle, setCustomPitchingTitle] = useState(() => {
    return localStorage.getItem('customPitchingTitle') || 'ストレート一覧（年：打者なし）';
  });
  const [customHittingTitle, setCustomHittingTitle] = useState(() => {
    return localStorage.getItem('customHittingTitle') || '打球一覧（年：手投げ）';
  });
  const [customPitchingDate, setCustomPitchingDate] = useState(() => {
    return localStorage.getItem('customPitchingDate') || '';
  });
  const [customHittingDate, setCustomHittingDate] = useState(() => {
    return localStorage.getItem('customHittingDate') || '';
  });

  // Determine doc type (checks if hitting document, fallback to prop)
  const isHitting = isHittingProp !== undefined
    ? isHittingProp
    : (document?.id.includes('hitting') || 
       document?.title.toLowerCase().includes('hitting') || 
       document?.title.includes('打撃') || 
       document?.fileName.toLowerCase().includes('hitting') || 
       document?.fileName.toLowerCase().includes('batting') || 
       false);

  // Sync edited data when sheetData changes
  useEffect(() => {
    if (sheetData) {
      setEditedSheetData({ ...sheetData });
    }
    if (allPitchingPlayersRaw && allPitchingPlayersRaw.length > 0 && pitcherOrderList.length === 0) {
      setPitcherOrderList(allPitchingPlayersRaw.map(p => p.name));
    }
    if (allHittingPlayersRaw && allHittingPlayersRaw.length > 0 && hitterOrderList.length === 0) {
      setHitterOrderList(allHittingPlayersRaw.map(p => p.name));
    }
  }, [sheetData, allPitchingPlayersRaw, allHittingPlayersRaw]);

  const handleSortPlayers = () => {
    // Pitchers sort
    const pitchers = allPitchingPlayersRaw;
    const sortedPitchers = [...pitchers].sort((a, b) => {
      const gradeA = String(editedPlayerGrades[a.name] !== undefined ? editedPlayerGrades[a.name] : (a.grade || '3'));
      const gradeB = String(editedPlayerGrades[b.name] !== undefined ? editedPlayerGrades[b.name] : (b.grade || '3'));
      if (gradeA !== gradeB) {
        return gradeB.localeCompare(gradeA); // 3 -> 2 -> 1
      }
      const nameA = String(editedPlayerNames[a.name] || a.name);
      const nameB = String(editedPlayerNames[b.name] || b.name);
      return nameA.localeCompare(nameB, 'ja'); // 五十音順
    });
    setPitcherOrderList(sortedPitchers.map(p => p.name));

    // Hitters sort
    const hitters = allHittingPlayersRaw;
    const sortedHitters = [...hitters].sort((a, b) => {
      const gradeA = String(editedPlayerGrades[a.name] !== undefined ? editedPlayerGrades[a.name] : (a.grade || '3'));
      const gradeB = String(editedPlayerGrades[b.name] !== undefined ? editedPlayerGrades[b.name] : (b.grade || '3'));
      if (gradeA !== gradeB) {
        return gradeB.localeCompare(gradeA); // 3 -> 2 -> 1
      }
      const nameA = String(editedPlayerNames[a.name] || a.name);
      const nameB = String(editedPlayerNames[b.name] || b.name);
      return nameA.localeCompare(nameB, 'ja'); // 五十音順
    });
    setHitterOrderList(sortedHitters.map(p => p.name));
  };

  // Sync player data for editing (with crash guard checks)
  useEffect(() => {
    if (hittingPlayerData) {
      setEditedHittingRows(getHittingRowsForPattern(hittingPlayerData.rows, hittingPattern));
      setEditedCompareStats(hittingPlayerData.compareStats ? { ...hittingPlayerData.compareStats } : {
        currentEv: 152.7,
        currentBat: 118.4,
        prevEv: 150.3,
        prevBat: 115.4,
        teamEv: 140.8,
        teamBat: 108.9,
        koshienEv: 150.0,
        koshienBat: 120.0
      });
    }
    if (pitchingPlayerData) {
      setEditedPitchingRows([...pitchingPlayerData.rows]);
      setEditedQuickTimes(pitchingPlayerData.quickTimes ? { ...pitchingPlayerData.quickTimes } : null);
      setEditedPreviousStraight(pitchingPlayerData.previousStraight ? { ...pitchingPlayerData.previousStraight } : {
        speed: 0,
        spin: 0,
        efficiency: 0,
        vb: 0,
        hb: 0,
        control: 0
      });
    }
  }, [hittingPlayerData, pitchingPlayerData, hittingPattern]);

  // Initialize name and reset edit mode when selectedPlayer changes
  useEffect(() => {
    setEditedName(selectedPlayer);
    setIsEditing(false);
  }, [selectedPlayer]);

  // Sync comparison data to edited pitching inputs (auto-bind comparison average quick time to 'previous' field)
  useEffect(() => {
    if (!isHitting && pitchingPlayerData) {
      if (comparePitchingPlayerData && comparePitchingPlayerData.quickTimes) {
        const compareAvg = comparePitchingPlayerData.quickTimes.average;
        if (compareAvg !== undefined) {
          setEditedQuickTimes(prev => {
            const base = prev || pitchingPlayerData.quickTimes || { fastest: 0, average: 0, previous: 0 };
            return {
              ...base,
              previous: compareAvg
            };
          });
        }
      } else {
        // Fallback to original previous stats if no compare doc is selected
        setEditedQuickTimes(prev => {
          const orig = pitchingPlayerData.quickTimes;
          if (!orig) return prev;
          return {
            ...(prev || { fastest: 0, average: 0, previous: 0 }),
            previous: orig.previous
          };
        });
      }
    }
  }, [comparePitchingPlayerData, pitchingPlayerData, isHitting]);

  if (!document) {
    return (
      <div className="analysis-empty-container glass-panel">
        <Database size={48} className="empty-icon" />
        <h3>野球分析資料システム</h3>
        <p>Rapsodo CSVや測定結果PDFをアップロードすると、お手本PDFを完全再現した高精細レポートとAIチームフィードバックが起動します。</p>
      </div>
    );
  }

  const handleCopyMarkdown = () => {
    if (!sheetData) return;

    const mdContent = `# ${document.title} - Rapsodoデータ分析シート

## 1. 総合評価
${sheetData.summary}

## 2. 主要データ数値
${sheetData.keyMetrics}

## 3. 動作・球種/スイング軌道分析
${sheetData.mechanics}

## 4. 強みと成果
${sheetData.strengths}

## 5. 改善ポイント
${sheetData.improvements}

## 6. 推奨練習メニュー・ドリル
${sheetData.trainingPlan}

---
生成日: ${new Date().toLocaleDateString()} (AI野球データ分析アシスタント)
`;

    navigator.clipboard.writeText(mdContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = () => {
    if (activeTab === 'sheet') {
      if (editedSheetData) {
        onSaveSheet(editedSheetData);
      }
      
      const playersToSave = new Set<string>();
      Object.keys(editedPlayerNames).forEach(n => playersToSave.add(n));
      Object.keys(editedPlayerGrades).forEach(n => playersToSave.add(n));

      if (playersToSave.size > 0) {
        playersToSave.forEach(oldName => {
          const newName = editedPlayerNames[oldName] !== undefined ? editedPlayerNames[oldName] : oldName;
          let newGrade = editedPlayerGrades[oldName] !== undefined ? editedPlayerGrades[oldName] : '';
          
          if (!newGrade) {
            const match = newName.match(/[\s_-]?([123１２３])年生?$/) || newName.match(/[\s_-]([123１２３])$/) || newName.match(/([123１２３])$/);
            if (match) {
              const val = match[1];
              if (val === '3' || val === '３') newGrade = '3';
              else if (val === '2' || val === '２') newGrade = '2';
              else newGrade = '1';
            }
          }
          
          const isHitter = allHittingPlayers.some(p => p.name === oldName);
          if (isHitter) {
            const hitter = allHittingPlayers.find(p => p.name === oldName);
            if (hitter) {
              const updatedExtra = { 
                compareStats: hitter.compareStats, 
                grade: newGrade || hitter.grade 
              };
              onSavePlayerStats(oldName, hitter.rows, updatedExtra, newName);
            }
          } else {
            const pitcher = allPitchingPlayers.find(p => p.name === oldName);
            if (pitcher) {
              const updatedExtra = { 
                quickTimes: pitcher.quickTimes, 
                previousStraight: pitcher.previousStraight,
                grade: newGrade || pitcher.grade
              };
              onSavePlayerStats(oldName, pitcher.rows, updatedExtra, newName);
            }
          }
        });
        setEditedPlayerNames({});
        setEditedPlayerGrades({});
      }
      setIsEditing(false);
    } else if (activeTab === 'individual') {
      if (isHitting) {
        onSavePlayerStats(selectedPlayer, editedHittingRows, { compareStats: editedCompareStats }, editedName);
      } else {
        onSavePlayerStats(selectedPlayer, editedPitchingRows, { quickTimes: editedQuickTimes, previousStraight: editedPreviousStraight }, editedName);
      }
      setIsEditing(false);
    }
  };

  const handlePlayerNameBlur = (oldName: string, newName: string) => {
    if (!newName || newName.trim() === '' || newName === oldName) return;

    let newGrade = '';
    const match = newName.match(/[\s_-]?([123１２３])年生?$/) || newName.match(/[\s_-]([123１２３])$/) || newName.match(/([123１２３])$/);
    if (match) {
      const val = match[1];
      if (val === '3' || val === '３') newGrade = '3';
      else if (val === '2' || val === '２') newGrade = '2';
      else newGrade = '1';
    }

    const isHitter = allHittingPlayers.some(p => p.name === oldName);
    if (isHitter) {
      const hitter = allHittingPlayers.find(p => p.name === oldName);
      if (hitter) {
        const updatedExtra = { 
          compareStats: hitter.compareStats, 
          grade: newGrade || hitter.grade 
        };
        onSavePlayerStats(oldName, hitter.rows, updatedExtra, newName);
      }
    } else {
      const pitcher = allPitchingPlayers.find(p => p.name === oldName);
      if (pitcher) {
        const updatedExtra = { 
          quickTimes: pitcher.quickTimes, 
          previousStraight: pitcher.previousStraight,
          grade: newGrade || pitcher.grade
        };
        onSavePlayerStats(oldName, pitcher.rows, updatedExtra, newName);
      }
    }

    setEditedPlayerNames(prev => {
      const updated = { ...prev };
      delete updated[oldName];
      return updated;
    });
  };

  const handleIndividualNameBlur = (newName: string) => {
    if (!newName || newName.trim() === '' || newName === selectedPlayer) return;

    let newGrade = '';
    const match = newName.match(/[\s_-]?([123１２３])年生?$/) || newName.match(/[\s_-]([123１２３])$/) || newName.match(/([123１２３])$/);
    if (match) {
      const val = match[1];
      if (val === '3' || val === '３') newGrade = '3';
      else if (val === '2' || val === '２') newGrade = '2';
      else newGrade = '1';
    }

    if (isHitting) {
      const hitter = allHittingPlayers.find(p => p.name === selectedPlayer);
      if (hitter) {
        const updatedExtra = { 
          compareStats: hitter.compareStats, 
          grade: newGrade || hitter.grade 
        };
        onSavePlayerStats(selectedPlayer, hitter.rows, updatedExtra, newName);
      }
    } else {
      const pitcher = allPitchingPlayers.find(p => p.name === selectedPlayer);
      if (pitcher) {
        const updatedExtra = { 
          quickTimes: pitcher.quickTimes, 
          previousStraight: pitcher.previousStraight,
          grade: newGrade || pitcher.grade
        };
        onSavePlayerStats(selectedPlayer, pitcher.rows, updatedExtra, newName);
      }
    }
  };

  const handleHitterAdjustRateBlur = (playerName: string, type: 'handThrow' | 'tee', valStr: string) => {
    const val = parseFloat(valStr);
    if (isNaN(val)) return;
    
    const player = allHittingPlayers.find(p => p.name === playerName);
    if (player) {
      const updatedRows = player.rows.map(r => {
        if (r.type === type) {
          return { ...r, adjustRate: val };
        }
        return r;
      });
      onSavePlayerStats(playerName, updatedRows, { compareStats: player.compareStats, grade: player.grade });
    }
  };

  const handlePitcherControlBlur = (playerName: string, valStr: string) => {
    const val = parseFloat(valStr);
    if (isNaN(val)) return;
    
    const player = allPitchingPlayers.find(p => p.name === playerName);
    if (player) {
      const updatedRows = player.rows.map(r => {
        if (r.pitchType === 'ストレート' && !r.isMax) {
          return { ...r, control: val };
        }
        return r;
      });
      onSavePlayerStats(playerName, updatedRows, { quickTimes: player.quickTimes, previousStraight: player.previousStraight, grade: player.grade });
    }
  };

  const handleIndividualHittingCellBlur = () => {
    onSavePlayerStats(selectedPlayer, editedHittingRows, { compareStats: editedCompareStats });
  };

  const handlePitchingTitleChange = (val: string) => {
    setCustomPitchingTitle(val);
    localStorage.setItem('customPitchingTitle', val);
  };
  const handleHittingTitleChange = (val: string) => {
    setCustomHittingTitle(val);
    localStorage.setItem('customHittingTitle', val);
  };
  const handlePitchingDateChange = (val: string) => {
    setCustomPitchingDate(val);
    localStorage.setItem('customPitchingDate', val);
  };
  const handleHittingDateChange = (val: string) => {
    setCustomHittingDate(val);
    localStorage.setItem('customHittingDate', val);
  };

  const handleFieldChange = (key: keyof AnalysisSheetData, value: string) => {
    if (editedSheetData) {
      setEditedSheetData({
        ...editedSheetData,
        [key]: value
      });
    }
  };

  // Cell edits
  const handlePitchingCellChange = (index: number, field: keyof PitchingStatsRow, value: string) => {
    const updated = [...editedPitchingRows];
    const numValue = parseFloat(value);
    updated[index] = {
      ...updated[index],
      [field]: isNaN(numValue) ? value : numValue
    };
    setEditedPitchingRows(updated);
  };

  const handlePreviousStraightChange = (field: keyof PreviousStraightStats, value: string) => {
    const numValue = parseFloat(value);
    const updated = {
      ...editedPreviousStraight,
      [field]: isNaN(numValue) ? 0 : numValue
    };
    setEditedPreviousStraight(updated);
    onSavePlayerStats(selectedPlayer, editedPitchingRows, {
      quickTimes: editedQuickTimes || pitchingPlayerData?.quickTimes,
      previousStraight: updated
    });
  };

  const handleCompareStatsChange = (field: keyof HittingCompareStats, value: string) => {
    const numValue = parseFloat(value);
    const updated = {
      ...editedCompareStats,
      [field]: isNaN(numValue) ? 0 : numValue
    };
    setEditedCompareStats(updated);
    onSavePlayerStats(selectedPlayer, editedHittingRows, {
      compareStats: updated
    });
  };

  const handleHittingCellChangeRealtime = (index: number, field: keyof HittingStatsRow, value: string) => {
    const updated = [...editedHittingRows];
    const numValue = parseFloat(value);
    updated[index] = {
      ...updated[index],
      [field]: isNaN(numValue) ? value : numValue
    };
    setEditedHittingRows(updated);
    onSavePlayerStats(selectedPlayer, updated, {
      compareStats: editedCompareStats
    });
  };


  const renderBulkPlayerHittingSheet = (player: HittingPlayer) => {
    const comparePlayer = allCompareHittingPlayers.find((p: HittingPlayer) => p.name === player.name) || null;
    const sortedRows = [...player.rows];
    sortedRows.sort((a, b) => {
      const order = { '手投げ': 1, '置きT': 2, '前回（置きT）': 3 };
      const valA = order[a.type as keyof typeof order] || 99;
      const valB = order[b.type as keyof typeof order] || 99;
      return valA - valB;
    });

    return (
      <>
        <div className="noble-pitching-header">
          <div className="noble-header-top">
            <div className="noble-header-batter" style={{ borderBottom: 'none', fontSize: '24px' }}>Hitting</div>
            <div className="noble-header-name">
              <span className="label">氏名</span>
              <span className="value" style={{ fontWeight: '900', fontSize: '20px', padding: '0 6px', color: '#000' }}>
                {player.name}
              </span>
            </div>
            <div className="noble-header-date">
              <span className="label">計測日</span>
              <span className="value">{player.measurementDate || '2026/●/●'}</span>
            </div>
          </div>
          <div className="noble-chevron-divider"></div>
        </div>

        <table className="noble-main-table noble-hitting-main-table" style={{ marginBottom: '20px' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: '120px' }}>測定種別</th>
              <th>打球速度</th>
              <th>打球角度</th>
              <th>バット速度</th>
              <th>アッパースイング度</th>
              <th>アジャスト率</th>
            </tr>
            <tr>
              <th>(km/h)</th>
              <th>(deg.)</th>
              <th>(km/h)</th>
              <th>(deg.)</th>
              <th>(%)</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.type}>
                <td style={{ backgroundColor: '#f2f2f2', fontWeight: 'bold', fontSize: '11px', textAlign: 'center', verticalAlign: 'middle', padding: '4px 2px', lineHeight: '1.2' }}>
                  {row.type === '前回（置きT）' ? (
                    <>
                      前回<br/>
                      <span style={{ fontSize: '9px', fontWeight: 'normal', color: '#555' }}>（置きT）</span>
                    </>
                  ) : (
                    row.type
                  )}
                </td>
                <td>{row.exitVelocity.toFixed(1)}</td>
                <td>{row.launchAngle.toFixed(1)}</td>
                <td>{row.batSpeed.toFixed(1)}</td>
                <td>{row.attackAngle.toFixed(1)}</td>
                <td>{row.adjustRate.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Scatter section: exact web layout with 26px spacers */}
        <div className="noble-green-box" style={{ flexDirection: 'column', justifyContent: 'flex-start', gap: '6px', width: '100%', boxSizing: 'border-box', padding: '10px 12px', marginBottom: '8px' }}>
          <div style={{ fontSize: '13px', fontWeight: '800', textAlign: 'center', color: '#111' }}>打球角度と打球速度の関係（全打球）</div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
            {/* Column 1: silhouette + today scatter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
                <div style={{ height: '26px' }}></div>
                <img src="/batter_silhouette.png" alt="シルエット" style={{ width: '55px', height: '100px', objectFit: 'contain' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ height: '26px' }}></div>
                {renderNobleHittingScatter(sortedRows, false, comparePlayer ? comparePlayer.rows : null, player.rawHits, comparePlayer ? comparePlayer.rawHits : null, player.name)}
              </div>
            </div>
            {/* Dotted divider */}
            <div style={{ borderLeft: '2px dotted #2d8a4e', height: '220px', flexShrink: 0, margin: '0 4px', alignSelf: 'flex-end', marginBottom: '26px' }}></div>
            {/* Column 2: previous scatter */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ height: '26px', display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: 'bold' }}>前回</div>
              {renderNobleHittingScatter(sortedRows, true, comparePlayer ? comparePlayer.rows : null, player.rawHits, comparePlayer ? comparePlayer.rawHits : null, player.name)}
            </div>
          </div>
        </div>


        {/* Bottom section: 1 green box with title + matrix + table side by side (matches web) */}
        <div className="noble-green-box" style={{ flexDirection: 'column', justifyContent: 'flex-start', gap: '8px', width: '100%', boxSizing: 'border-box', padding: '10px 12px', margin: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: '800', textAlign: 'center', color: '#111' }}>打球速度とバット速度（置きT）</div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '30px', flexWrap: 'nowrap' }}>
            {/* Left: Hitting matrix (course analysis) */}
            <div>
              {renderNobleHittingMatrix(player.compareStats || {
                currentEv: sortedRows.find(r => r.type === '置きT')?.exitVelocity || 0,
                currentBat: sortedRows.find(r => r.type === '置きT')?.batSpeed || 0,
                prevEv: sortedRows.find(r => r.type === '前回（置きT）')?.exitVelocity || 0,
                prevBat: sortedRows.find(r => r.type === '前回（置きT）')?.batSpeed || 0,
                teamEv: 135.0,
                teamBat: 105.0,
                koshienEv: 145.0,
                koshienBat: 115.0
              })}
            </div>
            {/* Right: Comparison table */}
            <table className="noble-compare-table noble-hitting-compare-table" style={{ margin: 0, minWidth: '220px' }}>
              <thead>
                <tr>
                  <th style={{ backgroundColor: '#f2f2f2', width: '90px' }}>置きT</th>
                  <th>打球速度<br/>(km/h)</th>
                  <th>バット速度<br/>(km/h)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ backgroundColor: '#ff0000', color: '#fff', fontWeight: 'bold' }}>今回</td>
                  <td>{(player.compareStats?.currentEv || sortedRows.find(r => r.type === '置きT')?.exitVelocity || 0).toFixed(1)}</td>
                  <td>{(player.compareStats?.currentBat || sortedRows.find(r => r.type === '置きT')?.batSpeed || 0).toFixed(1)}</td>
                </tr>
                <tr>
                  <td style={{ backgroundColor: '#d9d9d9', color: '#000', fontWeight: 'bold' }}>前回</td>
                  <td>{player.compareStats?.prevEv ? player.compareStats.prevEv.toFixed(1) : '-'}</td>
                  <td>{player.compareStats?.prevBat ? player.compareStats.prevBat.toFixed(1) : '-'}</td>
                </tr>
                <tr>
                  <td style={{ backgroundColor: '#d9d9d9', color: '#000', fontWeight: 'bold' }}>チーム平均</td>
                  <td>{(player.compareStats?.teamEv || 135.0).toFixed(1)}</td>
                  <td>{(player.compareStats?.teamBat || 105.0).toFixed(1)}</td>
                </tr>
                <tr>
                  <td className="koshien-cell" style={{ fontWeight: 'bold' }}>甲子園目安</td>
                  <td>{(player.compareStats?.koshienEv || 145.0).toFixed(1)}</td>
                  <td>{(player.compareStats?.koshienBat || 115.0).toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  const renderBulkPlayerPitchingSheet = (player: PitchingPlayer) => {
    const sortedRows = [...player.rows];

    // --- Dynamic sizing based on unique pitch type count ---
    const uniquePitchTypes = [...new Set(sortedRows.filter(r => !r.isMax).map(r => r.pitchType))];
    const pitchCount = uniquePitchTypes.length;
    // Chart size: significantly smaller for print to prevent overflow
    // Formula: base 280, reduce 12px per pitch type beyond 4
    const chartSize = Math.max(200, 280 - Math.max(0, pitchCount - 4) * 12);
    // CSS class for dynamic table cell sizing (uses !important to override general print CSS)
    const tableSizeClass = pitchCount <= 4 ? '' : pitchCount <= 6 ? 'pitch-count-5-6' : pitchCount <= 8 ? 'pitch-count-7-8' : 'pitch-count-9p';

    return (
      <>
        <div className="noble-pitching-header">
          <div className="noble-header-top">
            <div className="noble-header-batter" style={{ borderBottom: 'none', fontSize: '24px' }}>Pitcher Report</div>
            <div className="noble-header-name">
              <span className="label">氏名</span>
              <span className="value" style={{ fontWeight: '900', fontSize: '20px', padding: '0 6px', color: '#000' }}>
                {player.name}
              </span>
            </div>
            <div className="noble-header-date">
              <span className="label">計測日</span>
              <span className="value">{player.measurementDate || '2026/●/●'}</span>
            </div>
          </div>
          <div className="noble-chevron-divider"></div>
        </div>

        {/* 1. Main Stats Table - grouped by pitch type, tableSizeClass controls cell size */}
        <table className={`noble-main-table ${tableSizeClass}`} style={{ marginBottom: '8px', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '80px' }}>球種</th>
              <th style={{ width: '48px' }}></th>
              <th>投球速度<br/>(km/h)</th>
              <th>総回転量<br/>(rpm)</th>
              <th>回転効率<br/>(%)</th>
              <th>回転方向<br/>(hh:mm)</th>
              <th>縦の変化量<br/>(cm)</th>
              <th>横の変化量<br/>(cm)</th>
              <th>リリース横<br/>(m)</th>
              <th>リリース縦<br/>(m)</th>
              <th>ジャイロ角度<br/>(deg.)</th>
              <th style={{ width: '48px' }}>制球率<br/>(%)</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Group rows by pitch type, preserving order
              const pitchOrder = [
                'ストレート', 'ストレートクイック', 'ツーシーム', 'ワンシーム',
                'カットボール', 'スライダー', 'カーブ', 'スプリット',
                'フォーク', 'チェンジアップ', 'シンカー', 'シュート'
              ];
              const seenTypes: string[] = [];
              sortedRows.forEach(r => {
                if (!seenTypes.includes(r.pitchType)) seenTypes.push(r.pitchType);
              });
              const orderedTypes = [
                ...pitchOrder.filter(t => seenTypes.includes(t)),
                ...seenTypes.filter(t => !pitchOrder.includes(t))
              ];

              const rows: React.ReactNode[] = [];
              orderedTypes.forEach(pitchType => {
                const maxRow = sortedRows.find(r => r.pitchType === pitchType && r.isMax);
                const avgRow = sortedRows.find(r => r.pitchType === pitchType && !r.isMax);
                // Only show max row for straight-type pitches; other pitches show avg only
                const isStraitType = pitchType === 'ストレート' || pitchType === 'ストレートクイック';
                const typeRows = (isStraitType ? [maxRow, avgRow] : [avgRow]).filter(Boolean) as typeof sortedRows;
                const rowSpanCount = typeRows.length;


                // Get control from avg row (or max row as fallback)
                const controlVal = (avgRow ?? maxRow)?.control;

                typeRows.forEach((row, rowIdx) => {
                  const isFirstInGroup = rowIdx === 0;
                  const pitchBg = getPitchColor(pitchType);
                  // Determine text color: light background pitch types get black text
                  const pitchTextColor = getPitchTextColor(pitchType);
                  rows.push(
                    <tr key={`${pitchType}-${rowIdx}`} style={{ backgroundColor: row.isMax ? '#e2e8f0' : '#ffffff' }}>
                      {isFirstInGroup && (
                        <td
                          rowSpan={rowSpanCount}
                          className={`pitch-name-cell ${getPitchClass(pitchType)}`}
                          style={{
                            backgroundColor: pitchBg,
                            color: pitchTextColor,
                            fontWeight: 'bold',
                            verticalAlign: 'middle',
                            textAlign: 'center',
                            WebkitPrintColorAdjust: 'exact',
                            printColorAdjust: 'exact'
                          }}
                        >
                          {pitchType === 'ストレートクイック' ? 'クイック' : pitchType}
                        </td>
                      )}
                      <td>{row.isMax ? '最大' : '平均'}</td>
                      <td style={{ fontWeight: row.isMax ? 'bold' : 'normal' }}>{row.speed.toFixed(1)}</td>
                      <td>{row.spin}</td>
                      <td>{row.efficiency.toFixed(1)}</td>
                      <td>{row.direction}</td>
                      <td>{row.vb.toFixed(1)}</td>
                      <td>{row.hb.toFixed(1)}</td>
                      <td>{row.relH.toFixed(2)}</td>
                      <td>{row.relV.toFixed(2)}</td>
                      <td>{row.gyro.toFixed(1)}</td>
                      {isFirstInGroup && (
                        <td rowSpan={rowSpanCount} style={{ verticalAlign: 'middle', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#ffffff' }}>
                          {controlVal !== undefined ? controlVal.toFixed(1) : '-'}
                        </td>
                      )}
                    </tr>
                  );
                });
              });
              return rows;
            })()}
          </tbody>
        </table>

        {/* 2. Top Section: Comparison and Quick (縦並び) - matches screen exactly! */}
        <div className="noble-top-row" style={{ width: '100%', marginBottom: '8px' }}>
          {/* Comparison stats table (Straight) */}
          <div style={{ width: '100%', marginBottom: '8px' }}>
            {(() => {
              const straightMax = sortedRows.find(r => r.pitchType === 'ストレート' && r.isMax);
              const prev = player.previousStraight;
              return (
                <table className="noble-compare-table" style={{ marginBottom: 0, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ backgroundColor: '#fcd5d5', color: '#000000', width: '120px' }}>ストレート</th>
                      <th>投球速度</th>
                      <th>総回転量</th>
                      <th>回転効率</th>
                      <th>縦の変化量</th>
                      <th>横の変化量</th>
                      <th>制球率</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="row-label">今回</td>
                      <td>{straightMax ? straightMax.speed.toFixed(1) : '-'}</td>
                      <td>{straightMax ? straightMax.spin : '-'}</td>
                      <td>{straightMax ? straightMax.efficiency.toFixed(1) : '-'}</td>
                      <td>{straightMax ? straightMax.vb.toFixed(1) : '-'}</td>
                      <td>{straightMax ? straightMax.hb.toFixed(1) : '-'}</td>
                      <td>{straightMax ? straightMax.control.toFixed(1) : '-'}</td>
                    </tr>
                    <tr className="previous-row">
                      <td className="row-label">前回</td>
                      <td>{prev?.speed ? prev.speed.toFixed(1) : '-'}</td>
                      <td>{prev?.spin ? prev.spin : '-'}</td>
                      <td>{prev?.efficiency ? prev.efficiency.toFixed(1) : '-'}</td>
                      <td>{prev?.vb ? prev.vb.toFixed(1) : '-'}</td>
                      <td>{prev?.hb ? prev.hb.toFixed(1) : '-'}</td>
                      <td>{prev?.control ? prev.control.toFixed(1) : '-'}</td>
                    </tr>
                    <tr className="team-avg-row">
                      <td className="row-label">チーム平均</td>
                      <td>120.6</td>
                      <td>1920</td>
                      <td>88.1</td>
                      <td>39.9</td>
                      <td>24.4</td>
                      <td>53.3</td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>

          {/* Quick Table */}
          <div className="noble-quick-container" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 0, marginTop: '12px', width: '100%' }}>
            <table className="noble-quick-print-table" style={{ margin: 0, borderCollapse: 'collapse', width: 'auto', border: '1.5px solid #222' }}>
              <tbody>
                <tr>
                  <td rowSpan={2} style={{ backgroundColor: '#fcd5d5', color: '#000000', verticalAlign: 'middle', fontWeight: 'bold', textAlign: 'center', border: '1.5px solid #222', padding: '8px 8px', fontSize: '10px', whiteSpace: 'nowrap', width: '156px' }}>クイック</td>
                  <th style={{ border: '1.5px solid #222', padding: '8px 8px', fontSize: '9px', fontWeight: 'normal', backgroundColor: '#f8f8f8', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', width: '140px' }}>最短タイム（秒）</th>
                  <th style={{ border: '1.5px solid #222', padding: '8px 8px', fontSize: '9px', fontWeight: 'normal', backgroundColor: '#f8f8f8', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', width: '140px' }}>平均タイム（秒）</th>
                  <th style={{ border: '1.5px solid #222', padding: '8px 8px', fontSize: '9px', fontWeight: 'normal', backgroundColor: '#f8f8f8', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', color: '#2d8a4e', width: '140px' }}>前回タイム（秒）</th>
                </tr>
                <tr>
                  <td style={{ border: '1.5px solid #222', padding: '8px 8px', fontSize: '9px', textAlign: 'center', verticalAlign: 'middle' }}>{player.quickTimes?.fastest ? player.quickTimes.fastest.toFixed(2) : '-'}</td>
                  <td style={{ border: '1.5px solid #222', padding: '8px 8px', fontSize: '9px', textAlign: 'center', verticalAlign: 'middle' }}>{player.quickTimes?.average ? player.quickTimes.average.toFixed(2) : '-'}</td>
                  <td style={{ border: '1.5px solid #222', padding: '8px 8px', fontSize: '9px', textAlign: 'center', verticalAlign: 'middle', color: '#2d8a4e' }}>{player.quickTimes?.previous ? player.quickTimes.previous.toFixed(2) : '-'}</td>
                </tr>
              </tbody>
            </table>
            <div className="quick-target-text" style={{ whiteSpace: 'nowrap', fontSize: '10.5px', fontWeight: 'bold', color: '#111' }}>
              目標は1.29秒以内
            </div>
          </div>
        </div>

        {/* 3. Bottom Section: both charts side-by-side - chartSize adapts to pitch count */}
        <div className="noble-green-box" style={{ display: 'flex', flexWrap: 'nowrap', width: '100%', boxSizing: 'border-box', padding: '8px', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ width: '49%', display: 'flex', justifyContent: 'center' }}>
            {renderNobleScatterPlot(sortedRows, true, chartSize)}
          </div>
          <div style={{ borderLeft: '2.5px solid #2d8a4e', alignSelf: 'stretch', margin: '0 4px' }}></div>
          <div style={{ width: '49%', display: 'flex', justifyContent: 'center' }}>
            {renderNobleVelocityChart(sortedRows, true, Math.max(250, chartSize + 60))}
          </div>
        </div>
      </>
    );
  }
  // ----------------------------------------------------
  // Pitching/Hitting Summary Print rendering functions (overall reports)
  // ----------------------------------------------------
  const renderBulkPitchingSummarySheet = () => {
    const rightPitchers = allPitchingPlayers.filter(p => p.handedness === 'R');
    const leftPitchers = allPitchingPlayers.filter(p => p.handedness === 'L');

    const renderRosterPages = (pitchers: typeof allPitchingPlayers, title: string, startPageIdx: number) => {
      const rowsData = pitchers.map(p => {
        const straightAvg = p.rows.find(r => r.pitchType === 'ストレート' && !r.isMax);
        const straightMax = p.rows.find(r => r.pitchType === 'ストレート' && r.isMax) || straightAvg;
        const control = straightAvg?.control || 60.0;
        return {
          name: p.name,
          avg: straightAvg,
          max: straightMax,
          control: control,
          quickAvg: p.quickTimes?.average || 0
        };
      }).filter(d => d.avg !== undefined);

      if (rowsData.length === 0) return { elements: [], count: 0 };

      const pages: React.ReactNode[] = [];
      const totalCount = rowsData.length;
      const totalPages = Math.ceil(totalCount / summaryPageSize);

      for (let pIdx = 0; pIdx < totalPages; pIdx++) {
        const pageRows = rowsData.slice(pIdx * summaryPageSize, (pIdx + 1) * summaryPageSize);
        const isFirstPage = startPageIdx === 0 && pIdx === 0;
        const isLastPage = pIdx === totalPages - 1;

        const maxSpeeds = rowsData.map(d => d.max?.speed).filter((s): s is number => s !== undefined && !isNaN(s));
        const maxSpins = rowsData.map(d => d.max?.spin).filter((s): s is number => s !== undefined && !isNaN(s));
        const controls = rowsData.map(d => d.control).filter((c): c is number => c !== undefined && !isNaN(c));
        const quicks = rowsData.map(d => d.quickAvg).filter((q): q is number => q !== undefined && q > 0);

        const summarySpeed = maxSpeeds.length > 0 ? maxSpeeds.reduce((a, b) => a + b, 0) / maxSpeeds.length : 0;
        const summarySpin = maxSpins.length > 0 ? maxSpins.reduce((a, b) => a + b, 0) / maxSpins.length : 0;
        const summaryControl = controls.length > 0 ? controls.reduce((a, b) => a + b, 0) / controls.length : 0;
        const summaryQuick = quicks.length > 0 ? quicks.reduce((a, b) => a + b, 0) / quicks.length : 0;

        pages.push(
          <div 
            key={`${title}-page-${pIdx}`} 
            className={`pdf-page-replica pitching-replica ${!isFirstPage ? 'print-page-break' : ''}`} 
            style={{ width: '850px', minWidth: '850px', margin: '0 auto', padding: '16px 24px' }}
          >
            {/* Header */}
            <div className="noble-pitching-header">
              <div className="noble-header-top">
                <div className="noble-header-batter" style={{ borderBottom: 'none', fontSize: '24px' }}>
                  {customPitchingTitle}
                </div>
                <div className="noble-header-date" style={{ borderBottom: 'none' }}>
                  <span className="value" style={{ borderBottom: 'none', fontSize: '20px' }}>
                    {customPitchingDate || allPitchingPlayers[0]?.measurementDate || '2026/●/●'}
                  </span>
                </div>
              </div>
              <div className="noble-chevron-divider"></div>
            </div>

            <div style={{ fontSize: '24px', fontWeight: '900', color: title.includes('左') ? '#3b82f6' : '#d31b1b', marginBottom: '15px' }}>
              {title} {totalPages > 1 ? `(${pIdx + 1}/${totalPages}ページ)` : ''}
            </div>

            {/* Main Table */}
            <table className="noble-main-table noble-roster-print-table" style={{ fontSize: '11px', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>氏名</th>
                  <th style={{ width: '50px' }}></th>
                  <th>投球速度<br/>(km/h)</th>
                  <th>総回転量<br/>(rpm)</th>
                  <th>回転効率<br/>(%)</th>
                  <th>回転方向<br/>(時:分)</th>
                  <th>縦の<br/>変化量<br/>(cm)</th>
                  <th>横の<br/>変化量<br/>(cm)</th>
                  <th>リリース<br/>角度(横)<br/>(°)</th>
                  <th>リリース<br/>角度(縦)<br/>(°)</th>
                  <th>ジャイロ<br/>角度<br/>(°)</th>
                  <th>制球率<br/>(%)</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((d, index) => {
                  const isHighlight = d.control >= 60.0;
                  const highlightBg = '#ffff00';
                  const isEvenPlayer = index % 2 === 1;
                  const playerBgColor = isEvenPlayer ? '#f2f2f2' : '#ffffff';
                  const controlBgColor = isHighlight ? highlightBg : playerBgColor;
                  const displayName = editedPlayerNames[d.name] || d.name;

                  return (
                    <React.Fragment key={d.name}>
                      <tr style={{ backgroundColor: playerBgColor }}>
                        <td rowSpan={2} className={`grade-color-${editedPlayerGrades[d.name] === '3' || editedPlayerGrades[d.name] === '3年生' ? '3' : (editedPlayerGrades[d.name] === '2' || editedPlayerGrades[d.name] === '2年生' ? '2' : '1')}`} style={{ 
                          verticalAlign: 'middle', 
                          fontWeight: 'bold', 
                          backgroundColor: playerBgColor,
                          borderRight: '1.5px solid #222',
                          textAlign: 'center'
                        }}>
                          {displayName}
                        </td>
                        <td style={{ backgroundColor: playerBgColor }}>平均値</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.avg?.speed.toFixed(1)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.avg?.spin}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.avg?.efficiency.toFixed(1)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.avg?.direction}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.avg?.vb.toFixed(1)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.avg?.hb.toFixed(1)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.avg?.relH.toFixed(2)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.avg?.relV.toFixed(2)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.avg?.gyro.toFixed(1)}</td>
                        <td rowSpan={2} style={{ 
                          verticalAlign: 'middle', 
                          fontWeight: 'bold',
                          backgroundColor: controlBgColor,
                          textAlign: 'center'
                        }}>
                          {d.control.toFixed(1)}
                        </td>
                      </tr>
                      <tr style={{ backgroundColor: playerBgColor }}>
                        <td style={{ backgroundColor: playerBgColor }}>最大速度</td>
                        <td style={{ backgroundColor: playerBgColor, fontWeight: 'bold' }}>{d.max?.speed.toFixed(1)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.max?.spin}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.max?.efficiency.toFixed(1)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.max?.direction}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.max?.vb.toFixed(1)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.max?.hb.toFixed(1)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.max?.relH.toFixed(2)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.max?.relV.toFixed(2)}</td>
                        <td style={{ backgroundColor: playerBgColor }}>{d.max?.gyro.toFixed(1)}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Summary Box (Only displays on the last page of this thrower-arm group) */}
            {isLastPage && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', justifyContent: 'flex-start' }}>
                  <div style={{ width: '40px', height: '20px', backgroundColor: '#ffff00', border: '1.5px solid #222' }}></div>
                  <span>制球率が60%以上</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '15px' }}>
                  <table className="noble-main-table noble-summary-mini-table" style={{ width: 'auto', minWidth: '450px', margin: '0 auto', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <tbody>
                      <tr>
                        <th rowSpan={2} style={{ width: '20%', backgroundColor: '#2f5597', color: '#fff', verticalAlign: 'middle', fontSize: '12px', fontWeight: 'bold', padding: '12px 10px', height: '36px', border: '1.5px solid #222' }}>
                          最大速度時の<br/>平均値
                        </th>
                        <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px', padding: '8px 10px', height: '18px', border: '1.5px solid #222' }}>投球速度<br/>(km/h)</th>
                        <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px', padding: '8px 10px', height: '18px', border: '1.5px solid #222' }}>総回転量<br/>(rpm)</th>
                        <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px', padding: '8px 10px', height: '18px', border: '1.5px solid #222' }}>制球率<br/>(%)</th>
                        <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px', padding: '8px 10px', height: '18px', border: '1.5px solid #222' }}>チーム<br/>クイック平均(秒)</th>
                      </tr>
                      <tr>
                        <td style={{ width: '20%', fontWeight: 'bold', fontSize: '14px', height: '36px', padding: '8px 10px', verticalAlign: 'middle', border: '1.5px solid #222', textAlign: 'center' }}>{summarySpeed.toFixed(1)}</td>
                        <td style={{ width: '20%', fontSize: '14px', height: '36px', padding: '8px 10px', verticalAlign: 'middle', border: '1.5px solid #222', textAlign: 'center' }}>{Math.round(summarySpin)}</td>
                        <td style={{ width: '20%', fontSize: '14px', height: '36px', padding: '8px 10px', verticalAlign: 'middle', border: '1.5px solid #222', textAlign: 'center' }}>{summaryControl.toFixed(1)}</td>
                        <td style={{ width: '20%', fontSize: '14px', height: '36px', padding: '8px 10px', verticalAlign: 'middle', border: '1.5px solid #222', textAlign: 'center' }}>{summaryQuick.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      }

      return { elements: pages, count: totalPages };
    };

    const rightResult = renderRosterPages(rightPitchers, '右投げ', 0);
    const leftResult = renderRosterPages(leftPitchers, '左投げ', rightResult.count);

    return (
      <>
        {rightResult.elements}
        {leftResult.elements}
      </>
    );
  };

  const renderBulkHittingSummarySheet = () => {
    const rowsData = allHittingPlayers.map((p, index) => {
      let handThrowRow = p.rows.find(r => r.type === '手投げ');
      let teeRow = p.rows.find(r => r.type === '置きT');
      if (!handThrowRow) {
        handThrowRow = p.rows.find(r => r.type === '真ん中') || p.rows.find(r => r.type === 'ポイント前') || p.rows[0];
      }
      if (!teeRow) {
        teeRow = p.rows.find(r => r.type === '置きT') || p.rows.find(r => r.type === 'ポイント後') || p.rows[Math.min(1, p.rows.length - 1)];
      }
      const currentGrade = editedPlayerGrades[p.name] !== undefined 
        ? editedPlayerGrades[p.name] 
        : (p.grade || (index % 3 === 0 ? '3' : index % 3 === 1 ? '2' : '1'));

      return {
        name: p.name,
        handThrowStats: handThrowRow,
        teeStats: teeRow,
        playerRaw: p,
        grade: currentGrade,
        index
      };
    }).filter(d => d.handThrowStats !== undefined && d.teeStats !== undefined);

    rowsData.sort((a, b) => {
      const gradeA = String(a.grade);
      const gradeB = String(b.grade);
      if (gradeA !== gradeB) {
        return gradeB.localeCompare(gradeA);
      }
      const nameA = String(a.name);
      const nameB = String(b.name);
      return nameA.localeCompare(nameB, 'ja');
    });

    const calculateAvg = (playersList: typeof rowsData, gradeFilter?: string) => {
      const filtered = gradeFilter 
        ? playersList.filter(p => p.grade === gradeFilter || p.grade === `${gradeFilter}年生`)
        : playersList;
      const count = filtered.length;
      if (count === 0) {
        return {
          handThrow: { ev: 0, la: 0, dist: 0, bat: 0, attack: 0, adjust: 0 },
          tee: { ev: 0, la: 0, dist: 0, bat: 0, attack: 0, adjust: 0 }
        };
      }
      return {
        handThrow: {
          ev: filtered.reduce((sum, p) => sum + p.handThrowStats.exitVelocity, 0) / count,
          la: filtered.reduce((sum, p) => sum + p.handThrowStats.launchAngle, 0) / count,
          dist: filtered.reduce((sum, p) => sum + p.handThrowStats.distance, 0) / count,
          bat: filtered.reduce((sum, p) => sum + p.handThrowStats.batSpeed, 0) / count,
          attack: filtered.reduce((sum, p) => sum + p.handThrowStats.attackAngle, 0) / count,
          adjust: filtered.reduce((sum, p) => sum + p.handThrowStats.adjustRate, 0) / count,
        },
        tee: {
          ev: filtered.reduce((sum, p) => sum + p.teeStats.exitVelocity, 0) / count,
          la: filtered.reduce((sum, p) => sum + p.teeStats.launchAngle, 0) / count,
          dist: filtered.reduce((sum, p) => sum + p.teeStats.distance, 0) / count,
          bat: filtered.reduce((sum, p) => sum + p.teeStats.batSpeed, 0) / count,
          attack: filtered.reduce((sum, p) => sum + p.teeStats.attackAngle, 0) / count,
          adjust: filtered.reduce((sum, p) => sum + p.teeStats.adjustRate, 0) / count,
        }
      };
    };

    const avgGrade3 = calculateAvg(rowsData, '3');
    const avgGrade2 = calculateAvg(rowsData, '2');
    const avgGrade1 = calculateAvg(rowsData, '1');
    const displayHittingDate = customHittingDate || allHittingPlayers[0]?.measurementDate || '2026/●/●';

    const totalCount = rowsData.length;
    const totalPages = Math.ceil(totalCount / summaryPageSize);
    const pages: React.ReactNode[] = [];

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const pageRows = rowsData.slice(pIdx * summaryPageSize, (pIdx + 1) * summaryPageSize);
      const isFirstPage = pIdx === 0;

      pages.push(
        <div 
          key={`hitter-summary-page-${pIdx}`} 
          className={`pdf-page-replica hitting-replica ${!isFirstPage ? 'print-page-break' : ''}`} 
          style={{ width: '950px', minWidth: '950px', margin: '0 auto', padding: '16px 24px' }}
        >
          {/* Header */}
          <div className="noble-pitching-header">
            <div className="noble-header-top">
              <div className="noble-header-batter" style={{ borderBottom: 'none', fontSize: '24px' }}>
                {customHittingTitle}
              </div>
              <div className="noble-header-date" style={{ borderBottom: 'none' }}>
                <span className="value" style={{ borderBottom: 'none', fontSize: '20px' }}>
                  {displayHittingDate}
                </span>
              </div>
            </div>
            <div className="noble-chevron-divider"></div>
          </div>

          <div style={{ fontSize: '22px', fontWeight: '900', color: '#111', marginBottom: '10px' }}>
            打球一覧 {totalPages > 1 ? `(${pIdx + 1}/${totalPages}ページ)` : ''}
          </div>

          {/* Main Table */}
          <table className="noble-main-table noble-roster-print-table" style={{ tableLayout: 'fixed', width: '100%', fontSize: '11px', borderBottom: '1.5px solid #222' }}>
            <colgroup>
              <col style={{ width: '130px' }} />
              <col style={{ width: '58px' }} />
              <col style={{ width: '50px' }} />
              <col style={{ width: '48px' }} />
              <col style={{ width: '58px' }} />
              <col style={{ width: '50px' }} />
              <col style={{ width: '55px' }} />
              <col style={{ width: '58px' }} />
              <col style={{ width: '50px' }} />
              <col style={{ width: '48px' }} />
              <col style={{ width: '58px' }} />
              <col style={{ width: '50px' }} />
              <col style={{ width: '55px' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={{ backgroundColor: '#2f5597', color: '#fff', verticalAlign: 'middle', fontWeight: 'bold' }}>氏名</th>
                <th colSpan={6} style={{ backgroundColor: '#2f5597', color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>手投げ</th>
                <th colSpan={6} style={{ backgroundColor: '#2f5597', color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>置きT</th>
              </tr>
              <tr>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>打球速度<br/>(km/h)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>打球角度<br/>(deg.)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>飛距離<br/>(m)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>バット速度<br/>(km/h)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>アッパー<br/>(deg.)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>アジャスト<br/>(%)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>打球速度<br/>(km/h)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>打球角度<br/>(deg.)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>飛距離<br/>(m)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>バット速度<br/>(km/h)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>アッパー<br/>(deg.)</th>
                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>アジャスト<br/>(%)</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((d, index) => {
                const isEvenPlayer = index % 2 === 1;
                const playerBgColor = isEvenPlayer ? '#f2f2f2' : '#ffffff';
                const nameBgColor = isEvenPlayer ? '#f2f2f2' : '#f9f9f9';
                const nameColor = d.grade === '3' || d.grade === '3年生' ? '#1d4ed8' : (d.grade === '2' || d.grade === '2年生' ? '#d31b1b' : '#111111');

                const getCellBg = (val: number, field: string, type: 'handThrow' | 'tee') => {
                  if (field !== 'ev' && field !== 'bat' && field !== 'adjust') return playerBgColor;
                  const avgData = d.grade === '1' || d.grade === '1年生' ? avgGrade1 : (d.grade === '3' || d.grade === '3年生' ? avgGrade3 : avgGrade2);
                  if (!avgData) return playerBgColor;
                  const avgVal = type === 'handThrow' ? avgData.handThrow[field as keyof typeof avgData.handThrow] : avgData.tee[field as keyof typeof avgData.tee];
                  return val >= avgVal ? '#ffff00' : playerBgColor;
                };

                const displayName = editedPlayerNames[d.name] || d.name;
                const displayGrade = editedPlayerGrades[d.name] || d.grade;

                return (
                  <tr key={d.name} style={{ backgroundColor: playerBgColor }}>
                    <td style={{ fontWeight: 'bold', backgroundColor: nameBgColor, color: nameColor, textAlign: 'center' }}>
                      {displayName} ({displayGrade}年)
                    </td>
                    {/* 手投げ stats */}
                    <td style={{ backgroundColor: getCellBg(d.handThrowStats.exitVelocity, 'ev', 'handThrow'), fontWeight: getCellBg(d.handThrowStats.exitVelocity, 'ev', 'handThrow') === '#ffff00' ? 'bold' : 'normal' }}>
                      {d.handThrowStats.exitVelocity.toFixed(1)}
                    </td>
                    <td style={{ backgroundColor: playerBgColor }}>{d.handThrowStats.launchAngle.toFixed(1)}</td>
                    <td style={{ backgroundColor: playerBgColor }}>{d.handThrowStats.distance.toFixed(1)}</td>
                    <td style={{ backgroundColor: getCellBg(d.handThrowStats.batSpeed, 'bat', 'handThrow'), fontWeight: getCellBg(d.handThrowStats.batSpeed, 'bat', 'handThrow') === '#ffff00' ? 'bold' : 'normal' }}>
                      {d.handThrowStats.batSpeed.toFixed(1)}
                    </td>
                    <td style={{ backgroundColor: playerBgColor }}>{d.handThrowStats.attackAngle.toFixed(1)}</td>
                    <td style={{ backgroundColor: getCellBg(d.handThrowStats.adjustRate, 'adjust', 'handThrow'), fontWeight: getCellBg(d.handThrowStats.adjustRate, 'adjust', 'handThrow') === '#ffff00' ? 'bold' : 'normal' }}>
                      {d.handThrowStats.adjustRate.toFixed(1)}
                    </td>
                    {/* 置きT stats */}
                    <td style={{ backgroundColor: getCellBg(d.teeStats.exitVelocity, 'ev', 'tee'), fontWeight: getCellBg(d.teeStats.exitVelocity, 'ev', 'tee') === '#ffff00' ? 'bold' : 'normal' }}>
                      {d.teeStats.exitVelocity.toFixed(1)}
                    </td>
                    <td style={{ backgroundColor: playerBgColor }}>{d.teeStats.launchAngle.toFixed(1)}</td>
                    <td style={{ backgroundColor: playerBgColor }}>{d.teeStats.distance.toFixed(1)}</td>
                    <td style={{ backgroundColor: getCellBg(d.teeStats.batSpeed, 'bat', 'tee'), fontWeight: getCellBg(d.teeStats.batSpeed, 'bat', 'tee') === '#ffff00' ? 'bold' : 'normal' }}>
                      {d.teeStats.batSpeed.toFixed(1)}
                    </td>
                    <td style={{ backgroundColor: playerBgColor }}>{d.teeStats.attackAngle.toFixed(1)}</td>
                    <td style={{ backgroundColor: getCellBg(d.teeStats.adjustRate, 'adjust', 'tee'), fontWeight: getCellBg(d.teeStats.adjustRate, 'adjust', 'tee') === '#ffff00' ? 'bold' : 'normal' }}>
                      {d.teeStats.adjustRate.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    return <>{pages}</>;
  };
  // ----------------------------------------------------
  // Pitching Charts (SVG Plot & Speed Bar Chart)
  // ----------------------------------------------------
  
  const renderAiAnalysisSheet = () => {
    if (isAnalyzing) {
      const displayProgress = typeof analysisProgress === 'number' ? analysisProgress : 0;
      return (
        <div className="loading-state animate-fade-in" style={{ padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="spinner pulse-glow" style={{ width: '50px', height: '50px', borderWidth: '3px', marginBottom: '20px' }}></div>
          <h4 style={{ marginBottom: '8px', fontSize: '1.15rem', fontWeight: 600 }}>
            AIがRapsodoデータを分析中... {displayProgress}%
          </h4>
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.85rem', marginBottom: '20px' }}>
            チームの指標、バイオメカニクス的課題を算出しています。
          </p>
          <div style={{ width: '100%', maxWidth: '280px', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ 
              width: `${displayProgress}%`, 
              height: '100%', 
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', 
              borderRadius: '3px',
              transition: 'width 0.25s ease-out'
            }}></div>
          </div>
        </div>
      );
    }

    if (!sheetData) {
      return (
        <div className="no-analysis-state">
          <RefreshCw size={36} className="rotate-icon" />
          <h4>まだ分析が行われていません</h4>
          <p>このデータからAIチーム分析シートを作成するには、「分析を実行」ボタンを押してください。</p>
          <button className="btn btn-primary" onClick={onReanalyze}>
            <Sparkles size={16} />
            分析を実行
          </button>
        </div>
      );
    }

    return (
      <div className={`analysis-sheet-grid ${isEditing ? 'editing' : ''}`}>
        <div className="sheet-section full-width">
          <div className="section-title">1. 総合評価 (Summary)</div>
          {isEditing ? (
            <textarea 
              value={editedSheetData?.summary} 
              onChange={(e) => handleFieldChange('summary', e.target.value)}
              rows={3}
            />
          ) : (
            <p className="section-content highlight">{sheetData.summary}</p>
          )}
        </div>

        <div className="sheet-section">
          <div className="section-title">2. 主要データ数値 (Key Metrics)</div>
          {isEditing ? (
            <textarea 
              value={editedSheetData?.keyMetrics} 
              onChange={(e) => handleFieldChange('keyMetrics', e.target.value)}
              rows={6}
            />
          ) : (
            <p className="section-content" style={{ whiteSpace: 'pre-wrap' }}>{sheetData.keyMetrics}</p>
          )}
        </div>

        <div className="sheet-section">
          <div className="section-title">3. 動作・球種/スイング分析 (Mechanics)</div>
          {isEditing ? (
            <textarea 
              value={editedSheetData?.mechanics} 
              onChange={(e) => handleFieldChange('mechanics', e.target.value)}
              rows={6}
            />
          ) : (
            <p className="section-content">{sheetData.mechanics}</p>
          )}
        </div>

        <div className="sheet-section">
          <div className="section-title">4. 強みと成果 (Strengths)</div>
          {isEditing ? (
            <textarea 
              value={editedSheetData?.strengths} 
              onChange={(e) => handleFieldChange('strengths', e.target.value)}
              rows={6}
            />
          ) : (
            <p className="section-content">{sheetData.strengths}</p>
          )}
        </div>

        <div className="sheet-section">
          <div className="section-title">5. 改善ポイント (Improvements)</div>
          {isEditing ? (
            <textarea 
              value={editedSheetData?.improvements} 
              onChange={(e) => handleFieldChange('improvements', e.target.value)}
              rows={6}
            />
          ) : (
            <p className="section-content">{sheetData.improvements}</p>
          )}
        </div>

        <div className="sheet-section full-width action-plan-section">
          <div className="section-title">6. 推奨練習メニュー・ドリル (Training Plan)</div>
          {isEditing ? (
            <textarea 
              value={editedSheetData?.trainingPlan} 
              onChange={(e) => handleFieldChange('trainingPlan', e.target.value)}
              rows={6}
            />
          ) : (
            <div className="section-content action-plan-content">
              {(() => {
                const plan = sheetData.trainingPlan as any;
                let planStr = '';
                if (typeof plan === 'string') {
                  planStr = plan;
                } else if (Array.isArray(plan)) {
                  planStr = plan.map(String).join('\n');
                } else if (plan) {
                  planStr = String(plan);
                }
                return planStr.split('\n').map((line, idx) => (
                  <div key={idx} className="plan-item">{line}</div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="analysis-panel glass-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="title-section">
          <FileText size={20} className="header-icon" />
          <div className="doc-title-wrapper">
            <h3>{document.title}</h3>
            <span className="doc-meta-badge">{document.fileName}</span>
          </div>
        </div>

        {/* Tab switcher - hidden when forceView is passed */}
        {!forceView && (
          <div className="tab-switcher">
            <button 
              className={`tab-btn ${activeTab === 'individual' ? 'active' : ''}`}
              onClick={() => setActiveTab('individual')}
            >
              <User size={14} />
              選手個別資料
            </button>
            <button 
              className={`tab-btn ${activeTab === 'sheet' ? 'active' : ''}`}
              onClick={() => setActiveTab('sheet')}
            >
              <Layers size={14} />
              チーム全体分析
            </button>
            <button 
              className={`tab-btn ${activeTab === 'original' ? 'active' : ''}`}
              onClick={() => setActiveTab('original')}
            >
              <BookOpen size={14} />
              原典CSVデータ
            </button>
          </div>
        )}

        {/* Action buttons */}
        {!isAnalyzing && (
          <div className="panel-actions">
            {activeTab === 'sheet' && (
              <button className="btn btn-secondary btn-icon" onClick={onReanalyze} title="再分析を実行">
                <RefreshCw size={16} />
                再分析
              </button>
            )}
            
            {(activeTab === 'sheet' || activeTab === 'individual') && (
              <button 
                className="btn btn-secondary btn-icon" 
                onClick={handleBulkPrint}
                title="全選手の分析シートを一括でPDF印刷・出力します"
                style={{ backgroundColor: '#2f5597', color: '#ffffff' }}
              >
                <Printer size={16} />
                一括PDF出力
              </button>
            )}
            
            {activeTab === 'sheet' && (
              <div className="summary-print-size-selector" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginLeft: '10px', background: '#f5f5f5', padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd', color: '#000000' }}>
                <span style={{ fontWeight: 'bold', color: '#333' }}>1ページ内の表示人数:</span>
                <select 
                  value={summaryPageSize} 
                  onChange={(e) => setSummaryPageSize(Number(e.target.value))}
                  style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px', fontWeight: 'bold', background: '#fff', color: '#000000', cursor: 'pointer' }}
                >
                  <option value={10} style={{ color: '#000' }}>10人</option>
                  <option value={12} style={{ color: '#000' }}>12人</option>
                  <option value={15} style={{ color: '#000' }}>15人</option>
                  <option value={18} style={{ color: '#000' }}>18人</option>
                  <option value={20} style={{ color: '#000' }}>20人</option>
                  <option value={25} style={{ color: '#000' }}>25人</option>
                  <option value={30} style={{ color: '#000' }}>30人</option>
                  <option value={35} style={{ color: '#000' }}>35人</option>
                </select>
              </div>
            )}

            {activeTab === 'sheet' && (
              <button 
                className="btn btn-secondary btn-icon" 
                onClick={handleSortPlayers}
                title="現在編集した名前（カタカナ）と学年に基づき、学年→あいうえお順に名簿順を再設定します"
                style={{ backgroundColor: '#2d8a4e', color: '#ffffff' }}
              >
                <ArrowUpDown size={16} />
                名簿順再設定
              </button>
            )}
            
            {activeTab === 'sheet' || activeTab === 'individual' ? (
              isEditing ? (
                <button className="btn btn-primary btn-icon" onClick={handleSave}>
                  <Check size={16} />
                  保存
                </button>
              ) : (
                <button className="btn btn-secondary btn-icon" onClick={() => setIsEditing(true)}>
                  <Edit2 size={16} />
                  編集
                </button>
              )
            ) : null}

            {activeTab === 'sheet' && sheetData && (
              <>
                <button className="btn btn-secondary btn-icon" onClick={handleCopyMarkdown} title="マークダウンをコピー">
                  <Clipboard size={16} />
                  {copied ? 'コピー完了' : 'コピー'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Main Body */}
      <div className="panel-body" style={{ padding: activeTab === 'individual' ? '16px' : '24px' }}>
        {activeTab === 'original' ? (
          <div className="original-content-view">
            <pre className="raw-text">{document.content}</pre>
          </div>
        ) : activeTab === 'sheet' ? (
          /* ----------------------------------------------------
             TEAM ANALYSIS SHEET (AI Generated) OR PITCHER ROSTER (PDF replica)
             ---------------------------------------------------- */
          !isHitting ? (
            <div style={{ width: '100%' }}>
              <div className="subview-selector-bar" style={{ display: 'flex', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <button 
                  className={`btn ${teamSubView === 'roster' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setTeamSubView('roster')}
                  style={{ fontSize: '13px', fontWeight: 'bold', padding: '8px 16px' }}
                >
                  📋 投手全体一覧 (ストレート一覧)
                </button>
                <button 
                  className={`btn ${teamSubView === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setTeamSubView('ai')}
                  style={{ fontSize: '13px', fontWeight: 'bold', padding: '8px 16px' }}
                >
                  🤖 チーム全体 AIコーチ分析
                </button>
              </div>

              {teamSubView === 'roster' ? (
                <div className="pitcher-roster-container" style={{ display: 'flex', flexDirection: 'column', gap: '40px', width: '100%', alignItems: 'center', padding: '16px' }}>
              {/* 右投げ一覧 */}
              {(() => {
                const rightPitchers = allPitchingPlayers.filter(p => p.handedness === 'R');
                
                const rowsData = rightPitchers.map(p => {
                  const straightAvg = p.rows.find(r => r.pitchType === 'ストレート' && !r.isMax);
                  const straightMax = p.rows.find(r => r.pitchType === 'ストレート' && r.isMax) || straightAvg;
                  const control = straightAvg?.control || 60.0;
                  
                  return {
                    name: p.name,
                    avg: straightAvg,
                    max: straightMax,
                    control: control,
                    quickAvg: p.quickTimes?.average || 0
                  };
                }).filter(d => d.avg !== undefined);

                const maxSpeeds = rowsData.map(d => d.max?.speed).filter((s): s is number => s !== undefined && !isNaN(s));
                const maxSpins = rowsData.map(d => d.max?.spin).filter((s): s is number => s !== undefined && !isNaN(s));
                const controls = rowsData.map(d => d.control).filter((c): c is number => c !== undefined && !isNaN(c));
                const quicks = rowsData.map(d => d.quickAvg).filter((q): q is number => q !== undefined && q > 0);

                const summarySpeed = maxSpeeds.length > 0 ? maxSpeeds.reduce((a, b) => a + b, 0) / maxSpeeds.length : 0;
                const summarySpin = maxSpins.length > 0 ? maxSpins.reduce((a, b) => a + b, 0) / maxSpins.length : 0;
                const summaryControl = controls.length > 0 ? controls.reduce((a, b) => a + b, 0) / controls.length : 0;
                const summaryQuick = quicks.length > 0 ? quicks.reduce((a, b) => a + b, 0) / quicks.length : 0;
                return (
                  <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '16px' }}>
                    <div className="pdf-page-replica pitching-replica" style={{ width: '850px', minWidth: '850px', margin: '0 auto' }}>
                    {/* Header */}
                    <div className="noble-pitching-header">
                      <div className="noble-header-top">
                        <div className="noble-header-batter" style={{ borderBottom: 'none', fontSize: '24px' }}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={customPitchingTitle}
                              onChange={(e) => handlePitchingTitleChange(e.target.value)}
                              className="noble-inline-input"
                              style={{ fontSize: '20px', fontWeight: 'bold', width: '320px' }}
                            />
                          ) : (
                            customPitchingTitle
                          )}
                        </div>
                        <div className="noble-header-date" style={{ borderBottom: 'none' }}>
                          <span className="value" style={{ borderBottom: 'none', fontSize: '20px' }}>
                            {isEditing ? (
                              <input
                                type="text"
                                value={customPitchingDate !== '' ? customPitchingDate : (allPitchingPlayers[0]?.measurementDate || '2026/●/●')}
                                onChange={(e) => handlePitchingDateChange(e.target.value)}
                                className="noble-inline-input"
                                style={{ fontSize: '18px', width: '150px', textAlign: 'right' }}
                              />
                            ) : (
                              customPitchingDate || allPitchingPlayers[0]?.measurementDate || '2026/●/●'
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="noble-chevron-divider"></div>
                    </div>

                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#d31b1b', marginBottom: '15px' }}>
                      右投げ
                    </div>

                    {/* Main Table */}
                    <table className="noble-main-table" style={{ fontSize: '11px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '80px' }}>氏名</th>
                          <th style={{ width: '50px' }}></th>
                          <th>投球速度<br/>(km/h)</th>
                          <th>総回転量<br/>(rpm)</th>
                          <th>回転効率<br/>(%)</th>
                          <th>回転方向<br/>(時:分)</th>
                          <th>縦の<br/>変化量<br/>(cm)</th>
                          <th>横の<br/>変化量<br/>(cm)</th>
                          <th>リリース<br/>角度(横)<br/>(°)</th>
                          <th>リリース<br/>角度(縦)<br/>(°)</th>
                          <th>ジャイロ<br/>角度<br/>(°)</th>
                          <th>制球率<br/>(%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowsData.map((d, index) => {
                          const isHighlight = d.control >= 60.0;
                          const highlightBg = '#ffff00';
                          const isEvenPlayer = index % 2 === 1;
                          const playerBgColor = isEvenPlayer ? '#f2f2f2' : '#ffffff';
                          const controlBgColor = isHighlight ? highlightBg : playerBgColor;

                          return (
                            <React.Fragment key={d.name}>
                              <tr style={{ backgroundColor: playerBgColor }}>
                                <td rowSpan={2} style={{ 
                                  verticalAlign: 'middle', 
                                  fontWeight: 'bold', 
                                  backgroundColor: playerBgColor,
                                  borderRight: '1.5px solid #222'
                                }}>
                                  {(() => {
                                    const currentGrade = editedPlayerGrades[d.name] !== undefined 
                                      ? editedPlayerGrades[d.name] 
                                      : '3';
                                    const gradeClass = `grade-color-${currentGrade === '3' || currentGrade === '3年生' ? '3' : (currentGrade === '2' || currentGrade === '2年生' ? '2' : '1')}`;
                                    return (
                                      <input
                                        type="text"
                                        value={editedPlayerNames[d.name] !== undefined ? editedPlayerNames[d.name] : d.name}
                                        onChange={(e) => setEditedPlayerNames({
                                          ...editedPlayerNames,
                                          [d.name]: e.target.value
                                        })}
                                        onBlur={(e) => handlePlayerNameBlur(d.name, e.target.value)}
                                        className={`noble-inline-input ${gradeClass}`}
                                        style={{ width: '90px', fontWeight: 'bold', border: 'none', background: 'transparent' }}
                                      />
                                    );
                                  })()}
                                </td>
                                <td style={{ backgroundColor: playerBgColor }}>平均値</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.speed.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.spin}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.efficiency.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.direction}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.vb.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.hb.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.relH.toFixed(2)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.relV.toFixed(2)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.gyro.toFixed(1)}</td>
                                <td rowSpan={2} style={{ 
                                  verticalAlign: 'middle', 
                                  fontWeight: 'bold',
                                  backgroundColor: controlBgColor 
                                }}>
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    key={`control-${d.name}-${d.control}`}
                                    defaultValue={d.control.toFixed(1)} 
                                    onBlur={(e) => handlePitcherControlBlur(d.name, e.target.value)} 
                                    style={{ width: '45px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 'inherit', color: 'inherit', outline: 'none' }}
                                  />
                                </td>
                              </tr>
                              <tr style={{ backgroundColor: playerBgColor }}>
                                <td style={{ backgroundColor: playerBgColor }}>最大速度</td>
                                <td style={{ backgroundColor: playerBgColor, fontWeight: 'bold' }}>{d.max?.speed.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.spin}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.efficiency.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.direction}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.vb.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.hb.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.relH.toFixed(2)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.relV.toFixed(2)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.gyro.toFixed(1)}</td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Summary Box */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', justifyContent: 'flex-start' }}>
                        <div style={{ width: '40px', height: '20px', backgroundColor: '#ffff00', border: '1.5px solid #222' }}></div>
                        <span>制球率が60%以上</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '15px' }}>
                        <table className="noble-main-table noble-summary-mini-table" style={{ width: 'auto', minWidth: '450px', margin: '0 auto', tableLayout: 'fixed' }}>
                          <tbody>
                            <tr>
                              <th rowSpan={2} style={{ width: '20%', backgroundColor: '#2f5597', color: '#fff', verticalAlign: 'middle', fontSize: '12px', fontWeight: 'bold', padding: '8px' }}>
                                最大速度時の<br/>平均値
                              </th>
                              <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px' }}>投球速度<br/>(km/h)</th>
                              <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px' }}>総回転量<br/>(rpm)</th>
                              <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px' }}>制球率<br/>(%)</th>
                              <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px' }}>チーム<br/>クイック平均(秒)</th>
                            </tr>
                            <tr>
                              <td style={{ width: '20%', fontWeight: 'bold', fontSize: '14px', height: '36px' }}>{summarySpeed.toFixed(1)}</td>
                              <td style={{ width: '20%', fontSize: '14px' }}>{Math.round(summarySpin)}</td>
                              <td style={{ width: '20%', fontSize: '14px' }}>{summaryControl.toFixed(1)}</td>
                              <td style={{ width: '20%', fontSize: '14px' }}>{summaryQuick.toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    </div>
                  </div>
                );
              })()}

              {/* 左投げ一覧 */}
              {(() => {
                const leftPitchers = allPitchingPlayers.filter(p => p.handedness === 'L');
                
                const rowsData = leftPitchers.map(p => {
                  const straightAvg = p.rows.find(r => r.pitchType === 'ストレート' && !r.isMax);
                  const straightMax = p.rows.find(r => r.pitchType === 'ストレート' && r.isMax) || straightAvg;
                  const control = straightAvg?.control || 60.0;
                  
                  return {
                    name: p.name,
                    avg: straightAvg,
                    max: straightMax,
                    control: control,
                    quickAvg: p.quickTimes?.average || 0
                  };
                }).filter(d => d.avg !== undefined);

                if (rowsData.length === 0) return null;

                const maxSpeeds = rowsData.map(d => d.max?.speed).filter((s): s is number => s !== undefined && !isNaN(s));
                const maxSpins = rowsData.map(d => d.max?.spin).filter((s): s is number => s !== undefined && !isNaN(s));
                const controls = rowsData.map(d => d.control).filter((c): c is number => c !== undefined && !isNaN(c));
                const quicks = rowsData.map(d => d.quickAvg).filter((q): q is number => q !== undefined && q > 0);

                const summarySpeed = maxSpeeds.length > 0 ? maxSpeeds.reduce((a, b) => a + b, 0) / maxSpeeds.length : 0;
                const summarySpin = maxSpins.length > 0 ? maxSpins.reduce((a, b) => a + b, 0) / maxSpins.length : 0;
                const summaryControl = controls.length > 0 ? controls.reduce((a, b) => a + b, 0) / controls.length : 0;
                const summaryQuick = quicks.length > 0 ? quicks.reduce((a, b) => a + b, 0) / quicks.length : 0;
                return (
                  <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '16px' }}>
                    <div className="pdf-page-replica pitching-replica" style={{ width: '850px', minWidth: '850px', margin: '0 auto' }}>
                    {/* Header */}
                    <div className="noble-pitching-header">
                      <div className="noble-header-top">
                        <div className="noble-header-batter" style={{ borderBottom: 'none', fontSize: '24px' }}>
                          {isEditing ? (
                            <input
                              type="text"
                              value={customPitchingTitle}
                              onChange={(e) => handlePitchingTitleChange(e.target.value)}
                              className="noble-inline-input"
                              style={{ fontSize: '20px', fontWeight: 'bold', width: '320px' }}
                            />
                          ) : (
                            customPitchingTitle
                          )}
                        </div>
                        <div className="noble-header-date" style={{ borderBottom: 'none' }}>
                          <span className="value" style={{ borderBottom: 'none', fontSize: '20px' }}>
                            {isEditing ? (
                              <input
                                type="text"
                                value={customPitchingDate !== '' ? customPitchingDate : (allPitchingPlayers[0]?.measurementDate || '2026/●/●')}
                                onChange={(e) => handlePitchingDateChange(e.target.value)}
                                className="noble-inline-input"
                                style={{ fontSize: '18px', width: '150px', textAlign: 'right' }}
                              />
                            ) : (
                              customPitchingDate || allPitchingPlayers[0]?.measurementDate || '2026/●/●'
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="noble-chevron-divider"></div>
                    </div>

                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#3b82f6', marginBottom: '15px' }}>
                      左投げ
                    </div>

                    {/* Main Table */}
                    <table className="noble-main-table" style={{ fontSize: '11px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '80px' }}>氏名</th>
                          <th style={{ width: '50px' }}></th>
                          <th>投球速度<br/>(km/h)</th>
                          <th>総回転量<br/>(rpm)</th>
                          <th>回転効率<br/>(%)</th>
                          <th>回転方向<br/>(時:分)</th>
                          <th>縦の<br/>変化量<br/>(cm)</th>
                          <th>横の<br/>変化量<br/>(cm)</th>
                          <th>リリース<br/>角度(横)<br/>(°)</th>
                          <th>リリース<br/>角度(縦)<br/>(°)</th>
                          <th>ジャイロ<br/>角度<br/>(°)</th>
                          <th>制球率<br/>(%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowsData.map((d, index) => {
                          const isHighlight = d.control >= 60.0;
                          const highlightBg = '#ffff00';
                          const isEvenPlayer = index % 2 === 1;
                          const playerBgColor = isEvenPlayer ? '#f2f2f2' : '#ffffff';
                          const controlBgColor = isHighlight ? highlightBg : playerBgColor;

                          return (
                            <React.Fragment key={d.name}>
                              <tr style={{ backgroundColor: playerBgColor }}>
                                <td rowSpan={2} style={{ 
                                  verticalAlign: 'middle', 
                                  fontWeight: 'bold', 
                                  backgroundColor: playerBgColor,
                                  borderRight: '1.5px solid #222'
                                }}>
                                  {(() => {
                                    const currentGrade = editedPlayerGrades[d.name] !== undefined 
                                      ? editedPlayerGrades[d.name] 
                                      : '3';
                                    const gradeClass = `grade-color-${currentGrade === '3' || currentGrade === '3年生' ? '3' : (currentGrade === '2' || currentGrade === '2年生' ? '2' : '1')}`;
                                    return (
                                      <input
                                        type="text"
                                        value={editedPlayerNames[d.name] !== undefined ? editedPlayerNames[d.name] : d.name}
                                        onChange={(e) => setEditedPlayerNames({
                                          ...editedPlayerNames,
                                          [d.name]: e.target.value
                                        })}
                                        onBlur={(e) => handlePlayerNameBlur(d.name, e.target.value)}
                                        className={`noble-inline-input ${gradeClass}`}
                                        style={{ width: '90px', fontWeight: 'bold', border: 'none', background: 'transparent' }}
                                      />
                                    );
                                  })()}
                                </td>
                                <td style={{ backgroundColor: playerBgColor }}>平均値</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.speed.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.spin}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.efficiency.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.direction}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.vb.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.hb.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.relH.toFixed(2)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.relV.toFixed(2)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.avg?.gyro.toFixed(1)}</td>
                                <td rowSpan={2} style={{ 
                                  verticalAlign: 'middle', 
                                  fontWeight: 'bold',
                                  backgroundColor: controlBgColor 
                                }}>
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    key={`control-${d.name}-${d.control}`}
                                    defaultValue={d.control.toFixed(1)} 
                                    onBlur={(e) => handlePitcherControlBlur(d.name, e.target.value)} 
                                    style={{ width: '45px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 'inherit', color: 'inherit', outline: 'none' }}
                                  />
                                </td>
                              </tr>
                              <tr style={{ backgroundColor: playerBgColor }}>
                                <td style={{ backgroundColor: playerBgColor }}>最大速度</td>
                                <td style={{ backgroundColor: playerBgColor, fontWeight: 'bold' }}>{d.max?.speed.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.spin}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.efficiency.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.direction}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.vb.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.hb.toFixed(1)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.relH.toFixed(2)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.relV.toFixed(2)}</td>
                                <td style={{ backgroundColor: playerBgColor }}>{d.max?.gyro.toFixed(1)}</td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Summary Box */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', justifyContent: 'flex-start' }}>
                        <div style={{ width: '40px', height: '20px', backgroundColor: '#ffff00', border: '1.5px solid #222' }}></div>
                        <span>制球率が60%以上</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '15px' }}>
                        <table className="noble-main-table noble-summary-mini-table" style={{ width: 'auto', minWidth: '450px', margin: '0 auto', tableLayout: 'fixed' }}>
                          <tbody>
                            <tr>
                              <th rowSpan={2} style={{ width: '20%', backgroundColor: '#2f5597', color: '#fff', verticalAlign: 'middle', fontSize: '12px', fontWeight: 'bold', padding: '8px' }}>
                                最大速度時の<br/>平均値
                              </th>
                              <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px' }}>投球速度<br/>(km/h)</th>
                              <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px' }}>総回転量<br/>(rpm)</th>
                              <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px' }}>制球率<br/>(%)</th>
                              <th style={{ width: '20%', backgroundColor: '#fdf2f2', color: '#222', fontSize: '12px' }}>チーム<br/>クイック平均(秒)</th>
                            </tr>
                            <tr>
                              <td style={{ width: '20%', fontWeight: 'bold', fontSize: '14px', height: '36px' }}>{summarySpeed.toFixed(1)}</td>
                              <td style={{ width: '20%', fontSize: '14px' }}>{Math.round(summarySpin)}</td>
                              <td style={{ width: '20%', fontSize: '14px' }}>{summaryControl.toFixed(1)}</td>
                              <td style={{ width: '20%', fontSize: '14px' }}>{summaryQuick.toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            renderAiAnalysisSheet()
          )}
        </div>
          ) : (
            <div style={{ width: '100%' }}>
              <div className="subview-selector-bar" style={{ display: 'flex', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <button 
                  className={`btn ${teamSubView === 'roster' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setTeamSubView('roster')}
                  style={{ fontSize: '13px', fontWeight: 'bold', padding: '8px 16px' }}
                >
                  📋 打撃全体一覧 (打球一覧)
                </button>
                <button 
                  className={`btn ${teamSubView === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setTeamSubView('ai')}
                  style={{ fontSize: '13px', fontWeight: 'bold', padding: '8px 16px' }}
                >
                  🤖 チーム全体 AIコーチ分析
                </button>
              </div>

              {teamSubView === 'roster' ? (
                <div className="hitter-roster-container" style={{ display: 'flex', flexDirection: 'column', gap: '40px', width: '100%', alignItems: 'center', padding: '16px' }}>
                  {/* 打球一覧 */}
                  {(() => {
                    const rowsData = allHittingPlayers.map((p, index) => {
                      let handThrowRow = p.rows.find(r => r.type === '手投げ');
                      let teeRow = p.rows.find(r => r.type === '置きT');
                      
                      // Fallback for mock/empty data
                      if (!handThrowRow) {
                        handThrowRow = p.rows.find(r => r.type === '真ん中') || p.rows.find(r => r.type === 'ポイント前') || p.rows[0];
                      }
                      if (!teeRow) {
                        teeRow = p.rows.find(r => r.type === '置きT') || p.rows.find(r => r.type === 'ポイント後') || p.rows[Math.min(1, p.rows.length - 1)];
                      }
                      
                      const currentGrade = editedPlayerGrades[p.name] !== undefined 
                        ? editedPlayerGrades[p.name] 
                        : (p.grade || (index % 3 === 0 ? '3' : index % 3 === 1 ? '2' : '1'));

                      return {
                        name: p.name,
                        handThrowStats: handThrowRow,
                        teeStats: teeRow,
                        playerRaw: p,
                        grade: currentGrade,
                        index
                      };
                    }).filter(d => d.handThrowStats !== undefined && d.teeStats !== undefined);

                    // Sort: First by Grade descending (3 -> 2 -> 1), then Alphabetically (50音順) by display name
                    rowsData.sort((a, b) => {
                      const gradeA = String(a.grade);
                      const gradeB = String(b.grade);
                      if (gradeA !== gradeB) {
                        return gradeB.localeCompare(gradeA);
                      }
                      const nameA = String(a.name);
                      const nameB = String(b.name);
                      return nameA.localeCompare(nameB, 'ja');
                    });

                    // Grade averages helper
                    const calculateAvg = (playersList: typeof rowsData, gradeFilter?: string) => {
                      const filtered = gradeFilter 
                        ? playersList.filter(p => p.grade === gradeFilter || p.grade === `${gradeFilter}年生`)
                        : playersList;
                        
                      const count = filtered.length;
                      if (count === 0) {
                        return {
                          handThrow: { ev: 0, la: 0, dist: 0, bat: 0, attack: 0, adjust: 0 },
                          tee: { ev: 0, la: 0, dist: 0, bat: 0, attack: 0, adjust: 0 }
                        };
                      }
                      
                      return {
                        handThrow: {
                          ev: filtered.reduce((sum, p) => sum + p.handThrowStats.exitVelocity, 0) / count,
                          la: filtered.reduce((sum, p) => sum + p.handThrowStats.launchAngle, 0) / count,
                          dist: filtered.reduce((sum, p) => sum + p.handThrowStats.distance, 0) / count,
                          bat: filtered.reduce((sum, p) => sum + p.handThrowStats.batSpeed, 0) / count,
                          attack: filtered.reduce((sum, p) => sum + p.handThrowStats.attackAngle, 0) / count,
                          adjust: filtered.reduce((sum, p) => sum + p.handThrowStats.adjustRate, 0) / count,
                        },
                        tee: {
                          ev: filtered.reduce((sum, p) => sum + p.teeStats.exitVelocity, 0) / count,
                          la: filtered.reduce((sum, p) => sum + p.teeStats.launchAngle, 0) / count,
                          dist: filtered.reduce((sum, p) => sum + p.teeStats.distance, 0) / count,
                          bat: filtered.reduce((sum, p) => sum + p.teeStats.batSpeed, 0) / count,
                          attack: filtered.reduce((sum, p) => sum + p.teeStats.attackAngle, 0) / count,
                          adjust: filtered.reduce((sum, p) => sum + p.teeStats.adjustRate, 0) / count,
                        }
                      };
                    };

                    const avgGrade3 = calculateAvg(rowsData, '3');
                    const avgGrade2 = calculateAvg(rowsData, '2');
                    const avgGrade1 = calculateAvg(rowsData, '1');
                    const avgAll = calculateAvg(rowsData);

                    const displayHittingDate = customHittingDate || allHittingPlayers[0]?.measurementDate || '2026/●/●';

                    return (
                      <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '16px' }}>
                        <div className="pdf-page-replica hitting-replica" style={{ width: '950px', minWidth: '950px', margin: '0 auto' }}>
                          {/* Header */}
                          <div className="noble-pitching-header">
                            <div className="noble-header-top">
                              <div className="noble-header-batter" style={{ borderBottom: 'none', fontSize: '24px' }}>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={customHittingTitle}
                                    onChange={(e) => handleHittingTitleChange(e.target.value)}
                                    className="noble-inline-input"
                                    style={{ fontSize: '20px', fontWeight: 'bold', width: '320px' }}
                                  />
                                ) : (
                                  customHittingTitle
                                )}
                              </div>
                              <div className="noble-header-date" style={{ borderBottom: 'none' }}>
                                <span className="value" style={{ borderBottom: 'none', fontSize: '20px' }}>
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={customHittingDate !== '' ? customHittingDate : (allHittingPlayers[0]?.measurementDate || '2026/●/●')}
                                      onChange={(e) => handleHittingDateChange(e.target.value)}
                                      className="noble-inline-input"
                                      style={{ fontSize: '18px', width: '150px', textAlign: 'right' }}
                                    />
                                  ) : (
                                    displayHittingDate
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="noble-chevron-divider"></div>
                          </div>

                          {/* Main Table */}
                          <table className="noble-main-table" style={{ tableLayout: 'fixed', width: '100%', fontSize: '11px', borderBottom: '1.5px solid #222' }}>
                            <colgroup>
                              <col style={{ width: '130px' }} /> {/* 氏名 */}
                              {/* 手投げ (6 columns) */}
                              <col style={{ width: '58px' }} />
                              <col style={{ width: '50px' }} />
                              <col style={{ width: '48px' }} />
                              <col style={{ width: '58px' }} />
                              <col style={{ width: '50px' }} />
                              <col style={{ width: '55px' }} />
                              {/* 置きT (6 columns) */}
                              <col style={{ width: '58px' }} />
                              <col style={{ width: '50px' }} />
                              <col style={{ width: '48px' }} />
                              <col style={{ width: '58px' }} />
                              <col style={{ width: '50px' }} />
                              <col style={{ width: '55px' }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th rowSpan={2} style={{ backgroundColor: '#2f5597', color: '#fff', verticalAlign: 'middle', fontWeight: 'bold' }}>氏名</th>
                                <th colSpan={6} style={{ backgroundColor: '#2f5597', color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>手投げ</th>
                                <th colSpan={6} style={{ backgroundColor: '#2f5597', color: '#fff', fontWeight: 'bold', fontSize: '12px' }}>置きT</th>
                              </tr>
                              <tr>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>打球速度<br/>(km/h)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>打球角度<br/>(deg.)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>飛距離<br/>(m)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>バット速度<br/>(km/h)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>アッパー<br/>(deg.)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>アジャスト<br/>(%)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>打球速度<br/>(km/h)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>打球角度<br/>(deg.)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>飛距離<br/>(m)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>バット速度<br/>(km/h)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>アッパー<br/>(deg.)</th>
                                <th style={{ backgroundColor: '#fdf2f2', color: '#222', fontSize: '10px', padding: '6px 2px' }}>アジャスト<br/>(%)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rowsData.map((d, index) => {
                                const isEvenPlayer = index % 2 === 1;
                                const playerBgColor = isEvenPlayer ? '#f2f2f2' : '#ffffff';
                                const nameBgColor = isEvenPlayer ? '#f2f2f2' : '#f9f9f9';
                                
                                const nameColor = d.grade === '3' || d.grade === '3年生'
                                  ? '#1d4ed8'
                                  : (d.grade === '2' || d.grade === '2年生')
                                    ? '#d31b1b'
                                    : '#111111';

                                const getCellBg = (val: number, field: string, type: 'handThrow' | 'tee') => {
                                  if (field !== 'ev' && field !== 'bat' && field !== 'adjust') {
                                    return playerBgColor;
                                  }
                                  const avgData = d.grade === '1' || d.grade === '1年生' 
                                    ? avgGrade1 
                                    : (d.grade === '3' || d.grade === '3年生')
                                      ? avgGrade3
                                      : avgGrade2;
                                  if (!avgData) return playerBgColor;
                                  const avgVal = type === 'handThrow' 
                                    ? avgData.handThrow[field as keyof typeof avgData.handThrow] 
                                    : avgData.tee[field as keyof typeof avgData.tee];
                                  return val >= avgVal ? '#ffff00' : playerBgColor;
                                };

                                return (
                                  <tr key={d.name} style={{ backgroundColor: playerBgColor }}>
                                    <td style={{ fontWeight: 'bold', backgroundColor: nameBgColor }}>
                                      <input
                                      type="text"
                                      value={editedPlayerNames[d.name] !== undefined ? editedPlayerNames[d.name] : d.name}
                                      onChange={(e) => setEditedPlayerNames({
                                        ...editedPlayerNames,
                                        [d.name]: e.target.value
                                      })}
                                      onBlur={(e) => handlePlayerNameBlur(d.name, e.target.value)}
                                      className="noble-inline-input"
                                      style={{ width: '120px', fontWeight: 'bold', color: nameColor, border: 'none', background: 'transparent' }}
                                    />
                                    </td>
                                    
                                    {/* Hand throw cells */}
                                    <td style={{ backgroundColor: getCellBg(d.handThrowStats.exitVelocity, 'ev', 'handThrow') }}>{d.handThrowStats.exitVelocity.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.handThrowStats.launchAngle, 'la', 'handThrow') }}>{d.handThrowStats.launchAngle.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.handThrowStats.distance, 'dist', 'handThrow') }}>{d.handThrowStats.distance.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.handThrowStats.batSpeed, 'bat', 'handThrow') }}>{d.handThrowStats.batSpeed.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.handThrowStats.attackAngle, 'attack', 'handThrow') }}>{d.handThrowStats.attackAngle.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.handThrowStats.adjustRate, 'adjust', 'handThrow') }}>
                                       <input 
                                         type="number" 
                                         step="0.1" 
                                         key={`ht-adjust-${d.name}-${d.handThrowStats.adjustRate}`}
                                         defaultValue={d.handThrowStats.adjustRate.toFixed(1)} 
                                         onBlur={(e) => handleHitterAdjustRateBlur(d.name, 'handThrow', e.target.value)} 
                                         style={{ width: '45px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 'inherit', color: 'inherit', outline: 'none' }}
                                       />
                                     </td>
                                    
                                    {/* Tee cells */}
                                    <td style={{ backgroundColor: getCellBg(d.teeStats.exitVelocity, 'ev', 'tee') }}>{d.teeStats.exitVelocity.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.teeStats.launchAngle, 'la', 'tee') }}>{d.teeStats.launchAngle.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.teeStats.distance, 'dist', 'tee') }}>{d.teeStats.distance.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.teeStats.batSpeed, 'bat', 'tee') }}>{d.teeStats.batSpeed.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.teeStats.attackAngle, 'attack', 'tee') }}>{d.teeStats.attackAngle.toFixed(1)}</td>
                                    <td style={{ backgroundColor: getCellBg(d.teeStats.adjustRate, 'adjust', 'tee') }}>
                                       <input 
                                         type="number" 
                                         step="0.1" 
                                         key={`tee-adjust-${d.name}-${d.teeStats.adjustRate}`}
                                         defaultValue={d.teeStats.adjustRate.toFixed(1)} 
                                         onBlur={(e) => handleHitterAdjustRateBlur(d.name, 'tee', e.target.value)} 
                                         style={{ width: '45px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 'inherit', color: 'inherit', outline: 'none' }}
                                       />
                                     </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* Spacing & Legend Box */}
                          <div style={{ height: '15px' }}></div>
                          <div style={{ display: 'flex', alignItems: 'center', fontSize: '11px', paddingLeft: '130px', marginBottom: '10px' }}>
                            <div style={{ width: '58px', height: '20px', backgroundColor: '#ffff00', border: '1.5px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}></div>
                            <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>は同学年の平均値以上</span>
                          </div>

                          {/* Average Table */}
                          <table className="noble-main-table" style={{ tableLayout: 'fixed', width: '100%', fontSize: '11px', marginTop: '5px' }}>
                            <colgroup>
                              <col style={{ width: '130px' }} /> {/* 氏名 */}
                              {/* 手投げ (6 columns) */}
                              <col style={{ width: '58px' }} />
                              <col style={{ width: '50px' }} />
                              <col style={{ width: '48px' }} />
                              <col style={{ width: '58px' }} />
                              <col style={{ width: '50px' }} />
                              <col style={{ width: '55px' }} />
                              {/* 置きT (6 columns) */}
                              <col style={{ width: '58px' }} />
                              <col style={{ width: '50px' }} />
                              <col style={{ width: '48px' }} />
                              <col style={{ width: '58px' }} />
                              <col style={{ width: '50px' }} />
                              <col style={{ width: '55px' }} />
                            </colgroup>
                            <tbody>
                              {/* Bottom Average Rows */}
                              {rowsData.some(p => p.grade === '3' || p.grade === '3年生') && avgGrade3 && (
                                <tr style={{ color: '#1d4ed8', fontWeight: 'bold', backgroundColor: '#ffffff' }}>
                                  <td style={{ fontWeight: 'bold' }}>3年平均</td>
                                  <td>{avgGrade3.handThrow.ev.toFixed(1)}</td>
                                  <td>{avgGrade3.handThrow.la.toFixed(1)}</td>
                                  <td>{avgGrade3.handThrow.dist.toFixed(1)}</td>
                                  <td>{avgGrade3.handThrow.bat.toFixed(1)}</td>
                                  <td>{avgGrade3.handThrow.attack.toFixed(1)}</td>
                                  <td>{avgGrade3.handThrow.adjust.toFixed(1)}</td>
                                  <td>{avgGrade3.tee.ev.toFixed(1)}</td>
                                  <td>{avgGrade3.tee.la.toFixed(1)}</td>
                                  <td>{avgGrade3.tee.dist.toFixed(1)}</td>
                                  <td>{avgGrade3.tee.bat.toFixed(1)}</td>
                                  <td>{avgGrade3.tee.attack.toFixed(1)}</td>
                                  <td>{avgGrade3.tee.adjust.toFixed(1)}</td>
                                </tr>
                              )}
                              {rowsData.some(p => p.grade === '2' || p.grade === '2年生') && avgGrade2 && (
                                <tr style={{ color: '#d31b1b', fontWeight: 'bold', backgroundColor: '#ffffff' }}>
                                  <td style={{ fontWeight: 'bold' }}>2年平均</td>
                                  <td>{avgGrade2.handThrow.ev.toFixed(1)}</td>
                                  <td>{avgGrade2.handThrow.la.toFixed(1)}</td>
                                  <td>{avgGrade2.handThrow.dist.toFixed(1)}</td>
                                  <td>{avgGrade2.handThrow.bat.toFixed(1)}</td>
                                  <td>{avgGrade2.handThrow.attack.toFixed(1)}</td>
                                  <td>{avgGrade2.handThrow.adjust.toFixed(1)}</td>
                                  <td>{avgGrade2.tee.ev.toFixed(1)}</td>
                                  <td>{avgGrade2.tee.la.toFixed(1)}</td>
                                  <td>{avgGrade2.tee.dist.toFixed(1)}</td>
                                  <td>{avgGrade2.tee.bat.toFixed(1)}</td>
                                  <td>{avgGrade2.tee.attack.toFixed(1)}</td>
                                  <td>{avgGrade2.tee.adjust.toFixed(1)}</td>
                                </tr>
                              )}
                              {rowsData.some(p => p.grade === '1' || p.grade === '1年生') && avgGrade1 && (
                                <tr style={{ color: '#111111', fontWeight: 'bold', backgroundColor: '#ffffff' }}>
                                  <td style={{ fontWeight: 'bold' }}>1年平均</td>
                                  <td>{avgGrade1.handThrow.ev.toFixed(1)}</td>
                                  <td>{avgGrade1.handThrow.la.toFixed(1)}</td>
                                  <td>{avgGrade1.handThrow.dist.toFixed(1)}</td>
                                  <td>{avgGrade1.handThrow.bat.toFixed(1)}</td>
                                  <td>{avgGrade1.handThrow.attack.toFixed(1)}</td>
                                  <td>{avgGrade1.handThrow.adjust.toFixed(1)}</td>
                                  <td>{avgGrade1.tee.ev.toFixed(1)}</td>
                                  <td>{avgGrade1.tee.la.toFixed(1)}</td>
                                  <td>{avgGrade1.tee.dist.toFixed(1)}</td>
                                  <td>{avgGrade1.tee.bat.toFixed(1)}</td>
                                  <td>{avgGrade1.tee.attack.toFixed(1)}</td>
                                  <td>{avgGrade1.tee.adjust.toFixed(1)}</td>
                                </tr>
                              )}
                              {avgAll && (
                                <tr style={{ color: '#222222', fontWeight: 'bold', backgroundColor: '#ffffff' }}>
                                  <td style={{ fontWeight: 'bold' }}>平均値</td>
                                  <td>{avgAll.handThrow.ev.toFixed(1)}</td>
                                  <td>{avgAll.handThrow.la.toFixed(1)}</td>
                                  <td>{avgAll.handThrow.dist.toFixed(1)}</td>
                                  <td>{avgAll.handThrow.bat.toFixed(1)}</td>
                                  <td>{avgAll.handThrow.attack.toFixed(1)}</td>
                                  <td>{avgAll.handThrow.adjust.toFixed(1)}</td>
                                  <td>{avgAll.tee.ev.toFixed(1)}</td>
                                  <td>{avgAll.tee.la.toFixed(1)}</td>
                                  <td>{avgAll.tee.dist.toFixed(1)}</td>
                                  <td>{avgAll.tee.bat.toFixed(1)}</td>
                                  <td>{avgAll.tee.attack.toFixed(1)}</td>
                                  <td>{avgAll.tee.adjust.toFixed(1)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                renderAiAnalysisSheet()
              )}
            </div>
          )
        ) : (
          /* ----------------------------------------------------
             INDIVIDUAL PLAYER REPORT (PDF REPLICAS)
             ---------------------------------------------------- */
          <div className="individual-sheet-container">
            {/* Player Selector Bar */}
            <div className="player-selector-bar glass-panel">
              <div className="selector-title">
                <User size={16} />
                <span>表示する選手を選択:</span>
              </div>
              <select 
                value={selectedPlayer}
                onChange={(e) => onSelectPlayer(e.target.value)}
                className="player-dropdown-select"
              >
                {players.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              {isHitting && (
                <>
                  <div className="selector-title" style={{ marginLeft: '24px' }}>
                    <Layers size={16} />
                    <span>測定パターン:</span>
                  </div>
                  <select
                    value={hittingPattern}
                    onChange={(e) => setHittingPattern(e.target.value as any)}
                    className="player-dropdown-select"
                    style={{ minWidth: '160px' }}
                  >
                    <option value="toss_tee">手投げ・置きT比較</option>
                    <option value="height">高低比較 (高・中・低)</option>
                    <option value="point">打撃ポイント比較</option>
                  </select>
                </>
              )}

              <div className="selector-title" style={{ marginLeft: '24px' }}>
                <Layers size={16} />
                <span>比較する過去データ（日付）:</span>
              </div>
              <select
                value={compareDocId || ''}
                onChange={(e) => onSelectCompareDoc && onSelectCompareDoc(e.target.value)}
                className="player-dropdown-select"
                disabled={!compareDocCandidates || compareDocCandidates.length === 0}
                style={{ minWidth: '180px' }}
              >
                <option value="">-- 選択しない --</option>
                {compareDocCandidates && compareDocCandidates.map(cand => (
                  <option key={cand.id} value={cand.id}>
                    {cand.dateStr || cand.title}
                  </option>
                ))}
              </select>

              <div className="indicator-badge" style={{ marginLeft: 'auto' }}>
                {isHitting ? '🏏 打撃データ測定シート' : '⚾ 投球データ測定シート'}
              </div>
            </div>

            {/* Individual Data Display */}
            {isHitting ? (
              /* ====================================================
                 HITTING PLAYER REPORT
                 ==================================================== */
              !hittingPlayerData ? (
                <p className="empty-message">データが存在しません。</p>
              ) : (
                <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '16px' }}>
                  <div className="pdf-page-replica hitting-replica" style={{ width: '850px', minWidth: '850px', margin: '0 auto' }}>
                  
                  {/* Profile Header */}
                  <div className="noble-pitching-header">
                    <div className="noble-header-top">
                      <div className="noble-header-batter">Hitting</div>
                      <div className="noble-header-name">
                        <span className="label">氏名</span>
                        <input 
                          type="text" 
                          value={editedName} 
                          onChange={(e) => setEditedName(e.target.value)} 
                          onBlur={(e) => handleIndividualNameBlur(e.target.value)}
                          className="noble-inline-input" 
                          style={{ width: '220px', fontWeight: '900', fontSize: '20px', padding: '0 6px', color: '#000', border: 'none', background: 'transparent', textAlign: 'center' }} 
                        />
                      </div>
                      <div className="noble-header-date">
                        <span className="label">計測日</span>
                        <span className="value">{hittingPlayerData.measurementDate || '2026/●/●'}</span>
                      </div>
                    </div>
                    {/* 赤い野球の縫い目模様の境界線 */}
                    <div className="noble-chevron-divider"></div>
                  </div>

                  {/* Main Table (置きT) */}
                  <table className="noble-main-table noble-hitting-main-table">
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ width: '120px' }}>置きT</th>
                        <th>打球速度</th>
                        <th>打球角度</th>
                        <th>バット速度</th>
                        <th>アッパースイング度</th>
                        <th>アジャスト率</th>
                      </tr>
                      <tr>
                        <th>(km/h)</th>
                        <th>(deg.)</th>
                        <th>(km/h)</th>
                        <th>(deg.)</th>
                        <th>(%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editedHittingRows.map((row, idx) => (
                        <tr key={row.type}>
                          <td style={{ backgroundColor: '#f2f2f2', fontWeight: 'bold', fontSize: '11px', textAlign: 'center', verticalAlign: 'middle', padding: '4px 2px', lineHeight: '1.2' }}>
                            {row.type === '前回（置きT）' ? (
                              <>
                                前回<br/>
                                <span style={{ fontSize: '9px', fontWeight: 'normal', color: '#555' }}>（置きT）</span>
                              </>
                            ) : (
                              row.type
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input type="number" step="0.1" value={row.exitVelocity} onChange={(e) => handleHittingCellChangeRealtime(idx, 'exitVelocity', e.target.value)} className="noble-inline-input" />
                            ) : row.exitVelocity.toFixed(1)}
                          </td>
                          <td>
                            {isEditing ? (
                              <input type="number" step="0.1" value={row.launchAngle} onChange={(e) => handleHittingCellChangeRealtime(idx, 'launchAngle', e.target.value)} className="noble-inline-input" />
                            ) : row.launchAngle.toFixed(1)}
                          </td>
                          <td>
                            {isEditing ? (
                              <input type="number" step="0.1" value={row.batSpeed} onChange={(e) => handleHittingCellChangeRealtime(idx, 'batSpeed', e.target.value)} className="noble-inline-input" />
                            ) : row.batSpeed.toFixed(1)}
                          </td>
                          <td>
                            {isEditing ? (
                              <input type="number" step="0.1" value={row.attackAngle} onChange={(e) => handleHittingCellChangeRealtime(idx, 'attackAngle', e.target.value)} className="noble-inline-input" />
                            ) : row.attackAngle.toFixed(1)}
                          </td>
                          <td>
                            <input 
                              type="number" 
                              step="0.1" 
                              value={focusedHittingField === `adjustRate-${idx}` ? row.adjustRate : (typeof row.adjustRate === 'number' ? row.adjustRate.toFixed(1) : parseFloat(row.adjustRate).toFixed(1))} 
                              onFocus={() => setFocusedHittingField(`adjustRate-${idx}`)}
                              onChange={(e) => handleHittingCellChangeRealtime(idx, 'adjustRate', e.target.value)} 
                              onBlur={() => { setFocusedHittingField(null); handleIndividualHittingCellBlur(); }}
                              className="noble-inline-input" 
                              style={{ border: 'none', background: 'transparent', textAlign: 'center' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* ボックス1: 打球角度と打球速度の関係（全打球） */}
                  <div className="noble-green-box" style={{ flexDirection: 'column', gap: '15px' }}>
                    <div className="noble-chart-title" style={{ margin: 0 }}>打球角度と打球速度の関係（全打球）</div>
                    
                    <div className="noble-hitting-scatter-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', gap: '15px' }}>
                      {/* Silhouette & Left Scatter (Current) */}
                      <div className="noble-hitting-current-plot-box" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '75px' }}>
                          <div style={{ height: '26px' }}></div>
                          <div className="noble-hitting-silhouette-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '75px' }}>
                            <img src="/batter_silhouette.png" alt="シルエット" style={{ width: '70px', height: '120px', objectFit: 'contain' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ height: '26px' }}></div>
                          {renderNobleHittingScatter(
                            editedHittingRows, 
                            false, 
                            compareHittingPlayerData ? compareHittingPlayerData.rows : null,
                            hittingPlayerData ? hittingPlayerData.rawHits : null,
                            compareHittingPlayerData ? compareHittingPlayerData.rawHits : null,
                            selectedPlayer
                          )}
                        </div>
                      </div>

                      {/* Dotted green divider */}
                      <div style={{ borderLeft: '2.5px dotted #2d8a4e', height: '240px', alignSelf: 'stretch', margin: '0 5px', marginTop: '26px' }}></div>

                      {/* Right Scatter (Previous) */}
                      <div className="noble-hitting-previous-plot-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div className="prev-plot-title" style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>前回</div>
                        {renderNobleHittingScatter(
                          editedHittingRows, 
                          true, 
                          compareHittingPlayerData ? compareHittingPlayerData.rows : null,
                          hittingPlayerData ? hittingPlayerData.rawHits : null,
                          compareHittingPlayerData ? compareHittingPlayerData.rawHits : null,
                          selectedPlayer
                        )}
                      </div>
                    </div>

                    {/* Bottom row: Legend on the left, Notice on the right */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '15px' }}>
                      <div className="noble-hitting-legend-bar" style={{ display: 'flex', gap: '3px', flex: '0 1 500px' }}>
                        <span style={{ backgroundColor: '#2d8a4e', color: '#fff', padding: '4px 2px', fontSize: '10px', textAlign: 'center', flex: 1, fontWeight: 'bold' }}>マイナス打球<br/>(~ 0deg.)</span>
                        <span style={{ backgroundColor: '#facc15', color: '#000', padding: '4px 2px', fontSize: '10px', textAlign: 'center', flex: 1, fontWeight: 'bold' }}>ゴロ<br/>(0 ~ 6deg.)</span>
                        <span style={{ backgroundColor: '#ff0000', color: '#fff', padding: '4px 2px', fontSize: '10px', textAlign: 'center', flex: 1, fontWeight: 'bold' }}>低ライナー<br/>(6 ~ 14deg.)</span>
                        <span style={{ backgroundColor: '#3b82f6', color: '#fff', padding: '4px 2px', fontSize: '10px', textAlign: 'center', flex: 1, fontWeight: 'bold' }}>高ライナー<br/>(15 ~ 24deg.)</span>
                        <span style={{ backgroundColor: '#800080', color: '#fff', padding: '4px 2px', fontSize: '10px', textAlign: 'center', flex: 1, fontWeight: 'bold' }}>フライボール<br/>(24 ~ 50deg.)</span>
                        <span className="black-bg-cell" style={{ backgroundColor: '#000000', padding: '4px 2px', fontSize: '10px', textAlign: 'center', flex: 1, fontWeight: 'bold', color: '#ffffff' }}>ポップフライ<br/>(50deg. ~)</span>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#111111', whiteSpace: 'nowrap' }}>
                        ※ラプソードでの分類になります
                      </div>
                    </div>
                  </div>

                  {/* ボックス2: 打球速度とバット速度（置きT） */}
                  <div className="noble-green-box" style={{ flexDirection: 'column', gap: '15px' }}>
                    <div className="noble-chart-title" style={{ margin: 0 }}>打球速度とバット速度（置きT）</div>
                    
                    <div className="noble-hitting-lower-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', gap: '50px', marginTop: '10px' }}>
                      <div className="noble-hitting-matrix-container">
                        {renderNobleHittingMatrix(editedCompareStats)}
                      </div>

                      <div className="noble-hitting-ratio-table-container" style={{ flex: '0 1 350px' }}>
                        <table className="noble-compare-table noble-hitting-compare-table" style={{ margin: 0 }}>
                          <thead>
                            <tr>
                              <th style={{ backgroundColor: '#f2f2f2', width: '120px' }}>置きT</th>
                              <th>打球速度<br/>(km/h)</th>
                              <th>バット速度<br/>(km/h)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ backgroundColor: '#ff0000', color: '#fff', fontWeight: 'bold' }}>今回</td>
                              <td>{editedCompareStats.currentEv.toFixed(1)}</td>
                              <td>{editedCompareStats.currentBat.toFixed(1)}</td>
                            </tr>
                            <tr>
                              <td style={{ backgroundColor: '#d9d9d9', color: '#000', fontWeight: 'bold' }}>前回</td>
                              <td>
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedCompareStats.prevEv || ''} 
                                    onChange={(e) => handleCompareStatsChange('prevEv', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                ) : (
                                  editedCompareStats.prevEv ? editedCompareStats.prevEv.toFixed(1) : '-'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedCompareStats.prevBat || ''} 
                                    onChange={(e) => handleCompareStatsChange('prevBat', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                ) : (
                                  editedCompareStats.prevBat ? editedCompareStats.prevBat.toFixed(1) : '-'
                                )}
                              </td>
                            </tr>
                            <tr>
                              <td style={{ backgroundColor: '#facc15', color: '#000', fontWeight: 'bold' }}>チーム平均</td>
                              <td>
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedCompareStats.teamEv || ''} 
                                    onChange={(e) => handleCompareStatsChange('teamEv', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                ) : (
                                  editedCompareStats.teamEv ? editedCompareStats.teamEv.toFixed(1) : '-'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedCompareStats.teamBat || ''} 
                                    onChange={(e) => handleCompareStatsChange('teamBat', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                ) : (
                                  editedCompareStats.teamBat ? editedCompareStats.teamBat.toFixed(1) : '-'
                                )}
                              </td>
                            </tr>
                            <tr>
                              <td className="koshien-cell" style={{ fontWeight: 'bold' }}>甲子園</td>
                              <td>
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedCompareStats.koshienEv || ''} 
                                    onChange={(e) => handleCompareStatsChange('koshienEv', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                ) : (
                                  editedCompareStats.koshienEv ? editedCompareStats.koshienEv.toFixed(1) : '-'
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedCompareStats.koshienBat || ''} 
                                    onChange={(e) => handleCompareStatsChange('koshienBat', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                ) : (
                                  editedCompareStats.koshienBat ? editedCompareStats.koshienBat.toFixed(1) : '-'
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : (
              /* ====================================================
                 PITCHING PLAYER REPORT
                 ==================================================== */
              !pitchingPlayerData ? (
                <p className="empty-message">データが存在しません。</p>
              ) : (
                <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '16px' }}>
                  <div className="pdf-page-replica pitching-replica" style={{ width: '850px', minWidth: '850px', margin: '0 auto' }}>
                  
                  {/* Profile Header */}
                  <div className="noble-pitching-header">
                    <div className="noble-header-top">
                      <div className="noble-header-batter">打者なし</div>
                      <div className="noble-header-name">
                        <span className="label">氏名</span>
                        <input 
                          type="text" 
                          value={editedName} 
                          onChange={(e) => setEditedName(e.target.value)} 
                          onBlur={(e) => handleIndividualNameBlur(e.target.value)}
                          className="noble-inline-input" 
                          style={{ width: '220px', fontWeight: '900', fontSize: '20px', padding: '0 6px', color: '#000', border: 'none', background: 'transparent', textAlign: 'center' }} 
                        />
                      </div>
                      <div className="noble-header-date">
                        <span className="label">計測日</span>
                        <span className="value">{pitchingPlayerData.measurementDate || '2026/●/●'}</span>
                      </div>
                    </div>
                    {/* 赤いシェブロン模様の境界線 */}
                    <div className="noble-chevron-divider"></div>
                  </div>

                  {/* Main stats table (一番詳細なテーブル) */}
                  <table className="noble-main-table" style={{ marginBottom: '24px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '100px' }}>球種</th>
                        <th style={{ width: '60px' }}></th>
                        <th>投球速度<br/>(km/h)</th>
                        <th>総回転量<br/>(rpm)</th>
                        <th>回転効率<br/>(%)</th>
                        <th>回転方向<br/>(時:分)</th>
                        <th>縦の<br/>変化量<br/>(cm)</th>
                        <th>横の<br/>変化量<br/>(cm)</th>
                        <th>リリース<br/>角度<br/>(横)<br/>(°)</th>
                        <th>リリース<br/>角度<br/>(縦)<br/>(°)</th>
                        <th>ジャイロ<br/>角度<br/>(°)</th>
                        <th>制球率<br/>(%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Group rows by pitch type to handle rowspan
                        const groupedRows: { [key: string]: PitchingStatsRow[] } = {};
                        editedPitchingRows.forEach(row => {
                          if (!groupedRows[row.pitchType]) {
                            groupedRows[row.pitchType] = [];
                          }
                          groupedRows[row.pitchType].push(row);
                        });

                        return Object.entries(groupedRows).flatMap(([pitchType, rows]) => {
                          return rows.map((row, idx) => {
                            const isFirst = idx === 0;
                             return (
                              <tr key={`${pitchType}-${row.isMax ? 'max' : 'avg'}`}>
                                {isFirst && (
                                  <td 
                                    rowSpan={rows.length} 
                                    className={`pitch-name-cell ${getPitchClass(row.pitchType)}`}
                                    style={{ 
                                      verticalAlign: 'middle', 
                                      fontWeight: 'bold',
                                      backgroundColor: getPitchColor(row.pitchType),
                                      color: getPitchTextColor(row.pitchType),
                                      borderRight: '1.5px solid #222',
                                      textAlign: 'center'
                                    }}
                                  >
                                    {row.pitchType}
                                  </td>
                                )}
                                <td>{row.isMax ? '最大速度' : '平均値'}</td>
                                <td>
                                  {isEditing ? (
                                    <input type="number" step="0.1" value={row.speed} onChange={(e) => handlePitchingCellChange(editedPitchingRows.indexOf(row), 'speed', e.target.value)} />
                                  ) : row.speed.toFixed(1)}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input type="number" value={row.spin} onChange={(e) => handlePitchingCellChange(editedPitchingRows.indexOf(row), 'spin', e.target.value)} />
                                  ) : row.spin}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input type="number" step="0.1" value={row.efficiency} onChange={(e) => handlePitchingCellChange(editedPitchingRows.indexOf(row), 'efficiency', e.target.value)} />
                                  ) : row.efficiency.toFixed(1)}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input type="text" value={row.direction} onChange={(e) => handlePitchingCellChange(editedPitchingRows.indexOf(row), 'direction', e.target.value)} />
                                  ) : row.direction}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input type="number" step="0.1" value={row.vb} onChange={(e) => handlePitchingCellChange(editedPitchingRows.indexOf(row), 'vb', e.target.value)} />
                                  ) : row.vb.toFixed(1)}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input type="number" step="0.1" value={row.hb} onChange={(e) => handlePitchingCellChange(editedPitchingRows.indexOf(row), 'hb', e.target.value)} />
                                  ) : row.hb.toFixed(1)}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input type="number" step="0.01" value={row.relH} onChange={(e) => handlePitchingCellChange(editedPitchingRows.indexOf(row), 'relH', e.target.value)} />
                                  ) : row.relH.toFixed(2)}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input type="number" step="0.01" value={row.relV} onChange={(e) => handlePitchingCellChange(editedPitchingRows.indexOf(row), 'relV', e.target.value)} />
                                  ) : row.relV.toFixed(2)}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input type="number" step="0.1" value={row.gyro} onChange={(e) => handlePitchingCellChange(editedPitchingRows.indexOf(row), 'gyro', e.target.value)} />
                                  ) : row.gyro.toFixed(1)}
                                </td>
                                {isFirst && (
                                  <td 
                                    rowSpan={rows.length} 
                                    style={{ verticalAlign: 'middle', backgroundColor: '#ffffff', textAlign: 'center' }}
                                  >
                                    {row.control !== undefined ? (typeof row.control === 'number' ? row.control.toFixed(1) : parseFloat(row.control || '0').toFixed(1)) : '-'}
                                  </td>
                                )}
                              </tr>
                            );
                          });
                        });
                      })()}
                    </tbody>
                  </table>

                  {/* Top Section: Comparison and Quick (縦並び) */}
                  <div className="noble-top-row" style={{ width: '100%', marginBottom: '24px' }}>
                    {/* Comparison stats table (Straight) */}
                    <div style={{ width: '100%', marginBottom: '24px' }}>
                      {(() => {
                        const straightMax = editedPitchingRows.find(r => r.pitchType === 'ストレート' && r.isMax);
                        return (
                          <table className="noble-compare-table" style={{ marginBottom: 0 }}>
                            <thead>
                              <tr>
                                <th style={{ backgroundColor: '#fcd5d5', color: '#000000', width: '120px' }}>ストレート</th>
                                <th>投球速度</th>
                                <th>総回転数</th>
                                <th>回転効率</th>
                                <th>縦の変化量</th>
                                <th>横の変化量</th>
                                <th>制球率</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="row-label">今回</td>
                                <td>{straightMax ? straightMax.speed.toFixed(1) : '114.0'}</td>
                                <td>{straightMax ? straightMax.spin : '1961'}</td>
                                <td>{straightMax ? straightMax.efficiency.toFixed(1) : '72.5'}</td>
                                <td>{straightMax ? straightMax.vb.toFixed(1) : '35.0'}</td>
                                <td>{straightMax ? straightMax.hb.toFixed(1) : '9.0'}</td>
                                <td>{straightMax ? straightMax.control.toFixed(1) : '40.0'}</td>
                              </tr>
                              <tr className="previous-row">
                                <td className="row-label">前回</td>
                                <td>
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedPreviousStraight.speed || ''} 
                                    onChange={(e) => handlePreviousStraightChange('speed', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    value={editedPreviousStraight.spin || ''} 
                                    onChange={(e) => handlePreviousStraightChange('spin', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedPreviousStraight.efficiency || ''} 
                                    onChange={(e) => handlePreviousStraightChange('efficiency', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedPreviousStraight.vb || ''} 
                                    onChange={(e) => handlePreviousStraightChange('vb', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedPreviousStraight.hb || ''} 
                                    onChange={(e) => handlePreviousStraightChange('hb', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                </td>
                                <td>
                                  <input 
                                    type="number" 
                                    step="0.1" 
                                    value={editedPreviousStraight.control || ''} 
                                    onChange={(e) => handlePreviousStraightChange('control', e.target.value)} 
                                    className="noble-inline-input"
                                    placeholder=""
                                  />
                                </td>
                              </tr>
                              <tr className="team-avg-row">
                                <td className="row-label">チーム平均</td>
                                <td>120.6</td>
                                <td>1920</td>
                                <td>88.1</td>
                                <td>39.9</td>
                                <td>24.4</td>
                                <td>53.3</td>
                              </tr>
                            </tbody>
                          </table>
                        );
                      })()}
                    </div>

                    {/* Quick Table */}
                    <div className="noble-quick-container" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 0 }}>
                      <table className="noble-quick-table" style={{ fontSize: '13.5px' }}>
                        <tbody>
                          <tr>
                            <td rowSpan={2} className="quick-title-cell" style={{ backgroundColor: '#fcd5d5', color: '#000000', verticalAlign: 'middle', fontWeight: 'bold', fontSize: '13.5px' }}>クイック</td>
                            <th style={{ fontSize: '13px', padding: '6px 8px', fontWeight: 'bold' }}>最短タイム（秒）</th>
                            <th style={{ fontSize: '13px', padding: '6px 8px', fontWeight: 'bold' }}>平均タイム（秒）</th>
                            <th style={{ color: '#2d8a4e', fontSize: '13px', padding: '6px 8px', fontWeight: 'bold' }}>前回タイム（秒）</th>
                          </tr>
                          <tr className="quick-values-row">
                            <td style={{ fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle', fontSize: '13.5px', padding: '6px 8px' }}>
                              {formatQuickTime(editedQuickTimes?.fastest)}
                            </td>
                            <td style={{ fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle', fontSize: '13.5px', padding: '6px 8px' }}>
                              {formatQuickTime(editedQuickTimes?.average)}
                            </td>
                            <td style={{ fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle', color: '#2d8a4e', fontSize: '13.5px', padding: '6px 8px' }}>
                              {formatQuickTime(editedQuickTimes?.previous)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="quick-target-text" style={{ whiteSpace: 'nowrap', fontSize: '14.5px', fontWeight: 'bold', color: '#111' }}>
                        目標は1.29秒以内
                      </div>
                    </div>
                  </div>

                  {/* Bottom Section: Green border box for Scatter and Velocity charts */}
                  <div className="noble-green-box">
                    {renderNobleScatterPlot(editedPitchingRows, true)}
                    <div style={{ borderLeft: '2.5px solid #2d8a4e', alignSelf: 'stretch', margin: '0 5px' }}></div>
                    {renderNobleVelocityChart(editedPitchingRows, true)}
                  </div>
                </div>
              </div>
            )
          )}
          </div>
        )}
      </div>

      {/* Print-only container for A4 portrait bulk output rendered via React Portal directly into body */}
      {isPrintingBulk && createPortal(
        <div id="print-export-root">
          {activeTab === 'sheet' ? (
            isHitting ? (
              renderBulkHittingSummarySheet()
            ) : (
              renderBulkPitchingSummarySheet()
            )
          ) : (
            isHitting ? (
              allHittingPlayers.map((player) => (
                <div key={player.name} className="pdf-page-replica hitting-replica print-page-break">
                  {renderBulkPlayerHittingSheet(player)}
                </div>
              ))
            ) : (
              allPitchingPlayers.map((player) => (
                <div key={player.name} className="pdf-page-replica pitching-replica print-page-break">
                  {renderBulkPlayerPitchingSheet(player)}
                </div>
              ))
            )
          )}
        </div>,
        window.document.body
      )}
    </div>
  );
};
