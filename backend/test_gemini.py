import os
import time

from dotenv import load_dotenv
from google import genai
from google.genai import types


def main() -> None:
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is missing from backend/.env")

    client = genai.Client(api_key=api_key)
    start_time = time.perf_counter()
    try:
        response = client.models.generate_content(
            model=model_name,
            contents="Reply with exactly: Gemini connected",
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="minimal"),
                max_output_tokens=20,
            ),
        )
        duration = time.perf_counter() - start_time
        print(response.text.strip())
        print(f"Response time: {duration:.2f} seconds")
    finally:
        client.close()


if __name__ == "__main__":
    main()
