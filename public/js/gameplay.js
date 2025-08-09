// public/js/gameplay.js - Fixed GameplayManager with proper initialization
class GameplayManager {
  constructor(gameData) {
    this.gameId = gameData.gameId;
    this.userId = gameData.userId;
    this.players = gameData.players;
    this.currentTurnPlayerId = null;
    this.gameStatus = gameData.gameStatus || "waiting";
    this.currentQuestion = null;
    this.qrScanner = null;
    this.isScanning = false;

    // Initialize Socket.io
    this.socket = io();

    // Get DOM elements
    this.initDOMElements();

    // Set up event listeners
    this.setupEventListeners();
    this.setupSocketListeners();

    // Initialize game - IMPORTANT: Do this after socket connection
    this.socket.on("connect", () => {
      console.log("Connected to server");
      // Join game room with proper data
      this.socket.emit("join-game", {
        gameId: this.gameId,
        userId: this.userId,
        username: this.getCurrentUserName(),
      });

      // Initialize game state after joining
      this.initializeGameState();
    });

    this.addGameMessage({
      type: "info",
      message: "🎮 Game loaded. Connecting to server...",
      timestamp: new Date(),
    });
  }

  getCurrentUserName() {
    const currentPlayer = this.players.find((p) => p.user_id === this.userId);
    return currentPlayer ? currentPlayer.username : "Unknown";
  }

  async initializeGameState() {
    try {
      console.log("Initializing game state...");
      await this.updateGameState();

      this.addGameMessage({
        type: "success",
        message: "🎮 Connected! Follow the quest instructions!",
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Failed to initialize game state:", error);
      this.addGameMessage({
        type: "error",
        message: "Failed to load game state. Please refresh the page.",
        timestamp: new Date(),
      });
    }
  }

  initDOMElements() {
    this.rollDiceBtn = document.getElementById("roll-dice-btn");
    this.scanQrBtn = document.getElementById("scan-qr-btn");
    this.submitAnswerBtn = document.getElementById("submit-answer-btn");
    this.answerInput = document.getElementById("answer-input");
    this.gameMessages = document.getElementById("game-messages");
    this.qrScannerSection = document.getElementById("qr-scanner-section");
    this.qrResult = document.getElementById("qr-result");
  }

  setupEventListeners() {
    this.rollDiceBtn.addEventListener("click", () => this.rollDice());
    this.scanQrBtn.addEventListener("click", () => this.toggleQRScanner());
    this.submitAnswerBtn.addEventListener("click", () => this.submitAnswer());
    this.answerInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.submitAnswer();
    });
  }

  setupSocketListeners() {
    this.socket.on("game-state-update", (data) => this.updateGameState(data));
    this.socket.on("dice-rolled", (data) => this.handleDiceRolled(data));
    this.socket.on("qr-scanned", (data) => this.handleQRScanned(data));
    this.socket.on("answer-submitted", (data) =>
      this.handleAnswerSubmitted(data)
    );
    this.socket.on("turn-changed", (data) => this.handleTurnChanged(data));
    this.socket.on("game-message", (message) => this.addGameMessage(message));
  }

