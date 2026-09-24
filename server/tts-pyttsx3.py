#!/usr/bin/env python3
"""
TTS lokal menggunakan pyttsx3 (engine TTS offline Python)

Usage:
  python3 tts-pyttsx3.py "text to speak" "/path/to/output.wav" "id"

Install:
  pip install pyttsx3
"""

import sys
import os

def generate_tts(text, output_path, lang='id'):
    """Generate audio file from text using pyttsx3"""
    try:
        import pyttsx3
    except ImportError:
        print("Error: pyttsx3 not installed. Run: pip install pyttsx3", file=sys.stderr)
        sys.exit(1)
    
    try:
        engine = pyttsx3.init()
        
        # Set voice properties
        engine.setProperty('rate', 120)  # speech rate
        engine.setProperty('volume', 1.0)  # volume 0-1
        
        # Try to set Indonesian voice (fallback to default if not available)
        voices = engine.getProperty('voices')
        id_voice = None
        for voice in voices:
            # Look for Indonesian language voice
            if 'id' in voice.languages or 'indo' in voice.name.lower():
                id_voice = voice.id
                break
        
        if id_voice:
            engine.setProperty('voice', id_voice)
        
        # Create output directory if needed
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Save to file
        engine.save_to_file(text, output_path)
        engine.runAndWait()
        
        # Check if file was created and has content
        if os.path.exists(output_path) and os.path.getsize(output_path) > 44:
            print(f"OK: {output_path}", file=sys.stderr)
            sys.exit(0)
        else:
            print(f"Error: Failed to generate audio file", file=sys.stderr)
            sys.exit(1)
            
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: tts-pyttsx3.py <text> <output_path> [language]", file=sys.stderr)
        sys.exit(1)
    
    text = sys.argv[1]
    output_path = sys.argv[2]
    lang = sys.argv[3] if len(sys.argv) > 3 else 'id'
    
    generate_tts(text, output_path, lang)
