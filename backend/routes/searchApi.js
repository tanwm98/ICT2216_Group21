const pool = require('../../db');  // import connection string from db.js
const express = require('express');

const router = express.Router();

// ======================================
// SECURITY HELPER FUNCTIONS
// ======================================

// SECURITY: Validate and generate secure image URLs
function validateAndGenerateImageUrl(imageFilename) {
    if (!imageFilename || typeof imageFilename !== 'string') {
        return '/static/img/restaurants/no-image.png';
    }

    // SECURITY: Validate filename format to prevent directory traversal
    const safeFilenameRegex = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i;
    if (!safeFilenameRegex.test(imageFilename)) {
        console.warn('Invalid image filename detected:', imageFilename);
        return '/static/img/restaurants/no-image.png';
    }

    // SECURITY: Ensure filename doesn't contain path traversal attempts
    if (imageFilename.includes('..') || imageFilename.includes('/') || imageFilename.includes('\\')) {
        console.warn('Path traversal attempt detected:', imageFilename);
        return '/static/img/restaurants/no-image.png';
    }

    return `/static/img/restaurants/${imageFilename}`;
}

// SECURITY: Sanitize alt text to prevent XSS
function sanitizeAltText(altText, storeName) {
    if (!altText || typeof altText !== 'string') {
        return `${sanitizeString(storeName || 'Unknown Restaurant')} restaurant image`;
    }

    return sanitizeString(altText.substring(0, 100)); // Limit length
}

// SECURITY: General string sanitization
function sanitizeString(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }

    return str
        .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
        .trim()
        .substring(0, 255); // Limit length
}

// SECURITY: Transform store data to include secure image URLs
function transformStoreData(stores) {
    return stores.map(store => ({
        store_id: store.store_id,
        storeName: store.storeName,
        location: store.location,
        cuisine: store.cuisine,
        priceRange: store.priceRange,
        average_rating: store.average_rating,
        review_count: store.review_count,
        currentCapacity: store.currentCapacity, // For reservation availability

        // FIXED: Generate secure image URLs instead of base64
        imageUrl: validateAndGenerateImageUrl(store.image_filename),
        altText: sanitizeAltText(store.image_alt_text, store.storeName)

        // Note: Remove store.image (base64) from response
    }));
}

// ======================================
// ROUTES - UPDATED WITH IMAGE URL FIXES
// ======================================

