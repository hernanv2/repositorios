/* ============================================================
   Taller Tlacuilos · Directorio de proyectos
   Datos en la nube (Cloudflare KV vía /api/projects).
   Si la API no responde (por ej. al abrir el archivo directo),
   usa almacenamiento local del navegador como respaldo.
   ============================================================ */

(function () {
  "use strict";

  const API = "/api/projects";
  const STORAGE_KEY = "tlacuilos.proyectos.v1";

  /* ---------- Estado ---------- */
  let projects = [];
  let query = "";
  let deleteTargetId = null;
  let mode = "cargando"; // "nube" | "local"

  /* ---------- Utilidades ---------- */
  const $ = (sel) => document.querySelector(sel);
  const uid = () =>
    "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function normalizeUrl(raw) {
    const v = (raw || "").trim();
    if (!v) return "";
    return /^https?:\/\//i.test(v) ? v : "https://" + v;
  }
  function isValidUrl(raw) {
    const v = (raw || "").trim();
    if (!v) return true;
    try { new URL(normalizeUrl(v)); return true; } catch (e) { return false; }
  }
  function prettyUrl(url) {
    try {
      const u = new URL(url);
      return (u.host + u.pathname + u.search).replace(/\/$/, "");
    } catch (e) { return url; }
  }

  /* ---------- Respaldo local (memoria si no hay localStorage) ---------- */
  const local = (() => {
    let memory = null, usable = true;
    try { localStorage.setItem("__t__", "1"); localStorage.removeItem("__t__"); }
    catch (e) { usable = false; }
    return {
      read() {
        if (usable) { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch (e) { return []; } }
        return memory || [];
      },
      write(d) {
        if (usable) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); return; } catch (e) {} }
        memory = d;
      }
    };
  })();

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
    }, 2400);
  }

  /* ---------- Capa de datos ---------- */
  async function apiList() {
    const r = await fetch(API, { headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error("api");
    return r.json();
  }
  async function apiSend(method, body) {
    const r = await fetch(API, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      let msg = "Error del servidor";
      try { const e = await r.json(); if (e && e.error) msg = e.error; } catch (_) {}
      throw new Error(msg);
    }
    return r.json();
  }

  // Carga inicial: intenta la nube; si falla, usa local.
  async function boot() {
    try {
      projects = await apiList();
      mode = "nube";
    } catch (e) {
      projects = local.read();
      mode = "local";
    }
    setBadge();
    render();
  }

  async function refresh() {
    if (mode === "nube") {
      try { projects = await apiList(); }
      catch (e) { toast("No se pudo actualizar desde la nube", "err"); }
    } else {
      projects = local.read();
    }
    render();
  }

  /* ---------- Indicador de modo ---------- */
  function setBadge() {
    const b = $("#modeBadge");
    if (!b) return;
    if (mode === "nube") {
      b.textContent = "● Nube";
      b.className = "mode mode--cloud";
      b.title = "Sincronizado: los datos se comparten entre dispositivos.";
    } else {
      b.textContent = "● Local";
      b.className = "mode mode--local";
      b.title = "Sin conexión con la base de datos. Los datos se guardan solo en este navegador.";
    }
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
    const icon = '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m0 16H8V7h11z"/></svg>';
    if (url) {
      return `
        <div class="link-row">
          <span class="link-row__label">${label}</span>
          <div class="link-row__main">
            <a class="link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(url)}">
              <span class="link__text">${escapeHtml(prettyUrl(url))}</span>
              <span class="link__ext" aria-hidden="true">↗</span>
            </a>
            <button class="copybtn" type="button" data-copy="${escapeHtml(url)}" title="Copiar enlace" aria-label="Copiar enlace">${icon}</button>
          </div>
        </div>`;
    }
    return `
      <div class="link-row">
        <span class="link-row__label">${label}</span>
        <div class="link-row__main">
          <span class="link is-empty"><span class="link__text">Sin enlace</span></span>
          <button class="copybtn" type="button" disabled aria-label="Sin enlace">${icon}</button>
        </div>
      </div>`;
  }

  function cardHtml(p) {
    return `
      <article class="card" data-id="${p.id}">
        <div class="card__head"><h3 class="card__title">${escapeHtml(p.name)}</h3></div>
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

  function setSaving(on) {
    const btn = $("#btnSave");
    btn.disabled = on;
    btn.textContent = on ? "Guardando…" : "Guardar";
  }

  async function submit(e) {
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
    const editingId = fId.value;

    setSaving(true);
    try {
      if (mode === "nube") {
        if (editingId) await apiSend("PUT", { id: editingId, ...data });
        else await apiSend("POST", data);
        await refresh();
      } else {
        const list = local.read();
        if (editingId) {
          const p = list.find((x) => x.id === editingId);
          if (p) Object.assign(p, data);
        } else {
          list.unshift({ id: uid(), createdAt: Date.now(), ...data });
        }
        local.write(list);
        await refresh();
      }
      toast(editingId ? "Proyecto actualizado" : "Proyecto agregado", "ok");
      closeModal();
    } catch (err) {
      toast(err.message || "No se pudo guardar", "err");
    } finally {
      setSaving(false);
    }
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
  async function doDelete() {
    const id = deleteTargetId;
    $("#btnConfirmYes").disabled = true;
    try {
      if (mode === "nube") {
        await apiSend("DELETE", { id });
        await refresh();
      } else {
        local.write(local.read().filter((x) => x.id !== id));
        await refresh();
      }
      toast("Proyecto eliminado");
    } catch (err) {
      toast(err.message || "No se pudo eliminar", "err");
    } finally {
      $("#btnConfirmYes").disabled = false;
      confirmEl.hidden = true;
      deleteTargetId = null;
    }
  }

  /* ---------- Copiar ---------- */
  async function copyLink(btn) {
    const url = btn.getAttribute("data-copy");
    try { await navigator.clipboard.writeText(url); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      ta.remove();
    }
    btn.classList.add("copied");
    toast("Enlace copiado", "ok");
    setTimeout(() => btn.classList.remove("copied"), 1200);
  }

  /* ---------- Respaldo / Restauración (archivo .json) ---------- */
  function exportData() {
    if (!projects.length) { toast("No hay proyectos para respaldar", "err"); return; }
    const blob = new Blob([JSON.stringify(projects, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tlacuilos-proyectos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Respaldo descargado", "ok");
  }

  async function importData(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("formato");
        const clean = data
          .filter((x) => x && typeof x.name === "string")
          .map((x) => ({
            name: String(x.name),
            client: x.client ? normalizeUrl(String(x.client)) : "",
            internal: x.internal ? normalizeUrl(String(x.internal)) : ""
          }));
        if (!clean.length) throw new Error("vacío");

        if (mode === "nube") {
          for (const item of clean) await apiSend("POST", item);
        } else {
          local.write(clean.map((x) => ({ id: uid(), createdAt: Date.now(), ...x })));
        }
        await refresh();
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

  grid.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-del]");
    const copyBtn = e.target.closest("[data-copy]");
    if (editBtn) return openModal(projects.find((p) => p.id === editBtn.dataset.edit));
    if (delBtn) return askDelete(delBtn.dataset.del);
    if (copyBtn && !copyBtn.disabled) return copyLink(copyBtn);
  });

  [modal, confirmEl].forEach((ov) =>
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.hidden = true; }));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { modal.hidden = true; confirmEl.hidden = true; }
  });

  /* ---------- Inicio ---------- */
  render();
  boot();
})();
