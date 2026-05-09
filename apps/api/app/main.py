import json

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.guide import build_guidance
from app.matcher import match_resources
from app.model_provider import provider
from app.opendeepsearch import search_resources
from app.models import (
    ExplainRequest,
    ExplainResponse,
    GuidePageRequest,
    GuidePageResponse,
    MatchRequest,
    MatchResponse,
    SearchRequest,
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
        "chrome-extension://*",
    ],
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def reject_sensitive_payloads(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH"}:
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


@app.post("/opendeepsearch", response_model=MatchResponse)
async def opendeepsearch(request: SearchRequest) -> MatchResponse:
    return MatchResponse(
        results=search_resources(request.profile, request.query),
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


@app.post("/guide/page", response_model=GuidePageResponse)
async def guide_page(request: GuidePageRequest) -> GuidePageResponse:
    steps, stop_reason = build_guidance(request)
    return GuidePageResponse(steps=steps, stop_reason=stop_reason, disclaimer=DISCLAIMER)


@app.exception_handler(KeyError)
async def key_error_handler(_request: Request, _exc: KeyError):
    return JSONResponse(status_code=404, content={"detail": "Unknown resource id."})


@app.exception_handler(ValidationError)
async def validation_error_handler(_request: Request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})
