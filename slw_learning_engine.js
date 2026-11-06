/**
 * SLW Learning Engine - Continuous Self-Study & Auto-Correction for Sun Leisure World
 * Learns from user manual corrections, quotation edits, and itinerary arrangements.
 * Automatically injects learned rules into Excel Generator, Google Sheets, and Itinerary Builder.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SlwLearningEngine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const STORAGE_KEY = 'slw_learned_patterns';
    const FIREBASE_COLLECTION = 'slw_settings';
    const FIREBASE_DOC = 'learned_patterns';

    // Default Seed Rules distilled from user manual corrections (e.g. INQ-39423)
    const SEED_RULES = [
        {
            id: 'rule_bkk_dinner_cruise_01',
            type: 'tour_timing',
            category: 'Tour Placement',
            title: 'Chao Phraya Dinner Cruise Timing',
            pattern: 'dinner cruise',
            city: 'Bangkok',
            preferredDayType: 'transition_evening',
            meal: 'dinner',
            description: 'Places Chao Phraya Dinner Cruise on Bangkok arrival/transition evening (Day 3) with (B/-/D) meal plan.',
            learnedFromInq: 'INQ-39423',
            learnedAt: '2026-11-06T09:30:00.000Z',
            active: true
        },
        {
            id: 'rule_pattaya_city_tour_addon_02',
            type: 'transfer_addon',
            category: 'Transfer Addon',
            title: 'Pattaya City Tour Private Van Transfer',
            pattern: 'pattaya city tour',
            city: 'Pattaya',
            transferPrice: 1200,
            targetColumn: 'Transfer (Col 7)',
            description: 'Places 1,200 THB private van transfer addon directly into Transfer Column (Col 7), ensuring accurate 5,800 THB transfer sum (2,900 THB/pax).',
            learnedFromInq: 'INQ-39423',
            learnedAt: '2026-11-06T09:30:00.000Z',
            active: true
        },
        {
            id: 'rule_en_route_pattaya_arrival_03',
            type: 'en_route',
            category: 'En-Route Tour',
            title: 'Pattaya City Tour on Arrival',
            pattern: 'pattaya city tour',
            city: 'Pattaya',
            timing: 'day_1_en_route',
            description: 'Schedules Pattaya City Tour en-route right after Bangkok Airport arrival before hotel check-in.',
            learnedFromInq: 'INQ-39423',
            learnedAt: '2026-11-06T09:30:00.000Z',
            active: true
        },
        {
            id: 'rule_coral_island_day2_04',
            type: 'tour_city',
            category: 'Tour Placement',
            title: 'Coral Island Tour with Lunch (Pattaya)',
            pattern: 'coral island',
            city: 'Pattaya',
            preferredDay: 2,
            meal: 'lunch',
            description: 'Allocates Coral Island with Lunch to Day 2 in Pattaya with (B/L/-) meal plan.',
            learnedFromInq: 'INQ-39423',
            learnedAt: '2026-11-06T09:30:00.000Z',
            active: true
        },
        {
            id: 'rule_dream_world_bkk_05',
            type: 'tour_city',
            category: 'Tour Placement',
            title: 'Dream World with Snow Town and Lunch (Bangkok)',
            pattern: 'dream world',
            city: 'Bangkok',
            preferredDay: 4,
            meal: 'lunch',
            description: 'Allocates Dream World with Snow Town and Lunch to Day 4 in Bangkok with (B/L/-) meal plan.',
            learnedFromInq: 'INQ-39423',
            learnedAt: '2026-11-06T09:30:00.000Z',
            active: true
        },
        {
            id: 'rule_hotel_similar_dedup_06',
            type: 'text_clean',
            category: 'Text Formatting',
            title: 'Hotel Check-In Duplicate Removal',
            pattern: 'or Similar',
            description: 'Prevents repetitive "or Similar 3* or Similar 3*" in check-in and hotel option rows.',
            learnedFromInq: 'INQ-39423',
            learnedAt: '2026-11-06T09:30:00.000Z',
            active: true
        }
    ];

    /**
     * Get all learned rules from LocalStorage, falling back to initial seeds
     */
    function getRules() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return JSON.parse(JSON.stringify(SEED_RULES));
        }
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_RULES));
                return JSON.parse(JSON.stringify(SEED_RULES));
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_RULES));
                return JSON.parse(JSON.stringify(SEED_RULES));
            }
            return parsed;
        } catch (e) {
            console.warn('SlwLearningEngine: Error loading rules from localStorage', e);
            return JSON.parse(JSON.stringify(SEED_RULES));
        }
    }

    /**
     * Save rules list to LocalStorage & optionally Cloud
     */
    function saveRules(rules, syncCloud = true) {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
        }
        if (syncCloud && typeof window !== 'undefined' && window.db) {
            try {
                window.db.collection(FIREBASE_COLLECTION).doc(FIREBASE_DOC).set({
                    rules: rules,
                    updatedAt: new Date().toISOString()
                }, { merge: true }).catch(err => {
                    console.warn('SlwLearningEngine: Cloud sync warning', err);
                });
            } catch (err) {
                console.warn('SlwLearningEngine: Cloud sync failed', err);
            }
        }
    }

    /**
     * Sync rules from Firebase Cloud Firestore
     */
    async function syncWithCloud(dbInstance) {
        const db = dbInstance || (typeof window !== 'undefined' ? window.db : null);
        if (!db) return getRules();
        try {
            const doc = await db.collection(FIREBASE_COLLECTION).doc(FIREBASE_DOC).get();
            if (doc.exists) {
                const data = doc.data();
                if (data && Array.isArray(data.rules) && data.rules.length > 0) {
                    const localRules = getRules();
                    const merged = mergeRules(localRules, data.rules);
                    saveRules(merged, false);
                    return merged;
                }
            } else {
                // First time initialize in Cloud
                const current = getRules();
                await db.collection(FIREBASE_COLLECTION).doc(FIREBASE_DOC).set({
                    rules: current,
                    updatedAt: new Date().toISOString()
                });
            }
        } catch (err) {
            console.warn('SlwLearningEngine: Error during syncWithCloud', err);
        }
        return getRules();
    }

    function mergeRules(primary, secondary) {
        const map = new Map();
        (secondary || []).forEach(r => { if (r && r.id) map.set(r.id, r); });
        (primary || []).forEach(r => { if (r && r.id) map.set(r.id, r); });
        return Array.from(map.values());
    }

    /**
     * Get rules learned or active today
     */
    function getTodayRules() {
        const rules = getRules();
        const todayDateStr = new Date().toISOString().split('T')[0];
        return rules.filter(r => {
            if (!r) return false;
            if (r.learnedAt && r.learnedAt.startsWith(todayDateStr)) return true;
            return r.active === true;
        });
    }

    /**
     * Toggle a rule active/inactive
     */
    function toggleRule(ruleId) {
        const rules = getRules();
        const target = rules.find(r => r.id === ruleId);
        if (target) {
            target.active = !target.active;
            saveRules(rules, true);
        }
        return rules;
    }

    /**
     * Add or update a rule
     */
    function registerRule(rule) {
        if (!rule || !rule.title) return;
        const rules = getRules();
        const existingIdx = rules.findIndex(r => r.id === rule.id || (r.pattern && rule.pattern && r.pattern.toLowerCase() === rule.pattern.toLowerCase() && r.type === rule.type));
        
        const nowIso = new Date().toISOString();
        const cleanRule = {
            id: rule.id || ('rule_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
            type: rule.type || 'custom',
            category: rule.category || 'General',
            title: rule.title,
            pattern: (rule.pattern || '').toLowerCase(),
            city: rule.city || '',
            timing: rule.timing || '',
            meal: rule.meal || '',
            transferPrice: Number(rule.transferPrice) || 0,
            targetColumn: rule.targetColumn || '',
            description: rule.description || '',
            learnedFromInq: rule.learnedFromInq || 'Manual',
            learnedAt: rule.learnedAt || nowIso,
            active: rule.active !== false
        };

        if (existingIdx !== -1) {
            rules[existingIdx] = Object.assign({}, rules[existingIdx], cleanRule);
        } else {
            rules.unshift(cleanRule);
        }

        saveRules(rules, true);
        return cleanRule;
    }

    /**
     * Continuous Learning Extractor
     * Analyzes quotation state, tours, and itinerary days to extract any adjustments made by the user
     */
    function learnFromQuotation(inqKey, costingPayload, itineraryPayload) {
        if (!costingPayload && !itineraryPayload) return;
        const learnedNew = [];

        // 1. Detect Tour Transfer Addons (e.g. Pattaya City Tour Private Van = 1200 THB)
        const tours = (costingPayload && costingPayload.availableTours) || (itineraryPayload && itineraryPayload.tours) || [];
        tours.forEach(tour => {
            if (tour && tour.selected && tour.transferPrice > 0) {
                const normName = tour.name.toLowerCase();
                const city = normName.includes('pattaya') ? 'Pattaya' : (normName.includes('phuket') ? 'Phuket' : 'Bangkok');
                const rule = registerRule({
                    id: 'rule_transfer_addon_' + normName.replace(/[^a-z0-9]/g, '_'),
                    type: 'transfer_addon',
                    category: 'Transfer Addon',
                    title: `${tour.name} Transfer Addon (${tour.transferPrice} THB)`,
                    pattern: normName,
                    city: city,
                    transferPrice: tour.transferPrice,
                    targetColumn: 'Transfer (Col 7)',
                    description: `Recorded ${tour.transferPrice} THB transfer addon on "${tour.name}" into Transfer Column for accurate total calculation.`,
                    learnedFromInq: inqKey || 'Direct Costing'
                });
                if (rule) learnedNew.push(rule);
            }
        });

        // 2. Detect Itinerary Day Placements & Meal adjustments
        const days = (itineraryPayload && itineraryPayload.days) || (costingPayload && costingPayload.days) || [];
        days.forEach((day, idx) => {
            const dayNum = idx + 1;
            const activities = day.activities || [];
            activities.forEach(act => {
                const actLower = String(act).toLowerCase();
                if (actLower.includes('dinner cruise') || actLower.includes('chao phraya')) {
                    const rule = registerRule({
                        id: 'rule_dinner_cruise_placement',
                        type: 'tour_timing',
                        category: 'Tour Placement',
                        title: 'Chao Phraya Dinner Cruise Placement',
                        pattern: 'dinner cruise',
                        city: 'Bangkok',
                        timing: dayNum === 1 ? 'arrival_evening' : 'transition_evening',
                        meal: 'dinner',
                        description: `Places Dinner Cruise on Day ${dayNum} evening with (B/-/D) meal plan.`,
                        learnedFromInq: inqKey || 'Itinerary Builder'
                    });
                    if (rule) learnedNew.push(rule);
                }
            });
        });

        return learnedNew;
    }

    /**
     * Render the Today's Learning Summary Modal
     */
    function openTodaySummaryModal() {
        if (typeof document === 'undefined') return;

        let modal = document.getElementById('slwLearningSummaryModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'slwLearningSummaryModal';
            modal.className = 'fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs transition-opacity';
            document.body.appendChild(modal);
        }

        const rules = getRules();
        const activeRules = rules.filter(r => r.active !== false);
        const todayRules = getTodayRules();
        const todayDateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        modal.innerHTML = `
            <div class="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-indigo-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in duration-200">
                <!-- Header -->
                <div class="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-400 to-indigo-500 flex items-center justify-center text-white text-xl shadow-md font-bold">
                            🧠
                        </div>
                        <div>
                            <h3 class="text-lg font-extrabold flex items-center gap-2">
                                SLW AI Knowledge &amp; Self-Correction Hub
                                <span class="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30 uppercase tracking-wider font-semibold">Continuous Learning</span>
                            </h3>
                            <p class="text-xs text-indigo-200">Rules learned from your manual corrections • Auto-applied to Excel, Google Sheets &amp; Itinerary</p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('slwLearningSummaryModal').style.display='none'" class="text-gray-400 hover:text-white text-2xl font-bold px-2 py-1 transition" title="Close">✕</button>
                </div>

                <!-- Stats Bar -->
                <div class="px-6 py-3 bg-indigo-50/70 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div class="flex items-center gap-4">
                        <span class="font-bold text-indigo-950 flex items-center gap-1.5">
                            <i class="fas fa-calendar-check text-indigo-600"></i> Date: <span class="font-extrabold text-indigo-700">${todayDateStr}</span>
                        </span>
                        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                            ✓ ${activeRules.length} Active Rules
                        </span>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="window.SlwLearningEngine.resetToDefaults()" class="text-xs px-2.5 py-1 bg-white hover:bg-red-50 text-red-600 font-semibold rounded border border-gray-200 hover:border-red-300 transition">
                            Reset to Defaults
                        </button>
                    </div>
                </div>

                <!-- Rule Cards List -->
                <div class="p-6 overflow-y-auto space-y-3 flex-1 bg-slate-50">
                    ${rules.map(rule => {
                        const isAct = rule.active !== false;
                        let catBg = 'bg-blue-100 text-blue-800 border-blue-200';
                        if (rule.category === 'Transfer Addon') catBg = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                        if (rule.category === 'En-Route Tour') catBg = 'bg-amber-100 text-amber-800 border-amber-200';
                        if (rule.category === 'Text Formatting') catBg = 'bg-purple-100 text-purple-800 border-purple-200';

                        return `
                            <div class="p-4 bg-white rounded-xl border ${isAct ? 'border-indigo-100 shadow-2xs' : 'border-gray-200 opacity-60'} transition hover:border-indigo-300 flex items-start justify-between gap-3">
                                <div class="space-y-1 flex-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="px-2 py-0.5 text-[10px] font-bold rounded-md border ${catBg}">${rule.category}</span>
                                        <h4 class="text-sm font-bold text-gray-900">${rule.title}</h4>
                                        ${rule.learnedFromInq ? `<span class="text-[10px] text-gray-400 font-mono">(${rule.learnedFromInq})</span>` : ''}
                                    </div>
                                    <p class="text-xs text-gray-600 leading-relaxed">${rule.description}</p>
                                    <div class="text-[10px] text-gray-400 flex items-center gap-3 pt-1">
                                        <span>City: <b class="text-gray-700">${rule.city || 'Multi-City'}</b></span>
                                        ${rule.transferPrice ? `<span>Transfer: <b class="text-emerald-700">${rule.transferPrice} THB</b></span>` : ''}
                                        ${rule.targetColumn ? `<span>Column: <b class="text-indigo-700">${rule.targetColumn}</b></span>` : ''}
                                    </div>
                                </div>
                                <div class="shrink-0 pt-1">
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" ${isAct ? 'checked' : ''} onchange="window.SlwLearningEngine.handleToggleRule('${rule.id}')" class="sr-only peer">
                                        <div class="w-9 h-5 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                                    </label>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <!-- Footer -->
                <div class="px-6 py-3.5 bg-white border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                    <span class="flex items-center gap-1.5 text-emerald-700 font-semibold">
                        <i class="fas fa-check-circle"></i> Changes auto-saved &amp; synced across devices
                    </span>
                    <button onclick="document.getElementById('slwLearningSummaryModal').style.display='none'" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow transition">
                        Done / Close
                    </button>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    function handleToggleRule(ruleId) {
        toggleRule(ruleId);
        openTodaySummaryModal();
    }

    function resetToDefaults() {
        if (confirm("Reset all learned rules back to default system templates?")) {
            saveRules(SEED_RULES, true);
            openTodaySummaryModal();
        }
    }

    return {
        getRules: getRules,
        getTodayRules: getTodayRules,
        saveRules: saveRules,
        toggleRule: toggleRule,
        handleToggleRule: handleToggleRule,
        registerRule: registerRule,
        learnFromQuotation: learnFromQuotation,
        syncWithCloud: syncWithCloud,
        openTodaySummaryModal: openTodaySummaryModal,
        resetToDefaults: resetToDefaults,
        SEED_RULES: SEED_RULES
    };
}));
