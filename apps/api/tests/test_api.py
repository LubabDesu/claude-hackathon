from fastapi.testclient import TestClient

from app.main import app
from app.models import Resource
import app.opendeepsearch as opendeepsearch


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


def test_profile_match_does_not_require_storage(monkeypatch):
    response = client.post("/profile/match", json={"profile": BASE_PROFILE})
    assert response.status_code == 200
    body = response.json()
    assert body["privacy"]["session_only"] is True
    assert body["results"][0]["resource"]["id"] in {"calfresh", "wic"}


def test_sensitive_fields_are_rejected():
    payload = {"profile": {**BASE_PROFILE, "ssn": "123-45-6789"}}
    response = client.post("/profile/match", json=payload)
    assert response.status_code == 422
    assert "Sensitive fields" in response.text


async def _mock_live_search(profile, query, *, require_live=False):
    return [
        Resource(
            id="live-calfood",
            name="California Food Support",
            category="Food assistance",
            official_url="https://www.ca.gov/food-support",
            source_url="https://www.ca.gov/food-support",
            geography="California",
            urgent_need_tags=["food"],
            income_max_by_household={1: 1500, 2: 2000, 3: 2500, 4: 3000, 5: 3500, 6: 4000, 7: 4500, 8: 5000},
            required_documents=["ID", "proof of income"],
            application_methods=["online", "in person"],
            human_help=["county social services"],
            immigrant_note=None,
            source_last_reviewed="2026-05-09",
        ),
    ]


def test_opendeepsearch_returns_match_scores(monkeypatch):
    monkeypatch.setattr(opendeepsearch, "_live_search", _mock_live_search)
    response = client.post(
        "/opendeepsearch",
        json={"profile": BASE_PROFILE, "query": "food assistance in San Diego"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["results"]
    assert body["results"][0]["resource"]["id"] == "live-calfood"
    assert isinstance(body["results"][0]["score"], (int, float))


def test_opendeepsearch_requires_live_search(monkeypatch):
    async def _mock_empty_search(profile, query, *, require_live=False):
        return []

    monkeypatch.setattr(opendeepsearch, "_live_search", _mock_empty_search)
    response = client.post(
        "/opendeepsearch",
        json={"profile": BASE_PROFILE, "query": "food assistance in San Diego"},
    )
    assert response.status_code == 503
    assert "OpenDeepSearch" in response.text


def test_opendeepsearch_sorting_uses_match_scores(monkeypatch):
    async def _mock_double_search(profile, query, *, require_live=False):
        return [
            Resource(
                id="live-calfood",
                name="California Food Support",
                category="Food assistance",
                official_url="https://www.ca.gov/food-support",
                source_url="https://www.ca.gov/food-support",
                geography="California",
                urgent_need_tags=["food"],
                income_max_by_household={1: 1500, 2: 2000, 3: 2500, 4: 3000, 5: 3500, 6: 4000, 7: 4500, 8: 5000},
                required_documents=["ID"],
                application_methods=["online"],
                human_help=["county social services"],
                immigrant_note=None,
                source_last_reviewed="2026-05-09",
            ),
            Resource(
                id="live-housing",
                name="California Rental Help",
                category="Housing",
                official_url="https://www.ca.gov/rental-help",
                source_url="https://www.ca.gov/rental-help",
                geography="California",
                urgent_need_tags=[],
                income_max_by_household=None,
                required_documents=["lease agreement"],
                application_methods=["online"],
                human_help=["housing agency"],
                immigrant_note=None,
                source_last_reviewed="2026-05-09",
            ),
        ]

    monkeypatch.setattr(opendeepsearch, "_live_search", _mock_double_search)
    response = client.post("/opendeepsearch", json={"profile": BASE_PROFILE, "query": ""})
    assert response.status_code == 200
    body = response.json()
    scores = [item["score"] for item in body["results"]]
    assert scores == sorted(scores, reverse=True)
    response = client.post("/opendeepsearch", json={"profile": BASE_PROFILE, "query": ""})
    assert response.status_code == 200
    body = response.json()
    scores = [item["score"] for item in body["results"]]
    assert scores == sorted(scores, reverse=True)


def test_opendeepsearch_parses_json_answer():
    raw = """
    ```json
    [
      {
        "id": "calfresh",
        "name": "CalFresh",
        "category": "Food assistance",
        "official_url": "https://calfresh.dss.ca.gov",
        "source_url": "https://calfresh.dss.ca.gov",
        "geography": "California",
        "urgent_need_tags": ["food"],
        "income_max_by_household": null,
        "required_documents": ["ID", "proof of income"],
        "application_methods": ["online"],
        "human_help": ["county social services"],
        "immigrant_note": null,
        "source_last_reviewed": "2026-05-09"
      }
    ]
    ```
    """

    resources = opendeepsearch._parse_resources_from_answer(raw)
    assert len(resources) == 1
    assert resources[0].id == "calfresh"
    assert resources[0].urgent_need_tags == ["food"]


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
