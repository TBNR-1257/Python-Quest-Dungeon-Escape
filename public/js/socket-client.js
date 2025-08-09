// public/js/socket-client.js
class GameSocket {
  constructor() {
    this.socket = null;
    this.gameId = null;
    this.userId = null;
    this.username = null;
    this.isConnected = false;
  }

  // Initialize socket connection
  init(gameId, userId, username) {
    this.gameId = gameId;
    this.userId = userId;
    this.username = username;

    // Initialize Socket.io connection
    this.socket = io();

    this.setupEventListeners();
    this.joinGame();

    console.log(`Socket initialized for game ${gameId}, user ${username}`);
  }

  // Join the game room
  joinGame() {
    if (this.socket && this.gameId && this.userId && this.username) {
      this.socket.emit("join-game", {
        gameId: this.gameId,
        userId: this.userId,
        username: this.username,
      });
    }
  }

  // Leave the game room
  leaveGame() {
    if (this.socket && this.gameId && this.userId && this.username) {
      this.socket.emit("leave-game", {
        gameId: this.gameId,
        userId: this.userId,
        username: this.username,
      });
    }
  }

  // Start the game
  startGame() {
    if (this.socket && this.gameId) {
      this.socket.emit("start-game", {
        gameId: this.gameId,
      });
    }
  }

  // Send player move
  sendMove(position, diceRoll) {
    if (this.socket && this.gameId && this.userId) {
      this.socket.emit("player-move", {
        gameId: this.gameId,
        userId: this.userId,
        position: position,
        diceRoll: diceRoll,
      });
    }
  }

  // Send QR code scan
  sendQRScan(qrCode, questionId) {
    if (this.socket && this.gameId && this.userId) {
      this.socket.emit("qr-scanned", {
        gameId: this.gameId,
        userId: this.userId,
        qrCode: qrCode,
        questionId: questionId,
      });
    }
  }

  // Send answer submission
  sendAnswer(questionId, answer, isCorrect) {
    if (this.socket && this.gameId && this.userId) {
      this.socket.emit("answer-submitted", {
        gameId: this.gameId,
        userId: this.userId,
        questionId: questionId,
        answer: answer,
        isCorrect: isCorrect,
      });
    }
  }

  // Setup all event listeners
  setupEventListeners() {
    // Connection events
    this.socket.on("connect", () => {
      this.isConnected = true;
      console.log("Connected to server");
      this.showNotification("Connected to game server", "success");
    });

    this.socket.on("disconnect", () => {
      this.isConnected = false;
      console.log("Disconnected from server");
      this.showNotification("Disconnected from game server", "warning");
    });

    // Game room events
    this.socket.on("player-joined", (data) => {
      console.log("Player joined:", data);
      this.showNotification(data.message, "info");
      this.updatePlayerList();
    });

    this.socket.on("player-left", (data) => {
      console.log("Player left:", data);
      this.showNotification(data.message, "info");
      this.updatePlayerList();
    });

    this.socket.on("player-disconnected", (data) => {
      console.log("Player disconnected:", data);
      this.showNotification(data.message, "warning");
      this.updatePlayerList();
    });

    this.socket.on("room-info", (data) => {
      console.log("Room info:", data);
      this.updateRoomInfo(data);
    });

    // Game events
    this.socket.on("game-started", (data) => {
      console.log("Game started:", data);
      this.showNotification(data.message, "success");
      this.handleGameStart(data);
    });

    this.socket.on("player-moved", (data) => {
      console.log("Player moved:", data);
      this.handlePlayerMove(data);
    });

    this.socket.on("qr-scan-event", (data) => {
      console.log("QR scan event:", data);
      this.showNotification(data.message, "info");
      this.handleQRScanEvent(data);
    });

    this.socket.on("answer-result", (data) => {
      console.log("Answer result:", data);
      this.handleAnswerResult(data);
    });
  }

  // Show notification to user
  showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

    // Add styles if not already added
    this.ensureNotificationStyles();

