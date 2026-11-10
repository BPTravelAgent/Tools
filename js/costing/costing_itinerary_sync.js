    // ══════════════════════════════════════════════════════════════
    // SMART TOUR ITINERARY BUILDER INTEGRATION ENGINE
    // ══════════════════════════════════════════════════════════════
    const TOUR_IMAGE_DATABASE = {
        'chao phraya': [
            { url: "https://www.bangkokchaophrayacruise.com/userfiles2/directUpload/skin/thingstodo_36822/etc/cruise/cruise11.jpg", zoom: 0.3, x: -25, y: 0 },
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/11/8e/ed/33.jpg", zoom: 0.5, x: 0, y: 0 }
        ],
        'cruise': [
            { url: "https://www.bangkokchaophrayacruise.com/userfiles2/directUpload/skin/thingstodo_36822/etc/cruise/cruise11.jpg", zoom: 0.3, x: -25, y: 0 },
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/11/8e/ed/33.jpg", zoom: 0.5, x: 0, y: 0 }
        ],
        'dream world': [
            { url: "https://media.tacdn.com/media/attractions-splice-spp-674x446/12/26/0a/85.jpg", zoom: 0.4, x: 0, y: 0 },
            { url: "https://phuketdreamcompany.asia/wp-content/uploads/2018/12/Bangkok-Dream-World-Ticket-Entry.jpg", zoom: 0.2, x: 0, y: 10 },
            { url: "https://staybook.in/_next/image?url=https%3A%2F%2Fcdn-imgix.headout.com%2Fmedia%2Fimages%2Fe69ac663f6c85e207eb169ccd79d1e22-19227-bangkok-dream-world-bangkok-with-round-trip-shared-transfer008.jpg%3Fw%3D1120%26h%3D630%26crop%3Dfaces%26auto%3Dcompress%252Cformat%26fit%3Dmin&w=1080&q=75", zoom: 0.4, x: 0, y: 0 }
        ],
        'safari world': [
            { url: "https://media.tacdn.com/media/attractions-splice-spp-674x446/09/b8/91/9f.jpg", zoom: 0.4, x: 0, y: 0 },
            { url: "https://res.klook.com/images/fl_lossy.progressive,q_65/c_fill,w_1200,h_630/w_80,x_15,y_15,g_south_west,l_Klook_water_br_trans_yhcmh3/activities/tz5c9049x12y6z0bup38/SafariWorldBangkokTickets.jpg", zoom: 0.5, x: 0, y: 0 }
        ],
        'coral island': [
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/14/00/78/df.jpg", zoom: 0.6, x: 0, y: 0 },
            { url: "https://res.klook.com/image/upload/w_750,h_469,c_fill,q_85/w_80,x_15,y_15,g_south_west,l_Klook_water_br_trans_yhcmh3/activities/otrsefnmc66mjtp9xczv.jpg", zoom: 0.5, x: 0, y: 0 },
            { url: "https://media.tacdn.com/media/attractions-splice-spp-674x446/16/79/85/2d.jpg", zoom: 0.4, x: -10, y: 0 }
        ],
        'phi phi': [
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/06/6f/52/68.jpg", zoom: 0.5, x: 0, y: 0 },
            { url: "https://res.klook.com/image/upload/fl_lossy.progressive,q_85/c_fill,w_1000/v1619602486/activities/f3qfwhb7p83o0l5nfxo0.webp", zoom: 0.5, x: 0, y: 0 }
        ],
        'james bond': [
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0a/85/1e/9e.jpg", zoom: 0.5, x: 0, y: 0 },
            { url: "https://res.klook.com/image/upload/fl_lossy.progressive,q_85/c_fill,w_1000/v1620297672/activities/jkyb0z9b0z9b0z9b0z9b.webp", zoom: 0.5, x: 0, y: 0 }
        ],
        'big buddha': [
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0b/27/7b/72.jpg", zoom: 0.5, x: 0, y: 0 }
        ],
        'floating market': [
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0b/27/7a/7f.jpg", zoom: 0.5, x: 0, y: 0 }
        ],
        'city tour': [
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/07/04/b7/fe.jpg", zoom: 0.5, x: 0, y: 0 },
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/0b/27/75/a3.jpg", zoom: 0.5, x: 0, y: 0 }
        ],
        'wat chalong': [
            { url: "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-674x446/07/04/b8/07.jpg", zoom: 0.5, x: 0, y: 0 }
        ],
        'nong nooch': [
            { url: "https://cdn.getyourguide.com/image/format=auto,fit=crop,gravity=auto,quality=60,width=375,height=375,dpr=2/tour_img/1de1888ff6c19a264140ea2a9f82c3b7292ae608d40cc586e39233b01da74172.jpg", zoom: 0.5, x: 0, y: 0 }
        ],
        'sea life': [
            { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTuz2WgxkWw-ro4RWsqWWvo4PXeThvSGl6Mrx9PHLnftPljsCu9hl7jARg&s=10", zoom: 0.5, x: 0, y: 0 }
        ],
        'dolphin': [
            { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRe9ScfpJirvpQQXJrjY2pc7kzK16IHECEGDiQI7QMJD8qbMA-KTSiA8gl5&s=10", zoom: 0.5, x: 0, y: 0 }
        ],
        'sanctuary': [
            { url: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0f/b8/bb/3f/photo0jpg.jpg?w=1200&h=-1&s=1", zoom: 0.5, x: 0, y: 0 }
        ],
        'siam amazing': [
            { url: "https://pub-2b7cc5cb8e514458b769e32609b79ac1.r2.dev/tours/2022-05-19tour09-05-46.jpg", zoom: 0.5, x: 0, y: 0 }
        ],
        'emerald pool': [
            { url: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/15/33/fb/1e/krabi.jpg?w=1200&h=700&s=1", zoom: 0.5, x: 0, y: 0 }
        ],
        'jungle tour': [
            { url: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/15/33/fb/1e/krabi.jpg?w=1200&h=700&s=1", zoom: 0.5, x: 0, y: 0 }
        ]
    };

    const CITY_COVER_IMAGES = {
        'bangkok': "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/32/5b/9a/25/caption.jpg?w=1200&h=-1&s=1",
        'pattaya': "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/15/33/fb/5c/pattaya.jpg?w=1200&h=700&s=1",
        'phuket': "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/15/33/fb/3f/phuket.jpg?w=1200&h=700&s=1",
        'krabi': "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/15/33/fb/1e/krabi.jpg?w=1200&h=700&s=1",
        'chiang mai': "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/15/33/fb/4a/chiang-mai.jpg?w=1200&h=700&s=1"
    };

    const PRESET_TO_JSON_NAME_MAP = {
        'bkk_3n': '03N 04D Bangkok.json',
        'bkk_4n': '04N 05D Bangkok.json',
        'pat_1n_bkk_3n': '01N Pattaya 03N Bangkok.json',
        'pat_2n_bkk_3n': '2N Pattaya 3N Bangkok.json',
        'pkt_3n': '03N 04D Phuket.json',
        'pkt_3n_new': '03N Phuket New.json',
        'pkt_2n_bkk_3n': '02N Phuket 03N Bangkok.json',
        'pkt_3n_kb_2n': '3N Phuket  2N Krabi.json',
        'combo_6n': '2N Phuket  2N Pattaya 2N Bangkok.json',
        'combo_4n': '2N Phuket  2N Pattaya.json'
    };

    function cleanLkrNumber(text) {
        if (!text) return '0';
        let str = String(text).trim();
        // Remove .00 cents or any decimal portion
        if (str.includes('.')) {
            str = str.split('.')[0];
        }
        // Extract digits only
        const digits = str.replace(/[^0-9]/g, '');
        if (!digits) return '0';
        return Number(digits).toLocaleString('en-US');
    }

    function generateItinerary() {
        // 1. Refresh calculations first
        calculate();

        const selectedCities = availableCities.filter(c => c.selected);
        const selectedTours = availableTours.filter(t => t.selected);
        const selectedTransfers = availableTransfers.filter(t => t.selected);

        if (selectedCities.length === 0 && selectedTours.length === 0) {
            showNotification("Please select at least one City or Tour to generate an Itinerary.", true);
            return;
        }

        const totalNights = selectedCities.reduce((sum, c) => sum + (Number(c.numberOfNights) || 1), 0);
        const totalDays = totalNights > 0 ? totalNights + 1 : Math.max(1, selectedTours.length + 1);

        // Auto Title
        let defaultTitle = '';
        if (activeLoadedPresetKey && costingPresets[activeLoadedPresetKey] && costingPresets[activeLoadedPresetKey].title) {
            defaultTitle = costingPresets[activeLoadedPresetKey].title.trim();
        } else if (selectedCities.length > 0) {
            const parts = selectedCities.map(c => `${String(c.numberOfNights || 1).padStart(2, '0')}N ${c.name}`);
            defaultTitle = parts.join(' ');
        } else {
            defaultTitle = `${String(totalNights).padStart(2, '0')}N ${String(totalDays).padStart(2, '0')}D Thailand Tour`;
        }

        // Auto Pax
        const paxNum = parseInt(document.getElementById('num_people_transfer')?.value) || parseInt(document.getElementById('num_people_hotel')?.value) || 2;
        const defaultPax = `${String(paxNum).padStart(2, '0')}Pax`;

        // Auto Date
        const now = new Date();
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const currentMonth = monthNames[now.getMonth()];
        const nextMonth = monthNames[(now.getMonth() + 1) % 12];
        const defaultDate = `${currentMonth}-${nextMonth}/${now.getFullYear()}`;

        // Auto INQ
        const defaultInq = 'INQ -' + Math.floor(10000 + Math.random() * 90000);

        // Populate Modal Inputs
        const titleInput = document.getElementById('exportItineraryTitle');
        const paxInput = document.getElementById('exportItineraryPax');
        const dateInput = document.getElementById('exportItineraryDate');
        const inqInput = document.getElementById('exportItineraryInq');
        const clientInput = document.getElementById('exportItineraryClient');

        if (titleInput) titleInput.value = defaultTitle;
        if (paxInput) paxInput.value = defaultPax;
        if (dateInput) dateInput.value = defaultDate;
        if (inqInput) inqInput.value = defaultInq;
        if (clientInput) clientInput.value = '';

        // Populate Modal Prices (Adult & Children)
        const p3El = document.getElementById('adult_final_lkr_3star');
        const p4El = document.getElementById('adult_final_lkr_4star');
        const pMixEl = document.getElementById('adult_final_lkr_mix');

        const p3ChildExtraEl = document.getElementById('child_final_lkr_3star');
        const p3ChildShareEl = document.getElementById('child_sharing_final_lkr_3star');
        const p4ChildExtraEl = document.getElementById('child_final_lkr_4star');
        const p4ChildShareEl = document.getElementById('child_sharing_final_lkr_4star');
        const pMixChildExtraEl = document.getElementById('child_final_lkr_mix');
        const pMixChildShareEl = document.getElementById('child_sharing_final_lkr_mix');

        const cleanPrice = (el) => {
            if (!el || !el.innerText) return 'LKR 0';
            return 'LKR ' + cleanLkrNumber(el.innerText);
        };

        // 3-Star
        if (document.getElementById('exportPrice3Star')) document.getElementById('exportPrice3Star').innerText = cleanPrice(p3El);
        if (document.getElementById('exportPrice3StarChildExtra')) document.getElementById('exportPrice3StarChildExtra').innerText = cleanPrice(p3ChildExtraEl);
        if (document.getElementById('exportPrice3StarChildShare')) document.getElementById('exportPrice3StarChildShare').innerText = cleanPrice(p3ChildShareEl);

        // 4-Star
        if (document.getElementById('exportPrice4Star')) document.getElementById('exportPrice4Star').innerText = cleanPrice(p4El);
        if (document.getElementById('exportPrice4StarChildExtra')) document.getElementById('exportPrice4StarChildExtra').innerText = cleanPrice(p4ChildExtraEl);
        if (document.getElementById('exportPrice4StarChildShare')) document.getElementById('exportPrice4StarChildShare').innerText = cleanPrice(p4ChildShareEl);

        // Mix
        const mixContainer = document.getElementById('exportPriceMixContainer');
        const mixCard = document.getElementById('result_card_mix');
        if (mixContainer && mixCard && mixCard.style.display !== 'none' && pMixEl && pMixEl.innerText) {
            mixContainer.classList.remove('hidden');
            if (document.getElementById('exportPriceMix')) document.getElementById('exportPriceMix').innerText = cleanPrice(pMixEl);
            if (document.getElementById('exportPriceMixChildExtra')) document.getElementById('exportPriceMixChildExtra').innerText = cleanPrice(pMixChildExtraEl);
            if (document.getElementById('exportPriceMixChildShare')) document.getElementById('exportPriceMixChildShare').innerText = cleanPrice(pMixChildShareEl);
            const mixTitleEl = document.getElementById('mix_package_title');
            const expMixLbl = document.getElementById('exportPriceMixLabel');
            if (mixTitleEl && expMixLbl) expMixLbl.innerText = mixTitleEl.innerText;
        } else if (mixContainer) {
            mixContainer.classList.add('hidden');
        }

        // Child Labels Detection & Autofill
        let defaultChildExtraLabel = "PER CHILD (WITH EXTRA BED)";
        let defaultChildShareLabel = "PER CHILD (SHARING BED)";

        if (window.__slwImportedItineraryBase && window.__slwImportedItineraryBase.options) {
            const existingPrices = window.__slwImportedItineraryBase.options[0]?.hotels[0]?.prices || [];
            const existingExtra = existingPrices.find(p => p.label && p.label.toUpperCase().includes('EXTRA BED'));
            const existingShare = existingPrices.find(p => p.label && (p.label.toUpperCase().includes('SHARING') || p.label.toUpperCase().includes('NO BED')));
            if (existingExtra && existingExtra.label) defaultChildExtraLabel = existingExtra.label.trim();
            if (existingShare && existingShare.label) defaultChildShareLabel = existingShare.label.trim();
        } else {
            const paxVal = defaultPax || '';
            const ageMatches = paxVal.match(/\b\d{1,2}Y\b/gi);
            if (ageMatches && ageMatches.length >= 2) {
                defaultChildExtraLabel = `PER CHILD (WITH EXTRA BED ${ageMatches[0].toUpperCase()})`;
                defaultChildShareLabel = `PER CHILD (SHARING BED ${ageMatches[1].toUpperCase()})`;
            } else if (ageMatches && ageMatches.length === 1) {
                defaultChildExtraLabel = `PER CHILD (WITH EXTRA BED ${ageMatches[0].toUpperCase()})`;
                defaultChildShareLabel = `PER CHILD (SHARING BED ${ageMatches[0].toUpperCase()})`;
            }
        }

        const childExtraLabelInput = document.getElementById('exportChildExtraBedLabel');
        const childShareLabelInput = document.getElementById('exportChildSharingBedLabel');
        if (childExtraLabelInput) childExtraLabelInput.value = defaultChildExtraLabel;
        if (childShareLabelInput) childShareLabelInput.value = defaultChildShareLabel;

        // Counts & Preview List
        const countsEl = document.getElementById('exportItineraryCounts');
        if (countsEl) {
            countsEl.innerText = `${totalDays} Days (${totalNights}N) • ${selectedTours.length} Tours • ${selectedTransfers.length} Transfers`;
        }

        const previewList = document.getElementById('exportItineraryPreviewList');
        if (previewList) {
            let html = '';
            selectedCities.forEach(c => {
                html += `<div class="flex items-center gap-1.5"><i class="fas fa-hotel text-blue-500 text-[11px]"></i> <span><strong>${c.numberOfNights}N ${c.name}</strong> (3*: ${c.hotel3Name} / 4*: ${c.hotel4Name})</span></div>`;
            });
            selectedTransfers.forEach(tr => {
                html += `<div class="flex items-center gap-1.5"><i class="fas fa-car text-orange-500 text-[11px]"></i> <span>${tr.name}</span></div>`;
            });
            selectedTours.forEach(t => {
                const cleanName = cleanTourNameTags(t.name);
                const trTag = hasExistingTourTag(cleanName) ? '' : (t.transferPrice > 0 ? '(Private Transfer)' : '(Join Transfer)');
                html += `<div class="flex items-center gap-1.5"><i class="fas fa-map-pin text-purple-500 text-[11px]"></i> <span>${cleanName} ${trTag ? `<strong class="text-teal-700">${trTag}</strong>` : ''}</span></div>`;
            });
            previewList.innerHTML = html || '<div class="text-gray-400">No items selected</div>';
        }

        openModal('itineraryExportModal');
    }

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

    function cleanTourNameTags(name) {
        if (!name) return '';
        let s = String(name).trim();
        const tagPattern = /\s*\((?:join\s+tour|join\s+transfer|private\s+transfer|join|private|ticket\s+only|private\s+tour)\)\s*\((?:join\s+tour|join\s+transfer|private\s+transfer|join|private|ticket\s+only|private\s+tour)\)/gi;
        while (tagPattern.test(s)) {
            s = s.replace(tagPattern, (m, p1) => ` (${p1.trim()})`);
        }
        return s.trim();
    }

    function detectTourCity(tourName, availableCities = []) {
        if (!tourName) return '';
        const norm = tourName.toLowerCase();

        // 0. Check active learned rules first
        try {
            if (window.SlwLearningEngine && typeof window.SlwLearningEngine.getRules === 'function') {
                const rules = window.SlwLearningEngine.getRules().filter(r => r.active !== false && r.city && r.pattern);
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

    function buildItineraryJsonPayload() {
        const rawTitle = document.getElementById('exportItineraryTitle')?.value.trim() || 'Tour Itinerary';
        const pax = document.getElementById('exportItineraryPax')?.value.trim() || '02Pax';
        const date = document.getElementById('exportItineraryDate')?.value.trim() || 'Oct-Nov/2026';
        const clientName = document.getElementById('exportItineraryClient')?.value.trim() || '\n';
        const inq = document.getElementById('exportItineraryInq')?.value.trim() || ('INQ -' + Math.floor(10000 + Math.random() * 90000));

        const selectedCities = availableCities.filter(c => c.selected);
        const selectedTours = availableTours.filter(t => t.selected);
        const selectedTransfers = availableTransfers.filter(t => t.selected);

        const totalNights = selectedCities.reduce((sum, c) => sum + (Number(c.numberOfNights) || 1), 0);
        const totalDays = totalNights > 0 ? totalNights + 1 : Math.max(1, selectedTours.length + 1);

        let primaryCity = 'Bangkok';
        if (selectedCities.length > 0) primaryCity = selectedCities[0].name;
        const coverImage = CITY_COVER_IMAGES[primaryCity.toLowerCase()] || CITY_COVER_IMAGES['bangkok'];

        const p3Text = document.getElementById('adult_final_lkr_3star')?.innerText || '';
        const p4Text = document.getElementById('adult_final_lkr_4star')?.innerText || '';
        const p3Amount = 'LKR ' + cleanLkrNumber(p3Text);
        const p4Amount = 'LKR ' + cleanLkrNumber(p4Text);

        // Inclusions List
        const inclusions = [];
        if (selectedCities.length > 0) {
            const cityStayText = selectedCities.map(c => `${c.numberOfNights}N ${c.name}`).join(' ') + ' 3* Hotel Accommdation with Breakfast ';
            inclusions.push(cityStayText);
        }
        inclusions.push("Private Transfer from Airport - Hotel - Airport");
        inclusions.push("Tour by air-conditioned vehicles");

        let breakfastCount = Math.max(0, totalDays - 1);
        let lunchCount = 0;
        let dinnerCount = 0;

        selectedTours.forEach(t => {
            const lower = t.name.toLowerCase();
            let nameWithTag = cleanTourNameTags(t.name.trim());

            if (!hasExistingTourTag(nameWithTag)) {
                nameWithTag += t.transferPrice > 0 ? ' (Private Transfer)' : ' (Join Transfer)';
            }

            inclusions.push(nameWithTag);

            if (lower.includes('lunch')) lunchCount++;
            if (lower.includes('dinner') || lower.includes('cruise')) dinnerCount++;
        });

        const bStr = String(breakfastCount).padStart(2, '0') + ' Breakfast';
        const lStr = String(lunchCount).padStart(2, '0') + ' Lunch';
        const dStr = String(dinnerCount).padStart(2, '0') + ' Dinner';
        inclusions.push(`Meals (${bStr} / ${lStr} / ${dStr})`);

        // Smart Day-by-Day Generation: City Aware & Multi-City Routing
        const days = [];
        const getTourImages = (tourName) => {
            const lower = (tourName || '').toLowerCase();
            for (const [key, imgs] of Object.entries(TOUR_IMAGE_DATABASE)) {
                if (lower.includes(key)) return JSON.parse(JSON.stringify(imgs));
            }
            return [];
        };

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

        let currentCityIdx = 0;
        let nightsInCurCity = 0;

        let learnedRules = [];
        try {
            if (window.SlwLearningEngine && typeof window.SlwLearningEngine.getRules === 'function') {
                learnedRules = window.SlwLearningEngine.getRules().filter(r => r.active !== false);
            }
        } catch(e) {}

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
            let dayImages = [];
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
                    const cleanName = cleanTourNameTags(cityTour.name);
                    let tag = cityTour.transferPrice > 0 ? '(Private Transfer)' : '(Join Transfer)';
                    if (hasExistingTourTag(cleanName)) tag = '';
                    activities.push(`${cleanName}${tag ? ' ' + tag : ''}`.trim());
                    dayImages = getTourImages(cleanName);
                    if (cleanName.toLowerCase().includes('lunch')) hasLunch = true;
                    if (cleanName.toLowerCase().includes('dinner')) hasDinner = true;
                }

                activities.push(formatHotelCheckIn(curCity.hotel3Name, curCity, '3*'));

                // If arrival is in Bangkok and there is an evening dinner cruise, place it
                if (curCityKey === 'bangkok') {
                    const eveIdx = curCityTours.findIndex(t => t.name.toLowerCase().includes('dinner') || t.name.toLowerCase().includes('cruise'));
                    if (eveIdx !== -1) {
                        const eveTour = curCityTours.splice(eveIdx, 1)[0];
                        const cleanEveName = cleanTourNameTags(eveTour.name);
                        let tag = eveTour.transferPrice > 0 ? '(Private Transfer)' : '(Join Transfer)';
                        if (hasExistingTourTag(cleanEveName)) tag = '';
                        activities.push(`${cleanEveName}${tag ? ' ' + tag : ''}`.trim());
                        dayImages = getTourImages(cleanEveName);
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
                        const cleanTrName = cleanTourNameTags(trTour.name);
                        let tag = trTour.transferPrice > 0 ? '(Private Transfer)' : '(Join Transfer)';
                        if (hasExistingTourTag(cleanTrName)) tag = '';
                        activities.push(`${cleanTrName}${tag ? ' ' + tag : ''}`.trim());
                        dayImages = getTourImages(cleanTrName);
                        if (cleanTrName.toLowerCase().includes('lunch')) hasLunch = true;
                        if (cleanTrName.toLowerCase().includes('dinner') || cleanTrName.toLowerCase().includes('cruise')) hasDinner = true;
                    }

                    activities.push("Overnight at Hotel");
                    nightsInCurCity++;

                } else {
                    // Regular stay day in curCity
                    if (curCityTours.length > 0) {
                        const tour = curCityTours.shift();
                        const cleanTourName = cleanTourNameTags(tour.name);
                        let tag = tour.transferPrice > 0 ? '(Private Transfer)' : '(Join Transfer)';
                        if (hasExistingTourTag(cleanTourName)) tag = '';
                        activities.push(`${cleanTourName}${tag ? ' ' + tag : ''}`.trim());
                        dayImages = getTourImages(cleanTourName);
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
                title: dayTitle,
                meal: mealStr,
                activities: activities,
                note: "",
                images: dayImages
            });
        }

        // Child labels & prices
        const includeChildExtra = document.getElementById('check_child_extra_bed')?.checked ?? false;
        const includeChildShare = document.getElementById('check_child_sharing_bed')?.checked ?? false;
        const childExtraLabel = document.getElementById('exportChildExtraBedLabel')?.value.trim() || 'PER CHILD (WITH EXTRA BED)';
        const childShareLabel = document.getElementById('exportChildSharingBedLabel')?.value.trim() || 'PER CHILD (SHARING BED)';

        const p3ChildExtraEl = document.getElementById('child_final_lkr_3star');
        const p3ChildShareEl = document.getElementById('child_sharing_final_lkr_3star');
        const p4ChildExtraEl = document.getElementById('child_final_lkr_4star');
        const p4ChildShareEl = document.getElementById('child_sharing_final_lkr_4star');
        const pMixChildExtraEl = document.getElementById('child_final_lkr_mix');
        const pMixChildShareEl = document.getElementById('child_sharing_final_lkr_mix');

        const p3ChildExtraAmount = includeChildExtra ? ('LKR ' + cleanLkrNumber(p3ChildExtraEl?.innerText)) : '';
        const p3ChildShareAmount = includeChildShare ? ('LKR ' + cleanLkrNumber(p3ChildShareEl?.innerText)) : '';
        const p4ChildExtraAmount = includeChildExtra ? ('LKR ' + cleanLkrNumber(p4ChildExtraEl?.innerText)) : '';
        const p4ChildShareAmount = includeChildShare ? ('LKR ' + cleanLkrNumber(p4ChildShareEl?.innerText)) : '';

        // Hotel Options with Exact Calculated LKR Rates
        const hotelOptions = [];
        const hotel3Names = selectedCities.map(c => `${c.name}-${c.hotel3Name}`).filter(Boolean);
        const hotel4Names = selectedCities.map(c => `${c.name} - ${c.hotel4Name}`).filter(Boolean);

        // 3-Star Prices Array (Adult + Child Extra Bed + Child Sharing Bed)
        const p3Prices = [
            {
                label: `PER PERSON (MINIMUM ${pax.toUpperCase()})`,
                amount: p3Amount
            }
        ];
        if (includeChildExtra && p3ChildExtraAmount && p3ChildExtraAmount !== 'LKR 0') {
            p3Prices.push({
                label: childExtraLabel,
                amount: p3ChildExtraAmount
            });
        }
        if (includeChildShare && p3ChildShareAmount && p3ChildShareAmount !== 'LKR 0') {
            p3Prices.push({
                label: childShareLabel,
                amount: p3ChildShareAmount
            });
        }

        hotelOptions.push({
            rating: "3* Hotel Options",
            names: hotel3Names.length > 0 ? hotel3Names : ["Standard 3* Hotel Accommodation"],
            price: `${p3Amount} Per Person (Minimum ${pax})`,
            prices: p3Prices
        });

        // 4-Star Prices Array (Adult + Child Extra Bed + Child Sharing Bed)
        const p4Prices = [
            {
                label: `PER PERSON (MINIMUM ${pax.toUpperCase()})`,
                amount: p4Amount
            }
        ];
        if (includeChildExtra && p4ChildExtraAmount && p4ChildExtraAmount !== 'LKR 0') {
            p4Prices.push({
                label: childExtraLabel,
                amount: p4ChildExtraAmount
            });
        }
        if (includeChildShare && p4ChildShareAmount && p4ChildShareAmount !== 'LKR 0') {
            p4Prices.push({
                label: childShareLabel,
                amount: p4ChildShareAmount
            });
        }

        hotelOptions.push({
            rating: "4* Hotel Options",
            names: hotel4Names.length > 0 ? hotel4Names : ["Standard 4* Hotel Accommodation"],
            price: `${p4Amount} Per Person (Minimum ${pax})`,
            prices: p4Prices
        });

        // Mix Package Prices (if active)
        const mixCard = document.getElementById('result_card_mix');
        const pMixEl = document.getElementById('adult_final_lkr_mix');
        if (mixCard && mixCard.style.display !== 'none' && pMixEl && pMixEl.innerText) {
            const pMixAmount = 'LKR ' + cleanLkrNumber(pMixEl.innerText);
            const pMixChildExtraAmount = includeChildExtra ? ('LKR ' + cleanLkrNumber(pMixChildExtraEl?.innerText)) : '';
            const pMixChildShareAmount = includeChildShare ? ('LKR ' + cleanLkrNumber(pMixChildShareEl?.innerText)) : '';
            const mixTitle = document.getElementById('mix_package_title')?.innerText || 'Custom Mix Option';
            const mixHotelNames = selectedCities.map(c => {
                const hName = c.mixPref === '4' ? c.hotel4Name : (c.mixPref === '5' ? (c.hotel5Name || c.hotel4Name) : c.hotel3Name);
                return `${c.name} - ${hName}`;
            });

            const pMixPrices = [
                {
                    label: `PER PERSON (MINIMUM ${pax.toUpperCase()})`,
                    amount: pMixAmount
                }
            ];
            if (includeChildExtra && pMixChildExtraAmount && pMixChildExtraAmount !== 'LKR 0') {
                pMixPrices.push({
                    label: childExtraLabel,
                    amount: pMixChildExtraAmount
                });
            }
            if (includeChildShare && pMixChildShareAmount && pMixChildShareAmount !== 'LKR 0') {
                pMixPrices.push({
                    label: childShareLabel,
                    amount: pMixChildShareAmount
                });
            }

            hotelOptions.push({
                rating: mixTitle,
                names: mixHotelNames,
                price: `${pMixAmount} Per Person (Minimum ${pax})`,
                prices: pMixPrices
            });
        }

        const finalPayload = {
            title: rawTitle,
            pax: pax,
            date: date,
            inq: inq,
            hasChildPrices: (includeChildExtra || includeChildShare),
            includeChildExtraBed: includeChildExtra,
            includeChildSharingBed: includeChildShare,
            clientName: clientName,
            logo: "https://raw.githubusercontent.com/BPTravelAgent/Tools/main/Image/LOGO.png",
            coverImage: coverImage,
            days: days,
            lastDayNote: "If you’re planning to go shopping on this day, please ensure you check out of the hotel in the morning or by 12:00 PM. You may safely store your luggage at the hotel reception. Your airport transfer is scheduled based on your flight time, so kindly be in the hotel lobby on time for pickup.",
            rateValidity: "This rate is valid for 7 days",
            inclusions: inclusions,
            exclusions: [
                "Air fare",
                "Everything which is not Mentioned in the itinerary",
                "Thailand Visa"
            ],
            options: [
                {
                    id: 1,
                    name: "Option 01 - Standard",
                    description: "",
                    hotels: hotelOptions
                }
            ],
            specialNotes: [
                "Should you have any questions, please feel free to contact us. We do hope the above proposal has thoroughly covered your requirements.",
                "Please note that we are not holding any accommodation or services for you at this point. If you wish to proceed kindly confirm to us.",
                "Children below 3 years old and shorter than 90 cm will not be charged for our package (free of charge).",
                "Please note that above rates are valid for mentioned time period only.",
                "Please note that above rates are subject to availability & change.",
                "We look forward to creating a memorable experience for you."
            ],
            customizationText: "Let us know if there is anything you'd like to add or modify to suit your preferences. We are here to create the perfect tour for you!",
            bookingProcess: [
                {
                    id: 1,
                    step: "Step 01: Air Ticket Booking Process",
                    items: [
                        "Passport Details: Please provide the passport bio page of all passengers traveling.",
                        "Booking Air Tickets: Once we receive the passport details, we will proceed to book the air tickets based on your preferred travel dates. Please note that the airfare can only be held for 3 hours.",
                        "Invoice and Payment: Within this time frame, we will send you an invoice, and full payment for the air tickets will be required. Upon receiving the payment, we will issue your air tickets. If you prefer to book the air tickets on your own, that’s absolutely fine too — just let us know."
                    ]
                },
                {
                    id: 2,
                    step: "Step 02: Tour Package Payment Process",
                    items: [
                        "Advance Payment: To check hotel availability, an advance payment of LKR 25,000 per person for the tour package is required. We will send an invoice for this amount once you confirm your package.",
                        "Hotel Confirmation and Final Payment: After confirming hotel availability, the remaining balance will be due. Once the full payment is received, your tour package details will be finalized."
                    ]
                }
            ],
            footerImage: "https://raw.githubusercontent.com/BPTravelAgent/Tools/main/Image/Contact%20Bakcground%20(1).png",
            contact: {
                address: "No.70/16 Lucky Plaza,\nSt Anthony’s Mawatha,\nColombo - 03, Sri Lanka.",
                tel: "077 887 7054\n077 775 3191",
                hotline: "0117-911700",
                email: "info@sunleisureworld.lk",
                facebook: "https://web.facebook.com/sunleisureworldsrilanak",
                instagram: "https://www.instagram.com/sun_leisure_world_sri_lanka",
                map: "https://maps.app.goo.gl/Egag7Mgey5JSwju69"
            },
            titleStyles: {
                fontSize: 44,
                textAlign: "left",
                color: "#ffffff"
            },
            spacers: {
                "options-section-before": 200
            }
        };

        if (window.__slwImportedItineraryBase) {
            const merged = JSON.parse(JSON.stringify(window.__slwImportedItineraryBase));
            merged.title = rawTitle;
            merged.pax = pax;
            merged.date = date;
            merged.inq = inq;
            if (clientName && clientName.trim()) merged.clientName = clientName;
            merged.inclusions = finalPayload.inclusions;
            merged.options = finalPayload.options;
            if (!merged.days || merged.days.length !== finalPayload.days.length) {
                merged.days = finalPayload.days;
            }
            return merged;
        }

        return finalPayload;
    }

    function saveLatestCostingPrices(payload = null) {
        try {
            const p3El = document.getElementById('adult_final_lkr_3star');
            const p4El = document.getElementById('adult_final_lkr_4star');
            const pMixEl = document.getElementById('adult_final_lkr_mix');

            const p3ChildExtraEl = document.getElementById('child_final_lkr_3star');
            const p3ChildShareEl = document.getElementById('child_sharing_final_lkr_3star');
            const p4ChildExtraEl = document.getElementById('child_final_lkr_4star');
            const p4ChildShareEl = document.getElementById('child_sharing_final_lkr_4star');
            const pMixChildExtraEl = document.getElementById('child_final_lkr_mix');
            const pMixChildShareEl = document.getElementById('child_sharing_final_lkr_mix');

            const includeChildExtra = document.getElementById('check_child_extra_bed')?.checked ?? false;
            const includeChildShare = document.getElementById('check_child_sharing_bed')?.checked ?? false;
            const hasChildPrices = Boolean(includeChildExtra || includeChildShare);

            const p3Amount = 'LKR ' + cleanLkrNumber(p3El?.innerText);
            const p3ChildExtra = includeChildExtra ? ('LKR ' + cleanLkrNumber(p3ChildExtraEl?.innerText)) : null;
            const p3ChildShare = includeChildShare ? ('LKR ' + cleanLkrNumber(p3ChildShareEl?.innerText)) : null;

            const p4Amount = 'LKR ' + cleanLkrNumber(p4El?.innerText);
            const p4ChildExtra = includeChildExtra ? ('LKR ' + cleanLkrNumber(p4ChildExtraEl?.innerText)) : null;
            const p4ChildShare = includeChildShare ? ('LKR ' + cleanLkrNumber(p4ChildShareEl?.innerText)) : null;
            const p5El = document.getElementById('adult_final_lkr_5star');
            const p5ChildExtraEl = document.getElementById('child_final_lkr_5star');
            const p5ChildShareEl = document.getElementById('child_sharing_final_lkr_5star');
            const p5Amount = 'LKR ' + cleanLkrNumber(p5El?.innerText);
            const p5ChildExtra = includeChildExtra ? ('LKR ' + cleanLkrNumber(p5ChildExtraEl?.innerText)) : null;
            const p5ChildShare = includeChildShare ? ('LKR ' + cleanLkrNumber(p5ChildShareEl?.innerText)) : null;

            const mixCard = document.getElementById('result_card_mix');
            let mixObj = null;
            if (mixCard && mixCard.style.display !== 'none' && pMixEl && pMixEl.innerText) {
                mixObj = {
                    adult: 'LKR ' + cleanLkrNumber(pMixEl.innerText),
                    childExtra: includeChildExtra ? ('LKR ' + cleanLkrNumber(pMixChildExtraEl?.innerText)) : null,
                    childShare: includeChildShare ? ('LKR ' + cleanLkrNumber(pMixChildShareEl?.innerText)) : null,
                    title: document.getElementById('mix_package_title')?.innerText || 'Custom Mix Option'
                };
            }

            const rawPaxNum = Number(document.getElementById('num_people_hotel')?.value) || 2;
            const pax = document.getElementById('exportItineraryPax')?.value.trim() || (String(rawPaxNum).padStart(2, '0') + 'Pax');
            const childExtraLabel = document.getElementById('exportChildExtraBedLabel')?.value.trim() || 'PER CHILD (WITH EXTRA BED)';
            const childShareLabel = document.getElementById('exportChildSharingBedLabel')?.value.trim() || 'PER CHILD (SHARING BED)';

            const summary = {
                title: payload?.title || document.getElementById('exportItineraryTitle')?.value || 'Tour Package',
                pax: pax,
                hasChildPrices: hasChildPrices,
                includeChildExtraBed: includeChildExtra,
                includeChildSharingBed: includeChildShare,
                prices3Star: {
                    adult: p3Amount,
                    childExtra: p3ChildExtra,
                    childShare: p3ChildShare
                },
                prices4Star: {
                    adult: p4Amount,
                    childExtra: p4ChildExtra,
                    childShare: p4ChildShare
                },
                pricesMix: mixObj,
                prices5Star: (p5El && p5El.innerText && cleanLkrNumber(p5El.innerText) !== '0') ? {
                    adult: p5Amount,
                    childExtra: p5ChildExtra,
                    childShare: p5ChildShare
                } : null,
                childExtraLabel: childExtraLabel,
                childShareLabel: childShareLabel,
                timestamp: Date.now()
            };

            localStorage.setItem('SLW_LATEST_COSTING_PRICES', JSON.stringify(summary));
            return summary;
        } catch(e) {
            console.warn("Failed to save latest costing prices:", e);
            return null;
        }
    }

    function launchInItineraryBuilder() {
        const payload = buildItineraryJsonPayload();
        saveLatestCostingPrices(payload);

        const mixCard = document.getElementById('result_card_mix');
        const isMixActive = mixCard && mixCard.style.display !== 'none';
        const p3Text = document.getElementById('adult_final_lkr_3star')?.innerText || '';
        const pMixText = isMixActive ? (document.getElementById('adult_final_lkr_mix')?.innerText || '') : '';
        const p4Text = document.getElementById('adult_final_lkr_4star')?.innerText || '';
        const roe = parseFloat(document.getElementById('lkr_rate')?.value) || 10.8;
        const markupVal = parseFloat(document.getElementById('markup')?.value) || 18;

        const includeChildExtra = document.getElementById('check_child_extra_bed')?.checked ?? false;
        const includeChildShare = document.getElementById('check_child_sharing_bed')?.checked ?? false;
        const hasChildPrices = Boolean(includeChildExtra || includeChildShare);

        const costingData = {
            availableCities: JSON.parse(JSON.stringify(availableCities.filter(c => c.selected))),
            availableTours: JSON.parse(JSON.stringify(availableTours.filter(t => t.selected))),
            availableTransfers: JSON.parse(JSON.stringify(availableTransfers.filter(t => t.selected))),
            hasMix: isMixActive,
            hasChildPrices: hasChildPrices,
            includeChildExtraBed: includeChildExtra,
            includeChildSharingBed: includeChildShare,
            isTplActive: Boolean(document.getElementById('check_tpl_room')?.checked),
            tplRoomsCount: Number(document.getElementById('tpl_rooms_count')?.value) || 1,
            totalRoomsCount: Number(document.getElementById('total_hotel_rooms')?.value) || 1,
            tplRate3: Number(document.getElementById('tpl_rate_3star')?.value) || 800,
            tplRate4: Number(document.getElementById('tpl_rate_4star')?.value) || 1000,
            tplRate5: Number(document.getElementById('tpl_rate_5star')?.value) || 1200,
            childExtraLabel: document.getElementById('exportChildExtraBedLabel')?.value.trim() || 'PER CHILD (WITH EXTRA BED)',
            childShareLabel: document.getElementById('exportChildSharingBedLabel')?.value.trim() || 'PER CHILD (SHARING BED)',
            roe: roe,
            markup3: markupVal,
            markupMix: 20,
            markup4: 25,
            buffer: 1000,
            rates: {
                p3: cleanLkrNumber(p3Text),
                pMix: isMixActive ? cleanLkrNumber(pMixText) : null,
                p4: cleanLkrNumber(p4Text),
                childExtra3: includeChildExtra ? cleanLkrNumber(document.getElementById('child_final_lkr_3star')?.innerText) : null,
                childShare3: includeChildShare ? cleanLkrNumber(document.getElementById('child_sharing_final_lkr_3star')?.innerText) : null,
                childExtra4: includeChildExtra ? cleanLkrNumber(document.getElementById('child_final_lkr_4star')?.innerText) : null,
                childShare4: includeChildShare ? cleanLkrNumber(document.getElementById('child_sharing_final_lkr_4star')?.innerText) : null,
                childExtraMix: (includeChildExtra && isMixActive) ? cleanLkrNumber(document.getElementById('child_final_lkr_mix')?.innerText) : null,
                childShareMix: (includeChildShare && isMixActive) ? cleanLkrNumber(document.getElementById('child_sharing_final_lkr_mix')?.innerText) : null
            }
        };
        payload.costing = costingData;

        try {
            localStorage.setItem('SLW_PENDING_COSTING_DATA', JSON.stringify(costingData));
            if (payload.inq) {
                localStorage.setItem('SLW_ACTIVE_INQ', payload.inq);
                localStorage.setItem('SLW_ACTIVE_INQ_CLIENT', payload.clientName || '');
                localStorage.setItem('SLW_ACTIVE_INQ_TITLE', payload.title || '');
            }
            localStorage.setItem('SLW_PENDING_COSTING_ITINERARY', JSON.stringify(payload));
        } catch(e) {
            console.warn("localStorage write error:", e);
        }

        closeModal('itineraryExportModal');
        showNotification("🚀 Launching Tour Itinerary Builder! You can load your preset and click 'Apply Costing Prices'.", false);

        window.open('archives/Itinerary_Builder_App New.html', '_blank');
    }

    function downloadItineraryBuilderJson() {
        const payload = buildItineraryJsonPayload();
        const cleanName = (payload.title || 'Tour_Itinerary').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'Tour_Itinerary';
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = cleanName + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification(`💾 Downloaded "${cleanName}.json"!`, false);
    }

    function copyItineraryBuilderJson() {
        const payload = buildItineraryJsonPayload();
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
            showNotification("📋 Copied Itinerary JSON to clipboard!", false);
        }).catch(err => {
            showNotification("Failed to copy: " + err.message, true);
        });
    }

