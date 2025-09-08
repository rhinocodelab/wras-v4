'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { revalidatePath } from 'next/cache';
import { translateAllRoutes, translateText as translateFlowText } from '@/ai/flows/translate-flow';
import { generateSpeech } from '@/ai/flows/tts-flow';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateAnnouncement, AnnouncementInput, AnnouncementOutput, generateTemplateAudio } from '@/ai/flows/announcement-flow';
import { transcribeAudio } from '@/ai/flows/speech-to-text-flow';
import { getCustomStationTranslation } from '@/lib/translation-utils';

const SESSION_COOKIE_NAME = 'session';

const loginSchema = z.object({
  email: z.string().min(1, { message: 'Username cannot be empty.' }),
  password: z.string().min(1, { message: 'Password cannot be empty.' }),
});

export type FormState = {
  message: string;
  errors?: {
    email?: string[];
    password?: string[];
  };
};

// --- Database Functions ---
export async function getDb() {
  const db = await open({
    filename: './database.db',
    driver: sqlite3.Database,
  });

  // Train Routes Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS train_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      train_number TEXT,
      train_name TEXT,
      start_station TEXT,
      start_code TEXT,
      end_station TEXT,
      end_code TEXT
    )
  `);

  // Translations Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS train_route_translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id INTEGER,
        language_code TEXT,
        train_number_translation TEXT,
        train_name_translation TEXT,
        start_station_translation TEXT,
        end_station_translation TEXT,
        FOREIGN KEY (route_id) REFERENCES train_routes(id) ON DELETE CASCADE
    )
  `);

  // Audio Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS train_route_audio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id INTEGER,
        language_code TEXT,
        train_number_audio_path TEXT,
        train_name_audio_path TEXT,
        start_station_audio_path TEXT,
        end_station_audio_path TEXT,
        FOREIGN KEY (route_id) REFERENCES train_routes(id) ON DELETE CASCADE
    )
  `);

  // Announcement Templates Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        language_code TEXT NOT NULL,
        template_text TEXT NOT NULL,
        UNIQUE(category, language_code)
    )
  `);

  // --- Safe Schema Migration for announcement_templates ---
  // Check if the template_audio_parts column exists
  const tableInfo = await db.all("PRAGMA table_info(announcement_templates)");
  const columnExists = tableInfo.some(col => col.name === 'template_audio_parts');

  // If the column doesn't exist, add it
  if (!columnExists) {
    await db.exec(`
      ALTER TABLE announcement_templates
      ADD COLUMN template_audio_parts TEXT
    `);
  }
  // --- End Migration ---

  // Custom Audio Files Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS custom_audio_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      language_code TEXT NOT NULL,
      description TEXT,
      audio_file_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      file_size INTEGER,
      duration REAL
    )
  `);

  // Saved ISL Announcements Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS saved_isl_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      train_route_id INTEGER NOT NULL,
      train_number TEXT NOT NULL,
      train_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      folder_path TEXT NOT NULL,
      published_html_path TEXT,
      audio_files TEXT, -- JSON string: {en: "path", hi: "path", mr: "path", gu: "path"}
      isl_video_files TEXT, -- JSON string: ["path1", "path2"]
      announcement_texts TEXT, -- JSON string: {en: "text", hi: "text", mr: "text", gu: "text"}
      status TEXT DEFAULT 'active'
    )
  `);

  // Text to ISL Projects Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS text_to_isl_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      original_text TEXT NOT NULL,
      translations TEXT NOT NULL, -- JSON string: {en: "text", mr: "text", hi: "text", gu: "text"}
      audio_files TEXT, -- JSON string: {en: "path", mr: "path", hi: "path", gu: "path"}
      isl_video_path TEXT,
      published_html_path TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Text to ISL Audio Files Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS text_to_isl_audio_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      language_code TEXT NOT NULL,
      original_text TEXT NOT NULL,
      audio_file_path TEXT NOT NULL,
      file_size INTEGER,
      duration REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES text_to_isl_projects(id) ON DELETE CASCADE
    )
  `);

  // General Announcements Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS general_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      original_text TEXT NOT NULL,
      translations TEXT NOT NULL, -- JSON string: {en: "text", mr: "text", hi: "text", gu: "text"}
      isl_video_playlist TEXT NOT NULL, -- JSON string: ["path1", "path2"]
      file_path TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}


export type TrainRoute = {
  id?: number;
  'Train Number': string;
  'Train Name': string;
  'Start Station': string;
  'Start Code': string;
  'End Station': string;
  'End Code': string;
};

export type GeneralAnnouncement = {
  id?: number;
  title: string;
  original_text: string;
  translations: { en: string; mr: string; hi: string; gu: string };
  isl_video_playlist: string[];
  file_path: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

export async function addTrainRoute(route: Omit<TrainRoute, 'id'>) {
  const db = await getDb();
  await db.run(
    'INSERT INTO train_routes (train_number, train_name, start_station, start_code, end_station, end_code) VALUES (?, ?, ?, ?, ?, ?)',
    route['Train Number'],
    route['Train Name'],
    route['Start Station'],
    route['Start Code'],
    route['End Station'],
    route['End Code']
  );
  await db.close();
  revalidatePath('/train-route-management');
  return { message: 'Route added successfully.' };
}


export async function saveTrainRoutes(routes: TrainRoute[]) {
  const db = await getDb();
  await db.run('DELETE FROM train_routes'); // Clear existing routes
  const stmt = await db.prepare(
    'INSERT INTO train_routes (train_number, train_name, start_station, start_code, end_station, end_code) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const route of routes) {
    await stmt.run(
      route['Train Number'],
      route['Train Name'],
      route['Start Station'],
      route['Start Code'],
      route['End Station'],
      route['End Code']
    );
  }
  await stmt.finalize();
  await db.close();
  revalidatePath('/train-route-management');
  return { message: `${routes.length} routes saved successfully.` };
}

export async function getTrainRoutes(): Promise<TrainRoute[]> {
  try {
    const db = await getDb();
    const routes = await db.all('SELECT id, train_number as "Train Number", train_name as "Train Name", start_station as "Start Station", start_code as "Start Code", end_station as "End Station", end_code as "End Code" FROM train_routes ORDER BY id DESC');
    await db.close();
    return routes;
  } catch (error) {
    console.error('Failed to fetch train routes:', error);
    return [];
  }
}

export async function deleteTrainRoute(id: number) {
  const db = await getDb();
  await db.run('DELETE FROM train_routes WHERE id = ?', id);
  await clearAudioForRoute(id);
  await db.close();
  revalidatePath('/train-route-management');
  return { message: 'Route deleted successfully.' };
}

export async function clearAllTrainRoutes() {
  const db = await getDb();
  await db.run('DELETE FROM train_routes');
  await clearAllAudio();
  await db.close();
  revalidatePath('/train-route-management');
  return { message: 'All routes have been deleted.' };
}

export type Translation = {
    route_id: number;
    language_code: string;
    train_number_translation: string;
    train_name_translation: string;
    start_station_translation: string;
    end_station_translation: string;
}

export async function saveTranslations(translations: Translation[]) {
    const db = await getDb();
    // Clear existing translations for the routes being updated
    const routeIds = [...new Set(translations.map(t => t.route_id))];
    if (routeIds.length > 0) {
        const placeholders = routeIds.map(() => '?').join(',');
        await db.run(`DELETE FROM train_route_translations WHERE route_id IN (${placeholders})`, ...routeIds);
    }
    
    const stmt = await db.prepare(
        'INSERT INTO train_route_translations (route_id, language_code, train_number_translation, train_name_translation, start_station_translation, end_station_translation) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const t of translations) {
        await stmt.run(t.route_id, t.language_code, t.train_number_translation, t.train_name_translation, t.start_station_translation, t.end_station_translation);
    }
    await stmt.finalize();
    await db.close();
}


export async function startTranslationProcess(routes: TrainRoute[]) {
  const translations = await translateAllRoutes(routes);
  await saveTranslations(translations);
  return { message: "Translation completed successfully." };
}

export async function translateSingleRoute(route: TrainRoute) {
  const translations = await translateAllRoutes([route]);
  await saveTranslations(translations);
  revalidatePath('/ai-database/translations');
  return { message: `Translation completed successfully for ${route['Train Name']}.` };
}

export type TranslationRecord = {
  language_code: string;
  train_number_translation: string;
  train_name_translation: string;
  start_station_translation: string;
  end_station_translation: string;
};

export type FullTranslationInfo = {
  id: number;
  train_number: string;
  train_name: string;
  start_station: string;
  end_station: string;
  translations: TranslationRecord[];
};

export async function getTranslations(): Promise<FullTranslationInfo[]> {
  try {
    const db = await getDb();
    const results = await db.all(`
      SELECT
        tr.id,
        tr.train_number,
        tr.train_name,
        tr.start_station,
        tr.end_station,
        trt.language_code,
        trt.train_number_translation,
        trt.train_name_translation,
        trt.start_station_translation,
        trt.end_station_translation
      FROM train_routes tr
      LEFT JOIN train_route_translations trt ON tr.id = trt.route_id
      ORDER BY tr.id, trt.language_code
    `);
    await db.close();
    
    const groupedTranslations: Record<string, FullTranslationInfo> = {};

    results.forEach(row => {
      if (!groupedTranslations[row.id]) {
        groupedTranslations[row.id] = {
          id: row.id,
          train_number: row.train_number,
          train_name: row.train_name,
          start_station: row.start_station,
          end_station: row.end_station,
          translations: [],
        };
      }
      if (row.language_code) {
        groupedTranslations[row.id].translations.push({
            language_code: row.language_code,
            train_number_translation: row.train_number_translation,
            train_name_translation: row.train_name_translation,
            start_station_translation: row.start_station_translation,
            end_station_translation: row.end_station_translation,
        });
      }
    });

    return Object.values(groupedTranslations);
  } catch (error) {
    console.error('Failed to fetch translations:', error);
    return [];
  }
}

export async function clearAllTranslations() {
  const db = await getDb();
  await db.run('DELETE FROM train_route_translations');
  await db.close();
  revalidatePath('/ai-database');
  return { message: 'All translations have been deleted.' };
}

async function saveAudioFile(audioContent: Uint8Array, filePath: string): Promise<string> {
    const audioDir = path.dirname(filePath);
    await fs.mkdir(audioDir, { recursive: true });
    await fs.writeFile(filePath, audioContent, 'binary');
    return filePath.replace(path.join(process.cwd(), 'public'), '');
}

export async function generateAudioForRoute(routeId: number, trainNumber: string, translations: TranslationRecord[]) {
    const db = await getDb();
    await db.run('DELETE FROM train_route_audio WHERE route_id = ?', routeId);
    
    const audioDir = path.join(process.cwd(), 'public', 'audio', trainNumber);
    await fs.mkdir(audioDir, { recursive: true });

    for (const t of translations) {
        const lang = t.language_code;

        // Generate audio concurrently for all fields for a single language
        const [numAudio, nameAudio, startAudio, endAudio] = await Promise.all([
            generateSpeech(t.train_number_translation, lang),
            generateSpeech(t.train_name_translation, lang),
            generateSpeech(t.start_station_translation, lang),
            generateSpeech(t.end_station_translation, lang),
        ]);
        
        const numPath = numAudio ? await saveAudioFile(numAudio, path.join(audioDir, `train_number_${lang}.wav`)) : '';
        const namePath = nameAudio ? await saveAudioFile(nameAudio, path.join(audioDir, `train_name_${lang}.wav`)) : '';
        const startPath = startAudio ? await saveAudioFile(startAudio, path.join(audioDir, `start_station_${lang}.wav`)) : '';
        const endPath = endAudio ? await saveAudioFile(endAudio, path.join(audioDir, `end_station_${lang}.wav`)) : '';
        
        if (numPath || namePath || startPath || endPath) {
          await db.run(
              'INSERT INTO train_route_audio (route_id, language_code, train_number_audio_path, train_name_audio_path, start_station_audio_path, end_station_audio_path) VALUES (?, ?, ?, ?, ?, ?)',
              routeId, lang, numPath, namePath, startPath, endPath
          );
        }

        // Add a delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await db.close();
    revalidatePath('/ai-database/translations');
    return { message: `Audio generated successfully for Train ${trainNumber}.` };
}


export async function clearAudioForRoute(routeId: number) {
    const db = await getDb();
    try {
        const route = await db.get('SELECT train_number FROM train_routes WHERE id = ?', routeId);

        if (route && route.train_number) {
            const audioDir = path.join(process.cwd(), 'public', 'audio', route.train_number);
            await fs.rm(audioDir, { recursive: true, force: true });
        }

        await db.run('DELETE FROM train_route_audio WHERE route_id = ?', routeId);
        
        await db.close();
        revalidatePath('/ai-database/translations');
        revalidatePath('/ai-database/audio');
        return { message: 'Audio files and records deleted successfully.' };

    } catch (error) {
        await db.close();
        console.error('Failed to clear audio for route:', error);
        throw new Error('Failed to clear audio files.');
    }
}

export type AudioRecord = {
    language_code: string;
    train_number_audio_path: string | null;
    train_name_audio_path: string | null;
    start_station_audio_path: string | null;
    end_station_audio_path: string | null;
};

export type FullAudioInfo = {
    id: number;
    train_number: string;
    train_name: string;
    audio: AudioRecord[];
};

export async function getAudioData(): Promise<FullAudioInfo[]> {
    try {
        const db = await getDb();
        const results = await db.all(`
            SELECT
                tr.id,
                tr.train_number,
                tr.train_name,
                tra.language_code,
                tra.train_number_audio_path,
                tra.train_name_audio_path,
                tra.start_station_audio_path,
                tra.end_station_audio_path
            FROM train_routes tr
            JOIN train_route_audio tra ON tr.id = tra.route_id
            ORDER BY tr.id, tra.language_code
        `);
        await db.close();

        const groupedAudio: Record<string, FullAudioInfo> = {};

        results.forEach(row => {
            if (!groupedAudio[row.id]) {
                groupedAudio[row.id] = {
                    id: row.id,
                    train_number: row.train_number,
                    train_name: row.train_name,
                    audio: [],
                };
            }
            groupedAudio[row.id].audio.push({
                language_code: row.language_code,
                train_number_audio_path: row.train_number_audio_path,
                train_name_audio_path: row.train_name_audio_path,
                start_station_audio_path: row.start_station_audio_path,
                end_station_audio_path: row.end_station_audio_path,
            });
        });

        return Object.values(groupedAudio);
    } catch (error) {
        console.error('Failed to fetch audio data:', error);
        return [];
    }
}

export async function clearAllAudio() {
    const db = await getDb();
    try {
        const audioDir = path.join(process.cwd(), 'public', 'audio');
        // Clear all subdirectories except 'templates' and '_announcements'
        const entries = await fs.readdir(audioDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(audioDir, entry.name);
            if (entry.isDirectory() && entry.name !== 'templates' && entry.name !== '_announcements') {
                await fs.rm(fullPath, { recursive: true, force: true });
            }
        }
        await db.run('DELETE FROM train_route_audio');
        await db.close();
        revalidatePath('/ai-database/audio');
        revalidatePath('/ai-database/translations');
        return { message: 'All route audio files and records deleted successfully.' };
    } catch (error) {
        await db.close();
        console.error('Failed to clear all audio:', error);
        throw new Error('Failed to clear all audio files.');
    }
}


export type VideoMetadata = {
  path: string;
  name: string;
  size: number;
  duration?: number;
};

export async function getIslVideos(): Promise<string[]> {
  const baseDir = path.join(process.cwd(), 'public');
  const videoDir = path.join(baseDir, 'isl_dataset');

  const findVideos = async (dir: string): Promise<string[]> => {
    let videoFiles: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          videoFiles = videoFiles.concat(await findVideos(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
          // Return the path relative to the 'public' directory
          const relativePath = path.relative(baseDir, fullPath);
          videoFiles.push(`/${relativePath.replace(/\\/g, '/')}`);
        }
      }
    } catch (error) {
       console.warn(`Could not read directory ${dir}:`, error);
    }
    return videoFiles;
  };

  try {
    await fs.access(videoDir);
    const videos = await findVideos(videoDir);
    return videos;
  } catch (error) {
    console.warn('ISL dataset directory does not exist or is not accessible.');
    return [];
  }
}

export async function getIslVideosWithMetadata(): Promise<VideoMetadata[]> {
  const baseDir = path.join(process.cwd(), 'public');
  const videoDir = path.join(baseDir, 'isl_dataset');

  // Function to get video duration using ffprobe
  const getVideoDuration = async (filePath: string): Promise<number | undefined> => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const command = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
      const { stdout } = await execAsync(command);
      const duration = parseFloat(stdout.trim());
      return isNaN(duration) ? undefined : duration;
    } catch (error) {
      console.warn(`Could not get duration for ${filePath}:`, error);
      return undefined;
    }
  };

  const findVideosWithMetadata = async (dir: string): Promise<VideoMetadata[]> => {
    let videoFiles: VideoMetadata[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          videoFiles = videoFiles.concat(await findVideosWithMetadata(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
          try {
            // Get file stats for size
            const stats = await fs.stat(fullPath);
            
            // Get video duration
            const duration = await getVideoDuration(fullPath);
            
            // Return the path relative to the 'public' directory
            const relativePath = path.relative(baseDir, fullPath);
            const webPath = `/${relativePath.replace(/\\/g, '/')}`;
            
            videoFiles.push({
              path: webPath,
              name: entry.name.replace('.mp4', '').replace(/_/g, ' '),
              size: stats.size,
              duration: duration
            });
          } catch (error) {
            console.warn(`Could not get metadata for ${fullPath}:`, error);
          }
        }
      }
    } catch (error) {
       console.warn(`Could not read directory ${dir}:`, error);
    }
    return videoFiles;
  };

  try {
    await fs.access(videoDir);
    return await findVideosWithMetadata(videoDir);
  } catch (error) {
    console.warn('ISL dataset directory does not exist or is not accessible.');
    return [];
  }
}

export type Template = {
  id?: number;
  category: string;
  language_code: string;
  template_text: string;
};

export async function getAnnouncementTemplates(): Promise<Template[]> {
    const db = await getDb();
    try {
        const templates = await db.all('SELECT id, category, language_code, template_text FROM announcement_templates');
        return templates;
    } catch (error) {
        console.error('Failed to fetch announcement templates:', error);
        return [];
    } finally {
        await db.close();
    }
}

export async function saveAnnouncementTemplate(template: Omit<Template, 'id'>) {
    const db = await getDb();
    try {
        // Use INSERT OR REPLACE to either insert a new record or replace an existing one
        // based on the UNIQUE constraint on (category, language_code).
        // Also, explicitly set template_audio_parts to NULL to clear old audio paths.
        const stmt = await db.prepare(
            'INSERT OR REPLACE INTO announcement_templates (category, language_code, template_text, template_audio_parts) VALUES (?, ?, ?, NULL)'
        );
        await stmt.run(template.category, template.language_code, template.template_text);
        await stmt.finalize();
        revalidatePath('/announcement-templates');
    } catch (error) {
        console.error('Failed to save announcement template:', error);
        throw new Error('Failed to save template.');
    } finally {
        await db.close();
    }
}

export async function generateAndSaveTemplateAudio(category: string, lang: string) {
    const db = await getDb();
    try {
        // 1. Get the template text
        const templateRecord = await db.get('SELECT template_text FROM announcement_templates WHERE category = ? AND language_code = ?', [category, lang]);
        if (!templateRecord) {
            throw new Error(`Template not found for ${category} - ${lang}`);
        }

        // 2. Call the AI flow to generate audio
        const audioParts = await generateTemplateAudio({
            templateText: templateRecord.template_text,
            category,
            languageCode: lang,
        });

        // 3. Save the returned paths to the database
        await db.run('UPDATE announcement_templates SET template_audio_parts = ? WHERE category = ? AND language_code = ?', [
            JSON.stringify(audioParts),
            category,
            lang
        ]);
        
        revalidatePath('/ai-database/template-audio');
        return { message: `Audio successfully generated for ${category} in ${lang}.` };

    } catch (error) {
        console.error(`Error processing template audio for ${category} - ${lang}:`, error);
        throw error;
    } finally {
        await db.close();
    }
}


export async function clearAllAnnouncementTemplates() {
  const db = await getDb();
  try {
    const templatesDir = path.join(process.cwd(), 'public', 'audio', 'templates');
    await fs.rm(templatesDir, { recursive: true, force: true }).catch(err => {
        if (err.code !== 'ENOENT') { // Ignore error if directory doesn't exist
            throw err;
        }
    });

    await db.run('DELETE FROM announcement_templates');
    revalidatePath('/announcement-templates');
    return { message: 'All announcement templates and their audio have been deleted.' };
  } catch (error) {
    console.error('Failed to clear announcement templates:', error);
    throw new Error('Failed to clear templates.');
  } finally {
    await db.close();
  }
}

// Add this function before stitchVideosWithFfmpeg
async function validateVideoFile(videoPath: string): Promise<{ valid: boolean; duration?: number; resolution?: string; frameRate?: number; error?: string }> {
    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        const absolutePath = path.join(process.cwd(), 'public', videoPath);
        
        // Use ffprobe to get video information
        const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${absolutePath}"`;
        const { stdout } = await execAsync(command);
        const videoInfo = JSON.parse(stdout);
        
        if (!videoInfo.streams || videoInfo.streams.length === 0) {
            return { valid: false, error: 'No video streams found' };
        }
        
        const videoStream = videoInfo.streams.find((stream: any) => stream.codec_type === 'video');
        if (!videoStream) {
            return { valid: false, error: 'No video stream found' };
        }
        
        const duration = parseFloat(videoInfo.format?.duration || '0');
        const width = parseInt(videoStream.width || '0');
        const height = parseInt(videoStream.height || '0');
        const frameRate = videoStream.r_frame_rate ? eval(videoStream.r_frame_rate) : undefined;
        
        return {
            valid: true,
            duration,
            resolution: `${width}x${height}`,
            frameRate
        };
    } catch (error) {
        return { valid: false, error: `Validation failed: ${error instanceof Error ? error.message : String(error)}` };
    }
}

