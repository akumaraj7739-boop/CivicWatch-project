/**
 * CivicWatch - Frontend Core Controller
 * Handles application state, REST API synchronizations, DOM rendering,
 * and high-fidelity modal transitions.
 */

// --- Global Application State ---
const state = {
    token: localStorage.getItem('cw_token') || null,
    currentUser: null,
    posts: [],
    alerts: [],
    stats: { categories: [], contributors: [] },
    activeCategory: '',
    searchQuery: '',
    selectedPost: null
};

const API_BASE = ''; // Single process: relative URLs

// --- DOM Element Cache ---
const elements = {
    postsFeed: document.getElementById('postsFeedContainer'),
    trendingList: document.getElementById('trendingCategoriesList'),
    alertsStack: document.getElementById('alertsStackContainer'),
    contributorsList: document.getElementById('topContributorsList'),
    
    // Header & User Actions
    globalSearch: document.getElementById('globalSearch'),
    clearSearch: document.getElementById('clearSearch'),
    createPostTrigger: document.getElementById('createPostTrigger'),
    notifBtn: document.getElementById('notifBtn'),
    notifBadge: document.getElementById('notifBadge'),
    userMenuBtn: document.getElementById('userMenuBtn'),
    userAvatarText: document.getElementById('userAvatarText'),
    userDropdown: document.getElementById('userDropdown'),
    dropdownHeader: document.getElementById('dropdownHeader'),
    loginMenuBtn: document.getElementById('loginMenuBtn'),
    myAreaMenuBtn: document.getElementById('myAreaMenuBtn'),
    logoutMenuBtn: document.getElementById('logoutMenuBtn'),
    logoContainer: document.getElementById('logoContainer'),
    
    // Sidebar nav items
    navHome: document.getElementById('navHome'),
    navMyArea: document.getElementById('navMyArea'),
    navTrending: document.getElementById('navTrending'),
    navDashboard: document.getElementById('navDashboard'),
    navVerified: document.getElementById('navVerified'),
    navSettings: document.getElementById('navSettings'),
    
    // Filter status bar
    filterStatusBar: document.getElementById('filterStatusBar'),
    currentFilterLabel: document.getElementById('currentFilterLabel'),
    clearFilterBtn: document.getElementById('clearFilterBtn'),
    
    // Auth Modal
    authModal: document.getElementById('authModal'),
    closeAuthModal: document.getElementById('closeAuthModal'),
    loginTab: document.getElementById('loginTab'),
    signupTab: document.getElementById('signupTab'),
    loginForm: document.getElementById('loginForm'),
    signupForm: document.getElementById('signupForm'),
    loginError: document.getElementById('loginError'),
    signupError: document.getElementById('signupError'),
    
    // Post Modal
    createPostModal: document.getElementById('createPostModal'),
    closePostModal: document.getElementById('closePostModal'),
    createPostForm: document.getElementById('createPostForm'),
    imageDragZone: document.getElementById('imageDragZone'),
    postImage: document.getElementById('postImage'),
    dragZoneText: document.getElementById('dragZoneText'),
    imagePreviewContainer: document.getElementById('imagePreviewContainer'),
    uploadedImagePreview: document.getElementById('uploadedImagePreview'),
    uploadedVideoPreview: document.getElementById('uploadedVideoPreview'),
    removeImageBtn: document.getElementById('removeImageBtn'),
    postSubmitError: document.getElementById('postSubmitError'),
    cancelPostBtn: document.getElementById('cancelPostBtn'),
    
    // Alert Modal
    broadcastAlertModal: document.getElementById('broadcastAlertModal'),
    closeAlertModal: document.getElementById('closeAlertModal'),
    broadcastAlertForm: document.getElementById('broadcastAlertForm'),
    broadcastAlertTrigger: document.getElementById('broadcastAlertTrigger'),
    alertSubmitError: document.getElementById('alertSubmitError'),
    cancelAlertBtn: document.getElementById('cancelAlertBtn'),
    
    // Details Modal
    postDetailsModal: document.getElementById('postDetailsModal'),
    closeDetailsModal: document.getElementById('closeDetailsModal'),
    detailsModalContent: document.getElementById('detailsModalContent')
};

