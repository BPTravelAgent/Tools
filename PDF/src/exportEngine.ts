import {
  PDFDocument,
  rgb,
  degrees,
  StandardFonts,
  BlendMode,
  LineCapStyle,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import UPNG from '@pdf-lib/upng';
import JSZip from 'jszip';
import { fontManager } from './fontManager';
import { getAssetUrl } from './utils';
import {
  computeEffectiveHighlightColor,
  computeHighlightBorderColor,
} from './annotationManager';
import type { PDFManager } from './pdfManager';
import type { AnnotationManager } from './annotationManager';
import type { TrueEditManager } from './trueEditManager';
import type {
  TextAnnotation,
  ShapeAnnotation,
  ImageAnnotation,
  FreehandAnnotation,
  WhiteoutAnnotation,
  HighlightAnnotation,
  NormalizePagesOptions,
  ExportPDFAdvancedOptions,
  ExportPDFAdvancedResult,
  MergeSourceDoc,
  MergePagePlanItem,
} from './types';

function buildCenteredRoundedRectSvgPath(w: number, h: number, radius: number): string {
  const hw = Math.max(1, w) / 2;
  const hh = Math.max(1, h) / 2;
  const r = Math.max(0, Math.min(radius, hw - 0.1, hh - 0.1));
  if (r <= 0.25) {
    return `M ${-hw} ${-hh} L ${hw} ${-hh} L ${hw} ${hh} L ${-hw} ${hh} Z`;
  }
  return [
    `M ${-hw + r} ${-hh}`,
    `L ${hw - r} ${-hh}`,
    `Q ${hw} ${-hh} ${hw} ${-hh + r}`,
    `L ${hw} ${hh - r}`,
    `Q ${hw} ${hh} ${hw - r} ${hh}`,
    `L ${-hw + r} ${hh}`,
    `Q ${-hw} ${hh} ${-hw} ${hh - r}`,
    `L ${-hw} ${-hh + r}`,
    `Q ${-hw} ${-hh} ${-hw + r} ${-hh}`,
    'Z',
  ].join(' ');
}

function drawCanvasRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  if (r <= 0.25) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Helper to convert hex color to pdf-lib rgb
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  const intVal = parseInt(cleanHex, 16);
  if (isNaN(intVal)) return { r: 0, g: 0, b: 0 };
  return {
    r: ((intVal >> 16) & 255) / 255,
    g: ((intVal >> 8) & 255) / 255,
    b: (intVal & 255) / 255,
  };
}

// Helper to safely draw text with character encoding fallback
function safeDrawText(
  page: any,
  text: string,
  options: {
    x: number;
    y: number;
    size: number;
    font: any;
    color: any;
    opacity?: number;
    fallbackFont?: any;
  }
) {
  if (!text) return;
  try {
    page.drawText(text, options);
  } catch (err) {
    if (options.fallbackFont && options.fallbackFont !== options.font) {
      try {
        page.drawText(text, { ...options, font: options.fallbackFont });
        return;
      } catch (_) {}
    }
    // Sanitize non-standard unicode characters into standard ASCII equivalents
    const sanitized = text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u2022/g, '*')
      .replace(/[^\x00-\xFF]/g, ' ');
    try {
      page.drawText(sanitized, options);
    } catch (e2) {
      console.warn('Could not draw text even with sanitization:', text, e2);
    }
  }
}

// Helper to safely decode Base64 data URL into binary Uint8Array without string corruption
function dataUriToUint8Array(dataUri: string): Uint8Array {
  const commaIdx = dataUri.indexOf(',');
  const base64Str = commaIdx !== -1 ? dataUri.slice(commaIdx + 1) : dataUri;
  const cleanBase64 = base64Str.replace(/\s+/g, '');
  const binary = atob(cleanBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Universal robust image embedder supporting all formats (PNG, JPG, WebP, SVG, AVIF, GIF, etc.)
async function embedImageRobust(outputDoc: PDFDocument, src: string): Promise<any> {
  if (!src) return null;

  // 1. If it's already a clean PNG / JPEG data URI, attempt direct binary Uint8Array embed
  try {
    if (src.startsWith('data:image/png')) {
      const bytes = dataUriToUint8Array(src);
      try {
        return await outputDoc.embedPng(bytes);
      } catch (pngErr) {
        console.warn('Direct binary embedPng failed, proceeding to canvas/UPNG encoding:', pngErr);
      }
    } else if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
      const bytes = dataUriToUint8Array(src);
      try {
        return await outputDoc.embedJpg(bytes);
      } catch (jpgErr) {
        console.warn('Direct binary embedJpg failed, proceeding to canvas/UPNG encoding:', jpgErr);
      }
    }
  } catch (parseErr) {
    console.warn('Could not parse data URI bytes directly:', parseErr);
  }

  // 2. High-fidelity Canvas + UPNG Normalization
  // Converts WebP, SVG, AVIF, or non-standard PNGs into clean standard RGBA PNG bytes
  return new Promise((resolve) => {
    try {
      const img = new Image();
      if (!src.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }

      let isFinished = false;
      const processImage = async () => {
        if (isFinished) return;
        isFinished = true;

        try {
          const natW = img.naturalWidth || img.width || 300;
          const natH = img.naturalHeight || img.height || 300;

          // Cap max dimension to reasonable bounds for PDF embedding (high-res 1600px is > 450 DPI print quality)
          let w = natW;
          let h = natH;
          const maxDim = 1600;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h / w) * maxDim);
              w = maxDim;
            } else {
              w = Math.round((w / h) * maxDim);
              h = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, w);
          canvas.height = Math.max(1, h);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);

          // Primary: Encode using UPNG (100% matched with pdf-lib's built-in UPNG decoder)
          try {
            const encoder = (UPNG as any).encode ? (UPNG as any) : (UPNG as any).default;
            if (encoder && typeof encoder.encode === 'function') {
              const pngAb = encoder.encode([imgData.data.buffer], w, h, 0);
              const pngBytes = new Uint8Array(pngAb);
              const embedded = await outputDoc.embedPng(pngBytes);
              resolve(embedded);
              return;
            }
          } catch (upngErr) {
            console.warn('UPNG encoding failed, trying baseline JPEG fallback:', upngErr);
          }

          // Fallback: High-quality baseline JPEG bytes on white canvas (so transparency doesn't turn black)
          try {
            const jpgCanvas = document.createElement('canvas');
            jpgCanvas.width = w;
            jpgCanvas.height = h;
            const jpgCtx = jpgCanvas.getContext('2d');
            if (jpgCtx) {
              jpgCtx.fillStyle = '#ffffff';
              jpgCtx.fillRect(0, 0, w, h);
              jpgCtx.drawImage(canvas, 0, 0);
              const jpgDataUrl = jpgCanvas.toDataURL('image/jpeg', 0.95);
              const jpgBytes = dataUriToUint8Array(jpgDataUrl);
              const embeddedJpg = await outputDoc.embedJpg(jpgBytes);
              resolve(embeddedJpg);
              return;
            }
          } catch (jpgErr) {
            console.error('All image embed attempts failed:', jpgErr);
            resolve(null);
          }
        } catch (err) {
          console.error('Canvas processing error in embedImageRobust:', err);
          resolve(null);
        }
      };

      img.onload = () => processImage();
      img.onerror = (err) => {
        console.error('Image element failed to load src:', err);
        resolve(null);
      };

      img.src = src;

      // In case image is already complete (cached data URL)
      if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
        processImage();
      }
    } catch (topErr) {
      console.error('Error in embedImageRobust:', topErr);
      resolve(null);
    }
  });
}

export class ExportEngine {
  private static builtinFontBytesCache = new Map<string, ArrayBuffer | null>();
  private static renderCacheKey: string = '';
  private static renderCacheCanvases = new Map<
    number,
    { canvas: HTMLCanvasElement; ptWidth: number; ptHeight: number }
  >();

  private static async getBuiltinFontBytes(assetRelPath: string): Promise<ArrayBuffer | null> {
    if (ExportEngine.builtinFontBytesCache.has(assetRelPath)) {
      return ExportEngine.builtinFontBytesCache.get(assetRelPath) || null;
    }
    try {
      const resp = await fetch(getAssetUrl(assetRelPath));
      if (resp.ok) {
        const bytes = await resp.arrayBuffer();
        ExportEngine.builtinFontBytesCache.set(assetRelPath, bytes);
        return bytes;
      }
    } catch (e) {
      console.warn(`Could not load font asset ${assetRelPath}:`, e);
    }
    ExportEngine.builtinFontBytesCache.set(assetRelPath, null);
    return null;
  }

