import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import UPNG from '@pdf-lib/upng';
import { fontManager } from './fontManager';
import { getAssetUrl } from './utils';
import type { PDFManager } from './pdfManager';
import type { AnnotationManager } from './annotationManager';
import type { TrueEditManager } from './trueEditManager';
import type {
  TextAnnotation,
  ShapeAnnotation,
  ImageAnnotation,
  FreehandAnnotation,
  WhiteoutAnnotation,
} from './types';

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
  static async exportPDF(
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager,
    onProgress?: (percent: number, statusText: string) => void
  ): Promise<Uint8Array> {
    onProgress?.(10, 'Initializing PDF Document...');

    const originalBytes = pdfManager.getOriginalBytes();
    if (!originalBytes) throw new Error('No PDF bytes available for export');

    // Create a new document to assemble the pages
    const originalDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
    const outputDoc = await PDFDocument.create();
    outputDoc.registerFontkit(fontkit);

    // Standard fonts for vector text
    const helvetica = await outputDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await outputDoc.embedFont(StandardFonts.HelveticaBold);
    const timesRoman = await outputDoc.embedFont(StandardFonts.TimesRoman);
    const courier = await outputDoc.embedFont(StandardFonts.Courier);

    // Custom fonts from Fornt folder
    let dmSansRegular: any = null;
    let dmSansBold: any = null;
    let libreBaskervilleRegular: any = null;
    let libreBaskervilleBold: any = null;

    try {
      const resp = await fetch(getAssetUrl('fonts/DMSans-Regular.ttf'));
      if (resp.ok) {
        const bytes = await resp.arrayBuffer();
        dmSansRegular = await outputDoc.embedFont(bytes);
      }
    } catch (e) {
      console.warn('Could not load DMSans-Regular font:', e);
    }

    try {
      const resp = await fetch(getAssetUrl('fonts/DMSans-Bold.ttf'));
      if (resp.ok) {
        const bytes = await resp.arrayBuffer();
        dmSansBold = await outputDoc.embedFont(bytes);
      }
    } catch (e) {
      console.warn('Could not load DMSans-Bold font:', e);
    }

    try {
      const resp = await fetch(getAssetUrl('fonts/LibreBaskerville-Regular.ttf'));
      if (resp.ok) {
        const bytes = await resp.arrayBuffer();
        libreBaskervilleRegular = await outputDoc.embedFont(bytes);
      }
    } catch (e) {
      console.warn('Could not load LibreBaskerville-Regular font:', e);
    }

    try {
      const resp = await fetch(getAssetUrl('fonts/LibreBaskerville-Bold.ttf'));
      if (resp.ok) {
        const bytes = await resp.arrayBuffer();
        libreBaskervilleBold = await outputDoc.embedFont(bytes);
      }
    } catch (e) {
      console.warn('Could not load LibreBaskerville-Bold font:', e);
    }

    // Custom uploaded fonts from FontManager
    const customEmbeddedFonts = new Map<string, any>();
    for (const font of fontManager.getAllFonts()) {
      if (font.isCustom && font.bytes) {
        try {
          const customEmbedded = await outputDoc.embedFont(font.bytes);
          customEmbeddedFonts.set(font.name.toLowerCase(), customEmbedded);
          customEmbeddedFonts.set(font.family.toLowerCase(), customEmbedded);
        } catch (customErr) {
          console.warn(`Could not embed custom font ${font.name}:`, customErr);
        }
      }
    }

    const resolveFont = (fontFamily: string, bold: boolean) => {
      const name = (fontFamily || '').toLowerCase();

      // 1. Check custom uploaded fonts first
      if (customEmbeddedFonts.has(name)) {
        return customEmbeddedFonts.get(name);
      }
      for (const [cKey, cFont] of customEmbeddedFonts.entries()) {
        if (name.includes(cKey) || cKey.includes(name)) {
          return cFont;
        }
      }

      // 2. Built-in bundled TTF fonts
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

    const pagesMeta = pdfManager.getPagesMeta();
    const totalPages = pagesMeta.length;

    onProgress?.(25, 'Processing pages and layout...');

    for (let i = 0; i < totalPages; i++) {
      const meta = pagesMeta[i];
      let newPage: any;

      if (meta.isBlankPage) {
        newPage = outputDoc.addPage([meta.width, meta.height]);
      } else {
        const [copiedPage] = await outputDoc.copyPages(originalDoc, [meta.originalPageNumber - 1]);
        newPage = outputDoc.addPage(copiedPage);
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
        const origHeight = change.origHeight ?? change.height;

        const wasMoved = change.origX !== undefined && change.origY !== undefined && (Math.abs(change.x - change.origX) > 1 || Math.abs(change.y - change.origY) > 1);

        const maskHeight = Math.max(origHeight + 4, change.fontSize * 1.25);
        const maskY = origBaseY - change.fontSize * 0.28;
        const maskWidth = Math.max(origWidth + 6, 20);

        newPage.drawRectangle({
          x: Math.max(0, origX - 2),
          y: Math.max(0, maskY),
          width: maskWidth,
          height: maskHeight,
          color: rgb(1, 1, 1),
        });

        // If not moved and has new multiline text, also mask the expanded area under it
        if (!wasMoved && !change.deleted && change.newText.trim().length > 0) {
          const rawLines = (change.newText || '').split('\n');
          const numLines = Math.max(1, rawLines.length);
          if (numLines > 1) {
            const lineHeight = change.fontSize * 1.25;
            const fullMaskHeight = Math.max(origHeight, change.fontSize * 1.08 + (numLines - 1) * lineHeight);
            const fullMaskY = origBaseY - change.fontSize * 0.22 - (numLines - 1) * lineHeight;
            newPage.drawRectangle({
              x: Math.max(0, origX - 1),
              y: Math.max(0, fullMaskY),
              width: maskWidth,
              height: fullMaskHeight,
              color: rgb(1, 1, 1),
            });
          }
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
        }
      }

      onProgress?.(
        Math.round(25 + ((i + 1) / totalPages) * 60),
        `Exporting page ${i + 1} of ${totalPages}...`
      );
    }

    onProgress?.(90, 'Finalizing and compressing PDF...');
    const resultBytes = await outputDoc.save();
    onProgress?.(100, 'Done!');
    return resultBytes;
  }

  static downloadBytes(bytes: Uint8Array, fileName: string) {
    const blob = new Blob([bytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.replace(/\.pdf$/i, '') + '_edited.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
