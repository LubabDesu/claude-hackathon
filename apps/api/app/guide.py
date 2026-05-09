from app.models import GuidePageRequest, GuideStep


SENSITIVE_TERMS = (
    "social security",
    "ssn",
    "password",
    "date of birth",
    "birth date",
    "document number",
    "alien registration",
    "uscis",
    "captcha",
)


def build_guidance(request: GuidePageRequest) -> tuple[list[GuideStep], str | None]:
    visible = " ".join(request.visible_text).lower()
    labels = " ".join(field.label.lower() for field in request.fields)
    combined = f"{visible} {labels}"

    if any(term in combined for term in SENSITIVE_TERMS):
        return (
            [
                GuideStep(
                    spoken_text=(
                        f"In {request.language}: This page is asking for sensitive information. "
                        "I can explain the field, but I will not store it, read it aloud after you type it, "
                        "or submit the form for you."
                    ),
                    visual_highlight_selector=None,
                    user_action="Review the official page carefully and continue only if you are comfortable.",
                    safety_warning="Sensitive step detected. The assistant will not submit or save this information.",
                    confidence="high",
                )
            ],
            "Sensitive personal-data step detected.",
        )

    field_steps: list[GuideStep] = []
    for field in request.fields[:3]:
        field_steps.append(
            GuideStep(
                spoken_text=(
                    f"In {request.language}: Look for the field labeled {field.label}. "
                    "Enter only information you are comfortable sharing with the official website."
                ),
                visual_highlight_selector=field.selector,
                user_action=f"Review and complete: {field.label}",
                safety_warning=None,
                confidence="medium",
            )
        )

    if field_steps:
        return field_steps, None

    return (
        [
            GuideStep(
                spoken_text=(
                    f"In {request.language}: I do not see a fillable form yet. "
                    "Look for an official apply, continue, start, or sign in button. "
                    "Do not enter private information unless the website address is official and secure."
                ),
                visual_highlight_selector=None,
                user_action="Find the official next button or application link.",
                safety_warning="Confirm this is an official government or trusted benefit application page.",
                confidence="low",
            )
        ],
        None,
    )

