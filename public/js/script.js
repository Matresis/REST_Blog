document.addEventListener('DOMContentLoaded', function () {
    if (localStorage.getItem('token')) {
        loadPosts();
    } else {
        window.location.href = '/login.html';  // Redirect to login if not authenticated
    }
});

// Načtení blogových příspěvků
function loadPosts() {
    fetch('/api/blog')
        .then(response => response.json())
        .then(posts => {
            const blogContainer = document.getElementById('blog');
            blogContainer.innerHTML = '';
            posts.forEach(post => {
                const postElement = document.createElement('div');
                postElement.classList.add('blog-post');
                postElement.innerHTML = `
                  <h2>${post.title}</h2>
                  <p>${post.content}</p>
                  <p>- <em>${post.author}</em></p>
                  <span>${new Date(post.created_at).toLocaleString()}</span>
                  <div class="button-group">
                    <button class="edit-button" onclick="showEditForm(${post.id}, '${post.title}', '${post.content}')">Upravit</button>
                    <button class="delete-button" onclick="deletePost(${post.id})">Smazat</button>
                  </div>
                  <div class="permissions-group" id="permissions-group-${post.id}" style="display: none;">
                    <label for="userSelect-${post.id}">Přidat uživatele k zobrazení:</label>
                    <select id="userSelect-${post.id}"></select>
                    <button onclick="addPermission(${post.id})">Přidat</button>
                    <button onclick="removePermission(${post.id})">Odebrat</button>
                    <div class="permission-list" id="permission-list-${post.id}"></div>
                  </div>
                `;
                blogContainer.appendChild(postElement);

                // Check if the user is an admin and show permissions UI
                if (isAdmin()) {
                    document.getElementById(`permissions-group-${post.id}`).style.display = 'block';
                    loadUsers(post.id);  // Load users into the dropdown
                    loadPostPermissions(post.id);  // Load current permissions for the post
                }
            });
        });
}

function isAdmin() {
    const role = localStorage.getItem('role');
    return role === 'admin';
}

function loadUsers(postId) {
    fetch('/api/users')
        .then(response => {
            if (!response.ok) {
                console.error('Error response:', response);
                throw new Error('Failed to fetch users');
            }
            return response.json();
        })
        .then(users => {
            const userSelect = document.getElementById(`userSelect-${postId}`);
            userSelect.innerHTML = '';  // Clear options
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.text = user.username;
                userSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading users:', error);
        });
}

function loadPostPermissions(postId) {
    fetch(`/api/posts/${postId}/permissions`)
        .then(response => {
            if (!response.ok) {
                console.error('Error response:', response);
                throw new Error('Failed to fetch post permissions');
            }
            return response.json();
        })
        .then(users => {
            const permissionList = document.getElementById(`permission-list-${postId}`);
            permissionList.innerHTML = '';
            users.forEach(user => {
                const userElement = document.createElement('p');
                userElement.innerText = `${user.username} can view this post`;
                permissionList.appendChild(userElement);
            });
        })
        .catch(error => {
            console.error('Error loading post permissions:', error);
        });
}

function addPermission(postId) {
    const userId = document.getElementById(`userSelect-${postId}`).value;
    fetch(`/api/posts/${postId}/permissions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ userId })
    })
        .then(response => {
            if (!response.ok) {
                console.error('Error response:', response);
                alert('Error adding permission');
            } else {
                loadPostPermissions(postId);
                alert('Permission added');
            }
        })
        .catch(error => {
            console.error('Error adding permission:', error);
        });
}

function removePermission(postId) {
    const userId = document.getElementById(`userSelect-${postId}`).value;

    fetch(`/api/posts/${postId}/permissions/${userId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`  // Include token in the Authorization header
        }
    })
        .then(response => {
            if (response.ok) {
                loadPostPermissions(postId);  // Refresh permission list
                alert('Permission removed');
            } else {
                alert('Error removing permission');
            }
        });
}

// Vytvoření nového příspěvku
function createPost() {
    const title = document.getElementById('title').value;
    const content = document.getElementById('content').value;
    const author = localStorage.getItem('username');

    console.log("Creating post with data:", { title, content, author });

    if (title && content) {
        fetch('/api/blog', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify({ title, content, author }),
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(data => {
                        throw new Error(data.error || 'Unknown error');
                    });
                }
                return response.json();
            })
            .then(data => {
                console.log('Post created with ID:', data.id);
                loadPosts();
                document.getElementById('title').value = '';
                document.getElementById('content').value = '';
            })
            .catch(error => {
                console.error("Error creating post:", error.message);
                alert(`Failed to create post: ${error.message}`);
            });
    } else {
        alert('Fill in all the data!');
    }
}

// Smazání příspěvku
function deletePost(id) {
    const token = localStorage.getItem('token');  // Get the token from localStorage

    fetch(`/api/blog/${id}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,  // Include token in the Authorization header
        },
    })
        .then(response => {
            if (response.ok) {
                console.log('Post deleted');
                loadPosts();
            } else {
                alert('Chyba při mazání příspěvku');
            }
        });
}

// Zobrazení formuláře pro úpravu
function showEditForm(id, currentTitle, currentContent) {
    const editForm = document.getElementById('newPostForm');
    editForm.innerHTML = `
        <h2>Upravit příspěvek</h2>
        <input type="text" id="editTitle" placeholder="Nadpis" value="${currentTitle}">
        <textarea id="editContent" placeholder="Text příspěvku" rows="5">${currentContent}</textarea>
        <button onclick="editPost(${id})">Uložit změny</button>
        <button onclick="cancelEdit()">Zrušit</button>
    `;
}

// Částečná aktualizace příspěvku
function editPost(id) {
    const token = localStorage.getItem('token'); 
    const title = document.getElementById('editTitle').value;
    const content = document.getElementById('editContent').value;

    const editData = {};
    if (title) editData.title = title;
    if (content) editData.content = content;

    fetch(`/api/blog/${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editData),
    })
        .then(response => {
            if (response.ok) {
                console.log('Post updated');
                loadPosts();
                resetForm();
            } else {
                alert('Chyba při aktualizaci příspěvku');
            }
        });
}

// Zrušení formuláře pro úpravu
function cancelEdit() {
    resetForm();
}

// Resetování formuláře na původní formulář pro nový příspěvek
function resetForm() {
    document.getElementById('newPostForm').innerHTML = `
        <h2>Přidat nový blogový příspěvek</h2>
        <input type="text" id="title" placeholder="Nadpis" required>
        <textarea id="content" placeholder="Text příspěvku" rows="5" required></textarea>
        <button onclick="createPost()">Vytvořit příspěvek</button>
    `;
}

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const response = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();

    if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', username);
        localStorage.setItem('role', data.role);  // Assuming role is returned from API
        window.location.href = '/index.html';
    } else {
        alert('Login failed');
    }
}

function logout() {
    fetch('/api/logout', { method: 'POST' })
        .then(() => window.location.href = '/login.html');
}


document.addEventListener("DOMContentLoaded", function() {
    fetch('/api/docs-json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Pretty-print JSON with indentation
            const formattedJson = JSON.stringify(data, null, 2);
            // Display the formatted JSON
            document.getElementById('json-output').textContent = formattedJson;
            // Prism will automatically highlight the JSON when the content is set
            Prism.highlightAll();
        })
        .catch(error => {
            console.error('Error fetching documentation:', error);
        });
});


function getDocs() {
    window.location.href = '/api/about';
}