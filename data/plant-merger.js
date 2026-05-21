// Plant Database Merger — v0.3.2
// Combines: local 502 plants + pre-fetched Perenual (900+) + Trefle
// No API calls in browser — all pre-loaded from local files

const PlantMerger = {
    masterList: [],
    mergeProgress: { total: 0, current: 0, step: '' },
    onProgress: null,

    onProgressChange(callback) {
        this.onProgress = callback;
    },

    reportProgress(step, current, total) {
        this.mergeProgress = { step, current, total };
        if (this.onProgress) this.onProgress(this.mergeProgress);
    },

    async buildMasterDatabase() {
        const start = Date.now();
        console.log('🌱 PlantMerger: Building master database...');

        const plants = [];

        // 1. Start with local plants (always)
        this.reportProgress('Loading local plants (502 base)...', 0, 4);
        plants.push(...PLANTS_CORE);
        console.log(`  ✓ ${PLANTS_CORE.length} local plants loaded`);

        // 2. Add pre-fetched Perenual plants (split across chunks, ~3MB each)
        const perenualChunks = [];
        // Check each const variable directly (const globals don't appear on window)
        if (typeof PLANTS_PERENUAL !== 'undefined' && PLANTS_PERENUAL.length > 0) perenualChunks.push(...PLANTS_PERENUAL);
        if (typeof PLANTS_PERENUAL_2 !== 'undefined' && PLANTS_PERENUAL_2.length > 0) perenualChunks.push(...PLANTS_PERENUAL_2);
        if (typeof PLANTS_PERENUAL_3 !== 'undefined' && PLANTS_PERENUAL_3.length > 0) perenualChunks.push(...PLANTS_PERENUAL_3);
        if (typeof PLANTS_PERENUAL_4 !== 'undefined' && PLANTS_PERENUAL_4.length > 0) perenualChunks.push(...PLANTS_PERENUAL_4);
        if (typeof PLANTS_PERENUAL_5 !== 'undefined' && PLANTS_PERENUAL_5.length > 0) perenualChunks.push(...PLANTS_PERENUAL_5);
        if (perenualChunks.length > 0) {
            this.reportProgress(`Merging ${perenualChunks.length} Perenual plants...`, 1, 4);
            const merged = this.mergeInto(plants, perenualChunks);
            plants.length = 0;
            plants.push(...merged.list);
            console.log(`  ✓ ${perenualChunks.length} from Perenual → ${merged.added} new, ${merged.skipped} deduplicated`);
        } else {
            console.log('  ⚠️  PLANTS_PERENUAL not found — skipping');
        }




        // 3. Recategorize Perenual plants by keyword (they came as tree/herb/shrub)
        this.reportProgress('Recategorizing plants...', 2, 4);
        this.recategorizeByKeyword(plants);

        // 4. Final sort
        this.reportProgress('Finalizing database...', 3, 4);
        this.masterList = this.finalSort(plants);

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);

        // Stats by category
        const stats = {};
        for (const p of this.masterList) {
            const cat = p.category || 'other';
            stats[cat] = (stats[cat] || 0) + 1;
        }
        console.log(`🌱 PlantMerger: Done! ${this.masterList.length} plants in ${elapsed}s`);
        console.log('  Category breakdown:', JSON.stringify(stats));
        console.log('  Fruits in merged DB:', stats['fruit'] || 0);

        this.reportProgress(`Ready: ${this.masterList.length} plants`, 2, 3);

        return this.masterList;
    },

    mergeInto(existing, newPlants) {
        const seen = new Map();
        const list = [];

        // Index existing
        for (const p of existing) {
            const key = this.dedupKey(p);
            if (!seen.has(key) || this.isBetter(p, seen.get(key))) {
                seen.set(key, p);
            }
        }

        // Add new, deduplicating
        let added = 0;
        let skipped = 0;
        for (const p of newPlants) {
            const key = this.dedupKey(p);
            if (seen.has(key)) {
                const existing = seen.get(key);
                const better = this.isBetter(p, existing);
                if (better) {
                    seen.set(key, p);
                }
                skipped++;
            } else {
                seen.set(key, p);
                added++;
            }
        }

        for (const p of seen.values()) {
            list.push(p);
        }

        return { list, added, skipped };
    },

    dedupKey(plant) {
        let sci = (plant.scientificName || '').toLowerCase().trim().replace(/\s+/g, ' ');
        // Strip cultivar/variety/subspecies names so "Olea europaea" and "Olea europaea 'Arbequina'" match
        sci = sci.replace(/[''][^']*['']/g, '');          // remove 'CultivarName'
        sci = sci.replace(/\b(var\.|subsp\.|f\.|ssp\.)\s*\S+/g, ''); // remove var. x, subsp. y, etc.
        sci = sci.replace(/cv\.\s*\S+/g, '');              // remove cv. Cultivar
        // Normalize special characters
        sci = sci.replace(/[×xΧχ]/g, 'x')
                 .replace(/['’ʻʼˈ]/g, "'")
                 .replace(/[–—−]/g, '-')
                 .replace(/[àáâãäå]/g, 'a')
                 .replace(/[èéêë]/g, 'e')
                 .replace(/[ìíîï]/g, 'i')
                 .replace(/[òóôõö]/g, 'o')
                 .replace(/[ùúûü]/g, 'u')
                 .replace(/[ç]/g, 'c')
                 .replace(/\s+/g, ' ')
                 .trim();
        if (sci && sci !== '') return `sci:${sci}`;
        return `id:${plant.id}`;
    },

    isBetter(a, b) {
        // CRITICAL: Local hand-curated plants ALWAYS win over external sources
        // But when a local plant wins, we MERGE the image from Perenual if available
        const isLocal = p => p.source === 'local' || p.source === undefined || p.source == null;
        if (isLocal(a) && !isLocal(b)) {
            // Local wins — but steal the image from Perenual
            if (b.imageUrl && !a.imageUrl) a.imageUrl = b.imageUrl;
            if (b.thumbnailUrl && !a.thumbnailUrl) a.thumbnailUrl = b.thumbnailUrl;
            return true;
        }
        if (isLocal(b) && !isLocal(a)) {
            // Local wins — but steal the image from Perenual
            if (a.imageUrl && !b.imageUrl) b.imageUrl = a.imageUrl;
            if (a.thumbnailUrl && !b.thumbnailUrl) b.thumbnailUrl = a.thumbnailUrl;
            return false;
        }

        let aScore = 0, bScore = 0;

        const countFields = p => {
            let s = 0;
            // Images from Perenual are UNRELIABLE — don't give them weight
            // Only trust local images
            if (p.imageUrl && p.source === 'local') s += 20;
            if (p.description && p.description.length > 20) s += 10;
            if (p.requirements.tempMin != null) s += 5;
            if (p.requirements.tempMax != null) s += 5;
            if (p.requirements.sunlightHoursMin != null) s += 5;
            if (p.requirements.soilPhMin != null) s += 3;
            if (p.requirements.annualRainfallMin != null) s += 3;
            if (p.requirements.frostTolerant != null) s += 2;
            if (p.edible) s += 3;
            if (p.maintenance) s += 2;
            if (p.growthRate) s += 2;
            return s;
        };

        aScore = countFields(a);
        bScore = countFields(b);

        return aScore > bScore;
    },

    recategorizeByKeyword(plants) {
        // Map of category → regex word-boundary keywords for accurate matching
        // Order matters: more specific matches first
        const rules = [
            // === GRAINS ===
            { cat: 'grain', emoji: '🌾', keywords: ['amaranth', 'barley', 'buckwheat', 'maize', 'millet', 'oat', 'quinoa', 'rice', 'rye', 'sorghum', 'spelt', 'teff', 'triticale', 'wheat', 'wild rice', 'corn', 'popcorn', 'grain'] },

            // === FRUITS ===
            { cat: 'fruit', emoji: '🍎', keywords: ['apple', 'apricot', 'avocado', 'banana', 'blackberry', 'black currant', 'blueberry', 'boysenberry', 'cherry', 'cherimoya', 'citrus', 'clementine', 'coconut', 'crabapple', 'cranberry', 'currant', 'damson'] },
            { cat: 'fruit', emoji: '🍎', keywords: ['date', 'dragonfruit', 'elderberry', 'feijoa', 'fig', 'goji', 'gooseberry', 'grapefruit', 'grape', 'guava', 'honeydew', 'huckleberry', 'jabuticaba', 'jackfruit', 'jujube', 'kiwi', 'kumquat'] },
            { cat: 'fruit', emoji: '🍎', keywords: ['lemon', 'lime', 'lingonberry', 'loganberry', 'longan', 'loquat', 'lychee', 'mandarin', 'mango', 'mangosteen', 'marionberry', 'mulberry', 'nectarine', 'olive', 'orange', 'papaya', 'passionfruit', 'passion fruit'] },
            { cat: 'fruit', emoji: '🍎', keywords: ['peach', 'pear', 'persimmon', 'pineapple', 'plantain', 'plum', 'pomegranate', 'pomelo', 'prune', 'quince', 'raisin', 'rambutan', 'raspberry', 'satsuma', 'star fruit', 'starfruit', 'strawberry', 'tamarind', 'tangerine', 'watermelon', 'cantaloupe', 'muskmelon'] },
            { cat: 'fruit', emoji: '🍎', keywords: ['fruit', 'berry'] },

            // === VEGETABLES ===
            { cat: 'vegetable', emoji: '🥦', keywords: ['artichoke', 'arugula', 'asparagus', 'beet', 'bok choy', 'broccoli', 'broccolini', 'brussels sprout', 'cabbage', 'carrot', 'cauliflower', 'celeriac', 'celery', 'chard', 'chicory', 'collard', 'corn salad'] },
            { cat: 'vegetable', emoji: '🥦', keywords: ['cucumber', 'daikon', 'eggplant', 'endive', 'fennel', 'garlic', 'ginger', 'horseradish', 'jicama', 'kale', 'kohlrabi', 'leek', 'lettuce', 'mâche', 'mesclun', 'okra', 'onion', 'nopal'] },
            { cat: 'vegetable', emoji: '🥦', keywords: ['parsnip', 'pea', 'pepper', 'potato', 'pumpkin', 'radicchio', 'radish', 'rhubarb', 'rutabaga', 'salsify', 'scallion', 'shallot', 'spinach', 'squash', 'sweet potato', 'taro', 'tomatillo', 'tomato', 'turnip', 'watercress', 'yam', 'zucchini', 'cress', 'sprout', 'chard'] },

            // === LEGUMES ===
            { cat: 'legume', emoji: '🫘', keywords: ['bean', 'chickpea', 'fava', 'lentil', 'peanut', 'soybean', 'soy', 'lupine', 'alfalfa', 'clover', 'cowpea', 'pigeon pea', 'legume', 'pulse'] },

            // === NUTS ===
            { cat: 'nut', emoji: '🥜', keywords: ['almond', 'brazil nut', 'cashew', 'chestnut', 'hazelnut', 'macadamia', 'pecan', 'pistachio', 'walnut', 'hickory', 'filbert', 'nut'] },

            // === HERBS ===
            { cat: 'herb', emoji: '🌿', keywords: ['basil', 'chive', 'cilantro', 'dill', 'lavender', 'lemon balm', 'lemon verbena', 'marjoram', 'mint', 'oregano', 'parsley', 'rosemary', 'sage', 'savory', 'tarragon', 'thyme', 'herb'] },

            // === TROPICAL / PALMS ===
            { cat: 'tree', emoji: '🌴', keywords: ['palm', 'bamboo', 'palm tree', 'sago'] },

            // === FLOWERS ===
            { cat: 'flower', emoji: '🌺', keywords: ['rose', 'tulip', 'daisy', 'lily', 'orchid', 'sunflower', 'chrysanthemum', 'daffodil', 'marigold', 'hibiscus', 'petunia', 'lavender', 'iris', 'peony', 'poppy', 'zinnia', 'azalea', 'begonia', 'carnation', 'cosmos', 'crocus', 'delphinium', 'fuchsia', 'gardenia', 'geranium', 'gladiolus', 'hollyhock', 'hyacinth', 'hydrangea', 'jasmine', 'lilac', 'magnolia', 'narcissus', 'pansy', 'rhododendron', 'snapdragon', 'violet'] },
            { cat: 'flower', emoji: '🌺', keywords: ['bloom', 'blossom', 'flower', 'blooming'] },

            // === SUCCULENTS ===
            { cat: 'succulent', emoji: '🌵', keywords: ['cactus', 'succulent', 'aloe', 'agave', 'sedum', 'echeveria', 'jade', 'kalanchoe', 'sempervivum', 'crassula', 'euphorbia', 'haworthia', 'sansevieria', 'yucca'] },

            // === CASH CROPS ===
            { cat: 'cash_crop', emoji: '☕', keywords: ['coffee', 'tea', 'cacao', 'chocolate', 'cocoa', 'tobacco', 'sugarcane', 'cotton', 'rubber', 'hemp'] },
        ];

        // Direct Perenual category → App category fallback mapping
        // When keywords don't match, use these defaults based on Perenual's original category
        const categoryFallback = {
            'tree': 'tree',
            'shrub': 'flower',
            'flower': 'flower',
            'succulent': 'succulent',
            'cactus': 'succulent',
            'houseplant': 'flower',
            'herb': 'herb',
            'grass': 'grain',
            'climber': 'flower',
            'creeper': 'flower',
            'aquatic': 'flower',
            'fern': 'flower',
            'moss': 'flower',
            'bamboo': 'tree',
            'palm': 'tree',
            'conifer': 'tree',
        };

        const fallbackEmojis = {
            'tree': '🌳',
            'flower': '🌺',
            'succulent': '🌵',
            'grain': '🌾',
            'herb': '🌿',
        };

        let changed = 0;
        let fallbackMapped = 0;

        for (const p of plants) {
            // Skip local plants — they already have correct categories
            if (p.source === 'local') continue;

            const name = (p.name || '').toLowerCase();
            const sci = (p.scientificName || '').toLowerCase();
            const text = name + ' ' + sci;

            // Step 1: Try keyword matching
            let matched = false;
            for (const rule of rules) {
                for (const kw of rule.keywords) {
                    const re = new RegExp('\\b' + kw.replace(/ /g, '\\s+') + '\\b', 'i');
                    if (re.test(text)) {
                        p.category = rule.cat;
                        p.emoji = rule.emoji;
                        p.edible = true;
                        changed++;
                        matched = true;
                        break;
                    }
                }
                if (matched) break;
            }

            // Step 2: If no keyword matched, use fallback category mapping
            if (!matched && p.category && categoryFallback[p.category]) {
                const newCat = categoryFallback[p.category];
                p.category = newCat;
                p.emoji = fallbackEmojis[newCat] || '🌱';
                p.edible = false;
                fallbackMapped++;
            }
        }
        console.log(`  ✓ Recategorized ${changed} plants by name + ${fallbackMapped} by category fallback`);
    },

    finalSort(plants) {
        return plants.sort((a, b) => {
            if (a.edible && !b.edible) return -1;
            if (!a.edible && b.edible) return 1;
            return (a.name || '').localeCompare(b.name || '');
        });
    },

    search(query) {
        const q = query.toLowerCase().trim();
        if (!q) return this.masterList;
        return this.masterList.filter(p =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.scientificName || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q)
        );
    },

    findByCategory(category) {
        if (category === 'all') return this.masterList;
        return this.masterList.filter(p => p.category === category);
    },

    findById(id) {
        return this.masterList.find(p => p.id === id);
    },

    getStats() {
        const categories = {};
        for (const p of this.masterList) {
            const cat = p.category || 'other';
            categories[cat] = (categories[cat] || 0) + 1;
        }
        return {
            total: this.masterList.length,
            categories,
            withImages: this.masterList.filter(p => p.imageUrl || p.thumbnailUrl).length,
            edible: this.masterList.filter(p => p.edible).length,
            sources: {
                local: this.masterList.filter(p => p.source === 'local').length,
                perenual: this.masterList.filter(p => p.source === 'perenual').length,
                trefle: this.masterList.filter(p => p.source === 'trefle').length,
            },
        };
    },
};
