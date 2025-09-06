
'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Search, Volume2, Accessibility, Loader2, Video, Rocket, Save, Eye } from 'lucide-react';
import { getTrainRoutes, TrainRoute, handleGenerateAnnouncement, clearAnnouncementsFolder, saveAnnouncementToDatabase, saveAnnouncementToFiles, SavedAnnouncement, clearIslVideoFolder } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

type DisplayRoute = TrainRoute & {
  platform: string;
  category: string;
};

type Announcement = {
    language_code: string;
    text: string;
    audio_path: string | null;
}

type FullAnnouncement = {
    announcements: Announcement[];
    isl_video_playlist: string[];
}

const ANNOUNCEMENT_CATEGORIES = ['Arriving', 'Delay', 'Cancelled', 'Platform_Change'];
const LANGUAGE_MAP: { [key: string]: string } = {
  'en': 'English',
  'mr': 'मराठी',
  'hi': 'हिंदी',
  'gu': 'ગુજરાતી',
};


const IslVideoPlayer = ({ playlist, onPublish }: { playlist: string[]; onPublish?: (playbackSpeed: number) => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

    useEffect(() => {
        if (videoRef.current && playlist.length > 0) {
            videoRef.current.play();
        }
    }, [playlist]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackSpeed;
        }
    }, [playbackSpeed]);

    if (!playlist || playlist.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-muted rounded-lg p-4">
                <Video className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">ISL Announcement</h3>
                <p className="text-sm text-muted-foreground text-center">No matching ISL videos found for this announcement.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <video
                ref={videoRef}
                className="w-full h-full rounded-t-lg bg-black object-cover"
                controls={false}
                autoPlay
                muted
                loop
            >
                <source src={playlist[0]} type="video/mp4" />
                Your browser does not support the video tag.
            </video>
            <div className="p-4 bg-muted rounded-b-lg">
                <h3 className="font-semibold text-sm mb-2">ISL Video</h3>
                <p className="text-xs text-muted-foreground">Playing ISL announcement video</p>
                <div className="mt-2 text-xs text-muted-foreground break-all">
                   Video: {playlist[0].split('/').pop()?.replace('.mp4', '').replace(/_/g, ' ')}
                </div>
                
                {/* Playback Speed Controls */}
                <div className="mt-3">
                    <label className="text-xs font-medium text-muted-foreground">Playback Speed:</label>
                    <div className="flex gap-1 mt-1">
                        {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((speed) => (
                            <Button
                                key={speed}
                                variant={playbackSpeed === speed ? "default" : "outline"}
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setPlaybackSpeed(speed)}
                            >
                                {speed}x
                            </Button>
                        ))}
                    </div>
                </div>
                
                {/* Publish Button */}
                {onPublish && playlist.length > 0 && (
                    <div className="mt-3">
                        <Button 
                            onClick={() => onPublish(playbackSpeed)} 
                            className="w-full" 
                            size="sm"
                            disabled={playlist.length === 0}
                        >
                            <Rocket className="mr-2 h-4 w-4" />
                            Publish Announcement
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};


export function Dashboard() {
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [allRoutes, setAllRoutes] = useState<TrainRoute[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<TrainRoute[]>([]);
  const [displayedRoutes, setDisplayedRoutes] = useState<DisplayRoute[]>([]);
  const [generatedData, setGeneratedData] = useState<FullAnnouncement | null>(null);
  const [currentRouteInfo, setCurrentRouteInfo] = useState<DisplayRoute | null>(null);
  const [searchNumber, setSearchNumber] = useState('');
  const [searchName, setSearchName] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    async function fetchRoutes() {
      const routes = await getTrainRoutes();
      setAllRoutes(routes);
    }
    fetchRoutes();
  }, []);

  const handleSelectRoute = (route: TrainRoute) => {
    setSelectedRoutes(prevSelected => {
      if (prevSelected.find(r => r.id === route.id)) {
        return prevSelected.filter(r => r.id !== route.id);
      } else {
        return [...prevSelected, route];
      }
    });
  };

  const handleAddSelectedRoutes = () => {
    setDisplayedRoutes(selectedRoutes.map(r => ({ ...r, platform: '1', category: 'Arriving' })));
    setIsRouteModalOpen(false);
  };
  
  const handleSearchByNumber = () => {
    const results = allRoutes.filter(route =>
      route['Train Number'].includes(searchNumber)
    );
    setDisplayedRoutes(results.map(r => ({ ...r, platform: '1', category: 'Arriving' })));
  };

  const handleSearchByName = () => {
    const results = allRoutes.filter(route =>
      route['Train Name'].toLowerCase().includes(searchName.toLowerCase())
    );
    setDisplayedRoutes(results.map(r => ({ ...r, platform: '1', category: 'Arriving' })));
  };

  const clearSearch = () => {
    setSearchNumber('');
    setSearchName('');
    setDisplayedRoutes([]);
    setSelectedRoutes([]);
  }

  const handlePlatformChange = (routeId: number | undefined, platform: string) => {
    if (routeId === undefined) return;
    setDisplayedRoutes(prev =>
      prev.map(r => (r.id === routeId ? { ...r, platform } : r))
    );
  };

  const handleCategoryChange = (routeId: number | undefined, category: string) => {
    if (routeId === undefined) return;
    setDisplayedRoutes(prev =>
      prev.map(r => (r.id === routeId ? { ...r, category } : r))
    );
  };
  
  const onGenerateAnnouncement = async (route: DisplayRoute) => {
    if (!route.id) return;
    setIsGenerating(true);
    setGeneratedData(null);
    setCurrentRouteInfo(route);
    try {
        const result = await handleGenerateAnnouncement({
            routeId: route.id,
            platform: route.platform,
            category: route.category
        });
        setGeneratedData(result);
        setIsAnnouncementModalOpen(true);
    } catch(error) {
        console.error("Announcement generation failed:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to generate announcement. Please ensure translations and audio are generated for this route and its template."
        })
    } finally {
        setIsGenerating(false);
    }
  }

  const handleModalOpenChange = (open: boolean) => {
      setIsAnnouncementModalOpen(open);
      if (!open) {
          clearAnnouncementsFolder();
      }
  };

  const handleSaveAnnouncement = async () => {
    if (!generatedData || !currentRouteInfo) return;
    
    try {
      // Save files using server action
      const { audioFiles, islVideoFiles, announcementTexts } = await saveAnnouncementToFiles(
        currentRouteInfo['Train Number'],
        currentRouteInfo.platform,
        currentRouteInfo.category,
        generatedData.announcements,
        generatedData.isl_video_playlist
      );
      
      // Save to database
      const savedAnnouncement: SavedAnnouncement = {
        train_route_id: currentRouteInfo.id!,
        train_number: currentRouteInfo['Train Number'],
        train_name: currentRouteInfo['Train Name'],
        platform: currentRouteInfo.platform,
        category: currentRouteInfo.category,
        folder_path: `/saved_announcements/${currentRouteInfo['Train Number']}_${currentRouteInfo.platform}_${currentRouteInfo.category}`,
        audio_files: audioFiles,
        isl_video_files: islVideoFiles,
        announcement_texts: announcementTexts
      };
      
      const savedId = await saveAnnouncementToDatabase(savedAnnouncement);
      
      toast({
        title: "Success",
        description: `Announcement saved for Train number ${currentRouteInfo['Train Number']}`,
      });
    } catch (error) {
      console.error('Failed to save announcement:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save announcement. Please try again.",
      });
    }
  };

  const handlePreviewPublishedAnnouncement = (selectedPlaybackSpeed: number = 1.0) => {
    if (!generatedData || !currentRouteInfo) return;

    const { announcements, isl_video_playlist } = generatedData;
    const { 'Train Name': trainName, 'Train Number': trainNumber, 'Start Station': startStation, 'End Station': endStation, 'Start Code': startCode, 'End Code': endCode } = currentRouteInfo;

    // Convert relative paths to absolute URLs
    const baseUrl = window.location.origin;
    
    // Create language-specific data for synchronization
    const announcementData = announcements.map(a => ({
      language_code: a.language_code,
      text: a.text,
      audio_path: a.audio_path ? `${baseUrl}${a.audio_path}` : null
    }));
    const announcementDataJson = JSON.stringify(announcementData);
    
    // Convert audio paths to absolute URLs
    const audioPaths = announcements.map(a => a.audio_path).filter(p => p !== null);
    const absoluteAudioPaths = audioPaths.map(path => `${baseUrl}${path}`);
    const audioSources = JSON.stringify(absoluteAudioPaths);
    
    // Convert video paths to absolute URLs
    const absoluteVideoPaths = isl_video_playlist.map(path => `${baseUrl}${path}`);
    const videoSources = JSON.stringify(absoluteVideoPaths);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Announcement: ${trainName}</title>
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
            <h1>${trainNumber} - ${trainName}</h1>
            <div class="route">
              <p>${startStation} (${startCode})</p>
              <span>&rarr;</span>
              <p>${endStation} (${endCode})</p>
            </div>
          </div>
          <div class="video-container">
            <video id="isl-video" muted playsinline></video>
          </div>
        </div>
        <div class="ticker-wrap">
          <div id="ticker" class="ticker"></div>
        </div>
        <audio id="announcement-audio"></audio>
        <audio id="intro-audio" preload="auto"></audio>

        <script>
          const videoElement = document.getElementById('isl-video');
          const audioPlayer = document.getElementById('announcement-audio');
          const introAudio = document.getElementById('intro-audio');
          const tickerElement = document.getElementById('ticker');
          const videoPlaylist = ${videoSources};
          const audioPlaylist = ${audioSources};
          const announcementData = ${announcementDataJson};
          const introAudioPath = '${baseUrl}/audio/intro_audio/intro.wav';
          let currentAudioIndex = 0;
          let isPlaying = false;
          let currentSpeed = ${selectedPlaybackSpeed};
          let isPlayingIntro = false;

          // Set up intro audio
          introAudio.src = introAudioPath;
          introAudio.volume = 1.0;

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
          });
          
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
        <\/script>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handlePublishAnnouncement = () => {
    if (!generatedData || !currentRouteInfo) return;

    const { announcements, isl_video_playlist } = generatedData;
    const { 'Train Name': trainName, 'Train Number': trainNumber, 'Start Station': startStation, 'End Station': endStation, 'Start Code': startCode, 'End Code': endCode } = currentRouteInfo;

    // Convert relative paths to absolute URLs
    const baseUrl = window.location.origin;
    
    // Create language-specific data for synchronization
    const announcementData = announcements.map(a => ({
      language_code: a.language_code,
      text: a.text,
      audio_path: a.audio_path ? `${baseUrl}${a.audio_path}` : null
    }));
    const announcementDataJson = JSON.stringify(announcementData);
    
    // Convert audio paths to absolute URLs
    const audioPaths = announcements.map(a => a.audio_path).filter(p => p !== null);
    const absoluteAudioPaths = audioPaths.map(path => `${baseUrl}${path}`);
    const audioSources = JSON.stringify(absoluteAudioPaths);
    
    // Convert video paths to absolute URLs
    const absoluteVideoPaths = isl_video_playlist.map(path => `${baseUrl}${path}`);
    const videoSources = JSON.stringify(absoluteVideoPaths);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Announcement: ${trainName}</title>
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
            <h1>${trainNumber} - ${trainName}</h1>
            <div class="route">
              <p>${startStation} (${startCode})</p>
              <span>&rarr;</span>
              <p>${endStation} (${endCode})</p>
            </div>
          </div>
          <div class="video-container">
            <video id="isl-video" muted playsinline></video>
          </div>
        </div>
        <div class="ticker-wrap">
          <div id="ticker" class="ticker"></div>
        </div>
        <audio id="announcement-audio"></audio>
        <audio id="intro-audio" preload="auto"></audio>

        <script>
          const videoElement = document.getElementById('isl-video');
          const audioPlayer = document.getElementById('announcement-audio');
          const introAudio = document.getElementById('intro-audio');
          const tickerElement = document.getElementById('ticker');
          const videoPlaylist = ${videoSources};
          const audioPlaylist = ${audioSources};
          const announcementData = ${announcementDataJson};
          const introAudioPath = '${baseUrl}/audio/intro_audio/intro.wav';
          let currentAudioIndex = 0;
          let isPlaying = false;
          let currentSpeed = ${selectedPlaybackSpeed};
          let isPlayingIntro = false;

          // Set up intro audio
          introAudio.src = introAudioPath;
          introAudio.volume = 1.0;

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
          });
          
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
        <\/script>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <>
      <Card>
        <CardHeader>
           <CardTitle className="flex items-center gap-2">
            <Accessibility className="h-6 w-6 text-primary" />
            Welcome to the WRAS-DHH
          </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-semibold mb-2">About the Application</h3>
                    <p className="text-base text-muted-foreground leading-relaxed mb-4">
                        The Western Railway Divyangjan Announcement System is a web application designed to make travel more accessible for people who are deaf or hard of hearing. It delivers important train announcements using Indian Sign Language (ISL) videos, synchronized subtitles, and text notifications, ensuring equal access to real-time information at railway stations and on trains. This inclusive platform is built according to accessibility standards and aims to foster independence and confidence for Divyangjan passengers within the Western Railway network.
                    </p>
                    <p className="text-black font-bold text-base">
                    Search for trains by number or name to quickly find a route.
                    </p>
                    <div className="w-full">
                        <Tabs defaultValue="train-number">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="train-number">Train Number</TabsTrigger>
                            <TabsTrigger value="train-name">Train Name</TabsTrigger>
                        </TabsList>
                        <TabsContent value="train-number">
                            <div className="flex items-center space-x-2 pt-4">
                            <div className="relative flex-grow">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                placeholder="Search by train number..."
                                className="pl-10"
                                value={searchNumber}
                                onChange={(e) => setSearchNumber(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearchByNumber()}
                                />
                            </div>
                            <Button onClick={handleSearchByNumber}>Search</Button>
                            <Dialog open={isRouteModalOpen} onOpenChange={setIsRouteModalOpen}>
                                <DialogTrigger asChild>
                                    <Button 
                                        style={{ backgroundColor: '#0F9D58', color: 'white' }}
                                        onClick={() => setSelectedRoutes([])} 
                                        disabled={allRoutes.length === 0}
                                    >
                                        Pick Route
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-2xl">
                                    <DialogHeader>
                                    <DialogTitle>Select Train Routes</DialogTitle>
                                    <DialogDescription>
                                        Select one or more train routes to add to the dashboard.
                                    </DialogDescription>
                                    </DialogHeader>
                                    <div className="max-h-[60vh] overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">Select</TableHead>
                                            <TableHead>Train Number</TableHead>
                                            <TableHead>Train Name</TableHead>
                                            <TableHead>Start Station</TableHead>
                                            <TableHead>End Station</TableHead>
                                        </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                        {allRoutes.map(route => (
                                            <TableRow key={route.id}>
                                            <TableCell>
                                                <Checkbox
                                                checked={!!selectedRoutes.find(r => r.id === route.id)}
                                                onCheckedChange={() => handleSelectRoute(route)}
                                                />
                                            </TableCell>
                                            <TableCell>{route['Train Number']}</TableCell>
                                            <TableCell>{route['Train Name']}</TableCell>
                                            <TableCell>{route['Start Station']}</TableCell>
                                            <TableCell>{route['End Station']}</TableCell>
                                            </TableRow>
                                        ))}
                                        </TableBody>
                                    </Table>
                                    </div>
                                    <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsRouteModalOpen(false)}>Cancel</Button>
                                    <Button onClick={handleAddSelectedRoutes}>Add Selected</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                            <Button variant="outline" onClick={clearSearch}>Clear</Button>
                            </div>
                        </TabsContent>
                        <TabsContent value="train-name">
                            <div className="flex items-center space-x-2 pt-4">
                            <div className="relative flex-grow">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                placeholder="Search by train name..."
                                className="pl-10"
                                value={searchName}
                                onChange={(e) => setSearchName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearchByName()}
                                />
                            </div>
                            <Button onClick={handleSearchByName}>Search</Button>
                            <Dialog open={isRouteModalOpen} onOpenChange={setIsRouteModalOpen}>
                                <DialogTrigger asChild>
                                    <Button 
                                        style={{ backgroundColor: '#0F9D58', color: 'white' }}
                                        onClick={() => setSelectedRoutes([])} 
                                        disabled={allRoutes.length === 0}
                                    >
                                        Pick Route
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-2xl">
                                    <DialogHeader>
                                    <DialogTitle>Select Train Routes</DialogTitle>
                                    <DialogDescription>
                                        Select one or more train routes to add to the dashboard.
                                    </DialogDescription>
                                    </DialogHeader>
                                    <div className="max-h-[60vh] overflow-y-auto">
                                    <Table>
                                        <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">Select</TableHead>
                                            <TableHead>Train Number</TableHead>
                                            <TableHead>Train Name</TableHead>
                                            <TableHead>Start Station</TableHead>
                                            <TableHead>End Station</TableHead>
                                        </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                        {allRoutes.map(route => (
                                            <TableRow key={route.id}>
                                            <TableCell>
                                                <Checkbox
                                                checked={!!selectedRoutes.find(r => r.id === route.id)}
                                                onCheckedChange={() => handleSelectRoute(route)}
                                                />
                                            </TableCell>
                                            <TableCell>{route['Train Number']}</TableCell>
                                            <TableCell>{route['Train Name']}</TableCell>
                                            <TableCell>{route['Start Station']}</TableCell>
                                            <TableCell>{route['End Station']}</TableCell>
                                            </TableRow>
                                        ))}
                                        </TableBody>
                                    </Table>
                                    </div>
                                    <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsRouteModalOpen(false)}>Cancel</Button>
                                    <Button onClick={handleAddSelectedRoutes}>Add Selected</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                            <Button variant="outline" onClick={clearSearch}>Clear</Button>
                            </div>
                        </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </CardContent>
      </Card>

      {displayedRoutes.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="text-6xl font-bold text-gray-200 select-none">
            POC DEMO
          </div>
        </div>
      )}

      {displayedRoutes.length > 0 && (
        <Card className="mt-4">
            <CardHeader>
                <CardTitle>Selected Routes</CardTitle>
                <CardDescription>The following routes have been selected for processing.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Train Number</TableHead>
                            <TableHead>Train Name</TableHead>
                            <TableHead>Start Station</TableHead>
                            <TableHead>End Station</TableHead>
                            <TableHead className="w-[120px]">Platform</TableHead>
                            <TableHead className="w-[200px]">Category</TableHead>
                             <TableHead>Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {displayedRoutes.map(route => (
                            <TableRow key={route.id}>
                                <TableCell>{route['Train Number']}</TableCell>
                                <TableCell>{route['Train Name']}</TableCell>
                                <TableCell>{route['Start Station']}</TableCell>
                                <TableCell>{route['End Station']}</TableCell>
                                <TableCell>
                                    <Input
                                        type="number"
                                        value={route.platform}
                                        onChange={(e) => handlePlatformChange(route.id, e.target.value)}
                                        className="h-8"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Select
                                        value={route.category}
                                        onValueChange={(value) => handleCategoryChange(route.id, value)}
                                    >
                                        <SelectTrigger className="h-8">
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ANNOUNCEMENT_CATEGORIES.map(category => (
                                                <SelectItem key={category} value={category}>
                                                    {category.replace('_', ' ')}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={() => onGenerateAnnouncement(route)} disabled={isGenerating}>
                                                    {isGenerating && displayedRoutes.find(r => r.id === route.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Generate announcement</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      )}

      <Dialog open={isGenerating && !isAnnouncementModalOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Generating Announcement</DialogTitle>
                <DialogDescription>
                    Please wait while the text, audio, and video are being generated. This may take a moment.
                </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4 items-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Processing...</p>
            </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isAnnouncementModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent className="max-w-4xl h-[75vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>Generated Announcement</DialogTitle>
                 <DialogDescription>
                    Review the generated text, audio, and ISL video for the announcement.
                </DialogDescription>
            </DialogHeader>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-hidden pt-2">
                <div className="flex flex-col h-full overflow-y-auto pr-4">
                    <div className="space-y-4">
                        {generatedData?.announcements.map(ann => (
                           <Card key={ann.language_code}>
                               <CardHeader>
                                   <CardTitle className="text-lg">{LANGUAGE_MAP[ann.language_code]}</CardTitle>
                               </CardHeader>
                               <CardContent className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-sm mb-1">Generated Text:</h4>
                                        <p className="text-sm text-muted-foreground p-2 border rounded-md bg-muted/50">{ann.text}</p>
                                    </div>
                                    <div>
                                         <h4 className="font-semibold text-sm mb-1">Generated Audio:</h4>
                                         {ann.audio_path ? (
                                            <audio controls className="w-full h-10" key={ann.audio_path}>
                                                <source src={ann.audio_path} type="audio/wav" />
                                                Your browser does not support the audio element.
                                            </audio>
                                         ) : (
                                            <p className="text-sm text-destructive">Audio generation failed. Ensure all source audio files exist.</p>
                                         )}
                                    </div>
                               </CardContent>
                           </Card>
                        ))}
                    </div>
                </div>

                <div className="h-full overflow-hidden">
                     {generatedData && <IslVideoPlayer playlist={generatedData.isl_video_playlist} onPublish={handlePreviewPublishedAnnouncement} />}
                </div>

             </div>
            <DialogFooter className="mt-4">
                <Button onClick={handleSaveAnnouncement}>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                </Button>
                <Button onClick={handlePreviewPublishedAnnouncement}>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                </Button>
                <Button variant="outline" onClick={async () => {
                    try {
                        const result = await clearIslVideoFolder();
                        if (result.success) {
                            console.log('ISL video folder cleared:', result.message);
                        } else {
                            console.warn('Failed to clear ISL video folder:', result.message);
                        }
                    } catch (error) {
                        console.error('Error clearing ISL video folder:', error);
                    }
                    handleModalOpenChange(false);
                }}>Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
