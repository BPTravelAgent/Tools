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
      await this.extractPageText(i - 1, page, viewport);
    }
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
              try {
                (page as any).commonObjs.get(item.fontName, (fontObj: any) => {
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
                  resolve();
                });
              } catch (_) {
                resolve();
              }
            })
          );
        }
      }
      if (fontPromises.length > 0) {
        await Promise.all(fontPromises);
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

    if (meta.isBlankPage) {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = meta.width * scale;
      const cssHeight = meta.height * scale;
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cssWidth, cssHeight);
      }
      return { width: cssWidth, height: cssHeight };
    }

    const page = await this.pdfDocument.getPage(meta.originalPageNumber);
    const rotation = (page.rotate + meta.rotation) % 360;

    // Retina / High-DPI supersampling (at least 2x or devicePixelRatio) for crystal-clear sharp text
    const dpr = Math.max(2, window.devicePixelRatio || 1);
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
      // Invalidate thumbnail
      this.thumbnailDataUrls.delete(pageIndex);
    }
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
