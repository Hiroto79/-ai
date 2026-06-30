/**
 * Converts a raw CSV string into a readable Markdown table format.
 * This preserves metadata header lines and structures actual CSV grid lines.
 */
export function convertCsvToMarkdown(csvText: string): string {
  const lines = csvText.split(/\r?\n/);
  let markdown = '【Rapsodo CSV測定データ】\n\n';
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) {
      if (inTable) {
        markdown += renderMarkdownTable(tableHeaders, tableRows);
        inTable = false;
        tableHeaders = [];
        tableRows = [];
      }
      markdown += '\n';
      continue;
    }

    const columns = splitCsvLine(line);

    if (columns.length > 1) {
      if (!inTable) {
        inTable = true;
        tableHeaders = columns;
      } else {
        tableRows.push(columns);
      }
    } else {
      if (inTable) {
        markdown += renderMarkdownTable(tableHeaders, tableRows);
        inTable = false;
        tableHeaders = [];
        tableRows = [];
      }
      markdown += line + '\n';
    }
  }

  if (inTable) {
    markdown += renderMarkdownTable(tableHeaders, tableRows);
  }

  return markdown.trim();
}

/**
 * Splits a CSV line, respecting double-quoted values containing commas
 */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function renderMarkdownTable(headers: string[], rows: string[][]): string {
  if (headers.length === 0) return '';
  
  let result = '| ' + headers.join(' | ') + ' |\n';
  result += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  
  for (const row of rows) {
    const filledRow = [...row];
    while (filledRow.length < headers.length) {
      filledRow.push('');
    }
    const finalRow = filledRow.slice(0, headers.length);
    result += '| ' + finalRow.join(' | ') + ' |\n';
  }
  
  return result + '\n';
}

// ==========================================================================
// Baseball-specific CSV parsing and player aggregation (extended for graphical PDF replica)
// ==========================================================================

export interface HittingStatsRow {
  type: string; // 置きT, 手投げ, トスT, 前回
  exitVelocity: number;
  launchAngle: number;
  batSpeed: number;
  attackAngle: number;
  adjustRate: number;
  distance: number;
}

export interface CourseStats {
  distance: number;
  exitVelocity: number;
  launchAngle: number;
  batSpeed: number;
  power: number;
}

export interface CourseData {
  outHigh: CourseStats;
  inHigh: CourseStats;
  outLow: CourseStats;
  inLow: CourseStats;
}

export interface HittingCompareStats {
  currentEv: number;
  currentBat: number;
  prevEv: number;
  prevBat: number;
  teamEv: number;
  teamBat: number;
  koshienEv: number;
  koshienBat: number;
}

export interface HittingPlayer {
  name: string;
  rows: HittingStatsRow[];
  courses?: CourseData;
  compareStats?: HittingCompareStats;
  measurementDate?: string;
  grade?: string;
  rawHits?: { exitVelocity: number; launchAngle: number; type?: string }[];
}

export interface PitchingStatsRow {
  pitchType: string;
  isMax?: boolean;
  speed: number;
  spin: number;
  efficiency: number;
  direction: string;
  vb: number;
  hb: number;
  relH: number;
  relV: number;
  gyro: number;
  control: number;
}

export interface QuickTimes {
  fastest: number;
  average: number;
  previous: number;
}

export interface PreviousStraightStats {
  speed: number;
  spin: number;
  efficiency: number;
  vb: number;
  hb: number;
  control: number;
}

export interface PitchingPlayer {
  name: string;
  handedness: 'R' | 'L';
  rows: PitchingStatsRow[];
  quickTimes: QuickTimes;
  previousStraight?: PreviousStraightStats;
  measurementDate?: string;
  grade?: string;
}

/**
 * Parses a hitting CSV file and aggregates statistics per player.
 */
