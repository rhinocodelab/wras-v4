/**
 * Translation utilities for handling custom translations and fixing Google Translate API issues
 */

// Custom station name translations to fix Google Translate API issues
export const stationNameMaps: { [key: string]: { [key: string]: string } } = {
    'VAPI': {
        'hi': 'वापी',
        'mr': 'वापी',
        'gu': 'વાપી'
    },
    'Vapi': {
        'hi': 'वापी',
        'mr': 'वापी',
        'gu': 'વાપી'
    },
    'vapi': {
        'hi': 'वापी',
        'mr': 'वापी',
        'gu': 'વાપી'
    },
    'MUMBAI CENTRAL': {
        'hi': 'मुंबई सेंट्रल',
        'mr': 'मुंबई सेंट्रल',
        'gu': 'મુંબઈ સેન્ટ્રલ'
    },
    'Mumbai Central': {
        'hi': 'मुंबई सेंट्रल',
        'mr': 'मुंबई सेंट्रल',
        'gu': 'મુંબઈ સેન્ટ્રલ'
    },
    'NEW DELHI': {
        'hi': 'नई दिल्ली',
        'mr': 'नवी दिल्ली',
        'gu': 'નવી દિલ્હી'
    },
    'New Delhi': {
        'hi': 'नई दिल्ली',
        'mr': 'नवी दिल्ली',
        'gu': 'નવી દિલ્હી'
    },
    'BANDRA': {
        'hi': 'बांद्रा',
        'mr': 'बांद्रा',
        'gu': 'બાંદ્રા'
    },
    'Bandra': {
        'hi': 'बांद्रा',
        'mr': 'बांद्रा',
        'gu': 'બાંદ્રા'
    },
    'H NIZAMUDDIN': {
        'hi': 'एच निजामुद्दीन',
        'mr': 'एच નિઝામુદ્દીન',
        'gu': 'એચ નિઝામુદ્દીન'
    },
    'H Nizamuddin': {
        'hi': 'एच નિઝામુદ્દીન',
        'mr': 'एच નિઝામુદ્દીન',
        'gu': 'એચ નિઝામુદ્દીન'
    },
    'SURAT': {
        'hi': 'सूरत',
        'mr': 'सूरत',
        'gu': 'સુરત'
    },
    'Surat': {
        'hi': 'सूरत',
        'mr': 'सूरत',
        'gu': 'સુરત'
    },
    'AHMEDABAD': {
        'hi': 'अहमदाबाद',
        'mr': 'अहमदाबाद',
        'gu': 'અમદાવાદ'
    },
    'Ahmedabad': {
        'hi': 'अहमदाबाद',
        'mr': 'अहमदाबाद',
        'gu': 'અમદાવાદ'
    },
    'VADODARA': {
        'hi': 'वडोदरा',
        'mr': 'वडोदरा',
        'gu': 'વડોદરા'
    },
    'Vadodara': {
        'hi': 'वडोदरा',
        'mr': 'वडोदरा',
        'gu': 'વડોદરા'
    },
    'ANAND': {
        'hi': 'आनंद',
        'mr': 'आनंद',
        'gu': 'આનંદ'
    },
    'Anand': {
        'hi': 'आनंद',
        'mr': 'आनंद',
        'gu': 'આનંદ'
    },
    'NADIAD': {
        'hi': 'नाडियाद',
        'mr': 'नाडियाद',
        'gu': 'નડિયાદ'
    },
    'Nadiad': {
        'hi': 'नाडियाद',
        'mr': 'नाडियाद',
        'gu': 'નડિયાદ'
    },
    'BHARUCH': {
        'hi': 'भरूच',
        'mr': 'भरूच',
        'gu': 'ભરૂચ'
    },
    'Bharuch': {
        'hi': 'भरूच',
        'mr': 'भरूच',
        'gu': 'ભરૂચ'
    },
    'NAVSARI': {
        'hi': 'नवसारी',
        'mr': 'नवसारी',
        'gu': 'નવસારી'
    },
    'Navsari': {
        'hi': 'नवसारी',
        'mr': 'नवसारी',
        'gu': 'નવસારી'
    },
    'BILIMORA': {
        'hi': 'बिलीमोरा',
        'mr': 'बिलीमोरा',
        'gu': 'બિલીમોરા'
    },
    'Bilimora': {
        'hi': 'बिलीमोरा',
        'mr': 'बिलीमोरा',
        'gu': 'બિલીમોરા'
    },
    'CHHATRAPATI SHIVAJI MAHARAJ TERMINUS': {
        'hi': 'छत्रपति शिवाजी महाराज टर्मिनस',
        'mr': 'छत्रपती शिवाजी महाराज टर्मिनस',
        'gu': 'છત્રપતિ શિવાજી મહારાજ ટર્મિનસ'
    },
    'Chhatrapati Shivaji Maharaj Terminus': {
        'hi': 'छत्रपति शिवाजी महाराज टर्मिनस',
        'mr': 'छत्रपती शिवाजी महाराज टर्मिनस',
        'gu': 'છત્રપતિ શિવાજી મહારાજ ટર્મિનસ'
    },
    'CSMT': {
        'hi': 'छत्रपति शिवाजी महाराज टर्मिनस',
        'mr': 'छत्रपती शिवाजी महाराज टर्मिनस',
        'gu': 'છત્રપતિ શિવાજી મહારાજ ટર્મિનસ'
    },
    'csmt': {
        'hi': 'छत्रपति शिवाजी महाराज टर्मिनस',
        'mr': 'छत्रपती शिवाजी महाराज टर्मिनस',
        'gu': 'છત્રપતિ શિવાજી મહારાજ ટર્મિનસ'
    }
};

/**
 * Get custom translation for station names if available
 * @param text - The text to translate
 * @param languageCode - The target language code
 * @returns Custom translation if available, null otherwise
 */
export function getCustomStationTranslation(text: string, languageCode: string): string | null {
    const upperText = text.toUpperCase();
    if (stationNameMaps[upperText] && stationNameMaps[upperText][languageCode]) {
        return stationNameMaps[upperText][languageCode];
    }
    return null;
}

/**
 * Check if a text has a custom translation available
 * @param text - The text to check
 * @returns True if custom translation is available
 */
export function hasCustomStationTranslation(text: string): boolean {
    const upperText = text.toUpperCase();
    return !!stationNameMaps[upperText];
}

/**
 * Get all available custom translations for a given text
 * @param text - The text to get translations for
 * @returns Object with language codes as keys and translations as values
 */
export function getAllCustomStationTranslations(text: string): { [key: string]: string } | null {
    const upperText = text.toUpperCase();
    return stationNameMaps[upperText] || null;
} 