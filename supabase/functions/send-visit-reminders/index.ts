import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function tomorrowInLuanda() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Luanda",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const today = `${values.year}-${values.month}-${values.day}`;
  return new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!Deno.env.get("CRON_SECRET") || request.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM");
  if (!resendKey || !emailFrom) return new Response("Email provider is not configured", { status: 500 });

  const visitDate = tomorrowInLuanda();
  const { data: requests, error } = await supabase
    .from("service_requests")
    .select("id,user_id,pool_id,service_type,visit_date,time_preference,details")
    .eq("visit_date", visitDate)
    .is("reminder_sent_at", null);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!requests?.length) return Response.json({ sent: 0, visitDate });

  const userIds = [...new Set(requests.map((item) => item.user_id))];
  const poolIds = [...new Set(requests.flatMap((item) => item.pool_id ? [item.pool_id] : []))];
  const [{ data: profiles }, { data: pools }] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name").in("id", userIds),
    poolIds.length ? supabase.from("pools").select("id,label,address").in("id", poolIds) : Promise.resolve({ data: [] }),
  ]);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const poolById = new Map((pools ?? []).map((pool) => [pool.id, pool]));
  let sent = 0;
  const failures: string[] = [];

  for (const item of requests) {
    const profile = profileById.get(item.user_id);
    if (!profile?.email) continue;
    const pool = item.pool_id ? poolById.get(item.pool_id) : null;
    const answers = item.details?.answers ?? {};
    const location = pool?.address || answers["Localização"] || "";
    const service = ({ lim: "Limpeza e manutenção", agua: "Tratamento de água", pis: "Construção de piscina", jac: "Jacuzzi" } as Record<string, string>)[item.service_type] ?? item.service_type;
    const date = new Intl.DateTimeFormat("pt-AO", { dateStyle: "long", timeZone: "Africa/Luanda" })
      .format(new Date(`${item.visit_date}T12:00:00+01:00`));
    const details = [
      `<p><strong>Serviço:</strong> ${escapeHtml(service)}</p>`,
      `<p><strong>Data:</strong> ${escapeHtml(date)}</p>`,
      item.time_preference ? `<p><strong>Horário:</strong> ${escapeHtml(item.time_preference)}</p>` : "",
      location ? `<p><strong>Local:</strong> ${escapeHtml(location)}</p>` : "",
    ].join("");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: emailFrom,
        to: [profile.email],
        subject: "Lembrete da sua visita de amanhã",
        html: `<p>Olá${profile.full_name ? ` ${escapeHtml(profile.full_name)}` : ""},</p><p>Este é um lembrete da visita agendada para amanhã.</p>${details}<p>Pool Cleaning Construction</p>`,
      }),
    });

    if (!response.ok) {
      failures.push(item.id);
      continue;
    }

    const { error: updateError } = await supabase
      .from("service_requests")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", item.id)
      .is("reminder_sent_at", null);
    if (updateError) failures.push(item.id);
    else sent += 1;
  }

  return Response.json({ sent, failed: failures.length, visitDate });
});