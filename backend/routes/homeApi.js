const db = require('../../db');  // import connection string from db.js
const express = require('express');
const { query } = require('express-validator');
const handleValidation = require('../middleware/handleHybridValidation');
const router = express.Router();

// To count ratings and reviews, Displays all stores
router.get('/displayStores', [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], handleValidation, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        // Get total count for pagination info
        const totalCountResult = await db('stores')
            .where('status', 'approved')
            .count('store_id as total')
            .first();

        const totalStores = parseInt(totalCountResult.total) || 0;
        const totalPages = Math.ceil(totalStores / limit);

        // Get paginated stores
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
            .orderBy('s.store_id')
            .limit(limit)
            .offset(offset);

        const formattedStores = stores.map(store => ({
            store_id: store.store_id,
            storeName: store.storeName,
            location: store.location,
            cuisine: store.cuisine,
            priceRange: store.priceRange,
            average_rating: store.average_rating ? parseFloat(store.average_rating).toFixed(1) : null,
            review_count: parseInt(store.review_count) || 0,
            imageUrl: store.image_filename
                ? `/static/img/restaurants/${store.image_filename}`
                : '/static/img/restaurants/no-image.png',
            altText: store.image_alt_text || `${store.storeName} restaurant image`
        }));

        res.json({
            stores: formattedStores,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalStores: totalStores,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                limit: limit
            }
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({
            error: 'Failed to fetch stores',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});


module.exports = router;