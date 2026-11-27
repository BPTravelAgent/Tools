import type {
  Annotation,
  TextAnnotation,
  ShapeAnnotation,
  ImageAnnotation,
  FreehandAnnotation,
  WhiteoutAnnotation,
  HighlightAnnotation,
  HighlightVariant,
  HighlightBlendMode,
  FreehandPoint,
  ShapeType,
} from './types';

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  let clean = (hex || '#FDE047').replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const intVal = parseInt(clean, 16);
  if (isNaN(intVal)) return { r: 253, g: 224, b: 71 };
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Adjusts highlight color tone lightness/depth (`intensity`: 0.25 light pastel .. 1.0 base .. 1.5 deep bold).
 */
export function computeEffectiveHighlightColor(baseHex: string, intensity: number = 1.0): string {
  const { r, g, b } = parseHexColor(baseHex);
  const clamped = Math.max(0.2, Math.min(1.6, intensity || 1.0));
  if (Math.abs(clamped - 1.0) < 0.01) {
    return rgbToHex(r, g, b);
  }
  if (clamped < 1.0) {
    // Shift toward soft pastel tint on white
    return rgbToHex(
      255 - (255 - r) * clamped,
      255 - (255 - g) * clamped,
      255 - (255 - b) * clamped
    );
  }
  // Shift richer / deeper while preserving hue chroma
  const depth = 1 - (clamped - 1.0) * 0.42;
  return rgbToHex(r * depth, g * depth, b * depth);
}

/**
 * Computes a crisp accent outline color for bordered/hollow highlight shapes.
 */
export function computeHighlightBorderColor(effectiveHex: string): string {
  const { r, g, b } = parseHexColor(effectiveHex);
  return rgbToHex(r * 0.72, g * 0.72, b * 0.72);
}

export class AnnotationManager {
  private annotations: Map<number, Annotation[]> = new Map();
  private selectedId: string | null = null;
  private undoStack: string[] = ['[]'];
  private redoStack: string[] = [];

  // Default styling presets
  public currentFontFamily: string = 'DM Sans';
  public currentFontSize: number = 18;
  public currentTextColor: string = '#111827';
  public currentTextBgColor: string = 'transparent';
  public currentBold: boolean = false;
  public currentItalic: boolean = false;
  public currentUnderline: boolean = false;
  public currentTextAlign: 'left' | 'center' | 'right' = 'left';

  public currentShapeType: ShapeType = 'rectangle';
  public currentFillColor: string = 'transparent';
  public currentStrokeColor: string = '#E5322D'; // iLovePDF Red
  public currentStrokeWidth: number = 2;
  public currentOpacity: number = 1.0;

  public currentBrushColor: string = '#E5322D';
  public currentBrushWidth: number = 3;

  // Highlighter Studio presets
  public currentHighlightVariant: HighlightVariant = 'box';
  public currentHighlightColor: string = '#FDE047';
  public currentHighlightOpacity: number = 0.38;
  public currentHighlightIntensity: number = 1.0;
  public currentHighlightBlendMode: HighlightBlendMode = 'multiply';
  public currentHighlightFillEnabled: boolean = true;
  public currentHighlightBorderWidth: number = 0;
  public currentHighlightBorderRadius: number = 3;
  public currentHighlightStrokeWidth: number = 18;
  public currentHighlightLineCap: 'round' | 'square' = 'round';

  private onChangeCallback: (() => void) | null = null;

  setOnChange(callback: () => void) {
    this.onChangeCallback = callback;
  }

  private notifyChange(saveHistory: boolean = true) {
    if (saveHistory) {
      this.pushHistory();
    }
    if (this.onChangeCallback) {
      this.onChangeCallback();
    }
  }

