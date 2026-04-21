const axios = require('axios');

// Simplified mapping for common countries. In a real app, use i18n-iso-countries.
const COUNTRY_MAP = {
  'NG': 'Nigeria',
  'BJ': 'Benin',
  'KE': 'Kenya',
  'AO': 'Angola',
  'GH': 'Ghana',
  'ZA': 'South Africa',
  'EG': 'Egypt',
  'MA': 'Morocco',
  'SN': 'Senegal',
  'CI': 'Ivory Coast',
  'US': 'United States',
  'GB': 'United Kingdom',
  'FR': 'France',
  'DE': 'Germany',
  'CN': 'China',
  'IN': 'India',
  'BR': 'Brazil',
  'CA': 'Canada',
  'AU': 'Australia'
};

/**
 * Classifies an age into a human-readable age group.
 */
function classifyAgeGroup(age) {
  if (age >= 0 && age <= 12) return 'child';
  if (age >= 13 && age <= 19) return 'teenager';
  if (age >= 20 && age <= 59) return 'adult';
  return 'senior';
}

/**
 * Calls external APIs to enrich a name.
 */
async function enrichProfile(name) {
  const encodedName = encodeURIComponent(name);

  let genderRes, ageRes, nationRes;
  try {
    [genderRes, ageRes, nationRes] = await Promise.all([
      axios.get(`https://api.genderize.io?name=${encodedName}`),
      axios.get(`https://api.agify.io?name=${encodedName}`),
      axios.get(`https://api.nationalize.io?name=${encodedName}`)
    ]);
  } catch (err) {
    throw { status: 502, message: 'External API returned an invalid response' };
  }

  const genderData = genderRes.data;
  const ageData = ageRes.data;
  const nationData = nationRes.data;

  if (!genderData.gender || genderData.count === 0) {
    throw { status: 502, message: 'Genderize returned an invalid response' };
  }

  if (ageData.age === null || ageData.age === undefined) {
    throw { status: 502, message: 'Agify returned an invalid response' };
  }

  if (!nationData.country || nationData.country.length === 0) {
    throw { status: 502, message: 'Nationalize returned an invalid response' };
  }

  const topCountry = nationData.country.reduce((prev, curr) =>
    curr.probability > prev.probability ? curr : prev
  );

  return {
    gender: genderData.gender,
    gender_probability: genderData.probability,
    age: ageData.age,
    age_group: classifyAgeGroup(ageData.age),
    country_id: topCountry.country_id,
    country_name: COUNTRY_MAP[topCountry.country_id] || topCountry.country_id,
    country_probability: topCountry.probability
  };
}

module.exports = { enrichProfile };
