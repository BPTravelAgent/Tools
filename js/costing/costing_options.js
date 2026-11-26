    // ══════════════════════════════════════════════════════════════
    // MULTI-OPTION COSTING WORKSPACE (Option 01, Option 02, ...)
    // Safely manages multiple package variations in Tour Costing
    // without disturbing any existing single-option workflows.
    // ══════════════════════════════════════════════════════════════
    window.costingOptionsList = window.costingOptionsList || [];
    window.activeCostingOptionIndex = window.activeCostingOptionIndex || 0;
    window.__slwIsSwitchingOption = false;

    function _slwDeepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function _slwDefaultOptionName(idx) {
        const num = String(idx + 1).padStart(2, '0');
        return idx === 0 ? `Option ${num} - Standard` : `Option ${num} - Add-on / Alternative`;
    }

    function _slwCaptureCurrentHotelNames() {
        const selectedCities = (availableCities || []).filter(c => c.selected);
        const star3 = selectedCities.map(c => `${c.name}-${c.hotel3Name}`).filter(Boolean);
        const star4 = selectedCities.map(c => `${c.name} - ${c.hotel4Name}`).filter(Boolean);
        const star5 = selectedCities.map(c => c.hotel5Name ? `${c.name} - ${c.hotel5Name}` : '').filter(Boolean);
        const mix = selectedCities.map(c => {
            const hName = c.mixPref === '4' ? c.hotel4Name : (c.mixPref === '5' ? (c.hotel5Name || c.hotel4Name) : c.hotel3Name);
            return hName ? `${c.name} - ${hName}` : '';
        }).filter(Boolean);
        return { star3, star4, star5, mix };
    }

    function _slwReadCurrentOptionSummary() {
        if (typeof buildCurrentPricingSummary === 'function') {
            return buildCurrentPricingSummary();
        }
        return null;
    }

    function ensureCostingOptionsInitialized() {
        if (!Array.isArray(window.costingOptionsList) || window.costingOptionsList.length === 0) {
            window.activeCostingOptionIndex = 0;
            window.costingOptionsList = [{
                id: 'opt_1',
                name: _slwDefaultOptionName(0),
                description: '',
                availableCities: _slwDeepClone(availableCities || []),
                availableTours: _slwDeepClone(availableTours || []),
                availableTransfers: _slwDeepClone(availableTransfers || []),
                pricingAdj: typeof captureAllPricingAdjustments === 'function' ? captureAllPricingAdjustments() : null,
                pricingSummary: _slwReadCurrentOptionSummary()
            }];
        }
        if (window.activeCostingOptionIndex < 0 || window.activeCostingOptionIndex >= window.costingOptionsList.length) {
            window.activeCostingOptionIndex = 0;
        }
    }

    function snapshotCurrentCostingOption(explicitSummary = null) {
        if (window.__slwIsSwitchingOption) return;
        ensureCostingOptionsInitialized();
        const idx = window.activeCostingOptionIndex;
        const opt = window.costingOptionsList[idx];
        if (!opt) return;

        opt.availableCities = _slwDeepClone(availableCities || []);
        opt.availableTours = _slwDeepClone(availableTours || []);
        opt.availableTransfers = _slwDeepClone(availableTransfers || []);
        if (typeof captureAllPricingAdjustments === 'function') {
            opt.pricingAdj = captureAllPricingAdjustments();
        }
        const sum = explicitSummary || _slwReadCurrentOptionSummary();
        if (sum) {
            opt.pricingSummary = _slwDeepClone(sum);
        }
        if (idx > 0) {
            opt.diffSummary = computeOptionDiffVsBase(idx);
        } else {
            opt.diffSummary = '';
        }
    }

    function computeOptionDiffVsBase(optIdx) {
        if (optIdx <= 0 || !window.costingOptionsList[0] || !window.costingOptionsList[optIdx]) return '';
        const base = window.costingOptionsList[0];
        const cur = window.costingOptionsList[optIdx];
        const parts = [];

        const baseTours = new Set((base.availableTours || []).filter(t => t.selected).map(t => (t.name || '').trim().toLowerCase()));
        const curTours = (cur.availableTours || []).filter(t => t.selected);
        const addedTours = curTours.filter(t => !baseTours.has((t.name || '').trim().toLowerCase()));
        const curTourNames = new Set(curTours.map(t => (t.name || '').trim().toLowerCase()));
        const removedTours = (base.availableTours || []).filter(t => t.selected && !curTourNames.has((t.name || '').trim().toLowerCase()));

        if (addedTours.length > 0) {
            parts.push('+ Tour: ' + addedTours.map(t => t.name).join(', '));
        }
        if (removedTours.length > 0) {
            parts.push('- Tour: ' + removedTours.map(t => t.name).join(', '));
        }

        const baseTrf = new Set((base.availableTransfers || []).filter(t => t.selected).map(t => (t.name || '').trim().toLowerCase()));
        const curTrf = (cur.availableTransfers || []).filter(t => t.selected);
        const addedTrf = curTrf.filter(t => !baseTrf.has((t.name || '').trim().toLowerCase()));
        if (addedTrf.length > 0) {
            parts.push('+ Transfer: ' + addedTrf.map(t => t.name).join(', '));
        }

        const baseCities = (base.availableCities || []).filter(c => c.selected);
        const curCities = (cur.availableCities || []).filter(c => c.selected);
        if (baseCities.length !== curCities.length) {
            parts.push(`Cities: ${curCities.map(c => `${c.numberOfNights}N ${c.name}`).join(' + ')}`);
        } else {
            curCities.forEach((cc, i) => {
                const bc = baseCities[i];
                if (!bc) return;
                if (cc.name !== bc.name || Number(cc.numberOfNights) !== Number(bc.numberOfNights)) {
                    parts.push(`${cc.name}: ${cc.numberOfNights}N`);
                } else if (cc.hotel3Name !== bc.hotel3Name || cc.hotel4Name !== bc.hotel4Name || Number(cc.hotel3Price) !== Number(bc.hotel3Price) || Number(cc.hotel4Price) !== Number(bc.hotel4Price)) {
                    parts.push(`Hotel updated (${cc.name})`);
                }
            });
        }

        return parts.join(' • ');
    }

    function addCostingOption(cloneFromIdx = null) {
        ensureCostingOptionsInitialized();
        if (typeof calculate === 'function') calculate();
        snapshotCurrentCostingOption();

        const srcIdx = (cloneFromIdx !== null && window.costingOptionsList[cloneFromIdx])
            ? cloneFromIdx
            : window.activeCostingOptionIndex;
        const source = window.costingOptionsList[srcIdx] || window.costingOptionsList[0];

        const newIdx = window.costingOptionsList.length;
        const num = String(newIdx + 1).padStart(2, '0');
        const newOpt = {
            id: 'opt_' + Date.now() + '_' + (newIdx + 1),
            name: `Option ${num} - Extra Tour / Upgrade`,
            description: '',
            diffSummary: '',
            availableCities: _slwDeepClone(source.availableCities || []),
            availableTours: _slwDeepClone(source.availableTours || []),
            availableTransfers: _slwDeepClone(source.availableTransfers || []),
            pricingAdj: source.pricingAdj ? _slwDeepClone(source.pricingAdj) : null,
            pricingSummary: source.pricingSummary ? _slwDeepClone(source.pricingSummary) : null
        };

        window.costingOptionsList.push(newOpt);
        switchCostingOption(newIdx, true);
        showNotification(`✨ Option ${num} created! Now add/change any Tour, Hotel, or Transfer — Option 01 prices remain saved.`, false);
    }

    function switchCostingOption(targetIdx, skipSaveCurrent = false) {
        ensureCostingOptionsInitialized();
        if (targetIdx < 0 || targetIdx >= window.costingOptionsList.length) return;
        if (targetIdx === window.activeCostingOptionIndex && !skipSaveCurrent) {
            renderCostingOptionsUI();
            return;
        }

        if (!skipSaveCurrent) {
            snapshotCurrentCostingOption();
        }

        window.__slwIsSwitchingOption = true;
        try {
            window.activeCostingOptionIndex = targetIdx;
            const target = window.costingOptionsList[targetIdx];

            availableCities = _slwDeepClone(target.availableCities || []);
            availableTours = _slwDeepClone(target.availableTours || []);
            availableTransfers = _slwDeepClone(target.availableTransfers || []);

            if (target.pricingAdj && typeof restoreAllPricingAdjustments === 'function') {
                restoreAllPricingAdjustments(target.pricingAdj);
            }

            if (typeof renderAll === 'function') renderAll();
        } finally {
            window.__slwIsSwitchingOption = false;
        }

        if (typeof calculate === 'function') calculate();
        renderCostingOptionsUI();
    }

    function recloneCostingOptionFromBase(optIdx) {
        ensureCostingOptionsInitialized();
        if (optIdx <= 0 || !window.costingOptionsList[0] || !window.costingOptionsList[optIdx]) return;
        if (!confirm(`Reset "${window.costingOptionsList[optIdx].name}" to match Option 01?`)) return;

        if (window.activeCostingOptionIndex === 0) {
            snapshotCurrentCostingOption();
        }
        const base = window.costingOptionsList[0];
        const target = window.costingOptionsList[optIdx];
        target.availableCities = _slwDeepClone(base.availableCities || []);
        target.availableTours = _slwDeepClone(base.availableTours || []);
        target.availableTransfers = _slwDeepClone(base.availableTransfers || []);
        target.pricingAdj = base.pricingAdj ? _slwDeepClone(base.pricingAdj) : null;
        target.pricingSummary = base.pricingSummary ? _slwDeepClone(base.pricingSummary) : null;
        target.diffSummary = '';

        switchCostingOption(optIdx, true);
        showNotification(`🔄 Reset ${target.name} to match Option 01.`, false);
    }

    function renameCostingOption(optIdx) {
        ensureCostingOptionsInitialized();
        const opt = window.costingOptionsList[optIdx];
        if (!opt) return;
        const nextName = prompt('Enter Option Name (shown in Itinerary & Excel):', opt.name || _slwDefaultOptionName(optIdx));
        if (nextName === null) return;
        const trimmed = nextName.trim();
        if (!trimmed) return;
        opt.name = trimmed;
        if (typeof saveLatestCostingPrices === 'function') saveLatestCostingPrices();
        renderCostingOptionsUI();
    }

    function deleteCostingOption(optIdx) {
        ensureCostingOptionsInitialized();
        if (window.costingOptionsList.length <= 1 || optIdx === 0) {
            showNotification('Option 01 cannot be deleted.', true);
            return;
        }
        const opt = window.costingOptionsList[optIdx];
        if (!confirm(`Delete "${opt.name}"?`)) return;

        window.costingOptionsList.splice(optIdx, 1);
        const nextIdx = Math.min(window.activeCostingOptionIndex, window.costingOptionsList.length - 1);
        switchCostingOption(nextIdx, true);
        showNotification(`🗑️ Removed ${opt.name}.`, false);
    }

    function resetCostingOptionsToSingle(preserveCurrent = true) {
        if (preserveCurrent) {
            window.costingOptionsList = [];
            window.activeCostingOptionIndex = 0;
            ensureCostingOptionsInitialized();
        } else {
            window.costingOptionsList = [];
            window.activeCostingOptionIndex = 0;
        }
        renderCostingOptionsUI();
    }

    function loadMultiPackagesIntoCostingOptions(packages) {
        if (!Array.isArray(packages) || packages.length === 0) {
            resetCostingOptionsToSingle(true);
            return;
        }
        window.costingOptionsList = packages.map((pkg, idx) => {
            const c = pkg.costing || {};
            return {
                id: pkg.id || ('opt_' + (idx + 1)),
                name: pkg.packageName || _slwDefaultOptionName(idx),
                description: pkg.description || '',
                diffSummary: '',
                availableCities: _slwDeepClone(c.availableCities || []),
                availableTours: _slwDeepClone(c.availableTours || []),
                availableTransfers: _slwDeepClone(c.availableTransfers || []),
                pricingAdj: c.pricingAdj ? _slwDeepClone(c.pricingAdj) : null,
                pricingSummary: pkg.pricingSummary ? _slwDeepClone(pkg.pricingSummary) : null
            };
        });
        window.activeCostingOptionIndex = 0;
        renderCostingOptionsUI();
    }

    function _slwParseLkrInt(str) {
        const digits = String(str || '').replace(/[^0-9]/g, '');
        return digits ? parseInt(digits, 10) : 0;
    }

    function _slwFormatDiff(curStr, baseStr) {
        const c = _slwParseLkrInt(curStr);
        const b = _slwParseLkrInt(baseStr);
        if (!c || !b) return '';
        const diff = c - b;
        if (diff === 0) return 'Same';
        const sign = diff > 0 ? '+' : '-';
        return `${sign}LKR ${Math.abs(diff).toLocaleString('en-US')}`;
    }

    function renderCostingOptionsUI() {
        ensureCostingOptionsInitialized();
        const bar = document.getElementById('costingOptionsSwitcherBar');
        const tabsEl = document.getElementById('costingOptionsTabs');
        const activeBanner = document.getElementById('costingOptionActiveNotice');
        const compPanel = document.getElementById('costingOptionsComparisonPanel');
        const compGrid = document.getElementById('costingOptionsComparisonGrid');

        const opts = window.costingOptionsList;
        const activeIdx = window.activeCostingOptionIndex;

        if (tabsEl) {
            tabsEl.innerHTML = opts.map((opt, idx) => {
                const isActive = (idx === activeIdx);
                const sum = opt.pricingSummary || {};
                const p3 = sum.prices3Star?.adult || '';
                const p4 = sum.prices4Star?.adult || '';
                const badgeTxt = p3 ? `3*: ${p3}` : 'Ready';
                const safeName = (opt.name || _slwDefaultOptionName(idx)).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `
                    <div class="inline-flex items-center rounded-xl border-2 transition-all overflow-hidden ${isActive ? 'border-amber-500 bg-amber-50 shadow-sm ring-2 ring-amber-300/60' : 'border-gray-200 bg-white hover:border-amber-300'}">
                        <button type="button" onclick="switchCostingOption(${idx})" class="px-3 py-2 text-left flex items-center gap-2">
                            <span class="w-5 h-5 rounded-full text-[11px] font-black flex items-center justify-center ${isActive ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-700'}">${idx + 1}</span>
                            <div>
                                <div class="text-xs font-extrabold ${isActive ? 'text-amber-950' : 'text-gray-800'} leading-tight">${safeName}</div>
                                <div class="text-[10px] font-semibold ${isActive ? 'text-amber-700' : 'text-gray-500'}">${badgeTxt}${p4 ? ` • 4*: ${p4}` : ''}</div>
                            </div>
                        </button>
                        <button type="button" onclick="renameCostingOption(${idx})" class="px-1.5 py-2 text-gray-400 hover:text-indigo-600 text-[11px]" title="Rename Option">
                            <i class="fas fa-pen"></i>
                        </button>
                        ${idx > 0 ? `
                        <button type="button" onclick="deleteCostingOption(${idx})" class="px-1.5 py-2 text-gray-400 hover:text-red-600 text-[11px] border-l border-gray-100" title="Remove Option">
                            <i class="fas fa-times"></i>
                        </button>` : ''}
                    </div>
                `;
            }).join('');
        }

        if (activeBanner) {
            if (opts.length > 1) {
                const curOpt = opts[activeIdx];
                const diff = activeIdx > 0 ? computeOptionDiffVsBase(activeIdx) : '';
                activeBanner.classList.remove('hidden');
                activeBanner.innerHTML = `
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-2 text-xs">
                            <span class="px-2 py-0.5 rounded-full font-black bg-amber-500 text-white">EDITING OPTION ${String(activeIdx + 1).padStart(2, '0')}</span>
                            <span class="font-bold text-amber-950">${(curOpt.name || '').replace(/</g, '&lt;')}</span>
                            ${diff ? `<span class="text-[11px] font-semibold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">${diff}</span>` : `<span class="text-[11px] text-amber-800">${activeIdx === 0 ? 'Base package — changes here stay in Option 01.' : 'Tick/add extra tours, hotels, or transfers below. Option 01 stays untouched!'}</span>`}
                        </div>
                        ${activeIdx > 0 ? `
                        <button type="button" onclick="recloneCostingOptionFromBase(${activeIdx})" class="text-[11px] font-bold text-amber-900 hover:text-amber-950 bg-white px-2.5 py-1 rounded border border-amber-300 shadow-2xs transition">
                            <i class="fas fa-sync-alt mr-1"></i> Reset to Option 01
                        </button>` : ''}
                    </div>
                `;
            } else {
                activeBanner.classList.add('hidden');
            }
        }

        if (bar) {
            bar.classList.remove('hidden');
        }

        if (compPanel && compGrid) {
            if (opts.length > 1) {
                compPanel.classList.remove('hidden');
                const baseSum = opts[0]?.pricingSummary || {};
                compGrid.innerHTML = opts.map((opt, idx) => {
                    const sum = opt.pricingSummary || {};
                    const isActive = (idx === activeIdx);
                    const p3 = sum.prices3Star?.adult || 'LKR 0';
                    const pMix = sum.hasMix && sum.pricesMix?.adult ? sum.pricesMix.adult : null;
                    const p4 = sum.prices4Star?.adult || 'LKR 0';
                    const p5 = sum.prices5Star?.adult || null;

                    const d3 = idx > 0 ? _slwFormatDiff(p3, baseSum.prices3Star?.adult) : '';
                    const dMix = (idx > 0 && pMix && baseSum.pricesMix?.adult) ? _slwFormatDiff(pMix, baseSum.pricesMix.adult) : '';
                    const d4 = idx > 0 ? _slwFormatDiff(p4, baseSum.prices4Star?.adult) : '';

                    const diffText = idx > 0 ? (opt.diffSummary || computeOptionDiffVsBase(idx)) : 'Base Standard Package';

                    return `
                        <div class="rounded-xl border-2 p-4 transition-all ${isActive ? 'border-amber-500 bg-amber-50/60 shadow-md' : 'border-gray-200 bg-white hover:border-amber-300'}">
                            <div class="flex items-center justify-between gap-2 mb-2 pb-2 border-b ${isActive ? 'border-amber-200' : 'border-gray-100'}">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="px-2 py-0.5 rounded-full text-[11px] font-black ${isActive ? 'bg-amber-500 text-white' : 'bg-gray-800 text-white'}">Option ${String(idx + 1).padStart(2, '0')}</span>
                                    <span class="font-bold text-sm text-gray-900 truncate">${(opt.name || '').replace(/</g, '&lt;')}</span>
                                </div>
                                <div class="flex items-center gap-1.5 shrink-0">
                                    ${!isActive ? `<button type="button" onclick="switchCostingOption(${idx})" class="text-[11px] font-bold px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition">Edit</button>` : `<span class="text-[10px] font-extrabold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded">ACTIVE</span>`}
                                    ${idx > 0 ? `<button type="button" onclick="deleteCostingOption(${idx})" class="text-[11px] font-bold px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition" title="Delete Option"><i class="fas fa-trash-alt"></i></button>` : ''}
                                </div>
                            </div>
                            <p class="text-[11px] text-gray-600 mb-3 truncate" title="${diffText}">${diffText || 'Custom variation'}</p>
                            <div class="grid ${pMix ? 'grid-cols-3' : 'grid-cols-2'} gap-2 text-center text-xs">
                                <div class="p-2 rounded-lg bg-blue-50 border border-blue-200">
                                    <div class="text-[10px] font-bold text-blue-700">3* HOTEL</div>
                                    <div class="font-extrabold text-blue-950">${p3}</div>
                                    ${d3 ? `<div class="text-[10px] font-bold text-emerald-700">${d3}</div>` : ''}
                                </div>
                                ${pMix ? `
                                <div class="p-2 rounded-lg bg-purple-50 border border-purple-200">
                                    <div class="text-[10px] font-bold text-purple-700">MIX HOTEL</div>
                                    <div class="font-extrabold text-purple-950">${pMix}</div>
                                    ${dMix ? `<div class="text-[10px] font-bold text-emerald-700">${dMix}</div>` : ''}
                                </div>` : ''}
                                <div class="p-2 rounded-lg bg-amber-50 border border-amber-200">
                                    <div class="text-[10px] font-bold text-amber-800">4* HOTEL</div>
                                    <div class="font-extrabold text-amber-950">${p4}</div>
                                    ${d4 ? `<div class="text-[10px] font-bold text-emerald-700">${d4}</div>` : ''}
                                </div>
                            </div>
                            ${p5 ? `<div class="mt-2 text-center text-[11px] font-bold text-purple-800">5* Hotel: ${p5}</div>` : ''}
                        </div>
                    `;
                }).join('');
            } else {
                compPanel.classList.add('hidden');
            }
        }
    }
