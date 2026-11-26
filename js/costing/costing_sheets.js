    // ══════════════════════════════════════════════════════════════
    // DYNAMIC TOUR COSTING EXCEL & GOOGLE SHEETS INTEGRATION
    // ══════════════════════════════════════════════════════════════
    const DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxt1wGx6SaS8a3fDKjO6eP05KOd3XeNHmGqraCXh2TBkKwEaWHdxsd7DpyxRqHGkKaoog/exec';
    const SLW_GOOGLE_SHEET_REGISTRY_KEY = 'SLW_GOOGLE_SHEET_REGISTRY';

    function getGoogleSheetsWebhookUrl() {
        return localStorage.getItem('bp_sheets_webhook_url') || DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL;
    }

    function isElementActuallyOpen(el) {
        if (!el) return false;
        if (el.classList && el.classList.contains('hidden')) return false;
        if (el.style && el.style.display === 'none') return false;
        try {
            return window.getComputedStyle(el).display !== 'none';
        } catch(e) {
            return true;
        }
    }

    function normalizeSheetInqVariants(rawInq) {
        const cleaned = String(rawInq || '').trim().toUpperCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-');
        const set = new Set();
        if (cleaned) set.add(cleaned);
        const digitsMatch = cleaned.match(/\d+/);
        if (digitsMatch) {
            const fullDigits = digitsMatch[0];
            set.add(fullDigits);
            set.add('INQ-' + fullDigits);
            const noZero = fullDigits.replace(/^0+/, '');
            if (noZero && noZero.length >= 3) {
                set.add(noZero);
                set.add('INQ-' + noZero);
            }
        }
        return Array.from(set);
    }

    function inqReferencesMatch(a, b) {
        if (!a || !b) return false;
        const varsA = normalizeSheetInqVariants(a);
        const varsB = new Set(normalizeSheetInqVariants(b));
        return varsA.some(v => varsB.has(v));
    }

    function stripSheetUrlHash(url) {
        if (!url) return null;
        return String(url).split('#')[0].trim() || null;
    }

    function readSheetRegistry() {
        try {
            const raw = localStorage.getItem(SLW_GOOGLE_SHEET_REGISTRY_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return {
                byInq: (parsed && typeof parsed.byInq === 'object' && parsed.byInq) ? parsed.byInq : {},
                byFileName: (parsed && typeof parsed.byFileName === 'object' && parsed.byFileName) ? parsed.byFileName : {}
            };
        } catch(e) {
            return { byInq: {}, byFileName: {} };
        }
    }

    function rememberGoogleSheetUrl(inqRef, fileName, sheetUrl) {
        const cleanUrl = stripSheetUrlHash(sheetUrl);
        if (!cleanUrl) return;
        try {
            const reg = readSheetRegistry();
            normalizeSheetInqVariants(inqRef).forEach(k => {
                reg.byInq[k] = cleanUrl;
            });
            if (fileName) {
                const fKey = String(fileName).trim().toLowerCase();
                if (fKey) reg.byFileName[fKey] = cleanUrl;
            }
            localStorage.setItem(SLW_GOOGLE_SHEET_REGISTRY_KEY, JSON.stringify(reg));
        } catch(e) {}
    }

    function findExistingGoogleSheetUrl(inqRef, expectedFileName = '') {
        if (typeof activeLoadedInqData !== 'undefined' && activeLoadedInqData && activeLoadedInqData.googleSheetUrl) {
            if (!inqRef || inqReferencesMatch(activeLoadedInqData.inq, inqRef)) {
                return stripSheetUrlHash(activeLoadedInqData.googleSheetUrl);
            }
        }
        const variants = normalizeSheetInqVariants(inqRef);
        const variantSet = new Set(variants);

        if (variants.length > 0 && typeof inqQuotationIndex !== 'undefined' && Array.isArray(inqQuotationIndex)) {
            const foundIdx = inqQuotationIndex.find(item => item && item.googleSheetUrl && normalizeSheetInqVariants(item.inq).some(v => variantSet.has(v)));
            if (foundIdx && foundIdx.googleSheetUrl) {
                return stripSheetUrlHash(foundIdx.googleSheetUrl);
            }
        }

        const docPrefix = (typeof SLW_INQ_DOC_PREFIX !== 'undefined') ? SLW_INQ_DOC_PREFIX : 'SLW_INQ_DOC_';
        for (const v of variants) {
            try {
                const raw = localStorage.getItem(docPrefix + v);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.googleSheetUrl) {
                        return stripSheetUrlHash(parsed.googleSheetUrl);
                    }
                }
            } catch(e) {}
        }

        const reg = readSheetRegistry();
        for (const v of variants) {
            if (reg.byInq[v]) return stripSheetUrlHash(reg.byInq[v]);
        }
        if (expectedFileName) {
            const fKey = String(expectedFileName).trim().toLowerCase();
            if (fKey && reg.byFileName[fKey]) return stripSheetUrlHash(reg.byFileName[fKey]);
        }
        return null;
    }

    window.slwFindExistingGoogleSheetUrl = findExistingGoogleSheetUrl;
    window.slwRememberGoogleSheetUrl = rememberGoogleSheetUrl;
    window.slwNormalizeSheetInqVariants = normalizeSheetInqVariants;

    async function lookupGoogleSheetUrlFromCloud(inqRef) {
        if (typeof db === 'undefined' || !db || !inqRef) return null;
        const variants = normalizeSheetInqVariants(inqRef);
        for (const v of variants) {
            try {
                const snap = await db.collection('slw_quotations').doc(v).get();
                if (snap.exists) {
                    const d = snap.data();
                    if (d && d.googleSheetUrl) {
                        rememberGoogleSheetUrl(v, null, d.googleSheetUrl);
                        return stripSheetUrlHash(d.googleSheetUrl);
                    }
                }
            } catch(e) {}
        }
        return null;
    }

    function resolveSheetMixActive(costingObj, ratesObj, citiesList) {
        const activeCities = (Array.isArray(citiesList) ? citiesList : []).filter(c => c && c.selected !== false);
        const citiesSupportMix = activeCities.length > 0 && (
            activeCities.some(c => Boolean(c.isSplit)) ||
            (activeCities.length > 1 && new Set(activeCities.map(c => c.mixPref).filter(p => p && p !== 'none')).size > 1)
        ) && !activeCities.some(c => !c.isSplit && c.mixPref === 'none') && activeCities.every(c => {
            if (c.isSplit) return true;
            if (c.mixPref === '3') return Boolean(c.hotel3Name);
            if (c.mixPref === '4') return Boolean(c.hotel4Name);
            if (c.mixPref === '5') return Boolean(c.hotel5Name);
            return false;
        });

        // If cities are defined and don't genuinely configure a Mix option, never show Mix column
        if (activeCities.length > 0 && !citiesSupportMix) {
            return false;
        }
        if (typeof costingObj?.hasMix === 'boolean') {
            return costingObj.hasMix;
        }
        if (citiesSupportMix) {
            return true;
        }
        return Boolean(ratesObj && ratesObj.pMix && cleanLkrNumber(ratesObj.pMix) !== '0' && cleanLkrNumber(ratesObj.pMix) !== '');
    }

    function getCurrentCostingExcelPayload() {
        calculate();
        const transferPax = Math.max(1, Number(document.getElementById('num_people_transfer')?.value) || 2);
        const hotelDivisor = Math.max(1, Number(document.getElementById('num_people_hotel')?.value) || 2);
        const rawPax = transferPax;
        
        const isSaveModalOpen = isElementActuallyOpen(document.getElementById('saveQuotationModal'));
        const isExportModalOpen = isElementActuallyOpen(document.getElementById('itineraryExportModal'));

        const quickPaxEl = document.getElementById('quickDetailsPaxInput');
        const savePaxEl = document.getElementById('saveQuotationPaxInput');
        const expPaxEl = document.getElementById('exportItineraryPax');
        let paxText = (isSaveModalOpen ? savePaxEl?.value : (quickPaxEl?.value || (isExportModalOpen ? expPaxEl?.value : '') || expPaxEl?.value || savePaxEl?.value) || '').trim();
        if (!paxText) {
            paxText = String(transferPax).padStart(2, '0') + ' Pax';
        }

        const isNewInqModalMode = isSaveModalOpen && Boolean(document.getElementById('savePackageModeNewInq')?.checked);
        const saveInqEl = document.getElementById('saveQuotationInqInput');
        const saveNewInqEl = document.getElementById('saveQuotationNewInqInput');
        const quickInqEl = document.getElementById('quickDetailsInqInput');
        const expInqEl = document.getElementById('exportItineraryInq');
        const loadedInqRef = (typeof activeLoadedInqKey !== 'undefined' && activeLoadedInqKey) ? activeLoadedInqKey : '';
        const inqRawCandidate = isSaveModalOpen
            ? ((isNewInqModalMode ? saveNewInqEl?.value : saveInqEl?.value) || quickInqEl?.value || expInqEl?.value || loadedInqRef)
            : (quickInqEl?.value || loadedInqRef || expInqEl?.value || saveInqEl?.value);
        const inq = (String(inqRawCandidate || '').trim()) || ('INQ-' + Math.floor(10000 + Math.random() * 90000));
        
        let defaultTitle = '';
        if (typeof activeLoadedPresetKey !== 'undefined' && activeLoadedPresetKey && typeof costingPresets !== 'undefined' && costingPresets[activeLoadedPresetKey] && costingPresets[activeLoadedPresetKey].title) {
            defaultTitle = costingPresets[activeLoadedPresetKey].title.trim();
        } else if (availableCities.length > 0) {
            defaultTitle = availableCities.map(c => (c.numberOfNights || 1) + 'N ' + c.name).join(' ');
        } else {
            defaultTitle = 'Thailand Tour Package';
        }

        const quickTitleEl = document.getElementById('quickDetailsTitleInput');
        const saveTitleEl = document.getElementById('saveQuotationTitleInput');
        const expTitleEl = document.getElementById('exportItineraryTitle');
        const title = (isSaveModalOpen
            ? (saveTitleEl?.value || quickTitleEl?.value || expTitleEl?.value || defaultTitle)
            : (quickTitleEl?.value || (isExportModalOpen ? expTitleEl?.value : '') || (typeof activeLoadedInqData !== 'undefined' && activeLoadedInqData?.title && inqReferencesMatch(activeLoadedInqData.inq, inq) ? activeLoadedInqData.title : '') || expTitleEl?.value || defaultTitle)
        ).trim();
        const roe = parseFloat(document.getElementById('lkr_rate')?.value) || 10.8;
        const globalMarkup = parseFloat(document.getElementById('markup')?.value) || 18;
        const m3 = parseFloat(document.getElementById('markup_pct_adult_3star')?.value) || globalMarkup;
        const mMix = parseFloat(document.getElementById('markup_pct_adult_mix')?.value) || globalMarkup;
        const m4 = parseFloat(document.getElementById('markup_pct_adult_4star')?.value) || globalMarkup;
        const m3ChildExtra = parseFloat(document.getElementById('markup_pct_child_extra_3star')?.value) || m3;
        const m3ChildShare = parseFloat(document.getElementById('markup_pct_child_sharing_3star')?.value) || m3;
        const mMixChildExtra = parseFloat(document.getElementById('markup_pct_child_extra_mix')?.value) || mMix;
        const mMixChildShare = parseFloat(document.getElementById('markup_pct_child_sharing_mix')?.value) || mMix;
        const m4ChildExtra = parseFloat(document.getElementById('markup_pct_child_extra_4star')?.value) || m4;
        const m4ChildShare = parseFloat(document.getElementById('markup_pct_child_sharing_4star')?.value) || m4;

        let travelMonthDate = '';
        const modalMonth = (document.getElementById('saveQuotationTravelMonthInput')?.value || '').trim();
        const modalYear = (document.getElementById('saveQuotationTravelYearInput')?.value || '').trim();
        if (modalMonth && modalYear) {
            travelMonthDate = modalMonth.includes(modalYear) ? modalMonth : `${modalMonth}-${modalYear}`;
        } else if (activeLoadedInqData && (activeLoadedInqData.travelMonthDate || (activeLoadedInqData.travelMonth && activeLoadedInqData.travelYear))) {
            travelMonthDate = activeLoadedInqData.travelMonthDate || `${activeLoadedInqData.travelMonth}-${activeLoadedInqData.travelYear}`;
        }

        let rawDate = travelMonthDate || (document.getElementById('exportItineraryDate')?.value || document.getElementById('saveQuotationDateInput')?.value || '').trim();
        let formattedMonthDate = '';
        if (rawDate && rawDate.includes('-')) {
            const parts = rawDate.split('-');
            if (parts.length === 3) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                    formattedMonthDate = d.toLocaleString('en-US', { month: 'short' }) + '-' + d.getFullYear();
                }
            } else if (parts.length === 2) {
                formattedMonthDate = rawDate;
            }
        } else if (rawDate) {
            formattedMonthDate = rawDate;
        }
        if (!formattedMonthDate) {
            formattedMonthDate = new Date().toLocaleString('en-US', { month: 'short' }) + '-' + new Date().getFullYear();
        }

        const mixCard = document.getElementById('result_card_mix');
        const isMixActive = mixCard && mixCard.style.display !== 'none';
        const p3Text = document.getElementById('adult_final_lkr_3star')?.innerText || '';
        const pMixText = isMixActive ? (document.getElementById('adult_final_lkr_mix')?.innerText || '') : '';
        const p4Text = document.getElementById('adult_final_lkr_4star')?.innerText || '';

        const p3ChildExtraEl = document.getElementById('child_final_lkr_3star');
        const p3ChildShareEl = document.getElementById('child_sharing_final_lkr_3star');
        const p4ChildExtraEl = document.getElementById('child_final_lkr_4star');
        const p4ChildShareEl = document.getElementById('child_sharing_final_lkr_4star');
        const pMixChildExtraEl = document.getElementById('child_final_lkr_mix');
        const pMixChildShareEl = document.getElementById('child_sharing_final_lkr_mix');

        const includeChildExtraBed = document.getElementById('check_child_extra_bed')?.checked ?? false;
        const includeChildSharingBed = document.getElementById('check_child_sharing_bed')?.checked ?? false;

        const isTplActive = Boolean(document.getElementById('check_tpl_room')?.checked);
        const tplRoomsCount = isTplActive ? Math.max(0, parseInt(document.getElementById('tpl_rooms_count')?.value) || 1) : 0;
        const totalRoomsCount = isTplActive ? Math.max(1, parseInt(document.getElementById('total_hotel_rooms')?.value) || 1) : 1;
        const tplRate3 = isTplActive ? (parseFloat(document.getElementById('tpl_rate_3star')?.value) || 800) : 0;
        const tplRate4 = isTplActive ? (parseFloat(document.getElementById('tpl_rate_4star')?.value) || 1000) : 0;
        const tplRate5 = isTplActive ? (parseFloat(document.getElementById('tpl_rate_5star')?.value) || 1200) : 0;

        const cExtra3 = includeChildExtraBed ? cleanLkrNumber(p3ChildExtraEl?.innerText) : null;
        const cShare3 = includeChildSharingBed ? cleanLkrNumber(p3ChildShareEl?.innerText) : null;
        const cExtra4 = includeChildExtraBed ? cleanLkrNumber(p4ChildExtraEl?.innerText) : null;
        const cShare4 = includeChildSharingBed ? cleanLkrNumber(p4ChildShareEl?.innerText) : null;
        const cExtraMix = (isMixActive && includeChildExtraBed) ? cleanLkrNumber(pMixChildExtraEl?.innerText) : null;
        const cShareMix = (isMixActive && includeChildSharingBed) ? cleanLkrNumber(pMixChildShareEl?.innerText) : null;

        const hasChildPrices = (includeChildExtraBed || includeChildSharingBed) && Boolean(
            (cExtra3 && cExtra3 !== '0') ||
            (cShare3 && cShare3 !== '0') ||
            (cExtra4 && cExtra4 !== '0') ||
            (cShare4 && cShare4 !== '0')
        );

        const childExtraLabel = document.getElementById('exportChildExtraBedLabel')?.value.trim() || 'Per Child (With Extra Bed)';
        const childShareLabel = document.getElementById('exportChildSharingBedLabel')?.value.trim() || 'Per Child (Sharing Bed)';

        const itineraryPayload = buildItineraryJsonPayload();

        const costingPayload = {
            title: title,
            pax: transferPax,
            transferPax: transferPax,
            hotelDivisor: hotelDivisor,
            paxText: paxText,
            inq: inq,
            monthDate: formattedMonthDate,
            roe: roe,
            markup3: m3,
            markupMix: mMix,
            markup4: m4,
            markupChildExtra3: m3ChildExtra,
            markupChildShare3: m3ChildShare,
            markupChildExtraMix: mMixChildExtra,
            markupChildShareMix: mMixChildShare,
            markupChildExtra4: m4ChildExtra,
            markupChildShare4: m4ChildShare,
            buffer: 1000,
            hasMix: isMixActive,
            hasChildPrices: hasChildPrices,
            includeChildExtraBed: includeChildExtraBed,
            includeChildSharingBed: includeChildSharingBed,
            isTplActive: isTplActive,
            tplRoomsCount: tplRoomsCount,
            totalRoomsCount: totalRoomsCount,
            tplRate3: tplRate3,
            tplRate4: tplRate4,
            tplRate5: tplRate5,
            childExtraLabel: childExtraLabel,
            childShareLabel: childShareLabel,
            cities: availableCities.filter(c => c.selected),
            tours: availableTours.filter(t => t.selected),
            transfers: availableTransfers.filter(t => t.selected),
            days: itineraryPayload.days,
            options: itineraryPayload.options,
            inclusions: itineraryPayload.inclusions,
            exclusions: itineraryPayload.exclusions,
            rates: {
                p3: cleanLkrNumber(p3Text),
                pMix: isMixActive ? cleanLkrNumber(pMixText) : null,
                p4: cleanLkrNumber(p4Text),
                childExtra3: cExtra3,
                childShare3: cShare3,
                childExtraMix: cExtraMix,
                childShareMix: cShareMix,
                childExtra4: cExtra4,
                childShare4: cShare4
            }
        };

        if (Array.isArray(window.costingOptionsList) && window.costingOptionsList.length > 1) {
            if (typeof snapshotCurrentCostingOption === 'function') snapshotCurrentCostingOption();
            costingPayload.packages = window.costingOptionsList.map((opt, idx) => {
                const s = opt.pricingSummary || {};
                const adjSettings = opt.pricingAdj?.settings || {};
                const cardMarkups = opt.pricingAdj?.cardMarkups || {};
                const optMarkupDef = parseFloat(adjSettings.markup) || globalMarkup;
                const optRoe = parseFloat(adjSettings.lkrRate) || roe;
                const optTrPax = Number(adjSettings.numPeopleTransfer) || transferPax;
                const optHotelDiv = Number(adjSettings.numPeopleHotel) || hotelDivisor;
                const optIncExtra = Boolean(s.includeChildExtraBed ?? adjSettings.includeChildExtraBed ?? includeChildExtraBed);
                const optIncShare = Boolean(s.includeChildSharingBed ?? adjSettings.includeChildSharingBed ?? includeChildSharingBed);
                const optHasMix = resolveSheetMixActive({ hasMix: typeof s.hasMix === 'boolean' ? s.hasMix : undefined }, null, opt.availableCities);
                return {
                    id: opt.id || ('opt_' + (idx + 1)),
                    packageName: opt.name || (`Option ${String(idx + 1).padStart(2, '0')}`),
                    title: title,
                    pax: optTrPax,
                    transferPax: optTrPax,
                    hotelDivisor: optHotelDiv,
                    paxText: s.pax || paxText,
                    roe: optRoe,
                    hasMix: optHasMix,
                    hasChildPrices: Boolean(optIncExtra || optIncShare),
                    includeChildExtraBed: optIncExtra,
                    includeChildSharingBed: optIncShare,
                    isTplActive: Boolean(adjSettings.isTplActive ?? isTplActive),
                    tplRoomsCount: Number(adjSettings.tplRoomsCount ?? tplRoomsCount) || 1,
                    totalRoomsCount: Number(adjSettings.totalRoomsCount ?? totalRoomsCount) || 1,
                    tplRate3: Number(adjSettings.tplRate3 ?? tplRate3) || 800,
                    tplRate4: Number(adjSettings.tplRate4 ?? tplRate4) || 1000,
                    tplRate5: Number(adjSettings.tplRate5 ?? tplRate5) || 1200,
                    markup3: parseFloat(cardMarkups['3star']?.adult?.pct) || optMarkupDef,
                    markupMix: parseFloat(cardMarkups['mix']?.adult?.pct) || optMarkupDef,
                    markup4: parseFloat(cardMarkups['4star']?.adult?.pct) || optMarkupDef,
                    childExtraLabel: s.childExtraLabel || childExtraLabel,
                    childShareLabel: s.childShareLabel || childShareLabel,
                    costing: {
                        hasMix: optHasMix,
                        availableCities: JSON.parse(JSON.stringify(opt.availableCities || [])),
                        availableTours: JSON.parse(JSON.stringify(opt.availableTours || [])),
                        availableTransfers: JSON.parse(JSON.stringify(opt.availableTransfers || [])),
                        pricingAdj: opt.pricingAdj || null
                    },
                    rates: {
                        p3: s.prices3Star?.adult ? cleanLkrNumber(s.prices3Star.adult) : cleanLkrNumber(p3Text),
                        pMix: optHasMix && s.pricesMix?.adult ? cleanLkrNumber(s.pricesMix.adult) : null,
                        p4: s.prices4Star?.adult ? cleanLkrNumber(s.prices4Star.adult) : cleanLkrNumber(p4Text),
                        childExtra3: optIncExtra && s.prices3Star?.childExtra ? cleanLkrNumber(s.prices3Star.childExtra) : null,
                        childShare3: optIncShare && s.prices3Star?.childShare ? cleanLkrNumber(s.prices3Star.childShare) : null,
                        childExtraMix: (optHasMix && optIncExtra && s.pricesMix?.childExtra) ? cleanLkrNumber(s.pricesMix.childExtra) : null,
                        childShareMix: (optHasMix && optIncShare && s.pricesMix?.childShare) ? cleanLkrNumber(s.pricesMix.childShare) : null,
                        childExtra4: optIncExtra && s.prices4Star?.childExtra ? cleanLkrNumber(s.prices4Star.childExtra) : null,
                        childShare4: optIncShare && s.prices4Star?.childShare ? cleanLkrNumber(s.prices4Star.childShare) : null
                    }
                };
            });
        } else if (activeLoadedInqData && Array.isArray(activeLoadedInqData.packages) && activeLoadedInqData.packages.length > 1) {
            costingPayload.packages = activeLoadedInqData.packages;
        }

        // Locate existing Google Sheet URL (matching normalized INQ, active doc, index, localStorage, or doc filename)
        const expectedFileName = (window.SlwExcelGenerator && typeof window.SlwExcelGenerator.buildCostingDocFilename === 'function')
            ? window.SlwExcelGenerator.buildCostingDocFilename(costingPayload)
            : '';
        costingPayload.googleSheetUrl = findExistingGoogleSheetUrl(inq, expectedFileName);

        return costingPayload;
    }

    async function downloadCurrentCostingExcel() {
        const payload = getCurrentCostingExcelPayload();
        if (window.SlwExcelGenerator) {
            showNotification('📊 Generating dynamic Costing Excel (.xlsx)...', false);
            try {
                await window.SlwExcelGenerator.downloadCostingExcel(payload);
                showNotification('✅ Costing Excel (.xlsx) successfully downloaded!', false);
            } catch(err) {
                console.error('Excel export error:', err);
                showNotification('⚠️ Excel export error: ' + err.message, true);
            }
        } else {
            showNotification('⚠️ Excel Generator module is loading, please try again.', true);
        }
    }

    function setSheetButtonBusy(btnEl, busy, labelText = 'Syncing...') {
        if (!btnEl) return;
        if (busy) {
            if (btnEl.dataset.origHtml === undefined) {
                btnEl.dataset.origHtml = btnEl.innerHTML;
            }
            btnEl.disabled = true;
            btnEl.classList.add('opacity-75', 'cursor-wait');
            const isCompactIcon = !btnEl.innerText.trim();
            btnEl.innerHTML = isCompactIcon
                ? '<i class="fas fa-spinner fa-spin text-[10px]"></i>'
                : `<i class="fas fa-spinner fa-spin"></i> <span>${labelText}</span>`;
        } else {
            btnEl.disabled = false;
            btnEl.classList.remove('opacity-75', 'cursor-wait');
            if (btnEl.dataset.origHtml !== undefined) {
                btnEl.innerHTML = btnEl.dataset.origHtml;
                delete btnEl.dataset.origHtml;
            }
        }
    }

    function showSheetReadyBanner(sheetUrl, titleMsg = 'Google Sheet is ready!', isError = false) {
        const existing = document.getElementById('slwSheetReadyFloatingBanner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'slwSheetReadyFloatingBanner';
        banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483646;max-width:92vw;width:480px;';
        banner.className = `rounded-xl shadow-2xl border-2 p-3.5 flex items-center justify-between gap-3 ${isError ? 'bg-red-600 border-red-300 text-white' : 'bg-emerald-700 border-emerald-300 text-white'}`;

        const safeUrl = String(sheetUrl || '').replace(/"/g, '&quot;');
        banner.innerHTML = `
            <div class="min-w-0 flex-1">
                <div class="text-xs font-extrabold uppercase tracking-wide ${isError ? 'text-red-100' : 'text-emerald-200'}">${isError ? '⚠️ Google Sheet Error' : '📊 Google Sheet Ready'}</div>
                <div class="text-sm font-bold leading-snug break-words">${String(titleMsg || '').replace(/</g, '&lt;')}</div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                ${sheetUrl ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" onclick="document.getElementById('slwSheetReadyFloatingBanner')?.remove()" class="px-3 py-1.5 rounded-lg bg-white text-emerald-900 hover:bg-emerald-50 font-extrabold text-xs shadow transition whitespace-nowrap">Open Sheet ↗</a>` : ''}
                <button type="button" onclick="document.getElementById('slwSheetReadyFloatingBanner')?.remove()" class="px-2 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-white font-bold text-xs">✕</button>
            </div>
        `;
        document.body.appendChild(banner);
        setTimeout(() => {
            if (banner.parentNode) banner.remove();
        }, isError ? 12000 : 20000);
    }

    function openPendingGoogleSheetTab(label = 'Google Sheet') {
        let win = null;
        try {
            win = window.open('about:blank', '_blank');
            if (win && win.document) {
                const safeLbl = String(label || 'Google Sheet').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                win.document.open();
                win.document.write(`<!DOCTYPE html><html><head><title>Syncing ${safeLbl}...</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Inter,Arial,sans-serif;background:linear-gradient(135deg,#064e3b,#0f172a);color:#fff;text-align:center;padding:24px}.card{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:16px;padding:32px 28px;max-width:420px;box-shadow:0 20px 50px rgba(0,0,0,0.4)}.spin{width:42px;height:42px;border:4px solid rgba(255,255,255,0.25);border-top-color:#34d399;border-radius:50%;animation:sp .8s linear infinite;margin:0 auto 16px}@keyframes sp{to{transform:rotate(360deg)}}h2{margin:0 0 8px;font-size:18px}p{margin:0;font-size:13px;color:#cbd5e1;line-height:1.5}</style></head><body><div class="card"><div class="spin"></div><h2>⏳ Preparing Google Sheet (${safeLbl})</h2><p>Converting costing &amp; adding updated tab inside Google Drive...<br>This tab will open your Google Sheet automatically in a few seconds.</p></div></body></html>`);
                win.document.close();
            }
        } catch(e) {
            win = null;
        }
        return {
            win,
            navigate(url, readyTitle) {
                if (!url) return;
                if (win && !win.closed) {
                    try {
                        win.location.replace(url);
                        win.focus();
                        return true;
                    } catch(e) {}
                }
                const fallbackWin = window.open(url, '_blank');
                if (fallbackWin && !fallbackWin.closed) {
                    try { fallbackWin.focus(); } catch(e) {}
                    return true;
                }
                showSheetReadyBanner(url, readyTitle || 'Popup was blocked by browser — click Open Sheet!');
                return false;
            },
            close() {
                try {
                    if (win && !win.closed) win.close();
                } catch(e) {}
            }
        };
    }

    function showExistingSheetActionDialog(inqKey, existingUrl, onAddNewTab) {
        const old = document.getElementById('slwExistingSheetChoiceModal');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'slwExistingSheetChoiceModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:2147483645;display:flex;align-items:center;justify-content:center;padding:16px;';
        const safeInq = String(inqKey || '').replace(/</g, '&lt;');
        const safeUrl = String(existingUrl || '').replace(/"/g, '&quot;');

        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-5 space-y-4">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2.5">
                        <div class="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center text-lg shrink-0"><i class="fab fa-google-drive"></i></div>
                        <div>
                            <h4 class="text-base font-extrabold text-gray-900">Google Sheet Already Exists (${safeInq})</h4>
                            <p class="text-xs text-gray-500">Choose whether to open the existing sheet or add a "New" tab inside it.</p>
                        </div>
                    </div>
                    <button type="button" id="slwChoiceCloseBtn" class="text-gray-400 hover:text-gray-700 text-lg font-bold px-1">✕</button>
                </div>
                <div class="space-y-2.5">
                    <button type="button" id="slwChoiceAddNewTabBtn" class="w-full py-2.5 px-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold rounded-xl text-sm shadow transition flex items-center justify-center gap-2">
                        <i class="fas fa-plus-circle"></i>
                        <span>Add Updated "New" Tab Inside Existing Sheet</span>
                    </button>
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" id="slwChoiceOpenExistingLink" class="w-full py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold rounded-xl text-sm transition flex items-center justify-center gap-2">
                        <i class="fas fa-external-link-alt"></i>
                        <span>Open Existing Google Sheet Directly</span>
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) overlay.remove();
        });
        overlay.querySelector('#slwChoiceCloseBtn')?.addEventListener('click', () => overlay.remove());
        overlay.querySelector('#slwChoiceOpenExistingLink')?.addEventListener('click', () => {
            showNotification(`📂 Opening existing Google Sheet for ${inqKey}...`, false);
            setTimeout(() => overlay.remove(), 50);
        });
        overlay.querySelector('#slwChoiceAddNewTabBtn')?.addEventListener('click', () => {
            overlay.remove();
            if (typeof onAddNewTab === 'function') onAddNewTab();
        });
    }

    async function exportCurrentCostingToGoogleSheets(btnEl = null) {
        const isModalOpen = isElementActuallyOpen(document.getElementById('saveQuotationModal'));
        if (isModalOpen) {
            const clientInp = document.getElementById('saveQuotationClientInput')?.value.trim();
            if (!clientInp) {
                alert("Please enter the client's name before saving & opening Google Sheets.");
                return;
            }
        }

        const pendingTab = openPendingGoogleSheetTab('Tour Costing');
        setSheetButtonBusy(btnEl, true, 'Syncing...');

        if (isModalOpen && typeof executeSaveQuotation === 'function') {
            try {
                showNotification('💾 Saving package options to INQ before opening Google Sheets...', false);
                await executeSaveQuotation(false);
            } catch(e) {
                console.warn('Auto-save prior to Google Sheet export failed, proceeding with current state:', e);
            }
        }

        const payload = getCurrentCostingExcelPayload();
        const webhookUrl = getGoogleSheetsWebhookUrl();

        if (!window.SlwExcelGenerator || typeof window.SlwExcelGenerator.exportToGoogleSheets !== 'function') {
            pendingTab.close();
            setSheetButtonBusy(btnEl, false);
            showNotification('⚠️ Excel Generator module is loading, please try again.', true);
            return;
        }

        const expectedFileName = typeof window.SlwExcelGenerator.buildCostingDocFilename === 'function'
            ? window.SlwExcelGenerator.buildCostingDocFilename(payload)
            : '';

        if (!payload.googleSheetUrl && payload.inq) {
            payload.googleSheetUrl = await lookupGoogleSheetUrlFromCloud(payload.inq);
        }

        const hasMulti = payload.packages && payload.packages.length > 1;
        const statusMsg = payload.googleSheetUrl
            ? `🟢 Adding "New" tab for ${payload.inq} (${hasMulti ? payload.packages.length + ' Packages' : 'Costing'}) inside existing Google Sheet...`
            : `🟢 Checking Drive / creating Google Sheet for ${payload.inq || expectedFileName}...`;
        showNotification(statusMsg, false, 10000);

        try {
            const options = {
                sheetUrl: payload.googleSheetUrl || null,
                updateMode: 'append_new_tab'
            };
            const result = await window.SlwExcelGenerator.exportToGoogleSheets(payload, webhookUrl, options);
            if (result && result.sheetUrl) {
                const cleanBaseUrl = stripSheetUrlHash(result.sheetUrl);
                const finalOpenUrl = result.tabUrl || result.sheetUrl;
                const tabsLabel = Array.isArray(result.addedTabNames) && result.addedTabNames.length > 0
                    ? result.addedTabNames.join(', ')
                    : 'New';
                const notifyMsg = result.isUpdated
                    ? `✅ Existing Google Sheet (${payload.inq || result.fileName}) updated! Added "${tabsLabel}" tab inside the same sheet.`
                    : `✅ Google Sheet created successfully in your Drive!`;

                pendingTab.navigate(finalOpenUrl, notifyMsg);
                await saveGoogleSheetUrlToInq(payload.inq, cleanBaseUrl, result.fileName || expectedFileName);
                if (typeof renderQuotationHubCards === 'function') renderQuotationHubCards();
                showNotification(notifyMsg, false, 6000);
            } else {
                throw new Error('Google did not return a valid Sheet URL');
            }
        } catch (err) {
            pendingTab.close();
            console.error('Google Sheets export error:', err);
            const errMsg = '⚠️ Google Sheets export error: ' + err.message;
            showNotification(errMsg, true, 8000);
            showSheetReadyBanner('', errMsg, true);
        } finally {
            setSheetButtonBusy(btnEl, false);
        }
    }

    async function saveGoogleSheetUrlToInq(inqKey, sheetUrl, fileName = '') {
        const cleanUrl = stripSheetUrlHash(sheetUrl);
        if (!cleanUrl) return;
        if (inqKey || fileName) {
            rememberGoogleSheetUrl(inqKey, fileName, cleanUrl);
        }
        if (!inqKey) return;

        const variants = normalizeSheetInqVariants(inqKey);
        const variantSet = new Set(variants);
        const indexStorageKey = (typeof SLW_INQ_INDEX_STORAGE_KEY !== 'undefined') ? SLW_INQ_INDEX_STORAGE_KEY : 'SLW_INQ_QUOTATION_INDEX';

        if (typeof activeLoadedInqData !== 'undefined' && activeLoadedInqData && inqReferencesMatch(activeLoadedInqData.inq, inqKey)) {
            activeLoadedInqData.googleSheetUrl = cleanUrl;
        }

        // 1. Update in local index
        if (Array.isArray(inqQuotationIndex)) {
            inqQuotationIndex.forEach(item => {
                if (item && normalizeSheetInqVariants(item.inq).some(v => variantSet.has(v))) {
                    item.googleSheetUrl = cleanUrl;
                }
            });
            localStorage.setItem(indexStorageKey, JSON.stringify(inqQuotationIndex));
        }

        // 2. Update local doc (check normalized variants)
        const docPrefix = (typeof SLW_INQ_DOC_PREFIX !== 'undefined') ? SLW_INQ_DOC_PREFIX : 'SLW_INQ_DOC_';
        let updatedLocalDocKey = null;
        for (const v of variants) {
            const localRaw = localStorage.getItem(docPrefix + v);
            if (localRaw) {
                try {
                    const parsed = JSON.parse(localRaw);
                    parsed.googleSheetUrl = cleanUrl;
                    localStorage.setItem(docPrefix + v, JSON.stringify(parsed));
                    if (!updatedLocalDocKey) updatedLocalDocKey = v;
                } catch(e) {}
            }
        }

        // 3. Update in Firebase Cloud (only update existing doc/index)
        if (typeof db !== 'undefined' && db) {
            try {
                const cloudDocId = updatedLocalDocKey || (inqQuotationIndex.find(i => i && normalizeSheetInqVariants(i.inq).some(v => variantSet.has(v)))?.inq);
                if (cloudDocId) {
                    await db.collection('slw_quotations').doc(cloudDocId).set({ googleSheetUrl: cleanUrl }, { merge: true });
                    await db.collection('slw_settings').doc('quotation_index').set({
                        items: inqQuotationIndex,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                }
            } catch(e) {
                console.warn('Failed to update googleSheetUrl on cloud:', e);
            }
        }
    }

    function findLocalInqDocAnyVariant(inqKey) {
        const docPrefix = (typeof SLW_INQ_DOC_PREFIX !== 'undefined') ? SLW_INQ_DOC_PREFIX : 'SLW_INQ_DOC_';
        for (const v of normalizeSheetInqVariants(inqKey)) {
            const raw = localStorage.getItem(docPrefix + v);
            if (raw) {
                try {
                    return JSON.parse(raw);
                } catch(e) {}
            }
        }
        return null;
    }

    async function exportInqQuotationToGoogleSheets(inqKey, forceRegenerate = false, btnEl = null) {
        if (!inqKey) return;
        let docData = findLocalInqDocAnyVariant(inqKey);

        // If already cached locally and user clicked "Sheet" without forceRegenerate, show live choice dialog
        // so clicking "Add New Tab" preserves a fresh synchronous click gesture (never popup-blocked!)
        if (docData && !forceRegenerate) {
            const localExistingUrl = docData.googleSheetUrl || findExistingGoogleSheetUrl(inqKey);
            if (localExistingUrl) {
                showExistingSheetActionDialog(inqKey, localExistingUrl, () => {
                    exportInqQuotationToGoogleSheets(inqKey, true, btnEl);
                });
                return;
            }
        }

        // Synchronously open pending tab BEFORE any await so Chrome never blocks it
        const pendingTab = openPendingGoogleSheetTab(inqKey);
        setSheetButtonBusy(btnEl, true, 'Syncing...');

        try {
            if (!docData && typeof db !== 'undefined' && db) {
                for (const v of normalizeSheetInqVariants(inqKey)) {
                    const snap = await db.collection('slw_quotations').doc(v).get();
                    if (snap.exists) {
                        docData = snap.data();
                        break;
                    }
                }
            }
            if (!docData) {
                pendingTab.close();
                alert('Quotation document not found for ' + inqKey);
                return;
            }

            const existingHubSheetUrl = docData.googleSheetUrl || findExistingGoogleSheetUrl(inqKey);
            if (existingHubSheetUrl && !forceRegenerate) {
                pendingTab.close();
                showExistingSheetActionDialog(inqKey, existingHubSheetUrl, () => {
                    exportInqQuotationToGoogleSheets(inqKey, true, btnEl);
                });
                return;
            }

            const costing = docData.costing || {};
            const cities = costing.availableCities || [];
            const tours = costing.availableTours || [];
            const transfers = costing.availableTransfers || [];
            const rates = docData.rates || costing.rates || {};
            const isMixActive = resolveSheetMixActive(costing, rates, cities);
            const pricingAdj = costing.pricingAdj || docData.pricingAdj || {};
            const settings = pricingAdj.settings || {};
            const cardMarkups = pricingAdj.cardMarkups || {};

            let includeChildExtra = false;
            let includeChildShare = false;
            if (typeof costing.includeChildExtraBed === 'boolean') {
                includeChildExtra = costing.includeChildExtraBed;
            } else if (typeof settings.includeChildExtraBed === 'boolean') {
                includeChildExtra = settings.includeChildExtraBed;
            } else if (typeof docData.includeChildExtraBed === 'boolean') {
                includeChildExtra = docData.includeChildExtraBed;
            } else {
                includeChildExtra = Boolean(rates && (rates.childExtra3 || rates.childExtra4 || rates.p3ChildExtra));
            }

            if (typeof costing.includeChildSharingBed === 'boolean') {
                includeChildShare = costing.includeChildSharingBed;
            } else if (typeof settings.includeChildSharingBed === 'boolean') {
                includeChildShare = settings.includeChildSharingBed;
            } else if (typeof docData.includeChildSharingBed === 'boolean') {
                includeChildShare = docData.includeChildSharingBed;
            } else {
                includeChildShare = Boolean(rates && (rates.childShare3 || rates.childShare4 || rates.p3ChildShare));
            }

            const hasChild = (includeChildExtra || includeChildShare);

            const transferPax = Math.max(1, Number(docData.transferPax) || Number(settings.numPeopleTransfer) || Number(docData.pax) || 2);
            const hotelDivisor = Math.max(1, Number(docData.hotelDivisor) || Number(settings.numPeopleHotel) || 2);
            const roe = parseFloat(settings.lkrRate) || parseFloat(docData.roe) || 10.8;
            const defaultMarkup = parseFloat(settings.markup) || 18;
            const m3 = parseFloat(cardMarkups['3star']?.adult?.pct) || defaultMarkup;
            const mMix = parseFloat(cardMarkups['mix']?.adult?.pct) || defaultMarkup;
            const m4 = parseFloat(cardMarkups['4star']?.adult?.pct) || defaultMarkup;
            const m3Extra = parseFloat(cardMarkups['3star']?.child_extra?.pct) || m3;
            const m3Share = parseFloat(cardMarkups['3star']?.child_sharing?.pct) || m3;
            const mMixExtra = parseFloat(cardMarkups['mix']?.child_extra?.pct) || mMix;
            const mMixShare = parseFloat(cardMarkups['mix']?.child_sharing?.pct) || mMix;
            const m4Extra = parseFloat(cardMarkups['4star']?.child_extra?.pct) || m4;
            const m4Share = parseFloat(cardMarkups['4star']?.child_sharing?.pct) || m4;

            let formattedMonthDate = docData.travelMonthDate || (docData.travelMonth && docData.travelYear ? `${docData.travelMonth}-${docData.travelYear}` : '');
            if (!formattedMonthDate) {
                const rawDocDate = docData.date || '';
                if (rawDocDate && rawDocDate.includes('-')) {
                    const parts = rawDocDate.split('-');
                    if (parts.length === 3) {
                        const d = new Date(rawDocDate);
                        if (!isNaN(d.getTime())) {
                            formattedMonthDate = d.toLocaleString('en-US', { month: 'short' }) + '-' + d.getFullYear();
                        }
                    } else if (parts.length === 2) {
                        formattedMonthDate = rawDocDate;
                    }
                } else if (rawDocDate) {
                    formattedMonthDate = rawDocDate;
                }
            }
            if (!formattedMonthDate) {
                formattedMonthDate = new Date().toLocaleString('en-US', { month: 'short' }) + '-' + new Date().getFullYear();
            }

            const paxText = docData.paxText || (String(transferPax).padStart(2, '0') + ' Pax');

            const payload = {
                title: docData.title || inqKey,
                pax: transferPax,
                transferPax: transferPax,
                hotelDivisor: hotelDivisor,
                paxText: paxText,
                inq: docData.inq || inqKey,
                monthDate: formattedMonthDate,
                roe: roe,
                markup3: m3,
                markupMix: mMix,
                markup4: m4,
                markupChildExtra3: m3Extra,
                markupChildShare3: m3Share,
                markupChildExtraMix: mMixExtra,
                markupChildShareMix: mMixShare,
                markupChildExtra4: m4Extra,
                markupChildShare4: m4Share,
                buffer: 1000,
                hasMix: isMixActive,
                hasChildPrices: hasChild,
                includeChildExtraBed: includeChildExtra,
                includeChildSharingBed: includeChildShare,
                isTplActive: Boolean(costing.isTplActive !== undefined ? costing.isTplActive : docData.isTplActive),
                tplRoomsCount: Number(costing.tplRoomsCount !== undefined ? costing.tplRoomsCount : docData.tplRoomsCount) || 1,
                totalRoomsCount: Number(costing.totalRoomsCount !== undefined ? costing.totalRoomsCount : docData.totalRoomsCount) || 1,
                tplRate3: Number(costing.tplRate3 !== undefined ? costing.tplRate3 : docData.tplRate3) || 800,
                tplRate4: Number(costing.tplRate4 !== undefined ? costing.tplRate4 : docData.tplRate4) || 1000,
                tplRate5: Number(costing.tplRate5 !== undefined ? costing.tplRate5 : docData.tplRate5) || 1200,
                childExtraLabel: docData.childExtraLabel || costing.childExtraLabel || 'Per Child (With Extra Bed)',
                childShareLabel: docData.childShareLabel || costing.childShareLabel || 'Per Child (Sharing Bed)',
                cities: (Array.isArray(cities) ? cities : []).filter(c => c.selected !== false),
                tours: (Array.isArray(tours) ? tours : []).filter(t => t.selected !== false),
                transfers: (Array.isArray(transfers) ? transfers : []).filter(t => t.selected !== false),
                days: docData.itinerary && docData.itinerary.days ? docData.itinerary.days : null,
                options: docData.itinerary && docData.itinerary.options ? docData.itinerary.options : null,
                inclusions: docData.itinerary && docData.itinerary.inclusions ? docData.itinerary.inclusions : null,
                exclusions: docData.itinerary && docData.itinerary.exclusions ? docData.itinerary.exclusions : null,
                rates: {
                    p3: cleanLkrNumber(rates.p3),
                    pMix: isMixActive ? cleanLkrNumber(rates.pMix) : null,
                    p4: cleanLkrNumber(rates.p4),
                    childExtra3: includeChildExtra ? cleanLkrNumber(rates.childExtra3 || rates.p3ChildExtra) : null,
                    childShare3: includeChildShare ? cleanLkrNumber(rates.childShare3 || rates.p3ChildShare) : null,
                    childExtraMix: (isMixActive && includeChildExtra) ? cleanLkrNumber(rates.childExtraMix || rates.pMixChildExtra) : null,
                    childShareMix: (isMixActive && includeChildShare) ? cleanLkrNumber(rates.childShareMix || rates.pMixChildShare) : null,
                    childExtra4: includeChildExtra ? cleanLkrNumber(rates.childExtra4 || rates.p4ChildExtra) : null,
                    childShare4: includeChildShare ? cleanLkrNumber(rates.childShare4 || rates.p4ChildShare) : null
                }
            };

            if (Array.isArray(docData.packages) && docData.packages.length > 1) {
                payload.packages = docData.packages;
            }

            const webhookUrl = getGoogleSheetsWebhookUrl();
            const expectedHubFileName = (window.SlwExcelGenerator && typeof window.SlwExcelGenerator.buildCostingDocFilename === 'function')
                ? window.SlwExcelGenerator.buildCostingDocFilename(payload)
                : '';
            const options = {
                sheetUrl: existingHubSheetUrl || findExistingGoogleSheetUrl(inqKey, expectedHubFileName) || null,
                updateMode: 'append_new_tab'
            };
            showNotification('🟢 Adding updated sheet tab for ' + inqKey + (payload.packages ? ` (${payload.packages.length} Packages)` : '') + ' in Google Drive...', false, 10000);
            const result = await window.SlwExcelGenerator.exportToGoogleSheets(payload, webhookUrl, options);

            if (result && result.sheetUrl) {
                const finalOpenUrl = result.tabUrl || result.sheetUrl;
                const tabsLabel = Array.isArray(result.addedTabNames) && result.addedTabNames.length > 0
                    ? result.addedTabNames.join(', ')
                    : 'New';
                const actionMsg = result.isUpdated
                    ? `✅ Existing Google Sheet for ${inqKey} updated! Added "${tabsLabel}" tab inside the same sheet.`
                    : `✅ Google Sheet for ${inqKey} created & opened!`;

                pendingTab.navigate(finalOpenUrl, actionMsg);
                await saveGoogleSheetUrlToInq(inqKey, stripSheetUrlHash(result.sheetUrl), result.fileName || expectedHubFileName);
                renderQuotationHubCards();
                showNotification(actionMsg, false, 6000);
            } else {
                throw new Error('Google did not return a valid Sheet URL');
            }
        } catch(err) {
            pendingTab.close();
            console.error('Error generating Google Sheet for INQ:', err);
            const errMsg = '⚠️ Google Sheets export error: ' + err.message;
            showNotification(errMsg, true, 8000);
            showSheetReadyBanner('', errMsg, true);
        } finally {
            setSheetButtonBusy(btnEl, false);
        }
    }

    async function downloadInqQuotationExcel(inqKey) {
        if (!inqKey) return;
        try {
            let docData = null;
            const localRaw = localStorage.getItem(SLW_INQ_DOC_PREFIX + inqKey);
            if (localRaw) docData = JSON.parse(localRaw);
            if (!docData && typeof db !== 'undefined' && db) {
                const snap = await db.collection('slw_quotations').doc(inqKey).get();
                if (snap.exists) docData = snap.data();
            }
            if (!docData) {
                alert('Quotation document not found for ' + inqKey);
                return;
            }

            const costing = docData.costing || {};
            const cities = costing.availableCities || [];
            const tours = costing.availableTours || [];
            const transfers = costing.availableTransfers || [];
            const rates = docData.rates || costing.rates || {};
            const isMixActive = resolveSheetMixActive(costing, rates, cities);
            const pricingAdj = costing.pricingAdj || docData.pricingAdj || {};
            const settings = pricingAdj.settings || {};
            const cardMarkups = pricingAdj.cardMarkups || {};

            let includeChildExtra = false;
            let includeChildShare = false;
            if (typeof costing.includeChildExtraBed === 'boolean') {
                includeChildExtra = costing.includeChildExtraBed;
            } else if (typeof settings.includeChildExtraBed === 'boolean') {
                includeChildExtra = settings.includeChildExtraBed;
            } else if (typeof docData.includeChildExtraBed === 'boolean') {
                includeChildExtra = docData.includeChildExtraBed;
            } else {
                includeChildExtra = Boolean(rates && (rates.childExtra3 || rates.childExtra4 || rates.p3ChildExtra));
            }

            if (typeof costing.includeChildSharingBed === 'boolean') {
                includeChildShare = costing.includeChildSharingBed;
            } else if (typeof settings.includeChildSharingBed === 'boolean') {
                includeChildShare = settings.includeChildSharingBed;
            } else if (typeof docData.includeChildSharingBed === 'boolean') {
                includeChildShare = docData.includeChildSharingBed;
            } else {
                includeChildShare = Boolean(rates && (rates.childShare3 || rates.childShare4 || rates.p3ChildShare));
            }

            const hasChild = (includeChildExtra || includeChildShare);

            const transferPax = Math.max(1, Number(docData.transferPax) || Number(settings.numPeopleTransfer) || Number(docData.pax) || 2);
            const hotelDivisor = Math.max(1, Number(docData.hotelDivisor) || Number(settings.numPeopleHotel) || 2);
            const roe = parseFloat(settings.lkrRate) || parseFloat(docData.roe) || 10.8;
            const defaultMarkup = parseFloat(settings.markup) || 18;
            const m3 = parseFloat(cardMarkups['3star']?.adult?.pct) || defaultMarkup;
            const mMix = parseFloat(cardMarkups['mix']?.adult?.pct) || defaultMarkup;
            const m4 = parseFloat(cardMarkups['4star']?.adult?.pct) || defaultMarkup;
            const m3Extra = parseFloat(cardMarkups['3star']?.child_extra?.pct) || m3;
            const m3Share = parseFloat(cardMarkups['3star']?.child_sharing?.pct) || m3;
            const mMixExtra = parseFloat(cardMarkups['mix']?.child_extra?.pct) || mMix;
            const mMixShare = parseFloat(cardMarkups['mix']?.child_sharing?.pct) || mMix;
            const m4Extra = parseFloat(cardMarkups['4star']?.child_extra?.pct) || m4;
            const m4Share = parseFloat(cardMarkups['4star']?.child_sharing?.pct) || m4;

            let formattedMonthDate = docData.travelMonthDate || (docData.travelMonth && docData.travelYear ? `${docData.travelMonth}-${docData.travelYear}` : '');
            if (!formattedMonthDate) {
                const rawDocDate = docData.date || '';
                if (rawDocDate && rawDocDate.includes('-')) {
                    const parts = rawDocDate.split('-');
                    if (parts.length === 3) {
                        const d = new Date(rawDocDate);
                        if (!isNaN(d.getTime())) {
                            formattedMonthDate = d.toLocaleString('en-US', { month: 'short' }) + '-' + d.getFullYear();
                        }
                    } else if (parts.length === 2) {
                        formattedMonthDate = rawDocDate;
                    }
                } else if (rawDocDate) {
                    formattedMonthDate = rawDocDate;
                }
            }
            if (!formattedMonthDate) {
                formattedMonthDate = new Date().toLocaleString('en-US', { month: 'short' }) + '-' + new Date().getFullYear();
            }

            const paxText = docData.paxText || (String(transferPax).padStart(2, '0') + ' Pax');

            const payload = {
                title: docData.title || inqKey,
                pax: transferPax,
                transferPax: transferPax,
                hotelDivisor: hotelDivisor,
                paxText: paxText,
                inq: docData.inq || inqKey,
                monthDate: formattedMonthDate,
                roe: roe,
                markup3: m3,
                markupMix: mMix,
                markup4: m4,
                markupChildExtra3: m3Extra,
                markupChildShare3: m3Share,
                markupChildExtraMix: mMixExtra,
                markupChildShareMix: mMixShare,
                markupChildExtra4: m4Extra,
                markupChildShare4: m4Share,
                buffer: 1000,
                hasMix: isMixActive,
                hasChildPrices: hasChild,
                includeChildExtraBed: includeChildExtra,
                includeChildSharingBed: includeChildShare,
                isTplActive: Boolean(costing.isTplActive !== undefined ? costing.isTplActive : docData.isTplActive),
                tplRoomsCount: Number(costing.tplRoomsCount !== undefined ? costing.tplRoomsCount : docData.tplRoomsCount) || 1,
                totalRoomsCount: Number(costing.totalRoomsCount !== undefined ? costing.totalRoomsCount : docData.totalRoomsCount) || 1,
                tplRate3: Number(costing.tplRate3 !== undefined ? costing.tplRate3 : docData.tplRate3) || 800,
                tplRate4: Number(costing.tplRate4 !== undefined ? costing.tplRate4 : docData.tplRate4) || 1000,
                tplRate5: Number(costing.tplRate5 !== undefined ? costing.tplRate5 : docData.tplRate5) || 1200,
                childExtraLabel: docData.childExtraLabel || costing.childExtraLabel || 'Per Child (With Extra Bed)',
                childShareLabel: docData.childShareLabel || costing.childShareLabel || 'Per Child (Sharing Bed)',
                cities: (Array.isArray(cities) ? cities : []).filter(c => c.selected !== false),
                tours: (Array.isArray(tours) ? tours : []).filter(t => t.selected !== false),
                transfers: (Array.isArray(transfers) ? transfers : []).filter(t => t.selected !== false),
                days: docData.itinerary && docData.itinerary.days ? docData.itinerary.days : null,
                options: docData.itinerary && docData.itinerary.options ? docData.itinerary.options : null,
                inclusions: docData.itinerary && docData.itinerary.inclusions ? docData.itinerary.inclusions : null,
                exclusions: docData.itinerary && docData.itinerary.exclusions ? docData.itinerary.exclusions : null,
                rates: {
                    p3: cleanLkrNumber(rates.p3),
                    pMix: isMixActive ? cleanLkrNumber(rates.pMix) : null,
                    p4: cleanLkrNumber(rates.p4),
                    childExtra3: includeChildExtra ? cleanLkrNumber(rates.childExtra3 || rates.p3ChildExtra) : null,
                    childShare3: includeChildShare ? cleanLkrNumber(rates.childShare3 || rates.p3ChildShare) : null,
                    childExtraMix: (isMixActive && includeChildExtra) ? cleanLkrNumber(rates.childExtraMix || rates.pMixChildExtra) : null,
                    childShareMix: (isMixActive && includeChildShare) ? cleanLkrNumber(rates.childShareMix || rates.pMixChildShare) : null,
                    childExtra4: includeChildExtra ? cleanLkrNumber(rates.childExtra4 || rates.p4ChildExtra) : null,
                    childShare4: includeChildShare ? cleanLkrNumber(rates.childShare4 || rates.p4ChildShare) : null
                }
            };

            if (Array.isArray(docData.packages) && docData.packages.length > 1) {
                payload.packages = docData.packages;
            }

            if (window.SlwExcelGenerator) {
                showNotification('📊 Generating Excel for ' + inqKey + (payload.packages ? ` (${payload.packages.length} Packages)` : '') + '...', false);
                await window.SlwExcelGenerator.downloadCostingExcel(payload);
                showNotification('✅ Excel for ' + inqKey + ' downloaded!', false);
            }
        } catch(err) {
            console.error('Error downloading INQ Excel:', err);
            showNotification('⚠️ Error generating Excel: ' + err.message, true);
        }
    }
