const express = require("express");
const { body } = require("express-validator");
const {
  createGame,
  joinGame,
  startGame,
  getGameStatus,
  getUserGames,
  deleteGame,
  leaveGame,
} = require("../controllers/gameController");
const gameplayController = require("../controllers/gameplayController");
const auth = require("../middleware/auth");

const router = express.Router();

// Create Game
router.post(
  "/create",
  [
    auth,
    body("game_name")
      .isLength({ min: 3, max: 50 })
      .withMessage("Game name must be 3-50 characters"),
    body("max_players")
      .optional()
      .isInt({ min: 2, max: 4 })
      .withMessage("Max players must be between 2-4"),
  ],
  createGame
);

// Join Game
router.post(
  "/join",
  [
    auth,
    body("game_code")
      .isLength({ min: 6, max: 6 })
      .withMessage("Game code must be 6 characters")
      .isAlphanumeric()
      .withMessage("Game code must be alphanumeric"),
  ],
  joinGame
);

// Start Game
router.post("/:game_id/start", auth, startGame);

// Delete Game (Creator only)
router.delete("/:game_id", auth, deleteGame);

// Leave Game
router.post("/:game_id/leave", auth, leaveGame);

// Get Game Status
router.get("/:game_id", auth, getGameStatus);

// Get User's Games
router.get("/", auth, getUserGames);

// NEW: Gameplay Page Route
router.get("/:game_id/play", auth, async (req, res) => {
  try {
    const { game_id } = req.params;
    const user_id = req.user.user_id;

    // Get game details using existing controller function
    // We need to create a mock response object to capture the data
    let gameData = null;
    const mockRes = {
      json: (data) => {
        gameData = data;
      },
      status: (code) => ({
        json: (data) => {
          gameData = { statusCode: code, ...data };
        },
      }),
    };

    await getGameStatus({ params: { game_id }, user: req.user }, mockRes);

    // Check if game exists and handle errors
    if (gameData.statusCode === 404) {
      return res.status(404).render("error", {
        message: "Game not found",
        error: { status: 404 },
      });
    }

    if (gameData.statusCode && gameData.statusCode !== 200) {
      return res.status(gameData.statusCode).render("error", {
        message: gameData.message || "Error loading game",
        error: { status: gameData.statusCode },
      });
    }

    const game = gameData.game;
    const players = gameData.players;

    // Check if current user is in the game
    const isPlayerInGame = players.some((player) => player.user_id === user_id);
    if (!isPlayerInGame) {
      return res.status(403).render("error", {
        message: "You are not a player in this game",
        error: { status: 403 },
      });
    }

    // Check if game has started
    if (game.status === "waiting") {
      return res.redirect(`/games/${game_id}/waiting-room`);
    }

    // Render gameplay page
    res.render("game", {
      title: `Playing: ${game.game_name}`,
      game: game,
      players: players,
      currentUser: req.user,
    });
  } catch (error) {
    console.error("Gameplay page error:", error);
    res.status(500).render("error", {
      message: "Failed to load game",
      error: { status: 500 },
    });
  }
});

// Gameplay API Routes
router.post("/:game_id/roll-dice", auth, gameplayController.rollDice);
router.post("/:game_id/scan-qr", auth, gameplayController.scanQR);
router.post("/:game_id/answer", auth, gameplayController.submitAnswer);
router.get("/:game_id/state", auth, gameplayController.getGameState);

module.exports = router;
