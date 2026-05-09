const API_BASE = "http://localhost:8001";

const GUIDE_DOMAINS = ["benefitscal.com", "getcalfresh.org"];

const BUTTON_LABELS = {
  "simplified chinese": { explain: "📖 解释", ask: "🎙 提问", listening: "⏹ 停止", thinking: "思考中…", transcribing: "转录中…", error: "服务暂时不可用，请重试。" },
  "spanish":            { explain: "📖 Explicar", ask: "🎙 Preguntar", listening: "⏹ Detener", thinking: "Pensando…", transcribing: "Transcribiendo…", error: "Servicio no disponible, intente de nuevo." },
  "vietnamese":         { explain: "📖 Giải thích", ask: "🎙 Hỏi", listening: "⏹ Dừng", thinking: "Đang xử lý…", transcribing: "Đang chép…", error: "Dịch vụ không khả dụng, thử lại." },
  "arabic":             { explain: "📖 شرح", ask: "🎙 سؤال", listening: "⏹ توقف", thinking: "جارٍ التفكير…", transcribing: "جارٍ النسخ…", error: "الخدمة غير متاحة، حاول مجدداً." },
  "korean":             { explain: "📖 설명", ask: "🎙 질문", listening: "⏹ 중지", thinking: "생각 중…", transcribing: "변환 중…", error: "서비스를 사용할 수 없습니다. 다시 시도하세요." },
  "tagalog":            { explain: "📖 Ipaliwanag", ask: "🎙 Magtanong", listening: "⏹ Itigil", thinking: "Nag-iisip…", transcribing: "Nagte-transcribe…", error: "Hindi available ang serbisyo, subukang muli." },
  "somali":             { explain: "📖 Sharax", ask: "🎙 Su'aal", listening: "⏹ Jooji", thinking: "Waxaa la fikirayo…", transcribing: "Waxaa la qorayo…", error: "Adeegga ma heli karo, isku day mar kale." },
  "english":            { explain: "📖 Explain", ask: "🎙 Ask", listening: "⏹ Stop", thinking: "Thinking…", transcribing: "Transcribing…", error: "Service unavailable, please try again." },
};

function getLabels(language) {
  return BUTTON_LABELS[(language || "english").toLowerCase()] ?? BUTTON_LABELS["english"];
}

if (GUIDE_DOMAINS.some((d) => location.hostname.includes(d))) {
  injectWidget();
}

function injectWidget() {
  if (document.getElementById("bn-widget")) return;

  const widget = document.createElement("div");
  widget.id = "bn-widget";
  widget.innerHTML = `
    <div id="bn-buttons">
      <button id="bn-explain">📖 Explain</button>
      <button id="bn-mic">🎙 Ask</button>
    </div>
    <div id="bn-text" hidden></div>
  `;
  document.body.appendChild(widget);

  widget.querySelector("#bn-explain").addEventListener("click", handleExplain);
  widget.querySelector("#bn-mic").addEventListener("click", handleMic);

  // Set button labels from stored language
  getLanguage().then((lang) => {
    const labels = getLabels(lang);
    widget.querySelector("#bn-explain").textContent = labels.explain;
    widget.querySelector("#bn-mic").textContent = labels.ask;
  });
}

async function handleExplain() {
  const explainBtn = document.getElementById("bn-explain");
  const micBtn = document.getElementById("bn-mic");
  const textDiv = document.getElementById("bn-text");

  setButtons(explainBtn, micBtn, true);
  setText(textDiv, "…");

  const language = await getLanguage();
  const payload = buildPayload(language);

  try {
    const res = await fetch(`${API_BASE}/guide/page`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`guide ${res.status}`);
    const data = await res.json();
    setText(textDiv, data.narration);
    showActionButton(data.selector, language);
    highlight(data.selector);
    await speak(data.narration, language);
  } catch {
    const labels = getLabels(language);
    setText(textDiv, labels.error ?? "Could not reach guide service.");
  } finally {
    setButtons(explainBtn, micBtn, false);
  }
}