// Add this function after validateVideoFile
async function checkAndFixVideoFile(videoPath: string): Promise<{ fixed: boolean; newPath?: string; error?: string }> {
    try {
        console.log(`Checking and fixing video file: ${videoPath}`);
        
        // Check if this is the problematic vapi.mp4 file
        if (videoPath.includes('vapi.mp4')) {
            console.log('Detected vapi.mp4 - applying special handling');
            
            // Validate the original file first
            const originalValidation = await validateVideoFile(videoPath);
            if (!originalValidation.valid) {
                console.log('Original vapi.mp4 is invalid, attempting to fix...');
                
                // Try to re-encode the vapi.mp4 file to fix any issues
                const fixedPath = await reencodeVideoFile(videoPath, 'vapi_fixed.mp4');
                if (fixedPath) {
                    console.log('Successfully fixed vapi.mp4');
                    return { fixed: true, newPath: fixedPath };
                } else {
                    console.log('Failed to fix vapi.mp4, will skip this video');
                    return { fixed: false, error: 'Failed to fix vapi.mp4' };
                }
            } else {
                console.log('vapi.mp4 is valid, no fixing needed');
                return { fixed: false, newPath: videoPath };
            }
        }
        
        // For other videos, just validate
        const validation = await validateVideoFile(videoPath);
        if (validation.valid) {
            return { fixed: false, newPath: videoPath };
        } else {
            console.log(`Video ${videoPath} is invalid: ${validation.error}`);
            return { fixed: false, error: validation.error };
        }
        
    } catch (error) {
        console.error(`Error checking video file ${videoPath}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { fixed: false, error: errorMessage };
    }
}

async function reencodeVideoFile(videoPath: string, outputFileName: string): Promise<string | null> {
    try {
        console.log(`Re-encoding video file: ${videoPath}`);
        
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        const absoluteInputPath = path.join(process.cwd(), 'public', videoPath);
        const outputDir = path.join(process.cwd(), 'public', 'isl_video');
        await fs.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, outputFileName);
        
        // Use a more aggressive re-encoding approach for problematic videos
        const ffmpegCommand = `ffmpeg -i "${absoluteInputPath}" -c:v libx264 -preset fast -crf 20 -an -movflags +faststart -pix_fmt yuv420p -vf "fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" "${outputPath}" -y`;
        
        console.log('Re-encoding command:', ffmpegCommand);
        
        const { stdout, stderr } = await execAsync(ffmpegCommand);
        
        if (stderr) {
            console.log('FFmpeg stderr output:', stderr);
        }
        
        // Verify the output file
        const outputStats = await fs.stat(outputPath);
        if (outputStats.size === 0) {
            throw new Error('Re-encoded video file is empty');
        }
        
        console.log(`Video re-encoded successfully: ${outputPath} (${outputStats.size} bytes)`);
        
        // Validate the re-encoded video
        const validation = await validateVideoFile(outputPath.replace(path.join(process.cwd(), 'public'), ''));
        if (!validation.valid) {
            throw new Error(`Re-encoded video validation failed: ${validation.error}`);
        }
        
        return outputPath.replace(path.join(process.cwd(), 'public'), '');
        
    } catch (error) {
        console.error(`Error re-encoding video ${videoPath}:`, error);
        return null;
    }
}

async function normalizeVideoForStitching(videoPath: string, outputPath: string, targetFrameRate: number = 30, targetResolution: string = '1280x720'): Promise<string | null> {
    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        const absoluteInputPath = path.join(process.cwd(), 'public', videoPath);
        const absoluteOutputPath = path.join(process.cwd(), 'public', outputPath);
        
        // Normalize video to standard format for stitching (remove audio for ISL videos)
        const ffmpegCommand = `ffmpeg -i "${absoluteInputPath}" -vf "fps=${targetFrameRate},scale=${targetResolution}:force_original_aspect_ratio=decrease,pad=${targetResolution}:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset fast -crf 23 -an -movflags +faststart -pix_fmt yuv420p "${absoluteOutputPath}" -y`;
        
        console.log(`Normalizing video ${videoPath} to ${targetResolution} @ ${targetFrameRate}fps`);
        console.log('FFmpeg command:', ffmpegCommand);
        
        const { stdout, stderr } = await execAsync(ffmpegCommand);
        
        if (stderr) {
            console.log('FFmpeg stderr output:', stderr);
        }
        
        // Verify output file
        const outputStats = await fs.stat(absoluteOutputPath);
        if (outputStats.size === 0) {
            throw new Error('Normalized video file is empty');
        }
        
        console.log(`Video normalized successfully: ${outputPath} (${outputStats.size} bytes)`);
        return outputPath;
        
    } catch (error) {
        console.error(`Error normalizing video ${videoPath}:`, error);
        return null;
    }
}

async function preprocessVideoForStitching(videoPath: string): Promise<string | null> {
    try {
        console.log(`Pre-processing video for stitching: ${videoPath}`);
        
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        const absoluteInputPath = path.join(process.cwd(), 'public', videoPath);
        const outputDir = path.join(process.cwd(), 'public', 'isl_video');
        await fs.mkdir(outputDir, { recursive: true });
        
        // Create a unique output filename
        const baseName = path.basename(videoPath, path.extname(videoPath));
        const outputFileName = `${baseName}_processed_${Date.now()}.mp4`;
        const outputPath = path.join(outputDir, outputFileName);
        
        // Pre-process video to ensure compatibility:
        // - Force frame rate to 30fps
        // - Ensure consistent resolution (1280x720)
        // - Remove all audio tracks (-an flag)
        // - Use consistent codec settings (H.264)
        const ffmpegCommand = `ffmpeg -i "${absoluteInputPath}" -vf "fps=30:round=up,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset fast -crf 23 -an -movflags +faststart -pix_fmt yuv420p "${outputPath}" -y`;
        
        console.log('Pre-processing command:', ffmpegCommand);
        
        const { stdout, stderr } = await execAsync(ffmpegCommand);
        
        if (stderr) {
            console.log('FFmpeg stderr output:', stderr);
        }
        
        // Verify the output file
        const outputStats = await fs.stat(outputPath);
        if (outputStats.size === 0) {
            throw new Error('Pre-processed video file is empty');
        }
        
        console.log(`Video pre-processed successfully: ${outputPath} (${outputStats.size} bytes)`);
        
        // Validate the pre-processed video
        const validation = await validateVideoFile(outputPath.replace(path.join(process.cwd(), 'public'), ''));
        if (!validation.valid) {
            throw new Error(`Pre-processed video validation failed: ${validation.error}`);
        }
        
        return outputPath.replace(path.join(process.cwd(), 'public'), '');
        
    } catch (error) {
        console.error(`Error pre-processing video ${videoPath}:`, error);
        return null;
    }
}

// Add this function after normalizeVideoForStitching
async function createFinalIslAnnouncementVideo(
    videoPaths: string[], 
    outputFileName: string,
    targetDuration: number = 30,
    playbackSpeed: number = 1.33  // Default 1.33x speed (0.75 PTS)
): Promise<string | null> {
    try {
        console.log('Creating final ISL announcement video (video only)...');
        console.log('Video paths:', videoPaths);
        console.log(`Playback speed: ${playbackSpeed}x (PTS multiplier: ${1/playbackSpeed})`);
        
        // Check and fix problematic videos (especially vapi.mp4)
        console.log('Checking and fixing problematic videos...');
        const processedVideoPaths: string[] = [];
        
        for (const videoPath of videoPaths) {
            const checkResult = await checkAndFixVideoFile(videoPath);
            if (checkResult.fixed && checkResult.newPath) {
                console.log(`Using fixed version of ${videoPath}: ${checkResult.newPath}`);
                processedVideoPaths.push(checkResult.newPath);
            } else if (checkResult.newPath) {
                console.log(`Using original version of ${videoPath}`);
                processedVideoPaths.push(checkResult.newPath);
            } else {
                console.warn(`Skipping problematic video: ${videoPath} - ${checkResult.error}`);
                // Skip problematic videos instead of failing completely
            }
        }
        
        if (processedVideoPaths.length === 0) {
            console.error('No valid videos to process after checking and fixing');
            return null;
        }
        
        console.log('Processed video paths:', processedVideoPaths);
        
        // Videos are already preprocessed during upload, so we can use them directly
        console.log('Using preprocessed videos directly from upload...');
        const preprocessedVideoPaths = processedVideoPaths;
        
        // Create output directory
        const outputDir = path.join(process.cwd(), 'public', 'isl_video');
        await fs.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, outputFileName);
        
        // Create a temporary file list for ffmpeg
        const tempListPath = path.join(outputDir, 'temp_video_list.txt');
        const fileListContent = preprocessedVideoPaths
            .map(videoPath => `file '${path.join(process.cwd(), 'public', videoPath)}'`)
            .join('\n');
        
        await fs.writeFile(tempListPath, fileListContent);
        console.log('Created temporary file list:', tempListPath);

        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        // Create a video-only file with optimized settings for smooth playback
        // No audio merging - just clean video that won't get stuck
        // Use a simpler, more reliable approach for the final video with speed control
        const speedMultiplier = 1 / playbackSpeed;  // Convert speed to PTS multiplier
        let ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${tempListPath}" -filter:v "setpts=${speedMultiplier}*PTS" -c:v libx264 -preset fast -crf 23 -an -movflags +faststart -pix_fmt yuv420p "${outputPath}" -y`;
        
        console.log('Executing FFmpeg command for video-only announcement:', ffmpegCommand);
        
        let success = false;
        try {
            const { stdout, stderr } = await execAsync(ffmpegCommand);
            
            if (stderr) {
                console.log('FFmpeg stderr output:', stderr);
            }
            if (stdout) {
                console.log('FFmpeg stdout output:', stdout);
            }
            
            // Check if the simple concatenation worked
            const outputStats = await fs.stat(outputPath);
            if (outputStats.size > 0) {
                success = true;
                console.log('Simple concatenation successful');
            }
        } catch (error) {
            console.log('Simple concatenation failed, trying fallback method...');
        }
        
        // If simple concatenation failed, try a more robust approach
        if (!success) {
            console.log('Using fallback method with re-encoding for better compatibility...');
            
            // Fallback: Create a more robust final video with re-encoding and speed control
            ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${tempListPath}" -filter_complex "[0:v]fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setpts=${speedMultiplier}*PTS" -c:v libx264 -preset fast -crf 23 -an -movflags +faststart -pix_fmt yuv420p -t ${targetDuration} "${outputPath}" -y`;
            
            console.log('Fallback FFmpeg command:', ffmpegCommand);
            
            const { stdout, stderr } = await execAsync(ffmpegCommand);
            
            if (stderr) {
                console.log('Fallback FFmpeg stderr output:', stderr);
            }
            if (stdout) {
                console.log('Fallback FFmpeg stdout output:', stdout);
            }
        }
        
        // Verify the output file was created and has content
        try {
            const outputStats = await fs.stat(outputPath);
            if (outputStats.size === 0) {
                throw new Error('Final announcement video file is empty');
            }
            console.log(`Final announcement video created successfully: ${outputPath} (${outputStats.size} bytes)`);
            
            // Validate the output video
            const outputValidation = await validateVideoFile(outputPath.replace(path.join(process.cwd(), 'public'), ''));
            if (!outputValidation.valid) {
                throw new Error(`Final announcement video validation failed: ${outputValidation.error}`);
            }
            console.log('Final announcement video validation passed:', outputValidation);
            
            // Additional test: Verify the video can be played without issues
            console.log('Testing final video playback compatibility...');
            const playbackTest = await testVideoPlayback(outputPath.replace(path.join(process.cwd(), 'public'), ''));
            if (!playbackTest.success) {
                console.warn('Video playback test failed:', playbackTest.error);
                console.log('Video may have playback issues, but continuing...');
            } else {
                console.log('Video playback test passed - video should play smoothly');
            }
            
            // Clean up temporary file
            await fs.unlink(tempListPath).catch(() => {
                console.warn('Could not clean up temporary file list');
            });
            
            return outputPath.replace(path.join(process.cwd(), 'public'), '');
        } catch (statError) {
            console.error('Error checking final announcement video file:', statError);
            throw new Error('Final announcement video file verification failed');
        }
    } catch (error) {
        console.error('Error creating final ISL announcement video:', error);
        
        // Clean up temporary file on error
        try {
            const tempListPath = path.join(process.cwd(), 'public', 'isl_video', 'temp_video_list.txt');
            await fs.unlink(tempListPath).catch(() => {});
        } catch (cleanupError) {
            console.warn('Could not clean up temporary file on error');
        }
        
        return null;
    }
}

