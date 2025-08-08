// Main JavaScript file for Python Quest: Dungeon Escape
// Initialize Socket.io connection
const socket = io();

// Global variables
let currentUser = null;
let authToken = null;

// Initialize app on DOM load
document.addEventListener("DOMContentLoaded", () => {
  initializeAuth();
  setupEventListeners();
  setupSocket();
});

// Authentication initialization
function initializeAuth() {
  authToken = localStorage.getItem("authToken");
  const userData = localStorage.getItem("user");

  if (authToken && userData) {
    try {
      currentUser = JSON.parse(userData);
      console.log("User authenticated:", currentUser.username);
    } catch (error) {
      console.error("Error parsing user data:", error);
      clearAuth();
    }
  }
}

// Setup global event listeners
function setupEventListeners() {
  // Logout functionality
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  // Navigation protection for authenticated routes
  const protectedLinks = document.querySelectorAll(
    'a[href="/dashboard"], a[href="/lobby"]'
  );
  protectedLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      if (!authToken) {
        e.preventDefault();
        showToast("Please login to access this page", "error");
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      }
    });
  });

  // Auto-redirect from auth pages if already logged in
  const currentPath = window.location.pathname;
  if ((currentPath === "/login" || currentPath === "/register") && authToken) {
    window.location.href = "/dashboard";
  }
}

// Setup Socket.io event listeners
function setupSocket() {
  socket.on("connect", () => {
    console.log("Connected to server:", socket.id);
    if (currentUser) {
      socket.emit("user_authenticated", currentUser);
    }
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server");
  });

  // Game-related socket events
  socket.on("game_joined", (data) => {
    showToast(`Joined game: ${data.gameId}`, "success");
  });

  socket.on("player_joined", (data) => {
    showToast(`${data.username} joined the game`, "info");
  });

  socket.on("player_left", (data) => {
    showToast(`${data.username} left the game`, "warning");
  });

  socket.on("game_started", (data) => {
    showToast("Game started! Good luck!", "success");
    if (data.redirectUrl) {
      setTimeout(() => {
        window.location.href = data.redirectUrl;
      }, 1500);
    }
  });

  socket.on("player_moved", (data) => {
    updatePlayerPosition(data.playerId, data.position);
  });

  socket.on("question_completed", (data) => {
    if (data.correct) {
      showToast(
        `${data.username} answered correctly! +${data.points} points`,
        "success"
      );
    } else {
      showToast(`${data.username} answered incorrectly. Try again!`, "error");
    }
  });

  socket.on("game_ended", (data) => {
    showToast(`Game Over! Winner: ${data.winner}`, "success");
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 3000);
  });

  socket.on("error", (data) => {
    showToast(data.message || "An error occurred", "error");
  });
}

// Logout handler
function handleLogout() {
  clearAuth();
  showToast("Logged out successfully", "success");
  setTimeout(() => {
    window.location.href = "/";
  }, 1500);
}

// Clear authentication data
function clearAuth() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("user");
  authToken = null;
  currentUser = null;
}

// API request helper with authentication
async function apiRequest(url, options = {}) {
  const defaultOptions = {
    headers: {
      "Content-Type": "application/json",
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
    },
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, mergedOptions);

    // Handle token expiration
    if (response.status === 401 || response.status === 403) {
      clearAuth();
      showToast("Session expired. Please login again.", "error");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
      return null;
    }

    return response;
  } catch (error) {
    console.error("API request error:", error);
    showToast("Network error. Please check your connection.", "error");
    return null;
  }
}

// Toast notification system
function showToast(message, type = "info", duration = 3000) {
  const toastContainer = document.getElementById("toast-container");
  if (!toastContainer) return;

  const toast = document.createElement("div");

  // Toast styling based on type
  const typeClasses = {
    success: "bg-green-600 border-green-500",
    error: "bg-red-600 border-red-500",
    warning: "bg-yellow-600 border-yellow-500",
    info: "bg-blue-600 border-blue-500",
  };

  const iconMap = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
  };

  toast.className = `
    flex items-center p-4 rounded-lg shadow-lg border-l-4 text-white
    transform translate-x-full transition-all duration-300 ease-in-out
    ${typeClasses[type] || typeClasses.info}
  `;

  toast.innerHTML = `
    <span class="text-lg mr-3">${iconMap[type] || iconMap.info}</span>
    <span class="flex-1">${message}</span>
    <button class="ml-4 text-white hover:text-gray-300 font-bold" onclick="this.parentElement.remove()">×</button>
  `;

  toastContainer.appendChild(toast);

  // Animate in
  setTimeout(() => {
    toast.classList.remove("translate-x-full");
  }, 100);

  // Auto remove
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add("translate-x-full");
      setTimeout(() => {
        if (toast.parentElement) {
          toast.remove();
        }
      }, 300);
    }
  }, duration);
}

// Game utility functions
function updatePlayerPosition(playerId, position) {
  const playerToken = document.querySelector(`[data-player-id="${playerId}"]`);
  if (playerToken) {
    // Remove token from current position
    const currentCell = playerToken.parentElement;
    if (currentCell) {
      currentCell.removeChild(playerToken);
    }

    // Add token to new position
    const newCell = document.querySelector(`[data-cell="${position}"]`);
    if (newCell) {
      newCell.appendChild(playerToken);
    }
  }
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function animateDiceRoll(callback) {
  const diceElement = document.getElementById("dice-result");
  if (!diceElement) return;

  let counter = 0;
  const interval = setInterval(() => {
    diceElement.textContent = Math.floor(Math.random() * 6) + 1;
    counter++;

    if (counter > 10) {
      clearInterval(interval);
      const finalRoll = rollDice();
      diceElement.textContent = finalRoll;
      if (callback) callback(finalRoll);
    }
  }, 100);
}

// QR Code scanner functionality
function startQRScanner() {
  // This would integrate with a QR code scanning library
  // For now, we'll simulate with a prompt
  const qrCode = prompt("Enter QR Code (simulated):");
  if (qrCode) {
    window.location.href = `/question/${qrCode}`;
  }
}

// Form validation utilities
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateUsername(username) {
  const usernameRegex = /^[a-zA-Z0-9]{3,30}$/;
  return usernameRegex.test(username);
}

function validatePassword(password) {
  return password.length >= 6;
}

// Loading state management
function setElementLoading(elementId, loading) {
  const element = document.getElementById(elementId);
  if (!element) return;

  if (loading) {
    element.disabled = true;
    element.classList.add("opacity-50", "cursor-not-allowed");
  } else {
    element.disabled = false;
    element.classList.remove("opacity-50", "cursor-not-allowed");
  }
}

// Local storage helpers
function saveGameState(gameData) {
  localStorage.setItem("currentGame", JSON.stringify(gameData));
}

function getGameState() {
  const gameData = localStorage.getItem("currentGame");
  return gameData ? JSON.parse(gameData) : null;
}

function clearGameState() {
  localStorage.removeItem("currentGame");
}

// Export functions for use in other scripts
window.PythonQuest = {
  apiRequest,
  showToast,
  updatePlayerPosition,
  rollDice,
  animateDiceRoll,
  startQRScanner,
  validateEmail,
  validateUsername,
  validatePassword,
  setElementLoading,
  saveGameState,
  getGameState,
  clearGameState,
  socket,
  currentUser,
  authToken,
};
