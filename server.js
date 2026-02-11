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

// Socketio state
const userToSocket = new Map(); // username -> socket.id
const socketToUser = new Map(); // socket.id -> username

io.on("connection", (socket) => {
  // register user for private messaging
  socket.on("register_user", ({ username }) => {
    if (!username) return;
    userToSocket.set(username, socket.id);
    socketToUser.set(socket.id, username);
  });

  // Join room
  socket.on("join_room", async ({ room, username }) => {
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

  // group message
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
    } catch (err) {
      socket.emit("system", { message: "Error saving group message." });
    }
  });

  //private message
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

      // send to sender + receiver if online
      socket.emit("private_message", payload);

      const toSocketId = userToSocket.get(to_user);
      if (toSocketId) {
        io.to(toSocketId).emit("private_message", payload);
      }
    } catch (err) {
      socket.emit("system", { message: "Error saving private message." });
    }
  });

  // Typing indicator 1-to-1
  socket.on("typing_private", ({ from_user, to_user, isTyping }) => {
    if (!from_user || !to_user) return;
    const toSocketId = userToSocket.get(to_user);
    if (!toSocketId) return;

    io.to(toSocketId).emit("typing_private", { from_user, to_user, isTyping: !!isTyping });
  });

  socket.on("disconnect", () => {
    const username = socketToUser.get(socket.id);
    if (username) userToSocket.delete(username);
    socketToUser.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
