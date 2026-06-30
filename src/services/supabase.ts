import { createClient } from '@supabase/supabase-js';
import type { DocumentItem, AnalysisSheetData } from '../mockData';
import type { HittingPlayer, PitchingPlayer } from './csvParser';
import { 
  MOCK_DOCUMENTS, 
  MOCK_ANALYSIS_SHEETS, 
  MOCK_PITCHING_PLAYERS, 
  MOCK_HITTING_PLAYERS 
} from '../mockData';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = 
  !!supabaseUrl && 
  !!supabaseAnonKey && 
  !supabaseAnonKey.includes('ここに') && 
  supabaseAnonKey !== '';

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

// Helper to map DB row to DocumentItem
function mapDbToDocument(row: any): DocumentItem {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    fileType: row.file_type as 'pdf' | 'text',
    content: row.content,
    uploadedAt: row.uploaded_at ? new Date(row.uploaded_at).toLocaleString('ja-JP', { hour12: false }).substring(0, 16) : ''
  };
}

// Fetch all documents
export async function fetchDocuments(): Promise<DocumentItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('uploaded_at', { ascending: false });

  if (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }
  return (data || []).map(mapDbToDocument);
}

// Save document
export async function saveDocument(doc: DocumentItem): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('documents')
    .upsert({
      id: doc.id,
      title: doc.title,
      file_name: doc.fileName,
      file_type: doc.fileType,
      content: doc.content,
      uploaded_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error saving document:', error);
    throw error;
  }
}

// Fetch all analysis sheets
export async function fetchAnalysisSheets(): Promise<Record<string, AnalysisSheetData>> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('analysis_sheets')
    .select('*');

  if (error) {
    console.error('Error fetching analysis sheets:', error);
    throw error;
  }

  const sheets: Record<string, AnalysisSheetData> = {};
  if (data) {
    for (const row of data) {
      sheets[row.doc_id] = {
        summary: row.summary,
        keyMetrics: row.key_metrics,
        mechanics: row.mechanics,
        strengths: row.strengths,
        improvements: row.improvements,
        trainingPlan: row.training_plan
      };
    }
  }
  return sheets;
}

// Save analysis sheet
export async function saveAnalysisSheet(docId: string, sheet: AnalysisSheetData): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('analysis_sheets')
    .upsert({
      doc_id: docId,
      summary: sheet.summary,
      key_metrics: sheet.keyMetrics,
      mechanics: sheet.mechanics,
      strengths: sheet.strengths,
      improvements: sheet.improvements,
      training_plan: sheet.trainingPlan
    });

  if (error) {
    console.error('Error saving analysis sheet:', error);
    throw error;
  }
}

// Fetch all players
export async function fetchPlayers(): Promise<{
  hitting: Record<string, HittingPlayer[]>;
  pitching: Record<string, PitchingPlayer[]>;
}> {
  const hitting: Record<string, HittingPlayer[]> = {};
  const pitching: Record<string, PitchingPlayer[]> = {};

  if (!supabase) return { hitting, pitching };

  const { data, error } = await supabase
    .from('players')
    .select('doc_id, type, players_list');

  if (error) {
    console.error('Error fetching players:', error);
    throw error;
  }

  if (data) {
    for (const row of data) {
      const docId = row.doc_id;
      const type = row.type;
      const list = row.players_list; // This is a jsonb array
      
      if (Array.isArray(list)) {
        if (type === 'hitting') {
          hitting[docId] = list as HittingPlayer[];
        } else if (type === 'pitching') {
          pitching[docId] = list as PitchingPlayer[];
        }
      }
    }
  }

  return { hitting, pitching };
}

// Save players list (array of players) for a document
export async function savePlayersList(
  docId: string,
  type: 'hitting' | 'pitching',
  playersList: (HittingPlayer | PitchingPlayer)[]
): Promise<void> {
  if (!supabase) return;
  
  const { error } = await supabase
    .from('players')
    .upsert({
      doc_id: docId,
      type,
      players_list: playersList,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error saving players list:', error);
    throw error;
  }
}

// Seed mock data if documents table is empty
export async function seedDatabaseIfEmpty(): Promise<boolean> {
  if (!supabase) return false;
  
  // Check if documents table has rows
  const { count, error } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error checking documents count for seeding:', error);
    return false;
  }

  if (count && count > 0) {
    return false; // Already seeded / has data
  }

  console.log('Database is empty. Seeding mock data...');

  try {
    // 1. Seed documents
    for (const doc of MOCK_DOCUMENTS) {
      await saveDocument(doc);
    }

    // 2. Seed analysis sheets
    for (const docId of Object.keys(MOCK_ANALYSIS_SHEETS)) {
      await saveAnalysisSheet(docId, MOCK_ANALYSIS_SHEETS[docId]);
    }

    // 3. Seed pitching players
    await savePlayersList('doc-pitching', 'pitching', MOCK_PITCHING_PLAYERS);

    // 4. Seed hitting players
    await savePlayersList('doc-batting', 'hitting', MOCK_HITTING_PLAYERS);

    console.log('Database seeding completed successfully!');
    return true;
  } catch (seedErr) {
    console.error('Error seeding database:', seedErr);
    return false;
  }
}

// Delete document and all associated cascade data from Supabase
export async function deleteDocument(docId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', docId);

  if (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

