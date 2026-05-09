const statusEl = document.getElementById("status");
const addressEl = document.getElementById("address");
const alertEl = document.getElementById("alert");
const initBtn = document.getElementById("initBtn");
const rotateBtn = document.getElementById("rotateBtn");

let refreshInFlight = false;

function setText(el, value) {
  el.textContent = value;
}

function showAlert(message) {
  setText(alertEl, message || "");
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok) {
    throw new Error(body.error || res.statusText);
  }
  return body;
}

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  showAlert("");
  setText(statusEl, "checking");
  try {
    const state = await api("/api/state");
    const status = state.status || "unknown";
    setText(statusEl, status.replace(/_/g, " "));
    if (status !== "ready") {
      setText(addressEl, "-");
    } else {
      setText(addressEl, state.address || "-");
    }
  } catch (err) {
    setText(statusEl, "offline");
    showAlert(err.message);
  } finally {
    refreshInFlight = false;
  }
}

initBtn.addEventListener("click", async () => {
  initBtn.disabled = true;
  showAlert("");
  try {
    const result = await api("/api/init", { method: "POST" });
    showAlert(`Init: ${result.result || "ok"}`);
    await refresh();
  } catch (err) {
    showAlert(err.message);
  } finally {
    initBtn.disabled = false;
  }
});

rotateBtn.addEventListener("click", async () => {
  rotateBtn.disabled = true;
  showAlert("");
  try {
    const result = await api("/api/rotate", { method: "POST" });
    showAlert(`Rotate: ${result.result || "ok"}`);
    await refresh();
  } catch (err) {
    showAlert(err.message);
  } finally {
    rotateBtn.disabled = false;
  }
});

refresh();
