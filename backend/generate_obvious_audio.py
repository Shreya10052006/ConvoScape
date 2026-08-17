import os
import win32com.client
import wave, struct, math

def generate_tts_speech(output_path="backend/obvious_speech.wav", text="PA PA PA. MA MA MA. BA BA BA. HELLO HELLO HELLO."):
    """Synthesize real human speech audio using Windows SAPI5 TTS engine."""
    output_path = os.path.abspath(output_path)
    if os.path.exists(output_path):
        os.remove(output_path)
        
    try:
        voice = win32com.client.Dispatch("SAPI.SpVoice")
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        # SSFMCreateForWrite = 3
        stream.Open(output_path, 3, False)
        voice.AudioOutputStream = stream
        voice.Speak(text)
        stream.Close()
        print(f"Generated SAPI5 TTS speech audio at {output_path} ({os.path.getsize(output_path)} bytes)")
    except Exception as e:
        print(f"SAPI5 synthesis fallback: {e}")
        # Fallback wave synthesizer
        sample_rate = 16000
        duration_sec = 4.0
        num_samples = int(sample_rate * duration_sec)
        with wave.open(output_path, "w") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            for i in range(num_samples):
                t = i / sample_rate
                burst = max(0.0, math.sin(2 * math.pi * 5.0 * t))
                val = int(32767 * 0.5 * burst * math.sin(2 * math.pi * 440.0 * t))
                val = max(-32768, min(32767, val))
                wav_file.writeframes(struct.pack("<h", val))
        print(f"Generated synthesized wave audio at {output_path}")

if __name__ == "__main__":
    generate_tts_speech()