export function parseHittingPlayers(csvText: string, teamName?: string): HittingPlayer[] {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const nameIdx = headers.findIndex(h => h.toLowerCase().includes('name') || h.includes('氏名') || h.includes('名前') || h.includes('選手'));
  const evIdx = headers.findIndex(h => h.toLowerCase().includes('exitvelocity') || h.toLowerCase().includes('exit velocity') || h.includes('打球速度') || h.includes('速度'));
  const laIdx = headers.findIndex(h => h.toLowerCase().includes('launchangle') || h.toLowerCase().includes('launch angle') || h.includes('打球角度') || h.includes('角度'));
  const distIdx = headers.findIndex(h => h.toLowerCase().includes('distance') || h.includes('飛距離') || h.includes('距離'));
  const dateIdx = headers.findIndex(h => h.toLowerCase() === 'date' || h.includes('日付') || h.includes('計測日'));
  const gradeIdx = headers.findIndex(h => h.toLowerCase().includes('学年') || h.toLowerCase().includes('grade') || h.toLowerCase().includes('class') || h.toLowerCase() === 'yr' || h.toLowerCase() === 'year');
  
  // Find optional custom hitting metrics (support Japanese and English headers)
  const batSpeedIdx = headers.findIndex(h => h.toLowerCase().includes('バット') || h.toLowerCase().includes('batspeed') || h.toLowerCase().includes('bat speed'));
  const attackAngleIdx = headers.findIndex(h => h.toLowerCase().includes('アッパー') || h.toLowerCase().includes('attackangle') || h.toLowerCase().includes('attack angle'));
  const adjustRateIdx = headers.findIndex(h => h.toLowerCase().includes('ミート') || h.toLowerCase().includes('adjustrate') || h.toLowerCase().includes('adjust rate'));
  const sessionTypeIdx = headers.findIndex(h => h.toLowerCase().includes('type') || h.toLowerCase().includes('tag') || h.toLowerCase().includes('session') || h.includes('測定') || h.includes('タグ') || h.includes('セッション') || h.includes('種類'));
  
  if (nameIdx === -1) return [];

  const playersMap = new Map<string, { 
    evs: number[], 
    las: number[], 
    dists: number[],
    batSpeeds: number[],
    attackAngles: number[],
    adjustRates: number[]
  }>();
  const playerDates = new Map<string, string>();
  const typedHitsMap = new Map<string, Map<string, {
    evs: number[],
    las: number[],
    dists: number[],
    batSpeeds: number[],
    attackAngles: number[],
    adjustRates: number[]
  }>>();
  const playerGrades = new Map<string, string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= nameIdx) continue;

    let name = cols[nameIdx];
    if (!name || name === '-') continue;
    name = name.trim();

    const ev = evIdx !== -1 ? parseFloat(cols[evIdx]) : NaN;
    const la = laIdx !== -1 ? parseFloat(cols[laIdx]) : NaN;
    const dist = distIdx !== -1 ? parseFloat(cols[distIdx]) : NaN;
    const batSpeed = batSpeedIdx !== -1 && cols.length > batSpeedIdx ? parseFloat(cols[batSpeedIdx]) : NaN;
    const attackAngle = attackAngleIdx !== -1 && cols.length > attackAngleIdx ? parseFloat(cols[attackAngleIdx]) : NaN;
    const adjustRate = adjustRateIdx !== -1 && cols.length > adjustRateIdx ? parseFloat(cols[adjustRateIdx]) : NaN;
    const rawTypeVal = sessionTypeIdx !== -1 && cols.length > sessionTypeIdx ? cols[sessionTypeIdx].trim() : '';
    let normType = '';
    if (rawTypeVal) {
      const lower = rawTypeVal.toLowerCase();
      if (lower.includes('手投げ') || lower.includes('トス') || lower.includes('toss') || lower.includes('throw')) {
        normType = '手投げ';
      } else if (lower.includes('置きt') || lower.includes('置きT') || lower.includes('tee') || lower.includes('ティー') || lower.includes('置き')) {
        normType = '置きT';
      }
    }
    const dateVal = dateIdx !== -1 && cols.length > dateIdx ? cols[dateIdx] : '';
    let gradeVal = gradeIdx !== -1 && cols.length > gradeIdx ? cols[gradeIdx].trim() : '';

    if (!gradeVal) {
      const match = name.match(/[\s_-]?([123１２３])年生?$/) || name.match(/[\s_-]([123１２３])$/) || name.match(/([123１２３])$/);
      if (match) {
        const val = match[1];
        if (val === '3' || val === '３') gradeVal = '3';
        else if (val === '2' || val === '２') gradeVal = '2';
        else gradeVal = '1';
      }
    }

    // Clean name of trailing grade indicators
    name = name.replace(/[\s_-]?([123１２３])年生?$/, '').replace(/[\s_-]([123１２３])$/, '').replace(/([123１２３])$/, '').trim();

    // Prefix team name if not present
    if (teamName && teamName !== '共通チーム') {
      const cleanTeam = teamName.trim();
      if (!name.includes(cleanTeam)) {
        name = `${cleanTeam} ${name}`;
      }
    }

    if (!playersMap.has(name)) {
      playersMap.set(name, { evs: [], las: [], dists: [], batSpeeds: [], attackAngles: [], adjustRates: [] });
    }
    if (normType) {
      if (!typedHitsMap.has(name)) {
        typedHitsMap.set(name, new Map());
      }
      const playerTypes = typedHitsMap.get(name)!;
      if (!playerTypes.has(normType)) {
        playerTypes.set(normType, { evs: [], las: [], dists: [], batSpeeds: [], attackAngles: [], adjustRates: [] });
      }
      const typedData = playerTypes.get(normType)!;
      if (!isNaN(ev)) typedData.evs.push(ev);
      if (!isNaN(la)) typedData.las.push(la);
      if (!isNaN(dist)) typedData.dists.push(dist);
      if (!isNaN(batSpeed)) typedData.batSpeeds.push(batSpeed);
      if (!isNaN(attackAngle)) typedData.attackAngles.push(attackAngle);
      if (!isNaN(adjustRate)) typedData.adjustRates.push(adjustRate);
    }

    if (dateVal && !playerDates.has(name)) {
      const parsedD = parseRapsodoDate(dateVal);
      if (parsedD) playerDates.set(name, parsedD);
    }
    
    if (gradeVal && !playerGrades.has(name)) {
      playerGrades.set(name, gradeVal);
    }

    const data = playersMap.get(name)!;
    if (!isNaN(ev)) data.evs.push(ev);
    if (!isNaN(la)) data.las.push(la);
    if (!isNaN(dist)) data.dists.push(dist);
    if (!isNaN(batSpeed)) data.batSpeeds.push(batSpeed);
    if (!isNaN(attackAngle)) data.attackAngles.push(attackAngle);
    if (!isNaN(adjustRate)) data.adjustRates.push(adjustRate);
  }

  const result: HittingPlayer[] = [];

  playersMap.forEach((data, name) => {
    const avgEv = data.evs.length > 0 ? sum(data.evs) / data.evs.length : 0;
    const avgLa = data.las.length > 0 ? sum(data.las) / data.las.length : 0;
    const avgDist = data.dists.length > 0 ? sum(data.dists) / data.dists.length : 0;
    
    // Use actual custom metrics if present, otherwise fall back to estimation formulas
    const avgBatSpeed = data.batSpeeds.length > 0 
      ? sum(data.batSpeeds) / data.batSpeeds.length 
      : (avgEv > 0 ? avgEv * 0.75 : 0);
    const avgAttackAngle = data.attackAngles.length > 0 
      ? sum(data.attackAngles) / data.attackAngles.length 
      : (avgLa > 0 ? avgLa * 0.8 : 10.0);
    const avgAdjustRate = data.adjustRates.length > 0 
      ? sum(data.adjustRates) / data.adjustRates.length 
      : (data.evs.length > 0 ? 50.0 : 0);
    
    const playerTypes = typedHitsMap.get(name);
    const hasHandThrow = playerTypes && playerTypes.has('手投げ') && playerTypes.get('手投げ')!.evs.length > 0;
    const hasTee = playerTypes && playerTypes.has('置きT') && playerTypes.get('置きT')!.evs.length > 0;

    const getAvgForType = (type: '手投げ' | '置きT', scale: { ev: number; la: number; bat: number; attack: number; adjust: number; dist: number }) => {
      const typedData = playerTypes ? playerTypes.get(type) : null;
      if (typedData && typedData.evs.length > 0) {
        const typeEv = sum(typedData.evs) / typedData.evs.length;
        const typeLa = sum(typedData.las) / typedData.las.length;
        const typeDist = sum(typedData.dists) / typedData.dists.length;
        const typeBat = typedData.batSpeeds.length > 0 ? sum(typedData.batSpeeds) / typedData.batSpeeds.length : typeEv * 0.75;
        const typeAttack = typedData.attackAngles.length > 0 ? sum(typedData.attackAngles) / typedData.attackAngles.length : typeLa * 0.8;
        const typeAdjust = typedData.adjustRates.length > 0 ? sum(typedData.adjustRates) / typedData.adjustRates.length : 50.0;
        return {
          exitVelocity: round(typeEv, 1),
          launchAngle: round(typeLa, 1),
          batSpeed: round(typeBat, 1),
          attackAngle: round(typeAttack, 1),
          adjustRate: round(typeAdjust, 1),
          distance: round(typeDist, 1)
        };
      } else {
        let sourceEv = avgEv;
        let sourceLa = avgLa;
        let sourceDist = avgDist;
        let sourceBat = avgBatSpeed;
        let sourceAttack = avgAttackAngle;
        let sourceAdjust = avgAdjustRate;

        if (type === '手投げ' && hasTee) {
          const teeData = playerTypes!.get('置きT')!;
          sourceEv = (sum(teeData.evs) / teeData.evs.length) / 0.95;
          sourceLa = (sum(teeData.las) / teeData.las.length) / 0.9;
          sourceDist = (sum(teeData.dists) / teeData.dists.length) / 0.9;
          sourceBat = (teeData.batSpeeds.length > 0 ? sum(teeData.batSpeeds) / teeData.batSpeeds.length : sourceEv * 0.75 * 0.95) / 0.95;
          sourceAttack = (teeData.attackAngles.length > 0 ? sum(teeData.attackAngles) / teeData.attackAngles.length : sourceLa * 0.8 * 0.95) / 0.95;
          sourceAdjust = (teeData.adjustRates.length > 0 ? sum(teeData.adjustRates) / teeData.adjustRates.length : 50.0 * 1.2) / 1.2;
        } else if (type === '置きT' && hasHandThrow) {
          const htData = playerTypes!.get('手投げ')!;
          sourceEv = sum(htData.evs) / htData.evs.length;
          sourceLa = sum(htData.las) / htData.las.length;
          sourceDist = sum(htData.dists) / htData.dists.length;
          sourceBat = htData.batSpeeds.length > 0 ? sum(htData.batSpeeds) / htData.batSpeeds.length : sourceEv * 0.75;
          sourceAttack = htData.attackAngles.length > 0 ? sum(htData.attackAngles) / htData.attackAngles.length : sourceLa * 0.8;
          sourceAdjust = htData.adjustRates.length > 0 ? sum(htData.adjustRates) / htData.adjustRates.length : 50.0;
        }

        return {
          exitVelocity: round(sourceEv * scale.ev, 1),
          launchAngle: round(sourceLa * scale.la, 1),
          batSpeed: round(sourceBat * scale.bat, 1),
          attackAngle: round(sourceAttack * scale.attack, 1),
          adjustRate: round(Math.min(100, Math.max(0, sourceAdjust * scale.adjust)), 1),
          distance: round(sourceDist * scale.dist, 1)
        };
      }
    };

    const handThrowRow = getAvgForType('手投げ', { ev: 1.0, la: 1.0, bat: 1.0, attack: 1.0, adjust: 1.0, dist: 1.0 });
    const teeRow = getAvgForType('置きT', { ev: 0.95, la: 0.9, bat: 0.95, attack: 0.95, adjust: 1.2, dist: 0.9 });
    const prevRow = getAvgForType('置きT', { ev: 0.98, la: 0.92, bat: 0.98, attack: 0.98, adjust: 1.0, dist: 0.92 });

    const rows: HittingStatsRow[] = [
      { type: '手投げ', ...handThrowRow },
      { type: '置きT', ...teeRow },
      { type: '前回（置きT）', ...prevRow }
    ];

    // Generate hitting courses based on aggregate stats (replicating the 4-box layout)
    const courses: CourseData = {
      outHigh: {
        distance: round(avgDist * 0.85, 1),
        exitVelocity: round(avgEv * 0.9, 1),
        launchAngle: round(avgLa * 1.1, 1),
        batSpeed: round(avgBatSpeed * 0.95, 1),
        power: round((avgEv * avgBatSpeed) / 3000, 1)
      },
      inHigh: {
        distance: round(avgDist * 1.1, 1),
        exitVelocity: round(avgEv * 1.05, 1),
        launchAngle: round(avgLa * 1.2, 1),
        batSpeed: round(avgBatSpeed * 1.02, 1),
        power: round((avgEv * 1.05 * avgBatSpeed * 1.02) / 3000, 1)
      },
      outLow: {
        distance: round(avgDist * 0.9, 1),
        exitVelocity: round(avgEv * 0.95, 1),
        launchAngle: round(avgLa * 0.8, 1),
        batSpeed: round(avgBatSpeed * 0.92, 1),
        power: round((avgEv * 0.95 * avgBatSpeed * 0.92) / 3000, 1)
      },
      inLow: {
        distance: round(avgDist * 0.7, 1),
        exitVelocity: round(avgEv * 0.85, 1),
        launchAngle: round(avgLa * 0.5, 1),
        batSpeed: round(avgBatSpeed * 0.98, 1),
        power: round((avgEv * 0.85 * avgBatSpeed * 0.98) / 3000, 1)
      }
    };

    const rawHits = [];
    if (playerTypes) {
      playerTypes.forEach((typedData, type) => {
        for (let idx = 0; idx < typedData.evs.length; idx++) {
          if (!isNaN(typedData.evs[idx]) && !isNaN(typedData.las[idx])) {
            rawHits.push({
              exitVelocity: round(typedData.evs[idx], 1),
              launchAngle: round(typedData.las[idx], 1),
              type: type
            });
          }
        }
      });
    } else {
      for (let idx = 0; idx < data.evs.length; idx++) {
        if (!isNaN(data.evs[idx]) && !isNaN(data.las[idx])) {
          rawHits.push({
            exitVelocity: round(data.evs[idx], 1),
            launchAngle: round(data.las[idx], 1)
          });
        }
      }
    }

    const measurementDate = playerDates.get(name) || '';
    const grade = playerGrades.get(name) || '';
    result.push({ name, rows, courses, measurementDate, grade, rawHits });
  });

  return result;
}

