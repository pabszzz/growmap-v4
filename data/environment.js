// Environment Data Fetcher — Open-Meteo Climate + ISRIC SoilGrids

const EnvironmentFetcher = {
  cache: {},

  getCacheKey(lat, lng) {
    return `${Math.round(lat*10)/10}_${Math.round(lng*10)/10}`;
  },

  async fetchClimateData(lat, lng) {
    const key = this.getCacheKey(lat, lng);
    if (this.cache[key]) return this.cache[key];

    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 5);

    const fmt = d => d.toISOString().split('T')[0];
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${fmt(startDate)}&end_date=${fmt(endDate)}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,sunshine_duration&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Climate API error: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.reason || 'Climate API error');

    const profile = this.processClimateData(data);
    this.cache[key] = profile;
    return profile;
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
      const allMaxs = matching.flatMap(([,v]) => v.maxs);
      const allMins = matching.flatMap(([,v]) => v.mins);
      const allHum = matching.flatMap(([,v]) => v.hum);
      const allSun = matching.flatMap(([,v]) => v.sun);
      // Sum rain per month-year, then average across years
      const rainPerYear = matching.map(([,v]) => sum(v.rain));
      monthlyData.push({
        month: mo,
        tempMean: avg(allTemps),
        tempMax: avg(allMaxs),
        tempMin: avg(allMins),
        rainfall: avg(rainPerYear),
        humidity: avg(allHum),
        sunshineHours: avg(allSun) ? avg(allSun) / 3600 : null, // seconds to hours
      });
    }

    // Compute summary stats
    const allMins = d.temperature_2m_min.filter(v => v != null);
    const absMin = Math.min(...allMins);
    const frostDays = allMins.filter(t => t < 0).length / 5; // avg per year
    const annualRainfall = monthlyData.reduce((s,m) => s + (m.rainfall||0), 0);
    const avgTemp = avg(monthlyData.map(m => m.tempMean).filter(v => v != null));
    const avgHumidity = avg(monthlyData.map(m => m.humidity).filter(v => v != null));
    const avgSunHours = avg(monthlyData.map(m => m.sunshineHours).filter(v => v != null));

    // Estimate USDA hardiness zone from absolute minimum temp
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
    // USDA zones based on absolute minimum temperature (°C)
    if (absMinC < -45.6) return 1;
    if (absMinC < -40) return 2;
    if (absMinC < -34.4) return 3;
    if (absMinC < -28.9) return 4;
    if (absMinC < -23.3) return 5;
    if (absMinC < -17.8) return 6;
    if (absMinC < -12.2) return 7;
    if (absMinC < -6.7) return 8;
    if (absMinC < -1.1) return 9;
    if (absMinC < 4.4) return 10;
    if (absMinC < 10) return 11;
    return 12;
  },

  async fetchSoilData(lat, lng) {
    try {
      const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lng}&lat=${lat}&property=phh2o&depth=0-5cm&value=mean`;
      const res = await fetch(url);
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
    // Rough estimate based on latitude/climate zone
    const absLat = Math.abs(lat);
    if (absLat < 10) return 5.5;       // Tropical — acidic
    if (absLat < 23.5) return 6.5;     // Subtropical
    if (absLat < 35) return 7.0;       // Mediterranean/warm temperate
    if (absLat < 50) return 6.5;       // Temperate
    if (absLat < 60) return 5.5;       // Boreal — acidic
    return 5.0;                         // Arctic — very acidic
  },

  async getFullEnvironmentProfile(lat, lng) {
    const [climate, soilPh] = await Promise.all([
      this.fetchClimateData(lat, lng),
      this.fetchSoilData(lat, lng)
    ]);
    return { ...climate, soilPh };
  }
};
