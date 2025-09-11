'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Languages, MessageSquare, Video, Text, Film, Rocket, Globe, Volume2, Megaphone, PlayCircle, FileVideo, Calendar, HardDrive, Clock, Trash2, Plus, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { translateInputText, getIslVideoPlaylist, translateTextToMultipleLanguages, generateTextToSpeech, saveTextToIslAudio, saveGeneralAnnouncement, getGeneralAnnouncements, deleteGeneralAnnouncement, clearIslVideoFolder, GeneralAnnouncement } from '@/app/actions';
import { generateTextToIslHtml } from '@/lib/utils';

// Source language is fixed to English only
const SOURCE_LANGUAGE = 'en';

// Using GeneralAnnouncement type from actions.ts

const VIDEOS_PER_PAGE = 10;

const IslVideoPlayer = ({ playlist, title }: { playlist: string[]; title: string }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

    useEffect(() => {
        if (videoRef.current && playlist.length > 0) {
            videoRef.current.play();
        }
    }, [playlist, currentVideoIndex]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.playbackRate = playbackSpeed;
        }
    }, [playbackSpeed]);

    const handleVideoEnd = () => {
        if (currentVideoIndex < playlist.length - 1) {
            setCurrentVideoIndex(currentVideoIndex + 1);
        } else {
            // Loop back to the first video
            setCurrentVideoIndex(0);
        }
    };

    if (!playlist || playlist.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-[400px] bg-muted rounded-lg p-4 text-center">
                <Video className="h-8 w-8 text-muted-foreground mb-2" />
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-xs text-muted-foreground">Video will appear here.</p>
            </div>
        )
    }

    const currentVideo = playlist[currentVideoIndex];
    const videoName = currentVideo.split('/').pop()?.replace('.mp4', '').replace(/_/g, ' ') || 'Unknown';

        return (
            <div className="h-[400px] flex flex-col">
            <div className="flex-1 flex flex-col">
                <video
                    ref={videoRef}
                    className="w-full h-[250px] rounded-md bg-black object-cover"
                    controls={false}
                    autoPlay
                    muted
                    playsInline
                    loop
                    onEnded={handleVideoEnd}
                >
                    <source src={currentVideo} type="video/mp4" />
                    Your browser does not support the video tag.
                </video>
            </div>
            <div className="p-3 pb-4 bg-muted rounded-md mt-2 flex-shrink-0">
                <div>
                    <h3 className="font-semibold text-xs mb-1">ISL Video Sequence</h3>
                    <p className="text-xs text-muted-foreground">
                        Playing video {currentVideoIndex + 1} of {playlist.length}
                    </p>
                    <div className="mt-1 text-xs text-muted-foreground break-all">
                        Current: {videoName}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        Total videos: {playlist.length}
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
                    
                </div>
            </div>
        </div>
    );
};