  static async exportPDF(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    onProgress?: (percent: number, statusText: string) => void,
    saveOptions?: { useObjectStreams?: boolean; pageIndices?: number[] }
  ): Promise<Uint8Array> {
    onProgress?.(10, 'Initializing PDF Document...');

    const originalBytes = pdfManager.getOriginalBytes();
    if (!originalBytes) throw new Error('No PDF bytes available for export');

    const allPagesMeta = pdfManager.getPagesMeta();
    const targetIndices =
      saveOptions?.pageIndices && saveOptions.pageIndices.length > 0
        ? saveOptions.pageIndices.filter((idx) => idx >= 0 && idx < allPagesMeta.length)
        : allPagesMeta.map((_, idx) => idx);
    const totalPages = targetIndices.length;

    // Fast shortcut: if no edits/annotations/structural changes & all pages requested with default streams
    const anyChanges = targetIndices.some(
      (idx) =>
        trueEditManager.getChangesForPage(idx).length > 0 ||
        annotationManager.getAnnotations(idx).some((a) => !a.hidden)
    );
    if (!pdfManager.hasStructuralModifications() && !anyChanges && totalPages === allPagesMeta.length) {
      if (saveOptions?.useObjectStreams === false) {
        onProgress?.(100, 'Done!');
        return new Uint8Array(originalBytes.slice(0));
      }
    }

    // Create a new document to assemble the pages
    const originalDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
    const outputDoc = await PDFDocument.create();

    const needsTextFonts = targetIndices.some(
      (idx) =>
        trueEditManager.getChangesForPage(idx).length > 0 ||
        annotationManager.getAnnotations(idx).some((a) => !a.hidden && a.type === 'text')
    );

    let helvetica: any = null;
    let helveticaBold: any = null;
    let timesRoman: any = null;
    let courier: any = null;
    let dmSansRegular: any = null;
    let dmSansBold: any = null;
    let libreBaskervilleRegular: any = null;
    let libreBaskervilleBold: any = null;
    const customEmbeddedFonts = new Map<string, any>();

    if (needsTextFonts) {
      outputDoc.registerFontkit(fontkit);
      helvetica = await outputDoc.embedFont(StandardFonts.Helvetica);
      helveticaBold = await outputDoc.embedFont(StandardFonts.HelveticaBold);
      timesRoman = await outputDoc.embedFont(StandardFonts.TimesRoman);
      courier = await outputDoc.embedFont(StandardFonts.Courier);

      const usedFamilies = new Set<string>();
      for (const idx of targetIndices) {
        for (const ch of trueEditManager.getChangesForPage(idx)) {
          if (ch.fontFamily) usedFamilies.add(ch.fontFamily.toLowerCase());
          if (ch.spans) ch.spans.forEach((s) => s.fontFamily && usedFamilies.add(s.fontFamily.toLowerCase()));
        }
        for (const ann of annotationManager.getAnnotations(idx)) {
          if (!ann.hidden && ann.type === 'text' && (ann as TextAnnotation).fontFamily) {
            usedFamilies.add((ann as TextAnnotation).fontFamily.toLowerCase());
          }
        }
      }
      const wantsDmSans = Array.from(usedFamilies).some((f) => f.includes('dm sans') || f.includes('dmsans'));
      const wantsLibre = Array.from(usedFamilies).some((f) => f.includes('baskerville') || f.includes('libre'));

      if (wantsDmSans || usedFamilies.size === 0) {
        const regBytes = await ExportEngine.getBuiltinFontBytes('fonts/DMSans-Regular.ttf');
        if (regBytes) dmSansRegular = await outputDoc.embedFont(regBytes);
        const boldBytes = await ExportEngine.getBuiltinFontBytes('fonts/DMSans-Bold.ttf');
        if (boldBytes) dmSansBold = await outputDoc.embedFont(boldBytes);
      }
      if (wantsLibre) {
        const regBytes = await ExportEngine.getBuiltinFontBytes('fonts/LibreBaskerville-Regular.ttf');
        if (regBytes) libreBaskervilleRegular = await outputDoc.embedFont(regBytes);
        const boldBytes = await ExportEngine.getBuiltinFontBytes('fonts/LibreBaskerville-Bold.ttf');
        if (boldBytes) libreBaskervilleBold = await outputDoc.embedFont(boldBytes);
      }

      for (const font of fontManager.getAllFonts()) {
        if (font.isCustom && font.bytes) {
          const matchesUsed =
            usedFamilies.has(font.name.toLowerCase()) ||
            usedFamilies.has(font.family.toLowerCase()) ||
            Array.from(usedFamilies).some(
              (u) => u.includes(font.name.toLowerCase()) || font.name.toLowerCase().includes(u)
            );
          if (!matchesUsed) continue;
          try {
            const customEmbedded = await outputDoc.embedFont(font.bytes);
            customEmbeddedFonts.set(font.name.toLowerCase(), customEmbedded);
            customEmbeddedFonts.set(font.family.toLowerCase(), customEmbedded);
          } catch (customErr) {
            console.warn(`Could not embed custom font ${font.name}:`, customErr);
          }
        }
      }
    }

    const resolveFont = (fontFamily: string, bold: boolean) => {
      const name = (fontFamily || '').toLowerCase();

      if (customEmbeddedFonts.has(name)) {
        return customEmbeddedFonts.get(name);
      }
      for (const [cKey, cFont] of customEmbeddedFonts.entries()) {
        if (name.includes(cKey) || cKey.includes(name)) {
          return cFont;
        }
      }

      if (name.includes('dm sans') || name.includes('dmsans')) {
        if (bold && dmSansBold) return dmSansBold;
        if (dmSansRegular) return dmSansRegular;
      }
      if (name.includes('baskerville') || name.includes('libre')) {
        if (bold && libreBaskervilleBold) return libreBaskervilleBold;
        if (libreBaskervilleRegular) return libreBaskervilleRegular;
      }
      if (name.includes('times')) return timesRoman;
      if (name.includes('courier')) return courier;
      if (bold) return helveticaBold;
      return helvetica;
    };

    onProgress?.(25, 'Processing pages and layout...');

    for (let i = 0; i < totalPages; i++) {
      const meta = allPagesMeta[targetIndices[i]];
      let newPage: any;

      if (meta.isImagePage && meta.imageSrc) {
        newPage = outputDoc.addPage([meta.width, meta.height]);
        try {
          const imgBytes = dataUriToUint8Array(meta.imageSrc);
          let embedded: any;
          if (meta.imageSrc.startsWith('data:image/png')) {
            try {
              embedded = await outputDoc.embedPng(imgBytes);
            } catch (_) {
              embedded = await outputDoc.embedJpg(imgBytes);
            }
          } else {
            try {
              embedded = await outputDoc.embedJpg(imgBytes);
            } catch (_) {
              embedded = await outputDoc.embedPng(imgBytes);
            }
          }
          newPage.drawImage(embedded, {
            x: 0,
            y: 0,
            width: meta.width,
            height: meta.height,
          });
        } catch (err) {
          console.error('Failed to embed image page:', err);
        }
      } else if (meta.isBlankPage) {
        newPage = outputDoc.addPage([meta.width, meta.height]);
      } else {
        const [copiedPage] = await outputDoc.copyPages(originalDoc, [meta.originalPageNumber - 1]);
        newPage = outputDoc.addPage(copiedPage);
      }

      // Apply cropBox if defined (clips both visible content and page boundary)
      if (meta.cropBox) {
        const origPageH = newPage.getHeight();
        const pdfCropX = meta.cropBox.x;
        const pdfCropY = origPageH - meta.cropBox.y - meta.cropBox.height;
        const pdfCropW = meta.cropBox.width;
        const pdfCropH = meta.cropBox.height;
        newPage.setCropBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
        newPage.setMediaBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
      }

      // Apply rotation if needed
      if (meta.rotation !== 0) {
        const currentRot = newPage.getRotation().angle;
        newPage.setRotation(degrees((currentRot + meta.rotation) % 360));
      }

      const { height: pageHeight } = newPage.getSize();

      // 1. Apply TrueEdit changes for this page (Pro Mode)
      const trueEditChanges = trueEditManager.getChangesForPage(meta.pageIndex);

      // PASS 1: Draw whiteout masks to cleanly erase original text in PDF
      for (const change of trueEditChanges) {
        const origBaseY = change.origPdfBaselineY !== undefined
          ? change.origPdfBaselineY
          : (change.pdfBaselineY !== undefined
              ? change.pdfBaselineY
              : pageHeight - (change.origY ?? change.y) - change.fontSize * 0.85);
        const origX = change.origPdfX !== undefined
          ? change.origPdfX
          : (change.pdfX !== undefined ? change.pdfX : (change.origX ?? change.x));
        const origWidth = change.origWidth ?? change.width;

        const wasMoved = change.origX !== undefined && change.origY !== undefined && (Math.abs(change.x - change.origX) > 1 || Math.abs(change.y - change.origY) > 1);

        // Precise typographic metrics:
        // Descenders ('g', 'j', 'p', 'q', 'y', commas, serifs, underlines) can reach 0.28-0.35 * fontSize below baseline.
        // We set descender to Math.max(3.2, change.fontSize * 0.36) so 100% of the old text bottom is erased cleanly without leaving any faint line or remnant!
        // Ascenders ('b', 'd', 'h', 'k', 'l', capitals) reach 0.72-0.78 * fontSize above baseline.
        // Setting ascender to Math.max(5.5, change.fontSize * 0.80) ensures maskTop = origBaseY + ascender stays safely below the gray table header!
        const descender = Math.max(3.2, change.fontSize * 0.36);
        const ascender = Math.max(5.5, change.fontSize * 0.80);
        const maskHeight = ascender + descender;
        const maskY = origBaseY - descender;
        const padX = 2.0;
        const maskX = Math.max(0, origX - padX);
        const maskWidth = Math.max(10, origWidth + padX * 2);

        const bgColor = hexToRgb(change.backgroundColor || '#ffffff');

        // Erase original text at its original position
        newPage.drawRectangle({
          x: maskX,
          y: maskY,
          width: maskWidth,
          height: maskHeight,
          color: rgb(bgColor.r, bgColor.g, bgColor.b),
        });

        // If not moved and has new multiline text, also mask the expanded area under it
        if (!wasMoved && !change.deleted && change.newText.trim().length > 0) {
          const rawLines = (change.newText || '').split('\n');
          const numLines = Math.max(1, rawLines.length);
          if (numLines > 1) {
            const lineHeight = change.fontSize * 1.25;
            const fullMaskHeight = maskHeight + (numLines - 1) * lineHeight;
            const fullMaskY = origBaseY - descender - (numLines - 1) * lineHeight;
            newPage.drawRectangle({
              x: maskX,
              y: fullMaskY,
              width: maskWidth,
              height: fullMaskHeight,
              color: rgb(bgColor.r, bgColor.g, bgColor.b),
            });
          }
        }

        // If moved, also mask the area at the new target position so it sits cleanly
        if (wasMoved && !change.deleted && change.newText.trim().length > 0) {
          const targetBaselineY = change.pdfBaselineY !== undefined
            ? change.pdfBaselineY
            : pageHeight - change.y - change.fontSize * 0.85;
          const targetX = change.pdfX !== undefined ? change.pdfX : change.x;
          const newMaskX = Math.max(0, targetX - padX);
          const newMaskY = targetBaselineY - descender;
          const newMaskWidth = Math.max(10, (change.width || origWidth) + padX * 2);
          newPage.drawRectangle({
            x: newMaskX,
            y: newMaskY,
            width: newMaskWidth,
            height: maskHeight,
            color: rgb(bgColor.r, bgColor.g, bgColor.b),
          });
        }
      }

      // PASS 2: Draw replacement text for active (non-deleted) TrueEdit changes
      for (const change of trueEditChanges) {
        if (change.deleted || change.newText.trim().length === 0) continue;

        // PDF coordinate system has origin (0,0) at bottom-left!
        const targetBaselineY = change.pdfBaselineY !== undefined
          ? change.pdfBaselineY
          : pageHeight - change.y - change.fontSize * 0.85;
        const targetX = change.pdfX !== undefined ? change.pdfX : change.x;

        interface ExportSpan {
          text: string;
          fontFamily: string;
          fontSize: number;
          color: string;
          bold: boolean;
          italic: boolean;
        }

        const lines: ExportSpan[][] = [];
        let curLineSpans: ExportSpan[] = [];

        if (change.spans && change.spans.length > 0) {
          for (const sp of change.spans) {
            const parts = sp.text.split('\n');
            for (let p = 0; p < parts.length; p++) {
              if (p > 0) {
                lines.push(curLineSpans);
                curLineSpans = [];
              }
              if (parts[p].length > 0) {
                curLineSpans.push({
                  text: parts[p],
                  fontFamily: sp.fontFamily || change.fontFamily || 'DM Sans',
                  fontSize: sp.fontSize || change.fontSize,
                  color: sp.color || change.color || '#000000',
                  bold: sp.bold !== undefined ? sp.bold : change.bold,
                  italic: sp.italic !== undefined ? sp.italic : change.italic,
                });
              }
            }
          }
          if (curLineSpans.length > 0) lines.push(curLineSpans);
        } else {
          const rawLines = (change.newText || '').split('\n');
          for (const rl of rawLines) {
            lines.push([{
              text: rl,
              fontFamily: change.fontFamily || 'DM Sans',
              fontSize: change.fontSize,
              color: change.color || '#000000',
              bold: change.bold,
              italic: change.italic,
            }]);
          }
        }
        if (lines.length === 0) lines.push([]);

        // Calculate line widths
        const lineMetrics = lines.map((lSpans) => {
          let lineWidth = 0;
          for (const s of lSpans) {
            const font = resolveFont(s.fontFamily, s.bold);
            try {
              lineWidth += font.widthOfTextAtSize(s.text, Math.max(6, s.fontSize));
            } catch (_) {
              lineWidth += s.text.length * s.fontSize * 0.55;
            }
          }
          return { lineWidth, lSpans };
        });

        const maxContentWidth = Math.max(change.width, ...lineMetrics.map((l) => l.lineWidth));
        const lineHeight = change.fontSize * 1.25;
        const totalContentWidth = Math.max(change.width, maxContentWidth);

        for (let lineIdx = 0; lineIdx < lineMetrics.length; lineIdx++) {
          const { lineWidth, lSpans } = lineMetrics[lineIdx];
          const lineY = targetBaselineY - lineIdx * lineHeight;

          let lineStartX = targetX;
          if (change.align === 'center') {
            lineStartX = targetX + Math.max(0, (totalContentWidth - lineWidth) / 2);
          } else if (change.align === 'right') {
            lineStartX = targetX + Math.max(0, totalContentWidth - lineWidth);
          }

          let curX = lineStartX;
          for (const sp of lSpans) {
            const spanFont = resolveFont(sp.fontFamily, sp.bold);
            const spanColor = hexToRgb(sp.color || '#000000');
            const spanSize = Math.max(6, sp.fontSize);

            safeDrawText(newPage, sp.text, {
              x: curX,
              y: lineY,
              size: spanSize,
              font: spanFont,
              color: rgb(spanColor.r, spanColor.g, spanColor.b),
              fallbackFont: dmSansRegular || helvetica,
            });

            try {
              curX += spanFont.widthOfTextAtSize(sp.text, spanSize);
            } catch (_) {
              curX += sp.text.length * spanSize * 0.55;
            }
          }
        }
      }

      // 2. Apply Annotations for this page
      // Background redactions (whiteouts) must be drawn first so images, shapes, and texts sit cleanly on top
      const pageAnnotations = annotationManager
        .getAnnotations(meta.pageIndex)
        .slice()
        .sort((a, b) => {
          const aIsWo = a.type === 'whiteout' ? 0 : 1;
          const bIsWo = b.type === 'whiteout' ? 0 : 1;
          if (aIsWo !== bIsWo) return aIsWo - bIsWo;
          return a.zIndex - b.zIndex;
        });

      for (const ann of pageAnnotations) {
        if (ann.hidden) continue;

        const pdfY = pageHeight - (ann.y + ann.height);

        if (ann.type === 'whiteout') {
          const wo = ann as WhiteoutAnnotation;
          const bg = hexToRgb(wo.fillColor || '#ffffff');
          newPage.drawRectangle({
            x: wo.x,
            y: pdfY,
            width: wo.width,
            height: wo.height,
            color: rgb(bg.r, bg.g, bg.b),
            opacity: wo.opacity,
          });
        } else if (ann.type === 'text') {
          const textAnn = ann as TextAnnotation;
          const textColor = hexToRgb(textAnn.color);

          // Draw background if specified
          if (textAnn.backgroundColor && textAnn.backgroundColor !== 'transparent') {
            const bg = hexToRgb(textAnn.backgroundColor);
            newPage.drawRectangle({
              x: textAnn.x,
              y: pdfY,
              width: textAnn.width,
              height: textAnn.height,
              color: rgb(bg.r, bg.g, bg.b),
              opacity: textAnn.opacity,
            });
          }

          const fontToUse = resolveFont(textAnn.fontFamily, textAnn.bold);

          safeDrawText(newPage, textAnn.text, {
            x: textAnn.x + 4,
            y: pdfY + Math.max(4, (textAnn.height - textAnn.fontSize) / 2),
            size: textAnn.fontSize,
            font: fontToUse,
            color: rgb(textColor.r, textColor.g, textColor.b),
            opacity: textAnn.opacity,
            fallbackFont: dmSansRegular || helvetica,
          });
        } else if (ann.type === 'shape') {
          const shapeAnn = ann as ShapeAnnotation;
          const strokeColor = hexToRgb(shapeAnn.strokeColor);
          const hasFill = shapeAnn.fillColor && shapeAnn.fillColor !== 'transparent';
          const fillColor = hasFill ? hexToRgb(shapeAnn.fillColor) : undefined;

          if (shapeAnn.shape === 'rectangle') {
            newPage.drawRectangle({
              x: shapeAnn.x,
              y: pdfY,
              width: shapeAnn.width,
              height: shapeAnn.height,
              borderColor: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              borderWidth: shapeAnn.strokeWidth,
              color: fillColor ? rgb(fillColor.r, fillColor.g, fillColor.b) : undefined,
              opacity: shapeAnn.opacity,
            });
          } else if (shapeAnn.shape === 'ellipse') {
            newPage.drawEllipse({
              x: shapeAnn.x + shapeAnn.width / 2,
              y: pdfY + shapeAnn.height / 2,
              xScale: shapeAnn.width / 2,
              yScale: shapeAnn.height / 2,
              borderColor: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              borderWidth: shapeAnn.strokeWidth,
              color: fillColor ? rgb(fillColor.r, fillColor.g, fillColor.b) : undefined,
              opacity: shapeAnn.opacity,
            });
          } else if (shapeAnn.shape === 'line') {
            newPage.drawLine({
              start: { x: shapeAnn.x, y: pdfY + shapeAnn.height / 2 },
              end: { x: shapeAnn.x + shapeAnn.width, y: pdfY + shapeAnn.height / 2 },
              thickness: shapeAnn.strokeWidth,
              color: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              opacity: shapeAnn.opacity,
            });
          } else if (shapeAnn.shape === 'arrow') {
            // Draw main shaft
            const startX = shapeAnn.x;
            const endX = shapeAnn.x + shapeAnn.width;
            const midY = pdfY + shapeAnn.height / 2;
            newPage.drawLine({
              start: { x: startX, y: midY },
              end: { x: endX, y: midY },
              thickness: shapeAnn.strokeWidth,
              color: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              opacity: shapeAnn.opacity,
            });
            // Arrow heads
            const arrowHeadSize = Math.max(6, shapeAnn.strokeWidth * 3);
            newPage.drawLine({
              start: { x: endX, y: midY },
              end: { x: endX - arrowHeadSize, y: midY + arrowHeadSize },
              thickness: shapeAnn.strokeWidth,
              color: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              opacity: shapeAnn.opacity,
            });
            newPage.drawLine({
              start: { x: endX, y: midY },
              end: { x: endX - arrowHeadSize, y: midY - arrowHeadSize },
              thickness: shapeAnn.strokeWidth,
              color: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              opacity: shapeAnn.opacity,
            });
          } else if (shapeAnn.shape === 'check') {
            // Draw checkmark symbol
            const midX = shapeAnn.x + shapeAnn.width * 0.4;
            const bottomY = pdfY + shapeAnn.height * 0.2;
            newPage.drawLine({
              start: { x: shapeAnn.x + shapeAnn.width * 0.1, y: pdfY + shapeAnn.height * 0.5 },
              end: { x: midX, y: bottomY },
              thickness: Math.max(3, shapeAnn.strokeWidth),
              color: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              opacity: shapeAnn.opacity,
            });
            newPage.drawLine({
              start: { x: midX, y: bottomY },
              end: { x: shapeAnn.x + shapeAnn.width * 0.9, y: pdfY + shapeAnn.height * 0.85 },
              thickness: Math.max(3, shapeAnn.strokeWidth),
              color: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              opacity: shapeAnn.opacity,
            });
          } else if (shapeAnn.shape === 'cross') {
            newPage.drawLine({
              start: { x: shapeAnn.x, y: pdfY },
              end: { x: shapeAnn.x + shapeAnn.width, y: pdfY + shapeAnn.height },
              thickness: shapeAnn.strokeWidth,
              color: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              opacity: shapeAnn.opacity,
            });
            newPage.drawLine({
              start: { x: shapeAnn.x, y: pdfY + shapeAnn.height },
              end: { x: shapeAnn.x + shapeAnn.width, y: pdfY },
              thickness: shapeAnn.strokeWidth,
              color: rgb(strokeColor.r, strokeColor.g, strokeColor.b),
              opacity: shapeAnn.opacity,
            });
          }
        } else if (ann.type === 'image') {
          const imgAnn = ann as ImageAnnotation;
          try {
            const embeddedImage = await embedImageRobust(outputDoc, imgAnn.src);
            if (embeddedImage) {
              const drawOpts: any = {
                x: imgAnn.x,
                y: pdfY,
                width: imgAnn.width,
                height: imgAnn.height,
                opacity: imgAnn.opacity !== undefined ? imgAnn.opacity : 1.0,
              };
              if (imgAnn.rotation && imgAnn.rotation % 360 !== 0) {
                drawOpts.rotate = degrees(-imgAnn.rotation);
              }
              newPage.drawImage(embeddedImage, drawOpts);
            } else {
              console.error('Could not embed image annotation:', imgAnn.id);
            }
          } catch (err) {
            console.error('Failed to embed image:', err);
          }
        } else if (ann.type === 'freehand') {
          const freeAnn = ann as FreehandAnnotation;
          if (freeAnn.points && freeAnn.points.length > 0) {
            // Render high-res offscreen canvas of the strokes, then embed as PNG
            const offscreen = document.createElement('canvas');
            const dpr = 2;
            const strokeW = Math.max(1, Math.ceil(freeAnn.width * dpr));
            const strokeH = Math.max(1, Math.ceil(freeAnn.height * dpr));
            offscreen.width = strokeW;
            offscreen.height = strokeH;
            const ctx = offscreen.getContext('2d');
            if (ctx) {
              ctx.scale(dpr, dpr);
              ctx.strokeStyle = freeAnn.strokeColor || '#000000';
              ctx.lineWidth = freeAnn.strokeWidth || 3;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';

              if (freeAnn.points.length === 1) {
                // Single dot click
                const pt = freeAnn.points[0];
                ctx.fillStyle = freeAnn.strokeColor || '#000000';
                ctx.beginPath();
                ctx.arc(pt.x - freeAnn.x, pt.y - freeAnn.y, (freeAnn.strokeWidth || 3) / 2, 0, Math.PI * 2);
                ctx.fill();
              } else {
                ctx.beginPath();
                const startP = freeAnn.points[0];
                ctx.moveTo(startP.x - freeAnn.x, startP.y - freeAnn.y);
                for (let pi = 1; pi < freeAnn.points.length; pi++) {
                  const pt = freeAnn.points[pi];
                  ctx.lineTo(pt.x - freeAnn.x, pt.y - freeAnn.y);
                }
                ctx.stroke();
              }

              try {
                const strokeBytes = dataUriToUint8Array(offscreen.toDataURL('image/png'));
                const embeddedStroke = await outputDoc.embedPng(strokeBytes);
                newPage.drawImage(embeddedStroke, {
                  x: freeAnn.x,
                  y: pdfY,
                  width: freeAnn.width,
                  height: freeAnn.height,
                  opacity: freeAnn.opacity !== undefined ? freeAnn.opacity : 1.0,
                });
              } catch (strkErr) {
                console.warn('Failed to embed freehand stroke:', strkErr);
              }
            }
          }
        } else if (ann.type === 'highlight') {
          const hl = ann as HighlightAnnotation;
          const effectiveHex = computeEffectiveHighlightColor(hl.color, hl.intensity ?? 1.0);
          const borderHex = computeHighlightBorderColor(effectiveHex);
          const fillRgb = hexToRgb(effectiveHex);
          const borderRgb = hexToRgb(borderHex);
          const blend = hl.blendMode === 'normal' ? BlendMode.Normal : BlendMode.Multiply;
          const op = Math.max(0.05, Math.min(0.95, hl.opacity ?? 0.38));
          const borderOp = hl.fillEnabled ? Math.min(0.95, op + 0.35) : op;
          const rot = hl.rotation || 0;

          if (hl.variant === 'box' || hl.variant === 'text') {
            const pathStr = buildCenteredRoundedRectSvgPath(hl.width, hl.height, hl.borderRadius || 0);
            const drawOpts: any = {
              x: hl.x + hl.width / 2,
              y: pdfY + hl.height / 2,
              blendMode: blend,
            };
            if (rot % 360 !== 0) {
              drawOpts.rotate = degrees(-rot);
            }
            if (hl.fillEnabled) {
              drawOpts.color = rgb(fillRgb.r, fillRgb.g, fillRgb.b);
              drawOpts.opacity = op;
            }
            if (hl.borderWidth > 0) {
              drawOpts.borderColor = rgb(borderRgb.r, borderRgb.g, borderRgb.b);
              drawOpts.borderWidth = hl.borderWidth;
              drawOpts.borderOpacity = borderOp;
            } else if (!hl.fillEnabled) {
              // Ensure hollow highlight without border still renders hairline accent
              drawOpts.borderColor = rgb(borderRgb.r, borderRgb.g, borderRgb.b);
              drawOpts.borderWidth = 2;
              drawOpts.borderOpacity = borderOp;
            }
            newPage.drawSvgPath(pathStr, drawOpts);
          } else if (hl.variant === 'circle') {
            const drawOpts: any = {
              x: hl.x + hl.width / 2,
              y: pdfY + hl.height / 2,
              xScale: Math.max(2, hl.width / 2),
              yScale: Math.max(2, hl.height / 2),
              blendMode: blend,
            };
            if (rot % 360 !== 0) {
              drawOpts.rotate = degrees(-rot);
            }
            if (hl.fillEnabled) {
              drawOpts.color = rgb(fillRgb.r, fillRgb.g, fillRgb.b);
              drawOpts.opacity = op;
            }
            if (hl.borderWidth > 0 || !hl.fillEnabled) {
              drawOpts.borderColor = rgb(borderRgb.r, borderRgb.g, borderRgb.b);
              drawOpts.borderWidth = hl.borderWidth > 0 ? hl.borderWidth : 2;
              drawOpts.borderOpacity = borderOp;
            }
            newPage.drawEllipse(drawOpts);
          } else if (hl.variant === 'underline' && hl.points && hl.points.length >= 2) {
            const p0 = hl.points[0];
            const p1 = hl.points[hl.points.length - 1];
            const cx = hl.x + hl.width / 2;
            const cy = hl.y + hl.height / 2;
            const rotPt = (pt: { x: number; y: number }) => {
              if (rot % 360 === 0) return pt;
              const rad = (rot * Math.PI) / 180;
              const dx = pt.x - cx;
              const dy = pt.y - cy;
              return {
                x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
                y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
              };
            };
            const rp0 = rotPt(p0);
            const rp1 = rotPt(p1);
            newPage.drawLine({
              start: { x: rp0.x, y: pageHeight - rp0.y },
              end: { x: rp1.x, y: pageHeight - rp1.y },
              thickness: Math.max(2, hl.strokeWidth || 16),
              color: rgb(fillRgb.r, fillRgb.g, fillRgb.b),
              opacity: op,
              lineCap: hl.lineCap === 'square' ? LineCapStyle.Butt : LineCapStyle.Round,
              blendMode: blend,
            });
          } else if (hl.points && hl.points.length > 0) {
            // Pen freehand highlight stroke rendered at 2x resolution onto PNG, drawn with Multiply/Normal + opacity
            const offscreen = document.createElement('canvas');
            const dpr = 2;
            const strokeW = Math.max(1, Math.ceil(hl.width * dpr));
            const strokeH = Math.max(1, Math.ceil(hl.height * dpr));
            offscreen.width = strokeW;
            offscreen.height = strokeH;
            const ctx = offscreen.getContext('2d');
            if (ctx) {
              ctx.scale(dpr, dpr);
              const cap = hl.lineCap === 'square' ? 'square' : 'round';
              ctx.strokeStyle = effectiveHex;
              ctx.fillStyle = effectiveHex;
              ctx.lineWidth = hl.strokeWidth || 18;
              ctx.lineCap = cap;
              ctx.lineJoin = 'round';

              if (hl.points.length === 1) {
                const pt = hl.points[0];
                ctx.beginPath();
                ctx.arc(pt.x - hl.x, pt.y - hl.y, (hl.strokeWidth || 18) / 2, 0, Math.PI * 2);
                ctx.fill();
              } else {
                ctx.beginPath();
                ctx.moveTo(hl.points[0].x - hl.x, hl.points[0].y - hl.y);
                for (let pi = 1; pi < hl.points.length; pi++) {
                  ctx.lineTo(hl.points[pi].x - hl.x, hl.points[pi].y - hl.y);
                }
                ctx.stroke();
              }

              try {
                const strokeBytes = dataUriToUint8Array(offscreen.toDataURL('image/png'));
                const embeddedStroke = await outputDoc.embedPng(strokeBytes);
                let drawX = hl.x;
                let drawY = pdfY;
                if (rot % 360 !== 0) {
                  const rad = (-rot * Math.PI) / 180;
                  const vx = -hl.width / 2;
                  const vy = -hl.height / 2;
                  const cxPdf = hl.x + hl.width / 2;
                  const cyPdf = pdfY + hl.height / 2;
                  drawX = cxPdf + vx * Math.cos(rad) - vy * Math.sin(rad);
                  drawY = cyPdf + vx * Math.sin(rad) + vy * Math.cos(rad);
                }
                newPage.drawImage(embeddedStroke, {
                  x: drawX,
                  y: drawY,
                  width: hl.width,
                  height: hl.height,
                  opacity: op,
                  blendMode: blend,
                  ...(rot % 360 !== 0 ? { rotate: degrees(-rot) } : {}),
                });
              } catch (hlErr) {
                console.warn('Failed to embed pen highlight:', hlErr);
              }
            }
          }
        }
      }

      onProgress?.(
        Math.round(25 + ((i + 1) / totalPages) * 60),
        `Exporting page ${i + 1} of ${totalPages}...`
      );
    }

    onProgress?.(90, 'Finalizing and compressing PDF...');
    const resultBytes = await outputDoc.save({
      useObjectStreams: saveOptions?.useObjectStreams ?? true,
    });
    onProgress?.(100, 'Done!');
    return resultBytes;
  }

