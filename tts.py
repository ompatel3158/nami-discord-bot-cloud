import argparse
import json
import os
import sys
from typing import Iterator

from elevenlabs.client import ElevenLabs


def _resolve_status_code(error: Exception) -> str:
    status_code = getattr(error, "status_code", None)
    if status_code is None:
        response = getattr(error, "response", None)
        status_code = getattr(response, "status_code", None)
    if status_code is None:
        return "unknown"
    return str(status_code)


def _iter_audio_bytes(stream: object) -> Iterator[bytes]:
    if isinstance(stream, (bytes, bytearray)):
        yield bytes(stream)
        return

    if hasattr(stream, "__iter__"):
        for chunk in stream:  # type: ignore[operator]
            if not chunk:
                continue
            if isinstance(chunk, (bytes, bytearray)):
                yield bytes(chunk)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate ElevenLabs speech audio to a file.")
    parser.add_argument("--voice-id", required=True)
    parser.add_argument("--model-id", default="eleven_flash_v2_5")
    parser.add_argument("--output", required=True)
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    text = sys.stdin.read().strip()
    if not text:
        print("No text provided on stdin.", file=sys.stderr)
        return 2

    api_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        print("ELEVENLABS_API_KEY is required.", file=sys.stderr)
        return 2

    client = ElevenLabs(api_key=api_key)

    try:
        audio_stream = client.text_to_speech.convert(
            text=text,
            voice_id=args.voice_id,
            model_id=args.model_id,
            output_format="mp3_44100_128",
        )

        total_bytes = 0
        with open(args.output, "wb") as output_file:
            for chunk in _iter_audio_bytes(audio_stream):
                output_file.write(chunk)
                total_bytes += len(chunk)

        if total_bytes <= 0:
            raise RuntimeError("No audio bytes were returned by ElevenLabs.")

        print(json.dumps({"ok": True, "output": args.output, "bytes": total_bytes}))
        return 0
    except Exception as error:  # pylint: disable=broad-except
        try:
            if os.path.exists(args.output):
                os.remove(args.output)
        except OSError:
            pass

        status = _resolve_status_code(error)
        print(f"ElevenLabs Python SDK error ({status}): {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
