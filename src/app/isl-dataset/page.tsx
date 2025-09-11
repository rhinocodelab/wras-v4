
'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getIslVideosWithMetadata, VideoMetadata, uploadIslVideo, deleteIslVideo } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FolderKanban, PlayCircle, FileVideo, Calendar, HardDrive, Clock, Upload, Trash2, Plus, ChevronLeft, ChevronRight, Search, Scissors, Info } from 'lucide-react';

const VIDEOS_PER_PAGE = 42; // 6 rows × 7 columns

export default function IslDatasetPage() {
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [videoName, setVideoName] = useState('');
  const [videoNameError, setVideoNameError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isStitchModalOpen, setIsStitchModalOpen] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<File[]>([]);
  const [isStitching, setIsStitching] = useState(false);
  const [stitchProgress, setStitchProgress] = useState(0);
  const [stitchedVideoUrl, setStitchedVideoUrl] = useState<string | null>(null);
  const [stitchedVideoName, setStitchedVideoName] = useState('');
  const [stitchedVideoNameError, setStitchedVideoNameError] = useState('');
  const [stitchDragActive, setStitchDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stitchFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchVideos();
    // Clean up old preview files
    cleanupOldPreviews();
  }, []);

  const cleanupOldPreviews = async () => {
    try {
      await fetch('/api/stitch-videos', { method: 'DELETE' });
    } catch (error) {
      console.warn('Failed to cleanup old preview files:', error);
    }
  };

  // Filter videos based on search query
  const filteredVideos = videos.filter(video =>
    video.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredVideos.length / VIDEOS_PER_PAGE);
  const paginatedVideos = filteredVideos.slice(
    (currentPage - 1) * VIDEOS_PER_PAGE,
    currentPage * VIDEOS_PER_PAGE
  );

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

    const handlePlayClick = (videoSrc: string) => {
    setSelectedVideo(videoSrc);
    setIsModalOpen(true);
  }

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }

  const fetchVideos = async () => {
    setIsLoading(true);
    try {
      const videoMetadata = await getIslVideosWithMetadata();
      setVideos(videoMetadata);
      if (videoMetadata.length === 0) {
        toast({
          title: 'No Videos Found',
          description: 'The ISL dataset directory is empty or does not exist. Try syncing with the database.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch ISL dataset videos.',
      });
      console.error('Failed to fetch ISL videos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const syncWithDatabase = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/isl-dataset/sync', {
        method: 'POST',
      });
      
      if (response.ok) {
        toast({
          title: 'Sync Successful',
          description: 'ISL dataset synchronized with database successfully.',
        });
        // Refresh the videos list
        await fetchVideos();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync failed');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Failed to sync ISL dataset.',
      });
      console.error('Failed to sync ISL dataset:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const validateVideoName = (name: string): string => {
    if (!name || !name.trim()) {
      return 'Video name is required';
    }
    if (name.includes(' ')) {
      return 'Video name cannot contain spaces';
    }
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
      return 'Video name can only contain letters, numbers, hyphens, and underscores';
    }
    return '';
  };

  const handleFileUpload = async (file: File, videoNameInput?: string) => {
    if (!file) return;

    // Use the state video name if not provided
    const nameToUse = videoNameInput || videoName;
    
    // Validate video name
    const nameError = validateVideoName(nameToUse);
    if (nameError) {
      setVideoNameError(nameError);
      toast({
        variant: 'destructive',
        title: 'Invalid Video Name',
        description: nameError,
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid File Type',
        description: 'Please upload a valid video file (MP4, AVI, MOV, etc.)',
      });
      return;
    }

    // Validate file size (max 3MB)
    const maxSize = 3 * 1024 * 1024; // 3MB
    if (file.size > maxSize) {
      toast({
        variant: 'destructive',
        title: 'File Too Large',
        description: 'Video file size must be less than 3MB',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const formData = new FormData();
      formData.append('video', file);
      formData.append('videoName', nameToUse);

      const result = await uploadIslVideo(formData);
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      if (result.success) {
        toast({
          title: 'Success',
          description: result.message,
        });
        setIsUploadModalOpen(false);
        setVideoName('');
        setVideoNameError('');
        // Refresh the video list
        await fetchVideos();
      } else {
        toast({
          variant: 'destructive',
          title: 'Upload Failed',
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Upload Error',
        description: 'An unexpected error occurred during upload',
      });
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteVideo = async (videoPath: string, videoName: string) => {
    if (!confirm(`Are you sure you want to delete "${videoName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await deleteIslVideo(videoPath);
      
      if (result.success) {
        toast({
          title: 'Success',
          description: result.message,
        });
        // Refresh the video list
        await fetchVideos();
      } else {
        toast({
          variant: 'destructive',
          title: 'Delete Failed',
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete Error',
        description: 'An unexpected error occurred while deleting the video',
      });
      console.error('Delete error:', error);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleFileUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileUpload(file);
    }
  };

  const handleVideoNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setVideoName(value);
    
    // Clear error when user starts typing
    if (videoNameError) {
      setVideoNameError('');
    }
  };

  const handleStitchVideos = async () => {
    if (uploadedVideos.length < 2) {
      toast({
        variant: 'destructive',
        title: 'Invalid Selection',
        description: 'Please select at least 2 videos to stitch together.',
      });
      return;
    }

    if (uploadedVideos.length > 20) {
      toast({
        variant: 'destructive',
        title: 'Too Many Videos',
        description: 'Maximum 20 videos can be stitched together.',
      });
      return;
    }

    // Validate video name
    const nameError = validateVideoName(stitchedVideoName);
    if (nameError) {
      setStitchedVideoNameError(nameError);
      toast({
        variant: 'destructive',
        title: 'Invalid Video Name',
        description: nameError,
      });
      return;
    }

    setIsStitching(true);
    setStitchProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setStitchProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const formData = new FormData();
      formData.append('videoName', stitchedVideoName);
      uploadedVideos.forEach((file, index) => {
        formData.append(`video_${index}`, file);
      });

      const response = await fetch('/api/stitch-videos', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setStitchProgress(100);

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setStitchedVideoUrl(result.previewUrl);
          toast({
            title: 'Success',
            description: 'Videos stitched successfully! Please review the preview.',
          });
        } else {
          throw new Error(result.message || 'Failed to stitch videos');
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to stitch videos');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Stitching Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred during stitching',
      });
      console.error('Stitching error:', error);
    } finally {
      setIsStitching(false);
      setStitchProgress(0);
    }
  };

  const handleDiscardStitchedVideo = async () => {
    if (!stitchedVideoUrl) return;

    // Confirm before discarding
    if (!confirm('Are you sure you want to discard this stitched video? This action cannot be undone.')) {
      return;
    }

    try {
      // Delete the preview video file
      const response = await fetch('/api/stitch-videos', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ previewUrl: stitchedVideoUrl }),
      });

      if (response.ok) {
        toast({
          title: 'Discarded',
          description: 'Stitched video has been discarded.',
        });
      } else {
        console.warn('Failed to delete preview video, but continuing with discard');
      }
    } catch (error) {
      console.warn('Error deleting preview video:', error);
    } finally {
      // Reset the stitch modal state regardless of deletion success
      setIsStitchModalOpen(false);
      setStitchedVideoUrl(null);
      setUploadedVideos([]);
      setStitchedVideoName('');
      setStitchedVideoNameError('');
      setStitchProgress(0);
    }
  };

  const handleSaveStitchedVideo = async () => {
    if (!stitchedVideoUrl) return;

    try {
      // Fetch the stitched video file
      const response = await fetch(stitchedVideoUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch the stitched video');
      }
      
      const blob = await response.blob();
      
      // Create a File object from the blob
      const file = new File([blob], `${stitchedVideoName}.mp4`, { type: 'video/mp4' });
      
      // Validate video name
      const nameError = validateVideoName(stitchedVideoName);
      if (nameError) {
        toast({
          variant: 'destructive',
          title: 'Invalid Video Name',
          description: nameError,
        });
        return;
      }

      // Validate file type
      if (!file.type.startsWith('video/')) {
        toast({
          variant: 'destructive',
          title: 'Invalid File Type',
          description: 'Please upload a valid video file (MP4, AVI, MOV, etc.)',
        });
        return;
      }

      // Validate file size (max 100MB for stitched videos)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        toast({
          variant: 'destructive',
          title: 'File Too Large',
          description: 'Stitched video file size must be less than 100MB',
        });
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        // Simulate progress
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev >= 90) {
              clearInterval(progressInterval);
              return 90;
            }
            return prev + 10;
          });
        }, 200);

        const formData = new FormData();
        formData.append('video', file);
        formData.append('videoName', stitchedVideoName);

        const result = await uploadIslVideo(formData);
        
        clearInterval(progressInterval);
        setUploadProgress(100);

        if (result.success) {
          toast({
            title: 'Success',
            description: result.message,
          });
          
          // Delete the preview video after successful save
          try {
            await fetch('/api/stitch-videos', {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ previewUrl: stitchedVideoUrl }),
            });
          } catch (deleteError) {
            console.warn('Failed to delete preview video after save:', deleteError);
          }
          
          // Reset the stitch modal state
          setIsStitchModalOpen(false);
          setStitchedVideoUrl(null);
          setUploadedVideos([]);
          setStitchedVideoName('');
          setStitchedVideoNameError('');
          setStitchProgress(0);
          
          // Refresh the video list
          await fetchVideos();
        } else {
          toast({
            variant: 'destructive',
            title: 'Upload Failed',
            description: result.message,
          });
        }
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
      
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: 'Failed to save the stitched video to ISL Dataset',
      });
      console.error('Save error:', error);
    }
  };

  const handleStitchDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setStitchDragActive(true);
    } else if (e.type === 'dragleave') {
      setStitchDragActive(false);
    }
  };

  const handleStitchDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStitchDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('video/'));
      if (newFiles.length > 0) {
        setUploadedVideos(prev => {
          const totalVideos = prev.length + newFiles.length;
          if (totalVideos > 20) {
            toast({
              variant: 'destructive',
              title: 'Too Many Videos',
              description: `Maximum 20 videos allowed. You currently have ${prev.length} videos and are trying to add ${newFiles.length} more.`,
            });
            return prev;
          }
          return [...prev, ...newFiles];
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Invalid Files',
          description: 'Please drop only video files.',
        });
      }
    }
  };

  const removeVideoFromList = (index: number) => {
    setUploadedVideos(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllVideos = () => {
    setUploadedVideos([]);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" />
            ISL Dataset
          </h1>
          <p className="text-muted-foreground">
            A collection of pre-recorded ISL videos for various words and phrases.
          </p>
          {videos.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery ? (
                <>
                  {filteredVideos.length} of {videos.length} video{filteredVideos.length !== 1 ? 's' : ''} found
                  {filteredVideos.length > 0 && ` • Page ${currentPage} of ${totalPages}`}
                </>
              ) : (
                <>
                  {videos.length} video{videos.length !== 1 ? 's' : ''} available • Page {currentPage} of {totalPages}
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={syncWithDatabase} 
            disabled={isLoading}
            variant="outline"
            className="flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Sync Database
          </Button>
          <Dialog open={isStitchModalOpen} onOpenChange={setIsStitchModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Scissors className="h-4 w-4" />
                Stitch Videos
              </Button>
            </DialogTrigger>
          </Dialog>
          <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#287fb8] text-white hover:bg-[#287fb8]/90">
                Upload Video
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Upload ISL Video</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="videoName">Video Name *</Label>
                <Input
                  id="videoName"
                  value={videoName}
                  onChange={handleVideoNameChange}
                  placeholder="Enter a name for this video (no spaces, lowercase)"
                  className={`mt-1 ${videoNameError ? 'border-red-500' : ''}`}
                  disabled={isUploading}
                />
                {videoNameError && (
                  <p className="text-sm text-red-500 mt-1">{videoNameError}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Video name will be converted to lowercase and saved in its own folder
                </p>
              </div>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  !videoName.trim() || isUploading
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                    : dragActive
                    ? 'border-[#0F9D58] bg-[#0F9D58]/5'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={videoName.trim() && !isUploading ? handleDrag : undefined}
                onDragLeave={videoName.trim() && !isUploading ? handleDrag : undefined}
                onDragOver={videoName.trim() && !isUploading ? handleDrag : undefined}
                onDrop={videoName.trim() && !isUploading ? handleDrop : undefined}
              >
                <Upload className={`h-8 w-8 mx-auto mb-2 ${!videoName.trim() ? 'text-gray-300' : 'text-gray-400'}`} />
                <p className={`text-sm mb-2 ${!videoName.trim() ? 'text-gray-400' : 'text-gray-600'}`}>
                  {!videoName.trim() 
                    ? 'Enter a video name first to enable file upload'
                    : 'Drag and drop a video file here, or click to select'
                  }
                </p>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!videoName.trim() || isUploading}
                >
                  Select Video File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={!videoName.trim() || isUploading}
                />
              </div>
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Uploading and preprocessing...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-[#0F9D58] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-500">
                <p>• Video name is required and cannot contain spaces</p>
                <p>• Video name will be converted to lowercase automatically</p>
                <p>• Each video will be saved in its own folder: /isl_dataset/&lt;video-name&gt;/</p>
                <p>• Supported formats: MP4, AVI, MOV, WebM</p>
                <p>• Maximum file size: 100MB</p>
                <p>• Videos will be automatically preprocessed for optimal compatibility</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stitch Videos Modal */}
      <Dialog open={isStitchModalOpen} onOpenChange={setIsStitchModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stitch Videos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!stitchedVideoUrl ? (
              <>
                <div>
                  <Label htmlFor="stitchedVideoName">Final Video Name *</Label>
                  <Input
                    id="stitchedVideoName"
                    value={stitchedVideoName}
                    onChange={(e) => {
                      setStitchedVideoName(e.target.value);
                      if (stitchedVideoNameError) setStitchedVideoNameError('');
                    }}
                    placeholder="Enter a name for the stitched video (no spaces, lowercase)"
                    className={`mt-1 ${stitchedVideoNameError ? 'border-red-500' : ''}`}
                    disabled={isStitching}
                  />
                  {stitchedVideoNameError && (
                    <p className="text-sm text-red-500 mt-1">{stitchedVideoNameError}</p>
                  )}
                </div>
                
                <div>
                  <Label>Upload Videos to Stitch (in sequence)</Label>
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors mt-2 ${
                      !stitchedVideoName.trim() || isStitching
                        ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                        : stitchDragActive
                        ? 'border-[#0F9D58] bg-[#0F9D58]/5'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onDragEnter={stitchedVideoName.trim() && !isStitching ? handleStitchDrag : undefined}
                    onDragLeave={stitchedVideoName.trim() && !isStitching ? handleStitchDrag : undefined}
                    onDragOver={stitchedVideoName.trim() && !isStitching ? handleStitchDrag : undefined}
                    onDrop={stitchedVideoName.trim() && !isStitching ? handleStitchDrop : undefined}
                  >
                    <Upload className={`h-8 w-8 mx-auto mb-2 ${!stitchedVideoName.trim() ? 'text-gray-300' : 'text-gray-400'}`} />
                    <p className={`text-sm mb-2 ${!stitchedVideoName.trim() ? 'text-gray-400' : 'text-gray-600'}`}>
                      {!stitchedVideoName.trim() 
                        ? 'Enter a video name first to enable file upload'
                        : 'Drag and drop multiple video files here, or click to select'
                      }
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => stitchFileInputRef.current?.click()}
                      disabled={!stitchedVideoName.trim() || isStitching}
                    >
                      Select Video Files
                    </Button>
                    <input
                      ref={stitchFileInputRef}
                      type="file"
                      accept="video/*"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          const newFiles = Array.from(e.target.files);
                          setUploadedVideos(prev => {
                            const totalVideos = prev.length + newFiles.length;
                            if (totalVideos > 20) {
                              toast({
                                variant: 'destructive',
                                title: 'Too Many Videos',
                                description: `Maximum 20 videos allowed. You currently have ${prev.length} videos and are trying to add ${newFiles.length} more.`,
                              });
                              return prev;
                            }
                            return [...prev, ...newFiles];
                          });
                        }
                      }}
                      className="hidden"
                      disabled={!stitchedVideoName.trim() || isStitching}
                    />
                  </div>
                  
                  {uploadedVideos.length > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Selected Videos ({uploadedVideos.length}):</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={clearAllVideos}
                          disabled={isStitching}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          Clear All
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {uploadedVideos.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center gap-2">
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                                {index + 1}
                              </span>
                              <span className="text-sm">{file.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => removeVideoFromList(index)}
                                disabled={isStitching}
                                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {isStitching && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Processing and stitching videos...</span>
                      <span>{stitchProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-[#0F9D58] h-2 rounded-full transition-all duration-300"
                        style={{ width: `${stitchProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsStitchModalOpen(false);
                      setUploadedVideos([]);
                      setStitchedVideoName('');
                      setStitchedVideoNameError('');
                    }}
                    disabled={isStitching}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleStitchVideos}
                    disabled={!stitchedVideoName.trim() || uploadedVideos.length < 2 || isStitching}
                    className="bg-[#0F9D58] text-white hover:bg-[#0F9D58]/90"
                  >
                    {isStitching ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Stitching...
                      </>
                    ) : (
                      'Stitch Videos'
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>Preview Stitched Video</Label>
                  <div className="mt-2">
                    <video 
                      controls 
                      className="w-full rounded-md" 
                      src={stitchedVideoUrl}
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </div>
                
                {isUploading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Saving to ISL Dataset...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-[#287fb8] h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDiscardStitchedVideo}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Discard
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStitchedVideoUrl(null);
                      setUploadedVideos([]);
                      setStitchedVideoName('');
                      setStitchedVideoNameError('');
                      setStitchProgress(0);
                    }}
                  >
                    Stitch Another
                  </Button>
                  <Button
                    onClick={handleSaveStitchedVideo}
                    disabled={isUploading}
                    className="bg-[#287fb8] text-white hover:bg-[#287fb8]/90"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      'Save to ISL Dataset'
                    )}
                  </Button>
                </div>
              </>
            )}
            
            <div className="text-xs text-gray-500">
              <p>• Upload videos in the order you want them stitched together</p>
              <p>• New videos will be added to the end of the sequence</p>
              <p>• Use "Clear All" to start over or remove individual videos</p>
              <p>• Videos will be preprocessed and normalized before stitching</p>
              <p>• Final video will be saved in the ISL Dataset after verification</p>
              <p>• Supported formats: MP4, AVI, MOV, WebM</p>
              <p>• Maximum file size per video: 100MB</p>
              <p>• Maximum 20 videos can be stitched together</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <div className="mt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : videos.length > 0 ? (
            <>
              {/* Search Input */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search ISL videos by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              {/* Card Grid Layout */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-3">
                {paginatedVideos.map((video) => (
                  <div
                    key={video.path}
                    className="relative group bg-white border border-gray-200 rounded-lg p-3 hover:shadow-lg transition-all duration-200 cursor-pointer"
                  >
                    {/* Card Content */}
                    <div className="flex flex-col items-center text-center">
                      <FileVideo className="h-6 w-6 text-primary mb-2" />
                      <h3 className="font-medium text-sm text-gray-900 capitalize truncate w-full">
                        {video.name}
                      </h3>
                      <Info className="h-4 w-4 text-gray-400 mt-1" />
                    </div>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black bg-opacity-80 rounded-lg flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="text-white text-center space-y-2">
                        {/* Duration */}
                        <div className="flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          <span>
                            {video.duration ? formatDuration(video.duration) : 'Unknown'}
                          </span>
                        </div>
                        
                        {/* Size */}
                        <div className="flex items-center gap-1 text-xs">
                          <HardDrive className="h-3 w-3" />
                          <span>{(video.size / 1024 / 1024).toFixed(1)} MB</span>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayClick(video.path);
                            }}
                            className="p-1.5 bg-green-600 hover:bg-green-700 rounded-full transition-colors"
                            title="Play Video"
                          >
                            <PlayCircle className="h-4 w-4 text-white" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteVideo(video.path, video.name);
                            }}
                            className="p-1.5 bg-red-600 hover:bg-red-700 rounded-full transition-colors"
                            title="Delete Video"
                          >
                            <Trash2 className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-6 text-center text-muted-foreground border rounded-lg p-12">
              {searchQuery ? (
                <>
                  <p>No videos found matching "{searchQuery}".</p>
                  <p className="text-sm">
                    Try adjusting your search terms or clear the search to see all videos.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="mt-4"
                  >
                    Clear Search
                  </Button>
                </>
              ) : (
                <>
                  <p>No videos found in the ISL dataset.</p>
                  <p className="text-sm">
                    Add `.mp4` files to the `public/isl_dataset` directory to see them here.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        
        {filteredVideos.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between py-4">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * VIDEOS_PER_PAGE) + 1} to {Math.min(currentPage * VIDEOS_PER_PAGE, filteredVideos.length)} of {filteredVideos.length} videos
              {searchQuery && ` (filtered from ${videos.length} total)`}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={prevPage}
                disabled={currentPage === 1}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="flex items-center space-x-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="w-8 h-8 p-0"
                  >
                    {page}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={nextPage}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {selectedVideo ? videos.find(v => v.path === selectedVideo)?.name || 'Video' : 'Video'}
            </DialogTitle>
          </DialogHeader>
          {selectedVideo && (
            <div className="mt-4">
                <video key={selectedVideo} controls autoPlay className="w-full rounded-md" muted>
                    <source src={selectedVideo} type="video/mp4" />
                    Your browser does not support the video tag.
                </video>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
