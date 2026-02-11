require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const messagesRoutes = require("./routes/messages");

const GroupMessage = require("./models/GroupMessage");
const PrivateMessage = require("./models/PrivateMessage");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/public", express.static(path.join(__dirname, "public")));

// Views
app.get("/", (req, res) => res.redirect("/login"));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "view", "signup.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "view", "login.html")));
app.get("/chat", (req, res) => res.sendFile(path.join(__dirname, "view", "chat.html")));
app.get("/private", (req, res) =>res.sendFile(path.join(__dirname, "view", "private.html")));


// API routes
app.use("/api", authRoutes);
app.use("/api", usersRoutes);
app.use("/api", messagesRoutes);

//mongo
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
})();

// --- Socket state ---
const userToSockets = new Map(); // username -> Set(socket.id)
const socketToUser = new Map();  // socket.id -> username

function addUserSocket(username, socketId) {
  if (!userToSockets.has(username)) userToSockets.set(username, new Set());
  userToSockets.get(username).add(socketId);
}

function removeUserSocket(username, socketId) {
  const set = userToSockets.get(username);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userToSockets.delete(username);
}

function emitToUser(username, event, payload, ioInstance) {
  const set = userToSockets.get(username);
  if (!set) return;
  for (const sid of set) {
    ioInstance.to(sid).emit(event, payload);
  }
}

io.on("connection", (socket) => {
  // Register user
  socket.on("register_user", ({ username }) => {
    if (!username) return;
    socketToUser.set(socket.id, username);
    addUserSocket(username, socket.id);
  });

  // Join room
  socket.on("join_room", ({ room, username }) => {
    if (!room || !username) return;
    socket.join(room);
    socket.emit("system", { message: `Joined room: ${room}` });
    socket.to(room).emit("system", { message: `${username} joined ${room}` });
  });

  // Leave room
  socket.on("leave_room", ({ room, username }) => {
    if (!room || !username) return;
    socket.leave(room);
    socket.emit("system", { message: `Left room: ${room}` });
    socket.to(room).emit("system", { message: `${username} left ${room}` });
  });

  // Group message
  socket.on("group_message", async ({ from_user, room, message }) => {
    if (!from_user || !room || !message) return;

    try {
      const saved = await GroupMessage.create({
        from_user,
        room,
        message,
        date_sent: new Date()
      });

      io.to(room).emit("group_message", {
        _id: saved._id,
        from_user: saved.from_user,
        room: saved.room,
        message: saved.message,
        date_sent: saved.date_sent
      });
    } catch {
      socket.emit("system", { message: "Error saving group message." });
    }
  });

  // Private message
  socket.on("private_message", async ({ from_user, to_user, message }) => {
    if (!from_user || !to_user || !message) return;

    try {
      const saved = await PrivateMessage.create({
        from_user,
        to_user,
        message,
        date_sent: new Date()
      });

      const payload = {
        _id: saved._id,
        from_user: saved.from_user,
        to_user: saved.to_user,
        message: saved.message,
        date_sent: saved.date_sent
      };

      // sender sees (current socket)
      socket.emit("private_message", payload);

      // receiver sees it on ALL their open tabs/pages
      emitToUser(to_user, "private_message", payload, io);
    } catch {
      socket.emit("system", { message: "Error saving private message." });
    }
  });

  // Typing indicator (1-to-1)
  socket.on("typing_private", ({ from_user, to_user, isTyping }) => {
    if (!from_user || !to_user) return;

    emitToUser(to_user, "typing_private", {
      from_user,
      to_user,
      isTyping: !!isTyping
    }, io);
  });

  socket.on("disconnect", () => {
    const username = socketToUser.get(socket.id);
    if (username) removeUserSocket(username, socket.id);
    socketToUser.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
