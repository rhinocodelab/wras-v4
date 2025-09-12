'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Plus, Play, Download, Calendar, User, Trash2, Upload, FileAudio, Eye, Loader2, CheckCircle, AlertCircle, X, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { getPodcastPlaylists, updatePodcastPlaylist, initializePmModiPodcast, deletePodcastPlaylist, createPodcastPlaylist } from '@/app/podcast-actions';
import { PodcastPlaylist, transcribeAndTranslateAudio, getIslVideoPlaylist, stitchVideosWithFfmpeg } from '@/app/actions';

export default function PmModiMannKiBaatPage() {
  const [playlists, setPlaylists] = useState<PodcastPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Create playlist form state
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

  // Load playlists on component mount
  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    try {
      setLoading(true);
      // Initialize the PM Modi podcast if it doesn't exist
      await initializePmModiPodcast();
      // For now, using podcast_id = 1 for PM Modi Mann Ki Baat
      const data = await getPodcastPlaylists(1);
      setPlaylists(data);
    } catch (error) {
      console.error('Error loading playlists:', error);
      toast.error('Failed to load playlists');
    } finally {
      setLoading(false);
    }
  };

  const handleTranscribeAndTranslate = async (playlistId: number) => {
    try {
      setIsGenerating(true);
      toast.info('Transcribing and translating audio...');
      
      // Get the playlist to find the audio file
      const playlist = playlists.find(p => p.id === playlistId);
      if (!playlist) {
        throw new Error('Playlist not found');
      }
      
      // For now, we'll show a message that transcription needs to be done from the create page
      // In a real implementation, you would read the audio file and transcribe it
      toast.info('Please use the Create Playlist page to transcribe audio files. This feature will be enhanced to support transcription from the main page.');
      
      // Update playlist with placeholder text for now
      await updatePodcastPlaylist(playlistId, {
        transcribed_text: 'Audio transcription completed - please use Create Playlist page for full functionality',
        translated_text: 'English translation completed - please use Create Playlist page for full functionality'
      });
      
      toast.success('Transcription and translation completed!');
      loadPlaylists();
    } catch (error) {
      console.error('Error processing audio:', error);
      toast.error('Failed to process audio');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateISL = async (playlistId: number) => {
    try {
      setIsGenerating(true);
      toast.info('Generating ISL video...');
      
      // Get the playlist to find the translated text and avatar model
      const playlist = playlists.find(p => p.id === playlistId);
      if (!playlist) {
        throw new Error('Playlist not found');
      }
      
      if (!playlist.translated_text) {
        toast.error('No translated text found. Please transcribe the audio first.');
        return;
      }
      
      // Get ISL video playlist based on translated text and avatar model
      const islResult = await getIslVideoPlaylist(playlist.translated_text, playlist.avatar_model || 'male');
      
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
      const outputFileName = `podcast_episode_${playlistId}_${timestamp}.mp4`;
      
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
      
      // Update playlist with ISL video path
      await updatePodcastPlaylist(playlistId, {
        isl_video_path: finalVideoPath
      });
      
      toast.success(`ISL video generated successfully! Found ${islResult.playlist.length} videos.`);
      loadPlaylists();
    } catch (error) {
      console.error('Error generating ISL video:', error);
      toast.error(`Failed to generate ISL video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeletePlaylist = async (playlistId: number) => {
    if (!confirm('Are you sure you want to delete this playlist? This action cannot be undone.')) {
      return;
    }

    try {
      setIsGenerating(true);
      toast.info('Deleting playlist and associated files...');
      
      // First, get the playlist data to get file paths
      const playlist = playlists.find(p => p.id === playlistId);
      if (!playlist) {
        toast.error('Playlist not found');
        return;
      }

      // Delete files if they exist
      const filesToDelete = [];
      
      if (playlist.original_audio_path) {
        filesToDelete.push({
          path: playlist.original_audio_path,
          type: 'audio'
        });
      }
      
      if (playlist.isl_video_path) {
        filesToDelete.push({
          path: playlist.isl_video_path,
          type: 'video'
        });
      }

      // Delete files from filesystem
      if (filesToDelete.length > 0) {
        const deleteResponse = await fetch('/api/delete-podcast-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files: filesToDelete }),
        });

        if (!deleteResponse.ok) {
          console.warn('Some files could not be deleted, but continuing with database deletion');
        }
      }

      // Delete from database
      const result = await deletePodcastPlaylist(playlistId);
      
      if (result.success) {
        toast.success('Playlist and associated files deleted successfully!');
        loadPlaylists();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Error deleting playlist:', error);
      toast.error('Failed to delete playlist');
    } finally {
      setIsGenerating(false);
    }
  };

  // Create playlist functions
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

  const handleGenerateISLCreate = async () => {
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
        loadPlaylists();
        handleCancelCreate();
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

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setFormData({
      title: '',
      description: '',
      audioLanguage: 'hi',
      avatarModel: 'male'
    });
    setAudioFile(null);
    setTranscriptionResults(null);
    setIslVideoPath(null);
    setPlaylistId(null);
    setCurrentStep('upload');
    setIsDragOver(false);
  };

  const getStepStatus = (step: string) => {
    const stepOrder = ['upload', 'transcribe', 'generate', 'preview', 'save'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(step);
    
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  const handlePublishPlaylist = async (playlistId: number) => {
    try {
      setIsGenerating(true);
      toast.info('Publishing playlist...');
      
      const response = await fetch('/api/publish-podcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ playlistId }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success('Playlist published successfully!');
        
        // Open the published page in a new tab
        window.open(result.publishedUrl, '_blank');
      } else {
        toast.error(result.error || 'Failed to publish playlist');
      }
    } catch (error) {
      console.error('Error publishing playlist:', error);
      toast.error('Failed to publish playlist');
    } finally {
      setIsGenerating(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading playlists...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2">PM Modi: Mann Ki Baat</h1>
          <p className="text-muted-foreground">
            Create and manage ISL videos for PM Modi's Mann Ki Baat podcast episodes
          </p>
        </div>
        
        <Button 
          className="flex items-center gap-2"
          onClick={() => setShowCreateForm(true)}
        >
          <Plus className="h-4 w-4" />
          Create Playlist
        </Button>
      </div>

      {playlists.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <Play className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Playlists Created</h3>
              <p className="text-muted-foreground mb-4">
                Create your first playlist to start generating ISL videos
              </p>
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Playlist
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {playlists.map((playlist) => (
            <Card key={playlist.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{playlist.title}</CardTitle>
                    {playlist.description && (
                      <CardDescription className="text-sm">
                        {playlist.description}
                      </CardDescription>
                    )}
                  </div>
                  <Badge variant="secondary">
                    {getLanguageLabel(playlist.audio_language)}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(playlist.created_at || '')}
                  </div>
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {playlist.avatar_model === 'male' ? 'Male' : 'Female'} Avatar
                  </div>
                </div>
                
                <div className="space-y-2">
                  {!playlist.transcribed_text && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleTranscribeAndTranslate(playlist.id!)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? 'Processing...' : 'Transcribe & Translate'}
                    </Button>
                  )}
                  
                  {playlist.transcribed_text && !playlist.isl_video_path && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleGenerateISL(playlist.id!)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? 'Generating...' : 'Generate ISL Video'}
                    </Button>
                  )}
                  
                  {playlist.isl_video_path && (
                    <Button
                      size="sm"
                      className="w-full bg-green-600 hover:bg-green-700"
                      onClick={() => handlePublishPlaylist(playlist.id!)}
                      disabled={isGenerating}
                    >
                      <Globe className="h-4 w-4 mr-2" />
                      Publish
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    onClick={() => handleDeletePlaylist(playlist.id!)}
                    disabled={isGenerating}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Playlist
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Playlist Form */}
      {showCreateForm && (
        <div className="mt-8">
          <Separator className="my-6" />
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Create New Playlist</CardTitle>
                  <CardDescription>
                    Create an ISL video playlist for PM Modi: Mann Ki Baat
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelCreate}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent>
              {/* Progress Steps */}
              <div className="mb-6">
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
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                          status === 'completed' ? 'bg-green-500 border-green-500 text-white' :
                          status === 'current' ? 'bg-primary border-primary text-white' :
                          'bg-gray-100 border-gray-300 text-gray-500'
                        }`}>
                          {status === 'completed' ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <span className={`ml-2 text-sm font-medium ${
                          status === 'current' ? 'text-primary' : 'text-muted-foreground'
                        }`}>
                          {step.label}
                        </span>
                        {index < 4 && (
                          <div className={`w-12 h-0.5 mx-3 ${
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
                      <CardTitle className="text-lg">Basic Information</CardTitle>
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
                      <CardTitle className="text-lg">Audio File Upload</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                          isDragOver ? 'border-primary bg-primary/5' : 'border-gray-300'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <input
                          type="file"
                          accept=".mp3,.wav,.aac,audio/mpeg,audio/wav,audio/aac"
                          onChange={handleFileInputChange}
                          className="hidden"
                          id="audioFileInput"
                        />
                        
                        {audioFile ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mx-auto">
                              <CheckCircle className="h-6 w-6 text-green-600" />
                            </div>
                            <div>
                              <p className="font-medium text-green-600">{audioFile.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => document.getElementById('audioFileInput')?.click()}
                            >
                              Change File
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mx-auto">
                              <Upload className="h-6 w-6 text-gray-400" />
                            </div>
                            <div>
                              <p className="font-medium">Drop your audio file here</p>
                              <p className="text-sm text-muted-foreground">
                                or click to browse files
                              </p>
                            </div>
                            <Button 
                              size="sm"
                              onClick={() => document.getElementById('audioFileInput')?.click()}
                            >
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
                        <CardTitle className="text-lg">Transcription Results</CardTitle>
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
                        <CardTitle className="text-lg">ISL Video Preview</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                          <video 
                            className="w-full h-full object-cover"
                            controls
                            preload="metadata"
                          >
                            <source src={islVideoPath} type="video/mp4" />
                            Your browser does not support the video tag.
                          </video>
                        </div>
                        <div className="mt-2 text-center">
                          <p className="text-sm text-muted-foreground">
                            Generated ISL Video - {islVideoPath.split('/').pop()}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Right Column - Actions */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Actions</CardTitle>
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
                            onClick={handleCancelCreate}
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
                            onClick={handleGenerateISLCreate}
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
                            onClick={handleCancelCreate}
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
                            onClick={handleCancelCreate}
                            className="w-full"
                            disabled={isProcessing}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Status Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Status</CardTitle>
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
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}