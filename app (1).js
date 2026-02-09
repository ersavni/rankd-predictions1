// Firebase Configuration
// IMPORTANT: Replace the remaining values with your actual Firebase config
// Get these from Firebase Console > Project Settings > Your apps > SDK setup and configuration
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "rank-web-d0802.firebaseapp.com",
    projectId: "rank-web-d0802",
    storageBucket: "rank-web-d0802.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    deleteUser
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// API-Sports configuration
const API_KEY = '3a204daf3e81b37238d8be247b1fd8a8';
const LEAGUE_ID = 39; // Premier League
const SEASON = 2025;

// Global state
let currentUser = null;
let allFixtures = [];
let userPredictions = {};
let leaderboardData = [];

// DOM Elements
const authContainer = document.getElementById('authContainer');
const dashboardContainer = document.getElementById('dashboardContainer');
const loginForm = document.getElementById('loginFormElement');
const signupForm = document.getElementById('signupFormElement');
const showSignupBtn = document.getElementById('showSignup');
const showLoginBtn = document.getElementById('showLogin');
const logoutBtn = document.getElementById('logoutBtn');
const authError = document.getElementById('authError');
const userDisplayNameEl = document.getElementById('userDisplayName');

// Navigation
const navBtns = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.section');

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        showDashboard();
        loadAllData();
    } else {
        currentUser = null;
        showAuth();
    }
});

// Show Auth Page
function showAuth() {
    authContainer.style.display = 'flex';
    dashboardContainer.style.display = 'none';
}

// Show Dashboard
function showDashboard() {
    authContainer.style.display = 'none';
    dashboardContainer.style.display = 'block';
}

// Toggle Auth Forms
showSignupBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('signupForm').classList.add('active');
    hideError();
});

showLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('signupForm').classList.remove('active');
    document.getElementById('loginForm').classList.add('active');
    hideError();
});

// Sign Up
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const displayName = document.getElementById('signupDisplayName').value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
        
        // Create user document in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            displayName,
            email,
            createdAt: new Date().toISOString(),
            totalPoints: 0
        });

        signupForm.reset();
    } catch (error) {
        showError(error.message);
    }
});

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginForm.reset();
    } catch (error) {
        showError('Invalid email or password');
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// Navigation
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        navBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${section}Section`).classList.add('active');
        
        // Load section-specific data
        if (section === 'predict') loadUpcomingMatches();
        if (section === 'leaderboard') loadLeaderboard();
        if (section === 'myPredictions') loadMyPredictions();
    });
});

// Load User Data
async function loadUserData() {
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            userDisplayNameEl.textContent = userData.displayName;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Load All Data on Dashboard Load
async function loadAllData() {
    await loadFixtures();
    loadUpcomingMatches();
}

// Fetch Fixtures from API-Sports
async function loadFixtures() {
    try {
        const response = await fetch(
            `https://v3.football.api-sports.io/fixtures?league=${LEAGUE_ID}&season=${SEASON}`,
            {
                headers: {
                    'x-apisports-key': API_KEY
                }
            }
        );
        const data = await response.json();
        allFixtures = data.response || [];
    } catch (error) {
        console.error('Error fetching fixtures:', error);
        allFixtures = [];
    }
}

// Load Upcoming Matches (next 2 weeks)
function loadUpcomingMatches() {
    const container = document.getElementById('upcomingMatches');
    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));

    const upcomingMatches = allFixtures.filter(fixture => {
        const matchDate = new Date(fixture.fixture.date);
        return matchDate > now && matchDate <= twoWeeksFromNow;
    }).sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

    if (upcomingMatches.length === 0) {
        container.innerHTML = '<div class="loading">No upcoming matches in the next 2 weeks</div>';
        return;
    }

    container.innerHTML = upcomingMatches.map(match => createMatchCard(match)).join('');
    attachPredictionListeners();
}

// Create Match Card HTML
function createMatchCard(match) {
    const matchDate = new Date(match.fixture.date);
    const now = new Date();
    const isLocked = matchDate <= now;
    const fixtureId = match.fixture.id;

    const homeTeam = match.teams.home;
    const awayTeam = match.teams.away;

    return `
        <div class="match-card" data-fixture-id="${fixtureId}">
            <div class="match-header">
                <div class="match-time">${formatMatchDate(matchDate)}</div>
                <div class="match-status ${isLocked ? 'locked' : ''}">${isLocked ? 'Locked' : 'Open'}</div>
            </div>
            <div class="match-teams">
                <div class="team home">
                    <img src="${homeTeam.logo}" alt="${homeTeam.name}" class="team-logo">
                    <span class="team-name">${homeTeam.name}</span>
                </div>
                <span class="vs">VS</span>
                <div class="team away">
                    <img src="${awayTeam.logo}" alt="${awayTeam.name}" class="team-logo">
                    <span class="team-name">${awayTeam.name}</span>
                </div>
            </div>
            ${isLocked ? '<div class="prediction-saved">Predictions locked</div>' : createPredictionForm(fixtureId, homeTeam.name, awayTeam.name)}
        </div>
    `;
}

