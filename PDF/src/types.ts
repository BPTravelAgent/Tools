export type EditorMode = 'annotate' | 'trueedit';

export type ToolType = 
  | 'hand' 
  | 'select' 
  | 'text' 
  | 'img' 
  | 'freehand' 
  | 'shapes' 
  | 'whiteout' 
  | 'eraser';

export type ShapeType = 
  | 'rectangle' 
  | 'ellipse' 
  | 'line' 
  | 'arrow' 
  | 'check' 
  | 'cross' 
  | 'heart' 
  | 'star';

export interface BaseAnnotation {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // in degrees
  opacity: number; // 0 to 1
  zIndex: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
}

export interface ShapeAnnotation extends BaseAnnotation {
  type: 'shape';
  shape: ShapeType;
  fillColor: string; // 'transparent' or hex
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed';
}

export interface ImageAnnotation extends BaseAnnotation {
  type: 'image';
  src: string; // data URL
  aspectRatio: number;
}

export interface FreehandPoint {
  x: number;
  y: number;
}

export interface FreehandAnnotation extends BaseAnnotation {
  type: 'freehand';
  points: FreehandPoint[];
  strokeColor: string;
  strokeWidth: number;
}

export interface WhiteoutAnnotation extends BaseAnnotation {
  type: 'whiteout';
  fillColor: string;
}

export type Annotation = 
  | TextAnnotation 
  | ShapeAnnotation 
  | ImageAnnotation 
  | FreehandAnnotation 
  | WhiteoutAnnotation;

export interface ExtractedTextItem {
  id: string;
  pageIndex: number;
  text: string;
  x: number; // in PDF points (viewport top-left origin)
  y: number; // in PDF points (viewport top-left origin)
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  color?: string; // hex color e.g. #000000
  bold?: boolean;
  pdfX?: number; // original PDF coordinate
  pdfBaselineY?: number; // original PDF baseline Y coordinate
}

export interface RichTextSpan {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface TrueEditTextChange {
  id: string;
  pageIndex: number;
  originalText: string;
  newText: string;
  spans?: RichTextSpan[];
  align?: 'left' | 'center' | 'right';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  deleted?: boolean;
  pdfX?: number;
  pdfBaselineY?: number;
  origX?: number;
  origY?: number;
  origWidth?: number;
  origHeight?: number;
  origPdfX?: number;
  origPdfBaselineY?: number;
}

export interface PageMetadata {
  pageIndex: number;
  originalPageNumber: number;
  rotation: number; // 0, 90, 180, 270
  width: number;
  height: number;
  scale: number;
  isBlankPage?: boolean;
}
