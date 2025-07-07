const fetch = require('node-fetch');
const CAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

async function verifyCaptcha(token, ip) {
    const res = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${CAPTCHA_SECRET}&response=${token}&remoteip=${ip}`
    });

    const data = await res.json();
    return data.success;
}

module.exports = { verifyCaptcha };
