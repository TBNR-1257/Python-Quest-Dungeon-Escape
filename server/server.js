const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { testConnection } = require("./config/database");
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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Cookie Parser
const cookieParser = require("cookie-parser");
app.use(cookieParser());

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

// app.get("/game/:gameId", (req, res) => {
//   res.render("game/board", {
//     title: "Game Board - Python Quest",
//     page: "game",
//     gameId: req.params.gameId,
//   });
// });

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

app.get("/game/:gameId", (req, res) => {
  res.render("game/gameplay", {
    title: "Game - Python Quest",
    page: "game",
    gameId: req.params.gameId,
  });
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

const PORT = process.env.PORT || 3000;

async function startServer() {
  console.log("🚀 Starting Python Quest server...\n");

  const dbConnected = await testConnection();

  if (dbConnected) {
    server.listen(PORT, () => {
      console.log(`\n🎮 Python Quest server running on port ${PORT}`);
      console.log(`🌐 Access your app at: http://localhost:${PORT}`);
      console.log(`🔧 Test database at: http://localhost:${PORT}/api/test-db`);
    });
  } else {
    console.error(
      "\n❌ Server startup failed due to database connection issues"
    );
    process.exit(1);
  }
}

startServer();
