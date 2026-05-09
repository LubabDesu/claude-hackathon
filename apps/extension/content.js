let highlightedElement = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "STOP_GUIDE") {
    window.speechSynthesis.cancel();
    clearHighlight();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type !== "START_GUIDE") {
    return false;
  }

  const payload = buildPayload(message.language, message.task);
  chrome.runtime.sendMessage({ type: "GUIDE_PAGE", payload }, (response) => {
    if (!response?.ok) {
      renderPanel({
        steps: [
          {
            spoken_text: response?.error || "The guide service is not available.",
            user_action: "Start the local FastAPI server and try again.",
            safety_warning: "No page data was stored.",
            confidence: "low"
          }
        ]
      });
      sendResponse({ ok: false, error: response?.error });
      return;
    }
    renderPanel(response.body);
    speak(response.body.steps?.[0]?.spoken_text);
    highlight(response.body.steps?.[0]?.visual_highlight_selector);
    sendResponse({ ok: true });
  });

  return true;
});

function buildPayload(language, task) {
  const fields = Array.from(
    document.querySelectorAll("input, select, textarea, button, a")
  )
    .filter((element) => isVisible(element))
    .slice(0, 25)
    .map((element, index) => ({
      selector: selectorFor(element, index),
      label: labelFor(element),
      kind: element.tagName.toLowerCase()
    }))
    .filter((field) => field.label);

  const visibleText = Array.from(document.querySelectorAll("h1,h2,h3,p,li,button,a,label"))
    .filter((element) => isVisible(element))
    .map((element) => normalize(element.innerText || element.textContent || ""))
    .filter(Boolean)
    .slice(0, 35);

  return {
    url: window.location.href,
    language,
    task,
    fields,
    visibleText
  };
}

function renderPanel(body) {
  document.querySelector("#bn-guide-panel")?.remove();
  const panel = document.createElement("section");
  panel.id = "bn-guide-panel";
  panel.innerHTML = `
    <header>
      <div>
        <strong>Benefits Guide</strong>
        <small>${escapeHtml(body.stop_reason || body.disclaimer || "Session-only guidance")}</small>
      </div>
      <button type="button" id="bn-close">Close</button>
    </header>
    <ol>
      ${(body.steps || [])
        .map(
          (step, index) => `
            <li>
              <button type="button" data-step="${index}">Speak</button>
              <div>${escapeHtml(step.user_action)}</div>
              ${step.safety_warning ? `<p class="bn-warning">${escapeHtml(step.safety_warning)}</p>` : ""}
            </li>
          `
        )
        .join("")}
    </ol>
  `;
  document.body.appendChild(panel);
  panel.querySelector("#bn-close").addEventListener("click", () => {
    window.speechSynthesis.cancel();
    clearHighlight();
    panel.remove();
  });
  panel.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const step = body.steps[Number(button.dataset.step)];
      speak(step.spoken_text);
      highlight(step.visual_highlight_selector);
    });
  });
}

function speak(text) {
  if (!text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.94;
  window.speechSynthesis.speak(utterance);
}

function highlight(selector) {
  clearHighlight();
  if (!selector) return;
  highlightedElement = document.querySelector(selector);
  if (highlightedElement) {
    highlightedElement.classList.add("bn-highlight");
    highlightedElement.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function clearHighlight() {
  if (highlightedElement) {
    highlightedElement.classList.remove("bn-highlight");
    highlightedElement = null;
  }
}

function selectorFor(element, index) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const attr = element.getAttribute("name") || element.getAttribute("aria-label");
  if (attr) return `${element.tagName.toLowerCase()}[${element.getAttribute("name") ? "name" : "aria-label"}="${cssString(attr)}"]`;
  element.dataset.bnIndex = String(index);
  return `[data-bn-index="${index}"]`;
}

function labelFor(element) {
  const aria = element.getAttribute("aria-label");
  const text = normalize(element.innerText || element.textContent || "");
  const placeholder = element.getAttribute("placeholder");
  const id = element.id;
  const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  return normalize(aria || label?.innerText || placeholder || text || element.getAttribute("name") || "");
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

