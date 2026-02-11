$(function () {
  const userRaw = localStorage.getItem("user");
  if (!userRaw) return (window.location.href = "/login");
  const user = JSON.parse(userRaw);

  $("#welcome").text(`Hi, ${user.firstname} (${user.username})`);

  const socket = io();

  socket.emit("register_user", { username: user.username });

  let currentRoom = null;

  const $chatBox = $("#chatBox");

  function fmtTime(d) {
    return new Date(d).toLocaleString();
  }

  function appendSystem(text) {
    $chatBox.append(`<div class="msg system">${text}</div>`);
    $chatBox.scrollTop($chatBox[0].scrollHeight);
  }

  function appendMsg(from, text, dateSent, extraMeta = "") {
    const meta = `${from} • ${fmtTime(dateSent)}${extraMeta ? " • " + extraMeta : ""}`;
    $chatBox.append(`
      <div class="msg">
        <div class="meta">${meta}</div>
        <div class="text">${$("<div>").text(text).html()}</div>
      </div>
    `);
    $chatBox.scrollTop($chatBox[0].scrollHeight);
  }

  $("#joinBtn").on("click", async function () {
    const room = $("#roomSelect").val();

    if (currentRoom) socket.emit("leave_room", { room: currentRoom, username: user.username });

    currentRoom = room;
    $("#currentRoom").text(room);
    $("#messageInput, #sendBtn, #leaveBtn").prop("disabled", false);

    $chatBox.empty();
    appendSystem(`Loading history for ${room}...`);

    const res = await fetch(`/api/rooms/${encodeURIComponent(room)}/messages?limit=100`);
    const json = await res.json();
    $chatBox.empty();

    if (json.ok) {
      json.messages.forEach(m => appendMsg(m.from_user, m.message, m.date_sent, `room: ${m.room}`));
    } else {
      appendSystem("Failed to load history.");
    }

    socket.emit("join_room", { room, username: user.username });
  });

  $("#leaveBtn").on("click", function () {
    if (!currentRoom) return;

    socket.emit("leave_room", { room: currentRoom, username: user.username });
    appendSystem(`You left room: ${currentRoom}`);

    currentRoom = null;
    $("#currentRoom").text("None");
    $("#messageInput, #sendBtn, #leaveBtn").prop("disabled", true);
  });

  $("#sendBtn").on("click", function () {
    const msg = $("#messageInput").val().trim();
    if (!msg || !currentRoom) return;

    socket.emit("group_message", { from_user: user.username, room: currentRoom, message: msg });
    $("#messageInput").val("");
  });

  $("#messageInput").on("keypress", function (e) {
    if (e.key === "Enter") $("#sendBtn").click();
  });

  socket.on("system", (payload) => appendSystem(payload.message));

  socket.on("group_message", (m) => {
    if (currentRoom && m.room === currentRoom) {
      appendMsg(m.from_user, m.message, m.date_sent, `room: ${m.room}`);
    }
  });

  $("#logoutBtn").on("click", function () {
    localStorage.removeItem("user");
    try { socket.disconnect(); } catch {}
    window.location.href = "/login";
  });
});
