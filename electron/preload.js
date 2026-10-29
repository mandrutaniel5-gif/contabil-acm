// Punte minimă între pagină și procesul principal: doar cereri HTTP către serviciile permise (ANAF, BNR).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('acmHost', {
  fetch: (url, opts) => ipcRenderer.invoke('acm-fetch', url, opts),
});
