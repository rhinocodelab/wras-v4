import { NextRequest, NextResponse } from 'next/server';
import { getPodcastPlaylistById } from '@/app/podcast-actions';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const { playlistId } = await request.json();

    if (!playlistId) {
      return NextResponse.json({ error: 'Playlist ID is required' }, { status: 400 });
    }

    // Get playlist data
    const playlist = await getPodcastPlaylistById(playlistId);
    
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    if (!playlist.isl_video_path || !playlist.original_audio_path) {
      return NextResponse.json({ error: 'Playlist is missing video or audio file' }, { status: 400 });
    }

    // Generate HTML content
    const htmlContent = generatePublishedHTML(playlist);

    // Create published directory if it doesn't exist
    const publishedDir = path.join(process.cwd(), 'public', 'published', 'podcasts');
    await mkdir(publishedDir, { recursive: true });

    // Generate filename
    const safeTitle = playlist.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    
    const fileName = `${safeTitle}-${playlistId}.html`;
    const filePath = path.join(publishedDir, fileName);

    // Write HTML file
    await writeFile(filePath, htmlContent, 'utf-8');

    // Return the published URL
    const publishedUrl = `/published/podcasts/${fileName}`;

    return NextResponse.json({ 
      success: true, 
      publishedUrl,
      fileName 
    });

  } catch (error) {
    console.error('Error publishing podcast:', error);
    return NextResponse.json({ 
      error: 'Failed to publish podcast' 
    }, { status: 500 });
  }
}

function generatePublishedHTML(playlist: any): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${playlist.title} - PM Modi Mann Ki Baat</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #000000;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            overflow-x: hidden;
            margin: 0;
            padding: 0;
        }

        .container {
            max-width: 100%;
            width: 100%;
            padding: 0;
            text-align: center;
        }

        .header {
            margin-bottom: 0;
            padding: 20px;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .title {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            line-height: 1.2;
        }

        .video-container {
            background: transparent;
            border-radius: 0;
            padding: 0;
            margin-bottom: 0;
            backdrop-filter: none;
            border: none;
            box-shadow: none;
            width: 100%;
            height: calc(100vh - 120px);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .video-player {
            width: 100%;
            height: 100%;
            border-radius: 0;
            box-shadow: none;
            margin: 0;
            display: block;
            object-fit: contain;
        }

        .audio-player {
            position: fixed;
            top: -1000px;
            left: -1000px;
            opacity: 0;
            pointer-events: none;
        }


        @media (max-width: 768px) {
            .title {
                font-size: 2rem;
            }
            
            .header {
                height: 70px;
                padding: 15px;
            }
            
            .video-container {
                height: calc(100vh - 100px);
            }
        }

        @media (max-width: 480px) {
            .title {
                font-size: 1.5rem;
            }
            
            .header {
                height: 60px;
                padding: 10px;
            }
            
            .video-container {
                height: calc(100vh - 80px);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">${playlist.title}</h1>
        </div>

        <div class="video-container">
            <video 
                id="islVideo" 
                class="video-player" 
                autoplay 
                muted
                playsinline
                loop
            >
                <source src="${playlist.isl_video_path}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
        </div>

        <audio 
            id="audioPlayer" 
            class="audio-player" 
            autoplay
            loop
        >
            <source src="${playlist.original_audio_path}" type="audio/mpeg">
            <source src="${playlist.original_audio_path}" type="audio/wav">
            <source src="${playlist.original_audio_path}" type="audio/aac">
            Your browser does not support the audio element.
        </audio>
    </div>

    <script>
        const video = document.getElementById('islVideo');
        const audio = document.getElementById('audioPlayer');

        // Auto-play video (muted) and audio when page loads
        document.addEventListener('DOMContentLoaded', function() {
            video.play().catch(e => console.log('Video autoplay failed:', e));
            audio.play().catch(e => console.log('Audio autoplay failed:', e));
        });

        // Prevent context menu on video
        video.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });
    </script>
</body>
</html>`;
}

function getLanguageLabel(languageCode: string): string {
  const languageMap: { [key: string]: string } = {
    'en': 'English',
    'hi': 'Hindi',
    'mr': 'Marathi',
    'gu': 'Gujarati'
  };
  return languageMap[languageCode] || languageCode;
}