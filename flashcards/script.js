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
   Home (index.html)
========================= */
function renderSets() {
  const container = document.getElementById("setsContainer");
  if (!container) return;

  const sets = getSets();
  if (sets.length === 0) {
    container.innerHTML = "<p>No sets yet. Click 'Make New Set' to add one!</p>";
    return;
  }

  container.innerHTML = "";
  sets.forEach((set, i) => {
    const item = document.createElement("div");
    item.className = "set";
    item.onclick = () => {
      localStorage.setItem("currentSet", i);
      window.location.href = "study.html";
    };
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div>${set.name}</div>`;
    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn warn";
    editBtn.textContent = "Edit";
    editBtn.onclick = (e) => {
      e.stopPropagation();
      localStorage.setItem("editSetIndex", i);
      window.location.href = "create.html";
    };

    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.textContent = "Delete";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm("Delete this set?")) {
        const s = getSets();
        s.splice(i, 1);
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
    <textarea class="a" placeholder="Answer">${a}</textarea>
    <button type="button" class="deleteBtn" onclick="this.parentElement.remove()">Delete</button>
  `;
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

  function showQuestion(idx) {
    showingQuestion = true;
    card.textContent = set.terms[idx].question;
  }
  function showAnswer(idx) {
    showingQuestion = false;
    card.textContent = set.terms[idx].answer;
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
