// controllers/gameplayController.js - Final corrected version

const { pool } = require("../config/database");

// Roll dice controller
const rollDice = async (req, res) => {
  try {
    const { game_id } = req.params;
    const user_id = req.user.user_id;

    // Check if it's the player's turn
    const [gameCheck] = await pool.execute(
      'SELECT current_turn_player, status FROM games WHERE game_id = ? AND status = "active"',
      [game_id]
    );

    if (gameCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Game not found or not active",
      });
    }

    if (gameCheck[0].current_turn_player !== user_id) {
      return res.status(403).json({
        success: false,
        message: "Not your turn",
      });
    }

    // Roll dice (1-6)
    const diceRoll = Math.floor(Math.random() * 6) + 1;

    // Get player's current position
    const [playerData] = await pool.execute(
      "SELECT current_position FROM game_players WHERE game_id = ? AND user_id = ?",
      [game_id, user_id]
    );

    if (playerData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player not found in game",
      });
    }

    const currentPosition = playerData[0].current_position;
    const newPosition = Math.min(currentPosition + diceRoll, 49); // Max position is 49

    // Update player position
    await pool.execute(
      "UPDATE game_players SET current_position = ? WHERE game_id = ? AND user_id = ?",
      [newPosition, game_id, user_id]
    );

    // Log the move - FIXED: Use player_id (your table field) not user_id
    await pool.execute(
      `INSERT INTO game_moves (game_id, player_id, dice_roll, from_position, to_position) 
       VALUES (?, ?, ?, ?, ?)`,
      [game_id, user_id, diceRoll, currentPosition, newPosition]
    );

    // Check for win condition
    const winner = newPosition >= 49;
    if (winner) {
      // Use winner_id (your table field)
      await pool.execute(
        'UPDATE games SET status = "completed", winner_id = ? WHERE game_id = ?',
        [user_id, game_id]
      );
    }

    res.json({
      success: true,
      diceRoll,
      oldPosition: currentPosition,
      newPosition,
      winner,
      message: winner
        ? "Congratulations! You reached the final room!"
        : `Rolled ${diceRoll}! Move to room ${newPosition}.`,
    });
  } catch (error) {
    console.error("Roll dice error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to roll dice",
    });
  }
};

// Scan QR code controller
const scanQR = async (req, res) => {
  try {
    const { game_id } = req.params;
    const { qrData } = req.body;
    const user_id = req.user.user_id;

    // Extract room position from QR data (e.g., "ROOM_15" -> 15)
    const roomMatch = qrData.match(/ROOM_(\d+)/);
    if (!roomMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid QR code format. Expected ROOM_X (e.g., ROOM_15)",
      });
    }

    const roomPosition = parseInt(roomMatch[1]);

    // Validate room number
    if (roomPosition < 1 || roomPosition > 49) {
      return res.status(400).json({
        success: false,
        message: "Invalid room number. Must be between 1 and 49",
      });
    }

    // Check if player is in the correct room
    const [playerData] = await pool.execute(
      "SELECT current_position FROM game_players WHERE game_id = ? AND user_id = ?",
      [game_id, user_id]
    );

    if (playerData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player not found in game",
      });
    }

    if (playerData[0].current_position !== roomPosition) {
      return res.status(400).json({
        success: false,
        message: `You must be in room ${roomPosition} to scan this QR code. You are currently in room ${playerData[0].current_position}.`,
      });
    }

    // Get question for this room - FIXED: Use question_id (your updated field)
    const [questions] = await pool.execute(
      "SELECT * FROM questions WHERE room_position = ? ORDER BY RAND() LIMIT 1",
      [roomPosition]
    );

    if (questions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No question found for this room",
      });
    }

    const question = questions[0];

    res.json({
      success: true,
      question: {
        id: question.question_id, // FIXED: Use question_id
        text: question.question_text,
        difficulty: question.difficulty,
        topic: question.topic,
        roomPosition,
      },
    });
  } catch (error) {
    console.error("Scan QR error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process QR scan",
    });
  }
};

