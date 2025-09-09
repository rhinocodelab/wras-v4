'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, Play, Square, Loader2, MessageSquare, Video, Film, Languages } from 'lucide-react';
import { toast } from 'sonner';
import { getIslVideoPlaylist } from '@/app/actions';
import { generateTextToIslHtml } from '@/lib/utils';

const IslVideoPlayer = ({ playlist, title, onPublish, isPublishing }: { playlist: string[]; title: string; onPublish?: (playbackSpeed: number) => void; isPublishing?: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  useEffect(() => {
    console.log('ISL Video Player - Playlist updated:', playlist);
    if (videoRef.current && playlist.length > 0 && playlist[0]) {
      console.log('ISL Video Player - Attempting to play video:', playlist[0]);
      videoRef.current.play().catch(error => {
        console.log('Video autoplay failed:', error);
      });
    } else {
      console.log('ISL Video Player - No video to play, playlist:', playlist);
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
          controls={true}
          autoPlay
          muted
          loop
          playsInline
          onLoadStart={() => console.log('Video load started')}
          onLoadedData={() => console.log('Video data loaded')}
          onCanPlay={() => console.log('Video can play')}
          onError={(e) => console.error('Video error:', e)}
        >
          {playlist[0] && <source src={playlist[0]} type="video/mp4" />}
          Your browser does not support the video tag.
        </video>
        <div className="flex-grow p-2 bg-muted rounded-b-md flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-xs mb-1">ISL Video</h3>
            <p className="text-xs text-muted-foreground">Playing ISL video</p>
            <div className="mt-1 text-xs text-muted-foreground break-all">
              Video: {playlist[0] ? playlist[0].split('/').pop()?.replace('.mp4', '').replace(/_/g, ' ') : 'No video'}
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
          {onPublish && (
            <div className="mt-2">
              <Button
                size="sm"
                className="w-full"
                onClick={() => onPublish(playbackSpeed)}
                disabled={isPublishing}
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  'Publish'
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default function SpeechLanguageDetectionPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcriptionResult, setTranscriptionResult] = useState<{
    detectedLanguage: string;
    detectedLanguageName: string;
    originalText: string;
    englishTranslation: string;
    confidence: number;
  } | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioId, setAudioId] = useState<string | null>(null);
  const [islPlaylist, setIslPlaylist] = useState<string[]>([]);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));
        setTranscriptionResult(null);
        setAudioId(null); // Clear previous audio ID
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        
        // Automatically start analysis after recording stops
        setTimeout(() => {
          analyzeAudio(audioBlob);
        }, 500); // Small delay to ensure blob is set
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording. Please check microphone permissions.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success('Recording stopped');
    }
  }, [isRecording]);

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      // Convert blob to base64 for the API (same method as speech-auto-detection)
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
      
      // Save to temp directory first
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
        const errorText = await saveResponse.text();
        console.error('Save audio error:', errorText);
        throw new Error('Failed to save audio');
      }
      
      const saveResult = await saveResponse.json();
      const audioId = saveResult.audioId;
      setAudioId(audioId); // Store the audio ID for cleanup
      
      // Transcribe using GCP Speech to Text with English as primary language
      const transcribeResponse = await fetch('/api/speech-recognition/transcribe-with-language', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioId: audioId,
          languageCode: 'en-IN'
        }),
      });
      
      if (!transcribeResponse.ok) {
        throw new Error('Failed to transcribe audio');
      }
      
      const transcribeResult = await transcribeResponse.json();
      console.log('Transcription API response:', transcribeResult);
      
      // Check if transcription was successful
      if (!transcribeResult.success) {
        throw new Error(transcribeResult.error || 'Transcription failed');
      }
      
      // Return the new API response structure
      return {
        detectedLanguage: transcribeResult.detectedLanguage,
        detectedLanguageName: transcribeResult.detectedLanguageName,
        originalText: transcribeResult.originalText,
        englishTranslation: transcribeResult.englishTranslation,
        confidence: transcribeResult.confidence
      };
    } catch (error) {
      console.error('Error transcribing audio:', error);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const analyzeAudio = useCallback(async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      // Only transcribe using GCP Speech to Text (language detection done in backend)
      const transcriptionResult = await transcribeAudio(audioBlob);
      
      if (transcriptionResult) {
        console.log('Transcription result:', transcriptionResult);
        setTranscriptionResult(transcriptionResult);
        toast.success('Audio analysis complete');
      } else {
        toast.error('Failed to transcribe audio. Please try again.');
      }
    } catch (error) {
      console.error('Error analyzing audio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // Provide specific feedback for common issues
      if (errorMessage.includes('No speech detected')) {
        toast.error('No speech detected in the recording. Please speak clearly and try again.');
      } else if (errorMessage.includes('Failed to save audio')) {
        toast.error('Failed to process audio file. Please try recording again.');
      } else if (errorMessage.includes('Failed to transcribe')) {
        toast.error('Transcription failed. Please check your microphone and try again.');
      } else {
        toast.error(`Audio analysis failed: ${errorMessage}`);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [transcribeAudio]);

  const clearRecording = useCallback(async () => {
    // Delete the audio file from temp-audio folder if it exists
    if (audioId) {
      try {
        console.log('Attempting to delete audio file with ID:', audioId);
        const deleteResponse = await fetch('/api/speech-recognition/delete-audio', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ audioId }),
        });
        
        const deleteResult = await deleteResponse.json();
        
        if (deleteResponse.ok && deleteResult.success) {
          console.log('Audio file deleted successfully:', deleteResult.message);
        } else {
          console.warn('Failed to delete audio file:', deleteResult.error || 'Unknown error');
          // Don't show error to user as this is not critical
        }
      } catch (error) {
        console.warn('Error deleting audio file:', error);
        // Don't show error to user as this is not critical
      }
    }
    
    // Clear all state
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscriptionResult(null);
    setAudioId(null);
    setIsPlaying(false);
    setIslPlaylist([]); // Clear ISL video playlist
    setIsGeneratingVideo(false); // Reset video generation state
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    toast.success('Recording and ISL video cleared');
  }, [audioId]);

  const handleGenerateVideoClick = useCallback(async () => {
    if (!transcriptionResult?.englishTranslation) {
      toast.error('No English translation available for ISL video generation');
      return;
    }

    setIsGeneratingVideo(true);
    try {
      const result = await getIslVideoPlaylist(transcriptionResult.englishTranslation);
      console.log('ISL Video Generation Result:', result);
      setIslPlaylist(result.playlist);
      
      if (result.playlist.length === 0) {
        toast.error('No ISL videos found for the given text');
      } else {
        console.log('Setting ISL playlist:', result.playlist);
        toast.success(`ISL video generated successfully with ${result.playlist.length} video(s)`);
      }
    } catch (error) {
      console.error('Error generating ISL video:', error);
      toast.error('Failed to generate ISL video');
    } finally {
      setIsGeneratingVideo(false);
    }
  }, [transcriptionResult?.englishTranslation]);

  const handlePublish = useCallback(async (playbackSpeed: number) => {
    if (!transcriptionResult?.englishTranslation || islPlaylist.length === 0) {
      toast.error('No ISL video available to publish. Please generate ISL video first.');
      return;
    }

    setIsPublishing(true);
    try {
      // Use the first video from the playlist
      const videoPath = islPlaylist[0];
      
      if (!videoPath) {
        throw new Error("No video path available");
      }

      console.log('Publishing with video path:', videoPath);
      console.log('ISL Playlist:', islPlaylist);

      // Create translations object for the HTML generation
      const translations = {
        en: transcriptionResult.englishTranslation,
        mr: '', // No Marathi translation available
        hi: '', // No Hindi translation available  
        gu: ''  // No Gujarati translation available
      };

      const htmlContent = generateTextToIslHtml(
        transcriptionResult.originalText,
        translations,
        videoPath,
        { en: '', mr: '', hi: '', gu: '' }, // No audio files
        playbackSpeed,
        false // Show info header
      );

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      
      toast.success(`ISL announcement published with ${playbackSpeed}x speed`);
    } catch (error) {
      console.error('Publish error:', error);
      toast.error(`Failed to publish announcement: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsPublishing(false);
    }
  }, [transcriptionResult, islPlaylist]);

  return (
    <div className="w-full h-full flex flex-col">
      <div>
        <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          Speech Analysis & Translation
        </h1>
        <p className="text-muted-foreground">
          Record your speech in any language and get automatic language detection with English translation.
        </p>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Tap to Speak
          </CardTitle>
          <CardDescription>
            Record your speech for language detection and translation
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-6">
            {/* Recording Button */}
            <div className="flex flex-col items-center gap-2">
              <Button 
                onClick={isRecording ? stopRecording : startRecording} 
                size="lg" 
                className="rounded-full h-16 w-16 flex items-center justify-center"
                variant={isRecording ? "destructive" : "default"}
                disabled={isProcessing}
              >
                {isRecording ? (
                  <MicOff className="h-8 w-8" />
                ) : (
                  <svg className="w-8 h-8 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9v3a5.006 5.006 0 0 1-5 5h-4a5.006 5.006 0 0 1-5-5V9m7 9v3m-3 0h6M11 3h2a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/>
                  </svg>
                )}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                {isRecording ? 'Recording...' : 'Tap to speak'}
              </p>
            </div>

            {/* Recording Tips */}
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground mb-2">Recording Tips</h3>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Speak clearly and at a normal volume</p>
                <p>• Record in a quiet environment</p>
                <p>• Hold the microphone close to your mouth</p>
                <p>• Speak for at least 2-3 seconds</p>
              </div>
            </div>

            {/* Language Detection Info */}
            {transcriptionResult && (
              <div className="flex flex-col items-center gap-2 min-w-[120px]">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-foreground">Detected</span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-primary">
                    {transcriptionResult.detectedLanguageName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(transcriptionResult.confidence * 100)}% confidence
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 flex-grow">
        <div>
          {/* English Translation Card */}
          <Card className="flex flex-col h-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Speech Analysis & Translation
                </CardTitle>
                <CardDescription>
                  Language detection and English translation
                </CardDescription>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearRecording} 
                disabled={!transcriptionResult}
              >
                Clear
              </Button>
            </CardHeader>
            <CardContent className="flex-grow">
              {isTranscribing ? (
                <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                  <div>
                    <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin text-primary" />
                    <p>Transcribing audio...</p>
                    <p className="text-xs">This may take a few seconds</p>
                  </div>
                </div>
              ) : transcriptionResult ? (
                <div className="h-full space-y-4">
                  {/* Original Text */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <h4 className="font-medium text-gray-800 mb-2">Original Text ({transcriptionResult.detectedLanguageName})</h4>
                    <p className="text-sm text-gray-900 leading-relaxed">{transcriptionResult.originalText}</p>
                  </div>
                  
                  {/* English Translation */}
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-medium text-green-800 mb-2">English Translation</h4>
                    <p className="text-sm text-green-900 leading-relaxed">{transcriptionResult.englishTranslation}</p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                  <div>
                    <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Speech analysis will appear here</p>
                    <p className="text-xs">Record audio to see language detection and translation</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ISL Video Player Section */}
        <div className="h-full min-h-[300px]">
          {isGeneratingVideo ? (
            <div className="flex items-center justify-center h-full rounded-lg bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <IslVideoPlayer 
              playlist={islPlaylist} 
              title="ISL Video Output" 
              onPublish={handlePublish}
              isPublishing={isPublishing}
            />
          )}
        </div>
      </div>

      {/* English Text for ISL Video Generation */}
      {transcriptionResult?.englishTranslation && (
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
            <Button variant="ghost" size="sm" onClick={clearRecording}>
              Clear
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Textarea
              value={transcriptionResult.englishTranslation || ''}
              readOnly
              placeholder="The English text will appear here..."
              className="min-h-[100px] resize-none"
            />
            <div className="flex gap-2">
              <Button 
                onClick={handleGenerateVideoClick} 
                disabled={isGeneratingVideo || !transcriptionResult.englishTranslation}
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