import asyncio
import edge_tts

# VOICE OPTIONS:
# hi-IN-MadhurNeural (Male - Very natural Indian voice)
# hi-IN-SwaraNeural (Female - Clear and emotional)
# gu-IN-DhwaniNeural (Gujarati - Best if you use Gujarati Script)

VOICE = "hi-IN-MadhurNeural" 

async def generate_indian_tts(text, filename):
    # We add a small 'rate' increase because your chat is fast-paced
    # We add 'pitch' to make it sound more energetic (emotional)
    communicate = edge_tts.Communicate(text, VOICE, rate="+15%", pitch="+2Hz")
    await communicate.save(filename)
    print(f"Generated: {filename}")

# --- TEST WITH YOUR ACTUAL CHAT ---
chat_messages = [
    "HA HA! EARPOD MA CHARGE PATI GYU... BADLU CHU 2 MIN",
    "OM BHAI... AA HARAMKHOR NE KADHO!",
    "Chhi chhi... tame toh ganda chho!",
    "I love you TTS darling! Hahaha"
]

async def main():
    for i, msg in enumerate(chat_messages):
        await generate_indian_tts(msg, f"chat_{i}.mp3")

if __name__ == "__main__":
    asyncio.run(main())