const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const pool = require('./db'); // your database module


app.use('/html', express.static(path.join(__dirname, 'frontend/html')));
app.use('/js', express.static(path.join(__dirname, 'frontend/js')));
app.use('/common', express.static(path.join(__dirname, 'frontend/common')));
app.use('/static', express.static(path.join(__dirname, 'frontend/static')));
// app.use(express.static(path.join(__dirname, 'frontend/js'))); // dt need this but leave for now

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// import route files
const homeRoutes = require('./backend/routes/homeApi');

// using the routes
app.use(homeRoutes);

// default route is redirect to home.html -> can change later on
app.get('/', (req, res) => {
    res.redirect('/html/home.html');
});

app.get('/login', (req, res) => {
    res.redirect('/html/login.html');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE name = $1', [username]);

        if (result.rows.length === 0) {
            // User not found
            return res.status(401).send('Invalid username or password');
        }

        const user = result.rows[0];

        // Compare plain-text password directly
        if (user.password === password) {
            // Successful login
            res.redirect('/');
        } else {
            res.status(401).send('Invalid username or password');
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).send('Server error');
    }
});


// to run : npx nodemon server.js -> can try nodemon server.js if it works for yall
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});