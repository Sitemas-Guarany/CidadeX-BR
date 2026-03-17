// CidadeX-BR — Chrome Extension Background Service Worker
// Opens the published PWA when the extension icon is clicked.

const APP_URL = "https://cidadex-br.lovable.app";

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: APP_URL });
});
