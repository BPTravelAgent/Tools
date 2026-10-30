import './style.css';
import { PDFManager } from './pdfManager';
import { AnnotationManager } from './annotationManager';
import { TrueEditManager } from './trueEditManager';
import { PDFEditorUI } from './ui';
import { getAssetUrl } from './utils';

async function initApp() {
  try {
    const pdfManager = new PDFManager();
    const annotationManager = new AnnotationManager();
    const trueEditManager = new TrueEditManager();

    const editorUI = new PDFEditorUI(
      'app',
      pdfManager,
      annotationManager,
      trueEditManager
    );

    // Auto-load sample PDF if query has ?sample=true
    const params = new URLSearchParams(window.location.search);
    if (params.get('sample') === 'true') {
      try {
        const resp = await fetch(getAssetUrl('sample.pdf'));
        const buffer = await resp.arrayBuffer();
        await editorUI.loadPDFBuffer(buffer, 'Sample_Business_Report.pdf');
      } catch (err) {
        console.warn('Could not auto-load sample PDF:', err);
      }
    }

    // Prevent browser from opening dragged files directly outside dropzone
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  } catch (error) {
    console.error('Error initializing PDF Editor:', error);
  }
}

// Ensure execution whether DOM is still loading or already parsed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
