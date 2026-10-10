(() => {
  "use strict";
  const KEY = "myday-organizer-v1";
  const $ = (s, root = document) => root.querySelector(s);   const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  
  const dateObj = s => s ? new Date(`${s}T12:00:00`) : null;
  
  const fmt = (s, opts = { day: "2-digit", month: "short", year: "numeric" }) => {
    const d = dateObj(s);
    return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("de-DE", opts).format(d) : "Kein Datum";
  };
  
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  
  const blank = () => ({ tasks: [], events: [], ideas: [] });
  
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || "null");
      return d ? {
        tasks: Array.isArray(d.tasks) ? d.tasks : [],
        events: Array.isArray(d.events) ? d.events : [],
        ideas: Array.isArray(d.ideas) ? d.ideas : []
      } : blank();
    } catch (e) {
      return blank();
    }
  }

  let data = load();
  let page = "dashboard";
  let filter = "all";
  let cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selected = todayISO();
  let edit = null;
  let focusBack = null;

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      toast("Speichern nicht möglich. Bitte Browser-Speicher prüfen.", "error");
      return false;
    }
  }

  function toast(msg, type = "") {
    const n = document.createElement("div");
    n.className = `toast ${type}`;
    n.textContent = msg;
    $("#toasts").append(n);
    setTimeout(() => n.remove(), 3200);
  }

  function empty(title, msg) {
    return `<div class="empty"><b>${esc(title)}</b>${esc(msg)}</div>`;
  }

  function priority(p) {
    p = ["high", "medium", "low"].includes(p) ? p : "medium";
    const labels = { high: "Hoch", medium: "Mittel", low: "Niedrig" };
    return `<span class="pill ${p}">${labels[p]}</span>`;
  }

  function due(t) {
    return `${t.subject ? esc(t.subject) + " · " : ""}${t.due ? "Fällig: " + fmt(t.due, { day: "2-digit", month: "short" }) : "Ohne Fälligkeitsdatum"}`;
  }

  function soon(days = 7) {
    const a = dateObj(todayISO());
    const b = new Date(a);
    b.setDate(b.getDate() + days);
    return data.events.filter(e => {
      const ed = dateObj(e.date);
      return ed && ed >= a && ed <= b;
    }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  }

  function sortedTasks(list) {
    return [...list].sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0));
  }

  function render() {
    renderHeader();
    renderStats();
    renderDash();
    renderTasks();
    renderSchool();
    renderCalendar();
    renderIdeas();
  }

  function renderHeader() {
    const h = new Date().getHours();
    $("#greeting").textContent = h < 11 ? "Guten Morgen." : h < 18 ? "Hallo, schön dass du da bist." : "Guten Abend.";
    $("#today").textContent = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  }

  function renderStats() {
    const open = data.tasks.filter(t => !t.done);
    const done = data.tasks.filter(t => t.done);
    const pct = data.tasks.length ? Math.round((done.length / data.tasks.length) * 100) : 0;
    
    $("#stat-open").textContent = open.length;
    $("#stat-school").textContent = open.filter(t => t.type === "school").length;
    $("#stat-events").textContent = soon().length;
    $("#stat-done").textContent = pct + "%";
    $("#nav-count").textContent = open.length;
    $("#open-bar").style.width = (data.tasks.length ? (open.length / data.tasks.length) * 100 : 0) + "%";
    $("#done-bar").style.width = pct + "%";
    $("#open-note").textContent = open.length ? done.length + " bereits erledigt" : "Alles im Griff";
    $("#progress").textContent = pct + "%";
    $("#ring").style.setProperty("--progress", pct + "%");
    $("#progress-note").textContent = !data.tasks.length ? "Füge deine erste Aufgabe hinzu und leg los." : pct === 100 ? "Stark! Alle Aufgaben sind erledigt." : `${done.length} von ${data.tasks.length} Aufgaben erledigt. Weiter in deinem Tempo.`;
  }

  function eventCard(e) {
    const d = dateObj(e.date);
    return `<div class="event-row"><div class="event-date"><b>${d ? d.getDate() : "–"}</b><small>${d ? new Intl.DateTimeFormat("de-DE", { month: "short" }).format(d) : "Termin"}</small></div><div class="event-main"><strong>${esc(e.title)}</strong><small>${e.time ? esc(e.time) : "Uhrzeit offen"}${e.location ? " · " + esc(e.location) : ""}</small>${e.type === "school" ? '<span class="pill school">Schule</span>' : ""}</div></div>`;
  }

  function taskRow(t, manager = false) {
    return `<div class="task-row ${t.done ? "done" : ""}"><input class="check" type="checkbox" data-check="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="Aufgabe erledigen: ${esc(t.title)}"><div class="task-main"><strong>${esc(t.title)}</strong><small>${due(t)}${t.notes ? " · " + esc(t.notes) : ""}</small>${manager ? `<div class="meta"><span class="pill ${t.type === "school" ? "school" : ""}">${t.type === "school" ? "Schule" : "Alltag"}</span>${priority(t.priority)}</div>` : ""}</div>${manager ? `<div class="actions"><button class="small-btn" data-edit-task="${esc(t.id)}">Bearbeiten</button><button class="small-btn delete" data-delete-task="${esc(t.id)}">Löschen</button></div>` : priority(t.priority)}</div>`;
  }

  function renderDash() {
    const tasks = sortedTasks(data.tasks.filter(t => !t.done)).slice(0, 5);
    $("#dash-tasks").innerHTML = tasks.length ? tasks.map(t => taskRow(t)).join("") : empty("Keine offenen Aufgaben", "Füge eine Aufgabe hinzu, um deinen Überblick zu starten.");
    
    const events = soon().slice(0, 4);
    $("#dash-events").innerHTML = events.length ? events.map(eventCard).join("") : empty("Keine Termine geplant", "Hier erscheinen deine nächsten Termine.");
    
    const ideas = [...data.ideas].sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "")).slice(0, 3);
    $("#dash-ideas").innerHTML = ideas.length ? ideas.map(i => `<div class="idea-row"><i class="idea-dot"></i><div><strong>${esc(i.title)}</strong><p>${esc((i.body || "Keine Zusatznotiz").slice(0, 100))}</p></div></div>`).join("") : empty("Noch keine Ideen", "Speichere einen Gedanken für später.");
  }

  function renderTasks() {
    const q = $("#search-all").value.trim().toLocaleLowerCase("de");
    let list = data.tasks.filter(t => (filter === "all" || (filter === "open" ? !t.done : t.done)) && (!q || [t.title, t.subject, t.notes].some(v => (v || "").toLocaleLowerCase("de").includes(q))));
    const sort = $("#sort-tasks").value;
    
    if (sort === "newest") list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    else if (sort === "priority") {
      const rank = { high: 0, medium: 1, low: 2 };
      list.sort((a, b) => Number(!!a.done) - Number(!!b.done) || rank[a.priority] - rank[b.priority]);
    } else list = sortedTasks(list);
    
    $("#task-list").innerHTML = list.length ? list.map(t => taskRow(t, true)).join("") : empty("Keine passenden Aufgaben", "Erstelle eine Aufgabe oder ändere den Filter.");
  }

  function addDays(s, n) {
    const d = dateObj(s);
    if (!d) return todayISO();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function renderSchool() {
    const list = sortedTasks(data.tasks.filter(t => t.type === "school"));
    const open = list.filter(t => !t.done);
    const overdue = open.filter(t => t.due && t.due < todayISO());
    const up = open.filter(t => t.due && t.due >= todayISO() && t.due <= addDays(todayISO(), 7));
    
    $("#school-stats").innerHTML = [
      [open.length, "OFFENE AUFGABEN", "Alle Fächer"],
      [up.length, "BALD FÄLLIG", "Nächste 7 Tage"],
      [overdue.length, "ÜBERFÄLLIG", "Prüfe die Fälligkeit"]
    ].map(x => `<article class="stat"><div class="stat-head">${x[1]}</div><strong>${x[0]}</strong><div class="stat-foot">${x[2]}</div></article>`).join("");
    
    $("#school-list").innerHTML = list.length ? list.map(t => taskRow(t, true)).join("") : empty("Noch keine Schulaufgaben", "Füge eine Hausaufgabe, Prüfung oder Abgabe hinzu.");
  }

  function renderCalendar() {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    $("#month-title").textContent = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(cursor);
    
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
    const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const out = days.map(d => `<div class="weekday">${d}</div>`);
    
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const has = data.events.some(e => e.date === iso);
      out.push(`<button class="day ${d.getMonth() !== m ? "outside" : ""} ${iso === todayISO() ? "today" : ""} ${iso === selected ? "selected" : ""}" data-day="${iso}" aria-label="${fmt(iso, { day: "numeric", month: "long", year: "numeric" })}">${d.getDate()}${has ? "<i></i>" : ""}</button>`);
    }
    
    $("#calendar-grid").innerHTML = out.join("");
    $("#selected-title").textContent = fmt(selected, { day: "numeric", month: "long" });
    
    const list = data.events.filter(e => e.date === selected).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    $("#selected-events").innerHTML = list.length ? list.map(eventCard).join("") : empty("Keine Termine an diesem Tag", "Du kannst hier einen Termin hinzufügen.");
    
    const all = [...data.events].sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
    $("#all-events").innerHTML = all.length ? all.map(eventCard).join("") : empty("Noch keine Termine", "Erstelle einen Termin, um ihn hier zu sehen.");
  }

  function renderIdeas() {
    const q = $("#search-ideas").value.trim().toLocaleLowerCase("de");
    const list = [...data.ideas].filter(i => !q || [i.title, i.body, i.category].some(v => (v || "").toLocaleLowerCase("de").includes(q))).sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
    
    $("#ideas-grid").innerHTML = list.length ? list.map(i => `<article class="idea-card"><div class="idea-top"><span>${esc(i.category || "Allgemein")}</span><span>●</span></div><h3>${esc(i.title)}</h3><p>${esc(i.body || "Noch keine Notiz.")}</p><div class="idea-bottom"><span>${fmt((i.updatedAt || i.createdAt || "").slice(0, 10), { day: "2-digit", month: "short" })}</span><div class="actions"><button class="small-btn" data-edit-idea="${esc(i.id)}">Bearbeiten</button><button class="small-btn delete" data-delete-idea="${esc(i.id)}">Löschen</button></div></div></article>`).join("") : empty("Noch nichts gespeichert", "Erstelle eine Idee oder passe deine Suche an.");
  }

  function go(name) {
    if (!$(`#page-${name}`)) return;
    page = name;
    $$(".page").forEach(p => p.classList.toggle("shown", p.id === `page-${name}`));
    $$(".nav[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === name));
    
    const titles = { dashboard: "Dashboard", tasks: "Aufgaben", school: "Schule", calendar: "Termine", ideas: "Ideen & Notizen", settings: "Einstellungen" };
    $("#crumb-title").textContent = titles[name];
    $("#sidebar").classList.remove("open");
    if (name === "calendar") renderCalendar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const schema = {
    task: [
      ["title", "Aufgabe", "text", "z. B. Mathe lernen", true, "full"],
      ["type", "Bereich", "select", [["personal", "Alltag"], ["school", "Schule"]], false],
      ["priority", "Priorität", "select", [["low", "Niedrig"], ["medium", "Mittel"], ["high", "Hoch"]], false],
      ["due", "Fällig am", "date", "", false],
      ["subject", "Fach (optional)", "text", "z. B. Mathematik", false],
      ["notes", "Notizen (optional)", "textarea", "Weitere Details …", false, "full"]
    ],
    event: [
      ["title", "Termin", "text", "z. B. Mathe-Schularbeit", true, "full"],
      ["date", "Datum", "date", "", true],
      ["time", "Uhrzeit (optional)", "time", "", false],
      ["type", "Bereich", "select", [["personal", "Allgemein"], ["school", "Schule"]], false],
      ["location", "Ort (optional)", "text", "z. B. Klassenzimmer", false],
      ["notes", "Notizen (optional)", "textarea", "Was ist wichtig?", false, "full"]
    ],
    idea: [
      ["title", "Titel", "text", "z. B. Neue App-Idee", true, "full"],
      ["category", "Kategorie", "select", [["Allgemein", "Allgemein"], ["Schule", "Schule"], ["Projekte", "Projekte"], ["Hobbys", "Hobbys"], ["Später ausprobieren", "Später ausprobieren"]], false],
      ["body", "Deine Notiz", "textarea", "Schreib deine Idee hier auf …", false, "full"]
    ]
  };

  function openModal(kind, item = null, defaults = {}) {
    edit = { kind, id: item?.id || null };
    focusBack = document.activeElement;
    
    const titles = { task: "Aufgabe", event: "Termin", idea: "Idee" };
    $("#modal-title").textContent = (item ? "Bearbeiten: " : "Neue ") + titles[kind];
    $("#modal-kicker").textContent = item ? "EINTRAG BEARBEITEN" : "NEU ERSTELLEN";
    $("#form-error").textContent = "";
    
    $("#form-fields").innerHTML = `<div class="form-grid">${schema[kind].map(f => {
      const [name, label, type, extra, required, full] = f;
      const val = item?.[name] ?? defaults[name] ?? (type === "select" ? (name === "type" ? "personal" : name === "priority" ? "medium" : "Allgemein") : "");
      let control;
      
      if (type === "select") {
        control = `<select name="${name}" id="f-${name}">${extra.map(([v, l]) => `<option value="${esc(v)}" ${val === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
      } else if (type === "textarea") {
        control = `<textarea name="${name}" id="f-${name}" maxlength="${name === "body" ? 3000 : 1000}" placeholder="${esc(extra)}">${esc(val)}</textarea>`;
      } else {
        control = `<input name="${name}" id="f-${name}" type="${type}" value="${esc(val)}" placeholder="${type === "text" ? esc(extra) : ""}" ${required ? "required" : ""} ${type === "text" ? 'maxlength="100"' : ""}>`;
      }
      
      return `<div class="field ${full ? "full" : ""}"><label for="f-${name}">${label}${required ? " *" : ""}</label>${control}</div>`;
    }).join("")}</div>`;
    
    $("#backdrop").hidden = false;
    document.body.style.overflow = "hidden";
    $("#form-fields input,#form-fields select,#form-fields textarea").focus();
  }

  function closeModal() {
    $("#backdrop").hidden = true;
    document.body.style.overflow = "";
    edit = null;
    if (focusBack?.focus) focusBack.focus();
  }

  $("#entry-form").addEventListener("submit", e => {
    e.preventDefault();
    if (!edit) return;
    const form = $("#entry-form");
    if (!form.reportValidity()) return;
    
    const item = Object.fromEntries(new FormData(form).entries());
    const now = new Date().toISOString();
    const col = edit.kind === "task" ? "tasks" : edit.kind === "event" ? "events" : "ideas";
    
    if (edit.id) {
      const ix = data[col].findIndex(x => x.id === edit.id);
      if (ix >= 0) data[col][ix] = { ...data[col][ix], ...item, updatedAt: now };
    } else {
      data[col].push({ id: id(), ...item, createdAt: now, updatedAt: now, ...(edit.kind === "task" ? { done: false } : {}) });
    }
    
    const kind = edit.kind;
    const was = !!edit.id;
    const ok = save();
    closeModal();
    render();
    
    const names = { task: "Aufgabe", event: "Termin", idea: "Idee" };
    toast(ok ? `${names[kind]} ${was ? "aktualisiert" : "gespeichert"}.` : "Eintrag wurde nicht dauerhaft gespeichert.", ok ? "" : "error");
  });

  function toggleTask(taskId, checked) {
    const t = data.tasks.find(x => x.id === taskId);
    if (!t) return;
    t.done = checked;
    t.updatedAt = new Date().toISOString();
    save();
    render();
    toast(checked ? "Aufgabe erledigt. Gut gemacht!" : "Aufgabe wieder geöffnet.");
  }

  function deleteItem(kind, itemId) {
    const col = kind === "task" ? "tasks" : kind === "event" ? "events" : "ideas";
    const item = data[col].find(x => x.id === itemId);
    if (!item) return;
    if (!confirm(`„${item.title}“ wirklich löschen?`)) return;
    data[col] = data[col].filter(x => x.id !== itemId);
    save();
    render();
    toast("Eintrag gelöscht.");
  }

  $$(".nav[data-page]").forEach(b => b.addEventListener("click", () => go(b.dataset.page)));

  document.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.page) go(b.dataset.page);
    if (b.dataset.check) toggleTask(b.dataset.check, e.target.checked);
    if (b.dataset.editTask) {
      const t = data.tasks.find(x => x.id === b.dataset.editTask);
      if (t) openModal("task", t);
    }
    if (b.dataset.deleteTask) deleteItem("task", b.dataset.deleteTask);
    if (b.dataset.editIdea) {
      const i = data.ideas.find(x => x.id === b.dataset.editIdea);
      if (i) openModal("idea", i);
    }
    if (b.dataset.deleteIdea) deleteItem("idea", b.dataset.deleteIdea);
    if (b.dataset.day) {
      selected = b.dataset.day;
      cursor = new Date(+selected.slice(0, 4), +selected.slice(5, 7) - 1, 1);
      renderCalendar();
    }
  });

  $("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#quick-add").addEventListener("click", () => openModal("task"));
  $("#add-task-dash").addEventListener("click", () => openModal("task"));
  $("#new-task").addEventListener("click", () => openModal("task"));
  $("#new-school").addEventListener("click", () => openModal("task", null, { type: "school" }));
  $("#add-event-dash").addEventListener("click", () => openModal("event", null, { date: todayISO() }));
  $("#new-event").addEventListener("click", () => openModal("event", null, { date: todayISO() }));
  $("#add-selected-event").addEventListener("click", () => openModal("event", null, { date: selected }));
  $("#add-idea-dash").addEventListener("click", () => openModal("idea"));
  $("#new-idea").addEventListener("click", () => openModal("idea"));
  $("#close-modal").addEventListener("click", closeModal);
  $("#cancel-modal").addEventListener("click", closeModal);
  $("#backdrop").addEventListener("click", e => { if (e.target === $("#backdrop")) closeModal(); });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#backdrop").hidden) closeModal();
    if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && $("#backdrop").hidden) {
      e.preventDefault();
      $("#search-all").focus();
    }
  });

  $("#search-all").addEventListener("input", () => {
    renderTasks();
    if ($("#search-all").value.trim() && page !== "tasks") go("tasks");
  });

  $("#search-ideas").addEventListener("input", renderIdeas);
  $("#sort-tasks").addEventListener("change", renderTasks);

  $$(".filter").forEach(b => b.addEventListener("click", () => {     filter = b.dataset.filter;     $$
(".filter").forEach(x => x.classList.toggle("active", x === b));
    renderTasks();
  }));

  $("#prev-month").addEventListener("click", () => {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    renderCalendar();
  });

  $("#next-month").addEventListener("click", () => {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    renderCalendar();
  });

  $("#export-data").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ format: "myday-v1", ...data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `myday-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Datensicherung erstellt.");
  });

  $("#import-data").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!Array.isArray(d.tasks) || !Array.isArray(d.events) || !Array.isArray(d.ideas)) throw Error("Die Datei hat nicht das erwartete Format.");
      if (!confirm("Deine aktuellen Einträge werden durch die importierten Daten ersetzt. Fortfahren?")) return;
      data = {
        tasks: d.tasks.filter(x => x?.id && x.title),
        events: d.events.filter(x => x?.id && x.title && x.date),
        ideas: d.ideas.filter(x => x?.id && x.title)
      };
      save();
      render();
      toast("Daten importiert.");
    } catch (err) {
      toast("Import fehlgeschlagen: " + err.message, "error");
    } finally {
      e.target.value = "";
    }
  });

  $("#reset-data").addEventListener("click", () => {
    if (!confirm("Alle Aufgaben, Termine und Ideen wirklich löschen? Das kann nicht rückgängig gemacht werden.")) return;
    data = blank();
    save();
    render();
    toast("Lokale Einträge gelöscht.");
  });

  render();
})();
