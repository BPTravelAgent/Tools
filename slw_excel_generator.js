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
        const buffer = Number(payload.buffer) !== undefined ? Number(payload.buffer) : 1000;

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
            cardColor: COLORS.MARKUP_ORANGE
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
                cardColor: COLORS.CARD_YELLOW
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
                cardColor: COLORS.CARD_YELLOW
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
                cardColor: COLORS.CARD_YELLOW
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
        if (hasMix) {
            ws.getColumn(10).width = 14;  // J (4* Hotel)
            ws.getColumn(11).width = 10;
            ws.getColumn(12).width = 12;
        } else {
            ws.getColumn(10).width = 10;
            ws.getColumn(11).width = 12;
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
        currentRow++;

        // ROUNDUP Row
        const roundRowIdx = currentRow;
        const rRound = ws.getRow(roundRowIdx);
        hotelCols.forEach(hCol => {
            rRound.getCell(hCol.col).value = { formula: `ROUNDUP(${hCol.letter}${totRowIdx}, -2)` };
            rRound.getCell(hCol.col).font = { name: 'Arial', size: 10 };
            rRound.getCell(hCol.col).border = BORDER_THIN;
        });
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
                const trimmed = val.trim();
                if (/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) {
                    return Number(trimmed);
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
        });

        hotelCols.forEach(hCol => {
            // Find option hotels from builder if available
            let optHotelNames = [];

            if (builderOptions) {
                const matchedOpt = builderOptions.find(o => {
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
            optHotelNames.forEach(hLine => {
                const rOptHotel = ws.getRow(currentRow++);
                rOptHotel.getCell(3).value = hLine.startsWith('With ') ? hLine : `With ${hCol.cardLabel} ${hLine}`;
                rOptHotel.getCell(3).font = { name: 'Arial', size: 10 };
            });

            // Print Price Card Row (Calculated buffer price directly from table)
            const rPriceCard = ws.getRow(currentRow++);
            const cardPriceVal = hCol.calculatedBufferPrice || 0;
            const displayPrice = `LKR ${cardPriceVal.toLocaleString('en-US')} Per Person (Minimum ${paxStr})`;

            rPriceCard.getCell(3).value = displayPrice;
            rPriceCard.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
            rPriceCard.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.cardColor } };
            currentRow += 2; // Spacing between cards
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
