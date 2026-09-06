# Listing 📝🛒📖

A gentle watercolor **To-Do / Shopping / Diary** workstation for your phone.
Cute, rounded, offline-first. No account, no backend, no ads — your data lives
only in your browser via **IndexedDB**.

## ✨ Features
- **Date + Weekday** header that updates automatically
- **To-Do List** card — add, complete, clear done
- **Shopping List** card — add items with quantity, mark bought
- **Daily Diaries / Emotion** card — mood picker, free text, **photo attachments**
- 🫧 Falling bubble animation, watercolor palette (`#4ba7ca` + `#ffb6c1`)
- 💾 **IndexedDB** local auto-save — nothing lost when you close the tab
- ↩ **Backup / Restore** (JSON export) + a gentle weekly backup reminder
- 🖨️ **A4 print** that shows every photo and entry
- Font: **TC Antiquated Sans** (personal-use license by Tom Chalky)

## 🚀 Use it
Just open `index.html` in your browser — or visit the deployed link.
On mobile, **Add to Home Screen** for a full-screen app experience.

## 🛡️ Your data is safe
- Everything is stored locally with `navigator.storage.persist()`.
- Use **Backup** regularly to download a JSON file you can keep safe.
- If browser data is ever cleared, **Restore** from your backup file.

## 📁 Structure
```
index.html              page
css/styles.css          watercolor styles + A4 print
js/app.js               IndexedDB + all logic
assets/fonts/           TCAntiquatedSans-Regular.otf
```

## License note
The TC Antiquated Sans font is **personal-use only** (© Tom Chalky, dafont.com).
The app code is free to use for your own personal productivity.
