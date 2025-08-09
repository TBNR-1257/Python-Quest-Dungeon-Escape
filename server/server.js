const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { testConnection } = require("./config/database");
const auth = require("./middleware/auth");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Set Pug as template engine
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "../views"));

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow inline styles for development
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// // Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100,
// });
// app.use(limiter);

// Cookie Parser
const cookieParser = require("cookie-parser");
app.use(cookieParser());

// Socket.io Real-time Game Management
const gameRooms = new Map(); // gameId -> Set of socketIds
const playerSockets = new Map(); // socketId -> {userId, gameId, username}

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Join game room
  socket.on("join-game", (data) => {
    const { gameId, userId, username } = data;

    // Leave any previous rooms
    socket.rooms.forEach((room) => {
      if (room !== socket.id) {
        socket.leave(room);
      }
    });

    // Join the game room
    socket.join(`game-${gameId}`);

    // Store player info
    playerSockets.set(socket.id, { userId, gameId, username });

    // Add to game room tracking
    if (!gameRooms.has(gameId)) {
      gameRooms.set(gameId, new Set());
    }
    gameRooms.get(gameId).add(socket.id);

    console.log(`Player ${username} (${userId}) joined game ${gameId}`);

    // Notify other players in the room
    socket.to(`game-${gameId}`).emit("player-joined", {
      userId,
      username,
      message: `${username} joined the quest`,
      timestamp: new Date(),
    });

    // Send current room info to the joining player
    const roomSize = gameRooms.get(gameId).size;
    socket.emit("room-info", {
      gameId,
      playerCount: roomSize,
      message: `You joined the quest`,
    });

    // Trigger player list update for everyone in the room
    io.to(`game-${gameId}`).emit("update-player-list");
  });

  // Leave game room
  socket.on("leave-game", (data) => {
    const { gameId, userId, username } = data;

    socket.leave(`game-${gameId}`);

    // Remove from tracking
    if (gameRooms.has(gameId)) {
      gameRooms.get(gameId).delete(socket.id);
      if (gameRooms.get(gameId).size === 0) {
        gameRooms.delete(gameId);
      }
    }
    playerSockets.delete(socket.id);

    console.log(`Player ${username} left game ${gameId}`);

    // Notify other players and trigger update
    socket.to(`game-${gameId}`).emit("player-left", {
      userId,
      username,
      message: `${username} left the quest`,
      timestamp: new Date(),
    });

    // Trigger player list update
    socket.to(`game-${gameId}`).emit("update-player-list");
  });

  // Handle game deletion notification
  socket.on("game-deleted", (data) => {
    const { gameId } = data;

    // Notify all players in the game that it was deleted
    io.to(`game-${gameId}`).emit("game-deleted", {
      gameId,
      message: "This quest has been deleted by the creator",
      timestamp: new Date(),
    });

    // Clean up room tracking
    if (gameRooms.has(gameId)) {
      gameRooms.delete(gameId);
    }

    console.log(`Game ${gameId} was deleted`);
  });

  // Handle game start
  socket.on("start-game", (data) => {
    const { gameId } = data;

    // Broadcast to all players in the game
    io.to(`game-${gameId}`).emit("game-started", {
      gameId,
      message: "Quest is starting! Prepare for adventure!",
      timestamp: new Date(),
    });

    console.log(`Game ${gameId} started`);
  });

  // Handle player moves (for later gameplay)
  socket.on("player-move", (data) => {
    const { gameId, userId, position, diceRoll } = data;

    // Broadcast move to all other players in the game
    socket.to(`game-${gameId}`).emit("player-moved", {
      userId,
      position,
      diceRoll,
      timestamp: new Date(),
    });

    console.log(
      `Player ${userId} moved to position ${position} in game ${gameId}`
    );
  });

  // Handle QR code scans (for later implementation)
  socket.on("qr-scanned", (data) => {
    const { gameId, userId, qrCode, questionId } = data;

    // Broadcast to all players in the game
    socket.to(`game-${gameId}`).emit("qr-scan-event", {
      userId,
      qrCode,
      questionId,
      message: `Player scanned QR code: ${qrCode}`,
      timestamp: new Date(),
    });

    console.log(
      `QR code ${qrCode} scanned by player ${userId} in game ${gameId}`
    );
  });

  // Handle question answers (for later implementation)
  socket.on("answer-submitted", (data) => {
    const { gameId, userId, questionId, answer, isCorrect } = data;

    // Broadcast result to all players
    socket.to(`game-${gameId}`).emit("answer-result", {
      userId,
      questionId,
      isCorrect,
      timestamp: new Date(),
    });

    console.log(
      `Answer submitted by player ${userId} in game ${gameId}: ${
        isCorrect ? "Correct" : "Incorrect"
      }`
    );
  });

  // Handle winner announcement requests
  socket.on("request-winner-stats", (data) => {
    const { gameId } = data;

    // Broadcast to all players to refresh and show winner modal
    io.to(`game-${gameId}`).emit("show-winner-modal", {
      gameId,
      message: "Loading game results...",
      timestamp: new Date(),
    });

    console.log(`Winner stats requested for game ${gameId}`);
  });

  // Handle return to dashboard
  socket.on("return-to-dashboard", (data) => {
    const { gameId, userId } = data;

    // Notify other players that someone left
    socket.to(`game-${gameId}`).emit("player-returned-dashboard", {
      userId,
      message: "A player returned to dashboard",
      timestamp: new Date(),
    });

    console.log(`Player ${userId} returned to dashboard from game ${gameId}`);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const playerInfo = playerSockets.get(socket.id);

    if (playerInfo) {
      const { gameId, userId, username } = playerInfo;

      // Remove from game room tracking
      if (gameRooms.has(gameId)) {
        gameRooms.get(gameId).delete(socket.id);
        if (gameRooms.get(gameId).size === 0) {
          gameRooms.delete(gameId);
        }
      }

      // Notify other players
      socket.to(`game-${gameId}`).emit("player-disconnected", {
        userId,
        username,
        message: `${username} disconnected`,
        timestamp: new Date(),
      });

      // Trigger player list update
      socket.to(`game-${gameId}`).emit("update-player-list");

      console.log(`Player ${username} disconnected from game ${gameId}`);
    }

    playerSockets.delete(socket.id);
    console.log("User disconnected:", socket.id);
  });
});

