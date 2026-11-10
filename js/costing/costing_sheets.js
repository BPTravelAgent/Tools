    // ══════════════════════════════════════════════════════════════
    // DYNAMIC TOUR COSTING EXCEL & GOOGLE SHEETS INTEGRATION
    // ══════════════════════════════════════════════════════════════
    const DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxt1wGx6SaS8a3fDKjO6eP05KOd3XeNHmGqraCXh2TBkKwEaWHdxsd7DpyxRqHGkKaoog/exec';

    function getGoogleSheetsWebhookUrl() {
        return localStorage.getItem('bp_sheets_webhook_url') || DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL;
    }

    function getCurrentCostingExcelPayload() {
        calculate();
        const transferPax = Math.max(1, Number(document.getElementById('num_people_transfer')?.value) || 2);
        const hotelDivisor = Math.max(1, Number(document.getElementById('num_people_hotel')?.value) || 2);
        const rawPax = transferPax;
        
        let paxText = (document.getElementById('saveQuotationPaxInput')?.value || document.getElementById('exportItineraryPax')?.value || '').trim();
        if (!paxText) {
            paxText = String(transferPax).padStart(2, '0') + ' Pax';
        }

        const inq = (document.getElementById('saveQuotationInqInput')?.value || document.getElementById('exportItineraryInq')?.value || ('INQ-' + Math.floor(10000 + Math.random() * 90000))).trim();
        
        let defaultTitle = '';
        if (typeof activeLoadedPresetKey !== 'undefined' && activeLoadedPresetKey && typeof costingPresets !== 'undefined' && costingPresets[activeLoadedPresetKey] && costingPresets[activeLoadedPresetKey].title) {
            defaultTitle = costingPresets[activeLoadedPresetKey].title.trim();
        } else if (availableCities.length > 0) {
            defaultTitle = availableCities.map(c => (c.numberOfNights || 1) + 'N ' + c.name).join(' ');
        } else {
            defaultTitle = 'Thailand Tour Package';
        }

        const title = (document.getElementById('saveQuotationTitleInput')?.value || document.getElementById('exportItineraryTitle')?.value || defaultTitle).trim();
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

        if (activeLoadedInqData && Array.isArray(activeLoadedInqData.packages) && activeLoadedInqData.packages.length > 1) {
            costingPayload.packages = activeLoadedInqData.packages;
        }

        // Locate existing Google Sheet URL if any for this INQ
        let existingSheetUrl = null;
        if (activeLoadedInqData && activeLoadedInqData.googleSheetUrl) {
            existingSheetUrl = activeLoadedInqData.googleSheetUrl;
        }
        if (!existingSheetUrl && inq) {
            const foundInIndex = (Array.isArray(inqQuotationIndex) ? inqQuotationIndex : []).find(i => i.inq === inq);
            if (foundInIndex && foundInIndex.googleSheetUrl) {
                existingSheetUrl = foundInIndex.googleSheetUrl;
            }
        }
        if (!existingSheetUrl && inq) {
            const localRaw = localStorage.getItem(SLW_INQ_DOC_PREFIX + inq);
            if (localRaw) {
                try {
                    const parsed = JSON.parse(localRaw);
                    if (parsed.googleSheetUrl) existingSheetUrl = parsed.googleSheetUrl;
                } catch(e) {}
            }
        }
        costingPayload.googleSheetUrl = existingSheetUrl;

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

    async function exportCurrentCostingToGoogleSheets() {
        const isModalOpen = document.getElementById('saveQuotationModal') && !document.getElementById('saveQuotationModal').classList.contains('hidden');
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
            showNotification('⚠️ Excel Generator module is loading, please try again.', true);
            return;
        }

        const hasMulti = payload.packages && payload.packages.length > 1;
        const statusMsg = payload.googleSheetUrl
            ? `🟢 Syncing ${payload.inq} (${hasMulti ? payload.packages.length + ' Packages' : 'Costing'}) into existing Google Sheet...`
            : `🟢 Converting Costing & creating Google Sheet in Google Drive...`;
        showNotification(statusMsg, false);

        try {
            const options = {
                sheetUrl: payload.googleSheetUrl || null
            };
            const result = await window.SlwExcelGenerator.exportToGoogleSheets(payload, webhookUrl, options);
            if (result && result.sheetUrl) {
                await saveGoogleSheetUrlToInq(payload.inq, result.sheetUrl);
                if (typeof renderQuotationHubCards === 'function') renderQuotationHubCards();
                window.open(result.sheetUrl, '_blank');
                const notifyMsg = result.isUpdated
                    ? `✅ Existing Google Sheet for ${payload.inq} updated in-place with latest option tabs!`
                    : `✅ Google Sheet created successfully in your Drive! Opened in new tab.`;
                showNotification(notifyMsg, false);
            } else {
                throw new Error('Google did not return a valid Sheet URL');
            }
        } catch (err) {
            console.error('Google Sheets export error:', err);
            showNotification('⚠️ Google Sheets export error: ' + err.message, true);
        }
    }

    async function saveGoogleSheetUrlToInq(inqKey, sheetUrl) {
        if (!inqKey || !sheetUrl) return;
        
        // 1. Update in local index
        if (Array.isArray(inqQuotationIndex)) {
            const item = inqQuotationIndex.find(i => i.inq === inqKey);
            if (item) {
                item.googleSheetUrl = sheetUrl;
            }
            localStorage.setItem('slw_quotation_index', JSON.stringify(inqQuotationIndex));
        }

        // 2. Update local doc
        const localRaw = localStorage.getItem(SLW_INQ_DOC_PREFIX + inqKey);
        if (localRaw) {
            try {
                const parsed = JSON.parse(localRaw);
                parsed.googleSheetUrl = sheetUrl;
                localStorage.setItem(SLW_INQ_DOC_PREFIX + inqKey, JSON.stringify(parsed));
            } catch(e) {}
        }

        // 3. Update in Firebase Cloud
        if (typeof db !== 'undefined' && db) {
            try {
                await db.collection('slw_quotations').doc(inqKey).set({ googleSheetUrl: sheetUrl }, { merge: true });
                await db.collection('slw_settings').doc('quotation_index').set({
                    items: inqQuotationIndex,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            } catch(e) {
                console.warn('Failed to update googleSheetUrl on cloud:', e);
            }
        }
    }

    async function exportInqQuotationToGoogleSheets(inqKey, forceRegenerate = false) {
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

            // If already created and forceRegenerate is false:
            if (docData.googleSheetUrl && !forceRegenerate) {
                const wantRegenerate = confirm(
                    '📊 Google Sheet for ' + inqKey + ' already exists in Google Drive.\n\n' +
                    '• Click OK to 🔄 UPDATE / SYNC IN-PLACE\n  (Syncs latest options, tabs, and rates directly into the existing Google Sheet without creating duplicate files).\n\n' +
                    '• Click CANCEL to 📂 OPEN EXISTING SHEET directly.'
                );
                if (wantRegenerate) {
                    forceRegenerate = true;
                } else {
                    window.open(docData.googleSheetUrl, '_blank');
                    showNotification('📂 Opening existing Google Sheet for ' + inqKey + '...', false);
                    return;
                }
            }

            const costing = docData.costing || {};
            const cities = costing.availableCities || [];
            const tours = costing.availableTours || [];
            const transfers = costing.availableTransfers || [];
            const rates = docData.rates || costing.rates || {};
            const isMixActive = costing.hasMix ?? (rates && rates.pMix && cleanLkrNumber(rates.pMix) !== '0' && cleanLkrNumber(rates.pMix) !== '');
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
            const options = {
                sheetUrl: docData.googleSheetUrl || null
            };
            showNotification('🟢 Syncing ' + inqKey + (payload.packages ? ` (${payload.packages.length} Packages)` : '') + ' to Google Sheet in Google Drive...', false);
            const result = await window.SlwExcelGenerator.exportToGoogleSheets(payload, webhookUrl, options);

            if (result && result.sheetUrl) {
                await saveGoogleSheetUrlToInq(inqKey, result.sheetUrl);
                renderQuotationHubCards();
                window.open(result.sheetUrl, '_blank');
                const actionMsg = result.isUpdated
                    ? `✅ Existing Google Sheet for ${inqKey} updated in-place with all package tabs!`
                    : `✅ Google Sheet for ${inqKey} opened successfully!`;
                showNotification(actionMsg, false);
            }
        } catch(err) {
            console.error('Error generating Google Sheet for INQ:', err);
            showNotification('⚠️ Google Sheets export error: ' + err.message, true);
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
            const isMixActive = costing.hasMix ?? (rates && rates.pMix && cleanLkrNumber(rates.pMix) !== '0' && cleanLkrNumber(rates.pMix) !== '');
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
