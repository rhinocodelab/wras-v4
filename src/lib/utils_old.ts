import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateTextToIslHtml(
    originalText: string,
    translations: { en: string; mr: string; hi: string; gu: string },
    islVideoPath: string,
    audioFiles: { en?: string; mr?: string; hi?: string; gu: string },
    playbackSpeed: number = 1.0
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
    const videoSources = JSON.stringify([islVideoPath]);
    
    // Use dynamic origin detection in JavaScript
    const originScript = `
        const origin = window.location.origin || 'http://localhost:3000';
        const videoSources = ${videoSources}.map(path => origin + path);
        const audioSources = ${audioSources}.map(path => origin + path);
    `;

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
        .ticker-wrap { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 1200px; background-color: #1a1a1a; padding: 20px; overflow: hidden; min-height: 80px; }
        .ticker { display: block; text-align: center; font-size: 2.2em; transition: opacity 0.5s ease; line-height: 1.4; white-space: nowrap; margin: 0; }
        .ticker.fade { opacity: 0.3; }
        .ticker.active { opacity: 1; }
    </style>
</head>
<body>
    <div class="main-content">
        <div class="info-header">
            <h1>ISL Announcement</h1>
            <p>${originalText}</p>
        </div>
        <div class="video-container">
            <video id="isl-video" muted playsinline></video>
        </div>
    </div>
    <div class="ticker-wrap">
        <div id="ticker" class="ticker"></div>
    </div>
    <audio id="announcement-audio" preload="auto"></audio>
    <audio id="intro-audio" preload="auto"></audio>

    <script>
        const videoElement = document.getElementById('isl-video');
        const audioPlayer = document.getElementById('announcement-audio');
        const introAudio = document.getElementById('intro-audio');
        const tickerElement = document.getElementById('ticker');
        const videoPlaylist = ${videoSources};
        const audioPlaylist = ${audioSources};
        const announcementData = ${announcementDataJson};
        const introAudioPath = 'http://localhost:3000/audio/intro_audio/intro.wav';
        let currentAudioIndex = 0;
        let isPlaying = false;
        let currentSpeed = ${playbackSpeed};
        let isPlayingIntro = false;

        // Set up intro audio
        introAudio.src = introAudioPath;
        introAudio.volume = 1.0;
        
        function changeSpeed(speed) {
            currentSpeed = speed;
            if (videoElement) {
                videoElement.playbackRate = speed;
            }
            console.log('Playback speed changed to:', speed + 'x');
        }
        
        function startPlayback() {
            if (videoPlaylist.length > 0) {
                videoElement.src = videoPlaylist[0];
                videoElement.loop = true;
                videoElement.playbackRate = currentSpeed;
                videoElement.play().catch(e => console.error("Video play error:", e));
                
                // Ensure video restarts when it ends (backup for loop)
                videoElement.addEventListener('ended', () => {
                    videoElement.currentTime = 0;
                    videoElement.play().catch(e => console.error("Video restart error:", e));
                });
            }
            if (audioPlaylist.length > 0) {
                isPlaying = true;
                
                // Initialize ticker with first language text
                if (announcementData.length > 0) {
                    updateTickerText(announcementData[0].language_code);
                }
                
                playIntroThenAnnouncement();
            }
        }
        
        function updateTickerText(languageCode) {
            const announcement = announcementData.find(a => a.language_code === languageCode);
            if (announcement && tickerElement) {
                tickerElement.textContent = announcement.text;
                tickerElement.classList.add('active');
                tickerElement.classList.remove('fade');
                
                // Adjust card width based on text content
                setTimeout(() => {
                    const tickerWrap = tickerElement.parentElement;
                    const textWidth = tickerElement.scrollWidth;
                    const minWidth = 800; // Minimum width in pixels
                    const maxWidth = 1800; // Maximum width in pixels
                    const padding = 40; // 20px left + 20px right padding
                    const newWidth = Math.max(minWidth, Math.min(maxWidth, textWidth + padding));
                    tickerWrap.style.width = newWidth + 'px';
                    tickerWrap.style.left = '50%';
                    tickerWrap.style.transform = 'translateX(-50%)';
                }, 50); // Small delay to ensure text is rendered
            }
        }
        
        function fadeTickerText() {
            if (tickerElement) {
                tickerElement.classList.add('fade');
                tickerElement.classList.remove('active');
            }
        }

        function playIntroThenAnnouncement() {
            if (!audioPlayer || audioPlaylist.length === 0) return;
            
            // Play intro first
            isPlayingIntro = true;
            fadeTickerText(); // Fade out current text during intro
            
            // Reset intro audio event listener
            introAudio.onended = () => {
                isPlayingIntro = false;
                audioPlayer.src = audioPlaylist[currentAudioIndex];
                
                // Update ticker text to match the current audio language
                const currentAnnouncement = announcementData[currentAudioIndex];
                if (currentAnnouncement) {
                    updateTickerText(currentAnnouncement.language_code);
                }
                
                audioPlayer.play().catch(e => console.error("Audio play error:", e));
                currentAudioIndex++;
            };
            
            introAudio.play().catch(e => console.error("Intro audio play error:", e));
        }
        
        // Function to cycle through translations when no audio files are available
        function startTickerRotation() {
            if (announcementData.length === 0) return;
            
            let currentIndex = 0;
            
            function showNextTranslation() {
                if (announcementData.length === 0) return;
                
                const announcement = announcementData[currentIndex];
                updateTickerText(announcement.language_code);
                
                currentIndex = (currentIndex + 1) % announcementData.length;
                
                // Show each translation for 3 seconds
                setTimeout(() => {
                    if (isPlaying) {
                        fadeTickerText();
                        setTimeout(() => {
                            if (isPlaying) {
                                showNextTranslation();
                            }
                        }, 500);
                    }
                }, 3000);
            }
            
            showNextTranslation();
        }
        
        // Separate audio playback function - independent of video
        function startAudioPlayback() {
            if (currentAudioIndex < audioSources.length) {
                const audioPath = audioSources[currentAudioIndex];
                audioPlayer.src = audioPath;
                audioPlayer.load();
                
                audioPlayer.oncanplay = () => {
                    audioPlayer.play().catch(console.error);
                    const languageCode = announcementData[currentAudioIndex]?.language_code;
                    if (languageCode) {
                        updateTickerText(languageCode);
                    }
                };
                
                currentAudioIndex++;
            }
        }
        
        // Handle announcement audio ending
        audioPlayer.addEventListener('ended', () => {
            if (isPlaying && currentAudioIndex < audioSources.length) {
                startAudioPlayback();
            } else if (isPlaying) {
                currentAudioIndex = 0;
                setTimeout(() => {
                    if (isPlaying) {
                        startAudioPlayback();
                    }
                }, 1000);
            }
        });
        
        // Initialize when page loads
        window.addEventListener('load', () => {
            console.log('Page loaded, starting ISL announcement');
            startPlayback();
            
            // Initialize ticker with first language
            if (announcementData.length > 0) {
                updateTickerText(announcementData[0].language_code);
            }
            
            // Start audio playback after a short delay to ensure video is loaded (only if audio files exist)
            setTimeout(() => {
                if (audioSources.length > 0) {
                    startAudioPlayback();
                } else if (announcementData.length > 0) {
                    // If no audio files, cycle through translations in ticker
                    startTickerRotation();
                }
            }, 2000);
        }, { once: true });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('Page hidden, pausing playback');
                videoElement.pause();
                audioPlayer.pause();
            } else {
                console.log('Page visible, resuming playback');
                if (isPlaying) {
                    videoElement.play().catch(console.error);
                    audioPlayer.play().catch(console.error);
                }
            }
        });
        
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
