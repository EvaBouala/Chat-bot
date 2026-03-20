const messagesArea = document.getElementById("messages-area");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const chipsRow = document.getElementById("chips-row");
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");
const headerStatus = document.getElementById("header-status");
const newConvBtn = document.getElementById("new-conv-btn");
const clearBtn = document.getElementById("clear-btn");
const convList = document.getElementById("conv-list");
const sidebarEl = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");


const LS_CONVS = "petal_conversations"; // tableau de toutes les conversations
const LS_ACTIVE = "petal_active_conv"; // id de la conversation courante
const LS_THEME = "petal_theme"; // thÃ¨me clair/sombre
const LS_MEMORY = "petal_global_memory"; // memoire globale cross-conversations
const LS_MEMORY_LEGACY = "petal_memory"; // ancienne cle eventuelle


let isBotTyping = false;
let activeId = null; // id de la conversation affichÃ©e




function loadConvs() {
  try {
    return JSON.parse(localStorage.getItem(LS_CONVS)) || [];
  } catch {
    return [];
  }
}


function saveConvs(convs) {
  localStorage.setItem(LS_CONVS, JSON.stringify(convs));
}


function loadGlobalMemory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_MEMORY));
    if (Array.isArray(parsed)) {
      return parsed;
    }

    const legacyParsed = JSON.parse(localStorage.getItem(LS_MEMORY_LEGACY));
    if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
      const migrated = legacyParsed.map((value) => ({
        value: String(value),
        ts: new Date().toISOString(),
      }));
      saveGlobalMemory(migrated);
      return migrated;
    }

    return [];
  } catch {
    return [];
  }
}


function saveGlobalMemory(facts) {
  localStorage.setItem(LS_MEMORY, JSON.stringify(facts));
}


function addGlobalFacts(facts) {
  if (!facts.length) return;

  const current = loadGlobalMemory();
  const normalized = new Set(current.map((f) => normalizeFact(f.value)));

  const additions = [];
  facts.forEach((fact) => {
    const cleaned = fact.trim();
    const key = normalizeFact(cleaned);
    if (!cleaned || normalized.has(key)) return;
    normalized.add(key);
    additions.push({
      value: cleaned,
      ts: new Date().toISOString(),
    });
  });

  const merged = [...current, ...additions].slice(-40);
  saveGlobalMemory(merged);
}

