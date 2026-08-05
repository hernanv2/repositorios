/* ============================================================
   Taller Tlacuilos · Directorio de proyectos
   CRUD de proyectos con almacenamiento local.
   ============================================================ */

(function () {
  "use strict";

  const STORAGE_KEY = "tlacuilos.proyectos.v1";

  /* ---------- Almacenamiento (con respaldo en memoria) ---------- */
  // localStorage funciona en GitHub Pages y en el navegador.
  // Si no está disponible (por ejemplo, en una vista previa), usa memoria.
  const store = (() => {
    let memory = null;
    let usable = true;
    try {
      const k = "__test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
    } catch (e) {
      usable = false;
    }
    return {
      load() {
        if (usable) {
          try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
          catch (e) { return []; }
        }
        return memory || [];
      },
      save(data) {
        if (usable) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return; }
          catch (e) { /* cae a memoria */ }
        }
        memory = data;
      }
    };
  })();

  /* ---------- Estado ---------- */
  let projects = store.load();
  let query = "";
  let deleteTargetId = null;

  /* ---------- Utilidades ---------- */
  const $ = (sel) => document.querySelector(sel);
  const uid = () =>
    "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // Normaliza una URL: si falta el esquema, antepone https://
  function normalizeUrl(raw) {
    const v = (raw || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    return "https://" + v;
  }

  function isValidUrl(raw) {
    const v = (raw || "").trim();
    if (!v) return true; // vacío es válido (opcional)
    try { new URL(normalizeUrl(v)); return true; }
    catch (e) { return false; }
  }

  // Texto legible de una URL (sin esquema, sin barra final)
  function prettyUrl(url) {
    try {
      const u = new URL(url);
      let s = u.host + u.pathname + u.search;
      return s.replace(/\/$/, "");
    } catch (e) { return url; }
  }

  function save() { store.save(projects); }

  /* ---------- Toasts ---------- */
  function toast(msg, kind) {
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " toast--" + kind : "");
    el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      el.style.transition = "opacity .2s, transform .2s";
      setTimeout(() => el.remove(), 220);
    }, 2200);
  }

  /* ---------- Render ---------- */
  const grid = $("#grid");
  const emptyEl = $("#empty");
  const noResultsEl = $("#noResults");

  function filtered() {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.client || "").toLowerCase().includes(q) ||
      (p.internal || "").toLowerCase().includes(q)
    );
  }

  function linkRow(label, url) {
    if (url) {
      return `
        <div class="link-row">
          <span class="link-row__label">${label}</span>
          <div class="link-row__main">
            <a class="link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(url)}">
              <span class="link__text">${escapeHtml(prettyUrl(url))}</span>
              <span class="link__ext" aria-hidden="true">↗</span>
            </a>
            <button class="copybtn" type="button" data-copy="${escapeHtml(url)}" title="Copiar enlace" aria-label="Copiar enlace">
              <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m0 16H8V7h11z"/></svg>
            </button>
          </div>
        </div>`;
    }
    return `
      <div class="link-row">
        <span class="link-row__label">${label}</span>
        <div class="link-row__main">
          <span class="link is-empty"><span class="link__text">Sin enlace</span></span>
          <button class="copybtn" type="button" disabled aria-label="Sin enlace">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m0 16H8V7h11z"/></svg>
          </button>
        </div>
      </div>`;
  }

  function cardHtml(p) {
    return `
      <article class="card" data-id="${p.id}">
        <div class="card__head">
          <h3 class="card__title">${escapeHtml(p.name)}</h3>
        </div>
        <div class="card__body">
          ${linkRow("Cliente", p.client)}
          ${linkRow("Interno", p.internal)}
        </div>
        <div class="card__foot">
          <button class="btn btn--ghost" data-edit="${p.id}">Editar</button>
          <button class="btn btn--danger" data-del="${p.id}">Eliminar</button>
        </div>
      </article>`;
  }

  function render() {
    $("#statTotal").textContent = projects.length;

    const list = filtered();
    const hasProjects = projects.length > 0;
    const hasResults = list.length > 0;

    emptyEl.hidden = hasProjects;
    noResultsEl.hidden = !(hasProjects && !hasResults);
    grid.hidden = !hasResults;

    grid.innerHTML = list.map(cardHtml).join("");
  }

  /* ---------- Modal de formulario ---------- */
  const modal = $("#modal");
  const form = $("#projectForm");
  const fId = $("#projectId");
  const fName = $("#fName");
  const fClient = $("#fClient");
  const fInternal = $("#fInternal");

  function openModal(project) {
    clearErrors();
    if (project) {
      $("#dialogTitle").textContent = "Editar proyecto";
      fId.value = project.id;
      fName.value = project.name || "";
      fClient.value = project.client || "";
      fInternal.value = project.internal || "";
    } else {
      $("#dialogTitle").textContent = "Nuevo proyecto";
      form.reset();
      fId.value = "";
    }
    modal.hidden = false;
    setTimeout(() => fName.focus(), 40);
  }

  function closeModal() { modal.hidden = true; }

  function clearErrors() {
    document.querySelectorAll(".field").forEach((f) => f.classList.remove("invalid"));
    document.querySelectorAll(".field__error").forEach((e) => (e.textContent = ""));
  }

  function setError(input, msg) {
    const field = input.closest(".field");
    field.classList.add("invalid");
    const err = field.querySelector(".field__error");
    if (err) err.textContent = msg;
  }

  function submit(e) {
    e.preventDefault();
    clearErrors();

    const name = fName.value.trim();
    const client = fClient.value.trim();
    const internal = fInternal.value.trim();
    let ok = true;

    if (!name) { setError(fName, "El nombre es obligatorio."); ok = false; }
    if (!isValidUrl(client)) { setError(fClient, "Escribe una URL válida."); ok = false; }
    if (!isValidUrl(internal)) { setError(fInternal, "Escribe una URL válida."); ok = false; }
    if (!ok) return;

    const data = {
      name,
      client: client ? normalizeUrl(client) : "",
      internal: internal ? normalizeUrl(internal) : ""
    };

    if (fId.value) {
      const p = projects.find((x) => x.id === fId.value);
      if (p) Object.assign(p, data);
      toast("Proyecto actualizado", "ok");
    } else {
      projects.unshift(Object.assign({ id: uid(), createdAt: Date.now() }, data));
      toast("Proyecto agregado", "ok");
    }
    save();
    render();
    closeModal();
  }

  /* ---------- Eliminar ---------- */
  const confirmEl = $("#confirm");

  function askDelete(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    deleteTargetId = id;
    $("#confirmName").textContent = p.name;
    confirmEl.hidden = false;
    setTimeout(() => $("#btnConfirmNo").focus(), 40);
  }

  function doDelete() {
    projects = projects.filter((x) => x.id !== deleteTargetId);
    save();
    render();
    confirmEl.hidden = true;
    deleteTargetId = null;
    toast("Proyecto eliminado");
  }

  /* ---------- Copiar al portapapeles ---------- */
  async function copyLink(btn) {
    const url = btn.getAttribute("data-copy");
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      ta.remove();
    }
    btn.classList.add("copied");
    toast("Enlace copiado", "ok");
    setTimeout(() => btn.classList.remove("copied"), 1200);
  }

  /* ---------- Respaldo / Restauración ---------- */
  function exportData() {
    if (!projects.length) { toast("No hay proyectos para respaldar", "err"); return; }
    const blob = new Blob([JSON.stringify(projects, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `tlacuilos-proyectos-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Respaldo descargado", "ok");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("formato");
        const clean = data
          .filter((x) => x && typeof x.name === "string")
          .map((x) => ({
            id: x.id || uid(),
            name: String(x.name),
            client: x.client ? normalizeUrl(String(x.client)) : "",
            internal: x.internal ? normalizeUrl(String(x.internal)) : "",
            createdAt: x.createdAt || Date.now()
          }));
        if (!clean.length) throw new Error("vacío");
        projects = clean;
        save();
        render();
        toast(`Se restauraron ${clean.length} proyectos`, "ok");
      } catch (err) {
        toast("El archivo no es un respaldo válido", "err");
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Eventos ---------- */
  $("#btnNew").addEventListener("click", () => openModal(null));
  $("#btnEmptyNew").addEventListener("click", () => openModal(null));
  $("#btnCloseModal").addEventListener("click", closeModal);
  $("#btnCancel").addEventListener("click", closeModal);
  form.addEventListener("submit", submit);

  $("#btnConfirmNo").addEventListener("click", () => { confirmEl.hidden = true; deleteTargetId = null; });
  $("#btnConfirmYes").addEventListener("click", doDelete);

  $("#search").addEventListener("input", (e) => { query = e.target.value; render(); });

  $("#btnExport").addEventListener("click", exportData);
  $("#btnImport").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) importData(f);
    e.target.value = "";
  });

  // Delegación de clics en las tarjetas
  grid.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-del]");
    const copyBtn = e.target.closest("[data-copy]");
    if (editBtn) return openModal(projects.find((p) => p.id === editBtn.dataset.edit));
    if (delBtn) return askDelete(delBtn.dataset.del);
    if (copyBtn && !copyBtn.disabled) return copyLink(copyBtn);
  });

  // Cerrar modales al hacer clic fuera o con Escape
  [modal, confirmEl].forEach((ov) => {
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.hidden = true; });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { modal.hidden = true; confirmEl.hidden = true; }
  });

  /* ---------- Inicio ---------- */
  render();
})();

/* ============================================================
   Taller Tlacuilos · Directorio de proyectos
   Paleta basada en el panel de control de pedidos.
   ============================================================ */

:root{
  --bg:        #15171C;
  --bg-2:      #101216;
  --surface:   #1E222A;
  --surface-2: #252A33;
  --line:      #313743;
  --line-soft: #262b33;

  --text:      #F4F2EC;
  --muted:     #949CA8;
  --muted-2:   #6E7681;

  --orange:    #E8952E;
  --orange-600:#D3821E;
  --orange-700:#B96E12;
  --red:       #CD3B30;
  --red-600:   #B32E24;
  --green:     #3FA06A;
  --blue:      #2E7FE0;

  --radius:    12px;
  --radius-sm: 8px;
  --shadow:    0 10px 30px rgba(0,0,0,.35);
  --ring:      0 0 0 3px rgba(232,149,46,.35);

  --font-display: "Barlow Condensed", "Arial Narrow", sans-serif;
  --font-body:    "Inter", system-ui, -apple-system, sans-serif;
  --font-mono:    "Space Mono", ui-monospace, monospace;
}

*{ box-sizing:border-box; }

[hidden]{ display:none !important; }

html,body{ margin:0; padding:0; }

body{
  background:
    radial-gradient(1200px 600px at 80% -10%, rgba(232,149,46,.08), transparent 60%),
    var(--bg);
  color:var(--text);
  font-family:var(--font-body);
  font-size:15px;
  line-height:1.5;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
}

a{ color:inherit; }

/* ============================================================
   TOPBAR
   ============================================================ */
.topbar{
  position:sticky; top:0; z-index:20;
  display:flex; align-items:center; gap:20px; flex-wrap:wrap;
  padding:14px clamp(16px, 4vw, 32px);
  background:rgba(16,18,22,.92);
  backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line);
}

.brand{ display:flex; align-items:center; gap:14px; min-width:0; }
.brand__logo{ height:34px; width:auto; display:block; }
.brand__sub{
  font-family:var(--font-mono);
  font-size:11px; letter-spacing:.14em; text-transform:uppercase;
  color:var(--muted); padding-left:14px; border-left:1px solid var(--line);
  white-space:nowrap;
}

.topbar__stats{ margin-inline:auto; }
.stat{
  font-family:var(--font-mono); font-size:12px; letter-spacing:.06em;
  color:var(--muted); text-transform:uppercase;
}
.stat b{ color:var(--orange); font-size:15px; }

.topbar__actions{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }

.search{
  display:flex; align-items:center; gap:8px;
  background:var(--surface); border:1px solid var(--line);
  border-radius:999px; padding:8px 14px; color:var(--muted);
  transition:border-color .15s, box-shadow .15s;
}
.search:focus-within{ border-color:var(--orange); box-shadow:var(--ring); color:var(--text); }
.search input{
  border:0; background:transparent; color:var(--text);
  font-family:var(--font-body); font-size:14px; width:160px; outline:none;
}
.search input::placeholder{ color:var(--muted-2); }

/* ============================================================
   BUTTONS
   ============================================================ */
.btn{
  font-family:var(--font-display); font-weight:700;
  font-size:15px; letter-spacing:.03em; text-transform:uppercase;
  border:1px solid transparent; border-radius:var(--radius-sm);
  padding:9px 16px; cursor:pointer; white-space:nowrap;
  transition:transform .08s ease, background .15s, border-color .15s, color .15s;
}
.btn:active{ transform:translateY(1px); }
.btn:focus-visible{ outline:none; box-shadow:var(--ring); }

.btn--primary{ background:var(--orange); color:#20140a; border-color:var(--orange); }
.btn--primary:hover{ background:var(--orange-600); }

.btn--ghost{ background:transparent; color:var(--muted); border-color:var(--line); }
.btn--ghost:hover{ color:var(--text); border-color:var(--muted-2); background:var(--surface); }

.btn--danger{ background:var(--red); color:#fff; border-color:var(--red); }
.btn--danger:hover{ background:var(--red-600); }

.iconbtn{
  background:transparent; border:0; color:var(--muted);
  font-size:26px; line-height:1; cursor:pointer; padding:2px 8px; border-radius:6px;
}
.iconbtn:hover{ color:var(--text); background:var(--surface-2); }

/* ============================================================
   GRID + CARDS
   ============================================================ */
.wrap{ padding:clamp(18px, 4vw, 34px); max-width:1400px; margin:0 auto; }

.grid{
  display:grid; gap:18px;
  grid-template-columns:repeat(auto-fill, minmax(290px, 1fr));
}

.card{
  background:var(--surface);
  border:1px solid var(--line);
  border-radius:var(--radius);
  overflow:hidden;
  display:flex; flex-direction:column;
  box-shadow:0 1px 0 rgba(255,255,255,.02) inset;
  animation:pop .18s ease;
}
@keyframes pop{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }

.card__head{
  background:linear-gradient(180deg, var(--orange) 0%, var(--orange-600) 100%);
  padding:16px 18px; text-align:center;
  border-bottom:3px solid var(--orange-700);
}
.card__title{
  margin:0; color:#241606;
  font-family:var(--font-display); font-weight:800;
  font-size:24px; line-height:1.05; letter-spacing:.02em;
  text-transform:uppercase; word-break:break-word;
}

.card__body{ padding:16px 18px; display:flex; flex-direction:column; gap:14px; flex:1; }

.link-row{ display:flex; flex-direction:column; gap:6px; }
.link-row__label{
  font-family:var(--font-mono); font-size:10px; letter-spacing:.16em;
  text-transform:uppercase; color:var(--muted-2);
}
.link-row__main{ display:flex; align-items:center; gap:8px; min-width:0; }

.link{
  flex:1; min-width:0;
  display:inline-flex; align-items:center; gap:8px;
  background:var(--surface-2); border:1px solid var(--line-soft);
  border-radius:var(--radius-sm); padding:9px 11px;
  font-family:var(--font-mono); font-size:12.5px; color:var(--text);
  text-decoration:none; overflow:hidden;
  transition:border-color .15s, background .15s;
}
.link:hover{ border-color:var(--orange); background:#2a3038; }
.link__text{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
.link__ext{ color:var(--orange); flex:none; }
.link.is-empty{
  color:var(--muted-2); font-style:italic; cursor:default;
  border-style:dashed;
}
.link.is-empty:hover{ border-color:var(--line-soft); background:var(--surface-2); }

.copybtn{
  flex:none; width:34px; height:34px; border-radius:var(--radius-sm);
  border:1px solid var(--line-soft); background:var(--surface-2);
  color:var(--muted); cursor:pointer; display:grid; place-items:center;
  transition:color .15s, border-color .15s, background .15s;
}
.copybtn:hover{ color:var(--text); border-color:var(--muted-2); }
.copybtn[disabled]{ opacity:.35; cursor:default; }
.copybtn.copied{ color:var(--green); border-color:var(--green); }

.card__foot{
  display:flex; gap:8px; padding:12px 18px;
  border-top:1px solid var(--line); background:var(--bg-2);
}
.card__foot .btn{ flex:1; font-size:13px; padding:8px 10px; }

/* ============================================================
   EMPTY STATES
   ============================================================ */
.empty{
  text-align:center; padding:70px 20px; max-width:460px; margin:40px auto;
}
.empty__mark img{ height:38px; opacity:.5; margin-bottom:22px; }
.empty__title{ font-family:var(--font-display); font-weight:700; font-size:28px; margin:0 0 8px; text-transform:uppercase; letter-spacing:.02em; }
.empty__text{ color:var(--muted); margin:0 0 22px; }

/* ============================================================
   MODALS
   ============================================================ */
.overlay{
  position:fixed; inset:0; z-index:50;
  background:rgba(8,9,11,.72); backdrop-filter:blur(3px);
  display:grid; place-items:center; padding:18px;
  animation:fade .15s ease;
}
@keyframes fade{ from{ opacity:0; } to{ opacity:1; } }

.dialog{
  width:100%; max-width:460px;
  background:var(--surface); border:1px solid var(--line);
  border-radius:14px; box-shadow:var(--shadow);
  animation:rise .18s ease;
}
.dialog--sm{ max-width:400px; }
@keyframes rise{ from{ opacity:0; transform:translateY(10px) scale(.98); } to{ opacity:1; transform:none; } }

.dialog__head{
  display:flex; align-items:center; justify-content:space-between;
  padding:18px 20px 0;
}
.dialog__title{
  font-family:var(--font-display); font-weight:700; font-size:24px;
  text-transform:uppercase; letter-spacing:.02em; margin:0;
}

.form{ padding:16px 20px 20px; display:flex; flex-direction:column; gap:16px; }
.field{ display:flex; flex-direction:column; gap:6px; }
.field__label{ font-size:13px; font-weight:600; color:var(--text); }
.field__label em{ color:var(--orange); font-style:normal; }
.field input{
  background:var(--bg-2); border:1px solid var(--line);
  border-radius:var(--radius-sm); padding:11px 13px;
  color:var(--text); font-family:var(--font-body); font-size:14.5px;
  transition:border-color .15s, box-shadow .15s;
}
.field input::placeholder{ color:var(--muted-2); }
.field input:focus{ outline:none; border-color:var(--orange); box-shadow:var(--ring); }
.field.invalid input{ border-color:var(--red); }
.field__hint{ font-size:12px; color:var(--muted-2); }
.field__error{ font-size:12px; color:var(--red); min-height:0; }
.field.invalid .field__error{ min-height:16px; }

.form__actions{ display:flex; justify-content:flex-end; gap:10px; padding-top:4px; }

.confirm__text{ padding:6px 20px 4px; color:var(--muted); }
.confirm__text b{ color:var(--text); }
#confirm .form__actions{ padding:14px 20px 20px; }

/* ============================================================
   TOASTS
   ============================================================ */
.toasts{ position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:80; display:flex; flex-direction:column; gap:8px; align-items:center; pointer-events:none; }
.toast{
  background:var(--surface-2); border:1px solid var(--line);
  border-left:3px solid var(--orange);
  color:var(--text); padding:11px 16px; border-radius:var(--radius-sm);
  font-size:13.5px; box-shadow:var(--shadow);
  animation:toastIn .2s ease;
}
.toast--ok{ border-left-color:var(--green); }
.toast--err{ border-left-color:var(--red); }
@keyframes toastIn{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:none; } }

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 760px){
  .topbar{ gap:12px; }
  .brand__sub{ display:none; }
  .topbar__stats{ order:3; width:100%; margin:0; }
  .topbar__actions{ order:2; width:100%; }
  .search{ flex:1; }
  .search input{ width:100%; }
  .btn#btnExport, .btn#btnImport{ padding:9px 12px; }
}

@media (max-width: 460px){
  .grid{ grid-template-columns:1fr; }
  .topbar__actions{ display:grid; grid-template-columns:1fr 1fr; }
  .search{ grid-column:1 / -1; }
  #btnNew{ grid-column:1 / -1; }
}

@media (prefers-reduced-motion: reduce){
  *{ animation:none !important; transition:none !important; }
}

<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Taller Tlacuilos · Directorio de Proyectos</title>
  <meta name="description" content="Directorio de proyectos del Taller Tlacuilos: nombre, URL de cliente y URL interno." />
  <link rel="icon" type="image/png" href="data:image/png;base64,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" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- ==================== HEADER ==================== -->
  <header class="topbar">
    <div class="brand">
      <img src="data:image/png;base64,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" alt="Taller Tlacuilos" class="brand__logo" />
      <span class="brand__sub">Directorio de proyectos</span>
    </div>

    <div class="topbar__stats" id="statsBar">
      <span class="stat"><b id="statTotal">0</b> proyectos</span>
    </div>

    <div class="topbar__actions">
      <div class="search">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14"/></svg>
        <input id="search" type="search" placeholder="Buscar proyecto…" autocomplete="off" aria-label="Buscar proyecto" />
      </div>
      <button class="btn btn--ghost" id="btnExport" title="Descargar respaldo (.json)">Respaldo</button>
      <button class="btn btn--ghost" id="btnImport" title="Restaurar desde un respaldo">Restaurar</button>
      <input type="file" id="importFile" accept="application/json" hidden />
      <button class="btn btn--primary" id="btnNew">+ Nuevo proyecto</button>
    </div>
  </header>

  <!-- ==================== MAIN ==================== -->
  <main class="wrap">
    <section id="grid" class="grid" aria-live="polite"></section>

    <!-- Empty state -->
    <div id="empty" class="empty" hidden>
      <div class="empty__mark">
        <img src="data:image/png;base64,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" alt="" />
      </div>
      <h2 class="empty__title">Aún no hay proyectos</h2>
      <p class="empty__text">Agrega tu primer proyecto con su URL de cliente y su URL interno. Todo se guarda en este navegador.</p>
      <button class="btn btn--primary" id="btnEmptyNew">+ Crear el primero</button>
    </div>

    <!-- No results -->
    <div id="noResults" class="empty" hidden>
      <h2 class="empty__title">Sin resultados</h2>
      <p class="empty__text">Ningún proyecto coincide con tu búsqueda.</p>
    </div>
  </main>

  <!-- ==================== MODAL: FORM ==================== -->
  <div class="overlay" id="modal" hidden>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
      <div class="dialog__head">
        <h2 id="dialogTitle" class="dialog__title">Nuevo proyecto</h2>
        <button class="iconbtn" id="btnCloseModal" aria-label="Cerrar">&times;</button>
      </div>

      <form id="projectForm" class="form" novalidate>
        <input type="hidden" id="projectId" />

        <label class="field">
          <span class="field__label">Nombre del proyecto <em>*</em></span>
          <input id="fName" type="text" maxlength="80" placeholder="Ej. La Propuesta" required />
          <span class="field__error" data-for="fName"></span>
        </label>

        <label class="field">
          <span class="field__label">URL de cliente</span>
          <input id="fClient" type="text" inputmode="url" placeholder="https://cliente.ejemplo.com" />
          <span class="field__hint">Enlace que compartes con el cliente.</span>
          <span class="field__error" data-for="fClient"></span>
        </label>

        <label class="field">
          <span class="field__label">URL interno</span>
          <input id="fInternal" type="text" inputmode="url" placeholder="https://interno.ejemplo.com" />
          <span class="field__hint">Enlace de trabajo interno del taller.</span>
          <span class="field__error" data-for="fInternal"></span>
        </label>

        <div class="form__actions">
          <button type="button" class="btn btn--ghost" id="btnCancel">Cancelar</button>
          <button type="submit" class="btn btn--primary" id="btnSave">Guardar</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ==================== MODAL: CONFIRM DELETE ==================== -->
  <div class="overlay" id="confirm" hidden>
    <div class="dialog dialog--sm" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
      <div class="dialog__head">
        <h2 id="confirmTitle" class="dialog__title">Eliminar proyecto</h2>
      </div>
      <p class="confirm__text">¿Seguro que quieres eliminar <b id="confirmName">este proyecto</b>? Esta acción no se puede deshacer.</p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" id="btnConfirmNo">Cancelar</button>
        <button type="button" class="btn btn--danger" id="btnConfirmYes">Eliminar</button>
      </div>
    </div>
  </div>

  <!-- Toasts -->
  <div class="toasts" id="toasts" aria-live="assertive"></div>

  <script src="app.js"></script>
</body>
</html>
