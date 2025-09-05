import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { audio, mimeType } = await request.json();

    if (!audio) {
      return NextResponse.json(
        { success: false, error: 'No audio data provided' },
        { status: 400 }
      );
    }

    // Create temp directory if it doesn't exist
    const tempDir = join(process.cwd(), 'public', 'temp-audio');
    try {
      await mkdir(tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }

    // Generate unique filename
    const audioId = randomUUID();
    const filename = `${audioId}.webm`;
    const filePath = join(tempDir, filename);

    // Convert base64 audio to buffer and save
    const audioBuffer = Buffer.from(audio, 'base64');
    await writeFile(filePath, audioBuffer);

    // Return the file path and ID
    return NextResponse.json({
      success: true,
      audioId: audioId,
      filename: filename,
      filePath: `/temp-audio/${filename}`,
      mimeType: mimeType || 'audio/webm'
    });

  } catch (error) {
    console.error('Error saving audio file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save audio file' },
      { status: 500 }
    );
  }
}
