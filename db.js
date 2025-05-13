require('dotenv').config();
const { Pool } = require('pg');

// Create a pool with the database connection string
const pool = new Pool({
    connectionString: process.env.DB_URL, // gets connection string from env file
      ssl: {
        rejectUnauthorized: false, 
      },
});

// export pool to use universally
module.exports = pool;


// test connection
async function testConnection() {
    try {
        const res = await pool.query('SELECT * FROM users');  
        console.log('Connected to the database:');

        res.rows.forEach((user, index) => {
            console.log(`User ${index + 1}:`, user);
        });

    } catch (err) {
        console.error('Database connection failed:', err); 
    }
}

testConnection();
