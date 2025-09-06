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
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
            margin: 0; 
            background-color: #000; 
            color: #fff; 
            display: flex; 
            flex-direction: column; 
            height: 100vh; 
            overflow: hidden; 
        }
        .main-content { 
            flex-grow: 1; 
            display: flex; 
            flex-direction: column; 
            justify-content: center; 
            align-items: center; 
            padding: 20px; 
            padding-bottom: 120px; /* Add space for ticker */
        }
        .video-container { 
            width: 80%; 
            max-width: 1280px; 
            aspect-ratio: 16 / 9; 
            background-color: #111; 
            overflow: hidden; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); 
        }
        video { 
            width: 100%; 
            height: 100%; 
            object-fit: contain; 
        }
        .ticker-wrap { 
            position: fixed; 
            bottom: 0; 
            left: 0; 
            right: 0; 
            width: 100%; 
            background-color: #1a1a1a; 
            padding: 20px; 
            overflow: hidden; 
            min-height: 80px; 
            border-top: 2px solid #333;
        }
        .ticker { 
            display: block; 
            text-align: center; 
            font-size: 2.2em; 
            transition: opacity 0.5s ease; 
            line-height: 1.4; 
            white-space: nowrap; 
            margin: 0; 
        }
        .ticker.fade { 
            opacity: 0.3; 
        }
        .ticker.active { 
            opacity: 1; 
        }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            font-size: 1.2em;
            color: #888;
        }
        .error {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            font-size: 1.2em;
            color: #ff6b6b;
            text-align: center;
            padding: 20px;
        }
    </style>
</head>
<body>
    <div class="main-content">
        <div class="video-container">
            <video id="isl-video" muted playsinline preload="auto" poster="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHZpZXdCb3g9IjAgMCAxMjgwIDcyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMTExIi8+Cjx0ZXh0IHg9IjY0MCIgeT0iMzYwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM4ODgiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkxvYWRpbmcgSVNMIEFubm91bmNlbWVudC4uLjwvdGV4dD4KPC9zdmc+">
                <source src="" type="video/mp4">
                Your browser does not support the video tag.
            </video>
            <div id="loading" class="loading">Loading ISL Announcement...</div>
            <div id="error" class="error" style="display: none;">Error loading video</div>
        </div>
    </div>
    <div class="ticker-wrap">
        <div id="ticker" class="ticker"></div>
    </div>
    <audio id="announcement-audio" preload="auto"></audio>
    <audio id="intro-audio" preload="auto"></audio>

    <script>
        ${originScript}
        
        const videoElement = document.getElementById('isl-video');
        const audioPlayer = document.getElementById('announcement-audio');
        const introAudio = document.getElementById('intro-audio');
        const tickerElement = document.getElementById('ticker');
        const loadingElement = document.getElementById('loading');
        const errorElement = document.getElementById('error');
        const announcementData = ${announcementDataJson};
        
        let currentAudioIndex = 0;
        let isPlaying = false;
        let videoRetryCount = 0;
        let currentSpeed = ${playbackSpeed};
        const maxRetries = 3;
        
        // Enhanced error handling for video
        function handleVideoError() {
            console.error('Video playback error occurred');
            if (videoRetryCount < maxRetries) {
                videoRetryCount++;
                console.log('Retrying video playback (attempt ' + videoRetryCount + '/' + maxRetries + ')');
                setTimeout(() => {
                    loadAndPlayVideo();
                }, 1000);
            } else {
                console.error('Max video retry attempts reached');
                showError('Video playback failed after multiple attempts');
            }
        }
        
        function showError(message) {
            loadingElement.style.display = 'none';
            errorElement.textContent = message;
            errorElement.style.display = 'flex';
        }
        
        function hideLoading() {
            loadingElement.style.display = 'none';
        }
        
        function changeSpeed(speed) {
            currentSpeed = speed;
            if (videoElement) {
                videoElement.playbackRate = speed;
            }
            console.log('Playback speed changed to:', speed + 'x');
        }
        
        // Robust video loading and playback
        function loadAndPlayVideo() {
            if (videoSources.length === 0) {
                showError('No video sources available');
                return;
            }
            
            const videoUrl = videoSources[0];
            console.log('Loading video:', videoUrl);
            
            // Reset video element
            videoElement.pause();
            videoElement.removeAttribute('src');
            videoElement.load();
            
            // Set up event listeners
            videoElement.onloadstart = () => {
                console.log('Video loading started');
                hideLoading();
            };
            
            videoElement.oncanplay = () => {
                console.log('Video can start playing');
                videoElement.playbackRate = currentSpeed;
                videoElement.play().catch(error => {
                    console.error('Error playing video:', error);
                    handleVideoError();
                });
            };
            
            videoElement.onplay = () => {
                console.log('Video started playing');
                isPlaying = true;
                // Don't start audio automatically - let it be controlled separately
            };
            
            videoElement.onended = () => {
                console.log('Video ended, restarting loop');
                // Restart video for continuous loop without audio interference
                setTimeout(() => {
                    if (isPlaying) {
                        videoElement.currentTime = 0;
                        videoElement.play().catch(console.error);
                    }
                }, 100);
            };
            
            videoElement.onerror = (e) => {
                console.error('Video error event:', e);
                handleVideoError();
            };
            
            // Set video source and load
            videoElement.src = videoUrl;
            videoElement.load();
        }
        
        function updateTickerText(languageCode) {
            const announcement = announcementData.find(a => a.language_code === languageCode);
            if (announcement) {
                tickerElement.textContent = announcement.text;
                tickerElement.classList.remove('fade');
                tickerElement.classList.add('active');
            }
        }
        
        function fadeTickerText() {
            tickerElement.classList.add('fade');
            tickerElement.classList.remove('active');
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
            loadAndPlayVideo();
            
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
