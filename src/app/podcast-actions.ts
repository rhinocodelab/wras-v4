'use server';

import { getDb } from './actions';
import { Podcast, PodcastPlaylist } from './actions';

// Initialize PM Modi Mann Ki Baat podcast
export async function initializePmModiPodcast(): Promise<void> {
    const db = await getDb();
    try {
        // Check if podcast already exists
        const existing = await db.get('SELECT id FROM podcasts WHERE name = ?', ['PM Modi: Mann Ki Baat']);
        
        if (!existing) {
            await db.run(`
                INSERT INTO podcasts (name, description, folder_path, status)
                VALUES (?, ?, ?, ?)
            `, [
                'PM Modi: Mann Ki Baat',
                'Prime Minister Narendra Modi\'s monthly radio program Mann Ki Baat',
                '/podcasts/pm-modi-mann-ki-baat',
                'active'
            ]);
            console.log('PM Modi Mann Ki Baat podcast initialized');
        }
    } finally {
        await db.close();
    }
}

// Podcast Database Functions
export async function getAllPodcasts(): Promise<Podcast[]> {
    const db = await getDb();
    try {
        const podcasts = await db.all('SELECT * FROM podcasts WHERE status = "active" ORDER BY created_at DESC');
        return podcasts as Podcast[];
    } finally {
        await db.close();
    }
}

export async function getPodcastById(id: number): Promise<Podcast | null> {
    const db = await getDb();
    try {
        const podcast = await db.get('SELECT * FROM podcasts WHERE id = ? AND status = "active"', [id]);
        return podcast as Podcast || null;
    } finally {
        await db.close();
    }
}

export async function getPodcastPlaylists(podcastId: number): Promise<PodcastPlaylist[]> {
    const db = await getDb();
    try {
        const playlists = await db.all(
            'SELECT * FROM podcast_playlists WHERE podcast_id = ? AND status = "active" ORDER BY created_at DESC',
            [podcastId]
        );
        return playlists as PodcastPlaylist[];
    } finally {
        await db.close();
    }
}

export async function getPodcastPlaylistById(playlistId: number): Promise<PodcastPlaylist | null> {
    const db = await getDb();
    try {
        const playlist = await db.get(
            'SELECT * FROM podcast_playlists WHERE id = ? AND status = "active"',
            [playlistId]
        );
        return playlist as PodcastPlaylist || null;
    } finally {
        await db.close();
    }
}

export async function createPodcastPlaylist(playlist: Omit<PodcastPlaylist, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; message: string; playlistId?: number }> {
    try {
        const db = await getDb();
        try {
            const result = await db.run(`
                INSERT INTO podcast_playlists (
                    podcast_id, title, description, audio_language, original_audio_path,
                    transcribed_text, translated_text, isl_video_path, avatar_model, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                playlist.podcast_id,
                playlist.title,
                playlist.description || null,
                playlist.audio_language,
                playlist.original_audio_path,
                playlist.transcribed_text || null,
                playlist.translated_text || null,
                playlist.isl_video_path || null,
                playlist.avatar_model || null,
                playlist.status || 'active'
            ]);
            
            return { 
                success: true, 
                message: 'Podcast playlist created successfully!',
                playlistId: result.lastID
            };
        } finally {
            await db.close();
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error creating podcast playlist:', errorMessage);
        return { 
            success: false, 
            message: `Failed to create playlist: ${errorMessage}` 
        };
    }
}

export async function updatePodcastPlaylist(id: number, updates: Partial<PodcastPlaylist>): Promise<{ success: boolean; message: string }> {
    try {
        const db = await getDb();
        try {
            const fields = [];
            const values = [];
            
            if (updates.title !== undefined) {
                fields.push('title = ?');
                values.push(updates.title);
            }
            if (updates.description !== undefined) {
                fields.push('description = ?');
                values.push(updates.description);
            }
            if (updates.transcribed_text !== undefined) {
                fields.push('transcribed_text = ?');
                values.push(updates.transcribed_text);
            }
            if (updates.translated_text !== undefined) {
                fields.push('translated_text = ?');
                values.push(updates.translated_text);
            }
            if (updates.isl_video_path !== undefined) {
                fields.push('isl_video_path = ?');
                values.push(updates.isl_video_path);
            }
            if (updates.avatar_model !== undefined) {
                fields.push('avatar_model = ?');
                values.push(updates.avatar_model);
            }
            
            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);
            
            await db.run(`
                UPDATE podcast_playlists 
                SET ${fields.join(', ')} 
                WHERE id = ?
            `, values);
            
            return { 
                success: true, 
                message: 'Podcast playlist updated successfully!' 
            };
        } finally {
            await db.close();
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error updating podcast playlist:', errorMessage);
        return { 
            success: false, 
            message: `Failed to update playlist: ${errorMessage}` 
        };
    }
}

export async function deletePodcastPlaylist(id: number): Promise<{ success: boolean; message: string }> {
    try {
        const db = await getDb();
        try {
            // Get playlist info before deletion
            const playlist = await db.get('SELECT * FROM podcast_playlists WHERE id = ?', [id]);
            
            if (!playlist) {
                return { success: false, message: 'Playlist not found' };
            }
            
            // Delete the playlist (soft delete by setting status to inactive)
            await db.run(`
                UPDATE podcast_playlists 
                SET status = 'inactive', updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [id]);
            
            // Here you could also delete the actual files if needed
            // await fs.unlink(playlist.original_audio_path);
            // await fs.unlink(playlist.isl_video_path);
            
            return { 
                success: true, 
                message: 'Playlist deleted successfully!' 
            };
        } finally {
            await db.close();
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error deleting podcast playlist:', errorMessage);
        return { 
            success: false, 
            message: `Failed to delete playlist: ${errorMessage}` 
        };
    }
}