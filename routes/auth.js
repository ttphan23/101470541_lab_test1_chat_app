const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

// POST-/api/signup
router.post("/signup", async (req, res) => {
  try {
    const { username, firstname, lastname, password } = req.body;

    if (!username || !firstname || !lastname || !password) {
      return res.status(400).json({ ok: false, message: "All fields are required." });
    }

    const existing = await User.findOne({ username: username.trim() });
    if (existing) {
      return res.status(409).json({ ok: false, message: "Username already exists." });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: username.trim(),
      firstname: firstname.trim(),
      lastname: lastname.trim(),
      password: hashed
    });

    return res.json({
      ok: true,
      message: "Signup successful",
      user: { username: user.username, firstname: user.firstname, lastname: user.lastname }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Server error." });
  }
});

// POST-/api/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "Username and password required." });
    }

    const user = await User.findOne({ username: username.trim() });
    if (!user) return res.status(401).json({ ok: false, message: "Invalid credentials." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ ok: false, message: "Invalid credentials." });

    return res.json({
      ok: true,
      message: "Login successful",
      user: { username: user.username, firstname: user.firstname, lastname: user.lastname }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Server error." });
  }
});

module.exports = router;
