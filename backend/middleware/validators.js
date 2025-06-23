const { body, param, query } = require('express-validator');

exports.loginValidator = [
  body('email')
    .isEmail()
    .withMessage('Email is invalid'),

  body('password')
    .isLength({ min: 8, max: 64 })
    .withMessage('Password must be between 8 and 64 characters'),
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
    .withMessage('Name must only contain letters, numbers, dot, dash, or underscore'),

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

  body('role')
    .isIn(['user', 'owner'])
    .withMessage('Invalid role'),
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
    .withMessage('Store name must only contain letters and numbers'),

  body('address')
    .trim()
    .matches(/^[A-Za-z0-9#,\-\s]+$/)
    .withMessage('Address must only contain letters, numbers, #, , or -'),

  body('postalCode')
    .matches(/^\d{6}$/)
    .withMessage('Postal code must be a 6-digit number'),

  body('cuisine')
    .trim()
    .matches(/^[A-Za-z\s]+$/)
    .withMessage('Cuisine must only contain letters'),

  body('location')
    .trim()
    .matches(/^[A-Za-z\s]+$/)
    .withMessage('Location must only contain letters'),

  body('priceRange')
    .isIn(['$', '$$', '$$$', '$$$$', '$$$$$'])
    .withMessage('Price range must be one of $, $$, $$$, $$$$, $$$$$'),

  body('capacity')
    .isInt({ min: 1 })
    .withMessage('Seating capacity must be a positive number'),

  body('totalCapacity')
    .isInt({ min: 1 })
    .withMessage('Total capacity must be a positive number'),

  body('opening')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('Opening time must be in HH:MM format'),

  body('closing')
    .matches(/^\d{2}:\d{2}$/)
    .withMessage('Closing time must be in HH:MM format')
];

exports.updateRestaurantValidator = [
  param('id')
    .isInt().withMessage('Invalid restaurant ID'),

  body('storeName')
    .trim()
    .matches(/^[A-Za-z0-9\s]+$/)
    .withMessage('Store name must only contain letters and numbers'),

  body('address')
    .trim()
    .matches(/^[A-Za-z0-9#,\-\s]+$/)
    .withMessage('Address must only contain letters, numbers, #, , or -'),

  body('postalCode')
    .matches(/^\d{6}$/)
    .withMessage('Postal code must be a 6-digit number'),

  body('location')
    .trim()
    .matches(/^[A-Za-z\s]+$/)
    .withMessage('Location must only contain letters'),

  body('cuisine')
    .trim()
    .matches(/^[A-Za-z\s]+$/)
    .withMessage('Cuisine must only contain letters'),

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
    .withMessage('Closing time must be in HH:MM format'),
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
    .withMessage('Username must only contain letters, numbers, dot, dash, or underscore.')
];

exports.userFirstNameValidator = [
  body('firstname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .withMessage('First name must only contain letters.')
];

exports.userLastNameValidator = [
  body('lastname')
    .trim()
    .escape()
    .matches(/^[A-Za-z]+$/)
    .withMessage('Last name must only contain letters.')
];

exports.reserveValidator = [
  query('userid').isInt().withMessage('User ID must be an integer'),
  query('storeid').isInt().withMessage('Store ID must be an integer'),
  query('pax').isInt({ min: 1 }).withMessage('Pax must be a positive integer'),
  query('time').matches(/^\d{2}:\d{2}$/).withMessage('Time must be in HH:MM format'),
  query('date').isISO8601().withMessage('Date must be valid (YYYY-MM-DD)'),
  query('firstname').trim().escape().isAlpha().withMessage('First name must contain only letters'),
  query('lastname').trim().escape().isAlpha().withMessage('Last name must contain only letters'),
  query('specialrequest').optional().trim().escape(),
  query('storename').trim().escape(),
  query('adultpax').isInt({ min: 0 }).withMessage('Adult pax must be >= 0'),
  query('childpax').isInt({ min: 0 }).withMessage('Child pax must be >= 0')
];

exports.updateReservationValidator = [
  body('pax').isInt({ min: 1 }).withMessage('Pax must be a positive integer'),
  body('time').matches(/^\d{2}:\d{2}$/).withMessage('Time must be in HH:MM format'),
  body('date').isISO8601().withMessage('Date must be valid (YYYY-MM-DD)'),
  body('firstname').trim().escape().isAlpha().withMessage('First name must contain only letters'),
  body('lastname').trim().escape().isAlpha().withMessage('Last name must contain only letters'),
  body('specialrequest').optional().trim().escape(),
  body('reservationid').isInt().withMessage('Reservation ID must be an integer'),
  body('adultpax').isInt({ min: 0 }).withMessage('Adult pax must be >= 0'),
  body('childpax').isInt({ min: 0 }).withMessage('Child pax must be >= 0'),
  body('storename').trim().escape(),
  body('userid').isInt().withMessage('User ID must be an integer')
];

exports.reviewValidator = [
  body('userid').isInt().withMessage('User ID must be an integer'),
  body('storeid').isInt().withMessage('Store ID must be an integer'),
  body('rating').isFloat({ min: 0.1, max: 5 }).withMessage('Rating must be between 0.1 and 5.0'),
  body('review').trim().escape().isLength({ min: 1 }).withMessage('Review cannot be empty')
];