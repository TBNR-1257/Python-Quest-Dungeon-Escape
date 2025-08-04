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

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Basic route for testing
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

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

// Routes (will be added later)
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/games', require('./routes/games'));
// app.use('/api/questions', require('./routes/questions'));

// Socket.io for real-time game updates (will be implemented later)
// require('./socket/gameSocket')(io);

const PORT = process.env.PORT || 3000;

// Start server and test database connection
async function startServer() {
  console.log("🚀 Starting Python Quest server...\n");

  // Test database connection first
  const dbConnected = await testConnection();

  if (dbConnected) {
    server.listen(PORT, () => {
      console.log(`\n🎮 Python Quest server running on port ${PORT}`);
      console.log(`🌐 Access your app at: http://localhost:${PORT}`);
      console.log(`🔧 Test database at: http://localhost:${PORT}/api/test-db`);
      console.log("\n📝 Environment loaded:");
      console.log(`   - Database: ${process.env.DB_NAME}`);
      console.log(`   - Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
      console.log(`   - User: ${process.env.DB_USER}`);
    });
  } else {
    console.error(
      "\n❌ Server startup failed due to database connection issues"
    );
    console.error("Please check your .env file and database configuration");
    process.exit(1);
  }
}

startServer();
