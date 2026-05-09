const language = document.querySelector("#language");
const task = document.querySelector("#task");
const start = document.querySelector("#start");
const stop = document.querySelector("#stop");
const status = document.querySelector("#status");

chrome.storage.local.get(["language", "task"]).then((data) => {
  if (data.language) language.value = data.language;
  if (data.task) task.value = data.task;
});

start.addEventListener("click", async () => {
  status.textContent = "Reading visible fields on this page...";
  await chrome.storage.local.set({ language: language.value, task: task.value });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    status.textContent = "No active tab found.";
    return;
  }
  chrome.tabs.sendMessage(
    tab.id,
    { type: "START_GUIDE", language: language.value, task: task.value },
    (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = "Refresh the page, then try again.";
        return;
      }
      status.textContent = response?.ok
        ? "Guidance is visible on the page."
        : response?.error || "Could not guide this page.";
    }
  );
});

stop.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "STOP_GUIDE" });
  }
  status.textContent = "Speech stopped.";
});