// --- Initialization & Lifecycle ---
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await checkSession();
    await fetchInitialData();
});

// --- API Helper Routines ---
async function apiFetch(endpoint, options = {}) {
    const headers = { ...options.headers };
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    
    // Do not set Content-Type header if body is FormData (Multer boundary needs to be generated automatically)
    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });
        
        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (err) {
            data = null;
        }

        if (!response.ok) {
            const message = (data && (data.error || data.message)) || text || 'Something went wrong';
            throw new Error(message);
        }

        return data !== null ? data : text;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error.message);
        throw error;
    }
}

// --- Check Session ---
async function checkSession() {
    if (!state.token) return;
    try {
        const user = await apiFetch('/api/auth/me');
        state.currentUser = user;
        updateAuthUI(true);
    } catch (err) {
        // Expired token
        state.token = null;
        state.currentUser = null;
        localStorage.removeItem('cw_token');
        updateAuthUI(false);
    }
}

// --- Fetch Initial Civic Data ---
async function fetchInitialData() {
    showLoading();
    try {
        await Promise.all([
            fetchPosts(),
            fetchAlerts(),
            fetchStats()
        ]);
    } catch (err) {
        elements.postsFeed.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation empty-icon warning-icon"></i>
                <h3 class="empty-title">Offline Mode</h3>
                <p class="empty-desc">Failed to connect to CivicWatch database. Please verify backend server is running.</p>
            </div>
        `;
    }
}

async function fetchPosts() {
    let url = '/api/posts';
    const params = [];
    if (state.activeCategory) params.push(`category=${encodeURIComponent(state.activeCategory)}`);
    if (state.searchQuery) params.push(`q=${encodeURIComponent(state.searchQuery)}`);
    
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    
    const posts = await apiFetch(url);
    state.posts = posts;
    renderPosts();
}

async function fetchAlerts() {
    const alerts = await apiFetch('/api/alerts');
    state.alerts = alerts;
    renderAlerts();
}

async function fetchStats() {
    const stats = await apiFetch('/api/stats');
    state.stats = stats;
    renderTrending();
    renderContributors();
}

// --- Dynamic Feed & Sidebar Rendering ---

function showLoading() {
    elements.postsFeed.innerHTML = `
        <div class="loading-state">
            <i class="fa-solid fa-circle-notch fa-spin spinner"></i>
            <p>Syncing civic database...</p>
        </div>
    `;
}

function renderPosts() {
    if (state.posts.length === 0) {
        elements.postsFeed.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-folder-open empty-icon"></i>
                <h3 class="empty-title">No Reports Found</h3>
                <p class="empty-desc">We couldn't find any reports matching "${state.searchQuery || state.activeCategory || 'your criteria'}". Be the first to file a post!</p>
                ${(state.searchQuery || state.activeCategory) ? `<button class="primary-btn" id="resetFeedBtn">Show All Reports</button>` : ''}
            </div>
        `;
        
        const resetBtn = document.getElementById('resetFeedBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                state.searchQuery = '';
                state.activeCategory = '';
                elements.globalSearch.value = '';
                elements.clearSearch.style.display = 'none';
                elements.filterStatusBar.style.display = 'none';
                fetchPosts();
            });
        }
        return;
    }

    elements.postsFeed.innerHTML = state.posts.map(post => {
        const timeAgo = formatTimeAgo(post.created_at);
        const mediaHtml = post.image_path 
            ? isVideoPath(post.image_path)
                ? `<div class="post-card-media"><video class="post-card-media-video" src="${post.image_path}" controls muted loop playsinline></video></div>`
                : `<div class="post-card-media"><img src="${post.image_path}" alt="${post.title}" loading="lazy"></div>` 
            : '';
        
        const canDelete = state.currentUser && (state.currentUser.user_id === post.author_id || state.currentUser.is_admin === 1);
        const deleteBtnHtml = canDelete 
            ? `<button class="delete-post-btn" title="Delete Report" onclick="handleDeletePost(event, '${post.id}')"><i class="fa-regular fa-trash-can"></i></button>`
            : '';
        
        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-card-header">
                    <h2 class="post-card-title">${escapeHTML(post.title)}</h2>
                    <div class="header-right-badges" style="display: flex; gap: 8px; align-items: center;">
                        ${deleteBtnHtml}
                        <span class="post-location-badge">
                            <i class="fa-solid fa-location-dot"></i> ${escapeHTML(post.location)}
                        </span>
                    </div>
                </div>
                
                ${mediaHtml}
                
                <p class="post-card-description">${escapeHTML(post.description)}</p>
                
                <div class="post-card-footer">
                    <div class="post-actions">
                        <button class="action-btn like-btn" data-liked="false" onclick="handleLikeClick(event, '${post.id}')">
                            <i class="fa-regular fa-thumbs-up"></i> 
                            <span>${post.likes_count}</span>
                        </button>
                        <button class="action-btn comment-trigger-btn" onclick="openPostDetails('${post.id}')">
                            <i class="fa-regular fa-comment"></i> 
                            <span>${post.comments_count}</span>
                        </button>
                        <button class="action-btn" onclick="handleShareClick(event, '${post.title}')">
                            <i class="fa-regular fa-share-from-square"></i>
                        </button>
                    </div>
                    <div class="post-meta-info">
                        Posted by <strong>${escapeHTML(post.author_name)}</strong> • ${timeAgo}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderTrending() {
    elements.trendingList.innerHTML = state.stats.categories.map(cat => `
        <li class="trending-item ${state.activeCategory === cat.name ? 'active' : ''}" onclick="filterByCategory('${cat.name}')">
            <span class="trend-name">${escapeHTML(cat.name)}</span>
            <span class="trend-count">${cat.count}</span>
        </li>
    `).join('');
}

function renderAlerts() {
    // Update header notification badge count with active alerts
    elements.notifBadge.textContent = state.alerts.length;
    if (state.alerts.length === 0) {
        elements.notifBadge.style.display = 'none';
        elements.alertsStack.innerHTML = `<div class="loading-inline">No active emergencies</div>`;
        return;
    }
    
    elements.notifBadge.style.display = 'flex';
    elements.alertsStack.innerHTML = state.alerts.map(alert => {
        const timeAgo = formatTimeAgo(alert.created_at);
        return `
            <div class="alert-card ${alert.risk_level}">
                <div class="alert-card-header">
                    <span class="alert-badge"><i class="fa-solid fa-triangle-exclamation"></i> ${alert.risk_level.toUpperCase()}</span>
                    <span class="alert-time">${timeAgo}</span>
                </div>
                <div class="alert-title">${escapeHTML(alert.title)}</div>
                <div class="alert-desc">${escapeHTML(alert.description)}</div>
            </div>
        `;
    }).join('');
}

function renderContributors() {
    elements.contributorsList.innerHTML = state.stats.contributors.map((contrib, idx) => `
        <li class="contributor-item">
            <span class="contrib-rank">${idx + 1}</span>
            <div class="contrib-info">
                <div class="contrib-name">${escapeHTML(contrib.name)}</div>
            </div>
            <span class="contrib-count">${contrib.posts} posts</span>
        </li>
    `).join('');
}

// Delete Post
async function handleDeletePost(event, postId) {
    event.stopPropagation();
    if (!state.currentUser) return;
    
    if (!confirm("Are you sure you want to delete this civic report? This action is permanent and will remove all public comments and votes.")) {
        return;
    }
    
    const btn = event.currentTarget || event.target.closest('button');
    if (!btn) return;
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;
    
    try {
        await apiFetch(`/api/posts/${postId}`, {
            method: 'DELETE'
        });
        
        state.posts = state.posts.filter(p => p.id !== postId);
        renderPosts();
        
        await fetchStats();
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        alert("Failed to delete post: " + err.message);
    }
}

// Upvote issues
async function handleLikeClick(event, postId) {
    event.stopPropagation();
    if (!state.currentUser) {
        openModal(elements.authModal);
        return;
    }
    
    try {
        const result = await apiFetch(`/api/posts/${postId}/like`, { method: 'POST' });
        
        // Find button in DOM and update UI
        const btn = event.currentTarget || document.querySelector(`[data-post-id="${postId}"] .like-btn`);
        if (btn) {
            btn.querySelector('span').textContent = result.likes_count;
            if (result.liked) {
                btn.classList.add('liked');
                btn.querySelector('i').className = "fa-solid fa-thumbs-up";
            } else {
                btn.classList.remove('liked');
                btn.querySelector('i').className = "fa-regular fa-thumbs-up";
            }
        }
        
        // Update state array
        const post = state.posts.find(p => p.id === postId);
        if (post) {
            post.likes_count = result.likes_count;
        }
    } catch (err) {
        alert("Failed to record vote. " + err.message);
    }
}

// Share button click
function handleShareClick(event, title) {
    event.stopPropagation();
    if (navigator.share) {
        navigator.share({
            title: 'CivicWatch Alert',
            text: title,
            url: window.location.href
        }).catch(err => console.log(err));
    } else {
        navigator.clipboard.writeText(`${window.location.href} [${title}]`);
        alert("Link copied to clipboard!");
    }
}

// Filter issues by Category
function filterByCategory(category) {
    if (state.activeCategory === category) {
        state.activeCategory = '';
        elements.filterStatusBar.style.display = 'none';
    } else {
        state.activeCategory = category;
        elements.currentFilterLabel.textContent = category;
        elements.filterStatusBar.style.display = 'flex';
    }
    fetchPosts();
    renderTrending();
}

// --- Dynamic Post Details modal ---
async function openPostDetails(postId) {
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    
    state.selectedPost = post;
    openModal(elements.postDetailsModal);
    
    // Draw loading card details
    elements.detailsModalContent.innerHTML = `
        <div class="loading-state">
            <i class="fa-solid fa-circle-notch fa-spin spinner"></i>
            <p>Fetching incident timeline...</p>
        </div>
    `;

    try {
        const comments = await apiFetch(`/api/posts/${postId}/comments`);
        
        const mediaHtml = post.image_path 
            ? isVideoPath(post.image_path)
                ? `<video class="details-media" src="${post.image_path}" controls muted loop playsinline autoplay></video>`
                : `<img class="details-media" src="${post.image_path}" alt="${post.title}">` 
            : '';
            
        const commentsHtml = comments.length === 0
            ? `<div class="loading-inline" id="noCommentsText">No community discussion yet. Be the first to voice!</div>`
            : comments.map(c => `
                <div class="comment-bubble">
                    <div class="comment-author-row">
                        <span class="comment-author">${escapeHTML(c.author_name)}</span>
                        <span class="comment-time">${formatTimeAgo(c.created_at)}</span>
                    </div>
                    <div class="comment-text">${escapeHTML(c.content)}</div>
                </div>
            `).join('');

        elements.detailsModalContent.innerHTML = `
            ${mediaHtml}
            <div class="details-body">
                <div class="details-header-row">
                    <h2 class="details-title">${escapeHTML(post.title)}</h2>
                    <span class="post-location-badge"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(post.location)}</span>
                </div>
                
                <p class="details-desc">${escapeHTML(post.description)}</p>
                
                <div class="comments-section">
                    <h3 class="comments-title"><i class="fa-regular fa-comments"></i> Community Discussion (${comments.length})</h3>
                    <div class="comments-list-box" id="modalCommentsList">
                        ${commentsHtml}
                    </div>
                    
                    <form class="comment-form" id="commentSubmitForm" onsubmit="handleCommentSubmit(event, '${post.id}')">
                        <input type="text" class="comment-input-box" id="commentInput" placeholder="Add public response..." required>
                        <button type="submit" class="comment-send-btn" title="Submit comment"><i class="fa-solid fa-paper-plane"></i></button>
                    </form>
                </div>
            </div>
        `;
    } catch (err) {
        elements.detailsModalContent.innerHTML = `<div class="loading-inline">Failed to load conversation thread.</div>`;
    }
}

// Add comment to post
async function handleCommentSubmit(event, postId) {
    event.preventDefault();
    const input = document.getElementById('commentInput');
    const content = input.value.trim();
    if (!content) return;
    
    try {
        const comment = await apiFetch(`/api/posts/${postId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
        
        // Append new comment instantly to modal UI
        const box = document.getElementById('modalCommentsList');
        const noText = document.getElementById('noCommentsText');
        if (noText) noText.remove();
        
        const bubble = document.createElement('div');
        bubble.className = 'comment-bubble';
        bubble.innerHTML = `
            <div class="comment-author-row">
                <span class="comment-author">${escapeHTML(comment.author_name)}</span>
                <span class="comment-time">${formatTimeAgo(comment.created_at)}</span>
            </div>
            <div class="comment-text">${escapeHTML(comment.content)}</div>
        `;
        box.appendChild(bubble);
        box.scrollTop = box.scrollHeight; // scroll to bottom
        
        input.value = '';
        
        // Increment count on central post card list
        const postCardCount = document.querySelector(`[data-post-id="${postId}"] .comment-trigger-btn span`);
        if (postCardCount) {
            postCardCount.textContent = parseInt(postCardCount.textContent) + 1;
        }
        
        // Update local state arrays
        const post = state.posts.find(p => p.id === postId);
        if (post) post.comments_count += 1;
        
    } catch (err) {
        alert("Failed to submit comment. " + err.message);
    }
}

// --- Authentication UI Syncs ---

function updateAuthUI(isLoggedIn) {
    if (isLoggedIn && state.currentUser) {
        // Logged in
        elements.userAvatarText.innerHTML = `<span class="avatar-initials">${state.currentUser.username.substring(0,2).toUpperCase()}</span>`;
        const adminBadge = state.currentUser.is_admin ? ' <span class="admin-badge"><i class="fa-solid fa-shield-halved"></i> Admin</span>' : '';
        elements.dropdownHeader.innerHTML = `
            <p class="user-name">${escapeHTML(state.currentUser.username)}${adminBadge}</p>
            <p class="user-sub">${escapeHTML(state.currentUser.email)}</p>
        `;
        elements.loginMenuBtn.style.display = 'none';
        elements.myAreaMenuBtn.style.display = 'flex';
        elements.logoutMenuBtn.style.display = 'flex';
    } else {
        // Logged out
        elements.userAvatarText.innerHTML = `<i class="fa-regular fa-user"></i>`;
        elements.dropdownHeader.innerHTML = `
            <p class="user-name">Welcome, Citizen</p>
            <p class="user-sub">Log in to track reports</p>
        `;
        elements.loginMenuBtn.style.display = 'flex';
        elements.myAreaMenuBtn.style.display = 'none';
        elements.logoutMenuBtn.style.display = 'none';
    }
}

// --- Setup Event Listeners ---
function setupEventListeners() {
    // 1. Search Box engine
    let searchTimeout;
    elements.globalSearch.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        elements.clearSearch.style.display = query ? 'flex' : 'none';
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.searchQuery = query;
            fetchPosts();
        }, 300);
    });

    elements.clearSearch.addEventListener('click', () => {
        elements.globalSearch.value = '';
        state.searchQuery = '';
        elements.clearSearch.style.display = 'none';
        fetchPosts();
    });

    // 2. Navigation Dropdown panel
    elements.userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.userDropdown.classList.toggle('active');
    });

    document.addEventListener('click', () => {
        elements.userDropdown.classList.remove('active');
    });

    elements.loginMenuBtn.addEventListener('click', () => {
        openModal(elements.authModal);
    });

    // 3. Left Navigation Filter Simulations
    elements.navHome.addEventListener('click', () => {
        setActiveNav(elements.navHome);
        state.activeCategory = '';
        state.searchQuery = '';
        elements.globalSearch.value = '';
        elements.clearSearch.style.display = 'none';
        elements.filterStatusBar.style.display = 'none';
        fetchPosts();
    });

    elements.navMyArea.addEventListener('click', () => {
        if (!state.currentUser) {
            openModal(elements.authModal);
            return;
        }
        setActiveNav(elements.navMyArea);
        // Simulate My Area by locking in user state region
        state.searchQuery = 'Sitamarhi';
        elements.globalSearch.value = 'Sitamarhi';
        elements.clearSearch.style.display = 'flex';
        fetchPosts();
    });

    elements.navTrending.addEventListener('click', () => {
        setActiveNav(elements.navTrending);
        // Set category to the highest counts
        if (state.stats.categories.length > 0) {
            filterByCategory(state.stats.categories[0].name);
        }
    });

    // Sidebar simulations
    elements.navDashboard.addEventListener('click', () => alert("Open Source Analytics dashboard compiling local reports coming soon!"));
    elements.navVerified.addEventListener('click', () => {
        setActiveNav(elements.navVerified);
        state.searchQuery = 'snatching'; // Mock filter
        fetchPosts();
    });
    elements.navSettings.addEventListener('click', () => alert("Profile Settings & Emergency alerts configs coming soon!"));

    // Brand logo home reset
    elements.logoContainer.addEventListener('click', () => {
        elements.navHome.click();
    });

    // Clear category status bar filter
    elements.clearFilterBtn.addEventListener('click', () => {
        state.activeCategory = '';
        elements.filterStatusBar.style.display = 'none';
        fetchPosts();
        renderTrending();
    });

    // Notification bell scroll-to-alerts shortcut
    elements.notifBtn.addEventListener('click', () => {
        elements.alertsStack.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // ================= MODAL CONTROLLERS =================

    // 1. Auth Modals Action Toggles
    elements.closeAuthModal.addEventListener('click', () => closeModal(elements.authModal));
    elements.loginTab.addEventListener('click', () => toggleAuthTabs('login'));
    elements.signupTab.addEventListener('click', () => toggleAuthTabs('signup'));
    
    // Handle signup form submit
    elements.signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        elements.signupError.textContent = '';
        const username = document.getElementById('signupUsername').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value.trim();
        
        try {
            const data = await apiFetch('/api/auth/signup', {
                method: 'POST',
                body: JSON.stringify({ username, email, password })
            });
            
            localStorage.setItem('cw_token', data.token);
            state.token = data.token;
            state.currentUser = data.user;
            
            closeModal(elements.authModal);
            updateAuthUI(true);
            
            // clear form
            elements.signupForm.reset();
        } catch (err) {
            elements.signupError.textContent = err.message;
        }
    });

    // Handle login form submit
    elements.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        elements.loginError.textContent = '';
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        
        try {
            const data = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            
            localStorage.setItem('cw_token', data.token);
            state.token = data.token;
            state.currentUser = data.user;
            
            closeModal(elements.authModal);
            updateAuthUI(true);
            
            // clear form
            elements.loginForm.reset();
        } catch (err) {
            elements.loginError.textContent = err.message;
        }
    });

    // Handle Logout Menu Trigger
    elements.logoutMenuBtn.addEventListener('click', () => {
        state.token = null;
        state.currentUser = null;
        localStorage.removeItem('cw_token');
        updateAuthUI(false);
        elements.navHome.click();
    });

    // 2. Create Post Modal Controllers
    elements.createPostTrigger.addEventListener('click', () => {
        if (!state.currentUser) {
            openModal(elements.authModal);
            return;
        }
        openModal(elements.createPostModal);
    });
    
    elements.closePostModal.addEventListener('click', () => closeModal(elements.createPostModal));
    elements.cancelPostBtn.addEventListener('click', () => closeModal(elements.createPostModal));
    
    // File Input / Drag & drop visualizers
    elements.imageDragZone.addEventListener('click', () => {
        // Only trigger input click if image isn't loaded
        if (elements.postImage.files.length === 0) {
            elements.postImage.click();
        }
    });

    elements.postImage.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            const isVideo = file.type.startsWith('video/');
            
            if (isVideo) {
                elements.uploadedVideoPreview.src = url;
                elements.uploadedVideoPreview.style.display = 'block';
                elements.uploadedImagePreview.src = '';
                elements.uploadedImagePreview.style.display = 'none';
            } else {
                elements.uploadedImagePreview.src = url;
                elements.uploadedImagePreview.style.display = 'block';
                elements.uploadedVideoPreview.src = '';
                elements.uploadedVideoPreview.style.display = 'none';
            }
            
            elements.dragZoneText.style.display = 'none';
            elements.imagePreviewContainer.style.display = 'flex';
        }
    });

    elements.removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.postImage.value = '';
        elements.uploadedImagePreview.src = '';
        elements.uploadedImagePreview.style.display = 'none';
        elements.uploadedVideoPreview.src = '';
        elements.uploadedVideoPreview.style.display = 'none';
        elements.imagePreviewContainer.style.display = 'none';
        elements.dragZoneText.style.display = 'flex';
    });

    // Publish post Form Submit
    elements.createPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        elements.postSubmitError.textContent = '';
        
        const title = document.getElementById('postTitle').value.trim();
        const category = document.getElementById('postCategory').value;
        const location = document.getElementById('postLocation').value.trim();
        const description = document.getElementById('postDescription').value.trim();
        
        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('location', location);
        formData.append('description', description);
        
        if (elements.postImage.files.length > 0) {
            formData.append('image', elements.postImage.files[0]);
        }
        
        // Show posting loader style in submit button
        const submitBtn = document.getElementById('submitPostBtn');
        const origText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Publishing...`;
        
        try {
            const newPost = await apiFetch('/api/posts', {
                method: 'POST',
                body: formData
            });
            
            // Append newly created post to state and feed
            state.posts.unshift(newPost);
            renderPosts();
            
            // Reset categories stats & charts
            await fetchStats();
            
            // Reset form and close
            elements.createPostForm.reset();
            elements.removeImageBtn.click();
            closeModal(elements.createPostModal);
        } catch (err) {
            elements.postSubmitError.textContent = err.message;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
        }
    });

    // 3. Broadcast Alert Modal Controllers
    elements.broadcastAlertTrigger.addEventListener('click', () => {
        openModal(elements.broadcastAlertModal);
    });
    
    elements.closeAlertModal.addEventListener('click', () => closeModal(elements.broadcastAlertModal));
    elements.cancelAlertBtn.addEventListener('click', () => closeModal(elements.broadcastAlertModal));
    
    elements.broadcastAlertForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        elements.alertSubmitError.textContent = '';
        
        const title = document.getElementById('alertTitle').value.trim();
        const risk_level = document.getElementById('alertRisk').value;
        const description = document.getElementById('alertDescription').value.trim();
        
        try {
            const newAlert = await apiFetch('/api/alerts', {
                method: 'POST',
                body: JSON.stringify({ title, risk_level, description })
            });
            
            state.alerts.unshift(newAlert);
            renderAlerts();
            
            elements.broadcastAlertForm.reset();
            closeModal(elements.broadcastAlertModal);
        } catch (err) {
            elements.alertSubmitError.textContent = err.message;
        }
    });

    // 4. Details Modal Controllers
    elements.closeDetailsModal.addEventListener('click', () => {
        closeModal(elements.postDetailsModal);
        state.selectedPost = null;
    });

    // Click outside overlays close modals automatically
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeModal(e.target);
            state.selectedPost = null;
        }
    });
}

// --- UI Utility Routines ---

function openModal(modalEl) {
    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden'; // Lock background scroll
}

function closeModal(modalEl) {
    modalEl.classList.remove('active');
    // Lock check if other modals are active before turning overflow back on
    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length === 0) {
        document.body.style.overflow = '';
    }
}

function toggleAuthTabs(tab) {
    if (tab === 'login') {
        elements.loginTab.classList.add('active');
        elements.signupTab.classList.remove('active');
        elements.loginForm.classList.add('active');
        elements.signupForm.classList.remove('active');
    } else {
        elements.loginTab.classList.remove('active');
        elements.signupTab.classList.add('active');
        elements.loginForm.classList.remove('active');
        elements.signupForm.classList.add('active');
    }
}

function setActiveNav(navEl) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navEl.classList.add('active');
}

// Standard escape routines to prevent XSS in client-side renders
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Date-Time calculations
function formatTimeAgo(isoString) {
    try {
        const date = new Date(isoString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'Just now';
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}h ago` ? `${minutes}m ago` : 'Just now';
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
        return 'Recently';
    }
}

// Media type inspector
function isVideoPath(path) {
    if (!path) return false;
    return path.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);
}
