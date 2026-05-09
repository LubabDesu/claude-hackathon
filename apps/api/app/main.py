import io
import json
import os

import edge_tts
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel as PydanticBase, ValidationError

from app.guide import build_narration
from app.matcher import match_resources
from app.model_provider import provider
from app.models import (
    ExplainRequest,
    ExplainResponse,
    GuidePageRequest,
    NarrationResponse,
    MatchRequest,
    MatchResponse,
    SENSITIVE_KEYS,
)
from app.resources import RESOURCE_BY_ID

DISCLAIMER = (
    "This tool helps you understand official resources. It does not guarantee eligibility, "
    "provide legal advice, or submit applications for you."
)

app = FastAPI(title="Multilingual Benefits Navigator API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "https://benefitscal.com",
        "https://www.benefitscal.com",
        "https://getcalfresh.org",
        "https://www.getcalfresh.org",
    ],
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def reject_sensitive_payloads(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH"}:
        content_type = request.headers.get("content-type", "")
        if not content_type.startswith("application/json"):
            return await call_next(request)
        body = await request.body()
        if _contains_sensitive_key(body):
            return JSONResponse(
                status_code=422,
                content={
                    "detail": "Sensitive fields are not accepted by this MVP. Keep this information on the official application site only."
                },
            )

        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}

        request = Request(request.scope, receive)
    return await call_next(request)


def _contains_sensitive_key(body: bytes) -> bool:
    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        return False
    return _walk_keys(payload)


def _walk_keys(value) -> bool:
    if isinstance(value, dict):
        for key, nested in value.items():
            normalized = str(key).strip().lower()
            if normalized in SENSITIVE_KEYS:
                return True
            if _walk_keys(nested):
                return True
    if isinstance(value, list):
        return any(_walk_keys(item) for item in value)
    return False


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "privacy": "session-only"}


@app.post("/profile/match", response_model=MatchResponse)
async def profile_match(request: MatchRequest) -> MatchResponse:
    return MatchResponse(
        results=match_resources(request.profile),
        privacy=request.privacy,
        disclaimer=DISCLAIMER,
    )


@app.post("/explain", response_model=ExplainResponse)
async def explain(request: ExplainRequest) -> ExplainResponse:
    resource = RESOURCE_BY_ID[request.resource_id]
    fallback = (
        f"{resource.name} may help with {resource.category.lower()}. "
        f"Based on what you shared, review the official eligibility page and prepare: "
        f"{', '.join(resource.required_documents[:3])}. {DISCLAIMER}"
    )
    system = (
        "You explain US government benefit resources in plain language. "
        "Do not guarantee eligibility. Do not ask for sensitive personal data. "
        "Use the requested language."
    )
    user = (
        f"Language: {request.language}\n"
        f"Resource: {resource.model_dump()}\n"
        f"Profile: household size {request.profile.household_size}, "
        f"income range {request.profile.monthly_income_range}, needs {request.profile.urgent_needs}."
    )
    explanation = await provider.complete(system, user) or fallback
    return ExplainResponse(
        resource_id=resource.id,
        explanation=explanation,
        source_url=resource.source_url,
        disclaimer=DISCLAIMER,
    )


VOICE_MAP = {
    "simplified chinese": "zh-CN-XiaoxiaoNeural",
    "spanish": "es-MX-DaliaNeural",
    "vietnamese": "vi-VN-HoaiMyNeural",
    "arabic": "ar-SA-ZariyahNeural",
    "korean": "ko-KR-SunHiNeural",
    "tagalog": "fil-PH-BlessicaNeural",
    "somali": "en-US-JennyNeural",
    "english": "en-US-JennyNeural",
}


class TTSRequest(PydanticBase):
    text: str
    language: str


@app.post("/guide/page", response_model=NarrationResponse)
async def guide_page(request: GuidePageRequest) -> NarrationResponse:
    return await build_narration(request)


@app.post("/tts")
async def tts_endpoint(req: TTSRequest):
    voice = VOICE_MAP.get(req.language.lower(), "en-US-JennyNeural")
    communicate = edge_tts.Communicate(req.text, voice)
    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    buf.seek(0)
    return StreamingResponse(buf, media_type="audio/mpeg")


_WHISPER_LANG = {
    "simplified chinese": "zh", "spanish": "es", "vietnamese": "vi",
    "arabic": "ar", "korean": "ko", "tagalog": "tl", "somali": "so", "english": "en",
}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str = "") -> dict[str, str]:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return JSONResponse(status_code=503, content={"error": "GROQ_API_KEY not configured"})

    audio_bytes = await audio.read()
    whisper_lang = _WHISPER_LANG.get(language.lower().strip(), "")

    transcribe_data: dict = {"model": "whisper-large-v3-turbo", "response_format": "json"}
    if whisper_lang:
        transcribe_data["language"] = whisper_lang

    import httpx as _httpx
    async with _httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {groq_key}"},
            files={"file": (audio.filename or "audio.webm", audio_bytes, audio.content_type or "audio/webm")},
            data=transcribe_data,
        )
        response.raise_for_status()
        data = response.json()
    return {"text": data.get("text", "")}


@app.exception_handler(KeyError)
async def key_error_handler(_request: Request, _exc: KeyError):
    return JSONResponse(status_code=404, content={"detail": "Unknown resource id."})


@app.exception_handler(ValidationError)
async def validation_error_handler(_request: Request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})
