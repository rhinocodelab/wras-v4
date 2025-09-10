'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileAudio, Loader2, Languages, MessageSquare, Globe, Volume2, X, CheckCircle, Film, Rocket } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { detectAudioLanguage } from '@/ai/speech-language-detection';
import { getIslVideoPlaylist } from '@/app/actions';
import { generateTextToIslHtml } from '@/lib/utils';

// Language mapping for display
const LANGUAGE_MAPPING = {
  'english': 'English',
  'hindi': 'हिंदी (Hindi)',
  'marathi': 'मराठी (Marathi)',
  'gujarati': 'ગુજરાતી (Gujarati)'
};

// Supported languages for the application
const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', name: 'English' },
  { code: 'hi-IN', name: 'हिंदी (Hindi)' },
  { code: 'mr-IN', name: 'मराठी (Marathi)' },
  { code: 'gu-IN', name: 'ગુજરાતી (Gujarati)' }
];

// Supported file types
const SUPPORTED_FORMATS = ['audio/mp3', 'audio/wav', 'audio/aac', 'audio/mpeg', 'audio/wave'];

const IslVideoPlayer = ({ playlist, title, onPublish }: { playlist: string[]; title: string; onPublish?: (playbackSpeed: number) => void }) => {
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
            <div className="flex flex-col items-center justify-center h-full bg-muted rounded-lg p-4 text-center">
                <Film className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">No matching ISL videos found.</p>
            </div>
        )
    }

    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Film className="h-5 w-5 text-primary" />
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
                        
                        {/* Playback Speed Controls */}
                        <div className="mt-2">
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
                    </div>
                    {onPublish && playlist.length > 0 && (
                        <div className="mt-4">
                            <Button 
                                onClick={() => onPublish?.(playbackSpeed)} 
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

export default function AudioFileAnalysisPage() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [detectedLanguage, setDetectedLanguage] = useState<string>('');
    const [confidence, setConfidence] = useState<number>(0);
    const [transcribedText, setTranscribedText] = useState<string>('');
    const [translations, setTranslations] = useState<{ [key: string]: string }>({});
    const [islPlaylist, setIslPlaylist] = useState<string[]>([]);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [audioId, setAudioId] = useState<string | null>(null);

    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (file: File) => {
        // Validate file type
        if (!SUPPORTED_FORMATS.includes(file.type)) {
            toast({
                variant: 'destructive',
                title: 'Invalid File Type',
                description: 'Please upload an MP3, WAV, or AAC audio file.'
            });
            return;
        }

        // Validate file size (limit to 50MB)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            toast({
                variant: 'destructive',
                title: 'File Too Large',
                description: 'Please upload a file smaller than 50MB.'
            });
            return;
        }

        setSelectedFile(file);
        // Clear previous results
        setDetectedLanguage('');
        setConfidence(0);
        setTranscribedText('');
        setTranslations({ en: '', mr: '', hi: '', gu: '' });
        setAudioId(null); // Clear previous audio ID
    };

    const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragOver(false);
        
        const file = event.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDragOver(false);
    };

    const processAudioFile = useCallback(async () => {
        if (!selectedFile) return;

        setIsProcessing(true);
        try {
            // Step 1: Convert file to base64 data URI
            const base64Audio = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result as string;
                    // Remove the data URL prefix to get just the base64 string
                    const base64 = result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(selectedFile);
            });

            // Step 2: Save audio file temporarily
            const saveResponse = await fetch('/api/speech-recognition/save-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    audio: base64Audio,
                    mimeType: selectedFile.type
                }),
            });

            if (!saveResponse.ok) {
                throw new Error(`Failed to save audio file: ${saveResponse.status}`);
            }

            const saveResult = await saveResponse.json();
            if (!saveResult.success) {
                throw new Error(saveResult.error || 'Failed to save audio file');
            }

            const audioId = saveResult.audioId;
            setAudioId(audioId); // Store the audio ID for cleanup
            console.log(`Audio saved with ID: ${audioId}`);

            // Step 3: Use Gemini for language detection
            const dataUri = `data:${selectedFile.type};base64,${base64Audio}`;
            console.log('Using Gemini to detect language from audio file...');
            
            const geminiResult = await detectAudioLanguage({ audioDataUri: dataUri });
            const detectedLanguage = geminiResult.language.toLowerCase();
            const confidence = geminiResult.confidence;
            
            console.log('Gemini detected language:', detectedLanguage, 'Confidence:', confidence);
            
            // Map Gemini's language detection to our language codes
            const LANGUAGE_NAME_TO_CODE = {
                'english': 'en-IN',
                'hindi': 'hi-IN',
                'marathi': 'mr-IN',
                'gujarati': 'gu-IN'
            };
            
            const detectedLanguageCode = LANGUAGE_NAME_TO_CODE[detectedLanguage] || 'en-IN';
            const detectedLanguageName = LANGUAGE_MAPPING[detectedLanguage] || 'English';
            console.log('Mapped to language code:', detectedLanguageCode, 'Name:', detectedLanguageName);

            setDetectedLanguage(detectedLanguage);
            setConfidence(confidence);

            console.log('Sending transcription request with detected language:', detectedLanguage);

            // Step 4: Use Next.js API route for transcription with detected language
            const transcribeResponse = await fetch('/api/speech-recognition/auto-detect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-detected-language': detectedLanguage // Pass the detected language
                },
                body: JSON.stringify({
                    audio: base64Audio,
                    mimeType: selectedFile.type
                }),
            });

            if (!transcribeResponse.ok) {
                const errorText = await transcribeResponse.text();
                console.error('Transcription failed:', transcribeResponse.status, errorText);
                
                // Try to parse error details
                let errorMessage = `Transcription failed: ${transcribeResponse.status}`;
                try {
                    const errorData = JSON.parse(errorText);
                    if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                    if (errorData.debug) {
                        console.error('Debug info:', errorData.debug);
                    }
                } catch (e) {
                    errorMessage = errorText;
                }
                
                throw new Error(errorMessage);
            }

            const transcribeResult = await transcribeResponse.json();
            if (!transcribeResult.success) {
                console.error('Transcription result:', transcribeResult);
                throw new Error(transcribeResult.error || 'Transcription failed');
            }

            // Step 5: Only use English translation for ISL video generation
            const originalText = transcribeResult.transcript;
            const returnedLanguage = transcribeResult.detectedLanguage;
            
            console.log('Transcription result:', {
                originalText: originalText,
                returnedLanguage: returnedLanguage,
                expectedLanguage: detectedLanguage
            });
            
            setTranscribedText(originalText);
            
            // If the detected language is not English, translate to English
            let englishTranslation = originalText;
            if (detectedLanguageCode !== 'en-IN') {
                console.log('Translating to English for ISL video generation...');
                const translateResponse = await fetch('/api/speech-recognition/translate-text', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        text: originalText,
                        sourceLanguage: detectedLanguageCode,
                        targetLanguages: ['en-IN']
                    }),
                });

                if (translateResponse.ok) {
                    const translateResult = await translateResponse.json();
                    if (translateResult.success && translateResult.translations['en-IN']) {
                        englishTranslation = translateResult.translations['en-IN'];
                    }
                }
            }
            
            // Set only English translation for ISL video generation
            setTranslations({
                'en-IN': englishTranslation
            });
            
            // Show success toast
            toast({
                title: 'Audio Analysis Complete',
                description: `Detected: ${detectedLanguageName} • Translated to English for ISL video generation`
            });

        } catch (error) {
            console.error('Error in audio analysis:', error);
            toast({
                variant: 'destructive',
                title: 'Analysis Failed',
                description: 'Failed to analyze the audio file. Please try again.'
            });
        } finally {
            setIsProcessing(false);
        }
    }, [selectedFile, toast]);

    const handleGenerateVideoClick = useCallback(async () => {
        const englishText = translations['en-IN'];
        if (!englishText?.trim()) return;
        
        setIsGeneratingVideo(true);
        try {
            // Add spaces between digits for better ISL representation
            const processedText = englishText.replace(/(\d)/g, ' $1 ');
            const result = await getIslVideoPlaylist(processedText);
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
    }, [translations, toast]);

    const handlePublish = (selectedPlaybackSpeed: number = 1.0) => {
        const englishText = translations['en-IN'];
        if (!englishText && !transcribedText) {
            toast({
                title: "No Content to Publish",
                description: "Please generate ISL video first before publishing.",
                variant: "destructive"
            });
            return;
        }

        // Check if ISL video is available
        if (!islPlaylist || islPlaylist.length === 0) {
            toast({
                title: "No ISL Video Available",
                description: "Please generate ISL video first before publishing.",
                variant: "destructive"
            });
            return;
        }

        // Convert relative video path to absolute URL
        const baseUrl = window.location.origin;
        const absoluteVideoPath = `${baseUrl}${islPlaylist[0]}`;
        
        console.log('Publishing with video path:', absoluteVideoPath);
        console.log('ISL Playlist:', islPlaylist);

        // Use the proper generateTextToIslHtml function
        const htmlContent = generateTextToIslHtml(
            transcribedText || englishText, // original text
            {
                en: englishText || transcribedText,
                hi: translations['hi-IN'] || '',
                mr: translations['mr-IN'] || '',
                gu: translations['gu-IN'] || ''
            },
            absoluteVideoPath, // absolute video path
            {}, // no audio files for Audio File Analysis
            selectedPlaybackSpeed
        );

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    };

    const handleClearResults = async () => {
        // Delete the audio file from temp directory if it exists
        if (audioId) {
            try {
                const deleteResponse = await fetch('/api/speech-recognition/delete-audio', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ audioId }),
                });
                
                if (deleteResponse.ok) {
                    console.log(`Audio file ${audioId} deleted successfully`);
                } else {
                    console.warn(`Failed to delete audio file ${audioId}`);
                }
            } catch (error) {
                console.error('Error deleting audio file:', error);
            }
        }

        // Clear all state
        setSelectedFile(null);
        setDetectedLanguage('');
        setConfidence(0);
        setTranscribedText('');
        setTranslations({});
        setIslPlaylist([]);
        setIsGeneratingVideo(false);
        setAudioId(null);
        
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <FileAudio className="h-6 w-6 text-primary" />
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">Audio File Analysis & Translation</h1>
                        <p className="text-muted-foreground">
                            Upload audio files (MP3, WAV, AAC) for automatic language detection and translation.
                        </p>
                    </div>
                </div>
            </div>


            {/* File Upload Card */}
            <Card className="mt-6">
                <CardContent className="p-4 flex flex-col sm:flex-row items-center gap-4">
                    <div className="w-full sm:w-auto">
                        <label className="text-sm font-medium">Audio Language Detection</label>
                        <div className="text-xs text-muted-foreground mt-1">
                            {detectedLanguage ? (
                                <span className="flex items-center gap-2">
                                    <Globe className="h-3 w-3 text-primary" />
                                    {LANGUAGE_MAPPING[detectedLanguage] || detectedLanguage}
                                </span>
                            ) : (
                                "Language will be detected automatically"
                            )}
                        </div>
                    </div>
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={`flex-grow flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-md transition-colors
                        ${isDragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                    >
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground mb-2 text-center">
                            {selectedFile ? `Selected: ${selectedFile.name}` : 'Drag & drop a .mp3, .wav, or .aac file here, or click to browse'}
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".mp3,.wav,.aac,audio/mp3,audio/wav,audio/aac,audio/mpeg,audio/wave"
                            onChange={handleFileInputChange}
                            className="hidden"
                        />
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            variant="outline"
                            size="sm"
                        >
                            Browse File
                        </Button>
                    </div>

                    <Button onClick={processAudioFile} disabled={isProcessing || !selectedFile}>
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Languages className="mr-2 h-4 w-4"/>}
                        {isProcessing ? "Processing..." : "Analyze & Translate"}
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
                                    Original Text
                                </CardTitle>
                            </div>
                            <Button variant="ghost" size="sm" onClick={handleClearResults} disabled={!transcribedText && !selectedFile}>
                                Clear
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <Textarea
                                value={transcribedText}
                                readOnly
                                placeholder="Transcribed text will appear here..."
                                className="h-full resize-none"
                            />
                        </CardContent>
                    </Card>

                    <Card className="flex flex-col row-span-1">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div className="space-y-1.5">
                                <CardTitle className="flex items-center gap-2">
                                    <Languages className="h-5 w-5 text-primary" />
                                    English Text for ISL Video
                                </CardTitle>
                                <CardDescription>
                                    This text will be used to generate the ISL video.
                                </CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" onClick={handleClearResults} disabled={!translations['en-IN']}>
                                Clear
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-grow flex flex-col gap-4">
                            <Textarea
                                value={translations['en-IN'] || ''}
                                readOnly
                                placeholder="English translation will appear here..."
                                className="h-full resize-none"
                            />
                            <div className="flex gap-2">
                                <Button onClick={handleGenerateVideoClick} disabled={isGeneratingVideo || !translations['en-IN']}>
                                    {isGeneratingVideo ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Film className="mr-2 h-4 w-4" />}
                                    {isGeneratingVideo ? "Generating..." : "Generate ISL Video"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="md:col-span-1 h-full min-h-[300px]">
                    {isGeneratingVideo ? (
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
        </div>
    );
}