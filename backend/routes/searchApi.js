const db = require('../../db');
const express = require('express');

// const app = express();
const router = express.Router();
const { query } = require('express-validator');
const handleValidation = require('../middleware/handleHybridValidation'); // adjust path if needed

// REUSE existing functions from selectedResApi.js
const selectedResApi = require('./selectedResApi');

// Extract the image functions (they're not exported, so we need to recreate them)
function validateAndGenerateImageUrl(imageFilename) {
    if (!imageFilename || typeof imageFilename !== 'string') {
        return '/static/img/restaurants/no-image.png';
    }

    const safeFilenameRegex = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i;
    if (!safeFilenameRegex.test(imageFilename)) {
        console.warn('Invalid image filename detected:', imageFilename);
        return '/static/img/restaurants/no-image.png';
    }

    if (imageFilename.includes('..') || imageFilename.includes('/') || imageFilename.includes('\\')) {
        console.warn('Path traversal attempt detected:', imageFilename);
        return '/static/img/restaurants/no-image.png';
    }

    return `/static/img/restaurants/${imageFilename}`;
}

function sanitizeAltText(altText, storeName) {
    if (!altText || typeof altText !== 'string') {
        return `${storeName || 'Unknown Restaurant'} restaurant image`;
    }
    return altText.substring(0, 100);
}

// Simple function to add image URLs to existing data
function addImageUrls(stores) {
    return stores.map(store => ({
        ...store,
        imageUrl: validateAndGenerateImageUrl(store.image_filename),
        altText: sanitizeAltText(store.image_alt_text, store.storeName)
    }));
}

// Route to get locations
router.get('/available_locations', async (req, res) => {
  try {
    const locations = await db('stores')
      .distinct('location')
      .orderBy('location')
      .pluck('location');

    res.json(locations);
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Route to display ALL stores
router.get('/displayallStores', async (req, res) => {
    try {
      const stores = await db('stores as s')
        .leftJoin('reviews as r', 's.store_id', 'r.store_id')
        .select([
          's.store_id',
          's.storeName',
          's.image_filename',
          's.image_alt_text',
          's.cuisine',
          's.location',
          's.priceRange'
        ])
        .avg('r.rating as average_rating')
        .count('r.rating as review_count')
        .groupBy([
          's.store_id',
          's.storeName',
          's.image_filename',
          's.image_alt_text',
          's.cuisine',
          's.location',
          's.priceRange'
        ]);

      // Format the results to match expected structure
      const formattedStores = stores.map(store => ({
        ...store,
        average_rating: store.average_rating ? parseFloat(store.average_rating).toFixed(1) : null,
        review_count: parseInt(store.review_count) || 0
      }));

      // Add image URLs to the response
      res.json(addImageUrls(formattedStores));
    } catch (err) {
      console.error('Error querying database:', err);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// ========== FILTER BY RESERVATION AVAILABILITY ==========
router.get(
  '/display_by_ReservationAvailability',
  [
    query('people').isInt({ min: 1, max: 50 }).withMessage('People count must be an integer between 1 and 50'),
    query('date').isISO8601().withMessage('Date must be in YYYY-MM-DD format'),
    query('time').matches(/^\d{2}:\d{2}$/).withMessage('Time must be in HH:MM format'),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { people, date, time } = req.query;

      const stores = await db('stores as s')
        .leftJoin('reviews as rv', 's.store_id', 'rv.store_id')
        .where('s.status', 'approved')
        .where('s.currentCapacity', '>=', people)
        .where('s.opening', '<=', time)
        .where('s.closing', '>=', time)
        .whereNotExists(function() {
          this.select(1)
            .from('reservations as r')
            .whereRaw('r.store_id = s.store_id')
            .where('r.reservationDate', date)
            .where('r.reservationTime', time);
        })
        .select([
          's.store_id',
          's.storeName',
          's.image_filename',
          's.image_alt_text',
          's.cuisine',
          's.location',
          's.priceRange',
          's.currentCapacity'
        ])
        .avg('rv.rating as average_rating')
        .count('rv.rating as review_count')
        .groupBy([
          's.store_id',
          's.storeName',
          's.image_filename',
          's.image_alt_text',
          's.cuisine',
          's.location',
          's.priceRange',
          's.currentCapacity'
        ]);

      // Format results
      const formattedStores = stores.map(store => ({
        ...store,
        average_rating: store.average_rating ? parseFloat(store.average_rating).toFixed(1) : null,
        review_count: parseInt(store.review_count) || 0
      }));

      // Add image URLs to the response
      res.json(addImageUrls(formattedStores));
    } catch (err) {
      console.error('Error querying database:', err);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  }
);

// ========== FILTERED SEARCH ==========
router.get(
  '/display_filtered_store',
  [
    query('priceRange').optional().isIn(['$', '$$', '$$$', '$$$$', '$$$$$']),
    query('reviewScoreMin').optional().isFloat({ min: 0, max: 5 }),
    query('reviewScoreMax').optional().isFloat({ min: 0, max: 5 }),
    query('cuisines').optional().matches(/^([\w\s]+,?)*$/),
    query('location').optional().trim().isString(),
  ],
  handleValidation,
  async (req, res) => {
    try {
      console.log('Search filters received:', req.query);
      const cuisines = req.query.cuisines ? req.query.cuisines.split(',') : [];
      const { priceRange, reviewScoreMin, reviewScoreMax, location } = req.query;

      let query = db('stores as s')
        .leftJoin('reviews as r', 's.store_id', 'r.store_id')
        .select([
          's.*'
        ])
        .avg('r.rating as average_rating')
        .count('r.store_id as review_count');

      // Apply filters
      if (cuisines.length > 0) {
        query = query.whereIn('s.cuisine', cuisines);
      }

      if (priceRange) {
        query = query.andWhere('s.priceRange', priceRange);
      }

      if (location) {
        query = query.andWhere('s.location', location);
      }

      query = query.groupBy([
        's.store_id',
        's.storeName',
        's.image_filename',
        's.image_alt_text',
        's.cuisine',
        's.location',
        's.priceRange',
        's.currentCapacity'
      ]);

      // Apply rating filters using HAVING clause
      if (!isNaN(reviewScoreMin) && !isNaN(reviewScoreMax) &&
          (reviewScoreMin > 1 || reviewScoreMax < 5)) {
        query = query.havingRaw('AVG(r.rating) >= ?', [parseFloat(reviewScoreMin) - 0.5])
                     .havingRaw('AVG(r.rating) <= ?', [parseFloat(reviewScoreMax) + 0.5]);
      }

      const stores = await query;

      // Format results
      const formattedStores = stores.map(store => ({
        ...store,
        average_rating: store.average_rating ? parseFloat(store.average_rating).toFixed(1) : null,
        review_count: parseInt(store.review_count) || 0
      }));

      // Add image URLs to the response
      res.json(addImageUrls(formattedStores));
    } catch (err) {
      console.error('Filter error:', err);
      res.status(500).json({ error: 'Failed to fetch filtered data' });
    }
  }
);

module.exports = router;