// Create Prediction Form HTML
function createPredictionForm(fixtureId, homeTeam, awayTeam) {
    const saved = userPredictions[fixtureId];
    
    if (saved) {
        return `
            <div class="prediction-saved">
                ✓ Prediction saved: ${saved.winner === 'home' ? homeTeam : saved.winner === 'away' ? awayTeam : 'Draw'} 
                (${saved.homeScore}-${saved.awayScore})
            </div>
        `;
    }

    return `
        <div class="prediction-inputs">
            <div class="prediction-group">
                <label>Winner</label>
                <select class="winner-select" data-fixture="${fixtureId}">
                    <option value="">Select winner</option>
                    <option value="home">${homeTeam}</option>
                    <option value="draw">Draw</option>
                    <option value="away">${awayTeam}</option>
                </select>
            </div>
            <div class="prediction-group">
                <label>Predicted Score</label>
                <div class="score-inputs">
                    <input type="number" min="0" max="20" class="home-score" data-fixture="${fixtureId}" placeholder="0">
                    <span class="score-separator">-</span>
                    <input type="number" min="0" max="20" class="away-score" data-fixture="${fixtureId}" placeholder="0">
                </div>
            </div>
            <div class="prediction-group">
                <label>&nbsp;</label>
                <button class="btn-save" data-fixture="${fixtureId}">Save Prediction</button>
            </div>
        </div>
    `;
}

// Attach Prediction Listeners
function attachPredictionListeners() {
    const saveBtns = document.querySelectorAll('.btn-save');
    saveBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const fixtureId = e.target.dataset.fixture;
            await savePrediction(fixtureId);
        });
    });
}

// Save Prediction
async function savePrediction(fixtureId) {
    const winner = document.querySelector(`.winner-select[data-fixture="${fixtureId}"]`).value;
    const homeScore = parseInt(document.querySelector(`.home-score[data-fixture="${fixtureId}"]`).value);
    const awayScore = parseInt(document.querySelector(`.away-score[data-fixture="${fixtureId}"]`).value);

    if (!winner || isNaN(homeScore) || isNaN(awayScore)) {
        alert('Please complete all prediction fields');
        return;
    }

    // Validate winner matches score
    const scoreWinner = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';
    if (winner !== scoreWinner) {
        alert('Winner selection must match the score prediction');
        return;
    }

    try {
        const predictionData = {
            fixtureId,
            winner,
            homeScore,
            awayScore,
            userId: currentUser.uid,
            createdAt: new Date().toISOString(),
            points: 0,
            evaluated: false
        };

        await setDoc(doc(db, 'predictions', `${currentUser.uid}_${fixtureId}`), predictionData);
        userPredictions[fixtureId] = predictionData;
        loadUpcomingMatches(); // Refresh to show saved state
    } catch (error) {
        console.error('Error saving prediction:', error);
        alert('Failed to save prediction');
    }
}

// Load Leaderboard
async function loadLeaderboard() {
    const container = document.getElementById('leaderboardContent');
    container.innerHTML = '<div class="loading">Loading leaderboard...</div>';

    try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = [];
        
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const predictionsSnapshot = await getDocs(
                query(collection(db, 'predictions'), where('userId', '==', userDoc.id))
            );
            
            let totalPoints = 0;
            predictionsSnapshot.forEach(predDoc => {
                totalPoints += predDoc.data().points || 0;
            });

            users.push({
                id: userDoc.id,
                displayName: userData.displayName,
                points: totalPoints
            });
        }

        users.sort((a, b) => b.points - a.points);
        leaderboardData = users;

        const currentUserRank = users.findIndex(u => u.id === currentUser.uid) + 1;
        const top20 = users.slice(0, 20);

        let html = `
            <div class="leaderboard-table">
                <div class="leaderboard-header">
                    <div>Rank</div>
                    <div>Player</div>
                    <div>Points</div>
                </div>
                ${top20.map((user, index) => `
                    <div class="leaderboard-row ${user.id === currentUser.uid ? 'current-user' : ''}">
                        <div class="rank ${index < 3 ? 'top-3' : ''}">#${index + 1}</div>
                        <div class="player-name">${user.displayName}</div>
                        <div class="points">${user.points}</div>
                    </div>
                `).join('')}
            </div>
        `;

        if (currentUserRank > 20) {
            const currentUserData = users[currentUserRank - 1];
            html += `
                <div class="user-rank-card">
                    <h3>Your Ranking</h3>
                    <div class="leaderboard-row current-user">
                        <div class="rank">#${currentUserRank}</div>
                        <div class="player-name">${currentUserData.displayName}</div>
                        <div class="points">${currentUserData.points}</div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        container.innerHTML = '<div class="loading">Error loading leaderboard</div>';
    }
}

// Load My Predictions
async function loadMyPredictions() {
    const container = document.getElementById('myPredictionsContent');
    container.innerHTML = '<div class="loading">Loading your predictions...</div>';

    try {
        const predictionsSnapshot = await getDocs(
            query(collection(db, 'predictions'), where('userId', '==', currentUser.uid))
        );

        const predictions = [];
        predictionsSnapshot.forEach(doc => {
            predictions.push({ id: doc.id, ...doc.data() });
        });

        if (predictions.length === 0) {
            container.innerHTML = '<div class="loading">No predictions yet</div>';
            return;
        }

        // Match predictions with fixtures
        const predictionsWithDetails = predictions.map(pred => {
            const fixture = allFixtures.find(f => f.fixture.id == pred.fixtureId);
            return { ...pred, fixture };
        }).filter(p => p.fixture);

        predictionsWithDetails.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        container.innerHTML = `
            <div class="predictions-list">
                ${predictionsWithDetails.map(pred => createPredictionCard(pred)).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading predictions:', error);
        container.innerHTML = '<div class="loading">Error loading predictions</div>';
    }
}

