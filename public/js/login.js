$(function () {
  const $alert = $("#alert");

  function showAlert(type, text) {
    $alert.removeClass("d-none alert-success alert-danger");
    $alert.addClass(type === "success" ? "alert-success" : "alert-danger");
    $alert.text(text);
  }

  $("#loginForm").on("submit", async function (e) {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(this).entries());

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const json = await res.json();

      if (!json.ok) return showAlert("error", json.message || "Login failed.");

      localStorage.setItem("user", JSON.stringify(json.user));
      window.location.href = "/chat";
    } catch (err) {
      showAlert("error", "Network error.");
    }
  });
});
