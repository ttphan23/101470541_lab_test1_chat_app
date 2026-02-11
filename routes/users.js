const express = require("express");
const User = require("../models/User");

const router = express.Router();

// GET /api/users
router.get("/users", async (_req, res) => {
  try {
    const users = await User.find({}, { username: 1, firstname: 1, lastname: 1, _id: 0 })
      .sort({ username: 1 });

    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Server error." });
  }
});

module.exports = router;
