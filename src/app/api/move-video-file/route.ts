import { NextRequest, NextResponse } from 'next/server';
import { copyFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { sourcePath, destinationPath } = await request.json();

    if (!sourcePath || !destinationPath) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: sourcePath, destinationPath' },
        { status: 400 }
      );
    }

    // Create the destination directory if it doesn't exist
    const destinationDir = join(process.cwd(), 'public', destinationPath.substring(0, destinationPath.lastIndexOf('/')));
    await mkdir(destinationDir, { recursive: true });

    // Get full paths
    const fullSourcePath = join(process.cwd(), 'public', sourcePath);
    const fullDestinationPath = join(process.cwd(), 'public', destinationPath);
    
    // Copy the file
    await copyFile(fullSourcePath, fullDestinationPath);

    console.log(`Video file moved from ${sourcePath} to ${destinationPath}`);

    return NextResponse.json({
      success: true,
      message: 'Video file moved successfully',
      destinationPath: destinationPath
    });

  } catch (error) {
    console.error('Error moving video file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to move video file' },
      { status: 500 }
    );
  }
}