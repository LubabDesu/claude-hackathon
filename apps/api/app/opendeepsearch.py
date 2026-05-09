"""
opendeepsearch.py
-----------------
Live web-search backed resource discovery.

Flow
----
1. Build a targeted benefits-discovery prompt from the user profile + query.
2. Ask OpenDeepSearch to search official sources and return Resource JSON.
3. Validate the JSON into Resource objects.
4. Score live results through the existing match_resources engine.

Environment variables
---------------------
OPENDEEPSEARCH_PROVIDER - "serper" or "searxng" (default: serper)
OPENDEEPSEARCH_MODEL    - LiteLLM model id (default: OPENROUTER_MODEL or Gemini)
OPENDEEPSEARCH_RERANKER - "jina", "infinity", or "None" (default: jina)
OPENDEEPSEARCH_MAX_SOURCES - source count for pro-mode search (default: 4)
SERPER_API_KEY          - required when provider is serper
SEARXNG_INSTANCE_URL    - required when provider is searxng
SEARXNG_API_KEY         - optional for authenticated SearXNG instances
OPENROUTER_API_KEY      - required by the default OpenRouter model
JINA_API_KEY            - required when using the Jina reranker

If OpenDeepSearch or provider credentials are absent, strict live search raises
OpenDeepSearchUnavailable instead of falling back to the bundled demo resources.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from datetime import date
from typing import Any, Literal

try:  # Optional dependency: installed via requirements for real live search.
    from opendeepsearch import OpenDeepSearchAgent
except Exception:  # pragma: no cover - depends on optional runtime package
    OpenDeepSearchAgent = None  # type: ignore[assignment]

from app.matcher import match_resources
from app.models import MatchResult, Resource, UserProfile
from app.resources import RESOURCES, RESOURCE_BY_ID

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Simple TTL cache so repeated identical queries within a session reuse results
# ---------------------------------------------------------------------------
_CACHE: dict[str, tuple[float, list[Resource]]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


class OpenDeepSearchUnavailable(RuntimeError):
    """Raised when strict live web discovery cannot run."""


def _cache_get(key: str) -> list[Resource] | None:
    entry = _CACHE.get(key)
    if entry and (time.monotonic() - entry[0]) < _CACHE_TTL_SECONDS:
        return entry[1]
    return None


def _cache_set(key: str, resources: list[Resource]) -> None:
    _CACHE[key] = (time.monotonic(), resources)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def search_resources(
    profile: UserProfile,
    query: str,
    *,
    require_live: bool = False,
) -> list[MatchResult]:
    """
    Return MatchResults from OpenDeepSearch when live results are available. When
    require_live is False, fall back to bundled demo resources. When require_live
    is True, return only web-discovered resources or raise a clear setup error.
    """
    live_resources = await _live_search(profile, query, require_live=require_live)
    if require_live and not live_resources:
        raise OpenDeepSearchUnavailable(
            "OpenDeepSearch ran, but did not return any parseable official program results."
        )

    # MERGE LOGIC: Combine live results with static resources.
    # If a live result has the same ID as a static one, prefer the static one (high quality).
    merged_map = {r.id: r for r in RESOURCES}
    for r in live_resources:
        if r.id not in merged_map:
            merged_map[r.id] = r
    
    resource_list = list(merged_map.values())
    results = match_resources(profile, resource_list=resource_list)

    if not query.strip():
        return sorted(results, key=lambda r: r.score, reverse=True)

    query_tokens = _tokenize(query)
    scored = [
        (_combined_score(r.score, _query_relevance(query_tokens, r.resource)), r)
        for r in results
    ]
    scored.sort(key=lambda pair: (-pair[0], _rank_tiebreaker(pair[1])))
    return [r for _, r in scored]


# ---------------------------------------------------------------------------
# Web search via OpenDeepSearch
# ---------------------------------------------------------------------------

_SEARCH_AGENT: Any | None = None
_SEARCH_AGENT_CONFIG: tuple[str, str, str] | None = None


async def _live_search(
    profile: UserProfile,
    query: str,
    *,
    require_live: bool = False,
) -> list[Resource]:
    if OpenDeepSearchAgent is None:
        message = "OpenDeepSearch is not installed; live search is disabled."
        logger.warning(message)
        if require_live:
            raise OpenDeepSearchUnavailable(message)
        return []

    search_query = _build_search_query(profile, query)
    cached = _cache_get(search_query)
    if cached is not None:
        logger.info("Cache hit for query: %s", search_query)
        return cached

    agent = _get_search_agent(require_live=require_live)
    if agent is None:
        return []

    prompt = _build_resource_prompt(profile, query)
    try:
        print(f"\n[DEBUG] --- OpenDeepSearch Prompt ---\n{prompt}\n")
        raw = await asyncio.to_thread(
            agent.ask_sync,
            prompt,
            _open_deep_search_max_sources(),
            True,
        )
        print(f"[DEBUG] --- Raw LLM Response ---\n{raw}\n")
    except Exception as exc:
        message = f"OpenDeepSearch request failed: {exc}"
        logger.warning(message)
        if require_live:
            raise OpenDeepSearchUnavailable(message) from exc
        return []

    resources = _parse_resources_from_answer(raw)
    _cache_set(search_query, resources)
    return resources


def _build_search_query(profile: UserProfile, query: str) -> str:
    """
    Construct a targeted search string from profile signals + free-text query.
    """
    parts: list[str] = []

    location = profile.county or (profile.zip_code or "")
    if location:
        parts.append(f"{location} California")
    else:
        parts.append("California")

    need_map = {
        "food": "food assistance CalFresh SNAP",
        "healthcare": "health insurance Medi-Cal",
        "housing": "housing assistance rental help",
        "cash": "cash aid CalWORKs",
        "utilities": "utility bill help LIHEAP",
        "childcare": "childcare WIC family support",
    }
    for need in profile.urgent_needs[:4]:
        parts.append(need_map.get(need.lower(), need))

    if query.strip():
        parts.append(query.strip())

    parts.append("government benefits program eligibility site:.gov OR site:.ca.gov")
    return " ".join(parts)


_EXTRACTION_SYSTEM = """
You are an OpenDeepSearch researcher for US government benefit programs.
Return ONLY a valid JSON array (no markdown, no preamble).
Each element must match this schema exactly:

