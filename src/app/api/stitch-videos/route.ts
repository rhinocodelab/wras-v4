import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink, readdir } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const videoName = formData.get('videoName') as string;
    
    if (!videoName || !videoName.trim()) {
      return NextResponse.json(
        { success: false, message: 'Video name is required' },
        { status: 400 }
      );
    }

    // Validate and sanitize video name
    const trimmedName = videoName.trim();
    if (trimmedName.includes(' ')) {
      return NextResponse.json(
        { success: false, message: 'Video name cannot contain spaces' },
        { status: 400 }
      );
    }

    const sanitizedName = trimmedName.toLowerCase().replace(/[^a-zA-Z0-9-_]/g, '');
    if (!sanitizedName) {
      return NextResponse.json(
        { success: false, message: 'Video name must contain at least one valid character' },
        { status: 400 }
      );
    }

    // Extract video files from form data
    const videoFiles: File[] = [];
    let index = 0;
    while (formData.has(`video_${index}`)) {
      const file = formData.get(`video_${index}`) as File;
      if (file && file.type.startsWith('video/')) {
        videoFiles.push(file);
      }
      index++;
    }

    if (videoFiles.length < 2) {
      return NextResponse.json(
        { success: false, message: 'At least 2 video files are required for stitching' },
        { status: 400 }
      );
    }

    // Validate file sizes (max 100MB each)
    const maxSize = 100 * 1024 * 1024; // 100MB
    for (const file of videoFiles) {
      if (file.size > maxSize) {
        return NextResponse.json(
          { success: false, message: `Video file "${file.name}" is too large. Maximum size is 100MB.` },
          { status: 400 }
        );
      }
    }

    // Validate total number of videos (max 20)
    if (videoFiles.length > 20) {
      return NextResponse.json(
        { success: false, message: 'Maximum 20 videos can be stitched together.' },
        { status: 400 }
      );
    }

    // Create temp directory for processing
    const tempDir = join(process.cwd(), 'public', 'temp-videos');
    await mkdir(tempDir, { recursive: true });

    // Create a unique session directory
    const sessionId = `stitch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionDir = join(tempDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    try {
      // Save uploaded videos temporarily
      const tempVideoPaths: string[] = [];
      for (let i = 0; i < videoFiles.length; i++) {
        const file = videoFiles[i];
        const tempPath = join(sessionDir, `input_${i}_${file.name}`);
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(tempPath, buffer);
        tempVideoPaths.push(tempPath);
      }

      // Preprocess each video
      const preprocessedPaths: string[] = [];
      for (let i = 0; i < tempVideoPaths.length; i++) {
        const inputPath = tempVideoPaths[i];
        const outputPath = join(sessionDir, `preprocessed_${i}.mp4`);
        
        // Preprocess video: normalize resolution, frame rate, remove audio
        const ffmpegCommand = `ffmpeg -i "${inputPath}" -vf "fps=30:round=up,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -preset fast -crf 23 -an -movflags +faststart -pix_fmt yuv420p "${outputPath}" -y`;
        
        console.log(`Preprocessing video ${i + 1}/${tempVideoPaths.length}: ${ffmpegCommand}`);
        try {
          await execAsync(ffmpegCommand);
        } catch (error) {
          console.error(`Failed to preprocess video ${i + 1}:`, error);
          throw new Error(`Failed to preprocess video "${videoFiles[i].name}". Please ensure it's a valid video file.`);
        }
        
        preprocessedPaths.push(outputPath);
      }

      // Create file list for ffmpeg concat
      const fileListPath = join(sessionDir, 'filelist.txt');
      const fileListContent = preprocessedPaths
        .map(path => `file '${path}'`)
        .join('\n');
      await writeFile(fileListPath, fileListContent);

      // Stitch videos together using fast copy method
      const outputPath = join(sessionDir, `${sanitizedName}_stitched.mp4`);
      const stitchCommand = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy "${outputPath}" -y`;
      
      console.log(`Stitching videos: ${stitchCommand}`);
      try {
        await execAsync(stitchCommand);
      } catch (error) {
        console.error('Failed to stitch videos:', error);
        throw new Error('Failed to stitch videos together. Please ensure all videos are valid and compatible.');
      }

      // Move final video to a preview location
      const previewDir = join(process.cwd(), 'public', 'temp-videos', 'previews');
      await mkdir(previewDir, { recursive: true });
      
      const previewPath = join(previewDir, `${sanitizedName}_preview_${Date.now()}.mp4`);
      await execAsync(`mv "${outputPath}" "${previewPath}"`);

      // Clean up session directory
      await execAsync(`rm -rf "${sessionDir}"`);

      // Return preview URL
      const previewUrl = `/temp-videos/previews/${previewPath.split('/').pop()}`;
      
      return NextResponse.json({
        success: true,
        message: 'Videos stitched successfully',
        previewUrl: previewUrl,
        videoName: sanitizedName
      });

    } catch (processingError) {
      // Clean up session directory on error
      try {
        await execAsync(`rm -rf "${sessionDir}"`);
      } catch (cleanupError) {
        console.warn('Failed to clean up session directory:', cleanupError);
      }
      
      throw processingError;
    }

  } catch (error) {
    console.error('Error stitching videos:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'An unexpected error occurred during video stitching' 
      },
      { status: 500 }
    );
  }
}

// Clean up old preview files (older than 1 hour) or delete specific preview file
export async function DELETE(request: NextRequest) {
  try {
    const previewDir = join(process.cwd(), 'public', 'temp-videos', 'previews');
    
    // Check if a specific preview URL is provided
    try {
      const body = await request.json();
      if (body.previewUrl) {
        // Delete specific preview file
        const fileName = body.previewUrl.split('/').pop();
        if (fileName) {
          const filePath = join(previewDir, fileName);
          try {
            await unlink(filePath);
            console.log(`Deleted specific preview file: ${fileName}`);
            return NextResponse.json({ success: true, message: 'Preview file deleted' });
          } catch (error) {
            console.warn(`Could not delete file ${fileName}:`, error);
            return NextResponse.json(
              { success: false, message: 'File not found or already deleted' },
              { status: 404 }
            );
          }
        }
      }
    } catch (error) {
      // If JSON parsing fails, continue with general cleanup
      console.log('No specific preview URL provided, performing general cleanup');
    }
    
    // General cleanup of old files (older than 1 hour)
    try {
      const files = await readdir(previewDir);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
      
      for (const file of files) {
        const filePath = join(previewDir, file);
        try {
          const stats = await import('fs').then(fs => fs.promises.stat(filePath));
          if (now - stats.mtime.getTime() > oneHour) {
            await unlink(filePath);
            console.log(`Cleaned up old preview file: ${file}`);
          }
        } catch (error) {
          console.warn(`Could not process file ${file}:`, error);
        }
      }
    } catch (error) {
      // Directory might not exist yet
      console.log('Preview directory does not exist or is empty');
    }
    
    return NextResponse.json({ success: true, message: 'Cleanup completed' });
  } catch (error) {
    console.error('Error during cleanup:', error);
    return NextResponse.json(
      { success: false, message: 'Cleanup failed' },
      { status: 500 }
    );
  }
}