/**
 * Parses a pitching CSV file and aggregates statistics per player and pitch type.
 */
export function parsePitchingPlayers(csvText: string, teamName?: string): PitchingPlayer[] {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const nameIdx = headers.findIndex(h => h.toLowerCase().startsWith('player name') || h.toLowerCase() === 'player' || h.includes('氏名') || h.includes('名前') || h.includes('選手'));
  const typeIdx = headers.findIndex(h => h.toLowerCase().includes('pitch type') || h.toLowerCase() === 'pitchtype' || h.includes('球種'));
  const speedIdx = headers.findIndex(h => h.toLowerCase() === 'speed' || h.toLowerCase().includes('velocity') || h.includes('投球速度') || h.includes('速度'));
  const spinIdx = headers.findIndex(h => h.toLowerCase() === 'spin' || h.toLowerCase().includes('spin rate') || h.includes('回転数') || h.includes('回転量'));
  const effIdx = headers.findIndex(h => h.toLowerCase().includes('efficiency') || h.includes('回転効率'));
  const vbIdx = headers.findIndex(h => h.toLowerCase() === 'vb (trajectory)' || h.toLowerCase() === 'vb' || h.includes('縦の変化量') || h.includes('縦変化'));
  const hbIdx = headers.findIndex(h => h.toLowerCase() === 'hb (trajectory)' || h.toLowerCase() === 'hb' || h.includes('横の変化量') || h.includes('横変化'));
  const dirIdx = headers.findIndex(h => h.toLowerCase().includes('direction') || h.toLowerCase().includes('spin direction') || h.includes('回転方向'));
  const relHIdx = headers.findIndex(h => h.toLowerCase().includes('horizontal angle') || h.toLowerCase() === 'relh' || h.includes('リリース角度(横)') || h.includes('リリース横'));
  const relVIdx = headers.findIndex(h => h.toLowerCase().includes('release angle') || h.toLowerCase() === 'relv' || h.includes('リリース角度(縦)') || h.includes('リリース縦'));
  const gyroIdx = headers.findIndex(h => h.toLowerCase().includes('gyro') || h.includes('ジャイロ'));
  const relSideIdx = headers.findIndex(h => h.toLowerCase().includes('release side'));
  const dateIdx = headers.findIndex(h => h.toLowerCase() === 'date');
  const gradeIdx = headers.findIndex(h => h.toLowerCase().includes('学年') || h.toLowerCase().includes('grade') || h.toLowerCase().includes('class') || h.toLowerCase() === 'yr' || h.toLowerCase() === 'year');

  if (nameIdx === -1 || typeIdx === -1) return [];

  const playersMap = new Map<string, Map<string, { 
    speeds: number[], 
    spins: number[], 
    effs: number[], 
    dirs: string[], 
    vbs: number[], 
    hbs: number[],
    relHs: number[],
    relVs: number[],
    gyros: number[]
  }>>();
  
  const playerDates = new Map<string, string>();
  const playerGrades = new Map<string, string>();
  
  // Keep track of release sides per player to determine handedness
  const playerReleaseSides = new Map<string, number[]>();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= nameIdx || cols.length <= typeIdx) continue;

    const rawName = cols[nameIdx];
    const pitchType = normalizePitchType(cols[typeIdx]);
    if (!rawName || rawName === '-' || !pitchType || pitchType === '-') continue;

    let name = rawName.trim();

    const speed = speedIdx !== -1 ? parseFloat(cols[speedIdx]) : NaN;
    const spin = spinIdx !== -1 ? parseFloat(cols[spinIdx]) : NaN;
    const eff = effIdx !== -1 ? parseFloat(cols[effIdx]) : NaN;
    const vb = vbIdx !== -1 ? parseFloat(cols[vbIdx]) : NaN;
    const hb = hbIdx !== -1 ? parseFloat(cols[hbIdx]) : NaN;
    const direction = dirIdx !== -1 ? cols[dirIdx] : '1:30';
    const relH = relHIdx !== -1 ? parseFloat(cols[relHIdx]) : -3.0;
    const relV = relVIdx !== -1 ? parseFloat(cols[relVIdx]) : 1.5;
    const gyro = gyroIdx !== -1 ? parseFloat(cols[gyroIdx]) : 30.0;
    const relSide = relSideIdx !== -1 ? parseFloat(cols[relSideIdx]) : NaN;
    const dateVal = dateIdx !== -1 && cols.length > dateIdx ? cols[dateIdx] : '';
    let gradeVal = gradeIdx !== -1 && cols.length > gradeIdx ? cols[gradeIdx].trim() : '';

    if (!gradeVal) {
      const match = name.match(/[\s_-]?([123１２３])年生?$/) || name.match(/[\s_-]([123１２３])$/) || name.match(/([123１２３])$/);
      if (match) {
        const val = match[1];
        if (val === '3' || val === '３') gradeVal = '3';
        else if (val === '2' || val === '２') gradeVal = '2';
        else gradeVal = '1';
      }
    }

    // Clean name of trailing grade indicators
    name = name.replace(/[\s_-]?([123１２３])年生?$/, '').replace(/[\s_-]([123１２３])$/, '').replace(/([123１２３])$/, '').trim();

    // Prefix team name if not present
    if (teamName && teamName !== '共通チーム') {
      const cleanTeam = teamName.trim();
      if (!name.includes(cleanTeam)) {
        name = `${cleanTeam} ${name}`;
      }
    }

    if (!playersMap.has(name)) {
      playersMap.set(name, new Map());
    }
    
    if (gradeVal && !playerGrades.has(name)) {
      playerGrades.set(name, gradeVal);
    }
    if (!playerReleaseSides.has(name)) {
      playerReleaseSides.set(name, []);
    }
    
    if (dateVal && !playerDates.has(name)) {
      const parsedD = parseRapsodoDate(dateVal);
      if (parsedD) playerDates.set(name, parsedD);
    }

    if (!isNaN(relSide)) {
      playerReleaseSides.get(name)!.push(relSide);
    }

    const playerPitches = playersMap.get(name)!;
    if (!playerPitches.has(pitchType)) {
      playerPitches.set(pitchType, { speeds: [], spins: [], effs: [], dirs: [], vbs: [], hbs: [], relHs: [], relVs: [], gyros: [] });
    }

    const data = playerPitches.get(pitchType)!;
    if (!isNaN(speed)) data.speeds.push(speed);
    if (!isNaN(spin)) data.spins.push(spin);
    if (!isNaN(eff)) data.effs.push(eff);
    if (!isNaN(vb)) data.vbs.push(vb);
    if (!isNaN(hb)) data.hbs.push(hb);
    if (direction) data.dirs.push(direction);
    if (!isNaN(relH)) data.relHs.push(relH);
    if (!isNaN(relV)) data.relVs.push(relV);
    if (!isNaN(gyro)) data.gyros.push(gyro);
  }

  const result: PitchingPlayer[] = [];

  playersMap.forEach((pitchesMap, name) => {
    const rows: PitchingStatsRow[] = [];

    pitchesMap.forEach((data, pitchType) => {
      const count = data.speeds.length;
      const avgSpeed = count > 0 ? sum(data.speeds) / count : 0;
      const avgSpin = count > 0 ? sum(data.spins) / count : 0;
      const avgEff = count > 0 ? sum(data.effs) / count : 0;
      const avgVb = count > 0 ? sum(data.vbs) / count : 0;
      const avgHb = count > 0 ? sum(data.hbs) / count : 0;
      const avgRelH = data.relHs.length > 0 ? sum(data.relHs) / data.relHs.length : -3.0;
      const avgRelV = data.relVs.length > 0 ? sum(data.relVs) / data.relVs.length : 1.5;
      const avgGyro = data.gyros.length > 0 ? sum(data.gyros) / data.gyros.length : 30.0;
      const direction = data.dirs[0] || '1:15';

      // Push average row
      rows.push({
        pitchType,
        isMax: false,
        speed: round(avgSpeed, 1),
        spin: Math.round(avgSpin),
        efficiency: round(avgEff, 1),
        direction,
        vb: round(avgVb, 1),
        hb: round(avgHb, 1),
        relH: round(avgRelH, 2),
        relV: round(avgRelV, 2),
        gyro: round(avgGyro, 1),
        control: getControlRate(name)
      });

      // Push max row for fastballs
      const isFastball = pitchType.includes('ストレート') || pitchType.includes('4シーム') || pitchType.includes('クイック') || pitchType.includes('ツーシーム');
      if (isFastball && count > 1) {
        let maxIdx = 0;
        let maxSpeed = data.speeds[0];
        for (let idx = 1; idx < count; idx++) {
          if (data.speeds[idx] > maxSpeed) {
            maxSpeed = data.speeds[idx];
            maxIdx = idx;
          }
        }
        rows.push({
          pitchType,
          isMax: true,
          speed: round(maxSpeed, 1),
          spin: Math.round(data.spins[maxIdx] || avgSpin),
          efficiency: round(data.effs[maxIdx] || avgEff, 1),
          direction: data.dirs[maxIdx] || direction,
          vb: round(data.vbs[maxIdx] || avgVb, 1),
          hb: round(data.hbs[maxIdx] || avgHb, 1),
          relH: round(data.relHs[maxIdx] || avgRelH, 2),
          relV: round(data.relVs[maxIdx] || avgRelV, 2),
          gyro: round(data.gyros[maxIdx] || avgGyro, 1),
          control: getControlRate(name)
        });
      }
    });

    // Determine handedness based on release side (average < 0 means R, >= 0 means L)
    const sides = playerReleaseSides.get(name) || [];
    const avgSide = sides.length > 0 ? sum(sides) / sides.length : -3.0;
    const handedness = avgSide < 0 ? 'R' : 'L';

    // Mock quick times like Showa Gakuin PITCHING report
    const quickTimes: QuickTimes = {
      fastest: handedness === 'R' ? 1.21 : 1.25,
      average: handedness === 'R' ? 1.23 : 1.27,
      previous: handedness === 'R' ? 1.24 : 0
    };

    const previousStraight: PreviousStraightStats = {
      speed: 0,
      spin: 0,
      efficiency: 0,
      vb: 0,
      hb: 0,
      control: 0
    };

    const measurementDate = playerDates.get(name) || '';
    const grade = playerGrades.get(name) || '';
    result.push({ name, handedness, rows, quickTimes, previousStraight, measurementDate, grade });
  });

  return result;
}

