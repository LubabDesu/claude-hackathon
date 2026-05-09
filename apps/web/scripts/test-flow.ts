import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { Stagehand, type ModelConfiguration } from "@browserbasehq/stagehand";

type StagehandPage = ReturnType<Stagehand["context"]["pages"]>[number];

loadEnv({ path: ".env.local", override: false });

const START_URL = "https://www.getcalfresh.org/en/";
const DEFAULT_GROQ_MODEL = "groq/openai/gpt-oss-120b";
const DEFAULT_OLLAMA_MODEL = "ollama/gpt-oss:120b";
const DEFAULT_GEMINI_MODEL = "google/gemini-2.5-flash";

const intake = {
  zip: "94102",
  householdSize: 3,
  monthlyIncome: 2200
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is required. Add it to apps/web/.env.local before running this script.`
    );
  }

  return value;
}

function buildModelConfig(): ModelConfiguration {
  const stagehandModel = process.env.STAGEHAND_MODEL;
  const groqApiKey = process.env.GROQ_API_KEY;
  const ollamaApiKey = process.env.OLLAMA_API_KEY;

  if (groqApiKey) {
    const modelName = stagehandModel || DEFAULT_GROQ_MODEL;

    console.log(`[stagehand] Using model ${modelName}`);
    return {
      modelName,
      apiKey: groqApiKey
    };
  }

  if (ollamaApiKey) {
    const modelName = stagehandModel || DEFAULT_OLLAMA_MODEL;

    console.log(`[stagehand] Using model ${modelName}`);
    return {
      modelName,
      baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/api",
      headers: {
        Authorization: `Bearer ${ollamaApiKey}`
      }
    } as unknown as ModelConfiguration;
  }

  const modelName = stagehandModel || DEFAULT_GEMINI_MODEL;
  console.log(`[stagehand] Using model ${modelName}`);
  return {
    modelName,
    apiKey: requireEnv("GEMINI_API_KEY")
  };
}

async function logAndAct(stagehand: Stagehand, step: string, instruction: string) {
  console.log(`[stagehand] ${step}`);
  await stagehand.act(instruction, { timeout: 60_000 });
}

async function logAndNavigate(page: StagehandPage, url: string) {
  console.log(`[stagehand] Navigate to ${url}`);
  await page.goto(url);
  await page.waitForLoadState("load", 60_000);
}

async function getPageText(page: StagehandPage): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

async function clickVisibleByText(
  page: StagehandPage,
  step: string,
  labels: string[],
  options: { exact?: boolean } = {}
): Promise<boolean> {
  console.log(`[stagehand] ${step}`);
  const result = await page.evaluate(
    ({ labels: candidateLabels, exact }) => {
      try {
        const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
        const candidates = Array.from(
          document.querySelectorAll(
            "button, a, [role='button'], input[type='button'], input[type='submit']"
          )
        );

        const isVisible = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        };

        const targetLabels = candidateLabels.map(normalize);
        const matchesText = (text: string) =>
          targetLabels.some((label) =>
            exact ? text === label : text === label || text.includes(label)
          );

        const matches = candidates
          .filter((element): element is HTMLElement => element instanceof HTMLElement)
          .map((element) => {
            const rawText =
              element.innerText ||
              element.textContent ||
              element.getAttribute("aria-label") ||
              element.getAttribute("value") ||
              "";
            const text = normalize(rawText);
            const inFooter = Boolean(element.closest("footer"));
            const inHeaderOrNav = Boolean(element.closest("header, nav"));
            const isButton = element.tagName.toLowerCase() === "button";
            const visible = isVisible(element);
            const score =
              (matchesText(text) ? 100 : 0) +
              (isButton ? 20 : 0) +
              (visible ? 10 : 0) -
              (inHeaderOrNav ? 40 : 0) -
              (inFooter ? 80 : 0);

            return { element, score, text };
          })
          .filter((match) => match.score >= 100)
          .sort((first, second) => second.score - first.score);

        for (const match of matches) {
          const { element } = match;

          if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") {
            continue;
          }

          element.scrollIntoView({ block: "center", inline: "center" });
          element.focus();
          element.click();
          return { clicked: true, error: "", text: match.text };
        }

        return { clicked: false, error: "", text: "" };
      } catch (error) {
        return {
          clicked: false,
          error: error instanceof Error ? error.message : String(error),
          text: ""
        };
      }
    },
    { labels, exact: options.exact ?? false }
  );

  if (result.error) {
    console.log(`[stagehand] Deterministic click failed: ${result.error}`);
  }

  await page.waitForTimeout(1_500);
  if (result.clicked) {
    console.log(`[stagehand] Clicked "${result.text}"`);
  }
  return result.clicked;
}

async function fillVisibleFieldByLabel(
  page: StagehandPage,
  step: string,
  labelPatterns: string[],
  value: string
): Promise<boolean> {
  console.log(`[stagehand] ${step}`);
  const filled = await page.evaluate(
    ({ labelPatterns: patterns, value: fieldValue }) => {
      const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
      const normalizedPatterns = patterns.map(normalize);
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          "input:not([type='hidden']):not([disabled]), textarea:not([disabled])"
        )
      );

      const isVisible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };

      const textForInput = (input: HTMLInputElement | HTMLTextAreaElement) => {
        const parts: string[] = [
          input.getAttribute("aria-label"),
          input.getAttribute("placeholder"),
          input.getAttribute("name"),
          input.id
        ].filter((part): part is string => Boolean(part));

        if (input.id) {
          const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(input.id)}"]`);
          if (label?.innerText) {
            parts.push(label.innerText);
          }
        }

        const nearestLabel = input.closest("label");
        if (nearestLabel?.innerText) {
          parts.push(nearestLabel.innerText);
        }

        const nearbyText = input.closest("div, section, fieldset")?.textContent;
        if (nearbyText) {
          parts.push(nearbyText);
        }

        return normalize(parts.join(" "));
      };

      for (const input of inputs) {
        if (!isVisible(input)) {
          continue;
        }

        const searchableText = textForInput(input);
        const matches = normalizedPatterns.some((pattern) => searchableText.includes(pattern));

        if (!matches) {
          continue;
        }

        input.scrollIntoView({ block: "center", inline: "center" });
        input.focus();
        input.value = fieldValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      return false;
    },
    { labelPatterns, value }
  );

  await page.waitForTimeout(1_000);
  return filled;
}

