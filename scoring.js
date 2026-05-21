// Growability Scoring Engine v2
// Handles null requirements gracefully — gives neutral scores when data is missing

const GrowabilityScorer = {

  scoreAllPlants(plants, envProfile) {
    return plants.map(plant => ({
      plant,
      ...this.scorePlant(plant, envProfile)
    })).sort((a, b) => b.totalScore - a.totalScore);
  },

  scorePlant(plant, env) {
    const r = plant.requirements || {};
    const tempScore = this.scoreTemperature(r, env);
    const rainScore = this.scoreRainfall(r, env);
    const humidityScore = this.scoreHumidity(r, env);
    const soilScore = this.scoreSoilPh(r, env);
    const sunScore = this.scoreSunlight(r, env);
    const frostScore = this.scoreFrost(r, env);

    const totalScore = Math.round(
      tempScore.score + rainScore.score + humidityScore.score +
      soilScore.score + sunScore.score + frostScore.score
    );

    return {
      totalScore: Math.max(0, Math.min(100, totalScore)),
      breakdown: { temperature: tempScore, rainfall: rainScore, humidity: humidityScore, soil: soilScore, sunlight: sunScore, frost: frostScore },
      rating: this.getRating(totalScore),
    };
  },

  // Temperature score (0-30 points)
  scoreTemperature(req, env) {
    const maxPts = 30;

    // If plant has no temp data, give neutral score
    if (req.tempMin == null || req.tempMax == null) {
      return { score: maxPts * 0.6, max: maxPts, detail: 'No temperature requirements data' };
    }

    let monthsInRange = 0;
    let monthsOptimal = 0;
    const hasOptimal = req.tempOptimalMin != null && req.tempOptimalMax != null;

    for (const m of env.monthlyData) {
      if (m.tempMean == null) continue;
      if (m.tempMean >= req.tempMin && m.tempMean <= req.tempMax) monthsInRange++;
      if (hasOptimal && m.tempMean >= req.tempOptimalMin && m.tempMean <= req.tempOptimalMax) monthsOptimal++;
    }

    const rangeRatio = monthsInRange / 12;
    let score;
    if (hasOptimal) {
      const optimalRatio = monthsOptimal / 12;
      score = maxPts * (rangeRatio * 0.4 + optimalRatio * 0.6);
    } else {
      score = maxPts * rangeRatio;
    }

    // Penalty if absolute minimum is below plant's tolerance
    if (env.absMin < req.tempMin && !req.frostTolerant) {
      const diff = req.tempMin - env.absMin;
      score *= Math.max(0, 1 - diff / 20);
    }

    const detail = hasOptimal
      ? `${monthsOptimal}/12 months optimal, ${monthsInRange}/12 in range`
      : `${monthsInRange}/12 months in range (${req.tempMin}–${req.tempMax}°C)`;
    return { score: Math.max(0, Math.min(maxPts, score)), max: maxPts, detail };
  },

  // Rainfall score (0-20 points)
  scoreRainfall(req, env) {
    const maxPts = 20;

    if (req.annualRainfallMin == null || req.annualRainfallMax == null) {
      return { score: maxPts * 0.6, max: maxPts, detail: 'No rainfall requirements data' };
    }

    const rain = env.annualRainfall;
    const idealMid = (req.annualRainfallMin + req.annualRainfallMax) / 2;
    const idealRange = req.annualRainfallMax - req.annualRainfallMin;

    let score;
    if (rain >= req.annualRainfallMin && rain <= req.annualRainfallMax) {
      const distFromCenter = Math.abs(rain - idealMid) / (idealRange / 2 || 1);
      score = maxPts * (1 - distFromCenter * 0.2);
    } else {
      const dist = rain < req.annualRainfallMin
        ? (req.annualRainfallMin - rain) / (req.annualRainfallMin || 1)
        : (rain - req.annualRainfallMax) / (req.annualRainfallMax || 1);
      score = maxPts * Math.max(0, 1 - dist * 1.5);
    }

    const detail = `${Math.round(rain)}mm/yr (needs ${req.annualRainfallMin}–${req.annualRainfallMax}mm)`;
    return { score: Math.max(0, Math.min(maxPts, score)), max: maxPts, detail };
  },

  // Humidity score (0-15 points)
  scoreHumidity(req, env) {
    const maxPts = 15;
    if (req.humidityMin == null || req.humidityMax == null) {
      return { score: maxPts * 0.6, max: maxPts, detail: 'No humidity requirements data' };
    }
    const hum = env.avgHumidity;
    if (hum == null) return { score: maxPts * 0.5, max: maxPts, detail: 'No humidity data for location' };

    let score;
    if (hum >= req.humidityMin && hum <= req.humidityMax) {
      score = maxPts;
    } else {
      const dist = hum < req.humidityMin
        ? (req.humidityMin - hum) / 30
        : (hum - req.humidityMax) / 30;
      score = maxPts * Math.max(0, 1 - dist);
    }

    const detail = `${Math.round(hum)}% avg (needs ${req.humidityMin}–${req.humidityMax}%)`;
    return { score: Math.max(0, Math.min(maxPts, score)), max: maxPts, detail };
  },

  // Soil pH score (0-15 points)
  scoreSoilPh(req, env) {
    const maxPts = 15;
    if (req.soilPhMin == null || req.soilPhMax == null) {
      return { score: maxPts * 0.6, max: maxPts, detail: 'No soil pH requirements data' };
    }
    const ph = env.soilPh;
    if (ph == null) return { score: maxPts * 0.5, max: maxPts, detail: 'No soil data for location' };

    let score;
    if (ph >= req.soilPhMin && ph <= req.soilPhMax) {
      score = maxPts;
    } else {
      const dist = ph < req.soilPhMin
        ? req.soilPhMin - ph
        : ph - req.soilPhMax;
      score = maxPts * Math.max(0, 1 - dist / 2);
    }

    const detail = `pH ${ph.toFixed(1)} (needs ${req.soilPhMin}–${req.soilPhMax})`;
    return { score: Math.max(0, Math.min(maxPts, score)), max: maxPts, detail };
  },

  // Sunlight score (0-10 points)
  scoreSunlight(req, env) {
    const maxPts = 10;
    if (req.sunlightHoursMin == null) {
      return { score: maxPts * 0.6, max: maxPts, detail: 'No sunlight requirements data' };
    }
    const sun = env.avgSunHours;
    if (sun == null) return { score: maxPts * 0.5, max: maxPts, detail: 'No sunlight data for location' };

    let score;
    if (sun >= req.sunlightHoursMin) {
      score = maxPts;
    } else {
      const deficit = (req.sunlightHoursMin - sun) / req.sunlightHoursMin;
      score = maxPts * Math.max(0, 1 - deficit * 2);
    }

    const detail = `${sun.toFixed(1)}h/day (needs ${req.sunlightHoursMin}h+)`;
    return { score: Math.max(0, Math.min(maxPts, score)), max: maxPts, detail };
  },

  // Frost hardiness score (0-10 points)
  scoreFrost(req, env) {
    const maxPts = 10;

    if (req.frostTolerant == null) {
      return { score: maxPts * 0.6, max: maxPts, detail: 'No frost tolerance data' };
    }

    let score;
    if (req.frostTolerant) {
      score = maxPts;
    } else if (env.frostDaysPerYear === 0) {
      score = maxPts;
    } else {
      const penalty = env.frostDaysPerYear / 30;
      score = maxPts * Math.max(0, 1 - penalty);
    }

    if (req.hardinessZoneMin != null && env.hardinessZone) {
      if (env.hardinessZone < req.hardinessZoneMin) {
        const zoneDiff = req.hardinessZoneMin - env.hardinessZone;
        score *= Math.max(0, 1 - zoneDiff * 0.3);
      }
    }

    const detail = req.frostTolerant
      ? `Frost tolerant (${Math.round(env.frostDaysPerYear)} frost days/yr)`
      : `${Math.round(env.frostDaysPerYear)} frost days/yr (not frost tolerant)`;
    return { score: Math.max(0, Math.min(maxPts, score)), max: maxPts, detail };
  },

  getRating(score) {
    if (score >= 80) return { label: 'Excellent', color: '#00d97e', emoji: '🟢' };
    if (score >= 60) return { label: 'Good', color: '#f5c542', emoji: '🟡' };
    if (score >= 40) return { label: 'Possible', color: '#ff8c42', emoji: '🟠' };
    if (score >= 20) return { label: 'Difficult', color: '#ff4757', emoji: '🔴' };
    return { label: 'Not Recommended', color: '#666', emoji: '⚫' };
  }
};