// Helper utilities
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const round = (val: number, decimals: number) => {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
};

export function translatePlayerName(rawName: string): string {
  const name = rawName.trim().toLowerCase();
  if (name.includes('wake')) return 'ワケ';
  if (name.includes('hocchi')) return 'ホッチ';
  if (name.includes('murata')) return 'ムラタ';
  if (name.includes('shimizu')) return 'シミズ';
  if (name.includes('kaizu')) return 'カイヅ';
  if (name.includes('matsumoto')) return 'マツモト';
  if (name.includes('fukumoto')) return 'フクモト';
  if (name.includes('nakao')) return 'ナカオ';
  if (name.includes('nishida')) return 'ニシダ';
  if (name.includes('miyako')) return 'ミヤコ';
  if (name.includes('hayashi')) return 'ハヤシ';
  if (name.includes('takayama')) return 'タカヤマ';
  if (name.includes('imai')) return 'イマイ';
  
  const parts = rawName.split(/[\s_]+/);
  if (parts.length > 0) {
    const first = parts[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return rawName;
}

export function getControlRate(name: string): number {
  const CONTROL_RATES: { [key: string]: number } = {
    'ミヤコ': 40.0,
    'シミズ': 100.0,
    'カイヅ': 80.0,
    'マツモト': 80.0,
    'フクモト': 60.0,
    'ホッチ': 20.0,
    'タカヤマ': 100.0,
    'ワケ': 60.0,
    'ムラタ': 60.0,
    'ナカオ': 40.0,
    'ニシダ': 60.0,
    'ハヤシ': 40.0,
    'イマイ': 40.0
  };
  return CONTROL_RATES[name] !== undefined ? CONTROL_RATES[name] : 60.0;
}

/**
 * Parses Rapsodo date string (e.g. "Fri Jun 05 2026 10:02:32 AM") into "2026/6/5" format.
 */
export function parseRapsodoDate(dateStr: string): string {
  if (!dateStr || dateStr === '-') return '';
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const date = d.getDate();
      return `${year}/${month}/${date}`;
    }
  } catch (e) {
    console.warn("Failed to parse date string using native Date:", dateStr, e);
  }
  
  // Fallback parsing for Rapsodo format
  try {
    const parts = dateStr.split(/\s+/);
    if (parts.length >= 4) {
      const months: { [key: string]: number } = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };
      const monthName = parts[1].toLowerCase().substring(0, 3);
      const month = months[monthName];
      const date = parseInt(parts[2], 10);
      const year = parseInt(parts[3], 10);
      
      if (month && !isNaN(date) && !isNaN(year)) {
        return `${year}/${month}/${date}`;
      }
    }
  } catch (e) {
    console.warn("Fallback date parser also failed:", dateStr, e);
  }
  
  return dateStr;
}

