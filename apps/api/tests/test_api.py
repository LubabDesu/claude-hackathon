from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


BASE_PROFILE = {
    "language": "Spanish",
    "zipCode": "92101",
    "county": "San Diego",
    "householdSize": 3,
    "monthlyIncomeRange": "1500-3000",
    "hasDependents": True,
    "isStudent": False,
    "isVeteran": False,
    "immigrationCategory": "prefer_not_to_say",
    "urgentNeeds": ["food"],
}


def test_profile_match_does_not_require_storage():
    response = client.post("/profile/match", json={"profile": BASE_PROFILE})
    assert response.status_code == 200
    body = response.json()
    assert body["privacy"]["session_only"] is True
    assert body["results"][0]["resource"]["id"] == "calfresh"


def test_sensitive_fields_are_rejected():
    payload = {"profile": {**BASE_PROFILE, "ssn": "123-45-6789"}}
    response = client.post("/profile/match", json=payload)
    assert response.status_code == 422
    assert "Sensitive fields" in response.text


def test_opendeepsearch_returns_match_scores():
    response = client.post(
        "/opendeepsearch",
        json={"profile": BASE_PROFILE, "query": "food assistance in San Diego"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["results"]
    assert body["results"][0]["resource"]["id"] == "calfresh"
    assert isinstance(body["results"][0]["score"], int)


def test_opendeepsearch_sorting_uses_match_scores():
    response = client.post("/opendeepsearch", json={"profile": BASE_PROFILE, "query": ""})
    assert response.status_code == 200
    body = response.json()
    scores = [item["score"] for item in body["results"]]
    assert scores == sorted(scores, reverse=True)


def test_guide_stops_on_sensitive_page():
    response = client.post(
        "/guide/page",
        json={
            "url": "https://benefitscal.com",
            "language": "Spanish",
            "fields": [{"selector": "#ssn", "label": "Social Security Number", "kind": "input"}],
            "visibleText": ["Please enter Social Security Number"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["stop_reason"] == "Sensitive personal-data step detected."
    assert body["steps"][0]["safety_warning"]


def test_guide_returns_steps_for_regular_fields():
    response = client.post(
        "/guide/page",
        json={
            "url": "https://benefitscal.com",
            "language": "Spanish",
            "fields": [{"selector": "#name", "label": "Full name", "kind": "input"}],
            "visibleText": ["Application"],
        },
    )
    assert response.status_code == 200
    assert response.json()["steps"][0]["visual_highlight_selector"] == "#name"