// Make io available to routes
app.set("io", io);

// Frontend Routes
app.get("/", (req, res) => {
  res.render("index", {
    title: "Python Quest: Dungeon Escape",
    page: "home",
  });
});

app.get("/login", (req, res) => {
  res.render("auth/login", {
    title: "Login - Python Quest",
    page: "login",
  });
});

app.get("/register", (req, res) => {
  res.render("auth/register", {
    title: "Register - Python Quest",
    page: "register",
  });
});

app.get("/dashboard", (req, res) => {
  res.render("dashboard", {
    title: "Dashboard - Python Quest",
    page: "dashboard",
  });
});

// Create Game page
app.get("/create-game", (req, res) => {
  res.render("game/create-game", {
    title: "Create Game - Python Quest",
    page: "create-game",
  });
});

// Join Game page
app.get("/join-game", (req, res) => {
  res.render("game/join-game", {
    title: "Join Game - Python Quest",
    page: "join-game",
  });
});

// Waiting Room page
app.get("/waiting-room/:gameId", (req, res) => {
  res.render("game/waiting-room", {
    title: "Waiting Room - Python Quest",
    page: "waiting-room",
    gameId: req.params.gameId,
  });
});

app.get("/game/:gameId", auth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.user_id; // From auth middleware

    // Fetch game data using the existing controller logic
    const { pool } = require("./config/database");

    // Get game details
    const [gameRows] = await pool.execute(
      `
      SELECT g.*, u.username as creator_name 
      FROM games g 
      JOIN users u ON g.created_by = u.user_id 
      WHERE g.game_id = ?
    `,
      [gameId]
    );

    if (gameRows.length === 0) {
      return res.status(404).render("error", {
        message: "Game not found",
        error: { status: 404 },
      });
    }

    const game = gameRows[0];

    // Get players in the game
    const [playerRows] = await pool.execute(
      `
      SELECT gp.*, u.username 
      FROM game_players gp 
      JOIN users u ON gp.user_id = u.user_id 
      WHERE gp.game_id = ? 
      ORDER BY gp.player_order
    `,
      [gameId]
    );

    const players = playerRows;

    // Check if current user is in the game
    const isPlayerInGame = players.some((player) => player.user_id === userId);
    if (!isPlayerInGame) {
      return res.status(403).render("error", {
        message: "You are not a player in this game",
        error: { status: 403 },
      });
    }

    // Check if game has started
    if (game.status === "waiting") {
      return res.redirect(`/waiting-room/${gameId}`);
    }

    // Get current user details (use the user from auth middleware)
    const currentUser = {
      user_id: req.user.user_id,
      username: req.user.username,
      email: req.user.email,
    };

    // FIXED: Render gameplay page with correct template name
    res.render("game/gameplay", {
      title: `Playing: ${game.game_name}`,
      page: "game",
      game: game,
      players: players,
      currentUser: currentUser,
      gameId: gameId,
    });
  } catch (error) {
    console.error("Gameplay page error:", error);
    res.status(500).render("error", {
      message: "Failed to load game",
      error: { status: 500 },
    });
  }
});

app.get("/games/:gameId/play", (req, res) => {
  // Redirect to the existing route
  res.redirect(`/game/${req.params.gameId}`);
});

app.get("/question/:roomId", (req, res) => {
  res.render("game/question", {
    title: "Question - Python Quest",
    page: "question",
    roomId: req.params.roomId,
  });
});

// API Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/games", require("./routes/games"));
app.use("/api/gameplay", require("./routes/gameplay"));

// Test database endpoint
app.get("/api/test-db", async (req, res) => {
  try {
    const { pool } = require("./config/database");
    const [rows] = await pool.execute("SELECT 1 as test");
    res.json({
      success: true,
      message: "Database connection successful!",
      data: rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection failed!",
      error: error.message,
    });
  }
});

// error page
app.get("/error", (req, res) => {
  res.render("error", {
    title: "Error - Python Quest",
    message: "Something went wrong",
    error: { status: 500 },
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  console.log("🚀 Starting Python Quest server...\n");

  const dbConnected = await testConnection();

  if (dbConnected) {
    server.listen(PORT, () => {
      console.log(`\n🎮 Python Quest server running on port ${PORT}`);
      console.log(`🌐 Access your app at: http://localhost:${PORT}`);
      console.log(`🔧 Test database at: http://localhost:${PORT}/api/test-db`);
      console.log(`📡 Socket.io ready for real-time communication`);
    });
  } else {
    console.error(
      "\n❌ Server startup failed due to database connection issues"
    );
    process.exit(1);
  }
}

startServer();
