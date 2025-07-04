const db = require('../../db');  // import connection string from db.js
const express = require('express');

const router = express.Router();

// To count ratings and reviews, Displays all stores
router.get('/displayStores', async (req, res) => {
    try {
        const stores = await db('stores as s')
            .leftJoin('reviews as r', 's.store_id', 'r.store_id')
            .select([
                's.store_id',
                's.storeName',
                's.location',
                's.cuisine',
                's.priceRange',
                's.image_filename',
                's.image_alt_text'
            ])
            .avg('r.rating as average_rating')
            .count('r.rating as review_count')
            .where('s.status', 'approved')
            .groupBy([
                's.store_id',
                's.storeName',
                's.location',
                's.cuisine',
                's.priceRange',
                's.image_filename',
                's.image_alt_text'
            ])
            .orderBy('s.store_id');

        const formattedStores = stores.map(store => ({
            store_id: store.store_id,
            storeName: store.storeName,
            location: store.location,
            cuisine: store.cuisine,
            priceRange: store.priceRange,
            average_rating: store.average_rating ? parseFloat(store.average_rating).toFixed(1) : null,
            review_count: parseInt(store.review_count) || 0,
            imageUrl: store.image_filename
                ? `static/img/restaurants/${store.image_filename}`
                : 'static/img/restaurants/no-image.png',
            altText: store.image_alt_text || `${store.storeName} restaurant image`
        }));

        res.json(formattedStores);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            error: 'Failed to fetch stores',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

module.exports = router;