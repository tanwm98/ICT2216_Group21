// const { validationResult } = require('express-validator');

// module.exports = (req, res, next) => {
//   const errors = validationResult(req);
//   const hasErrors = !errors.isEmpty();

//   // Log request details always
//   console.info('[VALIDATION] Received Request');
//   console.info('Path:', req.originalUrl);
//   console.info('Method:', req.method);
//   console.info('IP:', req.ip);
//   console.info('User-Agent:', req.headers['user-agent']);
//   console.info('Body:', JSON.stringify(req.body, null, 2));

//   if (hasErrors) {
//     const errorList = errors.array();

//     console.warn('[VALIDATION] Validation failed with the following errors:');
//     errorList.forEach(err => {
//       console.warn(` - ${err.param}: ${err.msg}`);
//     });

//     const errorMessages = encodeURIComponent(errorList.map(e => e.msg).join(', '));
//     const isFormRequest = req.headers.accept && req.headers.accept.includes('text/html');

//     if (isFormRequest) {
//       return res.redirect(`${req.originalUrl}?error=validation&messages=${errorMessages}`);
//     }

//     return res.status(400).json({
//       status: 'fail',
//       message: 'Validation failed',
//       errors: errorList,
//     });
//   }

//   console.info('[VALIDATION] Validation passed.');
//   next();
// };

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
    errorList.forEach(err => {
      console.warn(` - ${err.param}: ${err.msg}`);
    });

    // Store errors in session and redirect to last page
    req.session.validationErrors = errorList;
    req.session.lastUrl = req.originalUrl;

    return res.redirect(req.originalUrl);
  }

  console.info('[VALIDATION] Validation passed.');
  next();
};
