'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Upload, 
  FileAudio, 
  Play, 
  Download, 
  Trash2, 
  Eye,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { createPodcastPlaylist, updatePodcastPlaylist, deletePodcastPlaylist } from '@/app/podcast-actions';
import { PodcastPlaylist, transcribeAndTranslateAudio, getIslVideoPlaylist, stitchVideosWithFfmpeg } from '@/app/actions';

export default function CreatePlaylistPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    audioLanguage: 'hi' as 'en' | 'hi' | 'mr' | 'gu',
    avatarModel: 'male' as 'male' | 'female'
  });
  
  // File and processing state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'transcribe' | 'generate' | 'preview' | 'save'>('upload');
  
  // Transcription and translation results
  const [transcriptionResults, setTranscriptionResults] = useState<{
    originalText: string;
    translatedText: string;
  } | null>(null);
  
  // ISL Video state
  const [islVideoPath, setIslVideoPath] = useState<string | null>(null);
  const [playlistId, setPlaylistId] = useState<number | null>(null);

  const handleFileUpload = (file: File) => {
    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload MP3, WAV, or AAC audio files only');
      return;
    }
    
    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      toast.error('File size must be less than 100MB');
      return;
    }
    
    setAudioFile(file);
    setCurrentStep('transcribe');
    toast.success('Audio file uploaded successfully!');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleTranscribe = async () => {
    if (!audioFile) {
      toast.error('Please upload an audio file first');
      return;
    }

    try {
      setIsProcessing(true);
      toast.info('Transcribing and translating audio...');
      
      // Convert audio file to base64 data URI
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(audioFile!);
      });
      
      // Map language codes to GCP format
      const languageMapping = {
        'en': 'en-US',
        'hi': 'hi-IN', 
        'mr': 'mr-IN',
        'gu': 'gu-IN'
      };
      
      const gcpLanguageCode = languageMapping[formData.audioLanguage] || 'en-US';
      
      // Create FormData for the transcription API
      const transcriptionFormData = new FormData();
      transcriptionFormData.append('audioDataUri', base64Audio);
      transcriptionFormData.append('languageCode', gcpLanguageCode);
      
      // Call the real GCP Speech-to-Text API
      const result = await transcribeAndTranslateAudio(transcriptionFormData);
      
      if (!result.transcribedText) {
        throw new Error('No transcription result received');
      }
      
      setTranscriptionResults({
        originalText: result.transcribedText,
        translatedText: result.translatedText
      });
      
      setCurrentStep('generate');
      toast.success('Transcription and translation completed!');
      
    } catch (error) {
      console.error('Error transcribing audio:', error);
      toast.error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateISL = async () => {
    if (!transcriptionResults) {
      toast.error('Please transcribe the audio first');
      return;
    }

    try {
      setIsProcessing(true);
      toast.info('Generating ISL video...');
      
      // Get ISL video playlist based on translated text and avatar model
      const islResult = await getIslVideoPlaylist(transcriptionResults.translatedText, formData.avatarModel);
      
      if (islResult.playlist.length === 0) {
        toast.error('No ISL videos found for the translated text. Please check your ISL dataset.');
        return;
      }
      
      if (islResult.unmatchedWords.length > 0) {
        toast.warning(`Some words could not be matched: ${islResult.unmatchedWords.join(', ')}`);
      }
      
      toast.info(`Found ${islResult.playlist.length} ISL videos. Stitching videos...`);
      
      // Create output filename
      const timestamp = Date.now();
      const outputFileName = `podcast_episode_${timestamp}.mp4`;
      
      // Stitch the videos together
      const stitchedVideoPath = await stitchVideosWithFfmpeg(islResult.playlist, outputFileName, true);
      
      if (!stitchedVideoPath) {
        throw new Error('Failed to stitch ISL videos');
      }
      
      // Move the stitched video to the podcast directory
      const finalVideoPath = `/podcasts/pm-modi-mann-ki-baat/${outputFileName}`;
      
      // Copy the stitched video to the podcast directory
      const response = await fetch('/api/move-video-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourcePath: stitchedVideoPath,
          destinationPath: finalVideoPath
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to move video to podcast directory');
      }
      
      setIslVideoPath(finalVideoPath);
      setCurrentStep('preview');
      toast.success(`ISL video generated successfully! Found ${islResult.playlist.length} videos.`);
      
    } catch (error) {
      console.error('Error generating ISL video:', error);
      toast.error(`Failed to generate ISL video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSavePlaylist = async () => {
    if (!formData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    
    if (!audioFile) {
      toast.error('Please upload an audio file');
      return;
    }

    if (!transcriptionResults) {
      toast.error('Please transcribe the audio first');
      return;
    }

    if (!islVideoPath) {
      toast.error('Please generate the ISL video first');
      return;
    }

    try {
      setIsProcessing(true);
      
      // Save audio file to the podcast directory
      const audioFileName = `audio_${Date.now()}_${audioFile.name}`;
      const audioPath = `/podcasts/pm-modi-mann-ki-baat/audio/${audioFileName}`;
      
      // Convert file to buffer and save
      const audioBuffer = await audioFile.arrayBuffer();
      const response = await fetch('/api/save-audio-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioData: Array.from(new Uint8Array(audioBuffer)),
          fileName: audioFileName,
          directory: 'podcasts/pm-modi-mann-ki-baat/audio'
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save audio file');
      }
      
      // Create playlist record
      const playlistData = {
        podcast_id: 1, // PM Modi Mann Ki Baat podcast ID
        title: formData.title,
        description: formData.description,
        audio_language: formData.audioLanguage,
        original_audio_path: audioPath,
        transcribed_text: transcriptionResults.originalText,
        translated_text: transcriptionResults.translatedText,
        isl_video_path: islVideoPath,
        avatar_model: formData.avatarModel
      };

      const result = await createPodcastPlaylist(playlistData);
      
      if (result.success && result.playlistId) {
        setPlaylistId(result.playlistId);
        setCurrentStep('save');
        toast.success('Playlist saved successfully!');
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Error saving playlist:', error);
      toast.error('Failed to save playlist');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    // Check if user has made any changes
    const hasChanges = formData.title || formData.description || audioFile || transcriptionResults || islVideoPath;
    
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to cancel? All progress will be lost.')) {
        return;
      }
    }
    
    router.push('/pm-modi-mann-ki-baat');
  };

  const handleDeletePlaylist = async () => {
    if (!playlistId) {
      toast.error('No playlist to delete');
      return;
    }

    if (!confirm('Are you sure you want to delete this playlist? This action cannot be undone.')) {
      return;
    }

    try {
      setIsProcessing(true);
      const result = await deletePodcastPlaylist(playlistId);
      
      if (result.success) {
        toast.success('Playlist deleted successfully!');
        router.push('/pm-modi-mann-ki-baat');
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Error deleting playlist:', error);
      toast.error('Failed to delete playlist');
    } finally {
      setIsProcessing(false);
    }
  };

  const getLanguageLabel = (lang: string) => {
    const labels = {
      'en': 'English',
      'hi': 'Hindi',
      'mr': 'Marathi',
      'gu': 'Gujarati'
    };
    return labels[lang as keyof typeof labels] || lang;
  };

  const getStepStatus = (step: string) => {
    const stepOrder = ['upload', 'transcribe', 'generate', 'preview', 'save'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(step);
    
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-primary">Create New Playlist</h1>
            <p className="text-muted-foreground">
              Create an ISL video playlist for PM Modi: Mann Ki Baat
            </p>
          </div>
        </div>
        
        <Button
          variant="outline"
          onClick={handleCancel}
          className="flex items-center gap-2"
        >
          Cancel
        </Button>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[
            { key: 'upload', label: 'Upload Audio', icon: Upload },
            { key: 'transcribe', label: 'Transcribe', icon: FileAudio },
            { key: 'generate', label: 'Generate ISL', icon: Play },
            { key: 'preview', label: 'Preview', icon: Eye },
            { key: 'save', label: 'Save', icon: Download }
          ].map((step, index) => {
            const Icon = step.icon;
            const status = getStepStatus(step.key);
            
            return (
              <div key={step.key} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  status === 'completed' ? 'bg-green-500 border-green-500 text-white' :
                  status === 'current' ? 'bg-primary border-primary text-white' :
                  'bg-gray-100 border-gray-300 text-gray-500'
                }`}>
                  {status === 'completed' ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  status === 'current' ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {step.label}
                </span>
                {index < 4 && (
                  <div className={`w-16 h-0.5 mx-4 ${
                    status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Enter the basic details for your playlist
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter playlist title"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter playlist description"
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="audioLanguage">Audio Language *</Label>
                  <Select
                    value={formData.audioLanguage}
                    onValueChange={(value: 'en' | 'hi' | 'mr' | 'gu') => 
                      setFormData(prev => ({ ...prev, audioLanguage: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="mr">Marathi</SelectItem>
                      <SelectItem value="gu">Gujarati</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="avatarModel">AI Avatar Model</Label>
                  <Select
                    value={formData.avatarModel}
                    onValueChange={(value: 'male' | 'female') => 
                      setFormData(prev => ({ ...prev, avatarModel: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male Avatar</SelectItem>
                      <SelectItem value="female">Female Avatar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audio Upload */}
          <Card>
            <CardHeader>
              <CardTitle>Audio File Upload</CardTitle>
              <CardDescription>
                Upload your audio file (MP3, WAV, AAC)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragOver ? 'border-primary bg-primary/5' : 'border-gray-300'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.wav,.aac,audio/mpeg,audio/wav,audio/aac"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                
                {audioFile ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-green-600">{audioFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Change File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mx-auto">
                      <Upload className="h-8 w-8 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-lg font-medium">Drop your audio file here</p>
                      <p className="text-sm text-muted-foreground">
                        or click to browse files
                      </p>
                    </div>
                    <Button onClick={() => fileInputRef.current?.click()}>
                      Choose File
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Transcription Results */}
          {transcriptionResults && (
            <Card>
              <CardHeader>
                <CardTitle>Transcription Results</CardTitle>
                <CardDescription>
                  Original text and English translation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Original Text ({getLanguageLabel(formData.audioLanguage)})</Label>
                  <div className="p-3 bg-gray-50 rounded-md text-sm">
                    {transcriptionResults.originalText}
                  </div>
                </div>
                <div>
                  <Label>English Translation</Label>
                  <div className="p-3 bg-gray-50 rounded-md text-sm">
                    {transcriptionResults.translatedText}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ISL Video Preview */}
          {islVideoPath && (
            <Card>
              <CardHeader>
                <CardTitle>ISL Video Preview</CardTitle>
                <CardDescription>
                  Generated ISL video with {formData.avatarModel} avatar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Play className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">ISL Video Preview</p>
                    <p className="text-xs text-muted-foreground">Click to play</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Actions */}
        <div className="space-y-6">
          {/* Action Buttons */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {currentStep === 'transcribe' && (
                <div className="space-y-2">
                  <Button
                    onClick={handleTranscribe}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Transcribing...
                      </>
                    ) : (
                      <>
                        <FileAudio className="h-4 w-4 mr-2" />
                        Transcribe Audio
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="w-full"
                    disabled={isProcessing}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {currentStep === 'generate' && (
                <div className="space-y-2">
                  <Button
                    onClick={handleGenerateISL}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Generate ISL Video
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="w-full"
                    disabled={isProcessing}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {currentStep === 'preview' && (
                <div className="space-y-2">
                  <Button
                    onClick={handleSavePlaylist}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Save Playlist
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="w-full"
                    disabled={isProcessing}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {currentStep === 'save' && (
                <div className="space-y-3">
                  <Button
                    onClick={() => router.push('/pm-modi-mann-ki-baat')}
                    className="w-full"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    View All Playlists
                  </Button>
                  
                  <Button
                    variant="destructive"
                    onClick={handleDeletePlaylist}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Playlist
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Information */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Audio Upload</span>
                <Badge variant={audioFile ? "default" : "secondary"}>
                  {audioFile ? "Completed" : "Pending"}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Transcription</span>
                <Badge variant={transcriptionResults ? "default" : "secondary"}>
                  {transcriptionResults ? "Completed" : "Pending"}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">ISL Video</span>
                <Badge variant={islVideoPath ? "default" : "secondary"}>
                  {islVideoPath ? "Generated" : "Pending"}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Saved</span>
                <Badge variant={playlistId ? "default" : "secondary"}>
                  {playlistId ? "Saved" : "Pending"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}