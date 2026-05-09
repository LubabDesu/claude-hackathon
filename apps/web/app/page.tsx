"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ImmigrationCategory =
  | "prefer_not_to_say"
  | "citizen_or_national"
  | "lawful_permanent_resident"
  | "mixed_household"
  | "other";

type UserProfile = {
  language: string;
  zipCode: string;
  county: string;
  householdSize: number;
  monthlyIncomeRange: string;
  hasDependents: boolean;
  isStudent: boolean;
  isVeteran: boolean;
  immigrationCategory: ImmigrationCategory;
  urgentNeeds: string[];
};

type MatchResult = {
  resource: {
    id: string;
    name: string;
    category: string;
    official_url: string;
    source_url: string;
    geography: string;
    human_help: string[];
  };
  match_level: "likely match" | "possible match" | "unlikely based on what you shared";
  reasons: string[];
  blockers: string[];
  required_documents: string[];
  next_action: string;
};

const STORAGE_KEY = "benefits-navigator-profile";
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";

const defaultProfile: UserProfile = {
  language: "Spanish",
  zipCode: "92101",
  county: "San Diego",
  householdSize: 3,
  monthlyIncomeRange: "1500-3000",
  hasDependents: true,
  isStudent: false,
  isVeteran: false,
  immigrationCategory: "prefer_not_to_say",
  urgentNeeds: ["food", "healthcare"]
};

const needOptions = [
  { id: "food", label: "Food" },
  { id: "healthcare", label: "Health care" },
  { id: "cash", label: "Cash aid" },
  { id: "utilities", label: "Utilities" },
  { id: "housing", label: "Housing" },
  { id: "childcare", label: "Child care" }
];

export default function Home() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [saveLocal, setSaveLocal] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setProfile(JSON.parse(stored));
        setSaveLocal(true);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (saveLocal) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [profile, saveLocal]);

  const privacyStatus = useMemo(
    () =>
      saveLocal
        ? "Saved on this browser only. Nothing is stored on our server."
        : "Session-only. Your answers disappear when this tab is closed.",
    [saveLocal]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/profile/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, language: profile.language })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the local matching service."
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleNeed(need: string) {
    setProfile((current) => ({
      ...current,
      urgentNeeds: current.urgentNeeds.includes(need)
        ? current.urgentNeeds.filter((item) => item !== need)
        : [...current.urgentNeeds, need]
    }));
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="heroCopy">
          <p className="kicker">Session-only by default</p>
          <h1>Find benefits without giving up control of your data.</h1>
          <p className="dek">
            A multilingual guide for official food, health, cash, housing, and
            utility assistance. We use only the details needed to rank programs
            and explain next steps.
          </p>
          <div className="trustRow" aria-label="Privacy promises">
            <span>No SSNs</span>
            <span>No server profile storage</span>
            <span>Official sources only</span>
          </div>
        </div>
        <div className="sourcePanel" aria-label="Source coverage">
          <span>Seeded sources</span>
          <strong>USAGov + CA.gov + county programs</strong>
          <p>CalFresh, Medi-Cal, CalWORKs, WIC, utilities, housing</p>
        </div>
      </section>

      <section className="workspace">
        <form className="intake" onSubmit={submit}>
          <div className="privacyNotice">
            <div>
              <strong>Used only for this session.</strong>
              <p>Not stored unless you choose to save it on this device.</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={saveLocal}
                onChange={(event) => setSaveLocal(event.target.checked)}
              />
              <span />
              Save on this device
            </label>
          </div>
          <p className="privacyStatus">{privacyStatus}</p>

          <div className="fieldGrid">
            <label>
              Preferred language
              <input
                value={profile.language}
                onChange={(event) =>
                  setProfile({ ...profile, language: event.target.value })
                }
                placeholder="Spanish, Arabic, Vietnamese..."
              />
            </label>
            <label>
              ZIP code
              <input
                inputMode="numeric"
                value={profile.zipCode}
                onChange={(event) =>
                  setProfile({ ...profile, zipCode: event.target.value })
                }
              />
            </label>
            <label>
              County
              <input
                value={profile.county}
                onChange={(event) =>
                  setProfile({ ...profile, county: event.target.value })
                }
              />
            </label>
            <label>
              Household size
              <input
                type="number"
                min="1"
                max="12"
                value={profile.householdSize}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    householdSize: Number(event.target.value)
                  })
                }
              />
            </label>
            <label>
              Monthly income range
              <select
                value={profile.monthlyIncomeRange}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    monthlyIncomeRange: event.target.value
                  })
                }
              >
                <option value="0-1500">$0-$1,500</option>
                <option value="1500-3000">$1,500-$3,000</option>
                <option value="3000-5000">$3,000-$5,000</option>
                <option value="5000+">$5,000+</option>
                <option value="unknown">I am not sure</option>
              </select>
            </label>
            <label>
              Immigration category
              <select
                value={profile.immigrationCategory}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    immigrationCategory: event.target
                      .value as ImmigrationCategory
                  })
                }
              >
                <option value="prefer_not_to_say">Prefer not to say</option>
                <option value="citizen_or_national">Citizen or national</option>
                <option value="lawful_permanent_resident">
                  Lawful permanent resident
                </option>
                <option value="mixed_household">Mixed-status household</option>
                <option value="other">Other or not sure</option>
              </select>
            </label>
          </div>

          <div className="flags" aria-label="Additional profile details">
            <label>
              <input
                type="checkbox"
                checked={profile.hasDependents}
                onChange={(event) =>
                  setProfile({ ...profile, hasDependents: event.target.checked })
                }
              />
              Dependents in household
            </label>
            <label>
              <input
                type="checkbox"
                checked={profile.isStudent}
                onChange={(event) =>
                  setProfile({ ...profile, isStudent: event.target.checked })
                }
              />
              Student
            </label>
            <label>
              <input
                type="checkbox"
                checked={profile.isVeteran}
                onChange={(event) =>
                  setProfile({ ...profile, isVeteran: event.target.checked })
                }
              />
              Veteran
            </label>
          </div>

          <fieldset className="needs">
            <legend>Urgent needs</legend>
            {needOptions.map((need) => (
              <button
                key={need.id}
                type="button"
                className={
                  profile.urgentNeeds.includes(need.id) ? "selected" : ""
                }
                onClick={() => toggleNeed(need.id)}
              >
                {need.label}
              </button>
            ))}
          </fieldset>

          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Matching..." : "Find likely benefits"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <section className="results" aria-live="polite">
          <div className="resultsHeader">
            <p className="kicker">Official-source ranking</p>
            <h2>Recommended next steps</h2>
          </div>
          {results.length === 0 ? (
            <div className="emptyState">
              <strong>No profile sent yet.</strong>
              <p>
                Complete the form to see likely matches and document checklists.
              </p>
            </div>
          ) : (
            results.map((result) => (
              <article className="resultCard" key={result.resource.id}>
                <div>
                  <span className="badge">{result.match_level}</span>
                  <h3>{result.resource.name}</h3>
                  <p>{result.next_action}</p>
                </div>
                <div className="resultMeta">
                  <span>{result.resource.category}</span>
                  <span>{result.resource.geography}</span>
                </div>
                <ul>
                  {result.reasons.slice(0, 3).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {result.blockers.length > 0 ? (
                  <p className="blocker">Check: {result.blockers.join("; ")}</p>
                ) : null}
                <div className="actions">
                  <a
                    href={result.resource.official_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open official site
                  </a>
                  <a
                    href={result.resource.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View source
                  </a>
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}
