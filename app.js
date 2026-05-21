// GrowMap v0.3 — API-powered Plant Explorer
// Features: Perenual + Trefle, images, 10K+ plants

const App = {
    map: null,
    marker: null,
    tileLayer: null,
    currentEnv: null,
    currentResults: [],
    activeCategory: 'all',
    currentSort: 'score-desc',
    searchQuery: '',
    darkMode: false,
    databaseReady: false,
    databaseStats: null,
    favorites: [],
    showFavoritesOnly: false,
    PAGE_SIZE: 30,
    renderPage: 0,
    compareList: [],

    async init() {
        this.loadFavorites();
        this.showLoading('🌱 Building plant database...');
        this.initMap();
        this.initUI();
        this.renderCategoryFilters();
        this.renderFavoritesBtn();
        this.renderCompareBtn();
        await this.buildDatabase();
        this.hideLoading();
        this.databaseReady = true;
        console.log('🚀 GrowMap v0.3 ready');
    },

    // ==================== DATABASE ====================
    async buildDatabase() {
        PlantMerger.onProgressChange((progress) => {
            this.updateLoadingText(`🌱 ${progress.step}`);
        });
        await PlantMerger.buildMasterDatabase();
        this.databaseStats = PlantMerger.getStats();
        this.updateDatabaseStats();
        return PlantMerger.masterList;
    },

    updateDatabaseStats() {
        const stats = this.databaseStats;
        if (!stats) return;
        const footer = document.getElementById('db-stats');
        if (footer) {
            const imgPct = stats.total > 0 ? Math.round(stats.withImages / stats.total * 100) : 0;
            footer.textContent = `${stats.total.toLocaleString()} plants · ${stats.withImages} with images (${imgPct}%) · ${stats.edible} edible`;
        }
    },

    // ==================== MAP ====================
    initMap() {
        this.map = L.map('map', {
            center: [30, 10],
            zoom: 3,
            zoomControl: true,
            attributionControl: true,
        });
        this.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19,
        }).addTo(this.map);
        this.map.on('click', (e) => {
            this.reverseGeocode(e.latlng.lat, e.latlng.lng);
        });
    },

    async reverseGeocode(lat, lng) {
        let name = `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`);
            const data = await res.json();
            if (data.display_name) {
                const parts = data.display_name.split(',');
                name = parts.slice(0, 3).join(',').trim();
            }
        } catch (e) { }
        this.onLocationSelected(lat, lng, name);
    },

    async onLocationSelected(lat, lng, name) {
        if (this.marker) this.map.removeLayer(this.marker);
        this.marker = L.marker([lat, lng]).addTo(this.map);
        this.map.flyTo([lat, lng], Math.max(this.map.getZoom(), 8), { duration: 1.2 });
        document.getElementById('map-overlay').classList.add('hidden');
        const panel = document.getElementById('results-panel');
        panel.classList.remove('panel-hidden');
        panel.classList.add('panel-visible');
        document.getElementById('location-name').textContent = name;
        document.getElementById('location-coords').textContent = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
        this.showLoading('Fetching climate data...');
        try {
            this.updateLoadingText('Analyzing 5 years of climate data...');
            const env = await EnvironmentFetcher.getFullEnvironmentProfile(lat, lng);
            this.currentEnv = env;
            this.updateClimateStats(env);
            this.updateLoadingText(`Scoring ${this.databaseStats?.total || 500}+ plants...`);
            await new Promise(r => setTimeout(r, 200));
            const allPlants = PlantMerger.masterList;
            this.currentResults = GrowabilityScorer.scoreAllPlants(allPlants, env);
            this.compareList = [];
            this.renderCompareBtn();
            this.renderPlants();
            this.hideLoading();
        } catch (err) {
            console.error('Error:', err);
            this.hideLoading();
            this.showError(err.message);
        }
    },

    updateClimateStats(env) {
        document.getElementById('stat-temp').textContent = env.avgTemp != null ? `${env.avgTemp.toFixed(1)}°C` : '—';
        document.getElementById('stat-rain').textContent = `${Math.round(env.annualRainfall)}mm`;
        document.getElementById('stat-sun').textContent = env.avgSunHours != null ? `${env.avgSunHours.toFixed(1)}h` : '—';
        document.getElementById('stat-humidity').textContent = env.avgHumidity != null ? `${Math.round(env.avgHumidity)}%` : '—';
        document.getElementById('stat-ph').textContent = env.soilPh != null ? env.soilPh.toFixed(1) : '—';
        document.getElementById('stat-zone').textContent = env.hardinessZone || '—';
    },

    // ==================== UI ====================
    initUI() {
        document.getElementById('plant-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderPlants();
        });
        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.renderPlants();
        });
        this.initLocationSearch();
        document.getElementById('btn-about').addEventListener('click', () => {
            document.getElementById('about-modal').classList.remove('hidden');
        });
        document.getElementById('btn-api').addEventListener('click', () => {
            this.showApiConfig();
        });
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.darkMode = !this.darkMode;
            document.documentElement.setAttribute('data-theme', this.darkMode ? 'dark' : 'light');
            localStorage.setItem('growmap-theme', this.darkMode ? 'dark' : 'light');
            this.updateMapTiles();
        });
        const savedTheme = localStorage.getItem('growmap-theme');
        if (savedTheme === 'dark') {
            this.darkMode = true;
            document.documentElement.setAttribute('data-theme', 'dark');
            this.updateMapTiles();
        }
        document.querySelectorAll('.modal-backdrop').forEach(el => {
            el.addEventListener('click', () => {
                el.closest('.modal').classList.add('hidden');
            });
        });
        document.querySelectorAll('.modal-close').forEach(el => {
            el.addEventListener('click', () => {
                el.closest('.modal').classList.add('hidden');
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            }
        });
    },

    renderFavoritesBtn() {
        const headerRight = document.querySelector('.header-right');
        if (!headerRight || document.getElementById('btn-favorites')) return;
        const btn = document.createElement('button');
        btn.id = 'btn-favorites';
        btn.className = 'header-btn';
        btn.title = 'Favorites';
        const count = this.favorites.length;
        btn.innerHTML = count > 0 ? `❤️ ${count}` : '❤️';
        btn.classList.toggle('has-favs', count > 0);
        btn.addEventListener('click', () => {
            this.showFavoritesOnly = !this.showFavoritesOnly;
            btn.classList.toggle('active', this.showFavoritesOnly);
            if (this.showFavoritesOnly) {
                this.activeCategory = 'all';
                document.querySelectorAll('#category-filters .cat-btn').forEach(b => b.classList.remove('active'));
                const allBtn = document.querySelector('#category-filters .cat-btn[data-cat="all"]');
                if (allBtn) allBtn.classList.add('active');
            }
            this.renderPlants();
        });
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) headerRight.insertBefore(btn, themeBtn);
        else headerRight.appendChild(btn);
    },

    renderCompareBtn() {
        const headerRight = document.querySelector('.header-right');
        if (!headerRight) return;
        let btn = document.getElementById('btn-compare');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'btn-compare';
            btn.className = 'header-btn';
            btn.title = 'Compare selected plants';
            btn.innerHTML = '⚖️';
            btn.addEventListener('click', () => {
                if (this.compareList.length >= 2) {
                    this.showCompareModal();
                }
            });
            const favBtn = document.getElementById('btn-favorites');
            if (favBtn) headerRight.insertBefore(btn, favBtn);
            else headerRight.appendChild(btn);
        }
        const count = this.compareList.length;
        btn.innerHTML = count >= 2 ? `⚖️ ${count}` : '⚖️';
        btn.classList.toggle('has-favs', count >= 2);
        btn.title = count >= 2 ? `Compare ${count} plants` : 'Select plants to compare (min 2)';
    },

    updateMapTiles() {
        this.map.removeLayer(this.tileLayer);
        const url = this.darkMode
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        this.tileLayer = L.tileLayer(url, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19,
        }).addTo(this.map);
    },

    // ==================== LOCATION SEARCH ====================
    initLocationSearch() {
        const input = document.getElementById('location-search');
        const suggestions = document.getElementById('loc-suggestions');
        const clearBtn = document.getElementById('loc-search-clear');
        let debounceTimer = null;
        input.addEventListener('input', () => {
            const q = input.value.trim();
            clearBtn.classList.toggle('hidden', q.length === 0);
            if (q.length < 2) { suggestions.classList.add('hidden'); return; }
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this.searchLocations(q), 300);
        });
        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.classList.add('hidden');
            suggestions.classList.add('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#location-search-wrapper')) suggestions.classList.add('hidden');
        });
        input.addEventListener('focus', () => {
            if (input.value.trim().length >= 2 && suggestions.children.length > 0) suggestions.classList.remove('hidden');
        });
    },

    async searchLocations(query) {
        const suggestions = document.getElementById('loc-suggestions');
        suggestions.innerHTML = '<div class="loc-sug-loading">🔍 Searching...</div>';
        suggestions.classList.remove('hidden');
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1&accept-language=en`,
                { headers: { 'User-Agent': 'GrowMap-PlantApp/1.0' } }
            );
            const data = await res.json();
            if (data.length === 0) {
                suggestions.innerHTML = '<div class="loc-sug-loading">No places found</div>';
                return;
            }
            suggestions.innerHTML = data.map(place => {
                const icon = this.getPlaceIcon(place.type);
                const parts = place.display_name.split(',');
                const name = parts[0].trim();
                const detail = parts.slice(1, 4).join(',').trim();
                return `
                    <div class="loc-suggestion-item" data-lat="${place.lat}" data-lng="${place.lon}" data-name="${place.display_name.replace(/"/g, '"')}">
                        <span class="loc-sug-icon">${icon}</span>
                        <div class="loc-sug-text">
                            <div class="loc-sug-name">${name}</div>
                            <div class="loc-sug-detail">${detail}</div>
                        </div>
                    </div>
                `;
            }).join('');
            suggestions.querySelectorAll('.loc-suggestion-item').forEach(item => {
                item.addEventListener('click', () => {
                    const lat = parseFloat(item.dataset.lat);
                    const lng = parseFloat(item.dataset.lng);
                    const name = item.dataset.name.split(',').slice(0, 3).join(',').trim();
                    document.getElementById('location-search').value = name;
                    suggestions.classList.add('hidden');
                    this.onLocationSelected(lat, lng, name);
                });
            });
        } catch (err) {
            suggestions.innerHTML = '<div class="loc-sug-loading">⚠️ Search failed</div>';
        }
    },

    getPlaceIcon(type) {
        const icons = { city: '🏙️', town: '🏘️', village: '🏡', hamlet: '🏠', suburb: '🏘️', neighbourhood: '📍', county: '🗺️', state: '🗺️', country: '🌍', continent: '🌐', administrative: '🏛️', residential: '🏠' };
        return icons[type] || '📍';
    },

    // ==================== CATEGORY FILTERS ====================
    renderCategoryFilters() {
        const container = document.getElementById('category-filters');
        const categories = [
            { id: 'all', name: 'All', emoji: '🌱' },
            { id: 'fruit', name: 'Fruits', emoji: '🍎' },
            { id: 'vegetable', name: 'Vegetables', emoji: '🥬' },
            { id: 'grain', name: 'Grains', emoji: '🌾' },
            { id: 'legume', name: 'Legumes', emoji: '🫘' },
            { id: 'nut', name: 'Nuts', emoji: '🥜' },
            { id: 'herb', name: 'Herbs', emoji: '🌿' },
            { id: 'flower', name: 'Flowers', emoji: '🌸' },
            { id: 'tree', name: 'Trees', emoji: '🌳' },
            { id: 'shrub', name: 'Shrubs', emoji: '🪴' },
            { id: 'succulent', name: 'Succulents', emoji: '🌵' },
            { id: 'cash_crop', name: 'Cash Crops', emoji: '☕' },
            { id: 'aquatic', name: 'Aquatic', emoji: '💧' },
            { id: 'vine', name: 'Vines', emoji: '🍇' },
        ];
        container.innerHTML = categories.map(cat =>
            `<button class="cat-btn ${cat.id === this.activeCategory ? 'active' : ''}" data-cat="${cat.id}">${cat.emoji} ${cat.name}</button>`
        ).join('');
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.cat-btn');
            if (!btn) return;
            this.activeCategory = btn.dataset.cat;
            container.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (this.showFavoritesOnly) {
                this.showFavoritesOnly = false;
                const favBtn = document.getElementById('btn-favorites');
                if (favBtn) favBtn.classList.remove('active');
            }
            this.renderPlants();
        });
    },

    // ==================== FAVORITES ❤️ ====================
    loadFavorites() {
        try {
            const saved = localStorage.getItem('growmap-favorites');
            this.favorites = saved ? JSON.parse(saved) : [];
        } catch (e) { this.favorites = []; }
        console.log(`❤️ Loaded ${this.favorites.length} favorites`);
    },

    saveFavorites() {
        try { localStorage.setItem('growmap-favorites', JSON.stringify(this.favorites)); } catch (e) { }
    },

    isFavorite(plantId) { return this.favorites.includes(plantId); },

    toggleFavorite(plantId) {
        const idx = this.favorites.indexOf(plantId);
        if (idx >= 0) this.favorites.splice(idx, 1);
        else this.favorites.push(plantId);
        this.saveFavorites();
        // Just update the heart icon on the card, don't re-render all
        const heart = document.querySelector(`.fav-btn[data-plant-id="${plantId}"]`);
        if (heart) {
            const nowFav = this.favorites.includes(plantId);
            heart.innerHTML = nowFav ? '❤️' : '🤍';
            heart.classList.toggle('favbed', nowFav);
            heart.title = nowFav ? 'Remove from favorites' : 'Add to favorites';
        }
        const modalHeart = document.querySelector(`.fav-btn-lg[data-plant-id="${plantId}"]`);
        if (modalHeart) {
            const nowFav = this.favorites.includes(plantId);
            modalHeart.innerHTML = nowFav ? '❤️' : '🤍';
            modalHeart.classList.toggle('favbed', nowFav);
            modalHeart.title = nowFav ? 'Remove from favorites' : 'Add to favorites';
        }
        const btn = document.getElementById('btn-favorites');
        if (btn) {
            const count = this.favorites.length;
            btn.innerHTML = count > 0 ? `❤️ ${count}` : '❤️';
            btn.classList.toggle('has-favs', count > 0);
        }
        // If showing favorites only, re-filter
        if (this.showFavoritesOnly) this.renderPlants();
    },

    // ==================== COMPARE ⚖️ ====================
    toggleCompare(plantId) {
        const idx = this.compareList.indexOf(plantId);
        if (idx >= 0) {
            this.compareList.splice(idx, 1);
        } else {
            if (this.compareList.length >= 5) return; // max 5
            this.compareList.push(plantId);
        }
        // Update checkbox visual
        const cb = document.querySelector(`.compare-cb[data-plant-id="${plantId}"]`);
        if (cb) {
            cb.checked = this.compareList.includes(plantId);
            cb.closest('.plant-card').classList.toggle('comparing', cb.checked);
        }
        this.renderCompareBtn();
    },

    showCompareModal() {
        const modal = document.getElementById('compare-modal');
        const body = document.getElementById('compare-modal-body');
        const results = this.compareList.map(id => this.currentResults.find(r => r.plant.id === id)).filter(Boolean);
        if (results.length < 2) return;

        body.innerHTML = `
            <div class="compare-table-wrapper">
                <table class="compare-table">
                    <thead>
                        <tr>
                            <th class="comp-label-col">Factor</th>
                            ${results.map(r => `
                                <th class="comp-plant-col">
                                    <span class="compare-emoji">${r.plant.emoji}</span>
                                    <div class="compare-name">${this.cleanPerenualGarbage(r.plant.name)}</div>
                                    <div class="compare-score" style="color: ${r.rating.color}">${r.totalScore}</div>
                                    <div style="font-size:9px;color:var(--text-muted)">${r.rating.label}</div>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colspan="${results.length + 1}" class="comp-section">🌡️ Climate Suitability</td></tr>
                        <tr>
                            <td class="comp-label">Total Score</td>
                            ${results.map(r => `<td class="comp-val"><span style="color:${r.rating.color};font-weight:700;font-size:18px">${r.totalScore}</span></td>`).join('')}
                        </tr>
                        <tr>
                            <td class="comp-label">Temperature</td>
                            ${results.map(r => {
                                const b = r.breakdown.temperature;
                                const ok = b.score >= b.max * 0.5;
                                return `<td class="comp-val ${ok ? 'ok' : 'nok'}">${ok ? '✅' : '⚠️'} ${b.score.toFixed(0)}/${b.max}</td>`;
                            }).join('')}
                        </tr>
                        <tr>
                            <td class="comp-label">Rainfall</td>
                            ${results.map(r => {
                                const b = r.breakdown.rainfall;
                                const ok = b.score >= b.max * 0.5;
                                return `<td class="comp-val ${ok ? 'ok' : 'nok'}">${ok ? '✅' : '⚠️'} ${b.score.toFixed(0)}/${b.max}</td>`;
                            }).join('')}
                        </tr>
                        <tr>
                            <td class="comp-label">Humidity</td>
                            ${results.map(r => {
                                const b = r.breakdown.humidity;
                                const ok = b.score >= b.max * 0.5;
                                return `<td class="comp-val ${ok ? 'ok' : 'nok'}">${ok ? '✅' : '⚠️'} ${b.score.toFixed(0)}/${b.max}</td>`;
                            }).join('')}
                        </tr>
                        <tr>
                            <td class="comp-label">Soil pH</td>
                            ${results.map(r => {
                                const b = r.breakdown.soil;
                                const ok = b.score >= b.max * 0.5;
                                return `<td class="comp-val ${ok ? 'ok' : 'nok'}">${ok ? '✅' : '⚠️'} ${b.score.toFixed(0)}/${b.max}</td>`;
                            }).join('')}
                        </tr>
                        <tr>
                            <td class="comp-label">Sunlight</td>
                            ${results.map(r => {
                                const b = r.breakdown.sunlight;
                                const ok = b.score >= b.max * 0.5;
                                return `<td class="comp-val ${ok ? 'ok' : 'nok'}">${ok ? '✅' : '⚠️'} ${b.score.toFixed(0)}/${b.max}</td>`;
                            }).join('')}
                        </tr>
                        <tr>
                            <td class="comp-label">Frost Tolerance</td>
                            ${results.map(r => {
                                const b = r.breakdown.frost;
                                const ok = b.score >= b.max * 0.5;
                                return `<td class="comp-val ${ok ? 'ok' : 'nok'}">${ok ? '✅' : '⚠️'} ${b.score.toFixed(0)}/${b.max}</td>`;
                            }).join('')}
                        </tr>
                        <tr><td colspan="${results.length + 1}" class="comp-section">📋 Plant Info</td></tr>
                        <tr>
                            <td class="comp-label">Category</td>
                            ${results.map(r => `<td class="comp-val">${this.getCategoryEmoji(r.plant.category)} ${r.plant.category}</td>`).join('')}
                        </tr>
                        <tr>
                            <td class="comp-label">Edible</td>
                            ${results.map(r => `<td class="comp-val">${r.plant.edible ? '✅ Yes' : '❌ No'}</td>`).join('')}
                        </tr>
                        <tr>
                            <td class="comp-label">Cycle</td>
                            ${results.map(r => `<td class="comp-val">${this.cleanPerenualGarbage(r.plant.cycle) || '—'}</td>`).join('')}
                        </tr>
                        <tr>
                            <td class="comp-label">Source</td>
                            ${results.map(r => `<td class="comp-val">${r.plant.source || 'local'}</td>`).join('')}
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="compare-actions" style="margin-top:16px;text-align:center">
                <button class="btn-secondary" onclick="document.getElementById('compare-modal').classList.add('hidden')">Close</button>
                <button class="btn-primary" onclick="App.clearCompare()" style="margin-left:8px">🗑️ Clear Selection</button>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    clearCompare() {
        this.compareList = [];
        document.querySelectorAll('.plant-card.comparing').forEach(c => c.classList.remove('comparing'));
        document.querySelectorAll('.compare-cb').forEach(cb => cb.checked = false);
        this.renderCompareBtn();
        document.getElementById('compare-modal').classList.add('hidden');
    },

    // ==================== RENDER PLANTS ====================
    renderPlants(resetPage = true) {
        const list = document.getElementById('plants-list');
        if (!this.currentResults.length) {
            list.innerHTML = '<div class="empty-state"><span>🌍</span><p>Click on the map to see plant growability scores</p></div>';
            return;
        }
        let results = [...this.currentResults];
        if (this.showFavoritesOnly) {
            results = results.filter(r => this.isFavorite(r.plant.id));
            if (results.length === 0) {
                list.innerHTML = '<div class="empty-state"><span>❤️</span><p>No favorited plants yet! Click the ❤️ on any plant to add it.</p></div>';
                document.getElementById('results-count').textContent = '0 plants';
                return;
            }
        }
        if (this.activeCategory !== 'all' && !this.showFavoritesOnly) {
            results = results.filter(r => r.plant.category === this.activeCategory);
        }
        if (this.searchQuery) {
            results = results.filter(r =>
                r.plant.name.toLowerCase().includes(this.searchQuery) ||
                r.plant.scientificName.toLowerCase().includes(this.searchQuery)
            );
        }
        switch (this.currentSort) {
            case 'score-desc': results.sort((a, b) => b.totalScore - a.totalScore); break;
            case 'score-asc': results.sort((a, b) => a.totalScore - b.totalScore); break;
            case 'name-asc': results.sort((a, b) => a.plant.name.localeCompare(b.plant.name)); break;
            case 'name-desc': results.sort((a, b) => b.plant.name.localeCompare(a.plant.name)); break;
        }
        const total = results.length;
        if (resetPage) this.renderPage = 0;
        const end = Math.min((this.renderPage + 1) * this.PAGE_SIZE, total);
        const pageItems = results.slice(0, end);
        const hasMore = end < total;
        const cardsHtml = pageItems.map((r, i) => {
            const rating = r.rating;
            const img = r.plant.thumbnailUrl || r.plant.imageUrl;
            const hasImage = !!img;
            const isFav = this.isFavorite(r.plant.id);
            const isComparing = this.compareList.includes(r.plant.id);
            return `
                <div class="plant-card ${isComparing ? 'comparing' : ''}" data-plant-id="${r.plant.id}" style="animation-delay: ${i * 0.02}s">
                    <div class="plant-card-header">
                        <div class="plant-info">
                            ${hasImage ? `<img class="plant-thumb" src="${img}" alt="${r.plant.name}" loading="lazy" onerror="this.onerror=null;this.style.display='none'">` : `<span class="plant-emoji">${r.plant.emoji}</span>`}
                            <div class="plant-names">
                                <div class="plant-name">${this.cleanPerenualGarbage(r.plant.name)}</div>
                                <div class="plant-scientific">${r.plant.scientificName}</div>
                                ${r.plant.edible ? '<span class="plant-badge edible-badge">🍽️ Edible</span>' : ''}
                                ${r.plant.poisonous ? '<span class="plant-badge poison-badge">☠️ Poisonous</span>' : ''}
                            </div>
                        </div>
                        <div class="plant-score-badge" style="background: ${rating.color}15; border: 1px solid ${rating.color}40">
                            <span class="score-number" style="color: ${rating.color}">${r.totalScore}</span>
                            <span class="score-label" style="color: ${rating.color}">${rating.label}</span>
                        </div>
                    </div>
                    <div class="score-bar-container">
                        <div class="score-bar" style="width: ${r.totalScore}%; background: linear-gradient(90deg, ${this.getBarGradient(r.totalScore)})"></div>
                    </div>
                    <div class="plant-meta-row">
                        <label class="compare-label" title="Add to compare">
                            <input type="checkbox" class="compare-cb" data-plant-id="${r.plant.id}" ${isComparing ? 'checked' : ''}>
                            <span>⚖️</span>
                        </label>
                        <span class="plant-category-tag">${this.getCategoryEmoji(r.plant.category)} ${r.plant.category}</span>
                        <span class="plant-source-tag">${r.plant.source || 'local'}</span>
                        ${r.plant.cycle ? `<span class="plant-cycle-tag">${this.cleanPerenualGarbage(r.plant.cycle)}</span>` : ''}
                        <button class="fav-btn ${isFav ? 'favbed' : ''}" data-plant-id="${r.plant.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${isFav ? '❤️' : '🤍'}</button>
                    </div>
                </div>
            `;
        }).join('');
        if (resetPage) {
            list.innerHTML = cardsHtml;
        } else {
            const oldBtn = document.getElementById('show-more-btn');
            if (oldBtn) oldBtn.remove();
            list.insertAdjacentHTML('beforeend', cardsHtml);
        }
        if (hasMore) {
            const remaining = total - end;
            list.insertAdjacentHTML('beforeend', `
                <button class="load-more-btn" id="show-more-btn">
                    Show ${Math.min(this.PAGE_SIZE, remaining)} More ${remaining > this.PAGE_SIZE ? `(${remaining} remaining)` : ''} ↓
                </button>
            `);
            document.getElementById('show-more-btn').addEventListener('click', () => {
                this.renderPage++;
                this.renderPlants(false);
            });
        }
        document.getElementById('results-count').textContent = `${total} plants (showing ${end})`;

        // Fav button handlers (no re-render!)
        list.querySelectorAll('.fav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFavorite(btn.dataset.plantId);
            });
        });

        // Compare checkbox handlers
        list.querySelectorAll('.compare-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                this.toggleCompare(cb.dataset.plantId);
            });
        });

        // Click handlers for plant cards (don't fire if clicking checkbox/label)
        list.querySelectorAll('.plant-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.compare-label') || e.target.closest('.fav-btn')) return;
                const id = card.dataset.plantId;
                const result = this.currentResults.find(r => r.plant.id === id);
                if (result) this.showPlantModal(result);
            });
        });
    },

    getBarGradient(score) {
        if (score >= 80) return '#00d97e, #7cffb2';
        if (score >= 60) return '#f5c542, #ffe066';
        if (score >= 40) return '#ff8c42, #ffb380';
        if (score >= 20) return '#ff4757, #ff7979';
        return '#555, #777';
    },

    getCategoryEmoji(cat) {
        const map = { 'vegetable': '🥬', 'fruit': '🍎', 'herb': '🌿', 'flower': '🌸', 'tree': '🌳', 'shrub': '🪴', 'succulent': '🌵', 'grain': '🌾', 'legume': '🫘', 'nut': '🥜', 'cash_crop': '☕', 'aquatic': '💧', 'vine': '🍇' };
        return map[cat] || '🌱';
    },

    // ==================== PLANT MODAL ====================
    showPlantModal(result) {
        const { plant, totalScore, breakdown, rating } = result;
        const r = plant.requirements;
        const env = this.currentEnv;
        const modal = document.getElementById('plant-modal');
        const body = document.getElementById('modal-body');
        const isFav = this.isFavorite(plant.id);
        const matchIcon = (match) => match ? '✅' : '❌';
        const tempMatch = env.avgTemp >= r.tempMin && env.avgTemp <= r.tempMax;
        const rainMatch = env.annualRainfall >= r.annualRainfallMin && env.annualRainfall <= r.annualRainfallMax;
        const humMatch = env.avgHumidity != null && env.avgHumidity >= r.humidityMin && env.avgHumidity <= r.humidityMax;
        const phMatch = env.soilPh != null && env.soilPh >= r.soilPhMin && env.soilPh <= r.soilPhMax;
        const sunMatch = env.avgSunHours != null && env.avgSunHours >= r.sunlightHoursMin;
        const frostMatch = r.frostTolerant || env.frostDaysPerYear === 0;
        const rows = [
            { icon: '🌡️', label: 'Temperature', location: `${env.avgTemp != null ? env.avgTemp.toFixed(1) + '°C' : '—'} avg`, needs: `${r.tempMin ?? '?'}°C — ${r.tempMax ?? '?'}°C`, optimal: r.tempOptimalMin ? `${r.tempOptimalMin}°C — ${r.tempOptimalMax}°C` : null, match: tempMatch, score: breakdown.temperature.score, max: breakdown.temperature.max },
            { icon: '🌧️', label: 'Rainfall', location: `${Math.round(env.annualRainfall)} mm/yr`, needs: `${r.annualRainfallMin} — ${r.annualRainfallMax} mm/yr`, optimal: null, match: rainMatch, score: breakdown.rainfall.score, max: breakdown.rainfall.max },
            { icon: '💧', label: 'Humidity', location: `${env.avgHumidity != null ? Math.round(env.avgHumidity) + '%' : '—'}`, needs: `${r.humidityMin ?? '?'}% — ${r.humidityMax ?? '?'}%`, optimal: null, match: humMatch, score: breakdown.humidity.score, max: breakdown.humidity.max },
            { icon: '🧪', label: 'Soil pH', location: `${env.soilPh != null ? env.soilPh.toFixed(1) : '—'}`, needs: `${r.soilPhMin ?? '?'} — ${r.soilPhMax ?? '?'}`, optimal: null, match: phMatch, score: breakdown.soil.score, max: breakdown.soil.max },
            { icon: '☀️', label: 'Sunlight', location: `${env.avgSunHours != null ? env.avgSunHours.toFixed(1) + 'h/day' : '—'}`, needs: `${r.sunlightHoursMin ?? '?'}h+ /day`, optimal: null, match: sunMatch, score: breakdown.sunlight.score, max: breakdown.sunlight.max },
            { icon: '❄️', label: 'Frost', location: `${Math.round(env.frostDaysPerYear)} frost days/yr`, needs: r.frostTolerant ? 'Frost tolerant ✔️' : 'No frost ⚠️', optimal: null, match: frostMatch, score: breakdown.frost.score, max: breakdown.frost.max },
        ];
        const img = plant.imageUrl || plant.thumbnailUrl;
        const imageHtml = img ? `<img class="modal-main-image" src="${img}" alt="${plant.name}" onerror="this.style.display='none'" loading="lazy">` : '';
        const cleanDesc = this.cleanPerenualGarbage(plant.description);
        const cleanSeason = this.cleanPerenualGarbage(plant.growingSeason);
        const cleanFunFact = this.cleanPerenualGarbage(plant.funFact);
        body.innerHTML = `
            <div class="modal-plant-header">
                ${imageHtml || `<span class="modal-emoji">${plant.emoji}</span>`}
                <div>
                    <div class="modal-plant-name">${this.cleanPerenualGarbage(plant.name)} <button class="fav-btn fav-btn-lg ${isFav ? 'favbed' : ''}" data-plant-id="${plant.id}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${isFav ? '❤️' : '🤍'}</button></div>
                    <div class="modal-scientific">${plant.scientificName}</div>
                    <div class="modal-tags">
                        ${plant.edible ? '<span class="plant-badge edible-badge">🍽️ Edible</span>' : ''}
                        ${plant.poisonous ? '<span class="plant-badge poison-badge">☠️ Poisonous</span>' : ''}
                        <span class="plant-source-tag">${plant.source}</span>
                        ${plant.cycle ? `<span class="plant-cycle-tag">${this.cleanPerenualGarbage(plant.cycle)}</span>` : ''}
                    </div>
                </div>
            </div>
            <p class="modal-description">${cleanDesc}</p>
            <div class="modal-score-hero">
                <div class="modal-score-number" style="color: ${rating.color}">${totalScore}</div>
                <div class="modal-score-label" style="color: ${rating.color}">${rating.emoji} ${rating.label} Growability</div>
            </div>
            <h3 class="modal-section-title">📊 Location vs Plant Requirements</h3>
            <table class="comparison-table">
                <thead><tr><th>Factor</th><th>📍 This Location</th><th>🌱 Plant Needs</th><th>Match</th><th>Score</th></tr></thead>
                <tbody>${rows.map(row => `
                    <tr class="${row.match ? 'row-match' : 'row-mismatch'}">
                        <td class="comp-factor">${row.icon} ${row.label}</td>
                        <td class="comp-location">${row.location}</td>
                        <td class="comp-needs">${row.needs}${row.optimal ? `<br><span class="comp-optimal">Optimal: ${row.optimal}</span>` : ''}</td>
                        <td class="comp-match">${matchIcon(row.match)}</td>
                        <td class="comp-score"><div class="mini-bar-container"><div class="mini-bar" style="width: ${(row.score / row.max) * 100}%; background: ${this.getBarGradient((row.score / row.max) * 100)}"></div></div><span>${row.score.toFixed(1)}/${row.max}</span></td>
                    </tr>
                `).join('')}</tbody>
            </table>
            <div class="modal-extras">
                <div class="extra-item"><strong>🗓️ Growing Season:</strong> ${cleanSeason}</div>
                <div class="extra-item"><strong>🗺️ Hardiness Zones:</strong> ${r.hardinessZoneMin ?? '?'}–${r.hardinessZoneMax ?? '?'} <span class="comp-vs">(This location: Zone ${env.hardinessZone})</span></div>
                <div class="extra-item"><strong>🏜️ Drought Tolerant:</strong> ${r.droughtTolerant ? 'Yes ✔️' : 'No'}</div>
                ${plant.maintenance ? `<div class="extra-item"><strong>🔧 Maintenance:</strong> ${plant.maintenance}</div>` : ''}
                ${plant.growthRate ? `<div class="extra-item"><strong>📈 Growth Rate:</strong> ${plant.growthRate}</div>` : ''}
            </div>
            ${cleanFunFact ? `<div class="modal-funfact">💡 ${cleanFunFact}</div>` : ''}
        `;
        const modalFavBtn = body.querySelector('.fav-btn-lg');
        if (modalFavBtn) {
            modalFavBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFavorite(plant.id);
            });
        }
        modal.classList.remove('hidden');
    },

    // ==================== API CONFIG MODAL ====================
    showApiConfig() {
        const modal = document.getElementById('api-modal');
        const body = document.getElementById('api-modal-body');
        const stats = this.databaseStats;
        body.innerHTML = `
            <h3>🔌 API Configuration</h3>
            <p class="api-desc">Connect to plant databases for <strong>10,000+ species with images</strong>.</p>
            <div class="api-status-grid">
                <div class="api-status-card">
                    <div class="api-status-header"><span class="api-logo">🌿</span><div><strong>Perenual</strong><span class="api-status-dot ${GROWMAP_CONFIG.perenualApiKey ? 'green' : 'red'}"></span></div></div>
                    <div class="api-status-info">${GROWMAP_CONFIG.perenualApiKey ? '<span>✓ Connected</span>' : '<span>✗ Not connected</span>'}</div>
                    <div class="api-field"><label>API Key:</label><input type="password" id="perenual-key-input" value="${GROWMAP_CONFIG.perenualApiKey}" placeholder="Enter Perenual API key..."><a href="https://perenual.com/dashboard" target="_blank" class="api-link">Get free key →</a></div>
                </div>
                <div class="api-status-card">
                    <div class="api-status-header"><span class="api-logo">🌺</span><div><strong>Trefle</strong><span class="api-status-dot ${GROWMAP_CONFIG.trefleApiToken ? 'green' : 'red'}"></span></div></div>
                    <div class="api-status-info">${GROWMAP_CONFIG.trefleApiToken ? '<span>✓ Connected</span>' : '<span>✗ Not connected</span>'}</div>
                    <div class="api-field"><label>API Token:</label><input type="password" id="trefle-key-input" value="${GROWMAP_CONFIG.trefleApiToken}" placeholder="Enter Trefle API token..."><a href="https://trefle.io" target="_blank" class="api-link">Get free token →</a></div>
                </div>
            </div>
            <div class="api-db-stats">
                <h4>📊 Database Status</h4>
                <div class="db-stat-row"><span>Total plants:</span><strong>${stats?.total?.toLocaleString() || '—'}</strong></div>
                <div class="db-stat-row"><span>With images:</span><strong>${stats?.withImages?.toLocaleString() || '—'}</strong></div>
                <div class="db-stat-row"><span>Edible:</span><strong>${stats?.edible?.toLocaleString() || '—'}</strong></div>
                <div class="db-stat-row"><span>Sources:</span><strong>${stats?.sources ? `Local: ${stats.sources.local}, Perenual: ${stats.sources.perenual}, Trefle: ${stats.sources.trefle}` : '—'}</strong></div>
            </div>
            <div class="api-actions">
                <button id="btn-save-keys" class="btn-primary">💾 Save & Rebuild</button>
                <button id="btn-refresh-db" class="btn-secondary">🔄 Refresh</button>
            </div>
        `;
        modal.classList.remove('hidden');
        document.getElementById('btn-save-keys').addEventListener('click', async () => {
            GROWMAP_CONFIG.perenualApiKey = document.getElementById('perenual-key-input').value.trim();
            GROWMAP_CONFIG.trefleApiToken = document.getElementById('trefle-key-input').value.trim();
            modal.classList.add('hidden');
            this.showLoading('🔄 Rebuilding database with new API keys...');
            await this.buildDatabase();
            this.hideLoading();
            alert('✅ Database rebuilt!');
        });
        document.getElementById('btn-refresh-db').addEventListener('click', async () => {
            modal.classList.add('hidden');
            this.showLoading('🔄 Refreshing database...');
            await this.buildDatabase();
            this.hideLoading();
        });
    },

    // ==================== CLEAN PERENUAL GARBAGE ====================
    cleanPerenualGarbage(text) {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text;
        cleaned = cleaned.replace(/Upgrade Plans To Premium\/Supreme[^.]*\./gi, '');
        cleaned = cleaned.replace(/Upgrade Plans To Premium\/Supreme\s*-\s*https?:\/\/[^\s]+/gi, '');
        cleaned = cleaned.replace(/Premium\/Supreme[^.]*\./gi, '');
        cleaned = cleaned.replace(/I['']m sorry[^.]*\./gi, '');
        cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '');
        cleaned = cleaned.replace(/Upgrade[^.]*\./gi, '');
        cleaned = cleaned.replace(/Premium[^.]*\./gi, '');
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    },

    // ==================== LOADING & ERRORS ====================
    showLoading(text) {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-overlay').classList.remove('hidden');
    },

    updateLoadingText(text) {
        document.getElementById('loading-text').textContent = text;
    },

    hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
    },

    showError(msg) {
        const list = document.getElementById('plants-list');
        list.innerHTML = `<div class="empty-state"><span>⚠️</span><p>Error: ${msg}<br><br>Please try a different location.</p></div>`;
    },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
