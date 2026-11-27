import * as pdfjsLib from 'pdfjs-dist';
import { ExportEngine } from './exportEngine';
import { getAssetUrl } from './utils';
import type { PDFManager } from './pdfManager';
import type { AnnotationManager } from './annotationManager';
import type { TrueEditManager } from './trueEditManager';
import type { ExportCompressMode, ExportPDFAdvancedOptions } from './types';

export interface ExportCompressStudioCallbacks {
  getPDFManager: () => PDFManager;
  getAnnotationManager: () => AnnotationManager;
  getTrueEditManager: () => TrueEditManager;
  getActivePageIndex: () => number;
  getCurrentFileSize: () => number;
  parsePageRange: (rangeStr: string, totalPages: number) => number[];
  formatBytes: (bytes: number) => string;
  onLoadBytesIntoEditor: (bytes: Uint8Array, fileName: string) => Promise<void>;
  onDownloadSuccess: () => void;
}

export class ExportCompressStudioModal {
  private callbacks: ExportCompressStudioCallbacks;
  private modalEl: HTMLElement | null = null;
  private activeMode: ExportCompressMode = 'vector';
  private customFilenameTouched: boolean = false;
  private calculatedBytes: Uint8Array | null = null;
  private calculatedSignature: string = '';

  constructor(callbacks: ExportCompressStudioCallbacks) {
    this.callbacks = callbacks;
  }