// Create Prediction Card
function createPredictionCard(prediction) {
    const fixture = prediction.fixture;
    const homeTeam = fixture.teams.home.name;
    const awayTeam = fixture.teams.away.name;
    const matchDate = new Date(fixture.fixture.date);
    const status = matchDate > new Date() ? 'pending' : 
                   fixture.fixture.status.short === 'FT' ? 
                   (prediction.evaluated ? (prediction.points > 0 ? 'correct' : 'incorrect') : 'pending') : 
                   'pending';

    return `
        <div class="prediction-card ${status}">
            <div class="prediction-header">
                <div>
                    <strong>${homeTeam} vs ${awayTeam}</strong>
                    <div class="match-time">${formatMatchDate(matchDate)}</div>
                </div>
                ${prediction.evaluated ? `<div class="prediction-points">+${prediction.points} pts</div>` : ''}
            </div>
            <div class="prediction-details">
                <div>${homeTeam}</div>
                <div>
                    <div class="predicted-score">${prediction.homeScore} - ${prediction.awayScore}</div>
                    ${fixture.goals.home !== null ? `<div class="actual-score">Actual: ${fixture.goals.home} - ${fixture.goals.away}</div>` : ''}
                </div>
                <div>${awayTeam}</div>
            </div>
        </div>
    `;
}

// Account Management
document.getElementById('updateDisplayNameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newDisplayName = document.getElementById('newDisplayName').value;

    try {
        await updateProfile(auth.currentUser, { displayName: newDisplayName });
        await updateDoc(doc(db, 'users', currentUser.uid), { displayName: newDisplayName });
        userDisplayNameEl.textContent = newDisplayName;
        alert('Display name updated successfully');
        e.target.reset();
    } catch (error) {
        alert('Error updating display name');
    }
});

document.getElementById('updatePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    try {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPassword);
        alert('Password updated successfully');
        e.target.reset();
    } catch (error) {
        alert('Error updating password. Check your current password.');
    }
});

document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        return;
    }

    try {
        // Delete user predictions
        const predictionsSnapshot = await getDocs(
            query(collection(db, 'predictions'), where('userId', '==', currentUser.uid))
        );
        predictionsSnapshot.forEach(async (doc) => {
            await deleteDoc(doc.ref);
        });

        // Delete user document
        await deleteDoc(doc(db, 'users', currentUser.uid));

        // Delete auth user
        await deleteUser(auth.currentUser);
    } catch (error) {
        alert('Error deleting account. You may need to re-login and try again.');
    }
});

// Helper Functions
function formatMatchDate(date) {
    const options = { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    };
    return date.toLocaleDateString('en-US', options);
}

function showError(message) {
    authError.textContent = message;
    authError.classList.add('show');
    setTimeout(() => hideError(), 5000);
}

function hideError() {
    authError.classList.remove('show');
}

// Load user predictions on auth
async function loadUserPredictions() {
    if (!currentUser) return;
    
    try {
        const predictionsSnapshot = await getDocs(
            query(collection(db, 'predictions'), where('userId', '==', currentUser.uid))
        );
        
        userPredictions = {};
        predictionsSnapshot.forEach(doc => {
            const data = doc.data();
            userPredictions[data.fixtureId] = data;
        });
    } catch (error) {
        console.error('Error loading user predictions:', error);
    }
}

// Initial load of user predictions
if (currentUser) {
    loadUserPredictions();
}
