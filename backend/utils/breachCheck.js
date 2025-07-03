// utils/breachCheck.js
const crypto = require('crypto');
const fetch = require('node-fetch');

async function isBreachedPassword(password) {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    const text = await response.text();

    return text.split('\n').some(line => line.startsWith(suffix));
}

module.exports = { isBreachedPassword };
