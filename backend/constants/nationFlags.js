// ─── NATIONAL FLAG IMAGES (backend copy) ────────────────────────────
// Generated from frontend/src/constants/nationFlags.js (NATION_ISO2) —
// regenerate rather than hand-edit if the frontend map changes.
// Used by the emails: crisp flag chips next to team names (flagcdn) and
// the pre-baked blurred flag-bleed strips hosted at /email-flags/ on the
// site (real flags, NOT colour gradients — brand rule from Troy).

const SITE = 'https://oddyessa.com';

export const NATION_ISO2 = {"Mexico":"mx", "South Africa":"za", "Brazil":"br", "Argentina":"ar", "France":"fr", "Spain":"es", "England":"gb-eng", "Germany":"de", "Portugal":"pt", "Netherlands":"nl", "Belgium":"be", "Croatia":"hr", "Italy":"it", "Uruguay":"uy", "Colombia":"co", "Morocco":"ma", "Switzerland":"ch", "Denmark":"dk", "Japan":"jp", "USA":"us", "United States":"us", "Senegal":"sn", "Nigeria":"ng", "Egypt":"eg", "Ghana":"gh", "South Korea":"kr", "Korea Republic":"kr", "Iran":"ir", "Australia":"au", "Canada":"ca", "Ecuador":"ec", "Qatar":"qa", "Saudi Arabia":"sa", "Poland":"pl", "Serbia":"rs", "Austria":"at", "Norway":"no", "Sweden":"se", "Scotland":"gb-sct", "Wales":"gb-wls", "Czech Republic":"cz", "Czechia":"cz", "Algeria":"dz", "Tunisia":"tn", "Cameroon":"cm", "Ivory Coast":"ci", "Côte d'Ivoire":"ci", "Paraguay":"py", "Peru":"pe", "Chile":"cl", "Uzbekistan":"uz", "Jordan":"jo", "Panama":"pa", "Costa Rica":"cr", "Honduras":"hn", "Jamaica":"jm", "New Zealand":"nz", "Cape Verde":"cv", "DR Congo":"cd", "Congo DR":"cd", "Bosnia & Herzegovina":"ba", "Bosnia and Herzegovina":"ba", "Haiti":"ht", "Curacao":"cw", "Curaçao":"cw", "Iraq":"iq", "Turkey":"tr", "Greece":"gr", "Ukraine":"ua", "Russia":"ru", "Israel":"il", "Slovakia":"sk", "Slovenia":"si", "Romania":"ro", "Hungary":"hu", "Finland":"fi", "Ireland":"ie", "Iceland":"is", "Albania":"al", "Georgia":"ge", "Venezuela":"ve", "Bolivia":"bo", "Mali":"ml", "Burkina Faso":"bf", "Gabon":"ga", "Guinea":"gn", "Zambia":"zm", "Kenya":"ke", "Uganda":"ug", "Benin":"bj", "Togo":"tg", "Angola":"ao", "Mozambique":"mz", "Namibia":"na", "Libya":"ly", "Sudan":"sd", "Oman":"om", "Bahrain":"bh", "Kuwait":"kw", "UAE":"ae", "United Arab Emirates":"ae", "Syria":"sy", "Lebanon":"lb", "Palestine":"ps", "China":"cn", "China PR":"cn", "Thailand":"th", "Vietnam":"vn", "Indonesia":"id", "Malaysia":"my", "India":"in", "Kyrgyzstan":"kg", "Tajikistan":"tj", "Turkmenistan":"tm", "North Korea":"kp", "Korea DPR":"kp", "Bulgaria":"bg", "North Macedonia":"mk", "Montenegro":"me", "Kosovo":"xk", "Cyprus":"cy", "Malta":"mt", "Luxembourg":"lu", "Estonia":"ee", "Latvia":"lv", "Lithuania":"lt", "Belarus":"by", "Moldova":"md", "Armenia":"am", "Azerbaijan":"az", "Kazakhstan":"kz", "El Salvador":"sv", "Guatemala":"gt", "Nicaragua":"ni", "Trinidad and Tobago":"tt", "Cuba":"cu", "Dominican Republic":"do", "Suriname":"sr", "Guyana":"gy", "Grenada":"gd", "Barbados":"bb", "Bermuda":"bm", "Belize":"bz", "Antigua and Barbuda":"ag", "Saint Lucia":"lc", "St. Lucia":"lc", "Saint Kitts and Nevis":"kn", "Saint Vincent and the Grenadines":"vc", "Dominica":"dm", "Bahamas":"bs", "Puerto Rico":"pr", "Aruba":"aw", "Montserrat":"ms", "Anguilla":"ai", "Cayman Islands":"ky", "Turks and Caicos Islands":"tc", "British Virgin Islands":"vg", "US Virgin Islands":"vi", "Pakistan":"pk", "Afghanistan":"af", "Bangladesh":"bd", "Sri Lanka":"lk", "Nepal":"np", "Bhutan":"bt", "Maldives":"mv", "Myanmar":"mm", "Cambodia":"kh", "Laos":"la", "Mongolia":"mn", "Hong Kong":"hk", "Macau":"mo", "Chinese Taipei":"tw", "Taiwan":"tw", "Philippines":"ph", "Singapore":"sg", "Brunei":"bn", "Timor-Leste":"tl", "Guam":"gu", "Yemen":"ye", "Fiji":"fj", "Papua New Guinea":"pg", "Solomon Islands":"sb", "Vanuatu":"vu", "Samoa":"ws", "American Samoa":"as", "Tonga":"to", "Tahiti":"pf", "New Caledonia":"nc", "Cook Islands":"ck", "Ethiopia":"et", "Eritrea":"er", "Djibouti":"dj", "Somalia":"so", "Tanzania":"tz", "Rwanda":"rw", "Burundi":"bi", "Malawi":"mw", "Zimbabwe":"zw", "Botswana":"bw", "Lesotho":"ls", "Eswatini":"sz", "Swaziland":"sz", "Madagascar":"mg", "Mauritius":"mu", "Comoros":"km", "Seychelles":"sc", "Equatorial Guinea":"gq", "Chad":"td", "Central African Republic":"cf", "Congo":"cg", "Congo Republic":"cg", "Gambia":"gm", "The Gambia":"gm", "Guinea-Bissau":"gw", "Sierra Leone":"sl", "Liberia":"lr", "Niger":"ne", "Mauritania":"mr", "South Sudan":"ss", "São Tomé and Príncipe":"st", "Andorra":"ad", "San Marino":"sm", "Liechtenstein":"li", "Faroe Islands":"fo", "Gibraltar":"gi", "Monaco":"mc"};

export function flagIso(name) {
  return NATION_ISO2[name] || null;
}

// Small crisp flag for inline <img> chips — works in every client.
export function flagChipUrl(name) {
  const iso = flagIso(name);
  return iso ? `https://flagcdn.com/w40/${iso}.png` : null;
}

// Pre-baked FlagBleed strips (blur+fade+veil baked, alpha WebP). Only
// consumed as background-images — clients that drop backgrounds (Outlook
// desktop) never request them, so WebP-only is safe.
export function emailFlagStrips(homeName, awayName) {
  const h = flagIso(homeName), a = flagIso(awayName);
  if (!h || !a) return null;
  return { left: `${SITE}/email-flags/${h}-l.webp`, right: `${SITE}/email-flags/${a}-r.webp` };
}

export default { NATION_ISO2, flagIso, flagChipUrl, emailFlagStrips };
