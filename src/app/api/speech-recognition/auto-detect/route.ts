import { NextRequest, NextResponse } from 'next/server';
import { SpeechClient } from '@google-cloud/speech';
import { join } from 'path';
import { translateTextToMultipleLanguages } from '@/app/actions';

// Set the GOOGLE_APPLICATION_CREDENTIALS environment variable
const credentialsPath = join(process.cwd(), 'config', 'isl.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

// Initialize the Speech client
const speechClient = new SpeechClient();

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
    const { audio, mimeType } = await request.json();

    if (!audio) {
      return NextResponse.json(
        { success: false, error: 'No audio data provided' },
        { status: 400 }
      );
    }

    // Convert base64 audio to buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Try multiple API calls with different primary languages to get the best detection
    const languageConfigs = [
      { primary: 'hi-IN', alternatives: ['en-IN', 'mr-IN', 'gu-IN'] },
      { primary: 'en-IN', alternatives: ['hi-IN', 'mr-IN', 'gu-IN'] },
      { primary: 'mr-IN', alternatives: ['en-IN', 'hi-IN', 'gu-IN'] },
      { primary: 'gu-IN', alternatives: ['en-IN', 'hi-IN', 'mr-IN'] }
    ];

    let bestResponse = null;
    let bestScore = 0;
    let bestLanguage = 'en-IN';

    for (const config of languageConfigs) {
      try {
        const speechRequest = {
          audio: {
            content: audioBuffer,
          },
          config: {
            encoding: 'WEBM_OPUS' as const,
            sampleRateHertz: 48000,
            languageCode: config.primary,
            alternativeLanguageCodes: config.alternatives,
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

        console.log(`Trying with primary language: ${config.primary}`);
        const [response] = await speechClient.recognize(speechRequest);
        
        if (response.results && response.results.length > 0) {
          const result = response.results[0];
          const alternative = result.alternatives?.[0];
          
          if (alternative) {
            const transcript = alternative.transcript;
            const confidence = alternative.confidence || 0;
            const detectedLang = detectLanguageFromTranscript(transcript);
            
            console.log(`Primary: ${config.primary}, Transcript: "${transcript}", Detected: ${detectedLang}, Confidence: ${confidence}`);
            
            // Score based on confidence and language match
            let score = confidence;
            
            // Boost score if detected language matches primary language
            if (detectedLang === config.primary) {
              score += 0.2;
            }
            
            // Boost score for non-English detection
            if (detectedLang !== 'en-IN') {
              score += 0.1;
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestResponse = response;
              bestLanguage = detectedLang;
              console.log(`New best result: ${detectedLang} with score ${score}`);
            }
          }
        }
      } catch (error) {
        console.log(`Error with primary language ${config.primary}:`, error);
      }
    }

    const response = bestResponse;
    
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