function normalizeFact(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


function extractFactsFromUserText(text) {
  const input = String(text || "").trim();
  if (!input) return [];

  const facts = [];
  const rules = [
    {
      regex: /je m(?:'| )appelle\s+([^,.!?\n]{2,60})/i,
      toFact: (m) => `Ton prenom est ${m[1].trim()}.`,
    },
    {
      regex: /mon nom est\s+([^,.!?\n]{2,60})/i,
      toFact: (m) => `Ton nom ou prenom est ${m[1].trim()}.`,
    },
    {
      regex: /appelle[- ]moi\s+([^,.!?\n]{2,60})/i,
      toFact: (m) => `Tu preferes etre appele(e) ${m[1].trim()}.`,
    },
    {
      regex: /(?:j(?:'|e )habite|je vis)\s+a\s+([^,.!?\n]{2,80})/i,
      toFact: (m) => `Tu habites a ${m[1].trim()}.`,
    },
    {
      regex: /j(?:'| )aime\s+([^,.!?\n]{2,100})/i,
      toFact: (m) => `Tu aimes ${m[1].trim()}.`,
    },
    {
      regex: /je suis\s+([^,.!?\n]{2,80})/i,
      toFact: (m) => `Tu as dit: "Je suis ${m[1].trim()}".`,
    },
    {
      regex: /je travaille (?:comme|en tant que)\s+([^,.!?\n]{2,80})/i,
      toFact: (m) => `Tu travailles comme ${m[1].trim()}.`,
    },
    {
      regex: /je prefere\s+([^,.!?\n]{2,100})/i,
      toFact: (m) => `Preference: ${m[1].trim()}.`,
    },
  ];

  rules.forEach(({ regex, toFact }) => {
    const match = input.match(regex);
    if (match) {
      facts.push(toFact(match));
    }
  });

  const lowered = input.toLowerCase();
  const startsLikeStatement = /^(je|j'|mon|ma|mes|nous|notre)\b/i.test(input);
  const isQuestion =
    input.includes("?") ||
    /^(qui|quoi|quand|comment|pourquoi|ou|est-ce que)\b/i.test(lowered);
  if (
    facts.length === 0 &&
    startsLikeStatement &&
    !isQuestion &&
    input.length >= 12
  ) {
    facts.push(`Tu as dit: "${input.slice(0, 180)}".`);
  }

  return facts;
}

function buildMemoryBlock() {
  const memory = loadGlobalMemory();
  const memoryFacts = memory.slice(-20).map((item) => item.value);

  const convContext = buildGlobalConversationContext();
  return [...memoryFacts, ...convContext].slice(-30);
}

function buildGlobalConversationContext() {
  const allConvs = loadConvs();
  if (!Array.isArray(allConvs) || allConvs.length === 0) {
    return [];
  }

  const previousConvs = allConvs.filter((conv) => conv.id !== activeId);

  const lines = [];
  previousConvs.slice(0, 3).forEach((conv) => {
    const title = conv?.title || "Conversation precedente";
    const msgs = Array.isArray(conv?.apiMessages)
      ? conv.apiMessages.slice(-4)
      : [];
    msgs.forEach((m) => {
      if (!m || typeof m.content !== "string") return;
      const role = m.role === "assistant" ? "Assistant" : "Utilisateur";
      lines.push(`${title} - ${role}: ${m.content.slice(0, 160)}`);
    });
  });

  return lines.slice(-10);
}


function getConv(id) {
  return loadConvs().find((c) => c.id === id) || null;
}


function upsertConv(conv) {
  const convs = loadConvs();
  const idx = convs.findIndex((c) => c.id === conv.id);
  if (idx >= 0) convs[idx] = conv;
  else convs.unshift(conv);
  saveConvs(convs);
}


function deleteConv(id) {
  saveConvs(loadConvs().filter((c) => c.id !== id));
}


const genId = () =>
  `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;


function fmtDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  if (d.toDateString() === y.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}


function formatTime(date) {
  return new Date(date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}


const escHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");



function renderText(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const bolded = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  return bolded.replace(/\n/g, "<br>");
}

function scrollToBottom() {
  messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: "smooth" });
}


function appendMessage(role, text, ts, animate = true) {
  const row = document.createElement("div");
  row.classList.add("msg-row", role);
  if (!animate) row.style.animation = "none";

  const avatar = document.createElement("div");
  avatar.classList.add("msg-avatar", role === "bot" ? "bot-av" : "user-av");
  avatar.textContent = role === "bot" ? "ðŸŒ¸" : "ðŸ‘¹";
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
  avatar.textContent = "ðŸŒ¸";

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
  headerStatus.textContent = "Petal Ã©critâ€¦";
  scrollToBottom();
}

function hideTyping() {
  const el = document.getElementById("typing-indicator");
  if (el) el.remove();
  headerStatus.textContent = "En ligne Â· prÃªt Ã  vous aider";
}



function renderWelcome() {
  messagesArea.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "welcome-wrap";
  wrap.id = "welcome-screen";
  wrap.innerHTML = `
    <div class="welcome-icon" aria-hidden="true">ðŸŒ¸</div>
    <div class="welcome-title">Bonjour, je suis Petal</div>
    <p class="welcome-sub">Je suis connectÃ©e Ã  OpenRouter. Ã‰cris un message pour dÃ©marrer une vraie conversation.</p>
  `;
  messagesArea.appendChild(wrap);
}

function dismissWelcome() {
  const el = document.getElementById("welcome-screen");
  if (el) {
    el.style.transition = "opacity 0.2s, transform 0.2s";
    el.style.opacity = "0";
    el.style.transform = "scale(0.95)";
    setTimeout(() => el.remove(), 220);
  }
  const cr = document.getElementById("chips-row");
  if (cr) {
    cr.style.transition = "opacity 0.2s";
    cr.style.opacity = "0";
    setTimeout(() => cr.remove(), 220);
  }
}


function restoreChips() {
  if (document.getElementById("chips-row")) return;
  const chips = document.createElement("div");
  chips.className = "chips-row";
  chips.id = "chips-row";
  chips.setAttribute("aria-label", "Suggestions rapides");
  chips.innerHTML = `
    <button class="chip" data-text="Bonjour Petal ! ðŸŒ¸">Dire bonjour</button>
    <button class="chip" data-text="Quelles sont tes capacitÃ©s ?">Tes capacitÃ©s</button>
    <button class="chip" data-text="Raconte-moi une blague ðŸ˜„">Une blague</button>
    <button class="chip" data-text="Donne-moi un conseil de bien-Ãªtre ðŸŒ¿">Bien-Ãªtre</button>
  `;
  document.querySelector(".input-area").prepend(chips);
  bindChips(chips);
}

function bindChips(container) {
  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      chatInput.value = chip.dataset.text || "";
      sendBtn.disabled = false;
      sendMessage();
    });
  });
}




function newConversation() {
  if (isBotTyping) return;

  activeId = genId();
  localStorage.setItem(LS_ACTIVE, activeId);
  upsertConv({
    id: activeId,
    title: "Nouvelle conversation",
    updatedAt: new Date().toISOString(),
    uiMessages: [], // pour l'affichage (role, text, ts)
    apiMessages: [], // pour l'API (role, content)
  });

  messagesArea.innerHTML = "";
  renderWelcome();
  restoreChips();
  renderSidebar();
  closeSidebarMobile();
  chatInput.focus();
}


function loadConversation(id) {
  if (isBotTyping) return;

  activeId = id;
  localStorage.setItem(LS_ACTIVE, id);

  const conv = getConv(id);
  if (!conv) {
    newConversation();
    return;
  }

  messagesArea.innerHTML = "";

  if (conv.uiMessages.length === 0) {
    renderWelcome();
    restoreChips();
  } else {
    const cr = document.getElementById("chips-row");
    if (cr) cr.remove();
    conv.uiMessages.forEach((m) => appendMessage(m.role, m.text, m.ts, false));
  }

  renderSidebar();
  closeSidebarMobile();
  chatInput.focus();
}


function removeConversation(id) {
  deleteConv(id);
  if (id === activeId) newConversation();
  else renderSidebar();
}


function persistMessage(role, text, ts, apiContent) {
  const conv = getConv(activeId) || {
    id: activeId,
    title: "Nouvelle conversation",
    uiMessages: [],
    apiMessages: [],
  };

  if (
    role === "user" &&
    conv.uiMessages.filter((m) => m.role === "user").length === 0
  ) {
    conv.title = text.length > 42 ? text.slice(0, 40) + "â€¦" : text;
  }

  conv.uiMessages.push({ role, text, ts });
  conv.apiMessages.push({
    role: role === "bot" ? "assistant" : "user",
    content: apiContent || text,
  });
  conv.updatedAt = new Date().toISOString();

  upsertConv(conv);
  renderSidebar(); // met Ã  jour le titre et la date dans la sidebar
}



function renderSidebar() {
  const convs = loadConvs();
  convList.innerHTML = "";

  if (convs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "conv-empty";
    empty.textContent = "Aucune conversation pour l'instant ðŸŒ¸";
    convList.appendChild(empty);
    return;
  }

  convs.forEach((conv) => {
    const item = document.createElement("div");
    item.className = `conv-item${conv.id === activeId ? " active" : ""}`;
    item.innerHTML = `
      <span class="conv-icon">ðŸŒ¸</span>
      <div class="conv-info">
        <div class="conv-title">${escHtml(conv.title)}</div>
        <div class="conv-date">${conv.updatedAt ? fmtDate(conv.updatedAt) : ""}</div>
      </div>
      <button class="conv-del" title="Supprimer" data-id="${conv.id}">âœ•</button>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("conv-del")) return;
      loadConversation(conv.id);
    });

    item.querySelector(".conv-del").addEventListener("click", (e) => {
      e.stopPropagation();
      removeConversation(conv.id);
    });

    convList.appendChild(item);
  });
}



