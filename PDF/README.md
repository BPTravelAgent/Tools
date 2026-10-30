# iLovePDF Pro - Web-based PDF Editor & TrueEdit™ Pro

A complete, high-fidelity clone of **iLovePDF Pro's Edit PDF & TrueEdit™**, built with modern web technologies:
- **TypeScript + Vite** for ultra-fast performance.
- **PDF.js** for crisp, high-DPI PDF page rendering and text layer coordinate extraction.
- **TrueEdit™ Pro Engine** allowing users to click and edit existing text directly in the PDF document!
- **Annotation & Vector Drawing Engine** for adding text, shapes, freehand drawing, images/stamps, and whiteout redaction.
- **pdf-lib** for 100% client-side, private, zero-server vector PDF generation and downloading with no watermarks.

---

## 🚀 Quick Start (පටන් ගන්නා ආකාරය)

### 1. Run Development Server
Double-click `start.bat` OR run in terminal:
```bash
npm run dev
```
Then open your browser at **http://localhost:5173**.

### 2. Build for Production
```bash
npm run build
npm run preview
```

---

## ✨ Features Breakdown (විශේෂාංග)

### 👑 1. TrueEdit™ Pro Mode (iLovePDF Pro Feature)
- Switch between **Annotate** and **Edit (TrueEdit Pro with Gold Crown 👑)** at the top toolbar.
- When in **Edit (Pro)** mode:
  - Hover over **any existing text** in your PDF document to see interactive bounding boxes.
  - **Click directly on the text** to edit it in place (fix typos, update names, dates, amounts, etc.).
  - The editor automatically masks the old text on the PDF and places your revised text with matching font and size.
  - Track all changes in the right-side **TrueEdit™ Pro Edits** panel with one-click **Revert** capability.

### ✍️ 2. Annotate Mode
- **Text Tool**: Add custom text anywhere with custom font family (**`DM Sans`** and **`Libre Baskerville`** from your `Fornt/` folder, plus `Arial`, `Times New Roman`, `Courier`, `Comic Sans`, `Impact`), font size, bold, italic, underline, text color, and background highlight.
- **Embedded Custom Fonts**: Full true-type vector embedding via `@pdf-lib/fontkit` ensures your `DM Sans` and `Libre Baskerville` fonts export crisply in the downloaded PDF.
- **Shapes Tool**: Add Rectangles, Ellipses/Circles, Lines, Arrows, Checkmarks (✓), and Crosses (✕). Customize stroke color, fill color, stroke width, and opacity.
- **Freehand Drawing / Signature**: Draw freehand lines or sign documents with customizable pen color and brush thickness.
- **Image / Stamp Tool**: Insert PNG, JPG, or SVG signatures and stamps with resize and rotate handles.
- **Whiteout / Redact Tool**: Quickly mask or erase any area with whiteout.

### 📑 3. Page Management (Left Sidebar)
- Live thumbnail previews for every page.
- Rotate pages **90° Clockwise or Counter-Clockwise**.
- **Delete** any page with confirmation.
- **Add Blank Page** button.
- Collapse / expand the thumbnail panel.

### 🎨 4. Elements & Layers Management (Right Sidebar)
- View all elements on the active page.
- Reorder layers: **Bring to Front** or **Send to Back**.
- Delete individual elements or **Remove All**.

### 🔍 5. Interactive Viewport & Viewbar
- Zoom In (`+`), Zoom Out (`-`), Zoom percentage display.
- **Fit Width** & **Fit Page** shortcuts.
- Smooth page navigation (`Previous` / `Next` Page).
- 8 corner & edge transform resize handles + top rotation handle for all annotations.

### 💾 6. Client-Side PDF Export (`pdf-lib`)
- Click **"Save changes"** to compile all annotations, drawings, images, and TrueEdit modifications into a real PDF.
- 100% client-side: **zero data leaves your browser**, ensuring complete privacy and bank-grade security.
- Instant download with automatic filename: `[document_name]_edited.pdf`.
- Celebratory confetti animation upon successful save!

