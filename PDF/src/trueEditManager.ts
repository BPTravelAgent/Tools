import type { ExtractedTextItem, TrueEditTextChange, RichTextSpan } from './types';

export class TrueEditManager {
  private textChanges: Map<string, TrueEditTextChange> = new Map();
  private activeEditingId: string | null = null;
  private onChangeCallback: (() => void) | null = null;

  setOnChange(callback: () => void) {
    this.onChangeCallback = callback;
  }

  notify() {
    if (this.onChangeCallback) {
      this.onChangeCallback();
    }
  }

  getActiveEditingId(): string | null {
    return this.activeEditingId;
  }

  setActiveEditingId(id: string | null) {
    this.activeEditingId = id;
    this.notify();
  }

  getChange(id: string): TrueEditTextChange | undefined {
    return this.textChanges.get(id);
  }

  getAllChanges(): TrueEditTextChange[] {
    return Array.from(this.textChanges.values());
  }

  getChangesForPage(pageIndex: number): TrueEditTextChange[] {
    return Array.from(this.textChanges.values()).filter((c) => c.pageIndex === pageIndex);
  }

  startOrUpdateEdit(
    item: ExtractedTextItem,
    newText: string,
    fontFamily: string = 'DM Sans',
    fontSize: number = item.fontSize,
    color: string = item.color || '#000000',
    deleted: boolean = false,
    bold: boolean = item.bold ?? false,
    spans?: RichTextSpan[],
    align?: 'left' | 'center' | 'right',
    italic: boolean = false
  ): TrueEditTextChange {
    let change = this.textChanges.get(item.id);

    if (!change) {
      change = {
        id: item.id,
        pageIndex: item.pageIndex,
        originalText: item.text,
        newText: deleted ? '' : newText,
        spans: deleted ? [] : spans,
        align: align || 'left',
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        fontSize: fontSize,
        fontFamily: fontFamily,
        color: color,
        backgroundColor: '#ffffff',
        bold: bold,
        italic: italic,
        deleted: deleted,
        pdfX: item.pdfX,
        pdfBaselineY: item.pdfBaselineY,
        origX: item.x,
        origY: item.y,
        origWidth: item.width,
        origHeight: item.height,
        origPdfX: item.pdfX,
        origPdfBaselineY: item.pdfBaselineY,
      };
    } else {
      change.newText = deleted ? '' : newText;
      change.spans = deleted ? [] : spans;
      change.align = align || change.align || 'left';
      change.fontSize = fontSize;
      change.fontFamily = fontFamily;
      change.color = color;
      change.deleted = deleted;
      change.bold = bold;
      change.italic = italic;
      if (change.origX === undefined) change.origX = item.x;
      if (change.origY === undefined) change.origY = item.y;
      if (change.origWidth === undefined) change.origWidth = item.width;
      if (change.origHeight === undefined) change.origHeight = item.height;
      if (change.origPdfX === undefined) change.origPdfX = item.pdfX;
      if (change.origPdfBaselineY === undefined) change.origPdfBaselineY = item.pdfBaselineY;
    }

    this.textChanges.set(item.id, change);
    this.notify();
    return change;
  }

  updatePosition(id: string, x: number, y: number, pdfX?: number, pdfBaselineY?: number) {
    const change = this.textChanges.get(id);
    if (!change) return;
    change.x = x;
    change.y = y;
    if (pdfX !== undefined) change.pdfX = pdfX;
    if (pdfBaselineY !== undefined) change.pdfBaselineY = pdfBaselineY;
    this.notify();
  }

  revertChange(id: string) {
    this.textChanges.delete(id);
    if (this.activeEditingId === id) {
      this.activeEditingId = null;
    }
    this.notify();
  }

  clearAll() {
    this.textChanges.clear();
    this.activeEditingId = null;
    this.notify();
  }
}
