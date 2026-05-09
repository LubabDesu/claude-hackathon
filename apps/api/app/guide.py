import json
import re

from fastapi import HTTPException

from app.model_provider import provider
from app.models import GuidePageRequest, NarrationResponse


DISCLAIMER = (
    "This tool helps you understand official resources. It does not guarantee eligibility, "
    "provide legal advice, or submit applications for you."
)

_NOISE_LABELS = {
    "skip to content", "skip to main content", "skip navigation",
    "menu", "close", "search", "log in", "login", "sign in", "signin",
    "create an account", "create account", "register", "sign up", "signup",
    "home", "help", "english", "español", "language",
}

_TEXT_NOISE = {"create an account", "log in", "login", "sign in", "register"}


async def build_narration(request: GuidePageRequest) -> NarrationResponse:
    meaningful_fields = [
        f for f in request.fields
        if f.label.lower().strip() not in _NOISE_LABELS and len(f.label.strip()) > 2
    ]

    fields_text = "\n".join(
        f"  - {f.kind}: {f.label!r} (selector: {f.selector})"
        for f in meaningful_fields[:10]
    ) or "  None found"

    text_preview = " | ".join(
        t for t in request.visible_text[:8]
        if t and t.lower().strip() not in _TEXT_NOISE
    )

    system = (
        f"You are a warm, multilingual accessibility guide helping immigrants navigate "
        f"US government benefit applications. "
        f"Always respond ONLY in {request.language}, EXCEPT for English UI labels: "
        f"when referencing a specific button, field, or link the user must find on screen, "
        f"wrap that exact English text in single quotes (e.g. 请点击 'Begin' 开始申请流程, or haga clic en 'Apply on BenefitsCal' para continuar). "
        f"IMPORTANT: never use double quotes inside your narration — only single quotes for UI labels. "
        f"Return raw JSON only — no markdown, no extra text:\n"
        f'{{"narration": "your explanation here", "selector": "css-selector-or-null"}}\n\n'
        f"The narration must cover three things in order:\n"
        f"1. What this page is for and what the user is about to do\n"
        f"2. WHY this helps them (build trust, reduce anxiety)\n"
        f"3. REQUIRED: End with the exact next action — look at the 'Visible interactive elements' list. "
        f"If the page has form inputs (input/select/textarea), tell the user to fill in the first required field by name. "
        f"If the page has only buttons/links, name the most important one. "
        f"Either way, quote the exact label in single quotes. "
        f"Examples: 请在 'Address Line 1' 中填写您的街道地址。 / Por favor complete el campo 'Address Line 1' con su dirección.\n"
        f"Keep it warm, simple, and clear. Speak directly to the user as 'you'. Max 3 sentences total."
    )

    user_parts = [
        f"Page URL: {request.url}",
        f"Visible interactive elements:\n{fields_text}",
        f"Page text: {text_preview or 'No readable text'}",
    ]
    if request.user_question:
        user_parts.append(
            f"The user asked: {request.user_question}\n"
            f"Answer their question directly while still explaining the page context."
        )

    raw = await provider.complete(system, "\n\n".join(user_parts))
    print(f"[guide] raw={raw!r}")

    if raw:
        result = _parse_narration(raw)
        if result:
            return NarrationResponse(narration=result["narration"], selector=result["selector"], disclaimer=DISCLAIMER)
        print(f"[guide] parse failed")

    raise HTTPException(status_code=502, detail="Guide service could not produce a response.")


def _parse_narration(raw: str) -> dict | None:
    try:
        clean = raw.strip()
        fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", clean)
        if fence:
            clean = fence.group(1)
        else:
            obj = re.search(r"\{[\s\S]*\}", clean)
            if obj:
                clean = obj.group(0)
        data = json.loads(clean)
        narration = data.get("narration", "").strip()
        if not narration:
            return None
        return {
            "narration": narration,
            "selector": data.get("selector") or None,
        }
    except Exception:
        return None