    // Add to page
    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);

    // Close button functionality
    notification.querySelector(".notification-close").onclick = () => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    };
  }

  // Ensure notification styles are loaded
  ensureNotificationStyles() {
    if (!document.querySelector("#socket-notification-styles")) {
      const styles = document.createElement("style");
      styles.id = "socket-notification-styles";
      styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    min-width: 300px;
                    z-index: 1000;
                    animation: slideIn 0.3s ease;
                }
                
                .notification-success {
                    border-left: 4px solid #10b981;
                }
                
                .notification-info {
                    border-left: 4px solid #3b82f6;
                }
                
                .notification-warning {
                    border-left: 4px solid #f59e0b;
                }
                
                .notification-error {
                    border-left: 4px solid #ef4444;
                }
                
                .notification-content {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px;
                }
                
                .notification-message {
                    flex: 1;
                    font-size: 14px;
                    color: #374151;
                }
                
                .notification-close {
                    background: none;
                    border: none;
                    font-size: 18px;
                    color: #9ca3af;
                    cursor: pointer;
                    margin-left: 12px;
                }
                
                .notification-close:hover {
                    color: #374151;
                }
                
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
      document.head.appendChild(styles);
    }
  }

  // Update player list in waiting room
  updatePlayerList() {
    // This will trigger a page refresh to show updated player count
    // In a more sophisticated implementation, we'd update the DOM directly
    setTimeout(() => {
      if (window.location.pathname.includes("/game/waiting-room/")) {
        location.reload();
      }
    }, 1000);
  }

  // Update room information
  updateRoomInfo(data) {
    const playerCountElement = document.querySelector(".player-count");
    if (playerCountElement) {
      playerCountElement.textContent = `${data.playerCount} players`;
    }
  }

  // Handle game start
  handleGameStart(data) {
    // Redirect to gameplay page
    setTimeout(() => {
      window.location.href = `/game/play/${this.gameId}`;
    }, 2000);
  }

  // /play remove for the above game satr

  // Handle player move
  handlePlayerMove(data) {
    // Update game board with player movement
    const playerElement = document.querySelector(
      `[data-player-id="${data.userId}"]`
    );
    if (playerElement) {
      // Update player position on board
      this.animatePlayerMove(playerElement, data.position);
    }
  }

  // Handle QR scan event
  handleQRScanEvent(data) {
    // Show QR scan event in game log
    const gameLog = document.querySelector("#game-log");
    if (gameLog) {
      const logEntry = document.createElement("div");
      logEntry.className = "log-entry qr-scan";
      logEntry.innerHTML = `
                <span class="timestamp">${new Date(
                  data.timestamp
                ).toLocaleTimeString()}</span>
                <span class="message">${data.message}</span>
            `;
      gameLog.appendChild(logEntry);
      gameLog.scrollTop = gameLog.scrollHeight;
    }
  }

  // Handle answer result
  handleAnswerResult(data) {
    // Show answer result in game
    const resultClass = data.isCorrect ? "correct" : "incorrect";
    const resultMessage = data.isCorrect ? "Correct!" : "Incorrect!";

    // Update game log
    const gameLog = document.querySelector("#game-log");
    if (gameLog) {
      const logEntry = document.createElement("div");
      logEntry.className = `log-entry answer-result ${resultClass}`;
      logEntry.innerHTML = `
                <span class="timestamp">${new Date(
                  data.timestamp
                ).toLocaleTimeString()}</span>
                <span class="message">Player answered: ${resultMessage}</span>
            `;
      gameLog.appendChild(logEntry);
      gameLog.scrollTop = gameLog.scrollHeight;
    }
  }

  // Animate player move on board
  animatePlayerMove(playerElement, newPosition) {
    // Add animation class
    playerElement.classList.add("moving");

    // Update position
    playerElement.style.transform = `translate(${newPosition.x}px, ${newPosition.y}px)`;

    // Remove animation class after animation completes
    setTimeout(() => {
      playerElement.classList.remove("moving");
    }, 500);
  }

  // Disconnect socket
  disconnect() {
    if (this.socket) {
      this.leaveGame();
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }
}

// Global socket instance
window.gameSocket = new GameSocket();

// Auto-disconnect on page unload
window.addEventListener("beforeunload", () => {
  if (window.gameSocket) {
    window.gameSocket.disconnect();
  }
});
