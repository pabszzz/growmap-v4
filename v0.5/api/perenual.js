// Perenual API Integration — v0.3
// Docs: https://perenual.com/docs/api
// Free: 50 req/hr, 10K+ species with images

const PerenualAPI = {
    lastRequestTime: 0,
    cache: new Map(),

    async search(query, page = 1) {
        if (!GROWMAP_CONFIG.perenualApiKey) return [];
        await this.rateLimit();

        const cacheKey = `search:${query}:${page}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const url = `${GROWMAP_CONFIG.perenualBaseUrl}/species-list?key=${GROWMAP_CONFIG.perenualApiKey}&q=${encodeURIComponent(query)}&page=${page}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Perenual error: ${res.status}`);
            const data = await res.json();
            const results = (data.data || []).map(p => this.normalize(p));
            this.cache.set(cacheKey, results);
            return results;
        } catch (err) {
            console.warn('Perenual search error:', err.message);
            return [];
        }
    },

    async getDetails(perenualId) {
        if (!GROWMAP_CONFIG.perenualApiKey) return null;
        await this.rateLimit();

        const cacheKey = `detail:${perenualId}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const url = `${GROWMAP_CONFIG.perenualBaseUrl}/species/details/${perenualId}?key=${GROWMAP_CONFIG.perenualApiKey}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Perenual detail error: ${res.status}`);
            const data = await res.json();
            const plant = this.normalize(data);
            this.cache.set(cacheKey, plant);
            return plant;
        } catch (err) {
            console.warn('Perenual detail error:', err.message);
            return null;
        }
    },

    async fetchAll(maxPages = 5) {
        if (!GROWMAP_CONFIG.perenualApiKey) return [];
        console.log('Perenual: fetching up to', maxPages, 'pages...');

        const all = [];
        for (let page = 1; page <= maxPages; page++) {
            await this.rateLimit();
            const url = `${GROWMAP_CONFIG.perenualBaseUrl}/species-list?key=${GROWMAP_CONFIG.perenualApiKey}&page=${page}`;
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    console.warn('Perenual fetch page', page, 'failed:', res.status);
                    break;
                }
                const data = await res.json();
                const plants = (data.data || []).map(p => this.normalize(p));
                all.push(...plants);
                if (data.last_page && page >= data.last_page) break;
                if (data.data?.length < 30) break;
            } catch (err) {
                console.warn('Perenual fetch page', page, 'error:', err.message);
                break;
            }
        }
        console.log(`Perenual: fetched ${all.length} plants from ${maxPages} pages`);
        return all;
    },

    normalize(p) {
        const sciName = p.scientific_name?.[0] || p.scientific_name || '';
        const commonName = p.common_name || p.name || '';
        const sunlightHours = this.parseSunlight(p.sunlight);
        const [tempMin, tempMax] = this.parseTemperature(p.temperature_min_F, p.temperature_max_F);
        const [phMin, phMax] = this.parsePh(p.ph_min, p.ph_max);
        const [rainMin, rainMax] = this.parseRainfall(p.precipitation_min || p.watering);

        return {
            id: `perenual:${p.id}`,
            source: 'perenual',
            sourceId: p.id,
            name: commonName,
            scientificName: sciName,
            category: this.mapCategory(p.type || p.main_species_type || 'plant'),
            emoji: this.categoryEmoji(p.type),
            description: p.description || p.characteristics?.description || `${commonName} (${sciName}) — a species from Perenual database.`,
            imageUrl: this.getImageUrl(p),
            thumbnailUrl: this.getThumbnailUrl(p),
            edible: p.edible === true || p.edible === 'true',
            poisonous: p.poisonous_to_humans === 1 || p.poisonous_to_pets === 1,
            cycle: p.cycle || 'Perennial',

            requirements: {
                tempMin, tempMax,
                tempOptimalMin: tempMin != null ? tempMin + 3 : null,
                tempOptimalMax: tempMax != null ? tempMax - 3 : null,
                annualRainfallMin: rainMin,
                annualRainfallMax: rainMax,
                humidityMin: null,
                humidityMax: null,
                soilPhMin: phMin,
                soilPhMax: phMax,
                sunlightHoursMin: sunlightHours,
                frostTolerant: p.hardiness?.min !== undefined && p.hardiness.min <= -10,
                droughtTolerant: p.drought_tolerant === 1 || p.drought_tolerant === true,
                hardinessZoneMin: p.hardiness?.min || null,
                hardinessZoneMax: p.hardiness?.max || null,
            },
            growingSeason: p.cycle || 'Perennial',
            funFact: '',

            maintenance: p.maintenance || null,
            growthRate: p.growth_rate || null,
            invasive: p.invasive === 1 || p.invasive === true,
            indoor: p.indoor === 1 || p.indoor === true,
            flowers: p.flowers === 1 || p.flowers === true,
            fruits: p.fruits === 1 || p.fruits === true,
            foliage: p.foliage || null,
            pruningMonths: p.pruning_month || null,
        };
    },

    parseSunlight(sunlight) {
        if (!sunlight || !Array.isArray(sunlight)) return 6;
        const fullSun = sunlight.some(s => s.toLowerCase().includes('full sun'));
        const partSun = sunlight.some(s => s.toLowerCase().includes('part'));
        const shade = sunlight.some(s => s.toLowerCase().includes('shade'));
        if (fullSun) return 8;
        if (partSun) return 5;
        if (shade) return 3;
        return 6;
    },

    parseTemperature(minF, maxF) {
        const f2c = f => f != null ? Math.round((f - 32) * 5 / 9) : null;
        return [f2c(minF), f2c(maxF)];
    },

    parsePh(min, max) {
        return [
            min != null ? parseFloat(min) : null,
            max != null ? parseFloat(max) : null,
        ];
    },

    parseRainfall(precip) {
        if (!precip) return [300, 1200];
        const map = { low: [200, 500], medium: [500, 1000], high: [1000, 2500] };
        return map[precip.toLowerCase()] || [300, 1200];
    },

    mapCategory(type) {
        const map = {
            'tree': 'tree', 'shrub': 'shrub', 'grass': 'grain',
            'herb': 'herb', 'succulent': 'succulent', 'cactus': 'succulent',
            'vine': 'vine', 'climber': 'vine', 'fern': 'flower',
            'moss': 'flower', 'aquatic': 'aquatic', 'bamboo': 'tree',
            'palm': 'tree', 'conifer': 'tree', 'carnivorous': 'flower',
            'epiphyte': 'flower', 'bromeliad': 'flower', 'orchid': 'flower',
        };
        const t = type?.toLowerCase() || '';
        for (const [k, v] of Object.entries(map)) {
            if (t.includes(k)) return v;
        }
        return 'flower';
    },

    categoryEmoji(type) {
        const map = {
            'tree': '🌳', 'shrub': '🌿', 'grass': '🌾',
            'herb': '🌿', 'succulent': '🌵', 'cactus': '🌵',
            'vine': '🌿', 'climber': '🌿', 'fern': '🌿',
            'aquatic': '💧', 'bamboo': '🎋', 'palm': '🌴',
            'conifer': '🌲', 'orchid': '🪻',
        };
        const t = type?.toLowerCase() || '';
        for (const [k, v] of Object.entries(map)) {
            if (t.includes(k)) return v;
        }
        return '🌱';
    },

    getImageUrl(p) {
        return p.image_url || p.images?.default || p.images?.original || null;
    },

    getThumbnailUrl(p) {
        return p.thumbnail || p.images?.thumbnail || this.getImageUrl(p);
    },

    async rateLimit() {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < GROWMAP_CONFIG.perenualRateLimitMs) {
            await new Promise(r => setTimeout(r, GROWMAP_CONFIG.perenualRateLimitMs - elapsed));
        }
        this.lastRequestTime = Date.now();
    },
};
