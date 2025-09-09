import { NextRequest, NextResponse } from 'next/server';
import { SpeechClient } from '@google-cloud/speech';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { translateTextToMultipleLanguages } from '@/app/actions';
import { detectAudioLanguage } from '@/ai/speech-language-detection';

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

// Reverse mapping for Gemini language detection
const LANGUAGE_NAME_TO_CODE = {
  'english': 'en-IN',
  'hindi': 'hi-IN',
  'marathi': 'mr-IN',
  'gujarati': 'gu-IN',
  'en': 'en-IN',
  'hi': 'hi-IN',
  'mr': 'mr-IN',
  'gu': 'gu-IN'
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
      
      // First, transcribe with English as default to get initial text for Gemini analysis
      const initialSpeechRequest = {
        audio: {
          content: audioBuffer,
        },
        config: {
          encoding: encoding as any,
          sampleRateHertz: sampleRateHertz,
          languageCode: 'en-IN', // Start with English
          alternativeLanguageCodes: SUPPORTED_LANGUAGES.filter(lang => lang !== 'en-IN'),
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

      console.log('Initial transcription with English for Gemini language detection');
      console.log('Speech request config:', {
        encoding: initialSpeechRequest.config.encoding,
        sampleRateHertz: initialSpeechRequest.config.sampleRateHertz,
        languageCode: initialSpeechRequest.config.languageCode,
        alternativeLanguageCodes: initialSpeechRequest.config.alternativeLanguageCodes
      });

      const [initialResponse] = await speechClient.recognize(initialSpeechRequest);
      console.log('Initial Google Cloud Speech API response:', initialResponse);

      if (!initialResponse.results || initialResponse.results.length === 0) {
        console.log('No speech detected in audio');
        return NextResponse.json(
          { success: false, error: 'No speech detected in audio' },
          { status: 400 }
        );
      }

      // Get initial transcript for Gemini language detection
      let initialTranscript = '';
      let initialConfidence = 0;
      
      for (const result of initialResponse.results) {
        const alternative = result.alternatives?.[0];
        if (!alternative) continue;
        
        const transcript = alternative.transcript;
        initialTranscript += transcript + ' ';
        
        if (alternative.confidence > initialConfidence) {
          initialConfidence = alternative.confidence;
        }
      }
      
      const initialText = initialTranscript.trim();
      
      if (!initialText) {
        console.log('Empty initial transcript received');
        return NextResponse.json(
          { success: false, error: 'No speech detected in the audio' },
          { status: 400 }
        );
      }

      console.log('Initial transcript for Gemini analysis:', initialText);

      // Use Gemini to detect the language from the transcribed text
      let detectedLanguageCode = 'en-IN'; // Default fallback
      let detectedLanguageName = 'English';
      
      try {
        // Convert audio to base64 for Gemini
        const audioBase64 = audioBuffer.toString('base64');
        const dataUri = `data:audio/${fileExtension};base64,${audioBase64}`;
        
        console.log('Using Gemini to detect language from audio...');
        const geminiResult = await detectAudioLanguage({ audioDataUri: dataUri });
        const detectedLanguage = geminiResult.language.toLowerCase();
        
        console.log('Gemini detected language:', detectedLanguage);
        
        // Map Gemini's language detection to our language codes
        detectedLanguageCode = LANGUAGE_NAME_TO_CODE[detectedLanguage] || 'en-IN';
        detectedLanguageName = LANGUAGE_MAPPING[detectedLanguageCode] || 'English';
        
        console.log('Mapped to language code:', detectedLanguageCode, 'Name:', detectedLanguageName);
      } catch (error) {
        console.error('Gemini language detection error:', error);
        // Fallback to English if Gemini fails
        detectedLanguageCode = 'en-IN';
        detectedLanguageName = 'English';
      }

      // If the detected language is different from English, re-transcribe with the correct language
      let finalTranscript = initialText;
      let finalConfidence = initialConfidence;
      
      if (detectedLanguageCode !== 'en-IN') {
        console.log(`Re-transcribing with detected language: ${detectedLanguageCode}`);
        
        const finalSpeechRequest = {
          audio: {
            content: audioBuffer,
          },
          config: {
            encoding: encoding as any,
            sampleRateHertz: sampleRateHertz,
            languageCode: detectedLanguageCode,
            alternativeLanguageCodes: SUPPORTED_LANGUAGES.filter(lang => lang !== detectedLanguageCode),
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

        const [finalResponse] = await speechClient.recognize(finalSpeechRequest);
        
        if (finalResponse.results && finalResponse.results.length > 0) {
          let reTranscribedText = '';
          let reTranscribedConfidence = 0;
          
          for (const result of finalResponse.results) {
            const alternative = result.alternatives?.[0];
            if (!alternative) continue;
            
            const transcript = alternative.transcript;
            reTranscribedText += transcript + ' ';
            
            if (alternative.confidence > reTranscribedConfidence) {
              reTranscribedConfidence = alternative.confidence;
            }
          }
          
          const reTranscribedFinal = reTranscribedText.trim();
          if (reTranscribedFinal) {
            finalTranscript = reTranscribedFinal;
            finalConfidence = reTranscribedConfidence;
            console.log('Re-transcribed text:', finalTranscript);
          }
        }
      }

      // Translate to English if not already English
      let englishTranslation = finalTranscript;
      
      if (detectedLanguageCode !== 'en-IN') {
        try {
          console.log(`Translating from ${detectedLanguageName} to English...`);
          const translations = await translateTextToMultipleLanguages(finalTranscript);
          englishTranslation = translations.en || finalTranscript;
          console.log('English translation:', englishTranslation);
        } catch (error) {
          console.error('Translation error:', error);
          englishTranslation = finalTranscript;
        }
      }

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
        detectedLanguage: detectedLanguageCode,
        detectedLanguageName: detectedLanguageName,
        confidence: finalConfidence,
        englishTranslation: englishTranslation,
        originalText: finalTranscript
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