export default function GeneralAnnouncementPage() {
    // State for saved announcements table
    const [announcements, setAnnouncements] = useState<GeneralAnnouncement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // State for generate new announcement
    const [showGenerateForm, setShowGenerateForm] = useState(false);
    const [inputText, setInputText] = useState('');
    const [announcementTitle, setAnnouncementTitle] = useState('');
    const [islPlaylist, setIslPlaylist] = useState<string[]>([]);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [translations, setTranslations] = useState<{ en: string; mr: string; hi: string; gu: string }>({
        en: '',
        mr: '',
        hi: '',
        gu: ''
    });
    const [isTranslating, setIsTranslating] = useState(false);
    const [islVideoPath, setIslVideoPath] = useState<string>('');
    const [isPublishing, setIsPublishing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [avatarModel, setAvatarModel] = useState<'male' | 'female'>('male');

    const { toast } = useToast();

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const totalPages = Math.ceil(announcements.length / VIDEOS_PER_PAGE);
    const paginatedAnnouncements = announcements.slice(
        (currentPage - 1) * VIDEOS_PER_PAGE,
        currentPage * VIDEOS_PER_PAGE
    );

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
    };

    const formatDuration = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${remainingSeconds}s`;
        }
    };

    const fetchAnnouncements = async () => {
        setIsLoading(true);
        try {
            const announcements = await getGeneralAnnouncements();
            setAnnouncements(announcements);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to fetch general announcements.',
            });
            console.error('Failed to fetch announcements:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAnnouncement = async (id: number, title: string) => {
        if (!confirm(`Are you sure you want to delete "${title}"?`)) {
            return;
        }

        try {
            const result = await deleteGeneralAnnouncement(id);
            if (result.success) {
                setAnnouncements(prev => prev.filter(ann => ann.id !== id));
                toast({
                    title: 'Success',
                    description: result.message,
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: result.message,
                });
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to delete announcement.',
            });
        }
    };

    // Helper function to add spaces between digits
    const addSpacesToDigits = (text: string): string => {
        return text.replace(/(\d{2,})/g, (match) => match.split('').join(' '));
    };

    const handleTranslateText = useCallback(async () => {
        if (!inputText.trim()) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please enter some text to translate."
            });
            return;
        }

        setIsTranslating(true);
        try {
            const result = await translateTextToMultipleLanguages(inputText);
            setTranslations(result);
        } catch (error) {
            console.error('Translation error:', error);
            toast({
                variant: "destructive",
                title: "Translation Error",
                description: "Failed to translate text. Please try again."
            });
        } finally {
            setIsTranslating(false);
        }
    }, [inputText, toast]);

    const handleGenerateVideo = useCallback(async () => {
        if (!inputText.trim()) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please enter some text to generate ISL video."
            });
            return;
        }

        setIsGeneratingVideo(true);
        try {
            const processedText = addSpacesToDigits(inputText);
            const result = await getIslVideoPlaylist(processedText, avatarModel);
            setIslPlaylist(result.playlist);
            setIslVideoPath(result.playlist[0] || '');
        } catch (error) {
            console.error('Video generation error:', error);
            toast({
                variant: "destructive",
                title: "Video Generation Error",
                description: "Failed to generate ISL video. Please try again."
            });
        } finally {
            setIsGeneratingVideo(false);
        }
    }, [inputText, avatarModel, toast]);

    const handleSaveAnnouncement = async () => {
        if (!announcementTitle.trim()) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please enter a title for the announcement."
            });
            return;
        }

        if (!inputText.trim()) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please enter some text for the announcement."
            });
            return;
        }

        if (islPlaylist.length === 0) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please generate ISL video first."
            });
            return;
        }

        setIsSaving(true);
        try {
            const newAnnouncement: GeneralAnnouncement = {
                title: announcementTitle,
                original_text: inputText,
                translations,
                isl_video_playlist: islPlaylist,
                file_path: '' // Will be set by the save function after copying the video
            };

            const savedId = await saveGeneralAnnouncement(newAnnouncement);
            
            // Get the saved announcement with the actual file path
            const savedAnnouncements = await getGeneralAnnouncements();
            const savedAnnouncement = savedAnnouncements.find(a => a.id === savedId);
            
            if (!savedAnnouncement) {
                throw new Error('Failed to retrieve saved announcement');
            }
            
            setAnnouncements(prev => [savedAnnouncement, ...prev]);
            
            // Reset form
            setAnnouncementTitle('');
            setInputText('');
            setTranslations({ en: '', mr: '', hi: '', gu: '' });
            setIslPlaylist([]);
            setIslVideoPath('');
            setShowGenerateForm(false);

            toast({
                title: 'Success',
                description: 'General announcement saved successfully.',
            });
        } catch (error) {
            console.error('Save error:', error);
            toast({
                variant: "destructive",
                title: "Save Error",
                description: "Failed to save announcement. Please try again."
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handlePublish = async (playbackSpeed: number = 1.0) => {
        if (!inputText.trim() || islPlaylist.length === 0) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please generate ISL video first."
            });
            return;
        }

        setIsPublishing(true);
        try {
            // Use the first video from the playlist, or fallback to islVideoPath
            const videoPath = islPlaylist[0] || islVideoPath;
            
            if (!videoPath) {
                throw new Error("No video path available");
            }

            console.log('Publishing with video path:', videoPath);
            console.log('ISL Playlist:', islPlaylist);
            console.log('ISL Video Path:', islVideoPath);

            const htmlContent = generateTextToIslHtml(
                inputText,
                translations,
                videoPath,
                { en: '', mr: '', hi: '', gu: '' }, // No audio files for now
                playbackSpeed,
                true // Hide info-header for General Announcement
            );

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error('Publish error:', error);
            toast({
                variant: "destructive",
                title: "Publish Error",
                description: `Failed to publish announcement: ${error instanceof Error ? error.message : String(error)}`
            });
        } finally {
            setIsPublishing(false);
        }
    };

    const handleClearForm = async () => {
        try {
            // Clear the form state
            setAnnouncementTitle('');
            setInputText('');
            setTranslations({ en: '', mr: '', hi: '', gu: '' });
            setIslPlaylist([]);
            setIslVideoPath('');
            
            // Clear generated ISL videos from temporary folder
            const result = await clearIslVideoFolder();
            if (result.success) {
                console.log('ISL video folder cleared:', result.message);
            } else {
                console.warn('Failed to clear ISL video folder:', result.message);
                toast({
                    variant: "destructive",
                    title: "Warning",
                    description: "Form cleared but failed to delete some video files."
                });
            }
        } catch (error) {
            console.error('Error clearing form:', error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to clear form completely."
            });
        }
    };

    const handlePublishFromTable = async (announcement: GeneralAnnouncement) => {
        try {
            const videoPath = announcement.isl_video_playlist[0] || announcement.file_path;
            
            if (!videoPath) {
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "No video available for this announcement."
                });
                return;
            }

            console.log('Publishing announcement from table:', announcement.title);
            console.log('Video path:', videoPath);
            console.log('Translations:', announcement.translations);

            const htmlContent = generateTextToIslHtml(
                announcement.original_text,
                announcement.translations,
                videoPath,
                { en: '', mr: '', hi: '', gu: '' }, // No audio files for now
                1.0, // Default playback speed
                true // Hide info-header for General Announcement
            );

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (error) {
            console.error('Publish error:', error);
            toast({
                variant: "destructive",
                title: "Publish Error",
                description: `Failed to publish announcement: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    };

    if (showGenerateForm) {
        return (
            <div className="w-full">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Megaphone className="h-6 w-6 text-primary" />
                        <div>
                            <h1 className="text-lg font-semibold md:text-2xl">Generate New General Announcement</h1>
                            <p className="text-muted-foreground">
                                Create a new general announcement with ISL video support.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={() => setShowGenerateForm(false)}>
                        Back to List
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
                    {/* Left Column - Input and Controls */}
                    <div className="flex flex-col gap-4">
                        {/* Announcement Title */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Text className="h-5 w-5 text-primary" />
                                    Announcement Title
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Input
                                    value={announcementTitle}
                                    onChange={(e) => setAnnouncementTitle(e.target.value)}
                                    placeholder="Enter announcement title..."
                                />
                            </CardContent>
                        </Card>

                        {/* Input Text Card */}
                        <Card className="flex-1">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="space-y-1.5">
                                    <CardTitle className="flex items-center gap-2">
                                        <MessageSquare className="h-5 w-5 text-primary" />
                                        Input Text
                                    </CardTitle>
                                    <CardDescription>
                                        Enter English text to generate ISL video.
                                    </CardDescription>
                                </div>
                                <Button variant="ghost" size="sm" onClick={handleClearForm} disabled={!inputText}>
                                    Clear
                                </Button>
                            </CardHeader>
                            <CardContent className="flex-grow flex flex-col gap-4">
                                <Textarea
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="Enter English text here..."
                                    className="flex-1 resize-none"
                                />
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={handleTranslateText}
                                            disabled={isTranslating || !inputText.trim()}
                                            className="flex-1"
                                        >
                                            {isTranslating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <Languages className="mr-2 h-4 w-4" />
                                            {isTranslating ? 'Translating...' : 'Translate'}
                                        </Button>
                                        <Button
                                            onClick={handleGenerateVideo}
                                            disabled={isGeneratingVideo || !inputText.trim()}
                                            className="flex-1"
                                        >
                                            {isGeneratingVideo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <Video className="mr-2 h-4 w-4" />
                                            {isGeneratingVideo ? 'Generating...' : 'Generate ISL Video'}
                                        </Button>
                                    </div>
                                    
                                    {/* AI Avatar Model Selection */}
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                                        <span className="text-sm font-medium text-gray-700">AI Avatar Model:</span>
                                        <div className="flex items-center gap-1 bg-white rounded-md p-1 border">
                                            <button
                                                onClick={() => setAvatarModel('male')}
                                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                                                    avatarModel === 'male'
                                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                                                }`}
                                            >
                                                Male
                                            </button>
                                            <button
                                                onClick={() => setAvatarModel('female')}
                                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                                                    avatarModel === 'female'
                                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                                                }`}
                                            >
                                                Female
                                            </button>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {avatarModel === 'male' ? 'Using male ISL videos' : 'Using female ISL videos'}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Translations Card */}
                        <Card className="flex-1">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Globe className="h-5 w-5 text-primary" />
                                    Translations
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">English</label>
                                        <div className="p-3 bg-muted rounded-md text-sm">
                                            {translations.en || 'No translation available'}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">हिंदी (Hindi)</label>
                                        <div className="p-3 bg-muted rounded-md text-sm">
                                            {translations.hi || 'No translation available'}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">मराठी (Marathi)</label>
                                        <div className="p-3 bg-muted rounded-md text-sm">
                                            {translations.mr || 'No translation available'}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">ગુજરાતી (Gujarati)</label>
                                        <div className="p-3 bg-muted rounded-md text-sm">
                                            {translations.gu || 'No translation available'}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column - Video Player */}
                    <div className="flex flex-col">
                        <Card className="h-[500px] flex flex-col">
                            <CardHeader className="flex-shrink-0">
                                <CardTitle className="flex items-center gap-2">
                                    <Film className="h-5 w-5 text-primary" />
                                    ISL Video Preview
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex-1 min-h-0">
                                <IslVideoPlayer 
                                    playlist={islPlaylist} 
                                    title="ISL Video Preview"
                                />
                            </CardContent>
                        </Card>

                        {/* Action Buttons */}
                        <div className="mt-6 flex gap-2">
                            <Button 
                                onClick={() => handlePublish(1.0)}
                                disabled={isPublishing || !inputText.trim() || islPlaylist.length === 0}
                                className="flex-1"
                                size="lg"
                            >
                                {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Rocket className="mr-2 h-4 w-4" />
                                {isPublishing ? 'Publishing...' : 'Publish'}
                            </Button>
                            <Button 
                                onClick={handleSaveAnnouncement}
                                disabled={isSaving || !announcementTitle.trim() || !inputText.trim() || islPlaylist.length === 0}
                                className="flex-1"
                                size="lg"
                            >
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" />
                                {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Megaphone className="h-6 w-6 text-primary" />
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">General Announcements</h1>
                        <p className="text-muted-foreground">
                            Manage and view all saved general announcements with ISL video support.
                        </p>
                    </div>
                </div>
                <Button onClick={() => setShowGenerateForm(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Generate New
                </Button>
            </div>

            {/* Saved Announcements Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileVideo className="h-5 w-5 text-primary" />
                        Saved General Announcements
                    </CardTitle>
                    <CardDescription>
                        View and manage all saved general announcements.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <span className="ml-2">Loading announcements...</span>
                        </div>
                    ) : announcements.length === 0 ? (
                        <div className="text-center py-8">
                            <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">No General Announcements</h3>
                            <p className="text-muted-foreground mb-4">
                                You haven't created any general announcements yet.
                            </p>
                            <Button onClick={() => setShowGenerateForm(true)}>
                                <Plus className="mr-2 h-4 w-4" />
                                Create Your First Announcement
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="border rounded-lg">
                                <TooltipProvider>
                                    <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[300px]">Title</TableHead>
                                            <TableHead className="w-[200px]">Text Preview</TableHead>
                                            <TableHead className="w-[150px]">Created Date</TableHead>
                                            <TableHead className="w-[100px]">Videos</TableHead>
                                            <TableHead className="w-[200px] text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedAnnouncements.map((announcement) => (
                                            <TableRow key={announcement.id} className="hover:bg-muted/50">
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <Megaphone className="h-4 w-4 text-primary" />
                                                        <span>{announcement.title}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="text-sm text-muted-foreground max-w-[200px] truncate cursor-help">
                                                                {announcement.original_text}
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="max-w-[400px]">
                                                            <p className="text-sm">{announcement.original_text}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                        <Calendar className="h-3 w-3" />
                                                        <span>{new Date(announcement.created_at || '').toLocaleDateString()}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                        <Video className="h-3 w-3" />
                                                        <span>{announcement.isl_video_playlist.length}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleDeleteAnnouncement(announcement.id!, announcement.title)}
                                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handlePublishFromTable(announcement)}
                                                            className="bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                                                        >
                                                            <Rocket className="h-4 w-4 mr-1" />
                                                            Publish
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handlePlayClick(announcement.isl_video_playlist[0] || '')}
                                                            className="bg-[#0F9D58] text-white hover:bg-[#0F9D58]/90 border-[#0F9D58]"
                                                        >
                                                            <PlayCircle className="h-4 w-4 mr-1" />
                                                            Play
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                </TooltipProvider>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4">
                                    <div className="text-sm text-muted-foreground">
                                        Showing {((currentPage - 1) * VIDEOS_PER_PAGE) + 1} to {Math.min(currentPage * VIDEOS_PER_PAGE, announcements.length)} of {announcements.length} announcements
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={prevPage}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Previous
                                        </Button>
                                        <div className="flex items-center gap-1">
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
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Video Player Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>ISL Video Player</DialogTitle>
                    </DialogHeader>
                    <div className="aspect-video">
                        {selectedVideo && (
                            <video
                                className="w-full h-full rounded-md bg-black object-cover"
                                controls
                                autoPlay
                                muted
                                playsInline
                            >
                                <source src={selectedVideo} type="video/mp4" />
                                Your browser does not support the video tag.
                            </video>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}