  private pushHistory() {
    const snapshot = JSON.stringify(Array.from(this.annotations.entries()));
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snapshot) {
      return;
    }
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 35) this.undoStack.shift();
    this.redoStack = []; // clear redo on new action
  }

  undo() {
    if (this.undoStack.length <= 1) return;
    const currentSnapshot = this.undoStack.pop()!;
    this.redoStack.push(currentSnapshot);

    const prev = this.undoStack[this.undoStack.length - 1];
    const entries = JSON.parse(prev);
    this.annotations = new Map(entries);
    this.selectedId = null;
    this.notifyChange(false);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(next);

    const entries = JSON.parse(next);
    this.annotations = new Map(entries);
    this.selectedId = null;
    this.notifyChange(false);
  }

  getAnnotations(pageIndex: number): Annotation[] {
    return this.annotations.get(pageIndex) || [];
  }

  getAllAnnotations(): Map<number, Annotation[]> {
    return this.annotations;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  setSelectedId(id: string | null) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    if (this.onChangeCallback) this.onChangeCallback();
  }

  getSelectedAnnotation(): Annotation | null {
    if (!this.selectedId) return null;
    for (const list of this.annotations.values()) {
      const found = list.find((a) => a.id === this.selectedId);
      if (found) return found;
    }
    return null;
  }

  addText(pageIndex: number, x: number, y: number, text: string = 'Your text here'): TextAnnotation {
    const id = `ann-text-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const pageAnns = this.annotations.get(pageIndex) || [];
    
    // Estimate width based on font size and text
    const estimatedWidth = Math.max(120, text.length * (this.currentFontSize * 0.65));
    const estimatedHeight = Math.max(36, this.currentFontSize * 1.5);

    const ann: TextAnnotation = {
      id,
      pageIndex,
      type: 'text',
      x,
      y,
      width: estimatedWidth,
      height: estimatedHeight,
      rotation: 0,
      opacity: this.currentOpacity,
      zIndex: pageAnns.length + 1,
      text,
      fontSize: this.currentFontSize,
      fontFamily: this.currentFontFamily,
      color: this.currentTextColor,
      backgroundColor: this.currentTextBgColor,
      bold: this.currentBold,
      italic: this.currentItalic,
      underline: this.currentUnderline,
      align: this.currentTextAlign,
    };

    pageAnns.push(ann);
    this.annotations.set(pageIndex, pageAnns);
    this.selectedId = id;
    this.notifyChange();
    return ann;
  }

  addShape(
    pageIndex: number,
    x: number,
    y: number,
    shape: ShapeType = this.currentShapeType,
    width: number = 120,
    height: number = 80
  ): ShapeAnnotation {
    const id = `ann-shape-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const pageAnns = this.annotations.get(pageIndex) || [];

    const ann: ShapeAnnotation = {
      id,
      pageIndex,
      type: 'shape',
      shape,
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: this.currentOpacity,
      zIndex: pageAnns.length + 1,
      fillColor: this.currentFillColor,
      strokeColor: this.currentStrokeColor,
      strokeWidth: this.currentStrokeWidth,
      strokeStyle: 'solid',
    };

    pageAnns.push(ann);
    this.annotations.set(pageIndex, pageAnns);
    this.selectedId = id;
    this.notifyChange();
    return ann;
  }

  addImage(pageIndex: number, x: number, y: number, src: string, imgWidth: number, imgHeight: number): ImageAnnotation {
    const id = `ann-img-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const pageAnns = this.annotations.get(pageIndex) || [];

    // Scale to reasonable bounds on page (max 300px width)
    let width = imgWidth;
    let height = imgHeight;
    const maxDimension = 260;
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height / width) * maxDimension);
        width = maxDimension;
      } else {
        width = Math.round((width / height) * maxDimension);
        height = maxDimension;
      }
    }

    const ann: ImageAnnotation = {
      id,
      pageIndex,
      type: 'image',
      x,
      y,
      width,
      height,
      aspectRatio: width / height,
      rotation: 0,
      opacity: 1.0,
      zIndex: pageAnns.length + 1,
      src,
    };

    pageAnns.push(ann);
    this.annotations.set(pageIndex, pageAnns);
    this.selectedId = id;
    this.notifyChange();
    return ann;
  }

  addFreehand(pageIndex: number, points: { x: number; y: number }[]): FreehandAnnotation | null {
    if (points.length < 2) return null;

    const id = `ann-free-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const pageAnns = this.annotations.get(pageIndex) || [];

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    // Pad slightly
    const padding = 6;
    const x = Math.max(0, minX - padding);
    const y = Math.max(0, minY - padding);
    const width = Math.max(20, maxX - minX + padding * 2);
    const height = Math.max(20, maxY - minY + padding * 2);

    const ann: FreehandAnnotation = {
      id,
      pageIndex,
      type: 'freehand',
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: this.currentOpacity,
      zIndex: pageAnns.length + 1,
      points,
      strokeColor: this.currentBrushColor,
      strokeWidth: this.currentBrushWidth,
    };

    pageAnns.push(ann);
    this.annotations.set(pageIndex, pageAnns);
    this.selectedId = id;
    this.notifyChange();
    return ann;
  }

  addWhiteout(pageIndex: number, x: number, y: number, width: number = 100, height: number = 30): WhiteoutAnnotation {
    const id = `ann-wo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const pageAnns = this.annotations.get(pageIndex) || [];

    const ann: WhiteoutAnnotation = {
      id,
      pageIndex,
      type: 'whiteout',
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1.0,
      zIndex: 1,
      fillColor: '#ffffff',
    };

    // Whiteout acts as a background redaction tool: place underneath foreground annotations (images, shapes, text)
    pageAnns.unshift(ann);
    pageAnns.forEach((a, i) => (a.zIndex = i + 1));
    this.annotations.set(pageIndex, pageAnns);
    this.selectedId = id;
    this.notifyChange();
    return ann;
  }

  private buildHighlightAnnotation(
    pageIndex: number,
    zIndex: number,
    params: {
      variant: HighlightVariant;
      x: number;
      y: number;
      width: number;
      height: number;
      points?: FreehandPoint[];
      color?: string;
      opacity?: number;
      intensity?: number;
      blendMode?: HighlightBlendMode;
      fillEnabled?: boolean;
      borderWidth?: number;
      borderRadius?: number;
      strokeWidth?: number;
      lineCap?: 'round' | 'square';
    }
  ): HighlightAnnotation {
    const id = `ann-hl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    let x = params.x;
    let y = params.y;
    let width = Math.max(8, params.width);
    let height = Math.max(6, params.height);
    const strokeWidth = params.strokeWidth ?? this.currentHighlightStrokeWidth;

    if ((params.variant === 'pen' || params.variant === 'underline') && params.points && params.points.length > 0) {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of params.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = Math.max(6, Math.ceil(strokeWidth / 2) + 2);
      x = Math.max(0, minX - pad);
      y = Math.max(0, minY - pad);
      width = Math.max(16, maxX - minX + pad * 2);
      height = Math.max(14, maxY - minY + pad * 2);
    }

    return {
      id,
      pageIndex,
      type: 'highlight',
      variant: params.variant,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      rotation: 0,
      opacity: Math.max(0.05, Math.min(0.95, params.opacity ?? this.currentHighlightOpacity)),
      zIndex,
      color: params.color ?? this.currentHighlightColor,
      intensity: Math.max(0.2, Math.min(1.6, params.intensity ?? this.currentHighlightIntensity)),
      blendMode: params.blendMode ?? this.currentHighlightBlendMode,
      fillEnabled: params.fillEnabled ?? this.currentHighlightFillEnabled,
      borderWidth: params.borderWidth ?? this.currentHighlightBorderWidth,
      borderRadius: params.borderRadius ?? this.currentHighlightBorderRadius,
      points: params.points ? params.points.map((p) => ({ x: p.x, y: p.y })) : undefined,
      strokeWidth,
      lineCap: params.lineCap ?? this.currentHighlightLineCap,
    };
  }

  addHighlight(
    pageIndex: number,
    params: {
      variant: HighlightVariant;
      x: number;
      y: number;
      width: number;
      height: number;
      points?: FreehandPoint[];
      color?: string;
      opacity?: number;
      intensity?: number;
      blendMode?: HighlightBlendMode;
      fillEnabled?: boolean;
      borderWidth?: number;
      borderRadius?: number;
      strokeWidth?: number;
      lineCap?: 'round' | 'square';
    }
  ): HighlightAnnotation {
    const pageAnns = this.annotations.get(pageIndex) || [];
    const ann = this.buildHighlightAnnotation(pageIndex, pageAnns.length + 1, params);
    pageAnns.push(ann);
    this.annotations.set(pageIndex, pageAnns);
    this.selectedId = ann.id;
    this.notifyChange();
    return ann;
  }

  addHighlightsBatch(
    pageIndex: number,
    items: Array<{
      variant: HighlightVariant;
      x: number;
      y: number;
      width: number;
      height: number;
      points?: FreehandPoint[];
    }>
  ): HighlightAnnotation[] {
    if (!items || items.length === 0) return [];
    const pageAnns = this.annotations.get(pageIndex) || [];
    const created: HighlightAnnotation[] = [];
    for (const item of items) {
      const ann = this.buildHighlightAnnotation(pageIndex, pageAnns.length + 1, item);
      pageAnns.push(ann);
      created.push(ann);
    }
    this.annotations.set(pageIndex, pageAnns);
    this.selectedId = created[created.length - 1].id;
    this.notifyChange();
    return created;
  }

  updateAnnotation(id: string, updates: Partial<Annotation>, saveHistory: boolean = true) {
    for (const [pageIdx, list] of this.annotations.entries()) {
      const idx = list.findIndex((a) => a.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updates } as Annotation;
        this.annotations.set(pageIdx, list);
        this.notifyChange(saveHistory);
        return;
      }
    }
  }

  deleteAnnotation(id: string) {
    for (const [pageIdx, list] of this.annotations.entries()) {
      const filtered = list.filter((a) => a.id !== id);
      if (filtered.length !== list.length) {
        this.annotations.set(pageIdx, filtered);
        if (this.selectedId === id) this.selectedId = null;
        this.notifyChange();
        return;
      }
    }
  }

  private clipboardAnnotation: Annotation | null = null;

  copySelectedAnnotation(): Annotation | null {
    const target = this.getSelectedAnnotation();
    if (!target) return null;
    this.clipboardAnnotation = JSON.parse(JSON.stringify(target));
    return this.clipboardAnnotation;
  }

  pasteAnnotation(targetPageIndex: number): Annotation | null {
    if (!this.clipboardAnnotation) return null;
    const pageAnns = this.annotations.get(targetPageIndex) || [];
    const newId = `ann-paste-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const pasted: Annotation = {
      ...JSON.parse(JSON.stringify(this.clipboardAnnotation)),
      id: newId,
      pageIndex: targetPageIndex,
      x: this.clipboardAnnotation.x + 20,
      y: this.clipboardAnnotation.y + 20,
      zIndex: pageAnns.length + 1,
    };
    if ('points' in pasted && Array.isArray(pasted.points)) {
      pasted.points = pasted.points.map((pt) => ({ x: pt.x + 20, y: pt.y + 20 }));
    }
    pageAnns.push(pasted);
    this.annotations.set(targetPageIndex, pageAnns);
    this.selectedId = newId;
    this.notifyChange();
    return pasted;
  }

  hasClipboard(): boolean {
    return this.clipboardAnnotation !== null;
  }

  duplicateAnnotation(id: string): Annotation | null {
    const target = this.getSelectedAnnotation();
    if (!target || target.id !== id) return null;

    const pageIndex = target.pageIndex;
    const pageAnns = this.annotations.get(pageIndex) || [];
    const newId = `ann-dup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const cloned: Annotation = {
      ...JSON.parse(JSON.stringify(target)),
      id: newId,
      x: target.x + 15,
      y: target.y + 15,
      zIndex: pageAnns.length + 1,
    };
    if ('points' in cloned && Array.isArray(cloned.points)) {
      cloned.points = cloned.points.map((pt) => ({ x: pt.x + 15, y: pt.y + 15 }));
    }

    pageAnns.push(cloned);
    this.annotations.set(pageIndex, pageAnns);
    this.selectedId = newId;
    this.notifyChange();
    return cloned;
  }

  bringToFront(id: string) {
    for (const list of this.annotations.values()) {
      const idx = list.findIndex((a) => a.id === id);
      if (idx !== -1) {
        const [item] = list.splice(idx, 1);
        list.push(item);
        // re-index zIndex
        list.forEach((a, i) => (a.zIndex = i + 1));
        this.notifyChange();
        return;
      }
    }
  }

  sendToBack(id: string) {
    for (const list of this.annotations.values()) {
      const idx = list.findIndex((a) => a.id === id);
      if (idx !== -1) {
        const [item] = list.splice(idx, 1);
        list.unshift(item);
        list.forEach((a, i) => (a.zIndex = i + 1));
        this.notifyChange();
        return;
      }
    }
  }

  moveLayerUp(id: string) {
    for (const list of this.annotations.values()) {
      const idx = list.findIndex((a) => a.id === id);
      if (idx !== -1 && idx < list.length - 1) {
        const temp = list[idx];
        list[idx] = list[idx + 1];
        list[idx + 1] = temp;
        list.forEach((a, i) => (a.zIndex = i + 1));
        this.notifyChange();
        return;
      }
    }
  }

  moveLayerDown(id: string) {
    for (const list of this.annotations.values()) {
      const idx = list.findIndex((a) => a.id === id);
      if (idx > 0) {
        const temp = list[idx];
        list[idx] = list[idx - 1];
        list[idx - 1] = temp;
        list.forEach((a, i) => (a.zIndex = i + 1));
        this.notifyChange();
        return;
      }
    }
  }

  movePage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const maxPage = Math.max(0, ...Array.from(this.annotations.keys()), fromIndex, toIndex);
    const pages: (Annotation[] | undefined)[] = [];
    for (let i = 0; i <= maxPage; i++) {
      pages.push(this.annotations.get(i));
    }
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);

    this.annotations.clear();
    pages.forEach((list, idx) => {
      if (list && list.length > 0) {
        list.forEach((ann) => { ann.pageIndex = idx; });
        this.annotations.set(idx, list);
      }
    });
    this.notifyChange();
  }

  removePage(pageIndex: number) {
    this.annotations.delete(pageIndex);
    const newAnns = new Map<number, Annotation[]>();
    for (const [pIdx, list] of this.annotations.entries()) {
      if (pIdx > pageIndex) {
        list.forEach((ann) => { ann.pageIndex = pIdx - 1; });
        newAnns.set(pIdx - 1, list);
      } else {
        newAnns.set(pIdx, list);
      }
    }
    this.annotations = newAnns;
    this.notifyChange();
  }

  duplicatePage(pageIndex: number) {
    const newAnns = new Map<number, Annotation[]>();
    for (const [pIdx, list] of this.annotations.entries()) {
      if (pIdx > pageIndex) {
        list.forEach((ann) => { ann.pageIndex = pIdx + 1; });
        newAnns.set(pIdx + 1, list);
      } else {
        newAnns.set(pIdx, list);
      }
    }
    const origList = this.annotations.get(pageIndex) || [];
    const duplicatedList = origList.map((ann) => ({
      ...ann,
      id: `ann-copy-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      pageIndex: pageIndex + 1,
    }));
    if (duplicatedList.length > 0) {
      newAnns.set(pageIndex + 1, duplicatedList);
    }
    this.annotations = newAnns;
    this.notifyChange();
  }

  hasAnyAnnotations(): boolean {
    for (const list of this.annotations.values()) {
      if (list && list.length > 0) return true;
    }
    return false;
  }

  clearAll(pageIndex?: number) {
    if (pageIndex !== undefined) {
      this.annotations.delete(pageIndex);
      this.pushHistory();
    } else {
      this.annotations.clear();
      this.undoStack = ['[]'];
      this.redoStack = [];
    }
    this.selectedId = null;
    if (this.onChangeCallback) {
      this.onChangeCallback();
    }
  }
}

