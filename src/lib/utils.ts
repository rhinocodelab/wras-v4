import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { translateTextToMultipleLanguages } from '../app/actions';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateTextToIslHtml(
    originalText: string,
    translations: { en: string; mr: string; hi: string; gu: string },
    islVideoPath: string,
    audioFiles: { en?: string; mr?: string; hi?: string; gu: string },
    playbackSpeed: number = 1.0,
    hideInfoHeader: boolean = false
): string {
    // Create language-specific data for synchronization
    // If no audio files provided, show all translations without audio
    const hasAudioFiles = Object.values(audioFiles).some(path => path);
    const announcementData = Object.entries(translations)
        .filter(([lang, text]) => text && (hasAudioFiles ? audioFiles[lang as keyof typeof audioFiles] : true))
        .map(([lang, text]) => ({
            language_code: lang,
            text: text,
            audio_path: audioFiles[lang as keyof typeof audioFiles] || null
        }));
    const announcementDataJson = JSON.stringify(announcementData);
    
    // Convert audio paths to absolute URLs - ensure they point to text_to_isl/audio
    const audioPaths = Object.values(audioFiles).filter(p => p !== null);
    const audioSources = JSON.stringify(audioPaths);
    
    // Convert video path to absolute URL - ensure it points to isl_video
    // Use dynamic origin detection in JavaScript since we don't know the origin at build time
    const videoSources = JSON.stringify([islVideoPath]);
    
    // Generate audio elements HTML only if audio files exist
    const audioElementsHtml = hasAudioFiles ? `
    <audio id="announcement-audio"></audio>
    <audio id="intro-audio" preload="auto"></audio>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ISL Announcement - ${originalText}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #000; color: #fff; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        .main-content { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20px; }
        .info-header { text-align: center; margin-bottom: 20px; padding: 15px 25px; border-radius: 12px; background-color: rgba(255, 255, 255, 0.1); }
        .info-header h1 { margin: 0; font-size: 3.2em; }
        .info-header p { margin: 8px 0 0; font-size: 1.6em; letter-spacing: 1px; }
        .route { display: flex; align-items: center; justify-content: center; gap: 20px; }
        .video-container { width: 80%; max-width: 960px; aspect-ratio: 16 / 9; background-color: #111; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        video { width: 100%; height: 100%; object-fit: cover; }
        .ticker-wrap { position: fixed; bottom: 0; left: 0; width: 100%; background-color: #1a1a1a; padding: 20px; overflow: hidden; min-height: 80px; }
        .ticker { display: flex; align-items: center; font-size: 2.2em; line-height: 1.4; white-space: nowrap; margin: 0; animation: scroll 30s linear infinite; }
        .ticker-item { margin-right: 100px; }
        .ticker-separator { margin: 0 50px; color: #666; font-size: 1.5em; }
        .ticker.fade { opacity: 0.3; }
        .ticker.active { opacity: 1; }
        @keyframes scroll {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
        }
    </style>
</head>
<body>
    <div class="main-content">
        ${hideInfoHeader ? '' : `
        <div class="info-header">
            <h1>ISL Announcement</h1>
            <p>${originalText}</p>
        </div>`}
        <div class="video-container">
            <video id="isl-video" muted playsinline></video>
        </div>
    </div>
    <div class="ticker-wrap">
        <div id="ticker" class="ticker"></div>
    </div>${audioElementsHtml}

    <script>
        const videoElement = document.getElementById('isl-video');
        const tickerElement = document.getElementById('ticker');
        
        // Get the current origin (for blob URLs, we need to use the parent window's origin)
        let origin = 'http://localhost:9002'; // Default fallback
        
        if (window.opener && window.opener.location && window.opener.location.origin) {
            origin = window.opener.location.origin;
        } else if (window.location && window.location.origin) {
            origin = window.location.origin;
        } else if (window.parent && window.parent.location && window.parent.location.origin) {
            origin = window.parent.location.origin;
        }
        
        console.log('Detected origin:', origin);
        
        const videoPlaylist = ${videoSources}.map(path => origin + path);
        const audioPlaylist = ${audioSources}.map(path => origin + path);
        
        console.log('Video sources from server:', ${videoSources});
        console.log('Final video playlist:', videoPlaylist);
        const announcementData = ${announcementDataJson};
        const hasAudioFiles = ${hasAudioFiles};
        let currentSpeed = ${playbackSpeed};
        
        // Audio elements and variables (only if audio files exist)
        ${hasAudioFiles ? `
        const audioPlayer = document.getElementById('announcement-audio');
        const introAudio = document.getElementById('intro-audio');
        const introAudioPath = 'http://localhost:3000/audio/intro_audio/intro.wav';
        let currentAudioIndex = 0;
        let isPlaying = false;
        let isPlayingIntro = false;

        // Set up intro audio
        introAudio.src = introAudioPath;
        introAudio.volume = 1.0;` : ''}

        function createScrollingTicker() {
            if (!tickerElement || announcementData.length === 0) return;
            
            // Create ticker content with all languages and separators
            const tickerContent = announcementData
                .filter(announcement => announcement.text && announcement.text.trim())
                .map(announcement => {
                    return \`<span class="ticker-item">\${announcement.text}</span>\`;
                })
                .join('<span class="ticker-separator">•</span>');
            
            // Set the ticker content
            tickerElement.innerHTML = tickerContent;
            tickerElement.classList.add('active');
            tickerElement.classList.remove('fade');
        }
        
        function getLanguageName(languageCode) {
            const languageNames = {
                'en': 'English',
                'hi': 'Hindi',
                'mr': 'Marathi',
                'gu': 'Gujarati'
            };
            return languageNames[languageCode] || languageCode.toUpperCase();
        }
        
        function updateTickerText(languageCode) {
            // For backward compatibility, but now we use createScrollingTicker
            createScrollingTicker();
        }
        
        function changeSpeed(speed) {
            currentSpeed = speed;
            if (videoElement) {
                videoElement.playbackRate = speed;
            }
            console.log('Playback speed changed to:', speed + 'x');
        }

        function fadeTickerText() {
            if (tickerElement) {
                tickerElement.classList.add('fade');
                tickerElement.classList.remove('active');
            }
        }

        ${hasAudioFiles ? `
        function playIntroThenAnnouncement() {
            if (!audioPlayer || audioPlaylist.length === 0) return;
            
            // Play intro first
            isPlayingIntro = true;
            // Keep scrolling ticker visible during intro
            
            // Reset intro audio event listener
            introAudio.onended = () => {
                isPlayingIntro = false;
                audioPlayer.src = audioPlaylist[currentAudioIndex];
                
                // Keep the scrolling ticker with all languages
                createScrollingTicker();
                
                audioPlayer.play().catch(e => console.error("Audio play error:", e));
                currentAudioIndex++;
            };
            
            introAudio.play().catch(e => console.error("Intro audio play error:", e));
        }` : ''}
        
        function startPlayback() {
            console.log('Starting playback with videoPlaylist:', videoPlaylist);
            console.log('Origin:', origin);
            
            if (videoPlaylist.length > 0) {
                const videoUrl = videoPlaylist[0];
                console.log('Loading video:', videoUrl);
                console.log('Full video URL:', videoUrl);
                
                videoElement.src = videoUrl;
                videoElement.loop = true;
                videoElement.playbackRate = currentSpeed;
                
                // Add comprehensive error handling for video loading
                videoElement.onerror = (e) => {
                    console.error('Video loading error:', e);
                    console.error('Video src:', videoElement.src);
                    console.error('Video networkState:', videoElement.networkState);
                    console.error('Video readyState:', videoElement.readyState);
                    
                    // Try to provide more specific error information
                    if (videoElement.error) {
                        console.error('Video error details:', {
                            code: videoElement.error.code,
                            message: videoElement.error.message
                        });
                    }
                    
                    // Try to fetch the video to check if it exists
                    fetch(videoElement.src, { method: 'HEAD' })
                        .then(response => {
                            console.log('Video fetch test - Status:', response.status);
                            console.log('Video fetch test - Headers:', response.headers);
                        })
                        .catch(fetchError => {
                            console.error('Video fetch test failed:', fetchError);
                        });
                };
                
                videoElement.onloadstart = () => {
                    console.log('Video loading started');
                };
                
                videoElement.onloadedmetadata = () => {
                    console.log('Video metadata loaded');
                };
                
                videoElement.onloadeddata = () => {
                    console.log('Video data loaded');
                };
                
                videoElement.oncanplay = () => {
                    console.log('Video can play, starting playback');
                    videoElement.play().catch(e => console.error("Video play error:", e));
                };
                
                videoElement.oncanplaythrough = () => {
                    console.log('Video can play through');
                };
                
                // Ensure video restarts when it ends (backup for loop)
                videoElement.addEventListener('ended', () => {
                    console.log('Video ended, restarting...');
                    videoElement.currentTime = 0;
                    videoElement.play().catch(e => console.error("Video restart error:", e));
                });
            } else {
                console.error('No video sources available');
            }
            
            ${hasAudioFiles ? `
            if (audioPlaylist.length > 0) {
                isPlaying = true;
                
                // Initialize scrolling ticker with all languages
                createScrollingTicker();
                
                playIntroThenAnnouncement();
            }` : `
            // No audio files - show scrolling ticker with all languages
            createScrollingTicker();`}
        }

        ${hasAudioFiles ? `
        // Handle announcement audio ending
        audioPlayer.addEventListener('ended', () => {
            if (isPlaying && currentAudioIndex < audioPlaylist.length) {
                // Continue to next announcement
                playIntroThenAnnouncement();
            } else if (isPlaying) {
                // All announcements finished, restart the cycle
                currentAudioIndex = 0;
                setTimeout(() => {
                    if (isPlaying) {
                        playIntroThenAnnouncement();
                    }
                }, 1000); // 1 second pause before restarting
            }
        });` : ''}
        
        // Use a more reliable event to start playback
        window.addEventListener('load', startPlayback, { once: true });
        
        // Add keyboard shortcuts for speed control
        document.addEventListener('keydown', (e) => {
            if (e.key === '1') changeSpeed(0.5);
            else if (e.key === '2') changeSpeed(0.75);
            else if (e.key === '3') changeSpeed(1.0);
            else if (e.key === '4') changeSpeed(1.25);
            else if (e.key === '5') changeSpeed(1.5);
            else if (e.key === '6') changeSpeed(2.0);
        });
    </script>
</body>
</html>`;
}