// Route to get locations (unchanged - no image data)
router.get('/available_locations', async (req, res) => {
  try {
    const result = await pool.query(`SELECT DISTINCT location FROM stores ORDER BY location`);

    // SECURITY: Add security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=300'
    });

    res.json(result.rows.map(row => row.location));
  } catch (err) {
    console.error('Error fetching locations:', err);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// FIXED: Route to display ALL stores
router.get('/displayallStores', async (req, res) => {
    try {
      // UPDATED: Select image_filename and image_alt_text instead of image
      const query = await pool.query(`
        SELECT
          s."store_id",
          s."storeName",
          s.image_filename,
          s.image_alt_text,
          s.cuisine,
          s.location,
          s."priceRange",
          ROUND(AVG(r.rating), 1) AS "average_rating",
          COUNT(r.rating) AS "review_count"
          FROM stores s
          LEFT JOIN reviews r ON s."store_id" = r."store_id"
          GROUP BY s."store_id", s."storeName", s.image_filename, s.image_alt_text, s.cuisine, s.location, s."priceRange";
        `);

        // FIXED: Transform data to include secure image URLs
        const transformedStores = transformStoreData(query.rows);

        // SECURITY: Add security headers
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=300'
        });

        res.json(transformedStores);

      } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// FIXED: Route to filter stores by reservation availability
router.get('/display_by_ReservationAvailability', async (req, res) => {
    try {
        // SECURITY: Validate inputs
        const people = parseInt(req.query.people, 10);
        const date = req.query.date;
        const time = req.query.time;

        if (!people || !date || !time) {
            return res.status(400).json({
                error: 'Missing required parameters',
                required: ['people', 'date', 'time']
            });
        }

        if (isNaN(people) || people < 1 || people > 50) {
            return res.status(400).json({
                error: 'Invalid people count',
                message: 'People count must be between 1 and 50'
            });
        }

        // UPDATED: Select image_filename and image_alt_text, exclude image
        const result = await pool.query(
            `
            SELECT s."store_id",
                   s."storeName",
                   s.image_filename,
                   s.image_alt_text,
                   s.cuisine,
                   s.location,
                   s."priceRange",
                   s."currentCapacity",
                   AVG(rv.rating)::numeric(2,1) AS "average_rating",
                   COUNT(rv."store_id") AS "review_count"
            FROM stores s
            LEFT JOIN reviews rv ON s."store_id" = rv."store_id"
            WHERE s."currentCapacity" >= $1
              AND NOT EXISTS (
                    SELECT 1 FROM reservations r
                    WHERE r.store_id = s.store_id
                      AND r."reservationDate" = $2
                      AND r."reservationTime" = $3
              )
            GROUP BY s."store_id", s."storeName", s.image_filename, s.image_alt_text, s.cuisine, s.location, s."priceRange", s."currentCapacity"
            `,
            [people, date, time]
        );

        // FIXED: Transform data to include secure image URLs
        const transformedStores = transformStoreData(result.rows);

        // SECURITY: Add security headers
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'public, max-age=300'
        });

        res.json(transformedStores);

    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// FIXED: Route to display filtered stores
router.get('/display_filtered_store', async (req, res) => {
  try {
    // SECURITY: Validate inputs
    const cuisines = req.query.cuisines ? req.query.cuisines.split(',').map(c => c.trim()) : [];
    const priceRange = req.query.priceRange;
    const reviewScoreMin = parseFloat(req.query.reviewScoreMin);
    const reviewScoreMax = parseFloat(req.query.reviewScoreMax);
    const location = req.query.location;

    const values = [];
    // UPDATED: Select image_filename and image_alt_text, exclude image
    let sql = `
      SELECT s."store_id",
             s."storeName",
             s.image_filename,
             s.image_alt_text,
             s.cuisine,
             s.location,
             s."priceRange",
             s."currentCapacity",
             AVG(r.rating)::numeric(2,1) AS "average_rating",
             COUNT(r."store_id") AS "review_count"
      FROM stores s
      LEFT JOIN reviews r ON s."store_id" = r."store_id"
      WHERE 1=1
    `;

    if (cuisines.length > 0) {
      values.push(cuisines);
      sql += ` AND s.cuisine = ANY($${values.length})`;
    }

    if (priceRange) {
      values.push(priceRange);
      sql += ` AND s."priceRange" = $${values.length}`;
    }

    if (location) {
      values.push(location);
      sql += ` AND s.location = $${values.length}`;
    }

    // UPDATED: Add image columns to GROUP BY
    sql += ` GROUP BY s."store_id", s."storeName", s.image_filename, s.image_alt_text, s.cuisine, s.location, s."priceRange", s."currentCapacity"`;

    if (!isNaN(reviewScoreMin) && !isNaN(reviewScoreMax)) {
      values.push(reviewScoreMin - 0.5);
      sql += ` HAVING AVG(r.rating) >= $${values.length}`;
      values.push(reviewScoreMax + 0.5);
      sql += ` AND AVG(r.rating) <= $${values.length}`;
    }

    console.log("SQL:", sql);
    console.log("Values:", values);

    const result = await pool.query(sql, values);

    // FIXED: Transform data to include secure image URLs
    const transformedStores = transformStoreData(result.rows);

    // SECURITY: Add security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=300'
    });

    res.json(transformedStores);
  } catch (err) {
    console.error('Filter error:', err);
    res.status(500).json({ error: 'Failed to fetch filtered data' });
  }
});

module.exports = router;