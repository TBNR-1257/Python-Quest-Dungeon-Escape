const { pool } = require("../config/database");
const { v4: uuidv4 } = require("uuid");

// Generate unique 6-character game code
const generateGameCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Create New Game
const createGame = async (req, res) => {
  try {
    const { game_name, max_players = 4 } = req.body;
    const created_by = req.user.user_id;

    // Validate required fields
    if (!game_name) {
      return res.status(400).json({ message: "Game name is required" });
    }

    // Generate unique game code
    let game_code;
    let isUnique = false;

    while (!isUnique) {
      game_code = generateGameCode();
      const [existing] = await pool.execute(
        "SELECT game_id FROM games WHERE game_code = ?",
        [game_code]
      );
      isUnique = existing.length === 0;
    }

    // Create game with status
    const [result] = await pool.execute(
      "INSERT INTO games (game_code, game_name, created_by, max_players, status) VALUES (?, ?, ?, ?, ?)",
      [game_code, game_name, created_by, max_players, "waiting"]
    );

    const game_id = result.insertId;

    // Add creator as first player
    await pool.execute(
      "INSERT INTO game_players (game_id, user_id, player_order) VALUES (?, ?, ?)",
      [game_id, created_by, 1]
    );

    // Log game event
    await pool.execute(
      "INSERT INTO game_events (game_id, event_type, event_data) VALUES (?, ?, ?)",
      [
        game_id,
        "player_joined",
        JSON.stringify({
          player_id: created_by,
          username: req.user.username,
          player_order: 1,
        }),
      ]
    );

    res.status(201).json({
      message: "Game created successfully",
      game: {
        game_id,
        game_code,
        game_name,
        created_by,
        max_players,
        status: "waiting",
      },
    });
  } catch (error) {
    console.error("Create game error:", error);
    res.status(500).json({ message: "Server error creating game" });
  }
};

// Join Game
const joinGame = async (req, res) => {
  try {
    const { game_code } = req.body;
    const user_id = req.user.user_id;

    // Validate required fields
    if (!game_code) {
      return res.status(400).json({ message: "Game code is required" });
    }

    // Find game
    const [games] = await pool.execute(
      "SELECT * FROM games WHERE game_code = ? AND status = ?",
      [game_code, "waiting"]
    );

    if (games.length === 0) {
      return res
        .status(404)
        .json({ message: "Game not found or already started" });
    }

    const game = games[0];

    // Check if player already in game
    const [existingPlayer] = await pool.execute(
      "SELECT player_id FROM game_players WHERE game_id = ? AND user_id = ?",
      [game.game_id, user_id]
    );

    if (existingPlayer.length > 0) {
      return res.status(400).json({ message: "You are already in this game" });
    }

    // Check if game is full
    const [playerCount] = await pool.execute(
      "SELECT COUNT(*) as count FROM game_players WHERE game_id = ?",
      [game.game_id]
    );

    if (playerCount[0].count >= game.max_players) {
      return res.status(400).json({ message: "Game is full" });
    }

    // Add player to game
    const player_order = playerCount[0].count + 1;
    await pool.execute(
      "INSERT INTO game_players (game_id, user_id, player_order) VALUES (?, ?, ?)",
      [game.game_id, user_id, player_order]
    );

    // Log game event
    await pool.execute(
      "INSERT INTO game_events (game_id, event_type, event_data) VALUES (?, ?, ?)",
      [
        game.game_id,
        "player_joined",
        JSON.stringify({
          player_id: user_id,
          username: req.user.username,
          player_order,
        }),
      ]
    );

    res.json({
      message: "Joined game successfully",
      game: {
        game_id: game.game_id,
        game_code: game.game_code,
        game_name: game.game_name,
        player_order,
      },
    });
  } catch (error) {
    console.error("Join game error:", error);
    res.status(500).json({ message: "Server error joining game" });
  }
};

// Start Game
const startGame = async (req, res) => {
  try {
    const { game_id } = req.params;
    const user_id = req.user.user_id;

    // Check if user is game creator
    const [games] = await pool.execute(
      "SELECT * FROM games WHERE game_id = ? AND created_by = ? AND status = ?",
      [game_id, user_id, "waiting"]
    );

    if (games.length === 0) {
      return res.status(403).json({
        message: "Not authorized to start this game or game already started",
      });
    }

    // Check minimum players (at least 2)
    const [playerCount] = await pool.execute(
      "SELECT COUNT(*) as count FROM game_players WHERE game_id = ?",
      [game_id]
    );

    if (playerCount[0].count < 2) {
      return res
        .status(400)
        .json({ message: "Need at least 2 players to start game" });
    }

    // Get first player to set as current turn
    const [firstPlayer] = await pool.execute(
      "SELECT user_id FROM game_players WHERE game_id = ? ORDER BY player_order LIMIT 1",
      [game_id]
    );

    // Start game
    await pool.execute(
      "UPDATE games SET status = ?, current_turn_player = ? WHERE game_id = ?",
      ["active", firstPlayer[0].user_id, game_id]
    );

    // Log game event
    await pool.execute(
      "INSERT INTO game_events (game_id, event_type, event_data) VALUES (?, ?, ?)",
      [
        game_id,
        "game_started",
        JSON.stringify({
          started_by: user_id,
          current_turn: firstPlayer[0].user_id,
          total_players: playerCount[0].count,
        }),
      ]
    );

    res.json({
      message: "Game started successfully",
      current_turn_player: firstPlayer[0].user_id,
    });
  } catch (error) {
    console.error("Start game error:", error);
    res.status(500).json({ message: "Server error starting game" });
  }
};

