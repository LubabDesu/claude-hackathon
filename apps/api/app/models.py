from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ImmigrationCategory = Literal[
    "prefer_not_to_say",
    "citizen_or_national",
    "lawful_permanent_resident",
    "mixed_household",
    "other",
]

MatchLevel = Literal[
    "likely match",
    "possible match",
    "unlikely based on what you shared",
]

SENSITIVE_KEYS = {
    "ssn",
    "social_security_number",
    "password",
    "credential",
    "birth_date",
    "date_of_birth",
    "document_number",
    "alien_number",
    "uscis_number",
}


class PrivacyPreferences(BaseModel):
    session_only: bool = True
    save_on_device: bool = False
    server_storage_opt_in: bool = False


class UserProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str = Field(min_length=2, max_length=60)
    zip_code: str | None = Field(default=None, alias="zipCode", max_length=10)
    county: str | None = Field(default=None, max_length=80)
    household_size: int = Field(alias="householdSize", ge=1, le=20)
    monthly_income_range: str = Field(alias="monthlyIncomeRange", max_length=40)
    has_dependents: bool = Field(default=False, alias="hasDependents")
    is_student: bool = Field(default=False, alias="isStudent")
    is_veteran: bool = Field(default=False, alias="isVeteran")
    immigration_category: ImmigrationCategory = Field(
        default="prefer_not_to_say", alias="immigrationCategory"
    )
    urgent_needs: list[str] = Field(default_factory=list, alias="urgentNeeds")

    @field_validator("urgent_needs")
    @classmethod
    def limit_urgent_needs(cls, value: list[str]) -> list[str]:
        return [item.strip().lower() for item in value[:8] if item.strip()]


class Resource(BaseModel):
    id: str
    name: str
    category: str
    official_url: str
    source_url: str
    geography: str
    urgent_need_tags: list[str]
    income_max_by_household: dict[int, int] | None = None
    required_documents: list[str]
    application_methods: list[str]
    human_help: list[str]
    immigrant_note: str | None = None
    source_last_reviewed: str


class MatchResult(BaseModel):
    resource: Resource
    match_level: MatchLevel
    reasons: list[str]
    blockers: list[str]
    required_documents: list[str]
    next_action: str


class MatchRequest(BaseModel):
    profile: UserProfile
    language: str | None = None
    privacy: PrivacyPreferences = Field(default_factory=PrivacyPreferences)


class MatchResponse(BaseModel):
    results: list[MatchResult]
    privacy: PrivacyPreferences
    disclaimer: str


class ExplainRequest(BaseModel):
    resource_id: str
    profile: UserProfile
    language: str


class ExplainResponse(BaseModel):
    resource_id: str
    explanation: str
    source_url: str
    disclaimer: str


class DomField(BaseModel):
    selector: str
    label: str
    kind: str


class GuidePageRequest(BaseModel):
    url: str
    language: str = "English"
    task: str = "Apply for benefits"
    fields: list[DomField] = Field(default_factory=list)
    visible_text: list[str] = Field(default_factory=list, alias="visibleText")


class GuideStep(BaseModel):
    spoken_text: str
    visual_highlight_selector: str | None = None
    user_action: str
    safety_warning: str | None = None
    confidence: Literal["high", "medium", "low"]


class GuidePageResponse(BaseModel):
    steps: list[GuideStep]
    stop_reason: str | None = None
    disclaimer: str

