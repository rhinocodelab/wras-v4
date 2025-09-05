
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Languages, MessageSquare, Video, FileAudio, Film, Rocket, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { transcribeAndTranslateAudio, getIslVideoPlaylist } from '@/app/actions';
import { Input } from '@/components/ui/input';

const LANGUAGE_OPTIONS: { [key: string]: string } = {
  'en-US': 'English',
  'hi-IN': 'हिंदी',
  'mr-IN': 'मराठी',
  'gu-IN': 'ગુજરાતી',
};

const IslVideoPlayer = ({ playlist, title, onPublish }: { playlist: string[]; title: string; onPublish?: () => void }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && playlist.length > 0) {
            videoRef.current.play();
        }
    }, [playlist]);

    if (!playlist || playlist.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-muted rounded-lg p-4 text-center">
                <Video className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">Video will appear here.</p>
            </div>
        )
    }

    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-primary" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col p-2 pt-0">
                <video
                    ref={videoRef}
                    className="w-full h-64 rounded-t-md bg-black object-cover"
                    controls={false}
                    autoPlay
                    muted
                    loop
                    playsInline
                >
                    <source src={playlist[0]} type="video/mp4" />
                    Your browser does not support the video tag.
                </video>
                <div className="flex-grow p-2 bg-muted rounded-b-md flex flex-col justify-between">
                    <div>
                        <h3 className="font-semibold text-xs mb-1">ISL Video</h3>
                        <p className="text-xs text-muted-foreground">Playing ISL video</p>
                        <div className="mt-1 text-xs text-muted-foreground break-all">
                        Video: {playlist[0].split('/').pop()?.replace('.mp4', '').replace(/_/g, ' ')}
                        </div>
                    </div>
                    {onPublish && playlist.length > 0 && (
                        <div className="mt-4">
                            <Button 
                                onClick={onPublish} 
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
            </CardContent>
        </Card>
    );
};


