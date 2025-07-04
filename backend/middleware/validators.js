const { body, param, query } = require('express-validator');
const db = require('../../db');

exports.loginValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email is invalid'),

  body('password')
    .exists()
    .withMessage('Password is required'),
];

exports.registerValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email'),

  body('password')
    .isLength({ min: 8, max: 64 })
    .withMessage('Password must be between 8 and 64 characters'),

  body('name')
    .trim()
    .matches(/^[A-Za-z0-9._-]+$/)
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must only contain letters, numbers, dot, dash, or underscore'),

  body('firstname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .isLength({ min: 2, max: 100 })
    .withMessage('First name must be alphabetic'),

  body('lastname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .isLength({ min: 2, max: 100 })
    .withMessage('Last name must be alphabetic'),

//  body('role')
//    .isIn(['user', 'owner'])
//    .withMessage('Invalid role'),
];

exports.ownerValidator = [
  body('ownerName')
    .trim()
    .matches(/^[A-Za-z0-9._-]+$/)
    .withMessage('Owner name must only contain letters, numbers, dot, dash, or underscore'),

  body('firstname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .withMessage('First name must be alphabetic'),

  body('lastname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .withMessage('Last name must be alphabetic'),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email'),

  body('storeName')
    .trim()
    .matches(/^[A-Za-z0-9\s]+$/)
    .withMessage('Store name must only contain letters and numbers')
    .custom(async (value, { req }) => {
      const location = req.body.location;
      if (!location) return true;
      const existing = await db('stores')
        .select(1)
        .where('storeName', value)
        .where('location', location)
        .first();
      if (existing) {
        console.log('[VALIDATION FAIL] Duplicate store at location:', { storeName: value, location });
        throw new Error('A restaurant with this name at the same location already exists.');
      }
      return true;
    }),

  body('address')
    .trim()
    .matches(/^[A-Za-z0-9#,\-/&\s]+$/)
    .withMessage('Address must only contain letters, numbers, #, , -, /, or &'),

  body('postalCode')
    .matches(/^\d{6}$/)
    .withMessage('Postal code must be a 6-digit number'),

  body('cuisine')
    .isIn(['Asian', 'Asian Fusion', 'Korean', 'Western', 'Italian', 'Chinese', 'Japanese', 'Others'])
    .withMessage('Cuisine must be one of Asian, Asian Fusion, Korean, Western, Italian, Chinese, Japanese, or Others'),

  body('location')
    .trim()
    .matches(/^[A-Za-z\s]+$/)
    .withMessage('Location must only contain letters'),

  body('priceRange')
    .isIn(['$', '$$', '$$$', '$$$$', '$$$$$'])
    .withMessage('Price range must be one of $, $$, $$$, $$$$, $$$$$'),

  body('capacity')
    .isInt({ min: 1 })
    .toInt()
    .withMessage('Seating capacity must be a positive number')
    .custom((value, { req }) => {
      const totalCap = parseInt(req.body.totalCapacity);
      if (!isNaN(totalCap) && value > totalCap) {
        console.log('[VALIDATION FAIL] Capacity exceeds totalCapacity:', { capacity: value, totalCapacity: totalCap });
        throw new Error('Capacity cannot exceed total capacity');
      }
      return true;
    }),

  body('totalCapacity')
    .isInt({ min: 1 })
    .toInt()
    .withMessage('Total capacity must be a positive number'),

  body('opening')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('Opening time must be in HH:MM format'),

  body('closing')
  .matches(/^\d{2}:\d{2}$/)
  .withMessage('Closing time must be in HH:MM format')
  .custom((closing, { req }) => {
    const opening = req.body.opening;
    if (!opening) return true;

    const [openHour, openMin] = opening.split(':').map(Number);
    const [closeHour, closeMin] = closing.split(':').map(Number);

    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;

    // Assume closing wraps to next day if it's earlier or equal
    const adjustedClose = closeMinutes <= openMinutes ? closeMinutes + 1440 : closeMinutes;
    const duration = adjustedClose - openMinutes;

    if (duration < 60 || duration > 1440) {
      console.log('[VALIDATION FAIL] Operating hours must be between 1 hour and 24 hours:', { opening, closing, duration });
      return false;
    }

    return true;
  })
  .withMessage('Closing time must be at least 1 hour after opening and within 24 hours'),
];


exports.restaurantAddValidator = [
  body('storeName')
    .trim()
    .matches(/^[A-Za-z0-9\s]+$/)
    .withMessage('Store name must only contain letters and numbers')
    .custom(async (storeName, { req }) => {
      const location = req.body.location;
      const existing = await db('stores')
        .select(1)
        .where('storeName', storeName)
        .where('location', location)
        .first();
      if (existing) {
        throw new Error('A restaurant with this name already exists at this location.');
      }
      return true;
    }),

  body('address')
    .trim()
    .matches(/^[A-Za-z0-9#,\-/&\s]+$/)
    .withMessage('Address must only contain letters, numbers, #, , -, /, or &'),

  body('postalCode')
    .matches(/^\d{6}$/)
    .withMessage('Postal code must be a 6-digit number'),

  body('location')
    .trim()
    .matches(/^[A-Za-z\s]+$/)
    .withMessage('Location must only contain letters'),

  body('cuisine')
    .isIn(['Chinese', 'Italian', 'Japanese', 'Thai', 'Indian', 'Mexican', 'French', 'Greek', 'Korean', 'Vietnamese', 'Western', 'Local', 'Other'])
    .withMessage('Invalid Cuisine Type'),
    
  body('priceRange')
    .isIn(['$', '$$', '$$$', '$$$$', '$$$$$'])
    .withMessage('Price range must be one of $, $$, $$$, $$$$, $$$$$'),

  body('totalCapacity')
    .isInt({ min: 1 })
    .withMessage('Total capacity must be a positive number'),

  body('opening')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('Opening time must be in HH:MM format'),

  body('closing')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('Closing time must be in HH:MM format')
    .custom((closing, { req }) => {
      const opening = req.body.opening;
      if (!opening) return true;

      const [openHour, openMin] = opening.split(':').map(Number);
      const [closeHour, closeMin] = closing.split(':').map(Number);

      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      const adjustedClose = closeMinutes <= openMinutes ? closeMinutes + 1440 : closeMinutes;
      const duration = adjustedClose - openMinutes;

      if (duration < 60 || duration > 1440) {
        console.log('[VALIDATION FAIL] Operating hours must be between 1 hour and 24 hours:', { opening, closing, duration });
        return false;
      }

      return true;
    })
    .withMessage('Closing time must be at least 1 hour after opening and within 24 hours'),

  body('owner_id')
    .isInt({ min: 1 })
    .withMessage('Owner ID must be selected'),
];

exports.updateRestaurantValidator = [
  param('id').isInt().withMessage('Restaurant ID must be an integer'),

  body('storeName')
    .trim()
    .matches(/^[A-Za-z0-9\s]+$/)
    .withMessage('Store name must only contain letters and numbers'),

  body('address')
    .trim()
    .matches(/^[A-Za-z0-9#,\-/&\s]+$/)
    .withMessage('Address must only contain letters, numbers, #, , -, /, or &')
    .custom(async (address, { req }) => {
      const storeName = req.body.storeName;
      const storeId = req.params.id;
      const existing = await db('stores')
        .select(1)
        .where('storeName', storeName)
        .where('address', address)
        .where('store_id', '!=', storeId)
        .first();
      if (existing) {
        throw new Error('A restaurant with this name and address already exists.');
      }
      return true;
    }),

  body('postalCode')
    .matches(/^\d{6}$/)
    .withMessage('Postal code must be a 6-digit number'),

  body('location')
    .trim()
    .matches(/^[A-Za-z\s]+$/)
    .withMessage('Location must only contain letters'),

  body('cuisine')
    .isIn(['Chinese', 'Italian', 'Japanese', 'Thai', 'Indian', 'Mexican', 'French', 'Greek', 'Korean', 'Vietnamese', 'Western', 'Local', 'Other'])
    .withMessage('Invalid Cuisine Type'),

  body('priceRange')
    .isIn(['$', '$$', '$$$', '$$$$', '$$$$$'])
    .withMessage('Price range must be one of $, $$, $$$, $$$$, $$$$$'),

  body('totalCapacity')
    .isInt({ min: 1 })
    .withMessage('Total capacity must be a positive number'),

  body('opening')
    .matches(/^\d{2}:\d{2}(:\d{2})?$/)
    .withMessage('Opening time must be in HH:MM format'),

  body('closing')
    .matches(/^\d{2}:\d{2}(:\d{2})?$/)
    .withMessage('Closing time must be in HH:MM format')
    .custom((closing, { req }) => {
      const opening = req.body.opening;
      if (!opening) return true;

      const [openHour, openMin] = opening.split(':').map(Number);
      const [closeHour, closeMin] = closing.split(':').map(Number);

      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      const adjustedClose = closeMinutes <= openMinutes ? closeMinutes + 1440 : closeMinutes;
      const duration = adjustedClose - openMinutes;

      if (duration <= 0 || duration > 1440) {
        console.warn('[VALIDATION FAIL] Operating hours must be between 1hr and 24hrs');
        return false;
      }
      return true;
    })
    .withMessage('Closing time must be after opening time and within 24 hours'),

  body('owner_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Owner ID must be a positive integer'),
];

exports.addUserValidator = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email must be a valid email address'),

  body('name')
    .trim()
    .matches(/^[A-Za-z0-9._-]+$/)
    .withMessage('Name must only contain letters, numbers, dot, dash, or underscore'),

  body('role')
    .isIn(['user', 'owner'])
    .withMessage('Role must be either user or owner'),

  body('fname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .withMessage('First name must only contain letters'),

  body('lname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .withMessage('Last name must only contain letters'),
];

exports.cancelReservationValidator = [
  param('id')
    .isInt().withMessage('Invalid reservation ID'),
];

exports.userPasswordValidator = [
  body('newPassword')
    .isLength({ min: 8, max: 64 })
    .withMessage('Password must be between 8 and 64 characters'),
];

exports.userNameValidator = [
  body('name')
    .trim()
    .escape()
    .matches(/^[A-Za-z0-9._-]+$/)
    .isLength({ min: 2, max: 100 })
    .withMessage('Username must only contain letters, numbers, dot, dash, or underscore.')
];

exports.userFirstNameValidator = [
  body('firstname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .isLength({ min: 2, max: 100 })
    .withMessage('First name must only contain letters.')
];

exports.userLastNameValidator = [
  body('lastname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .isLength({ min: 2, max: 100 })
    .withMessage('Last name must only contain letters.')
];

exports.reserveValidator = [
  body('pax').isInt({ min: 1 }).withMessage('Pax must be a positive integer'),
  body('userid').isInt().withMessage('User ID must be an integer'),
  body('storeid').isInt().withMessage('Store ID must be an integer'),
  body('time').matches(/^\d{2}:\d{2}$/).withMessage('Time must be in HH:MM format'),
  body('date').isISO8601().withMessage('Date must be valid (YYYY-MM-DD)'),
  body('firstname').trim().escape().isAlpha().withMessage('First name must contain only letters'),
  body('lastname').trim().escape().isAlpha().withMessage('Last name must contain only letters'),
  body('specialrequest').optional().trim().escape(),
  body('storename').trim().escape(),
  body('adultpax').isInt({ min: 0 }).withMessage('Adult pax must be >= 0'),
  body('childpax').isInt({ min: 0 }).withMessage('Child pax must be >= 0'),
];

exports.updateReservationValidator = [
  body('pax').isInt({ min: 1 }).withMessage('Pax must be a positive integer'),
  body('userid').isInt().withMessage('User ID must be an integer'),
  body('reservationid').isInt().withMessage('Reservation ID must be an integer'),
  body('time').matches(/^\d{2}:\d{2}$/).withMessage('Time must be in HH:MM format'),
  body('date').isISO8601().withMessage('Date must be valid (YYYY-MM-DD)'),
  body('firstname').trim().escape().isAlpha().withMessage('First name must contain only letters'),
  body('lastname').trim().escape().isAlpha().withMessage('Last name must contain only letters'),
  body('specialrequest').optional().trim().escape(),
  body('storename').trim().escape(),
  body('adultpax').isInt({ min: 0 }).withMessage('Adult pax must be >= 0'),
  body('childpax').isInt({ min: 0 }).withMessage('Child pax must be >= 0'),
];

exports.reviewValidator = [
  body('userid').isInt().withMessage('User ID must be an integer'),
  body('storeid').isInt().withMessage('Store ID must be an integer'),
  body('rating').isFloat({ min: 0.1, max: 5 }).withMessage('Rating must be between 0.1 and 5.0'),
  body('review').trim().escape().isLength({ min: 1 }).withMessage('Review cannot be empty')
];
