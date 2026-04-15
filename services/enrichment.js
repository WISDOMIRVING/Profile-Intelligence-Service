const axios = require('axios');

/**
 * Classifies an age into a human-readable age group.
 * @param {number} age
 * @returns {string} One of: child, teenager, adult, senior
 */
function classifyAgeGroup(age) {
  if (age >= 0 && age <= 12) return 'child';
  if (age >= 13 && age <= 19) return 'teenager';
  if (age >= 20 && age <= 59) return 'adult';
  return 'senior';
}

/**
 * Calls Genderize, Agify, and Nationalize APIs in parallel for the given name.
 * Validates each response and returns a processed, aggregated result.
 *
 * @param {string} name - The name to enrich
 * @returns {Object} Enriched profile data
 * @throws {{ status: number, message: string }} On invalid API responses (502)
 */
async function enrichProfile(name) {
  const encodedName = encodeURIComponent(name);

  // Call all three APIs in parallel
  let genderRes, ageRes, nationRes;
  try {
    [genderRes, ageRes, nationRes] = await Promise.all([
      axios.get(`https://api.genderize.io?name=${encodedName}`),
      axios.get(`https://api.agify.io?name=${encodedName}`),
      axios.get(`https://api.nationalize.io?name=${encodedName}`)
    ]);
  } catch (err) {
    // Determine which API failed based on the URL
    const failedUrl = err.config?.url || '';
    if (failedUrl.includes('genderize')) {
      throw { status: 502, message: 'Genderize returned an invalid response' };
    } else if (failedUrl.includes('agify')) {
      throw { status: 502, message: 'Agify returned an invalid response' };
    } else if (failedUrl.includes('nationalize')) {
      throw { status: 502, message: 'Nationalize returned an invalid response' };
    }
    throw { status: 502, message: 'External API returned an invalid response' };
  }

  const genderData = genderRes.data;
  const ageData = ageRes.data;
  const nationData = nationRes.data;

  // Validate Genderize response
  if (!genderData.gender || genderData.count === 0) {
    throw { status: 502, message: 'Genderize returned an invalid response' };
  }

  // Validate Agify response
  if (ageData.age === null || ageData.age === undefined) {
    throw { status: 502, message: 'Agify returned an invalid response' };
  }

  // Validate Nationalize response
  if (!nationData.country || nationData.country.length === 0) {
    throw { status: 502, message: 'Nationalize returned an invalid response' };
  }

  // Pick the country with the highest probability
  const topCountry = nationData.country.reduce((prev, curr) =>
    curr.probability > prev.probability ? curr : prev
  );

  return {
    gender: genderData.gender,
    gender_probability: genderData.probability,
    sample_size: genderData.count,
    age: ageData.age,
    age_group: classifyAgeGroup(ageData.age),
    country_id: topCountry.country_id,
    country_probability: topCountry.probability
  };
}

module.exports = { enrichProfile };