export default function AudioFileToIslPage() {
    const [selectedLang, setSelectedLang] = useState('en-US');
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [transcribedText, setTranscribedText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [islPlaylist, setIslPlaylist] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);

    const { toast } = useToast();

    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type === 'audio/wav' || file.type === 'audio/mpeg') {
                setAudioFile(file);
                setTranscribedText('');
                setTranslatedText('');
                setIslPlaylist([]);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Invalid File Type',
                    description: 'Please upload a .wav or .mp3 file.',
                });
            }
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        handleFileChange(e.dataTransfer.files);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleProcessAudio = useCallback(async () => {
        if (!audioFile) return;

        setIsTranscribing(true);
        setTranscribedText('');
        setTranslatedText('');
        setIslPlaylist([]);
        
        const reader = new FileReader();
        reader.readAsDataURL(audioFile);
        reader.onloadend = async () => {
            try {
                const base64Audio = reader.result as string;
                
                const formData = new FormData();
                formData.append('audioDataUri', base64Audio);
                formData.append('languageCode', selectedLang);
                
                const result = await transcribeAndTranslateAudio(formData);
                setTranscribedText(result.transcribedText);
                // Add spaces between digits for translated text
                const processedText = result.translatedText.replace(/(\d)/g, ' $1 ');
                setTranslatedText(processedText);
            } catch (error) {
                console.error("Audio processing failed:", error);
                toast({
                    variant: "destructive",
                    title: "Processing Error",
                    description: "Failed to transcribe or translate the audio file."
                });
            } finally {
                setIsTranscribing(false);
            }
        };
    }, [audioFile, selectedLang, toast]);

    const handleGenerateVideoClick = useCallback(async () => {
        if (!translatedText.trim()) return;
        
        setIsGeneratingVideo(true);
        try {
            const result = await getIslVideoPlaylist(translatedText);
            const playlist = result.playlist;
            setIslPlaylist(playlist);
            
            // Show toast based on results
            if (result.playlist.length === 0) {
                // No videos generated at all
                const unmatchedText = result.unmatchedWords.join(', ');
                toast({
                    title: "No ISL Videos Found",
                    description: `No matching ISL videos found for any words: ${unmatchedText}`,
                    variant: "destructive"
                });
            } else if (result.unmatchedWords.length > 0) {
                // Some videos generated, but some words unmatched
                const unmatchedText = result.unmatchedWords.join(', ');
                toast({
                    title: "ISL Video Generated",
                    description: `ISL video generated successfully. No matching videos found for: ${unmatchedText}`,
                    variant: "default"
                });
            } else {
                // All words matched
                toast({
                    title: "ISL Video Generated",
                    description: "ISL video has been generated successfully."
                });
            }
        } catch (error) {
             console.error("ISL generation failed:", error);
            toast({
                variant: "destructive",
                title: "ISL Video Error",
                description: "Failed to generate the ISL video playlist."
            });
        } finally {
            setIsGeneratingVideo(false);
        }
    }, [translatedText, toast]);
    
    const handleClearInput = () => {
        setAudioFile(null);
        setTranscribedText('');
        setTranslatedText('');
        setIslPlaylist([]);
    }

    const handleClearTranslation = () => {
        setTranslatedText('');
        setIslPlaylist([]);
    }
    
    const handlePublish = () => {
        if (!translatedText && !transcribedText) return;

        const tickerText = [transcribedText, translatedText].filter(Boolean).join(' &nbsp; | &nbsp; ');
        
        // Convert relative video paths to absolute URLs
        const baseUrl = window.location.origin;
        const absoluteVideoPaths = islPlaylist.map(path => `${baseUrl}${path}`);
        const videoSources = JSON.stringify(absoluteVideoPaths);

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Live Announcement</title>
            <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #000; color: #fff; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
            .main-content { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20px; }
            .video-container { width: 80%; max-width: 960px; aspect-ratio: 16 / 9; background-color: #111; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            video { width: 100%; height: 100%; object-fit: cover; }
            .ticker-wrap { position: fixed; bottom: 0; left: 0; width: 100%; background-color: #1a1a1a; padding: 15px 0; overflow: hidden; }
            .ticker { display: inline-block; white-space: nowrap; padding-left: 100%; animation: ticker 40s linear infinite; font-size: 1.5em; }
            @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }
            </style>
        </head>
        <body>
            <div class="main-content">
            <div class="video-container">
                <video id="isl-video" muted playsinline></video>
            </div>
            </div>
            <div class="ticker-wrap">
            <div class="ticker">${tickerText}</div>
            </div>

            <script>
            const videoElement = document.getElementById('isl-video');
            const videoPlaylist = ${videoSources};

            function startPlayback() {
                if (videoPlaylist.length > 0) {
                    videoElement.src = videoPlaylist[0];
                    videoElement.loop = true;
                    videoElement.play().catch(e => console.error("Video play error:", e));
                }
            }

            window.addEventListener('load', startPlayback, { once: true });
            <\/script>
        </body>
        </html>
        `;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div>
                <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2">
                    <FileAudio className="h-6 w-6 text-primary" />
                    Audio File to ISL Converter
                </h1>
                <p className="text-muted-foreground">
                    Upload an audio file to transcribe, translate, and generate the ISL video.
                </p>
            </div>

             <Card className="mt-6">
                <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-4">
                     <div className="w-full sm:w-auto">
                        <label className="text-sm font-medium">Audio Language</label>
                        <Select value={selectedLang} onValueChange={setSelectedLang}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Select a language" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(LANGUAGE_OPTIONS).map(([code, name]) => (
                                    <SelectItem key={code} value={code}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                     <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={`flex-grow flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-md transition-colors
                        ${isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                    >
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground mb-2 text-center">
                        {audioFile ? `Selected: ${audioFile.name}` : 'Drag & drop a .wav or .mp3 file here, or click to browse'}
                        </p>
                         <Input
                            type="file"
                            id="audio-file-upload"
                            className="hidden"
                            accept=".wav,.mp3"
                            onChange={(e) => handleFileChange(e.target.files)}
                        />
                        <label
                        htmlFor="audio-file-upload"
                        className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                        Browse File
                        </label>
                    </div>

                    <Button onClick={handleProcessAudio} disabled={isTranscribing || !audioFile}>
                        {isTranscribing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Languages className="mr-2 h-4 w-4"/>}
                        {isTranscribing ? "Processing..." : "Transcribe & Translate"}
                    </Button>
                </CardContent>
            </Card>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6 flex-grow">
                <div className="md:col-span-2 grid grid-rows-2 gap-6">
                    <Card className="flex flex-col row-span-1">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div className="space-y-1.5">
                                <CardTitle className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-primary" />
                                Transcribed Text
                                </CardTitle>
                            </div>
                            <Button variant="ghost" size="sm" onClick={handleClearInput} disabled={!transcribedText && !audioFile}>
                                Clear
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <Textarea
                                value={transcribedText}
                                readOnly
                                placeholder="Transcription will appear here..."
                                className="h-full resize-none"
                            />
                        </CardContent>
                    </Card>

                    <Card className="flex flex-col row-span-1">
                        <CardHeader className="flex flex-row items-center justify-between">
                             <div className="space-y-1.5">
                                <CardTitle className="flex items-center gap-2">
                                    <Languages className="h-5 w-5 text-primary" />
                                    English Translation
                                </CardTitle>
                                 <CardDescription>
                                    This text will be used to generate the ISL video.
                                </CardDescription>
                            </div>
                             <Button variant="ghost" size="sm" onClick={handleClearTranslation} disabled={!translatedText}>
                                Clear
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-grow flex flex-col gap-4">
                            <Textarea
                                value={translatedText}
                                readOnly
                                placeholder="The English translation will appear here..."
                                className="h-full resize-none"
                            />
                            <div className="flex gap-2">
                                 <Button onClick={handleGenerateVideoClick} disabled={isGeneratingVideo || !translatedText}>
                                    {isGeneratingVideo ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Film className="mr-2 h-4 w-4" />}
                                    {isGeneratingVideo ? "Generating..." : "Generate ISL Video"}
                                 </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>


                <div className="md:col-span-1 h-full min-h-[300px]">
                     {isProcessing || isGeneratingVideo ? (
                         <div className="flex items-center justify-center h-full rounded-lg bg-muted">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                         </div>
                     ) : (
                        <IslVideoPlayer 
                            playlist={islPlaylist} 
                            title="ISL Video Output" 
                            onPublish={handlePublish}
                        />
                     )}
                </div>
            </div>

            {/* Progress Modal for Transcription */}
            <Dialog open={isTranscribing}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Transcribing & Translating Audio</DialogTitle>
                        <DialogDescription>
                            Please wait while the audio file is being transcribed and translated. This may take a moment.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-4 items-center">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Processing audio file...</p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
