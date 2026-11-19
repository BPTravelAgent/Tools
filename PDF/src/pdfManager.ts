import * as pdfjsLib from 'pdfjs-dist';
import type { ExtractedTextItem, PageMetadata } from './types';
import { getAssetUrl } from './utils';

// Set up the PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = getAssetUrl('pdf.worker.min.js');

export class PDFManager {
  private pdfDocument: pdfjsLib.PDFDocumentProxy | null = null;
  private pdfBytes: ArrayBuffer | null = null;
  private fileName: string = 'document.pdf';
  private pagesMeta: PageMetadata[] = [];
  private extractedTexts: Map<number, ExtractedTextItem[]> = new Map();
  private thumbnailDataUrls: Map<number, string> = new Map();

  async loadPDF(data: ArrayBuffer, fileName: string = 'document.pdf'): Promise<void> {
    this.pdfBytes = data.slice(0); // clone buffer
    this.fileName = fileName;
    this.extractedTexts.clear();
    this.thumbnailDataUrls.clear();

    const standardFontDataUrl = getAssetUrl('standard_fonts/');
    const cMapUrl = getAssetUrl('cmaps/');

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(data),
      cMapUrl,
      cMapPacked: true,
      standardFontDataUrl,
    });

    this.pdfDocument = await loadingTask.promise;
    const numPages = this.pdfDocument.numPages;
    this.pagesMeta = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await this.pdfDocument.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      this.pagesMeta.push({
        pageIndex: i - 1,
        originalPageNumber: i,
        rotation: 0,
        width: viewport.width,
        height: viewport.height,
        scale: 1.0,
      });

      // Extract text content for TrueEdit Pro
      try {
        await this.extractPageText(i - 1, page, viewport);
      } catch (err) {
        console.warn(`Text extraction failed for page ${i}:`, err);
      }
    }
  }

  /**
   * Guarantees extracted text items are available for a given page index.
   * If not already cached, extracts them on demand.
   */
  async ensurePageTextExtracted(pageIndex: number): Promise<ExtractedTextItem[]> {
    const existing = this.extractedTexts.get(pageIndex);
    if (existing && existing.length > 0) {
      return existing;
    }
    if (!this.pdfDocument) return [];
    const meta = this.pagesMeta[pageIndex];
    if (!meta || meta.isBlankPage) return [];

    try {
      const page = await this.pdfDocument.getPage(meta.originalPageNumber);
      const viewport = page.getViewport({ scale: 1.0 });
      await this.extractPageText(pageIndex, page, viewport);
    } catch (err) {
      console.warn(`Fallback text extraction failed for page ${pageIndex}:`, err);
    }
    return this.extractedTexts.get(pageIndex) || [];
  }

  private async extractPageText(
    pageIndex: number,
    page: pdfjsLib.PDFPageProxy,
    viewport: pdfjsLib.PageViewport
  ): Promise<void> {
    const textContent = await page.getTextContent();
    const rawItems: ExtractedTextItem[] = [];

    // Query font metrics from page.commonObjs when available
    try {
      await page.getOperatorList();
    } catch (_) {}

    const fontCache = new Map<string, { name: string; bold: boolean }>();
    if ((page as any).commonObjs) {
      const fontPromises: Promise<void>[] = [];
      for (let i = 0; i < textContent.items.length; i++) {
        const item = textContent.items[i] as any;
        if (!item.fontName || fontCache.has(item.fontName)) continue;
        if ((page as any).commonObjs.has(item.fontName)) {
          fontPromises.push(
            new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, 150);
              try {
                (page as any).commonObjs.get(item.fontName, (fontObj: any) => {
                  clearTimeout(timer);
                  try {
                    if (fontObj) {
                      const name = fontObj.name || fontObj.loadedName || '';
                      const bold = !!(
                        fontObj.bold ||
                        fontObj.black ||
                        (typeof fontObj.weight === 'number' && fontObj.weight >= 600) ||
                        /bold|black|heavy|w[7-9]|semibold|medium/i.test(name)
                      );
                      fontCache.set(item.fontName, { name, bold });
                    }
                  } catch (_) {}
                  resolve();
                });
              } catch (_) {
                clearTimeout(timer);
                resolve();
              }
            })
          );
        }
      }
      if (fontPromises.length > 0) {
        try {
          await Promise.all(fontPromises);
        } catch (_) {}
      }
    }

    for (let i = 0; i < textContent.items.length; i++) {
      const item = textContent.items[i] as any;
      if (!item.str || item.str.replace(/[\s\u0000-\u0020\u00a0\u2000-\u200f\ufeff]/g, '').length === 0) continue;

      const style = textContent.styles ? (textContent.styles as any)[item.fontName] : null;
      const cached = fontCache.get(item.fontName);
      const fontName = cached?.name || style?.fontFamily || item.fontName || 'Helvetica';
      const isBold = cached?.bold ?? /bold|black|heavy|w[7-9]|semibold|medium/i.test(fontName + ' ' + (item.fontName || ''));

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
      
      // Calculate bounding box in PDF points (top-left origin relative to page viewport)
      const x = tx[4];
      const y = tx[5] - fontSize * 0.88;
      const width = item.width || Math.max(10, item.str.length * fontSize * 0.55);
      const height = item.height || fontSize * 1.1;
      const pdfX = item.transform[4];
      const pdfBaselineY = item.transform[5];

      rawItems.push({
        id: `text-${pageIndex}-${i}`,
        pageIndex,
        text: item.str,
        x,
        y,
        width,
        height,
        fontSize: Math.round(fontSize),
        fontName,
        bold: isBold,
        pdfX: Math.round(pdfX * 10) / 10,
        pdfBaselineY: Math.round(pdfBaselineY * 10) / 10,
      });
    }

    // Sort by y, then x
    rawItems.sort((a, b) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x));

    const merged: ExtractedTextItem[] = [];
    let curr: ExtractedTextItem | null = null;

    for (let idx = 0; idx < rawItems.length; idx++) {
      const item = rawItems[idx];
      if (!curr) {
        curr = { ...item, id: `text-block-${pageIndex}-${idx}` };
        continue;
      }

      const sameLine = Math.abs(item.y - curr.y) <= 4;
      const adjacent = item.x >= curr.x && (item.x - (curr.x + curr.width)) <= Math.max(16, curr.fontSize * 1.2);
      const sameSize = Math.abs(item.fontSize - curr.fontSize) <= 3;

      if (sameLine && adjacent && sameSize) {
        const needsSpace = (item.x - (curr.x + curr.width)) > curr.fontSize * 0.2;
        curr.text += (needsSpace ? ' ' : '') + item.text;
        curr.width = (item.x + item.width) - curr.x;
        curr.height = Math.max(curr.height, item.height);
        curr.bold = curr.bold || item.bold;
      } else {
        if (curr.text.replace(/[\s\u0000-\u0020\u00a0\u2000-\u200f\ufeff]/g, '').length > 0) {
          merged.push(curr);
        }
        curr = { ...item, id: `text-block-${pageIndex}-${idx}` };
      }
    }
    if (curr && curr.text.replace(/[\s\u0000-\u0020\u00a0\u2000-\u200f\ufeff]/g, '').length > 0) {
      merged.push(curr);
    }

    this.extractedTexts.set(pageIndex, merged);
  }

  async renderPageToCanvas(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    scale: number = 1.0
  ): Promise<{ width: number; height: number }> {
    if (!this.pdfDocument) throw new Error('No PDF document loaded');

    const meta = this.pagesMeta[pageIndex];
    if (!meta) throw new Error(`Page index ${pageIndex} not found`);

    const dpr = Math.max(2, window.devicePixelRatio || 1);

    // If page has an active cropBox, render uncropped page offscreen and blit cropped region
    if (meta.cropBox) {
      const cropW = meta.cropBox.width * scale;
      const cropH = meta.cropBox.height * scale;
      canvas.width = Math.floor(cropW * dpr);
      canvas.height = Math.floor(cropH * dpr);
      canvas.style.width = `${Math.floor(cropW)}px`;
      canvas.style.height = `${Math.floor(cropH)}px`;

      const offscreen = document.createElement('canvas');
      const savedCrop = meta.cropBox;
      meta.cropBox = undefined;
      await this.renderPageToCanvas(pageIndex, offscreen, scale);
      meta.cropBox = savedCrop;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const sx = Math.floor(savedCrop.x * scale * dpr);
        const sy = Math.floor(savedCrop.y * scale * dpr);
        const sw = Math.floor(savedCrop.width * scale * dpr);
        const sh = Math.floor(savedCrop.height * scale * dpr);
        ctx.drawImage(offscreen, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      }
      return { width: cropW, height: cropH };
    }

    // If page is an embedded Image Page
    if (meta.isImagePage && meta.imageSrc) {
      const cssWidth = meta.width * scale;
      const cssHeight = meta.height * scale;
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${Math.floor(cssWidth)}px`;
      canvas.style.height = `${Math.floor(cssHeight)}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            ctx.save();
            if (meta.rotation !== 0) {
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.rotate((meta.rotation * Math.PI) / 180);
              const drawW = (meta.rotation % 180 === 0 ? canvas.width : canvas.height);
              const drawH = (meta.rotation % 180 === 0 ? canvas.height : canvas.width);
              ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
            } else {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
            ctx.restore();
            resolve();
          };
          img.onerror = () => resolve();
          img.src = meta.imageSrc!;
        });
      }
      return { width: cssWidth, height: cssHeight };
    }

    if (meta.isBlankPage) {
      const cssWidth = meta.width * scale;
      const cssHeight = meta.height * scale;
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${Math.floor(cssWidth)}px`;
      canvas.style.height = `${Math.floor(cssHeight)}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      return { width: cssWidth, height: cssHeight };
    }

    const page = await this.pdfDocument.getPage(meta.originalPageNumber);
    const rotation = (page.rotate + meta.rotation) % 360;

    // Retina / High-DPI supersampling (at least 2x or devicePixelRatio) for crystal-clear sharp text
    const viewport = page.getViewport({ scale, rotation });

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // High quality canvas anti-aliasing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;

    const renderContext: any = {
      canvasContext: ctx,
      transform: transform,
      viewport: viewport,
      background: '#ffffff',
    };

    await page.render(renderContext).promise;

    return { width: viewport.width, height: viewport.height };
  }

  async generateThumbnail(pageIndex: number): Promise<string> {
    if (this.thumbnailDataUrls.has(pageIndex)) {
      return this.thumbnailDataUrls.get(pageIndex)!;
    }

    const offscreen = document.createElement('canvas');
    await this.renderPageToCanvas(pageIndex, offscreen, 0.22);
    const dataUrl = offscreen.toDataURL('image/jpeg', 0.85);
    this.thumbnailDataUrls.set(pageIndex, dataUrl);
    return dataUrl;
  }

  rotatePage(pageIndex: number, deltaDeg: number): void {
    const meta = this.pagesMeta[pageIndex];
    if (meta) {
      meta.rotation = (meta.rotation + deltaDeg + 360) % 360;
      if (Math.abs(deltaDeg) % 180 !== 0) {
        const tmp = meta.width;
        meta.width = meta.height;
        meta.height = tmp;
      }
      // Invalidate thumbnail
      this.thumbnailDataUrls.delete(pageIndex);
    }
  }

  rotateAllPages(deltaDeg: number): void {
    this.pagesMeta.forEach((meta, idx) => {
      meta.rotation = (meta.rotation + deltaDeg + 360) % 360;
      if (Math.abs(deltaDeg) % 180 !== 0) {
        const tmp = meta.width;
        meta.width = meta.height;
        meta.height = tmp;
      }
      this.thumbnailDataUrls.delete(idx);
    });
  }

  setPageCrop(pageIndex: number, cropBox: { x: number; y: number; width: number; height: number } | null): void {
    const meta = this.pagesMeta[pageIndex];
    if (meta) {
      meta.cropBox = cropBox ? { ...cropBox } : undefined;
      this.thumbnailDataUrls.delete(pageIndex);
    }
  }

  setAllPagesCrop(cropBox: { x: number; y: number; width: number; height: number } | null): void {
    if (!cropBox) {
      this.pagesMeta.forEach((meta, idx) => {
        meta.cropBox = undefined;
        this.thumbnailDataUrls.delete(idx);
      });
      return;
    }
    const refMeta = this.pagesMeta[0];
    const leftRatio = refMeta ? cropBox.x / refMeta.width : 0;
    const topRatio = refMeta ? cropBox.y / refMeta.height : 0;
    const widthRatio = refMeta ? cropBox.width / refMeta.width : 1;
    const heightRatio = refMeta ? cropBox.height / refMeta.height : 1;

    this.pagesMeta.forEach((meta, idx) => {
      meta.cropBox = {
        x: Math.round(meta.width * leftRatio),
        y: Math.round(meta.height * topRatio),
        width: Math.round(meta.width * widthRatio),
        height: Math.round(meta.height * heightRatio),
      };
      this.thumbnailDataUrls.delete(idx);
    });
  }

  addImagePage(imageSrc: string, naturalWidth: number, naturalHeight: number, afterPageIndex?: number): number {
    const insertIdx = afterPageIndex !== undefined ? afterPageIndex + 1 : this.pagesMeta.length;
    // Standard conversion: 96 DPI screen pixels to 72 DPI PDF points (0.75x ratio)
    const ptWidth = Math.max(100, Math.round(naturalWidth * 0.75));
    const ptHeight = Math.max(100, Math.round(naturalHeight * 0.75));

    const newMeta: PageMetadata = {
      pageIndex: insertIdx,
      originalPageNumber: -1,
      rotation: 0,
      width: ptWidth,
      height: ptHeight,
      scale: 1.0,
      isImagePage: true,
      imageSrc,
    };

    this.pagesMeta.splice(insertIdx, 0, newMeta);
    this.pagesMeta.forEach((m, idx) => {
      m.pageIndex = idx;
    });

    const newExtracted = new Map<number, ExtractedTextItem[]>();
    for (const [pIdx, items] of this.extractedTexts.entries()) {
      const targetIdx = pIdx >= insertIdx ? pIdx + 1 : pIdx;
      items.forEach((item) => { item.pageIndex = targetIdx; });
      newExtracted.set(targetIdx, items);
    }
    newExtracted.set(insertIdx, []);
    this.extractedTexts = newExtracted;
    this.thumbnailDataUrls.clear();
    return insertIdx;
  }

  deletePage(pageIndex: number): void {
    if (this.pagesMeta.length <= 1) {
      throw new Error('A PDF must contain at least one page.');
    }
    this.pagesMeta.splice(pageIndex, 1);
    // re-index
    this.pagesMeta.forEach((m, idx) => {
      m.pageIndex = idx;
    });

    const newExtracted = new Map<number, ExtractedTextItem[]>();
    for (const [pIdx, items] of this.extractedTexts.entries()) {
      if (pIdx === pageIndex) continue;
      const targetIdx = pIdx > pageIndex ? pIdx - 1 : pIdx;
      items.forEach((item) => { item.pageIndex = targetIdx; });
      newExtracted.set(targetIdx, items);
    }
    this.extractedTexts = newExtracted;
    this.thumbnailDataUrls.clear();
  }

  addBlankPage(afterPageIndex: number = this.pagesMeta.length - 1): number {
    const standardWidth = 595.28; // A4 standard points
    const standardHeight = 841.89;

    const newIndex = afterPageIndex + 1;
    const newMeta: PageMetadata = {
      pageIndex: newIndex,
      originalPageNumber: -1,
      rotation: 0,
      width: standardWidth,
      height: standardHeight,
      scale: 1.0,
      isBlankPage: true,
    };

    this.pagesMeta.splice(newIndex, 0, newMeta);
    this.pagesMeta.forEach((m, idx) => {
      m.pageIndex = idx;
    });

    const newExtracted = new Map<number, ExtractedTextItem[]>();
    for (const [pIdx, items] of this.extractedTexts.entries()) {
      const targetIdx = pIdx >= newIndex ? pIdx + 1 : pIdx;
      items.forEach((item) => { item.pageIndex = targetIdx; });
      newExtracted.set(targetIdx, items);
    }
    newExtracted.set(newIndex, []);
    this.extractedTexts = newExtracted;
    this.thumbnailDataUrls.clear();
    return newIndex;
  }

  duplicatePage(pageIndex: number): number {
    const orig = this.pagesMeta[pageIndex];
    if (!orig) return pageIndex;

    const newIndex = pageIndex + 1;
    const copyMeta: PageMetadata = {
      ...orig,
      pageIndex: newIndex,
    };

    this.pagesMeta.splice(newIndex, 0, copyMeta);
    this.pagesMeta.forEach((m, idx) => {
      m.pageIndex = idx;
    });

    const newExtracted = new Map<number, ExtractedTextItem[]>();
    for (const [pIdx, items] of this.extractedTexts.entries()) {
      const targetIdx = pIdx >= newIndex ? pIdx + 1 : pIdx;
      items.forEach((item) => { item.pageIndex = targetIdx; });
      newExtracted.set(targetIdx, items);
    }
    const origItems = this.extractedTexts.get(pageIndex) || [];
    newExtracted.set(newIndex, origItems.map((item, idx) => ({
      ...item,
      id: `text-block-${newIndex}-${idx}`,
      pageIndex: newIndex,
    })));
    this.extractedTexts = newExtracted;
    this.thumbnailDataUrls.clear();
    return newIndex;
  }

  movePage(fromIndex: number, toIndex: number): void {
    if (toIndex < 0 || toIndex >= this.pagesMeta.length || fromIndex === toIndex) return;
    const [moved] = this.pagesMeta.splice(fromIndex, 1);
    this.pagesMeta.splice(toIndex, 0, moved);
    this.pagesMeta.forEach((m, idx) => {
      m.pageIndex = idx;
    });

    const extractedList: ExtractedTextItem[][] = [];
    for (let i = 0; i < this.pagesMeta.length; i++) {
      extractedList.push(this.extractedTexts.get(i) || []);
    }
    const [movedExtracted] = extractedList.splice(fromIndex, 1);
    extractedList.splice(toIndex, 0, movedExtracted);

    const newExtracted = new Map<number, ExtractedTextItem[]>();
    extractedList.forEach((items, idx) => {
      items.forEach((item) => { item.pageIndex = idx; });
      newExtracted.set(idx, items);
    });
    this.extractedTexts = newExtracted;
    this.thumbnailDataUrls.clear();
  }

  getPagesMeta(): PageMetadata[] {
    return this.pagesMeta;
  }

  getPageMeta(index: number): PageMetadata | undefined {
    return this.pagesMeta[index];
  }

  getPageCount(): number {
    return this.pagesMeta.length;
  }

  getExtractedTexts(pageIndex: number): ExtractedTextItem[] {
    return this.extractedTexts.get(pageIndex) || [];
  }

  getOriginalBytes(): ArrayBuffer | null {
    return this.pdfBytes;
  }

  getFileName(): string {
    return this.fileName;
  }
}
