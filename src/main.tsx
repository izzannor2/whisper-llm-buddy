import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-register calculator plugin
import './plugins/calculator';

// ===== AraChat → LocalDev AI Migration =====
(function migrateLegacy() {
  if (localStorage.getItem('localdev-migrated')) return;
  
  let migrated = 0;
  
  // Migrate localStorage keys: arachat-* → localdev-*
  const keysToMigrate: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('arachat-')) keysToMigrate.push(key);
  }
  for (const key of keysToMigrate) {
    const newKey = key.replace('arachat-', 'localdev-');
    if (!localStorage.getItem(newKey)) {
      const value = localStorage.getItem(key);
      if (value) { localStorage.setItem(newKey, value); migrated++; }
    }
    localStorage.removeItem(key);
  }
  
  // Migrate IndexedDB: AraChat → LocalDevAI
  if (typeof indexedDB !== 'undefined') {
    const openOld = indexedDB.open('AraChat', 1);
    openOld.onsuccess = () => {
      const oldDb = openOld.result;
      if (!oldDb.objectStoreNames.contains('conversations')) { oldDb.close(); return; }
      const tx = oldDb.transaction('conversations', 'readonly');
      const store = tx.objectStore('conversations');
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        const conversations = getAll.result || [];
        if (conversations.length === 0) { oldDb.close(); return; }
        // Copy to new DB
        const openNew = indexedDB.open('LocalDevAI', 1);
        openNew.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('conversations')) {
            const s = db.createObjectStore('conversations', { keyPath: 'id' });
            s.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        };
        openNew.onsuccess = () => {
          const newDb = openNew.result;
          const newTx = newDb.transaction('conversations', 'readwrite');
          const newStore = newTx.objectStore('conversations');
          for (const conv of conversations) { newStore.put(conv); migrated++; }
          newTx.oncomplete = () => {
            newDb.close();
            // Delete old DB
            indexedDB.deleteDatabase('AraChat');
          };
        };
      };
      tx.oncomplete = () => oldDb.close();
    };
    openOld.onerror = () => {};
  }
  
  if (migrated > 0) console.log(`[Migration] Migrated ${migrated} legacy storage keys/records`);
  localStorage.setItem('localdev-migrated', 'true');
})();

// Register service worker only for production builds.
// Vite preview/dev serves React through /node_modules/.vite chunks; caching those
// can mix old React and ReactDOM chunks and trigger invalid hook calls.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.filter((key) => key.startsWith('arachat-') || key.startsWith('localdev-')).map((key) => caches.delete(key))))
          .catch(() => {});
      }
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[App] Service worker registered:', registration.scope);
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[App] New content available, refresh to update');
              }
            });
          }
        });
      })
      .catch((error) => {
        console.log('[App] Service worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
