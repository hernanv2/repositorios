/* ============================================================
   API de proyectos · Cloudflare Pages Function + KV
   Ruta pública:  /api/projects
   Requiere un binding KV llamado  PROJECTS  (se crea en el panel).
   Toda la lista se guarda como un solo valor JSON bajo la clave "list".
   ============================================================ */

const KEY = "list";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

function uid() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function readList(env) {
  if (!env.PROJECTS) return null; // binding no configurado
  const raw = await env.PROJECTS.get(KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

async function writeList(env, list) {
  await env.PROJECTS.put(KEY, JSON.stringify(list));
}

function clean(body) {
  const norm = (u) => {
    const v = String(u || "").trim();
    if (!v) return "";
    return /^https?:\/\//i.test(v) ? v : "https://" + v;
  };
  return {
    name: String(body.name || "").trim().slice(0, 120),
    client: norm(body.client),
    internal: norm(body.internal)
  };
}

// GET  /api/projects  -> lista completa
export async function onRequestGet({ env }) {
  const list = await readList(env);
  if (list === null)
    return json({ error: "KV no configurado. Falta el binding PROJECTS." }, 500);
  return json(list);
}

// POST /api/projects  -> crea uno
export async function onRequestPost({ request, env }) {
  const list = await readList(env);
  if (list === null) return json({ error: "KV no configurado." }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "JSON inválido" }, 400); }

  const data = clean(body);
  if (!data.name) return json({ error: "El nombre es obligatorio" }, 400);

  const item = { id: uid(), createdAt: Date.now(), ...data };
  list.unshift(item);
  await writeList(env, list);
  return json(item, 201);
}

// PUT /api/projects  -> edita uno (por id)
export async function onRequestPut({ request, env }) {
  const list = await readList(env);
  if (list === null) return json({ error: "KV no configurado." }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "JSON inválido" }, 400); }

  const id = String(body.id || "");
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return json({ error: "No encontrado" }, 404);

  const data = clean(body);
  if (!data.name) return json({ error: "El nombre es obligatorio" }, 400);

  list[idx] = { ...list[idx], ...data };
  await writeList(env, list);
  return json(list[idx]);
}

// DELETE /api/projects  -> elimina uno (por id en el body)
export async function onRequestDelete({ request, env }) {
  const list = await readList(env);
  if (list === null) return json({ error: "KV no configurado." }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "JSON inválido" }, 400); }

  const id = String(body.id || "");
  const next = list.filter((p) => p.id !== id);
  await writeList(env, next);
  return json({ ok: true, id });
}