// Submit answer controller
const submitAnswer = async (req, res) => {
  try {
    const { game_id } = req.params;
    const { questionId, answer, roomPosition } = req.body;
    const user_id = req.user.user_id;

    // Get question and correct answer
    const [questions] = await pool.execute(
      "SELECT * FROM questions WHERE question_id = ?",
      [questionId]
    );

    if (questions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    const question = questions[0];
    const playerAnswer = answer.trim().toLowerCase();
    const correctAnswer = question.correct_answer.toLowerCase();

    // Simple answer checking - just compare against the correct answer
    const isCorrect = playerAnswer === correctAnswer;

    // Get current player data
    const [playerData] = await pool.execute(
      "SELECT current_position, score FROM game_players WHERE game_id = ? AND user_id = ?",
      [game_id, user_id]
    );

    if (playerData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player not found in game",
      });
    }

    const currentPosition = playerData[0].current_position;
    const currentScore = playerData[0].score || 0;

    let newPosition = currentPosition;
    let scoreChange = 0;
    let message = "";

    if (isCorrect) {
      // Correct answer: gain points
      scoreChange = 100;
      message = "Correct! You earned 100 points and stay in this room.";
    } else {
      // Wrong answer: penalty
      const penaltyRooms = 2; // Move back 2 rooms
      newPosition = Math.max(1, currentPosition - penaltyRooms);
      scoreChange = -100;
      message = `Wrong answer. Move back to room ${newPosition} and lose 100 points. Correct answer: ${question.correct_answer}`;
    }

    const newScore = Math.max(0, currentScore + scoreChange);

    // Update player stats
    await pool.execute(
      `UPDATE game_players 
       SET current_position = ?, score = ?, total_questions_answered = total_questions_answered + 1,
           correct_answers = correct_answers + ?
       WHERE game_id = ? AND user_id = ?`,
      [newPosition, newScore, isCorrect ? 1 : 0, game_id, user_id]
    );

    // Update game move record
    await pool.execute(
      `UPDATE game_moves 
       SET question_answered = TRUE, answer_correct = ?, score_change = ?
       WHERE game_id = ? AND player_id = ? AND to_position = ?
       ORDER BY move_timestamp DESC LIMIT 1`,
      [isCorrect, scoreChange, game_id, user_id, currentPosition]
    );

    // Move to next player's turn
    await moveToNextPlayer(game_id);

    res.json({
      success: true,
      correct: isCorrect,
      scoreChange,
      newScore,
      newPosition,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      message,
    });
  } catch (error) {
    console.error("Submit answer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit answer",
    });
  }
};

// Get detailed game state controller
const getGameState = async (req, res) => {
  try {
    const { game_id } = req.params;

    console.log("Getting game state for game_id:", game_id);

    // Get game info
    const [games] = await pool.execute(
      `SELECT g.*, u.username as current_player_name, w.username as winner_name
       FROM games g
       LEFT JOIN users u ON g.current_turn_player = u.user_id
       LEFT JOIN users w ON g.winner_id = w.user_id
       WHERE g.game_id = ?`,
      [game_id]
    );

    if (games.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    console.log("Found game:", games[0].game_name);

    // Get players with positions and scores
    const [players] = await pool.execute(
      `SELECT gp.*, u.username 
       FROM game_players gp 
       JOIN users u ON gp.user_id = u.user_id 
       WHERE gp.game_id = ? 
       ORDER BY gp.player_order`,
      [game_id]
    );

    console.log("Found players:", players.length);

    // Get recent moves - FIXED: Use player_id (your table field)
    const [recentMoves] = await pool.execute(
      `SELECT gm.*, u.username 
       FROM game_moves gm 
       JOIN users u ON gm.player_id = u.user_id 
       WHERE gm.game_id = ? 
       ORDER BY gm.move_timestamp DESC 
       LIMIT 10`,
      [game_id]
    );

    console.log("Game state retrieved successfully");

    res.json({
      success: true,
      game: games[0],
      players,
      recentMoves,
    });
  } catch (error) {
    console.error("Get game state error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get game state",
      error: error.message,
    });
  }
};

// Helper function to move to next player
async function moveToNextPlayer(game_id) {
  try {
    const [players] = await pool.execute(
      "SELECT user_id FROM game_players WHERE game_id = ? ORDER BY player_order",
      [game_id]
    );

    const [currentGame] = await pool.execute(
      "SELECT current_turn_player FROM games WHERE game_id = ?",
      [game_id]
    );

    const currentPlayerId = currentGame[0].current_turn_player;
    const currentPlayerIndex = players.findIndex(
      (p) => p.user_id === currentPlayerId
    );
    const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
    const nextPlayerId = players[nextPlayerIndex].user_id;

    await pool.execute(
      "UPDATE games SET current_turn_player = ? WHERE game_id = ?",
      [nextPlayerId, game_id]
    );

    console.log(
      `Turn moved from player ${currentPlayerId} to player ${nextPlayerId}`
    );
  } catch (error) {
    console.error("Error moving to next player:", error);
  }
}

module.exports = {
  rollDice,
  scanQR,
  submitAnswer,
  getGameState,
};
