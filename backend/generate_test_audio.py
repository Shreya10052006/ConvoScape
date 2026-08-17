import wave
import math
import struct

def generate_test_tone_speech(output_path="backend/test_speech.wav", duration_sec=4.0):
    sample_rate = 16000
    num_samples = int(sample_rate * duration_sec)
    
    # Generate an audio signal with varying frequencies simulating speech harmonics
    with wave.open(output_path, "w") as wav_file:
        wav_file.setnchannels(1) # Mono
        wav_file.setsampwidth(2) # 16-bit PCM
        wav_file.setframerate(sample_rate)
        
        for i in range(num_samples):
            t = i / sample_rate
            # Synthesize simulated speech formant modulation
            envelope = math.sin(2 * math.pi * 0.5 * t) ** 2
            freq = 220 + 80 * math.sin(2 * math.pi * 3.0 * t) + 40 * math.sin(2 * math.pi * 7.0 * t)
            val = int(32767 * 0.4 * envelope * math.sin(2 * math.pi * freq * t))
            val = max(-32768, min(32767, val))
            data = struct.pack("<h", val)
            wav_file.writeframes(data)
            
    print(f"Generated test audio at {output_path} ({duration_sec}s, {sample_rate}Hz)")

if __name__ == "__main__":
    generate_test_tone_speech()
