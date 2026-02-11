const express = require("express");
const GroupMessage = require("../models/GroupMessage");
const PrivateMessage = require("../models/PrivateMessage");

const router = express.Router();

// GET-/api/rooms/:room/messages?limit 50
router.get("/rooms/:room/messages", async (req, res) => {
  try {
    const { room } = req.params;
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);

    const msgs = await GroupMessage.find({ room })
      .sort({ date_sent: -1 })
      .limit(limit);

    res.json({ ok: true, messages: msgs.reverse() });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Server error." });
  }
});

// GET-/api/private/messages?userA=a&userB=b&limit 50
router.get("/private/messages", async (req, res) => {
  try {
    const { userA, userB } = req.query;
    if (!userA || !userB) {
      return res.status(400).json({ ok: false, message: "userA and userB required." });
    }
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);

    const msgs = await PrivateMessage.find({
      $or: [
        { from_user: userA, to_user: userB },
        { from_user: userB, to_user: userA }
      ]
    })
      .sort({ date_sent: -1 })
      .limit(limit);

    res.json({ ok: true, messages: msgs.reverse() });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Server error." });
  }
});

module.exports = router;
