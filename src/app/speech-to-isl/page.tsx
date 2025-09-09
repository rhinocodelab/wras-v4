
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, Loader2, Languages, MessageSquare, Video, Speech, Rocket, Film, X, Globe, Brain, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { translateSpeechText, getIslVideoPlaylist, translateTextToMultipleLanguages } from '@/app/actions';
import { detectAudioLanguage } from '@/ai/speech-language-detection';

const LANGUAGE_OPTIONS: { [key: string]: string } = {
  'en-IN': 'English',
  'hi-IN': 'हिंदी',
  'mr-IN': 'मराठी',
  'gu-IN': 'ગુજરાતી',
};

// Language mapping for display
const LANGUAGE_MAPPING = {
  'en-IN': 'English',
  'hi-IN': 'हिंदी (Hindi)',
  'mr-IN': 'मराठी (Marathi)',
  'gu-IN': 'ગુજરાતી (Gujarati)'
};

// Language name to code mapping for Gemini detection
const LANGUAGE_NAME_TO_CODE = {
  'english': 'en-IN',
  'hindi': 'hi-IN',
  'marathi': 'mr-IN',
  'gujarati': 'gu-IN'
};

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
                <Video className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">No matching ISL videos found.</p>
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


export default function SpeechToIslPage() {
    const [selectedLang, setSelectedLang] = useState('en-IN');
    const [isRecording, setIsRecording] = useState(false);
    const [transcribedText, setTranscribedText] = useState('');
    const [finalTranscribedText, setFinalTranscribedText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [translations, setTranslations] = useState<{ en: string; mr: string; hi: string; gu: string }>({
        en: '',
        mr: '',
        hi: '',
        gu: ''
    });
    const [islPlaylist, setIslPlaylist] = useState<string[]>([]);
    const [isTranslating, setIsTranslating] = useState(false);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [micPermission, setMicPermission] = useState<boolean | null>(null);
    const [detectedLanguage, setDetectedLanguage] = useState<string>('');
    const [confidence, setConfidence] = useState<number>(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [useAutoDetection, setUseAutoDetection] = useState(true);

    const { toast } = useToast();
    const recognitionRef = useRef<any>(null);
    const recordingRef = useRef(isRecording);
    const isRecognitionActiveRef = useRef(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        recordingRef.current = isRecording;
    }, [isRecording]);

    // Check microphone permissions on component mount
    useEffect(() => {
        const checkMicPermission = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
                setMicPermission(true);
            } catch (error) {
                console.error('Microphone permission denied:', error);
                setMicPermission(false);
                toast({
                    variant: 'destructive',
                    title: 'Microphone Permission Required',
                    description: 'Please allow microphone access to use speech recognition.'
                });
            }
        };
        
        checkMicPermission();
    }, [toast]);

    // Enhanced speech analysis workflow with automatic language detection
    const processAudioWithLanguageDetection = async (audioBlob: Blob) => {
        try {
            setIsProcessing(true);
            
            // Step 1: Convert audio blob to base64 and save to temporary file
            const base64Audio = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result as string;
                    // Remove the data URL prefix to get just the base64 string
                    const base64 = result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(audioBlob);
            });
            
            // Save audio file temporarily
            const saveResponse = await fetch('/api/speech-recognition/save-audio', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    audio: base64Audio,
                    mimeType: 'audio/webm;codecs=opus'
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
            console.log(`Audio saved with ID: ${audioId}`);

            // Step 2: Use Gemini for language detection if auto-detection is enabled
            let detectedLanguageCode = selectedLang;
            let detectedLanguageName = LANGUAGE_MAPPING[selectedLang] || 'English';
            
            if (useAutoDetection) {
                const dataUri = `data:audio/webm;base64,${base64Audio}`;
                console.log('Using Gemini to detect language from audio...');
                
                const geminiResult = await detectAudioLanguage({ audioDataUri: dataUri });
                const detectedLanguage = geminiResult.language.toLowerCase();
                console.log('Gemini detected language:', detectedLanguage);
                
                detectedLanguageCode = LANGUAGE_NAME_TO_CODE[detectedLanguage] || 'en-IN';
                detectedLanguageName = LANGUAGE_MAPPING[detectedLanguageCode] || 'English';
                console.log('Mapped to language code:', detectedLanguageCode, 'Name:', detectedLanguageName);
            }

            // Step 3: Use Google Cloud Speech-to-Text API for transcription
            const transcribeResponse = await fetch('/api/speech-recognition/auto-detect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    audio: base64Audio,
                    mimeType: 'audio/webm;codecs=opus'
                }),
            });

            if (!transcribeResponse.ok) {
                const errorText = await transcribeResponse.text();
                console.error('Transcription failed:', transcribeResponse.status, errorText);
                throw new Error(`Transcription failed: ${transcribeResponse.status} - ${errorText}`);
            }

            const transcribeResult = await transcribeResponse.json();
            if (!transcribeResult.success) {
                console.error('Transcription result:', transcribeResult);
                throw new Error(transcribeResult.error || 'Transcription failed');
            }

            // Step 4: Get translations using the existing translation API
            const translateResponse = await fetch('/api/speech-recognition/translate-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: transcribeResult.transcript,
                    sourceLanguage: transcribeResult.detectedLanguage,
                    targetLanguages: ['en-IN', 'hi-IN', 'mr-IN', 'gu-IN']
                }),
            });

            let translations = {};
            if (translateResponse.ok) {
                const translateResult = await translateResponse.json();
                if (translateResult.success) {
                    translations = translateResult.translations || {};
                }
            }

            // Update state with results
            setTranscribedText(transcribeResult.transcript);
            setDetectedLanguage(transcribeResult.detectedLanguage);
            setTranslations(translations);
            setConfidence(transcribeResult.confidence || 0);
            
            // Set the English translation for ISL video generation
            const englishText = translations['en-IN'] || transcribeResult.transcript;
            setTranslatedText(englishText);
            
            // Show success toast with detected language
            toast({
                title: 'Speech Recognized & Translated',
                description: `Detected: ${detectedLanguageName} • Translated to all languages`
            });

        } catch (error) {
            console.error('Error in speech recognition workflow:', error);
            toast({
                variant: 'destructive',
                title: 'Recognition Failed',
                description: 'Failed to recognize speech. Please try speaking more clearly.'
            });
        } finally {
            setIsProcessing(false);
        }
    };

     const handleTranslateClick = useCallback(async () => {
        const textToTranslate = finalTranscribedText;
        if (!textToTranslate.trim()) return;

        setIsTranslating(true);
        setIslPlaylist([]); // Clear previous playlist
        try {
            if (selectedLang === 'en-US') {
                // Add spaces between digits for English text
                const processedText = textToTranslate.replace(/(\d)/g, ' $1 ');
                setTranslatedText(processedText);
            } else {
                const formData = new FormData();
                formData.append('text', textToTranslate);
                formData.append('lang', selectedLang.split('-')[0]);
                const result = await translateSpeechText(formData);
                // Add spaces between digits for translated text
                const processedText = result.translatedText.replace(/(\d)/g, ' $1 ');
                setTranslatedText(processedText);
            }
        } catch (error) {
            console.error("Translation failed:", error);
            toast({
                variant: "destructive",
                title: "Translation Error",
                description: "Failed to translate the text."
            });
        } finally {
            setIsTranslating(false);
        }
    }, [finalTranscribedText, selectedLang, toast]);

    const handleGenerateVideoClick = useCallback(async () => {
        const englishText = translations.en || translatedText;
        if (!englishText.trim()) return;
        
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
    }, [translations.en, translatedText, toast]);

    useEffect(() => {
        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false; // Changed to false to avoid real-time updates
            recognition.lang = selectedLang;
            recognition.maxAlternatives = 1;

            recognition.onresult = (event: any) => {
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript.trim() + ' ';
                    }
                }
                
                if (finalTranscript) {
                    setFinalTranscribedText(prev => prev + finalTranscript);
                    setTranscribedText(prev => prev + finalTranscript);
                }
            };

            recognition.onerror = (event: any) => {
                console.error("Speech recognition error:", event.error);
                
                // Handle specific error types
                switch (event.error) {
                    case 'not-allowed':
                        toast({
                            variant: 'destructive',
                            title: 'Microphone Permission Denied',
                            description: 'Please allow microphone access in your browser settings.'
                        });
                        break;
                    case 'no-speech':
                        toast({
                            title: 'No Speech Detected',
                            description: 'Please speak clearly into the microphone.'
                        });
                        break;
                    case 'audio-capture':
                        toast({
                            variant: 'destructive',
                            title: 'Microphone Error',
                            description: 'No microphone found or microphone is in use by another application.'
                        });
                        break;
                    case 'network':
                        toast({
                            variant: 'destructive',
                            title: 'Network Error',
                            description: 'Network error occurred. Please check your internet connection.'
                        });
                        break;
                    default:
                        toast({
                            variant: 'destructive',
                            title: 'Speech Recognition Error',
                            description: `Error: ${event.error}. Please try again.`
                        });
                }
                
                isRecognitionActiveRef.current = false;
                setIsRecording(false);
            };
            
            recognition.onend = () => {
                console.log('Speech recognition ended');
                isRecognitionActiveRef.current = false;
                setIsRecording(false);
            };

            recognitionRef.current = recognition;
        } else {
            toast({
                variant: 'destructive',
                title: 'Unsupported Browser',
                description: 'Speech recognition is not supported by your browser. Please use Chrome, Edge, or Safari.'
            });
        }

        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (e) {
                    console.log('Recognition already stopped');
                }
            }
        };

    }, [selectedLang, toast]);

    const handleMicClick = async () => {
        if (isRecording) {
            // Stop recording
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
        } else {
            // Start recording
            if (micPermission === false) {
                toast({
                    variant: 'destructive',
                    title: 'Microphone Permission Required',
                    description: 'Please allow microphone access and refresh the page.'
                });
                return;
            }

            // Clear previous data
            setTranscribedText('');
            setFinalTranscribedText('');
            setTranslatedText('');
            setTranslations({ en: '', mr: '', hi: '', gu: '' });
            setDetectedLanguage('');
            setConfidence(0);
            setIslPlaylist([]);
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 48000
                    }
                });
                
                // Create MediaRecorder
                const mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm;codecs=opus'
                });
                
                mediaRecorderRef.current = mediaRecorder;
                audioChunksRef.current = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunksRef.current.push(event.data);
                    }
                };
                
                mediaRecorder.onstop = async () => {
                    // Create audio blob from chunks
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
                    
                    // Stop all tracks
                    stream.getTracks().forEach(track => track.stop());
                    
                    // Process the audio with language detection
                    await processAudioWithLanguageDetection(audioBlob);
                };
                
                mediaRecorder.onerror = (event) => {
                    console.error('MediaRecorder error:', event);
                    toast({
                        variant: 'destructive',
                        title: 'Recording Error',
                        description: 'An error occurred while recording audio.'
                    });
                    setIsRecording(false);
                };
                
                // Start recording
                mediaRecorder.start();
                setIsRecording(true);
                
                toast({
                    title: 'Recording Started',
                    description: 'Speak clearly into your microphone...'
                });
                
            } catch (error) {
                console.error('Microphone not available:', error);
                toast({
                    variant: 'destructive',
                    title: 'Microphone Not Available',
                    description: 'Microphone is in use by another application or not available.'
                });
            }
        }
    };
    
    const handlePublish = (selectedPlaybackSpeed: number = 1.0) => {
        const englishText = translations.en || translatedText;
        if (!englishText && !transcribedText) return;

        const tickerText = [transcribedText, englishText].filter(Boolean).join(' &nbsp; | &nbsp; ');
        
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
            let currentSpeed = ${selectedPlaybackSpeed};

            function startPlayback() {
                if (videoPlaylist.length > 0) {
                    videoElement.src = videoPlaylist[0];
                    videoElement.loop = true;
                    videoElement.playbackRate = currentSpeed;
                    videoElement.play().catch(e => console.error("Video play error:", e));
                }
            }

            function changeSpeed(speed) {
                currentSpeed = speed;
                videoElement.playbackRate = speed;
                console.log('Playback speed changed to:', speed + 'x');
            }

            // Add keyboard shortcuts for speed control
            document.addEventListener('keydown', (e) => {
                if (e.key === '1') changeSpeed(0.5);
                else if (e.key === '2') changeSpeed(0.75);
                else if (e.key === '3') changeSpeed(1.0);
                else if (e.key === '4') changeSpeed(1.25);
                else if (e.key === '5') changeSpeed(1.5);
                else if (e.key === '6') changeSpeed(2.0);
            });

            window.addEventListener('load', startPlayback, { once: true });
            <\/script>
        </body>
        </html>
        `;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    };

    const handleClearTranscription = () => {
        setTranscribedText('');
        setFinalTranscribedText('');
        setTranslatedText('');
        setTranslations({ en: '', mr: '', hi: '', gu: '' });
        setDetectedLanguage('');
        setConfidence(0);
        setIslPlaylist([]);
    }

    const handleClearTranslation = () => {
        setTranslatedText('');
        setTranslations({ en: '', mr: '', hi: '', gu: '' });
        setIslPlaylist([]);
    }

    return (
        <div className="w-full h-full flex flex-col">
            <div>
                <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2">
                    <Speech className="h-6 w-6 text-primary" />
                    Speech to ISL Converter
                </h1>
                <p className="text-muted-foreground">
                    Speak in any supported language and get automatic transcription, translation to English, and ISL video generation.
                </p>
            </div>

            <Card className="mt-6">
                <CardContent className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="w-full sm:w-auto">
                            <label className="text-sm font-medium">Spoken Language</label>
                            <Select value={selectedLang} onValueChange={setSelectedLang} disabled={isRecording || isProcessing}>
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

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="auto-detect"
                                checked={useAutoDetection}
                                onChange={(e) => setUseAutoDetection(e.target.checked)}
                                disabled={isRecording || isProcessing}
                                className="rounded"
                            />
                            <label htmlFor="auto-detect" className="text-sm font-medium flex items-center gap-1">
                                <Brain className="h-4 w-4" />
                                Auto-detect language
                            </label>
                        </div>

                        <div className="flex-grow" />

                        <Button 
                            onClick={handleMicClick} 
                            size="lg" 
                            className="rounded-full h-16 w-16 flex items-center justify-center"
                            variant={isRecording ? "destructive" : "default"}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <Loader2 className="h-8 w-8 animate-spin" />
                            ) : isRecording ? (
                                <MicOff className="h-8 w-8" />
                            ) : (
                                <svg className="w-8 h-8 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9v3a5.006 5.006 0 0 1-5 5h-4a5.006 5.006 0 0 1-5-5V9m7 9v3m-3 0h6M11 3h2a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/>
                                </svg>
                            )}
                        </Button>
                        <p className="text-sm text-muted-foreground w-28 text-center">
                            {isProcessing ? 'Processing...' : isRecording ? 'Recording...' : 'Tap to speak'}
                        </p>

                        <div className="flex-grow" />
                    </div>

                    {/* Detection Results */}
                    {(detectedLanguage || confidence > 0) && (
                        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                            {detectedLanguage && (
                                <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-medium">Detected:</span>
                                    <span className="text-sm">{LANGUAGE_MAPPING[detectedLanguage] || detectedLanguage}</span>
                                </div>
                            )}
                            {confidence > 0 && (
                                <div className="flex items-center gap-2">
                                    <Volume2 className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-medium">Confidence:</span>
                                    <span className="text-sm">{Math.round(confidence * 100)}%</span>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
                <div className="lg:col-span-2 grid grid-rows-2 gap-6">
                    <Card className="flex flex-col row-span-1">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div className="space-y-1.5">
                                <CardTitle className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-primary" />
                                Original Text
                                </CardTitle>
                                <CardDescription>
                                    Your spoken words will appear here.
                                </CardDescription>
                            </div>
                            <Button variant="ghost" size="sm" onClick={handleClearTranscription} disabled={!transcribedText}>
                                Clear
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-grow">
                            <Textarea
                                value={transcribedText}
                                readOnly
                                placeholder="Your spoken words will appear here..."
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
                            <Button variant="ghost" size="sm" onClick={handleClearTranslation} disabled={!translations.en}>
                                Clear
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-grow flex flex-col gap-4">
                            <Textarea
                                value={translations.en || ''}
                                readOnly
                                placeholder="The English translation will appear here..."
                                className="h-full resize-none"
                            />
                            <div className="flex gap-2">
                                <Button onClick={handleTranslateClick} disabled={isTranslating || !finalTranscribedText || isRecording || isProcessing}>
                                    {isTranslating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Languages className="mr-2 h-4 w-4"/>}
                                    {isTranslating ? "Translating..." : "Manual Translate"}
                                </Button>
                                 <Button onClick={handleGenerateVideoClick} disabled={isGeneratingVideo || !translations.en}>
                                    {isGeneratingVideo ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Film className="mr-2 h-4 w-4" />}
                                    {isGeneratingVideo ? "Generating..." : "Generate ISL Video"}
                                 </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>


                <div className="md:col-span-1 h-full min-h-[300px]">
                     {isTranslating || isGeneratingVideo ? (
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