  static downloadBytes(bytes: Uint8Array, fileName: string, exactName: boolean = false) {
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanName = fileName.trim() || 'document.pdf';
    link.download = exactName
      ? (cleanName.toLowerCase().endsWith('.pdf') ? cleanName : `${cleanName}.pdf`)
      : cleanName.replace(/\.pdf$/i, '') + '_edited.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  static async createPDFFromImages(imageFiles: File[]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();

    for (const file of imageFiles) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { bytes, format, width, height } = await new Promise<{
        bytes: Uint8Array;
        format: 'png' | 'jpg';
        width: number;
        height: number;
      }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const natW = img.naturalWidth || img.width || 800;
          const natH = img.naturalHeight || img.height || 1100;
          const canvas = document.createElement('canvas');
          canvas.width = natW;
          canvas.height = natH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Cannot create canvas context'));
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, natW, natH);
          ctx.drawImage(img, 0, 0, natW, natH);

          const isPng = file.type === 'image/png';
          const outDataUrl = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.95);
          const rawBytes = dataUriToUint8Array(outDataUrl);
          resolve({
            bytes: rawBytes,
            format: isPng ? 'png' : 'jpg',
            width: natW,
            height: natH,
          });
        };
        img.onerror = reject;
        img.src = dataUrl;
      });

      let embedded: any;
      if (format === 'png') {
        try {
          embedded = await doc.embedPng(bytes);
        } catch (_) {
          embedded = await doc.embedJpg(bytes);
        }
      } else {
        try {
          embedded = await doc.embedJpg(bytes);
        } catch (_) {
          embedded = await doc.embedPng(bytes);
        }
      }

      // Standard conversion: 96 DPI screen pixels to 72 DPI PDF points (0.75x ratio)
      const ptW = Math.max(100, Math.round(width * 0.75));
      const ptH = Math.max(100, Math.round(height * 0.75));
      const page = doc.addPage([ptW, ptH]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: ptW,
        height: ptH,
      });
    }

    return await doc.save();
  }

  /**
   * Merges selected pages from an external PDF into the current PDF
   */
  static async mergeExternalPDF(
    currentPDFBytes: Uint8Array,
    donorPDFBytes: Uint8Array,
    donorPageIndices: number[],
    insertPosition: 'start' | 'current' | 'end',
    currentPageIndex: number
  ): Promise<Uint8Array> {
    const currentDoc = await PDFDocument.load(currentPDFBytes, { ignoreEncryption: true });
    const donorDoc = await PDFDocument.load(donorPDFBytes, { ignoreEncryption: true });

    // Clamp page indices
    const maxDonorPage = donorDoc.getPageCount();
    const validIndices = donorPageIndices.filter((idx) => idx >= 0 && idx < maxDonorPage);
    if (validIndices.length === 0) {
      throw new Error('No valid pages selected from the external PDF.');
    }

    const copiedPages = await currentDoc.copyPages(donorDoc, validIndices);

    let insertAt = 0;
    if (insertPosition === 'start') {
      insertAt = 0;
    } else if (insertPosition === 'current') {
      insertAt = Math.min(currentPageIndex + 1, currentDoc.getPageCount());
    } else {
      insertAt = currentDoc.getPageCount();
    }

    for (let i = 0; i < copiedPages.length; i++) {
      currentDoc.insertPage(insertAt + i, copiedPages[i]);
    }

    return await currentDoc.save();
  }

  /**
   * Advanced multi-PDF merger supporting arbitrary page ordering, duplication, rotation, and optional page-size unification.
   */
  static async mergeDocumentsAdvanced(
    sources: MergeSourceDoc[],
    pagePlan: MergePagePlanItem[],
    unifyOptions?: NormalizePagesOptions,
    onProgress?: (percent: number, statusText: string) => void
  ): Promise<Uint8Array> {
    if (pagePlan.length === 0) {
      throw new Error('Select at least one page to merge.');
    }

    onProgress?.(10, 'Loading source PDF documents...');

    const loadedDocs = new Map<string, PDFDocument>();
    const sourceById = new Map<string, MergeSourceDoc>();
    for (const s of sources) {
      sourceById.set(s.id, s);
    }

    const neededSourceIds = Array.from(new Set(pagePlan.map((p) => p.sourceId)));
    for (let i = 0; i < neededSourceIds.length; i++) {
      const sid = neededSourceIds[i];
      const src = sourceById.get(sid);
      if (!src) continue;
      onProgress?.(
        10 + Math.round(((i + 1) / neededSourceIds.length) * 25),
        `Reading "${src.name}"...`
      );
      const doc = await PDFDocument.load(src.bytes, { ignoreEncryption: true });
      loadedDocs.set(sid, doc);
    }

    onProgress?.(40, 'Copying and assembling pages...');
    const outputDoc = await PDFDocument.create();

    // Group requested page indices per source doc so PDFObjectCopier shares fonts/images per source
    const slotsBySource = new Map<string, Array<{ planPos: number; pageIndex: number }>>();
    for (let i = 0; i < pagePlan.length; i++) {
      const item = pagePlan[i];
      const list = slotsBySource.get(item.sourceId) || [];
      list.push({ planPos: i, pageIndex: item.pageIndex });
      slotsBySource.set(item.sourceId, list);
    }

    const copiedPageSlots: any[] = new Array(pagePlan.length);
    for (const [sid, slots] of slotsBySource.entries()) {
      const srcDoc = loadedDocs.get(sid);
      if (!srcDoc) continue;
      const maxIdx = srcDoc.getPageCount() - 1;
      const validIndices = slots.map((s) => Math.max(0, Math.min(s.pageIndex, maxIdx)));
      const copied = await outputDoc.copyPages(srcDoc, validIndices);
      for (let k = 0; k < slots.length; k++) {
        copiedPageSlots[slots[k].planPos] = copied[k];
      }
    }

    for (let i = 0; i < pagePlan.length; i++) {
      const page = copiedPageSlots[i];
      if (!page) continue;
      const delta = ((pagePlan[i].rotationDelta % 360) + 360) % 360;
      if (delta !== 0) {
        const curRot = page.getRotation().angle;
        page.setRotation(degrees((curRot + delta) % 360));
      }
      outputDoc.addPage(page);
    }

    onProgress?.(75, 'Finalizing merged document...');
    let mergedBytes = await outputDoc.save({ useObjectStreams: true });

    if (unifyOptions) {
      onProgress?.(82, 'Unifying merged page sizes & layout...');
      const unified = await ExportEngine.normalizePages(mergedBytes, unifyOptions, (pct, stat) => {
        onProgress?.(82 + Math.round(pct * 0.18), stat);
      });
      mergedBytes = unified.bytes;
    }

    onProgress?.(100, 'Merge complete!');
    return mergedBytes;
  }

  /**
   * Retrieves page count of an external PDF file
   */
  static async getPDFInfo(bytes: Uint8Array): Promise<{ pageCount: number }> {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return { pageCount: doc.getPageCount() };
  }

  /**
   * Renders a document page with all TrueEdit modifications and annotations onto an HTMLCanvasElement.
   */
  static async renderPageToCanvasWithEdits(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    pageIndex: number,
    scale: number = 1.5,
    grayscale: boolean = false
  ): Promise<HTMLCanvasElement> {
    const meta = pdfManager.getPageMeta(pageIndex);
    if (!meta) throw new Error(`Page ${pageIndex + 1} not found`);

    const canvas = document.createElement('canvas');
    // Render at exact explicit DPR = 1 so background compression & target size scale predictably (4x faster than 2x retina)
    await pdfManager.renderPageToCanvas(pageIndex, canvas, scale, 1);

    const ptWidth = meta.cropBox ? meta.cropBox.width : meta.width;
    const ctx = canvas.getContext('2d', { willReadFrequently: grayscale });
    if (ctx) {
      const dpr = canvas.width / (ptWidth * scale);
      const drawScale = scale * dpr;

      // 1. Draw TrueEdit text changes (whiteout backgrounds and replacement text)
      const trueEditChanges = trueEditManager.getChangesForPage(pageIndex);

      // Pass 1: Whiteout masks over original positions (with full ascender/descender coverage)
      for (const change of trueEditChanges) {
        const origX = change.origX ?? change.x;
        const origY = change.origY ?? change.y;
        const origW = change.origWidth ?? change.width;
        const origH = change.origHeight ?? change.height;
        const padX = 2.5;
        const padY = Math.max(2, change.fontSize * 0.18);

        ctx.fillStyle = change.backgroundColor || '#ffffff';
        ctx.fillRect(
          Math.max(0, origX - padX) * drawScale,
          Math.max(0, origY - padY) * drawScale,
          (origW + padX * 2) * drawScale,
          (origH + padY * 2) * drawScale
        );

        const wasMoved =
          change.origX !== undefined &&
          change.origY !== undefined &&
          (Math.abs(change.x - change.origX) > 1 || Math.abs(change.y - change.origY) > 1);
        if (wasMoved && !change.deleted && change.newText.trim().length > 0) {
          ctx.fillRect(
            Math.max(0, change.x - padX) * drawScale,
            Math.max(0, change.y - padY) * drawScale,
            ((change.width || origW) + padX * 2) * drawScale,
            (origH + padY * 2) * drawScale
          );
        }
      }

      // Pass 2: Replacement text
      for (const change of trueEditChanges) {
        if (change.deleted || !change.newText || change.newText.trim().length === 0) continue;

        ctx.textBaseline = 'top';
        const lineHeight = change.fontSize * 1.25;

        if (change.spans && change.spans.length > 0) {
          // Group spans into lines split by newline
          const lines: Array<typeof change.spans> = [[]];
          for (const span of change.spans) {
            const parts = span.text.split('\n');
            for (let p = 0; p < parts.length; p++) {
              if (p > 0) lines.push([]);
              if (parts[p].length > 0) {
                lines[lines.length - 1].push({ ...span, text: parts[p] });
              }
            }
          }

          lines.forEach((lSpans, lIdx) => {
            let lineW = 0;
            for (const sp of lSpans) {
              const spSize = (sp.fontSize || change.fontSize || 12) * drawScale;
              ctx.font = `${sp.bold ? 'bold ' : ''}${sp.italic ? 'italic ' : ''}${spSize}px "${sp.fontFamily || change.fontFamily || 'DM Sans'}", sans-serif`;
              lineW += ctx.measureText(sp.text).width;
            }
            const boxW = Math.max(change.width * drawScale, lineW);
            let curX = change.x * drawScale;
            if (change.align === 'center') curX += Math.max(0, (boxW - lineW) / 2);
            else if (change.align === 'right') curX += Math.max(0, boxW - lineW);

            const lineY = (change.y + lIdx * lineHeight) * drawScale;
            for (const sp of lSpans) {
              const spSize = (sp.fontSize || change.fontSize || 12) * drawScale;
              ctx.font = `${sp.bold ? 'bold ' : ''}${sp.italic ? 'italic ' : ''}${spSize}px "${sp.fontFamily || change.fontFamily || 'DM Sans'}", sans-serif`;
              ctx.fillStyle = sp.color || change.color || '#000000';
              ctx.fillText(sp.text, curX, lineY);
              curX += ctx.measureText(sp.text).width;
            }
          });
        } else {
          ctx.font = `${change.bold ? 'bold ' : ''}${change.italic ? 'italic ' : ''}${change.fontSize * drawScale}px "${change.fontFamily || 'DM Sans'}", sans-serif`;
          ctx.fillStyle = change.color || '#000000';
          const rawLines = change.newText.split('\n');
          rawLines.forEach((rl, lIdx) => {
            const lineW = ctx.measureText(rl).width;
            const boxW = Math.max(change.width * drawScale, lineW);
            let curX = change.x * drawScale;
            if (change.align === 'center') curX += Math.max(0, (boxW - lineW) / 2);
            else if (change.align === 'right') curX += Math.max(0, boxW - lineW);
            ctx.fillText(rl, curX, (change.y + lIdx * lineHeight) * drawScale);
          });
        }
      }

      // 2. Draw annotations (whiteouts first, then foreground elements in z-order)
      const anns = annotationManager
        .getAnnotations(pageIndex)
        .slice()
        .sort((a, b) => {
          const aWo = a.type === 'whiteout' ? 0 : 1;
          const bWo = b.type === 'whiteout' ? 0 : 1;
          if (aWo !== bWo) return aWo - bWo;
          return a.zIndex - b.zIndex;
        });

      for (const ann of anns) {
        if (ann.hidden) continue;
        ctx.save();
        ctx.globalAlpha = ann.opacity ?? 1.0;

        if (ann.rotation && ann.rotation % 360 !== 0) {
          const cx = (ann.x + ann.width / 2) * drawScale;
          const cy = (ann.y + ann.height / 2) * drawScale;
          ctx.translate(cx, cy);
          ctx.rotate((ann.rotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }

        if (ann.type === 'whiteout') {
          const wo = ann as WhiteoutAnnotation;
          ctx.fillStyle = wo.fillColor || '#ffffff';
          ctx.fillRect(wo.x * drawScale, wo.y * drawScale, wo.width * drawScale, wo.height * drawScale);
        } else if (ann.type === 'text') {
          const textAnn = ann as TextAnnotation;
          if (textAnn.backgroundColor && textAnn.backgroundColor !== 'transparent') {
            ctx.fillStyle = textAnn.backgroundColor;
            ctx.fillRect(textAnn.x * drawScale, textAnn.y * drawScale, textAnn.width * drawScale, textAnn.height * drawScale);
          }
          ctx.font = `${textAnn.bold ? 'bold ' : ''}${textAnn.italic ? 'italic ' : ''}${textAnn.fontSize * drawScale}px "${textAnn.fontFamily || 'DM Sans'}", sans-serif`;
          ctx.fillStyle = textAnn.color || '#000000';
          ctx.textBaseline = 'top';
          const lines = (textAnn.text || '').split('\n');
          const lineH = textAnn.fontSize * 1.25;
          lines.forEach((line, lIdx) => {
            ctx.fillText(line, (textAnn.x + 4) * drawScale, (textAnn.y + 3 + lIdx * lineH) * drawScale);
          });
        } else if (ann.type === 'shape') {
          const shapeAnn = ann as ShapeAnnotation;
          ctx.strokeStyle = shapeAnn.strokeColor || '#E5322D';
          ctx.lineWidth = (shapeAnn.strokeWidth || 2) * drawScale;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const hasFill = shapeAnn.fillColor && shapeAnn.fillColor !== 'transparent';
          if (hasFill) ctx.fillStyle = shapeAnn.fillColor;

          const sx = shapeAnn.x * drawScale;
          const sy = shapeAnn.y * drawScale;
          const sw = shapeAnn.width * drawScale;
          const sh = shapeAnn.height * drawScale;

          if (shapeAnn.shape === 'rectangle') {
            if (hasFill) ctx.fillRect(sx, sy, sw, sh);
            ctx.strokeRect(sx, sy, sw, sh);
          } else if (shapeAnn.shape === 'ellipse') {
            ctx.beginPath();
            ctx.ellipse(sx + sw / 2, sy + sh / 2, Math.max(1, sw / 2), Math.max(1, sh / 2), 0, 0, Math.PI * 2);
            if (hasFill) ctx.fill();
            ctx.stroke();
          } else if (shapeAnn.shape === 'line') {
            ctx.beginPath();
            ctx.moveTo(sx, sy + sh / 2);
            ctx.lineTo(sx + sw, sy + sh / 2);
            ctx.stroke();
          } else if (shapeAnn.shape === 'arrow') {
            const midY = sy + sh / 2;
            const head = Math.max(6, (shapeAnn.strokeWidth || 2) * 3) * drawScale;
            ctx.beginPath();
            ctx.moveTo(sx, midY);
            ctx.lineTo(sx + sw, midY);
            ctx.moveTo(sx + sw - head, midY - head);
            ctx.lineTo(sx + sw, midY);
            ctx.lineTo(sx + sw - head, midY + head);
            ctx.stroke();
          } else if (shapeAnn.shape === 'check') {
            ctx.lineWidth = Math.max(3, shapeAnn.strokeWidth || 2) * drawScale;
            ctx.beginPath();
            ctx.moveTo(sx + sw * 0.1, sy + sh * 0.5);
            ctx.lineTo(sx + sw * 0.4, sy + sh * 0.8);
            ctx.lineTo(sx + sw * 0.9, sy + sh * 0.15);
            ctx.stroke();
          } else if (shapeAnn.shape === 'cross') {
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + sw, sy + sh);
            ctx.moveTo(sx, sy + sh);
            ctx.lineTo(sx + sw, sy);
            ctx.stroke();
          }
        } else if (ann.type === 'freehand') {
          const fh = ann as FreehandAnnotation;
          if (fh.points && fh.points.length > 1) {
            ctx.strokeStyle = fh.strokeColor || '#E5322D';
            ctx.lineWidth = (fh.strokeWidth || 3) * drawScale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(fh.points[0].x * drawScale, fh.points[0].y * drawScale);
            for (let p = 1; p < fh.points.length; p++) {
              ctx.lineTo(fh.points[p].x * drawScale, fh.points[p].y * drawScale);
            }
            ctx.stroke();
          }
        } else if (ann.type === 'highlight') {
          const hl = ann as HighlightAnnotation;
          const effectiveHex = computeEffectiveHighlightColor(hl.color, hl.intensity ?? 1.0);
          const borderHex = computeHighlightBorderColor(effectiveHex);
          const op = Math.max(0.05, Math.min(0.95, hl.opacity ?? 0.38));
          const borderOp = hl.fillEnabled ? Math.min(0.95, op + 0.35) : op;
          ctx.globalCompositeOperation = hl.blendMode === 'normal' ? 'source-over' : 'multiply';

          const hx = hl.x * drawScale;
          const hy = hl.y * drawScale;
          const hw = hl.width * drawScale;
          const hh = hl.height * drawScale;

          if (hl.variant === 'box' || hl.variant === 'text') {
            drawCanvasRoundedRectPath(ctx, hx, hy, hw, hh, (hl.borderRadius || 0) * drawScale);
            if (hl.fillEnabled) {
              ctx.globalAlpha = op;
              ctx.fillStyle = effectiveHex;
              ctx.fill();
            }
            if (hl.borderWidth > 0 || !hl.fillEnabled) {
              ctx.globalAlpha = borderOp;
              ctx.strokeStyle = borderHex;
              ctx.lineWidth = (hl.borderWidth > 0 ? hl.borderWidth : 2) * drawScale;
              ctx.stroke();
            }
          } else if (hl.variant === 'circle') {
            ctx.beginPath();
            ctx.ellipse(hx + hw / 2, hy + hh / 2, Math.max(1, hw / 2), Math.max(1, hh / 2), 0, 0, Math.PI * 2);
            if (hl.fillEnabled) {
              ctx.globalAlpha = op;
              ctx.fillStyle = effectiveHex;
              ctx.fill();
            }
            if (hl.borderWidth > 0 || !hl.fillEnabled) {
              ctx.globalAlpha = borderOp;
              ctx.strokeStyle = borderHex;
              ctx.lineWidth = (hl.borderWidth > 0 ? hl.borderWidth : 2) * drawScale;
              ctx.stroke();
            }
          } else if (hl.points && hl.points.length > 0) {
            ctx.globalAlpha = op;
            ctx.strokeStyle = effectiveHex;
            ctx.fillStyle = effectiveHex;
            ctx.lineWidth = (hl.strokeWidth || 18) * drawScale;
            ctx.lineCap = hl.lineCap === 'square' ? 'square' : 'round';
            ctx.lineJoin = 'round';
            if (hl.points.length === 1) {
              ctx.beginPath();
              ctx.arc(
                hl.points[0].x * drawScale,
                hl.points[0].y * drawScale,
                ((hl.strokeWidth || 18) * drawScale) / 2,
                0,
                Math.PI * 2
              );
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.moveTo(hl.points[0].x * drawScale, hl.points[0].y * drawScale);
              for (let p = 1; p < hl.points.length; p++) {
                ctx.lineTo(hl.points[p].x * drawScale, hl.points[p].y * drawScale);
              }
              ctx.stroke();
            }
          }
        } else if (ann.type === 'image') {
          const imgAnn = ann as ImageAnnotation;
          if (imgAnn.src) {
            const loadedImg = await new Promise<HTMLImageElement | null>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => resolve(null);
              img.src = imgAnn.src;
              if (img.complete && img.naturalWidth > 0) resolve(img);
            });
            if (loadedImg) {
              ctx.drawImage(
                loadedImg,
                imgAnn.x * drawScale,
                imgAnn.y * drawScale,
                imgAnn.width * drawScale,
                imgAnn.height * drawScale
              );
            }
          }
        }
        ctx.restore();
      }

      if (grayscale) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        for (let p = 0; p < data.length; p += 4) {
          const lum = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
          data[p] = lum;
          data[p + 1] = lum;
          data[p + 2] = lum;
        }
        ctx.putImageData(imgData, 0, 0);
      }
    }

    return canvas;
  }

  /**
   * Renders a document page with all TrueEdit modifications and annotations to a high-res image Blob
   */
  static async renderPageToImageBlob(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    pageIndex: number,
    format: 'png' | 'jpeg' | 'webp',
    scale: number = 1.5,
    quality: number = 0.8,
    grayscale: boolean = false
  ): Promise<Blob> {
    const canvas = await ExportEngine.renderPageToCanvasWithEdits(
      pdfManager,
      annotationManager,
      trueEditManager,
      pageIndex,
      scale,
      grayscale
    );

    return new Promise<Blob>((resolve, reject) => {
      let mime = 'image/jpeg';
      if (format === 'png') mime = 'image/png';
      else if (format === 'webp') mime = 'image/webp';

      const q = format === 'png' ? undefined : Math.max(0.05, Math.min(1.0, quality));
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob from page canvas'));
      }, mime, q);
    });
  }

  /**
   * Downloads a single page as an image with controllable compression / quality
   */
  static async exportSinglePageImage(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    pageIndex: number,
    format: 'png' | 'jpeg' | 'webp' = 'jpeg',
    scale: number = 1.5,
    quality: number = 0.8,
    baseFileName: string = 'document'
  ): Promise<{ bytes: number; fileName: string }> {
    const blob = await ExportEngine.renderPageToImageBlob(
      pdfManager,
      annotationManager,
      trueEditManager,
      pageIndex,
      format,
      scale,
      quality
    );
    const cleanBaseName = baseFileName.replace(/\.pdf$/i, '');
    let ext = 'jpg';
    if (format === 'png') ext = 'png';
    else if (format === 'webp') ext = 'webp';

    const pageNumPadded = String(pageIndex + 1).padStart(2, '0');
    const outName = `${cleanBaseName}_page_${pageNumPadded}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { bytes: blob.size, fileName: outName };
  }

  /**
   * Renders multiple pages and bundles them into a ZIP archive with compression / quality
   */
  static async exportPagesToZip(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    pageIndices: number[],
    format: 'png' | 'jpeg' | 'webp' = 'jpeg',
    scale: number = 1.5,
    quality: number = 0.8,
    baseFileName: string = 'document',
    onProgress?: (percent: number, status: string) => void
  ): Promise<void> {
    const zip = new JSZip();
    const cleanBaseName = baseFileName.replace(/\.pdf$/i, '');
    let ext = 'jpg';
    if (format === 'png') ext = 'png';
    else if (format === 'webp') ext = 'webp';

    for (let i = 0; i < pageIndices.length; i++) {
      const pIdx = pageIndices[i];
      onProgress?.(
        Math.round(((i + 0.5) / pageIndices.length) * 80),
        `Rendering page ${pIdx + 1} (${i + 1} of ${pageIndices.length})...`
      );

      const blob = await ExportEngine.renderPageToImageBlob(
        pdfManager,
        annotationManager,
        trueEditManager,
        pIdx,
        format,
        scale,
        quality
      );

      const pageNumPadded = String(pIdx + 1).padStart(2, '0');
      zip.file(`${cleanBaseName}_page_${pageNumPadded}.${ext}`, blob);
    }

    onProgress?.(85, 'Packaging ZIP archive...');
    const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      onProgress?.(85 + Math.round(metadata.percent * 0.14), `Compressing ZIP: ${Math.round(metadata.percent)}%`);
    });

    onProgress?.(100, 'Download ready!');
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanBaseName}_pages.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  private static async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, idx: number) => Promise<R>
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIdx = 0;
    const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
      while (nextIdx < items.length) {
        const cur = nextIdx++;
        results[cur] = await worker(items[cur], cur);
      }
    });
    await Promise.all(runners);
    return results;
  }

  private static encodeCanvasToJpgBytes(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
    const q = Math.max(0.08, Math.min(1.0, quality));
    return new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            reject(new Error('Canvas JPEG encode failed'));
            return;
          }
          resolve(new Uint8Array(await blob.arrayBuffer()));
        },
        'image/jpeg',
        q
      );
    });
  }

  private static buildRenderCacheKey(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    scale: number,
    grayscale: boolean
  ): string {
    const metaSig = pdfManager
      .getPagesMeta()
      .map(
        (m) =>
          `${m.originalPageNumber}:${m.rotation}:${m.width.toFixed(1)}x${m.height.toFixed(1)}:${m.cropBox ? `${m.cropBox.x},${m.cropBox.y},${m.cropBox.width},${m.cropBox.height}` : ''}`
      )
      .join('|');
    const annSig = JSON.stringify(Array.from(annotationManager.getAllAnnotations().entries()));
    const teSig = JSON.stringify(Array.from(trueEditManager.getAllChanges().entries()));
    return `${pdfManager.getSessionId()}#${scale.toFixed(3)}#${grayscale ? 1 : 0}#${metaSig}#${annSig}#${teSig}`;
  }

  private static async getCachedPageCanvas(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    pageIndex: number,
    scale: number,
    grayscale: boolean,
    cacheKey: string
  ): Promise<{ canvas: HTMLCanvasElement; ptWidth: number; ptHeight: number }> {
    if (ExportEngine.renderCacheKey !== cacheKey) {
      ExportEngine.renderCacheCanvases.clear();
      ExportEngine.renderCacheKey = cacheKey;
    }
    const existing = ExportEngine.renderCacheCanvases.get(pageIndex);
    if (existing) {
      return existing;
    }
    const meta = pdfManager.getPageMeta(pageIndex);
    const ptWidth = meta ? (meta.cropBox ? meta.cropBox.width : meta.width) : 595.28;
    const ptHeight = meta ? (meta.cropBox ? meta.cropBox.height : meta.height) : 841.89;
    const canvas = await ExportEngine.renderPageToCanvasWithEdits(
      pdfManager,
      annotationManager,
      trueEditManager,
      pageIndex,
      scale,
      grayscale
    );
    const entry = { canvas, ptWidth, ptHeight };
    ExportEngine.renderCacheCanvases.set(pageIndex, entry);
    return entry;
  }

  private static async assembleJpegPagesToPDF(
    pages: Array<{ jpgBytes: Uint8Array; ptWidth: number; ptHeight: number }>
  ): Promise<Uint8Array> {
    const outputDoc = await PDFDocument.create();
    for (const item of pages) {
      const embedded = await outputDoc.embedJpg(item.jpgBytes);
      const page = outputDoc.addPage([item.ptWidth, item.ptHeight]);
      page.drawImage(embedded, {
        x: 0,
        y: 0,
        width: item.ptWidth,
        height: item.ptHeight,
      });
    }
    return await outputDoc.save({ useObjectStreams: true });
  }

  /**
   * Compresses the PDF to reduce file size (KB / MB) with parallel page processing,
   * canvas caching across quality adjustments, selectable DPI scale, grayscale, and page selection.
   */
  static async compressPDF(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    options: {
      scale: number;
      quality: number;
      grayscale?: boolean;
      pageIndices?: number[];
    },
    onProgress?: (percent: number, status: string) => void
  ): Promise<Uint8Array> {
    const pagesMeta = pdfManager.getPagesMeta();
    const targetIndices =
      options.pageIndices && options.pageIndices.length > 0
        ? options.pageIndices.filter((idx) => idx >= 0 && idx < pagesMeta.length)
        : pagesMeta.map((_, idx) => idx);
    const totalPages = targetIndices.length;
    const cacheKey = ExportEngine.buildRenderCacheKey(
      pdfManager,
      annotationManager,
      trueEditManager,
      options.scale,
      !!options.grayscale
    );

    let completed = 0;
    const renderedEntries = await ExportEngine.mapWithConcurrency(targetIndices, 4, async (pIdx) => {
      const cached = await ExportEngine.getCachedPageCanvas(
        pdfManager,
        annotationManager,
        trueEditManager,
        pIdx,
        options.scale,
        !!options.grayscale,
        cacheKey
      );
      const jpgBytes = await ExportEngine.encodeCanvasToJpgBytes(cached.canvas, options.quality);
      completed++;
      onProgress?.(
        Math.round((completed / Math.max(1, totalPages)) * 88),
        `Optimizing page ${completed} of ${totalPages}...`
      );
      return { jpgBytes, ptWidth: cached.ptWidth, ptHeight: cached.ptHeight };
    });

    onProgress?.(92, 'Packaging compressed PDF...');
    const resultBytes = await ExportEngine.assembleJpegPagesToPDF(renderedEntries);
    onProgress?.(100, 'Compression completed!');
    return resultBytes;
  }

  /**
   * Adaptively compresses the PDF to fit under a target file size (in bytes) in minimal time
   * using zero-copy lossless fast-path, 4-page probe scale search, and direct JPEG byte budgeting.
   */
  static async compressToTargetSize(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    targetBytes: number,
    options?: {
      pageIndices?: number[];
      allowGrayscaleFallback?: boolean;
      maxScale?: number;
    },
    onProgress?: (percent: number, status: string) => void
  ): Promise<ExportPDFAdvancedResult> {
    const safeTarget = Math.max(20 * 1024, targetBytes);
    const allMeta = pdfManager.getPagesMeta();
    const targetIndices =
      options?.pageIndices && options.pageIndices.length > 0
        ? options.pageIndices.filter((idx) => idx >= 0 && idx < allMeta.length)
        : allMeta.map((_, idx) => idx);
    const totalPages = Math.max(1, targetIndices.length);
    const originalBytes = pdfManager.getOriginalBytes();

    const anyEdits = targetIndices.some(
      (idx) =>
        trueEditManager.getChangesForPage(idx).length > 0 ||
        annotationManager.getAnnotations(idx).some((a) => !a.hidden)
    );

    // 1. Instant zero-copy fast path if clean doc already fits under targetBytes
    if (
      !pdfManager.hasStructuralModifications() &&
      !anyEdits &&
      targetIndices.length === allMeta.length &&
      originalBytes &&
      originalBytes.byteLength <= safeTarget
    ) {
      onProgress?.(100, 'Already under target size losslessly!');
      return {
        bytes: new Uint8Array(originalBytes.slice(0)),
        method: 'vector',
        achievedScale: 1.0,
        achievedQuality: 1.0,
        grayscale: false,
        hitTarget: true,
      };
    }

    // Check lossless object-stream vector PDF ONLY if source could realistically compress losslessly under safeTarget
    let vectorBytes: Uint8Array | null = null;
    if (
      !originalBytes ||
      targetIndices.length < allMeta.length ||
      originalBytes.byteLength <= safeTarget * 2.5
    ) {
      onProgress?.(8, 'Checking lossless vector PDF size...');
      vectorBytes = await ExportEngine.exportPDF(
        pdfManager,
        annotationManager,
        trueEditManager,
        undefined,
        { useObjectStreams: true, pageIndices: targetIndices }
      );
      if (vectorBytes.byteLength <= safeTarget) {
        onProgress?.(100, 'Fits target size losslessly!');
        return {
          bytes: vectorBytes,
          method: 'vector',
          achievedScale: 1.0,
          achievedQuality: 1.0,
          grayscale: false,
          hitTarget: true,
        };
      }
    }

    // 2. Choose smart scale tiers based on per-page KB budget
    const CONTAINER_OVERHEAD = 1600 + totalPages * 340;
    const jpegBudget = Math.max(12 * 1024, safeTarget - CONTAINER_OVERHEAD);
    const budgetPerPage = jpegBudget / totalPages;

    const startMaxScale = Math.min(2.0, Math.max(0.75, options?.maxScale ?? 1.5));
    let rawTiers = [startMaxScale, 1.15, 0.9, 0.72, 0.55].filter(
      (s, i, arr) => s <= startMaxScale + 0.01 && arr.indexOf(s) === i
    );
    if (totalPages >= 5) {
      if (budgetPerPage < 26 * 1024) {
        rawTiers = rawTiers.filter((s) => s <= 0.95);
      } else if (budgetPerPage < 65 * 1024) {
        rawTiers = rawTiers.filter((s) => s <= 1.18);
      }
      if (rawTiers.length === 0) rawTiers = [0.72, 0.55];
    }

    const grayscaleModes = options?.allowGrayscaleFallback ? [false, true] : [false];

    // Pick up to 4 evenly distributed probe pages for large docs
    const probeIndices =
      totalPages <= 4
        ? targetIndices
        : Array.from(
            new Set([
              targetIndices[0],
              targetIndices[Math.floor(targetIndices.length / 3)],
              targetIndices[Math.floor((targetIndices.length * 2) / 3)],
              targetIndices[targetIndices.length - 1],
            ])
          );

    const encodeSet = async (
      canvases: Array<{ canvas: HTMLCanvasElement; ptWidth: number; ptHeight: number }>,
      quality: number
    ) => {
      const jpgs = await ExportEngine.mapWithConcurrency(canvases, 4, (c) =>
        ExportEngine.encodeCanvasToJpgBytes(c.canvas, quality)
      );
      const totalJpgBytes = jpgs.reduce((sum, j) => sum + j.byteLength, 0);
      return { jpgs, totalJpgBytes };
    };

    let bestFallback: {
      pages: Array<{ jpgBytes: Uint8Array; ptWidth: number; ptHeight: number }>;
      totalBytes: number;
      scale: number;
      quality: number;
      gray: boolean;
    } | null = null;

    for (const gray of grayscaleModes) {
      for (let tIdx = 0; tIdx < rawTiers.length; tIdx++) {
        const scale = rawTiers[tIdx];
        const minQ = tIdx === rawTiers.length - 1 ? 0.14 : 0.28;
        const maxQ = 0.86;
        const cacheKey = ExportEngine.buildRenderCacheKey(
          pdfManager,
          annotationManager,
          trueEditManager,
          scale,
          gray
        );

        onProgress?.(
          15 + Math.round((tIdx / rawTiers.length) * 20),
          totalPages > 4
            ? `Sampling ${probeIndices.length} pages at ${scale.toFixed(2)}×${gray ? ' (Grayscale)' : ''}...`
            : `Rendering ${totalPages} page(s) at ${scale.toFixed(2)}×${gray ? ' (Grayscale)' : ''}...`
        );

        // Render ONLY probe pages first (or all pages if doc <= 4 pages)
        const probeCanvases = await ExportEngine.mapWithConcurrency(probeIndices, 4, (pIdx) =>
          ExportEngine.getCachedPageCanvas(
            pdfManager,
            annotationManager,
            trueEditManager,
            pIdx,
            scale,
            gray,
            cacheKey
          )
        );

        // Estimate full doc budget from probes before rendering remaining pages
        const probeHigh = await encodeSet(probeCanvases, maxQ);
        const estHighTotal = (probeHigh.totalJpgBytes / probeCanvases.length) * totalPages + CONTAINER_OVERHEAD;

        let estimatedQ = maxQ;
        if (estHighTotal > safeTarget) {
          const probeLow = await encodeSet(probeCanvases, minQ);
          const estLowTotal = (probeLow.totalJpgBytes / probeCanvases.length) * totalPages + CONTAINER_OVERHEAD;
          // Allow slight tolerance in case probes are heavier than document average
          if (estLowTotal > safeTarget * 1.12 && !(gray === grayscaleModes[grayscaleModes.length - 1] && tIdx === rawTiers.length - 1)) {
            continue; // Reject oversized tier after rendering ONLY 4 pages!
          }
          if (estLowTotal <= safeTarget) {
            let lo = minQ;
            let hi = maxQ;
            estimatedQ = minQ;
            for (let it = 0; it < 4; it++) {
              const mid = (lo + hi) / 2;
              const pMid = await encodeSet(probeCanvases, mid);
              const estMid = (pMid.totalJpgBytes / probeCanvases.length) * totalPages + CONTAINER_OVERHEAD;
              if (estMid <= safeTarget * 0.96) {
                estimatedQ = mid;
                lo = mid;
              } else {
                hi = mid;
              }
            }
          } else {
            estimatedQ = minQ;
          }
        }

        // Render any remaining pages ONCE at this selected scale tier
        let allCanvases: Array<{ canvas: HTMLCanvasElement; ptWidth: number; ptHeight: number }>;
        if (probeCanvases.length === targetIndices.length) {
          allCanvases = probeCanvases;
        } else {
          let doneCount = probeCanvases.length;
          allCanvases = await ExportEngine.mapWithConcurrency(targetIndices, 4, async (pIdx) => {
            const wasCached = ExportEngine.renderCacheCanvases.has(pIdx) && ExportEngine.renderCacheKey === cacheKey;
            const entry = await ExportEngine.getCachedPageCanvas(
              pdfManager,
              annotationManager,
              trueEditManager,
              pIdx,
              scale,
              gray,
              cacheKey
            );
            if (!wasCached) {
              doneCount++;
              onProgress?.(
                Math.min(82, 30 + Math.round((doneCount / totalPages) * 52)),
                `Rendering page ${Math.min(totalPages, doneCount)} of ${totalPages} at ${scale.toFixed(2)}×...`
              );
            }
            return entry;
          });
        }

        onProgress?.(85, `Optimizing JPEG compression (${Math.round(estimatedQ * 100)}%)...`);
        const firstPass =
          probeCanvases.length === allCanvases.length && estimatedQ === maxQ
            ? probeHigh
            : await encodeSet(allCanvases, estimatedQ);

        let chosenJpgs = firstPass.jpgs;
        let chosenSum = firstPass.totalJpgBytes;
        let chosenQ = estimatedQ;

        const recordFallback = (jpgs: Uint8Array[], sum: number, q: number) => {
          const estTotal = sum + CONTAINER_OVERHEAD;
          if (!bestFallback || estTotal < bestFallback.totalBytes) {
            bestFallback = {
              pages: allCanvases.map((c, idx) => ({ jpgBytes: jpgs[idx], ptWidth: c.ptWidth, ptHeight: c.ptHeight })),
              totalBytes: estTotal,
              scale,
              quality: q,
              gray,
            };
          }
        };
        recordFallback(chosenJpgs, chosenSum, chosenQ);

        if (chosenSum + CONTAINER_OVERHEAD > safeTarget) {
          // Check minQ on full cached canvases (ZERO PDF re-rendering)
          const fullMin = await encodeSet(allCanvases, minQ);
          recordFallback(fullMin.jpgs, fullMin.totalJpgBytes, minQ);
          if (fullMin.totalJpgBytes + CONTAINER_OVERHEAD > safeTarget) {
            continue; // Need next lower scale or grayscale
          }
          let lo = minQ;
          let hi = chosenQ;
          chosenJpgs = fullMin.jpgs;
          chosenSum = fullMin.totalJpgBytes;
          chosenQ = minQ;
          for (let it = 0; it < 4; it++) {
            const mid = (lo + hi) / 2;
            onProgress?.(86 + it * 2, `Fine-tuning quality (${Math.round(mid * 100)}%)...`);
            const midRes = await encodeSet(allCanvases, mid);
            if (midRes.totalJpgBytes + CONTAINER_OVERHEAD <= safeTarget) {
              chosenJpgs = midRes.jpgs;
              chosenSum = midRes.totalJpgBytes;
              chosenQ = mid;
              lo = mid;
            } else {
              hi = mid;
            }
          }
        } else if (chosenQ < maxQ - 0.05) {
          // Slight upward boost if probes were much denser than rest of document
          const midUp = Math.min(maxQ, chosenQ + 0.12);
          const upRes = await encodeSet(allCanvases, midUp);
          if (upRes.totalJpgBytes + CONTAINER_OVERHEAD <= safeTarget) {
            chosenJpgs = upRes.jpgs;
            chosenSum = upRes.totalJpgBytes;
            chosenQ = midUp;
          }
        }

        onProgress?.(94, 'Assembling final PDF...');
        let finalBytes = await ExportEngine.assembleJpegPagesToPDF(
          allCanvases.map((c, idx) => ({
            jpgBytes: chosenJpgs[idx],
            ptWidth: c.ptWidth,
            ptHeight: c.ptHeight,
          }))
        );

        // Safety trim if actual PDF container overhead slightly exceeded estimate
        if (finalBytes.byteLength > safeTarget && chosenQ > minQ) {
          const trimQ = Math.max(minQ, chosenQ * (safeTarget / finalBytes.byteLength) * 0.94);
          const trimRes = await encodeSet(allCanvases, trimQ);
          const trimmedPdf = await ExportEngine.assembleJpegPagesToPDF(
            allCanvases.map((c, idx) => ({
              jpgBytes: trimRes.jpgs[idx],
              ptWidth: c.ptWidth,
              ptHeight: c.ptHeight,
            }))
          );
          if (trimmedPdf.byteLength < finalBytes.byteLength) {
            finalBytes = trimmedPdf;
            chosenQ = trimQ;
          }
        }

        if (finalBytes.byteLength <= safeTarget) {
          onProgress?.(100, 'Target file size reached!');
          return {
            bytes: finalBytes,
            method: 'compressed',
            achievedScale: scale,
            achievedQuality: chosenQ,
            grayscale: gray,
            hitTarget: true,
          };
        }
      }
    }

    onProgress?.(98, 'Finalizing maximum compression...');
    if (bestFallback) {
      const fb = bestFallback as {
        pages: Array<{ jpgBytes: Uint8Array; ptWidth: number; ptHeight: number }>;
        totalBytes: number;
        scale: number;
        quality: number;
        gray: boolean;
      };
      const fbBytes = await ExportEngine.assembleJpegPagesToPDF(fb.pages);
      if (!vectorBytes || fbBytes.byteLength < vectorBytes.byteLength) {
        onProgress?.(100, 'Applied maximum compression!');
        return {
          bytes: fbBytes,
          method: 'compressed',
          achievedScale: fb.scale,
          achievedQuality: fb.quality,
          grayscale: fb.gray,
          hitTarget: fbBytes.byteLength <= safeTarget,
        };
      }
    }

    const fallbackVector =
      vectorBytes ||
      (await ExportEngine.exportPDF(pdfManager, annotationManager, trueEditManager, undefined, {
        useObjectStreams: true,
        pageIndices: targetIndices,
      }));
    onProgress?.(100, 'Done!');
    return {
      bytes: fallbackVector,
      method: 'vector',
      achievedScale: 1.0,
      achievedQuality: 1.0,
      grayscale: false,
      hitTarget: fallbackVector.byteLength <= safeTarget,
    };
  }

  /**
   * Unified advanced export supporting Vector, Custom Compression, or Target KB/MB Size.
   */
  static async exportPDFAdvanced(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    options: ExportPDFAdvancedOptions,
    onProgress?: (percent: number, status: string) => void
  ): Promise<ExportPDFAdvancedResult> {
    if (options.mode === 'vector') {
      const bytes = await ExportEngine.exportPDF(
        pdfManager,
        annotationManager,
        trueEditManager,
        onProgress,
        {
          useObjectStreams: options.optimizeObjectStreams ?? true,
          pageIndices: options.pageIndices,
        }
      );
      return {
        bytes,
        method: 'vector',
        achievedScale: 1.0,
        achievedQuality: 1.0,
        grayscale: false,
        hitTarget: true,
      };
    }

    if (options.mode === 'target' && options.targetBytes) {
      return await ExportEngine.compressToTargetSize(
        pdfManager,
        annotationManager,
        trueEditManager,
        options.targetBytes,
        {
          pageIndices: options.pageIndices,
          allowGrayscaleFallback: options.allowGrayscaleFallback ?? true,
          maxScale: options.scale || 1.5,
        },
        onProgress
      );
    }

    const bytes = await ExportEngine.compressPDF(
      pdfManager,
      annotationManager,
      trueEditManager,
      {
        scale: options.scale,
        quality: options.quality,
        grayscale: options.grayscale,
        pageIndices: options.pageIndices,
      },
      onProgress
    );
    return {
      bytes,
      method: 'compressed',
      achievedScale: options.scale,
      achievedQuality: options.quality,
      grayscale: !!options.grayscale,
      hitTarget: true,
    };
  }

  /**
   * Extracts selected pages to a brand new PDF document
   */
  static async extractPagesToPDF(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    selectedPageIndices: number[]
  ): Promise<Uint8Array> {
    const fullBytes = await ExportEngine.exportPDF(pdfManager, annotationManager, trueEditManager);
    const fullDoc = await PDFDocument.load(fullBytes, { ignoreEncryption: true });
    const extractedDoc = await PDFDocument.create();
    const copied = await extractedDoc.copyPages(fullDoc, selectedPageIndices);
    copied.forEach((p) => extractedDoc.addPage(p));
    return await extractedDoc.save();
  }

  /**
   * Computes target page dimensions and scaled content layout for a given source page.
   * Shared between live UI preview and actual PDF export.
   */
  static computeNormalizedPageLayout(
    visW: number,
    visH: number,
    options: NormalizePagesOptions
  ): {
    dstW: number;
    dstH: number;
    drawVisW: number;
    drawVisH: number;
    boxX: number;
    boxY: number;
    safeMargin: number;
    availW: number;
    availH: number;
    scaleX: number;
    scaleY: number;
    isAlreadyMatching: boolean;
  } {
    const baseW = Math.max(36, options.targetWidth);
    const baseH = Math.max(36, options.targetHeight);
    const tol = options.tolerancePt ?? 2.0;

    let dstW: number;
    let dstH: number;
    if (options.orientationMode === 'portrait') {
      dstW = Math.min(baseW, baseH);
      dstH = Math.max(baseW, baseH);
    } else if (options.orientationMode === 'landscape') {
      dstW = Math.max(baseW, baseH);
      dstH = Math.min(baseW, baseH);
    } else {
      // keep per-page orientation
      if (visW > visH + 1) {
        dstW = Math.max(baseW, baseH);
        dstH = Math.min(baseW, baseH);
      } else {
        dstW = Math.min(baseW, baseH);
        dstH = Math.max(baseW, baseH);
      }
    }

    const safeMargin = Math.max(0, Math.min(options.marginPt || 0, Math.min(dstW, dstH) * 0.4));
    const availW = Math.max(10, dstW - safeMargin * 2);
    const availH = Math.max(10, dstH - safeMargin * 2);

    const safeVisW = Math.max(1, visW);
    const safeVisH = Math.max(1, visH);

    let drawVisW = safeVisW;
    let drawVisH = safeVisH;

    if (options.fitMode === 'contain') {
      const s = Math.min(availW / safeVisW, availH / safeVisH);
      drawVisW = safeVisW * s;
      drawVisH = safeVisH * s;
    } else if (options.fitMode === 'cover') {
      const s = Math.max(availW / safeVisW, availH / safeVisH);
      drawVisW = safeVisW * s;
      drawVisH = safeVisH * s;
    } else if (options.fitMode === 'stretch') {
      drawVisW = availW;
      drawVisH = availH;
    } else {
      // center (100% original scale)
      drawVisW = safeVisW;
      drawVisH = safeVisH;
    }

    let boxX = safeMargin + (availW - drawVisW) / 2;
    let boxY = safeMargin + (availH - drawVisH) / 2;

    if (options.alignMode === 'top-center') {
      boxX = safeMargin + (availW - drawVisW) / 2;
      boxY = dstH - safeMargin - drawVisH;
    } else if (options.alignMode === 'top-left') {
      boxX = safeMargin;
      boxY = dstH - safeMargin - drawVisH;
    }

    const isAlreadyMatching =
      Math.abs(safeVisW - dstW) <= tol &&
      Math.abs(safeVisH - dstH) <= tol;

    return {
      dstW,
      dstH,
      drawVisW,
      drawVisH,
      boxX,
      boxY,
      safeMargin,
      availW,
      availH,
      scaleX: drawVisW / safeVisW,
      scaleY: drawVisH / safeVisH,
      isAlreadyMatching,
    };
  }

  /**
   * Resizes and normalizes page dimensions & layouts across a PDF while preserving vector text and graphics.
   */
  static async normalizePages(
    pdfBytes: Uint8Array,
    options: NormalizePagesOptions,
    onProgress?: (percent: number, statusText: string) => void
  ): Promise<{ bytes: Uint8Array; resizedCount: number; skippedCount: number }> {
    onProgress?.(10, 'Loading document structure...');

    const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const outputDoc = await PDFDocument.create();

    // Preserve core metadata cleanly
    try {
      const title = srcDoc.getTitle();
      if (title) outputDoc.setTitle(title);
      const author = srcDoc.getAuthor();
      if (author) outputDoc.setAuthor(author);
      const subject = srcDoc.getSubject();
      if (subject) outputDoc.setSubject(subject);
      const creator = srcDoc.getCreator();
      if (creator) outputDoc.setCreator(creator);
    } catch (_) {}

    const srcPages = srcDoc.getPages();
    const totalPages = srcPages.length;
    const selectedSet = options.pageIndices ? new Set(options.pageIndices) : null;

    interface PagePlan {
      index: number;
      action: 'copy' | 'blank' | 'embed';
      dstW: number;
      dstH: number;
      rawW: number;
      rawH: number;
      visW: number;
      visH: number;
      rotAngle: number;
      layout: ReturnType<typeof ExportEngine.computeNormalizedPageLayout>;
      embedSlot?: number;
      copySlot?: number;
    }

    const plans: PagePlan[] = [];
    const pagesToEmbed: any[] = [];
    const boxesToEmbed: Array<{ left: number; bottom: number; right: number; top: number }> = [];
    const indicesToCopy: number[] = [];

    onProgress?.(25, 'Analyzing page boxes and rotations...');

    for (let i = 0; i < totalPages; i++) {
      const srcPage = srcPages[i];
      const mediaBox = srcPage.getMediaBox();
      const cropBox = srcPage.getCropBox();

      let left = Math.max(mediaBox.x, cropBox.x);
      let bottom = Math.max(mediaBox.y, cropBox.y);
      let right = Math.min(mediaBox.x + mediaBox.width, cropBox.x + cropBox.width);
      let top = Math.min(mediaBox.y + mediaBox.height, cropBox.y + cropBox.height);

      if (right - left <= 1 || top - bottom <= 1) {
        left = mediaBox.x;
        bottom = mediaBox.y;
        right = mediaBox.x + mediaBox.width;
        top = mediaBox.y + mediaBox.height;
      }

      const rawW = Math.max(1, right - left);
      const rawH = Math.max(1, top - bottom);

      const rawRot = ((srcPage.getRotation().angle % 360) + 360) % 360;
      const rotAngle = Math.round(rawRot / 90) * 90 % 360;
      const isQuarterTurn = rotAngle === 90 || rotAngle === 270;
      const visW = isQuarterTurn ? rawH : rawW;
      const visH = isQuarterTurn ? rawW : rawH;

      const layout = ExportEngine.computeNormalizedPageLayout(visW, visH, options);

      let inScope = true;
      if (options.scope === 'mismatched') {
        inScope = !layout.isAlreadyMatching;
      } else if ((options.scope === 'current' || options.scope === 'custom') && selectedSet) {
        inScope = selectedSet.has(i);
      }

      const alreadyCleanExact =
        options.marginPt === 0 &&
        rotAngle === 0 &&
        Math.abs(left) <= 0.5 &&
        Math.abs(bottom) <= 0.5 &&
        Math.abs(visW - layout.dstW) <= 0.5 &&
        Math.abs(visH - layout.dstH) <= 0.5;

      if (!inScope || alreadyCleanExact) {
        const copySlot = indicesToCopy.length;
        indicesToCopy.push(i);
        plans.push({
          index: i,
          action: 'copy',
          dstW: layout.dstW,
          dstH: layout.dstH,
          rawW,
          rawH,
          visW,
          visH,
          rotAngle,
          layout,
          copySlot,
        });
        continue;
      }

      const contents = srcPage.node.Contents();
      const hasContents = !!(
        contents &&
        (typeof (contents as any).size !== 'function' || (contents as any).size() > 0)
      );

      if (!hasContents) {
        plans.push({
          index: i,
          action: 'blank',
          dstW: layout.dstW,
          dstH: layout.dstH,
          rawW,
          rawH,
          visW,
          visH,
          rotAngle,
          layout,
        });
        continue;
      }

      const embedSlot = pagesToEmbed.length;
      pagesToEmbed.push(srcPage);
      boxesToEmbed.push({ left, bottom, right, top });
      plans.push({
        index: i,
        action: 'embed',
        dstW: layout.dstW,
        dstH: layout.dstH,
        rawW,
        rawH,
        visW,
        visH,
        rotAngle,
        layout,
        embedSlot,
      });
    }

    onProgress?.(45, 'Embedding vector page streams...');

    const embeddedPages = pagesToEmbed.length > 0
      ? await outputDoc.embedPages(pagesToEmbed, boxesToEmbed)
      : [];
    const copiedPages = indicesToCopy.length > 0
      ? await outputDoc.copyPages(srcDoc, indicesToCopy)
      : [];

    let resizedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      onProgress?.(
        Math.round(50 + ((i + 1) / plans.length) * 35),
        `Resizing page ${i + 1} of ${totalPages}...`
      );

      if (plan.action === 'copy') {
        const copied = copiedPages[plan.copySlot!];
        outputDoc.addPage(copied);
        skippedCount++;
        continue;
      }

      if (plan.action === 'blank') {
        const blankPage = outputDoc.addPage([plan.dstW, plan.dstH]);
        blankPage.setMediaBox(0, 0, plan.dstW, plan.dstH);
        blankPage.setCropBox(0, 0, plan.dstW, plan.dstH);
        resizedCount++;
        continue;
      }

      const embeddedPage = embeddedPages[plan.embedSlot!];
      let embedSucceeded = false;
      try {
        await embeddedPage.embed();
        embedSucceeded = true;
      } catch (embedErr) {
        console.warn(`Embed warning on page ${i + 1}, checking fallback:`, embedErr);
      }

      if (!embedSucceeded) {
        // Safe fallback: if page had no valid content stream or failed Form XObject embedding,
        // copy page directly and apply proportional scale/translate or leave blank if missing contents
        const errMsg = String(plans[i]);
        void errMsg;
        try {
          const [fallbackCopied] = await outputDoc.copyPages(srcDoc, [i]);
          const np = outputDoc.addPage(fallbackCopied);
          const { dstW, dstH, boxX, boxY, scaleX, scaleY } = plan.layout;
          np.setMediaBox(0, 0, dstW, dstH);
          np.setCropBox(0, 0, dstW, dstH);
          np.scaleContent(scaleX, scaleY);
          np.translateContent(boxX, boxY);
          resizedCount++;
        } catch (_) {
          const blankFallback = outputDoc.addPage([plan.dstW, plan.dstH]);
          blankFallback.setMediaBox(0, 0, plan.dstW, plan.dstH);
          blankFallback.setCropBox(0, 0, plan.dstW, plan.dstH);
          resizedCount++;
        }
        continue;
      }

      const newPage = outputDoc.addPage([plan.dstW, plan.dstH]);
      newPage.setMediaBox(0, 0, plan.dstW, plan.dstH);
      newPage.setCropBox(0, 0, plan.dstW, plan.dstH);

      const { drawVisW, drawVisH, boxX, boxY, safeMargin, availW, availH } = plan.layout;
      const needsMarginClip =
        safeMargin > 0 && (drawVisW > availW + 0.1 || drawVisH > availH + 0.1);

      if (needsMarginClip) {
        newPage.pushOperators(
          pushGraphicsState(),
          rectangle(safeMargin, safeMargin, availW, availH),
          clip(),
          endPath()
        );
      }

      if (plan.rotAngle === 90) {
        newPage.drawPage(embeddedPage, {
          x: boxX,
          y: boxY + drawVisH,
          xScale: drawVisH / plan.rawW,
          yScale: drawVisW / plan.rawH,
          rotate: degrees(-90),
        });
      } else if (plan.rotAngle === 180) {
        newPage.drawPage(embeddedPage, {
          x: boxX + drawVisW,
          y: boxY + drawVisH,
          xScale: drawVisW / plan.rawW,
          yScale: drawVisH / plan.rawH,
          rotate: degrees(180),
        });
      } else if (plan.rotAngle === 270) {
        newPage.drawPage(embeddedPage, {
          x: boxX + drawVisW,
          y: boxY,
          xScale: drawVisH / plan.rawW,
          yScale: drawVisW / plan.rawH,
          rotate: degrees(90),
        });
      } else {
        newPage.drawPage(embeddedPage, {
          x: boxX,
          y: boxY,
          xScale: drawVisW / plan.rawW,
          yScale: drawVisH / plan.rawH,
          rotate: degrees(0),
        });
      }

      if (needsMarginClip) {
        newPage.pushOperators(popGraphicsState());
      }

      resizedCount++;
    }

    onProgress?.(90, 'Saving normalized PDF...');
    const bytes = await outputDoc.save();
    onProgress?.(100, 'Page sizes unified!');
    return { bytes, resizedCount, skippedCount };
  }
}
