const express = require('express');
const app = express();
const port = 3000;
const path = require('path');


app.use('/html', express.static(path.join(__dirname, 'frontend/html')));
app.use('/js', express.static(path.join(__dirname, 'frontend/js')));
app.use('/common', express.static(path.join(__dirname, 'frontend/common')));
app.use('/static', express.static(path.join(__dirname, 'frontend/static')));
// app.use(express.static(path.join(__dirname, 'frontend/js'))); // dt need this but leave for now

app.use(express.json());

// import route files
const homeRoutes = require('./backend/routes/homeApi');

// using the routes
app.use(homeRoutes);

// default route is redirect to home.html -> can change later on
app.get('/', (req, res) => {
    res.redirect('/html/home.html');
});


// to run : npx nodemon server.js -> can try nodemon server.js if it works for yall
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});