  public mount(parentEl: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal-backdrop hidden" id="exportDownloadModal">
        <div class="modal-card modal-card-xl">
          <div class="modal-header-custom">
            <div style="display:flex; align-items:center; gap:9px;">
              <span style="font-size:21px;">📥</span>
              <div>
                <h2 class="modal-title" style="margin:0; font-size:18px;">Download &amp; Compress PDF Studio</h2>
                <div style="font-size:11.5px; color:#64748b; margin-top:2px;">Save lossless vector PDF, adjust compression &amp; DPI sliders, or auto-fit under an exact KB / MB limit</div>
              </div>
            </div>
            <button type="button" class="modal-close-btn" id="btnCloseExpModal">&times;</button>
          </div>

          <div class="modal-body-custom">
            <!-- Size Summary Banner -->
            <div class="exp-size-banner" id="expSizeBanner">
              <div class="exp-size-col">
                <span class="exp-size-label">Source Document Size</span>
                <strong class="exp-size-val" id="expOrigSizeText">0 KB</strong>
              </div>
              <div style="font-size:18px; color:#94a3b8; font-weight:700;">➔</div>
              <div class="exp-size-col">
                <span class="exp-size-label" id="expOutLabel">Estimated Output Size</span>
                <strong class="exp-size-val exp-size-highlight" id="expOutSizeText">~0 KB</strong>
              </div>
              <div id="expSavedPill" class="exp-saved-pill">Vector Quality</div>
            </div>

            <!-- Mode Tabs -->
            <div class="exp-mode-tabs" id="expModeTabs">
              <button type="button" class="exp-mode-tab active" data-exp-mode="vector">
                <span class="exp-tab-title">✨ Original Vector</span>
                <span class="exp-tab-sub">Lossless text &amp; fonts</span>
              </button>
              <button type="button" class="exp-mode-tab" data-exp-mode="compress">
                <span class="exp-tab-title">🎚️ Compress &amp; Resize MB</span>
                <span class="exp-tab-sub">Adjust quality &amp; DPI sliders</span>
              </button>
              <button type="button" class="exp-mode-tab" data-exp-mode="target">
                <span class="exp-tab-title">🎯 Target Size (KB / MB)</span>
                <span class="exp-tab-sub">Auto-fit under exact limit</span>
              </button>
            </div>

            <div class="exp-studio-grid">
              <!-- Left Column: Settings -->
              <div class="exp-settings-col">
                <!-- Filename & Page Range -->
                <div class="norm-two-col">
                  <div>
                    <label class="norm-field-label" for="expFileNameInput">Output Filename</label>
                    <input type="text" id="expFileNameInput" class="norm-input" value="document_edited.pdf" />
                  </div>
                  <div>
                    <label class="norm-field-label" for="expPageScopeSelect">Pages to Export</label>
                    <select id="expPageScopeSelect" class="norm-select">
                      <option value="all" selected id="optExpAllPages">All Pages (1 to 1)</option>
                      <option value="custom">Custom Page Range...</option>
                    </select>
                  </div>
                </div>

                <div id="expCustomRangeWrap" class="hidden">
                  <label class="norm-field-label" for="expCustomRangeInput">Page Range (e.g. 1, 3-5)</label>
                  <input type="text" id="expCustomRangeInput" class="norm-input" placeholder="e.g. 1, 3 or 2-6" />
                </div>

                <!-- Panel 1: Vector Mode -->
                <div id="expPanelVector" class="exp-panel-card">
                  <div style="font-size:13px; font-weight:700; color:#0f172a; margin-bottom:6px;">✨ Lossless Vector PDF Export</div>
                  <p style="font-size:12px; color:#475569; line-height:1.45; margin-bottom:10px;">
                    Preserves crisp scalable vector text, TrueEdit™ editability, fonts, and sharp graphics with zero rasterization blur.
                  </p>
                  <label class="exp-check-row">
                    <input type="checkbox" id="expUseObjectStreams" checked />
                    <span>Enable lossless PDF stream compression (shrinks structure ~5–15% with zero quality loss)</span>
                  </label>
                </div>

                <!-- Panel 2: Custom Compress Mode -->
                <div id="expPanelCompress" class="exp-panel-card hidden">
                  <div class="exp-presets-row">
                    <button type="button" class="exp-preset-chip" data-comp-preset="extreme">⚡ Extreme Small<br><small>Max reduction</small></button>
                    <button type="button" class="exp-preset-chip active" data-comp-preset="balanced">📄 Balanced<br><small>Recommended</small></button>
                    <button type="button" class="exp-preset-chip" data-comp-preset="high">💎 High Quality<br><small>Print sharp</small></button>
                  </div>

                  <div class="exp-slider-box">
                    <div class="exp-slider-header">
                      <label for="expQualitySlider">Image Compression Quality (Size Control)</label>
                      <strong id="expQualityText" style="color:#E5322D;">75%</strong>
                    </div>
                    <input type="range" id="expQualitySlider" min="10" max="100" step="5" value="75" class="exp-range" />
                    <div class="exp-slider-ticks">
                      <span>Smaller KB (10%)</span>
                      <span>Balanced (75%)</span>
                      <span>Max Quality (100%)</span>
                    </div>
                  </div>

                  <div class="exp-slider-box">
                    <div class="exp-slider-header">
                      <label for="expScaleSlider">Resolution / DPI Scale</label>
                      <strong id="expScaleText" style="color:#0284c7;">1.50× (108 DPI)</strong>
                    </div>
                    <input type="range" id="expScaleSlider" min="0.5" max="2.5" step="0.25" value="1.5" class="exp-range" />
                    <div class="exp-slider-ticks">
                      <span>0.5× (Smallest)</span>
                      <span>1.5× (Sharp)</span>
                      <span>2.5× (Ultra HD)</span>
                    </div>
                  </div>

                  <label class="exp-check-row" style="margin-top:4px;">
                    <input type="checkbox" id="expGrayscaleCheck" />
                    <span>Convert to Grayscale (B&amp;W) — reduces file size by an extra ~30–40%</span>
                  </label>
                </div>

                <!-- Panel 3: Target File Size Mode -->
                <div id="expPanelTarget" class="exp-panel-card hidden">
                  <div style="font-size:12.5px; font-weight:700; color:#0f172a; margin-bottom:8px;">🎯 Auto-Fit Under Maximum File Size</div>
                  <div class="exp-target-chips">
                    <button type="button" class="exp-target-chip" data-target-kb="200">200 KB</button>
                    <button type="button" class="exp-target-chip active" data-target-kb="500">500 KB</button>
                    <button type="button" class="exp-target-chip" data-target-kb="1024">1 MB</button>
                    <button type="button" class="exp-target-chip" data-target-kb="2048">2 MB</button>
                    <button type="button" class="exp-target-chip" data-target-kb="5120">5 MB</button>
                  </div>

                  <div class="norm-two-col" style="margin-top:10px;">
                    <div>
                      <span class="norm-dim-sublabel">Custom Max Size</span>
                      <input type="number" id="expTargetValueInput" class="norm-input" min="25" step="10" value="500" />
                    </div>
                    <div>
                      <span class="norm-dim-sublabel">Unit</span>
                      <select id="expTargetUnitSelect" class="norm-select">
                        <option value="KB" selected>KB (Kilobytes)</option>
                        <option value="MB">MB (Megabytes)</option>
                      </select>
                    </div>
                  </div>

                  <label class="exp-check-row" style="margin-top:10px;">
                    <input type="checkbox" id="expAllowGrayscaleFallback" checked />
                    <span>Allow Grayscale fallback only if needed to meet strict KB limit</span>
                  </label>

                  <div style="font-size:11px; color:#64748b; margin-top:8px; line-height:1.4;">
                    💡 Automatically tests lossless vector first; if larger than target, finds the highest readable DPI &amp; quality that stays under your limit.
                  </div>
                </div>

                <!-- Progress Bar -->
                <div id="expProgressBox" class="hidden" style="margin-top:4px;">
                  <div style="font-size:12px; font-weight:600; color:#1e293b; margin-bottom:6px;" id="expProgressStatus">Preparing PDF...</div>
                  <div class="progress-bar-container">
                    <div class="progress-bar-fill" id="expProgressBarFill" style="width:0%"></div>
                  </div>
                </div>
              </div>

              <!-- Right Column: Exact Size Calculator & Visual Quality Preview -->
              <div class="exp-preview-col">
                <div class="exp-preview-card">
                  <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <span style="font-size:12px; font-weight:700; color:#0f172a;">Quality &amp; Size Inspector</span>
                    <button type="button" class="btn btn-outline" id="btnExpCalculate" style="padding:4px 10px; font-size:11.5px; font-weight:700;">
                      🔬 Calculate Exact Size
                    </button>
                  </div>
                  <div class="exp-preview-stage" id="expPreviewStage">
                    <div class="exp-preview-placeholder" id="expPreviewPlaceholder">
                      <div style="font-size:26px; margin-bottom:6px;">📊</div>
                      <div style="font-weight:600; color:#334155;">Click "Calculate Exact Size"</div>
                      <div style="font-size:11px; color:#64748b; margin-top:3px;">Inspect exact KB/MB output and preview compressed text sharpness before downloading</div>
                    </div>
                    <canvas id="expPreviewCanvas" class="hidden" style="max-width:100%; max-height:220px; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.14);"></canvas>
                  </div>
                  <div class="exp-preview-meta" id="expPreviewMeta">Ready to export</div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer-custom" style="justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <button type="button" class="btn btn-outline" id="btnExpLoadEditor" title="Replace open document in editor with compiled/compressed PDF">
              🔄 Apply to Editor
            </button>
            <div style="display:flex; gap:10px;">
              <button type="button" class="btn btn-outline" id="btnExpCancel">Cancel</button>
              <button type="button" class="btn btn-crimson" id="btnExpDownload">📥 Download PDF</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modalEl = wrapper.firstElementChild as HTMLElement;
    parentEl.appendChild(this.modalEl);
    this.setupListeners();
  }