async function stitchVideosWithFfmpeg(videoPaths: string[], outputFileName: string, normalizeVideos: boolean = false): Promise<string | null> {
    if (videoPaths.length === 0) return null;
    if (videoPaths.length === 1) return videoPaths[0]; // No need to stitch if only one video

    try {
        console.log('Starting video stitching process...');
        console.log('Input videos:', videoPaths);
        
        // Validate all input videos first
        console.log('Validating input videos...');
        const validationResults = await Promise.all(
            videoPaths.map(async (path) => {
                const result = await validateVideoFile(path);
                console.log(`Video ${path}:`, result);
                return { path, ...result };
            })
        );
        
        const invalidVideos = validationResults.filter(r => !r.valid);
        if (invalidVideos.length > 0) {
            console.error('Invalid videos found:', invalidVideos);
            throw new Error(`Invalid videos: ${invalidVideos.map(v => v.path).join(', ')}`);
        }
        
        // Check for significant differences in video properties
        const durations = validationResults.map(r => r.duration || 0);
        const resolutions = validationResults.map(r => r.resolution || 'unknown');
        const frameRates = validationResults.map(r => r.frameRate || 0);
        
        console.log('Video properties summary:', {
            durations,
            resolutions,
            frameRates
        });
        
        // Create output directory for ISL videos
        const outputDir = path.join(process.cwd(), 'public', 'isl_video');
        await fs.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, outputFileName);
        
        // Create a temporary file list for ffmpeg
        const tempListPath = path.join(outputDir, 'temp_video_list.txt');
        const fileListContent = videoPaths
            .map(videoPath => `file '${path.join(process.cwd(), 'public', videoPath)}'`)
            .join('\n');
        
        await fs.writeFile(tempListPath, fileListContent);
        console.log('Created temporary file list:', tempListPath);

        // Use ffmpeg to concatenate videos with proper re-encoding for compatibility
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        // Improved FFmpeg command that handles codec compatibility issues
        // Using libx264 for video and aac for audio ensures maximum compatibility
        const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${tempListPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -movflags +faststart -pix_fmt yuv420p "${outputPath}" -y`;
        
        console.log('Executing FFmpeg command:', ffmpegCommand);
        
        const { stdout, stderr } = await execAsync(ffmpegCommand);
        
        if (stderr) {
            console.log('FFmpeg stderr output:', stderr);
        }
        if (stdout) {
            console.log('FFmpeg stdout output:', stdout);
        }
        
        // Verify the output file was created and has content
        try {
            const outputStats = await fs.stat(outputPath);
            if (outputStats.size === 0) {
                throw new Error('Output video file is empty');
            }
            console.log(`Output video created successfully: ${outputPath} (${outputStats.size} bytes)`);
            
            // Validate the output video
            const outputValidation = await validateVideoFile(outputPath.replace(path.join(process.cwd(), 'public'), ''));
            if (!outputValidation.valid) {
                throw new Error(`Output video validation failed: ${outputValidation.error}`);
            }
            console.log('Output video validation passed:', outputValidation);
            
        } catch (statError) {
            console.error('Error checking output file:', statError);
            throw new Error('Output video file verification failed');
        }
        
        // Clean up temporary file
        await fs.unlink(tempListPath).catch(() => {
            console.warn('Could not clean up temporary file list');
        });
        
        if (normalizeVideos) {
            return await normalizeVideoForStitching(outputPath, outputPath, 30, '1280x720');
        }
        
        return outputPath.replace(path.join(process.cwd(), 'public'), '');
    } catch (error) {
        console.error('Error stitching videos with ffmpeg:', error);
        
        // Clean up temporary file on error
        try {
            const tempListPath = path.join(process.cwd(), 'public', 'isl_video', 'temp_video_list.txt');
            await fs.unlink(tempListPath).catch(() => {});
        } catch (cleanupError) {
            console.warn('Could not clean up temporary file on error');
        }
        
        return null;
    }
}

export async function getIslVideoPlaylist(text: string): Promise<{ playlist: string[]; unmatchedWords: string[] }> {
    if (!text.trim()) {
        return { playlist: [], unmatchedWords: [] };
    }

    const allVideoPaths = await getIslVideos();
    const videoMap = new Map<string, string>();
    
    // Create mapping from video names to paths
    allVideoPaths.forEach(p => {
        // Extract the filename without extension
        const fileName = p.split('/').pop()?.replace('.mp4', '') ?? '';
        if (fileName) {
            videoMap.set(fileName.toLowerCase(), p);
        }
    });

    // Process the text to handle spaced numbers properly
    const processedText = text.toLowerCase().replace(/[.,]/g, '');
    const words = processedText.split(/\s+/);
    
    // Split multi-digit numbers into individual digits
    const processedWords: string[] = [];
    words.forEach(word => {
        // If the word is all digits, split it into individual digits
        if (/^\d+$/.test(word)) {
            processedWords.push(...word.split(''));
        } else {
            processedWords.push(word);
        }
    });
    
    const playlist: string[] = [];
    const unmatchedWords: string[] = [];
    let i = 0;
    
    while (i < processedWords.length) {
        const currentWord = processedWords[i];
        
        // Check for multi-word phrases first (e.g., "mumbai central")
        let foundMatch = false;
        // Check for phrases up to 3 words long
        for (let j = Math.min(i + 2, processedWords.length - 1); j >= i; j--) {
            const phrase = processedWords.slice(i, j + 1).join(' ');
            if (videoMap.has(phrase)) {
                playlist.push(videoMap.get(phrase)!);
                i = j + 1;
                foundMatch = true;
                break;
            }
        }
        if (!foundMatch) {
            // If no phrase match, check for single word
            if (videoMap.has(currentWord)) {
                playlist.push(videoMap.get(currentWord)!);
            } else {
                // Track unmatched words
                unmatchedWords.push(currentWord);
            }
            i++;
        }
    }
    
    // Create a final, optimized ISL announcement video that won't get stuck
    if (playlist.length > 0) {
        const outputFileName = `isl_announcement_final_${Date.now()}.mp4`;
        
        // Calculate target duration based on number of videos (minimum 30 seconds)
        const estimatedDuration = Math.max(30, playlist.length * 3);
        
        console.log(`Creating final ISL announcement video with ${playlist.length} video segments`);
        console.log(`Target duration: ${estimatedDuration} seconds`);
        
        // Use the new robust video creation function
        const finalVideo = await createFinalIslAnnouncementVideo(
            playlist, 
            outputFileName,
            estimatedDuration
        );
        
        if (finalVideo) {
            console.log('Final ISL announcement video created successfully:', finalVideo);
            return { playlist: [finalVideo], unmatchedWords };
        } else {
            console.warn('Failed to create final video, falling back to individual videos');
            // Fallback to individual videos if final creation fails
            return { playlist, unmatchedWords };
        }
    }
    
    return { playlist: [], unmatchedWords };
}

export async function handleGenerateAnnouncement(input: AnnouncementInput): Promise<AnnouncementOutput> {
  const announcementData = await generateAnnouncement(input);
  
  const englishAnnouncement = announcementData.announcements.find(a => a.language_code === 'en');
  if (englishAnnouncement && englishAnnouncement.text) {
      // Add spaces between digits for ISL video generation
      const processedText = englishAnnouncement.text.replace(/(\d)/g, ' $1 ');
      const result = await getIslVideoPlaylist(processedText);
      announcementData.isl_video_playlist = result.playlist;
  } else {
      announcementData.isl_video_playlist = [];
  }

  return announcementData;
}


// --- Auth Functions ---

export async function login(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    return {
      message: 'Invalid form data.',
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { email, password } = parsed.data;

  // Use environment variables for credentials
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'wras@dhh';

  if (email === adminUser && password === adminPassword) {
    const sessionData = {
      email: adminUser,
      name: 'Admin',
    };
    (await cookies()).set(SESSION_COOKIE_NAME, JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });
    return redirect('/');
  } else {
    return {
      message: 'Invalid username or password. Please try again.',
    };
  }
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE_NAME);
  redirect('/login');
}

export async function getSession() {
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    return null;
  }
  try {
    // In a real app, you'd want to verify the session against a database or token signature.
    return JSON.parse(sessionCookie.value) as { email: string; name: string };
  } catch {
    return null;
  }
}

export type TemplateAudioRecord = {
    language_code: string;
    template_text: string;
    template_audio_parts: (string | null)[];
};

export type TemplateAudioInfo = {
    category: string;
    templates: TemplateAudioRecord[];
};

export async function getTemplateAudioData(): Promise<TemplateAudioInfo[]> {
    const db = await getDb();
    try {
        const results = await db.all(`
            SELECT category, language_code, template_text, template_audio_parts
            FROM announcement_templates
            WHERE template_audio_parts IS NOT NULL
            ORDER BY category, language_code
        `);
        
        const groupedData: Record<string, TemplateAudioInfo> = {};

        results.forEach(row => {
            if (!groupedData[row.category]) {
                groupedData[row.category] = {
                    category: row.category.replace(/_/g, ' '),
                    templates: [],
                };
            }
            groupedData[row.category].templates.push({
                language_code: row.language_code,
                template_text: row.template_text,
                template_audio_parts: row.template_audio_parts ? JSON.parse(row.template_audio_parts) : [],
            });
        });

        return Object.values(groupedData);
    } catch (error) {
        console.error('Failed to fetch template audio data:', error);
        return [];
    } finally {
        await db.close();
    }
}

export async function clearAllTemplateAudio() {
    const db = await getDb();
    try {
        const templatesDir = path.join(process.cwd(), 'public', 'audio', 'templates');
        await fs.rm(templatesDir, { recursive: true, force: true }).catch(err => {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        });

        await db.run('UPDATE announcement_templates SET template_audio_parts = NULL');
        
        revalidatePath('/ai-database/template-audio');
        return { message: 'All template audio files have been deleted.' };
    } catch (error) {
        console.error('Failed to clear template audio:', error);
        throw new Error('Failed to clear template audio.');
    } finally {
        await db.close();
    }
}

export async function clearAnnouncementsFolder() {
    const announcementsDir = path.join(process.cwd(), 'public', 'audio', '_announcements');
    try {
        await fs.rm(announcementsDir, { recursive: true, force: true });
        // Recreate the directory so it exists for the next generation
        await fs.mkdir(announcementsDir, { recursive: true });
        return { message: 'Announcements folder cleared.' };
    } catch (error) {
        console.error('Failed to clear announcements folder:', error);
        // It's not a critical failure if this doesn't work, so don't throw
        return { message: 'Could not clear announcements folder.' };
    }
}


const speechToIslInput = z.object({
    text: z.string(),
    lang: z.string(),
});
  
export async function translateSpeechText(formData: FormData) {
    const parsed = speechToIslInput.safeParse(Object.fromEntries(formData.entries()));

    if (!parsed.success) {
        throw new Error('Invalid input for translation.');
    }
    
    const { text, lang } = parsed.data;

    const translatedText = await translateFlowText(text, 'en', lang);
    
    return {
        translatedText,
    };
}

const textToIslInput = z.object({
    text: z.string(),
    lang: z.string(),
});

export async function translateInputText(formData: FormData) {
    const parsed = textToIslInput.safeParse(Object.fromEntries(formData.entries()));

    if (!parsed.success) {
        throw new Error('Invalid input for translation.');
    }
    
    const { text, lang } = parsed.data;

    const translatedText = await translateFlowText(text, 'en', lang);
    
    return {
        translatedText,
    };
}

const audioToIslInput = z.object({
    audioDataUri: z.string(),
    languageCode: z.string(),
});

export async function transcribeAndTranslateAudio(formData: FormData) {
    const parsed = audioToIslInput.safeParse(Object.fromEntries(formData.entries()));

    if (!parsed.success) {
        throw new Error('Invalid input for audio transcription.');
    }
    
    const { audioDataUri, languageCode } = parsed.data;

    const { transcription } = await transcribeAudio({ audioDataUri, languageCode });

    if (!transcription) {
        return {
            transcribedText: '',
            translatedText: '',
        };
    }
    
    let translatedText = transcription;
    if (languageCode.split('-')[0] !== 'en') {
        translatedText = await translateFlowText(transcription, 'en', languageCode.split('-')[0]);
    }

    return {
        transcribedText: transcription,
        translatedText: translatedText,
    };
}

// --- Custom Audio Generation Types and Functions ---

export type CustomAudioFile = {
  id?: number;
  english_text: string;
  translated_text: string;
  language_code: string;
  description?: string;
  audio_file_path: string;
  created_at?: string;
  file_size?: number;
  duration?: number;
};

export async function generateCustomAudioTemporary(
  englishText: string, 
  languages: string[], 
  description?: string
): Promise<CustomAudioFile[]> {
  const db = await getDb();
  const results: CustomAudioFile[] = [];
  
  try {
    // Create temporary audio directory
    const audioDir = path.join(process.cwd(), 'public', 'audio', '_temp_custom');
    await fs.mkdir(audioDir, { recursive: true });

    // Generate timestamp for file naming
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const sanitizedDescription = description ? description.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_') : 'custom';
    
    for (let i = 0; i < languages.length; i++) {
      const lang = languages[i];
      try {
        // 1. Translate English text to target language
        const translatedText = await translateFlowText(englishText, lang, 'en');
        
        // 2. Generate audio from translated text
        const audioContent = await generateSpeech(translatedText, lang);
        
        if (!audioContent) {
          console.warn(`Failed to generate audio for language: ${lang}`);
          continue;
        }
        
        // 3. Save audio file to temporary directory
        const fileName = `${timestamp}_${sanitizedDescription}_${lang}.wav`;
        const filePath = path.join(audioDir, fileName);
        await fs.writeFile(filePath, audioContent);
        
        // 4. Get file stats
        const stats = await fs.stat(filePath);
        
        // 5. Create temporary record (not saved to database yet)
        const tempRecord: CustomAudioFile = {
          english_text: englishText,
          translated_text: translatedText,
          language_code: lang,
          description: description || '',
          audio_file_path: `/audio/_temp_custom/${fileName}`,
          file_size: stats.size,
          created_at: new Date().toISOString()
        };
        
        results.push(tempRecord);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error generating custom audio for language ${lang}:`, error);
        // Continue with other languages even if one fails
      }
    }
    
  } catch (error) {
    console.error('Error in generateCustomAudio:', error);
    throw error;
  } finally {
    await db.close();
  }
  
  return results;
}

