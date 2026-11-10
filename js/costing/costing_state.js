    // --- STATE MANAGEMENT ---
    let availableTours = [];
    let availableTransfers = [];
    let availableCities = [];
    let logoDataUrl = null;
    let customFinalPriceOverrides = {};
    window.customFinalPriceOverrides = customFinalPriceOverrides;
    const allInputIds = [
        'num_people_transfer', 'num_people_hotel',
        'tpl_rooms_count', 'total_hotel_rooms',
        'tpl_rate_3star', 'tpl_rate_4star', 'tpl_rate_5star',
        'markup', 'lkr_rate', 'usd_divisor',
        'adult_manual_markup', 'child_extra_bed_manual_markup', 'child_sharing_manual_markup',
        'guide_price_per_day', 'guide_days',
        'water_price_per_day', 'water_days',
        'meal_price_per_day', 'meal_days'
    ];

    // --- TRIPLE (TPL) ROOM HELPERS ---
    function onTplOptionToggle() {
        const isChecked = Boolean(document.getElementById('check_tpl_room')?.checked);
        const panel = document.getElementById('tpl_details_panel');
        const badge = document.getElementById('tpl_badge_active');
        if (panel) {
            if (isChecked) {
                panel.classList.remove('hidden');
                if (badge) badge.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
                if (badge) badge.classList.add('hidden');
            }
        }
        calculate();
    }

    function quickSetTplMode(pax) {
        const chk = document.getElementById('check_tpl_room');
        if (chk) chk.checked = true;
        if (pax === 3) {
            const trPaxEl = document.getElementById('num_people_transfer');
            const hDivEl = document.getElementById('num_people_hotel');
            if (trPaxEl) trPaxEl.value = 3;
            if (hDivEl) hDivEl.value = 3;
            const tplRoomsEl = document.getElementById('tpl_rooms_count');
            const totRoomsEl = document.getElementById('total_hotel_rooms');
            if (tplRoomsEl) tplRoomsEl.value = 1;
            if (totRoomsEl) totRoomsEl.value = 1;
        } else if (pax === 5) {
            const trPaxEl = document.getElementById('num_people_transfer');
            const hDivEl = document.getElementById('num_people_hotel');
            if (trPaxEl) trPaxEl.value = 5;
            if (hDivEl) hDivEl.value = 5;
            const tplRoomsEl = document.getElementById('tpl_rooms_count');
            const totRoomsEl = document.getElementById('total_hotel_rooms');
            if (tplRoomsEl) tplRoomsEl.value = 1;
            if (totRoomsEl) totRoomsEl.value = 2;
        }
        onTplOptionToggle();
        showNotification(`🛏️ Configured for ${pax} Pax with Triple (TPL) Room pricing!`, false);
    }

    function autoDetectTplFromPax() {
        const trPax = parseInt(document.getElementById('num_people_transfer')?.value) || 2;
        const hDiv = parseInt(document.getElementById('num_people_hotel')?.value) || 2;
        const pax = Math.max(trPax, hDiv);
        const chk = document.getElementById('check_tpl_room');
        if (pax === 3) {
            quickSetTplMode(3);
        } else if (pax === 5) {
            quickSetTplMode(5);
        } else if (pax % 2 !== 0 && pax > 1) {
            if (chk) chk.checked = true;
            const tplRoomsEl = document.getElementById('tpl_rooms_count');
            const totRoomsEl = document.getElementById('total_hotel_rooms');
            if (tplRoomsEl) tplRoomsEl.value = 1;
            if (totRoomsEl) totRoomsEl.value = Math.ceil(pax / 2);
            document.getElementById('num_people_transfer').value = pax;
            document.getElementById('num_people_hotel').value = pax;
            onTplOptionToggle();
            showNotification(`🛏️ Auto-detected ${pax} Pax: 1 TPL Room + ${Math.ceil(pax / 2) - 1} DBL Room(s).`, false);
        } else {
            // Even pax (e.g. 2, 4, 6)
            if (chk && !chk.checked) {
                chk.checked = true;
                const tplRoomsEl = document.getElementById('tpl_rooms_count');
                const totRoomsEl = document.getElementById('total_hotel_rooms');
                if (tplRoomsEl) tplRoomsEl.value = 1;
                if (totRoomsEl) totRoomsEl.value = Math.max(1, Math.round(pax / 2));
                onTplOptionToggle();
                showNotification(`🛏️ TPL Enabled: 1 TPL Room in ${Math.max(1, Math.round(pax / 2))} total rooms.`, false);
            } else {
                calculate();
            }
        }
    }

    // --- DATABASE INTEGRATION ---
    let masterDb = { hotels: [], tours: [], transfers: [], extras: [] };

    function updateCloudSyncStatus(source, tourCount, hotelCount) {
        const badge = document.getElementById('cloud-sync-badge');
        const text = document.getElementById('cloud-sync-text');
        if (!badge || !text) return;

        if (source === 'cloud') {
            badge.className = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 border border-green-200 shadow-sm";
            text.innerHTML = `<i class="fas fa-cloud text-green-600 mr-1"></i> Cloud Synced: ${tourCount} Tours, ${hotelCount} Hotels`;
        } else if (source === 'syncing') {
            badge.className = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 shadow-sm";
            text.innerHTML = `<i class="fas fa-spinner fa-spin text-purple-600 mr-1"></i> Syncing to Cloud...`;
        } else {
            badge.className = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm";
            text.innerHTML = `<i class="fas fa-database text-amber-600 mr-1"></i> Local Cache: ${tourCount} Tours, ${hotelCount} Hotels`;
        }
    }
