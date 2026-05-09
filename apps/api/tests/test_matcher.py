from app.matcher import match_resources
from app.models import UserProfile


def profile(**overrides):
    data = {
        "language": "Spanish",
        "zipCode": "92101",
        "county": "San Diego",
        "householdSize": 3,
        "monthlyIncomeRange": "1500-3000",
        "hasDependents": True,
        "isStudent": False,
        "isVeteran": False,
        "immigrationCategory": "prefer_not_to_say",
        "urgentNeeds": ["food", "healthcare"],
    }
    data.update(overrides)
    return UserProfile.model_validate(data)


def test_calfresh_likely_match_for_food_need():
    results = match_resources(profile())
    calfresh = next(result for result in results if result.resource.id == "calfresh")
    assert calfresh.match_level == "likely match"
    assert "Proof of identity" in calfresh.required_documents


def test_income_too_high_marks_calfresh_possible_or_unlikely():
    results = match_resources(profile(monthlyIncomeRange="5000+", householdSize=1))
    calfresh = next(result for result in results if result.resource.id == "calfresh")
    assert calfresh.match_level != "likely match"
    assert calfresh.blockers


def test_mixed_household_adds_immigrant_note():
    results = match_resources(profile(immigrationCategory="mixed_household"))
    calfresh = next(result for result in results if result.resource.id == "calfresh")
    assert any("Mixed-status" in reason for reason in calfresh.reasons)


def test_student_gets_calfresh_student_reason():
    results = match_resources(profile(isStudent=True))
    calfresh = next(result for result in results if result.resource.id == "calfresh")
    assert any("Students" in reason for reason in calfresh.reasons)


def test_missing_income_still_returns_results():
    results = match_resources(profile(monthlyIncomeRange="unknown", urgentNeeds=[]))
    assert len(results) >= 3

