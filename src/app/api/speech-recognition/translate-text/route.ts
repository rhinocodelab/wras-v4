import { NextRequest, NextResponse } from 'next/server';
import { translateTextToMultipleLanguages } from '@/app/actions';

export async function POST(request: NextRequest) {
  try {
    const { text, sourceLanguage, targetLanguages } = await request.json();

    if (!text || !sourceLanguage || !targetLanguages) {
      return NextResponse.json(
        { success: false, error: 'Text, source language, and target languages are required' },
        { status: 400 }
      );
    }

    // Get translations to all target languages
    const translations = await translateTextToMultipleLanguages(text);
    
    // Map the translations to the correct language codes
    const languageTranslations: { [key: string]: string } = {};
    
    targetLanguages.forEach((langCode: string) => {
      const langKey = langCode.split('-')[0]; // Convert 'en-IN' to 'en'
      if (translations[langKey as keyof typeof translations]) {
        languageTranslations[langCode] = translations[langKey as keyof typeof translations];
      }
    });

    return NextResponse.json({
      success: true,
      translations: languageTranslations,
      originalText: text,
      sourceLanguage: sourceLanguage
    });

  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to translate text' },
      { status: 500 }
    );
  }
}