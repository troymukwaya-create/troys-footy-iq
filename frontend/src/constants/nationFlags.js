// ─── NATIONAL FLAG IMAGES (EXPERIMENT: flag-bleed tiles) ────────────
// Real flag imagery per nation, served by flagcdn.com (free, fast CDN).
// Used by the FlagBleed tile background — each team's actual flag bleeds
// into the other across the card, instead of flat colour gradients.
// Returns null for unknown teams (component falls back to colour gradient).

const NATION_ISO2 = {
  Mexico: 'mx', 'South Africa': 'za', Brazil: 'br', Argentina: 'ar',
  France: 'fr', Spain: 'es', England: 'gb-eng', Germany: 'de',
  Portugal: 'pt', Netherlands: 'nl', Belgium: 'be', Croatia: 'hr',
  Italy: 'it', Uruguay: 'uy', Colombia: 'co', Morocco: 'ma',
  Switzerland: 'ch', Denmark: 'dk', Japan: 'jp', USA: 'us',
  'United States': 'us', Senegal: 'sn', Nigeria: 'ng', Egypt: 'eg',
  Ghana: 'gh', 'South Korea': 'kr', 'Korea Republic': 'kr', Iran: 'ir',
  Australia: 'au', Canada: 'ca', Ecuador: 'ec', Qatar: 'qa',
  'Saudi Arabia': 'sa', Poland: 'pl', Serbia: 'rs', Austria: 'at',
  Norway: 'no', Sweden: 'se', Scotland: 'gb-sct', Wales: 'gb-wls',
  'Czech Republic': 'cz', Czechia: 'cz', Algeria: 'dz', Tunisia: 'tn',
  Cameroon: 'cm', 'Ivory Coast': 'ci', "Côte d'Ivoire": 'ci',
  Paraguay: 'py', Peru: 'pe', Chile: 'cl', Uzbekistan: 'uz',
  Jordan: 'jo', Panama: 'pa', 'Costa Rica': 'cr', Honduras: 'hn',
  Jamaica: 'jm', 'New Zealand': 'nz', 'Cape Verde': 'cv',
  'DR Congo': 'cd', 'Congo DR': 'cd', 'Bosnia & Herzegovina': 'ba',
  'Bosnia and Herzegovina': 'ba', Haiti: 'ht', Curacao: 'cw',
  'Curaçao': 'cw', Iraq: 'iq', Turkey: 'tr', Greece: 'gr',
  Ukraine: 'ua', Russia: 'ru', Israel: 'il', Slovakia: 'sk',
  Slovenia: 'si', Romania: 'ro', Hungary: 'hu', Finland: 'fi',
  Ireland: 'ie', Iceland: 'is', Albania: 'al', Georgia: 'ge',
  Venezuela: 've', Bolivia: 'bo', Mali: 'ml', 'Burkina Faso': 'bf',
  Gabon: 'ga', Guinea: 'gn', Zambia: 'zm', Kenya: 'ke',
  Uganda: 'ug', Benin: 'bj', Togo: 'tg', Angola: 'ao',
  Mozambique: 'mz', Namibia: 'na', Libya: 'ly', Sudan: 'sd',
  Oman: 'om', Bahrain: 'bh', Kuwait: 'kw', UAE: 'ae',
  'United Arab Emirates': 'ae', Syria: 'sy', Lebanon: 'lb',
  Palestine: 'ps', China: 'cn', 'China PR': 'cn', Thailand: 'th',
  Vietnam: 'vn', Indonesia: 'id', Malaysia: 'my', India: 'in',
  Kyrgyzstan: 'kg', Tajikistan: 'tj', Turkmenistan: 'tm',
  'North Korea': 'kp', 'Korea DPR': 'kp', Bulgaria: 'bg',
  'North Macedonia': 'mk', Montenegro: 'me', Kosovo: 'xk',
  Cyprus: 'cy', Malta: 'mt', Luxembourg: 'lu', Estonia: 'ee',
  Latvia: 'lv', Lithuania: 'lt', Belarus: 'by', Moldova: 'md',
  Armenia: 'am', Azerbaijan: 'az', Kazakhstan: 'kz',
  'El Salvador': 'sv', Guatemala: 'gt', Nicaragua: 'ni',
  'Trinidad and Tobago': 'tt', Cuba: 'cu', 'Dominican Republic': 'do',
  Suriname: 'sr', Guyana: 'gy',
};

// Data providers spell nations differently ('Türkiye'/'Turkey', 'Cape Verde
// Islands'/'Cape Verde', 'Congo DR'/'DR Congo'). Exact-string lookup left
// those tiles flagless — resolve through accent folding + a normalised index
// so every variant finds its flag.
const normName = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z]/g, '');

const EXTRA_ALIASES = {
  'Türkiye': 'tr', 'Turkiye': 'tr',
  'Cape Verde Islands': 'cv', 'Cabo Verde Islands': 'cv',
  'Congo DR': 'cd', 'DR Congo': 'cd',
  'Korea Republic': 'kr', 'USA': 'us',
  'Republic of Ireland': 'ie', 'Northern Ireland': 'gb-nir',
};

const NORM_INDEX = {};
for (const map of [NATION_ISO2, EXTRA_ALIASES]) {
  for (const [name, iso] of Object.entries(map)) NORM_INDEX[normName(name)] = iso;
}

/**
 * Flag image URL for a national team, or null when unknown
 * (clubs and unmapped names → caller falls back to colour gradients).
 * @param {string} name - team name as it appears in fixture data
 * @param {number} w - flagcdn width bucket (320 | 640 | 1280)
 */
export function flagUrl(name, w = 640) {
  const iso = NATION_ISO2[name] || NORM_INDEX[normName(name)];
  return iso ? `https://flagcdn.com/w${w}/${iso}.png` : null;
}

export default { flagUrl };
