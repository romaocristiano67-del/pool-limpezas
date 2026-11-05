# Pool Cleaning Construction

Site em Vite com autenticação Google e dados persistidos no Supabase.

## Desenvolvimento

1. Instale Node.js 20.19+ ou 22.12+.
2. Mantenha no `env.local` as linhas `api ur = ...` e `chave publica = ...`. A chave publicável é usada no browser; `chave secreta` nunca é carregada pela aplicação cliente.
3. Execute `npm install` e `npm run dev`.
4. Abra a página indicada pelo Vite. O ficheiro `env.local` é ignorado pelo Git.

## Base de dados e Google

1. No Supabase, ative Google e Apple em **Authentication > Sign In / Providers** e configure as credenciais OAuth de cada provedor que pretende oferecer.
2. Em **Authentication > URL Configuration**, adicione como redirect permitido o URL local indicado pelo Vite e o URL de produção do site. Configure também a URL de callback OAuth do Supabase na consola Google e Apple.
3. Ligue a CLI ao projecto e aplique a migração: `npx supabase login`, `npx supabase link --project-ref <project-ref>` e `npx supabase db push`.
4. A migração cria `profiles`, `pools` e `service_requests`, RLS por utilizador e o perfil automático após registo por email ou login social. Os utilizadores podem entrar ou criar conta por email e palavra-passe, Google ou Apple; confirme o email quando a confirmação estiver ativa no Supabase.

## Emails

Os dois envios usam Resend. Verifique o domínio de envio no Resend e configure os segredos no projecto Supabase, sem os colocar no frontend:

```powershell
npx supabase secrets set RESEND_API_KEY=<chave-resend> EMAIL_FROM=<remetente-verificado> CRON_SECRET=<segredo-cron> PROMOTION_ADMIN_SECRET=<segredo-admin> SITE_URL=<url-publico-do-site>
npx supabase functions deploy send-visit-reminders --no-verify-jwt
npx supabase functions deploy send-promotion --no-verify-jwt
```

No painel Supabase, agende `send-visit-reminders` para executar diariamente às 07:00 UTC com o cabeçalho `x-cron-secret` igual ao segredo `CRON_SECRET`. A função envia lembretes das visitas marcadas para o dia seguinte em Angola e marca cada lembrete enviado para evitar duplicados.

Para uma campanha, faça POST para a função `send-promotion` com `x-admin-secret` igual ao segredo `PROMOTION_ADMIN_SECRET` e JSON com `subject`, `html` e, opcionalmente, `text`. A função consulta apenas perfis com `marketing_opt_in = true`. O consentimento começa desligado e pode ser retirado na conta do utilizador.

## Segurança

Uma chave identificada como secreta foi colocada no `env.local` deste workspace e partilhada anteriormente na conversa. Considere-a comprometida: revogue-a no Supabase e emita uma nova. A aplicação não precisa dessa chave; use-a apenas em ambientes backend confiáveis. Nunca a publique em HTML, JavaScript cliente, Git ou pedidos enviados pelo browser.