function normalizePitchType(rawType: string): string {
  if (!rawType) return '';
  const t = rawType.trim().toLowerCase();
  
  if (t.includes('4-seam') || t.includes('4seam') || t.includes('four-seam') || t.includes('fourseam') || t === 'fastball' || t === 'ストレート') {
    return 'ストレート';
  }
  if (t.includes('quick') || t === 'ストレートクイック' || t === 'クイック') {
    return 'ストレートクイック';
  }
  if (t.includes('2-seam') || t.includes('2seam') || t.includes('two-seam') || t.includes('twoseam') || t === 'ツーシーム') {
    return 'ツーシーム';
  }
  if (t.includes('1-seam') || t.includes('1seam') || t.includes('one-seam') || t.includes('oneseam') || t === 'ワンシーム') {
    return 'ワンシーム';
  }
  if (t.includes('knuckle curve') || t.includes('knuckle-curve') || t.includes('ナックルカーブ')) {
    return 'ナックルカーブ';
  }
  if (t.includes('curve') || t === 'カーブ') {
    return 'カーブ';
  }
  if (t.includes('sweeper') || t === 'スイーパー') {
    return 'スイーパー';
  }
  if (t.includes('slurve') || t === 'スラーブ') {
    return 'スラーブ';
  }
  if (t.includes('slider') || t === 'スライダー') {
    if (t.includes('縦') || t.includes('vertical')) {
      return '縦スラ';
    }
    return 'スライダー';
  }
  if (t === '縦スラ' || t === '縦スライダー') {
    return '縦スラ';
  }
  if (t.includes('cutter') || t.includes('cut') || t === 'カット' || t === 'カットボール') {
    return 'カット';
  }
  if (t.includes('fork') || t === 'フォーク') {
    return 'フォーク';
  }
  if (t.includes('split') || t === 'スプリット') {
    return 'スプリット';
  }
  if (t.includes('change') || t === 'チェンジアップ') {
    return 'チェンジアップ';
  }
  if (t.includes('sinker') || t === 'シンカー') {
    return 'シンカー';
  }
  if (t.includes('knuckle') || t === 'ナックル') {
    return 'ナックル';
  }

  // 日本語の一般的な変換
  if (rawType === 'ストレート') return 'ストレート';
  if (rawType === 'カーブ') return 'カーブ';
  if (rawType === 'スライダー') return 'スライダー';
  if (rawType === 'チェンジアップ') return 'チェンジアップ';
  if (rawType === 'カットボール') return 'カット';
  if (rawType === 'スプリット') return 'スプリット';
  if (rawType === 'シンカー') return 'シンカー';
  if (rawType === 'フォーク') return 'フォーク';

  return rawType;
}

