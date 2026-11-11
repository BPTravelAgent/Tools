    // --- UI RENDERING ---
    function renderTours() {
        const container = document.getElementById('tour-list-container');
        const searchTerm = document.getElementById('tourSearch').value.toLowerCase();
        container.innerHTML = '';
        const filteredTours = availableTours.filter(tour => tour.name.toLowerCase().includes(searchTerm));

        const selectedCount = availableTours.filter(t => t.selected).length;
        document.getElementById('tourSelectionCount').innerText = `(${selectedCount}/${availableTours.length} selected)`;

        if (filteredTours.length === 0) {
            container.innerHTML = `<p class="text-gray-500 text-sm py-2 text-center">No matching tours found.</p>`;
            return;
        }
        filteredTours.forEach(tour => {
            const index = availableTours.findIndex(t => t === tour);
            const el = document.createElement('div');
            el.className = `flex items-center justify-between p-2.5 rounded-lg border transition-all duration-150 ${tour.selected ? 'bg-white border-blue-200 shadow-sm' : 'bg-gray-50/70 border-gray-200 opacity-75'}`;
            el.draggable = true;
            el.dataset.index = index;

            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', String(index));
                e.dataTransfer.effectAllowed = 'move';
                el.classList.add('opacity-40', 'border-indigo-400', 'bg-indigo-50/50');
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('opacity-40', 'border-indigo-400', 'bg-indigo-50/50');
            });
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                el.classList.add('border-indigo-500', 'bg-indigo-50/60');
            });
            el.addEventListener('dragleave', () => {
                el.classList.remove('border-indigo-500', 'bg-indigo-50/60');
            });
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.classList.remove('border-indigo-500', 'bg-indigo-50/60');
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                const toIdx = index;
                if (!isNaN(fromIdx) && fromIdx !== toIdx) {
                    const moved = availableTours.splice(fromIdx, 1)[0];
                    availableTours.splice(toIdx, 0, moved);
                    renderTours();
                    calculate();
                }
            });
            
            let priceBadgeHtml = '';
            const ticketPrice = Number(tour.price) || 0;
            const trfPrice = Number(tour.transferPrice) || 0;

            if (ticketPrice > 0 && trfPrice > 0) {
                priceBadgeHtml = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap shadow-xs" title="Per-person ticket: ${ticketPrice} THB | Fixed vehicle/transfer: ${trfPrice} THB">
                        <span class="text-emerald-700"><i class="fas fa-ticket-alt text-[10px]"></i> ${ticketPrice.toLocaleString()} THB</span>
                        <span class="text-gray-300">|</span>
                        <span class="text-purple-700"><i class="fas fa-car text-[10px]"></i> ${trfPrice.toLocaleString()} Trf</span>
                    </span>
                `;
            } else if (ticketPrice > 0) {
                priceBadgeHtml = `
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap shadow-xs" title="Per-person price: ${ticketPrice} THB">
                        <i class="fas fa-ticket-alt text-[10px] text-emerald-600"></i> ${ticketPrice.toLocaleString()} THB/pax
                    </span>
                `;
            } else if (trfPrice > 0) {
                priceBadgeHtml = `
                    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200 whitespace-nowrap shadow-xs" title="Fixed private tour / transfer price: ${trfPrice} THB">
                        <i class="fas fa-car text-[10px] text-purple-600"></i> ${trfPrice.toLocaleString()} THB (Trf)
                    </span>
                `;
            } else {
                priceBadgeHtml = `
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">
                        Free / 0 THB
                    </span>
                `;
            }

            el.innerHTML = `
                <div class="flex items-center min-w-0 flex-grow mr-2">
                    <div class="cursor-grab text-gray-400 hover:text-gray-600 px-1 py-1 mr-1 flex items-center handle" title="Drag to reorder tour position">
                        <i class="fas fa-grip-vertical text-xs"></i>
                    </div>
                    <input type="checkbox" id="tour-${index}" class="h-4 w-4 mr-2.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0" onchange="toggleSelection('tour', ${index})" ${tour.selected ? 'checked' : ''}>
                    <label for="tour-${index}" class="text-sm font-semibold text-gray-800 truncate cursor-pointer select-none" title="${tour.name}">
                        ${tour.name}
                    </label>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    ${priceBadgeHtml}
                    <div class="flex items-center gap-0.5 bg-gray-100/80 p-0.5 rounded border border-gray-200">
                        <button onclick="moveTourItem(${index}, -1)" ${index === 0 ? 'disabled class="opacity-25 p-1 text-gray-400 cursor-not-allowed"' : 'class="p-1 text-gray-600 hover:text-indigo-600 hover:bg-white rounded transition"'} title="Move Tour Up">
                            <i class="fas fa-arrow-up text-[11px]"></i>
                        </button>
                        <button onclick="moveTourItem(${index}, 1)" ${index === availableTours.length - 1 ? 'disabled class="opacity-25 p-1 text-gray-400 cursor-not-allowed"' : 'class="p-1 text-gray-600 hover:text-indigo-600 hover:bg-white rounded transition"'} title="Move Tour Down">
                            <i class="fas fa-arrow-down text-[11px]"></i>
                        </button>
                    </div>
                    <div class="flex items-center">
                        <button onclick="openEditModal('tour', ${index})" class="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition" title="Edit Tour">
                            <i class="fas fa-pencil-alt text-xs"></i>
                        </button>
                        <button onclick="removeItem('tour', ${index})" class="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition" title="Delete Tour">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(el);
        });
    }

    function moveTourItem(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= availableTours.length) return;
        const item = availableTours.splice(index, 1)[0];
        availableTours.splice(newIndex, 0, item);
        renderTours();
        calculate();
        showNotification(`Moved "${item.name}" ${direction < 0 ? 'up ⬆️' : 'down ⬇️'}`, false);
    }

    function renderTransfers() {
        const container = document.getElementById('transfer-list-container');
        const searchTerm = document.getElementById('transferSearch').value.toLowerCase();
        container.innerHTML = '';
        const filteredTransfers = availableTransfers.filter(t => t.name.toLowerCase().includes(searchTerm));
        
        const selectedCount = availableTransfers.filter(t => t.selected).length;
        document.getElementById('transferSelectionCount').innerText = `(${selectedCount}/${availableTransfers.length} selected)`;

        if (filteredTransfers.length === 0) {
            container.innerHTML = `<p class="text-gray-500 text-sm py-2 text-center">No matching transfers found.</p>`;
            return;
        }
        filteredTransfers.forEach(transfer => {
            const index = availableTransfers.findIndex(t => t === transfer);
            const el = document.createElement('div');
            el.className = `flex items-center justify-between p-2.5 rounded-lg border transition-all duration-150 ${transfer.selected ? 'bg-white border-blue-200 shadow-sm' : 'bg-gray-50/70 border-gray-200 opacity-75'}`;
            
            const trfPrice = Number(transfer.price) || 0;
            const priceBadgeHtml = trfPrice > 0
                ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap shadow-xs" title="Transfer Price: ${trfPrice} THB">
                    <i class="fas fa-shuttle-van text-[10px] text-blue-600"></i> ${trfPrice.toLocaleString()} THB
                   </span>`
                : `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">Free / 0 THB</span>`;

            el.innerHTML = `
                <div class="flex items-center min-w-0 flex-grow mr-2">
                    <input type="checkbox" id="transfer-${index}" class="h-4 w-4 mr-2.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0" onchange="toggleSelection('transfer', ${index})" ${transfer.selected ? 'checked' : ''}>
                    <label for="transfer-${index}" class="text-sm font-semibold text-gray-800 truncate cursor-pointer select-none" title="${transfer.name}">
                        ${transfer.name}
                    </label>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    ${priceBadgeHtml}
                    <div class="flex items-center gap-0.5 bg-gray-100/80 p-0.5 rounded border border-gray-200">
                        <button onclick="moveTransferItem(${index}, -1)" ${index === 0 ? 'disabled class="opacity-25 p-1 text-gray-400 cursor-not-allowed"' : 'class="p-1 text-gray-600 hover:text-indigo-600 hover:bg-white rounded transition"'} title="Move Transfer Up">
                            <i class="fas fa-arrow-up text-[11px]"></i>
                        </button>
                        <button onclick="moveTransferItem(${index}, 1)" ${index === availableTransfers.length - 1 ? 'disabled class="opacity-25 p-1 text-gray-400 cursor-not-allowed"' : 'class="p-1 text-gray-600 hover:text-indigo-600 hover:bg-white rounded transition"'} title="Move Transfer Down">
                            <i class="fas fa-arrow-down text-[11px]"></i>
                        </button>
                    </div>
                    <div class="flex items-center">
                        <button onclick="openEditModal('transfer', ${index})" class="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition" title="Edit Transfer">
                            <i class="fas fa-pencil-alt text-xs"></i>
                        </button>
                        <button onclick="removeItem('transfer', ${index})" class="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition" title="Delete Transfer">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(el);
        });
    }

    function moveTransferItem(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= availableTransfers.length) return;
        const item = availableTransfers.splice(index, 1)[0];
        availableTransfers.splice(newIndex, 0, item);
        renderTransfers();
        calculate();
        showNotification(`Moved "${item.name}" ${direction < 0 ? 'up ⬆️' : 'down ⬇️'}`, false);
    }

    function renderCities() {
        const container = document.getElementById('city-list-container');
        const searchTerm = document.getElementById('citySearch').value.toLowerCase();
        container.innerHTML = '';
        const filteredCities = availableCities.filter(c => c.name.toLowerCase().includes(searchTerm));

        const selectedCount = availableCities.filter(c => c.selected).length;
        document.getElementById('citySelectionCount').innerText = `(${selectedCount}/${availableCities.length} selected)`;

        if (filteredCities.length === 0) {
            container.innerHTML = `<p class="text-gray-500 text-sm py-2 text-center">No matching cities found.</p>`;
            return;
        }
        filteredCities.forEach(city => {
            const index = availableCities.findIndex(c => c === city);
            const el = document.createElement('div');
            el.className = `p-3 rounded-lg border transition-all duration-150 ${city.selected ? 'bg-white border-teal-200 shadow-sm' : 'bg-gray-50/70 border-gray-200 opacity-75'}`;
            
            const n3 = city.isSplit ? (Number(city.hotel3Nights) || 0) : (Number(city.numberOfNights) || 0);
            const n4 = city.isSplit ? (Number(city.hotel4Nights) || 0) : (Number(city.numberOfNights) || 0);
            const n5 = city.isSplit ? (Number(city.hotel5Nights) || 0) : (Number(city.numberOfNights) || 0);

            const total3 = (Number(city.hotel3Price) || 0) * n3;
            const total4 = (Number(city.hotel4Price) || 0) * n4;
            const total5 = (Number(city.hotel5Price) || 0) * n5;

            const total3Meal = (Number(city.hotel3Meal) || 0) * n3;
            const total4Meal = (Number(city.hotel4Meal) || 0) * n4;
            const total5Meal = (Number(city.hotel5Meal) || 0) * n5;

            const nightsBadge = city.isSplit
                ? `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">Split (${n3}N+${n4}N+${n5}N)</span>`
                : `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800">${city.numberOfNights} Nights</span>`;

            let hotelRowsHtml = '';

            if (city.hotel3Name) {
                hotelRowsHtml += `
                    <div class="flex items-center justify-between text-xs py-1 border-t border-gray-100">
                        <div class="flex items-center min-w-0 pr-2">
                            <span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 font-bold text-[10px] rounded mr-1.5 flex-shrink-0">3★</span>
                            <span class="font-medium text-gray-700 truncate" title="${city.hotel3Name}">${city.hotel3Name}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0 font-bold">
                            <span class="text-blue-700 whitespace-nowrap bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                ${city.hotel3Price} THB/nt × ${n3}N = <span class="text-blue-900">${total3.toLocaleString()} THB</span>
                            </span>
                            ${city.hotel3Meal ? `<span class="text-[11px] font-semibold text-gray-500 whitespace-nowrap" title="Meal: ${city.hotel3Meal} x ${n3}N">(Meal: ${total3Meal} THB)</span>` : ''}
                            ${city.hotel3Tpl !== undefined ? `<span class="text-[10px] font-semibold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded whitespace-nowrap" title="Triple Room (TPL) Supplement: ${city.hotel3Tpl} THB/night">TPL: ${city.hotel3Tpl} THB</span>` : ''}
                        </div>
                    </div>
                `;
            }

            if (city.hotel4Name) {
                hotelRowsHtml += `
                    <div class="flex items-center justify-between text-xs py-1 border-t border-gray-100">
                        <div class="flex items-center min-w-0 pr-2">
                            <span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 font-bold text-[10px] rounded mr-1.5 flex-shrink-0">4★</span>
                            <span class="font-medium text-gray-700 truncate" title="${city.hotel4Name}">${city.hotel4Name}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0 font-bold">
                            <span class="text-amber-700 whitespace-nowrap bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                ${city.hotel4Price} THB/nt × ${n4}N = <span class="text-amber-900">${total4.toLocaleString()} THB</span>
                            </span>
                            ${city.hotel4Meal ? `<span class="text-[11px] font-semibold text-gray-500 whitespace-nowrap" title="Meal: ${city.hotel4Meal} x ${n4}N">(Meal: ${total4Meal} THB)</span>` : ''}
                            ${city.hotel4Tpl !== undefined ? `<span class="text-[10px] font-semibold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded whitespace-nowrap" title="Triple Room (TPL) Supplement: ${city.hotel4Tpl} THB/night">TPL: ${city.hotel4Tpl} THB</span>` : ''}
                        </div>
                    </div>
                `;
            }

            if (city.hotel5Name) {
                hotelRowsHtml += `
                    <div class="flex items-center justify-between text-xs py-1 border-t border-gray-100">
                        <div class="flex items-center min-w-0 pr-2">
                            <span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 font-bold text-[10px] rounded mr-1.5 flex-shrink-0">5★</span>
                            <span class="font-medium text-gray-700 truncate" title="${city.hotel5Name}">${city.hotel5Name}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0 font-bold">
                            <span class="text-purple-700 whitespace-nowrap bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                                ${city.hotel5Price} THB/nt × ${n5}N = <span class="text-purple-900">${total5.toLocaleString()} THB</span>
                            </span>
                            ${city.hotel5Meal ? `<span class="text-[11px] font-semibold text-gray-500 whitespace-nowrap" title="Meal: ${city.hotel5Meal} x ${n5}N">(Meal: ${total5Meal} THB)</span>` : ''}
                            ${city.hotel5Tpl !== undefined ? `<span class="text-[10px] font-semibold text-purple-700 bg-purple-100/70 px-1.5 py-0.5 rounded whitespace-nowrap" title="Triple Room (TPL) Supplement: ${city.hotel5Tpl} THB/night">TPL: ${city.hotel5Tpl} THB</span>` : ''}
                        </div>
                    </div>
                `;
            }

            el.innerHTML = `
                <div class="flex items-center justify-between pb-1.5 mb-1">
                    <div class="flex items-center min-w-0 mr-2">
                        <input type="checkbox" id="city-${index}" class="h-4 w-4 mr-2.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0" onchange="toggleSelection('city', ${index})" ${city.selected ? 'checked' : ''}>
                        <label for="city-${index}" class="text-sm font-bold text-gray-900 truncate cursor-pointer select-none" title="${city.name}">
                            ${city.name}
                        </label>
                        <span class="ml-2 flex-shrink-0">${nightsBadge}</span>
                    </div>
                    <div class="flex items-center flex-shrink-0">
                        <button onclick="openEditModal('city', ${index})" class="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition" title="Edit City Stay">
                            <i class="fas fa-pencil-alt text-xs"></i>
                        </button>
                        <button onclick="removeItem('city', ${index})" class="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition" title="Delete City Stay">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                    </div>
                </div>
                <div class="space-y-0.5">
                    ${hotelRowsHtml || '<p class="text-xs text-gray-400 italic">No hotels configured</p>'}
                </div>
            `;
            container.appendChild(el);
        });
    }

    // --- MODAL & ITEM MANAGEMENT ---
    function toggleCitySplit() {
        const isSplit = document.getElementById('newCityIsSplit').checked;
        document.getElementById('newCityNightsContainer').style.display = isSplit ? 'none' : 'block';
        document.getElementById('mixPrefContainer').style.display = isSplit ? 'none' : 'block';
        const splitInputs = document.querySelectorAll('.split-night-input');
        splitInputs.forEach(el => {
            if (isSplit) el.classList.remove('hidden');
            else el.classList.add('hidden');
        });
    }

    function openModal(modalId) { 
        if (typeof populateDbDropdowns === 'function') {
            populateDbDropdowns();
        }
        document.getElementById(modalId).style.display = 'flex'; 
        // Auto-focus search input for instant typing
        setTimeout(() => {
            if (modalId === 'tourModal' && document.getElementById('tourDbSearch')) {
                document.getElementById('tourDbSearch').focus();
            } else if (modalId === 'transferModal' && document.getElementById('transferDbSearch')) {
                document.getElementById('transferDbSearch').focus();
            } else if (modalId === 'cityModal' && document.getElementById('cityDbSearch')) {
                document.getElementById('cityDbSearch').focus();
            }
        }, 60);
    }
    
    function closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        // Reset modal to "Add" mode
        if (modalId === 'tourModal') {
            clearTourDbSearch();
            currentSelectedModalTourDbId = null;
            currentSelectedModalTourVehicle = null;
            currentSelectedModalTourOptionType = null;
            document.getElementById('tourModalTitle').innerText = 'Add New Tour';
            const saveButton = document.getElementById('saveTourButton');
            saveButton.innerText = 'Add Tour';
            saveButton.onclick = () => saveTour();
            document.getElementById('newTourName').value = '';
            document.getElementById('newTourPrice').value = '';
            document.getElementById('newTourTransferPrice').value = '';
            const tourBadge = document.getElementById('modalTourMasterStatusBadge');
            if (tourBadge) { tourBadge.innerText = 'Custom / New'; tourBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700'; }
            const tourCity = document.getElementById('modalTourMasterCity');
            if (tourCity) tourCity.value = '';
            const syncChk = document.getElementById('modalSyncTourToDbCheckbox');
            if (syncChk) syncChk.checked = true; // Auto-sync to Master DB & Cloud by default
        } else if (modalId === 'transferModal') {
            clearTransferDbSearch();
            currentSelectedModalTransferDbId = null;
            currentSelectedModalTransferVehicle = null;
            document.getElementById('transferModalTitle').innerText = 'Add New Transfer';
            const saveButton = document.getElementById('saveTransferButton');
            saveButton.innerText = 'Add Transfer';
            saveButton.onclick = () => saveTransfer();
            document.getElementById('newTransferName').value = '';
            document.getElementById('newTransferPrice').value = '';
            const trBadge = document.getElementById('modalTransferMasterStatusBadge');
            if (trBadge) { trBadge.innerText = 'Custom / New'; trBadge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700'; }
            const trCity = document.getElementById('modalTransferMasterCity');
            if (trCity) trCity.value = '';
            const syncTrChk = document.getElementById('modalSyncTransferToDbCheckbox');
            if (syncTrChk) syncTrChk.checked = true; // Auto-sync to Master DB & Cloud by default
        } else if (modalId === 'cityModal') {
            clearCityDbSearch();
            clearHotelDbSearch(3);
            clearHotelDbSearch(4);
            clearHotelDbSearch(5);
            currentSelectedModalHotelDbIds = { 3: null, 4: null, 5: null };
            document.getElementById('cityModalTitle').innerText = 'Add New City Stay';
            const saveButton = document.getElementById('saveCityButton');
            saveButton.innerText = 'Add City';
            saveButton.onclick = () => saveCity();
            document.getElementById('cityNameDbSelect').value = '';
            document.getElementById('newCityName').value = '';
            document.getElementById('newCityNights').value = '';
            document.getElementById('newCityIsSplit').checked = false;
            document.getElementById('newCity3StarNights').value = '';
            document.getElementById('newCity4StarNights').value = '';
            document.getElementById('newCity5StarNights').value = '';
            toggleCitySplit();
            document.getElementById('newCity3StarName').value = '';
            document.getElementById('newCity3StarPrice').value = '';
            document.getElementById('newCity3StarMeal').value = '';
            document.getElementById('newCity3StarTpl').value = '800';
            document.getElementById('newCity4StarName').value = '';
            document.getElementById('newCity4StarPrice').value = '';
            document.getElementById('newCity4StarMeal').value = '';
            document.getElementById('newCity4StarTpl').value = '1000';
            document.getElementById('newCity5StarName').value = '';
            document.getElementById('newCity5StarPrice').value = '';
            document.getElementById('newCity5StarMeal').value = '';
            document.getElementById('newCity5StarTpl').value = '1200';
            document.getElementById('newCityMixPref').value = '3';
            const syncHChk = document.getElementById('modalSyncHotelsToDbCheckbox');
            if (syncHChk) syncHChk.checked = true; // Auto-sync to Master DB & Cloud by default
        }
    }

    function openAddTourModal() {
        closeModal('tourModal');
        currentEditingTourIndex = null;
        openModal('tourModal');
    }

    function openAddTransferModal() {
        closeModal('transferModal');
        currentEditingTransferIndex = null;
        openModal('transferModal');
    }

    function openAddCityModal() {
        closeModal('cityModal');
        currentEditingCityIndex = null;
        openModal('cityModal');
    }

    function openEditModal(type, index) {
        if (type === 'tour') {
            currentEditingTourIndex = index;
            const tour = availableTours[index];
            document.getElementById('newTourName').value = tour.name;
            document.getElementById('newTourPrice').value = tour.price;
            document.getElementById('newTourTransferPrice').value = tour.transferPrice;
            document.getElementById('tourModalTitle').innerText = 'Edit Tour';
            const saveButton = document.getElementById('saveTourButton');
            saveButton.innerText = 'Save Changes';
            saveButton.onclick = () => saveTour(index);

            // Auto-link to Master DB tour BEFORE openModal populates/restores dropdown
            const cleanTourBase = stripTourTags(tour.name).toLowerCase();
            const matchedTour = (masterDb.tours || []).find(t => stripTourTags(t.name).toLowerCase() === cleanTourBase);
            const badge = document.getElementById('modalTourMasterStatusBadge');
            const cityInp = document.getElementById('modalTourMasterCity');
            const syncChk = document.getElementById('modalSyncTourToDbCheckbox');

            const isJoin = (Number(tour.transferPrice) || 0) === 0 && !/\b(private|pvt)\b/i.test(tour.name || '');
            currentSelectedModalTourOptionType = isJoin ? 'join' : 'private';
            currentSelectedModalTourVehicle = /\bvan\b/i.test(tour.name || '') ? 'van' : (/\bbus\b/i.test(tour.name || '') ? 'bus' : 'car');

            if (matchedTour) {
                currentSelectedModalTourDbId = matchedTour.id;
                if (cityInp) cityInp.value = (matchedTour.location || '').trim();
                if (badge) {
                    badge.innerText = `Linked: ${(matchedTour.name || '').substring(0, 18)}`;
                    badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300';
                }
                if (syncChk) syncChk.checked = true;
            } else {
                currentSelectedModalTourDbId = null;
                if (badge) {
                    badge.innerText = 'Custom / New';
                    badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700';
                }
                if (syncChk) syncChk.checked = true;
            }

            openModal('tourModal');
        } else if (type === 'transfer') {
            currentEditingTransferIndex = index;
            const transfer = availableTransfers[index];
            document.getElementById('newTransferName').value = transfer.name;
            document.getElementById('newTransferPrice').value = transfer.price;
            document.getElementById('transferModalTitle').innerText = 'Edit Transfer';
            const saveButton = document.getElementById('saveTransferButton');
            saveButton.innerText = 'Save Changes';
            saveButton.onclick = () => saveTransfer(index);

            // Auto-link to Master DB transfer BEFORE openModal populates/restores dropdown
            const cleanTrRoute = normalizeTransferRoute(transfer.name);
            const matchedTr = (masterDb.transfers || []).find(t => normalizeTransferRoute(t.name) === cleanTrRoute);
            const badge = document.getElementById('modalTransferMasterStatusBadge');
            const cityInp = document.getElementById('modalTransferMasterCity');
            const syncChk = document.getElementById('modalSyncTransferToDbCheckbox');

            currentSelectedModalTransferVehicle = /\(van\)/i.test(transfer.name || '') ? 'van' : (/\(bus\)/i.test(transfer.name || '') ? 'bus' : (/\(car\)/i.test(transfer.name || '') ? 'car' : 'custom'));

            if (matchedTr) {
                currentSelectedModalTransferDbId = matchedTr.id;
                if (cityInp) cityInp.value = (matchedTr.location || '').trim();
                if (badge) {
                    badge.innerText = `Linked: ${(matchedTr.name || '').substring(0, 18)}`;
                    badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300';
                }
                if (syncChk) syncChk.checked = true;
            } else {
                currentSelectedModalTransferDbId = null;
                if (badge) {
                    badge.innerText = 'Custom / New';
                    badge.className = 'text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-700';
                }
                if (syncChk) syncChk.checked = true;
            }

            openModal('transferModal');
        } else if (type === 'city') {
            currentEditingCityIndex = index;
            const city = availableCities[index];
            document.getElementById('newCityName').value = city.name;
            
            if (city.isSplit) {
                document.getElementById('newCityIsSplit').checked = true;
                document.getElementById('newCity3StarNights').value = city.hotel3Nights || '';
                document.getElementById('newCity4StarNights').value = city.hotel4Nights || '';
                document.getElementById('newCity5StarNights').value = city.hotel5Nights || '';
            } else {
                document.getElementById('newCityIsSplit').checked = false;
                document.getElementById('newCityNights').value = city.numberOfNights;
                document.getElementById('newCityMixPref').value = city.mixPref || '3';
            }
            toggleCitySplit();

            document.getElementById('newCity3StarName').value = city.hotel3Name;
            document.getElementById('newCity3StarPrice').value = city.hotel3Price;
            document.getElementById('newCity3StarMeal').value = city.hotel3Meal;
            document.getElementById('newCity3StarTpl').value = (city.hotel3Tpl !== undefined && city.hotel3Tpl !== null) ? city.hotel3Tpl : 800;
            document.getElementById('newCity4StarName').value = city.hotel4Name;
            document.getElementById('newCity4StarPrice').value = city.hotel4Price;
            document.getElementById('newCity4StarMeal').value = city.hotel4Meal;
            document.getElementById('newCity4StarTpl').value = (city.hotel4Tpl !== undefined && city.hotel4Tpl !== null) ? city.hotel4Tpl : 1000;
            document.getElementById('newCity5StarName').value = city.hotel5Name || '';
            document.getElementById('newCity5StarPrice').value = city.hotel5Price || '';
            document.getElementById('newCity5StarMeal').value = city.hotel5Meal || '';
            document.getElementById('newCity5StarTpl').value = (city.hotel5Tpl !== undefined && city.hotel5Tpl !== null) ? city.hotel5Tpl : 1200;

            // Link existing 3*, 4*, 5* hotels to Master DB IDs before openModal renders dropdowns
            const findHotelId = (star, hName) => {
                const n = (hName || '').trim().toLowerCase();
                if (!n) return null;
                const cityLow = (city.name || '').trim().toLowerCase();
                const exact = (masterDb.hotels || []).find(h => (h.name || '').trim().toLowerCase() === n && Number(h.star) === star && (!cityLow || (h.location || '').trim().toLowerCase() === cityLow))
                    || (masterDb.hotels || []).find(h => (h.name || '').trim().toLowerCase() === n && Number(h.star) === star)
                    || (masterDb.hotels || []).find(h => (h.name || '').trim().toLowerCase() === n);
                return exact ? exact.id : null;
            };
            currentSelectedModalHotelDbIds = {
                3: findHotelId(3, city.hotel3Name),
                4: findHotelId(4, city.hotel4Name),
                5: findHotelId(5, city.hotel5Name)
            };

            document.getElementById('cityModalTitle').innerText = 'Edit City Stay';
            const saveButton = document.getElementById('saveCityButton');
            saveButton.innerText = 'Save Changes';
            saveButton.onclick = () => saveCity(index);
            const syncHChk = document.getElementById('modalSyncHotelsToDbCheckbox');
            if (syncHChk) syncHChk.checked = true;
            openModal('cityModal');
        }
    }

    async function saveTour(index = null, syncToCloud = true) {
        if (index === null && currentEditingTourIndex !== null) {
            index = currentEditingTourIndex;
        }
        const name = (document.getElementById('newTourName').value || '').trim();
        const price = parseFloat(document.getElementById('newTourPrice').value) || 0;
        const transferPrice = parseFloat(document.getElementById('newTourTransferPrice').value) || 0;
        if (!name) {
            showNotification("Please enter a valid tour name.", true);
            return;
        }
        if (price < 0 || transferPrice < 0) {
            showNotification("Tour prices cannot be negative.", true);
            return;
        }
        const tourData = { name, price, transferPrice };
        if (index !== null) {
            tourData.selected = availableTours[index] ? availableTours[index].selected : true;
            availableTours[index] = tourData;
        } else {
            const cleanNew = typeof stripTourTags === 'function' ? stripTourTags(name).toLowerCase() : name.toLowerCase();
            const existingIdx = availableTours.findIndex(t => {
                const cleanT = typeof stripTourTags === 'function' ? stripTourTags(t.name).toLowerCase() : (t.name || '').toLowerCase();
                return cleanT === cleanNew;
            });
            if (existingIdx !== -1) {
                tourData.selected = availableTours[existingIdx].selected;
                availableTours[existingIdx] = tourData;
            } else {
                tourData.selected = true;
                availableTours.push(tourData);
            }
        }

        const syncCheckbox = document.getElementById('modalSyncTourToDbCheckbox');
        if (syncToCloud && syncCheckbox && syncCheckbox.checked) {
            await quickSaveModalTourToMasterDb(true, false, false);
        }

        currentEditingTourIndex = null;
        closeModal('tourModal');
        renderTours();
        if (typeof saveState === 'function') saveState();

        const resultsEl = document.getElementById('results');
        if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
            calculate();
        }
    }
    
    async function saveTransfer(index = null, syncToCloud = true) {
        if (index === null && currentEditingTransferIndex !== null) {
            index = currentEditingTransferIndex;
        }
        const name = (document.getElementById('newTransferName').value || '').trim();
        const price = parseFloat(document.getElementById('newTransferPrice').value) || 0;
        if (!name) {
            showNotification("Please enter a valid transfer name.", true);
            return;
        }
        if (price < 0) {
            showNotification("Transfer price cannot be negative.", true);
            return;
        }
        const transferData = { name, price };
        if (index !== null) {
            transferData.selected = availableTransfers[index] ? availableTransfers[index].selected : true;
            availableTransfers[index] = transferData;
        } else {
            const cleanNew = typeof normalizeTransferRoute === 'function' ? normalizeTransferRoute(name) : name.toLowerCase();
            const existingIdx = availableTransfers.findIndex(t => {
                const cleanT = typeof normalizeTransferRoute === 'function' ? normalizeTransferRoute(t.name) : (t.name || '').toLowerCase();
                return cleanT === cleanNew;
            });
            if (existingIdx !== -1) {
                transferData.selected = availableTransfers[existingIdx].selected;
                availableTransfers[existingIdx] = transferData;
            } else {
                transferData.selected = true;
                availableTransfers.push(transferData);
            }
        }

        const syncCheckbox = document.getElementById('modalSyncTransferToDbCheckbox');
        if (syncToCloud && syncCheckbox && syncCheckbox.checked) {
            await quickSaveModalTransferToMasterDb(true, false, false);
        }

        currentEditingTransferIndex = null;
        closeModal('transferModal');
        renderTransfers();
        if (typeof saveState === 'function') saveState();

        const resultsEl = document.getElementById('results');
        if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
            calculate();
        }
    }

    async function saveCity(index = null, syncToCloud = true) {
        if (index === null && currentEditingCityIndex !== null) {
            index = currentEditingCityIndex;
        }
        const name = (document.getElementById('newCityName').value || '').trim();
        const isSplit = document.getElementById('newCityIsSplit').checked;
        
        let numberOfNights, hotel3Nights, hotel4Nights, hotel5Nights, mixPref;
        if (isSplit) {
            hotel3Nights = parseInt(document.getElementById('newCity3StarNights').value) || 0;
            hotel4Nights = parseInt(document.getElementById('newCity4StarNights').value) || 0;
            hotel5Nights = parseInt(document.getElementById('newCity5StarNights').value) || 0;
            numberOfNights = hotel3Nights + hotel4Nights + hotel5Nights;
            mixPref = 'split';
        } else {
            numberOfNights = parseInt(document.getElementById('newCityNights').value) || 0;
            hotel3Nights = numberOfNights;
            hotel4Nights = numberOfNights;
            hotel5Nights = numberOfNights;
            mixPref = document.getElementById('newCityMixPref').value;
        }

        const hotel3Name = (document.getElementById('newCity3StarName').value || '').trim();
        const hotel3Price = parseFloat(document.getElementById('newCity3StarPrice').value) || 0;
        const hotel3Meal = parseFloat(document.getElementById('newCity3StarMeal').value) || 0;
        const hotel3Tpl = parseFloat(document.getElementById('newCity3StarTpl')?.value) || 800;

        const hotel4Name = (document.getElementById('newCity4StarName').value || '').trim();
        const hotel4Price = parseFloat(document.getElementById('newCity4StarPrice').value) || 0;
        const hotel4Meal = parseFloat(document.getElementById('newCity4StarMeal').value) || 0;
        const hotel4Tpl = parseFloat(document.getElementById('newCity4StarTpl')?.value) || 1000;

        const hotel5Name = (document.getElementById('newCity5StarName').value || '').trim();
        const hotel5Price = parseFloat(document.getElementById('newCity5StarPrice').value) || 0;
        const hotel5Meal = parseFloat(document.getElementById('newCity5StarMeal').value) || 0;
        const hotel5Tpl = parseFloat(document.getElementById('newCity5StarTpl')?.value) || 1200;
        
        if (!name || numberOfNights <= 0) {
            showNotification("Please provide a City Name and at least 1 Night total.", true);
            return;
        }
        
        if (!hotel3Name && !hotel4Name && !hotel5Name) {
            showNotification("Please provide at least one hotel option (3*, 4*, or 5*).", true);
            return;
        }
        
        const cityData = { name, isSplit, numberOfNights, hotel3Nights, hotel4Nights, hotel5Nights, hotel3Name, hotel3Price, hotel3Meal, hotel3Tpl, hotel4Name, hotel4Price, hotel4Meal, hotel4Tpl, hotel5Name, hotel5Price, hotel5Meal, hotel5Tpl, mixPref };
        
        if (index !== null) {
            cityData.selected = availableCities[index] ? availableCities[index].selected : true;
            availableCities[index] = cityData;
        } else {
            const cleanNew = name.toLowerCase().trim();
            const existingIdx = availableCities.findIndex(c => (c.name || '').toLowerCase().trim() === cleanNew);
            if (existingIdx !== -1) {
                cityData.selected = availableCities[existingIdx].selected;
                availableCities[existingIdx] = cityData;
            } else {
                cityData.selected = true;
                availableCities.push(cityData);
            }
        }

        const syncHotelsCheckbox = document.getElementById('modalSyncHotelsToDbCheckbox');
        if (syncToCloud && syncHotelsCheckbox && syncHotelsCheckbox.checked) {
            await quickSaveModalHotelsToMasterDb(true, false, false);
        }

        currentEditingCityIndex = null;
        closeModal('cityModal');
        renderCities();
        if (typeof saveState === 'function') saveState();

        const resultsEl = document.getElementById('results');
        if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
            calculate();
        }
    }
    
    function removeItem(type, index) {
        if (type === 'tour') availableTours.splice(index, 1);
        if (type === 'transfer') availableTransfers.splice(index, 1);
        if (type === 'city') availableCities.splice(index, 1);
        renderAll();
        const resultsEl = document.getElementById('results');
        if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
            calculate();
        }
    }
    
    function toggleSelection(type, index) {
        if (type === 'tour') availableTours[index].selected = !availableTours[index].selected;
        if (type === 'transfer') availableTransfers[index].selected = !availableTransfers[index].selected;
        if (type === 'city') availableCities[index].selected = !availableCities[index].selected;
        renderAll();
        const resultsEl = document.getElementById('results');
        if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
            calculate();
        }
    }

    function clearSelection(type) {
        let listToClear;
        if (type === 'tour') listToClear = availableTours;
        if (type === 'transfer') listToClear = availableTransfers;
        if (type === 'city') listToClear = availableCities;

        if (listToClear) {
            listToClear.forEach(item => item.selected = false);
            renderAll();
            const resultsEl = document.getElementById('results');
            if (resultsEl && resultsEl.style.display !== 'none' && typeof calculate === 'function') {
                calculate();
            }
        }
    }

    function renderAll() {
        renderTours();
        renderTransfers();
        renderCities();
    }

    // --- DATA & NOTIFICATIONS ---
    function showNotification(message, isError = false) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `fixed top-5 right-5 text-white py-2 px-4 rounded-lg shadow-lg transition-opacity duration-300 opacity-100 z-50 ${isError ? 'bg-red-500' : 'bg-green-500'}`;
        setTimeout(() => { notification.style.opacity = '0'; }, 3000);
    }

    function handleLogoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            logoDataUrl = e.target.result;
            const preview = document.getElementById('logoPreview');
            preview.src = logoDataUrl;
            preview.style.display = 'block';
            showNotification('Logo uploaded successfully!');
        };
        reader.readAsDataURL(file);
    }

    function exportData() {
        const data = {
            services: {
                tours: availableTours,
                transfers: availableTransfers,
                cities: availableCities
            },
            inputs: {},
            logo: logoDataUrl
        };
        allInputIds.forEach(id => { 
            const el = document.getElementById(id);
            if (el) data.inputs[id] = el.value;
        });
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadAnchorNode.setAttribute("download", `cost-data-${timestamp}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showNotification('Data exported successfully!');
    }

    function handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.inputs) {
                    allInputIds.forEach(id => {
                        if (data.inputs.hasOwnProperty(id)) {
                            const el = document.getElementById(id);
                            if (el) el.value = data.inputs[id];
                        }
                    });
                }
                if (data.services) {
                    availableTours = data.services.tours || [];
                    availableTransfers = data.services.transfers || [];
                    availableCities = data.services.cities || data.services.hotels || [];
                    if (document.getElementById('tourSearch')) document.getElementById('tourSearch').value = '';
                    if (document.getElementById('transferSearch')) document.getElementById('transferSearch').value = '';
                    if (document.getElementById('citySearch')) document.getElementById('citySearch').value = '';
                    renderAll();
                }
                if (data.logo) {
                    logoDataUrl = data.logo;
                    const preview = document.getElementById('logoPreview');
                    preview.src = logoDataUrl;
                    preview.style.display = 'block';
                }
                showNotification('Data imported successfully!');
                document.getElementById('results').style.display = 'none';
            } catch (error) {
                showNotification("Error: Invalid file format.", true);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
