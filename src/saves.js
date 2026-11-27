// Version 2 keeps its own saves. The website serves version 1 (Dhaka ⇄ Chattogram) at /mohasorok/ and this
// version at /mohasorok/v2/: the same site, so the same browser storage. v1's saves are never written here;
// the first time v2 opens, it copies them, so the company bank, bought buses and settings carry over.
// (The music files and imported skins in IndexedDB are shared; both versions read them the same way.)
export const SAVE = (k) => `mohasorok2.${k}`;
try {
  if (!localStorage.getItem(SAVE('imported'))) {
    for (const k of ['settings', 'career', 'music', 'weather', 'voice']) {
      const v1 = localStorage.getItem(`mohasorok.${k}`);
      if (v1 != null && localStorage.getItem(SAVE(k)) == null) localStorage.setItem(SAVE(k), v1);
    }
    localStorage.setItem(SAVE('imported'), '1');
  }
} catch { /* private mode: nothing saved anyway */ }
