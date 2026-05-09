from app.models import Resource


CALFRESH_INCOME_LIMITS = {
    1: 2610,
    2: 3526,
    3: 4442,
    4: 5360,
    5: 6276,
    6: 7192,
    7: 8110,
    8: 9026,
}


RESOURCES: list[Resource] = [
    Resource(
        id="calfresh",
        name="CalFresh",
        category="Food assistance",
        official_url="https://benefitscal.com/",
        source_url="https://calfresh.dss.ca.gov/food/eligibility/index.html",
        geography="California",
        urgent_need_tags=["food"],
        income_max_by_household=CALFRESH_INCOME_LIMITS,
        required_documents=[
            "Proof of identity",
            "Proof of residency",
            "Income information",
            "Immigration status documents if applicable",
        ],
        application_methods=[
            "Apply online through BenefitsCal",
            "Call 2-1-1 San Diego",
            "Visit a county Family Resource Center",
        ],
        human_help=[
            "CalFresh Info Line: 1-877-847-3663",
            "San Diego Access: 1-866-262-9881",
            "2-1-1 San Diego",
        ],
        immigrant_note=(
            "Mixed-status households may still apply when at least one household "
            "member is eligible. Official eligibility workers can review details."
        ),
        source_last_reviewed="2026-05-09",
    ),
    Resource(
        id="medi-cal",
        name="Medi-Cal",
        category="Health care",
        official_url="https://www.dhcs.ca.gov/services/medi-cal/Pages/ApplyforMedi-Cal.aspx",
        source_url="https://www.ca.gov/support/",
        geography="California",
        urgent_need_tags=["healthcare"],
        required_documents=[
            "Identity information",
            "California residency",
            "Income information",
            "Household information",
        ],
        application_methods=[
            "Apply through BenefitsCal",
            "Apply through Covered California",
            "Contact county social services",
        ],
        human_help=["Covered California: 1-800-300-1506", "County social services"],
        immigrant_note="Eligibility rules can vary by age and immigration category.",
        source_last_reviewed="2026-05-09",
    ),
    Resource(
        id="calworks",
        name="CalWORKs",
        category="Cash aid",
        official_url="https://www.cdss.ca.gov/calworks",
        source_url="https://www.ca.gov/support/",
        geography="California",
        urgent_need_tags=["cash", "housing", "childcare"],
        required_documents=[
            "Identity information",
            "Proof of income",
            "Household composition",
            "Child/dependent information",
        ],
        application_methods=["Apply through BenefitsCal", "Contact county social services"],
        human_help=["County social services", "2-1-1 local support"],
        immigrant_note="A county worker can review mixed household eligibility.",
        source_last_reviewed="2026-05-09",
    ),
    Resource(
        id="wic",
        name="WIC",
        category="Family nutrition",
        official_url="https://www.cdph.ca.gov/Programs/CFH/DWICSN/Pages/Program-Landing1.aspx",
        source_url="https://www.ca.gov/support/",
        geography="California",
        urgent_need_tags=["food", "childcare"],
        required_documents=[
            "Identity information",
            "California residency",
            "Income information",
            "Pregnancy or child age information",
        ],
        application_methods=["Contact a local WIC office", "Start through California WIC"],
        human_help=["California WIC app or local WIC office"],
        immigrant_note="WIC generally focuses on nutrition needs for pregnant people and young children.",
        source_last_reviewed="2026-05-09",
    ),
    Resource(
        id="liheap",
        name="Utility bill assistance",
        category="Utilities",
        official_url="https://www.csd.ca.gov/Pages/LIHEAPProgram.aspx",
        source_url="https://www.ca.gov/support/",
        geography="California",
        urgent_need_tags=["utilities"],
        required_documents=[
            "Utility bill",
            "Income information",
            "Identity information",
            "Residency information",
        ],
        application_methods=["Find a local energy service provider", "Contact CSD local services"],
        human_help=["California Department of Community Services and Development"],
        immigrant_note=None,
        source_last_reviewed="2026-05-09",
    ),
    Resource(
        id="housing-help",
        name="Housing and shelter assistance",
        category="Housing",
        official_url="https://www.cdss.ca.gov/inforesources/cdss-programs/housing-programs",
        source_url="https://www.ca.gov/support/",
        geography="California",
        urgent_need_tags=["housing"],
        required_documents=[
            "Proof of identity",
            "Housing situation details",
            "Income information",
        ],
        application_methods=["Contact local county or housing program", "Use 2-1-1 for local referrals"],
        human_help=["2-1-1", "County housing services"],
        immigrant_note="Local programs can have different rules and document requirements.",
        source_last_reviewed="2026-05-09",
    ),
]


RESOURCE_BY_ID = {resource.id: resource for resource in RESOURCES}

