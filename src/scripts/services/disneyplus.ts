const resourceUrl = chrome.runtime.getURL('public/services/disneyplus.js');
const s = document.createElement('script');
s.src = resourceUrl;
(document.head || document.documentElement).appendChild(s);
