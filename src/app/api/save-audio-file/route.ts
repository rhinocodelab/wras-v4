import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const { audioData, fileName, directory } = await request.json();

    if (!audioData || !fileName || !directory) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: audioData, fileName, directory' },
        { status: 400 }
      );
    }

    // Create the directory if it doesn't exist
    const fullDirectoryPath = join(process.cwd(), 'public', directory);
    await mkdir(fullDirectoryPath, { recursive: true });

    // Convert the audio data back to a buffer
    const audioBuffer = Buffer.from(audioData);
    
    // Save the file
    const filePath = join(fullDirectoryPath, fileName);
    await writeFile(filePath, audioBuffer);

    console.log(`Audio file saved: ${filePath}`);

    return NextResponse.json({
      success: true,
      message: 'Audio file saved successfully',
      filePath: `/${directory}/${fileName}`
    });

  } catch (error) {
    console.error('Error saving audio file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save audio file' },
      { status: 500 }
    );
  }
}