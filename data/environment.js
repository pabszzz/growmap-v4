// Environment Data Fetcher — Open-Meteo Climate + ISRIC SoilGrids
// v0.4.1 — 3-tier fallback: Archive API → Forecast API → Latitude estimate

const EnvironmentFetcher = {
  cache: {},

  getCacheKey(lat, lng) {
    return `${Math.round(lat*10)/10}_${Math.round(lng*10)/10}`;
  },

  async fetchClimateData(lat, lng) {
    const key = this.getCacheKey(lat, lng);
    if (this.cache[key]) return this.cache[key];

    // Tier 1: Archive API (2-year historical — faster than 5-year)
    try {
      const profile = await this._fetchArchiveClimate(lat, lng);
      this.cache[key] = profile;
      return profile;
    } catch (archiveErr) {
      console.warn('Archive API failed, trying forecast fallback:', archiveErr.message);
    }

    // Tier 2: Forecast API (last 92 days — fast, always available)
    try {
      const profile = await this._fetchForecastClimate(lat, lng);
      this.cache[key] = profile;
      return profile;
    } catch (forecastErr) {
      console.warn('Forecast API also failed:', forecastErr.message);
      // Tier 3 is handled by caller (estimateProfileFromLatLng)
      throw forecastErr;
    }
  },

  async _fetchArchiveClimate(lat, lng) {
    const endDate = new Date();
    // 2 years instead of 5 — ~60% less data to download, works much better on mobile
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 2);

    const fmt = d => d.toISOString().split('T')[0];
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${fmt(startDate)}&end_date=${fmt(endDate)}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,sunshine_duration&timezone=auto`;

    // 25s timeout — generous for slow mobile connections
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Archive API error: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.reason || 'Archive API error');

    return this.processClimateData(data);
  },

  async _fetchForecastClimate(lat, lng) {
    // Open-Meteo forecast API with past_days=92 — free, fast, no timeout issues
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,sunshine_duration&timezone=auto&past_days=92&forecast_days=1`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Forecast API error: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.reason || 'Forecast API error');

    return this.processClimateData(data);
  },

  // Tier 3: Pure latitude-based estimate — zero network calls, instant
  // Called by app.js when all API fetches fail (timeout, offline, etc.)
  estimateProfileFromLatLng(lat, lng) {
    const absLat = Math.abs(lat);
    let avgTemp, annualRainfall, avgHumidity, avgSunHours, absMin;

    if (absLat < 10) {
      // Equatorial / Tropical
      avgTemp = 27; annualRainfall = 2000; avgHumidity = 80; avgSunHours = 6.0; absMin = 18;
    } else if (absLat < 23.5) {
      // Subtropical
      avgTemp = 22; annualRainfall = 1000; avgHumidity = 65; avgSunHours = 7.0; absMin = 8;
    } else if (absLat < 35) {
      // Mediterranean / warm temperate (covers Turkey perfectly)
      avgTemp = 16; annualRainfall = 600; avgHumidity = 55; avgSunHours = 7.5; absMin = 2;
    } else if (absLat < 50) {
      // Temperate
      avgTemp = 10; annualRainfall = 700; avgHumidity = 70; avgSunHours = 5.0; absMin = -10;
    } else if (absLat < 60) {
      // Boreal / cool temperate
      avgTemp = 3;  annualRainfall = 400; avgHumidity = 75; avgSunHours = 4.0; absMin = -25;
    } else {
      // Subarctic / Arctic
      avgTemp = -5; annualRainfall = 250; avgHumidity = 80; avgSunHours = 3.0; absMin = -40;
    }

    const frostDaysPerYear = absMin < 0 ? Math.round(Math.abs(absMin) * 3) : 0;
    const hardinessZone = this.tempToHardinessZone(absMin);
    const soilPh = this.estimateSoilPh(lat, lng);

    // Synthetic monthly data with seasonal variation
    const seasonalAmplitude = absLat > 30 ? 8 : 3;
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      tempMean: avgTemp + Math.sin((i - 6) * Math.PI / 6) * seasonalAmplitude,
      tempMax: avgTemp + seasonalAmplitude + 3,
      tempMin: avgTemp - seasonalAmplitude - 3,
      rainfall: annualRainfall / 12,
      humidity: avgHumidity,
      sunshineHours: avgSunHours,
    }));

    return {
      monthlyData,
      annualRainfall,
      avgTemp,
      avgHumidity,
      avgSunHours,
      absMin,
      frostDaysPerYear,
      hardinessZone,
      soilPh,
      _estimated: true, // flag so UI can show an "estimated" badge
    };
  },

  processClimateData(data) {
    const d = data.daily;
    const n = d.time.length;

    // Monthly aggregation
    const months = {};
    for (let i = 0; i < n; i++) {
      const m = d.time[i].substring(0, 7); // "YYYY-MM"
      if (!months[m]) months[m] = {temps:[],maxs:[],mins:[],rain:[],hum:[],sun:[]};
      if (d.temperature_2m_mean[i] != null) months[m].temps.push(d.temperature_2m_mean[i]);
      if (d.temperature_2m_max[i] != null) months[m].maxs.push(d.temperature_2m_max[i]);
      if (d.temperature_2m_min[i] != null) months[m].mins.push(d.temperature_2m_min[i]);
      if (d.precipitation_sum[i] != null) months[m].rain.push(d.precipitation_sum[i]);
      if (d.relative_humidity_2m_mean && d.relative_humidity_2m_mean[i] != null) months[m].hum.push(d.relative_humidity_2m_mean[i]);
      if (d.sunshine_duration && d.sunshine_duration[i] != null) months[m].sun.push(d.sunshine_duration[i]);
    }

    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
    const sum = arr => arr.reduce((a,b)=>a+b,0);

    // Average by calendar month (1-12)
    const monthlyData = [];
    for (let mo = 1; mo <= 12; mo++) {
      const moStr = String(mo).padStart(2,'0');
      const matching = Object.entries(months).filter(([k]) => k.endsWith('-'+moStr));
      const allTemps = matching.flatMap(([,v]) => v.temps);
      const allMaxs  = matching.flatMap(([,v]) => v.maxs);
      const allMins  = matching.flatMap(([,v]) => v.mins);
      const allHum   = matching.flatMap(([,v]) => v.hum);
      const allSun   = matching.flatMap(([,v]) => v.sun);
      // Sum rain per month-year, then average across years
      const rainPerYear = matching.map(([,v]) => sum(v.rain));
      monthlyData.push({
        month: mo,
        tempMean: avg(allTemps),
        tempMax:  avg(allMaxs),
        tempMin:  avg(allMins),
        rainfall: avg(rainPerYear),
        humidity: avg(allHum),
        sunshineHours: avg(allSun) ? avg(allSun) / 3600 : null, // seconds → hours
      });
    }

    // Summary stats
    const allMins = d.temperature_2m_min.filter(v => v != null);
    const absMin = allMins.length ? Math.min(...allMins) : -5;
    const years = Math.max(1, n / 365);
    const frostDays = allMins.filter(t => t < 0).length / years;
    const annualRainfall = monthlyData.reduce((s,m) => s + (m.rainfall||0), 0);
    const avgTemp      = avg(monthlyData.map(m => m.tempMean).filter(v => v != null));
    const avgHumidity  = avg(monthlyData.map(m => m.humidity).filter(v => v != null));
    const avgSunHours  = avg(monthlyData.map(m => m.sunshineHours).filter(v => v != null));
    const hardinessZone = this.tempToHardinessZone(absMin);

    return {
      monthlyData,
      annualRainfall,
      avgTemp,
      avgHumidity,
      avgSunHours,
      absMin,
      frostDaysPerYear: frostDays,
      hardinessZone,
    };
  },

  tempToHardinessZone(absMinC) {
    if (absMinC < -45.6) return 1;
    if (absMinC < -40)   return 2;
    if (absMinC < -34.4) return 3;
    if (absMinC < -28.9) return 4;
    if (absMinC < -23.3) return 5;
    if (absMinC < -17.8) return 6;
    if (absMinC < -12.2) return 7;
    if (absMinC < -6.7)  return 8;
    if (absMinC < -1.1)  return 9;
    if (absMinC < 4.4)   return 10;
    if (absMinC < 10)    return 11;
    return 12;
  },

  async fetchSoilData(lat, lng) {
    try {
      const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lng}&lat=${lat}&property=phh2o&depth=0-5cm&value=mean`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Soil API error');
      const data = await res.json();
      const phRaw = data?.properties?.layers?.[0]?.depths?.[0]?.values?.mean;
      if (phRaw != null) return phRaw / 10; // SoilGrids returns pH * 10
      return this.estimateSoilPh(lat, lng);
    } catch (e) {
      console.warn('SoilGrids API failed, using estimate:', e.message);
      return this.estimateSoilPh(lat, lng);
    }
  },

  estimateSoilPh(lat, lng) {
    const absLat = Math.abs(lat);
    if (absLat < 10)   return 5.5; // Tropical — acidic
    if (absLat < 23.5) return 6.5; // Subtropical
    if (absLat < 35)   return 7.0; // Mediterranean / warm temperate
    if (absLat < 50)   return 6.5; // Temperate
    if (absLat < 60)   return 5.5; // Boreal — acidic
    return 5.0;                     // Arctic — very acidic
  },

  async getFullEnvironmentProfile(lat, lng) {
    const [climate, soilPh] = await Promise.all([
      this.fetchClimateData(lat, lng),
      this.fetchSoilData(lat, lng),
    ]);
    return { ...climate, soilPh };
  },
};
