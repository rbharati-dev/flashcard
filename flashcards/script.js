/* =========================
   Helpers & Storage
========================= */
function getSets() {
  return JSON.parse(localStorage.getItem("flashcardSets") || "[]");
}
function saveSets(sets) {
  localStorage.setItem("flashcardSets", JSON.stringify(sets));
}

/* =========================
   Theme Toggle
========================= */
function applyTheme(theme) {
  const root = document.documentElement;
  const isDark = theme === 'dark';
  document.body?.classList.toggle('theme-dark', isDark);
  document.body?.classList.toggle('theme-light', !isDark);
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
  let toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  toggle.textContent = (saved === 'dark') ? 'Light Mode' : 'Dark Mode';
  toggle.addEventListener('click', () => {
    const current = localStorage.getItem('theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
    toggle.textContent = (next === 'dark') ? 'Light Mode' : 'Dark Mode';
  });
}

/* =========================
   Home (index.html)
========================= */
function renderSets() {
  const container = document.getElementById("setsContainer");
  if (!container) return;

  let sets = getSets();
  if (sets.length === 0) {
    container.innerHTML = "<p>No sets yet. Click 'Make New Set' to add one!</p>";
    return;
  }

  // sort by lastOpened descending (fallback: keep older ones last)
  sets = sets.map((s, i) => ({...s, __i: i}))
             .sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));

  container.innerHTML = "";
  sets.forEach(({__i, name}) => {
    const item = document.createElement("div");
    item.className = "set";
    item.onclick = () => openSet(__i);

    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div>${name}</div>`;

    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn warn";
    editBtn.textContent = "Edit";
    editBtn.onclick = (e) => {
      e.stopPropagation();
      localStorage.setItem("editSetIndex", __i);
      window.location.href = "create.html";
    };

    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.textContent = "Delete";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm("Delete this set?")) {
        const s = getSets();
        s.splice(__i, 1);
        saveSets(s);
        renderSets();
      }
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);
    item.appendChild(row);
    container.appendChild(item);
  });
}


/* =========================
   Create/Edit (create.html)
========================= */
function addTerm(q = "", a = "") {
  const container = document.getElementById("termsContainer");
  if (!container) return;
  const div = document.createElement("div");
  div.className = "term";
  div.innerHTML = `
    <input class="q" type="text" placeholder="Question" value="${q.replace(/"/g,'&quot;')}" />
    <textarea class="a" placeholder="Answer (text or paste an image)">${a}</textarea>
    <button type="button" class="deleteBtn" onclick="this.parentElement.remove()">Delete</button>
  `;
  const ta = div.querySelector('.a');
  ta.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            ta.value = `![pasted-image](${reader.result})`;
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    }
  });
  container.appendChild(div);
}

function saveSet() {
  const name = (document.getElementById("setName")?.value || "").trim();
  if (!name) { alert("Please enter a set name."); return; }

  const terms = [];
  document.querySelectorAll(".term").forEach(t => {
    const q = (t.querySelector(".q")?.value || "").trim();
    const a = (t.querySelector(".a")?.value || "").trim();
    if (q && a) terms.push({ question: q, answer: a });
  });
  if (terms.length === 0) { alert("Please add at least one term."); return; }

  const sets = getSets();
  const editIndex = localStorage.getItem("editSetIndex");
  if (editIndex !== null && editIndex !== undefined) {
    sets[Number(editIndex)] = { name, terms };
    localStorage.removeItem("editSetIndex");
  } else {
    sets.push({ name, terms });
  }
  saveSets(sets);
  window.location.href = "index.html";
}

function loadForEdit() {
  const idx = localStorage.getItem("editSetIndex");
  if (idx === null) return;
  const sets = getSets();
  const set = sets[Number(idx)];
  if (!set) return;

  const pageTitle = document.getElementById("pageTitle");
  if (pageTitle) pageTitle.textContent = "Edit Set";
  const setName = document.getElementById("setName");
  if (setName) setName.value = set.name;

  const container = document.getElementById("termsContainer");
  if (container) container.innerHTML = "";
  set.terms.forEach(t => addTerm(t.question, t.answer));
}

// Lightweight CSV parser that handles commas and quotes
function parseCSV(text) {
  const rows = [];
  let cur = [];
  let val = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i+1] === '"') { val += '"'; i++; }
        else { inQuotes = false; }
      } else {
        val += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cur.push(val.trim()); val = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (val !== '' || cur.length) { cur.push(val.trim()); rows.push(cur); cur = []; val = ''; }
      } else { val += ch; }
    }
  }
  if (val !== '' || cur.length) { cur.push(val.trim()); rows.push(cur); }
  return rows;
}

/* =========================
   Study (study.html) with Adaptive Shuffle
========================= */
/*
  Adaptive shuffle (simple Leitner-like):
  - Each card has a weight (starts at 1).
  - If you mark WRONG: weight += 2  (prioritize heavily)
  - If you mark CORRECT: weight = Math.max(1, weight - 1) (deprioritize)
  - Next card is chosen by weighted random pick.
*/
function editSet() {
  const i = localStorage.getItem("currentSet");
  localStorage.setItem("editSetIndex", i);
  window.location.href = "create.html";
}

function startStudy() {
  const sets = getSets();
  const index = localStorage.getItem("currentSet");
  const i = index !== null ? Number(index) : null;
  if (i === null || !sets[i]) {
    document.body.innerHTML = "<p>No set selected. Go back to <a href='index.html'>home</a>.</p>";
    return;
  }
  const set = sets[i];
  const titleEl = document.getElementById("setTitle");
  if (titleEl) titleEl.textContent = set.name;

  const card = document.getElementById("flashcard");
  const btnCorrect = document.getElementById("btnCorrect");
  const btnWrong = document.getElementById("btnWrong");
  const btnSkip = document.getElementById("btnSkip");

  if (!card) return;

  // Build weights map
  const weights = set.terms.map(() => 1);

  // Weighted random helper
  function pickIndex() {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let k = 0; k < weights.length; k++) {
      if ((r -= weights[k]) <= 0) return k;
    }
    return weights.length - 1;
  }

  // Render full list below
  const list = document.getElementById("termsList");
  if (list) {
    list.innerHTML = "";
    set.terms.forEach((t) => {
      const li = document.createElement("li");
      li.innerHTML = `<div class="q">Q: ${t.question}</div><div class="a">A: ${t.answer}</div>`;
      list.appendChild(li);
    });
  }

  // State
  let current = pickIndex();
  let showingQuestion = true;

  function setCardContent(el, content) {
    // Render markdown-style image tag ![alt](dataurl or http)
    const imgMatch = content && content.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    el.innerHTML = "";
    if (imgMatch) {
      const img = document.createElement('img');
      img.src = imgMatch[1];
      img.alt = 'answer image';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      el.appendChild(img);
    } else {
      el.textContent = content;
    }
  }

  function showQuestion(idx) {
    showingQuestion = true;
    setCardContent(card, set.terms[idx].question);
  }
  function showAnswer(idx) {
    showingQuestion = false;
    setCardContent(card, set.terms[idx].answer);
  }

  // Flip card
  card.onclick = () => {
    if (showingQuestion) showAnswer(current);
    else showQuestion(current);
  };

  function nextCard() {
    current = pickIndex();
    showQuestion(current);
  }

  // Feedback
  btnCorrect?.addEventListener("click", () => {
    // lower priority
    weights[current] = Math.max(1, weights[current] - 1);
    nextCard();
  });
  btnWrong?.addEventListener("click", () => {
    // raise priority strongly
    weights[current] += 2;
    nextCard();
  });
  btnSkip?.addEventListener("click", nextCard);

  // Start
  showQuestion(current);
}

/* =========================
   Test Mode
========================= */
function startTest() {
  const sets = getSets();
  const index = localStorage.getItem("currentSet");
  if (index === null || !sets[index]) {
    document.body.innerHTML = "<p>No set selected. Go back to home.</p>";
    return;
  }

  const set = sets[index];
  document.getElementById("setTitle").textContent = set.name;

  const card = document.getElementById("testCard");
  const btnCorrect = document.getElementById("btnCorrect");
  const btnWrong = document.getElementById("btnWrong");

  let current = 0;
  let showingQ = true;
  let correct = 0;
  let wrong = 0;
  const order = [...set.terms.keys()].sort(() => Math.random() - 0.5);

  // Timer
  let time = 0;
  const timerEl = document.getElementById("timer");
  const interval = setInterval(() => {
    time++;
    timerEl.textContent = `Time: ${time}s`;
  }, 1000);

  function showCard() {
    showingQ = true;
    setCardContent(card, set.terms[order[current]].question);
  }
  card.addEventListener("click", () => {
    const c = showingQ
      ? set.terms[order[current]].answer
      : set.terms[order[current]].question;
    setCardContent(card, c);
    showingQ = !showingQ;
  });

  function nextCard() {
    current++;
    if (current < order.length) {
      showCard();
    } else {
      clearInterval(interval);
      const percent = Math.round((correct / order.length) * 100);
      localStorage.setItem(
        "testResults",
        JSON.stringify({ correct, wrong, total: order.length, percent, time })
      );
      window.location.href = "results.html";
    }
  }

  btnCorrect.addEventListener("click", () => {
    correct++;
    nextCard();
  });
  btnWrong.addEventListener("click", () => {
    wrong++;
    nextCard();
  });

  showCard();
}

function openSet(i) {
  const sets = getSets();
  if (!sets[i]) return;
  sets[i].lastOpened = Date.now();   // record timestamp
  saveSets(sets);
  localStorage.setItem("currentSet", i);
  window.location.href = "study.html";
}