// Get Game Status
const getGameStatus = async (req, res) => {
  try {
    const { game_id } = req.params;

    // Get game details
    const [games] = await pool.execute(
      `
            SELECT g.*, u.username as creator_name 
            FROM games g 
            JOIN users u ON g.created_by = u.user_id 
            WHERE g.game_id = ?
        `,
      [game_id]
    );

    if (games.length === 0) {
      return res.status(404).json({ message: "Game not found" });
    }

    // Get players
    const [players] = await pool.execute(
      `
            SELECT gp.*, u.username 
            FROM game_players gp 
            JOIN users u ON gp.user_id = u.user_id 
            WHERE gp.game_id = ? AND gp.is_active = TRUE
            ORDER BY gp.player_order
        `,
      [game_id]
    );

    res.json({
      game: games[0],
      players: players,
    });
  } catch (error) {
    console.error("Get game status error:", error);
    res.status(500).json({ message: "Server error getting game status" });
  }
};

// Get User's Games
const getUserGames = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const [games] = await pool.execute(
      `
            SELECT DISTINCT g.game_id, g.game_code, g.game_name, g.status, g.created_at,
                   u.username as creator_name,
                   gp.current_score, gp.player_position
            FROM games g
            LEFT JOIN users u ON g.created_by = u.user_id
            LEFT JOIN game_players gp ON g.game_id = gp.game_id AND gp.user_id = ?
            WHERE g.created_by = ? OR gp.user_id = ?
            ORDER BY g.created_at DESC
        `,
      [user_id, user_id, user_id]
    );

    res.json({ games });
  } catch (error) {
    console.error("Get user games error:", error);
    res.status(500).json({ message: "Server error getting user games" });
  }
};

// Delete Game (Creator Only)
const deleteGame = async (req, res) => {
  try {
    const { game_id } = req.params;
    const user_id = req.user.user_id;

    // Check if user is game creator and game is in waiting status
    const [games] = await pool.execute(
      "SELECT * FROM games WHERE game_id = ? AND created_by = ? AND status = ?",
      [game_id, user_id, "waiting"]
    );

    if (games.length === 0) {
      return res.status(403).json({
        message: "Not authorized to delete this game or game already started",
      });
    }

    // Delete related records first (foreign key constraints)
    await pool.execute("DELETE FROM game_events WHERE game_id = ?", [game_id]);
    await pool.execute("DELETE FROM game_players WHERE game_id = ?", [game_id]);
    await pool.execute("DELETE FROM games WHERE game_id = ?", [game_id]);

    res.json({ message: "Game deleted successfully" });
  } catch (error) {
    console.error("Delete game error:", error);
    res.status(500).json({ message: "Server error deleting game" });
  }
};

// Leave Game
const leaveGame = async (req, res) => {
  try {
    const { game_id } = req.params;
    const user_id = req.user.user_id;

    // Check if player is in the game
    const [playerCheck] = await pool.execute(
      "SELECT * FROM game_players WHERE game_id = ? AND user_id = ?",
      [game_id, user_id]
    );

    if (playerCheck.length === 0) {
      return res.status(404).json({ message: "You are not in this game" });
    }

    // Check if user is the creator
    const [gameCheck] = await pool.execute(
      "SELECT created_by FROM games WHERE game_id = ?",
      [game_id]
    );

    if (gameCheck.length > 0 && gameCheck[0].created_by === user_id) {
      return res.status(400).json({
        message: "Game creators cannot leave. Delete the game instead.",
      });
    }

    // Remove player from game
    await pool.execute(
      "DELETE FROM game_players WHERE game_id = ? AND user_id = ?",
      [game_id, user_id]
    );

    // Log the leave event
    await pool.execute(
      "INSERT INTO game_events (game_id, event_type, event_data) VALUES (?, ?, ?)",
      [
        game_id,
        "player_left",
        JSON.stringify({
          player_id: user_id,
          username: req.user.username,
        }),
      ]
    );

    res.json({ message: "Left game successfully" });
  } catch (error) {
    console.error("Leave game error:", error);
    res.status(500).json({ message: "Server error leaving game" });
  }
};

module.exports = {
  createGame,
  joinGame,
  startGame,
  getGameStatus,
  getUserGames,
  deleteGame,
  leaveGame,
};
