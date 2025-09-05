from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import whisper
import os
import logging
from typing import Optional
import torch
import warnings

# Suppress Whisper FP16 warning for CPU usage
warnings.filterwarnings("ignore", message="FP16 is not supported on CPU; using FP32 instead")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Audio Language Detection API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variable to store the Whisper model
whisper_model = None

class AudioPathRequest(BaseModel):
    audio_path: str

class LanguageDetectionResponse(BaseModel):
    success: bool
    detected_language: str
    language_code: str
    confidence: float
    transcript: str
    error: Optional[str] = None

# Language mapping from Whisper language codes to our system
LANGUAGE_MAPPING = {
    'en': {'name': 'English', 'code': 'en-IN'},
    'hi': {'name': 'हिंदी (Hindi)', 'code': 'hi-IN'},
    'mr': {'name': 'मराठी (Marathi)', 'code': 'mr-IN'},
    'gu': {'name': 'ગુજરાતી (Gujarati)', 'code': 'gu-IN'},
}

def load_whisper_model():
    """Load the Whisper model on startup"""
    global whisper_model
    try:
        logger.info("Loading Whisper model...")
        # Use the base model for good balance of speed and accuracy
        # For CPU usage, you could also use "tiny" or "small" for faster processing
        whisper_model = whisper.load_model("base")
        logger.info("Whisper model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load Whisper model: {e}")
        raise e

@app.on_event("startup")
async def startup_event():
    """Load the Whisper model when the application starts"""
    load_whisper_model()

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Audio Language Detection API is running", "status": "healthy"}

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "model_loaded": whisper_model is not None,
        "supported_languages": list(LANGUAGE_MAPPING.keys())
    }

@app.post("/detect-language", response_model=LanguageDetectionResponse)
async def detect_language(request: AudioPathRequest):
    """
    Detect the language of an audio file using Whisper (language detection only)
    
    Args:
        request: AudioPathRequest containing the path to the audio file
        
    Returns:
        LanguageDetectionResponse with detected language information only
    """
    try:
        # Check if model is loaded
        if whisper_model is None:
            raise HTTPException(status_code=500, detail="Whisper model not loaded")
        
        # Check if audio file exists
        if not os.path.exists(request.audio_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {request.audio_path}")
        
        logger.info(f"Detecting language for audio file: {request.audio_path}")
        
        # Use Whisper only for language detection (no transcription)
        result = whisper_model.transcribe(
            request.audio_path,
            language=None,  # Let Whisper auto-detect the language
            task="transcribe"
        )
        
        # Extract language information
        detected_lang_code = result.get("language", "en")
        detected_lang_info = LANGUAGE_MAPPING.get(detected_lang_code, {
            'name': f'Unknown ({detected_lang_code})',
            'code': 'en-IN'
        })
        
        # Calculate confidence based on language detection
        confidence = 0.9 if detected_lang_code in LANGUAGE_MAPPING else 0.7
        
        logger.info(f"Detected language: {detected_lang_info['name']} ({detected_lang_code})")
        
        return LanguageDetectionResponse(
            success=True,
            detected_language=detected_lang_info['name'],
            language_code=detected_lang_info['code'],
            confidence=confidence,
            transcript=""  # No transcript returned, only language detection
        )
        
    except Exception as e:
        logger.error(f"Error detecting language: {e}")
        return LanguageDetectionResponse(
            success=False,
            detected_language="",
            language_code="en-IN",
            confidence=0.0,
            transcript="",
            error=str(e)
        )

@app.post("/transcribe", response_model=LanguageDetectionResponse)
async def transcribe_audio(request: AudioPathRequest):
    """
    Transcribe audio with a specific language (if known)
    
    Args:
        request: AudioPathRequest containing the path to the audio file
        
    Returns:
        LanguageDetectionResponse with transcription and language info
    """
    try:
        # Check if model is loaded
        if whisper_model is None:
            raise HTTPException(status_code=500, detail="Whisper model not loaded")
        
        # Check if audio file exists
        if not os.path.exists(request.audio_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {request.audio_path}")
        
        logger.info(f"Transcribing audio file: {request.audio_path}")
        
        # First detect the language
        detect_result = whisper_model.transcribe(
            request.audio_path,
            language=None,
            task="transcribe"
        )
        
        detected_lang_code = detect_result.get("language", "en")
        detected_lang_info = LANGUAGE_MAPPING.get(detected_lang_code, {
            'name': f'Unknown ({detected_lang_code})',
            'code': 'en-IN'
        })
        
        # Now transcribe with the detected language for better accuracy
        transcribe_result = whisper_model.transcribe(
            request.audio_path,
            language=detected_lang_code,
            task="transcribe"
        )
        
        transcript = transcribe_result.get("text", "").strip()
        confidence = 0.95 if transcript and detected_lang_code in LANGUAGE_MAPPING else 0.8
        
        logger.info(f"Transcribed with language: {detected_lang_info['name']}")
        logger.info(f"Transcript: {transcript[:100]}...")
        
        return LanguageDetectionResponse(
            success=True,
            detected_language=detected_lang_info['name'],
            language_code=detected_lang_info['code'],
            confidence=confidence,
            transcript=transcript
        )
        
    except Exception as e:
        logger.error(f"Error transcribing audio file: {e}")
        return LanguageDetectionResponse(
            success=False,
            detected_language="",
            language_code="en-IN",
            confidence=0.0,
            transcript="",
            error=str(e)
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
