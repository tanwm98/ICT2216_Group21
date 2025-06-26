const { validationResult } = require('express-validator');

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  const hasErrors = !errors.isEmpty();

  console.info('[VALIDATION] Received Request');
  console.info('Path:', req.originalUrl);
  console.info('Method:', req.method);
  console.info('IP:', req.ip);
  console.info('User-Agent:', req.headers['user-agent']);
  console.info('Body:', JSON.stringify(req.body, null, 2));

  if (hasErrors) {
    const errorList = errors.array();

    console.warn('[VALIDATION] Validation failed with the following errors:');
    errorList.forEach(err => console.warn(` - ${err.param}: ${err.msg}`));

    // API Request: Return JSON
    if (req.originalUrl.startsWith('/api') || req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ errors: errorList });
    }

    // Form Submission: Store in session and redirect
    req.session.validationErrors = errorList;
    req.session.lastUrl = req.originalUrl;
    return res.redirect(req.originalUrl);
  }

  console.info('[VALIDATION] Validation passed.');
  next();
};
