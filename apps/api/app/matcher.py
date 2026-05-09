from app.models import MatchResult, UserProfile
from app.resources import RESOURCES


def income_upper_bound(monthly_income_range: str) -> int | None:
    mapping = {
        "0-1500": 1500,
        "1500-3000": 3000,
        "3000-5000": 5000,
        "5000+": 6500,
        "unknown": None,
    }
    return mapping.get(monthly_income_range)


def match_resources(profile: UserProfile) -> list[MatchResult]:
    results: list[MatchResult] = []
    income = income_upper_bound(profile.monthly_income_range)
    california = _is_california_profile(profile)

    for resource in RESOURCES:
        score = 0
        reasons: list[str] = []
        blockers: list[str] = []

        overlap = sorted(set(profile.urgent_needs).intersection(resource.urgent_need_tags))
        if overlap:
            score += 4 + len(overlap)
            reasons.append(f"Matches urgent need: {', '.join(overlap)}.")

        if resource.geography == "California" and california:
            score += 2
            reasons.append("Resource is available in California.")
        elif resource.geography == "California":
            blockers.append("This MVP is tuned for California; confirm your state before applying.")

        if resource.income_max_by_household:
            limit = _income_limit_for_household(
                resource.income_max_by_household, profile.household_size
            )
            if income is None:
                score += 1
                reasons.append("Income was marked unsure, so this should be reviewed.")
            elif income <= limit:
                score += 3
                reasons.append(
                    f"Your selected income range appears under the listed limit for household size {profile.household_size}."
                )
            else:
                score -= 3
                blockers.append(
                    "Your selected income range may be above the listed gross monthly limit."
                )

        if profile.has_dependents and resource.id in {"calworks", "wic"}:
            score += 2
            reasons.append("Dependents may make this resource more relevant.")

        if profile.is_student and resource.id == "calfresh":
            score += 1
            reasons.append("Students may have special CalFresh exemptions to review.")

        if profile.immigration_category in {"mixed_household", "other"} and resource.immigrant_note:
            reasons.append(resource.immigrant_note)

        if not reasons:
            reasons.append("This is an official assistance program that may be worth reviewing.")

        match_level = _score_to_level(score, blockers)
        results.append(
            MatchResult(
                resource=resource,
                match_level=match_level,
                score=score,
                reasons=reasons,
                blockers=blockers,
                required_documents=resource.required_documents,
                next_action=_next_action(resource.id),
            )
        )

    return sorted(results, key=_rank_key)


def _is_california_profile(profile: UserProfile) -> bool:
    county = (profile.county or "").strip().lower()
    zip_code = (profile.zip_code or "").strip()
    return county in {"san diego", "los angeles", "orange", "alameda", "santa clara"} or zip_code.startswith("9")


def _income_limit_for_household(limits: dict[int, int], household_size: int) -> int:
    if household_size <= 8:
        return limits[household_size]
    return limits[8] + ((household_size - 8) * 918)


def _score_to_level(score: int, blockers: list[str]) -> str:
    if score >= 7 and not blockers:
        return "likely match"
    if score >= 3:
        return "possible match"
    return "unlikely based on what you shared"


def _rank_key(result: MatchResult) -> tuple[int, str]:
    level_score = {
        "likely match": 0,
        "possible match": 1,
        "unlikely based on what you shared": 2,
    }[result.match_level]
    return (level_score, result.resource.name)


def _next_action(resource_id: str) -> str:
    if resource_id == "calfresh":
        return "Open BenefitsCal, keep the extension on, and review the document checklist before entering personal details."
    return "Open the official source, review eligibility, and use the extension for translated step-by-step guidance."