export async function cleanupTemporaryCustomAudio(): Promise<void> {
  const tempDir = path.join(process.cwd(), 'public', 'audio', '_temp_custom');
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('Could not cleanup temporary custom audio directory:', error);
  }
}

export async function saveCustomAudioPermanently(
  temporaryFiles: CustomAudioFile[]
): Promise<CustomAudioFile[]> {
  const db = await getDb();
  const results: CustomAudioFile[] = [];
  
  try {
    // Create permanent custom audio directory
    const permanentDir = path.join(process.cwd(), 'public', 'audio', 'custom');
    await fs.mkdir(permanentDir, { recursive: true });

    for (const tempFile of temporaryFiles) {
      try {
        // 1. Move file from temporary to permanent location
        const tempFilePath = path.join(process.cwd(), 'public', tempFile.audio_file_path);
        const fileName = tempFile.audio_file_path.split('/').pop() || 'audio.wav';
        const permanentFilePath = path.join(permanentDir, fileName);
        
        // Move the file
        await fs.rename(tempFilePath, permanentFilePath);
        
        // 2. Update the file path
        const newFilePath = `/audio/custom/${fileName}`;
        
        // 3. Save to database
        const result = await db.run(
          'INSERT INTO custom_audio_files (english_text, translated_text, language_code, description, audio_file_path, file_size) VALUES (?, ?, ?, ?, ?, ?)',
          tempFile.english_text,
          tempFile.translated_text,
          tempFile.language_code,
          tempFile.description,
          newFilePath,
          tempFile.file_size
        );
        
        // 4. Get the inserted record
        const insertedRecord = await db.get(
          'SELECT * FROM custom_audio_files WHERE id = ?',
          result.lastID
        );
        
        results.push(insertedRecord as CustomAudioFile);
        
      } catch (error) {
        console.error(`Error saving custom audio file permanently:`, error);
        // Continue with other files even if one fails
      }
    }
    
  } catch (error) {
    console.error('Error in saveCustomAudioPermanently:', error);
    throw error;
  } finally {
    await db.close();
  }
  
  return results;
}

