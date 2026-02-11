$(async function () {
  // Session guard
  const userRaw = localStorage.getItem("user");
  if (!userRaw) return (window.location.href = "/login");
  const user = JSON.parse(userRaw);

  $("#welcome").text(`Hi, ${user.firstname} (${user.username})`);

  const socket = io();

  // Register socket private chat targeting
  socket.emit("register_user", { username: user.username });

  // UI
  let currentRoom = null;
  let typingTimer = null;
  let isTyping = false;
  let currentPrivatePeer = "";

  const $chatBox = $("#chatBox");
  const $privateBox = $("#privateBox");

  function fmtTime(d) {
    const dt = new Date(d);
    return dt.toLocaleString();
  }

  function appendSystem($box, text) {
    $box.append(`<div class="msg system">${text}</div>`);
    $box.scrollTop($box[0].scrollHeight);
  }

  function appendMsg($box, from, text, dateSent, extraMeta = "") {
    const meta = `${from} • ${fmtTime(dateSent)}${extraMeta ? " • " + extraMeta : ""}`;
    $box.append(`
      <div class="msg">
        <div class="meta">${meta}</div>
        <div class="text">${$("<div>").text(text).html()}</div>
      </div>
    `);
    $box.scrollTop($box[0].scrollHeight);
  }

  // Load users private dropdown
  async function loadUsers() {
    const res = await fetch("/api/users");
    const json = await res.json();
    if (!json.ok) return;

    const $sel = $("#privateUserSelect");
    $sel.empty().append(`<option value="">(select user)</option>`);

    json.users
      .filter(u => u.username !== user.username)
      .forEach(u => {
        $sel.append(`<option value="${u.username}">${u.username} (${u.firstname} ${u.lastname})</option>`);
      });
  }
  await loadUsers();

  // Rooms join/leave
  $("#joinBtn").on("click", async function () {
    const room = $("#roomSelect").val();

    // If already in room, leave first
    if (currentRoom) {
      socket.emit("leave_room", { room: currentRoom, username: user.username });
    }

    currentRoom = room;
    $("#currentRoom").text(room);
    $("#messageInput, #sendBtn, #leaveBtn").prop("disabled", false);

    $chatBox.empty();
    appendSystem($chatBox, `Loading history for ${room}...`);

    // Load history
    const res = await fetch(`/api/rooms/${encodeURIComponent(room)}/messages?limit=100`);
    const json = await res.json();
    $chatBox.empty();

    if (json.ok) {
      json.messages.forEach(m => appendMsg($chatBox, m.from_user, m.message, m.date_sent, `room: ${m.room}`));
    } else {
      appendSystem($chatBox, "Failed to load history.");
    }

    socket.emit("join_room", { room, username: user.username });
  });

  $("#leaveBtn").on("click", function () {
    if (!currentRoom) return;

    socket.emit("leave_room", { room: currentRoom, username: user.username });
    appendSystem($chatBox, `You left room: ${currentRoom}`);

    currentRoom = null;
    $("#currentRoom").text("None");
    $("#messageInput, #sendBtn, #leaveBtn").prop("disabled", true);
  });

  // Send group message
  $("#sendBtn").on("click", function () {
    const msg = $("#messageInput").val().trim();
    if (!msg || !currentRoom) return;

    socket.emit("group_message", { from_user: user.username, room: currentRoom, message: msg });
    $("#messageInput").val("");
  });

  $("#messageInput").on("keypress", function (e) {
    if (e.key === "Enter") $("#sendBtn").click();
  });

  // Private peer select + load history
  $("#privateUserSelect").on("change", async function () {
    const peer = $(this).val();
    currentPrivatePeer = peer;
    $("#typingIndicator").text("");

    const enabled = !!peer;
    $("#privateInput, #sendPrivateBtn").prop("disabled", !enabled);

    $privateBox.empty();
    if (!peer) return;

    appendSystem($privateBox, `Loading private history with ${peer}...`);
    const res = await fetch(`/api/private/messages?userA=${encodeURIComponent(user.username)}&userB=${encodeURIComponent(peer)}&limit=100`);
    const json = await res.json();
    $privateBox.empty();

    if (json.ok) {
      json.messages.forEach(m => {
        const meta = `to: ${m.to_user}`;
        appendMsg($privateBox, m.from_user, m.message, m.date_sent, meta);
      });
    } else {
      appendSystem($privateBox, "Failed to load private history.");
    }
  });

  // Send private message
  $("#sendPrivateBtn").on("click", function () {
    const peer = currentPrivatePeer;
    const msg = $("#privateInput").val().trim();
    if (!peer || !msg) return;

    socket.emit("private_message", { from_user: user.username, to_user: peer, message: msg });
    $("#privateInput").val("");

    // stop typing indicator
    isTyping = false;
    socket.emit("typing_private", { from_user: user.username, to_user: peer, isTyping: false });
    clearTimeout(typingTimer);
  });

  // Typing indicator (private)
  $("#privateInput").on("input", function () {
    const peer = currentPrivatePeer;
    if (!peer) return;

    if (!isTyping) {
      isTyping = true;
      socket.emit("typing_private", { from_user: user.username, to_user: peer, isTyping: true });
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isTyping = false;
      socket.emit("typing_private", { from_user: user.username, to_user: peer, isTyping: false });
    }, 900);
  });

  // Receive system / messages
  socket.on("system", (payload) => {
    appendSystem($chatBox, payload.message);
  });

  socket.on("group_message", (m) => {
    // only show if in that room
    if (currentRoom && m.room === currentRoom) {
      appendMsg($chatBox, m.from_user, m.message, m.date_sent, `room: ${m.room}`);
    }
  });

  socket.on("private_message", (m) => {
    // show in private box - mark if not current peer
    const peer = currentPrivatePeer;
    const isRelevant =
      (m.from_user === user.username && m.to_user === peer) ||
      (m.from_user === peer && m.to_user === user.username);

    const extra = `to: ${m.to_user}${isRelevant ? "" : " • (other chat)"}`;
    appendMsg($privateBox, m.from_user, m.message, m.date_sent, extra);
  });

  socket.on("typing_private", ({ from_user, to_user, isTyping }) => {
    // Only show if it’s about the currently selected peer
    if (to_user !== user.username) return;
    if (from_user !== currentPrivatePeer) return;

    $("#typingIndicator").text(isTyping ? `${from_user} is typing...` : "");
  });

  // Logout
  $("#logoutBtn").on("click", function () {
    localStorage.removeItem("user");
    try { socket.disconnect(); } catch {}
    window.location.href = "/login";
  });
});
