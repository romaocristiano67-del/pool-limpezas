import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!Deno.env.get("PROMOTION_ADMIN_SECRET") || request.headers.get("x-admin-secret") !== Deno.env.get("PROMOTION_ADMIN_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("EMAIL_FROM");
  const siteUrl = Deno.env.get("SITE_URL");
  if (!resendKey || !emailFrom || !siteUrl) return new Response("Email settings are incomplete", { status: 500 });

  let message: { subject?: string; html?: string; text?: string };
  try {
    message = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!message.subject?.trim() || !message.html?.trim()) {
    return new Response("A subject and HTML body are required", { status: 400 });
  }

  let sent = 0;
  let failed = 0;
  for (let offset = 0; ; offset += 100) {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id,email")
      .eq("marketing_opt_in", true)
      .range(offset, offset + 99);

    if (error) return Response.json({ error: error.message, sent, failed }, { status: 500 });
    if (!profiles?.length) break;

    for (let index = 0; index < profiles.length; index += 10) {
      const batch = profiles.slice(index, index + 10);
      const results = await Promise.all(batch.map(async (profile) => {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: emailFrom,
            to: [profile.email],
            subject: message.subject,
            html: `${message.html}<hr><p>Recebe esta mensagem porque aceitou receber promoções da Pool Cleaning Construction. Pode alterar a sua preferência <a href="${siteUrl.replace(/"/g, "&quot;")}#conta">na sua conta</a>.</p>`,
            text: message.text,
          }),
        });
        return response.ok;
      }));
      sent += results.filter(Boolean).length;
      failed += results.filter((result) => !result).length;
    }
  }

  return Response.json({ sent, failed });
});