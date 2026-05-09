import re
from collections import Counter

from app.matcher import match_resources
from app.models import MatchResult, UserProfile
from app.resources import Resource


def search_resources(profile: UserProfile, query: str) -> list[MatchResult]:
    results = match_resources(profile)
    normalized_query = _normalize_text(query)
    if not normalized_query:
        return sorted(results, key=_rank_by_match_score, reverse=True)

    query_tokens = _tokenize(normalized_query)
    scored_results: list[tuple[float, MatchResult]] = []

    for result in results:
        relevance = _query_relevance(query_tokens, result.resource)
        combined_score = _combined_search_score(result.score, relevance)
        scored_results.append((combined_score, result))

    scored_results.sort(key=lambda pair: (-pair[0], _rank_tiebreaker(pair[1])))
    return [result for _, result in scored_results]


def _normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9\s]+", " ", text.lower()).strip()


def _tokenize(text: str) -> list[str]:
    return [token for token in _normalize_text(text).split() if token]


def _query_relevance(tokens: list[str], resource: Resource) -> int:
    if not tokens:
        return 0

    text = _resource_text(resource)
    token_counts = Counter(_tokenize(text))
    token_set = set(tokens)

    score = 0
    score += _name_match_score(tokens, resource.name)
    score += _category_match_score(tokens, resource.category)
    score += _geography_score(tokens, resource.geography)
    score += _tag_match_score(tokens, resource.urgent_need_tags)
    score += _field_match_score(tokens, resource.application_methods)
    score += _field_match_score(tokens, resource.human_help)
    score += _field_match_score(tokens, resource.required_documents)
    if resource.immigrant_note:
        score += _field_match_score(tokens, [resource.immigrant_note])

    for token in token_set:
        score += min(token_counts[token], 2)

    return min(score, 20)


def _resource_text(resource: Resource) -> str:
    fields: list[str] = [
        resource.name,
        resource.category,
        resource.geography,
        " ".join(resource.urgent_need_tags),
        " ".join(resource.application_methods),
        " ".join(resource.human_help),
        resource.immigrant_note or "",
    ]
    fields.extend(resource.required_documents)
    return " ".join(fields)


def _name_match_score(tokens: list[str], name: str) -> int:
    normalized = _normalize_text(name)
    name_tokens = set(normalized.split())
    return 4 if any(token in name_tokens for token in tokens) else 0


def _category_match_score(tokens: list[str], category: str) -> int:
    normalized = _normalize_text(category)
    category_tokens = set(normalized.split())
    return 2 if any(token in category_tokens for token in tokens) else 0


def _geography_score(tokens: list[str], geography: str) -> int:
    normalized_geo = _normalize_text(geography)
    if any(token in normalized_geo for token in tokens):
        return 2
    return 0


def _tag_match_score(tokens: list[str], tags: list[str]) -> int:
    tag_set = {tag.lower() for tag in tags}
    return 3 if any(token in tag_set for token in tokens) else 0


def _field_match_score(tokens: list[str], fields: list[str]) -> int:
    normalized_fields = " ".join(_normalize_text(field) for field in fields)
    return sum(1 for token in tokens if token in normalized_fields)


def _rank_tiebreaker(result: MatchResult) -> tuple[int, str]:
    order = {"likely match": 0, "possible match": 1, "unlikely based on what you shared": 2}
    return (order.get(result.match_level, 3), result.resource.name)


def _combined_search_score(match_score: int, relevance_score: int) -> float:
    return max(match_score, 0) * 10 + relevance_score


def _rank_by_match_score(result: MatchResult) -> int:
    return max(result.score, 0)
