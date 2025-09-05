import { NextRequest, NextResponse } from 'next/server';
import { SpeechClient } from '@google-cloud/speech';
import { join } from 'path';
import { readFile, unlink } from 'fs/promises';
import { translateTextToMultipleLanguages } from '@/app/actions';

// Set the GOOGLE_APPLICATION_CREDENTIALS environment variable
const credentialsPath = join(process.cwd(), 'config', 'isl.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

// Initialize the Speech client
const speechClient = new SpeechClient();

export async function POST(request: NextRequest) {
  try {
    const { audioId, languageCode } = await request.json();

    if (!audioId || !languageCode) {
      return NextResponse.json(
        { success: false, error: 'Audio ID and language code are required' },
        { status: 400 }
      );
    }

    // Read the audio file
    const tempDir = join(process.cwd(), 'public', 'temp-audio');
    const filePath = join(tempDir, `${audioId}.webm`);
    
    let audioBuffer: Buffer;
    try {
      audioBuffer = await readFile(filePath);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Audio file not found' },
        { status: 404 }
      );
    }

    // Configure speech recognition with the detected language
    const speechRequest = {
      audio: {
        content: audioBuffer,
      },
      config: {
        encoding: 'WEBM_OPUS' as const,
        sampleRateHertz: 48000,
        languageCode: languageCode,
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
        enableWordConfidence: true,
        model: 'latest_long',
        useEnhanced: true,
        diarizationConfig: {
          enableSpeakerDiarization: false,
        },
      },
    };

    console.log(`Transcribing audio with language: ${languageCode}`);
    const [response] = await speechClient.recognize(speechRequest);
    
    if (!response.results || response.results.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No speech detected in the audio' },
        { status: 400 }
      );
    }

    // Process results to get full transcript
    let fullTranscript = '';
    let confidence = 0;
    
    for (const result of response.results) {
      const alternative = result.alternatives?.[0];
      if (!alternative) continue;
      
      const transcript = alternative.transcript;
      fullTranscript += transcript + ' ';
      
      // Use the highest confidence score
      if (alternative.confidence > confidence) {
        confidence = alternative.confidence;
      }
    }
    
    const finalTranscript = fullTranscript.trim();
    
    if (!finalTranscript) {
      return NextResponse.json(
        { success: false, error: 'No speech detected in the audio' },
        { status: 400 }
      );
    }
    
    // Get translations to all other languages
    console.log(`Transcribed: "${finalTranscript}", translating to all languages...`);
    const translations = await translateTextToMultipleLanguages(finalTranscript);
    
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
      transcript: finalTranscript,
      detectedLanguage: languageCode,
      confidence: confidence,
      translations: languageTranslations,
      originalText: languageTranslations[languageCode] || finalTranscript
    });

  } catch (error) {
    console.error('Transcription error:', error);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error during transcription' },
      { status: 500 }
    );
  }
}
