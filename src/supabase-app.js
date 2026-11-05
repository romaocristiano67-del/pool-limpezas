import { createClient } from "@supabase/supabase-js";

const supabase = createClient(__SUPABASE_URL__, __SUPABASE_PUBLISHABLE_KEY__);
const section = document.getElementById("conta");
const modal = document.getElementById("md");
let currentUser = null;
let profile = null;
let pools = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function displayDate(value) {
  if (!value) return "Data não definida";
  return new Intl.DateTimeFormat("pt-AO", { dateStyle: "medium", timeZone: "Africa/Luanda" })
    .format(new Date(`${value}T12:00:00+01:00`));
}

function showError(message) {
  const error = document.getElementById("auth-error");
  if (error) error.textContent = message;
}

function renderModal(mode = "signin") {
  const tabs = document.querySelector("#md .tabs");
  tabs.hidden = false;
  document.getElementById("t1").classList.toggle("on", mode === "signin");
  document.getElementById("t2").classList.toggle("on", mode === "signup");
  const title = mode === "signup" ? "Crie a sua conta." : "Entre na sua conta.";
  const nameField = mode === "signup"
    ? '<label for="auth-name">Nome</label><input id="auth-name" autocomplete="name" required maxlength="120" placeholder="O seu nome">'
    : "";
  const action = mode === "signup" ? "Criar conta" : "Entrar";
  const passwordHint = mode === "signup" ? '<small>Use pelo menos 8 caracteres.</small>' : "";

  document.getElementById("mf").innerHTML = `<p class="q" id="auth-title">${title}</p><div class="social-auth"><button class="btn d" type="button" onclick="PCC.signInGoogle()">Continuar com Google</button></div><div class="auth-divider"><span>ou use o email</span></div><form onsubmit="return PCC.submitEmailAuth(event, '${mode}')">${nameField}<label for="auth-email">Email</label><input id="auth-email" type="email" autocomplete="email" required maxlength="254" placeholder="nome@exemplo.com"><label for="auth-password">Palavra-passe</label><input id="auth-password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" minlength="8" required placeholder="Mínimo 8 caracteres">${passwordHint}<p class="er" id="auth-error" role="status" aria-live="polite"></p><button class="btn d" type="submit">${action}</button></form><p class="account-note">Ao criar conta, poderá guardar piscinas, moradas e histórico de serviços.</p>`;
  document.querySelector("#md [role=dialog]").setAttribute("aria-labelledby", "auth-title");
}

function renderAuth() {
  const auth = document.getElementById("auth");
  const accountNav = document.getElementById("account-nav");
  accountNav.hidden = !currentUser;
  section.hidden = !currentUser;

  if (!currentUser) {
    auth.innerHTML = '<button class="lnk2" onclick="om(\'signin\')">Entrar</button><button class="btn sm" onclick="om(\'signup\')">Criar conta</button>';
    return;
  }

  const firstName = (profile?.full_name || currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email || "Conta").split(" ")[0];
  window.U = { n: profile?.full_name || currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || firstName, t: profile?.phone || "" };
  auth.innerHTML = `<a class="lnk2 account-shortcut" href="#conta">Minha conta</a><span class="hi" title="${escapeHtml(currentUser.email)}">${escapeHtml(firstName)}</span><button class="lnk2" onclick="PCC.signOut()">Sair</button>`;
}

async function loadAccount() {
  if (!currentUser) return;
  const [profileResult, poolsResult, historyResult] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,phone,marketing_opt_in,marketing_opt_in_at").eq("id", currentUser.id).maybeSingle(),
    supabase.from("pools").select("id,label,address,pool_type,created_at").eq("user_id", currentUser.id).order("created_at", { ascending: false }),
    supabase.from("service_requests").select("id,service_type,status,visit_date,time_preference,details,pool_id,created_at").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(30),
  ]);

  if (profileResult.error || poolsResult.error || historyResult.error) {
    showError("Não foi possível carregar os dados. Confirme se as migrações do Supabase foram aplicadas.");
    return;
  }

  profile = profileResult.data;
  pools = poolsResult.data || [];
  window.U = { n: profile?.full_name || currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || "", t: profile?.phone || "" };
  document.getElementById("account-email").textContent = currentUser.email || "";
  document.getElementById("profile-name").value = profile?.full_name || currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || "";
  document.getElementById("profile-phone").value = profile?.phone || "";
  const marketing = document.getElementById("marketing-opt-in");
  marketing.checked = Boolean(profile?.marketing_opt_in);
  renderPools();
  renderHistory(historyResult.data || []);
  renderAuth();
  renderPoolPicker();
}

