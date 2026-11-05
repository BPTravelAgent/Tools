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

    // Global window drag and drop: allow dropping any PDF anywhere onto the editor at any time
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        await editorUI.handleFile(file);
      }
    });
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
