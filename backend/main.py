from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import whisper
import os
import logging
from typing import Optional
import torch
import warnings
from google.cloud import speech

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

class TranscriptionRequest(BaseModel):
    audio_path: str
    language_code: str

class LanguageDetectionResponse(BaseModel):
    success: bool
    detected_language: str
    language_code: str
    confidence: float
    transcript: str
    error: Optional[str] = None

class TranscriptionResponse(BaseModel):
    success: bool
    transcript: str
    confidence: float
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
        
        # Check if CUDA is available
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")
        
        if torch.cuda.is_available():
            logger.info(f"CUDA device: {torch.cuda.get_device_name(0)}")
            logger.info(f"CUDA device count: {torch.cuda.device_count()}")
        else:
            logger.info("CUDA not available, using CPU")
        
        # Use the base model for good balance of speed and accuracy
        # For CPU usage, you could also use "tiny" or "small" for faster processing
        whisper_model = whisper.load_model("base", device=device)
        logger.info(f"Whisper model loaded successfully on {device}")
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
    device_info = {
        "cuda_available": torch.cuda.is_available(),
        "device": "cuda" if torch.cuda.is_available() else "cpu"
    }
    
    if torch.cuda.is_available():
        device_info.update({
            "cuda_device_count": torch.cuda.device_count(),
            "cuda_device_name": torch.cuda.get_device_name(0)
        })
    
    return {
        "status": "healthy",
        "model_loaded": whisper_model is not None,
        "supported_languages": list(LANGUAGE_MAPPING.keys()),
        "device_info": device_info
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

@app.post("/transcribe-speech", response_model=TranscriptionResponse)
async def transcribe_speech(request: TranscriptionRequest):
    """
    Transcribe audio file using Google Cloud Speech-to-Text with specified language
    
    Args:
        request: TranscriptionRequest containing audio path and language code
        
    Returns:
        TranscriptionResponse with transcription results
    """
    try:
        # Check if audio file exists
        if not os.path.exists(request.audio_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {request.audio_path}")
        
        logger.info(f"Transcribing audio file: {request.audio_path} with language: {request.language_code}")
        
        # Initialize Google Cloud Speech client
        client = speech.SpeechClient()
        
        # Read audio file
        with open(request.audio_path, "rb") as f:
            audio_content = f.read()
        
        # Configure audio and recognition settings
        audio = speech.RecognitionAudio(content=audio_content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            sample_rate_hertz=48000,
            language_code=request.language_code,
            enable_automatic_punctuation=True,
            enable_word_time_offsets=True,
            enable_word_confidence=True,
            model='latest_long',
            use_enhanced=True,
        )
        
        # Perform recognition
        response = client.recognize(config=config, audio=audio)
        
        if not response.results:
            logger.warning("No speech detected in audio")
            return TranscriptionResponse(
                success=False,
                transcript="",
                confidence=0.0,
                error="No speech detected in audio"
            )
        
        # Extract transcript and confidence
        transcript_parts = []
        total_confidence = 0.0
        result_count = 0
        
        for result in response.results:
            alternative = result.alternatives[0]
            transcript_parts.append(alternative.transcript)
            total_confidence += alternative.confidence
            result_count += 1
        
        final_transcript = " ".join(transcript_parts).strip()
        average_confidence = total_confidence / result_count if result_count > 0 else 0.0
        
        logger.info(f"Transcription completed. Confidence: {average_confidence:.2f}")
        logger.info(f"Transcript: {final_transcript[:100]}...")
        
        return TranscriptionResponse(
            success=True,
            transcript=final_transcript,
            confidence=average_confidence
        )
        
    except Exception as e:
        logger.error(f"Error transcribing audio: {e}")
        return TranscriptionResponse(
            success=False,
            transcript="",
            confidence=0.0,
            error=str(e)
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
