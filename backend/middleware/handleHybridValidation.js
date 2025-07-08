const { validationResult } = require('express-validator');
const { URL } = require('url');

/**
 * Validates if a given redirect path is safe (i.e., local to the application).
 * @param {string} path - The redirect path from req.originalUrl.
 * @param {string} requestHost - The host from the request headers (e.g., 'localhost:3000').
 * @returns {string|null} The safe, local path or null if the path is unsafe.
 */

function getSafeRedirectUrl(path, requestHost) {
  try {
    if (path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')) {
      return path;
    }

    const redirectUrl = new URL(path, `http://${requestHost}`);

    // If the hostname is different, it's an open redirect.
    if (redirectUrl.host !== requestHost) {
      console.warn(`[SECURITY] Blocked potential open redirect to: ${redirectUrl.hostname}`);
      return null;
    }

    if (!['http:', 'https:'].includes(redirectUrl.protocol)) {
        console.warn(`[SECURITY] Blocked potential protocol handler injection: ${redirectUrl.protocol}`);
        return null;
    }

    return redirectUrl.pathname + redirectUrl.search;
  } catch (e) {
    console.warn(`[SECURITY] Blocked malformed redirect URL: ${path}`);
    return null;
  }
}

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
    errorList.forEach(err => console.warn(` - ${err.param}: ${err.msg}`));

    // API Request: Return JSON
    if (req.originalUrl.startsWith('/api') || req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ errors: errorList });
    }

    const safeRedirectUrl = getSafeRedirectUrl(req.originalUrl, req.headers.host);
    const redirectTarget = safeRedirectUrl || '/';

    return res.redirect(redirectTarget);

  }

  console.info('[VALIDATION] Validation passed.');
  next();
};