  private setupListeners(): void {
    document.getElementById('btnCloseExpModal')?.addEventListener('click', () => this.close());
    document.getElementById('btnExpCancel')?.addEventListener('click', () => this.close());

    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    const fileInput = document.getElementById('expFileNameInput') as HTMLInputElement | null;
    fileInput?.addEventListener('input', () => {
      this.customFilenameTouched = true;
    });

    document.querySelectorAll('#expModeTabs .exp-mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = (tab.getAttribute('data-exp-mode') || 'vector') as ExportCompressMode;
        this.switchMode(mode);
      });
    });

    const scopeSelect = document.getElementById('expPageScopeSelect') as HTMLSelectElement | null;
    scopeSelect?.addEventListener('change', () => {
      document.getElementById('expCustomRangeWrap')?.classList.toggle('hidden', scopeSelect.value !== 'custom');
      this.invalidateCalculation();
      this.updateEstimate();
    });

    document.getElementById('expCustomRangeInput')?.addEventListener('input', () => {
      this.invalidateCalculation();
      this.updateEstimate();
    });

    document.getElementById('expUseObjectStreams')?.addEventListener('change', () => {
      this.invalidateCalculation();
      this.updateEstimate();
    });

    // Compress Presets
    document.querySelectorAll('.exp-preset-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.exp-preset-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const p = chip.getAttribute('data-comp-preset');
        const qSlider = document.getElementById('expQualitySlider') as HTMLInputElement | null;
        const sSlider = document.getElementById('expScaleSlider') as HTMLInputElement | null;
        if (p === 'extreme') {
          if (qSlider) qSlider.value = '40';
          if (sSlider) sSlider.value = '1.0';
        } else if (p === 'balanced') {
          if (qSlider) qSlider.value = '75';
          if (sSlider) sSlider.value = '1.5';
        } else if (p === 'high') {
          if (qSlider) qSlider.value = '90';
          if (sSlider) sSlider.value = '2.0';
        }
        this.syncSliderLabels();
        this.invalidateCalculation();
        this.updateEstimate();
      });
    });

    const qSlider = document.getElementById('expQualitySlider') as HTMLInputElement | null;
    const sSlider = document.getElementById('expScaleSlider') as HTMLInputElement | null;
    const onSliderChange = () => {
      document.querySelectorAll('.exp-preset-chip').forEach((c) => c.classList.remove('active'));
      this.syncSliderLabels();
      this.invalidateCalculation();
      this.updateEstimate();
    };
    qSlider?.addEventListener('input', onSliderChange);
    sSlider?.addEventListener('input', onSliderChange);

    document.getElementById('expGrayscaleCheck')?.addEventListener('change', () => {
      this.invalidateCalculation();
      this.updateEstimate();
    });

    // Target size chips
    document.querySelectorAll('.exp-target-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.exp-target-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const kb = parseInt(chip.getAttribute('data-target-kb') || '500', 10);
        const valIn = document.getElementById('expTargetValueInput') as HTMLInputElement | null;
        const unitSel = document.getElementById('expTargetUnitSelect') as HTMLSelectElement | null;
        if (kb >= 1024 && kb % 1024 === 0) {
          if (valIn) valIn.value = String(kb / 1024);
          if (unitSel) unitSel.value = 'MB';
        } else {
          if (valIn) valIn.value = String(kb);
          if (unitSel) unitSel.value = 'KB';
        }
        this.invalidateCalculation();
        this.updateEstimate();
      });
    });

    document.getElementById('expTargetValueInput')?.addEventListener('input', () => {
      document.querySelectorAll('.exp-target-chip').forEach((c) => c.classList.remove('active'));
      this.invalidateCalculation();
      this.updateEstimate();
    });
    document.getElementById('expTargetUnitSelect')?.addEventListener('change', () => {
      this.invalidateCalculation();
      this.updateEstimate();
    });
    document.getElementById('expAllowGrayscaleFallback')?.addEventListener('change', () => {
      this.invalidateCalculation();
    });

    document.getElementById('btnExpCalculate')?.addEventListener('click', () => this.runCalculationPreview());
    document.getElementById('btnExpDownload')?.addEventListener('click', () => this.runDownload());
    document.getElementById('btnExpLoadEditor')?.addEventListener('click', () => this.runLoadIntoEditor());
  }

  public open(initialMode: ExportCompressMode = 'vector'): void {
    const pdfManager = this.callbacks.getPDFManager();
    const totalPages = pdfManager.getPageCount();
    if (totalPages === 0) {
      alert('Please open a PDF document first.');
      return;
    }

    this.customFilenameTouched = false;
    this.invalidateCalculation();

    const origEl = document.getElementById('expOrigSizeText');
    if (origEl) origEl.textContent = this.callbacks.formatBytes(this.callbacks.getCurrentFileSize());

    const allOpt = document.getElementById('optExpAllPages');
    if (allOpt) allOpt.textContent = `All Pages (1 to ${totalPages})`;

    const scopeSel = document.getElementById('expPageScopeSelect') as HTMLSelectElement | null;
    if (scopeSel) scopeSel.value = 'all';
    document.getElementById('expCustomRangeWrap')?.classList.add('hidden');
    document.getElementById('expProgressBox')?.classList.add('hidden');

    this.switchMode(initialMode);
    this.syncSliderLabels();
    this.updateEstimate();
    this.modalEl?.classList.remove('hidden');
  }

  public close(): void {
    this.modalEl?.classList.add('hidden');
  }

  private switchMode(mode: ExportCompressMode): void {
    this.activeMode = mode;
    document.querySelectorAll('#expModeTabs .exp-mode-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-exp-mode') === mode);
    });
    document.getElementById('expPanelVector')?.classList.toggle('hidden', mode !== 'vector');
    document.getElementById('expPanelCompress')?.classList.toggle('hidden', mode !== 'compress');
    document.getElementById('expPanelTarget')?.classList.toggle('hidden', mode !== 'target');

    if (!this.customFilenameTouched) {
      const base = this.callbacks.getPDFManager().getFileName().replace(/\.pdf$/i, '');
      const fileInput = document.getElementById('expFileNameInput') as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = mode === 'vector' ? `${base}_edited.pdf` : `${base}_compressed.pdf`;
      }
    }

    this.invalidateCalculation();
    this.updateEstimate();
  }

  private syncSliderLabels(): void {
    const qSlider = document.getElementById('expQualitySlider') as HTMLInputElement | null;
    const sSlider = document.getElementById('expScaleSlider') as HTMLInputElement | null;
    const qVal = qSlider ? parseInt(qSlider.value, 10) : 75;
    const sVal = sSlider ? parseFloat(sSlider.value) : 1.5;

    const qText = document.getElementById('expQualityText');
    if (qText) qText.textContent = `${qVal}%`;
    const sText = document.getElementById('expScaleText');
    if (sText) sText.textContent = `${sVal.toFixed(2)}× (${Math.round(sVal * 72)} DPI)`;
  }

  private invalidateCalculation(): void {
    this.calculatedBytes = null;
    this.calculatedSignature = '';
    const canvas = document.getElementById('expPreviewCanvas') as HTMLCanvasElement | null;
    const placeholder = document.getElementById('expPreviewPlaceholder');
    if (canvas) canvas.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
    const metaEl = document.getElementById('expPreviewMeta');
    if (metaEl) metaEl.textContent = 'Ready to export';
  }

  private buildOptions(): ExportPDFAdvancedOptions | null {
    const pdfManager = this.callbacks.getPDFManager();
    const totalPages = pdfManager.getPageCount();
    const scopeVal = (document.getElementById('expPageScopeSelect') as HTMLSelectElement | null)?.value || 'all';
    let pageIndices: number[] | undefined;

    if (scopeVal === 'custom') {
      const rangeStr = (document.getElementById('expCustomRangeInput') as HTMLInputElement | null)?.value.trim() || '';
      pageIndices = this.callbacks.parsePageRange(rangeStr, totalPages);
      if (pageIndices.length === 0) return null;
    }

    const qSlider = document.getElementById('expQualitySlider') as HTMLInputElement | null;
    const sSlider = document.getElementById('expScaleSlider') as HTMLInputElement | null;
    const quality = (qSlider ? parseInt(qSlider.value, 10) : 75) / 100;
    const scale = sSlider ? parseFloat(sSlider.value) : 1.5;
    const grayscale = !!(document.getElementById('expGrayscaleCheck') as HTMLInputElement | null)?.checked;
    const optimizeObjectStreams = !!(document.getElementById('expUseObjectStreams') as HTMLInputElement | null)?.checked;

    const targetVal = parseFloat((document.getElementById('expTargetValueInput') as HTMLInputElement | null)?.value || '500') || 500;
    const targetUnit = (document.getElementById('expTargetUnitSelect') as HTMLSelectElement | null)?.value || 'KB';
    const targetBytes = Math.round(targetVal * (targetUnit === 'MB' ? 1024 * 1024 : 1024));
    const allowGrayscaleFallback = !!(document.getElementById('expAllowGrayscaleFallback') as HTMLInputElement | null)?.checked;

    return {
      mode: this.activeMode,
      pageIndices,
      optimizeObjectStreams,
      scale,
      quality,
      grayscale,
      targetBytes,
      allowGrayscaleFallback,
    };
  }

  private updateEstimate(): void {
    const pdfManager = this.callbacks.getPDFManager();
    const totalPages = pdfManager.getPageCount();
    if (totalPages === 0) return;

    const opts = this.buildOptions();
    const outLabel = document.getElementById('expOutLabel');
    const outText = document.getElementById('expOutSizeText');
    const pill = document.getElementById('expSavedPill');
    const dlBtn = document.getElementById('btnExpDownload');

    const origBytes = Math.max(1, this.callbacks.getCurrentFileSize());

    if (!opts) {
      if (outText) outText.textContent = 'Invalid range';
      if (pill) pill.textContent = 'Check page range';
      return;
    }

    const pageCount = opts.pageIndices ? opts.pageIndices.length : totalPages;
    const pageRatio = pageCount / Math.max(1, totalPages);

    if (this.calculatedBytes) {
      const exactSz = this.calculatedBytes.byteLength;
      const savedPct = Math.round(((origBytes - exactSz) / origBytes) * 100);
      if (outLabel) outLabel.textContent = 'Exact Output Size';
      if (outText) outText.textContent = this.callbacks.formatBytes(exactSz);
      if (pill) {
        if (savedPct > 0) {
          pill.textContent = `Saved ${savedPct}%`;
          pill.className = 'exp-saved-pill good';
        } else {
          pill.textContent = 'Calculated Exact';
          pill.className = 'exp-saved-pill';
        }
      }
      if (dlBtn) dlBtn.textContent = `📥 Download PDF (${this.callbacks.formatBytes(exactSz)})`;
      return;
    }

    if (outLabel) outLabel.textContent = 'Estimated Output Size';

    if (opts.mode === 'vector') {
      const est = Math.round(origBytes * pageRatio * (opts.optimizeObjectStreams ? 0.94 : 1.0));
      if (outText) outText.textContent = `~${this.callbacks.formatBytes(est)}`;
      if (pill) {
        pill.textContent = '100% Vector Quality';
        pill.className = 'exp-saved-pill';
      }
      if (dlBtn) dlBtn.textContent = '📥 Download PDF';
    } else if (opts.mode === 'compress') {
      // Heuristic size per page proportional to (ptW*scale)*(ptH*scale)*quality*(grayscale?0.65:1)
      let totalPixels = 0;
      const indices = opts.pageIndices || Array.from({ length: totalPages }, (_, i) => i);
      for (const idx of indices) {
        const eff = pdfManager.getEffectivePageSize(idx);
        totalPixels += eff.width * opts.scale * (eff.height * opts.scale);
      }
      const bytesPerPixel = 0.095 * Math.max(0.18, opts.quality) * (opts.grayscale ? 0.68 : 1.0);
      const est = Math.max(8 * 1024, Math.round(totalPixels * bytesPerPixel + pageCount * 900));
      const estPct = Math.round(((origBytes - est) / origBytes) * 100);
      if (outText) outText.textContent = `~${this.callbacks.formatBytes(est)}`;
      if (pill) {
        pill.textContent = estPct > 0 ? `Est. -${estPct}% smaller` : 'High Resolution';
        pill.className = estPct > 0 ? 'exp-saved-pill good' : 'exp-saved-pill';
      }
      if (dlBtn) dlBtn.textContent = `📥 Download PDF (~${this.callbacks.formatBytes(est)})`;
    } else {
      const target = opts.targetBytes || 500 * 1024;
      if (outText) outText.textContent = `≤ ${this.callbacks.formatBytes(target)}`;
      if (pill) {
        pill.textContent = 'Auto-Fit Target';
        pill.className = 'exp-saved-pill good';
      }
      if (dlBtn) dlBtn.textContent = `📥 Compress & Download (≤ ${this.callbacks.formatBytes(target)})`;
    }
  }

  private setButtonsBusy(busy: boolean): void {
    ['btnExpCalculate', 'btnExpDownload', 'btnExpLoadEditor'].forEach((id) => {
      const btn = document.getElementById(id) as HTMLButtonElement | null;
      if (btn) btn.disabled = busy;
    });
  }

  private async compileCurrentOptions(): Promise<{ bytes: Uint8Array; infoText: string }> {
    const opts = this.buildOptions();
    if (!opts) {
      throw new Error('Please enter a valid page range (e.g. 1, 3-5).');
    }

    const sig = JSON.stringify(opts);
    if (this.calculatedBytes && this.calculatedSignature === sig) {
      return {
        bytes: this.calculatedBytes,
        infoText: document.getElementById('expPreviewMeta')?.textContent || 'Ready',
      };
    }

    const progressBox = document.getElementById('expProgressBox');
    const statusEl = document.getElementById('expProgressStatus');
    const barEl = document.getElementById('expProgressBarFill');
    progressBox?.classList.remove('hidden');
    if (barEl) barEl.style.width = '8%';

    this.setButtonsBusy(true);
    try {
      const res = await ExportEngine.exportPDFAdvanced(
        this.callbacks.getPDFManager(),
        this.callbacks.getAnnotationManager(),
        this.callbacks.getTrueEditManager(),
        opts,
        (pct, status) => {
          if (barEl) barEl.style.width = `${pct}%`;
          if (statusEl) statusEl.textContent = status;
        }
      );

      this.calculatedBytes = res.bytes;
      this.calculatedSignature = sig;

      const szLabel = this.callbacks.formatBytes(res.bytes.byteLength);
      const infoText =
        res.method === 'vector'
          ? `Exact: ${szLabel} · Lossless Vector`
          : `Exact: ${szLabel} · ${res.achievedScale.toFixed(2)}× (${Math.round(res.achievedScale * 72)} DPI) · ${Math.round(res.achievedQuality * 100)}% Quality${res.grayscale ? ' · Grayscale' : ''}${opts.mode === 'target' ? (res.hitTarget ? ' ✅ Target Met' : ' ⚠️ Closest Possible') : ''}`;

      return { bytes: res.bytes, infoText };
    } finally {
      this.setButtonsBusy(false);
    }
  }

  private async runCalculationPreview(): Promise<void> {
    try {
      const { bytes, infoText } = await this.compileCurrentOptions();
      this.updateEstimate();

      const metaEl = document.getElementById('expPreviewMeta');
      if (metaEl) metaEl.textContent = infoText;

      // Render page 1 of generated PDF for live visual inspection
      const canvas = document.getElementById('expPreviewCanvas') as HTMLCanvasElement | null;
      const placeholder = document.getElementById('expPreviewPlaceholder');
      if (canvas) {
        try {
          const loadingTask = pdfjsLib.getDocument({
            data: bytes.slice(),
            cMapUrl: getAssetUrl('cmaps/'),
            cMapPacked: true,
            standardFontDataUrl: getAssetUrl('standard_fonts/'),
          });
          const doc = await loadingTask.promise;
          const previewPageNum = Math.min(doc.numPages, Math.max(1, this.callbacks.getActivePageIndex() + 1));
          const page = await doc.getPage(previewPageNum);
          const vp = page.getViewport({ scale: 0.65 });
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
          }
          await doc.destroy();
          placeholder?.classList.add('hidden');
          canvas.classList.remove('hidden');
        } catch (previewErr) {
          console.warn('Preview render warning:', previewErr);
        }
      }
      document.getElementById('expProgressBox')?.classList.add('hidden');
    } catch (err) {
      document.getElementById('expProgressBox')?.classList.add('hidden');
      alert((err as Error).message || 'Calculation failed');
    }
  }

  private async runDownload(): Promise<void> {
    try {
      const { bytes } = await this.compileCurrentOptions();
      const fileInput = document.getElementById('expFileNameInput') as HTMLInputElement | null;
      const outName = fileInput?.value.trim() || 'document.pdf';
      ExportEngine.downloadBytes(bytes, outName, true);
      this.close();
      this.callbacks.onDownloadSuccess();
    } catch (err) {
      document.getElementById('expProgressBox')?.classList.add('hidden');
      alert('Failed to download PDF: ' + (err as Error).message);
    }
  }

  private async runLoadIntoEditor(): Promise<void> {
    try {
      const { bytes } = await this.compileCurrentOptions();
      const fileInput = document.getElementById('expFileNameInput') as HTMLInputElement | null;
      const outName = fileInput?.value.trim() || this.callbacks.getPDFManager().getFileName();
      this.close();
      await this.callbacks.onLoadBytesIntoEditor(bytes, outName);
      this.callbacks.onDownloadSuccess();
    } catch (err) {
      document.getElementById('expProgressBox')?.classList.add('hidden');
      alert('Failed to load PDF into editor: ' + (err as Error).message);
    }
  }
}
