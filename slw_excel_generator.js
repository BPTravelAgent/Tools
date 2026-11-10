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
     * Check if a tour name already has a transfer or tour type tag
     */
    function hasExistingTourTag(name) {
        if (!name) return false;
        const lower = name.toLowerCase();
        return lower.includes('(join') ||
               lower.includes('(private') ||
               lower.includes('join transfer') ||
               lower.includes('join tour') ||
               lower.includes('private transfer') ||
               lower.includes('private van') ||
               lower.includes('private car') ||
               lower.includes('ticket only') ||
               lower.includes('transfer');
    }

    /**
     * Clean duplicated tags like (Join Tour) (Join Transfer)
     */
    function cleanTourNameTags(name) {
        if (!name) return '';
        let s = String(name).trim();
        const tagPattern = /\s*\((?:join\s+tour|join\s+transfer|private\s+transfer|join|private|ticket\s+only|private\s+tour)\)\s*\((?:join\s+tour|join\s+transfer|private\s+transfer|join|private|ticket\s+only|private\s+tour)\)/gi;
        while (tagPattern.test(s)) {
            s = s.replace(tagPattern, (m, p1) => ` (${p1.trim()})`);
        }
        return s.trim();
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
     * City detector for Thailand Tours
     */
    function detectTourCity(tourName, availableCities = []) {
        if (!tourName) return '';
        const norm = String(tourName).toLowerCase();

        // 0. Check active learned rules first
        try {
            const engine = (typeof root !== 'undefined' && root.SlwLearningEngine) ? root.SlwLearningEngine : (typeof window !== 'undefined' ? window.SlwLearningEngine : null);
            if (engine && typeof engine.getRules === 'function') {
                const rules = engine.getRules().filter(r => r.active !== false && r.city && r.pattern);
                for (const r of rules) {
                    if (norm.includes(r.pattern.toLowerCase())) {
                        const matchedCity = availableCities.find(c => c.name.toLowerCase() === r.city.toLowerCase());
                        return matchedCity ? matchedCity.name : r.city;
                    }
                }
            }
        } catch (e) {}
        
        for (const city of availableCities) {
            const cName = (city.name || '').toLowerCase();
            if (cName && norm.includes(cName)) return city.name;
        }
        
        const PATTAYA_KEYWORDS = [
            'pattaya', 'pataya', 'coral island', 'koh larn', 'big buddha', 'viewpoint', 'nong nooch',
            'tiger park', 'alcazar', 'tiffany', 'art in paradise', 'dolphinarium', 'sanctuary of truth',
            'ramayana', 'columbia pictures', 'floating market', 'floating market with rowing boat', 'pattaya floating', 'floting', 'rowing boat'
        ];
        for (const kw of PATTAYA_KEYWORDS) {
            if (norm.includes(kw)) return 'Pattaya';
        }
        
        const BANGKOK_KEYWORDS = [
            'bangkok', 'bankok', 'chao phraya', 'dinner cruise', 'cruise dinner', 'white orchid', 'meridian',
            'royal princess', 'alangka', 'chaophraya princess', 'dream world', 'safari world',
            'marine park', 'snow town', 'damnoen', 'maeklong', 'sea life', 'madame tussauds',
            'calypso', 'golden buddha', 'marble temple', 'reclining buddha', 'grand palace',
            'wat arun', 'wat pho', 'siam amazing', 'mahanakhon', 'pororo'
        ];
        for (const kw of BANGKOK_KEYWORDS) {
            if (norm.includes(kw)) return 'Bangkok';
        }
        
        const PHUKET_KEYWORDS = [
            'phuket', 'puket', 'phi phi', 'maya bay', 'khai island', 'james bond', 'phang nga',
            'similan', 'fantasea', 'carnival magic', 'siam niramit', 'promthep', 'racha island',
            'coral island phuket', 'kahung beach', 'tiger kingdom phuket', 'dolphin bay phuket', 'patong', 'karon', 'kata'
        ];
        for (const kw of PHUKET_KEYWORDS) {
            if (norm.includes(kw)) return 'Phuket';
        }
        
        const KRABI_KEYWORDS = [
            'krabi', '4 islands', 'four islands', 'hong island', 'emerald pool', 'hot springs',
            'ao nang', 'railay', 'phi phi from krabi'
        ];
        for (const kw of KRABI_KEYWORDS) {
            if (norm.includes(kw)) return 'Krabi';
        }

        const CHIANGMAI_KEYWORDS = [
            'chiang mai', 'chiangmai', 'chang mai', 'doi suthep', 'elephant sanctuary', 'night safari',
            'doi inthanon', 'white temple', 'chiang rai'
        ];
        for (const kw of CHIANGMAI_KEYWORDS) {
            if (norm.includes(kw)) return 'Chiang Mai';
        }

        return availableCities.length > 0 ? availableCities[0].name : 'Bangkok';
    }

    /**
     * Smart Day-by-Day Generation for Multi-City Packages
     */
    function generateSmartDays(selectedCities = [], selectedTours = [], selectedTransfers = []) {
        const totalNights = selectedCities.reduce((sum, c) => sum + (Number(c.numberOfNights) || 1), 0);
        const totalDays = totalNights > 0 ? totalNights + 1 : Math.max(1, selectedTours.length + 1);

        // Retrieve active learned rules from SLW Learning Engine
        let learnedRules = [];
        try {
            const engine = (typeof root !== 'undefined' && root.SlwLearningEngine) ? root.SlwLearningEngine : (typeof window !== 'undefined' ? window.SlwLearningEngine : null);
            if (engine && typeof engine.getRules === 'function') {
                learnedRules = engine.getRules().filter(r => r.active !== false);
            }
        } catch (e) {}

        // Group tours by city
        const toursByCity = {};
        selectedCities.forEach(c => {
            toursByCity[c.name.toLowerCase()] = [];
        });

        selectedTours.forEach(tour => {
            const detected = detectTourCity(tour.name, selectedCities).toLowerCase();
            if (toursByCity[detected]) {
                toursByCity[detected].push(tour);
            } else {
                const firstCity = selectedCities[0]?.name.toLowerCase() || 'bangkok';
                if (!toursByCity[firstCity]) toursByCity[firstCity] = [];
                toursByCity[firstCity].push(tour);
            }
        });

        // Helper to match and consume transfers
        const usedTransfers = new Set();
        const findTransfer = (predicate) => {
            for (const tr of selectedTransfers) {
                if (!usedTransfers.has(tr) && predicate(tr)) {
                    usedTransfers.add(tr);
                    return tr;
                }
            }
            return null;
        };

        const days = [];
        let currentCityIdx = 0;
        let nightsInCurCity = 0;

        // Helper to format hotel check-in without duplicating "or Similar"
        const formatHotelCheckIn = (hotelName, fallbackCity, star = '3*') => {
            let hName = (hotelName || `${fallbackCity.name} Hotel ${star}`).trim();
            hName = hName.replace(/(\s*,?\s*or\s+similar\s*(\d*\*?|\*)?)+/gi, '').trim();
            if (hName.endsWith(',')) hName = hName.slice(0, -1).trim();
            hName += ` or Similar ${star}`;
            return `14.00 Check in at ${hName}`;
        };

        for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
            const isFirstDay = (dayNum === 1);
            const isLastDay = (dayNum === totalDays);
            const dayTitle = `Day-${String(dayNum).padStart(2, '0')}`;
            const activities = [];
            let hasLunch = false;
            let hasDinner = false;

            const curCity = selectedCities[currentCityIdx] || { name: 'Bangkok', hotel3Name: 'Hotel 3*', hotel4Name: 'Hotel 4*' };
            const curCityKey = curCity.name.toLowerCase();
            const curCityTours = toursByCity[curCityKey] || [];

            if (isFirstDay) {
                // Day 1 Arrival in City 1
                const arrTr = findTransfer(tr => {
                    const n = tr.name.toLowerCase();
                    return n.includes(curCityKey) && (n.includes('arrival') || (n.includes('airport') && !n.includes('to airport') && !n.includes('departure')));
                }) || findTransfer(tr => {
                    const n = tr.name.toLowerCase();
                    return (n.includes('arrival') || n.includes('airport')) && !n.includes('departure') && !n.includes('to airport');
                });

                if (arrTr) {
                    activities.push(arrTr.name);
                } else {
                    activities.push(`Private Arrival at Airport and Transfer to ${curCity.name} Hotel`);
                }

                // Check if there is an arrival/en-route tour in City 1 (e.g. Pattaya City Tour - Big Buddha & Viewpoint)
                const cityTourIdx = curCityTours.findIndex(t => {
                    const n = t.name.toLowerCase();
                    if (learnedRules.some(r => r.type === 'en_route' && r.timing === 'day_1_en_route' && n.includes(r.pattern))) return true;
                    return n.includes('city tour') || n.includes('half day') || n.includes('viewpoint') || n.includes('big buddha');
                });

                if (cityTourIdx !== -1) {
                    const cityTour = curCityTours.splice(cityTourIdx, 1)[0];
                    let cleanName = cleanTourNameTags(cityTour.name);
                    let tag = cityTour.transferPrice > 0 ? '(Private Transfer)' : '(Join Transfer)';
                    if (hasExistingTourTag(cleanName)) tag = '';
                    activities.push(cleanTourNameTags(`${cleanName}${tag ? ' ' + tag : ''}`.trim()));
                    if (cleanName.toLowerCase().includes('lunch')) hasLunch = true;
                    if (cleanName.toLowerCase().includes('dinner')) hasDinner = true;
                }

                activities.push(formatHotelCheckIn(curCity.hotel3Name, curCity, '3*'));

                // If arrival is in Bangkok and there is an evening dinner cruise, place it
                if (curCityKey === 'bangkok') {
                    const eveIdx = curCityTours.findIndex(t => t.name.toLowerCase().includes('dinner') || t.name.toLowerCase().includes('cruise'));
                    if (eveIdx !== -1) {
                        const eveTour = curCityTours.splice(eveIdx, 1)[0];
                        let cleanEveName = cleanTourNameTags(eveTour.name);
                        let tag = eveTour.transferPrice > 0 ? '(Private Transfer)' : '(Join Transfer)';
                        if (hasExistingTourTag(cleanEveName)) tag = '';
                        activities.push(cleanTourNameTags(`${cleanEveName}${tag ? ' ' + tag : ''}`.trim()));
                        hasDinner = true;
                    }
                }

                activities.push("Overnight at Hotel");
                nightsInCurCity++;

            } else if (isLastDay) {
                // Last Day Departure from Last City
                activities.push("Breakfast at Hotel");

                const depTr = findTransfer(tr => {
                    const n = tr.name.toLowerCase();
                    return n.includes(curCityKey) && (n.includes('departure') || n.includes('to airport') || (n.includes('airport') && !n.includes('arrival')));
                }) || findTransfer(tr => {
                    const n = tr.name.toLowerCase();
                    return (n.includes('departure') || n.includes('to airport')) && !n.includes('arrival');
                }) || findTransfer(tr => {
                    const n = tr.name.toLowerCase();
                    return n.includes('airport') && !n.includes('arrival');
                });

                if (depTr) {
                    activities.push(depTr.name);
                } else {
                    activities.push(`Private Transfer ${curCity.name} Hotel to Airport`);
                }

                activities.push("12.00pm Checkout from Hotel");
                activities.push("Tour End!");

            } else {
                // Intermediate Days
                activities.push("Breakfast at Hotel");

                // Check if today is a transition day to the next city
                const isCityTransitionDay = (currentCityIdx < selectedCities.length - 1 && nightsInCurCity >= (Number(selectedCities[currentCityIdx].numberOfNights) || 1));

                if (isCityTransitionDay) {
                    const prevCity = selectedCities[currentCityIdx];
                    currentCityIdx++;
                    nightsInCurCity = 0;
                    const nextCity = selectedCities[currentCityIdx];
                    const nextCityKey = nextCity.name.toLowerCase();
                    const prevCityKey = prevCity.name.toLowerCase();
                    const nextCityTours = toursByCity[nextCityKey] || [];

                    activities.push("12.00 Check out from Hotel");

                    // 1. Direct Intercity Transfer between prevCity and nextCity (e.g. Pattaya to Bangkok)
                    const directInterTr = findTransfer(tr => {
                        const n = tr.name.toLowerCase();
                        return (n.includes(prevCityKey) && n.includes(nextCityKey)) || 
                               (n.includes(nextCityKey) && n.includes(prevCityKey));
                    });

                    if (directInterTr) {
                        activities.push(directInterTr.name);
                    } else {
                        // 2. Multi-leg / Domestic Flight Transfer (e.g. Phuket to Pattaya/Bangkok):
                        // Leg 1: Departure transfer in prevCity (prevCity hotel to airport)
                        const leg1 = findTransfer(tr => {
                            const n = tr.name.toLowerCase();
                            return n.includes(prevCityKey) && (n.includes('departure') || n.includes('to airport') || (n.includes('airport') && !n.includes('arrival')));
                        });
                        if (leg1) activities.push(leg1.name);

                        // Leg 2: Arrival transfer in nextCity (airport to nextCity hotel)
                        const leg2 = findTransfer(tr => {
                            const n = tr.name.toLowerCase();
                            return n.includes(nextCityKey) && (n.includes('arrival') || n.includes('from airport') || (n.includes('airport') && !n.includes('departure')));
                        });
                        if (leg2) activities.push(leg2.name);

                        // Fallback if neither found
                        if (!leg1 && !leg2) {
                            activities.push(`Private Transfer ${prevCity.name} Hotel to ${nextCity.name} Hotel (Private Transfer)`);
                        }
                    }

                    activities.push(formatHotelCheckIn(nextCity.hotel3Name, nextCity, '3*'));

                    // Check for evening or afternoon tour in next city:
                    // Priority A: Evening / Dinner cruise tour
                    let trTourIdx = nextCityTours.findIndex(t => {
                        const n = t.name.toLowerCase();
                        if (learnedRules.some(r => (r.type === 'tour_timing' || r.type === 'evening_tour') && n.includes(r.pattern))) return true;
                        return n.includes('dinner') || n.includes('cruise');
                    });

                    // Priority B: If no dinner cruise, but there are multiple tours in nextCity (e.g. Pattaya has Floating Market + Coral Island):
                    // place the half-day / non-lunch tour on the transition day!
                    if (trTourIdx === -1 && nextCityTours.length > 1) {
                        trTourIdx = nextCityTours.findIndex(t => {
                            const n = t.name.toLowerCase();
                            return !n.includes('lunch') && !n.includes('full day') && !n.includes('island');
                        });
                        if (trTourIdx === -1) trTourIdx = 0;
                    }

                    if (trTourIdx !== -1) {
                        const trTour = nextCityTours.splice(trTourIdx, 1)[0];
                        let cleanTrName = cleanTourNameTags(trTour.name);
                        let tag = trTour.transferPrice > 0 ? '(Private Transfer)' : '(Join Transfer)';
                        if (hasExistingTourTag(cleanTrName)) tag = '';
                        activities.push(cleanTourNameTags(`${cleanTrName}${tag ? ' ' + tag : ''}`.trim()));
                        if (cleanTrName.toLowerCase().includes('lunch')) hasLunch = true;
                        if (cleanTrName.toLowerCase().includes('dinner') || cleanTrName.toLowerCase().includes('cruise')) hasDinner = true;
                    }

                    activities.push("Overnight at Hotel");
                    nightsInCurCity++;

                } else {
                    // Regular stay day in curCity
                    if (curCityTours.length > 0) {
                        const tour = curCityTours.shift();
                        let cleanTourName = cleanTourNameTags(tour.name);
                        let tag = tour.transferPrice > 0 ? '(Private Transfer)' : '(Join Transfer)';
                        if (hasExistingTourTag(cleanTourName)) tag = '';
                        activities.push(cleanTourNameTags(`${cleanTourName}${tag ? ' ' + tag : ''}`.trim()));
                        if (cleanTourName.toLowerCase().includes('lunch')) hasLunch = true;
                        if (cleanTourName.toLowerCase().includes('dinner') || cleanTourName.toLowerCase().includes('cruise')) hasDinner = true;
                    } else {
                        activities.push("Free For Leisure");
                    }

                    activities.push("Overnight at Hotel");
                    nightsInCurCity++;
                }
            }

            // Accurate Meal code based on actual scheduled activities
            let mealStr = '';
            if (isFirstDay) {
                mealStr = hasDinner ? '(--/--/D)' : '(--/--/--)';
            } else {
                const b = 'B';
                const l = hasLunch ? 'L' : '--';
                const d = hasDinner ? 'D' : '--';
                mealStr = `(${b}/${l}/${d})`;
            }

            days.push({
                id: dayNum,
                day: dayTitle,
                title: dayTitle,
                meal: mealStr,
                activities: activities
            });
        }

        return days;
    }

    /**
     * Smart matcher for transfers from itinerary activity text
     */
    function matchAndConsumeTransfer(actText, transferList) {
        if (!actText || !transferList || transferList.length === 0) return null;
        const norm = normalizeText(actText);
        if (!norm) return null;

        const cleanKey = (txt) => {
            return normalizeText(txt)
                .replace(/\b(private|join|pvt|transfer|car|van|bus|basis)\b/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const normKey = cleanKey(actText);

        // 1. Direct or key-based exact match
        for (let i = 0; i < transferList.length; i++) {
            const tr = transferList[i];
            const trNorm = normalizeText(tr.name);
            const trKey = cleanKey(tr.name);
            if (!trNorm) continue;
            if (norm.includes(trNorm) || trNorm.includes(norm) || (normKey && trKey && (normKey === trKey || normKey.includes(trKey) || trKey.includes(normKey)))) {
                return transferList.splice(i, 1)[0];
            }
        }

        // 2. City-specific Intercity transfer match (e.g. Pattaya to Bangkok, Phuket to Krabi)
        const isIntercity = (norm.includes('hotel to') && norm.includes('hotel')) || 
                            (norm.includes('pattaya') && norm.includes('bangkok')) ||
                            (norm.includes('phuket') && norm.includes('krabi'));
        if (isIntercity) {
            const interIdx = transferList.findIndex(t => {
                const tn = normalizeText(t.name);
                if (norm.includes('pattaya') && norm.includes('bangkok')) {
                    return tn.includes('pattaya') && tn.includes('bangkok');
                }
                if (norm.includes('phuket') && norm.includes('krabi')) {
                    return tn.includes('phuket') && tn.includes('krabi');
                }
                return (tn.includes('hotel to') && tn.includes('hotel')) || (!tn.includes('arrival') && !tn.includes('departure') && !tn.includes('airport'));
            });
            if (interIdx !== -1) return transferList.splice(interIdx, 1)[0];
        }

        // 3. Semantic keywords: arrival (Airport to Hotel)
        const isArrival = norm.includes('arrival') || (norm.includes('airport') && (norm.includes('transfer to hotel') || norm.includes('to hotel')) && !norm.includes('departure') && !norm.includes('check out'));
        if (isArrival) {
            const arrIdx = transferList.findIndex(t => {
                const tn = normalizeText(t.name);
                return tn.includes('arrival') || tn.includes('airport to') || (!tn.includes('departure') && tn.includes('airport') && !tn.includes('to airport'));
            });
            if (arrIdx !== -1) return transferList.splice(arrIdx, 1)[0];
        }

        // 4. Semantic keywords: departure (Hotel to Airport)
        const isDeparture = norm.includes('departure') || norm.includes('check out and transfer') || (norm.includes('hotel to airport') || norm.includes('to airport'));
        if (isDeparture) {
            const depIdx = transferList.findIndex(t => {
                const tn = normalizeText(t.name);
                return tn.includes('departure') || tn.includes('to airport') || (!tn.includes('arrival') && tn.includes('airport'));
            });
            if (depIdx !== -1) return transferList.splice(depIdx, 1)[0];
        }

        return null;
    }

    /**
     * Generate Excel Workbook
     * @param {Object} payload 
     * @returns {Promise<ExcelJS.Workbook>}
     */
    /**
     * Sanitize and format a worksheet tab name according to Excel rules
     * (<= 31 chars, no forbidden chars: \ / ? * : [ ], unique within workbook)
     */
    function sanitizeSheetName(rawName, existingNames = new Set()) {
        let clean = String(rawName || 'Option')
            .replace(/[\\\/\?\*\:\[\]]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (clean.length > 28) clean = clean.substring(0, 28).trim();
        if (!clean) clean = 'Tour Costing';

        let uniqueName = clean;
        let counter = 1;
        while (existingNames.has(uniqueName.toLowerCase())) {
            const suffix = ` (${counter})`;
            uniqueName = clean.substring(0, 31 - suffix.length).trim() + suffix;
            counter++;
        }
        existingNames.add(uniqueName.toLowerCase());
        return uniqueName;
    }

    function normalizePackagePayload(parentDoc, pkg, idx = 0) {
        const costing = pkg.costing || {};
        return {
            ...parentDoc,
            ...costing,
            ...pkg,
            inq: parentDoc.inq || pkg.inq,
            clientName: parentDoc.clientName || pkg.clientName,
            clientPhone: parentDoc.clientPhone || pkg.clientPhone,
            travelMonth: parentDoc.travelMonth || pkg.travelMonth,
            travelYear: parentDoc.travelYear || pkg.travelYear,
            travelMonthDate: parentDoc.travelMonthDate || pkg.travelMonthDate || parentDoc.date,
            monthDate: parentDoc.travelMonthDate || pkg.travelMonthDate || parentDoc.date,
            date: parentDoc.date || pkg.date,
            quotationDate: parentDoc.quotationDate || pkg.quotationDate || parentDoc.date,
            title: pkg.title || parentDoc.title || 'Tour Quotation',
            packageName: pkg.packageName || (`Option ${idx + 1}`),
            pax: pkg.pax || parentDoc.pax,
            paxText: pkg.paxText || parentDoc.paxText,
            transferPax: pkg.transferPax || costing.transferPax || parentDoc.transferPax || parentDoc.pax,
            hotelDivisor: pkg.hotelDivisor || costing.hotelDivisor || parentDoc.hotelDivisor || 2,
            cities: Array.isArray(costing.availableCities) ? costing.availableCities : (Array.isArray(pkg.cities) ? pkg.cities : (Array.isArray(parentDoc.cities) ? parentDoc.cities : [])),
            tours: Array.isArray(costing.availableTours) ? costing.availableTours : (Array.isArray(pkg.tours) ? pkg.tours : (Array.isArray(parentDoc.tours) ? parentDoc.tours : [])),
            transfers: Array.isArray(costing.availableTransfers) ? costing.availableTransfers : (Array.isArray(pkg.transfers) ? pkg.transfers : (Array.isArray(parentDoc.transfers) ? parentDoc.transfers : [])),
            days: pkg.itinerary?.days || costing.days || pkg.days || null,
            itinerary: pkg.itinerary || parentDoc.itinerary,
            rates: pkg.rates || parentDoc.rates,
            pricingAdj: costing.pricingAdj || pkg.pricingAdj || parentDoc.pricingAdj,
            pricingSummary: pkg.pricingSummary || parentDoc.pricingSummary,
            hasMix: (costing.hasMix !== undefined ? Boolean(costing.hasMix) : (pkg.hasMix !== undefined ? Boolean(pkg.hasMix) : Boolean(parentDoc.hasMix))) || Boolean(pkg.rates && pkg.rates.pMix && String(pkg.rates.pMix).replace(/[^0-9]/g, '') !== '0' && String(pkg.rates.pMix).trim() !== ''),
            isTplActive: costing.isTplActive !== undefined ? costing.isTplActive : (pkg.isTplActive !== undefined ? pkg.isTplActive : parentDoc.isTplActive),
            tplRoomsCount: costing.tplRoomsCount !== undefined ? costing.tplRoomsCount : (pkg.tplRoomsCount !== undefined ? pkg.tplRoomsCount : parentDoc.tplRoomsCount),
            totalRoomsCount: costing.totalRoomsCount !== undefined ? costing.totalRoomsCount : (pkg.totalRoomsCount !== undefined ? pkg.totalRoomsCount : parentDoc.totalRoomsCount),
            tplRate3: costing.tplRate3 !== undefined ? costing.tplRate3 : (pkg.tplRate3 !== undefined ? pkg.tplRate3 : parentDoc.tplRate3),
            tplRate4: costing.tplRate4 !== undefined ? costing.tplRate4 : (pkg.tplRate4 !== undefined ? pkg.tplRate4 : parentDoc.tplRate4),
            tplRate5: costing.tplRate5 !== undefined ? costing.tplRate5 : (pkg.tplRate5 !== undefined ? pkg.tplRate5 : parentDoc.tplRate5)
        };
    }

    /**
     * Add a complete costing worksheet to an existing workbook
     */
    async function addCostingWorksheetToWorkbook(wb, payload, tabName = null, existingSheetNames = new Set()) {
        // 1. Parse & Normalize Inputs
        const transferPax = Math.max(1, Number(payload.transferPax) || Number(payload.pax) || 2);
        const hotelDivisor = Math.max(1, Number(payload.hotelDivisor) || 2);
        const rawPax = transferPax;
        const paxStr = payload.paxText ? payload.paxText.replace(/\s+/g, '') : (String(transferPax).padStart(2, '0') + 'Pax');
        const inqRef = (payload.inq || 'INQ -' + Math.floor(10000 + Math.random() * 90000)).trim();
        const tourTitle = (payload.title || 'Tour Quotation').trim();
        const dateStr = payload.monthDate || payload.travelMonthDate || (new Date().toLocaleString('en-US', { month: 'short' }) + '-' + new Date().getFullYear());
        const roe = Number(payload.roe) || 10.8;
        const markup3 = (payload.markup3 !== undefined && payload.markup3 !== null && !isNaN(Number(payload.markup3))) ? Number(payload.markup3) : 18;
        const markupMix = (payload.markupMix !== undefined && payload.markupMix !== null && !isNaN(Number(payload.markupMix))) ? Number(payload.markupMix) : 20;
        const markup4 = (payload.markup4 !== undefined && payload.markup4 !== null && !isNaN(Number(payload.markup4))) ? Number(payload.markup4) : 25;
        const markupChildExtra3 = (!isNaN(Number(payload.markupChildExtra3)) && payload.markupChildExtra3 !== null) ? Number(payload.markupChildExtra3) : markup3;
        const markupChildShare3 = (!isNaN(Number(payload.markupChildShare3)) && payload.markupChildShare3 !== null) ? Number(payload.markupChildShare3) : markup3;
        const markupChildExtraMix = (!isNaN(Number(payload.markupChildExtraMix)) && payload.markupChildExtraMix !== null) ? Number(payload.markupChildExtraMix) : markupMix;
        const markupChildShareMix = (!isNaN(Number(payload.markupChildShareMix)) && payload.markupChildShareMix !== null) ? Number(payload.markupChildShareMix) : markupMix;
        const markupChildExtra4 = (!isNaN(Number(payload.markupChildExtra4)) && payload.markupChildExtra4 !== null) ? Number(payload.markupChildExtra4) : markup4;
        const markupChildShare4 = (!isNaN(Number(payload.markupChildShare4)) && payload.markupChildShare4 !== null) ? Number(payload.markupChildShare4) : markup4;
        const buffer = (!isNaN(Number(payload.buffer)) && payload.buffer !== null && payload.buffer !== undefined) ? Number(payload.buffer) : 1000;

        // TPL (Triple Room) Supplement Settings
        const isTplActive = Boolean(payload.isTplActive);
        const tplRoomsCount = isTplActive ? Math.max(0, Number(payload.tplRoomsCount) || 1) : 0;
        const totalRoomsCount = isTplActive ? Math.max(1, Number(payload.totalRoomsCount) || 1) : 1;
        const tplRate3 = isTplActive ? (Number(payload.tplRate3) >= 0 ? Number(payload.tplRate3) : 800) : 0;
        const tplRate4 = isTplActive ? (Number(payload.tplRate4) >= 0 ? Number(payload.tplRate4) : 1000) : 0;
        const tplRate5 = isTplActive ? (Number(payload.tplRate5) >= 0 ? Number(payload.tplRate5) : 1200) : 0;

        // Cities, Tours, Transfers & Days
        const cities = payload.cities || [];
        const tours = [...(payload.tours || [])];
        const transfers = [...(payload.transfers || [])];
        let days = Array.isArray(payload.days) && payload.days.length > 0 ? payload.days : null;
        if (!days || days.length === 0) {
            days = generateSmartDays(cities, tours, transfers);
        }

        // 2. Determine Mix Package Presence
        let hasMix = false;
        if (typeof payload.hasMix === 'boolean') {
            hasMix = payload.hasMix;
        } else if (payload.rates && payload.rates.pMix && String(payload.rates.pMix).replace(/[^0-9]/g, '') !== '0' && String(payload.rates.pMix).trim() !== '') {
            hasMix = true;
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
        let includeChildExtra = (typeof payload.includeChildExtraBed === 'boolean') ? payload.includeChildExtraBed : true;
        let includeChildShare = (typeof payload.includeChildSharingBed === 'boolean') ? payload.includeChildSharingBed : true;

        let hasChildPrices = false;
        if (typeof payload.hasChildPrices === 'boolean') {
            hasChildPrices = payload.hasChildPrices;
        } else if (payload.includeChildPrices === false) {
            hasChildPrices = false;
        } else {
            hasChildPrices = Boolean(
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
        }

        if (typeof payload.includeChildExtraBed === 'boolean' && typeof payload.includeChildSharingBed === 'boolean') {
            if (!includeChildExtra && !includeChildShare) {
                hasChildPrices = false;
            }
        }
        if (!hasChildPrices) {
            includeChildExtra = false;
            includeChildShare = false;
        }

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
            extraMarkup: markupChildExtra3,
            shareMarkup: markupChildShare3,
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
                extraMarkup: markupChildExtraMix,
                shareMarkup: markupChildShareMix,
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
                extraMarkup: markupChildExtra4,
                shareMarkup: markupChildShare4,
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
                extraMarkup: markupChildExtra4,
                shareMarkup: markupChildShare4,
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
        const defaultTitle = (tourTitle.length > 28 ? tourTitle.substring(0, 28) : tourTitle) || 'Tour Costing';
        const sheetTitle = tabName ? sanitizeSheetName(tabName, existingSheetNames) : sanitizeSheetName(payload.packageName || defaultTitle, existingSheetNames);
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

        // ── ROW 2: Tour Name Header (Matches User Design) ──
        const r2 = ws.getRow(2);
        const cellC2 = r2.getCell(3);
        cellC2.value = tourTitle;
        cellC2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
        cellC2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_GREEN } };
        const cellD2 = r2.getCell(4);
        cellD2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TITLE_GREEN } };

        // ── ROW 3: Pax, Child info, Month & Inquiry Ref (Matches User Screenshot: 02Pax-01Child(7y)-Dec-2026 | INQ-20177) ──
        const r3 = ws.getRow(3);
        const cellC3 = r3.getCell(3);
        const cleanPaxForHeader = (payload.paxText || paxStr || '').trim().replace(/\s*-\s*/g, '-').replace(/\s+/g, '');
        const cleanDateForHeader = (dateStr || '').trim().replace(/\s+/g, '');
        cellC3.value = (cleanPaxForHeader && cleanDateForHeader) ? `${cleanPaxForHeader}-${cleanDateForHeader}` : (cleanPaxForHeader || cleanDateForHeader);
        cellC3.font = { name: 'Calibri', size: 11, bold: false };

        const cellD3 = r3.getCell(4);
        let displayInq = (inqRef || '').trim();
        if (displayInq && !displayInq.toUpperCase().startsWith('INQ-')) {
            if (displayInq.toUpperCase().startsWith('INQ')) {
                displayInq = displayInq.replace(/^INQ\s*-?\s*/i, 'INQ-');
            } else {
                displayInq = 'INQ-' + displayInq;
            }
        }
        cellD3.value = displayInq;
        cellD3.font = { name: 'Calibri', size: 11, bold: true };
        cellD3.alignment = { horizontal: 'right' };

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
                let base3 = 0, base4 = 0, baseMix = 0;
                let curMixTplRate = tplRate3;
                let cityTpl3 = tplRate3;
                let cityTpl4 = tplRate4;
                let cityTpl5 = tplRate5;

                if (isStayNight) {
                    const curCity = getCityForNight(dayIdx);
                    base3 = Number(curCity.hotel3Price) || 1400;
                    base4 = Number(curCity.hotel4Price) || (base3 + 300);
                    baseMix = base4;
                    cityTpl3 = (curCity.hotel3Tpl !== undefined && curCity.hotel3Tpl !== null) ? Number(curCity.hotel3Tpl) : tplRate3;
                    cityTpl4 = (curCity.hotel4Tpl !== undefined && curCity.hotel4Tpl !== null) ? Number(curCity.hotel4Tpl) : tplRate4;
                    cityTpl5 = (curCity.hotel5Tpl !== undefined && curCity.hotel5Tpl !== null) ? Number(curCity.hotel5Tpl) : tplRate5;
                    curMixTplRate = cityTpl4;
                    if (curCity.mixPref === '3') {
                        baseMix = base3;
                        curMixTplRate = cityTpl3;
                    } else if (curCity.mixPref === '5') {
                        baseMix = Number(curCity.hotel5Price) || base4;
                        curMixTplRate = cityTpl5;
                    }

                    if (isTplActive) {
                        h3Price = (totalRoomsCount * base3) + (tplRoomsCount * cityTpl3);
                        h4Price = (totalRoomsCount * base4) + (tplRoomsCount * cityTpl4);
                        hMixPrice = (totalRoomsCount * baseMix) + (tplRoomsCount * curMixTplRate);
                    } else {
                        h3Price = base3;
                        h4Price = base4;
                        hMixPrice = baseMix;
                    }
                }

                // 3. Render Activities for this Day
                let rawActs = Array.isArray(dayObj.activities) && dayObj.activities.length > 0 
                    ? [...dayObj.activities] 
                    : [isFirstDay ? 'Arrival and Transfer to Hotel' : (isLastDay ? 'Check out and Departure Transfer' : 'Free For Leisure')];
                
                // If this is a stay night with TPL room supplement enabled, guarantee at least 2 rows
                if (isStayNight && isTplActive && tplRoomsCount > 0 && rawActs.length < 2) {
                    rawActs.push('Overnight at Hotel');
                }
                
                let mealPlaced = false;
                let hotelBaseRatePlaced = false;
                let hotelTplRatePlaced = false;

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
                                let mealVal = 0;
                                if (hCol.key === 'h3') {
                                    formulaStr = `350*${nightsCount}`;
                                    mealVal = 350 * nightsCount;
                                } else if (hCol.key === 'hMix') {
                                    formulaStr = `450*2`;
                                    mealVal = 450 * 2;
                                } else if (hCol.key === 'h4') {
                                    formulaStr = `450*${nightsCount}`;
                                    mealVal = 450 * nightsCount;
                                }

                                row.getCell(hCol.childMealCol).value = { formula: formulaStr, result: mealVal };
                                row.getCell(hCol.childMealCol).font = { name: 'Arial', size: 10 };
                                row.getCell(hCol.childMealCol).alignment = { horizontal: 'right' };
                                row.getCell(hCol.childMealCol).border = BORDER_THIN;
                            });
                        } else if (hasMix && (actIdx === 2 || cleanAct.toLowerCase().includes('transfer') || actIdx === rawActs.length - 1)) {
                            const mixColObj = hotelCols.find(h => h.key === 'hMix');
                            if (mixColObj) {
                                const mixNights = Math.max(1, nightsCount - 2);
                                const mixMealVal = 350 * mixNights;
                                row.getCell(mixColObj.childMealCol).value = { formula: `350*${mixNights}`, result: mixMealVal };
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

                        // If tour has dedicated private transfer addon (e.g. Pattaya City Tour private van 1200 THB), place in Transfer column (Col 7)
                        let trAddonPrice = Number(matchedTour.transferPrice) || 0;
                        if (trAddonPrice <= 0) {
                            try {
                                const engine = (typeof root !== 'undefined' && root.SlwLearningEngine) ? root.SlwLearningEngine : (typeof window !== 'undefined' ? window.SlwLearningEngine : null);
                                if (engine && typeof engine.getRules === 'function') {
                                    const addonRule = engine.getRules().find(r => r.active !== false && r.type === 'transfer_addon' && matchedTour.name.toLowerCase().includes(r.pattern));
                                    if (addonRule && Number(addonRule.transferPrice) > 0) {
                                        trAddonPrice = Number(addonRule.transferPrice);
                                    }
                                }
                            } catch (e) {}
                        }
                        if (trAddonPrice > 0) {
                            row.getCell(7).value = trAddonPrice;
                            row.getCell(7).font = { name: 'Arial', size: 10 };
                            row.getCell(7).alignment = { horizontal: 'right' };
                        }
                    }
                    row.getCell(6).border = BORDER_THIN;

                    // Match Transfers (if transfer column not already filled by tour transfer addon)
                    if (!row.getCell(7).value) {
                        const matchedTransfer = matchAndConsumeTransfer(actText, remainingTransfers);
                        if (matchedTransfer) {
                            row.getCell(7).value = Number(matchedTransfer.price) || 0;
                            row.getCell(7).font = { name: 'Arial', size: 10 };
                            row.getCell(7).alignment = { horizontal: 'right' };
                        }
                    }
                    row.getCell(7).border = BORDER_THIN;

                    // Place Hotel Rates on designated row for overnight stay
                    const shouldPlaceBaseHotelRate = isStayNight && !hotelBaseRatePlaced && (actIdx === 0 || actText.toLowerCase().includes('arrival') || actText.toLowerCase().includes('breakfast'));
                    if (shouldPlaceBaseHotelRate) {
                        hotelCols.forEach(hCol => {
                            let bPrice = totalRoomsCount * base3;
                            if (hCol.key === 'hMix') {
                                bPrice = totalRoomsCount * baseMix;
                            } else if (hCol.key === 'h4') {
                                bPrice = totalRoomsCount * base4;
                            }

                            row.getCell(hCol.col).value = bPrice;
                            row.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                            row.getCell(hCol.col).alignment = { horizontal: 'right' };
                            row.getCell(hCol.col).border = BORDER_THIN;
                        });
                        hotelBaseRatePlaced = true;
                    } else if (isStayNight && isTplActive && tplRoomsCount > 0 && hotelBaseRatePlaced && !hotelTplRatePlaced) {
                        // Place TPL Room Supplement on Row 2 directly under Base Rate (matches agency standard & Screenshot 2)
                        hotelCols.forEach(hCol => {
                            let sPrice = tplRoomsCount * cityTpl3;
                            if (hCol.key === 'hMix') {
                                sPrice = tplRoomsCount * curMixTplRate;
                            } else if (hCol.key === 'h4') {
                                sPrice = tplRoomsCount * cityTpl4;
                            }

                            if (sPrice > 0) {
                                row.getCell(hCol.col).value = sPrice;
                            }
                            row.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                            row.getCell(hCol.col).alignment = { horizontal: 'right' };
                            row.getCell(hCol.col).border = BORDER_THIN;
                        });
                        hotelTplRatePlaced = true;
                    } else {
                        hotelCols.forEach(hCol => {
                            row.getCell(hCol.col).border = BORDER_THIN;
                        });
                    }
                });

                // Safety: if hotel base rate was not placed on any activity of a stay day, put it on first activity row
                if (isStayNight && !hotelBaseRatePlaced) {
                    const firstActRowIdx = currentRow - rawActs.length;
                    const fRow = ws.getRow(firstActRowIdx);
                    hotelCols.forEach(hCol => {
                        let bPrice = totalRoomsCount * base3;
                        if (hCol.key === 'hMix') bPrice = totalRoomsCount * baseMix;
                        else if (hCol.key === 'h4') bPrice = totalRoomsCount * base4;
                        fRow.getCell(hCol.col).value = bPrice;
                        fRow.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                        fRow.getCell(hCol.col).alignment = { horizontal: 'right' };
                    });
                }
                // Safety: if TPL supplement rate was not placed on any activity of a stay day, put it on second activity row
                if (isStayNight && isTplActive && tplRoomsCount > 0 && !hotelTplRatePlaced && rawActs.length >= 2) {
                    const secondActRowIdx = currentRow - rawActs.length + 1;
                    const sRow = ws.getRow(secondActRowIdx);
                    hotelCols.forEach(hCol => {
                        let sPrice = tplRoomsCount * cityTpl3;
                        if (hCol.key === 'hMix') sPrice = tplRoomsCount * curMixTplRate;
                        else if (hCol.key === 'h4') sPrice = tplRoomsCount * cityTpl4;
                        if (sPrice > 0) {
                            sRow.getCell(hCol.col).value = sPrice;
                            sRow.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                            sRow.getCell(hCol.col).alignment = { horizontal: 'right' };
                        }
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

                const base3 = Number(curCity.hotel3Price) || 1400;
                let baseMix = Number(curCity.hotel4Price) || 1500;
                let curMixTplRate = tplRate4;
                if (curCity.mixPref === '3') {
                    baseMix = base3;
                    curMixTplRate = tplRate3;
                } else if (curCity.mixPref === '5') {
                    baseMix = Number(curCity.hotel5Price) || 2000;
                    curMixTplRate = tplRate5;
                }
                const base4 = Number(curCity.hotel4Price) || (base3 + 300);

                let h3Price = isTplActive ? ((totalRoomsCount * base3) + (tplRoomsCount * tplRate3)) : base3;
                let h4Price = isTplActive ? ((totalRoomsCount * base4) + (tplRoomsCount * tplRate4)) : base4;
                let hMixPrice = isTplActive ? ((totalRoomsCount * baseMix) + (tplRoomsCount * curMixTplRate)) : baseMix;

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
                        let bPrice = totalRoomsCount * base3;
                        if (hCol.key === 'hMix') {
                            bPrice = totalRoomsCount * baseMix;
                        } else if (hCol.key === 'h4') {
                            bPrice = totalRoomsCount * base4;
                        }

                        rowArr.getCell(hCol.col).value = bPrice;
                        rowArr.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                        rowArr.getCell(hCol.col).alignment = { horizontal: 'right' };
                        rowArr.getCell(hCol.col).border = BORDER_THIN;
                    });

                    const rowCheckin = ws.getRow(currentRow++);
                    rowCheckin.getCell(3).value = `02.00pm Check in at ${curCity.name} Hotel`;
                    rowCheckin.getCell(3).font = { name: 'Arial', size: 10 };
                    rowCheckin.getCell(3).border = BORDER_THIN;

                    if (isTplActive && tplRoomsCount > 0) {
                        hotelCols.forEach(hCol => {
                            let sPrice = tplRoomsCount * cityTpl3;
                            if (hCol.key === 'hMix') {
                                sPrice = tplRoomsCount * curMixTplRate;
                            } else if (hCol.key === 'h4') {
                                sPrice = tplRoomsCount * cityTpl4;
                            }
                            if (sPrice > 0) {
                                rowCheckin.getCell(hCol.col).value = sPrice;
                                rowCheckin.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                                rowCheckin.getCell(hCol.col).alignment = { horizontal: 'right' };
                            }
                            rowCheckin.getCell(hCol.col).border = BORDER_THIN;
                        });
                    }

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
                            let mealVal = 0;
                            if (hCol.key === 'h3') {
                                formulaStr = `350*${nightsCount}`;
                                mealVal = 350 * nightsCount;
                            } else if (hCol.key === 'hMix') {
                                formulaStr = `450*2`;
                                mealVal = 450 * 2;
                            } else if (hCol.key === 'h4') {
                                formulaStr = `450*${nightsCount}`;
                                mealVal = 450 * nightsCount;
                            }

                            rowBfast.getCell(hCol.childMealCol).value = { formula: formulaStr, result: mealVal };
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
                            const mixMealNights = Math.max(1, nightsCount - 2);
                            const mixMealVal = 350 * mixMealNights;
                            rowDep.getCell(mixColObj.childMealCol).value = { formula: `350*${mixMealNights}`, result: mixMealVal };
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

                        const nextBase3 = Number(nextCity.hotel3Price) || 1500;
                        let nextBaseMix = Number(nextCity.hotel4Price) || 1500;
                        let nextMixTplRate = tplRate4;
                        if (nextCity.mixPref === '3') {
                            nextBaseMix = nextBase3;
                            nextMixTplRate = tplRate3;
                        } else if (nextCity.mixPref === '5') {
                            nextBaseMix = Number(nextCity.hotel5Price) || 2000;
                            nextMixTplRate = tplRate5;
                        }
                        const nextBase4 = Number(nextCity.hotel4Price) || 2000;

                        const nextH3 = isTplActive ? ((totalRoomsCount * nextBase3) + (tplRoomsCount * tplRate3)) : nextBase3;
                        const nextH4 = isTplActive ? ((totalRoomsCount * nextBase4) + (tplRoomsCount * tplRate4)) : nextBase4;
                        const nextMix = isTplActive ? ((totalRoomsCount * nextBaseMix) + (tplRoomsCount * nextMixTplRate)) : nextBaseMix;

                        hotelCols.forEach(hCol => {
                            let bPrice = totalRoomsCount * nextBase3;
                            if (hCol.key === 'hMix') {
                                bPrice = totalRoomsCount * nextBaseMix;
                            } else if (hCol.key === 'h4') {
                                bPrice = totalRoomsCount * nextBase4;
                            }

                            rowBfast.getCell(hCol.col).value = bPrice;
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

                        if (isTplActive && tplRoomsCount > 0) {
                            hotelCols.forEach(hCol => {
                                let sPrice = tplRoomsCount * cityTpl3;
                                if (hCol.key === 'hMix') sPrice = tplRoomsCount * curMixTplRate;
                                else if (hCol.key === 'h4') sPrice = tplRoomsCount * cityTpl4;
                                if (sPrice > 0) {
                                    rowCheckinNext.getCell(hCol.col).value = sPrice;
                                    rowCheckinNext.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                                    rowCheckinNext.getCell(hCol.col).alignment = { horizontal: 'right' };
                                }
                                rowCheckinNext.getCell(hCol.col).border = BORDER_THIN;
                            });
                        }

                    } else {
                        rowBfast.getCell(4).value = '(B/L/--)';
                        rowBfast.getCell(4).font = { name: 'Arial', size: 10 };
                        rowBfast.getCell(4).alignment = { horizontal: 'center' };
                        rowBfast.getCell(4).border = BORDER_THIN;

                        hotelCols.forEach(hCol => {
                            let bPrice = totalRoomsCount * base3;
                            if (hCol.key === 'hMix') bPrice = totalRoomsCount * baseMix;
                            else if (hCol.key === 'h4') bPrice = totalRoomsCount * base4;

                            rowBfast.getCell(hCol.col).value = bPrice;
                            rowBfast.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                            rowBfast.getCell(hCol.col).alignment = { horizontal: 'right' };
                            rowBfast.getCell(hCol.col).border = BORDER_THIN;
                        });
                    }

                    let secondDayRow = null;
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
                        secondDayRow = rowTour;
                    } else {
                        const rowFree = ws.getRow(currentRow++);
                        rowFree.getCell(3).value = 'Free For Leisure';
                        rowFree.getCell(3).font = { name: 'Arial', size: 10 };
                        rowFree.getCell(3).border = BORDER_THIN;
                        secondDayRow = rowFree;
                    }

                    if (isTplActive && tplRoomsCount > 0 && secondDayRow) {
                        hotelCols.forEach(hCol => {
                            let sPrice = tplRoomsCount * cityTpl3;
                            if (hCol.key === 'hMix') sPrice = tplRoomsCount * curMixTplRate;
                            else if (hCol.key === 'h4') sPrice = tplRoomsCount * cityTpl4;
                            if (sPrice > 0) {
                                secondDayRow.getCell(hCol.col).value = sPrice;
                                secondDayRow.getCell(hCol.col).font = { name: 'Arial', size: 10 };
                                secondDayRow.getCell(hCol.col).alignment = { horizontal: 'right' };
                            }
                            secondDayRow.getCell(hCol.col).border = BORDER_THIN;
                        });
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

        // ── PRE-CALCULATE ACCURATE LIVE VALUES (FOR FORMULA CACHE & SUMMARY CARDS) ──
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

        const safeTransferPax = Math.max(1, Number(transferPax) || 2);
        const safeHotelDivisor = Math.max(1, Number(hotelDivisor) || 2);

        let tourSum = 0;
        let trSum = 0;
        for (let r = 2; r <= lastActivityRow; r++) {
            tourSum += extractNumericVal(ws.getRow(r).getCell(6).value);
            trSum += extractNumericVal(ws.getRow(r).getCell(7).value);
        }
        const trPerPax = Math.round((trSum / safeTransferPax) * 100) / 100;

        hotelCols.forEach(hCol => {
            let hSum = 0;
            let mealSum = 0;
            for (let r = 2; r <= lastActivityRow; r++) {
                hSum += extractNumericVal(ws.getRow(r).getCell(hCol.col).value);
                if (hasChildPrices) {
                    mealSum += extractNumericVal(ws.getRow(r).getCell(hCol.childMealCol).value);
                }
            }
            hCol.hotelSum = hSum;
            hCol.childMealSum = mealSum;
            hCol.hotelPerPax = Math.round((hSum / safeHotelDivisor) * 100) / 100;

            // Adult net & breakdown
            hCol.netAdult = Math.round((tourSum + trPerPax + hCol.hotelPerPax) * 100) / 100;
            hCol.thbAdult = Math.round(hCol.netAdult * (100 + hCol.markup) / 100 * 100) / 100;
            hCol.diffAdult = Math.round((hCol.thbAdult - hCol.netAdult) * 100) / 100;
            hCol.lkrAdult = Math.round(hCol.thbAdult * roe * 100) / 100;
            hCol.roundAdult = Math.ceil(hCol.lkrAdult / 100) * 100;
            hCol.bufferAdult = hCol.roundAdult + buffer;

            if (hasChildPrices) {
                // Child Extra Bed: Tour + Hotel / 2 (no transfer)
                hCol.netExtra = Math.round((tourSum + hCol.hotelPerPax) * 100) / 100;
                hCol.thbExtra = Math.round(hCol.netExtra * (100 + hCol.extraMarkup) / 100 * 100) / 100;
                hCol.diffExtra = Math.round((hCol.thbExtra - hCol.netExtra) * 100) / 100;
                hCol.lkrExtra = Math.round(hCol.thbExtra * roe * 100) / 100;
                hCol.roundExtra = Math.ceil(hCol.lkrExtra / 100) * 100;
                hCol.bufferExtra = hCol.roundExtra + buffer;

                // Child Sharing Bed: Tour + Child Meals (no hotel, no transfer)
                hCol.netShare = Math.round((tourSum + hCol.childMealSum) * 100) / 100;
                hCol.thbShare = Math.round(hCol.netShare * (100 + hCol.shareMarkup) / 100 * 100) / 100;
                hCol.diffShare = Math.round((hCol.thbShare - hCol.netShare) * 100) / 100;
                hCol.lkrShare = Math.round(hCol.thbShare * roe * 100) / 100;
                hCol.roundShare = Math.ceil(hCol.lkrShare / 100) * 100;
                hCol.bufferShare = hCol.roundShare + buffer;
            }
        });

        // ── LIVE FORMULAS & CALCULATION SECTION ──
        // 1. Subtotals Row
        const subtotalRowIdx = currentRow;
        const rSub = ws.getRow(subtotalRowIdx);
        rSub.getCell(7).value = { formula: `SUM(G2:G${lastActivityRow})`, result: trSum };
        rSub.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rSub.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rSub.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}2:${hCol.letter}${lastActivityRow})`, result: hCol.hotelSum };
            rSub.getCell(hCol.col).font = { name: 'Arial', size: 10, bold: true };
            rSub.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            hotelCols.forEach(hCol => {
                rSub.getCell(hCol.childMealCol).value = { formula: `SUM(${hCol.childMealLetter}2:${hCol.childMealLetter}${lastActivityRow})`, result: hCol.childMealSum };
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
        rPax.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.TOUR_END_GREEN } };
        rPax.getCell(4).border = BORDER_THIN;
        try { ws.mergeCells(perPaxRowIdx, 3, perPaxRowIdx, 4); } catch (e) {}

        rPax.getCell(6).value = { formula: `SUM(F2:F${lastActivityRow})`, result: tourSum };
        rPax.getCell(6).font = { name: 'Arial', size: 10, bold: true };
        rPax.getCell(6).border = BORDER_THIN;

        rPax.getCell(7).value = { formula: `SUM(G${subtotalRowIdx}/${safeTransferPax})`, result: trPerPax };
        rPax.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rPax.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
        rPax.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rPax.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}${subtotalRowIdx}/${safeHotelDivisor})`, result: hCol.hotelPerPax };
            rPax.getCell(hCol.col).font = { name: 'Arial', size: 10 };
            rPax.getCell(hCol.col).border = BORDER_THIN;
        });
        currentRow++;

        // Star Category marker & Rate Validity Row
        const rStar = ws.getRow(currentRow++);
        rStar.getCell(3).value = 'This Rate Valid for 07 days';
        rStar.getCell(3).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFF0000' } };
        rStar.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        try { ws.mergeCells(rStar.number, 3, rStar.number, 4); } catch (e) {}

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
            rNet.getCell(hCol.col).value = { formula: `SUM(F${perPaxRowIdx}+G${perPaxRowIdx}+${hCol.letter}${perPaxRowIdx})`, result: hCol.netAdult };
            rNet.getCell(hCol.col).font = { name: 'Arial', size: 10, bold: true };
            rNet.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            const spacerCol = hasMix ? 17 : 15;
            rNet.getCell(spacerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WHITE } };

            hotelCols.forEach(hCol => {
                // Extra Bed Net: Tour (F) + Hotel Per Pax
                rNet.getCell(hCol.extraCol).value = { formula: `SUM(F${perPaxRowIdx}+${hCol.letter}${perPaxRowIdx})`, result: hCol.netExtra };
                rNet.getCell(hCol.extraCol).font = { name: 'Arial', size: 10, bold: true };
                rNet.getCell(hCol.extraCol).border = BORDER_THIN;

                // Sharing Bed Net: Tour (F) + Child Meal Subtotal
                rNet.getCell(hCol.shareCol).value = { formula: `SUM(F${perPaxRowIdx}+${hCol.childMealLetter}${subtotalRowIdx})`, result: hCol.netShare };
                rNet.getCell(hCol.shareCol).font = { name: 'Arial', size: 10, bold: true };
                rNet.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // 4. Inclusions Breakdown Lines
        let allInclusionLines = [];
        if (Array.isArray(payload.inclusions) && payload.inclusions.length > 0) {
            allInclusionLines = payload.inclusions
                .map(i => cleanTourNameTags(stripHtml(i)))
                .filter(Boolean);
        } else {
            // Build fresh clean inclusions list if not provided
            const accLine = cities.length > 0 
                ? cities.map(c => `${c.numberOfNights}N ${c.name}`).join(' ') + ' 3* Hotel Accommdation with Breakfast'
                : `${stripHtml(tourTitle)} Hotel Accomodation with Breakfast`;
            allInclusionLines.push(accLine);
            allInclusionLines.push('Private Transfer from Airport - Hotel - Airport');
            allInclusionLines.push('Tour by air-conditioned vehicles');

            tours.forEach(t => {
                let nameWithTag = cleanTourNameTags(stripHtml(t.name).trim());
                if (!hasExistingTourTag(nameWithTag)) {
                    nameWithTag += t.transferPrice > 0 ? ' (Private Transfer)' : ' (Join Transfer)';
                }
                allInclusionLines.push(cleanTourNameTags(nameWithTag));
            });
        }

        // Ensure meal summary is included exactly once at the end of inclusions
        const mealItemIdx = allInclusionLines.findIndex(i => {
            const l = i.toLowerCase();
            return l.startsWith('meal') || l.includes('breakfast /') || l.includes('breakfast/');
        });

        let mealLine = '';
        if (mealItemIdx !== -1) {
            mealLine = allInclusionLines.splice(mealItemIdx, 1)[0];
        } else {
            let breakfastCount = Math.max(0, (days ? days.length : totalNights + 1) - 1);
            let lunchCount = tours.filter(t => (t.name || '').toLowerCase().includes('lunch')).length;
            let dinnerCount = tours.filter(t => (t.name || '').toLowerCase().includes('dinner') || (t.name || '').toLowerCase().includes('cruise')).length;
            const bStr = String(breakfastCount).padStart(2, '0') + ' Breakfast';
            const lStr = String(lunchCount).padStart(2, '0') + ' Lunch';
            const dStr = String(dinnerCount).padStart(2, '0') + ' Dinner';
            mealLine = `Meals (${bStr} / ${lStr} / ${dStr})`;
        }
        allInclusionLines.push(mealLine);

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

        function setIncCell(row, idx) {
            const val = allInclusionLines[idx] || '';
            row.getCell(3).value = val;
            if (val) {
                row.getCell(3).font = isTourOrMealInclusion(val) ? FONT_INC_BLUE : FONT_INC_BLACK;
            }
        }

        // Inc 1: City Stay
        const rInc1 = ws.getRow(currentRow++);
        setIncCell(rInc1, 0);

        // Inc 2: Transfers & Markup Row
        const markupRowIdx = currentRow;
        const rInc2 = ws.getRow(markupRowIdx);
        setIncCell(rInc2, 1);

        rInc2.getCell(7).value = `${hotelCols[0].markup}%`;
        rInc2.getCell(7).font = { name: 'Calibri', size: 11, bold: true };
        rInc2.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
        rInc2.getCell(7).alignment = { horizontal: 'center' };
        rInc2.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rInc2.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}${netRowIdx}*${(100 + hCol.markup)}/100)`, result: hCol.thbAdult };
            rInc2.getCell(hCol.col).font = { name: 'Calibri', size: 11, bold: true };
            rInc2.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
            rInc2.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            const extraLabelCol = hasMix ? 13 : 12;
            const shareLabelCol = hasMix ? 19 : 17;
            const spacerCol = hasMix ? 17 : 15;

            rInc2.getCell(extraLabelCol).value = `${hotelCols[0].extraMarkup}%`;
            rInc2.getCell(extraLabelCol).font = { name: 'Calibri', size: 11, bold: true };
            rInc2.getCell(extraLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
            rInc2.getCell(extraLabelCol).alignment = { horizontal: 'center' };
            rInc2.getCell(extraLabelCol).border = BORDER_THIN;

            rInc2.getCell(shareLabelCol).value = `${hotelCols[0].shareMarkup}%`;
            rInc2.getCell(shareLabelCol).font = { name: 'Calibri', size: 11, bold: true };
            rInc2.getCell(shareLabelCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
            rInc2.getCell(shareLabelCol).alignment = { horizontal: 'center' };
            rInc2.getCell(shareLabelCol).border = BORDER_THIN;

            rInc2.getCell(spacerCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.WHITE } };

            hotelCols.forEach(hCol => {
                rInc2.getCell(hCol.extraCol).value = { formula: `SUM(${hCol.extraLetter}${netRowIdx}*${(100 + hCol.extraMarkup)}/100)`, result: hCol.thbExtra };
                rInc2.getCell(hCol.extraCol).font = { name: 'Calibri', size: 11, bold: true };
                rInc2.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
                rInc2.getCell(hCol.extraCol).border = BORDER_THIN;

                rInc2.getCell(hCol.shareCol).value = { formula: `SUM(${hCol.shareLetter}${netRowIdx}*${(100 + hCol.shareMarkup)}/100)`, result: hCol.thbShare };
                rInc2.getCell(hCol.shareCol).font = { name: 'Calibri', size: 11, bold: true };
                rInc2.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.MARKUP_ORANGE } };
                rInc2.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Inc 3: Different / Profit Margin
        const profitRowIdx = currentRow;
        const rInc3 = ws.getRow(profitRowIdx);
        setIncCell(rInc3, 2);

        rInc3.getCell(7).value = 'Different';
        rInc3.getCell(7).font = { name: 'Arial', size: 10, bold: true };
        rInc3.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
        rInc3.getCell(7).alignment = { horizontal: 'center' };
        rInc3.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rInc3.getCell(hCol.col).value = { formula: `${hCol.letter}${markupRowIdx}-${hCol.letter}${netRowIdx}`, result: hCol.diffAdult };
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
                rInc3.getCell(hCol.extraCol).value = { formula: `${hCol.extraLetter}${markupRowIdx}-${hCol.extraLetter}${netRowIdx}`, result: hCol.diffExtra };
                rInc3.getCell(hCol.extraCol).font = { name: 'Arial', size: 10 };
                rInc3.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
                rInc3.getCell(hCol.extraCol).border = BORDER_THIN;

                rInc3.getCell(hCol.shareCol).value = { formula: `${hCol.shareLetter}${markupRowIdx}-${hCol.shareLetter}${netRowIdx}`, result: hCol.diffShare };
                rInc3.getCell(hCol.shareCol).font = { name: 'Arial', size: 10 };
                rInc3.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.DIFF_CREAM } };
                rInc3.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Inc 4: Admissions / Tour
        const rInc4 = ws.getRow(currentRow++);
        setIncCell(rInc4, 3);

        // Inc 5: THB Label Row
        const thbRowIdx = currentRow;
        const rInc5 = ws.getRow(thbRowIdx);
        setIncCell(rInc5, 4);

        rInc5.getCell(7).value = 'THB';
        rInc5.getCell(7).font = { name: 'Calibri', size: 11, bold: true };
        rInc5.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
        rInc5.getCell(7).alignment = { horizontal: 'center' };
        rInc5.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rInc5.getCell(hCol.col).value = { formula: `${hCol.letter}${markupRowIdx}`, result: hCol.thbAdult };
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
                rInc5.getCell(hCol.extraCol).value = { formula: `${hCol.extraLetter}${markupRowIdx}`, result: hCol.thbExtra };
                rInc5.getCell(hCol.extraCol).font = { name: 'Calibri', size: 11, bold: true };
                rInc5.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
                rInc5.getCell(hCol.extraCol).border = BORDER_THIN;

                rInc5.getCell(hCol.shareCol).value = { formula: `${hCol.shareLetter}${markupRowIdx}`, result: hCol.thbShare };
                rInc5.getCell(hCol.shareCol).font = { name: 'Calibri', size: 11, bold: true };
                rInc5.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.THB_GREEN } };
                rInc5.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Inc 6: Tour 2 (if any)
        const rInc6 = ws.getRow(currentRow++);
        setIncCell(rInc6, 5);

        // Inc 7: LKR Currency Row
        const lkrRowIdx = currentRow;
        const rInc7 = ws.getRow(lkrRowIdx);
        setIncCell(rInc7, 6);

        rInc7.getCell(7).value = 'LKR';
        rInc7.getCell(7).font = { name: 'Calibri', size: 11, bold: true };
        rInc7.getCell(7).alignment = { horizontal: 'center' };
        rInc7.getCell(7).border = BORDER_THIN;

        hotelCols.forEach(hCol => {
            rInc7.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}${thbRowIdx}*${roe})`, result: hCol.lkrAdult };
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
                rInc7.getCell(hCol.extraCol).value = { formula: `SUM(${hCol.extraLetter}${thbRowIdx}*${roe})`, result: hCol.lkrExtra };
                rInc7.getCell(hCol.extraCol).font = { name: 'Arial', size: 10, bold: true };
                rInc7.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
                rInc7.getCell(hCol.extraCol).border = BORDER_THIN;

                rInc7.getCell(hCol.shareCol).value = { formula: `SUM(${hCol.shareLetter}${thbRowIdx}*${roe})`, result: hCol.lkrShare };
                rInc7.getCell(hCol.shareCol).font = { name: 'Arial', size: 10, bold: true };
                rInc7.getCell(hCol.shareCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HIGHLIGHT_YELLOW } };
                rInc7.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Extra inclusions if any (beyond index 6)
        if (allInclusionLines.length > 7) {
            for (let incIdx = 7; incIdx < allInclusionLines.length; incIdx++) {
                const rExtraInc = ws.getRow(currentRow++);
                setIncCell(rExtraInc, incIdx);
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
            rTot.getCell(hCol.col).value = { formula: `SUM(${hCol.letter}${lkrRowIdx})`, result: hCol.lkrAdult };
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
                rTot.getCell(hCol.extraCol).value = { formula: `SUM(${hCol.extraLetter}${lkrRowIdx})`, result: hCol.lkrExtra };
                rTot.getCell(hCol.extraCol).font = { name: 'Arial', size: 10, bold: true };
                rTot.getCell(hCol.extraCol).border = BORDER_THIN;

                rTot.getCell(hCol.shareCol).value = { formula: `SUM(${hCol.shareLetter}${lkrRowIdx})`, result: hCol.lkrShare };
                rTot.getCell(hCol.shareCol).font = { name: 'Arial', size: 10, bold: true };
                rTot.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // ROUNDUP Row
        const roundRowIdx = currentRow;
        const rRound = ws.getRow(roundRowIdx);
        hotelCols.forEach(hCol => {
            rRound.getCell(hCol.col).value = { formula: `ROUNDUP(${hCol.letter}${totRowIdx}, -2)`, result: hCol.roundAdult };
            rRound.getCell(hCol.col).font = { name: 'Arial', size: 10 };
            rRound.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            hotelCols.forEach(hCol => {
                rRound.getCell(hCol.extraCol).value = { formula: `ROUNDUP(${hCol.extraLetter}${totRowIdx}, -2)`, result: hCol.roundExtra };
                rRound.getCell(hCol.extraCol).font = { name: 'Arial', size: 10 };
                rRound.getCell(hCol.extraCol).border = BORDER_THIN;

                rRound.getCell(hCol.shareCol).value = { formula: `ROUNDUP(${hCol.shareLetter}${totRowIdx}, -2)`, result: hCol.roundShare };
                rRound.getCell(hCol.shareCol).font = { name: 'Arial', size: 10 };
                rRound.getCell(hCol.shareCol).border = BORDER_THIN;
            });
        }
        currentRow++;

        // Final Buffer (+1000) Row
        const finalBufferRowIdx = currentRow;
        const rBuffer = ws.getRow(finalBufferRowIdx);
        hotelCols.forEach(hCol => {
            rBuffer.getCell(hCol.col).value = { formula: `${hCol.letter}${roundRowIdx}+${buffer}`, result: hCol.bufferAdult };
            rBuffer.getCell(hCol.col).font = { name: 'Arial', size: 10, bold: true };
            rBuffer.getCell(hCol.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROUNDED_LIGHT_GREEN } };
            rBuffer.getCell(hCol.col).border = BORDER_THIN;
        });

        if (hasChildPrices) {
            hotelCols.forEach(hCol => {
                rBuffer.getCell(hCol.extraCol).value = { formula: `${hCol.extraLetter}${roundRowIdx}+${buffer}`, result: hCol.bufferExtra };
                rBuffer.getCell(hCol.extraCol).font = { name: 'Calibri', size: 11, bold: true };
                rBuffer.getCell(hCol.extraCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ROUNDED_LIGHT_GREEN } };
                rBuffer.getCell(hCol.extraCol).border = BORDER_THIN;

                rBuffer.getCell(hCol.shareCol).value = { formula: `${hCol.shareLetter}${roundRowIdx}+${buffer}`, result: hCol.bufferShare };
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

        currentRow += 1;

        // 6. Summary Client Quotation Cards (Dynamic based on hotelCols)
        // Resolves options/hotels from payload.options or cities
        const builderOptions = payload.options && payload.options[0] ? payload.options[0].hotels : null;

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
                    let cleanHName = hName;
                    cleanHName = cleanHName.replace(/(\s*,?\s*or\s+similar\s*(\d*\*?|\*)?)+/gi, '').trim();
                    if (cleanHName.endsWith(',')) cleanHName = cleanHName.slice(0, -1).trim();
                    cleanHName += `, or Similar ${star}`;
                    optHotelNames.push(`${c.name} - ${cleanHName}`);
                });
            }

            // Print Hotel Option Lines (Merged C:D with framed borders)
            optHotelNames.forEach((hLine, hIdx) => {
                const optRowIdx = currentRow++;
                ws.mergeCells(optRowIdx, 3, optRowIdx, 4);
                const rOptHotel = ws.getRow(optRowIdx);
                let optText = hLine.startsWith('With ') ? hLine : `With ${hCol.cardLabel} ${hLine}`;
                if (isTplActive && hIdx === 0) {
                    optText += ' (Triple Room / TPL Sharing)';
                }
                rOptHotel.getCell(3).value = optText;
                rOptHotel.getCell(3).font = { name: 'Arial', size: 10, italic: true };
                rOptHotel.getCell(3).alignment = { vertical: 'middle', wrapText: true };

                const optBorder = {
                    left: { style: 'thin', color: { argb: 'FF000000' } },
                    right: { style: 'thin', color: { argb: 'FF000000' } }
                };
                if (hIdx === 0) {
                    optBorder.top = { style: 'thin', color: { argb: 'FF000000' } };
                }
                rOptHotel.getCell(3).border = optBorder;
                rOptHotel.getCell(4).border = optBorder;
            });

            // Adult Price Card Row (Calculated buffer price directly from table)
            const priceRowIdx = currentRow++;
            ws.mergeCells(priceRowIdx, 3, priceRowIdx, 4);
            const rPriceCard = ws.getRow(priceRowIdx);

            let cardPriceVal = 0;
            const ratesObj = payload.rates || {};
            if (hCol.key === 'h3' && ratesObj.p3) cardPriceVal = extractNumericVal(ratesObj.p3);
            else if (hCol.key === 'hMix' && ratesObj.pMix) cardPriceVal = extractNumericVal(ratesObj.pMix);
            else if (hCol.key === 'h4' && ratesObj.p4) cardPriceVal = extractNumericVal(ratesObj.p4);

            if ((!cardPriceVal || cardPriceVal === 0) && matchedOpt && Array.isArray(matchedOpt.prices)) {
                matchedOpt.prices.forEach(p => {
                    const lblNorm = normalizeText(p.label);
                    const pAmt = extractNumericVal(p.amount);
                    if (pAmt > 0 && (lblNorm.includes('person') || lblNorm.includes('adult') || lblNorm.includes('minimum'))) {
                        cardPriceVal = pAmt;
                    }
                });
            }
            if (!cardPriceVal || cardPriceVal === 0) {
                cardPriceVal = hCol.bufferAdult || 0;
            }

            const roomSharingSuffix = isTplActive ? ' (Triple Sharing)' : '';
            const displayPrice = `LKR ${cardPriceVal.toLocaleString('en-US')} Per Person${roomSharingSuffix} (Minimum ${paxStr})`;

            rPriceCard.getCell(3).value = displayPrice;
            rPriceCard.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
            rPriceCard.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.cardColor } };
            rPriceCard.getCell(3).alignment = { vertical: 'middle' };

            rPriceCard.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hCol.cardColor } };

            const isBottomCard = !hasChildPrices || (!includeChildExtra && !includeChildShare);
            const priceBorder = {
                left: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            };
            if (isBottomCard) {
                priceBorder.bottom = { style: 'thin', color: { argb: 'FF000000' } };
            }
            rPriceCard.getCell(3).border = priceBorder;
            rPriceCard.getCell(4).border = priceBorder;

            if (hasChildPrices) {
                let extraPriceVal = 0;
                let sharePriceVal = 0;

                // Check payload.rates overrides first
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
                            if (!extraPriceVal && (lblNorm.includes('extra bed') || lblNorm.includes('extra'))) extraPriceVal = pAmt;
                            else if (!sharePriceVal && lblNorm.includes('sharing')) sharePriceVal = pAmt;
                        }
                    });
                }

                if (!extraPriceVal) extraPriceVal = hCol.bufferExtra || 0;
                if (!sharePriceVal) sharePriceVal = hCol.bufferShare || 0;

                // Child Extra Bed Card (Merged C:D)
                if (includeChildExtra) {
                    const extraRowIdx = currentRow++;
                    ws.mergeCells(extraRowIdx, 3, extraRowIdx, 4);
                    const rExtraCard = ws.getRow(extraRowIdx);
                    const extraDisplay = `LKR ${extraPriceVal.toLocaleString('en-US')} ${childExtraLabel}`;

                    rExtraCard.getCell(3).value = extraDisplay;
                    rExtraCard.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
                    rExtraCard.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.CHILD_EXTRA_CARD } };
                    rExtraCard.getCell(3).alignment = { vertical: 'middle' };

                    rExtraCard.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.CHILD_EXTRA_CARD } };
                    
                    const isExtraBottom = !includeChildShare;
                    const extraBorder = {
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                    if (isExtraBottom) {
                        extraBorder.bottom = { style: 'thin', color: { argb: 'FF000000' } };
                    }
                    rExtraCard.getCell(3).border = extraBorder;
                    rExtraCard.getCell(4).border = extraBorder;
                }

                // Child Sharing Bed Card (Merged C:D)
                if (includeChildShare) {
                    const shareRowIdx = currentRow++;
                    ws.mergeCells(shareRowIdx, 3, shareRowIdx, 4);
                    const rShareCard = ws.getRow(shareRowIdx);
                    const shareDisplay = `LKR ${sharePriceVal.toLocaleString('en-US')} ${childShareLabel}`;

                    rShareCard.getCell(3).value = shareDisplay;
                    rShareCard.getCell(3).font = { name: 'Calibri', size: 11, bold: true };
                    rShareCard.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.CHILD_SHARE_CARD } };
                    rShareCard.getCell(3).alignment = { vertical: 'middle' };

                    rShareCard.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.CHILD_SHARE_CARD } };
                    const shareBorder = {
                        left: { style: 'thin', color: { argb: 'FF000000' } },
                        right: { style: 'thin', color: { argb: 'FF000000' } },
                        bottom: { style: 'thin', color: { argb: 'FF000000' } }
                    };
                    rShareCard.getCell(3).border = shareBorder;
                    rShareCard.getCell(4).border = shareBorder;
                }
            }

            currentRow++; // 1 empty row spacing between cards (matches sample excel)
        });

        return ws;
    }

    /**
     * Generate Excel Workbook (supports single package or multi-package INQs with separate tabs)
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

        const existingSheetNames = new Set();

        // Multi-Package Support: If packages array has multiple options, create a separate native tab for each option!
        if (payload && payload.packages && Array.isArray(payload.packages) && payload.packages.length > 1) {
            for (let i = 0; i < payload.packages.length; i++) {
                const pkg = payload.packages[i];
                const pkgPayload = normalizePackagePayload(payload, pkg, i);
                const tabLabel = pkg.packageName || (`Option ${i + 1} - ` + (pkg.title || 'Tour'));
                await addCostingWorksheetToWorkbook(wb, pkgPayload, tabLabel, existingSheetNames);
            }
        } else {
            await addCostingWorksheetToWorkbook(wb, payload, payload.packageName || null, existingSheetNames);
        }

        return wb;
    }

    async function createMultiPackageWorkbook(packagesPayloads, options = {}) {
        return await createCostingWorkbook({
            ...options,
            packages: packagesPayloads
        });
    }

    async function downloadMultiPackageCostingExcel(packagesPayloads, customFilename = null) {
        return await downloadCostingExcel({
            packages: packagesPayloads
        }, customFilename);
    }

    /**
     * Standardized Document and File Naming (Google Sheet & Excel)
     * Format: <Title>-<Pax & Child>-<Month/Year>-<INQ>
     * Example: 04N 05D Bangkok-02Pax-01Child(7y)-Dec-2026-20177
     */
    function buildCostingDocFilename(payload) {
        if (!payload) return 'Tour-Costing';
        const rawTitle = (payload.title || 'Tour Quotation').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ');
        const rawPax = (payload.paxText || (String(payload.transferPax || payload.pax || 2).padStart(2, '0') + 'Pax')).trim().replace(/\s*-\s*/g, '-').replace(/\s+/g, '');
        const rawDate = (payload.monthDate || payload.travelMonthDate || (new Date().toLocaleString('en-US', { month: 'short' }) + '-' + new Date().getFullYear())).trim().replace(/\s+/g, '');
        
        let rawInq = (payload.inq || '').trim();
        const digitsMatch = rawInq.match(/\d+/);
        const cleanInq = digitsMatch ? digitsMatch[0] : rawInq.replace(/[^a-zA-Z0-9]/g, '');

        const parts = [rawTitle, rawPax, rawDate, cleanInq].filter(Boolean);
        return parts.join('-');
    }

    /**
     * Browser Download Trigger
     * @param {Object} payload 
     * @param {string} customFilename 
     */
    async function downloadCostingExcel(payload, customFilename = null) {
        const wb = await createCostingWorkbook(payload);
        const buffer = await wb.xlsx.writeBuffer();

        const defaultBaseName = buildCostingDocFilename(payload);
        const filename = customFilename || `${defaultBaseName}.xlsx`;

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

    /**
     * Generate Base64-encoded string of the Costing Excel (.xlsx) file
     * @param {Object} payload 
     * @returns {Promise<string>}
     */
    async function generateCostingExcelBase64(payload) {
        const wb = await createCostingWorkbook(payload);
        const buffer = await wb.xlsx.writeBuffer();
        
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(buffer).toString('base64');
        }
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * Direct Export to Google Sheets via Google Apps Script Webhook
     * Converts .xlsx directly to a native Google Sheet in user's Google Drive.
     * @param {Object} payload 
     * @param {string} webhookUrl 
     * @param {Object} options { folderName, customFilename }
     * @returns {Promise<{ success: boolean, sheetUrl: string, fileId: string, folderUrl: string }>}
     */
    async function exportToGoogleSheets(payload, webhookUrl, options = {}) {
        if (!webhookUrl) {
            throw new Error('Google Sheets Webhook URL is not configured.');
        }

        const base64 = await generateCostingExcelBase64(payload);
        const filename = options.customFilename || buildCostingDocFilename(payload);
        const folderName = options.folderName || 'BP Travel Costings';
        const sheetUrl = options.sheetUrl || payload.sheetUrl || payload.googleSheetUrl || null;
        const sheetId = options.sheetId || payload.sheetId || null;

        const postBody = {
            fileName: filename,
            folderName: folderName,
            base64: base64,
            sheetUrl: sheetUrl,
            sheetId: sheetId
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(postBody)
        });

        if (!response.ok) {
            throw new Error(`Google Apps Script responded with HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to convert to Google Sheet.');
        }

        return data;
    }

    return {
        createCostingWorkbook,
        addCostingWorksheetToWorkbook,
        createMultiPackageWorkbook,
        downloadMultiPackageCostingExcel,
        downloadCostingExcel,
        generateCostingExcelBase64,
        exportToGoogleSheets,
        buildCostingDocFilename,
        detectTourCity,
        generateSmartDays,
        get learningEngine() {
            return (typeof root !== 'undefined' && root.SlwLearningEngine) ? root.SlwLearningEngine : (typeof window !== 'undefined' ? window.SlwLearningEngine : null);
        }
    };
}));