async function handleMic() {
  const explainBtn = document.getElementById("bn-explain");
  const micBtn = document.getElementById("bn-mic");
  const textDiv = document.getElementById("bn-text");

  if (micBtn.dataset.recording) {
    micBtn._recorder?.stop();
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    setText(textDiv, "Microphone access denied.");
    return;
  }

  const chunks = [];
  const recorder = new MediaRecorder(stream);
  micBtn._recorder = recorder;

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    delete micBtn._recorder;
    micBtn.removeAttribute("data-recording");
    const lang2 = await getLanguage();
    const labels2 = getLabels(lang2);
    micBtn.textContent = labels2.ask;
    setButtons(explainBtn, micBtn, true);
    setText(textDiv, labels2.transcribing);

    try {
      const blob = new Blob(chunks, { type: "audio/webm" });
      if (blob.size < 1000) {
        setText(textDiv, labels2.error ?? "Recording too short.");
        setButtons(explainBtn, micBtn, false);
        return;
      }
      const form = new FormData();
      form.append("audio", blob, "question.webm");
      form.append("language", lang2);

      const transcribeRes = await fetch(`${API_BASE}/transcribe`, {
        method: "POST",
        body: form,
      });
      if (!transcribeRes.ok) throw new Error(`transcribe ${transcribeRes.status}`);
      const { text } = await transcribeRes.json();

      if (!text?.trim()) {
        setText(textDiv, labels2.error ?? "Could not hear you. Try again.");
        setButtons(explainBtn, micBtn, false);
        return;
      }

      setText(textDiv, `"${text}"\n\n${labels2.thinking}`);

      const language = await getLanguage();
      const payload = buildPayload(language, text);

      const guideRes = await fetch(`${API_BASE}/guide/page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!guideRes.ok) throw new Error(`guide ${guideRes.status}`);
      const data = await guideRes.json();
      setText(textDiv, data.narration);
      showActionButton(data.selector, language);
      highlight(data.selector);
      await speak(data.narration, language);
    } catch {
      setText(textDiv, labels2.error ?? "Service unavailable.");
    } finally {
      setButtons(explainBtn, micBtn, false);
    }
  };

  const lang = await getLanguage();
  const labels = getLabels(lang);
  micBtn.dataset.recording = "1";
  micBtn.textContent = labels.listening;
  setText(textDiv, "🔴 " + labels.listening.replace("⏹ ", ""));
  recorder.start();
}

function showActionButton(selector, language) {
  document.getElementById("bn-action")?.remove();
  if (!selector) return;
  const target = document.querySelector(selector);
  if (!target) return;
  const tag = target.tagName.toLowerCase();
  if (tag !== "button" && tag !== "a" && target.getAttribute("role") !== "button") return;

  const label = (target.innerText || target.textContent || target.getAttribute("aria-label") || "").trim().slice(0, 40);
  if (!label) return;

  const btn = document.createElement("button");
  btn.id = "bn-action";
  btn.textContent = `👆 ${label}`;
  btn.addEventListener("click", () => {
    target.click();
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    btn.remove();
  });
  document.getElementById("bn-widget").appendChild(btn);
}

async function speak(text, language) {
  if (!text) return;
  try {
    const res = await fetch(`${API_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch {
    // edge-tts unavailable — silent fallback
  }
}

function buildPayload(language, userQuestion = null) {
  const fields = Array.from(
    document.querySelectorAll("input, select, textarea, button, a")
  )
    .filter(isVisible)
    .slice(0, 25)
    .map((el, i) => ({
      selector: selectorFor(el, i),
      label: labelFor(el),
      kind: el.tagName.toLowerCase(),
    }))
    .filter((f) => f.label);

  const visibleText = Array.from(
    document.querySelectorAll("h1,h2,h3,p,li,button,a,label")
  )
    .filter(isVisible)
    .map((el) => normalize(el.innerText || el.textContent || ""))
    .filter(Boolean)
    .slice(0, 35);

  return {
    url: window.location.href,
    language,
    fields,
    visibleText,
    ...(userQuestion ? { user_question: userQuestion } : {}),
  };
}

function getLanguage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["language"], (stored) => {
      resolve(stored.language || "English");
    });
  });
}

function setText(div, text) {
  div.textContent = text;
  div.hidden = !text;
}

function setButtons(explainBtn, micBtn, disabled) {
  explainBtn.disabled = disabled;
  micBtn.disabled = disabled;
}

let highlightedElement = null;

function highlight(selector) {
  if (highlightedElement) {
    highlightedElement.classList.remove("bn-highlight");
    highlightedElement = null;
  }
  if (!selector) return;
  highlightedElement = document.querySelector(selector);
  if (highlightedElement) {
    highlightedElement.classList.add("bn-highlight");
    highlightedElement.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function selectorFor(el, index) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const attr = el.getAttribute("name") || el.getAttribute("aria-label");
  if (attr)
    return `${el.tagName.toLowerCase()}[${el.getAttribute("name") ? "name" : "aria-label"}="${cssString(attr)}"]`;
  el.dataset.bnIndex = String(index);
  return `[data-bn-index="${index}"]`;
}

function labelFor(el) {
  const aria = el.getAttribute("aria-label");
  const id = el.id;
  // 1. for/id link
  const linkedLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  if (aria) return normalize(aria);
  if (linkedLabel?.innerText) return normalize(linkedLabel.innerText);
  // 2. input wrapped inside <label>
  const parentLabel = el.closest("label");
  if (parentLabel?.innerText) return normalize(parentLabel.innerText);
  // 3. preceding sibling <label> (React pattern: <label>text</label><input>)
  let prev = el.previousElementSibling;
  while (prev) {
    if (prev.tagName === "LABEL") return normalize(prev.innerText || prev.textContent || "");
    prev = prev.previousElementSibling;
  }
  // 4. first <label> in parent container
  const siblingLabel = el.parentElement?.querySelector("label");
  if (siblingLabel) return normalize(siblingLabel.innerText || "");
  // 5. placeholder / name / innerText fallback
  const placeholder = el.getAttribute("placeholder");
  const text = normalize(el.innerText || el.textContent || "");
  return normalize(placeholder || text || el.getAttribute("name") || "");
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function cssString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