function closeSidebarMobile() {
  if (window.innerWidth <= 640) sidebarEl.classList.remove("open");
}

sidebarToggle.addEventListener("click", () => {
  sidebarEl.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (
    window.innerWidth <= 640 &&
    sidebarEl.classList.contains("open") &&
    !sidebarEl.contains(e.target) &&
    e.target !== sidebarToggle
  ) {
    sidebarEl.classList.remove("open");
  }
});



async function askBackend(message) {
  const conv = getConv(activeId);
  const history = conv?.apiMessages?.length
    ? conv.apiMessages.slice(0, -1)
    : [];
  const memoryFacts = buildMemoryBlock();

  const response = await fetch("http://localhost:3001/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, memoryFacts }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Erreur backend");
  return data;
}



async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isBotTyping) return;

  dismissWelcome();

  const userTs = new Date().toISOString();
  persistMessage("user", text, userTs); // sauvegarde + mÃ j sidebar
  addGlobalFacts(extractFactsFromUserText(text));
  appendMessage("user", text, userTs);

  chatInput.value = "";
  chatInput.style.height = "auto";
  sendBtn.disabled = true;
  isBotTyping = true;
  showTyping();

  try {
    const data = await askBackend(text);
    const reply = data?.reply || "Pas de rÃ©ponse du modÃ¨le.";

    const botTs = new Date().toISOString();
    persistMessage("bot", reply, botTs); // sauvegarde la rÃ©ponse
    appendMessage("bot", reply, botTs);
  } catch (error) {
    const msg = error?.message || "Erreur rÃ©seau";
    const botTs = new Date().toISOString();
    appendMessage("bot", `âš ï¸ Erreur : ${msg}`, botTs);
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

bindChips(document.querySelector(".chips-row"));

newConvBtn.addEventListener("click", newConversation);
clearBtn.addEventListener("click", newConversation);

themeToggle.addEventListener("click", () => {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";
  html.setAttribute("data-theme", newTheme);
  themeIcon.textContent = isDark ? "ðŸŒ™" : "â˜€ï¸";
  localStorage.setItem(LS_THEME, newTheme);
});


(function init() {
  const savedTheme = localStorage.getItem(LS_THEME);
  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
    themeIcon.textContent = savedTheme === "dark" ? "â˜€ï¸" : "ðŸŒ™";
  }

  const savedId = localStorage.getItem(LS_ACTIVE);
  const conv = savedId ? getConv(savedId) : null;

  if (conv && conv.uiMessages && conv.uiMessages.length > 0) {
    activeId = savedId;
    const cr = document.getElementById("chips-row");
    if (cr) cr.remove();
    conv.uiMessages.forEach((m) => appendMessage(m.role, m.text, m.ts, false));
    renderSidebar();
  } else {
    newConversation();
  }

  chatInput.focus();
})();

