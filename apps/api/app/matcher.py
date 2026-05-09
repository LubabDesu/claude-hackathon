from app.models import MatchResult, ScoreBreakdown, ScoreBreakdownItem, UserProfile
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


def match_resources(
    profile: UserProfile,
    resource_list: list | None = None,
) -> list[MatchResult]:
    """Score and rank resources against the user profile.

    Args:
        profile: The user's self-reported profile.
        resource_list: Override the default static RESOURCES list.
            Pass a merged live+static list from opendeepsearch.
    """
    results: list[MatchResult] = []
    income = income_upper_bound(profile.monthly_income_range)
    california = _is_california_profile(profile)

    for resource in (resource_list if resource_list is not None else RESOURCES):
        score = 0.0
        reasons: list[str] = []
        blockers: list[str] = []
        citations: list[str] = []
        breakdown: list[ScoreBreakdownItem] = []

        overlap = sorted(set(profile.urgent_needs).intersection(resource.urgent_need_tags))
        if overlap:
            points = 8.5 + (len(overlap) * 1.5)
            score += points
            breakdown.append(
                ScoreBreakdownItem(
                    label="Urgent needs",
                    points=points,
                    detail=f"Matched: {', '.join(overlap)}.",
                )
            )
            reasons.append(f"Directly matches your urgent needs: {', '.join(overlap)}. This program prioritizes support in these areas.")
            citations.append(f"{resource.official_url} - Program details")

        if resource.geography == "California" and california:
            score += 5.5
            breakdown.append(
                ScoreBreakdownItem(
                    label="Location",
                    points=5.5,
                    detail="Available for a California profile.",
                )
            )
            reasons.append("Available in your California location. This is a state-administered program verified through the official California benefits portal.")
            citations.append(f"{resource.source_url} - Eligibility verification")
        elif resource.geography == "California":
            blockers.append("This program is California-specific. Please confirm your state of residence before proceeding.")

        if resource.income_max_by_household:
            limit = _income_limit_for_household(
                resource.income_max_by_household, profile.household_size
            )
            if income is None:
                score += 2.5
                breakdown.append(
                    ScoreBreakdownItem(
                        label="Income",
                        points=2.5,
                        detail="Income was marked unknown, so this stays reviewable.",
                    )
                )
                reasons.append("Your income information was marked uncertain. This program should be reviewed with a caseworker to confirm eligibility.")
                citations.append(f"{resource.official_url} - Income guidelines")
            elif income <= limit:
                score += 7.0
                breakdown.append(
                    ScoreBreakdownItem(
                        label="Income",
                        points=7.0,
                        detail=f"Selected income range fits the ${limit:,}/month limit for household size {profile.household_size}.",
                    )
                )
                reasons.append(
                    f"Your household income qualifies. For a household of {profile.household_size}, the income limit is ${limit:,}/month. Your selected range fits within program guidelines published by the California Department of Social Services."
                )
                citations.append(f"{resource.source_url} - Official income limits")
            else:
                score -= 5.0
                breakdown.append(
                    ScoreBreakdownItem(
                        label="Income concern",
                        points=-5.0,
                        detail=f"Selected income range may exceed the ${limit:,}/month limit for household size {profile.household_size}.",
                    )
                )
                blockers.append(
                    f"Income concern: Your range may exceed the ${limit:,}/month limit for household size {profile.household_size}. Verify current limits before applying."
                )

        if profile.has_dependents and resource.id in {"calworks", "wic"}:
            score += 4.5
            breakdown.append(
                ScoreBreakdownItem(
                    label="Dependents",
                    points=4.5,
                    detail="Profile includes children or dependents for a family-support program.",
                )
            )
            reasons.append("Having dependents makes you eligible for enhanced benefits under this program. These programs prioritize support for families with children.")
            citations.append(f"{resource.official_url} - Dependent eligibility")

        if profile.is_student and resource.id == "calfresh":
            score += 3.0
            breakdown.append(
                ScoreBreakdownItem(
                    label="Student",
                    points=3.0,
                    detail="CalFresh has student-specific eligibility pathways.",
                )
            )
            reasons.append("As a student, you may qualify for CalFresh with special work-study exemptions. Many educational institutions have campus CalFresh coordinators who can guide applications.")
            citations.append("https://calfresh.dss.ca.gov/food/eligibility/index.html - Student exemptions")

        if profile.immigration_category in {"mixed_household", "other"} and resource.immigrant_note:
            reasons.append(f"Important immigration note: {resource.immigrant_note} Contact your county social services office for case-by-case review.")
            citations.append(f"{resource.official_url} - Immigration and mixed-household guidance")

        if not reasons:
            reasons.append(f"This is an official California assistance program. Review the {resource.category} program details to learn about eligibility and required documents.")
            citations.append(f"{resource.source_url} - Program overview")

        match_level = _score_to_level(score, blockers)
        # Normalize score to 0-100 scale
        normalized_score = min(100.0, max(0.0, score * 5.5))
        results.append(
            MatchResult(
                resource=resource,
                match_level=match_level,
                score=normalized_score,
                score_breakdown=ScoreBreakdown(
                    raw_score=round(score, 2),
                    normalized_score=round(normalized_score, 2),
                    formula="Raw profile-fit points x 5.5, capped from 0 to 100.",
                    items=breakdown,
                ),
                reasons=reasons,
                blockers=blockers,
                required_documents=resource.required_documents,
                next_action=_next_action(resource.id),
                source_citations=citations,
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


def _score_to_level(score: float, blockers: list[str]) -> str:
    if score >= 38.5 and not blockers:
        return "likely match"
    if score >= 16.5:
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
