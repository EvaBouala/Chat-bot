const messagesArea = document.getElementById("messages-area");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const chipsRow = document.getElementById("chips-row");
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const headerStatus = document.getElementById("header-status");

const uiHistory = [];
const apiHistory = [];

let isBotTyping = false;

function formatTime(date) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scrollToBottom() {
  messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: "smooth" });
}

function renderText(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const bolded = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  return bolded.replace(/\n/g, "<br>");
}

function appendMessage(role, text, ts) {
  const row = document.createElement("div");
  row.classList.add("msg-row", role);

  const avatar = document.createElement("div");
  avatar.classList.add("msg-avatar", role === "bot" ? "bot-av" : "user-av");
  avatar.textContent = role === "bot" ? "🌸" : "👹";
  avatar.setAttribute("aria-hidden", "true");

  const group = document.createElement("div");
  group.classList.add("bubble-group");

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");
  bubble.innerHTML = renderText(text);

  const timeEl = document.createElement("div");
  timeEl.classList.add("msg-time");
  timeEl.textContent = formatTime(ts);

  group.appendChild(bubble);
  group.appendChild(timeEl);
  row.appendChild(avatar);
  row.appendChild(group);
  messagesArea.appendChild(row);
  scrollToBottom();
}

function showTyping() {
  const row = document.createElement("div");
  row.classList.add("typing-row");
  row.id = "typing-indicator";

  const avatar = document.createElement("div");
  avatar.classList.add("msg-avatar", "bot-av");
  avatar.textContent = "🌸";

  const bubble = document.createElement("div");
  bubble.classList.add("typing-bubble");
  bubble.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesArea.appendChild(row);
  headerStatus.textContent = "Petal ecrit...";
  scrollToBottom();
}

function hideTyping() {
  const el = document.getElementById("typing-indicator");
  if (el) {
    el.remove();
  }
  headerStatus.textContent = "En ligne · pret a vous aider";
}

function renderWelcome() {
  messagesArea.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "welcome-wrap";
  wrap.id = "welcome-screen";
  wrap.innerHTML = `
    <div class="welcome-icon" aria-hidden="true">🌸</div>
    <div class="welcome-title">Bonjour, je suis Petal</div>
    <p class="welcome-sub">Je suis connecte a OpenRouter. Ecris un message pour demarrer une vraie conversation.</p>
  `;
  messagesArea.appendChild(wrap);
}

function dismissWelcome() {
  const el = document.getElementById("welcome-screen");
  if (el) {
    el.remove();
  }
  if (chipsRow) {
    chipsRow.style.transition = "opacity 0.2s";
    chipsRow.style.opacity = "0";
    setTimeout(() => chipsRow.remove(), 220);
  }
}

async function askBackend(message) {
  const response = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      history: apiHistory,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Erreur backend");
  }

  return data;
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isBotTyping) {
    return;
  }

  dismissWelcome();

  const userTs = new Date();
  uiHistory.push({ role: "user", text, ts: userTs });
  apiHistory.push({ role: "user", content: text });
  appendMessage("user", text, userTs);

  chatInput.value = "";
  chatInput.style.height = "auto";
  sendBtn.disabled = true;
  isBotTyping = true;
  showTyping();

  try {
    const data = await askBackend(text);
    const reply = data?.reply || "Pas de reponse du modele.";

    const botTs = new Date();
    uiHistory.push({ role: "bot", text: reply, ts: botTs });
    apiHistory.push({ role: "assistant", content: reply });
    appendMessage("bot", reply, botTs);
  } catch (error) {
    const messageErreur = error?.message || "Erreur reseau";
    const botTs = new Date();
    appendMessage("bot", `Erreur: ${messageErreur}`, botTs);
  } finally {
    hideTyping();
    isBotTyping = false;
    chatInput.focus();
  }
}

chatInput.addEventListener("input", () => {
  sendBtn.disabled = chatInput.value.trim().length === 0;
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 130) + "px";
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    chatInput.value = chip.dataset.text || "";
    sendBtn.disabled = false;
    sendMessage();
  });
});

themeToggle.addEventListener("click", () => {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";

  html.setAttribute("data-theme", newTheme);
  themeIcon.textContent = isDark ? "🌙" : "☀️";
});

(function init() {
  renderWelcome();
  chatInput.focus();
})();
