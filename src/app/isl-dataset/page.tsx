
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
import { Loader2, FolderKanban, PlayCircle, FileVideo, Calendar, HardDrive, Clock, Upload, Trash2, Plus, ChevronLeft, ChevronRight, Search } from 'lucide-react';

const VIDEOS_PER_PAGE = 10;

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchVideos();
  }, []);

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
              
              <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[400px]">Video Name</TableHead>
                    <TableHead className="w-[150px]">Duration</TableHead>
                    <TableHead className="w-[150px]">Size</TableHead>
                    <TableHead className="w-[200px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedVideos.map((video) => (
                    <TableRow key={video.path} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileVideo className="h-4 w-4 text-primary" />
                          <span className="capitalize">{video.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {video.duration ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatDuration(video.duration)}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <HardDrive className="h-3 w-3" />
                          <span>{(video.size / 1024 / 1024).toFixed(1)} MB</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteVideo(video.path, video.name)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              onClick={() => handlePlayClick(video.path)}
                              className="bg-[#0F9D58] text-white hover:bg-[#0F9D58]/90 border-[#0F9D58]"
                            >
                              <PlayCircle className="h-4 w-4 mr-1" />
                              Play
                            </Button>
                          </DialogTrigger>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
