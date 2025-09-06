import { NextRequest, NextResponse } from 'next/server';
import { SpeechClient } from '@google-cloud/speech';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { translateTextToMultipleLanguages } from '@/app/actions';

// Set the GOOGLE_APPLICATION_CREDENTIALS environment variable
const credentialsPath = join(process.cwd(), 'config', 'isl.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

// Initialize the Speech client
const speechClient = new SpeechClient();

const SUPPORTED_LANGUAGES = ['en-IN', 'hi-IN', 'mr-IN', 'gu-IN'];

const LANGUAGE_MAPPING = {
  'en-IN': 'English',
  'hi-IN': 'Hindi',
  'mr-IN': 'Marathi',
  'gu-IN': 'Gujarati'
};

export async function POST(request: NextRequest) {
  try {
    const { audioId, languageCode } = await request.json();

    console.log('Transcription request received:', { audioId, languageCode });

    if (!audioId || !languageCode) {
      console.log('Error: Missing audioId or languageCode');
      return NextResponse.json(
        { success: false, error: 'Missing audioId or languageCode' },
        { status: 400 }
      );
    }

    if (!SUPPORTED_LANGUAGES.includes(languageCode)) {
      console.log('Error: Unsupported language code:', languageCode);
      return NextResponse.json(
        { success: false, error: 'Unsupported language code' },
        { status: 400 }
      );
    }

    // Read the audio file - try different extensions
    const tempDir = join(process.cwd(), 'public', 'temp-audio');
    const possibleExtensions = ['webm', 'wav', 'mp3'];
    let filePath: string;
    let audioBuffer: Buffer;
    let fileExtension: string;
    
    // Try to find the file with different extensions
    for (const ext of possibleExtensions) {
      const testPath = join(tempDir, `${audioId}.${ext}`);
      try {
        audioBuffer = await readFile(testPath);
        filePath = testPath;
        fileExtension = ext;
        console.log(`Audio file found: ${testPath}, size: ${audioBuffer.length} bytes`);
        break;
      } catch (error) {
        // Continue to next extension
        continue;
      }
    }
    
    if (!audioBuffer) {
      console.log('Error: Audio file not found with any supported extension');
      return NextResponse.json(
        { success: false, error: 'Audio file not found' },
        { status: 404 }
      );
    }

    try {
      // Determine encoding and sample rate based on file extension
      let encoding: string;
      let sampleRateHertz: number;
      
      if (fileExtension === 'wav') {
        // For WAV files, try to detect properties from header
        if (audioBuffer.length >= 44) {
          const sampleRate = audioBuffer.readUInt32LE(24);
          const bitsPerSample = audioBuffer.readUInt16LE(34);
          sampleRateHertz = sampleRate;
          encoding = bitsPerSample === 16 ? 'LINEAR16' : 'LINEAR8';
        } else {
          sampleRateHertz = 16000;
          encoding = 'LINEAR16';
        }
      } else if (fileExtension === 'mp3') {
        encoding = 'MP3';
        sampleRateHertz = 44100; // Common MP3 sample rate
      } else {
        // Default for webm
        encoding = 'WEBM_OPUS';
        sampleRateHertz = 48000;
      }
      
      console.log(`Using audio config: encoding=${encoding}, sampleRateHertz=${sampleRateHertz}, fileExtension=${fileExtension}`);
      
      // Configure Google Cloud Speech-to-Text with enhanced settings
      const speechRequest = {
        audio: {
          content: audioBuffer,
        },
        config: {
          encoding: encoding as any,
          sampleRateHertz: sampleRateHertz,
          languageCode: languageCode,
          alternativeLanguageCodes: SUPPORTED_LANGUAGES.filter(lang => lang !== languageCode),
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

      console.log(`Transcribing with language: ${languageCode}`);
      console.log('Speech request config:', {
        encoding: speechRequest.config.encoding,
        sampleRateHertz: speechRequest.config.sampleRateHertz,
        languageCode: speechRequest.config.languageCode,
        alternativeLanguageCodes: speechRequest.config.alternativeLanguageCodes
      });

      const [response] = await speechClient.recognize(speechRequest);
      console.log('Google Cloud Speech API response:', response);

      if (!response.results || response.results.length === 0) {
        console.log('No speech detected in audio');
        return NextResponse.json(
          { success: false, error: 'No speech detected in audio' },
          { status: 400 }
        );
      }

      // Process results to get full transcript (from Speech to ISL implementation)
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
      
      console.log('Transcription result:', { transcript: finalTranscript, confidence });

      if (!finalTranscript) {
        console.log('Empty transcript received');
        return NextResponse.json(
          { success: false, error: 'No speech detected in the audio' },
          { status: 400 }
        );
      }

      // Translate to all other languages
      console.log(`Transcribed: "${finalTranscript}", translating to all languages...`);
      const translations = await translateTextToMultipleLanguages(finalTranscript);
      
      // Map the translations to the correct language codes
      const languageTranslations = {
        'en-IN': translations.en,
        'hi-IN': translations.hi,
        'mr-IN': translations.mr,
        'gu-IN': translations.gu
      };

      console.log('Translation results:', languageTranslations);

      // Clean up the temporary audio file
      try {
        await unlink(filePath);
        console.log(`Cleaned up temporary audio file: ${audioId}.${fileExtension}`);
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
      console.error('Google Cloud Speech API error:', error);
      
      // Clean up the temporary audio file even on error
      try {
        await unlink(filePath);
        console.log(`Cleaned up temporary audio file after error: ${audioId}.${fileExtension}`);
      } catch (cleanupError) {
        console.log(`Failed to clean up audio file after error: ${cleanupError}`);
      }
      
      throw error;
    }

  } catch (error) {
    console.error('Transcription error:', error);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error during transcription' },
      { status: 500 }
    );
  }
}
