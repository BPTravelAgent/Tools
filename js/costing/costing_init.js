    window.onload = async () => {
        try {
            const savedExtra = localStorage.getItem('bp_child_opt_extra');
            const savedShare = localStorage.getItem('bp_child_opt_share');
            const extraEl = document.getElementById('check_child_extra_bed');
            const shareEl = document.getElementById('check_child_sharing_bed');
            if (extraEl) extraEl.checked = (savedExtra !== null) ? (savedExtra === 'true') : false;
            if (shareEl) shareEl.checked = (savedShare !== null) ? (savedShare === 'true') : false;
        } catch(e) {}
        onChildOptionToggle();

        try {
            await loadMasterDatabase();
        } catch(e) {
            console.warn("loadMasterDatabase error:", e);
        }
        updateMasterDbCounts();
        try {
            await loadCostingPresetsFromCloud();
        } catch(e) {
            console.warn("loadCostingPresetsFromCloud error:", e);
        }
        try {
            await initInqQuotationHub();
        } catch(e) {
            console.warn("initInqQuotationHub error:", e);
        }
        renderAll();
        if (typeof renderCostingOptionsUI === 'function') {
            renderCostingOptionsUI();
        }
        // Keep SLW_LATEST_COSTING_DETAILS synced whenever export/save modal details are typed
        ['exportItineraryTitle', 'exportItineraryPax', 'exportItineraryDate', 'exportItineraryInq', 'exportItineraryClient',
         'saveQuotationInqInput', 'saveQuotationClientInput', 'saveQuotationTitleInput', 'saveQuotationPaxInput',
         'saveQuotationTravelMonthInput', 'saveQuotationTravelYearInput'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                if (typeof saveLatestCostingDetails !== 'function') return;
                const ov = {};
                if (id === 'exportItineraryTitle' || id === 'saveQuotationTitleInput') ov.title = el.value.trim();
                if (id === 'exportItineraryPax' || id === 'saveQuotationPaxInput') ov.pax = el.value.trim();
                if (id === 'exportItineraryInq' || id === 'saveQuotationInqInput') ov.inq = el.value.trim();
                if (id === 'exportItineraryClient' || id === 'saveQuotationClientInput') ov.clientName = el.value.trim();
                if (id === 'exportItineraryDate') ov.date = el.value.trim();
                if (id === 'saveQuotationTravelMonthInput' || id === 'saveQuotationTravelYearInput') {
                    const m = document.getElementById('saveQuotationTravelMonthInput')?.value.trim() || '';
                    const y = document.getElementById('saveQuotationTravelYearInput')?.value.trim() || '';
                    if (m) ov.date = (y && !m.includes(y)) ? `${m}/${y}` : m;
                }
                saveLatestCostingDetails(ov);
            });
        });
    };

    function onMarkupChange(type, category, suffix) {
        let pctInput = document.getElementById(`markup_pct_${category}_${suffix}`);
        let thbInput = document.getElementById(`markup_thb_${category}_${suffix}`);
        let subtotal = parseFloat(thbInput.dataset.subtotal) || 0;
        
        pctInput.dataset.manual = 'true';
        thbInput.dataset.manual = 'true';
        
        if (customFinalPriceOverrides[suffix] && customFinalPriceOverrides[suffix][category]) {
            delete customFinalPriceOverrides[suffix][category];
        }

        if (type === 'thb') {
            let thbVal = parseFloat(thbInput.value) || 0;
            let pctVal = subtotal > 0 ? (thbVal / subtotal) * 100 : 0;
            pctInput.value = pctVal.toFixed(2);
        } else {
            let pctVal = parseFloat(pctInput.value) || 0;
            let thbVal = subtotal * (pctVal / 100);
            thbInput.value = thbVal.toFixed(2);
        }
        calculate();
    }

    function resetMarkup(category, suffix) {
        let pctInput = document.getElementById(`markup_pct_${category}_${suffix}`);
        let thbInput = document.getElementById(`markup_thb_${category}_${suffix}`);
        if (pctInput) pctInput.dataset.manual = 'false';
        if (thbInput) thbInput.dataset.manual = 'false';
        if (customFinalPriceOverrides[suffix] && customFinalPriceOverrides[suffix][category]) {
            delete customFinalPriceOverrides[suffix][category];
        }
        calculate();
    }