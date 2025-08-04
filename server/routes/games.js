const express = require("express");
const { body } = require("express-validator");
const {
  createGame,
  joinGame,
  startGame,
  getGameStatus,
  getUserGames,
} = require("../controllers/gameController");
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

// Get Game Status
router.get("/:game_id", auth, getGameStatus);

// Get User's Games
router.get("/", auth, getUserGames);

module.exports = router;
