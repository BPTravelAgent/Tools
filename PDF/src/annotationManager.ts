import type {
  Annotation,
  TextAnnotation,
  ShapeAnnotation,
  ImageAnnotation,
  FreehandAnnotation,
  WhiteoutAnnotation,
  ShapeType,
} from './types';

export class AnnotationManager {
  private annotations: Map<number, Annotation[]> = new Map();
  private selectedId: string | null = null;
  private undoStack: string[] = [];
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
    this.undoStack.push(snapshot);
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = []; // clear redo on new action
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const currentSnapshot = JSON.stringify(Array.from(this.annotations.entries()));
    this.redoStack.push(currentSnapshot);

    const prev = this.undoStack.pop()!;
    const entries = JSON.parse(prev);
    this.annotations = new Map(entries);
    this.selectedId = null;
    this.notifyChange(false);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const currentSnapshot = JSON.stringify(Array.from(this.annotations.entries()));
    this.undoStack.push(currentSnapshot);

    const next = this.redoStack.pop()!;
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

  clearAll(pageIndex?: number) {
    if (pageIndex !== undefined) {
      this.annotations.delete(pageIndex);
    } else {
      this.annotations.clear();
    }
    this.selectedId = null;
    this.notifyChange();
  }
}

