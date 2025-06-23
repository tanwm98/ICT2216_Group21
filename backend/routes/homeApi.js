const pool = require('../../db');  // import connection string from db.js
const express = require('express');

const router = express.Router();

// To count ratings and reviews, Displays all stores
router.get('/displayStores', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s."store_id",
                s."storeName",
                s.location,
                s.cuisine,
                s."priceRange",
                s.image_filename,
                s.image_alt_text,
                ROUND(AVG(r.rating), 1) AS "average_rating",
                COUNT(r.rating) AS "review_count"
            FROM stores s
            LEFT JOIN reviews r ON s."store_id" = r."store_id"
            GROUP BY s."store_id", s."storeName", s.location, s.cuisine, s."priceRange", s.image_filename, s.image_alt_text
            ORDER BY s."store_id"
        `);

        // Return optimized response with proper image URLs
        const stores = result.rows.map(store => ({
            store_id: store.store_id,
            storeName: store.storeName,
            location: store.location,
            cuisine: store.cuisine,
            priceRange: store.priceRange,
            average_rating: store.average_rating,
            review_count: store.review_count,
            // Generate proper image URL based on your static folder structure
            imageUrl: store.image_filename
                ? `static/img/restaurants/${store.image_filename}`
                : 'static/img/restaurants/no-image.png',
            altText: store.image_alt_text || `${store.storeName} restaurant image`
        }));

        res.json(stores);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch stores' });
    }
});

module.exports = router;