    // ══════════════════════════════════════════════════════════════
    // INQ QUOTATION HUB & CLOUD ARCHIVE ENGINE
    // ══════════════════════════════════════════════════════════════
    const SLW_INQ_INDEX_STORAGE_KEY = 'SLW_INQ_QUOTATION_INDEX';
    const SLW_INQ_DOC_PREFIX = 'SLW_INQ_DOC_';
    let inqQuotationIndex = [];
    let activeHubFilterCategory = 'all';
    let activeLoadedInqKey = null;
    let activeLoadedInqData = null;
    let activeLoadedPackageId = null;
    let activeLoadedPackageName = null;

    function updateActiveInqBanner() {
        const banner = document.getElementById('activeInqEditBanner');
        if (!banner) return;
        if (activeLoadedInqKey && activeLoadedInqData) {
            banner.classList.remove('hidden');
            const keyEl = document.getElementById('activeInqBannerKey');
            const clientEl = document.getElementById('activeInqBannerClient');
            const paxEl = document.getElementById('activeInqBannerPax');
            const titleEl = document.getElementById('activeInqBannerTitle');
            if (keyEl) keyEl.innerText = activeLoadedInqKey;
            if (clientEl) clientEl.innerText = activeLoadedInqData.clientName || 'Client';
            if (paxEl) paxEl.innerText = activeLoadedInqData.paxText || '2 Pax';
            
            let statusText = (activeLoadedInqData.title ? activeLoadedInqData.title + ' • ' : '') + 'Modify prices or services below. Click "Update Quotation" to save changes.';
            if (activeLoadedPackageName) {
                statusText = `📦 Current Active Option: [${activeLoadedPackageName}] • ` + statusText;
            }
            if (titleEl) titleEl.innerText = statusText;

            // Render package switcher pills if multi-package
            let pkgRow = document.getElementById('activeInqBannerPackagesList');
            if (!pkgRow) {
                pkgRow = document.createElement('div');
                pkgRow.id = 'activeInqBannerPackagesList';
                pkgRow.className = 'flex items-center gap-1.5 mt-2 flex-wrap';
                const textContainer = keyEl ? keyEl.closest('.min-w-0') : null;
                if (textContainer) textContainer.appendChild(pkgRow);
            }

            const pkgs = Array.isArray(activeLoadedInqData.packages) ? activeLoadedInqData.packages : [];
            if (pkgs.length > 1) {
                pkgRow.style.display = 'flex';
                pkgRow.innerHTML = `
                    <span class="text-[11px] font-black text-amber-300 flex items-center gap-1"><i class="fas fa-boxes"></i> Package Options (${pkgs.length}):</span>
                    ${pkgs.map((p, idx) => {
                        const isCur = (p.id === activeLoadedPackageId) || (!activeLoadedPackageId && idx === 0);
                        const pName = p.packageName || ('Option ' + (idx + 1));
                        const pNameEsc = pName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        return `
                            <div class="inline-flex items-center rounded-full text-xs font-bold transition ${isCur ? 'bg-amber-400 text-indigo-950 shadow-sm ring-2 ring-white/60 font-black' : 'bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 hover:text-white border border-indigo-400/40'} overflow-hidden">
                                <button onclick="loadInqQuotationIntoCosting('${activeLoadedInqKey}', '${p.id}')" class="px-2.5 py-0.5 flex items-center gap-1">
                                    ${isCur ? '<i class="fas fa-check-circle text-[10px]"></i>' : '<span>📦</span>'}
                                    <span class="truncate max-w-[140px]">${pName}</span>
                                </button>
                                <button onclick="event.stopPropagation(); deleteInqPackageOption('${activeLoadedInqKey}', '${p.id}', '${pNameEsc}')" class="px-1.5 py-0.5 ${isCur ? 'hover:bg-red-600 hover:text-white text-indigo-950' : 'hover:bg-red-600 hover:text-white text-indigo-300'} transition" title="Delete ${pName}">
                                    <i class="fas fa-times text-[10px]"></i>
                                </button>
                            </div>
                        `;
                    }).join('')}
                    <button onclick="openSaveQuotationModal()" class="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20 hover:bg-white/30 text-amber-200 border border-amber-300/50 transition flex items-center gap-1" title="Add another package option under this INQ">
                        <i class="fas fa-plus text-[10px]"></i> Add Option
                    </button>
                `;
            } else if (pkgRow) {
                pkgRow.style.display = 'none';
            }
        } else {
            banner.classList.add('hidden');
        }
    }

    function clearActiveLoadedInq() {
        activeLoadedInqKey = null;
        activeLoadedInqData = null;
        activeLoadedPackageId = null;
        activeLoadedPackageName = null;
        updateActiveInqBanner();
        showNotification('ℹ️ Exited quotation editing mode. You can now create a new quotation.', false);
    }

    function switchToNewInqMode() {
        activeLoadedInqKey = null;
        activeLoadedInqData = null;
        activeLoadedPackageId = null;
        activeLoadedPackageName = null;
        updateActiveInqBanner();

        const titleEl = document.getElementById('saveQuotationModalTitle');
        if (titleEl) titleEl.innerHTML = '<i class="fas fa-file-invoice-dollar text-indigo-600"></i> Save as INQ Quotation';
        const subEl = document.getElementById('saveQuotationModalSubtitle');
        if (subEl) subEl.innerText = 'Saves complete costing calculations and itinerary to Cloud & Local Storage';

        const btnSwitch = document.getElementById('btnSwitchNewInq');
        if (btnSwitch) btnSwitch.style.display = 'none';

        const btnSubmit = document.getElementById('btnSaveQuotationSubmit');
        if (btnSubmit) {
            const span = btnSubmit.querySelector('span');
            if (span) span.innerText = 'Save Quotation';
            else btnSubmit.innerText = 'Save Quotation';
        }

        const inqInput = document.getElementById('saveQuotationInqInput');
        if (inqInput) inqInput.value = 'INQ-' + Math.floor(10000 + Math.random() * 90000);
        showNotification('Switched to New Quotation mode. Generated new Inquiry Reference.', false);
    }

    async function initInqQuotationHub() {
        // 1. Load from local cache first (0ms, 0 reads)
        try {
            const localRaw = localStorage.getItem(SLW_INQ_INDEX_STORAGE_KEY) || localStorage.getItem('slw_quotation_index');
            if (localRaw) {
                inqQuotationIndex = JSON.parse(localRaw) || [];
            }
        } catch(e) {
            console.warn("Failed reading local quotation index:", e);
            inqQuotationIndex = [];
        }

        updateQuotationHubCountBadge();
        updateQuotationStorageStats();

        // 2. Sync from Firebase Cloud
        try {
            await syncInqQuotationsFromCloud(false);
        } catch (err) {
            console.warn("Initial cloud quotation index sync error:", err);
        }

        // 3. Sync learned AI rules from Firebase Cloud (slw_settings/learned_patterns)
        if (window.SlwLearningEngine && typeof window.SlwLearningEngine.syncWithCloud === 'function' && typeof db !== 'undefined' && db) {
            window.SlwLearningEngine.syncWithCloud(db).catch(err => {
                console.warn("Learning Engine cloud sync error:", err);
            });
        }
    }

    function updateQuotationHubCountBadge() {
        const count = inqQuotationIndex.length;
        const badge = document.getElementById('quotationHubCountBadge');
        if (badge) badge.innerText = String(count);
    }

    function getQuotationStorageUsage() {
        const items = inqQuotationIndex || [];
        let totalBytes = 0;
        items.forEach(item => {
            totalBytes += (item.sizeBytes || 16000); // Average 16KB per doc
        });
        const kb = (totalBytes / 1024).toFixed(1);
        const mb = (totalBytes / (1024 * 1024)).toFixed(2);
        const maxMb = 1024; // 1 GB free Firestore Spark plan
        const pctNum = (totalBytes / (1024 * 1024 * 1024)) * 100;
        const pct = pctNum < 0.01 && items.length > 0 ? '0.01%' : pctNum.toFixed(2) + '%';
        const barWidth = Math.max(1, Math.min(100, Math.round(pctNum)));

        return {
            count: items.length,
            totalBytes,
            kb,
            mb,
            maxMb,
            pct,
            barWidth
        };
    }

    function updateQuotationStorageStats() {
        const stats = getQuotationStorageUsage();
        
        const countText = document.getElementById('hubStatCountText');
        if (countText) countText.innerText = String(stats.count);

        const storageText = document.getElementById('hubStatStorageText');
        if (storageText) {
            if (parseFloat(stats.mb) >= 1) {
                storageText.innerText = '~' + stats.mb + ' MB';
            } else {
                storageText.innerText = '~' + stats.kb + ' KB';
            }
        }

        const pctText = document.getElementById('hubStatPercentText');
        if (pctText) pctText.innerText = stats.pct;

        const bar = document.getElementById('hubStatStorageBar');
        if (bar) bar.style.width = stats.barWidth + '%';
    }

    async function syncInqQuotationsFromCloud(force = false) {
        const badge = document.getElementById('hubCloudBadge');
        const badgeText = document.getElementById('hubCloudBadgeText');
        if (badgeText) badgeText.innerText = 'Syncing...';

        try {
            if (typeof db !== 'undefined' && db) {
                const doc = await db.collection('slw_settings').doc('quotation_index').get();
                let remoteItems = [];
                if (doc.exists) {
                    const data = doc.data();
                    remoteItems = data.items || [];
                }

                // If remoteItems is empty, fallback to querying slw_quotations collection directly
                if (remoteItems.length === 0) {
                    try {
                        const colSnap = await db.collection('slw_quotations').limit(100).get();
                        if (!colSnap.empty) {
                            colSnap.forEach(d => {
                                const q = d.data();
                                if (q && q.inq) {
                                    remoteItems.push({
                                        inq: q.inq,
                                        clientName: q.clientName || '.',
                                        clientPhone: q.clientPhone || '',
                                        title: q.title || 'Tour Quotation',
                                        date: q.date || q.quotationDate || '',
                                        quotationDate: q.quotationDate || q.date || '',
                                        travelMonth: q.travelMonth || '',
                                        travelYear: q.travelYear || '',
                                        travelMonthDate: q.travelMonthDate || '',
                                        paxText: q.paxText || '',
                                        cities: Array.isArray(q.packages) && q.packages[0]?.cities ? q.packages[0].cities.map(c => `${c.numberOfNights}N ${c.name}`).join(' + ') : (q.cities || ''),
                                        rates: q.packages && q.packages[0]?.rates ? q.packages[0].rates : (q.rates || {}),
                                        sizeBytes: q.sizeBytes || 12000,
                                        updatedAt: q.updatedAt || q.date || new Date().toISOString(),
                                        googleSheetUrl: q.googleSheetUrl || null,
                                        packagesCount: Array.isArray(q.packages) ? q.packages.length : 1
                                    });
                                }
                            });
                        }
                    } catch(colErr) {
                        console.warn("Collection fallback error:", colErr);
                    }
                }

                if (remoteItems.length > 0 || inqQuotationIndex.length > 0) {
                    // Merge local and remote index by INQ key, favoring newer updatedAt
                    const itemMap = new Map();
                    inqQuotationIndex.forEach(item => {
                        if (item.inq) itemMap.set(item.inq.toUpperCase().trim(), item);
                    });
                    remoteItems.forEach(item => {
                        if (item.inq) {
                            const key = item.inq.toUpperCase().trim();
                            const existing = itemMap.get(key);
                            if (!existing || !existing.updatedAt || (item.updatedAt && new Date(item.updatedAt) >= new Date(existing.updatedAt))) {
                                itemMap.set(key, item);
                            }
                        }
                    });

                    inqQuotationIndex = Array.from(itemMap.values()).sort((a, b) => {
                        const dateB = new Date(b.updatedAt || b.date || 0);
                        const dateA = new Date(a.updatedAt || a.date || 0);
                        return dateB - dateA;
                    });

                    localStorage.setItem(SLW_INQ_INDEX_STORAGE_KEY, JSON.stringify(inqQuotationIndex));
                    localStorage.setItem('slw_quotation_index', JSON.stringify(inqQuotationIndex));
                    updateQuotationHubCountBadge();
                    updateQuotationStorageStats();
                    renderQuotationHubCards();

                    if (badge) badge.className = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 border border-green-200 shadow-2xs";
                    if (badgeText) badgeText.innerHTML = '<i class="fas fa-cloud text-green-600"></i> Cloud Synced';

                    if (force) {
                        showNotification('☁️ Successfully synced ' + inqQuotationIndex.length + ' Quotations from Firebase Cloud!', false);
                    }
                    return true;
                }
            }
        } catch(e) {
            console.warn("Quotation Cloud sync warning:", e);
            if (badge) badge.className = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs";
            if (badgeText) badgeText.innerHTML = '<i class="fas fa-database text-amber-600"></i> Local Cache';
            if (force) {
                showNotification("⚠️ Working in offline/local mode: " + e.message, true);
            }
        }

        renderQuotationHubCards();
        return false;
    }

    function openQuotationHubModal() {
        updateQuotationStorageStats();
        renderQuotationHubCards();
        openModal('quotationHubModal');
        // Auto-sync from cloud if list is empty
        if (!inqQuotationIndex || inqQuotationIndex.length === 0) {
            syncInqQuotationsFromCloud(false);
        }
        // Auto-focus search input
        setTimeout(() => {
            const inp = document.getElementById('hubSearchInput');
            if (inp) inp.focus();
        }, 150);
    }

    function generateNewInqNumber() {
        const rand5 = Math.floor(10000 + Math.random() * 90000);
        const inp = document.getElementById('saveQuotationInqInput');
        if (inp) {
            inp.value = 'INQ-' + rand5;
            checkSaveQuotationInqPackages(inp.value);
        }
    }

    function parseTravelMonthYear(str) {
        if (!str) return null;
        str = String(str).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const d = new Date(str);
            if (!isNaN(d.getTime())) {
                return { month: d.toLocaleString('en-US', { month: 'short' }), year: String(d.getFullYear()) };
            }
        }
        const yearMatch = str.match(/(20\d{2})/);
        const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());
        let monthPart = str.replace(/(20\d{2})/, '').replace(/[\/\-_]/g, ' ').trim();
        monthPart = monthPart.replace(/\s+/g, '-');
        if (!monthPart) monthPart = 'Jan';
        return { month: monthPart, year: year };
    }

    function updateTravelMonthYearPreview() {
        const monthInp = document.getElementById('saveQuotationTravelMonthInput');
        const yearInp = document.getElementById('saveQuotationTravelYearInput');
        const badge = document.getElementById('saveQuotationTravelPreviewBadge');

        let m = (monthInp?.value || '').trim();
        let y = (yearInp?.value || '').trim();
        if (!y) y = String(new Date().getFullYear());

        let combined = '';
        if (m && y) {
            if (/\d{4}/.test(m)) {
                combined = m.replace('/', '-');
            } else {
                combined = `${m}-${y}`;
            }
        } else if (m) {
            combined = m;
        } else {
            combined = `${new Date().toLocaleString('en-US', { month: 'short' })}-${y}`;
        }

        if (badge) badge.innerText = combined;
        const exportDateInp = document.getElementById('exportItineraryDate');
        if (exportDateInp) exportDateInp.value = combined;
        return combined;
    }

    function checkSaveQuotationInqPackages(rawInq) {
        const inqKey = (rawInq || '').trim().toUpperCase().replace(/\s+/g, '-');
        const existingBox = document.getElementById('saveQuotationExistingPackagesBox');
        const badge = document.getElementById('saveQuotationPackageCountBadge');
        const nameInput = document.getElementById('saveQuotationPackageNameInput');
        const selectExisting = document.getElementById('saveQuotationSelectExistingPackage');
        const radioNew = document.getElementById('savePackageModeNew');
        const titleInput = document.getElementById('saveQuotationTitleInput');

        const defaultTitle = titleInput?.value.trim() || 'Tour Option';

        let existingDoc = null;
        try {
            const raw = localStorage.getItem(SLW_INQ_DOC_PREFIX + inqKey);
            if (raw) existingDoc = JSON.parse(raw);
        } catch(e) {}

        let pkgs = [];
        if (existingDoc) {
            if (Array.isArray(existingDoc.packages) && existingDoc.packages.length > 0) {
                pkgs = existingDoc.packages;
            } else if (existingDoc.costing) {
                pkgs = [{
                    id: 'pkg_1',
                    packageName: existingDoc.packageName || ('Option 1: ' + (existingDoc.title || 'Standard Package')),
                    title: existingDoc.title || 'Standard Package'
                }];
            }
        }

        if (pkgs.length > 0) {
            if (existingBox) existingBox.style.display = 'block';
            if (badge) badge.innerText = `Option ${pkgs.length + 1} (${pkgs.length} saved)`;
            if (radioNew) radioNew.checked = true;
            toggleSavePackageMode();

            // Populate overwrite dropdown
            if (selectExisting) {
                selectExisting.innerHTML = pkgs.map((p, idx) => 
                    `<option value="${p.id || ('pkg_' + (idx + 1))}">${p.packageName || ('Option ' + (idx + 1) + ': ' + (p.title || 'Tour'))}</option>`
                ).join('');
            }

            if (nameInput) {
                nameInput.value = `Option ${pkgs.length + 1}: ${defaultTitle}`;
            }
        } else {
            if (existingBox) existingBox.style.display = 'none';
            if (badge) badge.innerText = 'Option 1';
            if (nameInput) {
                nameInput.value = `Option 1: ${defaultTitle}`;
            }
        }
    }

    function toggleSavePackageMode() {
        const isOverwrite = Boolean(document.getElementById('savePackageModeOverwrite')?.checked);
        const isNewInq = Boolean(document.getElementById('savePackageModeNewInq')?.checked);
        const overwriteRow = document.getElementById('saveQuotationOverwriteDropdownRow');
        const newInqRow = document.getElementById('saveQuotationNewInqDetailsRow');
        const nameInput = document.getElementById('saveQuotationPackageNameInput');
        const selectExisting = document.getElementById('saveQuotationSelectExistingPackage');
        const inqInput = document.getElementById('saveQuotationInqInput');
        const newInqInput = document.getElementById('saveQuotationNewInqInput');
        const btnSubmit = document.getElementById('btnSaveQuotationSubmit');

        if (overwriteRow) overwriteRow.style.display = isOverwrite ? 'block' : 'none';
        if (newInqRow) newInqRow.style.display = isNewInq ? 'block' : 'none';

        if (isNewInq) {
            if (newInqInput && (!newInqInput.value || newInqInput.value === activeLoadedInqKey)) {
                newInqInput.value = 'INQ-' + Math.floor(10000 + Math.random() * 90000);
            }
            if (inqInput && newInqInput) {
                inqInput.value = newInqInput.value;
            }
            const targetInq = (newInqInput && newInqInput.value) ? newInqInput.value : 'New INQ';
            if (btnSubmit) {
                const span = btnSubmit.querySelector('span');
                if (span) span.innerText = `Save as New Quotation (${targetInq})`;
                else btnSubmit.innerText = `Save as New Quotation (${targetInq})`;
            }
            const titleVal = document.getElementById('saveQuotationTitleInput')?.value.trim() || 'Tour Package';
            if (nameInput) nameInput.value = 'Option 1: ' + titleVal;
        } else if (isOverwrite) {
            if (inqInput && activeLoadedInqKey) inqInput.value = activeLoadedInqKey;
            if (selectExisting && selectExisting.options.length > 0) {
                const selectedText = selectExisting.options[selectExisting.selectedIndex].text;
                if (nameInput) nameInput.value = selectedText;
            }
            if (btnSubmit && activeLoadedInqKey) {
                const span = btnSubmit.querySelector('span');
                if (span) span.innerText = `Update Quotation (${activeLoadedInqKey})`;
                else btnSubmit.innerText = `Update Quotation (${activeLoadedInqKey})`;
            }
        } else {
            if (inqInput && activeLoadedInqKey) inqInput.value = activeLoadedInqKey;
            if (btnSubmit && activeLoadedInqKey) {
                const span = btnSubmit.querySelector('span');
                if (span) span.innerText = `Update Quotation (${activeLoadedInqKey})`;
                else btnSubmit.innerText = `Update Quotation (${activeLoadedInqKey})`;
            }
            if (activeLoadedInqData && Array.isArray(activeLoadedInqData.packages)) {
                const nextOptNum = activeLoadedInqData.packages.length + 1;
                const titleVal = document.getElementById('saveQuotationTitleInput')?.value.trim() || 'Tour Package';
                if (nameInput) nameInput.value = `Option ${nextOptNum}: ` + titleVal;
            }
        }
    }

    function generateNewInqNumberForNewMode() {
        const freshInq = 'INQ-' + Math.floor(10000 + Math.random() * 90000);
        const newInqInput = document.getElementById('saveQuotationNewInqInput');
        const inqInput = document.getElementById('saveQuotationInqInput');
        if (newInqInput) newInqInput.value = freshInq;
        if (inqInput) inqInput.value = freshInq;
        const btnSubmit = document.getElementById('btnSaveQuotationSubmit');
        if (btnSubmit) {
            const span = btnSubmit.querySelector('span');
            if (span) span.innerText = `Save as New Quotation (${freshInq})`;
            else btnSubmit.innerText = `Save as New Quotation (${freshInq})`;
        }
    }

    function onNewInqInputChanged(val) {
        const inqInput = document.getElementById('saveQuotationInqInput');
        if (inqInput) inqInput.value = val;
        const btnSubmit = document.getElementById('btnSaveQuotationSubmit');
        if (btnSubmit) {
            const span = btnSubmit.querySelector('span');
            const displayInq = val.trim() || 'New INQ';
            if (span) span.innerText = `Save as New Quotation (${displayInq})`;
            else btnSubmit.innerText = `Save as New Quotation (${displayInq})`;
        }
    }

    function triggerSaveAsNewInq() {
        const radioNewInq = document.getElementById('savePackageModeNewInq');
        if (radioNewInq) {
            radioNewInq.checked = true;
            toggleSavePackageMode();
        }
        const newInqInput = document.getElementById('saveQuotationNewInqInput');
        const targetInq = newInqInput ? newInqInput.value : ('INQ-' + Math.floor(10000 + Math.random() * 90000));
        const clientName = document.getElementById('saveQuotationClientInput')?.value || 'Client';

        const ok = confirm(`Save this costing as a BRAND NEW inquiry [${targetInq}] for ${clientName}?\n\n• Existing quotation [${activeLoadedInqKey}] will remain untouched.\n• Click OK to save now, or Cancel to review details in the form first.`);
        if (ok) {
            executeSaveQuotation(false);
        } else {
            newInqInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            newInqInput?.focus();
            newInqInput?.select();
        }
    }

    function onSelectExistingPackageToOverwrite() {
        const selectExisting = document.getElementById('saveQuotationSelectExistingPackage');
        const nameInput = document.getElementById('saveQuotationPackageNameInput');
        if (selectExisting && nameInput && selectExisting.options.length > 0) {
            nameInput.value = selectExisting.options[selectExisting.selectedIndex].text;
        }
    }

    function openSaveQuotationModal(fromExport = false) {
        // 1. Ensure current calculation is fresh
        calculate();

        // 2. Determine default values
        let defaultTitle = '';
        if (activeLoadedPresetKey && costingPresets[activeLoadedPresetKey] && costingPresets[activeLoadedPresetKey].title) {
            defaultTitle = costingPresets[activeLoadedPresetKey].title.trim();
        } else if (availableCities.length > 0) {
            const parts = availableCities.map(c => (c.numberOfNights || 1) + 'N ' + c.name);
            defaultTitle = parts.join(' ');
        } else {
            defaultTitle = 'Thailand Tour Package';
        }

        const rawPax = Number(document.getElementById('num_people_transfer')?.value) || Number(document.getElementById('num_people_hotel')?.value) || 2;
        const defaultPaxText = String(rawPax).padStart(2, '0') + ' Pax';

        // 3. Modal Elements & Dynamic Mode (Update vs New)
        const modalTitle = document.getElementById('saveQuotationModalTitle');
        const modalSubtitle = document.getElementById('saveQuotationModalSubtitle');
        const btnSwitchNew = document.getElementById('btnSwitchNewInq');
        const btnSubmit = document.getElementById('btnSaveQuotationSubmit');

        const inqInput = document.getElementById('saveQuotationInqInput');
        const clientInput = document.getElementById('saveQuotationClientInput');
        const phoneInput = document.getElementById('saveQuotationPhoneInput');
        const titleInput = document.getElementById('saveQuotationTitleInput');
        const dateInput = document.getElementById('saveQuotationDateInput');
        const paxInput = document.getElementById('saveQuotationPaxInput');
        const monthInput = document.getElementById('saveQuotationTravelMonthInput');
        const yearInput = document.getElementById('saveQuotationTravelYearInput');

        // Check if export modal already has values
        const exportInq = document.getElementById('exportItineraryInq')?.value.trim();
        const exportClient = document.getElementById('exportItineraryClient')?.value.trim();
        const exportTitle = document.getElementById('exportItineraryTitle')?.value.trim();
        const exportDate = document.getElementById('exportItineraryDate')?.value.trim();

        if (activeLoadedInqKey && activeLoadedInqData) {
            if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-edit text-amber-500"></i> Update Quotation: ${activeLoadedInqKey}`;
            if (modalSubtitle) modalSubtitle.innerText = 'Overwrites and updates this quotation with your modified prices, tours, and services';
            if (btnSwitchNew) btnSwitchNew.style.display = 'inline-flex';
            const btnSaveNewDirect = document.getElementById('btnSaveAsNewInqDirect');
            if (btnSaveNewDirect) btnSaveNewDirect.style.display = 'inline-flex';
            const curInqBadge = document.getElementById('saveQuotationCurrentInqBadge');
            if (curInqBadge) curInqBadge.innerText = activeLoadedInqKey;

            const radioNewOpt = document.getElementById('savePackageModeNew');
            if (radioNewOpt) radioNewOpt.checked = true;
            const newInqDetails = document.getElementById('saveQuotationNewInqDetailsRow');
            if (newInqDetails) newInqDetails.style.display = 'none';

            if (btnSubmit) {
                const s = btnSubmit.querySelector('span');
                if (s) s.innerText = `Update Quotation (${activeLoadedInqKey})`;
                else btnSubmit.innerText = `Update Quotation (${activeLoadedInqKey})`;
            }

            if (inqInput) inqInput.value = activeLoadedInqKey;
            if (clientInput) clientInput.value = activeLoadedInqData.clientName || exportClient || '';
            if (phoneInput) phoneInput.value = activeLoadedInqData.clientPhone || '';
            if (titleInput) titleInput.value = activeLoadedInqData.title || exportTitle || defaultTitle;
            if (dateInput) dateInput.value = activeLoadedInqData.quotationDate || activeLoadedInqData.date || new Date().toISOString().split('T')[0];
            if (paxInput) paxInput.value = activeLoadedInqData.paxText || defaultPaxText;

            // Travel Month & Year
            let tMonth = activeLoadedInqData.travelMonth || '';
            let tYear = activeLoadedInqData.travelYear || '';
            if (!tMonth || !tYear) {
                const parsed = parseTravelMonthYear(activeLoadedInqData.travelMonthDate || activeLoadedInqData.itinerary?.date || activeLoadedInqData.date || exportDate);
                if (parsed) {
                    if (!tMonth) tMonth = parsed.month;
                    if (!tYear) tYear = parsed.year;
                }
            }
            if (!tMonth) tMonth = 'Jan';
            if (!tYear) tYear = '2027';
            if (monthInput) monthInput.value = tMonth;
            if (yearInput) yearInput.value = tYear;
            updateTravelMonthYearPreview();
        } else {
            if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-file-invoice-dollar text-indigo-600"></i> Save as INQ Quotation`;
            if (modalSubtitle) modalSubtitle.innerText = 'Saves complete costing calculations and itinerary to Cloud & Local Storage';
            if (btnSwitchNew) btnSwitchNew.style.display = 'none';
            const btnSaveNewDirectElse = document.getElementById('btnSaveAsNewInqDirect');
            if (btnSaveNewDirectElse) btnSaveNewDirectElse.style.display = 'none';
            const newInqDetailsElse = document.getElementById('saveQuotationNewInqDetailsRow');
            if (newInqDetailsElse) newInqDetailsElse.style.display = 'none';
            if (btnSubmit) {
                const s = btnSubmit.querySelector('span');
                if (s) s.innerText = 'Save Quotation';
                else btnSubmit.innerText = 'Save Quotation';
            }

            if (inqInput) inqInput.value = exportInq || ('INQ-' + Math.floor(10000 + Math.random() * 90000));
            if (clientInput) clientInput.value = exportClient || '';
            if (phoneInput) phoneInput.value = '';
            if (titleInput) titleInput.value = exportTitle || defaultTitle;
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
            if (paxInput) paxInput.value = defaultPaxText;

            let parsedExport = parseTravelMonthYear(exportDate);
            let defMonth = parsedExport ? parsedExport.month : 'Jan';
            let defYear = parsedExport ? parsedExport.year : '2027';
            if (monthInput) monthInput.value = defMonth;
            if (yearInput) yearInput.value = defYear;
            updateTravelMonthYearPreview();
        }

        // 4. Update preview counts and rates
        const countsEl = document.getElementById('saveQuotationPreviewCounts');
        if (countsEl) {
            countsEl.innerText = availableCities.length + ' Cities • ' + availableTours.length + ' Tours • ' + availableTransfers.length + ' Transfers';
        }

        const p3 = document.getElementById('adult_final_lkr_3star')?.innerText || 'LKR 0';
        const pMix = document.getElementById('adult_final_lkr_mix')?.innerText || '-';
        const p4 = document.getElementById('adult_final_lkr_4star')?.innerText || 'LKR 0';

        const prev3 = document.getElementById('savePreviewPrice3');
        if (prev3) prev3.innerText = 'LKR ' + cleanLkrNumber(p3);
        const prevMix = document.getElementById('savePreviewPriceMix');
        if (prevMix) prevMix.innerText = pMix !== '-' ? ('LKR ' + cleanLkrNumber(pMix)) : '-';
        const prev4 = document.getElementById('savePreviewPrice4');
        if (prev4) prev4.innerText = 'LKR ' + cleanLkrNumber(p4);

        if (fromExport) {
            closeModal('itineraryExportModal');
        }

        // 5. Initialize Multi-Package detection for this INQ
        checkSaveQuotationInqPackages(inqInput ? inqInput.value : '');

        openModal('saveQuotationModal');
        setTimeout(() => {
            const clientInp = document.getElementById('saveQuotationClientInput');
            if (clientInp && !clientInp.value) clientInp.focus();
        }, 150);
    }

    async function executeSaveQuotation(andOpenItinerary = false) {
        const isNewInqMode = Boolean(document.getElementById('savePackageModeNewInq')?.checked);
        let inqRaw = '';
        if (isNewInqMode) {
            inqRaw = (document.getElementById('saveQuotationNewInqInput')?.value || document.getElementById('saveQuotationInqInput')?.value || '').trim().toUpperCase();
            if (!inqRaw || inqRaw === activeLoadedInqKey) {
                inqRaw = 'INQ-' + Math.floor(10000 + Math.random() * 90000);
            }
        } else {
            inqRaw = (document.getElementById('saveQuotationInqInput')?.value || '').trim().toUpperCase();
        }

        const clientName = (document.getElementById('saveQuotationClientInput')?.value || '').trim();
        const clientPhone = (document.getElementById('saveQuotationPhoneInput')?.value || '').trim();
        const title = (document.getElementById('saveQuotationTitleInput')?.value || '').trim() || 'Tour Quotation';
        const date = document.getElementById('saveQuotationDateInput')?.value || new Date().toISOString().split('T')[0];
        const travelMonth = (document.getElementById('saveQuotationTravelMonthInput')?.value || '').trim() || 'Jan';
        const travelYear = (document.getElementById('saveQuotationTravelYearInput')?.value || '').trim() || '2027';
        const travelMonthDate = updateTravelMonthYearPreview();
        const paxText = (document.getElementById('saveQuotationPaxInput')?.value || '').trim() || '02 Pax';
        const syncCloud = document.getElementById('saveQuotationCloudSyncCheck')?.checked ?? true;

        // Multi-package options
        const packageName = (document.getElementById('saveQuotationPackageNameInput')?.value || '').trim() || (isNewInqMode ? ('Option 1: ' + title) : (title || 'Package Option'));
        const isOverwriteMode = isNewInqMode ? false : Boolean(document.getElementById('savePackageModeOverwrite')?.checked);
        const selectedExistingPkgId = isNewInqMode ? '' : (document.getElementById('saveQuotationSelectExistingPackage')?.value || '').trim();

        if (!inqRaw) {
            alert("Please enter a valid Inquiry Reference (e.g. 58291 or INQ-58291).");
            return;
        }
        if (!clientName) {
            alert("Please enter the client's name.");
            return;
        }

        // Standardize INQ key (keep clean alphanumeric + hyphens)
        function slwNormalizeInqKey(k) {
            if (!k) return '';
            let s = String(k).trim();
            s = s.replace(/\s*-\s*/g, '-');
            s = s.replace(/\s+/g, '-');
            s = s.replace(/-+/g, '-');
            return s;
        }
        const inqKey = slwNormalizeInqKey(inqRaw);

        // Submit button loading state
        const btn = document.getElementById('btnSaveQuotationSubmit');
        const origBtnText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Saving...';
        }

        try {
            // 1. Recalculate and capture full costing state & adjustments
            calculate();
            const pricingAdj = captureAllPricingAdjustments();
            const itineraryPayload = buildItineraryJsonPayload();
            itineraryPayload.inq = inqKey;
            itineraryPayload.clientName = clientName;
            itineraryPayload.title = title;
            itineraryPayload.packageName = packageName;
            itineraryPayload.date = travelMonthDate;
            itineraryPayload.quotationDate = date;
            itineraryPayload.travelMonth = travelMonth;
            itineraryPayload.travelYear = travelYear;
            itineraryPayload.travelMonthDate = travelMonthDate;

            const pricingSummary = saveLatestCostingPrices(itineraryPayload);

            // Rate values
            const includeChildExtraBed = document.getElementById('check_child_extra_bed')?.checked ?? false;
            const includeChildSharingBed = document.getElementById('check_child_sharing_bed')?.checked ?? false;
            const hasChildPrices = (includeChildExtraBed || includeChildSharingBed);

            const p3Text = document.getElementById('adult_final_lkr_3star')?.innerText || '';
            const pMixText = document.getElementById('adult_final_lkr_mix')?.innerText || '';
            const p4Text = document.getElementById('adult_final_lkr_4star')?.innerText || '';
            const p5Text = document.getElementById('adult_final_lkr_5star')?.innerText || '';

            const rates = {
                p3: p3Text ? cleanLkrNumber(p3Text) : '',
                pMix: pMixText ? cleanLkrNumber(pMixText) : '',
                p4: p4Text ? cleanLkrNumber(p4Text) : '',
                p5: p5Text ? cleanLkrNumber(p5Text) : '',
                childExtra3: includeChildExtraBed ? cleanLkrNumber(document.getElementById('child_final_lkr_3star')?.innerText) : '',
                childShare3: includeChildSharingBed ? cleanLkrNumber(document.getElementById('child_sharing_final_lkr_3star')?.innerText) : '',
                childExtra4: includeChildExtraBed ? cleanLkrNumber(document.getElementById('child_final_lkr_4star')?.innerText) : '',
                childShare4: includeChildSharingBed ? cleanLkrNumber(document.getElementById('child_sharing_final_lkr_4star')?.innerText) : '',
                childExtraMix: (includeChildExtraBed && document.getElementById('result_card_mix')?.style.display !== 'none') ? cleanLkrNumber(document.getElementById('child_final_lkr_mix')?.innerText) : '',
                childShareMix: (includeChildSharingBed && document.getElementById('result_card_mix')?.style.display !== 'none') ? cleanLkrNumber(document.getElementById('child_sharing_final_lkr_mix')?.innerText) : ''
            };

            const citiesSummary = availableCities.map(c => (c.numberOfNights || 1) + 'N ' + c.name).join(' + ');
            const fullSummary = citiesSummary + ' • ' + availableTours.length + ' Tours • ' + availableTransfers.length + ' Transfers';

            const nowIso = new Date().toISOString();

            // 2. Read existing document if available to preserve createdAt, sheetUrl, and packages
            let existingCreatedAt = nowIso;
            let existingSheetUrl = null;
            let existingPackages = [];

            try {
                let existingRaw = isNewInqMode ? null : localStorage.getItem(SLW_INQ_DOC_PREFIX + inqKey);
                if (!existingRaw && inqRaw !== inqKey) {
                    existingRaw = localStorage.getItem(SLW_INQ_DOC_PREFIX + inqRaw);
                }
                if (existingRaw) {
                    const parsedExisting = JSON.parse(existingRaw);
                    if (parsedExisting.createdAt) existingCreatedAt = parsedExisting.createdAt;
                    if (parsedExisting.googleSheetUrl) existingSheetUrl = parsedExisting.googleSheetUrl;

                    if (Array.isArray(parsedExisting.packages) && parsedExisting.packages.length > 0) {
                        existingPackages = [...parsedExisting.packages];
                    } else if (parsedExisting.costing) {
                        // Migrate legacy single package doc into packages array
                        existingPackages = [{
                            id: parsedExisting.activePackageId || 'pkg_1',
                            packageName: parsedExisting.packageName || ('Option 1: ' + (parsedExisting.title || 'Standard Package')),
                            title: parsedExisting.title || 'Standard Package',
                            cities: parsedExisting.cities || '',
                            summary: parsedExisting.summary || '',
                            rates: parsedExisting.rates || {},
                            costing: parsedExisting.costing,
                            itinerary: parsedExisting.itinerary,
                            pricingSummary: parsedExisting.pricingSummary,
                            pax: parsedExisting.pax || 2,
                            transferPax: parsedExisting.transferPax || 2,
                            hotelDivisor: parsedExisting.hotelDivisor || 2,
                            paxText: parsedExisting.paxText || '02 Pax',
                            isTplActive: Boolean(parsedExisting.isTplActive),
                            tplRoomsCount: parsedExisting.tplRoomsCount || 1,
                            totalRoomsCount: parsedExisting.totalRoomsCount || 1,
                            tplRate3: parsedExisting.tplRate3 || 800,
                            tplRate4: parsedExisting.tplRate4 || 1000,
                            tplRate5: parsedExisting.tplRate5 || 1200,
                            hasChildPrices: parsedExisting.hasChildPrices,
                            includeChildExtraBed: parsedExisting.includeChildExtraBed,
                            includeChildSharingBed: parsedExisting.includeChildSharingBed,
                            updatedAt: parsedExisting.updatedAt || existingCreatedAt
                        }];
                    }
                }
            } catch(e) {}

            // Current package snapshot
            const currentPackageId = (isOverwriteMode && selectedExistingPkgId)
                ? selectedExistingPkgId
                : ('pkg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));

            const currentCostingSnapshot = {
                hasMix: Boolean(document.getElementById('result_card_mix')?.style.display !== 'none'),
                hasChildPrices: hasChildPrices,
                includeChildExtraBed: includeChildExtraBed,
                includeChildSharingBed: includeChildSharingBed,
                isTplActive: Boolean(document.getElementById('check_tpl_room')?.checked),
                tplRoomsCount: Number(document.getElementById('tpl_rooms_count')?.value) || 1,
                totalRoomsCount: Number(document.getElementById('total_hotel_rooms')?.value) || 1,
                tplRate3: Number(document.getElementById('tpl_rate_3star')?.value) || 800,
                tplRate4: Number(document.getElementById('tpl_rate_4star')?.value) || 1000,
                tplRate5: Number(document.getElementById('tpl_rate_5star')?.value) || 1200,
                availableCities: JSON.parse(JSON.stringify(availableCities)),
                availableTours: JSON.parse(JSON.stringify(availableTours)),
                availableTransfers: JSON.parse(JSON.stringify(availableTransfers)),
                pricingAdj: pricingAdj
            };

            const currentPackageSnapshot = {
                id: currentPackageId,
                packageName: packageName,
                title: title,
                cities: citiesSummary,
                summary: fullSummary,
                rates: rates,
                pax: Number(document.getElementById('num_people_transfer')?.value) || 2,
                transferPax: Number(document.getElementById('num_people_transfer')?.value) || 2,
                hotelDivisor: Number(document.getElementById('num_people_hotel')?.value) || 2,
                paxText: paxText,
                isTplActive: Boolean(document.getElementById('check_tpl_room')?.checked),
                tplRoomsCount: Number(document.getElementById('tpl_rooms_count')?.value) || 1,
                totalRoomsCount: Number(document.getElementById('total_hotel_rooms')?.value) || 1,
                tplRate3: Number(document.getElementById('tpl_rate_3star')?.value) || 800,
                tplRate4: Number(document.getElementById('tpl_rate_4star')?.value) || 1000,
                tplRate5: Number(document.getElementById('tpl_rate_5star')?.value) || 1200,
                hasChildPrices: hasChildPrices,
                includeChildExtraBed: includeChildExtraBed,
                includeChildSharingBed: includeChildSharingBed,
                childExtraLabel: document.getElementById('exportChildExtraBedLabel')?.value.trim() || 'Per Child (With Extra Bed)',
                childShareLabel: document.getElementById('exportChildSharingBedLabel')?.value.trim() || 'Per Child (Sharing Bed)',
                costing: currentCostingSnapshot,
                itinerary: itineraryPayload,
                pricingSummary: pricingSummary,
                updatedAt: nowIso
            };

            if (isOverwriteMode && selectedExistingPkgId) {
                const foundIdx = existingPackages.findIndex(p => p.id === selectedExistingPkgId);
                if (foundIdx !== -1) {
                    existingPackages[foundIdx] = currentPackageSnapshot;
                } else {
                    existingPackages.push(currentPackageSnapshot);
                }
            } else {
                existingPackages.push(currentPackageSnapshot);
            }

            // 3. Build Full Document
            const fullDoc = {
                inq: inqKey,
                clientName: clientName,
                clientPhone: clientPhone,
                title: title,
                packageName: packageName,
                activePackageId: currentPackageId,
                packages: existingPackages,
                date: date,
                quotationDate: date,
                travelMonth: travelMonth,
                travelYear: travelYear,
                travelMonthDate: travelMonthDate,
                paxText: paxText,
                pax: Number(document.getElementById('num_people_transfer')?.value) || 2,
                transferPax: Number(document.getElementById('num_people_transfer')?.value) || 2,
                hotelDivisor: Number(document.getElementById('num_people_hotel')?.value) || 2,
                isTplActive: Boolean(document.getElementById('check_tpl_room')?.checked),
                tplRoomsCount: Number(document.getElementById('tpl_rooms_count')?.value) || 1,
                totalRoomsCount: Number(document.getElementById('total_hotel_rooms')?.value) || 1,
                tplRate3: Number(document.getElementById('tpl_rate_3star')?.value) || 800,
                tplRate4: Number(document.getElementById('tpl_rate_4star')?.value) || 1000,
                tplRate5: Number(document.getElementById('tpl_rate_5star')?.value) || 1200,
                cities: citiesSummary,
                summary: fullSummary,
                rates: rates,
                hasChildPrices: hasChildPrices,
                includeChildExtraBed: includeChildExtraBed,
                includeChildSharingBed: includeChildSharingBed,
                costing: currentCostingSnapshot,
                itinerary: itineraryPayload,
                pricingSummary: pricingSummary,
                updatedAt: nowIso,
                createdAt: existingCreatedAt
            };
            if (existingSheetUrl) {
                fullDoc.googleSheetUrl = existingSheetUrl;
            }

            // Calculate byte size
            const sizeBytes = new Blob([JSON.stringify(fullDoc)]).size;

            // 4. Save full doc to LocalStorage (both normalized and raw for cross-app compatibility)
            localStorage.setItem(SLW_INQ_DOC_PREFIX + inqKey, JSON.stringify(fullDoc));
            if (inqRaw && inqRaw !== inqKey) {
                localStorage.setItem(SLW_INQ_DOC_PREFIX + inqRaw, JSON.stringify(fullDoc));
            }
            localStorage.setItem('SLW_ACTIVE_INQ', inqKey);
            localStorage.setItem('SLW_ACTIVE_INQ_CLIENT', clientName || '');
            localStorage.setItem('SLW_ACTIVE_INQ_TITLE', title || '');
            localStorage.setItem('SLW_ACTIVE_INQ_PACKAGE_ID', currentPackageId);
            localStorage.setItem('SLW_PENDING_COSTING_DATA', JSON.stringify(fullDoc.costing));

            // 5. Update Index (with packages metadata for fast card & modal rendering)
            const indexItem = {
                inq: inqKey,
                clientName: clientName,
                clientPhone: clientPhone,
                title: title,
                date: date,
                quotationDate: date,
                travelMonth: travelMonth,
                travelYear: travelYear,
                travelMonthDate: travelMonthDate,
                paxText: paxText,
                cities: citiesSummary,
                rates: rates,
                sizeBytes: sizeBytes,
                updatedAt: nowIso,
                googleSheetUrl: fullDoc.googleSheetUrl || null,
                packagesCount: existingPackages.length,
                packages: existingPackages.map((p, idx) => ({
                    id: p.id || ('pkg_' + (idx + 1)),
                    packageName: p.packageName || ('Option ' + (idx + 1)),
                    title: p.title || title,
                    cities: p.cities || citiesSummary,
                    rates: p.rates || rates
                }))
            };

            // Remove existing index item with same inq
            inqQuotationIndex = inqQuotationIndex.filter(item => item.inq !== inqKey);
            inqQuotationIndex.unshift(indexItem);

            // Save index locally
            localStorage.setItem(SLW_INQ_INDEX_STORAGE_KEY, JSON.stringify(inqQuotationIndex));
            updateQuotationHubCountBadge();
            updateQuotationStorageStats();

            // 6. Cloud Sync if enabled
            if (syncCloud && typeof db !== 'undefined' && db) {
                // Save doc in slw_quotations collection
                await db.collection('slw_quotations').doc(inqKey).set(fullDoc);

                // Update index in slw_settings collection (only 1 doc updated for entire list!)
                await db.collection('slw_settings').doc('quotation_index').set({
                    items: inqQuotationIndex,
                    updatedAt: nowIso
                });

                if (window.slwLogActivity) {
                    window.slwLogActivity('Saved Quotation ' + inqKey + ' (' + existingPackages.length + ' package' + (existingPackages.length > 1 ? 's' : '') + ') for ' + clientName);
                }
            }

            // Sync with export modal inputs if open
            if (document.getElementById('exportItineraryInq')) document.getElementById('exportItineraryInq').value = inqKey;
            if (document.getElementById('exportItineraryClient')) document.getElementById('exportItineraryClient').value = clientName;
            if (document.getElementById('exportItineraryTitle')) document.getElementById('exportItineraryTitle').value = title;

            // 7. Continuous Self-Study & Pattern Learning
            if (window.SlwLearningEngine && typeof window.SlwLearningEngine.learnFromQuotation === 'function') {
                try {
                    window.SlwLearningEngine.learnFromQuotation(inqKey, fullDoc.costing, fullDoc.itinerary);
                } catch (e) {
                    console.warn('SlwLearningEngine learn error:', e);
                }
            }

            closeModal('saveQuotationModal');
            activeLoadedInqKey = inqKey;
            activeLoadedInqData = fullDoc;
            activeLoadedPackageId = currentPackageId;
            activeLoadedPackageName = packageName;
            updateActiveInqBanner();

            const pkgSuccessMsg = isNewInqMode
                ? `🎉 Created & saved as BRAND NEW Quotation [${inqKey}]!`
                : (existingPackages.length > 1 
                    ? `Saved as "${packageName}" (${existingPackages.length} options under ${inqKey})!` 
                    : `Successfully saved Quotation [${inqKey}]!`);
            showNotification('✅ ' + pkgSuccessMsg, false);

            // If user clicked "Save & Open Itinerary"
            if (andOpenItinerary) {
                localStorage.setItem('SLW_ACTIVE_INQ', inqKey);
                localStorage.setItem('SLW_ACTIVE_INQ_CLIENT', clientName || '');
                localStorage.setItem('SLW_ACTIVE_INQ_TITLE', title || '');
                localStorage.setItem('SLW_ACTIVE_INQ_PACKAGE_ID', currentPackageId);
                localStorage.setItem('SLW_PENDING_COSTING_ITINERARY', JSON.stringify(fullDoc.itinerary));
                localStorage.setItem('SLW_LATEST_COSTING_PRICES', JSON.stringify(fullDoc.pricingSummary));
                window.open('archives/Itinerary_Builder_App New.html', '_blank');
            }

        } catch(err) {
            console.error("Error saving INQ quotation:", err);
            alert("Error saving quotation: " + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origBtnText;
            }
        }
    }

    async function loadInqQuotationIntoCosting(inqKey, targetPackageId = null) {
        if (!inqKey) return;

        let docData = null;

        // 1. Check local storage first (0ms, 0 reads)
        try {
            let localRaw = localStorage.getItem(SLW_INQ_DOC_PREFIX + inqKey);
            if (!localRaw && typeof slwNormalizeInqKey === 'function') {
                localRaw = localStorage.getItem(SLW_INQ_DOC_PREFIX + slwNormalizeInqKey(inqKey));
            }
            if (localRaw) {
                docData = JSON.parse(localRaw);
            }
        } catch(e) {
            console.warn("Local quotation read error:", e);
        }

        // 2. If not found locally, fetch from Firestore Cloud (1 read)
        if (!docData) {
            try {
                if (typeof db !== 'undefined' && db) {
                    showNotification('☁️ Fetching quotation [' + inqKey + '] from Cloud...', false);
                    const snap = await db.collection('slw_quotations').doc(inqKey).get();
                    if (snap.exists) {
                        docData = snap.data();
                        // Cache locally
                        localStorage.setItem(SLW_INQ_DOC_PREFIX + inqKey, JSON.stringify(docData));
                    }
                }
            } catch(e) {
                alert("Failed to fetch quotation from Cloud: " + e.message);
                return;
            }
        }

        if (!docData) {
            alert('Quotation "' + inqKey + '" could not be found.');
            return;
        }

        // Determine which package to load
        let targetPackage = null;
        if (Array.isArray(docData.packages) && docData.packages.length > 0) {
            if (targetPackageId) {
                targetPackage = docData.packages.find(p => p.id === targetPackageId);
            }
            if (!targetPackage && docData.activePackageId) {
                targetPackage = docData.packages.find(p => p.id === docData.activePackageId);
            }
            if (!targetPackage) {
                targetPackage = docData.packages[0];
            }
        }

        const pkgLabel = targetPackage ? ` - [${targetPackage.packageName || targetPackage.title}]` : '';

        // 3. Confirm loading
        if (!confirm('Load quotation "' + docData.inq + '"' + pkgLabel + ' for ' + (docData.clientName || 'Client') + '?\n\nThis will restore all cities, hotels, tours, transfers, pax, markup settings, and price overrides into this calculator.')) {
            return;
        }

        // 4. Restore Costing State
        const costingToRestore = (targetPackage && targetPackage.costing) ? targetPackage.costing : (docData.costing || {});
        if (costingToRestore) {
            availableCities = JSON.parse(JSON.stringify(costingToRestore.availableCities || []));
            availableTours = JSON.parse(JSON.stringify(costingToRestore.availableTours || []));
            availableTransfers = JSON.parse(JSON.stringify(costingToRestore.availableTransfers || []));

            if (costingToRestore.pricingAdj) {
                restoreAllPricingAdjustments(costingToRestore.pricingAdj);
            }
        }

        // Restore Pax & Divisor
        const paxVal = (targetPackage ? targetPackage.transferPax : null) ?? docData.transferPax ?? docData.pax;
        if (paxVal && document.getElementById('num_people_transfer')) {
            document.getElementById('num_people_transfer').value = paxVal;
        }
        const divisorVal = (targetPackage ? targetPackage.hotelDivisor : null) ?? docData.hotelDivisor;
        if (divisorVal && document.getElementById('num_people_hotel')) {
            document.getElementById('num_people_hotel').value = divisorVal;
        }

        // Restore TPL
        const isTpl = Boolean((targetPackage ? targetPackage.isTplActive : null) ?? docData.isTplActive);
        const chkTpl = document.getElementById('check_tpl_room');
        if (chkTpl) {
            chkTpl.checked = isTpl;
            if (typeof onTplOptionToggle === 'function') onTplOptionToggle();
        }
        if (document.getElementById('tpl_rooms_count')) {
            document.getElementById('tpl_rooms_count').value = (targetPackage ? targetPackage.tplRoomsCount : null) ?? docData.tplRoomsCount ?? 1;
        }
        if (document.getElementById('total_hotel_rooms')) {
            document.getElementById('total_hotel_rooms').value = (targetPackage ? targetPackage.totalRoomsCount : null) ?? docData.totalRoomsCount ?? 1;
        }
        if (document.getElementById('tpl_rate_3star')) {
            document.getElementById('tpl_rate_3star').value = (targetPackage ? targetPackage.tplRate3 : null) ?? docData.tplRate3 ?? 800;
        }
        if (document.getElementById('tpl_rate_4star')) {
            document.getElementById('tpl_rate_4star').value = (targetPackage ? targetPackage.tplRate4 : null) ?? docData.tplRate4 ?? 1000;
        }
        if (document.getElementById('tpl_rate_5star')) {
            document.getElementById('tpl_rate_5star').value = (targetPackage ? targetPackage.tplRate5 : null) ?? docData.tplRate5 ?? 1200;
        }

        renderAll();
        calculate();

        // 5. Update Export inputs & active INQ state
        activeLoadedInqKey = docData.inq || inqKey;
        activeLoadedInqData = docData;
        activeLoadedPackageId = targetPackage ? targetPackage.id : (docData.activePackageId || null);
        activeLoadedPackageName = targetPackage ? (targetPackage.packageName || targetPackage.title) : (docData.packageName || null);

        localStorage.setItem('SLW_ACTIVE_INQ', activeLoadedInqKey);
        localStorage.setItem('SLW_ACTIVE_INQ_CLIENT', docData.clientName || '');
        localStorage.setItem('SLW_ACTIVE_INQ_TITLE', (targetPackage ? targetPackage.title : docData.title) || '');
        if (activeLoadedPackageId) {
            localStorage.setItem('SLW_ACTIVE_INQ_PACKAGE_ID', activeLoadedPackageId);
        }

        if (document.getElementById('exportItineraryTitle')) document.getElementById('exportItineraryTitle').value = (targetPackage ? targetPackage.title : docData.title) || '';
        if (document.getElementById('exportItineraryClient')) document.getElementById('exportItineraryClient').value = docData.clientName || '';
        if (document.getElementById('exportItineraryInq')) document.getElementById('exportItineraryInq').value = docData.inq || '';
        if (document.getElementById('exportItineraryPax')) document.getElementById('exportItineraryPax').value = (targetPackage ? targetPackage.paxText : docData.paxText) || '';
        if (document.getElementById('exportItineraryDate')) {
            document.getElementById('exportItineraryDate').value = docData.travelMonthDate || (docData.travelMonth && docData.travelYear ? `${docData.travelMonth}-${docData.travelYear}` : (docData.date || ''));
        }

        updateActiveInqBanner();
        closeModal('quotationHubModal');
        showNotification('⚡ Loaded ' + (activeLoadedPackageName ? `[${activeLoadedPackageName}] of ` : '') + 'Quotation [' + docData.inq + ']! All prices restored.', false);
        document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function openInqQuotationItinerary(inqKey, targetPackageId = null) {
        if (!inqKey) return;

        let docData = null;
        try {
            const localRaw = localStorage.getItem(SLW_INQ_DOC_PREFIX + inqKey);
            if (localRaw) docData = JSON.parse(localRaw);
        } catch(e) {}

        if (!docData && typeof db !== 'undefined' && db) {
            try {
                showNotification('☁️ Fetching itinerary for [' + inqKey + ']...', false);
                const snap = await db.collection('slw_quotations').doc(inqKey).get();
                if (snap.exists) {
                    docData = snap.data();
                    localStorage.setItem(SLW_INQ_DOC_PREFIX + inqKey, JSON.stringify(docData));
                }
            } catch(e) {
                alert("Failed to fetch from Cloud: " + e.message);
                return;
            }
        }

        if (!docData) {
            alert('Quotation data for "' + inqKey + '" could not be found.');
            return;
        }

        // Determine target package
        let targetPkg = null;
        if (Array.isArray(docData.packages) && docData.packages.length > 0) {
            if (targetPackageId) {
                targetPkg = docData.packages.find(p => p.id === targetPackageId);
            }
            if (!targetPkg && activeLoadedPackageId) {
                targetPkg = docData.packages.find(p => p.id === activeLoadedPackageId);
            }
            if (!targetPkg && docData.activePackageId) {
                targetPkg = docData.packages.find(p => p.id === docData.activePackageId);
            }
            if (!targetPkg) {
                targetPkg = docData.packages[0];
            }
        }

        // Set active INQ and pending itinerary and latest prices in localStorage
        localStorage.setItem('SLW_ACTIVE_INQ', docData.inq || inqKey);
        localStorage.setItem('SLW_ACTIVE_INQ_CLIENT', docData.clientName || '');
        localStorage.setItem('SLW_ACTIVE_INQ_TITLE', (targetPkg?.title || docData.title) || '');
        if (targetPkg?.id) {
            localStorage.setItem('SLW_ACTIVE_INQ_PACKAGE_ID', targetPkg.id);
        }

        const allowChildExtra = Boolean(docData.includeChildExtraBed ?? (docData.costing?.includeChildExtraBed ?? (docData.rates?.childExtra3 || false)));
        const allowChildShare = Boolean(docData.includeChildSharingBed ?? (docData.costing?.includeChildSharingBed ?? (docData.rates?.childShare3 || false)));
        const hasChildPrices = Boolean(docData.hasChildPrices ?? (allowChildExtra || allowChildShare));

        const itToUse = (targetPkg && targetPkg.itinerary) ? targetPkg.itinerary : docData.itinerary;
        const pricesToUse = (targetPkg && targetPkg.pricingSummary) ? targetPkg.pricingSummary : docData.pricingSummary;

        if (itToUse) {
            if (docData.travelMonthDate) {
                itToUse.date = docData.travelMonthDate;
            } else if (docData.travelMonth && docData.travelYear) {
                itToUse.date = `${docData.travelMonth}-${docData.travelYear}`;
            }
            itToUse.hasChildPrices = hasChildPrices;
            itToUse.includeChildExtraBed = allowChildExtra;
            itToUse.includeChildSharingBed = allowChildShare;
            if (Array.isArray(itToUse.options)) {
                itToUse.options.forEach(opt => {
                    (opt.hotels || []).forEach(h => {
                        if (Array.isArray(h.prices)) {
                            h.prices = h.prices.filter(p => {
                                const l = (p.label || '').toLowerCase();
                                if (l.includes('extra bed') && !allowChildExtra) return false;
                                if ((l.includes('sharing') || l.includes('no bed')) && !allowChildShare) return false;
                                if ((l.includes('child') || l.includes('kid')) && !allowChildExtra && !allowChildShare) return false;
                                return true;
                            });
                        }
                    });
                });
            }
            localStorage.setItem('SLW_PENDING_COSTING_ITINERARY', JSON.stringify(itToUse));
        }
        if (pricesToUse) {
            pricesToUse.hasChildPrices = hasChildPrices;
            pricesToUse.includeChildExtraBed = allowChildExtra;
            pricesToUse.includeChildSharingBed = allowChildShare;
            if (!allowChildExtra) {
                if (pricesToUse.prices3Star) pricesToUse.prices3Star.childExtra = null;
                if (pricesToUse.prices4Star) pricesToUse.prices4Star.childExtra = null;
                if (pricesToUse.pricesMix) pricesToUse.pricesMix.childExtra = null;
                if (pricesToUse.prices5Star) pricesToUse.prices5Star.childExtra = null;
            }
            if (!allowChildShare) {
                if (pricesToUse.prices3Star) pricesToUse.prices3Star.childShare = null;
                if (pricesToUse.prices4Star) pricesToUse.prices4Star.childShare = null;
                if (pricesToUse.pricesMix) pricesToUse.pricesMix.childShare = null;
                if (pricesToUse.prices5Star) pricesToUse.prices5Star.childShare = null;
            }
            localStorage.setItem('SLW_LATEST_COSTING_PRICES', JSON.stringify(pricesToUse));
        }

        showNotification('🚀 Opening Tour Itinerary Builder for [' + docData.inq + ']' + (targetPkg ? ` (${targetPkg.packageName})` : '') + '...', false);
        window.open('archives/Itinerary_Builder_App New.html', '_blank');
    }

        async function deleteInqPackageOption(inqKey, pkgId, pkgName = '') {
        if (!inqKey || !pkgId) return;

        // 1. Fetch document (from local storage or firestore)
        let docData = null;
        try {
            let localRaw = localStorage.getItem(SLW_INQ_DOC_PREFIX + inqKey);
            if (!localRaw && typeof slwNormalizeInqKey === 'function') {
                localRaw = localStorage.getItem(SLW_INQ_DOC_PREFIX + slwNormalizeInqKey(inqKey));
            }
            if (localRaw) {
                docData = JSON.parse(localRaw);
            }
        } catch(e) {
            console.warn("Local quotation read error:", e);
        }

        if (!docData && typeof db !== 'undefined' && db) {
            try {
                const snap = await db.collection('slw_quotations').doc(inqKey).get();
                if (snap.exists) {
                    docData = snap.data();
                }
            } catch(e) {
                console.error("Cloud fetch error:", e);
            }
        }

        if (!docData || !Array.isArray(docData.packages) || docData.packages.length === 0) {
            alert("Quotation data or package options could not be found.");
            return;
        }

        if (docData.packages.length <= 1) {
            alert("This quotation only has 1 package option remaining. To delete the entire quotation, please click the trash icon on the quotation card.");
            return;
        }

        const targetPkg = docData.packages.find(p => p.id === pkgId);
        const displayName = pkgName || (targetPkg ? (targetPkg.packageName || targetPkg.title) : 'Option');

        if (!confirm('Are you sure you want to permanently delete option "' + displayName + '" from quotation [' + inqKey + ']?\n\nThis will remove it from Firebase Cloud and local storage across all devices.')) {
            return;
        }

        // 2. Filter out the package
        const updatedPackages = docData.packages.filter(p => p.id !== pkgId);
        docData.packages = updatedPackages;

        let remainingActivePkg = updatedPackages[0];
        if (docData.activePackageId === pkgId) {
            docData.activePackageId = remainingActivePkg.id;
            docData.packageName = remainingActivePkg.packageName || remainingActivePkg.title;
            if (remainingActivePkg.costing) docData.costing = remainingActivePkg.costing;
            if (remainingActivePkg.rates) docData.rates = remainingActivePkg.rates;
            if (remainingActivePkg.title) docData.title = remainingActivePkg.title;
        } else {
            const foundActive = updatedPackages.find(p => p.id === docData.activePackageId);
            if (foundActive) remainingActivePkg = foundActive;
        }

        docData.updatedAt = new Date().toISOString();
        docData.sizeBytes = new Blob([JSON.stringify(docData)]).size;

        // 3. Save to LocalStorage
        localStorage.setItem(SLW_INQ_DOC_PREFIX + inqKey, JSON.stringify(docData));
        if (typeof slwNormalizeInqKey === 'function') {
            const normKey = slwNormalizeInqKey(inqKey);
            if (normKey !== inqKey) {
                localStorage.setItem(SLW_INQ_DOC_PREFIX + normKey, JSON.stringify(docData));
            }
        }

        // Update active localStorage pointers if this was the active package
        if (localStorage.getItem('SLW_ACTIVE_INQ') === inqKey && localStorage.getItem('SLW_ACTIVE_INQ_PACKAGE_ID') === pkgId) {
            localStorage.setItem('SLW_ACTIVE_INQ_PACKAGE_ID', remainingActivePkg.id);
            localStorage.setItem('SLW_ACTIVE_INQ_TITLE', remainingActivePkg.title || docData.title || '');
            if (remainingActivePkg.costing) {
                localStorage.setItem('SLW_PENDING_COSTING_DATA', JSON.stringify(remainingActivePkg.costing));
            }
        }

        // 4. Update index
        const idx = inqQuotationIndex.findIndex(i => i.inq === inqKey);
        if (idx !== -1) {
            inqQuotationIndex[idx].packagesCount = updatedPackages.length;
            inqQuotationIndex[idx].packages = updatedPackages.map((p, pIdx) => ({
                id: p.id || ('pkg_' + (pIdx + 1)),
                packageName: p.packageName || ('Option ' + (pIdx + 1)),
                title: p.title || inqQuotationIndex[idx].title,
                rates: p.rates || inqQuotationIndex[idx].rates
            }));
            inqQuotationIndex[idx].rates = docData.rates || inqQuotationIndex[idx].rates;
            inqQuotationIndex[idx].title = docData.title || inqQuotationIndex[idx].title;
            inqQuotationIndex[idx].sizeBytes = docData.sizeBytes;
            inqQuotationIndex[idx].updatedAt = docData.updatedAt;
            localStorage.setItem(SLW_INQ_INDEX_STORAGE_KEY, JSON.stringify(inqQuotationIndex));
        }

        // 5. If currently loaded into active costing editor
        if (activeLoadedInqKey === inqKey) {
            activeLoadedInqData = docData;
            if (activeLoadedPackageId === pkgId) {
                // Load remaining active package into editor
                loadInqQuotationIntoCosting(inqKey, remainingActivePkg.id);
            } else {
                updateActiveInqBanner();
            }
        }

        // 6. Sync to Firebase Cloud
        try {
            if (typeof db !== 'undefined' && db) {
                await db.collection('slw_quotations').doc(inqKey).set(docData);
                await db.collection('slw_settings').doc('quotation_index').set({
                    items: inqQuotationIndex,
                    updatedAt: new Date().toISOString()
                });
                if (window.slwLogActivity) {
                    window.slwLogActivity('Deleted Option "' + displayName + '" from Quotation ' + inqKey);
                }
            }
            showNotification('🗑️ Deleted option "' + displayName + '" from [' + inqKey + '].', false);
        } catch(err) {
            console.error("Cloud sync error on option deletion:", err);
            showNotification('⚠️ Deleted locally, but Cloud sync error: ' + err.message, true);
        }

        // 7. Re-render UI
        updateQuotationHubCountBadge();
        updateQuotationStorageStats();
        renderQuotationHubCards();
    }

    async function deleteInqQuotation(inqKey) {
        if (!inqKey) return;

        const item = inqQuotationIndex.find(i => i.inq === inqKey);
        const nameStr = item ? (' for ' + (item.clientName || 'Client')) : '';

        if (!confirm('Are you sure you want to permanently delete quotation [' + inqKey + ']' + nameStr + '?\n\nThis will remove it from Firebase Cloud and local storage across all devices.')) {
            return;
        }

        // 1. Remove from local storage
        localStorage.removeItem(SLW_INQ_DOC_PREFIX + inqKey);
        inqQuotationIndex = inqQuotationIndex.filter(i => i.inq !== inqKey);
        localStorage.setItem(SLW_INQ_INDEX_STORAGE_KEY, JSON.stringify(inqQuotationIndex));

        if (activeLoadedInqKey === inqKey) {
            clearActiveLoadedInq();
        }

        updateQuotationHubCountBadge();
        updateQuotationStorageStats();
        renderQuotationHubCards();

        // 2. Delete from Cloud
        try {
            if (typeof db !== 'undefined' && db) {
                await db.collection('slw_quotations').doc(inqKey).delete();
                await db.collection('slw_settings').doc('quotation_index').set({
                    items: inqQuotationIndex,
                    updatedAt: new Date().toISOString()
                });
                if (window.slwLogActivity) {
                    window.slwLogActivity('Deleted Quotation ' + inqKey);
                }
            }
            showNotification('🗑️ Deleted quotation [' + inqKey + '].', false);
        } catch(e) {
            console.error("Cloud deletion error:", e);
            showNotification('⚠️ Deleted locally, but Cloud sync error: ' + e.message, true);
        }
    }

    function renderQuotationHubCards() {
        const container = document.getElementById('quotationHubCardsContainer');
        const emptyState = document.getElementById('quotationHubEmptyState');
        if (!container) return;

        const query = (document.getElementById('hubSearchInput')?.value || '').trim().toLowerCase();
        
        let filtered = inqQuotationIndex || [];

        // Apply category filter
        if (activeHubFilterCategory === 'recent') {
            const now = new Date();
            const currentYearMonth = now.toISOString().slice(0, 7); // YYYY-MM
            filtered = filtered.filter(i => (i.date || i.updatedAt || '').startsWith(currentYearMonth));
        } else if (activeHubFilterCategory === 'pattaya') {
            filtered = filtered.filter(i => (i.title || '').toLowerCase().includes('pattaya') || (i.cities || '').toLowerCase().includes('pattaya'));
        } else if (activeHubFilterCategory === 'bangkok') {
            filtered = filtered.filter(i => (i.title || '').toLowerCase().includes('bangkok') || (i.cities || '').toLowerCase().includes('bangkok'));
        } else if (activeHubFilterCategory === 'phuket') {
            filtered = filtered.filter(i => (i.title || '').toLowerCase().includes('phuket') || (i.cities || '').toLowerCase().includes('phuket'));
        }

        // Apply text search
        if (query) {
            filtered = filtered.filter(i => {
                const inq = (i.inq || '').toLowerCase();
                const name = (i.clientName || '').toLowerCase();
                const phone = (i.clientPhone || '').toLowerCase();
                const title = (i.title || '').toLowerCase();
                const cities = (i.cities || '').toLowerCase();
                return inq.includes(query) || name.includes(query) || phone.includes(query) || title.includes(query) || cities.includes(query);
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        let html = '';
        filtered.forEach(item => {
            const rates = item.rates || {};
            const p3 = rates.p3 ? ('LKR ' + rates.p3) : '-';
            const pMix = rates.pMix ? ('LKR ' + rates.pMix) : '-';
            const p4 = rates.p4 ? ('LKR ' + rates.p4) : '-';
            const dateStr = item.quotationDate || item.date || 'Recent';
            const travelStr = item.travelMonthDate || (item.travelMonth && item.travelYear ? `${item.travelMonth}-${item.travelYear}` : '');
            const paxStr = item.paxText || (item.pax ? (item.pax + ' Pax') : '2 Pax');

            html += `
            <div class="bg-white rounded-xl border border-gray-200 hover:border-indigo-300 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group">
                <!-- Top Card Banner -->
                <div class="p-3.5 pb-2.5 border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-indigo-50/30">
                    <div class="flex items-center justify-between gap-2 mb-1.5">
                        <div class="flex items-center gap-1.5">
                            <span onclick="event.stopPropagation(); copyInqNumber('${item.inq}', this)" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border border-indigo-200 font-mono tracking-wide cursor-pointer transition" title="Click to copy INQ #${item.inq}">
                                <i class="fas fa-tag text-[10px] text-indigo-600"></i> ${item.inq}
                            </span>
                            <button onclick="event.stopPropagation(); copyInqNumber('${item.inq}', this)" class="text-gray-400 hover:text-indigo-600 text-xs p-1 transition" title="Copy INQ #${item.inq}">
                                <i class="fas fa-copy"></i>
                            </button>
                            ${(item.packages && item.packages.length > 1) ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300" title="${item.packages.length} Saved Package Options"><i class="fas fa-boxes text-[9px] text-amber-600"></i> ${item.packages.length} Options</span>` : ''}
                        </div>
                        <div class="flex items-center gap-1.5">
                            ${travelStr ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200" title="Travel Period"><i class="fas fa-plane-departure text-[9px] text-amber-600"></i> ${travelStr}</span>` : ''}
                            <span class="text-[11px] font-semibold text-gray-500" title="Quotation Date">${dateStr}</span>
                            <button onclick="loadInqQuotationIntoCosting('${item.inq}')" class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition" title="Edit quotation ${item.inq}">
                                <i class="fas fa-edit text-xs text-indigo-500"></i>
                            </button>
                            <button onclick="deleteInqQuotation('${item.inq}')" class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Delete quotation ${item.inq}">
                                <i class="fas fa-trash-alt text-xs text-red-500"></i>
                            </button>
                        </div>
                    </div>
                    <div class="flex items-center justify-between">
                        <h4 class="font-bold text-sm text-gray-900 truncate" title="${item.clientName || 'Client'}">
                            <i class="fas fa-user-circle text-gray-400 mr-1"></i> ${item.clientName || 'Unnamed Client'}
                        </h4>
                        <span class="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                            ${paxStr}
                        </span>
                    </div>
                </div>

                <!-- Middle Card Body -->
                <div class="p-3.5 space-y-2.5 flex-1">
                    <div>
                        <p class="text-xs font-bold text-gray-800 line-clamp-1" title="${item.title}">
                            ${item.title || 'Tour Package'}
                        </p>
                        <p class="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                            ${item.cities || item.summary || ''}
                        </p>
                    </div>

                    ${(item.packages && item.packages.length > 1) ? `
                    <div class="pt-1.5 pb-0.5 border-t border-dashed border-gray-200">
                        <div class="flex items-center justify-between text-[10px] font-bold text-amber-900 mb-1">
                            <span class="flex items-center gap-1"><i class="fas fa-boxes text-amber-600"></i> Package Options (${item.packages.length}):</span>
                            <span class="text-[9px] text-gray-400 font-normal">Click to load option</span>
                        </div>
                        <div class="flex flex-wrap gap-1">
                            ${item.packages.map((pkg, pIdx) => {
                                const pName = pkg.packageName || ('Option ' + (pIdx + 1));
                                const pNameEsc = pName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                                return `
                                <div class="inline-flex items-center rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition shadow-2xs overflow-hidden group">
                                    <button onclick="loadInqQuotationIntoCosting('${item.inq}', '${pkg.id}')" class="px-2 py-0.5 flex items-center gap-1 hover:text-indigo-900 transition" title="Load ${pName} into Costing">
                                        <span>📦</span> <span class="truncate max-w-[110px]">${pName}</span>
                                    </button>
                                    <button onclick="event.stopPropagation(); deleteInqPackageOption('${item.inq}', '${pkg.id}', '${pNameEsc}')" class="px-1.5 py-0.5 text-gray-400 hover:text-white hover:bg-red-500 transition border-l border-amber-200" title="Delete ${pName}">
                                        <i class="fas fa-times text-[10px]"></i>
                                    </button>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Pricing Rates Grid -->
                    <div class="grid grid-cols-3 gap-1.5 text-center text-[11px] bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <div class="bg-white p-1 rounded border border-gray-200">
                            <span class="block text-[9px] font-bold text-blue-700 uppercase">3★ Rate</span>
                            <span class="font-extrabold text-gray-900 text-[11px] block truncate">${p3}</span>
                        </div>
                        <div class="bg-white p-1 rounded border border-gray-200">
                            <span class="block text-[9px] font-bold text-purple-700 uppercase">Mix Rate</span>
                            <span class="font-extrabold text-gray-900 text-[11px] block truncate">${pMix}</span>
                        </div>
                        <div class="bg-white p-1 rounded border border-gray-200">
                            <span class="block text-[9px] font-bold text-indigo-700 uppercase">4★ Rate</span>
                            <span class="font-extrabold text-gray-900 text-[11px] block truncate">${p4}</span>
                        </div>
                    </div>
                </div>

                <!-- Card Actions -->
                <div class="p-2.5 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between gap-1.5">
                    <button onclick="loadInqQuotationIntoCosting('${item.inq}')" class="flex-1 min-w-0 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow-2xs transition flex items-center justify-center gap-1" title="Edit / Load into Tour Costing Calculator">
                        <i class="fas fa-edit text-amber-300"></i> <span class="truncate">Edit / Costing</span>
                    </button>
                    <button onclick="openInqQuotationItinerary('${item.inq}')" class="flex-1 min-w-0 py-1.5 px-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs shadow-2xs transition flex items-center justify-center gap-1" title="Open in Tour Itinerary Builder">
                        <i class="fas fa-route"></i> <span class="truncate">Itinerary</span>
                    </button>
                    <button onclick="downloadInqQuotationExcel('${item.inq}')" class="shrink-0 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-2xs transition flex items-center justify-center gap-1" title="Download dynamic Costing Excel (.xlsx)">
                        <i class="fas fa-file-excel"></i> <span>Excel</span>
                    </button>
                    <div class="flex items-center shrink-0">
                        <button onclick="exportInqQuotationToGoogleSheets('${item.inq}')" class="py-1.5 px-2 ${item.googleSheetUrl ? 'bg-teal-700 text-white hover:bg-teal-800 rounded-l-lg' : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded-lg'} font-bold text-xs shadow-2xs transition flex items-center justify-center gap-1" title="${item.googleSheetUrl ? 'Open Google Sheet (or click 🔄 to regenerate)' : 'Convert & Open in Google Sheets'}">
                            <i class="fab fa-google-drive"></i> <span>Sheet</span>
                        </button>
                        ${item.googleSheetUrl ? `
                        <button onclick="event.stopPropagation(); exportInqQuotationToGoogleSheets('${item.inq}', true)" class="py-1.5 px-1.5 bg-teal-800 hover:bg-teal-900 text-teal-200 hover:text-white font-bold rounded-r-lg text-xs transition border-l border-teal-600" title="🔄 Regenerate Fresh Google Sheet with Latest Costing & Mix Hotel">
                            <i class="fas fa-sync-alt text-[10px]"></i>
                        </button>
                        ` : ''}
                    </div>
                    <button onclick="deleteInqQuotation('${item.inq}')" class="shrink-0 p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition" title="Delete quotation">
                        <i class="fas fa-trash-alt text-xs"></i>
                    </button>
                </div>
            </div>
            `;
        });

        container.innerHTML = html;
    }

    function filterQuotationHub() {
        renderQuotationHubCards();
    }

    function clearHubSearch() {
        const inp = document.getElementById('hubSearchInput');
        if (inp) inp.value = '';
        renderQuotationHubCards();
    }

    function setHubCategoryFilter(category) {
        activeHubFilterCategory = category;
        document.querySelectorAll('.hub-filter-btn').forEach(btn => {
            btn.className = 'hub-filter-btn px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition';
        });
        const activeBtn = document.getElementById('hubFilterBtn-' + category);
        if (activeBtn) {
            activeBtn.className = 'hub-filter-btn px-3 py-1 bg-indigo-600 text-white rounded-lg font-bold transition shadow-2xs';
        }
        renderQuotationHubCards();
    }

    function slwCopyToClipboard(text, successMsg = 'Copied to clipboard!', btnEl = null) {
        if (!text) return false;

        const onDone = () => {
            if (typeof showNotification === 'function') {
                showNotification(successMsg, false);
            }
            if (btnEl) {
                const originalHtml = btnEl.innerHTML;
                btnEl.innerHTML = '<i class="fas fa-check text-emerald-600"></i>';
                setTimeout(() => {
                    btnEl.innerHTML = originalHtml;
                }, 1500);
            }
        };

        // Method 1: Modern navigator.clipboard (available in HTTPS & localhost)
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(() => {
                onDone();
            }).catch(() => {
                execCommandFallback();
            });
            return;
        }

        // Method 2: execCommand fallback (works in HTTP, file://, mobile, older browsers)
        execCommandFallback();

        function execCommandFallback() {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.top = '0';
                ta.style.left = '0';
                ta.style.width = '2em';
                ta.style.height = '2em';
                ta.style.padding = '0';
                ta.style.border = 'none';
                ta.style.outline = 'none';
                ta.style.boxShadow = 'none';
                ta.style.background = 'transparent';
                ta.style.opacity = '0.01';
                ta.setAttribute('readonly', '');
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                ta.setSelectionRange(0, 99999);
                const successful = document.execCommand('copy');
                document.body.removeChild(ta);
                if (successful) {
                    onDone();
                    return;
                }
            } catch (err) {
                console.warn('execCommand fallback copy failed:', err);
            }
            // Method 3: Last resort prompt
            prompt("Copy Inquiry Reference (Ctrl+C, Enter):", text);
        }
    }

    function copyInqNumber(inq, btnEl = null) {
        if (!inq) return;
        slwCopyToClipboard(inq, '📋 Copied Inquiry #' + inq + ' to clipboard!', btnEl);
    }

    function saveAndOpenFromExportModal() {
        const inq = (document.getElementById('exportItineraryInq')?.value || '').trim() || ('INQ-' + Math.floor(10000 + Math.random() * 90000));
        const client = (document.getElementById('exportItineraryClient')?.value || '').trim() || 'Valued Client';
        const title = (document.getElementById('exportItineraryTitle')?.value || '').trim() || 'Tour Itinerary';

        // Fill saveQuotationModal inputs
        const inqInp = document.getElementById('saveQuotationInqInput');
        if (inqInp) inqInp.value = inq;
        const clientInp = document.getElementById('saveQuotationClientInput');
        if (clientInp) clientInp.value = client;
        const titleInp = document.getElementById('saveQuotationTitleInput');
        if (titleInp) titleInp.value = title;

        executeSaveQuotation(true);
    }

    // ── BACKUP EXPORT & IMPORT ──
    function exportAllInqQuotationsBackup() {
        const backupData = {
            type: "SLW_QUOTATION_BACKUP",
            version: "1.0",
            exportedAt: new Date().toISOString(),
            index: inqQuotationIndex,
            quotations: {}
        };

        // Collect all locally cached quotations
        inqQuotationIndex.forEach(item => {
            const raw = localStorage.getItem(SLW_INQ_DOC_PREFIX + item.inq);
            if (raw) {
                try {
                    backupData.quotations[item.inq] = JSON.parse(raw);
                } catch(e) {}
            }
        });

        const jsonStr = JSON.stringify(backupData, null, 2);
        const dateStr = new Date().toISOString().slice(0, 10);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'slw_inq_quotations_backup_' + dateStr + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('💾 Exported backup of ' + inqQuotationIndex.length + ' quotations!', false);
    }

    function handleQuotationBackupImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || (!data.index && !data.quotations)) {
                    alert("Invalid quotation backup file format.");
                    return;
                }

                const importedIndex = data.index || [];
                const importedQuotes = data.quotations || {};

                // Merge into local storage
                const itemMap = new Map();
                inqQuotationIndex.forEach(i => itemMap.set(i.inq, i));
                importedIndex.forEach(i => itemMap.set(i.inq, i));
                inqQuotationIndex = Array.from(itemMap.values());
                localStorage.setItem(SLW_INQ_INDEX_STORAGE_KEY, JSON.stringify(inqQuotationIndex));

                Object.keys(importedQuotes).forEach(k => {
                    localStorage.setItem(SLW_INQ_DOC_PREFIX + k, JSON.stringify(importedQuotes[k]));
                });

                updateQuotationHubCountBadge();
                updateQuotationStorageStats();
                renderQuotationHubCards();

                if (confirm('Successfully imported ' + importedIndex.length + ' quotations locally!\n\nDo you also want to sync them to Firebase Cloud so they are available across all PCs?')) {
                    if (typeof db !== 'undefined' && db) {
                        showNotification("☁️ Uploading imported quotations to Cloud...", false);
                        for (const k of Object.keys(importedQuotes)) {
                            await db.collection('slw_quotations').doc(k).set(importedQuotes[k]);
                        }
                        await db.collection('slw_settings').doc('quotation_index').set({
                            items: inqQuotationIndex,
                            updatedAt: new Date().toISOString()
                        });
                        showNotification("☁️ All imported quotations synced to Cloud!", false);
                    }
                } else {
                    showNotification('Restored ' + importedIndex.length + ' quotations to Local Storage!', false);
                }

            } catch(err) {
                alert("Import failed: " + err.message);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
