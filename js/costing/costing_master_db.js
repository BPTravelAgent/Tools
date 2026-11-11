    // ── MASTER DATABASE STORAGE, ENCODING, TAG & ROUTE HELPERS ──
    const MASTER_DB_STORAGE_KEY = 'SLW_Master_Inventory';
    let _isSavingMasterDb = false;

    function encodeDbOptionValue(obj) {
        return encodeURIComponent(JSON.stringify(obj)).replace(/'/g, '%27');
    }

    function decodeDbOptionValue(val) {
        if (!val) return null;
        const str = String(val).trim();
        if (str.startsWith('{') || str.startsWith('[')) {
            return JSON.parse(str);
        }
        return JSON.parse(decodeURIComponent(str));
    }

    function escapeHtmlText(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function stripTourTags(str) {
        if (!str) return '';
        return String(str)
            .replace(/\s*\([^\)]*$/gi, '')
            .replace(/\s*\((Join Tour|Join\s+Tra[ns]+fer|Private\s+Tra[ns]+fer|Private\s*-\s*Van|Private\s*-\s*Bus|Private\s*-\s*Car|Private.*|Ticket Only|Join)\)\s*/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function extractTourNameAndTag(fullName) {
        if (!fullName) return { baseName: '', tag: '' };
        const str = String(fullName).trim();
        const knownMatch = str.match(/\s*\((Join Tour|Join\s+Tra[ns]+fer|Private\s+Tra[ns]+fer|Private\s*-\s*Van|Private\s*-\s*Bus|Private\s*-\s*Car|Private.*|Ticket Only|Join)\)\s*$/i);
        if (knownMatch) {
            return {
                baseName: str.slice(0, knownMatch.index).trim(),
                tag: knownMatch[0].trim()
            };
        }
        const genericMatch = str.match(/\s*\(([^)]+)\)\s*$/);
        if (genericMatch && /join|tra[ns]*fer|pvt|private|ticket|car|van|bus/i.test(genericMatch[1])) {
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
        clean = clean.replace(/\s*\((Join Tour|Join\s+Tra[ns]+fer|Private\s+Tra[ns]+fer|Private\s*-\s*Van|Private\s*-\s*Bus|Private\s*-\s*Car|Private.*|Ticket Only|Join)\)\s*$/gi, '').trim();
        if (!tag) return clean;
        const cleanTag = tag.trim().startsWith('(') ? tag.trim() : `(${tag.trim()})`;
        // Avoid duplicating if clean already ends with the exact tag
        if (clean.toLowerCase().endsWith(cleanTag.toLowerCase())) return clean;
        return `${clean} ${cleanTag}`;
    }

    function normalizeTransferRoute(raw) {
        if (!raw) return '';
        return String(raw)
            .replace(/\s*\((Car|Van|Bus|Private.*)\)\s*$/gi, '')
            .replace(/\bPvt\s+Basis\b/gi, '')
            .replace(/\bPrivate\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function normalizeDeletedIds(rawDeleted) {
        const d = rawDeleted && typeof rawDeleted === 'object' ? rawDeleted : {};
        return {
            tours: Array.from(new Set((Array.isArray(d.tours) ? d.tours : []).map(String).filter(Boolean))).slice(-500),
            hotels: Array.from(new Set((Array.isArray(d.hotels) ? d.hotels : []).map(String).filter(Boolean))).slice(-500),
            transfers: Array.from(new Set((Array.isArray(d.transfers) ? d.transfers : []).map(String).filter(Boolean))).slice(-500)
        };
    }

    function recordDeletedMasterId(type, id) {
        if (!id || !masterDb) return;
        masterDb.deletedIds = normalizeDeletedIds(masterDb.deletedIds);
        if (!masterDb.deletedIds[type]) masterDb.deletedIds[type] = [];
        const strId = String(id);
        if (!masterDb.deletedIds[type].includes(strId)) {
            masterDb.deletedIds[type].push(strId);
            if (masterDb.deletedIds[type].length > 500) {
                masterDb.deletedIds[type] = masterDb.deletedIds[type].slice(-500);
            }
        }
    }

    function deduplicateMasterDatabase(rawDb) {
        if (!rawDb) {
            return {
                tours: [],
                hotels: [],
                transfers: [],
                extras: [],
                deletedIds: { tours: [], hotels: [], transfers: [] }
            };
        }

        const deletedIds = normalizeDeletedIds(rawDb.deletedIds);
        const deletedTourSet = new Set(deletedIds.tours);
        const deletedHotelSet = new Set(deletedIds.hotels);
        const deletedTransferSet = new Set(deletedIds.transfers);

        // 1. Deduplicate & Merge Tours
        // Canonical tour identity = ID first, otherwise (base tour name + location).
        const tourGroups = {};
        const tourIdMap = {};

        (rawDb.tours || []).forEach(t => {
            if (!t) return;
            if (t.id && deletedTourSet.has(String(t.id))) return;
            const rawName = String(t.name || '').trim();
            if (!rawName) return;
            const { baseName, tag: extractedTag } = extractTourNameAndTag(rawName);
            const canonName = stripTourTags(baseName || rawName) || rawName;
            const loc = String(t.location || '').trim();
            const normLoc = loc.toLowerCase();

            let resolvedJoinTag = null;
            if (t.joinTag !== undefined && t.joinTag !== null) {
                resolvedJoinTag = String(t.joinTag).trim(); // Note: '' means explicitly no join tag
            } else if (extractedTag && /join|ticket/i.test(extractedTag)) {
                resolvedJoinTag = extractedTag;
            } else if (rawName.toLowerCase().includes('join transfer')) {
                resolvedJoinTag = '(Join Transfer)';
            } else if (rawName.toLowerCase().includes('join tour')) {
                resolvedJoinTag = '(Join Tour)';
            }

            let resolvedPrivateTag = null;
            if (t.privateTag !== undefined && t.privateTag !== null) {
                resolvedPrivateTag = String(t.privateTag).trim();
            } else if (extractedTag && /private|pvt/i.test(extractedTag)) {
                resolvedPrivateTag = extractedTag;
            }

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
                    joinTag: resolvedJoinTag,
                    privateTag: resolvedPrivateTag,
                    price: (t.joinPrice !== null && t.joinPrice !== undefined && t.joinPrice !== '') ? Number(t.joinPrice) : (t.ticketOnlyPrice ? Number(t.ticketOnlyPrice) : 0),
                    joinPrice: (t.joinPrice !== null && t.joinPrice !== undefined && t.joinPrice !== '') ? Number(t.joinPrice) : null,
                    ticketOnlyPrice: (t.ticketOnlyPrice !== null && t.ticketOnlyPrice !== undefined && t.ticketOnlyPrice !== '') ? Number(t.ticketOnlyPrice) : null,
                    privateCarPrice: (t.privateCarPrice !== null && t.privateCarPrice !== undefined && t.privateCarPrice !== '') ? Number(t.privateCarPrice) : null,
                    privateVanPrice: (t.privateVanPrice !== null && t.privateVanPrice !== undefined && t.privateVanPrice !== '') ? Number(t.privateVanPrice) : null,
                    privateBusPrice: (t.privateBusPrice !== null && t.privateBusPrice !== undefined && t.privateBusPrice !== '') ? Number(t.privateBusPrice) : null,
                    privateTransferPrice: (t.privateTransferPrice !== null && t.privateTransferPrice !== undefined && t.privateTransferPrice !== '') ? Number(t.privateTransferPrice) : null
                };
                tourGroups[canonKey] = newTour;
                if (newTour.id) tourIdMap[newTour.id] = newTour;
            } else {
                // Later record in same bucket updates values cleanly without overwriting explicit '' clears
                if (canonName) target.name = canonName;
                if (loc) target.location = loc;
                if (resolvedJoinTag !== null) target.joinTag = resolvedJoinTag;
                if (resolvedPrivateTag !== null) target.privateTag = resolvedPrivateTag;
                if (t.joinPrice !== undefined) target.joinPrice = (t.joinPrice !== null && t.joinPrice !== '') ? Number(t.joinPrice) : null;
                if (t.ticketOnlyPrice !== undefined) target.ticketOnlyPrice = (t.ticketOnlyPrice !== null && t.ticketOnlyPrice !== '') ? Number(t.ticketOnlyPrice) : null;
                if (t.privateCarPrice !== undefined) target.privateCarPrice = (t.privateCarPrice !== null && t.privateCarPrice !== '') ? Number(t.privateCarPrice) : null;
                if (t.privateVanPrice !== undefined) target.privateVanPrice = (t.privateVanPrice !== null && t.privateVanPrice !== '') ? Number(t.privateVanPrice) : null;
                if (t.privateBusPrice !== undefined) target.privateBusPrice = (t.privateBusPrice !== null && t.privateBusPrice !== '') ? Number(t.privateBusPrice) : null;
                if (t.privateTransferPrice !== undefined) target.privateTransferPrice = (t.privateTransferPrice !== null && t.privateTransferPrice !== '') ? Number(t.privateTransferPrice) : null;
                target.price = target.joinPrice || target.ticketOnlyPrice || 0;
                if (t.id && !target.id) {
                    target.id = String(t.id);
                    tourIdMap[target.id] = target;
                }
            }
        });

        // 2. Deduplicate & Merge Transfers (PRESERVE user-edited display names - NEVER hardcode overwrite!)
        const trGroups = {};
        const trIdMap = {};
        (rawDb.transfers || []).forEach(tr => {
            if (!tr) return;
            if (tr.id && deletedTransferSet.has(String(tr.id))) return;
            const rawName = String(tr.name || '').trim();
            if (!rawName) return;

            const cleanDisplayName = rawName.replace(/\s+/g, ' ').trim();
            const location = String(tr.location || '').trim();
            const norm = normalizeTransferRoute(cleanDisplayName);
            const groupKey = (norm + '|' + location.toLowerCase()).trim();

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
                    price: pDef,
                    vehicleType: tr.vehicleType || ''
                };
                trGroups[groupKey] = newTr;
                if (newTr.id) trIdMap[newTr.id] = newTr;
            } else {
                if (cleanDisplayName) target.name = cleanDisplayName;
                if (location) target.location = location;
                if (tr.carPrice !== undefined) target.carPrice = (tr.carPrice !== null && tr.carPrice !== '') ? Number(tr.carPrice) : null;
                if (tr.vanPrice !== undefined) target.vanPrice = (tr.vanPrice !== null && tr.vanPrice !== '') ? Number(tr.vanPrice) : null;
                if (tr.busPrice !== undefined) target.busPrice = (tr.busPrice !== null && tr.busPrice !== '') ? Number(tr.busPrice) : null;
                if (tr.vehicleType !== undefined) target.vehicleType = tr.vehicleType || '';
                target.price = target.carPrice || target.vanPrice || target.busPrice || pDef || 0;
                if (tr.id && !target.id) {
                    target.id = String(tr.id);
                    trIdMap[target.id] = target;
                }
            }
        });

        // 3. Deduplicate & Merge Hotels (Preserve full hotel name including "or Similar ...")
        const hGroups = {};
        const hIdMap = {};
        (rawDb.hotels || []).forEach(h => {
            if (!h) return;
            if (h.id && deletedHotelSet.has(String(h.id))) return;
            const rawName = String(h.name || '').trim();
            if (!rawName) return;
            const cleanName = rawName.replace(/\s+/g, ' ').trim();
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
                if (cleanName) target.name = cleanName;
                if (loc) target.location = loc;
                if (h.price !== undefined && h.price !== null && h.price !== '') target.price = Number(h.price) || 0;
                if (h.mealPrice !== undefined && h.mealPrice !== null && h.mealPrice !== '') target.mealPrice = Number(h.mealPrice) || 0;
                if (h.tplPrice !== undefined && h.tplPrice !== null && h.tplPrice !== '') target.tplPrice = Number(h.tplPrice);
                if (h.id && !target.id) {
                    target.id = String(h.id);
                    hIdMap[target.id] = target;
                }
            }
        });

        return {
            hotels: Object.values(hGroups),
            tours: Object.values(tourGroups),
            transfers: Object.values(trGroups),
            extras: rawDb.extras || [],
            deletedIds: deletedIds,
            updatedAt: rawDb.updatedAt || Date.now()
        };
    }

    async function saveMasterDatabaseToFirebase(silent = false) {
        updateCloudSyncStatus('syncing', (masterDb.tours || []).length, (masterDb.hotels || []).length);

        // Auto deduplicate and strip any undefined fields before persisting to Firestore
        const cleanDb = JSON.parse(JSON.stringify(deduplicateMasterDatabase(masterDb)));
        cleanDb.updatedAt = Date.now();
        masterDb = cleanDb;

        _isSavingMasterDb = true;
        let cloudSynced = false;
        let cloudError = null;
        try {
            if (typeof db !== 'undefined' && db) {
                const payload = Object.assign({}, cleanDb);
                delete payload._pendingSync;
                await db.collection('slw_settings').doc('master_inventory').set(payload);
                cloudSynced = true;
                delete masterDb._pendingSync;
                localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
                updateCloudSyncStatus('cloud', cleanDb.tours.length, cleanDb.hotels.length);
                if (window.slwLogActivity) {
                    window.slwLogActivity('Updated Master Database from Tour Costing Calculator');
                }
                if (!silent) {
                    showNotification("☁️ Master Database successfully saved & synced to Cloud!", false);
                }
            } else {
                masterDb._pendingSync = true;
                localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
                updateCloudSyncStatus('local', cleanDb.tours.length, cleanDb.hotels.length);
                if (!silent) {
                    showNotification("⚠️ Saved to Local Cache (Firebase offline)", false);
                }
            }
        } catch (err) {
            cloudError = err;
            console.error("Firebase sync error:", err);
            masterDb._pendingSync = true;
            localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
            updateCloudSyncStatus('local', cleanDb.tours.length, cleanDb.hotels.length);
            if (!silent) {
                showNotification("⚠️ Firebase Cloud Save Error: " + (err && err.message ? err.message : err) + " (Saved Locally)", true);
            }
        } finally {
            _isSavingMasterDb = false;
        }

        if (typeof populateDbDropdowns === 'function') populateDbDropdowns();
        if (typeof updateMasterDbCounts === 'function') updateMasterDbCounts();
        return !cloudError && (cloudSynced || typeof db === 'undefined' || !db);
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
        const rawInputName = document.getElementById('quickTourName')?.value.trim();
        const location = document.getElementById('quickTourLocation')?.value.trim();
        const joinPrice = document.getElementById('quickTourJoinPrice')?.value;
        const ticketOnlyPrice = document.getElementById('quickTourTicketPrice')?.value;
        const privateCarPrice = document.getElementById('quickTourCarPrice')?.value;
        const privateVanPrice = document.getElementById('quickTourVanPrice')?.value;
        const tourId = document.getElementById('quickTourId')?.value;

        if (!rawInputName) {
            showNotification("Please enter a Tour Name.", true);
            return;
        }

        const { baseName, tag } = extractTourNameAndTag(rawInputName);
        const name = baseName || rawInputName;
        const existingRec = (!isNew && tourId) ? (masterDb.tours || []).find(t => t.id === tourId) : null;

        const tourObj = {
            name,
            location,
            joinTag: tag && /join|ticket/i.test(tag) ? tag : (existingRec ? existingRec.joinTag : null),
            privateTag: tag && /private|pvt/i.test(tag) ? tag : (existingRec ? existingRec.privateTag : null),
            joinPrice: joinPrice !== '' ? Number(joinPrice) : null,
            ticketOnlyPrice: ticketOnlyPrice !== '' ? Number(ticketOnlyPrice) : null,
            privateCarPrice: privateCarPrice !== '' ? Number(privateCarPrice) : null,
            privateVanPrice: privateVanPrice !== '' ? Number(privateVanPrice) : null,
            privateBusPrice: existingRec ? (existingRec.privateBusPrice ?? null) : null,
            privateTransferPrice: existingRec ? (existingRec.privateTransferPrice ?? null) : null
        };

        if (isNew || !tourId) {
            tourObj.id = 't_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
            (masterDb.tours = masterDb.tours || []).push(tourObj);
        } else {
            tourObj.id = tourId;
            const idx = (masterDb.tours || []).findIndex(t => t.id === tourId);
            if (idx !== -1) {
                masterDb.tours[idx] = tourObj;
            } else {
                (masterDb.tours = masterDb.tours || []).push(tourObj);
            }
        }

        const synced = await saveMasterDatabaseToFirebase(true);
        populateQuickTourDropdown();
        populateDbDropdowns();
        document.getElementById('quickTourSelect').value = tourObj.id;
        document.getElementById('quickTourId').value = tourObj.id;
        const status = document.getElementById('quickTourStatus');
        if (synced) {
            if (status) status.innerHTML = `<span class="text-green-600 font-bold">Saved to Cloud!</span>`;
            showNotification(`✅ ${isNew || !tourId ? 'Added new' : 'Updated'} tour "${name}" in Master DB & Cloud!`, false);
        } else {
            if (status) status.innerHTML = `<span class="text-amber-600 font-bold">Saved Locally (Cloud pending)</span>`;
            showNotification(`⚠️ Saved tour "${name}" locally, Cloud sync failed.`, true);
        }
    }

    async function deleteQuickTour() {
        const tourId = document.getElementById('quickTourId')?.value;
        const name = document.getElementById('quickTourName')?.value.trim();
        if (!tourId && !name) {
            showNotification("Please select a tour to delete from Master Database.", true);
            return;
        }
        const targetTour = (masterDb.tours || []).find(t => (tourId && t.id === tourId) || (name && t.name.toLowerCase() === stripTourTags(name).toLowerCase()));
        if (!targetTour) {
            showNotification("Tour not found in Master Database.", true);
            return;
        }
        if (!confirm(`Are you sure you want to permanently DELETE "${targetTour.name}" from Master Database and Cloud?\n\nThis will remove it across all PCs.`)) {
            return;
        }
        recordDeletedMasterId('tours', targetTour.id);
        const idx = masterDb.tours.indexOf(targetTour);
        if (idx !== -1) {
            masterDb.tours.splice(idx, 1);
        }
        localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
        await saveMasterDatabaseToFirebase(true);
        resetQuickTourEditor();
        populateQuickTourDropdown();
        populateDbDropdowns();
        filterTourDbOptions(true);
        updateMasterDbCounts();
        showNotification(`🗑️ Tour "${targetTour.name}" permanently deleted from Master DB & Cloud!`, false);
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
            html += `<option value="${escapeHtmlText(h.id)}">${escapeHtmlText(h.name)}${escapeHtmlText(loc)} (${escapeHtmlText(h.star)}* - ${h.price} THB)</option>`;
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
        if (status) status.innerHTML = `<span class="text-blue-600 font-semibold">Editing: "${escapeHtmlText((hotel.name || '').substring(0, 25))}..."</span>`;
    }

    async function saveQuickHotel(isNew = false) {
        const name = document.getElementById('quickHotelName')?.value.trim();
        const location = document.getElementById('quickHotelLocation')?.value.trim();
        const star = document.getElementById('quickHotelStar')?.value || '3';
        const price = parseFloat(document.getElementById('quickHotelPrice')?.value) || 0;
        const mealPrice = parseFloat(document.getElementById('quickHotelMealPrice')?.value) || 0;
        const hotelId = document.getElementById('quickHotelId')?.value;
        
        if (!name || price < 0) {
            showNotification("Please enter a valid Hotel Name and Room Price.", true);
            return;
        }

        const existingH = (!isNew && hotelId) ? (masterDb.hotels || []).find(h => h.id === hotelId) : null;
        const hotelObj = {
            name,
            location,
            star: String(star),
            price: Number(price),
            mealPrice: Number(mealPrice),
            tplPrice: existingH && existingH.tplPrice !== undefined ? existingH.tplPrice : (String(star) === '4' ? 1000 : (String(star) === '5' ? 1200 : 800))
        };
        
        if (isNew || !hotelId) {
            hotelObj.id = 'h_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
            (masterDb.hotels = masterDb.hotels || []).push(hotelObj);
        } else {
            hotelObj.id = hotelId;
            const idx = (masterDb.hotels || []).findIndex(h => h.id === hotelId);
            if (idx !== -1) {
                masterDb.hotels[idx] = hotelObj;
            } else {
                (masterDb.hotels = masterDb.hotels || []).push(hotelObj);
            }
        }
        
        const synced = await saveMasterDatabaseToFirebase(true);
        populateQuickHotelDropdown();
        populateDbDropdowns();
        document.getElementById('quickHotelSelect').value = hotelObj.id;
        document.getElementById('quickHotelId').value = hotelObj.id;
        const status = document.getElementById('quickHotelStatus');
        if (synced) {
            if (status) status.innerHTML = `<span class="text-green-600 font-bold">Saved to Cloud!</span>`;
            showNotification(`✅ ${isNew || !hotelId ? 'Added new' : 'Updated'} hotel "${name}" in Master DB & Cloud!`, false);
        } else {
            if (status) status.innerHTML = `<span class="text-amber-600 font-bold">Saved Locally (Cloud pending)</span>`;
            showNotification(`⚠️ Saved hotel "${name}" locally, Cloud sync failed.`, true);
        }
    }

    async function deleteQuickHotel() {
        const hotelId = document.getElementById('quickHotelId')?.value;
        const name = document.getElementById('quickHotelName')?.value.trim();
        if (!hotelId && !name) {
            showNotification("Please select a hotel to delete from Master Database.", true);
            return;
        }
        const targetHotel = (masterDb.hotels || []).find(h => (hotelId && h.id === hotelId) || (name && h.name.toLowerCase() === name.toLowerCase()));
        if (!targetHotel) {
            showNotification("Hotel not found in Master Database.", true);
            return;
        }
        if (!confirm(`Are you sure you want to permanently DELETE "${targetHotel.name}" from Master Database and Cloud?\n\nThis will remove it across all PCs.`)) {
            return;
        }
        recordDeletedMasterId('hotels', targetHotel.id);
        const idx = masterDb.hotels.indexOf(targetHotel);
        if (idx !== -1) {
            masterDb.hotels.splice(idx, 1);
        }
        localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
        await saveMasterDatabaseToFirebase(true);
        resetQuickHotelEditor();
        populateQuickHotelDropdown();
        populateDbDropdowns();
        filterHotelDbOptions(3);
        filterHotelDbOptions(4);
        filterHotelDbOptions(5);
        updateMasterDbCounts();
        showNotification(`🗑️ Hotel "${targetHotel.name}" permanently deleted from Master DB & Cloud!`, false);
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
            const priceInfo = tr.carPrice ? `Car: ${tr.carPrice}` : (tr.vanPrice ? `Van: ${tr.vanPrice}` : (tr.busPrice ? `Bus: ${tr.busPrice}` : `Price: ${tr.price || 0}`));
            html += `<option value="${escapeHtmlText(tr.id)}">${escapeHtmlText(tr.name)}${escapeHtmlText(loc)} (${priceInfo})</option>`;
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
        if (status) status.innerHTML = `<span class="text-orange-600 font-semibold">Editing: "${escapeHtmlText((tr.name || '').substring(0, 25))}..."</span>`;
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

        const pCar = carPrice !== '' ? Number(carPrice) : null;
        const pVan = vanPrice !== '' ? Number(vanPrice) : null;
        const pBus = busPrice !== '' ? Number(busPrice) : null;

        const trObj = {
            name,
            location,
            carPrice: pCar,
            vanPrice: pVan,
            busPrice: pBus,
            price: pCar || pVan || pBus || 0
        };
        
        if (isNew || !trId) {
            trObj.id = 'tr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
            (masterDb.transfers = masterDb.transfers || []).push(trObj);
        } else {
            trObj.id = trId;
            const idx = (masterDb.transfers || []).findIndex(t => t.id === trId);
            if (idx !== -1) {
                masterDb.transfers[idx] = trObj;
            } else {
                (masterDb.transfers = masterDb.transfers || []).push(trObj);
            }
        }
        
        const synced = await saveMasterDatabaseToFirebase(true);
        populateQuickTransferDropdown();
        populateDbDropdowns();
        document.getElementById('quickTransferSelect').value = trObj.id;
        document.getElementById('quickTransferId').value = trObj.id;
        const status = document.getElementById('quickTransferStatus');
        if (synced) {
            if (status) status.innerHTML = `<span class="text-green-600 font-bold">Saved to Cloud!</span>`;
            showNotification(`✅ ${isNew || !trId ? 'Added new' : 'Updated'} transfer "${name}" in Master DB & Cloud!`, false);
        } else {
            if (status) status.innerHTML = `<span class="text-amber-600 font-bold">Saved Locally (Cloud pending)</span>`;
            showNotification(`⚠️ Saved transfer "${name}" locally, Cloud sync failed.`, true);
        }
    }

    async function deleteQuickTransfer() {
        const transferId = document.getElementById('quickTransferId')?.value;
        const name = document.getElementById('quickTransferName')?.value.trim();
        if (!transferId && !name) {
            showNotification("Please select a transfer route to delete from Master Database.", true);
            return;
        }
        const targetTransfer = (masterDb.transfers || []).find(t => (transferId && t.id === transferId) || (name && t.name.toLowerCase() === name.toLowerCase()));
        if (!targetTransfer) {
            showNotification("Transfer not found in Master Database.", true);
            return;
        }
        if (!confirm(`Are you sure you want to permanently DELETE "${targetTransfer.name}" from Master Database and Cloud?\n\nThis will remove it across all PCs.`)) {
            return;
        }
        recordDeletedMasterId('transfers', targetTransfer.id);
        const idx = masterDb.transfers.indexOf(targetTransfer);
        if (idx !== -1) {
            masterDb.transfers.splice(idx, 1);
        }
        localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
        await saveMasterDatabaseToFirebase(true);
        resetQuickTransferEditor();
        populateQuickTransferDropdown();
        populateDbDropdowns();
        filterTransferDbOptions(true);
        updateMasterDbCounts();
        showNotification(`🗑️ Transfer "${targetTransfer.name}" permanently deleted from Master DB & Cloud!`, false);
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
        if (!data) {
            return {
                hotels: [],
                tours: [],
                transfers: [],
                extras: [],
                deletedIds: { tours: [], hotels: [], transfers: [] }
            };
        }
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
                let joinTag = null;
                if (t.joinTag !== undefined && t.joinTag !== null) {
                    joinTag = String(t.joinTag).trim();
                } else if (extTag && /join|ticket/i.test(extTag)) {
                    joinTag = extTag;
                } else if (rawName.toLowerCase().includes('join transfer')) {
                    joinTag = '(Join Transfer)';
                } else if (rawName.toLowerCase().includes('join tour')) {
                    joinTag = '(Join Tour)';
                }

                let privateTag = null;
                if (t.privateTag !== undefined && t.privateTag !== null) {
                    privateTag = String(t.privateTag).trim();
                } else if (extTag && /private|pvt/i.test(extTag)) {
                    privateTag = extTag;
                }

                return {
                    id: t.id || ('t_' + idx),
                    name: rawName,
                    location: (t.location || '').trim(),
                    joinTag: joinTag,
                    privateTag: privateTag,
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
            extras: data.extras || [],
            deletedIds: normalizeDeletedIds(data.deletedIds),
            updatedAt: data.updatedAt || 0,
            _pendingSync: Boolean(data._pendingSync)
        };
    }

    async function loadMasterDatabase(forceReload = false) {
        let fetchedDb = { hotels: [], tours: [], transfers: [], extras: [], deletedIds: { tours: [], hotels: [], transfers: [] } };
        let cloudDb = null;
        let localDb = null;

        // 1. Fetch from Firebase Cloud (primary source of truth)
        try {
            if (typeof db !== 'undefined' && db) {
                const doc = await db.collection('slw_settings').doc('master_inventory').get();
                if (doc.exists) {
                    cloudDb = sanitizeDb(doc.data());
                    console.log(`Cloud Master DB fetched: ${cloudDb.tours.length} tours, ${cloudDb.hotels.length} hotels, ${cloudDb.transfers.length} transfers.`);
                }
            }
        } catch (e) {
            console.error("Firebase fetch error:", e);
        }

        // 2. Local Cache
        const saved = localStorage.getItem(MASTER_DB_STORAGE_KEY);
        if (saved) {
            try {
                localDb = sanitizeDb(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse local database');
            }
        }

        const cloudHasData = cloudDb && ((cloudDb.tours || []).length > 0 || (cloudDb.hotels || []).length > 0 || (cloudDb.transfers || []).length > 0);
        const localHasData = localDb && ((localDb.tours || []).length > 0 || (localDb.hotels || []).length > 0 || (localDb.transfers || []).length > 0);

        // 3. Only load static master_db.json as initial seed when NEITHER Cloud NOR Local has data
        if (!cloudHasData && !localHasData) {
            try {
                const response = await fetch('./master_db.json?t=' + new Date().getTime());
                if (response.ok) {
                    const data = await response.json();
                    fetchedDb = sanitizeDb(data);
                }
            } catch (e) {
                console.log("master_db.json not found via fetch.");
            }
        }

        // 4. Authoritative source selection: Cloud > unsynced newer Local > Local > Base seed
        // NEVER re-merge static master_db.json over an established Cloud/Local DB (prevents resurrection/overwrites).
        let chosenRaw = fetchedDb;
        let usedSource = 'seed';
        if (cloudHasData) {
            if (localHasData && localDb._pendingSync && (localDb.updatedAt || 0) > (cloudDb.updatedAt || 0)) {
                chosenRaw = localDb;
                usedSource = 'local_pending';
            } else {
                chosenRaw = cloudDb;
                usedSource = 'cloud';
            }
        } else if (localHasData) {
            chosenRaw = localDb;
            usedSource = 'local';
        }

        masterDb = deduplicateMasterDatabase(chosenRaw);
        if (usedSource === 'local_pending') masterDb._pendingSync = true;
        localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
        console.log(`Master database active (${usedSource}): ${masterDb.tours.length} tours, ${masterDb.hotels.length} hotels, ${masterDb.transfers.length} transfers.`);

        // If Cloud was completely empty, seed Cloud once with initial database; or flush pending offline edits
        if ((!cloudHasData || usedSource === 'local_pending') && typeof db !== 'undefined' && db && (masterDb.tours.length > 0 || masterDb.hotels.length > 0 || masterDb.transfers.length > 0)) {
            try {
                const payload = Object.assign({}, masterDb);
                delete payload._pendingSync;
                db.collection('slw_settings').doc('master_inventory').set(payload).then(() => {
                    delete masterDb._pendingSync;
                    localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
                }).catch(() => {});
            } catch (e) {}
        }

        populateDbDropdowns();
        updateCloudSyncStatus(cloudHasData ? 'cloud' : 'local', masterDb.tours.length, masterDb.hotels.length);
        if (forceReload) {
            showNotification(`☁️ Successfully synced ${masterDb.tours.length} tours, ${masterDb.hotels.length} hotels, and ${masterDb.transfers.length} transfers with Cloud!`, false);
        }

        // Setup real-time listener for Master DB updates across all PCs
        if (!window._masterDbCloudListenerAttached && typeof db !== 'undefined' && db) {
            window._masterDbCloudListenerAttached = true;
            try {
                db.collection('slw_settings').doc('master_inventory').onSnapshot(docSnap => {
                    if (_isSavingMasterDb) return;
                    if (docSnap && docSnap.exists) {
                        const incomingData = sanitizeDb(docSnap.data());
                        if (incomingData && (incomingData.tours.length > 0 || incomingData.hotels.length > 0 || incomingData.transfers.length > 0)) {
                            masterDb = deduplicateMasterDatabase(incomingData);
                            localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
                            populateDbDropdowns();
                            updateMasterDbCounts();
                            updateCloudSyncStatus('cloud', masterDb.tours.length, masterDb.hotels.length);
                        }
                    }
                }, err => {
                    console.warn('Real-time Master DB listener notice:', err);
                });
            } catch (e) {}
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
                    let tag = '';
                    if (t.joinTag !== undefined && t.joinTag !== null) {
                        tag = t.joinTag;
                    } else {
                        tag = t.name.toLowerCase().includes('join transfer') ? '(Join Transfer)' : '(Join Tour)';
                    }
                    const fullName = formatTourVariantName(t.name, tag);
                    const data = { id: t.id, baseName: t.name, location: loc, type: 'join', name: fullName, price: Number(t.joinPrice), transfer: 0, tag: tag };
                    const label = `${fullName} - ${t.joinPrice} THB`;
                    options.push({ data, label, name: t.name, location: loc });
                    addedAny = true;
                }
                if (t.ticketOnlyPrice || t.privateCarPrice || t.privateVanPrice || t.privateBusPrice || t.privateTransferPrice) {
                    const hasCar = Boolean(t.privateCarPrice || (!t.privateVanPrice && !t.privateBusPrice && t.privateTransferPrice));
                    const hasVan = Boolean(t.privateVanPrice);
                    const hasBus = Boolean(t.privateBusPrice);
                    const multiVehicles = (hasCar ? 1 : 0) + (hasVan ? 1 : 0) + (hasBus ? 1 : 0) > 1;
                    const basePvtTag = (t.privateTag !== undefined && t.privateTag !== null) ? t.privateTag : null;

                    if (hasCar) {
                        const carPrice = Number(t.privateCarPrice || t.privateTransferPrice || 0);
                        const ticketPrice = Number(t.ticketOnlyPrice || 0);
                        let tag = '(Private - Car)';
                        if (basePvtTag !== null) {
                            if (basePvtTag === '') tag = '';
                            else if (multiVehicles && !/\bcar\b|\bvan\b|\bbus\b/i.test(basePvtTag)) tag = '(Private - Car)';
                            else tag = basePvtTag;
                        }
                        const fullName = formatTourVariantName(t.name, tag);
                        const data = { id: t.id, baseName: t.name, location: loc, type: 'private', vehicle: 'car', name: fullName, price: ticketPrice, transfer: carPrice, tag: tag };
                        const label = `${fullName} - Ticket: ${ticketPrice}, Transfer: ${carPrice}`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                    if (hasVan) {
                        const ticketPrice = Number(t.ticketOnlyPrice || 0);
                        let tag = '(Private - Van)';
                        if (basePvtTag !== null) {
                            if (basePvtTag === '') tag = '';
                            else if (multiVehicles && !/\bcar\b|\bvan\b|\bbus\b/i.test(basePvtTag)) tag = '(Private - Van)';
                            else tag = basePvtTag;
                        }
                        const fullName = formatTourVariantName(t.name, tag);
                        const data = { id: t.id, baseName: t.name, location: loc, type: 'private', vehicle: 'van', name: fullName, price: ticketPrice, transfer: Number(t.privateVanPrice), tag: tag };
                        const label = `${fullName} - Ticket: ${ticketPrice}, Transfer: ${t.privateVanPrice}`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                    if (hasBus) {
                        const ticketPrice = Number(t.ticketOnlyPrice || 0);
                        let tag = '(Private - Bus)';
                        if (basePvtTag !== null) {
                            if (basePvtTag === '') tag = '';
                            else if (multiVehicles && !/\bcar\b|\bvan\b|\bbus\b/i.test(basePvtTag)) tag = '(Private - Bus)';
                            else tag = basePvtTag;
                        }
                        const fullName = formatTourVariantName(t.name, tag);
                        const data = { id: t.id, baseName: t.name, location: loc, type: 'private', vehicle: 'bus', name: fullName, price: ticketPrice, transfer: Number(t.privateBusPrice), tag: tag };
                        const label = `${fullName} - Ticket: ${ticketPrice}, Transfer: ${t.privateBusPrice}`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                    if (t.ticketOnlyPrice && !t.privateCarPrice && !t.privateVanPrice && !t.privateBusPrice && !t.privateTransferPrice) {
                        const tag = (t.joinTag !== undefined && t.joinTag !== null) ? t.joinTag : '(Ticket Only)';
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
                    const tag = (t.joinTag !== undefined && t.joinTag !== null) ? t.joinTag : (ticketPrice && !trfPrice ? '(Join Tour)' : '');
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
        let html = `<option value="">${escapeHtmlText(placeholder)}</option>`;
        options.forEach(opt => {
            html += `<option value="${encodeDbOptionValue(opt.data)}">${escapeHtmlText(opt.label)}</option>`;
        });
        tourSelect.innerHTML = html;

        // Restore previous or newly saved tour selection (matching both ID and variant type/vehicle)
        let restored = false;
        if (currentSelectedModalTourDbId) {
            let fallbackIdx = -1;
            for (let i = 1; i < tourSelect.options.length; i++) {
                try {
                    const optData = decodeDbOptionValue(tourSelect.options[i].value);
                    if (optData && optData.id === currentSelectedModalTourDbId) {
                        if (fallbackIdx === -1) fallbackIdx = i;
                        const typeMatch = !currentSelectedModalTourOptionType || optData.type === currentSelectedModalTourOptionType;
                        const vehMatch = !currentSelectedModalTourVehicle || !optData.vehicle || optData.vehicle === currentSelectedModalTourVehicle;
                        if (typeMatch && vehMatch) {
                            tourSelect.selectedIndex = i;
                            restored = true;
                            break;
                        }
                    }
                } catch (e) {}
            }
            if (!restored && fallbackIdx !== -1) {
                tourSelect.selectedIndex = fallbackIdx;
                restored = true;
            }
        }
        if (!restored && prevTourVal) {
            try {
                const prevData = decodeDbOptionValue(prevTourVal);
                for (let i = 1; i < tourSelect.options.length; i++) {
                    try {
                        const optData = decodeDbOptionValue(tourSelect.options[i].value);
                        if (optData && ((prevData.id && optData.id === prevData.id) || optData.name === prevData.name)) {
                            tourSelect.selectedIndex = i;
                            break;
                        }
                    } catch (e) {}
                }
            } catch (e) {}
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
                const hasExplicitNoTag = t.vehicleType === 'NONE';
                const hasCar = Boolean(t.carPrice);
                const hasVan = Boolean(t.vanPrice);
                const hasBus = Boolean(t.busPrice);
                const hasAnyVehicleTier = hasCar || hasVan || hasBus;
                let addedAny = false;

                if (hasExplicitNoTag && !hasVan && !hasBus) {
                    const price = Number(t.carPrice || t.price || 0);
                    const data = { id: t.id, baseName: t.name, location: loc, vehicle: 'custom', name: t.name, price: price };
                    const label = `${t.name} - ${price} THB`;
                    options.push({ data, label, name: t.name, location: loc });
                    addedAny = true;
                } else {
                    if (hasCar || (!hasVan && !hasBus && t.price)) {
                        const price = Number(t.carPrice || t.price || 0);
                        const suffix = (hasExplicitNoTag && !hasVan && !hasBus)
                            ? ''
                            : (/\((car|van|bus)\)\s*$/i.test(t.name) ? '' : (t.vehicleType && t.vehicleType !== 'Any' ? ` (${t.vehicleType})` : ' (Car)'));
                        const name = t.name + suffix;
                        const data = { id: t.id, baseName: t.name, location: loc, vehicle: 'car', name: name, price: price };
                        const label = `${name} - ${price} THB`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                    if (hasVan) {
                        const name = /\((van)\)\s*$/i.test(t.name) ? t.name : `${t.name} (Van)`;
                        const data = { id: t.id, baseName: t.name, location: loc, vehicle: 'van', name: name, price: Number(t.vanPrice) };
                        const label = `${name} - ${t.vanPrice} THB`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                    if (hasBus) {
                        const name = /\((bus)\)\s*$/i.test(t.name) ? t.name : `${t.name} (Bus)`;
                        const data = { id: t.id, baseName: t.name, location: loc, vehicle: 'bus', name: name, price: Number(t.busPrice) };
                        const label = `${name} - ${t.busPrice} THB`;
                        options.push({ data, label, name: t.name, location: loc });
                        addedAny = true;
                    }
                }
                if (!addedAny) {
                    const price = Number(t.price || 0);
                    const name = t.name;
                    const data = { id: t.id, baseName: t.name, location: loc, vehicle: 'custom', name: name, price: price };
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
        let html = `<option value="">${escapeHtmlText(placeholder)}</option>`;
        options.forEach(opt => {
            html += `<option value="${encodeDbOptionValue(opt.data)}">${escapeHtmlText(opt.label)}</option>`;
        });
        transferSelect.innerHTML = html;

        // Restore selection by locked DB ID + vehicle, or fallback to previous value
        let restored = false;
        if (currentSelectedModalTransferDbId) {
            let fallbackIdx = -1;
            for (let i = 1; i < transferSelect.options.length; i++) {
                try {
                    const optData = decodeDbOptionValue(transferSelect.options[i].value);
                    if (optData && optData.id === currentSelectedModalTransferDbId) {
                        if (fallbackIdx === -1) fallbackIdx = i;
                        if (!currentSelectedModalTransferVehicle || optData.vehicle === currentSelectedModalTransferVehicle) {
                            transferSelect.selectedIndex = i;
                            restored = true;
                            break;
                        }
                    }
                } catch (e) {}
            }
            if (!restored && fallbackIdx !== -1) {
                transferSelect.selectedIndex = fallbackIdx;
                restored = true;
            }
        }
        if (!restored && prevTrVal) {
            try {
                const prevData = decodeDbOptionValue(prevTrVal);
                for (let i = 1; i < transferSelect.options.length; i++) {
                    try {
                        const optData = decodeDbOptionValue(transferSelect.options[i].value);
                        if (optData && ((prevData.id && optData.id === prevData.id) || optData.name === prevData.name)) {
                            transferSelect.selectedIndex = i;
                            break;
                        }
                    } catch (e) {}
                }
            } catch (e) {}
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
        let html = `<option value="">${escapeHtmlText(placeholder)}</option>`;
        hotels.forEach(h => {
            const data = { id: h.id, name: h.name, location: h.location || '', price: h.price, meal: h.mealPrice || 0, tplPrice: h.tplPrice || (star === 4 ? 1000 : (star === 5 ? 1200 : 800)) };
            const locText = h.location ? ` [${h.location}]` : '';
            html += `<option value="${encodeDbOptionValue(data)}">${escapeHtmlText(h.name)}${escapeHtmlText(locText)} - ${h.price} THB</option>`;
        });
        select.innerHTML = html;

        const lockedId = currentSelectedModalHotelDbIds && currentSelectedModalHotelDbIds[star];
        if (lockedId) {
            for (let i = 1; i < select.options.length; i++) {
                try {
                    const optData = decodeDbOptionValue(select.options[i].value);
                    if (optData && optData.id === lockedId) {
                        select.selectedIndex = i;
                        break;
                    }
                } catch (e) {}
            }
        }
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
        let html = `<option value="">${escapeHtmlText(placeholder)}</option>`;
        allCities.forEach(c => html += `<option value="${escapeHtmlText(c)}">${escapeHtmlText(c)}</option>`);
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
                    html += `<option value="${escapeHtmlText(e.price)}">${escapeHtmlText(e.name)} - ${escapeHtmlText(e.price)}</option>`;
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
                for (let i = 1; i < hotelSelect.options.length; i++) {
                    try {
                        const optData = decodeDbOptionValue(hotelSelect.options[i].value);
                        if (optData && ((matchingHotel.id && optData.id === matchingHotel.id) || (optData.name === matchingHotel.name && optData.price === matchingHotel.price))) {
                            hotelSelect.selectedIndex = i;
                            fillHotelFromDb(star);
                            break;
                        }
                    } catch (e) {}
                }
            }
        });
    }
    let currentSelectedModalTourDbId = null;
    let currentSelectedModalTourVehicle = null;
    let currentSelectedModalTourOptionType = null;
    let currentSelectedModalTransferDbId = null;
    let currentSelectedModalTransferVehicle = null;
    let currentSelectedModalHotelDbIds = { 3: null, 4: null, 5: null };
    let currentEditingTourIndex = null;
    let currentEditingTransferIndex = null;
    let currentEditingCityIndex = null;

    function fillTourFromDb() {
        const select = document.getElementById('tourDbSelect');
        if (!select.value) return;
        try {
            const data = decodeDbOptionValue(select.value);
            if (!data) return;
            document.getElementById('newTourName').value = data.name;
            document.getElementById('newTourPrice').value = data.price;
            document.getElementById('newTourTransferPrice').value = data.transfer;

            currentSelectedModalTourDbId = data.id || null;
            currentSelectedModalTourOptionType = data.type || null;
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
        } catch (e) {}
    }

    function fillTransferFromDb() {
        const select = document.getElementById('transferDbSelect');
        if (!select.value) return;
        try {
            const data = decodeDbOptionValue(select.value);
            if (!data) return;
            document.getElementById('newTransferName').value = data.name;
            document.getElementById('newTransferPrice').value = data.price;

            currentSelectedModalTransferDbId = data.id || null;
            currentSelectedModalTransferVehicle = data.vehicle || (/\(van\)/i.test(data.name) ? 'van' : (/\(bus\)/i.test(data.name) ? 'bus' : (/\(car\)/i.test(data.name) ? 'car' : 'custom')));
            const cityInp = document.getElementById('modalTransferMasterCity');
            if (cityInp) cityInp.value = data.location || document.getElementById('transferCityFilter')?.value || '';
            const badge = document.getElementById('modalTransferMasterStatusBadge');
            if (badge) {
                badge.innerText = data.baseName ? `Linked: ${data.baseName.substring(0, 20)}` : 'Linked to Master DB';
                badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800';
            }
            const chk = document.getElementById('modalSyncTransferToDbCheckbox');
            if (chk) chk.checked = true;
        } catch (e) {}
    }

    function onTourModalNameInput(val) {
        val = (val || '').trim();
        const badge = document.getElementById('modalTourMasterStatusBadge');
        const cityInp = document.getElementById('modalTourMasterCity');
        const syncChk = document.getElementById('modalSyncTourToDbCheckbox');

        // IMPORTANT: Keep currentSelectedModalTourDbId intact while the user clears or retypes text!
        if (currentSelectedModalTourDbId) {
            const existing = (masterDb.tours || []).find(t => t.id === currentSelectedModalTourDbId);
            if (existing) {
                if (badge) {
                    badge.innerText = `Editing Linked: ${(existing.name || '').substring(0, 16)}`;
                    badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200';
                }
                if (syncChk) syncChk.checked = true;
                return;
            }
        }

        if (!val) {
            if (badge) { badge.innerText = 'Custom / New'; badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700'; }
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
        } else if (badge) {
            badge.innerText = 'Custom / New';
            badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700';
        }
    }

    function onTransferModalNameInput(val) {
        val = (val || '').trim();
        const badge = document.getElementById('modalTransferMasterStatusBadge');
        const cityInp = document.getElementById('modalTransferMasterCity');
        const syncChk = document.getElementById('modalSyncTransferToDbCheckbox');

        // IMPORTANT: Keep currentSelectedModalTransferDbId intact while the user clears or retypes text!
        if (currentSelectedModalTransferDbId) {
            const existing = (masterDb.transfers || []).find(t => t.id === currentSelectedModalTransferDbId);
            if (existing) {
                if (badge) {
                    badge.innerText = `Editing Linked: ${(existing.name || '').substring(0, 16)}`;
                    badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200';
                }
                if (syncChk) syncChk.checked = true;
                return;
            }
        }

        if (!val) {
            if (badge) { badge.innerText = 'Custom / New'; badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700'; }
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
        } else if (badge) {
            badge.innerText = 'Custom / New';
            badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700';
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
            const name = stripTourTags(baseName || rawName) || rawName;
            const cleanBase = stripTourTags(name).toLowerCase();
            const isJoin = transferPrice === 0;

            let existing = (masterDb.tours || []).find(t => stripTourTags(t.name).toLowerCase() === cleanBase);
            if (existing) {
                existing.name = name;
                if (isJoin) {
                    existing.joinPrice = price;
                    if (tag) existing.joinTag = tag;
                } else {
                    existing.ticketOnlyPrice = price;
                    if (tag) existing.privateTag = tag;
                    if (transferPrice > 0) {
                        if (/\bvan\b/i.test(rawName)) existing.privateVanPrice = transferPrice;
                        else if (/\bbus\b/i.test(rawName)) existing.privateBusPrice = transferPrice;
                        else existing.privateCarPrice = transferPrice;
                    }
                }
                changed = true;
            } else {
                const isVan = /\bvan\b/i.test(rawName);
                const isBus = /\bbus\b/i.test(rawName);
                (masterDb.tours = masterDb.tours || []).push({
                    id: 't_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                    name: name,
                    location: availableCities[0] ? (availableCities[0].name || '').trim() : '',
                    joinPrice: isJoin ? price : null,
                    joinTag: isJoin ? (tag || '') : null,
                    ticketOnlyPrice: !isJoin ? price : null,
                    privateTag: !isJoin ? (tag || '') : null,
                    privateCarPrice: !isJoin && !isVan && !isBus && transferPrice > 0 ? transferPrice : null,
                    privateVanPrice: !isJoin && isVan && transferPrice > 0 ? transferPrice : null,
                    privateBusPrice: !isJoin && isBus && transferPrice > 0 ? transferPrice : null
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
            const vehMatch = rawName.match(/\s*\((Car|Van|Bus)\)\s*$/i);
            const cleanTrName = vehMatch ? rawName.slice(0, vehMatch.index).trim() : rawName;
            let existing = (masterDb.transfers || []).find(t => normalizeTransferRoute(t.name) === norm);
            if (existing) {
                existing.price = price;
                if (vehMatch && /van/i.test(vehMatch[1])) existing.vanPrice = price;
                else if (vehMatch && /bus/i.test(vehMatch[1])) existing.busPrice = price;
                else if (vehMatch && /car/i.test(vehMatch[1])) existing.carPrice = price;
                else if (!existing.vanPrice && !existing.busPrice) existing.carPrice = price;
                changed = true;
            } else {
                (masterDb.transfers = masterDb.transfers || []).push({
                    id: 'tr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                    name: cleanTrName,
                    location: availableCities[0] ? (availableCities[0].name || '').trim() : '',
                    price: price,
                    carPrice: vehMatch && /van|bus/i.test(vehMatch[1]) ? null : price,
                    vanPrice: vehMatch && /van/i.test(vehMatch[1]) ? price : null,
                    busPrice: vehMatch && /bus/i.test(vehMatch[1]) ? price : null,
                    vehicleType: vehMatch ? '' : 'NONE'
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

                const normName = name.toLowerCase();
                let existing = (masterDb.hotels || []).find(h => (h.name || '').trim().toLowerCase() === normName);

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
                        name: name,
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

    async function quickSaveModalTourToMasterDb(silent = false, applyToPackage = false, forceNew = false) {
        const btn = document.getElementById(forceNew ? 'btnTourAddNewToDb' : 'btnTourSaveToCloud');
        const origBtnHtml = btn ? btn.innerHTML : '';
        const origBtnClass = btn ? btn.className : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
        }

        const rawName = (document.getElementById('newTourName')?.value || '').trim();
        const price = parseFloat(document.getElementById('newTourPrice')?.value) || 0;
        const transferPrice = parseFloat(document.getElementById('newTourTransferPrice')?.value) || 0;
        const location = (document.getElementById('modalTourMasterCity')?.value || '').trim() || (document.getElementById('tourCityFilter')?.value || '').trim() || '';

        if (!rawName) {
            if (btn) { btn.disabled = false; btn.innerHTML = origBtnHtml; }
            if (!silent) showNotification("Please enter a Tour Name.", true);
            return false;
        }

        const { baseName, tag } = extractTourNameAndTag(rawName);
        const name = stripTourTags(baseName || rawName) || rawName;

        let existingTour = null;
        if (!forceNew && currentSelectedModalTourDbId) {
            existingTour = (masterDb.tours || []).find(t => t.id === currentSelectedModalTourDbId);
        }
        const cleanBase = stripTourTags(name).toLowerCase();
        const normLoc = (location || '').toLowerCase();
        if (!forceNew && !existingTour) {
            existingTour = (masterDb.tours || []).find(t => {
                const tBase = stripTourTags(t.name).toLowerCase();
                const tLoc = (t.location || '').trim().toLowerCase();
                if (normLoc && tLoc) return tBase === cleanBase && (tLoc === normLoc || tLoc.includes(normLoc) || normLoc.includes(tLoc));
                return tBase === cleanBase;
            });
        }

        const hasExplicitJoinTag = /\bjoin\b|\bticket\b/i.test(tag);
        const hasExplicitPrivateTag = /\bprivate\b|\bpvt\b|\bvan\b|\bbus\b|\bcar\b/i.test(tag);
        const isVan = /\bvan\b/i.test(rawName) || (!/\bcar\b|\bbus\b/i.test(rawName) && currentSelectedModalTourVehicle === 'van');
        const isBus = /\bbus\b/i.test(rawName) || (!/\bcar\b|\bvan\b/i.test(rawName) && currentSelectedModalTourVehicle === 'bus');
        const isJoin = transferPrice === 0 && !hasExplicitPrivateTag;

        if (existingTour) {
            existingTour.name = name;
            if (location) existingTour.location = location;
            if (isJoin) {
                existingTour.joinPrice = price;
                // Explicit '' preserves removed/custom parentheses so filterTourDbOptions won't re-inject stale tags
                existingTour.joinTag = hasExplicitJoinTag ? tag : '';
            } else {
                existingTour.ticketOnlyPrice = price;
                existingTour.privateTag = hasExplicitPrivateTag ? tag : '';
                if (isVan) {
                    existingTour.privateVanPrice = transferPrice;
                } else if (isBus) {
                    existingTour.privateBusPrice = transferPrice;
                } else {
                    existingTour.privateCarPrice = transferPrice;
                }
            }
            existingTour.price = existingTour.joinPrice || existingTour.ticketOnlyPrice || 0;
            currentSelectedModalTourDbId = existingTour.id;
            currentSelectedModalTourOptionType = isJoin ? 'join' : 'private';
            currentSelectedModalTourVehicle = isVan ? 'van' : (isBus ? 'bus' : 'car');
        } else {
            const newId = 't_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
            const newTourObj = {
                id: newId,
                name: name,
                location: location,
                price: price,
                joinPrice: isJoin ? price : null,
                joinTag: isJoin ? (hasExplicitJoinTag ? tag : '') : null,
                ticketOnlyPrice: !isJoin ? price : null,
                privateTag: !isJoin ? (hasExplicitPrivateTag ? tag : '') : null,
                privateCarPrice: !isJoin && !isVan && !isBus && transferPrice > 0 ? transferPrice : null,
                privateVanPrice: !isJoin && isVan && transferPrice > 0 ? transferPrice : null,
                privateBusPrice: !isJoin && isBus && transferPrice > 0 ? transferPrice : null
            };
            (masterDb.tours = masterDb.tours || []).push(newTourObj);
            currentSelectedModalTourDbId = newTourObj.id;
            currentSelectedModalTourOptionType = isJoin ? 'join' : 'private';
            currentSelectedModalTourVehicle = isVan ? 'van' : (isBus ? 'bus' : 'car');
            existingTour = newTourObj;
        }

        // Update active package tour live when editing an item
        if (currentEditingTourIndex !== null && availableTours[currentEditingTourIndex]) {
            availableTours[currentEditingTourIndex].name = rawName;
            availableTours[currentEditingTourIndex].price = price;
            availableTours[currentEditingTourIndex].transferPrice = transferPrice;
            if (typeof renderTours === 'function') renderTours();
            const resultsEl = document.getElementById('results');
            if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
                calculate();
            }
            if (typeof saveState === 'function') saveState();
        }

        const synced = await saveMasterDatabaseToFirebase(silent);
        populateQuickTourDropdown();
        populateDbDropdowns();

        // Register transfer addon with SLW Learning Engine
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
            if (synced) {
                badge.innerText = `✅ Synced to Cloud: ${(existingTour.name || '').substring(0, 18)}`;
                badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300';
            } else {
                badge.innerText = '⚠️ Saved Locally (Cloud Failed)';
                badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300';
            }
        }

        if (btn) {
            if (synced) {
                btn.innerHTML = `<i class="fas fa-check"></i> <span>${forceNew ? 'Added to Cloud!' : 'Saved to Cloud!'}</span>`;
                btn.className = origBtnClass.replace(/(?:hover:)?bg-(?:purple|indigo)-\d+/g, '') + ' bg-green-600 hover:bg-green-700';
                setTimeout(() => {
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = origBtnHtml;
                        btn.className = origBtnClass;
                    }
                }, 2500);
            } else {
                btn.disabled = false;
                btn.innerHTML = origBtnHtml;
            }
        }

        if (applyToPackage && typeof saveTour === 'function') {
            await saveTour(currentEditingTourIndex, false);
            if (!silent && synced) showNotification(`✅ Tour "${rawName}" saved to Package & synced to Cloud!`, false);
        } else if (!silent && synced) {
            showNotification(`☁️ Tour "${rawName}" successfully ${forceNew ? 'added & ' : ''}synced to Master DB & Cloud!`, false);
        }
        return synced;
    }

    async function deleteModalTourFromMasterDb() {
        const rawName = document.getElementById('newTourName')?.value.trim();
        const select = document.getElementById('tourDbSelect');
        let targetTour = null;

        if (currentSelectedModalTourDbId) {
            targetTour = (masterDb.tours || []).find(t => t.id === currentSelectedModalTourDbId);
        }
        if (!targetTour && select && select.value) {
            try {
                const data = decodeDbOptionValue(select.value);
                if (data && data.id) targetTour = (masterDb.tours || []).find(t => t.id === data.id);
                if (!targetTour && data && data.name) {
                    const base = stripTourTags(data.name).toLowerCase();
                    targetTour = (masterDb.tours || []).find(t => stripTourTags(t.name).toLowerCase() === base);
                }
            } catch (e) {}
        }
        if (!targetTour && rawName) {
            const base = stripTourTags(rawName).toLowerCase();
            targetTour = (masterDb.tours || []).find(t => stripTourTags(t.name).toLowerCase() === base);
        }

        if (!targetTour) {
            showNotification("Please select a tour from the Master Database dropdown to delete.", true);
            return;
        }

        if (!confirm(`Are you sure you want to permanently DELETE "${targetTour.name}" from Master Database and Cloud?\n\nThis will remove it across all PCs.`)) {
            return;
        }

        recordDeletedMasterId('tours', targetTour.id);
        const idx = masterDb.tours.indexOf(targetTour);
        if (idx !== -1) {
            masterDb.tours.splice(idx, 1);
        }
        localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
        await saveMasterDatabaseToFirebase(true);

        currentSelectedModalTourDbId = null;
        currentSelectedModalTourOptionType = null;
        currentSelectedModalTourVehicle = null;
        document.getElementById('newTourName').value = '';
        document.getElementById('newTourPrice').value = '';
        document.getElementById('newTourTransferPrice').value = '';
        const badge = document.getElementById('modalTourMasterStatusBadge');
        if (badge) {
            badge.innerText = 'Deleted from DB';
            badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800';
        }

        filterTourDbOptions(true);
        populateQuickTourDropdown();
        populateDbDropdowns();
        updateMasterDbCounts();
        showNotification(`🗑️ Tour "${targetTour.name}" permanently deleted from Master Database & Cloud!`, false);
    }

    async function quickSaveModalTransferToMasterDb(silent = false, applyToPackage = false, forceNew = false) {
        const btn = document.getElementById(forceNew ? 'btnTransferAddNewToDb' : 'btnTransferSaveToCloud');
        const origBtnHtml = btn ? btn.innerHTML : '';
        const origBtnClass = btn ? btn.className : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
        }

        const name = (document.getElementById('newTransferName')?.value || '').trim();
        const price = parseFloat(document.getElementById('newTransferPrice')?.value) || 0;
        const location = (document.getElementById('modalTransferMasterCity')?.value || '').trim() || (document.getElementById('transferCityFilter')?.value || '').trim() || '';

        if (!name) {
            if (btn) { btn.disabled = false; btn.innerHTML = origBtnHtml; }
            if (!silent) showNotification("Please enter a Transfer Name.", true);
            return false;
        }

        let existingTr = null;
        if (!forceNew && currentSelectedModalTransferDbId) {
            existingTr = (masterDb.transfers || []).find(t => t.id === currentSelectedModalTransferDbId);
        }
        const cleanBase = normalizeTransferRoute(name);
        if (!forceNew && !existingTr) {
            existingTr = (masterDb.transfers || []).find(t => normalizeTransferRoute(t.name) === cleanBase);
        }

        const vehTagMatch = name.match(/\s*\((Car|Van|Bus)\)\s*$/i);
        const explicitVeh = vehTagMatch ? vehTagMatch[1].toLowerCase() : null;
        const cleanTrName = vehTagMatch ? name.slice(0, vehTagMatch.index).trim() : name;
        const isVan = explicitVeh === 'van' || (!explicitVeh && currentSelectedModalTransferVehicle === 'van');
        const isBus = explicitVeh === 'bus' || (!explicitVeh && currentSelectedModalTransferVehicle === 'bus');
        const isCar = explicitVeh === 'car' || (!explicitVeh && currentSelectedModalTransferVehicle === 'car');

        if (existingTr) {
            const hasMultiTiers = (existingTr.carPrice ? 1 : 0) + (existingTr.vanPrice ? 1 : 0) + (existingTr.busPrice ? 1 : 0) > 1;
            if (vehTagMatch) {
                existingTr.name = cleanTrName || name;
                existingTr.vehicleType = '';
                if (isVan) existingTr.vanPrice = price;
                else if (isBus) existingTr.busPrice = price;
                else existingTr.carPrice = price;
                currentSelectedModalTransferVehicle = explicitVeh;
            } else if (hasMultiTiers) {
                // User edited route name without specifying (Car)/(Van)/(Bus) -> keep exact route text & update the currently edited vehicle tier price
                existingTr.name = name;
                existingTr.vehicleType = '';
                if (isVan) existingTr.vanPrice = price;
                else if (isBus) existingTr.busPrice = price;
                else existingTr.carPrice = price;
            } else {
                // Single custom transfer name without (Car)/(Van)/(Bus) -> save verbatim and stop forcing "(Car)" suffix!
                existingTr.name = name;
                existingTr.vehicleType = 'NONE';
                existingTr.carPrice = price;
                existingTr.vanPrice = null;
                existingTr.busPrice = null;
                currentSelectedModalTransferVehicle = 'custom';
            }
            existingTr.price = price;
            if (location) existingTr.location = location;
            currentSelectedModalTransferDbId = existingTr.id;
        } else {
            const newId = 'tr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
            const newTrObj = {
                id: newId,
                name: vehTagMatch ? (cleanTrName || name) : name,
                location: location,
                price: price,
                carPrice: explicitVeh === 'van' || explicitVeh === 'bus' ? null : price,
                vanPrice: explicitVeh === 'van' ? price : null,
                busPrice: explicitVeh === 'bus' ? price : null,
                vehicleType: vehTagMatch ? '' : 'NONE'
            };
            (masterDb.transfers = masterDb.transfers || []).push(newTrObj);
            currentSelectedModalTransferDbId = newTrObj.id;
            currentSelectedModalTransferVehicle = explicitVeh || 'custom';
            existingTr = newTrObj;
        }

        // Update active package transfer live when editing an item
        if (currentEditingTransferIndex !== null && availableTransfers[currentEditingTransferIndex]) {
            availableTransfers[currentEditingTransferIndex].name = name;
            availableTransfers[currentEditingTransferIndex].price = price;
            if (typeof renderTransfers === 'function') renderTransfers();
            const resultsEl = document.getElementById('results');
            if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
                calculate();
            }
            if (typeof saveState === 'function') saveState();
        }

        const synced = await saveMasterDatabaseToFirebase(silent);
        populateQuickTransferDropdown();
        populateDbDropdowns();

        const badge = document.getElementById('modalTransferMasterStatusBadge');
        if (badge) {
            if (synced) {
                badge.innerText = `✅ Synced to Cloud: ${(existingTr.name || '').substring(0, 18)}`;
                badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300';
            } else {
                badge.innerText = '⚠️ Saved Locally (Cloud Failed)';
                badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300';
            }
        }

        if (btn) {
            if (synced) {
                btn.innerHTML = `<i class="fas fa-check"></i> <span>${forceNew ? 'Added to Cloud!' : 'Saved to Cloud!'}</span>`;
                btn.className = origBtnClass.replace(/(?:hover:)?bg-(?:orange|amber)-\d+/g, '') + ' bg-green-600 hover:bg-green-700';
                setTimeout(() => {
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = origBtnHtml;
                        btn.className = origBtnClass;
                    }
                }, 2500);
            } else {
                btn.disabled = false;
                btn.innerHTML = origBtnHtml;
            }
        }

        if (applyToPackage && typeof saveTransfer === 'function') {
            await saveTransfer(currentEditingTransferIndex, false);
            if (!silent && synced) showNotification(`✅ Transfer "${name}" saved to Package & synced to Cloud!`, false);
        } else if (!silent && synced) {
            showNotification(`☁️ Transfer "${name}" successfully ${forceNew ? 'added & ' : ''}synced to Master DB & Cloud!`, false);
        }
        return synced;
    }

    async function deleteModalTransferFromMasterDb() {
        const rawName = document.getElementById('newTransferName')?.value.trim();
        const select = document.getElementById('transferDbSelect');
        let targetTransfer = null;

        if (currentSelectedModalTransferDbId) {
            targetTransfer = (masterDb.transfers || []).find(t => t.id === currentSelectedModalTransferDbId);
        }
        if (!targetTransfer && select && select.value) {
            try {
                const data = decodeDbOptionValue(select.value);
                if (data && data.id) targetTransfer = (masterDb.transfers || []).find(t => t.id === data.id);
                if (!targetTransfer && data && data.name) {
                    targetTransfer = (masterDb.transfers || []).find(t => normalizeTransferRoute(t.name) === normalizeTransferRoute(data.name));
                }
            } catch (e) {}
        }
        if (!targetTransfer && rawName) {
            targetTransfer = (masterDb.transfers || []).find(t => normalizeTransferRoute(t.name) === normalizeTransferRoute(rawName));
        }

        if (!targetTransfer) {
            showNotification("Please select a transfer linked to Master Database to delete.", true);
            return;
        }

        if (!confirm(`Are you sure you want to permanently DELETE "${targetTransfer.name}" from Master Database and Cloud?\n\nThis will remove it across all PCs.`)) {
            return;
        }

        recordDeletedMasterId('transfers', targetTransfer.id);
        const idx = masterDb.transfers.indexOf(targetTransfer);
        if (idx !== -1) {
            masterDb.transfers.splice(idx, 1);
        }
        localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
        await saveMasterDatabaseToFirebase(true);

        currentSelectedModalTransferDbId = null;
        currentSelectedModalTransferVehicle = null;
        document.getElementById('newTransferName').value = '';
        document.getElementById('newTransferPrice').value = '';
        const badge = document.getElementById('modalTransferMasterStatusBadge');
        if (badge) {
            badge.innerText = 'Deleted from DB';
            badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800';
        }

        filterTransferDbOptions(true);
        populateQuickTransferDropdown();
        populateDbDropdowns();
        updateMasterDbCounts();
        showNotification(`🗑️ Transfer "${targetTransfer.name}" permanently deleted from Master Database & Cloud!`, false);
    }

    async function quickSaveModalHotelsToMasterDb(silent = false, applyToPackage = false, forceNew = false) {
        const btn = document.getElementById(forceNew ? 'btnHotelAddNewToDb' : 'btnHotelSaveToCloud');
        const origBtnHtml = btn ? btn.innerHTML : '';
        const origBtnClass = btn ? btn.className : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Saving...</span>';
        }

        const cityName = (document.getElementById('newCityName')?.value || '').trim();
        let updatedCount = 0;

        const checkAndSaveHotel = (star, nameId, priceId, mealId, tplId) => {
            const name = (document.getElementById(nameId)?.value || '').trim();
            const price = parseFloat(document.getElementById(priceId)?.value) || 0;
            const meal = parseFloat(document.getElementById(mealId)?.value) || 0;
            const tpl = parseFloat(document.getElementById(tplId)?.value) || (star === 4 ? 1000 : (star === 5 ? 1200 : 800));
            if (!name || price < 0) return;

            let existingH = null;
            const lockedId = currentSelectedModalHotelDbIds ? currentSelectedModalHotelDbIds[star] : null;
            if (!forceNew && lockedId) {
                existingH = (masterDb.hotels || []).find(h => h.id === lockedId);
            }
            if (!forceNew && !existingH) {
                existingH = (masterDb.hotels || []).find(h => (h.name || '').trim().toLowerCase() === name.toLowerCase() && String(h.star) === String(star))
                    || (masterDb.hotels || []).find(h => (h.name || '').trim().toLowerCase() === name.toLowerCase());
            }

            if (existingH) {
                existingH.name = name;
                existingH.price = price;
                existingH.mealPrice = meal;
                existingH.tplPrice = tpl;
                if (cityName) existingH.location = cityName;
                existingH.star = String(star);
                if (currentSelectedModalHotelDbIds) currentSelectedModalHotelDbIds[star] = existingH.id;
            } else {
                const newH = {
                    id: 'h_' + Date.now() + '_' + star + '_' + Math.random().toString(36).substring(2, 5),
                    name: name,
                    location: cityName,
                    star: String(star),
                    price: price,
                    mealPrice: meal,
                    tplPrice: tpl
                };
                (masterDb.hotels = masterDb.hotels || []).push(newH);
                if (currentSelectedModalHotelDbIds) currentSelectedModalHotelDbIds[star] = newH.id;
            }
            updatedCount++;
        };

        checkAndSaveHotel(3, 'newCity3StarName', 'newCity3StarPrice', 'newCity3StarMeal', 'newCity3StarTpl');
        checkAndSaveHotel(4, 'newCity4StarName', 'newCity4StarPrice', 'newCity4StarMeal', 'newCity4StarTpl');
        checkAndSaveHotel(5, 'newCity5StarName', 'newCity5StarPrice', 'newCity5StarMeal', 'newCity5StarTpl');

        if (updatedCount > 0) {
            // Live update currently edited city in package as well
            if (currentEditingCityIndex !== null && availableCities[currentEditingCityIndex]) {
                const c = availableCities[currentEditingCityIndex];
                if (cityName) c.name = cityName;
                c.hotel3Name = (document.getElementById('newCity3StarName')?.value || '').trim();
                c.hotel3Price = parseFloat(document.getElementById('newCity3StarPrice')?.value) || 0;
                c.hotel3Meal = parseFloat(document.getElementById('newCity3StarMeal')?.value) || 0;
                c.hotel3Tpl = parseFloat(document.getElementById('newCity3StarTpl')?.value) || 800;
                c.hotel4Name = (document.getElementById('newCity4StarName')?.value || '').trim();
                c.hotel4Price = parseFloat(document.getElementById('newCity4StarPrice')?.value) || 0;
                c.hotel4Meal = parseFloat(document.getElementById('newCity4StarMeal')?.value) || 0;
                c.hotel4Tpl = parseFloat(document.getElementById('newCity4StarTpl')?.value) || 1000;
                c.hotel5Name = (document.getElementById('newCity5StarName')?.value || '').trim();
                c.hotel5Price = parseFloat(document.getElementById('newCity5StarPrice')?.value) || 0;
                c.hotel5Meal = parseFloat(document.getElementById('newCity5StarMeal')?.value) || 0;
                c.hotel5Tpl = parseFloat(document.getElementById('newCity5StarTpl')?.value) || 1200;
                if (typeof renderCities === 'function') renderCities();
                const resultsEl = document.getElementById('results');
                if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
                    calculate();
                }
                if (typeof saveState === 'function') saveState();
            }

            const synced = await saveMasterDatabaseToFirebase(silent);
            populateQuickHotelDropdown();
            populateDbDropdowns();

            if (btn) {
                if (synced) {
                    btn.innerHTML = `<i class="fas fa-check"></i> <span>${forceNew ? 'Hotels Added to Cloud!' : 'Hotels Saved to Cloud!'}</span>`;
                    btn.className = origBtnClass.replace(/(?:hover:)?bg-(?:blue|indigo)-\d+/g, '') + ' bg-green-600 hover:bg-green-700';
                    setTimeout(() => {
                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = origBtnHtml;
                            btn.className = origBtnClass;
                        }
                    }, 2500);
                } else {
                    btn.disabled = false;
                    btn.innerHTML = origBtnHtml;
                }
            }

            if (applyToPackage && typeof saveCity === 'function') {
                await saveCity(currentEditingCityIndex, false);
                if (!silent && synced) showNotification(`✅ City stay saved to Package & synced to Cloud!`, false);
            } else if (!silent && synced) {
                showNotification(`☁️ Successfully synced ${updatedCount} Hotel(s) to Master DB & Cloud!`, false);
            }
            return synced;
        } else {
            if (btn) { btn.disabled = false; btn.innerHTML = origBtnHtml; }
            if (!silent) showNotification("Please enter at least one hotel name.", true);
            return false;
        }
    }

    async function deleteModalHotelFromMasterDb(star) {
        const select = document.getElementById(`city${star}StarDbSelect`);
        const nameInput = document.getElementById(`newCity${star}StarName`);
        let targetHotel = null;

        if (currentSelectedModalHotelDbIds && currentSelectedModalHotelDbIds[star]) {
            targetHotel = (masterDb.hotels || []).find(h => h.id === currentSelectedModalHotelDbIds[star]);
        }
        if (!targetHotel && select && select.value) {
            try {
                const data = decodeDbOptionValue(select.value);
                if (data && data.id) targetHotel = (masterDb.hotels || []).find(h => h.id === data.id);
                if (!targetHotel && data && data.name) {
                    targetHotel = (masterDb.hotels || []).find(h => h.name.toLowerCase() === data.name.toLowerCase() && (!star || Number(h.star) === Number(star)));
                }
            } catch (e) {}
        }
        if (!targetHotel && nameInput && nameInput.value.trim()) {
            const rawName = nameInput.value.trim().toLowerCase();
            targetHotel = (masterDb.hotels || []).find(h => h.name.toLowerCase() === rawName && (!star || Number(h.star) === Number(star)));
        }

        if (!targetHotel) {
            showNotification(`Please select a ${star}* hotel from the dropdown to delete.`, true);
            return;
        }

        if (!confirm(`Are you sure you want to permanently DELETE "${targetHotel.name}" (${star}*) from Master Database and Cloud?\n\nThis will remove it across all PCs.`)) {
            return;
        }

        recordDeletedMasterId('hotels', targetHotel.id);
        const idx = masterDb.hotels.indexOf(targetHotel);
        if (idx !== -1) {
            masterDb.hotels.splice(idx, 1);
        }
        localStorage.setItem(MASTER_DB_STORAGE_KEY, JSON.stringify(masterDb));
        await saveMasterDatabaseToFirebase(true);

        if (currentSelectedModalHotelDbIds) currentSelectedModalHotelDbIds[star] = null;
        if (nameInput) nameInput.value = '';
        const priceInput = document.getElementById(`newCity${star}StarPrice`);
        if (priceInput) priceInput.value = '';
        const mealInput = document.getElementById(`newCity${star}StarMeal`);
        if (mealInput) mealInput.value = '';

        filterHotelDbOptions(3);
        filterHotelDbOptions(4);
        filterHotelDbOptions(5);
        populateQuickHotelDropdown();
        populateDbDropdowns();
        updateMasterDbCounts();
        showNotification(`🗑️ Hotel "${targetHotel.name}" (${star}*) permanently deleted from Master Database & Cloud!`, false);
    }

    function fillHotelFromDb(star) {
        const select = document.getElementById('city' + star + 'StarDbSelect');
        if (!select.value) return;
        try {
            const data = decodeDbOptionValue(select.value);
            if (!data) return;
            if (currentSelectedModalHotelDbIds) currentSelectedModalHotelDbIds[star] = data.id || null;
            document.getElementById('newCity' + star + 'StarName').value = data.name;
            document.getElementById('newCity' + star + 'StarPrice').value = data.price;
            document.getElementById('newCity' + star + 'StarMeal').value = data.meal;
            if (data.tplPrice !== undefined && data.tplPrice !== null) {
                document.getElementById('newCity' + star + 'StarTpl').value = data.tplPrice;
            } else {
                document.getElementById('newCity' + star + 'StarTpl').value = (star === 4 ? 1000 : (star === 5 ? 1200 : 800));
            }
        } catch (e) {}
    }
