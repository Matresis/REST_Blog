const express = require('express');
const path = require('path');
const app = express();
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const { verifyToken, checkOwnershipOrAdmin, checkViewPermission } = require('./public/js/middleware/auth');
const dotenv = require('dotenv');

const SECRET_KEY = "your_secret_key";
const PORT = 3000;


// Load environment variables from config.env file
dotenv.config({ path: './config.env' });

const db = require('./public/js/db');

app.use(bodyParser.json());

app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));

// Serve static files (HTML, CSS, JavaScript)
app.use(express.static(path.join('public')))

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Update the route for the index page (which you likely want to redirect to after login)
app.get('/index.html', (req, res, next) => {
  if (!req.session.token) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Redirect root path to login
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.get('/api/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'documentation.html'));
});

// User login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];

    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign(
          { userId: user.id, username: user.username, role: user.role }, // Include role in payload
          SECRET_KEY,
          { expiresIn: '1h' }
      );
      req.session.token = token;
      req.session.role = user.role;  // Store role in session
      res.json({ message: 'Logged in successfully', token, role: user.role });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Database query error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});



// User logout
app.get('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).send('Error logging out');
      } else {
        res.redirect('views/login.html');
      }
    });
  } else {
    res.redirect('views/login.html');
  }
});


// 1. POST /api/blog - create a new blog post
app.post('/api/blog', verifyToken, async (req, res) => {
  const { title, content, author } = req.body;
  const createdAt = new Date();

  // Log incoming data to verify it
  console.log("Received data:", { title, content, author, createdAt });

  if (!content || !title) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  const query = 'INSERT INTO posts (title, content, created_at, author) VALUES (?, ?, ?, ?)';
  try {
    const [result] = await db.query(query, [title, content, createdAt, author]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("Detailed Database error:", err);  // Log full error details
    return res.status(500).json({ error: 'Error creating blog post', details: err.message });
  }
});

// 2. GET /api/blog - retrieve all blog posts
app.get('/api/blog', async (req, res) => {
  const query = 'SELECT * FROM posts';
  try {
    const [results] = await db.query(query);
    res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: 'Error loading blog posts' });
  }
});