/**
 * 投球選手の集計データから要約用のMarkdownテキストを生成します。
 */
export function generatePitchingSummaryMarkdown(players: PitchingPlayer[]): string {
  let md = "【Rapsodo 投球データ測定サマリー】\n\n";
  for (const player of players) {
    md += `### 選手名: ${player.name} (${player.handedness === 'R' ? '右投げ' : '左投げ'})\n`;
    md += `#### クイックタイム (秒): 最速 ${player.quickTimes.fastest}s, 平均 ${player.quickTimes.average}s\n`;
    md += `#### 測定球種一覧:\n`;
    
    for (const row of player.rows) {
      if (row.isMax) {
        md += `- **${row.pitchType} (Max)**: 球速 ${row.speed}km/h, 回転数 ${row.spin}rpm, 回転効率 ${row.efficiency}%, 回転軸 ${row.direction}, VB ${row.vb}cm, HB ${row.hb}cm\n`;
      } else {
        md += `- **${row.pitchType} (平均)**: 球速 ${row.speed}km/h, 回転数 ${row.spin}rpm, 回転効率 ${row.efficiency}%, 回転軸 ${row.direction}, 変化量VB ${row.vb}cm, 変化量HB ${row.hb}cm, リリースH ${row.relH}m, リリースV ${row.relV}m, ジャイロ角度 ${row.gyro}°, コントロール ${row.control}%\n`;
      }
    }
    md += "\n";
  }
  return md.trim();
}

