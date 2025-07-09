const entities = require('entities');

function decodeHtmlEntities(str) {
  return typeof str === 'string'
    ? entities.decodeHTML(str)
    : str;
}

function encodeHtmlEntities(str) {
  return typeof str === 'string'
    ? entities.encodeHTML(str)
    : str;
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