// 3. GET /api/blog/:blogId - retrieve a blog post by ID
app.get('/api/blog/:blogId', async (req, res) => {
  const blogId = req.params.blogId;
  const query = 'SELECT * FROM posts WHERE id = ?';

  try {
    const [results] = await db.query(query, [blogId]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }
    res.status(200).json(results[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Error loading blog post' });
  }
});

// 4. DELETE /api/blog/:blogId - delete a blog post by ID
app.delete('/api/blog/:blogId', verifyToken, checkOwnershipOrAdmin, async (req, res) => {
  const blogId = req.params.blogId;
  const query = 'DELETE FROM posts WHERE id = ?';

  try {
    const [result] = await db.query(query, [blogId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }
    res.status(200).json({ message: 'Blog post deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Error deleting blog post' });
  }
});

// 5. PATCH /api/blog/:blogId - partially update a blog post
app.patch('/api/blog/:blogId', verifyToken, checkOwnershipOrAdmin, async (req, res) => {
  const blogId = req.params.blogId;
  const { content, title } = req.body;

  if (!content && !title) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const fields = [];
  const values = [];

  if (content) {
    fields.push('content = ?');
    values.push(content);
  }
  if (title) {
    fields.push('title = ?');
    values.push(title);
  }

  const query = `UPDATE posts SET ${fields.join(', ')} WHERE id = ?`;
  values.push(blogId);

  try {
    const [result] = await db.query(query, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }
    res.status(200).json({ message: 'Blog post updated' });
  } catch (err) {
    return res.status(500).json({ error: 'Error updating blog post' });
  }
});



// Add view permission for a user to a specific post
app.post('/api/posts/:postId/permissions', verifyToken, checkViewPermission, async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.body;  // User to grant access to

  try {
    await db.query('INSERT INTO post_permissions (post_id, user_id) VALUES (?, ?)', [postId, userId]);
    res.status(200).json({ message: 'Permission added' });
  } catch (error) {
    res.status(500).json({ error: 'Error adding permission' });
  }
});

// Remove view permission for a user from a specific post
app.delete('/api/posts/:postId/permissions/:userId', verifyToken, checkViewPermission, async (req, res) => {
  const { postId, userId } = req.params;

  try {
    await db.query('DELETE FROM post_permissions WHERE post_id = ? AND user_id = ?', [postId, userId]);
    res.status(200).json({ message: 'Permission removed' });
  } catch (error) {
    res.status(500).json({ error: 'Error removing permission' });
  }
});

// Get a specific post with view permission check
app.get('/api/posts/:postId', verifyToken, checkViewPermission, async (req, res) => {
  const { postId } = req.params;

  try {
    const [post] = await db.query('SELECT * FROM posts WHERE id = ?', [postId]);
    if (post.length === 0) return res.status(404).json({ error: 'Post not found' });
    res.status(200).json(post[0]);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching post' });
  }
});

// Route for fetching all users
app.get('/api/users', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM users');
    res.json(results);
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Route for fetching permissions for a post
app.get('/api/posts/:postId/permissions', (req, res) => {
  const postId = req.params.postId;
  // Fetch the permissions for the given post
  db.query('SELECT user_id FROM post_permissions WHERE post_id = ?', [postId], (err, result) => {
    if (err) return res.status(500).send('Error fetching post permissions');
    res.json(result);  // Return users who have permission to view the post
  });
});


// Documentation
app.get('/api/docs-json', (req, res) => {
  res.json({
    version: "1.0.0",
    description: "This API allows users to interact with the blog system, manage blog posts, handle user authentication, and manage post permissions.",
    endpoints: [
      {
        method: "GET",
        path: "/login.html",
        description: "Returns the login page (HTML).",
        authentication: "None",
        permissions: "Public"
      },
      {
        method: "GET",
        path: "/index.html",
        description: "Returns the index page (HTML) after login. Redirects to login if the user is not authenticated.",
        authentication: "Required",
        permissions: "User"
      },
      {
        method: "GET",
        path: "/",
        description: "Redirects the root path to the login page.",
        authentication: "None",
        permissions: "Public"
      },
      {
        method: "GET",
        path: "/api/about",
        description: "Returns API documentation in JSON format.",
        authentication: "None",
        permissions: "Public"
      },
      {
        method: "POST",
        path: "/api/login",
        description: "Authenticates the user, returns a JWT token and role information.",
        authentication: "None",
        permissions: "Public",
        body: {
          username: "string",
          password: "string"
        },
        response: {
          token: "string",
          role: "string"
        }
      },
      {
        method: "POST",
        path: "/api/blog",
        description: "Creates a new blog post. Requires user authentication.",
        authentication: "Required",
        permissions: "User",
        body: {
          title: "string",
          content: "string",
          author: "string"
        },
        response: {
          id: "number"
        }
      },
      {
        method: "GET",
        path: "/api/blog",
        description: "Retrieves all blog posts.",
        authentication: "None",
        permissions: "Public"
      },
      {
        method: "GET",
        path: "/api/blog/:blogId",
        description: "Retrieves a specific blog post by ID.",
        authentication: "None",
        permissions: "Public"
      },
      {
        method: "GET",
        path: "/api/posts/:postId",
        description: "Retrieves a specific post with view permission check.",
        authentication: "Required",
        permissions: "User"
      },
      {
        method: "DELETE",
        path: "/api/blog/:blogId",
        description: "Deletes a specific blog post by ID. Requires authentication and ownership or admin permissions.",
        authentication: "Required",
        permissions: "Creator/Admin"
      },
      {
        method: "PATCH",
        path: "/api/blog/:blogId",
        description: "Partially updates a specific blog post by ID. Requires authentication and ownership or admin permissions.",
        authentication: "Required",
        permissions: "Creator/Admin",
        body: {
          title: "string",
          content: "string"
        }
      },
      {
        method: "POST",
        path: "/api/posts/:postId/permissions",
        description: "Adds a user to the list of those who have permission to view a specific post.",
        authentication: "Required",
        permissions: "Admin",
        body: {
          userId: "number"
        }
      },
      {
        method: "DELETE",
        path: "/api/posts/:postId/permissions/:userId",
        description: "Removes a user's permission to view a specific post.",
        authentication: "Required",
        permissions: "Admin",
        body: {}
      },
      {
        method: "GET",
        path: "/api/users",
        description: "Fetches all users.",
        authentication: "Required",
        permissions: "Admin"
      },
      {
        method: "GET",
        path: "/api/posts/:postId/permissions",
        description: "Fetches permissions for a specific post.",
        authentication: "Required",
        permissions: "Admin"
      },
      {
        method: "GET",
        path: "/logout",
        description: "Logs out the user and destroys the session.",
        authentication: "Required",
        permissions: "User"
      }
    ],
    authorization: {
      type: "JWT",
      description: "Každý chráněný endpoint vyžaduje JWT token ve formátu `Bearer <token>`, který je uložen v hlavičce `Authorization`. Token se získává při přihlášení uživatele.",
      roles: [
        {
          role: "admin",
          permissions: "Admin může vytvářet, upravovat, mazat jakýkoliv příspěvek a měnit oprávnění pro zobrazení příspěvků."
        },
        {
          role: "user",
          permissions: "User může vytvářet, upravovat a mazat své vlastní příspěvky a může vidět příspěvky, ke kterým má oprávnění."
        }
      ]
    }
  });
});



// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});