{
  "id": "<slug, e.g. calfresh>",
  "name": "<program name>",
  "category": "<Food assistance | Health care | Cash aid | Housing | Utilities | Family nutrition | Other>",
  "official_url": "<direct official URL>",
  "source_url": "<same as official_url if unknown>",
  "geography": "<California or county/city>",
  "urgent_need_tags": ["food" | "healthcare" | "housing" | "cash" | "utilities" | "childcare"],
  "income_max_by_household": null,
  "required_documents": ["<doc1>", "<doc2>"],
  "application_methods": ["<method1>"],
  "human_help": ["<contact1>"],
  "immigrant_note": null,
  "source_last_reviewed": "<YYYY-MM-DD>"
}

Rules:
- Search official .gov, .ca.gov, county, or benefits portal pages.
- Omit any program you cannot identify clearly from official sources.
- Never invent URLs.
- Prefer direct application or eligibility URLs over generic homepages.
- Keep required_documents and application_methods concise (max 4 items each).
- Use geography "California" for state programs, or a specific county/city when local.
- Output [] if nothing useful is found.
""".strip()


def _get_search_agent(*, require_live: bool = False) -> Any | None:
    global _SEARCH_AGENT, _SEARCH_AGENT_CONFIG

    provider = _open_deep_search_provider()
    model = os.getenv(
        "OPENDEEPSEARCH_MODEL",
        os.getenv(
            "OPENROUTER_RANKING_MODEL",
            os.getenv("OPENROUTER_MODEL", "openrouter/google/gemini-2.0-flash-001"),
        ),
    )
    
    # Use custom ranking model if provided, otherwise default to jina
    reranker = os.getenv(
        "OPENDEEPSEARCH_RERANKER", 
        os.getenv("OPENROUTER_RANKING_MODEL", "jina")
    )
    
    config = (provider, model, reranker)

    if _SEARCH_AGENT is not None and _SEARCH_AGENT_CONFIG == config:
        return _SEARCH_AGENT

    if provider == "serper" and not os.getenv("SERPER_API_KEY"):
        message = "SERPER_API_KEY not set; OpenDeepSearch Serper provider is disabled."
        logger.warning(message)
        if require_live:
            raise OpenDeepSearchUnavailable(message)
        return None
    if provider == "searxng" and not os.getenv("SEARXNG_INSTANCE_URL"):
        message = "SEARXNG_INSTANCE_URL not set; OpenDeepSearch SearXNG provider is disabled."
        logger.warning(message)
        if require_live:
            raise OpenDeepSearchUnavailable(message)
        return None

    try:
        _SEARCH_AGENT = OpenDeepSearchAgent(
            model=model,
            system_prompt=_EXTRACTION_SYSTEM,
            search_provider=provider,
            serper_api_key=os.getenv("SERPER_API_KEY"),
            searxng_instance_url=os.getenv("SEARXNG_INSTANCE_URL"),
            searxng_api_key=os.getenv("SEARXNG_API_KEY"),
            reranker=reranker,
        )
        _SEARCH_AGENT_CONFIG = config
        return _SEARCH_AGENT
    except Exception as exc:
        message = f"OpenDeepSearch setup failed: {exc}"
        logger.warning(message)
        _SEARCH_AGENT = None
        _SEARCH_AGENT_CONFIG = None
        if require_live:
            raise OpenDeepSearchUnavailable(message) from exc
        return None


def _open_deep_search_provider() -> Literal["serper", "searxng"]:
    configured = os.getenv("OPENDEEPSEARCH_PROVIDER", "").strip().lower()
    if configured in {"serper", "searxng"}:
        return configured  # type: ignore[return-value]
    if os.getenv("SEARXNG_INSTANCE_URL") and not os.getenv("SERPER_API_KEY"):
        return "searxng"
    return "serper"


def _open_deep_search_max_sources() -> int:
    try:
        return max(1, min(int(os.getenv("OPENDEEPSEARCH_MAX_SOURCES", "4")), 10))
    except ValueError:
        return 4


def _build_resource_prompt(profile: UserProfile, query: str) -> str:
    location = profile.county or profile.zip_code or "California"
    user_query = query.strip() or "Find likely official benefit programs for this profile."
    return (
        f"{user_query}\n\n"
        "Research official government benefit programs and return Resource JSON only.\n\n"
        f"Profile:\n"
        f"- Language: {profile.language}\n"
        f"- Location: {location}\n"
        f"- Household size: {profile.household_size}\n"
        f"- Monthly income range: {profile.monthly_income_range}\n"
        f"- Has dependents: {profile.has_dependents}\n"
        f"- Student: {profile.is_student}\n"
        f"- Veteran: {profile.is_veteran}\n"
        f"- Immigration category: {profile.immigration_category}\n"
        f"- Urgent needs: {', '.join(profile.urgent_needs) or 'general assistance'}\n"
        f"- Review date to use: {date.today().isoformat()}\n\n"
        f"Targeted search query: {_build_search_query(profile, query)}"
    )


def _parse_resources_from_answer(raw: str | None) -> list[Resource]:
    if not raw:
        return []

    json_text = _extract_json_array(raw)
    if json_text is None:
        logger.warning("OpenDeepSearch returned no JSON array.")
        return []

    try:
        items = json.loads(json_text)
    except json.JSONDecodeError as exc:
        logger.warning("OpenDeepSearch returned invalid JSON: %s", exc)
        return []

    if not isinstance(items, list):
        return []

    resources: list[Resource] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            resources.append(Resource(**item))
        except Exception as parse_err:
            logger.debug("Skipping malformed resource: %s - %s", item, parse_err)
    return resources


def _extract_json_array(raw: str) -> str | None:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE).rstrip("`").strip()
    if text.startswith("[") and text.endswith("]"):
        return text

    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return None
    return text[start : end + 1]


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------


def _normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9\s]+", " ", text.lower()).strip()


def _tokenize(text: str) -> list[str]:
    return [t for t in _normalize_text(text).split() if t]


def _query_relevance(tokens: list[str], resource: Resource) -> int:
    if not tokens:
        return 0
    text = " ".join(
        [
            resource.name,
            resource.category,
            resource.geography,
            " ".join(resource.urgent_need_tags),
            " ".join(resource.application_methods),
            " ".join(resource.human_help),
            resource.immigrant_note or "",
            *resource.required_documents,
        ]
    )
    from collections import Counter

    token_counts = Counter(_tokenize(text))
    score = 0
    name_tokens = set(_normalize_text(resource.name).split())
    score += 4 if any(t in name_tokens for t in tokens) else 0
    cat_tokens = set(_normalize_text(resource.category).split())
    score += 2 if any(t in cat_tokens for t in tokens) else 0
    geo = _normalize_text(resource.geography)
    score += 2 if any(t in geo for t in tokens) else 0
    tag_set = {tg.lower() for tg in resource.urgent_need_tags}
    score += 3 if any(t in tag_set for t in tokens) else 0
    for field_list in (resource.application_methods, resource.human_help, resource.required_documents):
        combined = " ".join(_normalize_text(f) for f in field_list)
        score += sum(1 for t in tokens if t in combined)
    score += sum(min(token_counts[t], 2) for t in set(tokens))
    return min(score, 20)


def _combined_score(match_score: float, relevance: int) -> float:
    normalized_rel = min(max(relevance, 0.0) / 20.0 * 100.0, 100.0)
    return round(max(match_score, 0.0) * 0.7 + normalized_rel * 0.3, 2)


def _rank_tiebreaker(result: MatchResult) -> tuple[int, str]:
    order = {"likely match": 0, "possible match": 1, "unlikely based on what you shared": 2}
    return (order.get(result.match_level, 3), result.resource.name)
