# Audio Language Detection API

A FastAPI backend service that uses OpenAI's Whisper model to detect the language of audio files and provide transcriptions.

## Features

- **Language Detection**: Automatically detects the language of audio files
- **Speech Transcription**: Provides accurate transcriptions using Whisper
- **Multi-language Support**: Supports English, Hindi, Marathi, and Gujarati
- **RESTful API**: Clean API endpoints for easy integration
- **CORS Enabled**: Ready for frontend integration

## Supported Languages

- **English** (en-IN)
- **हिंदी (Hindi)** (hi-IN)
- **मराठी (Marathi)** (mr-IN)
- **ગુજરાતી (Gujarati)** (gu-IN)

## API Endpoints

### Health Check
- `GET /` - Basic health check
- `GET /health` - Detailed health status

### Language Detection
- `POST /detect-language` - Detect language from audio file
- `POST /transcribe` - Transcribe audio with language detection

## Installation

1. **Create virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the server**:
   ```bash
   ./start.sh
   # or
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

## Usage

### Detect Language

```bash
curl -X POST "http://localhost:8000/detect-language" \
     -H "Content-Type: application/json" \
     -d '{"audio_path": "/path/to/audio/file.webm"}'
```

**Response**:
```json
{
  "success": true,
  "detected_language": "हिंदी (Hindi)",
  "language_code": "hi-IN",
  "confidence": 0.9,
  "transcript": "नमस्ते, मैं ठीक हूं",
  "error": null
}
```

### Transcribe Audio

```bash
curl -X POST "http://localhost:8000/transcribe" \
     -H "Content-Type: application/json" \
     -d '{"audio_path": "/path/to/audio/file.webm"}'
```

## API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Requirements

- Python 3.8+
- FFmpeg (for audio processing)
- Sufficient RAM for Whisper model (base model requires ~1GB)

## Notes

- The Whisper model is loaded on startup and cached in memory
- Audio files should be in common formats (WAV, MP3, WebM, etc.)
- The API automatically detects the best language for transcription
- CORS is enabled for frontend integration
