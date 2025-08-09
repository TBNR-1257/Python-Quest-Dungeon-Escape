// routes/gameplay.js - Gameplay-specific routes (dice, QR, answers)
const express = require("express");
const { body } = require("express-validator");
const {
  rollDice,
  scanQR,
  submitAnswer,
  getGameState,
} = require("../controllers/gameplayController"); // Note: separate controller file
const auth = require("../middleware/auth");

const router = express.Router();

// Roll dice endpoint
router.post("/:game_id/roll-dice", auth, rollDice);

// Scan QR code endpoint
router.post(
  "/:game_id/scan-qr",
  [auth, body("qrData").notEmpty().withMessage("QR data is required")],
  scanQR
);

// Submit answer endpoint
router.post(
  "/:game_id/answer",
  [
    auth,
    body("questionId").isInt().withMessage("Valid question ID required"),
    body("answer").notEmpty().withMessage("Answer is required"),
    body("roomPosition")
      .isInt({ min: 1, max: 49 })
      .withMessage("Valid room position required"),
  ],
  submitAnswer
);

// Get detailed game state (for gameplay page)
router.get("/:game_id/state", auth, getGameState);

module.exports = router;
