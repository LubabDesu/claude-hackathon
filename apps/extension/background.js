const API_BASE_URL = "http://localhost:8001";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "GUIDE_PAGE") {
    return false;
  }

  fetch(`${API_BASE_URL}/guide/page`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message.payload)
  })
    .then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.detail || "Guide service rejected this page.");
      }
      sendResponse({ ok: true, body });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});