export async function getCustomAudioFiles(): Promise<CustomAudioFile[]> {
  const db = await getDb();
  try {
    const files = await db.all(
      'SELECT * FROM custom_audio_files ORDER BY created_at DESC'
    );
    return files as CustomAudioFile[];
  } catch (error) {
    console.error('Failed to fetch custom audio files:', error);
    return [];
  } finally {
    await db.close();
  }
}

export async function deleteCustomAudioFile(id: number): Promise<void> {
  const db = await getDb();
  try {
    // Get the file path before deleting
    const file = await db.get('SELECT audio_file_path FROM custom_audio_files WHERE id = ?', id);
    
    if (file) {
      // Delete the physical file
      const filePath = path.join(process.cwd(), 'public', file.audio_file_path);
      await fs.unlink(filePath).catch(() => {
        console.warn(`Could not delete file: ${filePath}`);
      });
    }
    
    // Delete from database
    await db.run('DELETE FROM custom_audio_files WHERE id = ?', id);
    
  } catch (error) {
    console.error('Failed to delete custom audio file:', error);
    throw error;
  } finally {
    await db.close();
  }
}

export async function clearAllCustomAudio(): Promise<{ message: string }> {
  const db = await getDb();
  try {
    // Get all file paths
    const files = await db.all('SELECT audio_file_path FROM custom_audio_files');
    
    // Delete all physical files
    for (const file of files) {
      const filePath = path.join(process.cwd(), 'public', file.audio_file_path);
      await fs.unlink(filePath).catch(() => {
        console.warn(`Could not delete file: ${filePath}`);
      });
    }
    
    // Clear database
    await db.run('DELETE FROM custom_audio_files');
    
    return { message: 'All custom audio files have been deleted.' };
  } catch (error) {
    console.error('Failed to clear custom audio files:', error);
    throw error;
  } finally {
    await db.close();
  }
}

export async function getCustomNumberAudio(number: string, language: string): Promise<CustomAudioFile | null> {
  const db = await getDb();
  try {
    const result = await db.get(
      'SELECT * FROM custom_audio_files WHERE english_text = ? AND language_code = ? AND description LIKE ? ORDER BY created_at DESC LIMIT 1',
      number,
      language,
      'Numbers 0-9%'
    );
    return result as CustomAudioFile || null;
  } catch (error) {
    console.error('Error fetching custom number audio:', error);
    return null;
  } finally {
    await db.close();
  }
}

export async function checkTemplateAudioExists(category: string): Promise<boolean> {
  const db = await getDb();
  try {
    const result = await db.get(
      'SELECT COUNT(*) as count FROM announcement_templates WHERE category = ? AND template_audio_parts IS NOT NULL',
      category
    );
    return (result?.count || 0) > 0;
  } catch (error) {
    console.error('Error checking template audio existence:', error);
    return false;
  } finally {
    await db.close();
  }
}

// Saved ISL Announcements Types and Functions
export type SavedAnnouncement = {
  id?: number;
  train_route_id: number;
  train_number: string;
  train_name: string;
  platform: string;
  category: string;
  folder_path: string;
  published_html_path?: string;
  audio_files: { [key: string]: string }; // {en: "path", hi: "path", mr: "path", gu: "path"}
  isl_video_files: string[]; // Array of video file paths
  announcement_texts: { [key: string]: string }; // {en: "text", hi: "text", mr: "text", gu: "text"}
  status?: string;
  created_at?: string;
  updated_at?: string;
};

export async function saveAnnouncementToDatabase(announcement: SavedAnnouncement): Promise<number> {
  const db = await getDb();
  try {
    const result = await db.run(`
      INSERT INTO saved_isl_announcements (
        train_route_id, train_number, train_name, platform, category,
        folder_path, published_html_path, audio_files, isl_video_files, announcement_texts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, 
    announcement.train_route_id,
    announcement.train_number,
    announcement.train_name,
    announcement.platform,
    announcement.category,
    announcement.folder_path,
    announcement.published_html_path || null,
    JSON.stringify(announcement.audio_files),
    JSON.stringify(announcement.isl_video_files),
    JSON.stringify(announcement.announcement_texts)
    );
    
    await db.close();
    return result.lastID || 0;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function getSavedAnnouncements(): Promise<SavedAnnouncement[]> {
  const db = await getDb();
  try {
    const results = await db.all(`
      SELECT * FROM saved_isl_announcements 
      WHERE status = 'active' 
      ORDER BY created_at DESC
    `);
    
    await db.close();
    
    return results.map(row => ({
      id: row.id,
      train_route_id: row.train_route_id,
      train_number: row.train_number,
      train_name: row.train_name,
      platform: row.platform,
      category: row.category,
      folder_path: row.folder_path,
      published_html_path: row.published_html_path,
      audio_files: JSON.parse(row.audio_files || '{}'),
      isl_video_files: JSON.parse(row.isl_video_files || '[]'),
      announcement_texts: JSON.parse(row.announcement_texts || '{}'),
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function saveAnnouncementToFiles(
  trainNumber: string,
  platform: string,
  category: string,
  announcements: any[],
  islVideoPlaylist: string[]
): Promise<{ audioFiles: { [key: string]: string }, islVideoFiles: string[], announcementTexts: { [key: string]: string } }> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  try {
    // Create folder structure for saved announcement
    const folderName = `${trainNumber}_${platform}_${category}`;
    const savedAnnouncementsDir = path.join(process.cwd(), 'public', 'saved_announcements', folderName);
    
    // Create directories
    await fs.mkdir(savedAnnouncementsDir, { recursive: true });
    await fs.mkdir(path.join(savedAnnouncementsDir, 'audio'), { recursive: true });
    await fs.mkdir(path.join(savedAnnouncementsDir, 'isl_videos'), { recursive: true });
    
    // Copy audio files
    const audioFiles: { [key: string]: string } = {};
    for (const announcement of announcements) {
      if (announcement.audio_path) {
        const sourcePath = path.join(process.cwd(), 'public', announcement.audio_path);
        const fileName = `${announcement.language_code}_announcement.wav`;
        const destPath = path.join(savedAnnouncementsDir, 'audio', fileName);
        
        await fs.copyFile(sourcePath, destPath);
        audioFiles[announcement.language_code] = `/saved_announcements/${folderName}/audio/${fileName}`;
      }
    }
    
    // Copy ISL video files
    const islVideoFiles: string[] = [];
    for (let i = 0; i < islVideoPlaylist.length; i++) {
      const sourcePath = path.join(process.cwd(), 'public', islVideoPlaylist[i]);
      const fileName = `video_${i + 1}.mp4`;
      const destPath = path.join(savedAnnouncementsDir, 'isl_videos', fileName);
      
      await fs.copyFile(sourcePath, destPath);
      islVideoFiles.push(`/saved_announcements/${folderName}/isl_videos/${fileName}`);
    }
    
    // Create announcement texts object
    const announcementTexts: { [key: string]: string } = {};
    for (const announcement of announcements) {
      announcementTexts[announcement.language_code] = announcement.text;
    }
    
    return { audioFiles, islVideoFiles, announcementTexts };
  } catch (error) {
    console.error('Failed to save announcement files:', error);
    throw error;
  }
}

export async function deleteAnnouncement(id: number): Promise<boolean> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const db = await getDb();
  
  try {
    // Get announcement details before deletion
    const announcement = await db.get(`
      SELECT * FROM saved_isl_announcements 
      WHERE id = ?
    `, [id]);
    
    if (!announcement) {
      throw new Error('Announcement not found');
    }
    
    // Delete from database (soft delete by setting status to 'deleted')
    await db.run(`
      UPDATE saved_isl_announcements 
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [id]);
    
    // Delete files from filesystem
    if (announcement.folder_path) {
      const folderPath = path.join(process.cwd(), 'public', announcement.folder_path);
      try {
        await fs.rm(folderPath, { recursive: true, force: true });
      } catch (fileError) {
        console.warn('Failed to delete files, but database record was updated:', fileError);
      }
    }
    
    await db.close();
    return true;
  } catch (error) {
    await db.close();
    console.error('Failed to delete announcement:', error);
    throw error;
  }
}

async function mergeAudioWithVideo(videoPath: string, audioPath: string, outputFileName: string, padDuration: number = 85): Promise<string | null> {
    if (!videoPath || !audioPath) {
        console.error('Missing paths:', { videoPath, audioPath });
        return null;
    }

    try {
        // Create output directory
        const outputDir = path.join(process.cwd(), 'public', 'audio', '_announcements');
        await fs.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, outputFileName);
        
        // Get absolute paths
        const absoluteVideoPath = path.join(process.cwd(), 'public', videoPath);
        const absoluteAudioPath = path.join(process.cwd(), 'public', audioPath);
        
        // Check if files exist
        const videoExists = await fs.access(absoluteVideoPath).then(() => true).catch(() => false);
        const audioExists = await fs.access(absoluteAudioPath).then(() => true).catch(() => false);
        
        console.log('File existence check:', {
            videoPath: absoluteVideoPath,
            videoExists,
            audioPath: absoluteAudioPath,
            audioExists
        });
        
        console.log('Input paths:', {
            originalVideoPath: videoPath,
            originalAudioPath: audioPath,
            absoluteVideoPath,
            absoluteAudioPath
        });
        
        if (!videoExists) {
            console.error('Video file does not exist:', absoluteVideoPath);
            return null;
        }
        
        if (!audioExists) {
            console.error('Audio file does not exist:', absoluteAudioPath);
            return null;
        }
        
        // Use ffmpeg to merge audio with video
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        const ffmpegCommand = `ffmpeg -i "${absoluteVideoPath}" -i "${absoluteAudioPath}" -filter_complex "[1:a]apad=pad_dur=${padDuration}[a]" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}" -y`;
        
        console.log('Executing FFmpeg command:', ffmpegCommand);
        await execAsync(ffmpegCommand);
        
        return outputPath.replace(path.join(process.cwd(), 'public'), '');
    } catch (error) {
        console.error('Error merging audio with video:', error);
        return null;
    }
}

