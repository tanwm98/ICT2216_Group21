function decodeHtmlEntities(str) {
  if (typeof str !== 'string') return str;

  const htmlMap = {
    '&amp;': '&',
    '&#x2F;': '/',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&nbsp;': ' '
  };

  const decodeOnce = s =>
    s.replace(/&amp;|&#x2F;|&lt;|&gt;|&quot;|&#039;|&nbsp;/g, m => htmlMap[m]);

  let last = str;
  for (let i = 0; i < 10; i++) {
    const decoded = decodeOnce(last);
    if (decoded === last) break;
    last = decoded;
  }

  return last;
}

function debugDecode(str) {
  console.log("[DEBUG] Initial string:", str);
  let current = str;
  for (let i = 0; i < 10; i++) {
    const next = decodeHtmlEntities(current);
    console.log(`[DEBUG] After pass ${i + 1}:`, next);
    if (next === current) break;
    current = next;
  }
  return current;
}

module.exports = {
  decodeHtmlEntities,
  debugDecode
};