  async rollDice() {
    try {
      this.rollDiceBtn.disabled = true;
      this.rollDiceBtn.textContent = "🎲 Rolling...";

      const token = localStorage.getItem("token");
      const response = await fetch(`/api/games/${this.gameId}/roll-dice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        this.showDiceResult(result);

        // Broadcast dice roll to other players
        this.socket.emit("player-move", {
          gameId: this.gameId,
          userId: this.userId,
          position: result.newPosition,
          diceRoll: result.diceRoll,
        });

        this.addGameMessage({
          type: "success",
          message: `🎲 You rolled ${result.diceRoll}! Move to room ${result.newPosition}`,
          timestamp: new Date(),
        });

        if (!result.winner) {
          this.showQRScanner();
        } else {
          this.addGameMessage({
            type: "success",
            message: `🏆 ${result.message} You won!`,
            timestamp: new Date(),
          });
        }
      } else {
        this.addGameMessage({
          type: "error",
          message: result.message,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("Roll dice error:", error);
      this.addGameMessage({
        type: "error",
        message: "Failed to roll dice. Please try again.",
        timestamp: new Date(),
      });
    } finally {
      this.rollDiceBtn.disabled = false;
      this.rollDiceBtn.textContent = "🎲 Roll Dice";
    }
  }

  async toggleQRScanner() {
    if (this.isScanning) {
      await this.stopQRScanner();
    } else {
      await this.startQRScanner();
    }
  }

  async startQRScanner() {
    try {
      this.scanQrBtn.disabled = true;
      this.scanQrBtn.textContent = "📱 Starting Camera...";

      // Create QR scanner container if it doesn't exist
      let scannerContainer = document.getElementById("qr-scanner-container");
      if (!scannerContainer) {
        scannerContainer = document.createElement("div");
        scannerContainer.id = "qr-scanner-container";
        scannerContainer.className = "gameplay-scanner-container";
        scannerContainer.innerHTML = `
          <div class="gameplay-scanner-header">
            <p>Position QR code within the frame</p>
          </div>
          <div id="qr-reader" style="width: 100%; max-width: 400px; margin: 0 auto;"></div>
          <div class="gameplay-scanner-controls">
            <button id="stop-scanner-btn" class="gameplay-btn gameplay-btn-secondary">
              ❌ Stop Scanner
            </button>
          </div>
        `;
        this.qrScannerSection.appendChild(scannerContainer);

        // Add CSS for scanner
        if (!document.getElementById("qr-scanner-styles")) {
          const style = document.createElement("style");
          style.id = "qr-scanner-styles";
          style.textContent = `
            .gameplay-scanner-container {
              margin-top: 15px;
              padding: 20px;
              background: #f8f9fa;
              border: 2px solid #dee2e6;
              border-radius: 8px;
            }
            .gameplay-scanner-header {
              text-align: center;
              margin-bottom: 15px;
            }
            .gameplay-scanner-header p {
              margin: 0;
              color: #666;
              font-size: 0.9em;
            }
            .gameplay-scanner-controls {
              text-align: center;
              margin-top: 15px;
            }
          `;
          document.head.appendChild(style);
        }

        // Add stop button event listener
        document
          .getElementById("stop-scanner-btn")
          .addEventListener("click", () => {
            this.stopQRScanner();
          });
      }

      // Initialize html5-qrcode scanner
      this.qrScanner = new Html5Qrcode("qr-reader");

      // Start scanning
      await this.qrScanner.start(
        { facingMode: "environment" }, // Use back camera by default
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText, decodedResult) => {
          // Success callback
          this.onQRCodeScanned(decodedText, decodedResult);
        },
        (errorMessage) => {
          // Error callback (can be ignored for scanning errors)
          if (errorMessage.includes("NotFoundException")) {
            // This is normal - just means no QR code found in frame
            return;
          }
          console.warn("QR Scanner error:", errorMessage);
        }
      );

      this.isScanning = true;
      this.scanQrBtn.textContent = "📱 Stop Scanner";
      this.scanQrBtn.disabled = false;

      // Show scanner container
      scannerContainer.style.display = "block";
    } catch (error) {
      console.error("Failed to start QR scanner:", error);
      this.addGameMessage({
        type: "error",
        message: "Failed to access camera. Please check permissions.",
        timestamp: new Date(),
      });

      this.scanQrBtn.disabled = false;
      this.scanQrBtn.textContent = "📱 Scan QR Code";

      // Show fallback manual input
      this.showManualQRInput();
    }
  }

  async stopQRScanner() {
    try {
      if (this.qrScanner && this.isScanning) {
        await this.qrScanner.stop();
        this.qrScanner.clear();
        this.qrScanner = null;
      }

      // Hide scanner container
      const scannerContainer = document.getElementById("qr-scanner-container");
      if (scannerContainer) {
        scannerContainer.style.display = "none";
      }

      this.isScanning = false;
      this.scanQrBtn.textContent = "📱 Scan QR Code";
      this.scanQrBtn.disabled = false;
    } catch (error) {
      console.error("Error stopping QR scanner:", error);
    }
  }

  showManualQRInput() {
    // Fallback: Show manual input if camera fails
    let manualInput = document.getElementById("manual-qr-input");
    if (!manualInput) {
      manualInput = document.createElement("div");
      manualInput.id = "manual-qr-input";
      manualInput.className = "gameplay-manual-input";
      manualInput.innerHTML = `
        <p>Camera not available. Enter QR code manually:</p>
        <div class="gameplay-manual-controls">
          <input id="manual-qr-text" type="text" placeholder="e.g., ROOM_15" 
                 class="gameplay-form-input">
          <button id="manual-qr-submit" class="gameplay-btn gameplay-btn-secondary">
            Submit
          </button>
        </div>
      `;
      this.qrScannerSection.appendChild(manualInput);

      // Add CSS for manual input
      if (!document.getElementById("manual-input-styles")) {
        const style = document.createElement("style");
        style.id = "manual-input-styles";
        style.textContent = `
          .gameplay-manual-input {
            margin-top: 15px;
            padding: 20px;
            background: #fff3cd;
            border: 2px solid #ffeaa7;
            border-radius: 8px;
          }
          .gameplay-manual-input p {
            margin: 0 0 15px 0;
            color: #856404;
            font-size: 0.9em;
          }
          .gameplay-manual-controls {
            display: flex;
            gap: 10px;
          }
          .gameplay-manual-controls input {
            flex: 1;
          }
        `;
        document.head.appendChild(style);
      }

      // Add event listeners for manual input
      const manualQRText = document.getElementById("manual-qr-text");
      const manualQRSubmit = document.getElementById("manual-qr-submit");

      manualQRSubmit.addEventListener("click", () => {
        const qrData = manualQRText.value.trim();
        if (qrData) {
          this.onQRCodeScanned(qrData, null);
        }
      });

      manualQRText.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          const qrData = manualQRText.value.trim();
          if (qrData) {
            this.onQRCodeScanned(qrData, null);
          }
        }
      });
    }

    manualInput.style.display = "block";
  }

  async onQRCodeScanned(qrData, decodedResult) {
    // Stop scanner immediately when QR code is found
    if (this.isScanning) {
      await this.stopQRScanner();
    }

    // Hide manual input if shown
    const manualInput = document.getElementById("manual-qr-input");
    if (manualInput) {
      manualInput.style.display = "none";
    }

    try {
      this.scanQrBtn.disabled = true;
      this.scanQrBtn.textContent = "📱 Processing...";

      const token = localStorage.getItem("token");
      const response = await fetch(`/api/games/${this.gameId}/scan-qr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ qrData }),
      });

      const result = await response.json();

      if (result.success) {
        this.showQuestion(result.question);
        this.qrResult.style.display = "block";

        // Broadcast QR scan to other players
        this.socket.emit("qr-scanned", {
          gameId: this.gameId,
          userId: this.userId,
          qrCode: qrData,
          questionId: result.question.id,
        });

        this.addGameMessage({
          type: "success",
          message: `📱 Successfully scanned ${qrData}!`,
          timestamp: new Date(),
        });
      } else {
        this.addGameMessage({
          type: "error",
          message: result.message,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("QR processing error:", error);
      this.addGameMessage({
        type: "error",
        message: "Failed to process QR code. Please try again.",
        timestamp: new Date(),
      });
    } finally {
      this.scanQrBtn.disabled = false;
      this.scanQrBtn.textContent = "📱 Scan QR Code";
    }
  }

  async submitAnswer() {
    try {
      const answer = this.answerInput.value.trim();

      if (!answer) {
        this.addGameMessage({
          type: "error",
          message: "Please enter an answer.",
          timestamp: new Date(),
        });
        return;
      }

      if (!this.currentQuestion) {
        this.addGameMessage({
          type: "error",
          message: "No question to answer.",
          timestamp: new Date(),
        });
        return;
      }

      this.submitAnswerBtn.disabled = true;
      this.submitAnswerBtn.textContent = "✅ Submitting...";

      const token = localStorage.getItem("token");
      const response = await fetch(`/api/games/${this.gameId}/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questionId: this.currentQuestion.id,
          answer: answer,
          roomPosition: this.currentQuestion.roomPosition,
        }),
      });

      const result = await response.json();

      if (result.success) {
        this.showAnswerResult(result);

        // Broadcast answer result to other players
        this.socket.emit("answer-submitted", {
          gameId: this.gameId,
          userId: this.userId,
          questionId: this.currentQuestion.id,
          answer: answer,
          isCorrect: result.correct,
        });

        this.hideAllSections();
        this.currentQuestion = null;

        // Update game state after answer
        setTimeout(() => this.updateGameState(), 1000);
      } else {
        this.addGameMessage({
          type: "error",
          message: result.message,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("Submit answer error:", error);
      this.addGameMessage({
        type: "error",
        message: "Failed to submit answer. Please try again.",
        timestamp: new Date(),
      });
    } finally {
      this.submitAnswerBtn.disabled = false;
      this.submitAnswerBtn.textContent = "✅ Submit Answer";
    }
  }

  // UI Helper Functions
  showDiceResult(result) {
    const diceResult = document.getElementById("dice-result");
    document.getElementById("dice-value").textContent = result.diceRoll;
    document.getElementById(
      "move-instruction"
    ).textContent = `Move your piece to room ${result.newPosition} on the physical board`;
    diceResult.style.display = "block";
  }

  showQRScanner() {
    this.qrScannerSection.style.display = "block";
  }

  showQuestion(question) {
    this.currentQuestion = question;
    document.getElementById("question-text").textContent = question.text;
    document.getElementById("question-section").style.display = "block";
    this.answerInput.value = "";
    this.answerInput.focus();
  }

  showAnswerResult(result) {
    const answerResult = document.getElementById("answer-result");
    const resultMessage = document.getElementById("result-message");
    const resultExplanation = document.getElementById("result-explanation");

    answerResult.className = `gameplay-answer-result ${
      result.correct ? "gameplay-result-success" : "gameplay-result-error"
    }`;

    resultMessage.textContent = result.message;

    if (result.explanation) {
      resultExplanation.textContent = result.explanation;
      resultExplanation.style.display = "block";
    }

    answerResult.style.display = "block";

    // Hide after 5 seconds
    setTimeout(() => {
      answerResult.style.display = "none";
    }, 5000);
  }

  hideAllSections() {
    document.getElementById("dice-result").style.display = "none";
    this.qrScannerSection.style.display = "none";
    this.qrResult.style.display = "none";
    document.getElementById("question-section").style.display = "none";

    // Stop scanner if running
    if (this.isScanning) {
      this.stopQRScanner();
    }

    // Hide manual input
    const manualInput = document.getElementById("manual-qr-input");
    if (manualInput) {
      manualInput.style.display = "none";
    }
  }

  updatePlayerTurnIndicators() {
    document.querySelectorAll(".turn-indicator").forEach((indicator) => {
      indicator.style.display = "none";
    });

    if (this.currentTurnPlayerId) {
      const currentPlayerCard = document.querySelector(
        `[data-user-id="${this.currentTurnPlayerId}"] .turn-indicator`
      );
      if (currentPlayerCard) {
        currentPlayerCard.style.display = "block";
      }
    }
  }

  updateActionButtons() {
    const isMyTurn = this.currentTurnPlayerId === this.userId;
    const isActive = this.gameStatus === "active";

    console.log("Updating action buttons:", {
      isMyTurn,
      isActive,
      currentTurnPlayerId: this.currentTurnPlayerId,
      userId: this.userId,
    });

    this.rollDiceBtn.disabled = !isMyTurn || !isActive;

    // Update current turn display
    const currentTurnText = document.getElementById("current-turn-text");
    if (isMyTurn && isActive) {
      currentTurnText.textContent =
        "🎯 It's your turn! Roll the dice to continue.";
      currentTurnText.className = "gameplay-turn-active";
    } else if (isActive) {
      const currentPlayerName =
        this.players.find((p) => p.user_id === this.currentTurnPlayerId)
          ?.username || "Unknown";
      currentTurnText.textContent = `⏳ Waiting for ${currentPlayerName}'s turn...`;
      currentTurnText.className = "gameplay-turn-waiting";
    } else {
      currentTurnText.textContent = "🏁 Game has ended.";
      currentTurnText.className = "gameplay-turn-ended";
    }
  }

  addGameMessage(message) {
    const messageDiv = document.createElement("div");
    const time = new Date(message.timestamp).toLocaleTimeString();

    let className = "gameplay-message";
    if (message.type === "success") {
      className += " gameplay-message-success";
    } else if (message.type === "error") {
      className += " gameplay-message-error";
    } else if (message.type === "info") {
      className += " gameplay-message-info";
    }

    messageDiv.className = className;
    messageDiv.innerHTML = `
      <div class="gameplay-message-content">
        <span class="gameplay-message-text">${message.message}</span>
        <span class="gameplay-message-time">${time}</span>
      </div>
    `;

    this.gameMessages.appendChild(messageDiv);
    this.gameMessages.scrollTop = this.gameMessages.scrollHeight;
  }

  // Socket event handlers
  handleDiceRolled(data) {
    if (data.playerId !== this.userId) {
      this.addGameMessage({
        type: "info",
        message: `🎲 ${data.playerName} rolled ${data.diceRoll} and moved to room ${data.newPosition}`,
        timestamp: data.timestamp,
      });
    }
  }

  handleQRScanned(data) {
    if (data.playerId !== this.userId) {
      this.addGameMessage({
        type: "info",
        message: `📱 ${data.playerName} scanned QR code for room ${data.roomPosition}`,
        timestamp: data.timestamp,
      });
    }
  }

  handleAnswerSubmitted(data) {
    if (data.playerId !== this.userId) {
      const resultText = data.correct ? "correctly" : "incorrectly";
      this.addGameMessage({
        type: data.correct ? "success" : "error",
        message: `${data.playerName} answered ${resultText} and ${
          data.correct ? "earned" : "lost"
        } ${Math.abs(data.scoreChange)} points`,
        timestamp: data.timestamp,
      });
    }

    // Update game state after answer
    this.updateGameState();
  }

  handleTurnChanged(data) {
    this.currentTurnPlayerId = data.currentTurnPlayerId;
    this.updatePlayerTurnIndicators();
    this.updateActionButtons();
    this.hideAllSections();

    if (data.currentTurnPlayerId === this.userId) {
      this.addGameMessage({
        type: "success",
        message: "🎯 It's your turn!",
        timestamp: data.timestamp,
      });
    }
  }

  async updateGameState(data) {
    try {
      // Use provided data or fetch from server
      let result = data;

      if (!result) {
        const token = localStorage.getItem("token");
        const response = await fetch(`/api/games/${this.gameId}/state`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        result = await response.json();
      }

      if (result.success) {
        this.currentTurnPlayerId = result.game.current_turn_player;
        this.gameStatus = result.game.status;

        console.log("Game state updated:", {
          currentTurnPlayerId: this.currentTurnPlayerId,
          gameStatus: this.gameStatus,
        });

        // Update player positions and scores
        if (result.players) {
          result.players.forEach((player) => {
            const playerCard = document.querySelector(
              `[data-user-id="${player.user_id}"]`
            );
            if (playerCard) {
              playerCard.querySelector(".position-value").textContent =
                player.current_position;
              playerCard.querySelector(".score-value").textContent =
                player.score;
            }
          });
        }

        this.updatePlayerTurnIndicators();
        this.updateActionButtons();
      }
    } catch (error) {
      console.error("Failed to update game state:", error);
    }
  }
}

// Initialize gameplay when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
  const gameDataElement = document.getElementById("game-data");
  if (gameDataElement) {
    const gameData = JSON.parse(gameDataElement.textContent);
    console.log("Initializing GameplayManager with:", gameData);
    window.gameplayManager = new GameplayManager(gameData);
  }
});
