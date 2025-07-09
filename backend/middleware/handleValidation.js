const { validationResult } = require('express-validator');
const { recordFailure, shouldShowCaptcha } = require('./captchaTracker');

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  const hasErrors = !errors.isEmpty();

  console.info('[VALIDATION] Received Request');
  console.info('Path:', req.originalUrl);
  console.info('Method:', req.method);
  console.info('IP:', req.ip);
  console.info('User-Agent:', req.headers['user-agent']);
  console.info(
    'Body:',
    JSON.stringify(
      req.body,
      (key, value) => {
        if (key && key.toLowerCase().includes('password')) {
          return '[FILTERED]';
        }
        return value;
      },
      2
    )
  );

  if (hasErrors) {
    const errorList = errors.array();

    console.warn('[VALIDATION] Validation failed with the following errors:');
    errorList.forEach(err => {
      console.warn(` - ${err.param}: ${err.msg}`);
    });

    // Track failure for captcha system using IP address
    const captcha_identifier = req.ip || req.body.email;
    recordFailure(captcha_identifier);

    // Extract the first error message for URL parameter
    const firstError = errorList[0];
    const errorMessage = encodeURIComponent(firstError.msg);

    // Check if captcha should be shown
    const showCaptcha = shouldShowCaptcha(captcha_identifier);
    const captchaParam = showCaptcha ? '&captcha=true' : '';

    const redirectMap = {
      '/signup-owner': `/rOwnerReg?error=${errorMessage}${captchaParam}`,
      '/register': `/register?error=${errorMessage}${captchaParam}`,
      '/login': `/login?error=${errorMessage}${captchaParam}`
    };

    const target = redirectMap[req.originalUrl];
    if (target) {
      return res.redirect(target);
    } else {
      console.warn(`[VALIDATION] No redirect mapping found for ${req.originalUrl}, responding with 404`);
      return res.status(404).send('URL Not Found.');
    }
  }

  console.info('[VALIDATION] Validation passed.');
  next();
};