async function mergeMultipleAudioWithVideo(videoPath: string, audioPaths: string[], outputFileName: string, padDuration: number = 85): Promise<string | null> {
    if (!videoPath || audioPaths.length === 0) return null;

    try {
        // Create output directory
        const outputDir = path.join(process.cwd(), 'public', 'audio', '_announcements');
        await fs.mkdir(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, outputFileName);
        
        // Get absolute paths
        const absoluteVideoPath = path.join(process.cwd(), 'public', videoPath);
        const absoluteAudioPaths = audioPaths.map(audioPath => path.join(process.cwd(), 'public', audioPath));
        
        // Create filter complex for multiple audio files
        const audioInputs = absoluteAudioPaths.map((_, index) => `-i "${absoluteAudioPaths[index]}"`).join(' ');
        const filterComplex = absoluteAudioPaths.map((_, index) => `[${index + 1}:a]apad=pad_dur=${padDuration}[a${index}]`).join(';');
        const audioMaps = absoluteAudioPaths.map((_, index) => `-map "[a${index}]"`).join(' ');
        
        // Use ffmpeg to merge multiple audio files with video
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        const ffmpegCommand = `ffmpeg -i "${absoluteVideoPath}" ${audioInputs} -filter_complex "${filterComplex}" -map 0:v:0 ${audioMaps} -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}" -y`;
        
        console.log('Executing FFmpeg command for multiple audio files:', ffmpegCommand);
        await execAsync(ffmpegCommand);
        
        return outputPath.replace(path.join(process.cwd(), 'public'), '');
    } catch (error) {
        console.error('Error merging multiple audio files with video:', error);
        return null;
    }
}

// Export the functions for use in ISL Editor
export { mergeAudioWithVideo, mergeMultipleAudioWithVideo };

// ISL Editor Export Function
export async function exportISLVideoWithAudio(
  timelineItems: TimelineItem[],
  projectName: string = 'untitled'
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  try {
    // Separate video and audio items from timeline
    const videoItems = timelineItems.filter(item => item.type === 'video');
    const audioItems = timelineItems.filter(item => item.type === 'audio');
    
    if (videoItems.length === 0) {
      return { success: false, error: 'No video items in timeline' };
    }
    
    // Get real video and audio data
    const [videos, audioSources] = await Promise.all([
      getISLVideosForEditor(),
      getAudioSourcesForEditor()
    ]);
    
    // Find the base video from timeline
    const baseVideo = videoItems[0];
    const videoData = videos.find(v => v.id === baseVideo.sourceId);
    
    if (!videoData) {
      return { success: false, error: 'Video file not found' };
    }
    
    // Get audio paths from timeline
    const audioPaths = audioItems
      .map(item => {
        const audioData = audioSources.find(a => a.id === item.sourceId);
        console.log('Audio item:', item);
        console.log('Found audio data:', audioData);
        return audioData?.path;
      })
      .filter(path => path) as string[];
    
    console.log('Audio paths found:', audioPaths);
    console.log('Video data:', videoData);
    console.log('Video path:', videoData?.path);
    
    if (audioPaths.length === 0) {
      return { success: false, error: 'No audio items in timeline' };
    }
    
    // Generate output filename
    const timestamp = Date.now();
    const outputFileName = `isl_editor_${projectName}_${timestamp}.mp4`;
    
    // Merge audio with video
    let outputPath: string | null;
    
    console.log('About to merge with:', {
      videoPath: videoData.path,
      audioPaths,
      outputFileName
    });
    
    if (audioPaths.length === 1) {
      // Single audio file
      console.log('Merging single audio file');
      outputPath = await mergeAudioWithVideo(videoData.path, audioPaths[0], outputFileName);
    } else {
      // Multiple audio files
      console.log('Merging multiple audio files');
      outputPath = await mergeMultipleAudioWithVideo(videoData.path, audioPaths, outputFileName);
    }
    
    if (outputPath) {
      return { success: true, outputPath };
    } else {
      return { success: false, error: 'Failed to merge audio with video' };
    }
    
  } catch (error) {
    console.error('Error exporting ISL video with audio:', error);
    return { success: false, error: 'Export failed' };
  }
}

// ISL Editor Data Functions
export async function getISLVideosForEditor(): Promise<ISLVideo[]> {
  try {
    const videos = await getIslVideosWithMetadata();
    
    return videos.map((video, index) => ({
      id: `video_${index + 1}`,
      name: video.name,
      path: video.path,
      category: getCategoryFromPath(video.path),
      duration: video.duration || 2.0,
      language: getLanguageFromPath(video.path),
      thumbnail: video.path // Use video path as thumbnail for now
    }));
  } catch (error) {
    console.error('Error fetching ISL videos:', error);
    return [];
  }
}

export async function getAudioSourcesForEditor(): Promise<AudioSource[]> {
  const db = await getDb();
  const audioSources: AudioSource[] = [];
  
  try {
    // 1. Get Route Audio from database
    const routeAudio = await db.all(`
      SELECT 
        tra.route_id,
        tr.train_number,
        tr.train_name,
        tra.language_code,
        tra.train_number_audio_path,
        tra.train_name_audio_path,
        tra.start_station_audio_path,
        tra.end_station_audio_path
      FROM train_route_audio tra
      JOIN train_routes tr ON tra.route_id = tr.id
      WHERE tra.language_code IN ('en', 'hi', 'mr', 'gu')
    `);

    routeAudio.forEach((audio, index) => {
      if (audio.train_number_audio_path) {
        audioSources.push({
          id: `route_${audio.route_id}_train_number_${audio.language_code}`,
          name: `Train Number ${audio.train_number}`,
          type: 'route',
          path: audio.train_number_audio_path,
          duration: 2.0, // Default duration
          language: audio.language_code
        });
      }
      if (audio.train_name_audio_path) {
        audioSources.push({
          id: `route_${audio.route_id}_train_name_${audio.language_code}`,
          name: `Train Name ${audio.train_name}`,
          type: 'route',
          path: audio.train_name_audio_path,
          duration: 2.5, // Default duration
          language: audio.language_code
        });
      }
      if (audio.start_station_audio_path) {
        audioSources.push({
          id: `route_${audio.route_id}_start_station_${audio.language_code}`,
          name: `Start Station`,
          type: 'route',
          path: audio.start_station_audio_path,
          duration: 2.0, // Default duration
          language: audio.language_code
        });
      }
      if (audio.end_station_audio_path) {
        audioSources.push({
          id: `route_${audio.route_id}_end_station_${audio.language_code}`,
          name: `End Station`,
          type: 'route',
          path: audio.end_station_audio_path,
          duration: 2.0, // Default duration
          language: audio.language_code
        });
      }
    });

    // 2. Get Template Audio from file system
    const templateCategories = ['Arriving', 'Delay', 'Cancelled', 'Platform_Change'];
    const languages = ['en', 'hi', 'mr', 'gu'];
    
    for (const category of templateCategories) {
      for (const lang of languages) {
        const templateDir = path.join(process.cwd(), 'public', 'audio', 'templates', category, lang);
        try {
          const files = await fs.readdir(templateDir);
          const audioFiles = files.filter(file => file.endsWith('.wav'));
          
          audioFiles.forEach((file, index) => {
            audioSources.push({
              id: `template_${category}_${lang}_${index}`,
              name: `${category} Template ${lang.toUpperCase()} - Part ${index + 1}`,
              type: 'template',
              path: `/audio/templates/${category}/${lang}/${file}`,
              duration: 2.0, // Default duration
              language: lang
            });
          });
        } catch (error) {
          // Directory doesn't exist or can't be read
          console.warn(`Template directory not found: ${templateDir}`);
        }
      }
    }

    // 3. Get Custom Audio from database
    const customAudio = await db.all(`
      SELECT 
        id,
        english_text,
        translated_text,
        language_code,
        description,
        audio_file_path,
        duration
      FROM custom_audio_files
      WHERE language_code IN ('en', 'hi', 'mr', 'gu')
      ORDER BY created_at DESC
    `);

    customAudio.forEach((audio) => {
      audioSources.push({
        id: `custom_${audio.id}`,
        name: audio.description || audio.english_text.substring(0, 30),
        type: 'custom',
        path: audio.audio_file_path,
        duration: audio.duration || 3.0,
        language: audio.language_code
      });
    });

    await db.close();
    return audioSources;
  } catch (error) {
    console.error('Error fetching audio sources:', error);
    await db.close();
    return [];
  }
}

// Helper functions
function getCategoryFromPath(videoPath: string): string {
  const pathParts = videoPath.split('/');
  const fileName = pathParts[pathParts.length - 1].replace('.mp4', '');
  
  // Map file names to categories
  const categoryMap: { [key: string]: string } = {
    'attention': 'common',
    'please': 'common',
    'train': 'transport',
    'number': 'common',
    'one': 'numbers',
    'two': 'numbers',
    'three': 'numbers',
    'arriving': 'actions',
    'cancelled': 'actions',
    'late': 'actions',
    'platform': 'common',
    'express': 'transport',
    'running': 'actions',
    'arrive': 'actions',
    'bandra': 'stations',
    'vapi': 'stations',
    'from': 'prepositions',
    'to': 'prepositions'
  };
  
  return categoryMap[fileName] || 'common';
}

function getLanguageFromPath(videoPath: string): string {
  // Extract language from path structure
  const pathParts = videoPath.split('/');
  const languageDir = pathParts[pathParts.length - 2];
  
  // Check if it's a language directory
  const languages = ['en', 'hi', 'mr', 'gu'];
  if (languages.includes(languageDir)) {
    return languageDir;
  }
  
  // Default to English if no language found in path
  return 'en';
}

// Interface definitions for ISL Editor
export interface ISLVideo {
  id: string;
  name: string;
  path: string;
  category: string;
  duration: number;
  language: string;
  thumbnail?: string;
}

export interface AudioSource {
  id: string;
  name: string;
  type: 'route' | 'template' | 'custom';
  path: string;
  duration: number;
  language: string;
}

export interface TimelineItem {
  id: string;
  type: 'video' | 'audio';
  sourceId: string;
  startTime: number;
  duration: number;
  position: number;
  language: string;
}

