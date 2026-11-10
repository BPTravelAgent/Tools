    // ── ADVANCED PRICING ADJUSTMENTS & OVERRIDES ENGINE ──
    function editFinalPrice(suffix, category) {
        const id = category === 'adult' ? `adult_final_lkr_${suffix}` :
                   category === 'child_extra' ? `child_final_lkr_${suffix}` :
                   `child_sharing_final_lkr_${suffix}`;
        const el = document.getElementById(id);
        const currentVal = customFinalPriceOverrides[suffix]?.[category] || (el ? parseFloat(String(cleanLkrNumber(el.innerText)).replace(/,/g, '')) : 0);
        
        const label = category === 'adult' ? 'Adult' : (category === 'child_extra' ? 'Child (Extra Bed)' : 'Child (Sharing Bed)');
        const star = suffix === '3star' ? '3*' : (suffix === '4star' ? '4*' : (suffix === '5star' ? '5*' : 'Mix'));

        const input = prompt(`Enter custom Final LKR price for ${star} ${label}\n(Leave empty to reset back to auto-calculated formula):`, currentVal > 0 ? currentVal : '');
        if (input === null) return; // cancelled

        if (input.trim() === '') {
            if (customFinalPriceOverrides[suffix]) {
                delete customFinalPriceOverrides[suffix][category];
            }
            showNotification(`Reset ${star} ${label} price to auto formula.`, false);
        } else {
            const num = parseFloat(input.replace(/[^0-9.]/g, ''));
            if (isNaN(num) || num <= 0) {
                alert("Please enter a valid positive number.");
                return;
            }
            if (!customFinalPriceOverrides[suffix]) customFinalPriceOverrides[suffix] = {};
            customFinalPriceOverrides[suffix][category] = num;
            showNotification(`Updated ${star} ${label} Final price to LKR ${num.toLocaleString('en-US')}.`, false);
        }

        calculate();
        if (activeLoadedPresetKey) {
            updateActivePresetStatusBar();
        }
    }

    function onChildOptionToggle() {
        const hasExtra = document.getElementById('check_child_extra_bed')?.checked ?? false;
        const hasShare = document.getElementById('check_child_sharing_bed')?.checked ?? false;

        document.querySelectorAll('.card-child-extra').forEach(el => {
            el.style.display = hasExtra ? '' : 'none';
        });
        document.querySelectorAll('.card-child-sharing').forEach(el => {
            el.style.display = hasShare ? '' : 'none';
        });

        try {
            localStorage.setItem('bp_child_opt_extra', hasExtra ? 'true' : 'false');
            localStorage.setItem('bp_child_opt_share', hasShare ? 'true' : 'false');
        } catch(e) {}

        calculate();
    }

    function captureAllPricingAdjustments() {
        // 1. General & Markup settings
        const settings = {
            numPeopleTransfer: Number(document.getElementById('num_people_transfer')?.value) || 2,
            numPeopleHotel: Number(document.getElementById('num_people_hotel')?.value) || 2,
            markup: Number(document.getElementById('markup')?.value) || 25,
            lkrRate: Number(document.getElementById('lkr_rate')?.value) || 10.0,
            usdDivisor: Number(document.getElementById('usd_divisor')?.value) || 31,
            includeChildExtraBed: document.getElementById('check_child_extra_bed')?.checked ?? false,
            includeChildSharingBed: document.getElementById('check_child_sharing_bed')?.checked ?? false,
            adultManualMarkup: document.getElementById('adult_manual_markup')?.value || '',
            childExtraBedManualMarkup: document.getElementById('child_extra_bed_manual_markup')?.value || '',
            childSharingManualMarkup: document.getElementById('child_sharing_manual_markup')?.value || '',
            guidePricePerDay: document.getElementById('guide_price_per_day')?.value || '',
            guideDays: document.getElementById('guide_days')?.value || '',
            waterPricePerDay: document.getElementById('water_price_per_day')?.value || '',
            waterDays: document.getElementById('water_days')?.value || '',
            mealPricePerDay: document.getElementById('meal_price_per_day')?.value || '',
            mealDays: document.getElementById('meal_days')?.value || '',
            isTplActive: document.getElementById('check_tpl_room')?.checked ?? false,
            tplRoomsCount: Number(document.getElementById('tpl_rooms_count')?.value) || 1,
            totalRoomsCount: Number(document.getElementById('total_hotel_rooms')?.value) || 1,
            tplRate3: Number(document.getElementById('tpl_rate_3star')?.value) || 800,
            tplRate4: Number(document.getElementById('tpl_rate_4star')?.value) || 1000,
            tplRate5: Number(document.getElementById('tpl_rate_5star')?.value) || 1200
        };

        // 2. Individual card markups (THB, %, and manual flag)
        const cardMarkups = {};
        const suffixes = ['3star', '4star', '5star', 'mix'];
        const categories = ['adult', 'child_extra', 'child_sharing'];

        suffixes.forEach(sfx => {
            cardMarkups[sfx] = {};
            categories.forEach(cat => {
                const thbEl = document.getElementById(`markup_thb_${cat}_${sfx}`);
                const pctEl = document.getElementById(`markup_pct_${cat}_${sfx}`);
                if (thbEl || pctEl) {
                    cardMarkups[sfx][cat] = {
                        thb: thbEl?.value || '',
                        pct: pctEl?.value || '',
                        manual: thbEl?.dataset.manual === 'true' || pctEl?.dataset.manual === 'true'
                    };
                }
            });
        });

        // 3. Current rendered final prices snapshot
        const renderedFinalPrices = {
            '3star': {
                adult: document.getElementById('adult_final_lkr_3star')?.innerText || '',
                child_extra: document.getElementById('child_final_lkr_3star')?.innerText || '',
                child_sharing: document.getElementById('child_sharing_final_lkr_3star')?.innerText || ''
            },
            '4star': {
                adult: document.getElementById('adult_final_lkr_4star')?.innerText || '',
                child_extra: document.getElementById('child_final_lkr_4star')?.innerText || '',
                child_sharing: document.getElementById('child_sharing_final_lkr_4star')?.innerText || ''
            },
            '5star': {
                adult: document.getElementById('adult_final_lkr_5star')?.innerText || '',
                child_extra: document.getElementById('child_final_lkr_5star')?.innerText || '',
                child_sharing: document.getElementById('child_sharing_final_lkr_5star')?.innerText || ''
            },
            'mix': {
                adult: document.getElementById('adult_final_lkr_mix')?.innerText || '',
                child_extra: document.getElementById('child_final_lkr_mix')?.innerText || '',
                child_sharing: document.getElementById('child_sharing_final_lkr_mix')?.innerText || ''
            }
        };

        return {
            settings,
            cardMarkups,
            customFinalPriceOverrides: JSON.parse(JSON.stringify(customFinalPriceOverrides || {})),
            renderedFinalPrices
        };
    }

    function restoreAllPricingAdjustments(preset) {
        if (!preset) return;

        // 1. Settings restoration
        if (preset.settings) {
            const s = preset.settings;
            if (s.numPeopleTransfer !== undefined) document.getElementById('num_people_transfer').value = s.numPeopleTransfer;
            if (s.numPeopleHotel !== undefined) document.getElementById('num_people_hotel').value = s.numPeopleHotel;
            if (s.markup !== undefined) document.getElementById('markup').value = s.markup;
            if (s.lkrRate !== undefined) document.getElementById('lkr_rate').value = s.lkrRate;
            if (s.usdDivisor !== undefined) document.getElementById('usd_divisor').value = s.usdDivisor;
            if (s.adultManualMarkup !== undefined) document.getElementById('adult_manual_markup').value = s.adultManualMarkup;
            if (s.childExtraBedManualMarkup !== undefined) document.getElementById('child_extra_bed_manual_markup').value = s.childExtraBedManualMarkup;
            if (s.childSharingManualMarkup !== undefined) document.getElementById('child_sharing_manual_markup').value = s.childSharingManualMarkup;
            if (s.guidePricePerDay !== undefined) document.getElementById('guide_price_per_day').value = s.guidePricePerDay;
            if (s.guideDays !== undefined) document.getElementById('guide_days').value = s.guideDays;
            if (s.waterPricePerDay !== undefined) document.getElementById('water_price_per_day').value = s.waterPricePerDay;
            if (s.waterDays !== undefined) document.getElementById('water_days').value = s.waterDays;
            if (s.mealPricePerDay !== undefined) document.getElementById('meal_price_per_day').value = s.mealPricePerDay;
            if (s.mealDays !== undefined) document.getElementById('meal_days').value = s.mealDays;

            // Restore child pricing checkboxes
            const extraEl = document.getElementById('check_child_extra_bed');
            const shareEl = document.getElementById('check_child_sharing_bed');
            if (s.includeChildExtraBed !== undefined) {
                if (extraEl) extraEl.checked = Boolean(s.includeChildExtraBed);
            } else if (preset.renderedFinalPrices && (preset.renderedFinalPrices['3star']?.child_extra || preset.renderedFinalPrices['4star']?.child_extra)) {
                if (extraEl) extraEl.checked = true;
            } else if (extraEl) {
                extraEl.checked = false;
            }

            if (s.includeChildSharingBed !== undefined) {
                if (shareEl) shareEl.checked = Boolean(s.includeChildSharingBed);
            } else if (preset.renderedFinalPrices && (preset.renderedFinalPrices['3star']?.child_sharing || preset.renderedFinalPrices['4star']?.child_sharing)) {
                if (shareEl) shareEl.checked = true;
            } else if (shareEl) {
                shareEl.checked = false;
            }

            onChildOptionToggle();

            // Restore TPL room options
            const tplChk = document.getElementById('check_tpl_room');
            if (s.isTplActive !== undefined) {
                if (tplChk) tplChk.checked = Boolean(s.isTplActive);
            }
            if (s.tplRoomsCount !== undefined && document.getElementById('tpl_rooms_count')) {
                document.getElementById('tpl_rooms_count').value = s.tplRoomsCount;
            }
            if (s.totalRoomsCount !== undefined && document.getElementById('total_hotel_rooms')) {
                document.getElementById('total_hotel_rooms').value = s.totalRoomsCount;
            }
            if (s.tplRate3 !== undefined && document.getElementById('tpl_rate_3star')) {
                document.getElementById('tpl_rate_3star').value = s.tplRate3;
            }
            if (s.tplRate4 !== undefined && document.getElementById('tpl_rate_4star')) {
                document.getElementById('tpl_rate_4star').value = s.tplRate4;
            }
            if (s.tplRate5 !== undefined && document.getElementById('tpl_rate_5star')) {
                document.getElementById('tpl_rate_5star').value = s.tplRate5;
            }
            onTplOptionToggle();
        }

        // 2. Custom final price overrides restoration
        customFinalPriceOverrides = JSON.parse(JSON.stringify(preset.customFinalPriceOverrides || {}));
        window.customFinalPriceOverrides = customFinalPriceOverrides;

        // 3. Card markups restoration
        if (preset.cardMarkups) {
            const suffixes = ['3star', '4star', '5star', 'mix'];
            const categories = ['adult', 'child_extra', 'child_sharing'];
            suffixes.forEach(sfx => {
                const sfxData = preset.cardMarkups[sfx];
                if (!sfxData) return;
                categories.forEach(cat => {
                    const m = sfxData[cat];
                    if (!m) return;
                    const thbEl = document.getElementById(`markup_thb_${cat}_${sfx}`);
                    const pctEl = document.getElementById(`markup_pct_${cat}_${sfx}`);
                    if (thbEl && m.thb !== undefined && m.thb !== '') {
                        thbEl.value = m.thb;
                    }
                    if (pctEl && m.pct !== undefined && m.pct !== '') {
                        pctEl.value = m.pct;
                    }
                    if (m.manual) {
                        if (thbEl) thbEl.dataset.manual = 'true';
                        if (pctEl) pctEl.dataset.manual = 'true';
                    } else {
                        if (thbEl) thbEl.dataset.manual = 'false';
                        if (pctEl) pctEl.dataset.manual = 'false';
                    }
                });
            });
        }
    }

    // --- MAIN CALCULATION ---
    function calculate() {
        // Helpers
        const getNumber = (id, defaultValue = 0) => {
            const value = parseFloat(document.getElementById(id).value);
            return isNaN(value) || value < 0 ? defaultValue : value;
        };
        const getOptionalNumber = (id) => {
            const value = parseFloat(document.getElementById(id).value);
            return isNaN(value) ? null : value;
        };
        const formatCurrency = (amount, currency) => amount.toLocaleString('en-US', { style: 'currency', currency: currency, minimumFractionDigits: 2 });

        // 1. Calculate common base costs (Tours, Transfers)
        const selectedTourCost = availableTours.reduce((sum, tour) => tour.selected ? sum + tour.price : sum, 0);
        const tourSpecificTransferCost = availableTours.reduce((sum, tour) => tour.selected ? sum + tour.transferPrice : sum, 0);
        const selectedGeneralTransferCost = availableTransfers.reduce((sum, t) => t.selected ? sum + t.price : sum, 0);
        const totalTransferCost = tourSpecificTransferCost + selectedGeneralTransferCost;
        
        // 2. Get settings
        const numPeopleTransfer = getNumber('num_people_transfer', 1) || 1;
        const numPeopleHotel = getNumber('num_people_hotel', 1) || 1;
        const perPersonTransferCost = totalTransferCost / numPeopleTransfer;

        const markupPercentValue = getNumber('markup', 0);
        const markupPercent = markupPercentValue / 100;
        const lkrRate = getNumber('lkr_rate', 10.0);
        const usdDivisor = getNumber('usd_divisor', 31) || 1;

        const manualMarkupAdult = getOptionalNumber('adult_manual_markup');
        const manualMarkupChildExtraBed = getOptionalNumber('child_extra_bed_manual_markup');
        const manualMarkupChildSharing = getOptionalNumber('child_sharing_manual_markup');

        // Add-ons Calculation
        const guideCost = getNumber('guide_price_per_day') * getNumber('guide_days');
        const waterCost = getNumber('water_price_per_day') * getNumber('water_days');
        const mealCost = getNumber('meal_price_per_day') * getNumber('meal_days');
        const totalAddonGroupCost = guideCost + waterCost + mealCost;
        const addonCostPerAdult = totalAddonGroupCost / numPeopleHotel;

        // 3. Separate Hotel & Meal Calculations
        const selectedCities = availableCities.filter(c => c.selected);

        // Triple (TPL) Room Supplement calculation
        const isTplActive = Boolean(document.getElementById('check_tpl_room')?.checked);
        const tplRoomsCount = isTplActive ? Math.max(0, parseInt(document.getElementById('tpl_rooms_count')?.value) || 1) : 0;
        const totalRoomsCount = isTplActive ? Math.max(1, parseInt(document.getElementById('total_hotel_rooms')?.value) || 1) : 1;
        const tplRate3 = isTplActive ? (parseFloat(document.getElementById('tpl_rate_3star')?.value) || 800) : 0;
        const tplRate4 = isTplActive ? (parseFloat(document.getElementById('tpl_rate_4star')?.value) || 1000) : 0;
        const tplRate5 = isTplActive ? (parseFloat(document.getElementById('tpl_rate_5star')?.value) || 1200) : 0;

        const hotelCost3 = selectedCities.reduce((sum, c) => {
            const h3Tpl = (c.hotel3Tpl !== undefined && c.hotel3Tpl !== null) ? Number(c.hotel3Tpl) : tplRate3;
            const h4Tpl = (c.hotel4Tpl !== undefined && c.hotel4Tpl !== null) ? Number(c.hotel4Tpl) : tplRate4;
            const h5Tpl = (c.hotel5Tpl !== undefined && c.hotel5Tpl !== null) ? Number(c.hotel5Tpl) : tplRate5;
            if (c.isSplit) {
                const c3 = (totalRoomsCount * (c.hotel3Price || 0) + tplRoomsCount * h3Tpl) * (c.hotel3Nights || 0);
                const c4 = (totalRoomsCount * (c.hotel4Price || 0) + tplRoomsCount * h4Tpl) * (c.hotel4Nights || 0);
                const c5 = (totalRoomsCount * (c.hotel5Price || 0) + tplRoomsCount * h5Tpl) * (c.hotel5Nights || 0);
                return sum + c3 + c4 + c5;
            }
            const roomPrice = (totalRoomsCount * (c.hotel3Price || 0)) + (tplRoomsCount * h3Tpl);
            return sum + (roomPrice * (c.numberOfNights || 0));
        }, 0) / numPeopleHotel;

        const hotelCost4 = selectedCities.reduce((sum, c) => {
            const h3Tpl = (c.hotel3Tpl !== undefined && c.hotel3Tpl !== null) ? Number(c.hotel3Tpl) : tplRate3;
            const h4Tpl = (c.hotel4Tpl !== undefined && c.hotel4Tpl !== null) ? Number(c.hotel4Tpl) : tplRate4;
            const h5Tpl = (c.hotel5Tpl !== undefined && c.hotel5Tpl !== null) ? Number(c.hotel5Tpl) : tplRate5;
            if (c.isSplit) {
                const c3 = (totalRoomsCount * (c.hotel3Price || 0) + tplRoomsCount * h3Tpl) * (c.hotel3Nights || 0);
                const c4 = (totalRoomsCount * (c.hotel4Price || 0) + tplRoomsCount * h4Tpl) * (c.hotel4Nights || 0);
                const c5 = (totalRoomsCount * (c.hotel5Price || 0) + tplRoomsCount * h5Tpl) * (c.hotel5Nights || 0);
                return sum + c3 + c4 + c5;
            }
            const roomPrice = (totalRoomsCount * (c.hotel4Price || 0)) + (tplRoomsCount * h4Tpl);
            return sum + (roomPrice * (c.numberOfNights || 0));
        }, 0) / numPeopleHotel;

        const hotelCost5 = selectedCities.reduce((sum, c) => {
            const h3Tpl = (c.hotel3Tpl !== undefined && c.hotel3Tpl !== null) ? Number(c.hotel3Tpl) : tplRate3;
            const h4Tpl = (c.hotel4Tpl !== undefined && c.hotel4Tpl !== null) ? Number(c.hotel4Tpl) : tplRate4;
            const h5Tpl = (c.hotel5Tpl !== undefined && c.hotel5Tpl !== null) ? Number(c.hotel5Tpl) : tplRate5;
            if (c.isSplit) {
                const c3 = (totalRoomsCount * (c.hotel3Price || 0) + tplRoomsCount * h3Tpl) * (c.hotel3Nights || 0);
                const c4 = (totalRoomsCount * (c.hotel4Price || 0) + tplRoomsCount * h4Tpl) * (c.hotel4Nights || 0);
                const c5 = (totalRoomsCount * (c.hotel5Price || 0) + tplRoomsCount * h5Tpl) * (c.hotel5Nights || 0);
                return sum + c3 + c4 + c5;
            }
            const roomPrice = (totalRoomsCount * (c.hotel5Price || 0)) + (tplRoomsCount * h5Tpl);
            return sum + (roomPrice * (c.numberOfNights || 0));
        }, 0) / numPeopleHotel;

        const hotelCostMix = selectedCities.reduce((sum, c) => {
            const h3Tpl = (c.hotel3Tpl !== undefined && c.hotel3Tpl !== null) ? Number(c.hotel3Tpl) : tplRate3;
            const h4Tpl = (c.hotel4Tpl !== undefined && c.hotel4Tpl !== null) ? Number(c.hotel4Tpl) : tplRate4;
            const h5Tpl = (c.hotel5Tpl !== undefined && c.hotel5Tpl !== null) ? Number(c.hotel5Tpl) : tplRate5;
            if (c.isSplit) {
                const c3 = (totalRoomsCount * (c.hotel3Price || 0) + tplRoomsCount * h3Tpl) * (c.hotel3Nights || 0);
                const c4 = (totalRoomsCount * (c.hotel4Price || 0) + tplRoomsCount * h4Tpl) * (c.hotel4Nights || 0);
                const c5 = (totalRoomsCount * (c.hotel5Price || 0) + tplRoomsCount * h5Tpl) * (c.hotel5Nights || 0);
                return sum + c3 + c4 + c5;
            }
            let preferredPrice = c.hotel3Price || 0;
            let preferredTplRate = h3Tpl;
            if (c.mixPref === "4") {
                preferredPrice = c.hotel4Price || 0;
                preferredTplRate = h4Tpl;
            } else if (c.mixPref === "5") {
                preferredPrice = c.hotel5Price || 0;
                preferredTplRate = h5Tpl;
            }
            const roomPrice = (totalRoomsCount * preferredPrice) + (tplRoomsCount * preferredTplRate);
            return sum + (roomPrice * (c.numberOfNights || 0));
        }, 0) / numPeopleHotel;

        const totalMealCost3 = selectedCities.reduce((sum, c) => sum + (c.isSplit ? ((c.hotel3Meal||0) * c.hotel3Nights + (c.hotel4Meal||0) * c.hotel4Nights + (c.hotel5Meal||0) * c.hotel5Nights) : ((c.hotel3Meal || 0) * c.numberOfNights)), 0);
        const totalMealCost4 = selectedCities.reduce((sum, c) => sum + (c.isSplit ? ((c.hotel3Meal||0) * c.hotel3Nights + (c.hotel4Meal||0) * c.hotel4Nights + (c.hotel5Meal||0) * c.hotel5Nights) : ((c.hotel4Meal || 0) * c.numberOfNights)), 0);
        const totalMealCost5 = selectedCities.reduce((sum, c) => sum + (c.isSplit ? ((c.hotel3Meal||0) * c.hotel3Nights + (c.hotel4Meal||0) * c.hotel4Nights + (c.hotel5Meal||0) * c.hotel5Nights) : ((c.hotel5Meal || 0) * c.numberOfNights)), 0);
        const totalMealCostMix = selectedCities.reduce((sum, c) => {
            if (c.isSplit) return sum + ((c.hotel3Meal||0) * c.hotel3Nights + (c.hotel4Meal||0) * c.hotel4Nights + (c.hotel5Meal||0) * c.hotel5Nights);
            let preferredMealPrice = c.hotel3Meal || 0;
            if (c.mixPref === "4") preferredMealPrice = c.hotel4Meal || 0;
            if (c.mixPref === "5") preferredMealPrice = c.hotel5Meal || 0;
            return sum + (preferredMealPrice * c.numberOfNights);
        }, 0);

        let mixTitleParts = [];
        selectedCities.forEach(c => {
            if (c.isSplit) {
                if (c.hotel5Nights > 0) mixTitleParts.push(`5* ${c.name}`);
                if (c.hotel4Nights > 0) mixTitleParts.push(`4* ${c.name}`);
                if (c.hotel3Nights > 0) mixTitleParts.push(`3* ${c.name}`);
            } else {
                mixTitleParts.push(`${c.mixPref}* ${c.name}`);
            }
        });
        const mixTitle = mixTitleParts.length > 0 ? mixTitleParts.join(' + ') : "Mixed Package";
        if (document.getElementById('mix_package_title')) {
            document.getElementById('mix_package_title').innerText = mixTitle;
        }

        const renderPackage = (suffix, hotelCost, totalMealCost) => {
            const getMarkup = (category, subtotal) => {
                let pctInput = document.getElementById(`markup_pct_${category}_${suffix}`);
                let thbInput = document.getElementById(`markup_thb_${category}_${suffix}`);
                if (!pctInput || !thbInput) return 0;
                thbInput.dataset.subtotal = subtotal;
                pctInput.dataset.subtotal = subtotal;
                let markupAmount;

                // 1. If card input has individual manual edit
                if (pctInput.dataset.manual === 'true' || thbInput.dataset.manual === 'true') {
                    let mPct = parseFloat(pctInput.value) / 100 || 0;
                    markupAmount = subtotal * mPct;
                    if (document.activeElement !== thbInput) {
                        thbInput.value = markupAmount.toFixed(2);
                    }
                }
                // 2. Else check if global manual THB override is provided for this category
                else if (category === 'adult' && manualMarkupAdult !== null && manualMarkupAdult > 0) {
                    markupAmount = manualMarkupAdult;
                    let mPct = subtotal > 0 ? (manualMarkupAdult / subtotal) * 100 : 0;
                    if (document.activeElement !== pctInput && document.activeElement !== thbInput) {
                        pctInput.value = mPct.toFixed(2);
                        thbInput.value = manualMarkupAdult.toFixed(2);
                    }
                }
                else if (category === 'child_extra' && manualMarkupChildExtraBed !== null && manualMarkupChildExtraBed > 0) {
                    markupAmount = manualMarkupChildExtraBed;
                    let mPct = subtotal > 0 ? (manualMarkupChildExtraBed / subtotal) * 100 : 0;
                    if (document.activeElement !== pctInput && document.activeElement !== thbInput) {
                        pctInput.value = mPct.toFixed(2);
                        thbInput.value = manualMarkupChildExtraBed.toFixed(2);
                    }
                }
                else if (category === 'child_sharing' && manualMarkupChildSharing !== null && manualMarkupChildSharing > 0) {
                    markupAmount = manualMarkupChildSharing;
                    let mPct = subtotal > 0 ? (manualMarkupChildSharing / subtotal) * 100 : 0;
                    if (document.activeElement !== pctInput && document.activeElement !== thbInput) {
                        pctInput.value = mPct.toFixed(2);
                        thbInput.value = manualMarkupChildSharing.toFixed(2);
                    }
                }
                // 3. Otherwise use default global percentage markup
                else {
                    markupAmount = subtotal * markupPercent;
                    if (document.activeElement !== pctInput && document.activeElement !== thbInput) {
                        pctInput.value = (markupPercent * 100).toFixed(2);
                        thbInput.value = markupAmount.toFixed(2);
                    }
                }
                return markupAmount;
            };

            const subtotalAdult = selectedTourCost + perPersonTransferCost + hotelCost + addonCostPerAdult;
            let markupAmountAdult = getMarkup('adult', subtotalAdult);
            const totalThbAdult = subtotalAdult + markupAmountAdult;

            const subtotalChildExtraBed = selectedTourCost + hotelCost;
            let markupAmountChildExtraBed = getMarkup('child_extra', subtotalChildExtraBed);
            const totalThbChildExtraBed = subtotalChildExtraBed + markupAmountChildExtraBed;

            const subtotalChildSharing = selectedTourCost + totalMealCost;
            let markupAmountChildSharing = getMarkup('child_sharing', subtotalChildSharing);
            const totalThbChildSharing = subtotalChildSharing + markupAmountChildSharing;

            document.getElementById(`adult_thb_${suffix}`).innerText = formatCurrency(totalThbAdult, 'THB');
            let usdAdult = totalThbAdult / usdDivisor;
            if (document.getElementById(`adult_usd_${suffix}`)) document.getElementById(`adult_usd_${suffix}`).innerText = formatCurrency(usdAdult, 'USD');
            let lkrAdult = totalThbAdult * lkrRate;
            document.getElementById(`adult_lkr_${suffix}`).innerText = formatCurrency(lkrAdult, 'LKR');

            // Adult Final LKR (with custom override support)
            let finalLkrAdult = Math.ceil(lkrAdult / 100) * 100 + 1000;
            const adultOverride = customFinalPriceOverrides[suffix]?.adult;
            if (adultOverride !== undefined && adultOverride > 0) {
                finalLkrAdult = adultOverride;
            }
            const adultFinalEl = document.getElementById(`adult_final_lkr_${suffix}`);
            if (adultFinalEl) {
                adultFinalEl.innerHTML = formatCurrency(finalLkrAdult, 'LKR') + 
                    (adultOverride ? ' <span style="font-size:11px;color:#d97706;" title="Custom adjusted price">✏️</span>' : '');
                adultFinalEl.style.cursor = 'pointer';
                adultFinalEl.title = 'Click to adjust / override Final LKR price';
                adultFinalEl.onclick = () => editFinalPrice(suffix, 'adult');
            }

            document.getElementById(`child_extra_thb_${suffix}`).innerText = formatCurrency(totalThbChildExtraBed, 'THB');
            let usdChildExtra = totalThbChildExtraBed / usdDivisor;
            if (document.getElementById(`child_extra_usd_${suffix}`)) document.getElementById(`child_extra_usd_${suffix}`).innerText = formatCurrency(usdChildExtra, 'USD');
            let lkrChildExtra = totalThbChildExtraBed * lkrRate;
            document.getElementById(`child_extra_lkr_${suffix}`).innerText = formatCurrency(lkrChildExtra, 'LKR');

            // Child Extra Bed Final LKR (with custom override support)
            let finalLkrChildExtra = Math.ceil(lkrChildExtra / 100) * 100 + 1000;
            const childExtraOverride = customFinalPriceOverrides[suffix]?.child_extra;
            if (childExtraOverride !== undefined && childExtraOverride > 0) {
                finalLkrChildExtra = childExtraOverride;
            }
            const childExtraFinalEl = document.getElementById(`child_final_lkr_${suffix}`);
            if (childExtraFinalEl) {
                childExtraFinalEl.innerHTML = formatCurrency(finalLkrChildExtra, 'LKR') +
                    (childExtraOverride ? ' <span style="font-size:11px;color:#d97706;" title="Custom adjusted price">✏️</span>' : '');
                childExtraFinalEl.style.cursor = 'pointer';
                childExtraFinalEl.title = 'Click to adjust / override Final LKR price';
                childExtraFinalEl.onclick = () => editFinalPrice(suffix, 'child_extra');
            }

            document.getElementById(`child_sharing_thb_${suffix}`).innerText = formatCurrency(totalThbChildSharing, 'THB');
            let usdChildSharing = totalThbChildSharing / usdDivisor;
            if (document.getElementById(`child_sharing_usd_${suffix}`)) document.getElementById(`child_sharing_usd_${suffix}`).innerText = formatCurrency(usdChildSharing, 'USD');
            let lkrChildSharing = totalThbChildSharing * lkrRate;
            document.getElementById(`child_sharing_lkr_${suffix}`).innerText = formatCurrency(lkrChildSharing, 'LKR');

            // Child Sharing Final LKR (with custom override support)
            let finalLkrChildSharing = Math.ceil(lkrChildSharing / 100) * 100 + 1000;
            const childSharingOverride = customFinalPriceOverrides[suffix]?.child_sharing;
            if (childSharingOverride !== undefined && childSharingOverride > 0) {
                finalLkrChildSharing = childSharingOverride;
            }
            const childSharingFinalEl = document.getElementById(`child_sharing_final_lkr_${suffix}`);
            if (childSharingFinalEl) {
                childSharingFinalEl.innerHTML = formatCurrency(finalLkrChildSharing, 'LKR') +
                    (childSharingOverride ? ' <span style="font-size:11px;color:#d97706;" title="Custom adjusted price">✏️</span>' : '');
                childSharingFinalEl.style.cursor = 'pointer';
                childSharingFinalEl.title = 'Click to adjust / override Final LKR price';
                childSharingFinalEl.onclick = () => editFinalPrice(suffix, 'child_sharing');
            }
        };

        // 4. Calculate all four
        renderPackage('3star', hotelCost3, totalMealCost3);
        renderPackage('4star', hotelCost4, totalMealCost4);
        renderPackage('5star', hotelCost5, totalMealCost5);
        renderPackage('mix', hotelCostMix, totalMealCostMix);

        // Update TPL badges in result cards
        const updateTplCardBadge = (id, text) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (isTplActive) {
                el.innerHTML = text;
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        };
        const effTplRate3 = (parseFloat(document.getElementById('tpl_rate_3star')?.value) || 800);
        const effTplRate4 = (parseFloat(document.getElementById('tpl_rate_4star')?.value) || 1000);
        const effTplRate5 = (parseFloat(document.getElementById('tpl_rate_5star')?.value) || 1200);
        updateTplCardBadge('tpl_badge_card_3star', `🛏️ Triple (TPL) Supplement: <strong>+${effTplRate3} THB/nt</strong> included`);
        updateTplCardBadge('tpl_badge_card_4star', `🛏️ Triple (TPL) Supplement: <strong>+${effTplRate4} THB/nt</strong> included`);
        updateTplCardBadge('tpl_badge_card_5star', `🛏️ Triple (TPL) Supplement: <strong>+${effTplRate5} THB/nt</strong> included`);
        updateTplCardBadge('tpl_badge_card_mix', `🛏️ Triple (TPL) Supplement: <strong>Dynamic (4*: +${effTplRate4} / 3*: +${effTplRate3} THB/nt)</strong> included`);

        // 5. Check which packages are fully valid to display
        const isValid3 = selectedCities.length > 0 && selectedCities.every(c => c.hotel3Name);
        const isValid4 = selectedCities.length > 0 && selectedCities.every(c => c.hotel4Name);
        const isValid5 = selectedCities.length > 0 && selectedCities.every(c => c.hotel5Name);
        const isActuallyMix = selectedCities.some(c => c.isSplit) || (
            selectedCities.length > 1 && 
            new Set(selectedCities.map(c => c.mixPref).filter(p => p && p !== 'none')).size > 1
        );
        const hasNoneMixPref = selectedCities.some(c => !c.isSplit && c.mixPref === "none");
        const isValidMix = isActuallyMix && !hasNoneMixPref && selectedCities.every(c => {
            if (c.isSplit) return true;
            if (c.mixPref === "3") return !!c.hotel3Name;
            if (c.mixPref === "4") return !!c.hotel4Name;
            if (c.mixPref === "5") return !!c.hotel5Name;
            return false;
        });

        document.getElementById('result_card_3star').style.display = isValid3 ? 'block' : 'none';
        document.getElementById('result_card_4star').style.display = isValid4 ? 'block' : 'none';
        document.getElementById('result_card_5star').style.display = isValid5 ? 'block' : 'none';
        document.getElementById('result_card_mix').style.display = isValidMix ? 'block' : 'none';

        // 6. Display results section
        document.getElementById('results').style.display = 'block';
        if (typeof saveLatestCostingPrices === 'function') {
            saveLatestCostingPrices();
        }
    }

    // Initial render on page load
