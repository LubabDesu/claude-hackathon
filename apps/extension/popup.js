const language = document.querySelector("#language");

chrome.storage.local.get(["language"]).then((data) => {
  if (data.language) language.value = data.language;
});

language.addEventListener("change", () => {
  chrome.storage.local.set({ language: language.value });
});
