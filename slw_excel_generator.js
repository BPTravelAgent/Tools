/**
 * SLW Dynamic Tour Costing Excel Generator (.xlsx)
 * Replicates the exact styling, formulas, structure, and quotation cards of "Sample For exel.xlsx".
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
        HEADER_MAUVE: 'FFD5A6BD',     // 4* Hotel Option Headers #D5A6BD
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

    /**
     * Generate Excel Workbook
     * @param {Object} payload 
     * @returns {Promise<ExcelJS.Workbook>}
     */
    async function createCostingWorkbook(payload) {
        if (!ExcelJS) {
            throw new Error('ExcelJS is not available in the current context.');
        }

        const wb = new ExcelJS.Workbook();
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

        // Cities & Hotels
        const cities = payload.cities || [];
        const tours = payload.tours || [];
        const transfers = payload.transfers || [];

        // Sheet Setup
        const sheetTitle = (tourTitle.length > 28 ? tourTitle.substring(0, 28) : tourTitle) || 'Tour Costing';
        const ws = wb.addWorksheet(sheetTitle, {
            views: [{ showGridLines: true }]
        });

        // Set Standard Column Widths (matching Sample For exel.xlsx)
        ws.getColumn(1).width = 22;   // A
        ws.getColumn(2).width = 16;   // B
        ws.getColumn(3).width = 106.5;// C (Activity descriptions)
        ws.getColumn(4).width = 12;   // D (Meal)
        ws.getColumn(5).width = 8;    // E
        ws.getColumn(6).width = 12;   // F (Tour)
        ws.getColumn(7).width = 12;   // G (Transfer)
        ws.getColumn(8).width = 14;   // H (3* Hotel)
        ws.getColumn(9).width = 14;   // I (4* Option 1 / Mix)
        ws.getColumn(10).width = 14;  // J (4* Option 2)
        ws.getColumn(11).width = 10;
        ws.getColumn(12).width = 12;

        // Determine Hotel Column Titles
        const h3Title = '    3* Hotel ';
        let hMixTitle = '    4* Hotel ';
        if (cities.some(c => c.isSplit || (c.mixPref && c.mixPref !== '4'))) {
            hMixTitle = '   Mix Hotel ';
        }
        const h4Title = '    4* Hotel ';

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

        // 2. Day-by-Day Generation
        let currentRow = 4;
        const totalNights = cities.reduce((sum, c) => sum + (Number(c.numberOfNights) || 1), 0);
        const totalDays = totalNights > 0 ? totalNights + 1 : Math.max(1, tours.length + 1);

        const remainingTours = [...tours];
        let currentCityIdx = 0;
        let nightsSpentInCurrentCity = 0;

        for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
            const isFirstDay = (dayNum === 1);
            const isLastDay = (dayNum === totalDays);
            const dayStr = `Day-${String(dayNum).padStart(2, '0')}-`;

            // Day Header Row
            const hdrRow = ws.getRow(currentRow);
            
            // Col C: Day Header
            hdrRow.getCell(3).value = dayStr;
            hdrRow.getCell(3).font = { name: 'Calibri', size: 11 };
            hdrRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DAY_PALE_GREEN } };
            hdrRow.getCell(3).border = BORDER_THIN;

            // Col D: Meal Header
            hdrRow.getCell(4).value = 'Meal ';
            hdrRow.getCell(4).font = { name: 'Calibri', size: 11 };
            hdrRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DAY_PALE_GREEN } };
            hdrRow.getCell(4).alignment = { horizontal: 'center' };
            hdrRow.getCell(4).border = BORDER_THIN;

            // Col F: Tour Header
            hdrRow.getCell(6).value = '   Tour ';
            hdrRow.getCell(6).font = { name: 'Calibri', size: 11 };
            hdrRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_GREEN } };
            hdrRow.getCell(6).alignment = { horizontal: 'center' };
            hdrRow.getCell(6).border = BORDER_THIN;

            // Col G: Transfer Header
            hdrRow.getCell(7).value = ' Transfer ';
            hdrRow.getCell(7).font = { name: 'Calibri', size: 11 };
            hdrRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_GREEN } };
            hdrRow.getCell(7).alignment = { horizontal: 'center' };
            hdrRow.getCell(7).border = BORDER_THIN;

            // Col H: 3* Hotel Header
            hdrRow.getCell(8).value = h3Title;
            hdrRow.getCell(8).font = { name: 'Calibri', size: 11 };
            hdrRow.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_GREEN } };
            hdrRow.getCell(8).alignment = { horizontal: 'center' };
            hdrRow.getCell(8).border = BORDER_THIN;

            // Col I: 4* Hotel / Mix Header
            hdrRow.getCell(9).value = hMixTitle;
            hdrRow.getCell(9).font = { name: 'Calibri', size: 11 };
            hdrRow.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_MAUVE } };
            hdrRow.getCell(9).alignment = { horizontal: 'center' };
            hdrRow.getCell(9).border = BORDER_THIN;

            // Col J: 4* Hotel Header (Option 2)
            hdrRow.getCell(10).value = h4Title;
            hdrRow.getCell(10).font = { name: 'Calibri', size: 11 };
            hdrRow.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER_MAUVE } };
            hdrRow.getCell(10).alignment = { horizontal: 'center' };
            hdrRow.getCell(10).border = BORDER_THIN;

            currentRow++;

            const curCity = cities[currentCityIdx] || {
                name: 'Bangkok',
                hotel3Name: 'Hotel 3*',
                hotel3Price: 1400,
                hotel4Name: 'Hotel 4*',
                hotel4Price: 1800,
                hotel5Price: 2200
            };

            const h3Price = Number(curCity.hotel3Price) || 1400;
            let hMixPrice = Number(curCity.hotel4Price) || 1500;
            if (curCity.mixPref === '3') hMixPrice = h3Price;
            if (curCity.mixPref === '5') hMixPrice = Number(curCity.hotel5Price) || 2000;
            const h4Price = Number(curCity.hotel4Price) || (h3Price + 300);

            if (isFirstDay) {
                // First Day: Arrival Transfer & Hotel Check-in
                const arrTr = transfers.find(tr => tr.name.toLowerCase().includes('arrival') || tr.name.toLowerCase().includes('airport to'));
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

                // Hotel Night 1 Rates on Arrival Row
                rowArr.getCell(8).value = h3Price;
                rowArr.getCell(8).font = { name: 'Arial', size: 10 };
                rowArr.getCell(8).alignment = { horizontal: 'right' };
                rowArr.getCell(8).border = BORDER_THIN;

                rowArr.getCell(9).value = hMixPrice;
                rowArr.getCell(9).font = { name: 'Arial', size: 10 };
                rowArr.getCell(9).alignment = { horizontal: 'right' };
                rowArr.getCell(9).border = BORDER_THIN;

                rowArr.getCell(10).value = h4Price;
                rowArr.getCell(10).font = { name: 'Arial', size: 10 };
                rowArr.getCell(10).alignment = { horizontal: 'right' };
                rowArr.getCell(10).border = BORDER_THIN;

                // Check-in Line
                const rowCheckin = ws.getRow(currentRow++);
                rowCheckin.getCell(3).value = `02.00pm Check in at ${curCity.name} Hotel`;
                rowCheckin.getCell(3).font = { name: 'Arial', size: 10 };
                rowCheckin.getCell(3).border = BORDER_THIN;

                // Optional Evening Tour on Day 1
                const eveningTourIdx = remainingTours.findIndex(t => t.name.toLowerCase().includes('dinner') || t.name.toLowerCase().includes('cruise'));
                if (eveningTourIdx !== -1) {
                    const eveningTour = remainingTours.splice(eveningTourIdx, 1)[0];
                    const rowEve = ws.getRow(currentRow++);
                    rowEve.getCell(3).value = eveningTour.name;
                    rowEve.getCell(3).font = { name: 'Arial', size: 10, bold: true };
                    rowEve.getCell(3).border = BORDER_THIN;

                    rowEve.getCell(6).value = Number(eveningTour.price) || 1150;
                    rowEve.getCell(6).font = { name: 'Arial', size: 10 };
                    rowEve.getCell(6).alignment = { horizontal: 'right' };
                    rowEve.getCell(6).border = BORDER_THIN;
                }

                // Overnight Line
                const rowOvernight = ws.getRow(currentRow++);
                rowOvernight.getCell(3).value = 'Overnight at Hotel';
                rowOvernight.getCell(3).font = { name: 'Arial', size: 10 };
                rowOvernight.getCell(3).border = BORDER_THIN;

                nightsSpentInCurrentCity++;

            } else if (isLastDay) {
                // Last Day: Breakfast, Check out, Departure Transfer
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

                // Departure Transfer
                const depTr = transfers.find(tr => tr.name.toLowerCase().includes('departure') || tr.name.toLowerCase().includes('to airport'));
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
                // Middle Days
                const rowBfast = ws.getRow(currentRow++);
                rowBfast.getCell(3).value = 'Breakfast at Hotel ';
                rowBfast.getCell(3).font = { name: 'Arial', size: 10 };
                rowBfast.getCell(3).border = BORDER_THIN;

                // Check city inter-transfer
                if (currentCityIdx < cities.length - 1 && nightsSpentInCurrentCity >= (Number(cities[currentCityIdx].numberOfNights) || 1)) {
                    currentCityIdx++;
                    nightsSpentInCurrentCity = 0;
                    const nextCity = cities[currentCityIdx];

                    rowBfast.getCell(4).value = '(B/--/D)';
                    rowBfast.getCell(4).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(4).alignment = { horizontal: 'center' };
                    rowBfast.getCell(4).border = BORDER_THIN;

                    // Hotel Night Rate for next city
                    const nextH3 = Number(nextCity.hotel3Price) || 1500;
                    let nextMix = Number(nextCity.hotel4Price) || 1500;
                    if (nextCity.mixPref === '3') nextMix = nextH3;
                    if (nextCity.mixPref === '5') nextMix = Number(nextCity.hotel5Price) || 2000;
                    const nextH4 = Number(nextCity.hotel4Price) || 2000;

                    rowBfast.getCell(8).value = nextH3;
                    rowBfast.getCell(8).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(8).alignment = { horizontal: 'right' };
                    rowBfast.getCell(8).border = BORDER_THIN;

                    rowBfast.getCell(9).value = nextMix;
                    rowBfast.getCell(9).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(9).alignment = { horizontal: 'right' };
                    rowBfast.getCell(9).border = BORDER_THIN;

                    rowBfast.getCell(10).value = nextH4;
                    rowBfast.getCell(10).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(10).alignment = { horizontal: 'right' };
                    rowBfast.getCell(10).border = BORDER_THIN;

                    // Intercity transfers
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
                    // Normal Middle Day in same city
                    rowBfast.getCell(4).value = '(B/L/--)';
                    rowBfast.getCell(4).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(4).alignment = { horizontal: 'center' };
                    rowBfast.getCell(4).border = BORDER_THIN;

                    rowBfast.getCell(8).value = h3Price;
                    rowBfast.getCell(8).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(8).alignment = { horizontal: 'right' };
                    rowBfast.getCell(8).border = BORDER_THIN;

                    rowBfast.getCell(9).value = hMixPrice;
                    rowBfast.getCell(9).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(9).alignment = { horizontal: 'right' };
                    rowBfast.getCell(9).border = BORDER_THIN;

                    rowBfast.getCell(10).value = h4Price;
                    rowBfast.getCell(10).font = { name: 'Arial', size: 10 };
                    rowBfast.getCell(10).alignment = { horizontal: 'right' };
                    rowBfast.getCell(10).border = BORDER_THIN;
                }

                // Daily Tour Activity
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

                // Overnight
                const rowOvernight = ws.getRow(currentRow++);
                rowOvernight.getCell(3).value = 'Overnight at Hotel';
                rowOvernight.getCell(3).font = { name: 'Arial', size: 10 };
                rowOvernight.getCell(3).border = BORDER_THIN;

                nightsSpentInCurrentCity++;
            }
        }

        const lastActivityRow = currentRow - 1;

        // ── LIVE FORMULAS & CALCULATION SECTION ──
        // 1. Subtotals Row
        const subtotalRowIdx = currentRow;
        const rSub = ws.getRow(subtotalRowIdx);

        // Column headers repeat or borders
        rSub.getCell(7).value = { formula: `SUM(G2:G${lastActivityRow})` };
        rSub.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rSub.getCell(7).border = BORDER_THIN;

        rSub.getCell(8).value = { formula: `SUM(H2:H${lastActivityRow})` };
        rSub.getCell(8).font = { name: 'Arial', size: 10, bold: true };
        rSub.getCell(8).border = BORDER_THIN;

        rSub.getCell(9).value = { formula: `SUM(I2:I${lastActivityRow})` };
        rSub.getCell(9).font = { name: 'Arial', size: 10, bold: true };
        rSub.getCell(9).border = BORDER_THIN;

        rSub.getCell(10).value = { formula: `SUM(J2:J${lastActivityRow})` };
        rSub.getCell(10).font = { name: 'Arial', size: 10, bold: true };
        rSub.getCell(10).border = BORDER_THIN;
        currentRow++;

        // 2. Per Pax Row
        const perPaxRowIdx = currentRow;
        const rPax = ws.getRow(perPaxRowIdx);

        rPax.getCell(3).value = 'Tour End!';
        rPax.getCell(3).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        rPax.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
        rPax.getCell(3).border = BORDER_THIN;

        // Tour Per Pax = Sum of tickets
        rPax.getCell(6).value = { formula: `SUM(F2:F${lastActivityRow})` };
        rPax.getCell(6).font = { name: 'Arial', size: 10, bold: true };
        rPax.getCell(6).border = BORDER_THIN;

        // Transfer Per Pax = G_subtotal / Pax
        rPax.getCell(7).value = { formula: `SUM(G${subtotalRowIdx}/${rawPax})` };
        rPax.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rPax.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
        rPax.getCell(7).border = BORDER_THIN;

        // Hotel Per Pax = H_subtotal / 2 (Double sharing)
        rPax.getCell(8).value = { formula: `SUM(H${subtotalRowIdx}/2)` };
        rPax.getCell(8).font = { name: 'Arial', size: 10 };
        rPax.getCell(8).border = BORDER_THIN;

        rPax.getCell(9).value = { formula: `SUM(I${subtotalRowIdx}/2)` };
        rPax.getCell(9).font = { name: 'Arial', size: 10 };
        rPax.getCell(9).border = BORDER_THIN;

        rPax.getCell(10).value = { formula: `SUM(J${subtotalRowIdx}/2)` };
        rPax.getCell(10).font = { name: 'Arial', size: 10 };
        rPax.getCell(10).border = BORDER_THIN;
        currentRow++;

        // Row for Star Category marker
        const rStar = ws.getRow(currentRow++);
        rStar.getCell(6).value = '3*';
        rStar.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        rStar.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
        rStar.getCell(6).alignment = { horizontal: 'center' };

        // 3. Net Package Cost Row (Inclusion Header on left)
        const netRowIdx = currentRow;
        const rNet = ws.getRow(netRowIdx);
        rNet.getCell(3).value = 'Inclusion ';
        rNet.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
        rNet.getCell(3).border = BORDER_THIN;

        rNet.getCell(8).value = { formula: `SUM(F${perPaxRowIdx}+G${perPaxRowIdx}+H${perPaxRowIdx})` };
        rNet.getCell(8).font = { name: 'Arial', size: 10, bold: true };
        rNet.getCell(8).border = BORDER_THIN;

        rNet.getCell(9).value = { formula: `SUM(F${perPaxRowIdx}+G${perPaxRowIdx}+I${perPaxRowIdx})` };
        rNet.getCell(9).font = { name: 'Arial', size: 10, bold: true };
        rNet.getCell(9).border = BORDER_THIN;

        rNet.getCell(10).value = { formula: `SUM(F${perPaxRowIdx}+G${perPaxRowIdx}+J${perPaxRowIdx})` };
        rNet.getCell(10).font = { name: 'Arial', size: 10, bold: true };
        rNet.getCell(10).border = BORDER_THIN;
        currentRow++;

        // 4. Inclusions Lines & Costing Breakdown (Rows 36 to 47 equivalent)
        const cityStayDesc = cities.length > 0 
            ? cities.map(c => `${c.numberOfNights}N ${c.name}`).join(' ') + ' Hotel Accomodation with Breakfast'
            : `${tourTitle} Hotel Accomodation with Breakfast`;

        // Row + 1: City Accommodations
        const rInc1 = ws.getRow(currentRow++);
        rInc1.getCell(3).value = cityStayDesc;
        rInc1.getCell(3).font = { name: 'Arial', size: 10 };

        // Row + 2: Transfers & Markup Row
        const markupRowIdx = currentRow;
        const rInc2 = ws.getRow(markupRowIdx);
        rInc2.getCell(3).value = 'Airport - Hotel - Airport Transfer Pvt Basis ';
        rInc2.getCell(3).font = { name: 'Arial', size: 10 };

        rInc2.getCell(7).value = `${markup3}%`;
        rInc2.getCell(7).font = { name: 'Calibri', size: 11, bold: true };
        rInc2.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
        rInc2.getCell(7).alignment = { horizontal: 'center' };
        rInc2.getCell(7).border = BORDER_THIN;

        // Formula for THB Selling Price with Markup
        rInc2.getCell(8).value = { formula: `SUM(H${netRowIdx}*${(100 + markup3)}/100)` };
        rInc2.getCell(8).font = { name: 'Calibri', size: 11, bold: true };
        rInc2.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
        rInc2.getCell(8).border = BORDER_THIN;

        rInc2.getCell(9).value = { formula: `SUM(I${netRowIdx}*${(100 + markupMix)}/100)` };
        rInc2.getCell(9).font = { name: 'Calibri', size: 11, bold: true };
        rInc2.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
        rInc2.getCell(9).border = BORDER_THIN;

        rInc2.getCell(10).value = { formula: `SUM(J${netRowIdx}*${(100 + markup4)}/100)` };
        rInc2.getCell(10).font = { name: 'Calibri', size: 11, bold: true };
        rInc2.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
        rInc2.getCell(10).border = BORDER_THIN;
        currentRow++;

        // Row + 3: Air-conditioned vehicles & Different / Profit Margin
        const profitRowIdx = currentRow;
        const rInc3 = ws.getRow(profitRowIdx);
        rInc3.getCell(3).value = 'Tour by air-conditioned vehicles';
        rInc3.getCell(3).font = { name: 'Arial', size: 10 };

        rInc3.getCell(7).value = 'Different';
        rInc3.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rInc3.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
        rInc3.getCell(7).alignment = { horizontal: 'center' };
        rInc3.getCell(7).border = BORDER_THIN;

        rInc3.getCell(8).value = { formula: `H${markupRowIdx}-H${netRowIdx}` };
        rInc3.getCell(8).font = { name: 'Arial', size: 10 };
        rInc3.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
        rInc3.getCell(8).border = BORDER_THIN;

        rInc3.getCell(9).value = { formula: `I${markupRowIdx}-I${netRowIdx}` };
        rInc3.getCell(9).font = { name: 'Arial', size: 10 };
        rInc3.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
        rInc3.getCell(9).border = BORDER_THIN;

        rInc3.getCell(10).value = { formula: `J${markupRowIdx}-J${netRowIdx}` };
        rInc3.getCell(10).font = { name: 'Arial', size: 10 };
        rInc3.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
        rInc3.getCell(10).border = BORDER_THIN;
        currentRow++;

        // Row + 4: Admissions & Transfers mentioned
        const rInc4 = ws.getRow(currentRow++);
        rInc4.getCell(3).value = 'All admisson fees & Transfers as mentioned in the above program';
        rInc4.getCell(3).font = { name: 'Arial', size: 10 };

        // Row + 5: First Tour & THB Label Row
        const thbRowIdx = currentRow;
        const rInc5 = ws.getRow(thbRowIdx);
        rInc5.getCell(3).value = tours[0] ? tours[0].name : 'Sightseeing Tours as mentioned';
        rInc5.getCell(3).font = { name: 'Arial', size: 10, bold: true };

        rInc5.getCell(7).value = 'THB';
        rInc5.getCell(7).font = { name: 'Calibri', size: 11, bold: true };
        rInc5.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
        rInc5.getCell(7).alignment = { horizontal: 'center' };
        rInc5.getCell(7).border = BORDER_THIN;

        rInc5.getCell(8).value = { formula: `H${markupRowIdx}` };
        rInc5.getCell(8).font = { name: 'Calibri', size: 11, bold: true };
        rInc5.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
        rInc5.getCell(8).border = BORDER_THIN;

        rInc5.getCell(9).value = { formula: `I${markupRowIdx}` };
        rInc5.getCell(9).font = { name: 'Calibri', size: 11, bold: true };
        rInc5.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
        rInc5.getCell(9).border = BORDER_THIN;

        rInc5.getCell(10).value = { formula: `J${markupRowIdx}` };
        rInc5.getCell(10).font = { name: 'Calibri', size: 11, bold: true };
        rInc5.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
        rInc5.getCell(10).border = BORDER_THIN;
        currentRow++;

        // Row + 6: Second Tour (if any)
        const rInc6 = ws.getRow(currentRow++);
        rInc6.getCell(3).value = tours[1] ? tours[1].name : 'Attraction Tickets & Guide Assistance';
        rInc6.getCell(3).font = { name: 'Arial', size: 10 };

        // Row + 7: Third Tour & LKR Currency Row
        const lkrRowIdx = currentRow;
        const rInc7 = ws.getRow(lkrRowIdx);
        rInc7.getCell(3).value = tours[2] ? tours[2].name : 'Sightseeing Activities';
        rInc7.getCell(3).font = { name: 'Arial', size: 10, bold: true };

        rInc7.getCell(7).value = 'LKR';
        rInc7.getCell(7).font = { name: 'Calibri', size: 11, bold: true };
        rInc7.getCell(7).alignment = { horizontal: 'center' };
        rInc7.getCell(7).border = BORDER_THIN;

        // Exchange rate conversion formulas
        rInc7.getCell(8).value = { formula: `SUM(H${thbRowIdx}*${roe})` };
        rInc7.getCell(8).font = { name: 'Arial', size: 10, bold: true };
        rInc7.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
        rInc7.getCell(8).border = BORDER_THIN;

        rInc7.getCell(9).value = { formula: `SUM(I${thbRowIdx}*${roe})` };
        rInc7.getCell(9).font = { name: 'Arial', size: 10, bold: true };
        rInc7.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
        rInc7.getCell(9).border = BORDER_THIN;

        rInc7.getCell(10).value = { formula: `SUM(J${thbRowIdx}*${roe})` };
        rInc7.getCell(10).font = { name: 'Arial', size: 10, bold: true };
        rInc7.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
        rInc7.getCell(10).border = BORDER_THIN;
        currentRow++;

        // Row + 8: Meals Count
        let breakfastCount = Math.max(0, totalDays - 1);
        let lunchCount = tours.filter(t => t.name.toLowerCase().includes('lunch')).length;
        let dinnerCount = tours.filter(t => t.name.toLowerCase().includes('dinner') || t.name.toLowerCase().includes('cruise')).length;
        const bStr = String(breakfastCount).padStart(2, '0') + ' Breakfast';
        const lStr = String(lunchCount).padStart(2, '0') + ' Lunch';
        const dStr = String(dinnerCount).padStart(2, '0') + ' Dinner';

        const rInc8 = ws.getRow(currentRow++);
        rInc8.getCell(3).value = `Meals (${bStr} / ${lStr} / ${dStr})`;
        rInc8.getCell(3).font = { name: 'Arial', size: 10 };

        // Empty row separator
        currentRow++;

        // Row + 9: Total Row
        const totRowIdx = currentRow;
        const rTot = ws.getRow(totRowIdx);
        rTot.getCell(7).value = 'Total';
        rTot.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rTot.getCell(7).alignment = { horizontal: 'center' };
        rTot.getCell(7).border = BORDER_THIN;

        rTot.getCell(8).value = { formula: `SUM(H${lkrRowIdx})` };
        rTot.getCell(8).font = { name: 'Arial', size: 10, bold: true };
        rTot.getCell(8).border = BORDER_THIN;

        rTot.getCell(9).value = { formula: `SUM(I${lkrRowIdx})` };
        rTot.getCell(9).font = { name: 'Arial', size: 10, bold: true };
        rTot.getCell(9).border = BORDER_THIN;

        rTot.getCell(10).value = { formula: `SUM(J${lkrRowIdx})` };
        rTot.getCell(10).font = { name: 'Arial', size: 10, bold: true };
        rTot.getCell(10).border = BORDER_THIN;
        currentRow++;

        // Row + 10: ROUNDUP to nearest 100
        const roundRowIdx = currentRow;
        const rRound = ws.getRow(roundRowIdx);
        rRound.getCell(8).value = { formula: `ROUNDUP(H${totRowIdx}, -2)` };
        rRound.getCell(8).font = { name: 'Arial', size: 10 };
        rRound.getCell(8).border = BORDER_THIN;

        rRound.getCell(9).value = { formula: `ROUNDUP(I${totRowIdx}, -2)` };
        rRound.getCell(9).font = { name: 'Arial', size: 10 };
        rRound.getCell(9).border = BORDER_THIN;

        rRound.getCell(10).value = { formula: `ROUNDUP(J${totRowIdx}, -2)` };
        rRound.getCell(10).font = { name: 'Arial', size: 10 };
        rRound.getCell(10).border = BORDER_THIN;
        currentRow++;

        // Row + 11: Final Buffer Row (+ 1000)
        const finalBufferRowIdx = currentRow;
        const rBuffer = ws.getRow(finalBufferRowIdx);
        rBuffer.getCell(8).value = { formula: `H${roundRowIdx}+${buffer}` };
        rBuffer.getCell(8).font = { name: 'Arial', size: 10, bold: true };
        rBuffer.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROUNDED_LIGHT_GREEN } };
        rBuffer.getCell(8).border = BORDER_THIN;

        rBuffer.getCell(9).value = { formula: `I${roundRowIdx}+${buffer}` };
        rBuffer.getCell(9).font = { name: 'Arial', size: 10, bold: true };
        rBuffer.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROUNDED_LIGHT_GREEN } };
        rBuffer.getCell(9).border = BORDER_THIN;

        rBuffer.getCell(10).value = { formula: `J${roundRowIdx}+${buffer}` };
        rBuffer.getCell(10).font = { name: 'Arial', size: 10, bold: true };
        rBuffer.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROUNDED_LIGHT_GREEN } };
        rBuffer.getCell(10).border = BORDER_THIN;
        currentRow++;

        // 5. Exclusions Section
        const rExcHdr = ws.getRow(currentRow++);
        rExcHdr.getCell(3).value = 'Exclusion ';
        rExcHdr.getCell(3).font = { name: 'Calibri', size: 11, bold: true };

        const rExc1 = ws.getRow(currentRow++);
        rExc1.getCell(3).value = 'Air fare';
        rExc1.getCell(3).font = { name: 'Arial', size: 10 };

        const rExc2 = ws.getRow(currentRow++);
        rExc2.getCell(3).value = 'Everything which is not mentioned in the program';
        rExc2.getCell(3).font = { name: 'Arial', size: 10 };

        const rExc3 = ws.getRow(currentRow++);
        rExc3.getCell(3).value = 'Thailand Visa';
        rExc3.getCell(3).font = { name: 'Arial', size: 10 };

        const rVal = ws.getRow(currentRow++);
        rVal.getCell(3).value = '              This Rate Valid for 07 days ';
        rVal.getCell(3).font = { name: 'Arial', size: 10, italic: true };

        // 6. Summary Client Quotation Cards
        currentRow += 1;

        // Card 1: 3-Star Option
        cities.forEach(c => {
            const rOptHotel = ws.getRow(currentRow++);
            rOptHotel.getCell(3).value = `With 3* Hotel Options ${c.name} - ${c.hotel3Name || 'AIM Hotel 3*'}, or Similar 3*`;
            rOptHotel.getCell(3).font = { name: 'Arial', size: 10 };
        });
        const rCard1Price = ws.getRow(currentRow++);
        rCard1Price.getCell(3).value = `LKR ${payload.rates?.p3 || '120,800'} Per Person (Minimum ${paxStr})`;
        rCard1Price.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
        rCard1Price.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
        currentRow += 2;

        // Card 2: Mix Option (4* & 3*)
        cities.forEach((c, idx) => {
            const rOptHotel = ws.getRow(currentRow++);
            const star = idx === 0 ? '4*' : '3*';
            const hName = idx === 0 ? (c.hotel4Name || 'Andakira Hotel 4*') : (c.hotel3Name || 'Picnic Hotel 3*');
            rOptHotel.getCell(3).value = `With ${star} Hotel Options ${c.name} - ${hName}, or Similar ${star}`;
            rOptHotel.getCell(3).font = { name: 'Arial', size: 10 };
        });
        const rCard2Price = ws.getRow(currentRow++);
        rCard2Price.getCell(3).value = `LKR ${payload.rates?.pMix || '124,200'} Per Person (Minimum ${paxStr})`;
        rCard2Price.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
        rCard2Price.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.CARD_YELLOW } };
        currentRow += 2;

        // Card 3: 4-Star Option (Full 4*)
        cities.forEach(c => {
            const rOptHotel = ws.getRow(currentRow++);
            rOptHotel.getCell(3).value = `With 4* Hotel Options ${c.name} - ${c.hotel4Name || 'De Prime Hotel 4*'}, or Similar 4*`;
            rOptHotel.getCell(3).font = { name: 'Arial', size: 10 };
        });
        const rCard3Price = ws.getRow(currentRow++);
        rCard3Price.getCell(3).value = `LKR ${payload.rates?.p4 || '131,700'} Per Person (Minimum ${paxStr})`;
        rCard3Price.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
        rCard3Price.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.CARD_YELLOW } };

        return wb;
    }

    /**
     * Browser Download Trigger
     * @param {Object} payload 
     * @param {string} filename 
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
