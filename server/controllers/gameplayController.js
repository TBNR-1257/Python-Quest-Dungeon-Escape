// controllers/gameplayController.js

const { pool } = require("../config/database");

// Roll dice controller
const rollDice = async (req, res) => {
  try {
    const { game_id } = req.params;
    const user_id = req.user.user_id;

    console.log(`Rolling dice for user ${user_id} in game ${game_id}`);

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

    console.log(
      `Player ${user_id} moved from ${currentPosition} to ${newPosition}`
    );

    // Update player position
    await pool.execute(
      "UPDATE game_players SET current_position = ? WHERE game_id = ? AND user_id = ?",
      [newPosition, game_id, user_id]
    );

    // Log the move
    await pool.execute(
      `INSERT INTO game_moves (game_id, player_id, dice_roll, from_position, to_position) 
       VALUES (?, ?, ?, ?, ?)`,
      [game_id, user_id, diceRoll, currentPosition, newPosition]
    );

    // Check for win condition
    const winner = newPosition >= 49;

    if (winner) {
      console.log(`Player ${user_id} won the game ${game_id}!`);

      try {
        // Update game status and set winner
        await pool.execute(
          'UPDATE games SET status = "completed", winner_id = ?, completed_at = NOW() WHERE game_id = ?',
          [user_id, game_id]
        );

        // Get winner details for broadcasting
        const [winnerData] = await pool.execute(
          "SELECT username FROM users WHERE user_id = ?",
          [user_id]
        );

        const winnerName = winnerData[0]?.username || "Unknown Player";
        console.log(`Winner name: ${winnerName}`);

        // Try to get Socket.io instance and broadcast winner
        try {
          const io = req.app.get("io");
          if (io) {
            console.log(`Broadcasting winner announcement for game ${game_id}`);
            // Broadcast winner announcement to all players in the game
            io.to(`game-${game_id}`).emit("game-winner", {
              gameId: game_id,
              winnerId: user_id,
              winnerName: winnerName,
              finalPosition: newPosition,
              message: `🏆 ${winnerName} has won the quest!`,
              timestamp: new Date(),
            });
          } else {
            console.warn(
              "Socket.io instance not found, skipping winner broadcast"
            );
          }
        } catch (socketError) {
          console.error("Error broadcasting winner:", socketError);
          // Don't fail the request if Socket.io broadcast fails
        }
      } catch (winnerError) {
        console.error("Error handling winner logic:", winnerError);
        // Continue with the response even if winner logic fails
      }
    }

    // Always return success response
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
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to roll dice",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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

    // Get question for this room
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
        id: question.question_id,
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

    console.log(
      `Submit answer - Game: ${game_id}, User: ${user_id}, Question: ${questionId}`
    );

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
    const isCorrect = playerAnswer === correctAnswer;

    console.log(
      `Answer check - Submitted: "${playerAnswer}", Correct: "${correctAnswer}", Match: ${isCorrect}`
    );

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
      scoreChange = 100;
      message = "Correct! You earned 100 points and stay in this room.";
    } else {
      const penaltyRooms = 2;
      newPosition = Math.max(1, currentPosition - penaltyRooms);
      scoreChange = -100;
      message = `Wrong answer. Move back to room ${newPosition} and lose 100 points. Correct answer: ${question.correct_answer}`;
    }

    const newScore = Math.max(0, currentScore + scoreChange);

    console.log(
      `Score update - Old: ${currentScore}, Change: ${scoreChange}, New: ${newScore}`
    );
    console.log(
      `Position update - Old: ${currentPosition}, New: ${newPosition}`
    );

    // Update player stats
    await pool.execute(
      `UPDATE game_players 
       SET current_position = ?, score = ?, total_questions_answered = total_questions_answered + 1,
           correct_answers = correct_answers + ?
       WHERE game_id = ? AND user_id = ?`,
      [newPosition, newScore, isCorrect ? 1 : 0, game_id, user_id]
    );

    console.log("Player stats updated successfully");

    // Update game move record
    try {
      const [updateResult] = await pool.execute(
        `UPDATE game_moves 
         SET question_answered = 1, answer_correct = ?, score_change = ?
         WHERE game_id = ? AND player_id = ? AND to_position = ?
         ORDER BY move_timestamp DESC LIMIT 1`,
        [isCorrect ? 1 : 0, scoreChange, game_id, user_id, currentPosition]
      );

      console.log(
        `Game move updated - Affected rows: ${updateResult.affectedRows}`
      );
    } catch (moveUpdateError) {
      console.error(
        "Error updating game move (non-critical):",
        moveUpdateError
      );
    }

    // Move to next player's turn
    try {
      await moveToNextPlayer(game_id, req);
    } catch (turnError) {
      console.error("Error changing turn (non-critical):", turnError);
    }

    // Broadcast answer result
    try {
      const io = req.app.get("io");
      if (io) {
        const [userData] = await pool.execute(
          "SELECT username FROM users WHERE user_id = ?",
          [user_id]
        );
        const playerName = userData[0]?.username || "Unknown Player";

        io.to(`game-${game_id}`).emit("answer-submitted", {
          gameId: game_id,
          playerId: user_id,
          playerName: playerName,
          questionId: questionId,
          answer: answer,
          isCorrect: isCorrect,
          scoreChange: scoreChange,
          newPosition: newPosition,
          newScore: newScore,
          timestamp: new Date(),
        });

        console.log("Answer result broadcasted successfully");
      }
    } catch (broadcastError) {
      console.error(
        "Error broadcasting answer result (non-critical):",
        broadcastError
      );
    }

    console.log("Answer submission completed successfully");

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
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to submit answer",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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

    // Get recent moves
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

// Get game statistics for winner announcement
const getGameStats = async (req, res) => {
  try {
    const { game_id } = req.params;
    const user_id = req.user.user_id;

    console.log(`Getting game stats for game ${game_id}, user ${user_id}`);

    // Get game details
    const [gameData] = await pool.execute(
      `SELECT g.*, u.username as winner_name, 
              TIMESTAMPDIFF(MINUTE, g.created_at, COALESCE(g.completed_at, NOW())) as duration_minutes
       FROM games g
       LEFT JOIN users u ON g.winner_id = u.user_id
       WHERE g.game_id = ?`,
      [game_id]
    );

    if (gameData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    const game = gameData[0];

    // Get player statistics
    const [playerStats] = await pool.execute(
      `SELECT gp.*, u.username,
              (SELECT COUNT(*) FROM game_moves WHERE game_id = ? AND player_id = gp.user_id) as total_moves,
              (SELECT COUNT(*) FROM game_moves WHERE game_id = ? AND player_id = gp.user_id AND question_answered = TRUE) as questions_answered,
              (SELECT COUNT(*) FROM game_moves WHERE game_id = ? AND player_id = gp.user_id AND answer_correct = TRUE) as correct_answers
       FROM game_players gp
       JOIN users u ON gp.user_id = u.user_id
       WHERE gp.game_id = ?
       ORDER BY gp.score DESC, gp.current_position DESC`,
      [game_id, game_id, game_id, game_id]
    );

    // Calculate game statistics
    const [totalMovesResult] = await pool.execute(
      "SELECT COUNT(*) as total FROM game_moves WHERE game_id = ?",
      [game_id]
    );

    const [totalQuestionsResult] = await pool.execute(
      "SELECT COUNT(*) as total FROM game_moves WHERE game_id = ? AND question_answered = TRUE",
      [game_id]
    );

    console.log("Game stats retrieved successfully");

    res.json({
      success: true,
      game: {
        ...game,
        duration_minutes: game.duration_minutes || 0,
        total_moves: totalMovesResult[0].total || 0,
        total_questions: totalQuestionsResult[0].total || 0,
      },
      players: playerStats,
      currentPlayer: playerStats.find((p) => p.user_id === user_id),
    });
  } catch (error) {
    console.error("Get game stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get game statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Helper function to move to next player
async function moveToNextPlayer(game_id, req = null) {
  try {
    console.log(`Moving to next player for game ${game_id}`);

    // Get players in order
    const [players] = await pool.execute(
      `SELECT user_id, player_order 
       FROM game_players 
       WHERE game_id = ? 
       ORDER BY player_order ASC`,
      [game_id]
    );

    // Get current turn player
    const [currentGame] = await pool.execute(
      "SELECT current_turn_player FROM games WHERE game_id = ?",
      [game_id]
    );

    if (players.length === 0 || currentGame.length === 0) {
      console.error("No players or game found for turn change");
      return;
    }

    const currentPlayerId = currentGame[0].current_turn_player;
    console.log(`Current player: ${currentPlayerId}`);

    // Find current player index
    const currentPlayerIndex = players.findIndex(
      (p) => p.user_id === currentPlayerId
    );

    if (currentPlayerIndex === -1) {
      console.error("Current player not found in players list");
      return;
    }

    // Calculate next player
    const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
    const nextPlayerId = players[nextPlayerIndex].user_id;

    console.log(`Next player will be: ${nextPlayerId}`);

    // Update the database
    await pool.execute(
      "UPDATE games SET current_turn_player = ? WHERE game_id = ?",
      [nextPlayerId, game_id]
    );

    console.log(`Turn successfully moved to player ${nextPlayerId}`);

    // Get next player's username for broadcasting
    const [nextPlayerData] = await pool.execute(
      "SELECT username FROM users WHERE user_id = ?",
      [nextPlayerId]
    );

    const nextPlayerName = nextPlayerData[0]?.username || "Unknown Player";

    // Broadcast turn change via Socket.io
    if (req) {
      try {
        const io = req.app.get("io");
        if (io) {
          console.log(`Broadcasting turn change for game ${game_id}`);

          io.to(`game-${game_id}`).emit("turn-changed", {
            gameId: game_id,
            currentTurnPlayerId: nextPlayerId,
            currentTurnPlayerName: nextPlayerName,
            previousTurnPlayerId: currentPlayerId,
            message: `It's ${nextPlayerName}'s turn!`,
            timestamp: new Date(),
          });

          console.log(`Turn change broadcasted successfully`);
        }
      } catch (socketError) {
        console.error("Error broadcasting turn change:", socketError);
      }
    }

    return nextPlayerId;
  } catch (error) {
    console.error("Error in moveToNextPlayer:", error);
    console.error("Error stack:", error.stack);
    throw error;
  }
}

module.exports = {
  rollDice,
  scanQR,
  submitAnswer,
  getGameState,
  getGameStats,
};
