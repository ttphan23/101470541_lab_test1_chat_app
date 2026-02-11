$(async function () {
  const userRaw = localStorage.getItem("user");
  if (!userRaw) return (window.location.href = "/login");

  const user = JSON.parse(userRaw);
  $("#welcome").text(`Hi, ${user.firstname} (${user.username})`);

  const socket = io();
  socket.emit("register_user", { username: user.username });
  window.socket = socket;
  window.me = user;

  const $privateBox = $("#privateBox");
  const $status = $("#status");

  let currentPeer = "";
  let typingTimer = null;
  let isTyping = false;

  function fmtTime(d) {
    return new Date(d).toLocaleString();
  }

  function setStatus(text) {
    $status.text(text || "");
  }

  function appendSystem(text) {
    $privateBox.append(`<div class="msg system">${text}</div>`);
    $privateBox.scrollTop($privateBox[0].scrollHeight);
  }

  function appendMsg(from, text, dateSent, extraMeta = "") {
    const meta = `${from} • ${fmtTime(dateSent)}${extraMeta ? " • " + extraMeta : ""}`;
    $privateBox.append(`
      <div class="msg">
        <div class="meta">${meta}</div>
        <div class="text">${$("<div>").text(text).html()}</div>
      </div>
    `);
    $privateBox.scrollTop($privateBox[0].scrollHeight);
  }

  async function loadUsers() {
    try {
      setStatus("Loading users...");
      const res = await fetch("/api/users");
      const json = await res.json();

      if (!json.ok) {
        setStatus("Failed to load users.");
        $("#privateUserSelect").html(`<option value="">(failed to load)</option>`);
        return;
      }

      const list = (json.users || []).filter(u => u.username !== user.username);

      const $sel = $("#privateUserSelect");
      $sel.empty();

      if (list.length === 0) {
        $sel.append(`<option value="">(no other users found)</option>`);
        setStatus("No other users found. Create another account to test private chat.");
        return;
      }

      $sel.append(`<option value="">(select user)</option>`);
      list.forEach(u => {
        $sel.append(`<option value="${u.username}">${u.username} (${u.firstname} ${u.lastname})</option>`);
      });

      setStatus("");
    } catch (err) {
      setStatus("Error calling /api/users (check server running).");
      $("#privateUserSelect").html(`<option value="">(error)</option>`);
    }
  }

  async function loadHistory(peer) {
    $privateBox.empty();
    appendSystem(`Loading history with ${peer}...`);

    const res = await fetch(
      `/api/private/messages?userA=${encodeURIComponent(user.username)}&userB=${encodeURIComponent(peer)}&limit=100`
    );
    const json = await res.json();

    $privateBox.empty();

    if (!json.ok) return appendSystem("Failed to load private history.");

    if ((json.messages || []).length === 0) {
      appendSystem("No messages yet. Say hi!");
      return;
    }

    json.messages.forEach(m => appendMsg(m.from_user, m.message, m.date_sent, `to: ${m.to_user}`));
  }

  // UI
  $privateBox.empty();
  appendSystem("Select a user to start chatting.");
  await loadUsers();

  $("#privateUserSelect").on("change", async function () {
    const peer = $(this).val();
    currentPeer = peer;

    $("#typingIndicator").text("");

    const enabled = !!peer;
    $("#privateInput, #sendPrivateBtn").prop("disabled", !enabled);

    if (!peer) {
      $privateBox.empty();
      appendSystem("Select a user to start chatting.");
      return;
    }

    await loadHistory(peer);
  });

  $("#sendPrivateBtn").on("click", function () {
    const msg = $("#privateInput").val().trim();
    if (!currentPeer || !msg) return;

    socket.emit("private_message", { from_user: user.username, to_user: currentPeer, message: msg });
    $("#privateInput").val("");

    // stop typing
    isTyping = false;
    socket.emit("typing_private", { from_user: user.username, to_user: currentPeer, isTyping: false });
    clearTimeout(typingTimer);
  });

  $("#privateInput").on("keypress", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("#sendPrivateBtn").click();
    }
  });

  $("#privateInput").on("input", function () {
    if (!currentPeer) return;

    if (!isTyping) {
      isTyping = true;
      socket.emit("typing_private", { from_user: user.username, to_user: currentPeer, isTyping: true });
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      isTyping = false;
      socket.emit("typing_private", { from_user: user.username, to_user: currentPeer, isTyping: false });
    }, 900);
  });

  socket.on("private_message", (m) => {
    const isThisChat =
      currentPeer &&
      (
        (m.from_user === user.username && m.to_user === currentPeer) ||
        (m.from_user === currentPeer && m.to_user === user.username)
      );

    if (!isThisChat) return;

    appendMsg(m.from_user, m.message, m.date_sent, `to: ${m.to_user}`);
  });

  socket.on("typing_private", ({ from_user, to_user, isTyping }) => {

  // Only if meant for me
  if (to_user !== user.username) return;

  // Only show if I'm currently chatting with user
  if (!currentPeer || from_user !== currentPeer) return;

  if (isTyping) {
    $("#typingIndicator").text(`${from_user} is typing...`);
  } else {
    $("#typingIndicator").text("");
  }
});

// Logout
$("#logoutBtn").off("click").on("click", function () {
  localStorage.removeItem("user");
  try { socket.disconnect(); } catch {}
  window.location.href = "/login";
});

});
