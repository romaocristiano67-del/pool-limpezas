# Pool Cleaning Construction

Site em Vite com autenticação Google e dados persistidos no Supabase.

## Desenvolvimento

1. Instale Node.js 20.19+ ou 22.12+.
2. O `env.local` contém as mesmas duas variáveis públicas que deve cadastrar no Vercel: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Copie cada nome e valor para **Project Settings > Environment Variables**. A chave publicável/anon pode ficar no browser; a chave secreta não deve estar neste ficheiro nem ser prefixada com `VITE_`.
3. Execute `npm install` e `npm run dev`.
4. Abra a página indicada pelo Vite. O ficheiro `env.local` é ignorado pelo Git.

## Deploy no Vercel

1. Importe `https://github.com/romaocristiano67-del/pool-limpezas` no Vercel e selecione a branch `main`.
2. O `vercel.json` define Vite, `npm run build` e `dist`; o build publica a página como `index.html`.
3. Em **Project Settings > Environment Variables**, copie as duas variáveis públicas do `env.local`. Cadastre `VITE_SUPABASE_URL` com a URL raiz do projecto e `VITE_SUPABASE_PUBLISHABLE_KEY` com a chave publicável. Nunca cadastre a chave secreta como variável `VITE_` nem a inclua no frontend.
4. Faça redeploy depois de guardar as variáveis. A configuração também aceita `VITE_SUPABASE_ANON_KEY` se o projecto ainda usar a chave anon legada.
5. Em Supabase **Authentication > URL Configuration**, defina o domínio de produção Vercel como Site URL e inclua-o em Redirect URLs. Adicione domínios de Preview apenas se forem necessários para testar OAuth.

O Vercel hospeda apenas o site estático. Migrações e funções de email continuam no Supabase e devem ser publicadas/configuradas conforme as secções abaixo.

## Base de dados e Google

1. No Supabase, ative Google em **Authentication > Sign In / Providers** e configure as credenciais OAuth.
2. Em **Authentication > URL Configuration**, adicione como redirect permitido o URL local indicado pelo Vite e o URL de produção do site. Configure também a URL de callback OAuth do Supabase na consola Google.
3. Ligue a CLI ao projecto e aplique as migrações em ordem: `npx supabase login`, `npx supabase link --project-ref <project-ref>` e `npx supabase db push`. A migração `20261105000000_initial.sql` cria as tabelas; `20261105010000_fix_profile_trigger.sql` depende de `public.profiles` e não deve ser executada sozinha.
4. Se usar o SQL Editor do Supabase em vez da CLI, execute primeiro o conteúdo completo de `20261105000000_initial.sql` e, só depois, o conteúdo completo de `20261105010000_fix_profile_trigger.sql`. As migrações criam `profiles`, `pools` e `service_requests`, RLS por utilizador e o perfil automático após registo por email ou Google; a corretiva atualiza perfis existentes. Os utilizadores podem entrar ou criar conta por email e palavra-passe ou Google; confirme o email quando a confirmação estiver ativa no Supabase.

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