export async function translateTextToMultipleLanguages(text: string): Promise<{ en: string; mr: string; hi: string; gu: string }> {
    if (!text.trim()) {
        return { en: '', mr: '', hi: '', gu: '' };
    }

    console.log(`\n=== translateTextToMultipleLanguages called with: "${text}" ===`);

    // Check if we have a custom translation for this text
    const customTranslationHi = getCustomStationTranslation(text, 'hi');
    const customTranslationMr = getCustomStationTranslation(text, 'mr');
    const customTranslationGu = getCustomStationTranslation(text, 'gu');
    
    console.log(`Custom translations found:`, {
        hi: customTranslationHi || 'NONE',
        mr: customTranslationMr || 'NONE',
        gu: customTranslationGu || 'NONE'
    });
    
    if (customTranslationHi || customTranslationMr || customTranslationGu) {
        console.log(`✅ Using custom translations for "${text}":`, {
            hi: customTranslationHi || text,
            mr: customTranslationMr || text,
            gu: customTranslationGu || text
        });
        
        // For custom translations, we need to translate to English if the input is not English
        let englishTranslation = text;
        if (customTranslationHi || customTranslationMr || customTranslationGu) {
            // If we have custom translations, the input is likely English
            englishTranslation = text;
        } else {
            // If no custom translations, we need to translate to English
            try {
                const { Translate } = await import('@google-cloud/translate/build/src/v2');
                const translate = new Translate();
                const [enResult] = await translate.translate(text, 'en');
                englishTranslation = Array.isArray(enResult[0]) ? enResult[0][0] : enResult[0];
            } catch (error) {
                console.error('Error translating to English:', error);
                englishTranslation = text;
            }
        }
        
        return {
            en: englishTranslation,
            mr: customTranslationMr || text,
            hi: customTranslationHi || text,
            gu: customTranslationGu || text
        };
    }

    console.log(`❌ No custom translations found, calling Google Translate API for "${text}"`);

    try {
        const { Translate } = await import('@google-cloud/translate/build/src/v2');
        const { join } = await import('path');
        
        // Set the GOOGLE_APPLICATION_CREDENTIALS environment variable
        const credentialsPath = join(process.cwd(), 'config', 'isl.json');
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
        
        // Creates a client using the Translate class
        const translate = new Translate();
        
        // Translate to all four languages in parallel
        const [enResult, mrResult, hiResult, guResult] = await Promise.all([
            translate.translate(text, 'en').catch(() => [text]),
            translate.translate(text, 'mr').catch(() => [text]),
            translate.translate(text, 'hi').catch(() => [text]),
            translate.translate(text, 'gu').catch(() => [text])
        ]);
        
        const result = {
            en: Array.isArray(enResult[0]) ? enResult[0][0] : enResult[0],
            mr: Array.isArray(mrResult[0]) ? mrResult[0][0] : mrResult[0],
            hi: Array.isArray(hiResult[0]) ? hiResult[0][0] : hiResult[0],
            gu: Array.isArray(guResult[0]) ? guResult[0][0] : guResult[0]
        };
        
        console.log(`Google Translate results for "${text}":`, result);
        return result;
        
    } catch (error) {
        console.error('Error during multi-language translation:', error);
        // Return original text for all languages on error
        return { en: text, mr: text, hi: text, gu: text };
    }
}