function renderPools() {
  const list = document.getElementById("pool-list");
  if (!pools.length) {
    list.innerHTML = '<p class="account-note">Ainda não guardou nenhuma piscina.</p>';
    return;
  }
  list.innerHTML = pools.map((pool) => `<div class="pool-row"><div><strong>${escapeHtml(pool.label)}</strong><p>${escapeHtml(pool.address)}${pool.pool_type ? ` · ${escapeHtml(pool.pool_type)}` : ""}</p></div><div class="pool-actions"><button type="button" aria-label="Editar ${escapeHtml(pool.label)}" onclick="PCC.editPool('${pool.id}')">Editar</button><button type="button" aria-label="Remover ${escapeHtml(pool.label)}" onclick="PCC.removePool('${pool.id}')">Remover</button></div></div>`).join("");
}

function renderHistory(requests) {
  const list = document.getElementById("service-history");
  if (!requests.length) {
    list.innerHTML = '<p class="account-note">Os pedidos enviados com a sua conta aparecerão aqui.</p>';
    return;
  }
  const names = { pis: "Construção de piscina", jac: "Jacuzzi", lim: "Limpeza e manutenção", agua: "Tratamento de água" };
  const statuses = { requested: "Pedido enviado", confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado" };
  list.innerHTML = requests.map((request) => {
    const visit = request.visit_date ? `Visita: ${displayDate(request.visit_date)}${request.time_preference ? ` · ${escapeHtml(request.time_preference)}` : ""}` : `Pedido: ${displayDate(request.created_at.slice(0, 10))}`;
    return `<div class="history-row"><div><strong>${escapeHtml(names[request.service_type] || request.service_type)}</strong><p>${visit}</p></div><span class="account-note">${escapeHtml(statuses[request.status] || request.status)}</span></div>`;
  }).join("");
}

function renderPoolPicker() {
  const picker = document.getElementById("saved-pool-picker");
  if (!picker || !currentUser) return;
  const signature = `${currentUser.id}:${pools.map((pool) => `${pool.id}:${pool.label}:${pool.address}`).join(",")}`;
  if (picker.dataset.signature === signature) return;
  picker.dataset.signature = signature;
  if (!pools.length) {
    picker.innerHTML = '<p class="account-note">Entre na sua conta e guarde uma piscina para reutilizar a morada nos próximos pedidos.</p>';
    return;
  }
  picker.innerHTML = `<label for="saved-pool">Usar piscina guardada</label><select id="saved-pool" onchange="PCC.selectPool(this.value)"><option value="">Nenhuma, vou indicar a morada</option>${pools.map((pool) => `<option value="${pool.id}">${escapeHtml(pool.label)} · ${escapeHtml(pool.address)}</option>`).join("")}</select>`;
}

async function applySession(session) {
  currentUser = session?.user || null;
  profile = null;
  window.PCC_SELECTED_POOL = null;
  window.U = null;
  renderAuth();
  if (currentUser) await loadAccount();
  else {
    const picker = document.getElementById("saved-pool-picker");
    if (picker) {
      picker.innerHTML = "";
      delete picker.dataset.signature;
    }
    document.getElementById("account-email").textContent = "";
    document.getElementById("pool-list").innerHTML = "";
    document.getElementById("service-history").innerHTML = "";
  }
}

window.om = function openAuth(mode = "signin") {
  renderModal(mode);
  modal.hidden = false;
};
window.tab = function switchAuthMode(mode) {
  renderModal(mode === 2 || mode === "signup" ? "signup" : "signin");
};
window.cm = function closeAuth() {
  modal.hidden = true;
};

window.PCC = {
  async signInGoogle() {
    showError("");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      showError("Não foi possível iniciar Google. Confirme se o provedor está ativo no Supabase.");
      return;
    }

    try {
      const response = await fetch(data.url, { redirect: "manual" });
      if (response.type === "opaqueredirect" || response.ok || (response.status >= 300 && response.status < 400)) {
        window.location.assign(data.url);
        return;
      }
      const result = await response.json().catch(() => null);
      if (result?.error_code === "validation_failed" && /provider is not enabled/i.test(result.msg || "")) {
        showError("Google ainda não está configurado no serviço. Tente entrar com email ou contacte o administrador.");
        return;
      }
      showError("Não foi possível iniciar Google. Tente novamente ou use email e palavra-passe.");
    } catch {
      window.location.assign(data.url);
    }
  },

  async submitEmailAuth(event, mode) {
    event.preventDefault();
    showError("");
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;

    if (mode === "signup") {
      const name = document.getElementById("auth-name").value.trim();
      if (!name) {
        showError("Indique o seu nome para criar a conta.");
        return false;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name }, emailRedirectTo: window.location.href },
      });
      if (error) showError(error.message);
      else if (!data.session) showError("Conta criada. Verifique o seu email para confirmar o endereço e entrar.");
      else window.cm();
      return false;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showError("Email ou palavra-passe incorretos.");
    else window.cm();
    return false;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) window.alert("Não foi possível terminar a sessão.");
  },

  async saveProfile(event) {
    event.preventDefault();
    const feedback = document.getElementById("profile-feedback");
    feedback.textContent = "A guardar…";
    const fullName = document.getElementById("profile-name").value.trim();
    const phone = document.getElementById("profile-phone").value.trim();
    const { error } = await supabase.from("profiles").update({
      full_name: fullName,
      phone: phone || null,
    }).eq("id", currentUser.id);

    if (error) {
      feedback.textContent = "Não foi possível guardar os dados. Tente novamente.";
      return false;
    }

    profile.full_name = fullName;
    profile.phone = phone || null;
    window.U = { n: fullName, t: phone };
    renderAuth();
    feedback.textContent = "Dados guardados.";
    return false;
  },

  async updateMarketing(accepted) {
    if (!currentUser || !profile) return;
    const { error } = await supabase.from("profiles").update({
      marketing_opt_in: accepted,
      marketing_opt_in_at: accepted ? new Date().toISOString() : null,
    }).eq("id", currentUser.id);
    if (error) {
      document.getElementById("marketing-opt-in").checked = Boolean(profile.marketing_opt_in);
      window.alert("Não foi possível guardar a preferência de email.");
      return;
    }
    profile.marketing_opt_in = accepted;
    profile.marketing_opt_in_at = accepted ? new Date().toISOString() : null;
  },

  async addPool(event) {
    event.preventDefault();
    const poolId = document.getElementById("pool-id").value;
    const values = {
      label: document.getElementById("pool-label").value.trim(),
      address: document.getElementById("pool-address").value.trim(),
      pool_type: document.getElementById("pool-type").value || null,
    };
    const query = poolId
      ? supabase.from("pools").update(values).eq("id", poolId)
      : supabase.from("pools").insert(values);
    const { error } = await query;
    if (error) {
      document.getElementById("pool-feedback").textContent = "Não foi possível guardar a piscina. Tente novamente.";
      return false;
    }
    event.target.reset();
    document.getElementById("pool-id").value = "";
    document.getElementById("pool-submit").textContent = "Guardar piscina";
    document.getElementById("pool-cancel").hidden = true;
    document.getElementById("pool-feedback").textContent = poolId ? "Piscina atualizada." : "Piscina guardada.";
    await loadAccount();
    return false;
  },

  editPool(id) {
    const pool = pools.find((item) => item.id === id);
    if (!pool) return;
    document.getElementById("pool-id").value = pool.id;
    document.getElementById("pool-label").value = pool.label;
    document.getElementById("pool-address").value = pool.address;
    document.getElementById("pool-type").value = pool.pool_type || "";
    document.getElementById("pool-submit").textContent = "Atualizar piscina";
    document.getElementById("pool-cancel").hidden = false;
    document.getElementById("pool-feedback").textContent = "A editar piscina.";
    document.getElementById("pool-form").scrollIntoView({ behavior: "smooth", block: "center" });
  },

  cancelPoolEdit() {
    document.getElementById("pool-form").reset();
    document.getElementById("pool-id").value = "";
    document.getElementById("pool-submit").textContent = "Guardar piscina";
    document.getElementById("pool-cancel").hidden = true;
    document.getElementById("pool-feedback").textContent = "";
  },

  async removePool(id) {
    const { error } = await supabase.from("pools").delete().eq("id", id);
    if (error) {
      window.alert("Não foi possível remover a piscina.");
      return;
    }
    await loadAccount();
  },

  selectPool(id) {
    window.PCC_SELECTED_POOL = pools.find((pool) => pool.id === id) || null;
    if (!window.PCC_SELECTED_POOL || !window.A) return;
    window.A["Localização"] = window.PCC_SELECTED_POOL.address;
    const summary = [...document.querySelectorAll(".sum div")].find((row) => row.firstElementChild?.textContent === "Localização");
    if (summary) summary.lastElementChild.textContent = window.PCC_SELECTED_POOL.address;
  },

  async saveRequest({ serviceId, poolId, answers, name, phone, notes }) {
    if (!currentUser) return;
    const visitDate = /^\d{4}-\d{2}-\d{2}$/.test(answers.Dia || "") ? answers.Dia : null;
    const { error } = await supabase.from("service_requests").insert({
      service_type: serviceId,
      pool_id: poolId || null,
      visit_date: visitDate,
      time_preference: answers.Horário || null,
      details: { answers, customer: { name, phone, notes } },
    });
    if (error) throw error;
    await loadAccount();
  },
};

const wizard = document.getElementById("wiz");
new MutationObserver(renderPoolPicker).observe(wizard, { childList: true, subtree: true });

const { data: { session } } = await supabase.auth.getSession();
await applySession(session);
supabase.auth.onAuthStateChange((_event, nextSession) => {
  queueMicrotask(() => applySession(nextSession));
});
