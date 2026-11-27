export type EditorMode = 'annotate' | 'trueedit';

export type ToolType = 
  | 'hand' 
  | 'select' 
  | 'text' 
  | 'img' 
  | 'freehand' 
  | 'highlight'
  | 'shapes' 
  | 'whiteout' 
  | 'eraser'
  | 'snip'
  | 'crop';

export type HighlightVariant = 'text' | 'box' | 'circle' | 'pen' | 'underline';
export type HighlightBlendMode = 'multiply' | 'normal';

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

export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  variant: HighlightVariant;
  color: string;
  intensity: number;
  blendMode: HighlightBlendMode;
  fillEnabled: boolean;
  borderWidth: number;
  borderRadius: number;
  points?: FreehandPoint[];
  strokeWidth?: number;
  lineCap?: 'round' | 'square';
}

export type Annotation = 
  | TextAnnotation 
  | ShapeAnnotation 
  | ImageAnnotation 
  | FreehandAnnotation 
  | WhiteoutAnnotation
  | HighlightAnnotation;

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
  isImagePage?: boolean;
  imageSrc?: string;
  cropBox?: { x: number; y: number; width: number; height: number };
}

export type PageSizePresetId =
  | 'a4'
  | 'letter'
  | 'legal'
  | 'a3'
  | 'a5'
  | 'b5'
  | 'match_first'
  | 'match_current'
  | 'match_common'
  | 'match_largest'
  | 'match_smallest'
  | 'custom';

export type PageOrientationMode = 'portrait' | 'landscape' | 'keep';
export type PageFitMode = 'contain' | 'cover' | 'stretch' | 'center';
export type PageAlignMode = 'center' | 'top-center' | 'top-left';
export type NormalizeScope = 'all' | 'mismatched' | 'current' | 'custom';

export interface NormalizePagesOptions {
  targetWidth: number;
  targetHeight: number;
  orientationMode: PageOrientationMode;
  fitMode: PageFitMode;
  alignMode: PageAlignMode;
  marginPt: number;
  scope: NormalizeScope;
  pageIndices?: number[];
  tolerancePt?: number;
}

export interface PageSizeDetail {
  pageIndex: number;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape' | 'square';
  label: string;
  isCropped: boolean;
  rotation: number;
}

export interface PageSizeSummary {
  totalPages: number;
  uniqueSizeCount: number;
  hasMixedSizes: boolean;
  hasMixedOrientations: boolean;
  pageDetails: PageSizeDetail[];
  mostCommonSize: { width: number; height: number; count: number; label: string };
  largestSize: { width: number; height: number; label: string };
  smallestSize: { width: number; height: number; label: string };
}

export type ExportCompressMode = 'vector' | 'compress' | 'target';

export interface ExportPDFAdvancedOptions {
  mode: ExportCompressMode;
  pageIndices?: number[];
  optimizeObjectStreams?: boolean;
  scale: number;
  quality: number;
  grayscale?: boolean;
  targetBytes?: number;
  allowGrayscaleFallback?: boolean;
}

export interface ExportPDFAdvancedResult {
  bytes: Uint8Array;
  method: 'vector' | 'compressed';
  achievedScale: number;
  achievedQuality: number;
  grayscale: boolean;
  hitTarget: boolean;
}

export interface MergeSourceDoc {
  id: string;
  name: string;
  bytes: Uint8Array;
}

export interface MergePagePlanItem {
  sourceId: string;
  pageIndex: number;
  rotationDelta: number;
}
