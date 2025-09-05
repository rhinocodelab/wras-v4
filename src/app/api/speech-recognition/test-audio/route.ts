import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { readFile, stat } from 'fs/promises';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const audioId = searchParams.get('audioId');

    if (!audioId) {
      return NextResponse.json(
        { success: false, error: 'No audio ID provided' },
        { status: 400 }
      );
    }

    // Check if the audio file exists
    const tempDir = join(process.cwd(), 'public', 'temp-audio');
    const filePath = join(tempDir, `${audioId}.webm`);
    
    try {
      const stats = await stat(filePath);
      const audioBuffer = await readFile(filePath);
      
      return NextResponse.json({
        success: true,
        audioId: audioId,
        filePath: filePath,
        fileSize: stats.size,
        bufferSize: audioBuffer.length,
        exists: true
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        audioId: audioId,
        filePath: filePath,
        exists: false,
        error: error.message
      });
    }

  } catch (error) {
    console.error('Test audio error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
