const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const { pool } = require("../config/database");

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { user: { id: user.user_id, username: user.username } },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || "24h" }
  );
};

// Register User
const register = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password } = req.body;

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      "SELECT user_id FROM users WHERE email = ? OR username = ?",
      [email, username]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const [result] = await pool.execute(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
      [username, email, hashedPassword]
    );

    // Get created user
    const [newUser] = await pool.execute(
      "SELECT user_id, username, email FROM users WHERE user_id = ?",
      [result.insertId]
    );

    // Generate token
    const token = generateToken(newUser[0]);

    // Set token as HTTP-only cookie for web requests
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS in production
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    const userResponse = {
      id: newUser[0].user_id,
      username: newUser[0].username,
      email: newUser[0].email,
    };

    res.status(201).json({
      message: "User registered successfully",
      token, // Still send token in response for API compatibility
      user: userResponse,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
};

// Login User
const login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    // Find user
    const [users] = await pool.execute(
      "SELECT user_id, username, email, password_hash FROM users WHERE username = ? OR email = ?",
      [username, username]
    );

    if (users.length === 0) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const user = users[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Update last login
    await pool.execute(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?",
      [user.user_id]
    );

    // Generate token
    const token = generateToken(user);

    // Set token as HTTP-only cookie for web requests
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS in production
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    const userResponse = {
      id: user.user_id,
      username: user.username,
      email: user.email,
    };

    res.json({
      message: "Login successful",
      token, // Still send token in response for API compatibility
      user: userResponse,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

// Get Current User
const getCurrentUser = async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user.user_id,
        username: req.user.username,
        email: req.user.email,
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Logout User
const logout = async (req, res) => {
  try {
    // Clear the token cookie
    res.clearCookie("token");
    res.clearCookie("authToken"); // Clear any alternative cookie names

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Error during logout" });
  }
};

module.exports = { register, login, getCurrentUser, logout };