export async function generateTextToSpeech(text: string, language: string): Promise<string> {
    if (!text.trim()) {
        throw new Error('Text is required for TTS generation.');
    }

    try {
        const textToSpeech = require('@google-cloud/text-to-speech');
        const { join } = await import('path');
        
        // Set the GOOGLE_APPLICATION_CREDENTIALS environment variable
        const credentialsPath = join(process.cwd(), 'config', 'isl.json');
        process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
        
        // Creates a client
        const client = new textToSpeech.TextToSpeechClient();
        
        // Language mapping from frontend to backend language codes
        const languageMapping = {
            'english': 'en',
            'marathi': 'mr',
            'hindi': 'hi',
            'gujarati': 'gu'
        };
        
        // Voice configuration mapping
        const voiceConfigs = {
            'en': 'en-IN-Chirp3-HD-Achernar',
            'mr': 'mr-IN-Chirp3-HD-Achernar', 
            'hi': 'hi-IN-Chirp3-HD-Achernar',
            'gu': 'gu-IN-Chirp3-HD-Achernar'
        };
        
        // Number mappings for Marathi and Gujarati
        const numberMappings = {
            'mr': {
                '0': 'शून्य', '1': 'एक', '2': 'दोन', '3': 'तीन', '4': 'चार',
                '5': 'पाच', '6': 'सहा', '7': 'सात', '8': 'आठ', '9': 'नऊ'
            },
            'gu': {
                '0': 'શૂન્ય', '1': 'એક', '2': 'બે', '3': 'ત્રણ', '4': 'ચાર',
                '5': 'પાંચ', '6': 'છ', '7': 'સાત', '8': 'આઠ', '9': 'નવ'
            }
        };
        
        // Map frontend language name to backend language code
        const languageCode = languageMapping[language as keyof typeof languageMapping];
        if (!languageCode) {
            throw new Error(`Unsupported language: ${language}`);
        }
        
        const voiceName = voiceConfigs[languageCode as keyof typeof voiceConfigs];
        if (!voiceName) {
            throw new Error(`Unsupported language code: ${languageCode}`);
        }
        
        // Process text based on language
        let processedText = text;
        
        // For Marathi and Gujarati, use native number words
        if (languageCode === 'mr' || languageCode === 'gu') {
            // Native number words for each language
            const nativeNumbers = {
                'mr': {
                    '0': 'शून्य', '1': 'एक', '2': 'दोन', '3': 'तीन', '4': 'चार',
                    '5': 'पाच', '6': 'सहा', '7': 'सात', '8': 'आठ', '9': 'नऊ'
                },
                'gu': {
                    '0': 'શૂન્ય', '1': 'એક', '2': 'બે', '3': 'ત્રણ', '4': 'ચાર',
                    '5': 'પાંચ', '6': 'છ', '7': 'સાત', '8': 'આઠ', '9': 'નવ'
                }
            };
            
            // Devanagari digit mapping
            const devanagariToArabic = {
                '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
                '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
            };
            
            // Gujarati digit mapping
            const gujaratiToArabic = {
                '૦': '0', '૧': '1', '૨': '2', '૩': '3', '૪': '4',
                '૫': '5', '૬': '6', '૭': '7', '૮': '8', '૯': '9'
            };
            
            // First convert Devanagari/Gujarati digits to Arabic digits, then process
            let convertedText = text;
            
            // Convert Devanagari digits
            Object.entries(devanagariToArabic).forEach(([devanagari, arabic]) => {
                convertedText = convertedText.replace(new RegExp(devanagari, 'g'), arabic);
            });
            
            // Convert Gujarati digits
            Object.entries(gujaratiToArabic).forEach(([gujarati, arabic]) => {
                convertedText = convertedText.replace(new RegExp(gujarati, 'g'), arabic);
            });
            
            // Now process Arabic digits with native number words
            const numberMap = nativeNumbers[languageCode as keyof typeof nativeNumbers];
            processedText = convertedText.replace(/(\d{2,})/g, (match) => {
                return match.split('').map(digit => numberMap[digit as keyof typeof numberMap] || digit).join(' ');
            });
            
            console.log(`Original: "${text}", Converted: "${convertedText}", Processed: "${processedText}"`);
        } else {
            // For English and Hindi, just add spaces between digits
            processedText = text.replace(/(\d{2,})/g, (match) => match.split('').join(' '));
        }
        
        console.log(`Language: ${languageCode}, Original: "${text}", Processed: "${processedText}"`);
        
        // Construct the request
        const request = {
            input: { text: processedText },
            voice: {
                languageCode: `${languageCode}-IN`,
                name: voiceName
            },
            audioConfig: {
                audioEncoding: 'LINEAR16',
                sampleRateHertz: 24000,
                effectsProfileId: ['headphone-class-device']
            },
        };
        
        // Performs the text-to-speech request
        const [response] = await client.synthesizeSpeech(request);
        
        if (!response.audioContent) {
            throw new Error('No audio content received from TTS API');
        }
        
        // Convert the audio content to base64 data URL
        const audioBuffer = response.audioContent;
        const base64Audio = audioBuffer.toString('base64');
        const dataUrl = `data:audio/wav;base64,${base64Audio}`;
        
        return dataUrl;
        
    } catch (error) {
        console.error('Error during GCP Text-to-Speech generation:', error);
        throw new Error(`Failed to generate TTS audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function saveTextToIslAudio(audioDataUrl: string, language: string, originalText: string, projectId?: number): Promise<{ filePath: string; dbId: number }> {
    if (!audioDataUrl || !language || !originalText) {
        throw new Error('Audio data URL, language, and original text are required.');
    }

    try {
        const { join } = await import('path');
        const fs = await import('fs/promises');
        
        // Create the directory if it doesn't exist
        const audioDir = join(process.cwd(), 'public', 'text_to_isl', 'audio');
        await fs.mkdir(audioDir, { recursive: true });
        
        // Generate filename with timestamp and language
        const timestamp = Date.now();
        
        // Improve text sanitization for railway announcements
        const sanitizedText = originalText
            .toLowerCase() // Convert to lowercase
            .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters except spaces
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .replace(/[_-]+/g, '_') // Replace multiple underscores with single underscore
            .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
            .substring(0, 25); // Limit length to 25 characters
        
        const filename = `tts_${language}_${timestamp}_${sanitizedText}.wav`;
        const filePath = join(audioDir, filename);
        
        // Convert data URL to buffer - handle both MP3 and WAV formats
        const base64Data = audioDataUrl.replace(/^data:audio\/(mp3|wav);base64,/, '');
        const audioBuffer = Buffer.from(base64Data, 'base64');
        
        // Write the file
        await fs.writeFile(filePath, audioBuffer);
        
        // Get file stats for database
        const stats = await fs.stat(filePath);
        
        // Return the relative path for web access
        const relativePath = `/text_to_isl/audio/${filename}`;
        
        // Save to database
        const audioFile: TextToIslAudioFile = {
            project_id: projectId,
            language_code: language,
            original_text: originalText,
            audio_file_path: relativePath,
            file_size: stats.size,
            duration: undefined // Could be calculated later if needed
        };
        
        const dbId = await saveTextToIslAudioFile(audioFile);
        
        console.log(`Audio saved: ${relativePath}, DB ID: ${dbId}`);
        return { filePath: relativePath, dbId };
        
    } catch (error) {
        console.error('Error saving audio file:', error);
        throw new Error(`Failed to save audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Text to ISL Types
export type TextToIslProject = {
  id?: number;
  project_name: string;
  original_text: string;
  translations: { en: string; mr: string; hi: string; gu: string };
  audio_files?: { en?: string; mr?: string; hi?: string; gu?: string };
  isl_video_path?: string;
  published_html_path?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

export type TextToIslAudioFile = {
  id?: number;
  project_id?: number;
  language_code: string;
  original_text: string;
  audio_file_path: string;
  file_size?: number;
  duration?: number;
  created_at?: string;
};

// Text to ISL Database Functions
export async function saveTextToIslProject(project: TextToIslProject): Promise<number> {
  const db = await getDb();
  
  const result = await db.run(`
    INSERT INTO text_to_isl_projects (
      project_name, original_text, translations, audio_files, 
      isl_video_path, published_html_path, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    project.project_name,
    project.original_text,
    JSON.stringify(project.translations),
    project.audio_files ? JSON.stringify(project.audio_files) : null,
    project.isl_video_path || null,
    project.published_html_path || null,
    project.status || 'active'
  ]);
  
  return result.lastID!;
}

export async function getTextToIslProjects(): Promise<TextToIslProject[]> {
  const db = await getDb();
  
  const projects = await db.all(`
    SELECT * FROM text_to_isl_projects 
    WHERE status = 'active' 
    ORDER BY created_at DESC
  `);
  
  return projects.map(project => ({
    ...project,
    translations: JSON.parse(project.translations),
    audio_files: project.audio_files ? JSON.parse(project.audio_files) : undefined
  }));
}

export async function saveTextToIslAudioFile(audioFile: TextToIslAudioFile): Promise<number> {
  const db = await getDb();
  
  const result = await db.run(`
    INSERT INTO text_to_isl_audio_files (
      project_id, language_code, original_text, audio_file_path, file_size, duration
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [
    audioFile.project_id || null,
    audioFile.language_code,
    audioFile.original_text,
    audioFile.audio_file_path,
    audioFile.file_size || null,
    audioFile.duration || null
  ]);
  
  return result.lastID!;
}

export async function getTextToIslAudioFiles(projectId?: number): Promise<TextToIslAudioFile[]> {
  const db = await getDb();
  
  let query = `SELECT * FROM text_to_isl_audio_files`;
  let params: any[] = [];
  
  if (projectId) {
    query += ` WHERE project_id = ?`;
    params.push(projectId);
  }
  
  query += ` ORDER BY created_at DESC`;
  
  return await db.all(query, params);
}

// General Announcements Database Functions
export async function saveGeneralAnnouncement(announcement: GeneralAnnouncement): Promise<number> {
    const db = await getDb();
    
    // Move the video file from public/isl_video to public/general_announcements
    const savedVideoPath = await moveGeneralAnnouncementVideo(announcement);
    
    // Update the playlist to reflect the new video path
    const updatedPlaylist = [savedVideoPath];
    
    const result = await db.run(`
        INSERT INTO general_announcements (
            title, original_text, translations, isl_video_playlist, file_path, status
        ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
        announcement.title,
        announcement.original_text,
        JSON.stringify(announcement.translations),
        JSON.stringify(updatedPlaylist), // Use the updated playlist with new path
        savedVideoPath, // Use the moved video path
        announcement.status || 'active'
    ]);
    
    await db.close();
    return result.lastID!;
}

export async function moveGeneralAnnouncementVideo(announcement: GeneralAnnouncement): Promise<string> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
        // Create general_announcements directory if it doesn't exist
        const generalAnnouncementsDir = path.join(process.cwd(), 'public', 'general_announcements');
        await fs.mkdir(generalAnnouncementsDir, { recursive: true });
        
        // Generate a unique filename based on title and timestamp
        const timestamp = Date.now();
        const sanitizedTitle = announcement.title.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${sanitizedTitle}_${timestamp}.mp4`;
        const destPath = path.join(generalAnnouncementsDir, fileName);
        
        // Use the first video from the playlist (this should be the generated video from isl_video folder)
        const sourceVideoPath = announcement.isl_video_playlist.length > 0 
            ? announcement.isl_video_playlist[0] 
            : announcement.file_path;
        
        if (!sourceVideoPath) {
            throw new Error('No video path available to move');
        }
        
        const sourcePath = path.join(process.cwd(), 'public', sourceVideoPath);
        
        // Check if source file exists
        try {
            await fs.access(sourcePath);
        } catch (error) {
            throw new Error(`Source video file not found: ${sourcePath}`);
        }
        
        // Move the file (instead of copying)
        await fs.rename(sourcePath, destPath);
        
        // Return the relative path for database storage
        const relativePath = `/general_announcements/${fileName}`;
        console.log(`General announcement video moved: ${sourcePath} -> ${destPath}`);
        
        return relativePath;
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error moving general announcement video:', errorMessage);
        throw new Error(`Failed to move video file: ${errorMessage}`);
    }
}

export async function getGeneralAnnouncements(): Promise<GeneralAnnouncement[]> {
  const db = await getDb();
  
  const announcements = await db.all(`
    SELECT * FROM general_announcements 
    WHERE status = 'active' 
    ORDER BY created_at DESC
  `);
  
  await db.close();
  
  return announcements.map(announcement => ({
    ...announcement,
    translations: JSON.parse(announcement.translations),
    isl_video_playlist: JSON.parse(announcement.isl_video_playlist)
  }));
}

export async function deleteGeneralAnnouncement(id: number): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  
  try {
    // First, get the announcement data to find the video file path
    const announcement = await db.get(`
      SELECT file_path, isl_video_playlist FROM general_announcements WHERE id = ?
    `, [id]);
    
    if (!announcement) {
      await db.close();
      return { success: false, message: 'Announcement not found' };
    }
    
    // Delete the video file from public/general_announcements
    try {
      const videoPath = announcement.file_path || (announcement.isl_video_playlist ? JSON.parse(announcement.isl_video_playlist)[0] : null);
      
      if (videoPath) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const fullVideoPath = path.join(process.cwd(), 'public', videoPath);
        
        // Check if file exists and delete it
        try {
          await fs.access(fullVideoPath);
          await fs.unlink(fullVideoPath);
          console.log(`Deleted video file: ${fullVideoPath}`);
        } catch (fileError) {
          console.warn(`Could not delete video file ${fullVideoPath}:`, fileError);
          // Continue with database deletion even if file deletion fails
        }
      }
    } catch (fileError) {
      console.warn('Error deleting video file:', fileError);
      // Continue with database deletion even if file deletion fails
    }
    
    // Mark the announcement as deleted in the database
    const result = await db.run(`
      UPDATE general_announcements 
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [id]);
    
    await db.close();
    
    if (result.changes === 0) {
      return { success: false, message: 'Announcement not found' };
    }
    
    return { success: true, message: 'Announcement and video file deleted successfully' };
  } catch (error) {
    await db.close();
    return { 
      success: false, 
      message: `Failed to delete announcement: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

async function testVideoPlayback(videoPath: string): Promise<{ success: boolean; error?: string }> {
    try {
        console.log(`Testing video playback for: ${videoPath}`);
        
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        const absolutePath = path.join(process.cwd(), 'public', videoPath);
        
        // Use ffprobe to check if the video can be read and has valid structure
        const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${absolutePath}"`;
        const { stdout, stderr } = await execAsync(command);
        
        if (!stdout) {
            return { success: false, error: 'FFprobe failed to analyze video' };
        }
        
        const videoInfo = JSON.parse(stdout);
        
        // Check if video has valid streams
        if (!videoInfo.streams || videoInfo.streams.length === 0) {
            return { success: false, error: 'No video streams found' };
        }
        
        // Check if video stream exists and is valid
        const videoStream = videoInfo.streams.find((s: any) => s.codec_type === 'video');
        if (!videoStream) {
            return { success: false, error: 'No video stream found' };
        }
        
        // Check if video has reasonable duration
        if (videoInfo.format && videoInfo.format.duration) {
            const duration = parseFloat(videoInfo.format.duration);
            if (duration < 0.1) {
                return { success: false, error: 'Video duration too short' };
            }
            if (duration > 3600) { // More than 1 hour
                return { success: false, error: 'Video duration too long' };
            }
        }
        
        // Check if video has reasonable file size
        if (videoInfo.format && videoInfo.format.size) {
            const size = parseInt(videoInfo.format.size);
            if (size < 1000) { // Less than 1KB
                return { success: false, error: 'Video file too small' };
            }
        }
        
        console.log('Video playback test passed - all checks successful');
        return { success: true };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Video playback test failed:', errorMessage);
        return { success: false, error: errorMessage };
    }
}

/**
 * Clears all files from the isl_video folder
 * This is useful for cleanup when closing the Generated Announcement modal
 */
export async function clearIslVideoFolder(): Promise<{ success: boolean; message: string }> {
    try {
        const islVideoDir = path.join(process.cwd(), 'public', 'isl_video');
        
        // Check if directory exists
        try {
            await fs.access(islVideoDir);
        } catch {
            return { success: true, message: 'ISL video folder does not exist' };
        }
        
        // Read all files in the directory
        const files = await fs.readdir(islVideoDir);
        
        if (files.length === 0) {
            return { success: true, message: 'ISL video folder is already empty' };
        }
        
        // Delete all files in the directory
        const deletePromises = files.map(async (filename) => {
            const filePath = path.join(islVideoDir, filename);
            try {
                const stat = await fs.stat(filePath);
                if (stat.isFile()) {
                    await fs.unlink(filePath);
                    console.log(`Deleted file: ${filename}`);
                }
            } catch (error) {
                console.warn(`Could not delete file ${filename}:`, error);
            }
        });
        
        await Promise.all(deletePromises);
        
        console.log(`Cleared ${files.length} files from ISL video folder`);
        return { 
            success: true, 
            message: `Successfully cleared ${files.length} files from ISL video folder` 
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error clearing ISL video folder:', errorMessage);
        return { 
            success: false, 
            message: `Failed to clear ISL video folder: ${errorMessage}` 
        };
    }
}

export async function clearGeneralAnnouncementVideos(): Promise<{ success: boolean; message: string }> {
    try {
        const generalAnnouncementsDir = path.join(process.cwd(), 'public', 'general_announcements');
        
        // Check if directory exists
        try {
            await fs.access(generalAnnouncementsDir);
        } catch {
            return { success: true, message: 'General announcements folder does not exist' };
        }
        
        // Read all files in the directory
        const files = await fs.readdir(generalAnnouncementsDir);
        
        if (files.length === 0) {
            return { success: true, message: 'General announcements folder is already empty' };
        }
        
        // Delete all files in the directory
        const deletePromises = files.map(async (filename) => {
            const filePath = path.join(generalAnnouncementsDir, filename);
            try {
                const stat = await fs.stat(filePath);
                if (stat.isFile()) {
                    await fs.unlink(filePath);
                    console.log(`Deleted general announcement file: ${filename}`);
                }
            } catch (error) {
                console.warn(`Could not delete file ${filename}:`, error);
            }
        });
        
        await Promise.all(deletePromises);
        
        console.log(`Cleared ${files.length} files from general announcements folder`);
        return { 
            success: true, 
            message: `Successfully cleared ${files.length} files from general announcements folder` 
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error clearing general announcements folder:', errorMessage);
        return { 
            success: false, 
            message: `Failed to clear general announcements folder: ${errorMessage}` 
        };
    }
}

// ISL Video Upload Functions
export async function uploadIslVideo(formData: FormData): Promise<{ success: boolean; message: string; videoPath?: string }> {
    try {
        const file = formData.get('video') as File;
        const videoName = formData.get('videoName') as string;
        
        if (!file) {
            return { success: false, message: 'No video file provided' };
        }
        
        // Validate video name is provided
        if (!videoName || !videoName.trim()) {
            return { success: false, message: 'Video name is required' };
        }
        
        // Validate and sanitize video name
        const trimmedName = videoName.trim();
        if (trimmedName.includes(' ')) {
            return { success: false, message: 'Video name cannot contain spaces' };
        }
        
        // Convert to lowercase and sanitize
        const sanitizedName = trimmedName.toLowerCase().replace(/[^a-zA-Z0-9-_]/g, '');
        if (!sanitizedName) {
            return { success: false, message: 'Video name must contain at least one valid character' };
        }
        
        // Validate file type
        if (!file.type.startsWith('video/')) {
            return { success: false, message: 'Please upload a valid video file' };
        }
        
        // Validate file size (max 3MB)
        const maxSize = 3 * 1024 * 1024; // 3MB
        if (file.size > maxSize) {
            return { success: false, message: 'Video file size must be less than 3MB' };
        }
        
        // Create ISL dataset directory if it doesn't exist
        const islDatasetDir = path.join(process.cwd(), 'public', 'isl_dataset');
        await fs.mkdir(islDatasetDir, { recursive: true });
        
        // Create individual folder for the video
        const videoFolder = path.join(islDatasetDir, sanitizedName);
        await fs.mkdir(videoFolder, { recursive: true });
        
        // Generate filename (use sanitized name directly)
        const fileName = `${sanitizedName}.mp4`;
        const tempFilePath = path.join(videoFolder, `temp_${fileName}`);
        const finalFilePath = path.join(videoFolder, fileName);
        
        // Save uploaded file temporarily
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await fs.writeFile(tempFilePath, buffer);
        
        console.log(`Temporary file saved: ${tempFilePath}`);
        
        // Preprocess the video using existing preprocessing function
        const preprocessedPath = await preprocessVideoForStitching(`/isl_dataset/${sanitizedName}/temp_${fileName}`);
        
        if (!preprocessedPath) {
            // Clean up temp file
            try {
                await fs.unlink(tempFilePath);
            } catch (error) {
                console.warn('Could not delete temp file:', error);
            }
            return { success: false, message: 'Failed to preprocess video. Please ensure the video file is valid.' };
        }
        
        // Move preprocessed file to final location
        const preprocessedFullPath = path.join(process.cwd(), 'public', preprocessedPath);
        await fs.rename(preprocessedFullPath, finalFilePath);
        
        // Clean up temp file
        try {
            await fs.unlink(tempFilePath);
        } catch (error) {
            console.warn('Could not delete temp file:', error);
        }
        
        const relativePath = `/isl_dataset/${sanitizedName}/${fileName}`;
        console.log(`ISL video uploaded and preprocessed successfully: ${relativePath}`);
        
        return { 
            success: true, 
            message: 'Video uploaded and preprocessed successfully!',
            videoPath: relativePath
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error uploading ISL video:', errorMessage);
        return { 
            success: false, 
            message: `Failed to upload video: ${errorMessage}` 
        };
    }
}

export async function deleteIslVideo(videoPath: string): Promise<{ success: boolean; message: string }> {
    try {
        const fullPath = path.join(process.cwd(), 'public', videoPath);
        
        // Check if file exists
        try {
            await fs.access(fullPath);
        } catch (error) {
            return { success: false, message: 'Video file not found' };
        }
        
        // Delete the file
        await fs.unlink(fullPath);
        
        console.log(`ISL video deleted: ${videoPath}`);
        return { 
            success: true, 
            message: 'Video deleted successfully' 
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error deleting ISL video:', errorMessage);
        return { 
            success: false, 
            message: `Failed to delete video: ${errorMessage}` 
        };
    }
}







