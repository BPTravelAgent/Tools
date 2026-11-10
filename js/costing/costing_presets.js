    // ══════════════════════════════════════════════════════════════════
    // ⚡ 1-CLICK ITINERARY PACKAGE PRESETS ENGINE (ITINERARY BUILDER)
    // ══════════════════════════════════════════════════════════════════
    const DEFAULT_ITINERARY_PRESETS = {
        'bkk_3n': {
            id: 'bkk_3n',
            title: '03N 04D Bangkok',
            cat: 'bangkok',
            badge: 'Best Seller',
            summary: '3N Bangkok • Chao Phraya Cruise • Dream World with Lunch • Airport Pick & Drop',
            cities: [{ name: 'Bangkok', nights: 3 }],
            transfers: [
                { query: 'arrival transfer from Bangkok Airport', fallbackName: 'Private arrival transfer from Bangkok Airport to Bangkok Hotel', defaultPrice: 1000 },
                { query: 'Bangkok Hotel to Bangkok Airport', fallbackName: 'Private Transfer Bangkok Hotel to Bangkok Airport', defaultPrice: 1000 }
            ],
            tours: [
                { query: 'Chao Phraya Dinner Cruise', type: 'join', fallbackName: 'Chao Phraya Dinner Cruise (Join Tour)', defaultPrice: 1450 },
                { query: 'Dream World with Snow Town', type: 'join', fallbackName: 'Dream World with Snow Town and Lunch - Super Visa (Join Tour)', defaultPrice: 2000 }
            ]
        },
        'bkk_4n': {
            id: 'bkk_4n',
            title: '04N 05D Bangkok',
            cat: 'bangkok',
            badge: 'Popular',
            summary: '4N Bangkok • Chao Phraya Cruise • Dream World • Safari World • Airport Transfers',
            cities: [{ name: 'Bangkok', nights: 4 }],
            transfers: [
                { query: 'arrival transfer from Bangkok Airport', fallbackName: 'Private arrival transfer from Bangkok Airport to Bangkok Hotel', defaultPrice: 1000 },
                { query: 'Bangkok Hotel to Bangkok Airport', fallbackName: 'Private Transfer Bangkok Hotel to Bangkok Airport', defaultPrice: 1000 }
            ],
            tours: [
                { query: 'Chao Phraya Dinner Cruise', type: 'join', fallbackName: 'Chao Phraya Dinner Cruise (Join Tour)', defaultPrice: 1450 },
                { query: 'Dream World with Snow Town', type: 'join', fallbackName: 'Dream World with Snow Town and Lunch - Super Visa (Join Tour)', defaultPrice: 2000 },
                { query: 'Safari World & Marine Park', type: 'join', fallbackName: 'Safari World & Marine Park with Lunch (Join Tour)', defaultPrice: 1220 }
            ]
        },
        'pat_2n_bkk_3n': {
            id: 'pat_2n_bkk_3n',
            title: '02N Pattaya 03N Bangkok',
            cat: 'pattaya',
            badge: 'Top Pick',
            summary: '2N Pattaya + 3N Bangkok • Coral Island • Big Buddha • Chao Phraya • Dream World • 3 Transfers',
            cities: [
                { name: 'Pattaya', nights: 2 },
                { name: 'Bangkok', nights: 3 }
            ],
            transfers: [
                { query: 'Bangkok  Airport and Transfer to Pattaya', fallbackName: 'Private Arrival at Bangkok Airport and Transfer to Pattaya Hotel', defaultPrice: 1900 },
                { query: 'Pattaya  Hotel to Bangkok  Hotel', fallbackName: 'Private Transfer Pattaya Hotel to Bangkok Hotel', defaultPrice: 1700 },
                { query: 'Bangkok Hotel to Bangkok Airport', fallbackName: 'Private Transfer Bangkok Hotel to Bangkok Airport', defaultPrice: 1000 }
            ],
            tours: [
                { query: 'Coral Island tour with Lunch', type: 'join', fallbackName: 'Coral Island tour with Lunch (Join Tour)', defaultPrice: 600 },
                { query: 'Pataya City Tour - Big Buddha', type: 'join', fallbackName: 'Pataya City Tour - Big Buddha & Viewpoint (Join Tour)', defaultPrice: 300 },
                { query: 'Chao Phraya Dinner Cruise', type: 'join', fallbackName: 'Chao Phraya Dinner Cruise (Join Tour)', defaultPrice: 1450 },
                { query: 'Dream World with Snow Town', type: 'join', fallbackName: 'Dream World with Snow Town and Lunch - Super Visa (Join Tour)', defaultPrice: 2000 }
            ]
        },
        'pat_1n_bkk_3n': {
            id: 'pat_1n_bkk_3n',
            title: '01N Pattaya 03N Bangkok',
            cat: 'pattaya',
            badge: 'Popular',
            summary: '1N Pattaya + 3N Bangkok • Coral Island • Chao Phraya • Dream World • 3 Transfers',
            cities: [
                { name: 'Pattaya', nights: 1 },
                { name: 'Bangkok', nights: 3 }
            ],
            transfers: [
                { query: 'Bangkok  Airport and Transfer to Pattaya', fallbackName: 'Private Arrival at Bangkok Airport and Transfer to Pattaya Hotel', defaultPrice: 1900 },
                { query: 'Pattaya  Hotel to Bangkok  Hotel', fallbackName: 'Private Transfer Pattaya Hotel to Bangkok Hotel', defaultPrice: 1700 },
                { query: 'Bangkok Hotel to Bangkok Airport', fallbackName: 'Private Transfer Bangkok Hotel to Bangkok Airport', defaultPrice: 1000 }
            ],
            tours: [
                { query: 'Coral Island tour with Lunch', type: 'join', fallbackName: 'Coral Island tour with Lunch (Join Tour)', defaultPrice: 600 },
                { query: 'Chao Phraya Dinner Cruise', type: 'join', fallbackName: 'Chao Phraya Dinner Cruise (Join Tour)', defaultPrice: 1450 },
                { query: 'Dream World with Snow Town', type: 'join', fallbackName: 'Dream World with Snow Town and Lunch - Super Visa (Join Tour)', defaultPrice: 2000 }
            ]
        },
        'pkt_3n': {
            id: 'pkt_3n',
            title: '03N 04D Phuket',
            cat: 'phuket',
            badge: 'Island Tour',
            summary: '3N Phuket • Phuket City Tour • Phi Phi Island Speedboat • James Bond Island • Transfers',
            cities: [{ name: 'Phuket', nights: 3 }],
            transfers: [
                { query: 'Arrival at Phuket Airport and Transfer to Phuket', fallbackName: 'Arrival at Phuket Airport and Transfer to Phuket Hotel Pvt Basis', defaultPrice: 850 },
                { query: 'Private Transfer Phuket Hotel Phuket  Airport', fallbackName: 'Private Transfer Phuket Hotel Phuket Airport Pvt Basis', defaultPrice: 850 }
            ],
            tours: [
                { query: 'Wat Chalong, Big Buddha', type: 'join', fallbackName: 'Phuket City Tour: Wat Chalong, Big Buddha (Join Tour)', defaultPrice: 600 },
                { query: 'Phi Phi Island, Maya Bay', type: 'join', fallbackName: 'Phi Phi Island, Maya Bay & Khai Island Speedboat Full Day Tour with Lunch (Join Tour)', defaultPrice: 1300 },
                { query: 'James bond Island Tour', type: 'join', fallbackName: 'James bond Island Tour & Long Tail Boat Full Day Tour with Lunch (Join Tour)', defaultPrice: 1300 }
            ]
        },
        'pkt_3n_new': {
            id: 'pkt_3n_new',
            title: '03N Phuket New',
            cat: 'phuket',
            badge: 'Speedboat',
            summary: '3N Phuket • Phi Phi Island • James Bond Island • Airport Transfers',
            cities: [{ name: 'Phuket', nights: 3 }],
            transfers: [
                { query: 'Arrival at Phuket Airport and Transfer to Phuket', fallbackName: 'Arrival at Phuket Airport and Transfer to Phuket Hotel Pvt Basis', defaultPrice: 850 },
                { query: 'Private Transfer Phuket Hotel Phuket  Airport', fallbackName: 'Private Transfer Phuket Hotel Phuket Airport Pvt Basis', defaultPrice: 850 }
            ],
            tours: [
                { query: 'Phi Phi Island, Maya Bay', type: 'join', fallbackName: 'Phi Phi Island, Maya Bay & Khai Island Speedboat Full Day Tour with Lunch (Join Tour)', defaultPrice: 1300 },
                { query: 'James bond Island Tour', type: 'join', fallbackName: 'James bond Island Tour & Long Tail Boat Full Day Tour with Lunch (Join Tour)', defaultPrice: 1300 }
            ]
        },
        'pkt_2n_bkk_3n': {
            id: 'pkt_2n_bkk_3n',
            title: '02N Phuket 03N Bangkok',
            cat: 'combo',
            badge: 'Best Combo',
            summary: '2N Phuket + 3N Bangkok • Phi Phi Island • Chao Phraya • Dream World • 4 Transfers',
            cities: [
                { name: 'Phuket', nights: 2 },
                { name: 'Bangkok', nights: 3 }
            ],
            transfers: [
                { query: 'Arrival at Phuket Airport and Transfer to Phuket', fallbackName: 'Arrival at Phuket Airport and Transfer to Phuket Hotel Pvt Basis', defaultPrice: 850 },
                { query: 'Private Transfer Phuket Hotel Phuket  Airport', fallbackName: 'Private Transfer Phuket Hotel Phuket Airport Pvt Basis', defaultPrice: 850 },
                { query: 'arrival transfer from Bangkok Airport', fallbackName: 'Private arrival transfer from Bangkok Airport to Bangkok Hotel', defaultPrice: 1000 },
                { query: 'Bangkok Hotel to Bangkok Airport', fallbackName: 'Private Transfer Bangkok Hotel to Bangkok Airport', defaultPrice: 1000 }
            ],
            tours: [
                { query: 'Phi Phi Island, Maya Bay', type: 'join', fallbackName: 'Phi Phi Island, Maya Bay & Khai Island Speedboat Full Day Tour with Lunch (Join Tour)', defaultPrice: 1300 },
                { query: 'Chao Phraya Dinner Cruise', type: 'join', fallbackName: 'Chao Phraya Dinner Cruise (Join Tour)', defaultPrice: 1450 },
                { query: 'Dream World with Snow Town', type: 'join', fallbackName: 'Dream World with Snow Town and Lunch - Super Visa (Join Tour)', defaultPrice: 2000 }
            ]
        },
        'pkt_3n_kb_2n': {
            id: 'pkt_3n_kb_2n',
            title: '03N Phuket 02N Krabi',
            cat: 'phuket',
            badge: 'Tropical',
            summary: '3N Phuket + 2N Krabi • Phi Phi Island • James Bond • Emerald Pool Hot Springs • Transfers',
            cities: [
                { name: 'Phuket', nights: 3 },
                { name: 'Krabi', nights: 2 }
            ],
            transfers: [
                { query: 'Arrival at Phuket Airport and Transfer to Phuket', fallbackName: 'Arrival at Phuket Airport and Transfer to Phuket Hotel Pvt Basis', defaultPrice: 850 },
                { query: 'Private Transfer Phuket Hotel Phuket  Airport', fallbackName: 'Private Transfer Phuket Hotel Phuket Airport Pvt Basis', defaultPrice: 850 }
            ],
            tours: [
                { query: 'Phi Phi Island, Maya Bay', type: 'join', fallbackName: 'Phi Phi Island, Maya Bay & Khai Island Speedboat Full Day Tour with Lunch (Join Tour)', defaultPrice: 1300 },
                { query: 'James bond Island Tour', type: 'join', fallbackName: 'James bond Island Tour & Long Tail Boat Full Day Tour with Lunch (Join Tour)', defaultPrice: 1300 }
            ]
        },
        'combo_6n': {
            id: 'combo_6n',
            title: '2N Phuket 2N Pattaya 2N Bangkok',
            cat: 'combo',
            badge: 'Grand 6N',
            summary: '6N Ultimate Thailand • Phi Phi Island • Coral Island • Chao Phraya • Dream World • All Transfers',
            cities: [
                { name: 'Phuket', nights: 2 },
                { name: 'Pattaya', nights: 2 },
                { name: 'Bangkok', nights: 2 }
            ],
            transfers: [
                { query: 'Arrival at Phuket Airport and Transfer to Phuket', fallbackName: 'Arrival at Phuket Airport and Transfer to Phuket Hotel Pvt Basis', defaultPrice: 850 },
                { query: 'Private Transfer Phuket Hotel Phuket  Airport', fallbackName: 'Private Transfer Phuket Hotel Phuket Airport Pvt Basis', defaultPrice: 850 },
                { query: 'Bangkok  Airport and Transfer to Pattaya', fallbackName: 'Private Arrival at Bangkok Airport and Transfer to Pattaya Hotel', defaultPrice: 1900 },
                { query: 'Pattaya  Hotel to Bangkok  Hotel', fallbackName: 'Private Transfer Pattaya Hotel to Bangkok Hotel', defaultPrice: 1700 },
                { query: 'Bangkok Hotel to Bangkok Airport', fallbackName: 'Private Transfer Bangkok Hotel to Bangkok Airport', defaultPrice: 1000 }
            ],
            tours: [
                { query: 'Wat Chalong, Big Buddha', type: 'join', fallbackName: 'Phuket City Tour: Wat Chalong, Big Buddha (Join Tour)', defaultPrice: 600 },
                { query: 'Phi Phi Island, Maya Bay', type: 'join', fallbackName: 'Phi Phi Island, Maya Bay & Khai Island Speedboat Full Day Tour with Lunch (Join Tour)', defaultPrice: 1300 },
                { query: 'Coral Island tour with Lunch', type: 'join', fallbackName: 'Coral Island tour with Lunch (Join Tour)', defaultPrice: 600 },
                { query: 'Chao Phraya Dinner Cruise', type: 'join', fallbackName: 'Chao Phraya Dinner Cruise (Join Tour)', defaultPrice: 1450 },
                { query: 'Dream World with Snow Town', type: 'join', fallbackName: 'Dream World with Snow Town and Lunch - Super Visa (Join Tour)', defaultPrice: 2000 }
            ]
        },
        'combo_4n': {
            id: 'combo_4n',
            title: '2N Phuket 2N Pattaya',
            cat: 'combo',
            badge: 'Dual City',
            summary: '2N Phuket + 2N Pattaya • Phuket City Tour • Phi Phi Island • Coral Island • Floating Market • Transfers',
            cities: [
                { name: 'Phuket', nights: 2 },
                { name: 'Pattaya', nights: 2 }
            ],
            transfers: [
                { query: 'Arrival at Phuket Airport and Transfer to Phuket', fallbackName: 'Arrival at Phuket Airport and Transfer to Phuket Hotel Pvt Basis', defaultPrice: 850 },
                { query: 'Private Transfer Phuket Hotel Phuket  Airport', fallbackName: 'Private Transfer Phuket Hotel Phuket Airport Pvt Basis', defaultPrice: 850 },
                { query: 'Bangkok  Airport and Transfer to Pattaya', fallbackName: 'Private Arrival at Bangkok Airport and Transfer to Pattaya Hotel', defaultPrice: 1900 }
            ],
            tours: [
                { query: 'Wat Chalong, Big Buddha', type: 'join', fallbackName: 'Phuket City Tour: Wat Chalong, Big Buddha (Join Tour)', defaultPrice: 600 },
                { query: 'Phi Phi Island, Maya Bay', type: 'join', fallbackName: 'Phi Phi Island, Maya Bay & Khai Island Speedboat Full Day Tour with Lunch (Join Tour)', defaultPrice: 1300 },
                { query: 'Coral Island tour with Lunch', type: 'join', fallbackName: 'Coral Island tour with Lunch (Join Tour)', defaultPrice: 600 },
                { query: 'Floting Market', type: 'ticket', fallbackName: 'Pattaya Floating Market (Ticket Only)', defaultPrice: 150 }
            ]
        }
    };

    let costingPresets = {};
    let activeLoadedPresetKey = null;
    let activePresetCategory = 'all';

    // ── FIREBASE CLOUD & LOCAL STORAGE SYNC ──
    async function loadCostingPresetsFromCloud() {
        let loaded = null;
        try {
            if (typeof db !== 'undefined' && db) {
                const doc = await db.collection('slw_settings').doc('costing_presets').get();
                if (doc.exists) {
                    const data = doc.data();
                    if (data && data.presets && Object.keys(data.presets).length > 0) {
                        loaded = data.presets;
                        localStorage.setItem('SLW_Costing_Presets', JSON.stringify(loaded));
                        updatePresetSyncBadge('cloud');
                    }
                }
            }
        } catch(e) {
            console.error("Firebase Costing Presets load error:", e);
        }

        if (!loaded) {
            const cached = localStorage.getItem('SLW_Costing_Presets');
            if (cached) {
                try {
                    loaded = JSON.parse(cached);
                    updatePresetSyncBadge('local');
                } catch(e){}
            }
        }

        if (!loaded || Object.keys(loaded).length === 0) {
            // First time initialize with DEFAULT presets + any legacy custom presets
            loaded = JSON.parse(JSON.stringify(DEFAULT_ITINERARY_PRESETS));
            try {
                const legacyCustom = JSON.parse(localStorage.getItem('SLW_Custom_Costing_Presets') || '{}');
                Object.assign(loaded, legacyCustom);
            } catch(e){}
            localStorage.setItem('SLW_Costing_Presets', JSON.stringify(loaded));
            updatePresetSyncBadge('local');
            // Silent save to cloud if db available
            saveCostingPresetsToCloud(true);
        }

        costingPresets = loaded;
        renderPresetCardsGrid();
    }

    async function saveCostingPresetsToCloud(silent = false) {
        try {
            localStorage.setItem('SLW_Costing_Presets', JSON.stringify(costingPresets));
            if (typeof db !== 'undefined' && db) {
                updatePresetSyncBadge('syncing');
                await db.collection('slw_settings').doc('costing_presets').set({
                    presets: costingPresets,
                    updatedAt: new Date().toISOString()
                });
                updatePresetSyncBadge('cloud');
                if (!silent) {
                    showNotification("☁️ Packages successfully saved & synced to Firebase Cloud!", false);
                }
            } else {
                updatePresetSyncBadge('local');
                if (!silent) {
                    showNotification("💾 Packages saved locally (Firebase offline)", false);
                }
            }
        } catch(err) {
            console.error("Preset Cloud sync error:", err);
            updatePresetSyncBadge('local');
            if (!silent) {
                showNotification("⚠️ Saved locally (Firebase Sync Error: " + err.message + ")", true);
            }
        }
    }

    function updatePresetSyncBadge(status) {
        const badge = document.getElementById('presetCloudSyncBadge');
        const text = document.getElementById('presetCloudSyncText');
        if (!badge || !text) return;

        const count = Object.keys(costingPresets).length;
        if (status === 'cloud') {
            badge.className = "bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-300";
            badge.innerHTML = `<i class="fas fa-cloud text-emerald-600"></i> <span>Cloud Synced (${count})</span>`;
        } else if (status === 'syncing') {
            badge.className = "bg-blue-100 text-blue-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-blue-300";
            badge.innerHTML = `<i class="fas fa-spinner fa-spin text-blue-600"></i> <span>Syncing...</span>`;
        } else {
            badge.className = "bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-amber-300";
            badge.innerHTML = `<i class="fas fa-database text-amber-600"></i> <span>Local Ready (${count})</span>`;
        }
    }

    function filterPresetCategory(cat) {
        activePresetCategory = cat;
        document.querySelectorAll('.preset-cat-btn').forEach(b => {
            b.className = 'preset-cat-btn px-3 py-1 bg-white text-gray-700 border hover:bg-gray-50 rounded-md font-semibold transition';
        });
        const activeBtn = document.getElementById('btnPresetCat-' + cat);
        if (activeBtn) {
            activeBtn.className = 'preset-cat-btn px-3 py-1 bg-teal-600 text-white rounded-md font-bold shadow-xs transition';
        }
        renderPresetCardsGrid();
    }

    function renderPresetCardsGrid() {
        const container = document.getElementById('itineraryPresetCardsGrid');
        if (!container) return;
        container.innerHTML = '';

        const allKeys = Object.keys(costingPresets);

        // Update category counts
        let counts = { all: allKeys.length, bangkok: 0, pattaya: 0, phuket: 0, combo: 0, custom: 0 };
        allKeys.forEach(k => {
            const cat = costingPresets[k].cat || 'custom';
            if (counts[cat] !== undefined) counts[cat]++;
            else counts.custom++;
        });

        const btnAll = document.getElementById('btnPresetCat-all');
        const btnBkk = document.getElementById('btnPresetCat-bangkok');
        const btnPat = document.getElementById('btnPresetCat-pattaya');
        const btnPkt = document.getElementById('btnPresetCat-phuket');
        const btnCmb = document.getElementById('btnPresetCat-combo');
        const btnCst = document.getElementById('btnPresetCat-custom');

        if (btnAll) btnAll.innerText = `All (${counts.all})`;
        if (btnBkk) btnBkk.innerText = `Bangkok (${counts.bangkok})`;
        if (btnPat) btnPat.innerText = `Pattaya + BKK (${counts.pattaya})`;
        if (btnPkt) btnPkt.innerText = `Phuket & Krabi (${counts.phuket})`;
        if (btnCmb) btnCmb.innerText = `Multi-City Combos (${counts.combo})`;
        if (btnCst) btnCst.innerText = `My Custom (${counts.custom})`;

        allKeys.forEach(key => {
            const p = costingPresets[key];
            const pCat = p.cat || 'custom';

            if (activePresetCategory !== 'all') {
                if (activePresetCategory === 'custom') {
                    if (pCat !== 'custom' && !key.startsWith('custom_') && !key.startsWith('pkg_')) return;
                } else if (pCat !== activePresetCategory) {
                    return;
                }
            }

            const isActive = (key === activeLoadedPresetKey);
            const tourCount = (p.tours || []).length;
            const transferCount = (p.transfers || []).length;
            const summaryText = p.summary || ((p.cities || []).map(c => (c.numberOfNights || c.nights || 1) + 'N ' + c.name).join(' + ') + ` • ${tourCount} Tours • ${transferCount} Transfers`);

            const card = document.createElement('div');
            card.className = `group relative rounded-xl border-2 p-3.5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
                isActive 
                    ? 'border-emerald-500 ring-2 ring-emerald-400/80 bg-gradient-to-br from-emerald-50/80 to-teal-50/60' 
                    : 'border-teal-200/80 hover:border-teal-500 bg-white hover:bg-teal-50/40'
            }`;

            card.innerHTML = `
                <div>
                    <div class="flex items-start justify-between gap-1 mb-1.5">
                        <span class="text-xs font-bold ${isActive ? 'text-emerald-950 font-extrabold' : 'text-gray-800'} truncate pr-1" title="${p.title}">
                            ${p.title}
                        </span>
                        <div class="flex items-center gap-1 flex-shrink-0">
                            ${isActive ? '<span class="text-[9px] bg-emerald-600 text-white font-black px-1.5 py-0.5 rounded shadow-xs tracking-wider animate-pulse">ACTIVE ✓</span>' : ''}
                            <span class="text-[9px] ${isActive ? 'bg-emerald-200 text-emerald-900' : 'bg-teal-100 text-teal-800'} font-extrabold px-1.5 py-0.5 rounded uppercase flex-shrink-0">
                                ${p.badge || 'PKG'}
                            </span>
                        </div>
                    </div>
                    <p class="text-[11px] text-gray-600 line-clamp-2 leading-snug">
                        ${summaryText}
                    </p>
                </div>
                <div class="mt-2.5 pt-2 border-t ${isActive ? 'border-emerald-200' : 'border-gray-100'} flex items-center justify-between text-[11px]">
                    <span class="text-gray-400 font-medium">${tourCount} Tours • ${transferCount} Trf</span>
                    <div class="flex items-center gap-1.5">
                        <button onclick="openPresetModal('${key}', false); event.stopPropagation();" class="text-gray-400 hover:text-teal-700 text-xs px-1 py-0.5 rounded hover:bg-teal-100/50" title="Edit Package Info">
                            ✎
                        </button>
                        <button onclick="deleteCostingPreset('${key}', event)" class="text-gray-400 hover:text-red-600 text-xs px-1 py-0.5 rounded hover:bg-red-50" title="Delete Package">
                            🗑
                        </button>
                        <button onclick="loadItineraryPreset('${key}')" class="px-2 py-0.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] shadow-xs flex items-center gap-0.5 group-hover:scale-105 transition-transform">
                            <span>Cost</span> ⚡
                        </button>
                    </div>
                </div>
            `;

            container.appendChild(card);
        });

        updateActivePresetStatusBar();
    }

    function updateActivePresetStatusBar() {
        const bar = document.getElementById('activePresetStatusBar');
        if (!bar) return;

        if (activeLoadedPresetKey && costingPresets[activeLoadedPresetKey]) {
            const p = costingPresets[activeLoadedPresetKey];
            bar.classList.remove('hidden');
            const titleEl = document.getElementById('activePresetTitle');
            const badgeEl = document.getElementById('activePresetBadge');
            const descEl = document.getElementById('activePresetDesc');

            if (titleEl) titleEl.innerText = p.title;
            if (badgeEl) badgeEl.innerText = p.badge || 'ACTIVE';
            if (descEl) {
                const tourCount = availableTours.length;
                const trfCount = availableTransfers.length;
                const cityStr = availableCities.map(c => (c.numberOfNights || 1) + 'N ' + c.name).join(' + ');
                descEl.innerText = `${cityStr} • ${tourCount} Tours • ${trfCount} Transfers. Modify prices below, then click "Save Changes to This Package" to update permanently.`;
            }
        } else {
            bar.classList.add('hidden');
        }
    }

    function unlinkActivePreset() {
        activeLoadedPresetKey = null;
        window.__slwImportedItineraryBase = null;
        updateActivePresetStatusBar();
        renderPresetCardsGrid();
        showNotification("Active package unlinked. Current costing sheet is unchanged.", false);
    }

    function loadItineraryPreset(presetKey) {
        window.__slwImportedItineraryBase = null;
        const preset = costingPresets[presetKey];
        if (!preset) return;

        if (availableTours.length > 0 || availableCities.length > 0) {
            if (!confirm(`Load package "${preset.title}"?\n\nThis will load this package's hotels, tours, and transfers into the costing calculator.`)) {
                return;
            }
        }

        activeLoadedPresetKey = presetKey;

        // 1. Setup Cities
        availableCities = [];
        (preset.cities || []).forEach(pc => {
            const cityName = pc.name;
            const nights = Number(pc.numberOfNights || pc.nights || 1);

            // If preset has saved hotel details and prices, load them directly!
            if (pc.hotel3Price !== undefined || pc.hotel3Name !== undefined) {
                availableCities.push({
                    name: cityName,
                    numberOfNights: nights,
                    isSplit: !!pc.isSplit,
                    hotel3Nights: pc.hotel3Nights !== undefined ? Number(pc.hotel3Nights) : nights,
                    hotel4Nights: pc.hotel4Nights !== undefined ? Number(pc.hotel4Nights) : nights,
                    hotel5Nights: pc.hotel5Nights !== undefined ? Number(pc.hotel5Nights) : nights,
                    hotel3Name: pc.hotel3Name || `Standard 3* Hotel in ${cityName}`,
                    hotel3Price: Number(pc.hotel3Price) || 0,
                    hotel3Meal: Number(pc.hotel3Meal) || 0,
                    hotel4Name: pc.hotel4Name || `Standard 4* Hotel in ${cityName}`,
                    hotel4Price: Number(pc.hotel4Price) || 0,
                    hotel4Meal: Number(pc.hotel4Meal) || 0,
                    hotel5Name: pc.hotel5Name || '',
                    hotel5Price: Number(pc.hotel5Price) || 0,
                    hotel5Meal: Number(pc.hotel5Meal) || 0,
                    mixPref: pc.mixPref || '3',
                    selected: pc.selected !== false
                });
            } else {
                // Initial template fallback: lookup Master DB
                const h3 = (masterDb.hotels || []).find(h => parseInt(h.star) === 3 && (h.location || '').toLowerCase() === cityName.toLowerCase());
                const h4 = (masterDb.hotels || []).find(h => parseInt(h.star) === 4 && (h.location || '').toLowerCase() === cityName.toLowerCase());
                const h5 = (masterDb.hotels || []).find(h => parseInt(h.star) === 5 && (h.location || '').toLowerCase() === cityName.toLowerCase());

                availableCities.push({
                    name: cityName,
                    numberOfNights: nights,
                    isSplit: false,
                    hotel3Nights: nights,
                    hotel4Nights: nights,
                    hotel5Nights: nights,
                    hotel3Name: h3 ? h3.name : `Standard 3* Hotel in ${cityName}`,
                    hotel3Price: h3 ? Number(h3.price) : 1400,
                    hotel3Meal: h3 ? Number(h3.mealPrice || 0) : 250,
                    hotel4Name: h4 ? h4.name : `Standard 4* Hotel in ${cityName}`,
                    hotel4Price: h4 ? Number(h4.price) : 2600,
                    hotel4Meal: h4 ? Number(h4.mealPrice || 0) : 400,
                    hotel5Name: h5 ? h5.name : '',
                    hotel5Price: h5 ? Number(h5.price) : 0,
                    hotel5Meal: h5 ? Number(h5.mealPrice || 0) : 0,
                    mixPref: '3',
                    selected: true
                });
            }
        });

        // 2. Setup Transfers
        availableTransfers = [];
        (preset.transfers || []).forEach(pt => {
            if (pt.price !== undefined && pt.name) {
                // Saved direct transfer
                availableTransfers.push({
                    name: pt.name,
                    price: Number(pt.price),
                    selected: pt.selected !== false
                });
            } else {
                // Query lookup from Master DB
                const matchedTr = (masterDb.transfers || []).find(tr => 
                    (tr.name || '').toLowerCase().includes((pt.query || '').toLowerCase())
                );
                const trName = matchedTr ? matchedTr.name : (pt.fallbackName || pt.name);
                const trPrice = matchedTr ? (matchedTr.carPrice || matchedTr.price || pt.defaultPrice) : (pt.defaultPrice || 1000);

                availableTransfers.push({
                    name: trName,
                    price: Number(trPrice),
                    selected: true
                });
            }
        });

        // 3. Setup Tours
        availableTours = [];
        (preset.tours || []).forEach(pt => {
            if (pt.price !== undefined && pt.name) {
                // Saved direct tour
                availableTours.push({
                    name: pt.name,
                    price: Number(pt.price),
                    transferPrice: Number(pt.transferPrice || 0),
                    selected: pt.selected !== false
                });
            } else {
                // Query lookup from Master DB
                const matchedTour = (masterDb.tours || []).find(t => 
                    (t.name || '').toLowerCase().includes((pt.query || '').toLowerCase())
                );

                let tourName, tourPrice, tourTransfer = 0;
                if (matchedTour) {
                    if (pt.type === 'join' && matchedTour.joinPrice) {
                        tourName = formatTourVariantName(matchedTour.name, matchedTour.joinTag || '(Join Tour)');
                        tourPrice = matchedTour.joinPrice;
                    } else if (matchedTour.ticketOnlyPrice || matchedTour.privateCarPrice) {
                        tourName = matchedTour.name + ' (Private)';
                        tourPrice = matchedTour.ticketOnlyPrice || 0;
                        tourTransfer = matchedTour.privateCarPrice || matchedTour.privateTransferPrice || 0;
                    } else {
                        tourName = matchedTour.name;
                        tourPrice = matchedTour.joinPrice || pt.defaultPrice;
                    }
                } else {
                    tourName = pt.fallbackName || pt.name;
                    tourPrice = pt.defaultPrice || 0;
                }

                availableTours.push({
                    name: tourName,
                    price: Number(tourPrice),
                    transferPrice: Number(tourTransfer),
                    selected: true
                });
            }
        });

        // 4. Setup Pax, Settings & Pricing Adjustments
        restoreAllPricingAdjustments(preset);

        renderAll();
        calculate();

        updateActivePresetStatusBar();
        renderPresetCardsGrid();

        showNotification(`⚡ Loaded Package "${preset.title}"! All services & price adjustments restored.`, false);
        document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ── SAVE CHANGES BACK TO ACTIVE PACKAGE ──
    async function saveChangesToActivePreset() {
        if (!activeLoadedPresetKey || !costingPresets[activeLoadedPresetKey]) {
            // No package active, prompt to create new
            openPresetModal(null, true);
            return;
        }

        const preset = costingPresets[activeLoadedPresetKey];
        if (!confirm(`Save all updated prices, hotels, tours, transfers, and price adjustments back into package "${preset.title}"?\n\nThis will permanently update this package for future cost calculations across all devices.`)) {
            return;
        }

        // 1. Capture exact current setup
        preset.cities = JSON.parse(JSON.stringify(availableCities));
        preset.transfers = JSON.parse(JSON.stringify(availableTransfers));
        preset.tours = JSON.parse(JSON.stringify(availableTours));

        // 2. Capture all settings & pricing adjustments
        const pricingAdj = captureAllPricingAdjustments();
        preset.settings = pricingAdj.settings;
        preset.cardMarkups = pricingAdj.cardMarkups;
        preset.customFinalPriceOverrides = pricingAdj.customFinalPriceOverrides;
        preset.renderedFinalPrices = pricingAdj.renderedFinalPrices;

        // 3. Update summary string
        const cityStr = preset.cities.map(c => (c.numberOfNights || 1) + 'N ' + c.name).join(' + ');
        preset.summary = `${cityStr} • ${preset.tours.length} Tours • ${preset.transfers.length} Transfers`;
        preset.updatedAt = new Date().toISOString();

        // 4. Save to Cloud and LocalStorage
        await saveCostingPresetsToCloud(false);

        updateActivePresetStatusBar();
        renderPresetCardsGrid();

        showNotification(`✅ Successfully updated package "${preset.title}" with new prices and adjustments!`, false);
    }

    // ── PACKAGE PRESET MODAL & CREATION ENGINE ──
    function openPresetModal(presetKey = null, fromCurrentSheet = false) {
        const modal = document.getElementById('costingPresetModal');
        if (!modal) return;

        const editKeyInput = document.getElementById('presetEditKey');
        const titleInput = document.getElementById('presetModalTitleInput');
        const catSelect = document.getElementById('presetModalCatSelect');
        const badgeInput = document.getElementById('presetModalBadgeInput');
        const summaryInput = document.getElementById('presetModalSummaryInput');

        if (presetKey && costingPresets[presetKey]) {
            // Edit existing package info
            const p = costingPresets[presetKey];
            editKeyInput.value = presetKey;
            document.getElementById('costingPresetModalTitle').innerText = 'Edit Package: ' + p.title;
            titleInput.value = p.title || '';
            catSelect.value = p.cat || 'custom';
            badgeInput.value = p.badge || 'Popular';
            summaryInput.value = p.summary || '';
            document.getElementById('presetModalDeleteBtn')?.classList.remove('hidden');
        } else {
            // Create New Package
            editKeyInput.value = '';
            document.getElementById('costingPresetModalTitle').innerText = 'Add New Package Preset';
            document.getElementById('presetModalDeleteBtn')?.classList.add('hidden');

            if (availableCities.length > 0) {
                const cityStr = availableCities.map(c => (c.numberOfNights || 1) + 'N ' + c.name).join(' ');
                titleInput.value = cityStr + ' Package';
                summaryInput.value = availableCities.map(c => (c.numberOfNights || 1) + 'N ' + c.name).join(' + ') +
                    ` • ${availableTours.length} Tours • ${availableTransfers.length} Transfers`;

                const firstCity = (availableCities[0]?.name || '').toLowerCase();
                if (availableCities.length > 1) catSelect.value = 'combo';
                else if (firstCity.includes('bangkok')) catSelect.value = 'bangkok';
                else if (firstCity.includes('pattaya')) catSelect.value = 'pattaya';
                else if (firstCity.includes('phuket') || firstCity.includes('krabi')) catSelect.value = 'phuket';
                else catSelect.value = 'custom';
            } else {
                titleInput.value = '';
                summaryInput.value = '';
                catSelect.value = 'custom';
            }
            badgeInput.value = 'Popular';
        }

        populatePresetModalItemsPreview(presetKey);
        openModal('costingPresetModal');
    }

    async function deletePresetFromModal() {
        const key = document.getElementById('presetEditKey')?.value;
        if (!key) return;
        await deleteCostingPreset(key);
        closeModal('costingPresetModal');
    }

    function setPresetBadge(badgeText) {
        const inp = document.getElementById('presetModalBadgeInput');
        if (inp) inp.value = badgeText;
    }

    function populatePresetModalItemsPreview(presetKey = null) {
        const preview = document.getElementById('presetModalItemsPreview');
        if (!preview) return;

        let cities = availableCities;
        let tours = availableTours;
        let transfers = availableTransfers;

        // If editing a preset without active sheet, look at preset's data
        if (presetKey && costingPresets[presetKey] && availableCities.length === 0) {
            cities = costingPresets[presetKey].cities || [];
            tours = costingPresets[presetKey].tours || [];
            transfers = costingPresets[presetKey].transfers || [];
        }

        if (cities.length === 0 && tours.length === 0 && transfers.length === 0) {
            preview.innerHTML = '<div class="text-gray-400 italic py-2">No services currently added. You can add cities, tours, and transfers in the calculator first, or save now and configure later.</div>';
            return;
        }

        let html = '<div class="space-y-2">';
        
        // Cities
        if (cities.length > 0) {
            html += '<div><span class="font-bold text-gray-700 text-[11px]">🏨 Cities & Hotels:</span><ul class="list-disc list-inside pl-1 text-[11px] text-gray-600">';
            cities.forEach(c => {
                const n = c.numberOfNights || c.nights || 1;
                html += `<li><strong>${n}N ${c.name}</strong> - 3* ${c.hotel3Name || 'Std'} (฿${c.hotel3Price || 0}), 4* ${c.hotel4Name || 'Std'} (฿${c.hotel4Price || 0})</li>`;
            });
            html += '</ul></div>';
        }

        // Tours
        if (tours.length > 0) {
            html += `<div><span class="font-bold text-gray-700 text-[11px]">🎯 Tours (${tours.length}):</span><ul class="list-disc list-inside pl-1 text-[11px] text-gray-600">`;
            tours.forEach(t => {
                html += `<li>${t.name} - <strong>฿${t.price}</strong> ${t.transferPrice ? '(+฿' + t.transferPrice + ' Trf)' : ''}</li>`;
            });
            html += '</ul></div>';
        }

        // Transfers
        if (transfers.length > 0) {
            html += `<div><span class="font-bold text-gray-700 text-[11px]">🚗 Transfers (${transfers.length}):</span><ul class="list-disc list-inside pl-1 text-[11px] text-gray-600">`;
            transfers.forEach(tr => {
                html += `<li>${tr.name} - <strong>฿${tr.price}</strong></li>`;
            });
            html += '</ul></div>';
        }

        html += '</div>';
        preview.innerHTML = html;
    }

    async function saveCostingPresetFromModal() {
        const title = (document.getElementById('presetModalTitleInput')?.value || '').trim();
        if (!title) {
            alert("Please enter a Package Title.");
            return;
        }

        const editKey = document.getElementById('presetEditKey')?.value;
        const cat = document.getElementById('presetModalCatSelect')?.value || 'custom';
        const badge = (document.getElementById('presetModalBadgeInput')?.value || '').trim() || 'Custom';
        const summary = (document.getElementById('presetModalSummaryInput')?.value || '').trim() || 
            (availableCities.map(c => (c.numberOfNights || 1) + 'N ' + c.name).join(' + ') + ` • ${availableTours.length} Tours • ${availableTransfers.length} Transfers`);

        const key = editKey || ('pkg_' + Date.now());
        const existing = costingPresets[key] || {};

        const pricingAdj = captureAllPricingAdjustments();

        costingPresets[key] = {
            id: key,
            title: title,
            cat: cat,
            badge: badge,
            summary: summary,
            cities: JSON.parse(JSON.stringify(availableCities.length > 0 ? availableCities : (existing.cities || []))),
            transfers: JSON.parse(JSON.stringify(availableTransfers.length > 0 ? availableTransfers : (existing.transfers || []))),
            tours: JSON.parse(JSON.stringify(availableTours.length > 0 ? availableTours : (existing.tours || []))),
            settings: pricingAdj.settings,
            cardMarkups: pricingAdj.cardMarkups,
            customFinalPriceOverrides: pricingAdj.customFinalPriceOverrides,
            renderedFinalPrices: pricingAdj.renderedFinalPrices,
            updatedAt: new Date().toISOString()
        };

        activeLoadedPresetKey = key;

        await saveCostingPresetsToCloud(false);

        closeModal('costingPresetModal');
        updateActivePresetStatusBar();
        renderPresetCardsGrid();

        showNotification(`✅ Package "${title}" saved successfully with all price adjustments!`, false);
    }

    async function deleteCostingPreset(key, event) {
        if (event) event.stopPropagation();
        const p = costingPresets[key];
        if (!p) return;

        if (!confirm(`Are you sure you want to delete package "${p.title}"?\n\nThis will remove it from presets across all devices.`)) {
            return;
        }

        if (activeLoadedPresetKey === key) {
            unlinkActivePreset();
        }

        delete costingPresets[key];
        await saveCostingPresetsToCloud(false);
        renderPresetCardsGrid();
        showNotification(`Package "${p.title}" deleted.`, false);
    }

    async function resetDefaultCostingPresets() {
        if (!confirm("Reset to factory default Thailand packages?\n\nThis will restore the original standard Thailand packages.")) {
            return;
        }

        // Keep custom packages if any
        const customPkgs = {};
        Object.keys(costingPresets).forEach(k => {
            if (costingPresets[k].cat === 'custom' || k.startsWith('custom_') || k.startsWith('pkg_')) {
                customPkgs[k] = costingPresets[k];
            }
        });

        costingPresets = Object.assign(JSON.parse(JSON.stringify(DEFAULT_ITINERARY_PRESETS)), customPkgs);
        await saveCostingPresetsToCloud(false);
        renderPresetCardsGrid();
        showNotification("Restored default Thailand package presets!", false);
    }

    // ── DIRECT ITINERARY BUILDER JSON IMPORTER ──
    function handleItineraryJsonUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                parseAndLoadItineraryJson(data, file.name);
            } catch(err) {
                showNotification("Failed to parse Itinerary JSON: " + err.message, true);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    function parseAndLoadItineraryJson(data, fileName) {
        if (!data || (!data.days && !data.inclusions)) {
            showNotification("Invalid Itinerary Builder JSON format.", true);
            return;
        }

        const title = data.title || fileName.replace(/\.json$/i, '');
        if (!confirm(`Convert and cost itinerary "${title}"?\n\nThis will auto-extract all tours, transfers, and hotels.`)) {
            return;
        }

        // Extract days and activities
        const days = data.days || [];
        const inclusions = data.inclusions || [];

        // Detect cities & nights
        const cityNightMap = {};
        const knownCities = ['Bangkok', 'Pattaya', 'Phuket', 'Krabi', 'Chiang Mai', 'Samui'];

        // Scan title & days
        let primaryCity = 'Bangkok';
        knownCities.forEach(c => {
            if (title.toLowerCase().includes(c.toLowerCase())) primaryCity = c;
        });

        days.forEach(d => {
            let dayCity = primaryCity;
            const text = (d.activities || []).join(' ') + ' ' + (d.title || '');
            knownCities.forEach(c => {
                if (text.toLowerCase().includes(c.toLowerCase())) dayCity = c;
            });
            cityNightMap[dayCity] = (cityNightMap[dayCity] || 0) + 1;
        });

        // Ensure at least total days - 1 nights
        availableCities = [];
        const detectedCityNames = Object.keys(cityNightMap);
        if (detectedCityNames.length === 0) {
            cityNightMap[primaryCity] = Math.max(1, days.length - 1);
        }

        Object.keys(cityNightMap).forEach(cName => {
            const rawNights = cityNightMap[cName];
            const nights = Math.max(1, Math.min(rawNights, days.length > 1 ? days.length - 1 : 1));

            const h3 = (masterDb.hotels || []).find(h => parseInt(h.star) === 3 && (h.location || '').toLowerCase() === cName.toLowerCase());
            const h4 = (masterDb.hotels || []).find(h => parseInt(h.star) === 4 && (h.location || '').toLowerCase() === cName.toLowerCase());

            availableCities.push({
                name: cName,
                numberOfNights: nights,
                isSplit: false,
                hotel3Nights: nights,
                hotel4Nights: nights,
                hotel5Nights: nights,
                hotel3Name: h3 ? h3.name : `Hotel in ${cName} 3*`,
                hotel3Price: h3 ? h3.price : 1400,
                hotel3Meal: h3 ? (h3.mealPrice || 0) : 250,
                hotel4Name: h4 ? h4.name : `Hotel in ${cName} 4*`,
                hotel4Price: h4 ? h4.price : 2600,
                hotel4Meal: h4 ? (h4.mealPrice || 0) : 400,
                hotel5Name: '',
                hotel5Price: 0,
                hotel5Meal: 0,
                mixPref: '3',
                selected: true
            });
        });

        // Extract tours from inclusions & activities
        availableTours = [];
        const allActivityTexts = [
            ...inclusions,
            ...days.flatMap(d => d.activities || [])
        ];

        const matchedTourIds = new Set();
        allActivityTexts.forEach(actStr => {
            const clean = actStr.replace(/<[^>]*>/g, '').trim();
            if (!clean || clean.toLowerCase().includes('breakfast') || clean.toLowerCase().includes('overnight') || clean.toLowerCase().includes('checkout')) return;

            (masterDb.tours || []).forEach(t => {
                if (matchedTourIds.has(t.id)) return;
                const baseName = t.name.toLowerCase();
                // Check if meaningful keyword is present
                const keywords = baseName.split(/[\s,()\-]+/).filter(w => w.length > 3 && !['tour', 'with', 'lunch', 'private', 'transfer', 'join'].includes(w));
                const matchCount = keywords.filter(kw => clean.toLowerCase().includes(kw)).length;
                if (matchCount >= 2 || (keywords.length === 1 && matchCount === 1)) {
                    matchedTourIds.add(t.id);
                    const price = t.joinPrice || t.ticketOnlyPrice || 1000;
                    const transfer = t.privateCarPrice || 0;
                    availableTours.push({
                        name: t.name,
                        price: Number(price),
                        transferPrice: Number(transfer),
                        selected: true
                    });
                }
            });
        });

        // Extract transfers
        availableTransfers = [];
        const matchedTrIds = new Set();
        allActivityTexts.forEach(actStr => {
            const clean = actStr.replace(/<[^>]*>/g, '').trim().toLowerCase();
            if (!clean.includes('transfer') && !clean.includes('airport')) return;

            (masterDb.transfers || []).forEach(tr => {
                if (matchedTrIds.has(tr.id)) return;
                const trBase = tr.name.toLowerCase();
                const keywords = trBase.split(/[\s,()\-]+/).filter(w => w.length > 3 && !['private', 'transfer', 'hotel', 'basis'].includes(w));
                const matchCount = keywords.filter(kw => clean.includes(kw)).length;
                if (matchCount >= 2) {
                    matchedTrIds.add(tr.id);
                    availableTransfers.push({
                        name: tr.name,
                        price: Number(tr.carPrice || tr.price || 1000),
                        selected: true
                    });
                }
            });
        });

        // If no transfers detected, add default airport pick and drop
        if (availableTransfers.length === 0 && primaryCity === 'Bangkok') {
            const defTr1 = (masterDb.transfers || []).find(tr => tr.name.toLowerCase().includes('arrival transfer from bangkok airport'));
            const defTr2 = (masterDb.transfers || []).find(tr => tr.name.toLowerCase().includes('bangkok hotel to bangkok airport'));
            if (defTr1) availableTransfers.push({ name: defTr1.name, price: defTr1.carPrice || 1000, selected: true });
            if (defTr2) availableTransfers.push({ name: defTr2.name, price: defTr2.carPrice || 1000, selected: true });
        }

        window.__slwImportedItineraryBase = data;
        activeLoadedPresetKey = title;
        updateActivePresetStatusBar();

        renderAll();
        calculate();

        showNotification(`⚡ Converted "${title}"! ${availableTours.length} Tours, ${availableTransfers.length} Transfers, ${availableCities.length} Cities costed.`, false);
        document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