async function clickNextUntil(
  page: StagehandPage,
  targetPattern: RegExp,
  options: { maxClicks: number; step: string }
) {
  console.log(`[stagehand] ${options.step}`);

  for (let index = 0; index < options.maxClicks; index += 1) {
    const pageText = await getPageText(page);

    if (targetPattern.test(pageText)) {
      console.log(`[stagehand] Target reached after ${index} clicks`);
      return;
    }

    const clicked = await clickVisibleByText(page, `Click Next/Continue (${index + 1})`, [
      "Next",
      "Continue",
      "Save and continue"
    ]);

    if (!clicked) {
      console.log("[stagehand] Next/Continue not found; scrolling one page");
      await page.scroll(640, 420, 0, 450);
      await page.waitForTimeout(750);
    }
  }

  throw new Error(`Could not reach target page for: ${options.step}`);
}

async function getActivePage(stagehand: Stagehand) {
  const pages = stagehand.context.pages();
  return pages[pages.length - 1] ?? pages[0];
}

async function main() {
  const stagehand = new Stagehand({
    env: "LOCAL",
    model: buildModelConfig(),
    localBrowserLaunchOptions: {
      headless: false,
      viewport: {
        width: 1280,
        height: 900
      }
    },
    verbose: 1,
    disablePino: true,
    actTimeoutMs: 60_000,
    domSettleTimeout: 2_000
  });

  try {
    console.log("[stagehand] Initialize local browser");
    await stagehand.init();

    let page = await getActivePage(stagehand);
    await logAndNavigate(page, START_URL);

    await logAndAct(
      stagehand,
      "Open the CalFresh application handoff",
      "Click the main button or link that starts the CalFresh application or applies on BenefitsCal."
    );

    await page.waitForTimeout(3_000);
    page = await getActivePage(stagehand);
    console.log(`[stagehand] Current page: ${page.url()}`);

    const clickedBegin = await clickVisibleByText(page, "Click BenefitsCal Begin", ["Begin"], {
      exact: true
    });

    if (!clickedBegin) {
      await logAndAct(
        stagehand,
        "Fallback click BenefitsCal Begin",
        "Click the Begin button in the main page content. Do not click header navigation, footer links, language controls, account sign-in links, or Apply for Benefits navigation."
      );
    }

    await page.waitForTimeout(2_000);

    await clickNextUntil(page, /application summary|start/i, {
      maxClicks: 8,
      step: "Advance intro screens to application summary"
    });

    await page.waitForTimeout(2_000);

    const clickedStart = await clickVisibleByText(page, "Start from application summary", ["Start"], {
      exact: true
    });

    if (!clickedStart) {
      await logAndAct(
        stagehand,
        "Fallback start from application summary",
        "On the Application Summary page, click the Start button to begin entering application information. Do not click browser, header, footer, language, or account controls."
      );
    }

    await page.waitForTimeout(2_000);

    await clickNextUntil(page, /zip|zipcode|postal|address|home address/i, {
      maxClicks: 8,
      step: "Advance to ZIP or address field"
    });

    const filledZip = await fillVisibleFieldByLabel(page, "Enter ZIP code", [
      "zip",
      "zipcode",
      "postal"
    ], intake.zip);

    if (!filledZip) {
      await logAndAct(
        stagehand,
        "Fallback enter ZIP code",
        `Enter ZIP code ${intake.zip} into the ZIP code field and continue.`
      );
    } else {
      await clickVisibleByText(page, "Continue after ZIP code", ["Next", "Continue", "Save and continue"]);
    }

    await logAndAct(
      stagehand,
      "Set household size",
      `Set the household size or number of people in the home to ${intake.householdSize} and continue.`
    );

    await logAndAct(
      stagehand,
      "Enter monthly income",
      `Enter monthly income before taxes as ${intake.monthlyIncome} and continue.`
    );

    await logAndAct(
      stagehand,
      "Answer children question",
      "If asked whether anyone in the household is a child, answer yes and continue."
    );

    await logAndAct(
      stagehand,
      "Answer required remaining screener fields",
      "Continue through any remaining eligibility screener questions with ordinary deterministic answers: California resident, not currently receiving CalFresh, no disability, no student status, no senior household member, no migrant or seasonal farm worker status, no expedited service emergency, and prefer not to provide optional contact details. Continue until an eligibility result, benefits recommendation, sign-in requirement, account creation requirement, CAPTCHA, or identity verification page appears."
    );

    console.log(`[stagehand] Final page: ${page.url()}`);
    console.log("[stagehand] Phase 1 flow completed.");
  } finally {
    await stagehand.close();
  }
}

main().catch((error) => {
  console.error("[stagehand] Phase 1 flow failed.");
  console.error(error);
  process.exitCode = 1;
});
