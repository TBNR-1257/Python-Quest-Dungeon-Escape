const jwt = require("jsonwebtoken");
const { pool } = require("../config/database");

const auth = async (req, res, next) => {
  try {
    // Try to get token from multiple sources
    let token = req.header("x-auth-token"); // For API requests

    // If no header token, try cookies (for web requests)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // If no token found anywhere
    if (!token) {
      // For web requests, redirect to login page
      if (req.path.startsWith("/api/")) {
        return res
          .status(401)
          .json({ message: "No token, authorization denied" });
      } else {
        return res.redirect("/login");
      }
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const [users] = await pool.execute(
      "SELECT user_id, username, email FROM users WHERE user_id = ?",
      [decoded.user.id]
    );

    if (users.length === 0) {
      // Clear the invalid token from cookies
      res.clearCookie("token");

      if (req.path.startsWith("/api/")) {
        return res.status(401).json({ message: "Token is not valid" });
      } else {
        return res.redirect("/login");
      }
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    // Clear the invalid token from cookies
    res.clearCookie("token");

    // Handle web vs API requests differently
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ message: "Token is not valid" });
    } else {
      res.redirect("/login");
    }
  }
};

module.exports = auth;
