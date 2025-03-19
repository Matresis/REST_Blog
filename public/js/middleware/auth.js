// middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../db');
const SECRET_KEY = "your_secret_key";

function verifyToken(req, res, next) {
    // Check if user info is already in session
    if (req.session.userId && req.session.role) {
        req.user = { userId: req.session.userId, role: req.session.role };
        return next();
    }

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);

        // Store user info in session to avoid repeated decoding
        req.session.userId = decoded.userId;
        req.session.role = decoded.role;

        req.user = decoded;
        next();
    } catch (err) {
        res.status(403).json({ error: 'Invalid token' });
    }
}

const checkViewPermission = async (req, res, next) => {
    const { userId, role } = req.user;  // Extracted from session or token

    // Allow admins and post owners to view the post
    if (role === 'admin') return next();

    const { postId } = req.params;
    const [result] = await db.query('SELECT * FROM posts WHERE id = ? AND author = ?', [postId, userId]);

    if (result.length > 0) {
        return next();
    }

    return res.status(403).json({ error: 'Permission denied' });
};

const checkOwnershipOrAdmin = (req, res, next) => {
    const { userId, role } = req.user;  // Extracted from session or token
    const { blogId } = req.params;

    // Allow admins or the post creator to edit or delete the post
    if (role === 'admin') return next();

    const query = 'SELECT * FROM posts WHERE id = ? AND author = ?';
    db.query(query, [blogId, userId], (err, result) => {
        if (err || result.length === 0) {
            return res.status(403).json({ error: 'Permission denied' });
        }
        next();
    });
};

module.exports = { verifyToken, checkOwnershipOrAdmin, checkViewPermission };
