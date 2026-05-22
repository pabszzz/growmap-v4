// === GrowMap v0.3 — API Configuration ===
// Get free keys at:
// Perenual: https://perenual.com/dashboard (free: 50 req/hr)
// Trefle:  https://trefle.io (free tier available)

const GROWMAP_CONFIG = {
    // ===== API KEYS (read from localStorage, set via config modal) =====
    get perenualApiKey() { return localStorage.getItem('growmap-perenual-key') || ''; },
    set perenualApiKey(v) { localStorage.setItem('growmap-perenual-key', v); },

    get trefleApiToken() { return localStorage.getItem('growmap-trefle-token') || ''; },
    set trefleApiToken(v) { localStorage.setItem('growmap-trefle-token', v); },

    // ===== FEATURE TOGGLES =====
    usePerenual: true,
    useTrefle: true,
    useLocalPlants: true,

    // ===== CACHING =====
    cacheTTLMs: 24 * 60 * 60 * 1000,
    maxCacheEntries: 500,

    // ===== PERENUAL SETTINGS =====
    perenualBaseUrl: 'https://perenual.com/api',
    perenualRateLimitMs: 1200,  // 1.2s — safe for 50/hr free tier with burst

    // ===== TREFLE SETTINGS =====
    trefleBaseUrl: 'https://trefle.io/api/v1',
    trefleRateLimitMs: 1100,

    // ===== FETCH LIMITS =====
    initialPerenualPages: 5,    // Fetch ~150 plants on startup (fast)
    maxPerenualPages: 50,       // Max 50 pages if user clicks refresh

    // ===== IMAGE =====
    defaultImage: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2U4ZTVlMCIvPjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiNhYWEiPvCfjLY8L3RleHQ+PC9zdmc+',
};
