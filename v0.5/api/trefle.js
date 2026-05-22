// Trefle API Integration — v0.3 (fallback)
// Docs: https://docs.trefle.io
// Provides 5K+ species with images

const TrefleAPI = {
    lastRequestTime: 0,
    cache: new Map(),

    async search(query, page = 1) {
        if (!GROWMAP_CONFIG.trefleApiToken) return [];
        await this.rateLimit();

        const cacheKey = `search:${query}:${page}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const url = `${GROWMAP_CONFIG.trefleBaseUrl}/plants?token=${GROWMAP_CONFIG.trefleApiToken}&q=${encodeURIComponent(query)}&page=${page}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Trefle error: ${res.status}`);
            const data = await res.json();
            const results = (data.data || []).map(p => this.normalize(p));
            this.cache.set(cacheKey, results);
            return results;
        } catch (err) {
            console.warn('Trefle search error:', err.message);
            return [];
        }
    },

    async fetchAll(maxPages = 5) {
        if (!GROWMAP_CONFIG.trefleApiToken) return [];
        console.log('Trefle: fetching up to', maxPages, 'pages...');

        const all = [];
        for (let page = 1; page <= maxPages; page++) {
            await this.rateLimit();
            const url = `${GROWMAP_CONFIG.trefleBaseUrl}/plants?token=${GROWMAP_CONFIG.trefleApiToken}&page=${page}&filter[has_image]=true`;
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    console.warn('Trefle fetch page', page, 'failed:', res.status);
                    break;
                }
                const data = await res.json();
                const plants = (data.data || []).map(p => this.normalize(p));
                all.push(...plants);
                if (data.links?.last === null || !data.data || data.data.length < 20) break;
            } catch (err) {
                console.warn('Trefle fetch page', page, 'error:', err.message);
                break;
            }
        }
        console.log(`Trefle: fetched ${all.length} plants from ${maxPages} pages`);
        return all;
    },

    async getDetails(trefleId) {
        if (!GROWMAP_CONFIG.trefleApiToken) return null;
        await this.rateLimit();

        const cacheKey = `detail:${trefleId}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const url = `${GROWMAP_CONFIG.trefleBaseUrl}/plants/${trefleId}?token=${GROWMAP_CONFIG.trefleApiToken}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Trefle detail error: ${res.status}`);
            const data = await res.json();
            const plant = this.normalize(data.data || data);
            this.cache.set(cacheKey, plant);
            return plant;
        } catch (err) {
            console.warn('Trefle detail error:', err.message);
            return null;
        }
    },

    normalize(p) {
        const sciName = p.scientific_name || '';
        const commonName = p.common_name || p.name || '';
        const img = p.image_url || p.images?.flower?.image_url ||
            p.images?.fruit?.image_url || p.images?.leaf?.image_url ||
            p.images?.bark?.image_url || null;

        return {
            id: `trefle:${p.id}`,
            source: 'trefle',
            sourceId: p.id,
            name: commonName,
            scientificName: sciName,
            category: this.mapCategory(p.main_species_type || p.category || 'plant'),
            emoji: '🌱',
            description: this.makeDescription(p),
            imageUrl: img,
            thumbnailUrl: img,
            edible: p.edible === true || p.edible_part !== null || false,
            poisonous: p.vegetable === false || false,
            cycle: 'Perennial',

            requirements: {
                tempMin: null,
                tempMax: null,
                tempOptimalMin: null,
                tempOptimalMax: null,
                annualRainfallMin: null,
                annualRainfallMax: null,
                humidityMin: null,
                humidityMax: null,
                soilPhMin: null,
                soilPhMax: null,
                sunlightHoursMin: null,
                frostTolerant: null,
                droughtTolerant: null,
                hardinessZoneMin: this.parseZone(p.zone_minimum),
                hardinessZoneMax: this.parseZone(p.zone_maximum),
            },
            growingSeason: 'Perennial',
            funFact: '',

            maintenance: null,
            growthRate: null,
            invasive: false,
            indoor: false,
            flowers: false,
            fruits: false,
            foliage: null,
            pruningMonths: null,
        };
    },

    makeDescription(p) {
        const parts = [];
        if (p.common_name) parts.push(p.common_name);
        if (p.scientific_name) parts.push(`(${p.scientific_name})`);
        parts.push('from Trefle database.');
        return parts.join(' ');
    },

    mapCategory(type) {
        const map = {
            'tree': 'tree', 'shrub': 'shrub', 'grass': 'grain',
            'herb': 'herb', 'succulent': 'succulent', 'cactus': 'succulent',
            'vine': 'vine', 'climber': 'vine', 'fern': 'flower',
            'forb': 'herb', 'subshrub': 'shrub',
        };
        const t = type?.toLowerCase() || '';
        for (const [k, v] of Object.entries(map)) {
            if (t.includes(k)) return v;
        }
        return 'flower';
    },

    parseZone(zoneStr) {
        if (!zoneStr) return null;
        const num = parseFloat(zoneStr);
        return isNaN(num) ? null : num;
    },

    async rateLimit() {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < GROWMAP_CONFIG.trefleRateLimitMs) {
            await new Promise(r => setTimeout(r, GROWMAP_CONFIG.trefleRateLimitMs - elapsed));
        }
        this.lastRequestTime = Date.now();
    },
};
