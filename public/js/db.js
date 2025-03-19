// db.js
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables from config.env file
dotenv.config({ path: './config.env' });

// Create a pool connection to the database
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

module.exports = db;