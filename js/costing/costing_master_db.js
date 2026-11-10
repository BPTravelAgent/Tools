    // ── MASTER DATABASE TAG & ROUTE HELPERS ──
    function stripTourTags(str) {
        if (!str) return '';
        return String(str)
            .replace(/\s*\([^\)]*$/gi, '')
            .replace(/\s*\((Join Tour|Join Transfer|Private Transfer|Private - Van|Private - Bus|Private - Car|Private.*|Ticket Only|Join)\)/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function extractTourNameAndTag(fullName) {
        if (!fullName) return { baseName: '', tag: '' };
        const str = String(fullName).trim();
        const knownMatch = str.match(/\s*\((Join Tour|Join Transfer|Private Transfer|Private - Van|Private - Bus|Private - Car|Private.*|Ticket Only|Join)\)\s*$/i);
        if (knownMatch) {
            return {
                baseName: str.slice(0, knownMatch.index).trim(),
                tag: knownMatch[0].trim()
            };
        }
        const genericMatch = str.match(/\s*\(([^)]+)\)\s*$/);
        if (genericMatch && /join|transfer|pvt|private|ticket|car|van|bus/i.test(genericMatch[1])) {
            return {
                baseName: str.slice(0, genericMatch.index).trim(),
                tag: genericMatch[0].trim()
            };
        }
        return {
            baseName: str,
            tag: ''
        };
    }

    function formatTourVariantName(baseName, tag) {
        if (!baseName) return '';
        let clean = String(baseName).trim();
        clean = clean.replace(/\s*\((Join Tour|Join Transfer|Private Transfer|Private - Van|Private - Bus|Private - Car|Private.*|Ticket Only|Join)\)\s*$/gi, '').trim();
        if (!tag) return clean;
        const cleanTag = tag.trim().startsWith('(') ? tag.trim() : `(${tag.trim()})`;
        return `${clean} ${cleanTag}`;
    }

    function normalizeTransferRoute(raw) {
        if (!raw) return '';
        return String(raw)
            .replace(/\s*\((Car|Van|Bus|Private.*)\)/gi, '')
            .replace(/\bPvt\s+Basis\b/gi, '')
            .replace(/\bPrivate\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function deduplicateMasterDatabase(rawDb) {
        if (!rawDb) return { tours: [], hotels: [], transfers: [], extras: [] };

        // 1. Deduplicate & Merge Tours
        // Canonical tour identity = base tour name + location (city) OR ID.
        // A single tour record holds both join details (joinPrice, joinTag like (Join Transfer)) and private details.
        const tourGroups = {};
        const tourIdMap = {};

        (rawDb.tours || []).forEach(t => {
            const rawName = String(t.name || '').trim();
            if (!rawName) return;
            const { baseName, tag: extractedTag } = extractTourNameAndTag(rawName);
            const canonName = stripTourTags(baseName || rawName);
            const loc = String(t.location || '').trim();
            const normLoc = loc.toLowerCase();
            const tag = t.joinTag || (extractedTag && /join/i.test(extractedTag) ? extractedTag : (rawName.toLowerCase().includes('join transfer') ? '(Join Transfer)' : (rawName.toLowerCase().includes('join tour') ? '(Join Tour)' : '')));
            const canonKey = (canonName.toLowerCase() + '|' + normLoc).trim();

            let target = null;
            if (t.id && tourIdMap[t.id]) {
                target = tourIdMap[t.id];
            } else if (tourGroups[canonKey]) {
                target = tourGroups[canonKey];
            }

            if (!target) {
                const newTour = {
                    id: String(t.id || ('t_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6))),
                    name: canonName,
                    location: loc,
                    joinTag: tag || null,
                    privateTag: t.privateTag || null,
                    price: (t.joinPrice !== null && t.joinPrice !== undefined && t.joinPrice !== '') ? Number(t.joinPrice) : (t.ticketOnlyPrice ? Number(t.ticketOnlyPrice) : 0),
                    joinPrice: (t.joinPrice !== null && t.joinPrice !== undefined && t.joinPrice !== '') ? Number(t.joinPrice) : null,
                    ticketOnlyPrice: (t.ticketOnlyPrice !== null && t.ticketOnlyPrice !== undefined && t.ticketOnlyPrice !== '') ? Number(t.ticketOnlyPrice) : null,
                    privateCarPrice: (t.privateCarPrice !== null && t.privateCarPrice !== undefined && t.privateCarPrice !== '') ? Number(t.privateCarPrice) : null,
                    privateVanPrice: (t.privateVanPrice !== null && t.privateVanPrice !== undefined && t.privateVanPrice !== '') ? Number(t.privateVanPrice) : null,
                    privateBusPrice: (t.privateBusPrice !== null && t.privateBusPrice !== undefined && t.privateBusPrice !== '') ? Number(t.privateBusPrice) : null
                };
                tourGroups[canonKey] = newTour;
                if (newTour.id) tourIdMap[newTour.id] = newTour;
            } else {
                // Merge/update: Latest user/cloud values take precedence without creating duplicate records
                if (canonName && canonName.length >= 3) target.name = canonName;
                if (loc) target.location = loc;
                if (tag) target.joinTag = tag;
                if (t.privateTag) target.privateTag = t.privateTag;
                if (t.joinPrice !== null && t.joinPrice !== undefined && t.joinPrice !== '') {
                    target.joinPrice = Number(t.joinPrice);
                }
                if (t.ticketOnlyPrice !== null && t.ticketOnlyPrice !== undefined && t.ticketOnlyPrice !== '') {
                    target.ticketOnlyPrice = Number(t.ticketOnlyPrice);
                }
                if (t.privateCarPrice !== null && t.privateCarPrice !== undefined && t.privateCarPrice !== '') {
                    target.privateCarPrice = Number(t.privateCarPrice);
                }
                if (t.privateVanPrice !== null && t.privateVanPrice !== undefined && t.privateVanPrice !== '') {
                    target.privateVanPrice = Number(t.privateVanPrice);
                }
                if (t.privateBusPrice !== null && t.privateBusPrice !== undefined && t.privateBusPrice !== '') {
                    target.privateBusPrice = Number(t.privateBusPrice);
                }
                target.price = target.joinPrice || target.ticketOnlyPrice || 0;
                if (t.id && !target.id) {
                    target.id = t.id;
                    tourIdMap[t.id] = target;
                }
            }
        });

        // 2. Deduplicate & Merge Transfers
        const trGroups = {};
        const trIdMap = {};
        (rawDb.transfers || []).forEach(tr => {
            const rawName = String(tr.name || '').trim();
            if (!rawName) return;
            const norm = normalizeTransferRoute(rawName);
            const isBkkPattayaArr = (norm.includes('bangkok') && norm.includes('airport') && norm.includes('pattaya')) && !norm.includes('hotel to');
            const isPattayaBkkInter = (norm.includes('pattaya') && norm.includes('hotel') && norm.includes('bangkok') && norm.includes('hotel'));
            const isBkkDep = norm.includes('bangkok') && norm.includes('hotel to') && norm.includes('airport');
            const isBkkArr = norm.includes('bangkok') && norm.includes('airport to') && norm.includes('hotel') && !norm.includes('pattaya');
            const isPhuketArr = norm.includes('phuket') && norm.includes('airport') && (norm.includes('to') || norm.includes('arrival')) && !norm.includes('hotel to');
            const isPhuketDep = norm.includes('phuket') && norm.includes('hotel') && norm.includes('airport');

            let groupKey = norm;
            let cleanDisplayName = rawName.replace(/\s+/g, ' ').trim();
            let location = String(tr.location || '').trim();

            if (isBkkPattayaArr) {
                groupKey = 'bkk_airport_to_pattaya_hotel';
                cleanDisplayName = 'Arrival at Bangkok Airport and Transfer to Pattaya Hotel';
                if (!location) location = 'Pattaya';
            } else if (isPattayaBkkInter) {
                groupKey = 'pattaya_hotel_to_bangkok_hotel';
                cleanDisplayName = 'Transfer Pattaya Hotel to Bangkok Hotel';
                if (!location) location = 'Pattaya';
            } else if (isBkkDep) {
                groupKey = 'bangkok_hotel_to_bangkok_airport';
                cleanDisplayName = 'Transfer Bangkok Hotel to Bangkok Airport';
                if (!location) location = 'Bangkok';
            } else if (isBkkArr) {
                groupKey = 'bangkok_airport_to_bangkok_hotel';
                cleanDisplayName = 'Arrival at Bangkok Airport and Transfer to Bangkok Hotel';
                if (!location) location = 'Bangkok';
            } else if (isPhuketArr) {
                groupKey = 'phuket_airport_to_phuket_hotel';
                cleanDisplayName = 'Arrival at Phuket Airport and Transfer to Phuket Hotel';
                if (!location) location = 'Phuket';
            } else if (isPhuketDep) {
                groupKey = 'phuket_hotel_to_phuket_airport';
                cleanDisplayName = 'Transfer Phuket Hotel to Phuket Airport';
                if (!location) location = 'Phuket';
            } else {
                groupKey = (norm + '|' + location.toLowerCase()).trim();
            }

            const pCar = tr.carPrice !== null && tr.carPrice !== undefined && tr.carPrice !== '' ? Number(tr.carPrice) : (tr.price ? Number(tr.price) : null);
            const pVan = tr.vanPrice !== null && tr.vanPrice !== undefined && tr.vanPrice !== '' ? Number(tr.vanPrice) : null;
            const pBus = tr.busPrice !== null && tr.busPrice !== undefined && tr.busPrice !== '' ? Number(tr.busPrice) : null;
            const pDef = pCar || pVan || pBus || (tr.price ? Number(tr.price) : 0);

            let target = null;
            if (tr.id && trIdMap[tr.id]) target = trIdMap[tr.id];
            else if (trGroups[groupKey]) target = trGroups[groupKey];

            if (!target) {
                const newTr = {
                    id: String(tr.id || ('tr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6))),
                    name: cleanDisplayName,
                    location: location,
                    carPrice: pCar,
                    vanPrice: pVan,
                    busPrice: pBus,
                    price: pDef
                };
                trGroups[groupKey] = newTr;
                if (newTr.id) trIdMap[newTr.id] = newTr;
            } else {
                if (pCar !== null && pCar > 0) target.carPrice = pCar;
                if (pVan !== null && pVan > 0) target.vanPrice = pVan;
                if (pBus !== null && pBus > 0) target.busPrice = pBus;
                target.price = target.carPrice || target.vanPrice || target.busPrice || target.price || 0;
                if (!target.location && location) target.location = location;
                if (cleanDisplayName && cleanDisplayName.length >= target.name.length) target.name = cleanDisplayName;
                if (tr.id && !target.id) {
                    target.id = tr.id;
                    trIdMap[tr.id] = target;
                }
            }
        });

        // 3. Deduplicate & Merge Hotels
        const hGroups = {};
        const hIdMap = {};
        (rawDb.hotels || []).forEach(h => {
            const rawName = String(h.name || '').trim();
            if (!rawName) return;
            const cleanName = rawName.replace(/(\s*,?\s*or\s+similar\s*(\d*\*?|\*)?)+/gi, '').replace(/\s+/g, ' ').trim();
            const star = String(h.star || '3').trim();
            const loc = String(h.location || '').trim();
            const normLoc = loc.toLowerCase();
            const key = (cleanName.toLowerCase() + '|' + star + '|' + normLoc).trim();

            let target = null;
            if (h.id && hIdMap[h.id]) target = hIdMap[h.id];
            else if (hGroups[key]) target = hGroups[key];

            if (!target) {
                const newH = {
                    id: String(h.id || ('h_' + Date.now() + '_' + star + '_' + Math.random().toString(36).substring(2, 6))),
                    name: cleanName,
                    location: loc,
                    star: star,
                    price: Number(h.price) || 0,
                    mealPrice: Number(h.mealPrice) || 0,
                    tplPrice: (h.tplPrice !== undefined && h.tplPrice !== null && h.tplPrice !== '') ? Number(h.tplPrice) : (star === '4' ? 1000 : (star === '5' ? 1200 : 800))
                };
                hGroups[key] = newH;
                if (newH.id) hIdMap[newH.id] = newH;
            } else {
                if (Number(h.price) > 0) target.price = Number(h.price);
                if (Number(h.mealPrice) > 0) target.mealPrice = Number(h.mealPrice);
                if (h.tplPrice !== undefined && h.tplPrice !== null && h.tplPrice !== '') target.tplPrice = Number(h.tplPrice);
                if (!target.location && loc) target.location = loc;
                if (cleanName && cleanName.length >= target.name.length) target.name = cleanName;
                if (h.id && !target.id) {
                    target.id = h.id;
                    hIdMap[h.id] = target;
                }
            }
        });

        return {
            hotels: Object.values(hGroups),
            tours: Object.values(tourGroups),
            transfers: Object.values(trGroups),
            extras: rawDb.extras || []
        };
    }

    async function saveMasterDatabaseToFirebase(silent = false) {
        updateCloudSyncStatus('syncing', (masterDb.tours || []).length, (masterDb.hotels || []).length);
        
        // Auto deduplicate and merge all records before saving
        const cleanDb = deduplicateMasterDatabase(masterDb);
        masterDb = cleanDb;
        localStorage.setItem('SLW_Master_Inventory', JSON.stringify(cleanDb));
        
        try {
            if (typeof db !== 'undefined' && db) {
                await db.collection('slw_settings').doc('master_inventory').set(cleanDb);
                updateCloudSyncStatus('cloud', cleanDb.tours.length, cleanDb.hotels.length);
                if (window.slwLogActivity) {
                    window.slwLogActivity('Updated Master Database from Tour Costing Calculator');
                }
                if (!silent) {
                    showNotification("☁️ Master Database successfully saved & deduplicated in Firebase Cloud!", false);
                }
            } else {
                updateCloudSyncStatus('local', cleanDb.tours.length, cleanDb.hotels.length);
                if (!silent) {
                    showNotification("⚠️ Saved to Local Cache (Firebase offline)", false);
                }
            }
        } catch(err) {
            console.error("Firebase sync error:", err);
            updateCloudSyncStatus('local', cleanDb.tours.length, cleanDb.hotels.length);
            if (!silent) {
                showNotification("⚠️ Firebase Sync Error: " + err.message + " (Saved Locally)", true);
            }
        }
        
        populateDbDropdowns();
        updateMasterDbCounts();
        return true;
    }

    function toggleMasterDbCards(forceOpen = null) {
        const section = document.getElementById('masterDbQuickSection');
        const chevron = document.getElementById('quickCardsChevron');
        if (!section) return;
        
        const isHidden = section.style.display === 'none' || section.style.display === '';
        const willOpen = forceOpen !== null ? forceOpen : isHidden;
        section.style.display = willOpen ? 'block' : 'none';
        if (chevron) chevron.innerText = willOpen ? '▲' : '▼';
        
        if (willOpen) {
            updateMasterDbCounts();
            populateQuickTourDropdown();
            populateQuickHotelDropdown();
            populateQuickTransferDropdown();
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function updateMasterDbCounts() {
        const tourCount = (masterDb.tours || []).length;
        const hotelCount = (masterDb.hotels || []).length;
        const transferCount = (masterDb.transfers || []).length;
        
        const tourBadge = document.getElementById('quickTourCountBadge');
        if (tourBadge) tourBadge.innerText = `${tourCount} Tours`;
        const hotelBadge = document.getElementById('quickHotelCountBadge');
        if (hotelBadge) hotelBadge.innerText = `${hotelCount} Hotels`;
        const transferBadge = document.getElementById('quickTransferCountBadge');
        if (transferBadge) transferBadge.innerText = `${transferCount} Transfers`;
        
        const allCities = [...new Set([
            ...(masterDb.tours || []).map(t => (t.location || '').trim()),
            ...(masterDb.hotels || []).map(h => (h.location || '').trim()),
            ...(masterDb.transfers || []).map(tr => (tr.location || '').trim())
        ])].filter(Boolean).sort();
        
        const updateDatalist = (id) => {
            const dl = document.getElementById(id);
            if (dl) dl.innerHTML = allCities.map(c => `<option value="${c}">`).join('');
        };
        updateDatalist('quickTourLocationList');
        updateDatalist('quickHotelLocationList');
        updateDatalist('quickTransferLocationList');
    }

    // ── QUICK TOURS LIVE EDITOR ──
    function populateQuickTourDropdown(searchVal = '') {
        const select = document.getElementById('quickTourSelect');
        if (!select) return;
        searchVal = (searchVal || '').trim().toLowerCase();
        
        let tours = masterDb.tours || [];
        if (searchVal) {
            tours = tours.filter(t => (t.name || '').toLowerCase().includes(searchVal) || (t.location || '').toLowerCase().includes(searchVal));
        }
        
        let html = `<option value="">-- Select Tour to Edit (${tours.length} available) --</option>`;
        tours.forEach(t => {
            const loc = t.location ? ` [${t.location}]` : '';
            const priceInfo = t.joinPrice ? `Join: ${t.joinPrice}` : (t.ticketOnlyPrice ? `Ticket: ${t.ticketOnlyPrice}` : 'Pvt');
            html += `<option value="${t.id}">${t.name}${loc} (${priceInfo})</option>`;
        });
        select.innerHTML = html;
    }

    function filterQuickTourList() {
        const val = document.getElementById('quickTourSearch')?.value || '';
        populateQuickTourDropdown(val);
    }

    function clearQuickTourSearch() {
        const inp = document.getElementById('quickTourSearch');
        if (inp) inp.value = '';
        populateQuickTourDropdown('');
    }

    function loadTourIntoQuickEditor() {
        const select = document.getElementById('quickTourSelect');
        if (!select || !select.value) {
            resetQuickTourEditor();
            return;
        }
        const tour = (masterDb.tours || []).find(t => t.id === select.value);
        if (!tour) return;
        
        document.getElementById('quickTourId').value = tour.id;
        document.getElementById('quickTourName').value = tour.name || '';
        document.getElementById('quickTourLocation').value = (tour.location || '').trim();
        document.getElementById('quickTourJoinPrice').value = tour.joinPrice !== null && tour.joinPrice !== undefined ? tour.joinPrice : '';
        document.getElementById('quickTourTicketPrice').value = tour.ticketOnlyPrice !== null && tour.ticketOnlyPrice !== undefined ? tour.ticketOnlyPrice : '';
        document.getElementById('quickTourCarPrice').value = tour.privateCarPrice !== null && tour.privateCarPrice !== undefined ? tour.privateCarPrice : '';
        document.getElementById('quickTourVanPrice').value = tour.privateVanPrice !== null && tour.privateVanPrice !== undefined ? tour.privateVanPrice : '';
        
        const status = document.getElementById('quickTourStatus');
        if (status) status.innerHTML = `<span class="text-purple-600 font-semibold">Editing: "${(tour.name || '').substring(0, 25)}..."</span>`;
    }

    async function saveQuickTour(isNew = false) {
        const name = document.getElementById('quickTourName')?.value.trim();
        const location = document.getElementById('quickTourLocation')?.value.trim();
        const joinPrice = document.getElementById('quickTourJoinPrice')?.value;
        const ticketOnlyPrice = document.getElementById('quickTourTicketPrice')?.value;
        const privateCarPrice = document.getElementById('quickTourCarPrice')?.value;
        const privateVanPrice = document.getElementById('quickTourVanPrice')?.value;
        const tourId = document.getElementById('quickTourId')?.value;
        
        if (!name) {
            showNotification("Please enter a Tour Name.", true);
            return;
        }
        
        const tourObj = {
            name,
            location,
            joinPrice: joinPrice !== '' ? Number(joinPrice) : null,
            ticketOnlyPrice: ticketOnlyPrice !== '' ? Number(ticketOnlyPrice) : null,
            privateCarPrice: privateCarPrice !== '' ? Number(privateCarPrice) : null,
            privateVanPrice: privateVanPrice !== '' ? Number(privateVanPrice) : null,
            privateBusPrice: null
        };
        
        if (isNew || !tourId) {
            tourObj.id = 't_' + Date.now();
            (masterDb.tours = masterDb.tours || []).push(tourObj);
            showNotification(`✅ Added new tour "${name}" to Master DB & Cloud!`, false);
        } else {
            tourObj.id = tourId;
            const idx = (masterDb.tours || []).findIndex(t => t.id === tourId);
            if (idx !== -1) {
                masterDb.tours[idx] = tourObj;
                showNotification(`✅ Updated tour "${name}" in Master DB & Cloud!`, false);
            } else {
                (masterDb.tours = masterDb.tours || []).push(tourObj);
            }
        }
        
        await saveMasterDatabaseToFirebase(true);
        populateQuickTourDropdown();
        populateDbDropdowns();
        document.getElementById('quickTourSelect').value = tourObj.id;
        document.getElementById('quickTourId').value = tourObj.id;
        const status = document.getElementById('quickTourStatus');
        if (status) status.innerHTML = `<span class="text-green-600 font-bold">Saved to Cloud!</span>`;
    }

    function resetQuickTourEditor() {
        document.getElementById('quickTourId').value = '';
        document.getElementById('quickTourName').value = '';
        document.getElementById('quickTourLocation').value = '';
        document.getElementById('quickTourJoinPrice').value = '';
        document.getElementById('quickTourTicketPrice').value = '';
        document.getElementById('quickTourCarPrice').value = '';
        document.getElementById('quickTourVanPrice').value = '';
        if (document.getElementById('quickTourSelect')) document.getElementById('quickTourSelect').value = '';
        const status = document.getElementById('quickTourStatus');
        if (status) status.innerText = 'Ready to edit or add';
    }

    // ── QUICK HOTELS LIVE EDITOR ──
    function populateQuickHotelDropdown(searchVal = '') {
        const select = document.getElementById('quickHotelSelect');
        if (!select) return;
        searchVal = (searchVal || '').trim().toLowerCase();
        
        let hotels = masterDb.hotels || [];
        if (searchVal) {
            hotels = hotels.filter(h => (h.name || '').toLowerCase().includes(searchVal) || (h.location || '').toLowerCase().includes(searchVal));
        }
        
        let html = `<option value="">-- Select Hotel to Edit (${hotels.length} available) --</option>`;
        hotels.forEach(h => {
            const loc = h.location ? ` [${h.location}]` : '';
            html += `<option value="${h.id}">${h.name}${loc} (${h.star}* - ${h.price} THB)</option>`;
        });
        select.innerHTML = html;
    }

    function filterQuickHotelList() {
        const val = document.getElementById('quickHotelSearch')?.value || '';
        populateQuickHotelDropdown(val);
    }

    function clearQuickHotelSearch() {
        const inp = document.getElementById('quickHotelSearch');
        if (inp) inp.value = '';
        populateQuickHotelDropdown('');
    }

    function loadHotelIntoQuickEditor() {
        const select = document.getElementById('quickHotelSelect');
        if (!select || !select.value) {
            resetQuickHotelEditor();
            return;
        }
        const hotel = (masterDb.hotels || []).find(h => h.id === select.value);
        if (!hotel) return;
        
        document.getElementById('quickHotelId').value = hotel.id;
        document.getElementById('quickHotelName').value = hotel.name || '';
        document.getElementById('quickHotelLocation').value = (hotel.location || '').trim();
        document.getElementById('quickHotelStar').value = String(hotel.star || '3');
        document.getElementById('quickHotelPrice').value = hotel.price || '';
        document.getElementById('quickHotelMealPrice').value = hotel.mealPrice || '';
        
        const status = document.getElementById('quickHotelStatus');
        if (status) status.innerHTML = `<span class="text-blue-600 font-semibold">Editing: "${(hotel.name || '').substring(0, 25)}..."</span>`;
    }

    async function saveQuickHotel(isNew = false) {
        const name = document.getElementById('quickHotelName')?.value.trim();
        const location = document.getElementById('quickHotelLocation')?.value.trim();
        const star = document.getElementById('quickHotelStar')?.value || '3';
        const price = parseFloat(document.getElementById('quickHotelPrice')?.value) || 0;
        const mealPrice = parseFloat(document.getElementById('quickHotelMealPrice')?.value) || 0;
        const hotelId = document.getElementById('quickHotelId')?.value;
        
        if (!name || price <= 0) {
            showNotification("Please enter a Hotel Name and valid Room Price.", true);
            return;
        }
        
        const hotelObj = {
            name,
            location,
            star: String(star),
            price: Number(price),
            mealPrice: Number(mealPrice)
        };
        
        if (isNew || !hotelId) {
            hotelObj.id = 'h_' + Date.now();
            (masterDb.hotels = masterDb.hotels || []).push(hotelObj);
            showNotification(`✅ Added new hotel "${name}" to Master DB & Cloud!`, false);
        } else {
            hotelObj.id = hotelId;
            const idx = (masterDb.hotels || []).findIndex(h => h.id === hotelId);
            if (idx !== -1) {
                masterDb.hotels[idx] = hotelObj;
                showNotification(`✅ Updated hotel "${name}" in Master DB & Cloud!`, false);
            } else {
                (masterDb.hotels = masterDb.hotels || []).push(hotelObj);
            }
        }
        
        await saveMasterDatabaseToFirebase(true);
        populateQuickHotelDropdown();
        populateDbDropdowns();
        document.getElementById('quickHotelSelect').value = hotelObj.id;
        document.getElementById('quickHotelId').value = hotelObj.id;
        const status = document.getElementById('quickHotelStatus');
        if (status) status.innerHTML = `<span class="text-green-600 font-bold">Saved to Cloud!</span>`;
    }

    function resetQuickHotelEditor() {
        document.getElementById('quickHotelId').value = '';
        document.getElementById('quickHotelName').value = '';
        document.getElementById('quickHotelLocation').value = '';
        document.getElementById('quickHotelStar').value = '3';
        document.getElementById('quickHotelPrice').value = '';
        document.getElementById('quickHotelMealPrice').value = '';
        if (document.getElementById('quickHotelSelect')) document.getElementById('quickHotelSelect').value = '';
        const status = document.getElementById('quickHotelStatus');
        if (status) status.innerText = 'Ready to edit or add';
    }

    // ── QUICK TRANSFERS LIVE EDITOR ──
    function populateQuickTransferDropdown(searchVal = '') {
        const select = document.getElementById('quickTransferSelect');
        if (!select) return;
        searchVal = (searchVal || '').trim().toLowerCase();
        
        let transfers = masterDb.transfers || [];
        if (searchVal) {
            transfers = transfers.filter(tr => (tr.name || '').toLowerCase().includes(searchVal) || (tr.location || '').toLowerCase().includes(searchVal));
        }
        
        let html = `<option value="">-- Select Transfer to Edit (${transfers.length} available) --</option>`;
        transfers.forEach(tr => {
            const loc = tr.location ? ` [${tr.location}]` : '';
            const priceInfo = tr.carPrice ? `Car: ${tr.carPrice}` : (tr.vanPrice ? `Van: ${tr.vanPrice}` : '');
            html += `<option value="${tr.id}">${tr.name}${loc} (${priceInfo})</option>`;
        });
        select.innerHTML = html;
    }

    function filterQuickTransferList() {
        const val = document.getElementById('quickTransferSearch')?.value || '';
        populateQuickTransferDropdown(val);
    }

    function clearQuickTransferSearch() {
        const inp = document.getElementById('quickTransferSearch');
        if (inp) inp.value = '';
        populateQuickTransferDropdown('');
    }

    function loadTransferIntoQuickEditor() {
        const select = document.getElementById('quickTransferSelect');
        if (!select || !select.value) {
            resetQuickTransferEditor();
            return;
        }
        const tr = (masterDb.transfers || []).find(t => t.id === select.value);
        if (!tr) return;
        
        document.getElementById('quickTransferId').value = tr.id;
        document.getElementById('quickTransferName').value = tr.name || '';
        document.getElementById('quickTransferLocation').value = (tr.location || '').trim();
        document.getElementById('quickTransferCarPrice').value = tr.carPrice !== null && tr.carPrice !== undefined ? tr.carPrice : '';
        document.getElementById('quickTransferVanPrice').value = tr.vanPrice !== null && tr.vanPrice !== undefined ? tr.vanPrice : '';
        document.getElementById('quickTransferBusPrice').value = tr.busPrice !== null && tr.busPrice !== undefined ? tr.busPrice : '';
        
        const status = document.getElementById('quickTransferStatus');
        if (status) status.innerHTML = `<span class="text-orange-600 font-semibold">Editing: "${(tr.name || '').substring(0, 25)}..."</span>`;
    }

    async function saveQuickTransfer(isNew = false) {
        const name = document.getElementById('quickTransferName')?.value.trim();
        const location = document.getElementById('quickTransferLocation')?.value.trim();
        const carPrice = document.getElementById('quickTransferCarPrice')?.value;
        const vanPrice = document.getElementById('quickTransferVanPrice')?.value;
        const busPrice = document.getElementById('quickTransferBusPrice')?.value;
        const trId = document.getElementById('quickTransferId')?.value;
        
        if (!name) {
            showNotification("Please enter a Transfer Route Name.", true);
            return;
        }
        
        const trObj = {
            name,
            location,
            carPrice: carPrice !== '' ? Number(carPrice) : null,
            vanPrice: vanPrice !== '' ? Number(vanPrice) : null,
            busPrice: busPrice !== '' ? Number(busPrice) : null
        };
        
        if (isNew || !trId) {
            trObj.id = 'tr_' + Date.now();
            (masterDb.transfers = masterDb.transfers || []).push(trObj);
            showNotification(`✅ Added new transfer "${name}" to Master DB & Cloud!`, false);
        } else {
            trObj.id = trId;
            const idx = (masterDb.transfers || []).findIndex(t => t.id === trId);
            if (idx !== -1) {
                masterDb.transfers[idx] = trObj;
                showNotification(`✅ Updated transfer "${name}" in Master DB & Cloud!`, false);
            } else {
                (masterDb.transfers = masterDb.transfers || []).push(trObj);
            }
        }
        
        await saveMasterDatabaseToFirebase(true);
        populateQuickTransferDropdown();
        populateDbDropdowns();
        document.getElementById('quickTransferSelect').value = trObj.id;
        document.getElementById('quickTransferId').value = trObj.id;
        const status = document.getElementById('quickTransferStatus');
        if (status) status.innerHTML = `<span class="text-green-600 font-bold">Saved to Cloud!</span>`;
    }

    function resetQuickTransferEditor() {
        document.getElementById('quickTransferId').value = '';
        document.getElementById('quickTransferName').value = '';
        document.getElementById('quickTransferLocation').value = '';
        document.getElementById('quickTransferCarPrice').value = '';
        document.getElementById('quickTransferVanPrice').value = '';
        document.getElementById('quickTransferBusPrice').value = '';
        if (document.getElementById('quickTransferSelect')) document.getElementById('quickTransferSelect').value = '';
        const status = document.getElementById('quickTransferStatus');
        if (status) status.innerText = 'Ready to edit or add';
    }

    function sanitizeDb(data) {
        if (!data) return { hotels: [], tours: [], transfers: [], extras: [] };
        return {
            hotels: (data.hotels || []).map((h, idx) => ({
                id: h.id || ('h_' + idx),
                name: (h.name || '').trim(),
                location: (h.location || h.loc || '').trim(),
                star: String(h.star || '3'),
                price: Number(h.price) || 0,
                mealPrice: Number(h.mealPrice) || 0,
                tplPrice: (h.tplPrice !== undefined && h.tplPrice !== null && h.tplPrice !== '') ? Number(h.tplPrice) : (String(h.star || '3') === '4' ? 1000 : (String(h.star || '3') === '5' ? 1200 : 800))
            })),
            tours: (data.tours || []).map((t, idx) => {
                const rawName = (t.name || '').trim();
                const { tag: extTag } = extractTourNameAndTag(rawName);
                const joinTag = t.joinTag || (extTag && /join/i.test(extTag) ? extTag : (rawName.toLowerCase().includes('join transfer') ? '(Join Transfer)' : (rawName.toLowerCase().includes('join tour') ? '(Join Tour)' : null)));
                return {
                    id: t.id || ('t_' + idx),
                    name: rawName,
                    location: (t.location || '').trim(),
                    joinTag: joinTag,
                    privateTag: t.privateTag || (extTag && /private/i.test(extTag) ? extTag : null),
                    joinPrice: (t.joinPrice !== undefined && t.joinPrice !== null && t.joinPrice !== '') ? Number(t.joinPrice) : null,
                    ticketOnlyPrice: (t.ticketOnlyPrice !== undefined && t.ticketOnlyPrice !== null && t.ticketOnlyPrice !== '') ? Number(t.ticketOnlyPrice) : null,
                    privateCarPrice: (t.privateCarPrice !== undefined && t.privateCarPrice !== null && t.privateCarPrice !== '') ? Number(t.privateCarPrice) : null,
                    privateVanPrice: (t.privateVanPrice !== undefined && t.privateVanPrice !== null && t.privateVanPrice !== '') ? Number(t.privateVanPrice) : null,
                    privateBusPrice: (t.privateBusPrice !== undefined && t.privateBusPrice !== null && t.privateBusPrice !== '') ? Number(t.privateBusPrice) : null,
                    privateTransferPrice: (t.privateTransferPrice !== undefined && t.privateTransferPrice !== null && t.privateTransferPrice !== '') ? Number(t.privateTransferPrice) : null
                };
            }),
            transfers: (data.transfers || []).map((tr, idx) => ({
                id: tr.id || ('tr_' + idx),
                name: (tr.name || '').trim(),
                location: (tr.location || '').trim(),
                price: Number(tr.price) || 0,
                carPrice: (tr.carPrice !== undefined && tr.carPrice !== null && tr.carPrice !== '') ? Number(tr.carPrice) : null,
                vanPrice: (tr.vanPrice !== undefined && tr.vanPrice !== null && tr.vanPrice !== '') ? Number(tr.vanPrice) : null,
                busPrice: (tr.busPrice !== undefined && tr.busPrice !== null && tr.busPrice !== '') ? Number(tr.busPrice) : null,
                vehicleType: tr.vehicleType || ''
            })),
            extras: data.extras || []
        };
    }

    async function loadMasterDatabase(forceReload = false) {
        let fetchedDb = { hotels: [], tours: [], transfers: [], extras: [] };
        let cloudDb = null;
        let localDb = null;

        // 1. Fetch bundled master_db.json (base 183 tours, 55 hotels, 7 transfers)
        try {
            const response = await fetch('./master_db.json?t=' + new Date().getTime());
            if (response.ok) {
                const data = await response.json();
                fetchedDb = sanitizeDb(data);
            }
        } catch(e) {
            console.log("master_db.json not found via fetch.");
        }

        // 2. Fetch from Firebase Cloud
        try {
            if (typeof db !== 'undefined' && db) {
                const doc = await db.collection('slw_settings').doc('master_inventory').get();
                if (doc.exists) {
                    cloudDb = sanitizeDb(doc.data());
                    console.log(`Cloud Master DB fetched: ${cloudDb.tours.length} tours, ${cloudDb.hotels.length} hotels, ${cloudDb.transfers.length} transfers.`);
                }
            }
        } catch(e) {
            console.error("Firebase fetch error:", e);
        }

        // 3. Local Cache
        const saved = localStorage.getItem('SLW_Master_Inventory');
        if (saved) {
            try {
                localDb = sanitizeDb(JSON.parse(saved));
            } catch(e) {
                console.error('Failed to parse local database');
            }
        }

        // 4. Merge all together: base + local + cloud, prioritized & deduplicated
        const mergedRaw = {
            tours: [...(fetchedDb.tours || []), ...(localDb?.tours || []), ...(cloudDb?.tours || [])],
            hotels: [...(fetchedDb.hotels || []), ...(localDb?.hotels || []), ...(cloudDb?.hotels || [])],
            transfers: [...(fetchedDb.transfers || []), ...(localDb?.transfers || []), ...(cloudDb?.transfers || [])],
            extras: [...(fetchedDb.extras || []), ...(localDb?.extras || []), ...(cloudDb?.extras || [])]
        };

        masterDb = deduplicateMasterDatabase(mergedRaw);
        localStorage.setItem('SLW_Master_Inventory', JSON.stringify(masterDb));
        console.log(`Master database active: ${masterDb.tours.length} tours, ${masterDb.hotels.length} hotels, ${masterDb.transfers.length} transfers.`);

        // If cloud had fewer items than the merged total, silently push full master inventory to cloud
        if (cloudDb && masterDb.tours.length > cloudDb.tours.length && typeof db !== 'undefined' && db) {
            try {
                db.collection('slw_settings').doc('master_inventory').set(masterDb).catch(() => {});
            } catch(e) {}
        }

        populateDbDropdowns();
        updateCloudSyncStatus(cloudDb ? 'cloud' : 'local', masterDb.tours.length, masterDb.hotels.length);
        if (forceReload) {
            showNotification(`☁️ Successfully synced ${masterDb.tours.length} tours and ${masterDb.hotels.length} hotels with Cloud!`, false);
        }

        // Setup real-time listener for Master DB updates across all PCs
        if (!window._masterDbCloudListenerAttached && typeof db !== 'undefined' && db) {
            window._masterDbCloudListenerAttached = true;
            try {
                db.collection('slw_settings').doc('master_inventory').onSnapshot(docSnap => {
                    if (docSnap && docSnap.exists) {
                        const incomingData = sanitizeDb(docSnap.data());
                        if (incomingData && (incomingData.tours.length > 0 || incomingData.hotels.length > 0)) {
                            masterDb = deduplicateMasterDatabase(incomingData);
                            localStorage.setItem('SLW_Master_Inventory', JSON.stringify(masterDb));
                            populateDbDropdowns();
                            updateMasterDbCounts();
                            updateCloudSyncStatus('cloud', masterDb.tours.length, masterDb.hotels.length);
                        }
                    }
                }, err => {
                    console.warn('Real-time Master DB listener notice:', err);
                });
            } catch(e) {}
        }
    }

    function importMasterDatabase(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                // Ensure it's a valid master DB format
                if (parsed.hotels || parsed.tours || parsed.transfers) {
                    masterDb = sanitizeDb(parsed);
                    localStorage.setItem('SLW_Master_Inventory', JSON.stringify(masterDb));
                    populateDbDropdowns();
                    
                    const notif = document.getElementById('notification');
                    notif.innerText = "Master Database Imported Successfully!";
                    notif.className = "fixed top-5 right-5 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg transition-opacity duration-300 opacity-100 z-50";
                    setTimeout(() => { notif.className = "fixed top-5 right-5 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg transition-opacity duration-300 opacity-0 z-50"; }, 3000);
                }
            } catch(err) {
                alert("Failed to parse Master Database JSON.");
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }

    function populateCityFilters() {
        const tourCities = [...new Set((masterDb.tours || []).map(t => (t.location || '').trim()).filter(Boolean))].sort();
        const transferCities = [...new Set((masterDb.transfers || []).map(t => (t.location || '').trim()).filter(Boolean))].sort();
        
        const tourFilterSelect = document.getElementById('tourCityFilter');
        if (tourFilterSelect) {
            const currentVal = tourFilterSelect.value;
            let html = '<option value="">-- All Cities --</option>';
            tourCities.forEach(c => html += `<option value="${c}">${c}</option>`);
            tourFilterSelect.innerHTML = html;
            tourFilterSelect.value = currentVal;
        }

        const transferFilterSelect = document.getElementById('transferCityFilter');
        if (transferFilterSelect) {
            const currentVal = transferFilterSelect.value;
            let html = '<option value="">-- All Cities --</option>';
            transferCities.forEach(c => html += `<option value="${c}">${c}</option>`);
            transferFilterSelect.innerHTML = html;
            transferFilterSelect.value = currentVal;
        }
    }

    // ── LIVE FILTERING FOR MASTER DATABASE MODALS ──
    function filterTourDbOptions(resetSearch = false) {
        const searchInput = document.getElementById('tourDbSearch');
        if (resetSearch && searchInput) searchInput.value = '';
        const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const selectedTourCity = document.getElementById('tourCityFilter') ? document.getElementById('tourCityFilter').value.trim().toLowerCase() : '';
        const tourSelect = document.getElementById('tourDbSelect');
        if (!tourSelect) return;

        let options = [];
        (masterDb.tours || [])
            .filter(t => {
                if (!selectedTourCity) return true;
                const loc = (t.location || '').trim().toLowerCase();
                return loc === selectedTourCity || loc.includes(selectedTourCity) || selectedTourCity.includes(loc);
            })
            .forEach(t => {
                const loc = (t.location || '').trim();
                let addedAny = false;
                if (t.joinPrice !== null && t.joinPrice !== undefined && t.joinPrice > 0) {
                    const tag = t.joinTag || (t.name.toLowerCase().includes('join transfer') ? '(Join Transfer)' : '(Join Tour)');
                    const fullName = formatTourVariantName(t.name, tag);
                    const data = { id: t.id, baseName: t.name, location: loc, type: 'join', name: fullName, price: Number(t.joinPrice), transfer: 0, tag: tag };
                    const label = `${fullName} - ${t.joinPrice} THB`;
                    options.push({ data, label, name: t.name, location: loc });
                    addedAny = true;
                }
                if (t.ticketOnlyPrice || t.privateCarPrice || t.privateVanPrice || t.privateBusPrice || t.privateTransferPrice) {
                    if (t.privateCarPrice || (!t.privateVanPrice && !t.privateBusPrice && t.privateTransferPrice)) {
                        const carPrice = Number(t.privateCarPrice || t.privateTransferPrice || 0);
                        const ticketPrice = Number(t.ticketOnlyPrice || 0);
                        const tag = t.privateTag || '(Private - Car)';
                        const fullName = formatTourVariantName(t.name, tag);
                        const data = { id: t.id, baseName: t.name, location: loc, type: 'private', vehicle: 'car', name: fullName, price: ticketPrice, transfer: carPrice, tag: tag };
                        const label = `${fullName} - Ticket: ${ticketPrice}, Transfer: ${carPrice}`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                    if (t.privateVanPrice) {
                        const ticketPrice = Number(t.ticketOnlyPrice || 0);
                        const tag = t.privateTag || '(Private - Van)';
                        const fullName = formatTourVariantName(t.name, tag);
                        const data = { id: t.id, baseName: t.name, location: loc, type: 'private', vehicle: 'van', name: fullName, price: ticketPrice, transfer: Number(t.privateVanPrice), tag: tag };
                        const label = `${fullName} - Ticket: ${ticketPrice}, Transfer: ${t.privateVanPrice}`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                    if (t.privateBusPrice) {
                        const ticketPrice = Number(t.ticketOnlyPrice || 0);
                        const tag = t.privateTag || '(Private - Bus)';
                        const fullName = formatTourVariantName(t.name, tag);
                        const data = { id: t.id, baseName: t.name, location: loc, type: 'private', vehicle: 'bus', name: fullName, price: ticketPrice, transfer: Number(t.privateBusPrice), tag: tag };
                        const label = `${fullName} - Ticket: ${ticketPrice}, Transfer: ${t.privateBusPrice}`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                    if (t.ticketOnlyPrice && !t.privateCarPrice && !t.privateVanPrice && !t.privateBusPrice && !t.privateTransferPrice) {
                        const tag = '(Ticket Only)';
                        const fullName = formatTourVariantName(t.name, tag);
                        const data = { id: t.id, baseName: t.name, location: loc, type: 'ticket', name: fullName, price: Number(t.ticketOnlyPrice), transfer: 0, tag: tag };
                        const label = `${fullName} - ${t.ticketOnlyPrice} THB`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                }
                // Fallback for zero-price or custom tours from master db so no tour is ever lost
                if (!addedAny) {
                    const ticketPrice = Number(t.ticketOnlyPrice || t.joinPrice || 0);
                    const trfPrice = Number(t.privateCarPrice || t.privateVanPrice || t.privateTransferPrice || 0);
                    const tag = t.joinTag || (ticketPrice && !trfPrice ? '(Join Tour)' : '');
                    const fullName = formatTourVariantName(t.name, tag);
                    const data = { id: t.id, baseName: t.name, location: loc, type: 'custom', name: fullName || t.name, price: ticketPrice, transfer: trfPrice, tag: tag };
                    const label = `${fullName || t.name}${ticketPrice || trfPrice ? ` - ${ticketPrice} THB` : ' (Custom / Set Price)'}`;
                    options.push({ data, label, name: t.name, location: loc });
                }
            });

        if (searchVal) {
            options = options.filter(opt => 
                opt.label.toLowerCase().includes(searchVal) || 
                opt.location.toLowerCase().includes(searchVal)
            );
        }

        const prevTourVal = tourSelect.value;
        const placeholder = searchVal 
            ? `-- Found ${options.length} Tour(s) matching "${searchVal}" --`
            : '-- Select from Master Database --';
        let html = `<option value="">${placeholder}</option>`;
        options.forEach(opt => {
            html += `<option value='${JSON.stringify(opt.data)}'>${opt.label}</option>`;
        });
        tourSelect.innerHTML = html;

        // Restore previous selection or newly saved tour selection
        let restored = false;
        if (currentSelectedModalTourDbId) {
            for (let i = 0; i < tourSelect.options.length; i++) {
                try {
                    const optData = JSON.parse(tourSelect.options[i].value);
                    if (optData.id === currentSelectedModalTourDbId) {
                        tourSelect.selectedIndex = i;
                        restored = true;
                        break;
                    }
                } catch(e) {}
            }
        }
        if (!restored && prevTourVal) {
            try {
                const prevData = JSON.parse(prevTourVal);
                for (let i = 0; i < tourSelect.options.length; i++) {
                    try {
                        const optData = JSON.parse(tourSelect.options[i].value);
                        if ((prevData.id && optData.id === prevData.id) || optData.name === prevData.name) {
                            tourSelect.selectedIndex = i;
                            break;
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }
    }

    function clearTourDbSearch() {
        const inp = document.getElementById('tourDbSearch');
        if (inp) inp.value = '';
        filterTourDbOptions();
    }

    function filterTransferDbOptions(resetSearch = false) {
        const searchInput = document.getElementById('transferDbSearch');
        if (resetSearch && searchInput) searchInput.value = '';
        const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const selectedTransferCity = document.getElementById('transferCityFilter') ? document.getElementById('transferCityFilter').value.trim().toLowerCase() : '';
        const transferSelect = document.getElementById('transferDbSelect');
        if (!transferSelect) return;

        let options = [];
        (masterDb.transfers || [])
            .filter(t => {
                if (!selectedTransferCity) return true;
                const loc = (t.location || '').trim().toLowerCase();
                return loc === selectedTransferCity || loc.includes(selectedTransferCity) || selectedTransferCity.includes(loc);
            })
            .forEach(t => {
                const loc = (t.location || '').trim();
                let addedAny = false;
                if (t.carPrice || (!t.vanPrice && !t.busPrice && t.price)) {
                    const price = Number(t.carPrice || t.price || 0);
                    const name = t.name + (t.vehicleType && t.vehicleType !== 'Any' ? ` (${t.vehicleType})` : ' (Car)');
                    const data = { id: t.id, baseName: t.name, location: loc, name: name, price: price };
                    const label = `${name} - ${price} THB`;
                    options.push({ data, label, name: t.name, location: loc });
                    addedAny = true;
                }
                if (t.vanPrice) {
                    const name = t.name + ' (Van)';
                    const data = { id: t.id, baseName: t.name, location: loc, name: name, price: Number(t.vanPrice) };
                    const label = `${name} - ${t.vanPrice} THB`;
                    options.push({ data, label, name: t.name, location: loc });
                    addedAny = true;
                }
                if (t.busPrice) {
                    const name = t.name + ' (Bus)';
                    const data = { id: t.id, baseName: t.name, location: loc, name: name, price: Number(t.busPrice) };
                    const label = `${name} - ${t.busPrice} THB`;
                    options.push({ data, label, name: t.name, location: loc });
                    addedAny = true;
                }
                if (!addedAny) {
                    const price = Number(t.price || 0);
                    const name = t.name;
                    const data = { id: t.id, baseName: t.name, location: loc, name: name, price: price };
                    const label = `${name} - ${price} THB`;
                    options.push({ data, label, name: t.name, location: loc });
                }
            });

        if (searchVal) {
            options = options.filter(opt => 
                opt.label.toLowerCase().includes(searchVal) || 
                opt.location.toLowerCase().includes(searchVal)
            );
        }

        const prevTrVal = transferSelect.value;
        const placeholder = searchVal 
            ? `-- Found ${options.length} Transfer(s) matching "${searchVal}" --`
            : '-- Select from Master Database --';
        let html = `<option value="">${placeholder}</option>`;
        options.forEach(opt => {
            html += `<option value='${JSON.stringify(opt.data)}'>${opt.label}</option>`;
        });
        transferSelect.innerHTML = html;

        // Restore previous selection if possible
        if (prevTrVal) {
            try {
                const prevData = JSON.parse(prevTrVal);
                for (let i = 0; i < transferSelect.options.length; i++) {
                    try {
                        const optData = JSON.parse(transferSelect.options[i].value);
                        if ((prevData.id && optData.id === prevData.id) || optData.name === prevData.name) {
                            transferSelect.selectedIndex = i;
                            break;
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }
    }

    function clearTransferDbSearch() {
        const inp = document.getElementById('transferDbSearch');
        if (inp) inp.value = '';
        filterTransferDbOptions();
    }

    function filterHotelDbOptions(star, resetSearch = false) {
        const searchInput = document.getElementById(`hotel${star}DbSearch`);
        if (resetSearch && searchInput) searchInput.value = '';
        const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const select = document.getElementById('city' + star + 'StarDbSelect');
        if (!select) return;

        let hotels = (masterDb.hotels || []).filter(h => parseInt(h.star) === star);
        if (searchVal) {
            hotels = hotels.filter(h => 
                (h.name || '').toLowerCase().includes(searchVal) || 
                (h.location || '').toLowerCase().includes(searchVal)
            );
        }

        const placeholder = searchVal 
            ? `-- Found ${hotels.length} Hotel(s) (${star}*) --`
            : `-- Search ${star}* Database --`;
        let html = `<option value="">${placeholder}</option>`;
        hotels.forEach(h => {
            const data = { name: h.name, price: h.price, meal: h.mealPrice || 0, tplPrice: h.tplPrice || (star === 4 ? 1000 : (star === 5 ? 1200 : 800)) };
            const locText = h.location ? ` [${h.location}]` : '';
            html += `<option value='${JSON.stringify(data)}'>${h.name}${locText} - ${h.price} THB</option>`;
        });
        select.innerHTML = html;
    }

    function clearHotelDbSearch(star) {
        const inp = document.getElementById(`hotel${star}DbSearch`);
        if (inp) inp.value = '';
        filterHotelDbOptions(star);
    }

    function filterCityNameOptions(resetSearch = false) {
        const searchInput = document.getElementById('cityDbSearch');
        if (resetSearch && searchInput) searchInput.value = '';
        const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const cityNameSelect = document.getElementById('cityNameDbSelect');
        if (!cityNameSelect) return;

        const hotelLocations = (masterDb.hotels || []).map(h => (h.location || '').trim()).filter(Boolean);
        const tourLocations = (masterDb.tours || []).map(t => (t.location || '').trim()).filter(Boolean);
        const transferLocations = (masterDb.transfers || []).map(t => (t.location || '').trim()).filter(Boolean);
        let allCities = [...new Set([...hotelLocations, ...tourLocations, ...transferLocations])].sort();

        if (searchVal) {
            allCities = allCities.filter(c => c.toLowerCase().includes(searchVal));
        }

        const placeholder = searchVal ? `-- Found ${allCities.length} Cities --` : '-- Select City from Database --';
        let html = `<option value="">${placeholder}</option>`;
        allCities.forEach(c => html += `<option value="${c}">${c}</option>`);
        cityNameSelect.innerHTML = html;
    }

    function clearCityDbSearch() {
        const inp = document.getElementById('cityDbSearch');
        if (inp) inp.value = '';
        filterCityNameOptions();
    }

    function populateDbDropdowns() {
        populateCityFilters();
        filterTourDbOptions();
        filterTransferDbOptions();
        [3, 4, 5].forEach(star => filterHotelDbOptions(star));
        filterCityNameOptions();

        // Extras
        const populateExtra = (id, type) => {
            const select = document.getElementById(id);
            if (select) {
                let html = `<option value="">- Load -</option>`;
                (masterDb.extras || []).filter(e => e.serviceType === type).forEach(e => {
                    html += `<option value='${e.price}'>${e.name} - ${e.price}</option>`;
                });
                select.innerHTML = html;
            }
        };
        populateExtra('guideDbSelect', 'Guide');
        populateExtra('waterDbSelect', 'Water');
        populateExtra('mealDbSelect', 'Meal');
    }

    function fillExtraFromDb(type) {
        const select = document.getElementById(type + 'DbSelect');
        if (!select || !select.value) return;
        document.getElementById(type + '_price_per_day').value = select.value;
        if (typeof saveState === 'function') saveState();
    }

    function fillCityNameFromDb() {
        const select = document.getElementById('cityNameDbSelect');
        if (!select || !select.value) return;
        const cityName = select.value;
        document.getElementById('newCityName').value = cityName;

        // Auto-fill hotel dropdowns for matching city
        [3, 4, 5].forEach(star => {
            const hotelSelect = document.getElementById('city' + star + 'StarDbSelect');
            if (!hotelSelect) return;
            const matchingHotel = (masterDb.hotels || []).find(h => parseInt(h.star) === star && (h.location || '').trim() === cityName);
            if (matchingHotel) {
                const data = { name: matchingHotel.name, price: matchingHotel.price, meal: matchingHotel.mealPrice || 0 };
                // Find and select the matching option
                for (let i = 0; i < hotelSelect.options.length; i++) {
                    try {
                        const optData = JSON.parse(hotelSelect.options[i].value);
                        if (optData.name === matchingHotel.name && optData.price === matchingHotel.price) {
                            hotelSelect.selectedIndex = i;
                            fillHotelFromDb(star);
                            break;
                        }
                    } catch(e) {}
                }
            }
        });
    }
    let currentSelectedModalTourDbId = null;
    let currentSelectedModalTourVehicle = null;
    let currentSelectedModalTransferDbId = null;
    let currentEditingTourIndex = null;
    let currentEditingTransferIndex = null;
    let currentEditingCityIndex = null;

    function fillTourFromDb() {
        const select = document.getElementById('tourDbSelect');
        if (!select.value) return;
        try {
            const data = JSON.parse(select.value);
            document.getElementById('newTourName').value = data.name;
            document.getElementById('newTourPrice').value = data.price;
            document.getElementById('newTourTransferPrice').value = data.transfer;

            currentSelectedModalTourDbId = data.id || null;
            currentSelectedModalTourVehicle = data.vehicle || (data.name.toLowerCase().includes('van') ? 'van' : (data.name.toLowerCase().includes('bus') ? 'bus' : 'car'));
            const cityInp = document.getElementById('modalTourMasterCity');
            if (cityInp) cityInp.value = data.location || document.getElementById('tourCityFilter')?.value || '';
            const badge = document.getElementById('modalTourMasterStatusBadge');
            if (badge) {
                badge.innerText = data.baseName ? `Linked: ${data.baseName.substring(0, 20)}` : 'Linked to Master DB';
                badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800';
            }
            const chk = document.getElementById('modalSyncTourToDbCheckbox');
            if (chk) chk.checked = true;
        } catch(e) {}
    }

    function fillTransferFromDb() {
        const select = document.getElementById('transferDbSelect');
        if (!select.value) return;
        try {
            const data = JSON.parse(select.value);
            document.getElementById('newTransferName').value = data.name;
            document.getElementById('newTransferPrice').value = data.price;

            currentSelectedModalTransferDbId = data.id || null;
            const cityInp = document.getElementById('modalTransferMasterCity');
            if (cityInp) cityInp.value = data.location || document.getElementById('transferCityFilter')?.value || '';
            const badge = document.getElementById('modalTransferMasterStatusBadge');
            if (badge) {
                badge.innerText = data.baseName ? `Linked: ${data.baseName.substring(0, 20)}` : 'Linked to Master DB';
                badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800';
            }
            const chk = document.getElementById('modalSyncTransferToDbCheckbox');
            if (chk) chk.checked = true;
        } catch(e) {}
    }

    function onTourModalNameInput(val) {
        val = (val || '').trim();
        const badge = document.getElementById('modalTourMasterStatusBadge');
        const cityInp = document.getElementById('modalTourMasterCity');
        const syncChk = document.getElementById('modalSyncTourToDbCheckbox');
        if (!val) {
            if (badge) { badge.innerText = 'Custom / New'; badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700'; }
            currentSelectedModalTourDbId = null;
            return;
        }
        const { baseName } = extractTourNameAndTag(val);
        const clean = stripTourTags(baseName || val).toLowerCase();
        const matched = (masterDb.tours || []).find(t => stripTourTags(t.name).toLowerCase() === clean);
        if (matched) {
            currentSelectedModalTourDbId = matched.id;
            if (cityInp && !cityInp.value && matched.location) cityInp.value = matched.location;
            if (badge) {
                badge.innerText = `Linked: ${(matched.name || '').substring(0, 16)} (Ready to Sync)`;
                badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200';
            }
            if (syncChk) syncChk.checked = true;
        }
    }

    function onTransferModalNameInput(val) {
        val = (val || '').trim();
        const badge = document.getElementById('modalTransferMasterStatusBadge');
        const cityInp = document.getElementById('modalTransferMasterCity');
        const syncChk = document.getElementById('modalSyncTransferToDbCheckbox');
        if (!val) {
            if (badge) { badge.innerText = 'Custom / New'; badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700'; }
            currentSelectedModalTransferDbId = null;
            return;
        }
        const clean = normalizeTransferRoute(val);
        const matched = (masterDb.transfers || []).find(t => normalizeTransferRoute(t.name) === clean);
        if (matched) {
            currentSelectedModalTransferDbId = matched.id;
            if (cityInp && !cityInp.value && matched.location) cityInp.value = matched.location;
            if (badge) {
                badge.innerText = `Linked: ${(matched.name || '').substring(0, 16)} (Ready to Sync)`;
                badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200';
            }
            if (syncChk) syncChk.checked = true;
        }
    }

    // ── AUTO-SYNC ENTIRE PACKAGE SERVICES TO MASTER DB & CLOUD ──
    async function syncCurrentPackageServicesToMasterDb(silent = true) {
        let changed = false;

        // 1. Sync Tours from availableTours
        (availableTours || []).forEach(tour => {
            const rawName = (tour.name || '').trim();
            const price = Number(tour.price) || 0;
            const transferPrice = Number(tour.transferPrice) || 0;
            if (!rawName || (price <= 0 && transferPrice <= 0)) return;

            const { baseName, tag } = extractTourNameAndTag(rawName);
            const name = baseName || rawName;
            const cleanBase = stripTourTags(name).toLowerCase();
            const isJoin = transferPrice === 0;

            let existing = (masterDb.tours || []).find(t => stripTourTags(t.name).toLowerCase() === cleanBase);
            if (existing) {
                existing.name = name;
                if (isJoin) {
                    existing.joinPrice = price;
                    if (tag) existing.joinTag = tag;
                    else if (!existing.joinTag) existing.joinTag = '(Join Tour)';
                } else {
                    existing.ticketOnlyPrice = price;
                    if (tag) existing.privateTag = tag;
                    if (transferPrice > 0) {
                        existing.privateCarPrice = transferPrice;
                        if (!existing.privateVanPrice) existing.privateVanPrice = transferPrice;
                    }
                }
                changed = true;
            } else {
                (masterDb.tours = masterDb.tours || []).push({
                    id: 't_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                    name: name,
                    location: availableCities[0] ? (availableCities[0].name || '').trim() : '',
                    joinPrice: isJoin ? price : null,
                    joinTag: isJoin ? (tag || '(Join Tour)') : null,
                    ticketOnlyPrice: !isJoin ? price : null,
                    privateTag: !isJoin ? tag : null,
                    privateCarPrice: !isJoin && transferPrice > 0 ? transferPrice : null,
                    privateVanPrice: !isJoin && transferPrice > 0 ? transferPrice : null,
                    privateBusPrice: null
                });
                changed = true;
            }
        });

        // 2. Sync Transfers from availableTransfers
        (availableTransfers || []).forEach(tr => {
            const rawName = (tr.name || '').trim();
            const price = Number(tr.price) || 0;
            if (!rawName || price <= 0) return;

            const norm = normalizeTransferRoute(rawName);
            let existing = (masterDb.transfers || []).find(t => normalizeTransferRoute(t.name) === norm);
            if (existing) {
                existing.price = price;
                if (!existing.carPrice || existing.carPrice === existing.price) existing.carPrice = price;
                if (!existing.vanPrice || existing.vanPrice === existing.price) existing.vanPrice = price;
                changed = true;
            } else {
                (masterDb.transfers = masterDb.transfers || []).push({
                    id: 'tr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                    name: rawName,
                    location: availableCities[0] ? (availableCities[0].name || '').trim() : '',
                    price: price,
                    carPrice: price,
                    vanPrice: price,
                    busPrice: null
                });
                changed = true;
            }
        });

        // 3. Sync Hotels from availableCities
        (availableCities || []).forEach(city => {
            const cityName = (city.name || '').trim();
            const checkHotel = (star, hName, hPrice, hMeal, hTpl) => {
                const name = (hName || '').trim();
                const price = Number(hPrice) || 0;
                if (!name || price <= 0) return;

                const cleanName = name.replace(/(\s*,?\s*or\s+similar\s*(\d*\*?|\*)?)+/gi, '').replace(/\s+/g, ' ').trim();
                const normName = cleanName.toLowerCase();
                let existing = (masterDb.hotels || []).find(h => {
                    const hClean = (h.name || '').replace(/(\s*,?\s*or\s+similar\s*(\d*\*?|\*)?)+/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
                    return hClean === normName || hClean.includes(normName) || normName.includes(hClean);
                });

                if (existing) {
                    existing.price = price;
                    if (hMeal) existing.mealPrice = Number(hMeal);
                    if (hTpl !== undefined && hTpl !== null) existing.tplPrice = Number(hTpl);
                    if (cityName) existing.location = cityName;
                    existing.star = String(star);
                    changed = true;
                } else {
                    (masterDb.hotels = masterDb.hotels || []).push({
                        id: 'h_' + Date.now() + '_' + star + '_' + Math.random().toString(36).substring(2, 6),
                        name: cleanName,
                        location: cityName,
                        star: String(star),
                        price: price,
                        mealPrice: Number(hMeal) || 0,
                        tplPrice: Number(hTpl) || (star === 4 ? 1000 : (star === 5 ? 1200 : 800))
                    });
                    changed = true;
                }
            };

            checkHotel(3, city.hotel3Name, city.hotel3Price, city.hotel3Meal, city.hotel3Tpl);
            checkHotel(4, city.hotel4Name, city.hotel4Price, city.hotel4Meal, city.hotel4Tpl);
            checkHotel(5, city.hotel5Name, city.hotel5Price, city.hotel5Meal, city.hotel5Tpl);
        });

        if (changed) {
            await saveMasterDatabaseToFirebase(silent);
        }
    }

    async function quickSaveModalTourToMasterDb(silent = false, applyToPackage = false) {
        const btn = document.getElementById('btnTourSaveToCloud');
        const origBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
        }

        const rawName = document.getElementById('newTourName')?.value.trim();
        const price = parseFloat(document.getElementById('newTourPrice')?.value) || 0;
        const transferPrice = parseFloat(document.getElementById('newTourTransferPrice')?.value) || 0;
        const location = document.getElementById('modalTourMasterCity')?.value.trim() || document.getElementById('tourCityFilter')?.value.trim() || '';
        
        if (!rawName) {
            if (btn) { btn.disabled = false; btn.innerHTML = origBtnHtml; }
            if (!silent) showNotification("Please enter a Tour Name.", true);
            return false;
        }

        const { baseName, tag } = extractTourNameAndTag(rawName);
        const name = baseName || rawName;
        
        let existingTour = null;
        if (currentSelectedModalTourDbId) {
            existingTour = (masterDb.tours || []).find(t => t.id === currentSelectedModalTourDbId);
        }
        const cleanBase = stripTourTags(name).toLowerCase();
        const normLoc = (location || '').toLowerCase();
        if (!existingTour) {
            existingTour = (masterDb.tours || []).find(t => {
                const tBase = stripTourTags(t.name).toLowerCase();
                const tLoc = (t.location || '').trim().toLowerCase();
                if (normLoc && tLoc) return tBase === cleanBase && (tLoc === normLoc || tLoc.includes(normLoc) || normLoc.includes(tLoc));
                return tBase === cleanBase;
            });
        }
        
        const isVan = rawName.toLowerCase().includes('van') || currentSelectedModalTourVehicle === 'van';
        const isBus = rawName.toLowerCase().includes('bus') || currentSelectedModalTourVehicle === 'bus';
        const isJoin = transferPrice === 0;

        if (existingTour) {
            existingTour.name = name;
            if (isJoin) {
                existingTour.joinPrice = price;
                if (tag) existingTour.joinTag = tag;
                else if (!existingTour.joinTag) existingTour.joinTag = '(Join Tour)';
            } else {
                existingTour.ticketOnlyPrice = price;
                if (tag) existingTour.privateTag = tag;
                if (isVan) {
                    existingTour.privateVanPrice = transferPrice;
                } else if (isBus) {
                    existingTour.privateBusPrice = transferPrice;
                } else {
                    existingTour.privateCarPrice = transferPrice;
                    if (!existingTour.privateVanPrice) existingTour.privateVanPrice = transferPrice;
                }
            }
            if (location) existingTour.location = location;
            currentSelectedModalTourDbId = existingTour.id;
        } else {
            const newTourObj = {
                id: 't_' + Date.now(),
                name: name,
                location: location,
                joinPrice: isJoin ? price : null,
                joinTag: isJoin ? (tag || '(Join Tour)') : null,
                ticketOnlyPrice: !isJoin ? price : null,
                privateTag: !isJoin ? tag : null,
                privateCarPrice: !isJoin && !isVan && !isBus && transferPrice > 0 ? transferPrice : null,
                privateVanPrice: !isJoin && (isVan || !isBus) && transferPrice > 0 ? transferPrice : null,
                privateBusPrice: !isJoin && isBus && transferPrice > 0 ? transferPrice : null
            };
            (masterDb.tours = masterDb.tours || []).push(newTourObj);
            currentSelectedModalTourDbId = newTourObj.id;
            existingTour = newTourObj;
        }

        // Also update the current tour in availableTours if we are editing one
        if (currentEditingTourIndex !== null && availableTours[currentEditingTourIndex]) {
            availableTours[currentEditingTourIndex].name = rawName;
            availableTours[currentEditingTourIndex].price = price;
            availableTours[currentEditingTourIndex].transferPrice = transferPrice;
            renderTours();
            const resultsEl = document.getElementById('results');
            if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
                calculate();
            }
        }
        
        await saveMasterDatabaseToFirebase(silent);
        populateDbDropdowns();

        // Also register transfer addon with SLW Learning Engine so Excel & Google Sheets auto-place it in Transfer column
        if (transferPrice > 0 && window.SlwLearningEngine && typeof window.SlwLearningEngine.registerRule === 'function') {
            try {
                window.SlwLearningEngine.registerRule({
                    id: 'rule_transfer_addon_' + rawName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                    type: 'transfer_addon',
                    category: 'Transfer Addon',
                    title: `${rawName} Transfer Addon (${transferPrice} THB)`,
                    pattern: rawName.toLowerCase().replace(/\s*\(.*\)/, '').trim(),
                    city: location || 'Bangkok',
                    transferPrice: transferPrice,
                    targetColumn: 'Transfer (Col 7)',
                    description: `Recorded ${transferPrice} THB transfer addon on "${rawName}" into Transfer Column for accurate total calculation.`,
                    learnedFromInq: 'Master DB Update'
                });
            } catch (e) {}
        }

        const badge = document.getElementById('modalTourMasterStatusBadge');
        if (badge) {
            badge.innerText = `✅ Synced to Cloud: ${existingTour.joinTag || '(Saved)'}`;
            badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300';
        }

        if (btn) {
            btn.innerHTML = '<i class="fas fa-check"></i> <span>Saved to Cloud!</span>';
            btn.classList.remove('bg-purple-600', 'hover:bg-purple-700');
            btn.classList.add('bg-green-600', 'hover:bg-green-700');
            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = origBtnHtml;
                    btn.classList.remove('bg-green-600', 'hover:bg-green-700');
                    btn.classList.add('bg-purple-600', 'hover:bg-purple-700');
                }
            }, 2500);
        }
        
        if (applyToPackage) {
            saveTour(currentEditingTourIndex, false);
            if (!silent) showNotification(`✅ Tour "${name}" saved to Package & synced to Cloud!`, false);
        } else if (!silent) {
            showNotification(`☁️ Tour "${name}" successfully saved & synced to Master DB Cloud! (All PCs updated)`, false);
        }
        return true;
    }

    async function quickSaveModalTransferToMasterDb(silent = false, applyToPackage = false) {
        const btn = document.getElementById('btnTransferSaveToCloud');
        const origBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
        }

        const name = document.getElementById('newTransferName')?.value.trim();
        const price = parseFloat(document.getElementById('newTransferPrice')?.value) || 0;
        const location = document.getElementById('modalTransferMasterCity')?.value.trim() || document.getElementById('transferCityFilter')?.value.trim() || '';
        
        if (!name) {
            if (btn) { btn.disabled = false; btn.innerHTML = origBtnHtml; }
            if (!silent) showNotification("Please enter a Transfer Name.", true);
            return false;
        }
        
        let existingTr = null;
        if (currentSelectedModalTransferDbId) {
            existingTr = (masterDb.transfers || []).find(t => t.id === currentSelectedModalTransferDbId);
        }
        const normalizeTransferRoute = (raw) => {
            if (!raw) return '';
            return String(raw)
                .replace(/\s*\([^\)]*$/gi, '')
                .replace(/\s*\((Car|Van|Bus|Private.*)\)/gi, '')
                .replace(/\bPvt\s+Basis\b/gi, '')
                .replace(/\bPrivate\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        };
        const cleanBase = normalizeTransferRoute(name);
        if (!existingTr) {
            existingTr = (masterDb.transfers || []).find(t => normalizeTransferRoute(t.name) === cleanBase);
        }
        
        const isVan = name.toLowerCase().includes('van');
        const isBus = name.toLowerCase().includes('bus');
        const isCar = name.toLowerCase().includes('car');
        if (existingTr) {
            const cleanTrName = name.replace(/\s*\((Car|Van|Bus|Private.*)\)/i, '').replace(/\s*\([^\)]*$/gi, '').trim();
            existingTr.name = cleanTrName || name;
            if (isVan) existingTr.vanPrice = price;
            else if (isBus) existingTr.busPrice = price;
            else if (isCar) existingTr.carPrice = price;
            else {
                existingTr.price = price;
                if (!existingTr.carPrice || existingTr.carPrice === existingTr.price) existingTr.carPrice = price;
                if (!existingTr.vanPrice || existingTr.vanPrice === existingTr.price) existingTr.vanPrice = price;
            }
            existingTr.price = price;
            if (location) existingTr.location = location;
            currentSelectedModalTransferDbId = existingTr.id;
        } else {
            const cleanName = name.replace(/\s*\((Car|Van|Bus|Private.*)\)/i, '').replace(/\s*\([^\)]*$/gi, '').trim();
            const newTrObj = {
                id: 'tr_' + Date.now(),
                name: cleanName || name,
                location: location,
                price: price,
                carPrice: isCar || (!isVan && !isBus) ? price : null,
                vanPrice: isVan || (!isCar && !isBus) ? price : null,
                busPrice: isBus ? price : null
            };
            (masterDb.transfers = masterDb.transfers || []).push(newTrObj);
            currentSelectedModalTransferDbId = newTrObj.id;
        }
        
        await saveMasterDatabaseToFirebase(silent);
        populateDbDropdowns();

        // Also update the current transfer in availableTransfers if we are editing one
        if (currentEditingTransferIndex !== null && availableTransfers[currentEditingTransferIndex]) {
            availableTransfers[currentEditingTransferIndex].name = name;
            availableTransfers[currentEditingTransferIndex].price = price;
            renderTransfers();
            const resultsEl = document.getElementById('results');
            if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
                calculate();
            }
        }
        const badge = document.getElementById('modalTransferMasterStatusBadge');
        if (badge) {
            badge.innerText = '✅ Synced to Cloud';
            badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300';
        }

        if (btn) {
            btn.innerHTML = '<i class="fas fa-check"></i> <span>Saved to Cloud!</span>';
            btn.classList.remove('bg-orange-600', 'hover:bg-orange-700');
            btn.classList.add('bg-green-600', 'hover:bg-green-700');
            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = origBtnHtml;
                    btn.classList.remove('bg-green-600', 'hover:bg-green-700');
                    btn.classList.add('bg-orange-600', 'hover:bg-orange-700');
                }
            }, 2500);
        }

        if (applyToPackage) {
            saveTransfer(currentEditingTransferIndex, false);
            if (!silent) showNotification(`✅ Transfer "${name}" saved to Package & synced to Cloud!`, false);
        } else if (!silent) {
            showNotification(`☁️ Transfer "${name}" successfully saved & synced to Master DB Cloud! (All PCs updated)`, false);
        }
        return true;
    }

    async function quickSaveModalHotelsToMasterDb(silent = false, applyToPackage = false) {
        const btn = document.getElementById('btnHotelSaveToCloud');
        const origBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
        }

        const cityName = document.getElementById('newCityName')?.value.trim() || '';
        let updatedCount = 0;
        
        const checkAndSaveHotel = (star, nameId, priceId, mealId, tplId) => {
            const name = document.getElementById(nameId)?.value.trim();
            const price = parseFloat(document.getElementById(priceId)?.value) || 0;
            const meal = parseFloat(document.getElementById(mealId)?.value) || 0;
            const tpl = parseFloat(document.getElementById(tplId)?.value) || (star === 4 ? 1000 : (star === 5 ? 1200 : 800));
            if (!name || price <= 0) return;
            
            let existingH = (masterDb.hotels || []).find(h => (h.name || '').toLowerCase() === name.toLowerCase());
            if (existingH) {
                existingH.price = price;
                existingH.mealPrice = meal;
                existingH.tplPrice = tpl;
                if (cityName) existingH.location = cityName;
                existingH.star = String(star);
            } else {
                const newH = {
                    id: 'h_' + Date.now() + '_' + star,
                    name: name,
                    location: cityName,
                    star: String(star),
                    price: price,
                    mealPrice: meal,
                    tplPrice: tpl
                };
                (masterDb.hotels = masterDb.hotels || []).push(newH);
            }
            updatedCount++;
        };
        
        checkAndSaveHotel(3, 'newCity3StarName', 'newCity3StarPrice', 'newCity3StarMeal', 'newCity3StarTpl');
        checkAndSaveHotel(4, 'newCity4StarName', 'newCity4StarPrice', 'newCity4StarMeal', 'newCity4StarTpl');
        checkAndSaveHotel(5, 'newCity5StarName', 'newCity5StarPrice', 'newCity5StarMeal', 'newCity5StarTpl');
        
        if (updatedCount > 0) {
            await saveMasterDatabaseToFirebase(silent);
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check"></i> <span>Hotels Saved to Cloud!</span>';
                btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                btn.classList.add('bg-green-600', 'hover:bg-green-700');
                setTimeout(() => {
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = origBtnHtml;
                        btn.classList.remove('bg-green-600', 'hover:bg-green-700');
                        btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
                    }
                }, 2500);
            }

            if (applyToPackage) {
                saveCity(currentEditingCityIndex, false);
                if (!silent) showNotification(`✅ City stay saved to Package & synced to Cloud!`, false);
            } else if (!silent) {
                showNotification(`☁️ Successfully synced ${updatedCount} Hotel(s) to Master DB & Cloud! (All PCs updated)`, false);
            }
        } else {
            if (btn) { btn.disabled = false; btn.innerHTML = origBtnHtml; }
            if (!silent) showNotification("Please enter at least one hotel name and price.", true);
        }
    }

    function fillHotelFromDb(star) {
        const select = document.getElementById('city' + star + 'StarDbSelect');
        if (!select.value) return;
        try {
            const data = JSON.parse(select.value);
            document.getElementById('newCity' + star + 'StarName').value = data.name;
            document.getElementById('newCity' + star + 'StarPrice').value = data.price;
            document.getElementById('newCity' + star + 'StarMeal').value = data.meal;
            if (data.tplPrice !== undefined && data.tplPrice !== null) {
                document.getElementById('newCity' + star + 'StarTpl').value = data.tplPrice;
            } else {
                document.getElementById('newCity' + star + 'StarTpl').value = (star === 4 ? 1000 : (star === 5 ? 1200 : 800));
            }
        } catch(e) {}
    }
