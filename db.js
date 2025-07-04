require('dotenv').config();
const knex = require('knex');
const config = require('./knexfile');

const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

// Test connection
async function testConnection() {
    try {
        await db.raw('SELECT 1+1 AS result');
        console.log('✅ Connected to database via Knex');

        // Test query to show users
        const users = await db('users').select('*').limit(5);
        console.log('Database users sample:', users.length);
    } catch (err) {
        console.error('❌ Database connection failed:', err);
    }
}

testConnection();

module.exports = db;