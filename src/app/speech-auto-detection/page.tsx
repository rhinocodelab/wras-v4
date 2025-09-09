'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, Loader2, Languages, MessageSquare, X, Globe, Video, Film, Rocket, Speech } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getIslVideoPlaylist } from '@/app/actions';
import { generateTextToIslHtml } from '@/lib/utils';
import { detectAudioLanguage } from '@/ai/speech-language-detection';

const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', name: 'English (India)' },
  { code: 'hi-IN', name: 'हिंदी (Hindi)' },
  { code: 'mr-IN', name: 'मराठी (Marathi)' },
  { code: 'gu-IN', name: 'ગુજરાતી (Gujarati)' },
];

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

export default function AutoSpeechDetectionPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState<string>('');
  const [translations, setTranslations] = useState<{[key: string]: string}>({});
  const [confidence, setConfidence] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [islPlaylist, setIslPlaylist] = useState<string[]>([]);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

  const { toast } = useToast();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

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

  const handleMicClick = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
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

      try {
        // Clear previous data
        setTranscribedText('');
        setDetectedLanguage('');
        setTranslations({});
        setConfidence(0);
        audioChunksRef.current = [];

        // Get microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            sampleRate: 48000, // Match the sample rate expected by Google Cloud Speech API
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          }
        });
        
        streamRef.current = stream;
        
        // Create MediaRecorder
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });
        
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          setIsProcessing(true);
          try {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            await processAudioWithLanguageDetection(audioBlob);
          } catch (error) {
            console.error('Error processing audio:', error);
            toast({
              variant: 'destructive',
              title: 'Processing Error',
              description: 'Failed to process the recorded audio. Please try again.'
            });
          } finally {
            setIsProcessing(false);
          }
        };
        
        // Start recording
        mediaRecorder.start();
        setIsRecording(true);
        
        toast({
          title: 'Recording Started',
          description: 'Speak now. Click the microphone again to stop recording.'
        });
        
      } catch (error) {
        console.error('Error starting recording:', error);
        toast({
          variant: 'destructive',
          title: 'Recording Failed',
          description: 'Could not start recording. Please check your microphone and try again.'
        });
      }
    }
  };

  const processAudioWithLanguageDetection = async (audioBlob: Blob) => {
    try {
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

      // Test if audio file was saved correctly
      const testResponse = await fetch(`/api/speech-recognition/test-audio?audioId=${audioId}`);
      const testResult = await testResponse.json();
      console.log('Audio file test result:', testResult);

      if (!testResult.success || !testResult.exists) {
        throw new Error(`Audio file not saved correctly: ${testResult.error || 'File not found'}`);
      }

      // Step 2: Use Gemini for language detection
      const dataUri = `data:audio/webm;base64,${base64Audio}`;
      console.log('Using Gemini to detect language from audio...');
      
      const geminiResult = await detectAudioLanguage({ audioDataUri: dataUri });
      const detectedLanguage = geminiResult.language.toLowerCase();
      console.log('Gemini detected language:', detectedLanguage);
      
      // Map Gemini's language detection to our language codes
      const LANGUAGE_NAME_TO_CODE = {
        'english': 'en-IN',
        'hindi': 'hi-IN',
        'marathi': 'mr-IN',
        'gujarati': 'gu-IN'
      };
      
      const detectedLanguageCode = LANGUAGE_NAME_TO_CODE[detectedLanguage] || 'en-IN';
      const LANGUAGE_MAPPING = {
        'en-IN': 'English',
        'hi-IN': 'हिंदी (Hindi)',
        'mr-IN': 'मराठी (Marathi)',
        'gu-IN': 'ગુજરાતી (Gujarati)'
      };
      
      const detectedLanguageName = LANGUAGE_MAPPING[detectedLanguageCode] || 'English';
      console.log('Mapped to language code:', detectedLanguageCode, 'Name:', detectedLanguageName);

      // Step 3: Use Next.js API route for transcription with detected language
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

      // The Next.js API already includes translations, so we can use them directly
      const translations = transcribeResult.translations || {};

      // Update state with results
      setTranscribedText(transcribeResult.transcript);
      setDetectedLanguage(transcribeResult.detectedLanguage);
      setTranslations(translations);
      setConfidence(transcribeResult.confidence || 0);
      
      // Show success toast with detected language
      const finalDetectedLanguageName = LANGUAGE_MAPPING[transcribeResult.detectedLanguage] || 'English';
      toast({
        title: 'Speech Recognized & Translated',
        description: `Detected: ${finalDetectedLanguageName} • Translated to all languages`
      });

    } catch (error) {
      console.error('Error in speech recognition workflow:', error);
      toast({
        variant: 'destructive',
        title: 'Recognition Failed',
        description: 'Failed to recognize speech. Please try speaking more clearly.'
      });
    }
  };

  const handleClearTranscription = () => {
    setTranscribedText('');
    setDetectedLanguage('');
    setTranslations({});
    setConfidence(0);
    setIslPlaylist([]);
    setIsGeneratingVideo(false);
  };

  const handleGenerateVideoClick = useCallback(async () => {
    const englishText = translations['en-IN'];
    if (!englishText?.trim()) return;
    
    setIsGeneratingVideo(true);
    try {
      const result = await getIslVideoPlaylist(englishText);
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
    if (!englishText && !transcribedText) return;

    // Convert relative video path to absolute URL
    const baseUrl = window.location.origin;
    const absoluteVideoPath = `${baseUrl}${islPlaylist[0]}`;

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
      {}, // no audio files for Speech to ISL
      selectedPlaybackSpeed
    );

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const getLanguageInfo = (languageCode: string) => {
    return SUPPORTED_LANGUAGES.find(lang => lang.code === languageCode);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div>
        <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2">
          <Speech className="h-6 w-6 text-primary" />
          Speech to ISL
        </h1>
        <p className="text-muted-foreground">
          Speak in any supported language and we'll automatically detect and transcribe it.
        </p>
      </div>

      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Left Side - Supported Languages */}
            <div className="flex-1">
              <div className="text-center sm:text-left">
                <h3 className="text-sm font-medium text-foreground mb-2">Supported Languages</h3>
                <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                  <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full">English</span>
                  <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full">हिंदी</span>
                  <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full">मराठी</span>
                  <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full">ગુજરાતી</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Speak naturally in any of these languages
                </p>
              </div>
            </div>

            {/* Right Side - Microphone and Action */}
            <div className="flex flex-col items-center gap-3">
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
                  <Mic className="h-8 w-8" />
                )}
              </Button>
              
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {isProcessing ? 'Processing...' : isRecording ? 'Recording...' : 'Tap to speak'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isProcessing ? 'Please wait...' : isRecording ? 'Click to stop' : 'Click to start recording'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Detection Results */}
      {detectedLanguage && (
        <Card className="mt-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Detected: {getLanguageInfo(detectedLanguage)?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Language Code: {detectedLanguage}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-primary">
                    {Math.round(confidence * 100)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Confidence
                  </p>
                </div>
                <div className="w-16 bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${confidence * 100}%` }}
                  ></div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleClearTranscription}
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
        {/* Left Column - Translations */}
        <div className="lg:col-span-2">
          {Object.keys(translations).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Languages className="h-5 w-5 text-primary" />
                  Translations
                </CardTitle>
                <CardDescription>
                  Your speech translated to all supported languages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {SUPPORTED_LANGUAGES.map((language) => {
                    const translation = translations[language.code];
                    const isDetected = language.code === detectedLanguage;
                    
                    return (
                      <div 
                        key={language.code}
                        className={`p-4 rounded-lg border transition-colors ${
                          isDetected 
                            ? 'border-primary bg-primary/5' 
                            : 'border-muted bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div>
                            <div className="font-semibold">{language.name}</div>
                            <div className="text-xs text-muted-foreground">{language.code}</div>
                          </div>
                          {isDetected && (
                            <div className="ml-auto">
                              <span className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-full">
                                Detected
                              </span>
                            </div>
                          )}
                        </div>
                        <Textarea
                          value={translation || ''}
                          readOnly
                          className="min-h-[80px] resize-none"
                          placeholder="Translation will appear here..."
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - ISL Video Player */}
        <div className="lg:col-span-1 h-full min-h-[400px]">
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

      {/* English Text for ISL Video Generation */}
      {translations['en-IN'] && (
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Languages className="h-5 w-5 text-primary" />
                English Text for ISL Video
              </CardTitle>
              <CardDescription>
                This English text will be used to generate the ISL video.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClearTranscription}>
              Clear
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Textarea
              value={translations['en-IN'] || ''}
              readOnly
              placeholder="The English text will appear here..."
              className="min-h-[100px] resize-none"
            />
            <div className="flex gap-2">
              <Button 
                onClick={handleGenerateVideoClick} 
                disabled={isGeneratingVideo || !translations['en-IN']}
                className="flex-1"
              >
                {isGeneratingVideo ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                ) : (
                  <Film className="mr-2 h-4 w-4"/>
                )}
                {isGeneratingVideo ? "Generating..." : "Generate ISL Video"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
