# 📥 Incoming Images — Auto-Upload Folder

Drop product images here. The watcher will:

1. **Detect** the file (~2 seconds polling)
2. **Flatten transparency** onto white background
3. **Resize** to max 1000px on the longest side
4. **Convert** to WebP (quality 85)
5. **Save** to `public/products/{filename}.webp`
6. **Update** `demo-data.ts` to point to the new image
7. **Delete** the source file from this folder

## 📛 Filename Convention

The filename **must start with the product ID** (e.g. `p1`, `p47`, `p152`).

✅ **Valid filenames:**
- `p1.png` → saves as `public/products/p1.webp`
- `p47.jpg` → saves as `public/products/p47.webp`
- `p152.webp` → re-encodes & saves as `public/products/p152.webp`
- `p31-aashirvaad-atta-5kg.png` → saves as `public/products/p31.webp` (extra text ignored)
- `P80.jpeg` → case-insensitive, saves as `public/products/p80.webp`

❌ **Invalid filenames** (will be renamed `.skipped` and ignored):
- `aashirvaad.png` (no product ID)
- `tomato.jpg`
- `IMG_1234.heic` (not a supported format)

## 🟢 Supported Formats

PNG · JPG · JPEG · WebP

## ▶️ Start the Watcher

```bash
npm run watch-images
```

Or directly:

```bash
python3 scripts/watch-images.py
```

Then drag-drop any product image into this folder. Wait ~2 sec and check the console.

## 🛑 Stop the Watcher

Press `Ctrl+C` in the terminal.

---

**Tip:** You can find product IDs by opening `src/lib/demo-data.ts` — every line starts with `p("p1", ...)`, `p("p47", ...)`, etc.
