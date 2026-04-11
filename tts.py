
import os

from elevenlabs.client import ElevenLabs

api_key = os.environ.get("ELEVENLABS_API_KEY")
if not api_key:
    raise RuntimeError("ELEVENLABS_API_KEY is required")

client = ElevenLabs(api_key=api_key)

# Get raw response with headers
with client.text_to_speech.with_raw_response.convert(
    text="Hello, world!",
    voice_id="9SsFrOutdZkCkU5hIoQm"
) as response:
    # Access character cost from headers
    char_cost = response.headers.get("x-character-count")
    request_id = response.headers.get("request-id")
    audio_data = response.parse()

print("x-character-count:", char_cost)
print("request-id:", request_id)
print("audio-bytes:", len(audio_data) if audio_data else 0)
