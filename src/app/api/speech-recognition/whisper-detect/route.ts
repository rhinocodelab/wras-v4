import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { readFile, unlink } from 'fs/promises';
import { translateTextToMultipleLanguages } from '@/app/actions';

// FastAPI backend URL
const FASTAPI_BASE_URL = process.env.FASTAPI_URL || 'https://192.168.1.34:5001';

export async function POST(request: NextRequest) {
  try {
    const { audioId } = await request.json();

    console.log('Whisper language detection request received:', { audioId });

    if (!audioId) {
      console.log('Error: No audio ID provided');
      return NextResponse.json(
        { success: false, error: 'No audio ID provided' },
        { status: 400 }
      );
    }

    // Read the audio file
    const tempDir = join(process.cwd(), 'public', 'temp-audio');
    const filePath = join(tempDir, `${audioId}.webm`);
    
    console.log('Looking for audio file at:', filePath);
    
    let audioBuffer: Buffer;
    try {
      audioBuffer = await readFile(filePath);
      console.log('Audio file read successfully, size:', audioBuffer.length, 'bytes');
    } catch (error) {
      console.log('Error reading audio file:', error);
      return NextResponse.json(
        { success: false, error: 'Audio file not found' },
        { status: 404 }
      );
    }

    // Call FastAPI backend for language detection
    try {
      console.log('Calling FastAPI backend for language detection...');
      
      const fastApiResponse = await fetch(`${FASTAPI_BASE_URL}/detect-language`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_path: filePath
        }),
      });

      if (!fastApiResponse.ok) {
        const errorText = await fastApiResponse.text();
        console.error('FastAPI error:', fastApiResponse.status, errorText);
        throw new Error(`FastAPI error: ${fastApiResponse.status} - ${errorText}`);
      }

      const fastApiResult = await fastApiResponse.json();
      console.log('FastAPI result:', fastApiResult);

      if (!fastApiResult.success) {
        throw new Error(fastApiResult.error || 'Language detection failed');
      }

      // Get translations to all other languages
      console.log(`Detected language: ${fastApiResult.language_code}, translating to all languages...`);
      const translations = await translateTextToMultipleLanguages(fastApiResult.transcript);
      
      // Map the translations to the correct language codes
      const languageTranslations = {
        'en-IN': translations.en,
        'hi-IN': translations.hi,
        'mr-IN': translations.mr,
        'gu-IN': translations.gu
      };

      // Clean up the temporary audio file
      try {
        await unlink(filePath);
        console.log(`Cleaned up temporary audio file: ${audioId}.webm`);
      } catch (error) {
        console.log(`Failed to clean up audio file: ${error}`);
      }

      return NextResponse.json({
        success: true,
        transcript: fastApiResult.transcript,
        detectedLanguage: fastApiResult.language_code,
        confidence: fastApiResult.confidence,
        translations: languageTranslations,
        originalText: languageTranslations[fastApiResult.language_code] || fastApiResult.transcript
      });

    } catch (error) {
      console.error('FastAPI call failed:', error);
      
      // Clean up the temporary audio file even on error
      try {
        await unlink(filePath);
        console.log(`Cleaned up temporary audio file after error: ${audioId}.webm`);
      } catch (cleanupError) {
        console.log(`Failed to clean up audio file after error: ${cleanupError}`);
      }
      
      throw error;
    }

  } catch (error) {
    console.error('Whisper language detection error:', error);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error during language detection' },
      { status: 500 }
    );
  }
}
