import asyncio
import os
from pathlib import Path
from typing import Any

import httpx

_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())


class ModelProvider:
    def __init__(self) -> None:
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.model = os.getenv(
            "OPENROUTER_MODEL", "google/gemma-4-31b-it:free"
        )

    async def complete(self, system: str, user: str) -> str | None:
        if not self.api_key:
            return None

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
            "max_tokens": 500,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Multilingual Benefits Navigator",
        }

        retries = 3
        base_delay = 1.0

        async with httpx.AsyncClient(timeout=20) as client:
            for attempt in range(retries):
                try:
                    response = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    response.raise_for_status()
                    data = response.json()
                    content = data["choices"][0]["message"]["content"]
                    if not content:
                        print(f"[provider] null content, full response: {data}")
                    return content.strip() if content else None
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < retries - 1:
                        delay = base_delay * (2**attempt)
                        await asyncio.sleep(delay)
                        continue
                    raise
                except (httpx.ConnectError, httpx.TimeoutException) as e:
                    if attempt < retries - 1:
                        await asyncio.sleep(base_delay * (2**attempt))
                        continue
                    raise

        return None


provider = ModelProvider()