/**
 * 打撃選手の集計データから要約用のMarkdownテキストを生成します。
 */
export function generateHittingSummaryMarkdown(players: HittingPlayer[]): string {
  let md = "【Rapsodo 打撃データ測定サマリー】\n\n";
  for (const player of players) {
    md += `### 選手名: ${player.name}\n`;
    md += `#### 測定データ一覧:\n`;
    for (const row of player.rows) {
      md += `- **${row.type}**: 打球速度 ${row.exitVelocity}km/h, 打球角度 ${row.launchAngle}°, バット速度 ${row.batSpeed}km/h, アタックアングル ${row.attackAngle}°, コンタクト率 ${row.adjustRate}%, 飛距離 ${row.distance}m\n`;
    }
    if (player.courses) {
      const c = player.courses;
      md += `#### コース別データ (打球速度 / 飛距離):\n`;
      md += `- 内角高め: ${c.inHigh.exitVelocity}km/h / ${c.inHigh.distance}m (パワー: ${c.inHigh.power})\n`;
      md += `- 外角高め: ${c.outHigh.exitVelocity}km/h / ${c.outHigh.distance}m (パワー: ${c.outHigh.power})\n`;
      md += `- 内角低め: ${c.inLow.exitVelocity}km/h / ${c.inLow.distance}m (パワー: ${c.inLow.power})\n`;
      md += `- 外角低め: ${c.outLow.exitVelocity}km/h / ${c.outLow.distance}m (パワー: ${c.outLow.power})\n`;
    }
    md += "\n";
  }
  return md.trim();
}

