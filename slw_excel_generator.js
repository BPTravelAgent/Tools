/**
 * SLW Dynamic Tour Costing Excel Generator (.xlsx)
 * Replicates the exact styling, formulas, structure, and quotation cards of "Sample For exel.xlsx".
 * Fully supports Itinerary Builder days/descriptions, real per-night hotel rates, and dynamic Mix Package handling.
 * Compatible with Browser (ExcelJS via CDN / window.ExcelJS) and Node.js.
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['exceljs'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('exceljs'));
    } else {
        root.SlwExcelGenerator = factory(root.ExcelJS);
    }
}(typeof self !== 'undefined' ? self : this, function (ExcelJS) {
    'use strict';

    if (!ExcelJS) {
        console.error('[SlwExcelGenerator] ExcelJS library not found! Please load exceljs.min.js.');
    }

    // Color Constants (ARGB format for ExcelJS)
    const COLORS = {
        TITLE_GREEN: 'FF92D050',      // Bold Header Green #92D050
        DAY_PALE_GREEN: 'FFC5E0B3',   // Day / Meal Headers #C5E0B3
        HEADER_GREEN: 'FF92D050',     // Tour, Transfer, 3* Hotel Header #92D050
        HEADER_MAUVE: 'FFD5A6BD',     // 4* Hotel & Mix Option Headers #D5A6BD
        TOUR_END_GREEN: 'FF00B050',   // Tour End! Banner #00B050
        HIGHLIGHT_YELLOW: 'FFFFFF00', // Transfer Pax & LKR Calculation #FFFF00
        MARKUP_ORANGE: 'FFFFC000',    // Markup % & Option 1 Price Card #FFC000
        DIFF_CREAM: 'FFFFF2CC',       // Different / Margin #FFFFF2CC
        THB_GREEN: 'FF92D050',        // THB Currency Label #92D050
        ROUNDED_LIGHT_GREEN: 'FFD9EAD3', // Buffer +1000 Cell #D9EAD3
        CARD_YELLOW: 'FFFFE599',      // Option 2 & Option 3 Price Cards #FFE599
        CHILD_EXTRA_CARD: 'FFB6D7A8', // Child Extra Bed Card #B6D7A8
        CHILD_SHARE_CARD: 'FFD9EAD3', // Child Sharing Bed Card #D9EAD3
        WHITE: 'FFFFFFFF',
        BORDER_GRAY: 'FFD9D9D9'
    };

    const BORDER_THIN = {
        top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
        left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
        bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
        right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } }
    };

    const BORDER_HAIR = {
        top: { style: 'hair', color: { argb: 'FF000000' } },
        left: { style: 'hair', color: { argb: 'FF000000' } },
        bottom: { style: 'hair', color: { argb: 'FF000000' } },
        right: { style: 'hair', color: { argb: 'FF000000' } }
    };

    const FONT_INC_BLUE = {
        name: 'Arial',
        size: 10,
        bold: true,
        color: { argb: 'FF4285F4' }
    };

    const FONT_INC_BLACK = {
        name: 'Arial',
        size: 10
    };

    /**
     * Remove HTML tags and entities, return clean plain text
     */
    function stripHtml(input) {
        if (!input) return '';
        let str = String(input);
        // HTML entities decoding
        str = str.replace(/&nbsp;/gi, ' ')
                 .replace(/&amp;/gi, '&')
                 .replace(/&quot;/gi, '"')
                 .replace(/&#39;/gi, "'")
                 .replace(/&lt;/gi, '<')
                 .replace(/&gt;/gi, '>')
                 .replace(/&[a-z0-9#]+;/gi, ' ');
        // Strip tags
        str = str.replace(/<\/?[a-z0-9]+(?:\s+[^>]*?)?>/gi, '');
        // Collapse spaces
        return str.replace(/[ \t\r\n]+/g, ' ').trim();
    }

    /**
     * Helper to clean string for comparison
     */
    function normalizeText(txt) {
        return stripHtml(txt).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * Smart matcher for tours from itinerary activity text
     */
    function matchAndConsumeTour(actText, tourList) {
        if (!actText || !tourList || tourList.length === 0) return null;
        const norm = normalizeText(actText);
        if (!norm) return null;
        
        // 1. Direct or substring match
        for (let i = 0; i < tourList.length; i++) {
            const t = tourList[i];
            const tNorm = normalizeText(t.name);
            if (!tNorm) continue;
            if (norm.includes(tNorm) || tNorm.includes(norm)) {
                return tourList.splice(i, 1)[0];
            }
        }

        // 2. High-confidence specific landmarks/keywords
        const landmarkSignatures = [
            { keywords: ['chao', 'phraya'], target: ['chao', 'phraya'] },
            { keywords: ['safari', 'world'], target: ['safari'] },
            { keywords: ['dream', 'world'], target: ['dream', 'world'] },
            { keywords: ['coral', 'island'], target: ['coral', 'island'] },
            { keywords: ['nong', 'nooch'], target: ['nong', 'nooch'] },
            { keywords: ['city', 'tour'], target: ['city', 'tour'] },
            { keywords: ['alcazar'], target: ['alcazar'] },
            { keywords: ['colosseum'], target: ['colosseum'] },
            { keywords: ['floating', 'market'], target: ['floating', 'market'] },
            { keywords: ['ayutthaya'], target: ['ayutthaya'] },
            { keywords: ['kanchanaburi'], target: ['kanchanaburi'] },
            { keywords: ['sea', 'life'], target: ['sea', 'life'] },
            { keywords: ['madame', 'tussauds'], target: ['madame', 'tussauds'] },
            { keywords: ['simon', 'cabaret'], target: ['simon', 'cabaret'] },
            { keywords: ['phi', 'phi'], target: ['phi', 'phi'] },
            { keywords: ['james', 'bond'], target: ['james', 'bond'] }
        ];

        for (const sig of landmarkSignatures) {
            const actMatches = sig.keywords.every(k => norm.includes(k));
            if (actMatches) {
                const tourIdx = tourList.findIndex(t => {
                    const tn = normalizeText(t.name);
                    return sig.target.every(k => tn.includes(k));
                });
                if (tourIdx !== -1) {
                    return tourList.splice(tourIdx, 1)[0];
                }
            }
        }

        // 3. Keyword overlap match (scored)
        let bestIdx = -1;
        let maxScore = 0;
        const stopWords = ['tour', 'with', 'lunch', 'dinner', 'pvt', 'join', 'basis', 'full', 'day', 'half', 'speedboat', 'ticket', 'entry', 'transfer', 'the', 'and', 'for'];
        
        for (let i = 0; i < tourList.length; i++) {
            const t = tourList[i];
            const tNorm = normalizeText(t.name);
            const tKeywords = tNorm.split(' ').filter(w => w.length >= 4 && !stopWords.includes(w));
            if (tKeywords.length === 0) continue;
            
            const matchCount = tKeywords.filter(w => norm.includes(w)).length;
            const score = matchCount / tKeywords.length;
            if (score >= 0.5 && matchCount >= 2 && score > maxScore) {
                maxScore = score;
                bestIdx = i;
            }
        }

        if (bestIdx !== -1) {
            return tourList.splice(bestIdx, 1)[0];
        }

        return null;
    }

    /**
     * Smart matcher for transfers from itinerary activity text
     */
    function matchAndConsumeTransfer(actText, transferList) {
        if (!actText || !transferList || transferList.length === 0) return null;
        const norm = normalizeText(actText);
        if (!norm) return null;

        // 1. Direct or substring match
        for (let i = 0; i < transferList.length; i++) {
            const tr = transferList[i];
            const trNorm = normalizeText(tr.name);
            if (!trNorm) continue;
            if (norm.includes(trNorm) || trNorm.includes(norm)) {
                return transferList.splice(i, 1)[0];
            }
        }

        // 2. Semantic keywords: arrival
        const isArrival = norm.includes('arrival') || (norm.includes('airport') && (norm.includes('transfer to hotel') || norm.includes('to hotel')) && !norm.includes('departure') && !norm.includes('check out'));
        if (isArrival) {
            const arrIdx = transferList.findIndex(t => {
                const tn = normalizeText(t.name);
                return tn.includes('arrival') || tn.includes('airport to') || (!tn.includes('departure') && tn.includes('airport'));
            });
            if (arrIdx !== -1) return transferList.splice(arrIdx, 1)[0];
        }

        // 3. Semantic keywords: departure
        const isDeparture = norm.includes('departure') || norm.includes('check out and transfer') || (norm.includes('hotel to airport') || norm.includes('to airport'));
        if (isDeparture) {
            const depIdx = transferList.findIndex(t => {
                const tn = normalizeText(t.name);
                return tn.includes('departure') || tn.includes('to airport') || (!tn.includes('arrival') && tn.includes('airport'));
            });
            if (depIdx !== -1) return transferList.splice(depIdx, 1)[0];
        }

        // 4. Semantic keywords: intercity
        const isIntercity = (norm.includes('hotel to') && norm.includes('hotel')) || (norm.includes('transfer') && (norm.includes('pattaya to bangkok') || norm.includes('bangkok to pattaya') || norm.includes('phuket to krabi')));
        if (isIntercity) {
            const interIdx = transferList.findIndex(t => {
                const tn = normalizeText(t.name);
                return tn.includes('hotel to') || tn.includes('pvt transfer') || (!tn.includes('arrival') && !tn.includes('departure'));
            });
            if (interIdx !== -1) return transferList.splice(interIdx, 1)[0];
        }

        return null;
    }

    /**
     * Generate Excel Workbook
     * @param {Object} payload 
     * @returns {Promise<ExcelJS.Workbook>}
     */
    async function createCostingWorkbook(payload) {
        const LibExcel = (typeof ExcelJS !== 'undefined' && ExcelJS) || (typeof window !== 'undefined' && window.ExcelJS) || (typeof globalThis !== 'undefined' && globalThis.ExcelJS);
        if (!LibExcel) {
            throw new Error('ExcelJS is not available in the current context.');
        }

        const wb = new LibExcel.Workbook();
        wb.creator = 'Sun Leisure World - Tour Costing System';
        wb.lastModifiedBy = 'Sun Leisure World';
        wb.created = new Date();
        wb.modified = new Date();

        // 1. Parse & Normalize Inputs
        const rawPax = Number(payload.pax) || 2;
        const paxStr = String(rawPax).padStart(2, '0') + 'Pax';
        const inqRef = (payload.inq || 'INQ -' + Math.floor(10000 + Math.random() * 90000)).trim();
        const tourTitle = (payload.title || 'Tour Quotation').trim();
        const dateStr = payload.monthDate || (new Date().toLocaleString('en-US', { month: 'short' }) + '-' + new Date().getFullYear());
        const roe = Number(payload.roe) || 10.8;
        const markup3 = Number(payload.markup3) || 18;
        const markupMix = Number(payload.markupMix) || 20;
        const markup4 = Number(payload.markup4) || 25;
        const buffer = (!isNaN(Number(payload.buffer)) && payload.buffer !== null && payload.buffer !== undefined) ? Number(payload.buffer) : 1000;

        // Cities, Tours, Transfers & Days
        const cities = payload.cities || [];
        const tours = [...(payload.tours || [])];
        const transfers = [...(payload.transfers || [])];
        const days = Array.isArray(payload.days) && payload.days.length > 0 ? payload.days : null;

        // 2. Determine Mix Package Presence
        let hasMix = false;
        if (typeof payload.hasMix === 'boolean') {
            hasMix = payload.hasMix;
        } else if (payload.options && Array.isArray(payload.options) && payload.options.length > 0) {
            // Primary source of truth: does the itinerary offer a mix hotel option?
            hasMix = payload.options.some(opt => 
                opt.hotels && opt.hotels.some(h => {
                    const r = (h.rating || '').toLowerCase();
                    const n = Array.isArray(h.names) ? h.names.join(' ').toLowerCase() : String(h.names || '').toLowerCase();
                    return r.includes('mix') || n.includes('mix hotel');
                })
            );
        } else {
            // Secondary fallback: only if valid pMix rate AND actual split stay or multi-city mix
            const pMixVal = payload.rates?.pMix;
            const hasValidMixPrice = pMixVal && String(pMixVal).replace(/[^0-9]/g, '') !== '' && String(pMixVal).replace(/[^0-9]/g, '') !== '0';
            const isSplitStay = cities.some(c => c.isSplit);
            const uniquePrefs = new Set(cities.map(c => c.mixPref).filter(p => p && p !== 'none'));
            const isMultiCityMix = cities.length > 1 && uniquePrefs.size > 1;
            hasMix = Boolean(hasValidMixPrice && (isSplitStay || isMultiCityMix));
        }

        // 2b. Determine Child Pricing Presence
        const hasChildPrices = Boolean(
            payload.hasChildPrices ||
            payload.includeChildPrices ||
            (payload.rates && (payload.rates.childExtra3 || payload.rates.childShare3 || payload.rates.childExtra4 || payload.rates.childShare4 || payload.rates.childExtra || payload.rates.childShare)) ||
            (Array.isArray(payload.options) && payload.options.some(opt => 
                Array.isArray(opt.hotels) && opt.hotels.some(h => 
                    Array.isArray(h.prices) && h.prices.some(p => {
                        const l = (p.label || '').toLowerCase();
                        const a = String(p.amount || '');
                        return (l.includes('child') || l.includes('extra bed') || l.includes('sharing')) && a && a !== 'LKR 0' && a !== '0';
                    })
                )
            )) ||
            (payload.childPrices && Object.keys(payload.childPrices).length > 0)
        );

        let childExtraLabel = (payload.childExtraLabel || 'Per Child (With Extra Bed)').trim();
        let childShareLabel = (payload.childShareLabel || 'Per Child (Sharing Bed)').trim();

        if (Array.isArray(payload.options)) {
            payload.options.forEach(opt => {
                (opt.hotels || []).forEach(h => {
                    (h.prices || []).forEach(p => {
                        const l = (p.label || '').trim();
                        const lNorm = l.toLowerCase();
                        if (lNorm.includes('extra bed') && l.length > 5) childExtraLabel = l;
                        if (lNorm.includes('sharing') && l.length > 5) childShareLabel = l;
                    });
                });
            });
        }

        // Calculate Child Meals per option from cities
        let totalMealCost3 = 0;
        let totalMealCostMix = 0;
        let totalMealCost4 = 0;
        cities.forEach(c => {
            const n = Number(c.numberOfNights) || 1;
            const m3 = Number(c.hotel3Meal) || 350;
            const m4 = Number(c.hotel4Meal) || 450;
            const m5 = Number(c.hotel5Meal) || 650;
            if (c.isSplit) {
                const n3 = Number(c.hotel3Nights) || 0;
                const n4 = Number(c.hotel4Nights) || 0;
                const n5 = Number(c.hotel5Nights) || 0;
                totalMealCost3 += (m3 * n3 + m4 * n4 + m5 * n5);
                totalMealCost4 += (m4 * (n3 + n4 + n5));
                totalMealCostMix += (m3 * n3 + m4 * n4 + m5 * n5);
            } else {
                totalMealCost3 += (m3 * n);
                totalMealCost4 += (m4 * n);
                let mMix = m3;
                if (c.mixPref === '4') mMix = m4;
                else if (c.mixPref === '5') mMix = m5;
                totalMealCostMix += (mMix * n);
            }
        });
        if (totalMealCost3 === 0 && hasChildPrices) totalMealCost3 = 1750;
        if (totalMealCostMix === 0 && hasChildPrices) totalMealCostMix = 1950;
        if (totalMealCost4 === 0 && hasChildPrices) totalMealCost4 = 2250;

        // 3. Define Hotel Column Configuration
        // Col H is 3* Hotel.
        // If hasMix: Col I is Mix Hotel, Col J is 4* Hotel.
        // If !hasMix: Col I is 4* Hotel, Col J is omitted.
        const hotelCols = [];
        hotelCols.push({
            col: 8,
            letter: 'H',
            key: 'h3',
            title: '    3* Hotel ',
            headerColor: COLORS.HEADER_GREEN,
            markup: markup3,
            priceKey: 'p3',
            cardLabel: '3* Hotel Options',
            cardColor: COLORS.MARKUP_ORANGE,
            childMealCol: hasMix ? 11 : 10,
            childMealLetter: hasMix ? 'K' : 'J',
            childMealTitle: 'Child 3* meals',
            childMealColor: COLORS.HEADER_GREEN,
            extraCol: hasMix ? 14 : 13,
            extraLetter: hasMix ? 'N' : 'M',
            extraColor: COLORS.TOUR_END_GREEN,
            shareCol: hasMix ? 20 : 18,
            shareLetter: hasMix ? 'T' : 'R',
            shareColor: COLORS.TOUR_END_GREEN
        });

        if (hasMix) {
            hotelCols.push({
                col: 9,
                letter: 'I',
                key: 'hMix',
                title: '   Mix Hotel ',
                headerColor: COLORS.HEADER_MAUVE,
                markup: markupMix,
                priceKey: 'pMix',
                cardLabel: 'Mix Hotel Options',
                cardColor: COLORS.CARD_YELLOW,
                childMealCol: 12,
                childMealLetter: 'L',
                childMealTitle: 'Child 4* meals',
                childMealColor: COLORS.HEADER_MAUVE,
                extraCol: 15,
                extraLetter: 'O',
                extraColor: COLORS.HEADER_MAUVE,
                shareCol: 21,
                shareLetter: 'U',
                shareColor: COLORS.HEADER_MAUVE
            });
            hotelCols.push({
                col: 10,
                letter: 'J',
                key: 'h4',
                title: '    4* Hotel ',
                headerColor: COLORS.HEADER_MAUVE,
                markup: markup4,
                priceKey: 'p4',
                cardLabel: '4* Hotel Options',
                cardColor: COLORS.CARD_YELLOW,
                childMealCol: 13,
                childMealLetter: 'M',
                childMealTitle: 'Child 4* meals',
                childMealColor: COLORS.HEADER_MAUVE,
                extraCol: 16,
                extraLetter: 'P',
                extraColor: COLORS.HEADER_MAUVE,
                shareCol: 22,
                shareLetter: 'V',
                shareColor: COLORS.HEADER_MAUVE
            });
        } else {
            hotelCols.push({
                col: 9,
                letter: 'I',
                key: 'h4',
                title: '    4* Hotel ',
                headerColor: COLORS.HEADER_MAUVE,
                markup: markup4,
                priceKey: 'p4',
                cardLabel: '4* Hotel Options',
                cardColor: COLORS.CARD_YELLOW,
                childMealCol: 11,
                childMealLetter: 'K',
                childMealTitle: 'Child 4* meals',
                childMealColor: COLORS.HEADER_MAUVE,
                extraCol: 14,
                extraLetter: 'N',
                extraColor: COLORS.HEADER_MAUVE,
                shareCol: 19,
                shareLetter: 'S',
                shareColor: COLORS.HEADER_MAUVE
            });
        }

        // Sheet Setup
        const sheetTitle = (tourTitle.length > 28 ? tourTitle.substring(0, 28) : tourTitle) || 'Tour Costing';
        const ws = wb.addWorksheet(sheetTitle, {
            views: [{ showGridLines: true }]
        });

        // Set Standard Column Widths
        ws.getColumn(1).width = 22;   // A
        ws.getColumn(2).width = 16;   // B
        ws.getColumn(3).width = 106.5;// C (Activity descriptions)
        ws.getColumn(4).width = 12;   // D (Meal)
        ws.getColumn(5).width = 8;    // E
        ws.getColumn(6).width = 12;   // F (Tour)
        ws.getColumn(7).width = 12;   // G (Transfer)
        ws.getColumn(8).width = 14;   // H (3* Hotel)
        ws.getColumn(9).width = 14;   // I (Mix or 4* Hotel)
        if (hasChildPrices) {
            if (hasMix) {
                ws.getColumn(10).width = 14;   // J (4* Hotel)
                ws.getColumn(11).width = 14;   // K (Child 3* meals)
                ws.getColumn(12).width = 16.5; // L (Child Mix / 4* meals / Extra Bed marker)
                ws.getColumn(13).width = 14;   // M (Child 4* meals / Extra Bed Diff)
                ws.getColumn(14).width = 12;   // N (Extra Bed 3*)
                ws.getColumn(15).width = 12;   // O (Extra Bed Mix)
                ws.getColumn(16).width = 12;   // P (Extra Bed 4*)
                ws.getColumn(17).width = 8;    // Q (Spacer)
                ws.getColumn(18).width = 14;   // R (Sharing Bed marker)
                ws.getColumn(19).width = 10;   // S (Sharing Bed Diff)
                ws.getColumn(20).width = 12;   // T (Sharing Bed 3*)
                ws.getColumn(21).width = 12;   // U (Sharing Bed Mix)
                ws.getColumn(22).width = 12;   // V (Sharing Bed 4*)
                ws.getColumn(23).width = 8;
            } else {
                ws.getColumn(10).width = 14;   // J (Child 3* meals)
                ws.getColumn(11).width = 14;   // K (Child 4* meals / Extra Bed marker)
                ws.getColumn(12).width = 12;   // L (Extra Bed Diff)
                ws.getColumn(13).width = 12;   // M (Extra Bed 3*)
                ws.getColumn(14).width = 12;   // N (Extra Bed 4*)
                ws.getColumn(15).width = 8;    // O (Spacer)
                ws.getColumn(16).width = 14;   // P (Sharing Bed marker)
                ws.getColumn(17).width = 10;   // Q (Sharing Bed Diff)
                ws.getColumn(18).width = 12;   // R (Sharing Bed 3*)
                ws.getColumn(19).width = 12;   // S (Sharing Bed 4*)
                ws.getColumn(20).width = 8;
            }
        } else {
            if (hasMix) {
                ws.getColumn(10).width = 14;  // J (4* Hotel)
                ws.getColumn(11).width = 10;
                ws.getColumn(12).width = 12;
            } else {
                ws.getColumn(10).width = 10;
                ws.getColumn(11).width = 12;
            }
        }

        // ── ROW 2: Tour Name Header ──
        const r2 = ws.getRow(2);
        const cellC2 = r2.getCell(3);
        cellC2.value = tourTitle;
        cellC2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
        cellC2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_GREEN } };

        // ── ROW 3: Pax & Inquiry Ref ──
        const r3 = ws.getRow(3);
        const cellC3 = r3.getCell(3);
        cellC3.value = `${paxStr}  ${dateStr}`;
        cellC3.font = { name: 'Calibri', size: 11, bold: false };

        const cellD3 = r3.getCell(4);
        cellD3.value = inqRef;
        cellD3.font = { name: 'Calibri', size: 11, bold: true };

        // Night & City Mapping
        const totalNights = cities.reduce((sum, c) => sum + (Number(c.numberOfNights) || 1), 0);
        function getCityForNight(nightIdx) {
            let accumulated = 0;
            for (let c of cities) {
                const n = Number(c.numberOfNights) || 1;
                if (nightIdx < accumulated + n) {
                    return c;
                }
                accumulated += n;
            }
            return cities[cities.length - 1] || { name: 'City', hotel3Price: 1400, hotel4Price: 1800 };
        }

        let currentRow = 4;
        const remainingTours = [...tours];
        const remainingTransfers = [...transfers];

        // ── DAY-BY-DAY GENERATION ──
        if (days && days.length > 0) {
            // ── MODE A: From Itinerary Builder Finalized Days ──
            const totalDaysCount = days.length;
            const effectiveNights = totalNights > 0 ? totalNights : Math.max(0, totalDaysCount - 1);

            days.forEach((dayObj, dayIdx) => {
                const dayNum = dayIdx + 1;
                const isFirstDay = (dayIdx === 0);
                const isLastDay = (dayIdx === totalDaysCount - 1);
                const cleanDayTitle = stripHtml(dayObj.title);
                const dayStr = cleanDayTitle ? (cleanDayTitle.endsWith('-') ? cleanDayTitle : (cleanDayTitle + '-')) : `Day-${String(dayNum).padStart(2, '0')}-`;
                const dayMealCode = dayObj.meal || (isFirstDay ? '(--/--/--)' : (isLastDay ? '(B/--/--)' : '(B/L/--)'));

                // 1. Day Header Row
                const hdrRow = ws.getRow(currentRow);
                hdrRow.getCell(3).value = dayStr;
                hdrRow.getCell(3).font = { name: 'Calibri', size: 11 };
                hdrRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DAY_PALE_GREEN } };
                hdrRow.getCell(3).border = BORDER_THIN;

                hdrRow.getCell(4).value = 'Meal ';
                hdrRow.getCell(4).font = { name: 'Calibri', size: 11 };
                hdrRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DAY_PALE_GREEN } };
                hdrRow.getCell(4).alignment = { horizontal: 'center' };
                hdrRow.getCell(4).border = BORDER_THIN;

                hdrRow.getCell(6).value = '   Tour ';
                hdrRow.getCell(6).font = { name: 'Calibri', size: 11 };
                hdrRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_GREEN } };
                hdrRow.getCell(6).alignment = { horizontal: 'center' };
                hdrRow.getCell(6).border = BORDER_THIN;

                hdrRow.getCell(7).value = ' Transfer ';
                hdrRow.getCell(7).font = { name: 'Calibri', size: 11 };
                hdrRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_GREEN } };
                hdrRow.getCell(7).alignment = { horizontal: 'center' };
                hdrRow.getCell(7).border = BORDER_THIN;

                hotelCols.forEach(hCol => {
                    hdrRow.getCell(hCol.col).value = hCol.title;
                    hdrRow.getCell(hCol.col).font = { name: 'Calibri', size: 11 };
                    hdrRow.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.headerColor } };
                    hdrRow.getCell(hCol.col).alignment = { horizontal: 'center' };
                    hdrRow.getCell(hCol.col).border = BORDER_THIN;
                });

                if (isLastDay && hasChildPrices) {
                    hotelCols.forEach(hCol => {
                        hdrRow.getCell(hCol.childMealCol).value = hCol.childMealTitle;
                        hdrRow.getCell(hCol.childMealCol).font = { name: 'Calibri', size: 11 };
                        hdrRow.getCell(hCol.childMealCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.childMealColor } };
                        hdrRow.getCell(hCol.childMealCol).alignment = { horizontal: 'center' };
                        hdrRow.getCell(hCol.childMealCol).border = BORDER_THIN;
                    });
                }
                currentRow++;

                // 2. City & Hotel Rates for this Night (if stay day)
                const isStayNight = (dayIdx < effectiveNights);
                let h3Price = 0, h4Price = 0, hMixPrice = 0;
                if (isStayNight) {
                    const curCity = getCityForNight(dayIdx);
                    h3Price = Number(curCity.hotel3Price) || 1400;
                    h4Price = Number(curCity.hotel4Price) || (h3Price + 300);
                    hMixPrice = h4Price;
                    if (curCity.mixPref === '3') hMixPrice = h3Price;
                    else if (curCity.mixPref === '5') hMixPrice = Number(curCity.hotel5Price) || h4Price;
                }

                // 3. Render Activities for this Day
                const rawActs = Array.isArray(dayObj.activities) && dayObj.activities.length > 0 
                    ? dayObj.activities 
                    : [isFirstDay ? 'Arrival and Transfer to Hotel' : (isLastDay ? 'Check out and Departure Transfer' : 'Free For Leisure')];
                
                let mealPlaced = false;
                let hotelRatePlaced = false;

                rawActs.forEach((actText, actIdx) => {
                    const cleanAct = stripHtml(actText);
                    const row = ws.getRow(currentRow++);
                    row.getCell(3).value = cleanAct;
                    row.getCell(3).font = { name: 'Arial', size: 10 };
                    row.getCell(3).border = BORDER_THIN;

                    // Meal placement
                    const isMealRow = !mealPlaced && (actIdx === 0 || actText.toLowerCase().includes('breakfast') || actText.toLowerCase().includes('arrival'));
                    if (isMealRow) {
                        row.getCell(4).value = dayMealCode;
                        row.getCell(4).font = { name: 'Arial', size: 10 };
                        row.getCell(4).alignment = { horizontal: 'center' };
                        mealPlaced = true;
                    }
                    row.getCell(4).border = BORDER_THIN;

                    // Child meal amounts placement on the last day
                    if (isLastDay && hasChildPrices) {
                        const nightsCount = Math.max(1, (days ? days.length - 1 : cities.reduce((s, c) => s + (Number(c.numberOfNights) || 1), 0)));
                        if (actIdx === 0 || cleanAct.toLowerCase().includes('breakfast')) {
                            hotelCols.forEach(hCol => {
                                let formulaStr = '';
                                if (hCol.key === 'h3') formulaStr = `350*${nightsCount}`;
                                else if (hCol.key === 'hMix') formulaStr = `450*2`;
                                else if (hCol.key === 'h4') formulaStr = `450*${nightsCount}`;

                                row.getCell(hCol.childMealCol).value = { formula: formulaStr };
                                row.getCell(hCol.childMealCol).font = { name: 'Arial', size: 10 };
                                row.getCell(hCol.childMealCol).alignment = { horizontal: 'right' };
                                row.getCell(hCol.childMealCol).border = BORDER_THIN;
                            });
                        } else if (hasMix && (actIdx === 2 || cleanAct.toLowerCase().includes('transfer') || actIdx === rawActs.length - 1)) {
                            const mixColObj = hotelCols.find(h => h.key === 'hMix');
                            if (mixColObj) {
                                row.getCell(mixColObj.childMealCol).value = { formula: `350*${Math.max(1, nightsCount - 2)}` };
                                row.getCell(mixColObj.childMealCol).font = { name: 'Arial', size: 10 };
                                row.getCell(mixColObj.childMealCol).alignment = { horizontal: 'right' };
                                row.getCell(mixColObj.childMealCol).border = BORDER_THIN;
                            }
                        }
                    }

                    // Match Tours
                    const matchedTour = matchAndConsumeTour(actText, remainingTours);
                    if (matchedTour) {
                        row.getCell(6).value = Number(matchedTour.price) || 0;
                        row.getCell(6).font = { name: 'Arial', size: 10 };
                        row.getCell(6).alignment = { horizontal: 'right' };
                        row.getCell(3).font = { name: 'Arial', size: 10, bold: true };
                    }
                    row.getCell(6).border = BORDER_THIN;

                    // Match Transfers
                    const matchedTransfer = matchAndConsumeTransfer(actText, remainingTransfers);
                    if (matchedTransfer) {
                        row.getCell(7).value = Number(matchedTransfer.price) || 0;
                        row.getCell(7).font = { name: 'Arial', size: 10 };
                        row.getCell(7).alignment = { horizontal: 'right' };
                    }
                    row.getCell(7).border = BORDER_THIN;

                    // Place Hotel Rates on designated row for overnight stay
                    const shouldPlaceHotelRate = isStayNight && !hotelRatePlaced && (actIdx === 0 || actText.toLowerCase().includes('arrival') || actText.toLowerCase().includes('breakfast'));
                    if (shouldPlaceHotelRate) {
                        hotelCols.forEach(hCol => {
                            let pVal = h3Price;
                            if (hCol.key === 'hMix') pVal = hMixPrice;
                            else if (hCol.key === 'h4') pVal = h4Price;

                            row.getCell(hCol.col).value = pVal;
                            row.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                            row.getCell(hCol.col).alignment = { horizontal: 'right' };
                            row.getCell(hCol.col).border = BORDER_THIN;
                        });
                        hotelRatePlaced = true;
                    } else {
                        hotelCols.forEach(hCol => {
                            row.getCell(hCol.col).border = BORDER_THIN;
                        });
                    }
                });

                // Safety: if hotel rate was not placed on any activity of a stay day, put it on first activity row
                if (isStayNight && !hotelRatePlaced) {
                    const firstActRowIdx = currentRow - rawActs.length;
                    const fRow = ws.getRow(firstActRowIdx);
                    hotelCols.forEach(hCol => {
                        let pVal = h3Price;
                        if (hCol.key === 'hMix') pVal = hMixPrice;
                        else if (hCol.key === 'h4') pVal = h4Price;

                        fRow.getCell(hCol.col).value = pVal;
                        fRow.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                        fRow.getCell(hCol.col).alignment = { horizontal: 'right' };
                    });
                }

                // Safety transfer fallback for Day 1 (Arrival) and Last Day (Departure)
                if (isFirstDay && remainingTransfers.length > 0) {
                    let hasTrVal = false;
                    for (let aIdx = 0; aIdx < rawActs.length; aIdx++) {
                        if (ws.getRow(currentRow - rawActs.length + aIdx).getCell(7).value) {
                            hasTrVal = true;
                            break;
                        }
                    }
                    if (!hasTrVal) {
                        const arrIdx = remainingTransfers.findIndex(t => normalizeText(t.name).includes('arrival') || normalizeText(t.name).includes('airport'));
                        if (arrIdx !== -1) {
                            const arrTr = remainingTransfers.splice(arrIdx, 1)[0];
                            const targetRow = ws.getRow(currentRow - rawActs.length);
                            targetRow.getCell(7).value = Number(arrTr.price) || 0;
                            targetRow.getCell(7).font = { name: 'Arial', size: 10 };
                            targetRow.getCell(7).alignment = { horizontal: 'right' };
                        }
                    }
                }

                if (isLastDay && remainingTransfers.length > 0) {
                    let hasTrVal = false;
                    for (let aIdx = 0; aIdx < rawActs.length; aIdx++) {
                        if (ws.getRow(currentRow - rawActs.length + aIdx).getCell(7).value) {
                            hasTrVal = true;
                            break;
                        }
                    }
                    if (!hasTrVal) {
                        const depIdx = remainingTransfers.findIndex(t => normalizeText(t.name).includes('departure') || normalizeText(t.name).includes('airport'));
                        if (depIdx !== -1) {
                            const depTr = remainingTransfers.splice(depIdx, 1)[0];
                            const targetRow = ws.getRow(currentRow - 1);
                            targetRow.getCell(7).value = Number(depTr.price) || 0;
                            targetRow.getCell(7).font = { name: 'Arial', size: 10 };
                            targetRow.getCell(7).alignment = { horizontal: 'right' };
                        }
                    }
                }
            });

        } else {
            // ── MODE B: Fallback Synthetic Day Generation ──
            const totalDays = totalNights > 0 ? totalNights + 1 : Math.max(1, tours.length + 1);
            let currentCityIdx = 0;
            let nightsSpentInCurrentCity = 0;

            for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
                const isFirstDay = (dayNum === 1);
                const isLastDay = (dayNum === totalDays);
                const dayStr = `Day-${String(dayNum).padStart(2, '0')}-`;

                // Day Header Row
                const hdrRow = ws.getRow(currentRow);
                hdrRow.getCell(3).value = dayStr;
                hdrRow.getCell(3).font = { name: 'Calibri', size: 11 };
                hdrRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DAY_PALE_GREEN } };
                hdrRow.getCell(3).border = BORDER_THIN;

                hdrRow.getCell(4).value = 'Meal ';
                hdrRow.getCell(4).font = { name: 'Calibri', size: 11 };
                hdrRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DAY_PALE_GREEN } };
                hdrRow.getCell(4).alignment = { horizontal: 'center' };
                hdrRow.getCell(4).border = BORDER_THIN;

                hdrRow.getCell(6).value = '   Tour ';
                hdrRow.getCell(6).font = { name: 'Calibri', size: 11 };
                hdrRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_GREEN } };
                hdrRow.getCell(6).alignment = { horizontal: 'center' };
                hdrRow.getCell(6).border = BORDER_THIN;

                hdrRow.getCell(7).value = ' Transfer ';
                hdrRow.getCell(7).font = { name: 'Calibri', size: 11 };
                hdrRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_GREEN } };
                hdrRow.getCell(7).alignment = { horizontal: 'center' };
                hdrRow.getCell(7).border = BORDER_THIN;

                hotelCols.forEach(hCol => {
                    hdrRow.getCell(hCol.col).value = hCol.title;
                    hdrRow.getCell(hCol.col).font = { name: 'Calibri', size: 11 };
                    hdrRow.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.headerColor } };
                    hdrRow.getCell(hCol.col).alignment = { horizontal: 'center' };
                    hdrRow.getCell(hCol.col).border = BORDER_THIN;
                });

                if (isLastDay && hasChildPrices) {
                    hotelCols.forEach(hCol => {
                        hdrRow.getCell(hCol.childMealCol).value = hCol.childMealTitle;
                        hdrRow.getCell(hCol.childMealCol).font = { name: 'Calibri', size: 11 };
                        hdrRow.getCell(hCol.childMealCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.childMealColor } };
                        hdrRow.getCell(hCol.childMealCol).alignment = { horizontal: 'center' };
                        hdrRow.getCell(hCol.childMealCol).border = BORDER_THIN;
                    });
                }
                currentRow++;

                const curCity = cities[currentCityIdx] || {
                    name: 'Bangkok',
                    hotel3Name: 'Hotel 3*',
                    hotel3Price: 1400,
                    hotel4Name: 'Hotel 4*',
                    hotel4Price: 1800
                };

                const h3Price = Number(curCity.hotel3Price) || 1400;
                let hMixPrice = Number(curCity.hotel4Price) || 1500;
                if (curCity.mixPref === '3') hMixPrice = h3Price;
                else if (curCity.mixPref === '5') hMixPrice = Number(curCity.hotel5Price) || 2000;
                const h4Price = Number(curCity.hotel4Price) || (h3Price + 300);

                if (isFirstDay) {
                    const arrTr = remainingTransfers.find(tr => tr.name.toLowerCase().includes('arrival') || tr.name.toLowerCase().includes('airport to'));
                    const arrTrName = arrTr ? arrTr.name : `Arrival at ${curCity.name} Airport and Transfer to ${curCity.name} Hotel Pvt Basis`;
                    const arrTrPrice = arrTr ? Number(arrTr.price) : 850;

                    const rowArr = ws.getRow(currentRow++);
                    rowArr.getCell(3).value = arrTrName;
                    rowArr.getCell(3).font = { name: 'Arial', size: 10 };
                    rowArr.getCell(3).border = BORDER_THIN;

                    rowArr.getCell(4).value = '(--/--/--)';
                    rowArr.getCell(4).font = { name: 'Arial', size: 10 };
                    rowArr.getCell(4).alignment = { horizontal: 'center' };
                    rowArr.getCell(4).border = BORDER_THIN;

                    rowArr.getCell(7).value = arrTrPrice;
                    rowArr.getCell(7).font = { name: 'Arial', size: 10 };
                    rowArr.getCell(7).alignment = { horizontal: 'right' };
                    rowArr.getCell(7).border = BORDER_THIN;

                    hotelCols.forEach(hCol => {
                        let pVal = h3Price;
                        if (hCol.key === 'hMix') pVal = hMixPrice;
                        else if (hCol.key === 'h4') pVal = h4Price;

                        rowArr.getCell(hCol.col).value = pVal;
                        rowArr.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                        rowArr.getCell(hCol.col).alignment = { horizontal: 'right' };
                        rowArr.getCell(hCol.col).border = BORDER_THIN;
                    });

                    const rowCheckin = ws.getRow(currentRow++);
                    rowCheckin.getCell(3).value = `02.00pm Check in at ${curCity.name} Hotel`;
                    rowCheckin.getCell(3).font = { name: 'Arial', size: 10 };
                    rowCheckin.getCell(3).border = BORDER_THIN;

                    const eveIdx = remainingTours.findIndex(t => t.name.toLowerCase().includes('dinner') || t.name.toLowerCase().includes('cruise'));
                    if (eveIdx !== -1) {
                        const eveTour = remainingTours.splice(eveIdx, 1)[0];
                        const rowEve = ws.getRow(currentRow++);
                        rowEve.getCell(3).value = eveTour.name;
                        rowEve.getCell(3).font = { name: 'Arial', size: 10, bold: true };
                        rowEve.getCell(3).border = BORDER_THIN;

                        rowEve.getCell(6).value = Number(eveTour.price) || 1150;
                        rowEve.getCell(6).font = { name: 'Arial', size: 10 };
                        rowEve.getCell(6).alignment = { horizontal: 'right' };
                        rowEve.getCell(6).border = BORDER_THIN;
                    }

                    const rowOver = ws.getRow(currentRow++);
                    rowOver.getCell(3).value = 'Overnight at Hotel';
                    rowOver.getCell(3).font = { name: 'Arial', size: 10 };
                    rowOver.getCell(3).border = BORDER_THIN;

                    nightsSpentInCurrentCity++;

                } else if (isLastDay) {
                    const rowBfast = ws.getRow(currentRow++);
                    rowBfast.getCell(3).value = 'Breakfast at Hotel ';
                    rowBfast.getCell(3).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(3).border = BORDER_THIN;

                    rowBfast.getCell(4).value = '(B/--/--)';
                    rowBfast.getCell(4).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(4).alignment = { horizontal: 'center' };
                    rowBfast.getCell(4).border = BORDER_THIN;

                    if (hasChildPrices) {
                        const nightsCount = Math.max(1, totalDays - 1);
                        hotelCols.forEach(hCol => {
                            let formulaStr = '';
                            if (hCol.key === 'h3') formulaStr = `350*${nightsCount}`;
                            else if (hCol.key === 'hMix') formulaStr = `450*2`;
                            else if (hCol.key === 'h4') formulaStr = `450*${nightsCount}`;

                            rowBfast.getCell(hCol.childMealCol).value = { formula: formulaStr };
                            rowBfast.getCell(hCol.childMealCol).font = { name: 'Arial', size: 10 };
                            rowBfast.getCell(hCol.childMealCol).alignment = { horizontal: 'right' };
                            rowBfast.getCell(hCol.childMealCol).border = BORDER_THIN;
                        });
                    }

                    const rowCheckout = ws.getRow(currentRow++);
                    rowCheckout.getCell(3).value = '12.00pm Check out from Hotel';
                    rowCheckout.getCell(3).font = { name: 'Arial', size: 10 };
                    rowCheckout.getCell(3).border = BORDER_THIN;

                    const depTr = remainingTransfers.find(tr => tr.name.toLowerCase().includes('departure') || tr.name.toLowerCase().includes('to airport'));
                    const depTrName = depTr ? depTr.name : `Private Transfer ${curCity.name} Hotel to ${curCity.name} Airport Pvt Basis`;
                    const depTrPrice = depTr ? Number(depTr.price) : 1000;

                    const rowDep = ws.getRow(currentRow++);
                    rowDep.getCell(3).value = depTrName;
                    rowDep.getCell(3).font = { name: 'Arial', size: 10 };
                    rowDep.getCell(3).border = BORDER_THIN;

                    rowDep.getCell(7).value = depTrPrice;
                    rowDep.getCell(7).font = { name: 'Arial', size: 10 };
                    rowDep.getCell(7).alignment = { horizontal: 'right' };
                    rowDep.getCell(7).border = BORDER_THIN;

                    if (hasMix && hasChildPrices) {
                        const nightsCount = Math.max(1, totalDays - 1);
                        const mixColObj = hotelCols.find(h => h.key === 'hMix');
                        if (mixColObj) {
                            rowDep.getCell(mixColObj.childMealCol).value = { formula: `350*${Math.max(1, nightsCount - 2)}` };
                            rowDep.getCell(mixColObj.childMealCol).font = { name: 'Arial', size: 10 };
                            rowDep.getCell(mixColObj.childMealCol).alignment = { horizontal: 'right' };
                            rowDep.getCell(mixColObj.childMealCol).border = BORDER_THIN;
                        }
                    }

                } else {
                    const rowBfast = ws.getRow(currentRow++);
                    rowBfast.getCell(3).value = 'Breakfast at Hotel ';
                    rowBfast.getCell(3).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(3).border = BORDER_THIN;

                    if (currentCityIdx < cities.length - 1 && nightsSpentInCurrentCity >= (Number(cities[currentCityIdx].numberOfNights) || 1)) {
                        currentCityIdx++;
                        nightsSpentInCurrentCity = 0;
                        const nextCity = cities[currentCityIdx];

                        rowBfast.getCell(4).value = '(B/--/D)';
                        rowBfast.getCell(4).font = { name: 'Arial', size: 10 };
                        rowBfast.getCell(4).alignment = { horizontal: 'center' };
                        rowBfast.getCell(4).border = BORDER_THIN;

                        const nextH3 = Number(nextCity.hotel3Price) || 1500;
                        let nextMix = Number(nextCity.hotel4Price) || 1500;
                        if (nextCity.mixPref === '3') nextMix = nextH3;
                        else if (nextCity.mixPref === '5') nextMix = Number(nextCity.hotel5Price) || 2000;
                        const nextH4 = Number(nextCity.hotel4Price) || 2000;

                        hotelCols.forEach(hCol => {
                            let pVal = nextH3;
                            if (hCol.key === 'hMix') pVal = nextMix;
                            else if (hCol.key === 'h4') pVal = nextH4;

                            rowBfast.getCell(hCol.col).value = pVal;
                            rowBfast.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                            rowBfast.getCell(hCol.col).alignment = { horizontal: 'right' };
                            rowBfast.getCell(hCol.col).border = BORDER_THIN;
                        });

                        const rowTrOut = ws.getRow(currentRow++);
                        rowTrOut.getCell(3).value = `PVT Transfer ${curCity.name} Hotel to ${curCity.name} Airport`;
                        rowTrOut.getCell(3).font = { name: 'Arial', size: 10 };
                        rowTrOut.getCell(3).border = BORDER_THIN;
                        rowTrOut.getCell(7).value = 850;
                        rowTrOut.getCell(7).font = { name: 'Arial', size: 10 };
                        rowTrOut.getCell(7).alignment = { horizontal: 'right' };
                        rowTrOut.getCell(7).border = BORDER_THIN;

                        const rowTrIn = ws.getRow(currentRow++);
                        rowTrIn.getCell(3).value = `Arrival at ${nextCity.name} Airport and Transfer to ${nextCity.name} Hotel Pvt Basis`;
                        rowTrIn.getCell(3).font = { name: 'Arial', size: 10 };
                        rowTrIn.getCell(3).border = BORDER_THIN;
                        rowTrIn.getCell(7).value = 1000;
                        rowTrIn.getCell(7).font = { name: 'Arial', size: 10 };
                        rowTrIn.getCell(7).alignment = { horizontal: 'right' };
                        rowTrIn.getCell(7).border = BORDER_THIN;

                        const rowCheckinNext = ws.getRow(currentRow++);
                        rowCheckinNext.getCell(3).value = `14.00 Check in ${nextCity.name} Hotel`;
                        rowCheckinNext.getCell(3).font = { name: 'Arial', size: 10 };
                        rowCheckinNext.getCell(3).border = BORDER_THIN;

                    } else {
                        rowBfast.getCell(4).value = '(B/L/--)';
                        rowBfast.getCell(4).font = { name: 'Arial', size: 10 };
                        rowBfast.getCell(4).alignment = { horizontal: 'center' };
                        rowBfast.getCell(4).border = BORDER_THIN;

                        hotelCols.forEach(hCol => {
                            let pVal = h3Price;
                            if (hCol.key === 'hMix') pVal = hMixPrice;
                            else if (hCol.key === 'h4') pVal = h4Price;

                            rowBfast.getCell(hCol.col).value = pVal;
                            rowBfast.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                            rowBfast.getCell(hCol.col).alignment = { horizontal: 'right' };
                            rowBfast.getCell(hCol.col).border = BORDER_THIN;
                        });
                    }

                    if (remainingTours.length > 0) {
                        const dayTour = remainingTours.shift();
                        const rowTour = ws.getRow(currentRow++);
                        rowTour.getCell(3).value = dayTour.name;
                        rowTour.getCell(3).font = { name: 'Arial', size: 10, bold: true };
                        rowTour.getCell(3).border = BORDER_THIN;

                        rowTour.getCell(6).value = Number(dayTour.price) || 1200;
                        rowTour.getCell(6).font = { name: 'Arial', size: 10 };
                        rowTour.getCell(6).alignment = { horizontal: 'right' };
                        rowTour.getCell(6).border = BORDER_THIN;
                    } else {
                        const rowFree = ws.getRow(currentRow++);
                        rowFree.getCell(3).value = 'Free For Leisure';
                        rowFree.getCell(3).font = { name: 'Arial', size: 10 };
                        rowFree.getCell(3).border = BORDER_THIN;
                    }

                    const rowOver = ws.getRow(currentRow++);
                    rowOver.getCell(3).value = 'Overnight at Hotel';
                    rowOver.getCell(3).font = { name: 'Arial', size: 10 };
                    rowOver.getCell(3).border = BORDER_THIN;

                    nightsSpentInCurrentCity++;
                }
            }
        }

        // ── TABLE HEADER ROW ABOVE SUBTOTALS ──
        // Check if the previous row already contains 'Tour End!' or is an empty activity slot
        let tableHeaderRow;
        const prevRow = ws.getRow(currentRow - 1);
        const prevText = normalizeText(prevRow.getCell(3).value || '');
        const prevHasCost = Boolean(prevRow.getCell(6).value || prevRow.getCell(7).value || prevRow.getCell(8).value);

        if (prevText.includes('tour end') || (!prevHasCost && prevRow.getCell(3).value)) {
            // Place column headers on this existing row
            tableHeaderRow = prevRow;
        } else {
            // Add a clean 'Tour End!' row right before the subtotal
            tableHeaderRow = ws.getRow(currentRow++);
            tableHeaderRow.getCell(3).value = 'Tour End!';
            tableHeaderRow.getCell(3).font = { name: 'Arial', size: 10 };
            tableHeaderRow.getCell(3).border = BORDER_THIN;
        }

        tableHeaderRow.getCell(6).value = '   Tour ';
        tableHeaderRow.getCell(6).font = { name: 'Calibri', size: 11 };
        tableHeaderRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_GREEN } };
        tableHeaderRow.getCell(6).alignment = { horizontal: 'center' };
        tableHeaderRow.getCell(6).border = BORDER_HAIR;

        tableHeaderRow.getCell(7).value = ' Transfer ';
        tableHeaderRow.getCell(7).font = { name: 'Calibri', size: 11 };
        tableHeaderRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_GREEN } };
        tableHeaderRow.getCell(7).alignment = { horizontal: 'center' };
        tableHeaderRow.getCell(7).border = BORDER_HAIR;

        hotelCols.forEach(hCol => {
            tableHeaderRow.getCell(hCol.col).value = hCol.title;
            tableHeaderRow.getCell(hCol.col).font = { name: 'Calibri', size: 11 };
            tableHeaderRow.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.headerColor } };
            tableHeaderRow.getCell(hCol.col).alignment = { horizontal: 'center' };
            tableHeaderRow.getCell(hCol.col).border = BORDER_HAIR;
        });

        if (hasChildPrices) {
            hotelCols.forEach(hCol => {
                tableHeaderRow.getCell(hCol.childMealCol).value = 'Child';
                tableHeaderRow.getCell(hCol.childMealCol).font = { name: 'Calibri', size: 11 };
                tableHeaderRow.getCell(hCol.childMealCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.childMealColor } };
                tableHeaderRow.getCell(hCol.childMealCol).alignment = { horizontal: 'center' };
                tableHeaderRow.getCell(hCol.childMealCol).border = BORDER_HAIR;
            });
        }

        const lastActivityRow = tableHeaderRow.number - 1;

        // ── LIVE FORMULAS & CALCULATION SECTION ──
        // 1. Subtotals Row
        const subtotalRowIdx = currentRow;
        const rSub = ws.getRow(subtotalRowIdx);
        rSub.getCell(7).value = { formula: `SUM(G2:G${lastActivityRow})` };
        rSub.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rSub.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rSub.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}2:${hCol.letter}${lastActivityRow})` };
            rSub.getCell(hCol.col).font = { name: 'Arial', size: 10, bold: true };
            rSub.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            hotelCols.forEach(hCol => {
                rSub.getCell(hCol.childMealCol).value = { formula: `SUM(${hCol.childMealLetter}2:${hCol.childMealLetter}${lastActivityRow})` };
                rSub.getCell(hCol.childMealCol).font = { name: 'Arial', size: 10, bold: true };
                rSub.getCell(hCol.childMealCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // 2. Per Pax Row
        const perPaxRowIdx = currentRow;
        const rPax = ws.getRow(perPaxRowIdx);
        rPax.getCell(3).value = 'Tour End!';
        rPax.getCell(3).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        rPax.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
        rPax.getCell(3).border = BORDER_THIN;

        rPax.getCell(6).value = { formula: `SUM(F2:F${lastActivityRow})` };
        rPax.getCell(6).font = { name: 'Arial', size: 10, bold: true };
        rPax.getCell(6).border = BORDER_THIN;

        rPax.getCell(7).value = { formula: `SUM(G${subtotalRowIdx}/${rawPax})` };
        rPax.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rPax.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
        rPax.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rPax.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}${subtotalRowIdx}/2)` };
            rPax.getCell(hCol.col).font = { name: 'Arial', size: 10 };
            rPax.getCell(hCol.col).border = BORDER_THIN;
        });
        currentRow++;

        // Star Category marker
        const rStar = ws.getRow(currentRow++);
        rStar.getCell(6).value = '3*';
        rStar.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        rStar.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
        rStar.getCell(6).alignment = { horizontal: 'center' };
        rStar.getCell(6).border = BORDER_HAIR;

        rStar.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
        rStar.getCell(7).border = BORDER_HAIR;

        hotelCols.forEach(hCol => {
            const starFill = (hCol.key === 'h3') ? COLORS.TOUR_END_GREEN : COLORS.HEADER_MAUVE;
            rStar.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: starFill } };
            rStar.getCell(hCol.col).border = BORDER_HAIR;
        });

        if (hasChildPrices) {
            const extraMarkerCol = hasMix ? 12 : 11;
            const extraLabelCol = hasMix ? 13 : 12;
            const shareMarkerCol = hasMix ? 18 : 16;
            const shareLabelCol = hasMix ? 19 : 17;
            const spacerCol = hasMix ? 17 : 15;

            rStar.getCell(extraMarkerCol).value = 'Extra Bed ';
            rStar.getCell(extraMarkerCol).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            rStar.getCell(extraMarkerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
            rStar.getCell(extraMarkerCol).alignment = { horizontal: 'center' };
            rStar.getCell(extraMarkerCol).border = BORDER_HAIR;

            rStar.getCell(extraLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
            rStar.getCell(extraLabelCol).border = BORDER_HAIR;

            hotelCols.forEach(hCol => {
                rStar.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.extraColor } };
                rStar.getCell(hCol.extraCol).border = BORDER_HAIR;
            });

            rStar.getCell(spacerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WHITE } };
            rStar.getCell(spacerCol).border = BORDER_HAIR;

            rStar.getCell(shareMarkerCol).value = 'Sharing Bed';
            rStar.getCell(shareMarkerCol).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            rStar.getCell(shareMarkerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
            rStar.getCell(shareMarkerCol).alignment = { horizontal: 'center' };
            rStar.getCell(shareMarkerCol).border = BORDER_HAIR;

            rStar.getCell(shareLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
            rStar.getCell(shareLabelCol).border = BORDER_HAIR;

            hotelCols.forEach(hCol => {
                rStar.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.shareColor } };
                rStar.getCell(hCol.shareCol).border = BORDER_HAIR;
            });
        }

        // 3. Net Package Cost Row
        const netRowIdx = currentRow;
        const rNet = ws.getRow(netRowIdx);
        rNet.getCell(3).value = 'Inclusion ';
        rNet.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
        rNet.getCell(3).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rNet.getCell(hCol.col).value = { formula: `SUM(F${perPaxRowIdx}+G${perPaxRowIdx}+${hCol.letter}${perPaxRowIdx})` };
            rNet.getCell(hCol.col).font = { name: 'Arial', size: 10, bold: true };
            rNet.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            const spacerCol = hasMix ? 17 : 15;
            rNet.getCell(spacerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WHITE } };

            hotelCols.forEach(hCol => {
                // Extra Bed Net: Tour (F) + Hotel Per Pax
                rNet.getCell(hCol.extraCol).value = { formula: `SUM(F${perPaxRowIdx}+${hCol.letter}${perPaxRowIdx})` };
                rNet.getCell(hCol.extraCol).font = { name: 'Arial', size: 10, bold: true };
                rNet.getCell(hCol.extraCol).border = BORDER_THIN;

                // Sharing Bed Net: Tour (F) + Child Meal Subtotal
                rNet.getCell(hCol.shareCol).value = { formula: `SUM(F${perPaxRowIdx}+${hCol.childMealLetter}${subtotalRowIdx})` };
                rNet.getCell(hCol.shareCol).font = { name: 'Arial', size: 10, bold: true };
                rNet.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // 4. Inclusions Breakdown Lines
        const cleanInclusions = (Array.isArray(payload.inclusions) ? payload.inclusions : [])
            .map(i => stripHtml(i))
            .filter(Boolean);

        // Separate normal inclusions from meal summary items
        const normalInclusions = cleanInclusions.filter(i => {
            const lower = i.toLowerCase();
            return !lower.startsWith('meal') && !lower.includes('breakfast /') && !lower.includes('breakfast/');
        });
        const customMealItem = cleanInclusions.find(i => {
            const lower = i.toLowerCase();
            return lower.startsWith('meal') || lower.includes('breakfast /') || lower.includes('breakfast/');
        });

        // Default fallbacks if normalInclusions has few items
        const defaultNormalInclusions = [
            cities.length > 0 ? cities.map(c => `${c.numberOfNights}N ${c.name}`).join(' ') + ' Hotel Accomodation with Breakfast' : `${stripHtml(tourTitle)} Hotel Accomodation with Breakfast`,
            'Airport - Hotel - Airport Transfer Pvt Basis ',
            'Tour by air-conditioned vehicles',
            'All admisson fees & Transfers as mentioned in the above program',
            tours[0] ? stripHtml(tours[0].name) : 'Sightseeing Tours as mentioned',
            tours[1] ? stripHtml(tours[1].name) : 'Attraction Tickets & Guide Assistance',
            tours[2] ? stripHtml(tours[2].name) : 'Sightseeing Activities'
        ];

        function isTourOrMealInclusion(text) {
            if (!text) return false;
            const norm = normalizeText(text);
            if (norm.startsWith('meal') || (norm.includes('breakfast') && (norm.includes('lunch') || norm.includes('dinner')))) {
                return true;
            }
            if (norm.includes('hotel accom') || norm.includes('airport hotel airport') || norm.includes('private transfer') ||
                norm.includes('air conditioned vehicles') || norm.includes('all admisson fees')) {
                return false;
            }
            return true;
        }

        function getInclusionFont(text) {
            return isTourOrMealInclusion(text) ? FONT_INC_BLUE : FONT_INC_BLACK;
        }

        function getNormalInc(idx, fallback) {
            return normalInclusions[idx] || fallback;
        }

        // Inc 1: City Stay
        const rInc1 = ws.getRow(currentRow++);
        rInc1.getCell(3).value = getNormalInc(0, defaultNormalInclusions[0]);
        rInc1.getCell(3).font = getInclusionFont(rInc1.getCell(3).value);

        // Inc 2: Transfers & Markup Row
        const markupRowIdx = currentRow;
        const rInc2 = ws.getRow(markupRowIdx);
        rInc2.getCell(3).value = getNormalInc(1, defaultNormalInclusions[1]);
        rInc2.getCell(3).font = getInclusionFont(rInc2.getCell(3).value);

        rInc2.getCell(7).value = `${hotelCols[0].markup}%`;
        rInc2.getCell(7).font = { name: 'Calibri', size: 11, bold: true };
        rInc2.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
        rInc2.getCell(7).alignment = { horizontal: 'center' };
        rInc2.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rInc2.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}${netRowIdx}*${(100 + hCol.markup)}/100)` };
            rInc2.getCell(hCol.col).font = { name: 'Calibri', size: 11, bold: true };
            rInc2.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
            rInc2.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            const extraLabelCol = hasMix ? 13 : 12;
            const shareLabelCol = hasMix ? 19 : 17;
            const spacerCol = hasMix ? 17 : 15;

            rInc2.getCell(extraLabelCol).value = `${hotelCols[0].markup}%`;
            rInc2.getCell(extraLabelCol).font = { name: 'Calibri', size: 11, bold: true };
            rInc2.getCell(extraLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
            rInc2.getCell(extraLabelCol).alignment = { horizontal: 'center' };
            rInc2.getCell(extraLabelCol).border = BORDER_THIN;

            rInc2.getCell(shareLabelCol).value = `${hotelCols[0].markup}%`;
            rInc2.getCell(shareLabelCol).font = { name: 'Calibri', size: 11, bold: true };
            rInc2.getCell(shareLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
            rInc2.getCell(shareLabelCol).alignment = { horizontal: 'center' };
            rInc2.getCell(shareLabelCol).border = BORDER_THIN;

            rInc2.getCell(spacerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WHITE } };

            hotelCols.forEach(hCol => {
                rInc2.getCell(hCol.extraCol).value = { formula: `SUM(${hCol.extraLetter}${netRowIdx}*${(100 + hCol.markup)}/100)` };
                rInc2.getCell(hCol.extraCol).font = { name: 'Calibri', size: 11, bold: true };
                rInc2.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
                rInc2.getCell(hCol.extraCol).border = BORDER_THIN;

                rInc2.getCell(hCol.shareCol).value = { formula: `SUM(${hCol.shareLetter}${netRowIdx}*${(100 + hCol.markup)}/100)` };
                rInc2.getCell(hCol.shareCol).font = { name: 'Calibri', size: 11, bold: true };
                rInc2.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
                rInc2.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Inc 3: Different / Profit Margin
        const profitRowIdx = currentRow;
        const rInc3 = ws.getRow(profitRowIdx);
        rInc3.getCell(3).value = getNormalInc(2, defaultNormalInclusions[2]);
        rInc3.getCell(3).font = getInclusionFont(rInc3.getCell(3).value);

        rInc3.getCell(7).value = 'Different';
        rInc3.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rInc3.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
        rInc3.getCell(7).alignment = { horizontal: 'center' };
        rInc3.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rInc3.getCell(hCol.col).value = { formula: `${hCol.letter}${markupRowIdx}-${hCol.letter}${netRowIdx}` };
            rInc3.getCell(hCol.col).font = { name: 'Arial', size: 10 };
            rInc3.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
            rInc3.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            const extraLabelCol = hasMix ? 13 : 12;
            const shareLabelCol = hasMix ? 19 : 17;
            const spacerCol = hasMix ? 17 : 15;

            rInc3.getCell(extraLabelCol).value = 'Different';
            rInc3.getCell(extraLabelCol).font = { name: 'Arial', size: 10, bold: true };
            rInc3.getCell(extraLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
            rInc3.getCell(extraLabelCol).alignment = { horizontal: 'center' };
            rInc3.getCell(extraLabelCol).border = BORDER_THIN;

            rInc3.getCell(shareLabelCol).value = 'Different';
            rInc3.getCell(shareLabelCol).font = { name: 'Arial', size: 10, bold: true };
            rInc3.getCell(shareLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
            rInc3.getCell(shareLabelCol).alignment = { horizontal: 'center' };
            rInc3.getCell(shareLabelCol).border = BORDER_THIN;

            rInc3.getCell(spacerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WHITE } };

            hotelCols.forEach(hCol => {
                rInc3.getCell(hCol.extraCol).value = { formula: `${hCol.extraLetter}${markupRowIdx}-${hCol.extraLetter}${netRowIdx}` };
                rInc3.getCell(hCol.extraCol).font = { name: 'Arial', size: 10 };
                rInc3.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
                rInc3.getCell(hCol.extraCol).border = BORDER_THIN;

                rInc3.getCell(hCol.shareCol).value = { formula: `${hCol.shareLetter}${markupRowIdx}-${hCol.shareLetter}${netRowIdx}` };
                rInc3.getCell(hCol.shareCol).font = { name: 'Arial', size: 10 };
                rInc3.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
                rInc3.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Inc 4: Admissions
        const rInc4 = ws.getRow(currentRow++);
        rInc4.getCell(3).value = getNormalInc(3, defaultNormalInclusions[3]);
        rInc4.getCell(3).font = getInclusionFont(rInc4.getCell(3).value);

        // Inc 5: THB Label Row
        const thbRowIdx = currentRow;
        const rInc5 = ws.getRow(thbRowIdx);
        rInc5.getCell(3).value = getNormalInc(4, defaultNormalInclusions[4]);
        rInc5.getCell(3).font = getInclusionFont(rInc5.getCell(3).value);

        rInc5.getCell(7).value = 'THB';
        rInc5.getCell(7).font = { name: 'Calibri', size: 11, bold: true };
        rInc5.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
        rInc5.getCell(7).alignment = { horizontal: 'center' };
        rInc5.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rInc5.getCell(hCol.col).value = { formula: `${hCol.letter}${markupRowIdx}` };
            rInc5.getCell(hCol.col).font = { name: 'Calibri', size: 11, bold: true };
            rInc5.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
            rInc5.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            const extraLabelCol = hasMix ? 13 : 12;
            const shareLabelCol = hasMix ? 19 : 17;
            const spacerCol = hasMix ? 17 : 15;

            rInc5.getCell(extraLabelCol).value = 'THB';
            rInc5.getCell(extraLabelCol).font = { name: 'Calibri', size: 11, bold: true };
            rInc5.getCell(extraLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
            rInc5.getCell(extraLabelCol).alignment = { horizontal: 'center' };
            rInc5.getCell(extraLabelCol).border = BORDER_THIN;

            rInc5.getCell(shareLabelCol).value = 'THB';
            rInc5.getCell(shareLabelCol).font = { name: 'Calibri', size: 11, bold: true };
            rInc5.getCell(shareLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
            rInc5.getCell(shareLabelCol).alignment = { horizontal: 'center' };
            rInc5.getCell(shareLabelCol).border = BORDER_THIN;

            rInc5.getCell(spacerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WHITE } };

            hotelCols.forEach(hCol => {
                rInc5.getCell(hCol.extraCol).value = { formula: `${hCol.extraLetter}${markupRowIdx}` };
                rInc5.getCell(hCol.extraCol).font = { name: 'Calibri', size: 11, bold: true };
                rInc5.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
                rInc5.getCell(hCol.extraCol).border = BORDER_THIN;

                rInc5.getCell(hCol.shareCol).value = { formula: `${hCol.shareLetter}${markupRowIdx}` };
                rInc5.getCell(hCol.shareCol).font = { name: 'Calibri', size: 11, bold: true };
                rInc5.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
                rInc5.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Inc 6: Tour 2 (if any)
        const rInc6 = ws.getRow(currentRow++);
        rInc6.getCell(3).value = getNormalInc(5, defaultNormalInclusions[5]);
        rInc6.getCell(3).font = getInclusionFont(rInc6.getCell(3).value);

        // Inc 7: LKR Currency Row
        const lkrRowIdx = currentRow;
        const rInc7 = ws.getRow(lkrRowIdx);
        rInc7.getCell(3).value = getNormalInc(6, defaultNormalInclusions[6]);
        rInc7.getCell(3).font = getInclusionFont(rInc7.getCell(3).value);

        rInc7.getCell(7).value = 'LKR';
        rInc7.getCell(7).font = { name: 'Calibri', size: 11, bold: true };
        rInc7.getCell(7).alignment = { horizontal: 'center' };
        rInc7.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rInc7.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}${thbRowIdx}*${roe})` };
            rInc7.getCell(hCol.col).font = { name: 'Arial', size: 10, bold: true };
            rInc7.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
            rInc7.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            const extraLabelCol = hasMix ? 13 : 12;
            const shareLabelCol = hasMix ? 19 : 17;
            const spacerCol = hasMix ? 17 : 15;

            rInc7.getCell(extraLabelCol).value = 'LKR';
            rInc7.getCell(extraLabelCol).font = { name: 'Calibri', size: 11, bold: true };
            rInc7.getCell(extraLabelCol).alignment = { horizontal: 'center' };
            rInc7.getCell(extraLabelCol).border = BORDER_THIN;

            rInc7.getCell(shareLabelCol).value = 'LKR';
            rInc7.getCell(shareLabelCol).font = { name: 'Calibri', size: 11, bold: true };
            rInc7.getCell(shareLabelCol).alignment = { horizontal: 'center' };
            rInc7.getCell(shareLabelCol).border = BORDER_THIN;

            rInc7.getCell(spacerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WHITE } };

            hotelCols.forEach(hCol => {
                rInc7.getCell(hCol.extraCol).value = { formula: `SUM(${hCol.extraLetter}${thbRowIdx}*${roe})` };
                rInc7.getCell(hCol.extraCol).font = { name: 'Arial', size: 10, bold: true };
                rInc7.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
                rInc7.getCell(hCol.extraCol).border = BORDER_THIN;

                rInc7.getCell(hCol.shareCol).value = { formula: `SUM(${hCol.shareLetter}${thbRowIdx}*${roe})` };
                rInc7.getCell(hCol.shareCol).font = { name: 'Arial', size: 10, bold: true };
                rInc7.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
                rInc7.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Inc 8: Meals Summary (Rendered EXACTLY ONCE here!)
        const rInc8 = ws.getRow(currentRow++);
        let breakfastCount = Math.max(0, (days ? days.length : totalNights + 1) - 1);
        let lunchCount = tours.filter(t => (t.name || '').toLowerCase().includes('lunch')).length;
        let dinnerCount = tours.filter(t => (t.name || '').toLowerCase().includes('dinner') || (t.name || '').toLowerCase().includes('cruise')).length;
        const defaultMealSummary = `Meals (${String(breakfastCount).padStart(2, '0')} Breakfast / ${String(lunchCount).padStart(2, '0')} Lunch / ${String(dinnerCount).padStart(2, '0')} Dinner)`;
        rInc8.getCell(3).value = customMealItem || defaultMealSummary;
        rInc8.getCell(3).font = FONT_INC_BLUE;

        // Extra inclusions if any (beyond index 6, excluding meals)
        if (normalInclusions.length > 7) {
            for (let incIdx = 7; incIdx < normalInclusions.length; incIdx++) {
                const rExtraInc = ws.getRow(currentRow++);
                rExtraInc.getCell(3).value = normalInclusions[incIdx];
                rExtraInc.getCell(3).font = getInclusionFont(rExtraInc.getCell(3).value);
            }
        }

        currentRow++; // Spacing

        // Total Row
        const totRowIdx = currentRow;
        const rTot = ws.getRow(totRowIdx);
        rTot.getCell(7).value = 'Total';
        rTot.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rTot.getCell(7).alignment = { horizontal: 'center' };
        rTot.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rTot.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}${lkrRowIdx})` };
            rTot.getCell(hCol.col).font = { name: 'Arial', size: 10, bold: true };
            rTot.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            const extraLabelCol = hasMix ? 13 : 12;
            const shareLabelCol = hasMix ? 19 : 17;
            const spacerCol = hasMix ? 17 : 15;

            rTot.getCell(extraLabelCol).value = 'Total';
            rTot.getCell(extraLabelCol).font = { name: 'Arial', size: 10, bold: true };
            rTot.getCell(extraLabelCol).alignment = { horizontal: 'center' };
            rTot.getCell(extraLabelCol).border = BORDER_THIN;

            rTot.getCell(shareLabelCol).value = 'Total';
            rTot.getCell(shareLabelCol).font = { name: 'Arial', size: 10, bold: true };
            rTot.getCell(shareLabelCol).alignment = { horizontal: 'center' };
            rTot.getCell(shareLabelCol).border = BORDER_THIN;

            rTot.getCell(spacerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WHITE } };

            hotelCols.forEach(hCol => {
                rTot.getCell(hCol.extraCol).value = { formula: `SUM(${hCol.extraLetter}${lkrRowIdx})` };
                rTot.getCell(hCol.extraCol).font = { name: 'Arial', size: 10, bold: true };
                rTot.getCell(hCol.extraCol).border = BORDER_THIN;

                rTot.getCell(hCol.shareCol).value = { formula: `SUM(${hCol.shareLetter}${lkrRowIdx})` };
                rTot.getCell(hCol.shareCol).font = { name: 'Arial', size: 10, bold: true };
                rTot.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // ROUNDUP Row
        const roundRowIdx = currentRow;
        const rRound = ws.getRow(roundRowIdx);
        hotelCols.forEach(hCol => {
            rRound.getCell(hCol.col).value = { formula: `ROUNDUP(${hCol.letter}${totRowIdx}, -2)` };
            rRound.getCell(hCol.col).font = { name: 'Arial', size: 10 };
            rRound.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            hotelCols.forEach(hCol => {
                rRound.getCell(hCol.extraCol).value = { formula: `ROUNDUP(${hCol.extraLetter}${totRowIdx}, -2)` };
                rRound.getCell(hCol.extraCol).font = { name: 'Arial', size: 10 };
                rRound.getCell(hCol.extraCol).border = BORDER_THIN;

                rRound.getCell(hCol.shareCol).value = { formula: `ROUNDUP(${hCol.shareLetter}${totRowIdx}, -2)` };
                rRound.getCell(hCol.shareCol).font = { name: 'Arial', size: 10 };
                rRound.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Final Buffer (+1000) Row
        const finalBufferRowIdx = currentRow;
        const rBuffer = ws.getRow(finalBufferRowIdx);
        hotelCols.forEach(hCol => {
            rBuffer.getCell(hCol.col).value = { formula: `${hCol.letter}${roundRowIdx}+${buffer}` };
            rBuffer.getCell(hCol.col).font = { name: 'Arial', size: 10, bold: true };
            rBuffer.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROUNDED_LIGHT_GREEN } };
            rBuffer.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            hotelCols.forEach(hCol => {
                rBuffer.getCell(hCol.extraCol).value = { formula: `${hCol.extraLetter}${roundRowIdx}+${buffer}` };
                rBuffer.getCell(hCol.extraCol).font = { name: 'Calibri', size: 11, bold: true };
                rBuffer.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROUNDED_LIGHT_GREEN } };
                rBuffer.getCell(hCol.extraCol).border = BORDER_THIN;

                rBuffer.getCell(hCol.shareCol).value = { formula: `${hCol.shareLetter}${roundRowIdx}+${buffer}` };
                rBuffer.getCell(hCol.shareCol).font = { name: 'Calibri', size: 11, bold: true };
                rBuffer.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROUNDED_LIGHT_GREEN } };
                rBuffer.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // 5. Exclusions Section
        const rExcHdr = ws.getRow(currentRow++);
        rExcHdr.getCell(3).value = 'Exclusion ';
        rExcHdr.getCell(3).font = { name: 'Calibri', size: 11, bold: true };

        const exclusionsList = Array.isArray(payload.exclusions) && payload.exclusions.length > 0 
            ? payload.exclusions 
            : ['Air fare', 'Everything which is not mentioned in the program', 'Thailand Visa'];

        exclusionsList.forEach(excText => {
            const rExc = ws.getRow(currentRow++);
            rExc.getCell(3).value = excText;
            rExc.getCell(3).font = { name: 'Arial', size: 10 };
        });

        const rVal = ws.getRow(currentRow++);
        rVal.getCell(3).value = '              This Rate Valid for 07 days ';
        rVal.getCell(3).font = { name: 'Arial', size: 10, italic: true };
        currentRow += 1;

        // 6. Summary Client Quotation Cards (Dynamic based on hotelCols)
        // Resolves options/hotels from payload.options or cities
        const builderOptions = payload.options && payload.options[0] ? payload.options[0].hotels : null;

        function extractNumericVal(val) {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'number') return isNaN(val) ? 0 : val;
            if (typeof val === 'object' && val.result !== undefined) {
                return Number(val.result) || 0;
            }
            if (typeof val === 'string') {
                const cleaned = val.replace(/[^0-9.]/g, '');
                if (cleaned) {
                    return Number(cleaned) || 0;
                }
            }
            return 0;
        }

        let tourSum = 0;
        let trSum = 0;
        for (let r = 2; r <= lastActivityRow; r++) {
            tourSum += extractNumericVal(ws.getRow(r).getCell(6).value);
            trSum += extractNumericVal(ws.getRow(r).getCell(7).value);
        }
        const trPerPax = trSum / rawPax;

        hotelCols.forEach(hCol => {
            let hotelSum = 0;
            for (let r = 2; r <= lastActivityRow; r++) {
                hotelSum += extractNumericVal(ws.getRow(r).getCell(hCol.col).value);
            }
            const hotelPerPax = hotelSum / 2;
            const netPax = tourSum + trPerPax + hotelPerPax;
            const thb = netPax * (100 + hCol.markup) / 100;
            const lkr = thb * roe;
            const roundedLkr = Math.ceil(lkr / 100) * 100;
            const bufferPrice = roundedLkr + buffer;
            hCol.calculatedBufferPrice = bufferPrice;

            if (hasChildPrices) {
                // Child Extra Bed calculation: Tour + Hotel / 2 (no transfer)
                const extraNet = tourSum + hotelPerPax;
                const extraThb = extraNet * (100 + hCol.markup) / 100;
                const extraLkr = extraThb * roe;
                const extraRounded = Math.ceil(extraLkr / 100) * 100;
                hCol.calculatedChildExtraPrice = extraRounded + buffer;

                // Child Sharing Bed calculation: Tour + Child Meals (no hotel, no transfer)
                let mealCostForCol = totalMealCost3;
                if (hCol.key === 'hMix') mealCostForCol = totalMealCostMix;
                else if (hCol.key === 'h4') mealCostForCol = totalMealCost4;

                const shareNet = tourSum + mealCostForCol;
                const shareThb = shareNet * (100 + hCol.markup) / 100;
                const shareLkr = shareThb * roe;
                const shareRounded = Math.ceil(shareLkr / 100) * 100;
                hCol.calculatedChildSharePrice = shareRounded + buffer;
            }
        });

        hotelCols.forEach(hCol => {
            // Find option hotels from builder if available
            let optHotelNames = [];
            let matchedOpt = null;

            if (builderOptions) {
                matchedOpt = builderOptions.find(o => {
                    const rNorm = normalizeText(o.rating);
                    if (hCol.key === 'h3') return rNorm.includes('3');
                    if (hCol.key === 'hMix') return rNorm.includes('mix');
                    if (hCol.key === 'h4') return rNorm.includes('4') && !rNorm.includes('mix');
                    return false;
                });
                if (matchedOpt && Array.isArray(matchedOpt.names)) {
                    optHotelNames = matchedOpt.names;
                }
            }

            // Fallback hotel names from cities
            if (optHotelNames.length === 0) {
                cities.forEach((c, cIdx) => {
                    let hName = c.hotel3Name || 'Hotel 3*';
                    let star = '3*';
                    if (hCol.key === 'hMix') {
                        star = c.mixPref === '4' ? '4*' : (c.mixPref === '5' ? '5*' : '3*');
                        hName = c.mixPref === '4' ? (c.hotel4Name || 'Hotel 4*') : (c.mixPref === '5' ? (c.hotel5Name || 'Hotel 5*') : (c.hotel3Name || 'Hotel 3*'));
                    } else if (hCol.key === 'h4') {
                        star = '4*';
                        hName = c.hotel4Name || 'Hotel 4*';
                    }
                    optHotelNames.push(`${c.name} - ${hName}, or Similar ${star}`);
                });
            }

            // Print Hotel Option Lines
            optHotelNames.forEach((hLine, hIdx) => {
                const rOptHotel = ws.getRow(currentRow++);
                rOptHotel.getCell(3).value = hLine.startsWith('With ') ? hLine : `With ${hCol.cardLabel} ${hLine}`;
                rOptHotel.getCell(3).font = { name: 'Arial', size: 10 };
                rOptHotel.getCell(3).border = hIdx === 0
                    ? { left: { style: 'thin', color: { argb: 'FF000000' } }, top: { style: 'thin', color: { argb: 'FF000000' } } }
                    : { left: { style: 'thin', color: { argb: 'FF000000' } } };
            });

            // Print Price Card Row (Calculated buffer price directly from table)
            const rPriceCard = ws.getRow(currentRow++);
            let cardPriceVal = hCol.calculatedBufferPrice || 0;
            const ratesObj = payload.rates || {};
            if (hCol.key === 'h3' && ratesObj.p3) cardPriceVal = extractNumericVal(ratesObj.p3);
            else if (hCol.key === 'hMix' && ratesObj.pMix) cardPriceVal = extractNumericVal(ratesObj.pMix);
            else if (hCol.key === 'h4' && ratesObj.p4) cardPriceVal = extractNumericVal(ratesObj.p4);

            if (matchedOpt && Array.isArray(matchedOpt.prices)) {
                matchedOpt.prices.forEach(p => {
                    const lblNorm = normalizeText(p.label);
                    const pAmt = extractNumericVal(p.amount);
                    if (pAmt > 0 && (lblNorm.includes('person') || lblNorm.includes('adult') || lblNorm.includes('minimum'))) {
                        cardPriceVal = pAmt;
                    }
                });
            }

            const displayPrice = `LKR ${cardPriceVal.toLocaleString('en-US')} Per Person (Minimum ${paxStr})`;

            rPriceCard.getCell(3).value = displayPrice;
            rPriceCard.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
            rPriceCard.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.cardColor } };
            rPriceCard.getCell(3).border = { left: { style: 'thin', color: { argb: 'FF000000' } }, bottom: { style: 'thin', color: { argb: 'FF000000' } } };

            if (hasChildPrices) {
                let extraPriceVal = hCol.calculatedChildExtraPrice;
                let sharePriceVal = hCol.calculatedChildSharePrice;

                // Check payload.rates overrides
                if (hCol.key === 'h3') {
                    if (ratesObj.childExtra3) extraPriceVal = extractNumericVal(ratesObj.childExtra3);
                    if (ratesObj.childShare3) sharePriceVal = extractNumericVal(ratesObj.childShare3);
                } else if (hCol.key === 'hMix') {
                    if (ratesObj.childExtraMix) extraPriceVal = extractNumericVal(ratesObj.childExtraMix);
                    if (ratesObj.childShareMix) sharePriceVal = extractNumericVal(ratesObj.childShareMix);
                } else if (hCol.key === 'h4') {
                    if (ratesObj.childExtra4) extraPriceVal = extractNumericVal(ratesObj.childExtra4);
                    if (ratesObj.childShare4) sharePriceVal = extractNumericVal(ratesObj.childShare4);
                }

                // Check matched builder option prices if available
                if (matchedOpt && Array.isArray(matchedOpt.prices)) {
                    matchedOpt.prices.forEach(p => {
                        const lblNorm = normalizeText(p.label);
                        const pAmt = extractNumericVal(p.amount);
                        if (pAmt > 0) {
                            if (lblNorm.includes('extra bed') || lblNorm.includes('extra')) extraPriceVal = pAmt;
                            else if (lblNorm.includes('sharing')) sharePriceVal = pAmt;
                        }
                    });
                }

                // Child Extra Bed Card
                const rExtraCard = ws.getRow(currentRow++);
                const extraDisplay = `LKR ${extraPriceVal.toLocaleString('en-US')} ${childExtraLabel}`;
                rExtraCard.getCell(3).value = extraDisplay;
                rExtraCard.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
                rExtraCard.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.CHILD_EXTRA_CARD } };
                rExtraCard.getCell(3).border = { left: { style: 'thin', color: { argb: 'FF000000' } } };

                // Child Sharing Bed Card
                const rShareCard = ws.getRow(currentRow++);
                const shareDisplay = `LKR ${sharePriceVal.toLocaleString('en-US')} ${childShareLabel}`;
                rShareCard.getCell(3).value = shareDisplay;
                rShareCard.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
                rShareCard.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.CHILD_SHARE_CARD } };
                rShareCard.getCell(3).border = { left: { style: 'thin', color: { argb: 'FF000000' } } };
            }

            currentRow++; // 1 empty row spacing between cards (matches sample excel)
        });

        return wb;
    }

    /**
     * Browser Download Trigger
     * @param {Object} payload 
     * @param {string} customFilename 
     */
    async function downloadCostingExcel(payload, customFilename = null) {
        const wb = await createCostingWorkbook(payload);
        const buffer = await wb.xlsx.writeBuffer();

        const inqPart = (payload.inq || 'INQ').replace(/[^a-zA-Z0-9_-]/g, '');
        const titlePart = (payload.title || 'Tour_Costing').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
        const paxPart = (payload.paxText || '02Pax').replace(/[^a-zA-Z0-9_-]/g, '');
        const filename = customFilename || `${titlePart}-${paxPart}-${inqPart}.xlsx`;

        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);

        return true;
    }

    return {
        createCostingWorkbook,
        downloadCostingExcel
    };
}));
