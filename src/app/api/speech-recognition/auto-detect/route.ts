import { NextRequest, NextResponse } from 'next/server';
import { SpeechClient } from '@google-cloud/speech';
import { join } from 'path';
import { translateTextToMultipleLanguages } from '@/app/actions';

// Set the GOOGLE_APPLICATION_CREDENTIALS environment variable
const credentialsPath = join(process.cwd(), 'config', 'isl.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

console.log('Setting GOOGLE_APPLICATION_CREDENTIALS to:', credentialsPath);
console.log('Credentials file exists:', require('fs').existsSync(credentialsPath));

// Initialize the Speech client with explicit credentials
const speechClient = new SpeechClient({
  keyFilename: credentialsPath,
  projectId: 'aipower-467603'
});

// Supported languages for automatic detection
const SUPPORTED_LANGUAGES = ['en-IN', 'hi-IN', 'mr-IN', 'gu-IN'];

// Language mapping for translation
const LANGUAGE_MAPPING = {
  'en-IN': 'en',
  'hi-IN': 'hi', 
  'mr-IN': 'mr',
  'gu-IN': 'gu'
};

export async function POST(request: NextRequest) {
  try {
    console.log('Auto-detect API called');
    console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    
    const { audio, mimeType } = await request.json();

    if (!audio) {
      return NextResponse.json(
        { success: false, error: 'No audio data provided' },
        { status: 400 }
      );
    }

    // Convert base64 audio to buffer
    const audioBuffer = Buffer.from(audio, 'base64');
    
    // Validate audio buffer
    if (audioBuffer.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Audio data is empty or invalid' },
        { status: 400 }
      );
    }
    
    console.log('Audio buffer size:', audioBuffer.length, 'bytes');
    
    // Additional audio validation
    if (audioBuffer.length < 1000) {
      console.warn(`Audio buffer is very small: ${audioBuffer.length} bytes. This might indicate a problem with the audio file.`);
    }

    // Determine encoding and sample rate based on mimeType and audio file analysis
    let encoding: string;
    let sampleRateHertz: number;

    if (mimeType.includes('webm') || mimeType.includes('opus')) {
      encoding = 'WEBM_OPUS';
      sampleRateHertz = 48000;
    } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      encoding = 'MP3';
      sampleRateHertz = 44100;
    } else if (mimeType.includes('wav')) {
      encoding = 'LINEAR16';
      // For WAV files, try to read the sample rate from the header
      try {
        // WAV header format: bytes 24-27 contain sample rate
        if (audioBuffer.length >= 28) {
          const sampleRate = audioBuffer.readUInt32LE(24);
          console.log(`WAV file sample rate from header: ${sampleRate}`);
          
          // Validate the sample rate (common values: 8000, 11025, 16000, 22050, 44100, 48000)
          const commonSampleRates = [8000, 11025, 16000, 22050, 44100, 48000];
          if (commonSampleRates.includes(sampleRate)) {
            sampleRateHertz = sampleRate;
          } else {
            console.warn(`Unusual sample rate detected: ${sampleRate}, using 44100 as fallback`);
            sampleRateHertz = 44100;
          }
        } else {
          sampleRateHertz = 44100; // Default fallback
        }
      } catch (error) {
        console.warn('Could not read WAV header, using default sample rate:', error);
        sampleRateHertz = 44100;
      }
    } else if (mimeType.includes('aac') || mimeType.includes('m4a')) {
      // AAC/M4A files - try MP3 encoding as fallback since AAC might not be directly supported
      encoding = 'MP3'; // Use MP3 encoding as AAC is often compatible
      sampleRateHertz = 44100;
      console.log('AAC/M4A file detected, using MP3 encoding as fallback');
    } else if (mimeType.includes('flac')) {
      encoding = 'FLAC';
      sampleRateHertz = 44100;
      console.log('FLAC file detected');
    } else if (mimeType.includes('ogg')) {
      encoding = 'OGG_OPUS';
      sampleRateHertz = 48000;
      console.log('OGG file detected');
    } else {
      // Default fallback - omit encoding for auto-detection
      encoding = null; // Will omit encoding field entirely
      sampleRateHertz = 44100;
      console.log(`Unknown audio format: ${mimeType}, omitting encoding for auto-detection`);
    }

    console.log(`Detected audio format: ${mimeType}, using encoding: ${encoding}, sample rate: ${sampleRateHertz}`);
    console.log(`Audio buffer length: ${audioBuffer.length} bytes`);
    console.log(`Audio duration estimate: ${(audioBuffer.length / (sampleRateHertz * 2)).toFixed(2)} seconds (assuming 16-bit mono)`);

    // Get the detected language from the frontend
    const detectedLanguageFromFrontend = request.headers.get('x-detected-language');
    console.log('Detected language from frontend:', detectedLanguageFromFrontend);

    // Map language names to language codes
    const LANGUAGE_NAME_TO_CODE = {
      'english': 'en-IN',
      'hindi': 'hi-IN',
      'marathi': 'mr-IN',
      'gujarati': 'gu-IN',
      'bengali': 'bn-IN',
      'tamil': 'ta-IN',
      'telugu': 'te-IN',
      'kannada': 'kn-IN',
      'malayalam': 'ml-IN',
      'punjabi': 'pa-IN',
      'urdu': 'ur-IN'
    };

    const detectedLanguageCode = detectedLanguageFromFrontend ? 
      LANGUAGE_NAME_TO_CODE[detectedLanguageFromFrontend] || 'en-IN' : 'en-IN';

    console.log('Using language code for transcription:', detectedLanguageCode);

    // Use ONLY the detected language for transcription
    let bestResponse = null;
    let bestLanguage = detectedLanguageCode;
    let hasAnySuccess = false;

    try {
      const speechRequest: any = {
        audio: {
          content: audioBuffer,
        },
        config: {
          languageCode: detectedLanguageCode, // Use ONLY the detected language
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
          // Use default model for Indian languages (latest_long not supported for gu-IN)
          useEnhanced: true,
          diarizationConfig: {
            enableSpeakerDiarization: false,
          },
        },
      };

      // Add encoding only if specified, otherwise let API auto-detect
      if (encoding !== null) {
        speechRequest.config.encoding = encoding;
      }
      // Always add sampleRateHertz as it's required by the API
      speechRequest.config.sampleRateHertz = sampleRateHertz;

      console.log('Calling Google Cloud Speech API with detected language:', {
        encoding: speechRequest.config.encoding,
        sampleRateHertz: speechRequest.config.sampleRateHertz,
        languageCode: speechRequest.config.languageCode,
        detectedLanguage: detectedLanguageFromFrontend
      });
      console.log('Full speech request config:', JSON.stringify(speechRequest.config, null, 2));
      
      const [response] = await speechClient.recognize(speechRequest);
      console.log('Speech API response received for detected language');
        
      if (response.results && response.results.length > 0) {
        const result = response.results[0];
        const alternative = result.alternatives?.[0];
        
        if (alternative && alternative.transcript.trim()) {
          console.log(`Successfully transcribed in ${detectedLanguageCode}: "${alternative.transcript}"`);
          bestResponse = response;
          bestLanguage = detectedLanguageCode;
          hasAnySuccess = true;
        }
      }
    } catch (error) {
      console.log(`Error with detected language ${detectedLanguageCode}:`, error);
      console.log('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      
      // If the detected language is not supported, try English as fallback
      if (detectedLanguageCode !== 'en-IN' && error.message.includes('not supported')) {
        console.log(`Detected language ${detectedLanguageCode} not supported, trying English fallback...`);
        try {
          const englishRequest: any = {
            audio: {
              content: audioBuffer,
            },
            config: {
              languageCode: 'en-IN',
              enableAutomaticPunctuation: true,
              enableWordTimeOffsets: true,
              enableWordConfidence: true,
              useEnhanced: true,
              diarizationConfig: {
                enableSpeakerDiarization: false,
              },
            },
          };

          // Add encoding only if specified, otherwise let API auto-detect
          if (encoding !== null) {
            englishRequest.config.encoding = encoding;
          }
          // Always add sampleRateHertz as it's required by the API
          englishRequest.config.sampleRateHertz = sampleRateHertz;

          console.log('Trying English fallback for unsupported language');
          const [englishResponse] = await speechClient.recognize(englishRequest);
          
          if (englishResponse.results && englishResponse.results.length > 0) {
            const result = englishResponse.results[0];
            const alternative = result.alternatives?.[0];
            
            if (alternative && alternative.transcript.trim()) {
              console.log(`English fallback succeeded: "${alternative.transcript}"`);
              bestResponse = englishResponse;
              bestLanguage = 'en-IN'; // Mark as English since we used English API
              hasAnySuccess = true;
            }
          }
        } catch (englishError) {
          console.log('English fallback also failed:', englishError);
        }
      }
    }

    // If the detected language failed, try multiple fallback approaches
    if (!hasAnySuccess) {
      console.log('Detected language transcription failed, trying multiple fallback approaches...');
      
      // Try 1: Simple fallback with detected language
      try {
        const simpleRequest: any = {
          audio: {
            content: audioBuffer,
          },
          config: {
            languageCode: detectedLanguageCode,
            enableAutomaticPunctuation: true,
          },
        };

        // Add encoding only if specified, otherwise let API auto-detect
        if (encoding !== null) {
          simpleRequest.config.encoding = encoding;
        }
        // Always add sampleRateHertz as it's required by the API
        simpleRequest.config.sampleRateHertz = sampleRateHertz;

        console.log('Trying simple fallback configuration with detected language:', {
          encoding: simpleRequest.config.encoding,
          sampleRateHertz: simpleRequest.config.sampleRateHertz,
          languageCode: simpleRequest.config.languageCode,
          detectedLanguage: detectedLanguageCode
        });

        const [fallbackResponse] = await speechClient.recognize(simpleRequest);
        
        if (fallbackResponse.results && fallbackResponse.results.length > 0) {
          console.log('Simple fallback succeeded with detected language');
          bestResponse = fallbackResponse;
          bestLanguage = detectedLanguageCode;
          hasAnySuccess = true;
        }
      } catch (fallbackError) {
        console.log('Simple fallback also failed:', fallbackError);
      }

      // Try 2: English fallback if detected language is not English
      if (!hasAnySuccess && detectedLanguageCode !== 'en-IN') {
        try {
          console.log('Trying English fallback for better compatibility...');
          const englishRequest: any = {
            audio: {
              content: audioBuffer,
            },
            config: {
              languageCode: 'en-IN',
              enableAutomaticPunctuation: true,
            },
          };

          // Add encoding only if specified, otherwise let API auto-detect
          if (encoding !== null) {
            englishRequest.config.encoding = encoding;
          }
          // Always add sampleRateHertz as it's required by the API
          englishRequest.config.sampleRateHertz = sampleRateHertz;

          console.log('Trying English fallback configuration:', {
            encoding: englishRequest.config.encoding,
            sampleRateHertz: englishRequest.config.sampleRateHertz,
            languageCode: englishRequest.config.languageCode
          });

          const [englishFallbackResponse] = await speechClient.recognize(englishRequest);
          
          if (englishFallbackResponse.results && englishFallbackResponse.results.length > 0) {
            console.log('English fallback succeeded');
            bestResponse = englishFallbackResponse;
            bestLanguage = 'en-IN';
            hasAnySuccess = true;
          }
        } catch (englishFallbackError) {
          console.log('English fallback also failed:', englishFallbackError);
        }
      }

      // Try 3: Minimal configuration (no encoding, no sample rate)
      if (!hasAnySuccess) {
        try {
          console.log('Trying minimal configuration (no encoding/sample rate)...');
          const minimalRequest: any = {
            audio: {
              content: audioBuffer,
            },
            config: {
              languageCode: detectedLanguageCode,
            },
          };

          console.log('Trying minimal configuration:', {
            languageCode: minimalRequest.config.languageCode,
            noEncoding: true,
            noSampleRate: true
          });

          const [minimalResponse] = await speechClient.recognize(minimalRequest);
          
          if (minimalResponse.results && minimalResponse.results.length > 0) {
            console.log('Minimal configuration succeeded');
            bestResponse = minimalResponse;
            bestLanguage = detectedLanguageCode;
            hasAnySuccess = true;
          }
        } catch (minimalError) {
          console.log('Minimal configuration also failed:', minimalError);
        }
      }

      // Try 4: Try with different encodings for AAC files
      if (!hasAnySuccess && (mimeType.includes('aac') || mimeType.includes('m4a'))) {
        const aacEncodings = ['FLAC', 'LINEAR16'];
        for (const aacEncoding of aacEncodings) {
          try {
            console.log(`Trying AAC with ${aacEncoding} encoding...`);
            const aacRequest: any = {
              audio: {
                content: audioBuffer,
              },
              config: {
                languageCode: detectedLanguageCode,
                encoding: aacEncoding,
                sampleRateHertz: 44100,
                enableAutomaticPunctuation: true,
              },
            };

            console.log(`Trying AAC with ${aacEncoding}:`, {
              encoding: aacRequest.config.encoding,
              sampleRateHertz: aacRequest.config.sampleRateHertz,
              languageCode: aacRequest.config.languageCode
            });

            const [aacResponse] = await speechClient.recognize(aacRequest);
            
            if (aacResponse.results && aacResponse.results.length > 0) {
              console.log(`AAC with ${aacEncoding} encoding succeeded`);
              bestResponse = aacResponse;
              bestLanguage = detectedLanguageCode;
              hasAnySuccess = true;
              break;
            }
          } catch (aacError) {
            console.log(`AAC with ${aacEncoding} encoding failed:`, aacError.message);
          }
        }
      }
    }

    const response = bestResponse;
    
    if (!hasAnySuccess || !response || !response.results || response.results.length === 0) {
      console.error('Speech recognition failed for all language configurations');
      console.error('Audio buffer length:', audioBuffer.length);
      console.error('Audio format:', mimeType);
      console.error('Encoding:', encoding);
      console.error('Sample rate:', sampleRateHertz);
      
      return NextResponse.json(
        { 
          success: false, 
          error: 'No speech detected in the audio. Please check: 1) Audio file is not corrupted, 2) Audio contains clear speech, 3) Audio format is supported (MP3, WAV, AAC)',
          debug: {
            audioLength: audioBuffer.length,
            mimeType: mimeType,
            encoding: encoding,
            sampleRate: sampleRateHertz
          }
        },
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
      
      // Log for debugging
      console.log(`Segment transcript: "${transcript}"`);
      console.log(`Confidence: ${alternative.confidence}`);
    }
    
    // Use the best language we determined from the multiple API calls
    const detectedLanguage = bestLanguage;
    
    const finalTranscript = fullTranscript.trim();
    
    if (!finalTranscript) {
      return NextResponse.json(
        { success: false, error: 'No speech detected in the audio' },
        { status: 400 }
      );
    }
    
    // Get translations to all other languages
    console.log(`Detected language: ${detectedLanguage}, translating to other languages...`);
    const translations = await translateTextToMultipleLanguages(finalTranscript);
    
    // Map the translations to the correct language codes
    const languageTranslations = {
      'en-IN': translations.en,
      'hi-IN': translations.hi,
      'mr-IN': translations.mr,
      'gu-IN': translations.gu
    };

    return NextResponse.json({
      success: true,
      transcript: finalTranscript,
      detectedLanguage: detectedLanguage,
      confidence: confidence,
      translations: languageTranslations,
      originalText: languageTranslations[detectedLanguage] || finalTranscript
    });

  } catch (error) {
    console.error('Speech recognition error:', error);
    
    // Handle specific Google Cloud Speech API errors
    if (error instanceof Error) {
      if (error.message.includes('INVALID_ARGUMENT')) {
        return NextResponse.json(
          { success: false, error: 'Invalid audio format or configuration' },
          { status: 400 }
        );
      } else if (error.message.includes('PERMISSION_DENIED')) {
        return NextResponse.json(
          { success: false, error: 'Speech API permission denied. Please check your credentials.' },
          { status: 500 }
        );
      } else if (error.message.includes('QUOTA_EXCEEDED')) {
        return NextResponse.json(
          { success: false, error: 'Speech API quota exceeded. Please try again later.' },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error during speech recognition' },
      { status: 500 }
    );
  }
}

// Enhanced function to detect language from transcript characteristics
function detectLanguageFromTranscript(transcript: string): string {
  const text = transcript.toLowerCase().trim();
  
  // If empty or very short, default to English
  if (!text || text.length < 2) {
    return 'en-IN';
  }
  
  console.log(`Analyzing transcript for language detection: "${text}"`);
  
  // Hindi detection (Devanagari script) - PRIORITY 1
  if (/[\u0900-\u097F]/.test(text)) {
    console.log('Devanagari script detected');
    
    // Check for Marathi-specific words first
    const marathiWords = ['आहे', 'मी', 'तुम्ही', 'मराठी', 'महाराष्ट्र', 'काय', 'कसे', 'कुठे', 'कोण', 'केव्हा', 'मला', 'तुला', 'त्याला'];
    const hasMarathiWords = marathiWords.some(word => text.includes(word));
    
    if (hasMarathiWords) {
      console.log('Marathi words detected, returning mr-IN');
      return 'mr-IN';
    }
    
    // If Devanagari script but no Marathi words, assume Hindi
    console.log('Devanagari script with no Marathi words, returning hi-IN');
    return 'hi-IN';
  }
  
  // Gujarati detection (Gujarati script) - PRIORITY 2
  if (/[\u0A80-\u0AFF]/.test(text)) {
    console.log('Gujarati script detected, returning gu-IN');
    return 'gu-IN';
  }
  
  // Check for common Hindi/Indian words in English script (code-mixing) - PRIORITY 3
  const hindiWordsInEnglish = [
    'namaste', 'namaskar', 'dhanyawad', 'shukriya', 'aap', 'tum', 'main', 'hum',
    'kya', 'kaise', 'kahan', 'kab', 'kyun', 'achha', 'theek', 'bilkul', 'zaroor',
    'hindi', 'hindustani', 'bharat', 'india', 'desh', 'log', 'ghar', 'paani',
    'hai', 'ho', 'hain', 'tha', 'thi', 'the', 'raha', 'rahi', 'rahe',
    'mein', 'tumhare', 'aapke', 'mere', 'hamare', 'unke', 'uske'
  ];
  
  const hasHindiWords = hindiWordsInEnglish.some(word => text.includes(word));
  if (hasHindiWords) {
    console.log('Hindi words in English script detected, returning hi-IN');
    return 'hi-IN';
  }
  
  // Check for Marathi words in English script - PRIORITY 4
  const marathiWordsInEnglish = [
    'mala', 'tula', 'tyala', 'majha', 'tujha', 'tyacha', 'ahe', 'ahet', 'hoti', 'hote',
    'marathi', 'maharashtra', 'pune', 'mumbai', 'nagpur', 'kolhapur', 'sangli',
    'kay', 'kase', 'kuthe', 'kon', 'kevha', 'mala', 'tula', 'tyala'
  ];
  
  const hasMarathiWords = marathiWordsInEnglish.some(word => text.includes(word));
  if (hasMarathiWords) {
    console.log('Marathi words in English script detected, returning mr-IN');
    return 'mr-IN';
  }
  
  // Check for Gujarati words in English script - PRIORITY 5
  const gujaratiWordsInEnglish = [
    'kem', 'kayu', 'chho', 'chhe', 'gujarati', 'gujarat', 'ahmedabad', 'surat', 'vadodara',
    'rajkot', 'bhavnagar', 'jamnagar', 'gandhinagar', 'me', 'tame', 'apne',
    'chhu', 'chhe', 'chho', 'kem', 'kayu', 'kay', 'kase'
  ];
  
  const hasGujaratiWords = gujaratiWordsInEnglish.some(word => text.includes(word));
  if (hasGujaratiWords) {
    console.log('Gujarati words in English script detected, returning gu-IN');
    return 'gu-IN';
  }
  
  // Check for common English words to confirm it's actually English - PRIORITY 6
  const commonEnglishWords = [
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall',
    'hello', 'hi', 'good', 'bad', 'yes', 'no', 'please', 'thank', 'you', 'me', 'my', 'your'
  ];
  
  const hasEnglishWords = commonEnglishWords.some(word => text.includes(word));
  if (hasEnglishWords) {
    console.log('English words detected, returning en-IN');
    return 'en-IN';
  }
  
  // If no clear indicators, but contains typical Indian pronunciation patterns, assume Hindi
  const indianPatterns = [
    'ji', 'sir', 'madam', 'bhai', 'didi', 'bhaiya', 'didi', 'uncle', 'aunty'
  ];
  
  const hasIndianPatterns = indianPatterns.some(pattern => text.includes(pattern));
  if (hasIndianPatterns) {
    console.log('Indian patterns detected, defaulting to hi-IN');
    return 'hi-IN';
  }
  
  // Default to English if no other indicators found
  console.log('No clear language indicators, defaulting to en-IN');
  return 'en-IN';
}

