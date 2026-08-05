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
