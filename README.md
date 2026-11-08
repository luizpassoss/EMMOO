# EMMOO — Sistema de Gestão de Agenda, Mensalidades e Presença

[![CI](https://github.com/luizpassoss/EMMOO/actions/workflows/ci.yml/badge.svg)](https://github.com/luizpassoss/EMMOO/actions/workflows/ci.yml)

Aplicação web (responsiva, *mobile-first*) que substitui o controle manual e o WhatsApp da **Escola de Música EMMOO**,
centralizando agenda de aulas, reposições, presença, diário de aula e mensalidades.
É **multi-tenant**: o mesmo sistema atende várias escolas, cada uma com os próprios usuários e dados.

Projeto de Portfólio — Engenharia de Software, Católica SC · Linha **Web App** · Parceiro externo: **Escola de Música EMMOO**
· Autor: **Luiz Fernando Passos de Oliveira**

> **Status:** em desenvolvimento — iteração 3: todos os requisitos funcionais da RFC implementados (RF01–RF15), com
> aviso de falta e reposição, presença e diário, mensalidades com alertas e recibo, painel, histórico e relatórios.

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | React 18 + Vite (SPA), React Router; fontes empacotadas com o app: Plus Jakarta Sans nos títulos e Inter no texto (`@fontsource-variable/*`) |
| Back-end | Node.js 22 + Express (API REST em camadas) |
| Banco de dados | MySQL 8 via Prisma ORM |
| Segurança | JWT + bcrypt, Helmet, CORS |
| Documentos e e-mail | PDFKit (recibo e relatório mensal em PDF) e Nodemailer (alertas de pagamento por SMTP, opcional) |
| Testes | `node:test` (API) e Vitest + Testing Library (Web) |
| DevOps | Docker, Docker Compose, Nginx, GitHub Actions (CI) |

## Estrutura

```
emmoo-gestao/
├── api/                  # API REST (Node.js + Express)
│   ├── prisma/           # schema.prisma (espelha o DER da RFC), seed, emmoo.sql e migracoes/ (para bancos já existentes)
│   ├── src/
│   │   ├── domain/       # regras puras: regras.js (RN05, RN07, RN09–RN13), agenda.js (RF04–RF05),
│   │   │                 # reposicoes.js (RF06–RF07, RN04–RN06, RN11–RN12) e mensalidades.js (RF10–RF12, RN13)
│   │   ├── modules/      # auth, escolas, usuarios, planos, alunos, horarios, aulas, reposicoes, mensalidades,
│   │   │                 # indicadores, historico, relatorios (routes → controller → service)
│   │   ├── infra/        # repositórios (memória e Prisma/MySQL), segurança (JWT, bcrypt), PDF e e-mail
│   │   ├── middlewares/  # autenticação, autorização por papel, tratamento de erros
│   │   ├── app.js        # montagem do Express
│   │   ├── container.js  # raiz de composição (injeção de dependências)
│   │   ├── rotinas.js    # rotina de hora em hora: mensalidades do mês e alertas de pagamento (RF10/RF12)
│   │   └── server.js     # ponto de entrada
│   └── tests/            # unit, integration e adapters
├── web/                  # SPA React (Vite)
│   └── src/              # api/, auth/, components/, pages/, utils/
├── scripts/dev.mjs       # "npm run dev" na raiz: sobe API e front juntos
├── package.json          # atalhos da raiz: setup, dev e test
├── docs/arquitetura.md   # arquitetura, decisões (ADRs) e rastreabilidade RFC → código
├── docker-compose.yml    # MySQL + API + Web
└── .github/              # CI, templates de Pull Request e Issues
```

## Como executar

**Pré-requisitos:** [Node.js 22 ou superior](https://nodejs.org) (no Windows: `winget install OpenJS.NodeJS.LTS`).
Para usar banco de dados: MySQL do [XAMPP](https://www.apachefriends.org) **ou** [Docker Desktop](https://www.docker.com/products/docker-desktop/).

### Jeito rápido — um comando, um terminal

Na pasta raiz do projeto:

```powershell
npm run setup   # uma vez: instala as dependências da API e do front e gera o cliente do Prisma
npm run dev     # sobe a API (http://localhost:3333) e o front (http://localhost:5173) juntos
```

Abra **http://localhost:5173**. As linhas do terminal vêm marcadas com `[api]` ou `[web]`; `Ctrl+C` encerra os dois.
A persistência segue o `api/.env` (copie de `api/.env.example`): `DB_DRIVER=memory` roda sem banco
(dados de exemplo recriados a cada reinício) e `DB_DRIVER=mysql` usa o banco de `DATABASE_URL`.

> Prefere dois terminais? Rode `npm run dev` dentro de `api/` e, em outro terminal, dentro de `web/`.
> **A API precisa estar rodando:** sem ela, a tela de login avisa que a API não está respondendo.

### Banco no XAMPP (importando o arquivo .sql)

1. Com o MySQL ligado no painel do XAMPP, abra http://localhost/phpmyadmin → **Importar** →
   escolha [`api/prisma/emmoo.sql`](api/prisma/emmoo.sql) → **Importar**. O script cria o banco `emmoo` com
   tabelas e dados de demonstração (se o banco já existir, as tabelas são recriadas e os dados, perdidos).
2. No `api/.env`: `DB_DRIVER=mysql` e `DATABASE_URL=mysql://root:@localhost:3306/emmoo` (root sem senha, padrão do XAMPP).
3. `npm run setup` (se ainda não rodou) e `npm run dev`.

**Já tinha importado uma versão anterior e quer manter os seus dados?** Em vez de reimportar o `emmoo.sql`,
faça um backup (phpMyAdmin → banco `emmoo` → **Exportar**) e importe no banco `emmoo`, em ordem, os arquivos de
[`api/prisma/migracoes/`](api/prisma/migracoes/) que ainda não rodou — cada um diz no topo quando usar:

- `01-multitenant.sql` — banco de antes das escolas: tudo o que existe passa a ser da escola `emmoo`, e os acessos da
  Lucimara e do Luiz mudam para os da tabela abaixo.
- `02-motivo-cancelamento.sql` — guarda por que cada aula foi cancelada, para a reativação devolver as aulas certas.
- `03-acesso-e-feriados.sql` — permite desativar o acesso de usuários e cadastrar feriados e recessos da escola.
- `04-nomes-dos-planos.sql` — renomeia os planos com o nome antigo sugerido pelo sistema ("Particular 1x/semana") para
  o nome por extenso ("Particular · 1 aula por semana"); nomes escolhidos pela escola não mudam. Rode antes do seed.
- `05-faltas-reposicoes-e-alertas.sql` — liga cada reposição à aula perdida, guarda se o aviso de falta deu direito a
  reposição e cria a tabela de alertas de pagamento por e-mail. Só acrescenta: nenhum dado existente muda.
- `06-mensalidades-remarcacao-senha-e-pix.sql` — ajuste de valor, cancelamento e número de recibo das mensalidades
  (os pagamentos já registrados recebem os números em ordem de data), remarcação de aula no histórico, Pix da escola e
  a tabela dos links de "esqueci minha senha". Só acrescenta: nenhum dado existente muda.

Depois de mudar o banco, reinicie a API (`Ctrl+C` e `npm run dev`).

Se algo estiver errado, a API não sobe e diz o motivo: MySQL desligado, banco não importado, cliente do Prisma
não gerado ou porta 3333 já em uso (API aberta em outro terminal).

### Banco com Docker

```powershell
docker compose up --build
```

Acesse **http://localhost:8080**. O schema é criado automaticamente e os usuários de demonstração são cadastrados.

### Banco MySQL já instalado (sem importar o .sql)

No `api/.env`, defina `DB_DRIVER=mysql` e ajuste `DATABASE_URL`. Depois, em `api/`: `npm run db:push`
(cria as tabelas a partir do `schema.prisma`), `npm run db:seed` (dados iniciais) e `npm run dev`.

### Usuários de demonstração

Todos na escola de código **`emmoo`** (campo "Escola" do login — depois do primeiro acesso, o aparelho lembra).

| Perfil | Usuário ou e-mail | Senha |
|---|---|---|
| Coordenação (Lucimara) | `admin` (ou `lucimara@emmoo.com.br`) | `admin` |
| Professor (Luiz) | `luiz` (ou `luiz@emmoo.com.br`) | `Luiz123` |
| Responsável (Mary) | `mary@emmoo.com.br` | `emmoo123` |

> Senhas fracas, apenas para desenvolvimento. Troque as senhas e o `JWT_SECRET` antes de qualquer uso real.

### Várias escolas (multi-tenant)

- **Escola nova:** na tela de login, **"Cadastre a sua"** (`/cadastro`) cria a escola e o acesso de quem vai coordená-la,
  e já entra. O código escolhido (ex.: `escola-sol`) é o que todos daquela escola digitam no login.
- **Equipe:** a coordenação dá acesso a professores, responsáveis e outras coordenadoras em **Usuários** — e tira:
  **Desativar acesso** encerra na hora a sessão aberta da pessoa e impede novos logins (dá para reativar depois).
  Trocar o perfil de alguém ou redefinir a senha dessa pessoa também encerra as sessões dela.
- **Feriados e recessos:** cada escola marca os seus dias sem aula na **Agenda** (coordenação). As aulas desses dias
  saem da agenda, as séries semanais pulam essas datas e os horários livres não oferecem esses dias; removido o
  feriado, as aulas voltam. **Feriados nacionais** cadastra os do ano de uma vez (com a Páscoa calculada: Sexta-feira
  Santa; Carnaval e Corpus Christi vêm como pontos facultativos, desmarcados) — os que já passaram ou já estão
  cadastrados ficam de fora.
- **Isolamento:** o token carrega a escola, e todas as consultas são filtradas por ela — uma escola não vê, não edita e
  não exclui dados de outra, nem pelo id. O mesmo usuário (`admin`) pode existir em cada escola, com senhas diferentes.
- **Link direto:** `http://localhost:5173/login?escola=emmoo` já abre o login com a escola preenchida.
- **Cadastro aberto ou fechado:** `CADASTRO_ESCOLAS=aberto|fechado` no `api/.env` (padrão: aberto em desenvolvimento,
  fechado em produção). Fechado, o link some do login e a API recusa novos cadastros (403).

### O que cada perfil faz

- **Responsável:** no Início, cada dependente com a próxima aula (**Avisar falta**), a reposição a escolher e as
  mensalidades. Avisada com pelo menos 24 horas de antecedência, a falta dá direito a repor a aula em até 30 dias, num
  horário livre do mesmo professor, sem custo (RN05, RN06, RN11); com menos, fica registrada, sem reposição. O horário
  ocupado é recusado com sugestões de horários livres. Em **Mensalidades**, o que está em aberto e os últimos
  pagamentos, com o recibo em PDF, e **Pix** em cada mensalidade em aberto: o QR Code e o "copia e cola" com a chave
  da escola e o valor certo (a escola confere o recebimento e registra a baixa); o **Histórico de pagamentos**
  completo; e, no **Histórico** do aluno, presença, diário, reposições, remarcações e pagamentos.
- **Professor:** em **Aulas**, as que já começaram e faltam registrar: presença ou falta, conteúdo ministrado e o plano
  para a próxima aula — que aparece na aula seguinte do aluno (RF08, RF09). Remarca as próprias aulas (nova data e
  horário, a mesma aula, com os horários livres dele à mão). Vê o histórico dos próprios alunos, sem dados financeiros
  nem de contato.
- **Coordenação:** tudo isso e mais: **Mensalidades** geradas por plano (proporcionais no mês da matrícula — RN13),
  com a lista do mês começando pelas atrasadas; baixa com data e forma de pagamento — **Pix ou dinheiro**, as formas que
  a escola recebe —, já com o recibo à mão; **Histórico de pagamentos** (de todos ou de um aluno, com o total por Pix e
  em dinheiro); alertas de vencimento e atraso; **Relatórios** do mês (financeiro e presença por aluno) na tela e em
  PDF; e o painel com aulas a registrar, presença dos últimos 30 dias e inadimplência. Aula cancelada pela escola dá
  direito a reposição sem contar no limite de uma por mês (RN12).
- **Cobrança sob medida:** na mensalidade em aberto, **Ajustar valor** (desconto, bolsa, correção — com o motivo; o
  valor do plano fica guardado e dá para voltar a ele) e **Cancelar cobrança** (sai do previsto, da inadimplência e dos
  alertas, e pode ser reaberta). A paga não muda: desfaça a baixa antes. Ao inativar um aluno, a confirmação oferece
  cancelar junto as mensalidades em aberto dele.
- **Recibo numerado:** cada pagamento recebe o próximo número de recibo da escola (000001, 000002…), que fica com a
  mensalidade mesmo se a baixa for desfeita e refeita.
- **Planilhas para a contabilidade:** em **Relatórios**, mensalidades e presença do mês em CSV, que o Excel em português
  abre direto (acentos, vírgula decimal, datas dd/mm/aaaa), com responsável, número do recibo e o motivo de ajustes e
  cancelamentos.
- **Pix da escola:** em **Escola** (menu Mais), o nome da escola e a chave Pix (CPF, CNPJ, celular, e-mail ou chave
  aleatória, conferida), com um QR de exemplo para testar no app do banco antes de as famílias usarem.
- **Remarcar aula:** no detalhe da aula, **Remarcar** muda dia e horário sem cancelar (o horário novo é conferido contra
  as outras aulas do professor e do aluno e contra os feriados; a reposição fica no prazo de 30 dias), e a mudança vai
  para o histórico do aluno.
- **Fim da série de aulas:** no Início, **Alunos para agendar** lista quem está sem aula marcada ou com a última nas
  próximas 2 semanas; tocar abre o agendamento já preenchido com o mesmo professor, dia da semana e horário, por 12
  semanas.
- **Professor novo já com horários:** ao criar o acesso de um professor em **Usuários**, a coordenação define os dias
  e o período de atendimento (sugestão: segunda a sexta, das 14:00 às 18:00, aulas de 45 min) e os horários são
  criados junto — o agendamento passa a sugerir os horários livres dele na hora. Para quem já existe, a edição do
  professor mostra o resumo dos horários e permite gerar mais (sem duplicar os que já existem); ajustes um a um ficam
  na **Agenda**. Sem horários, o agendamento avisa e leva até a configuração.

### Mensalidades automáticas e alertas por e-mail

Ao iniciar e depois a cada hora, a API gera as mensalidades do mês atual que faltam (alunos ativos), passa a
"atrasada" a que venceu sem pagamento e registra os alertas: vencimento nos 3 dias antes e atraso depois (RF10, RF12).
No `api/.env`:

- `SMTP_URL=smtps://usuario:senha@smtp.servidor.com:465` envia os alertas ao e-mail do responsável (`EMAIL_REMETENTE`
  define o remetente). Sem `SMTP_URL`, os alertas ficam registrados como pendentes e aparecem em **Mensalidades**; o que
  falhar no envio é tentado de novo na rotina seguinte (até 5 vezes) ou pelo botão **Enviar agora**.
- `ROTINAS=desligadas` desliga a rotina (nos testes ela já fica desligada).

### Senha e segurança do acesso

- **Minha conta:** tocar nas iniciais (celular) ou no próprio nome (menu lateral) abre os dados de acesso e **Trocar
  senha** — com a senha atual; as sessões abertas em outros aparelhos terminam.
- **Esqueci minha senha:** com `SMTP_URL` configurado, o login oferece o link: a pessoa informa a escola e o usuário e
  recebe no e-mail cadastrado um link que vale por 1 hora e uma vez só (o banco guarda só o hash). A resposta é a
  mesma exista ou não a pessoa. `APP_URL` define o endereço do front usado no link (padrão: a primeira origem de
  `CORS_ORIGIN`). Sem e-mail configurado, a tela orienta a pedir uma senha nova à coordenação.
- **Limite de tentativas:** 5 senhas erradas na mesma conta (ou 30 no mesmo endereço) em 15 minutos bloqueiam por um
  tempo, com a mensagem de quanto esperar; o mesmo vale para os pedidos de redefinição. Com a API atrás de um proxy
  (o do Vite, nginx, túnel), defina `TRUST_PROXY` (ex.: `loopback`) para o endereço de quem acessa vir do
  `X-Forwarded-For` — senão, todos contam como o próprio proxy.

### No celular

- **Minimalista:** pouco texto na tela — as páginas mostram o título, os números e as ações, sem subtítulos
  explicativos; os indicadores são cartões simples (rótulo e número, com um ponto no que pede ação); as dicas sob os
  campos ficam só onde mudam o que se preenche; "Voltar" aparece só nas subpáginas (histórico do aluno, histórico de
  pagamentos, minha conta) — as do menu já estão a um toque. No fim da agenda, **Feriados e recessos** e **Horários de
  atendimento** vêm recolhidos (o título e quantos há); tocar no título abre.
- **Formulários em janela:** cadastrar e editar abrem uma janela — no celular, uma folha que sobe de baixo; no
  computador, centralizada sobre a página — com o título, os campos e o rodapé fixo
  ("Cancelar" e a ação principal sempre à vista). Tocar fora, o **X**, o voltar do celular ou **Esc** fecham, e o
  foco do teclado fica dentro da janela até ela fechar. No celular, arrastar o topo da folha para baixo também fecha.
- **Nada se perde sem querer:** fechar um formulário com algo digitado e não salvo pergunta "Descartar as alterações?".
- **Atalhos:** num dia sem aula, **+** abre o agendamento com a data já preenchida (no computador, **+ Agendar**
  aparece ao passar o mouse na coluna); o telefone do aluno ganha o formato "(47) 99999-0001" ao sair do campo; e a
  escolha do plano mostra o valor de cada um.
- **Movimento sutil:** as páginas e listas entram com um leve deslize, a semana desliza para o lado em que se anda, a
  aula cancelada encolhe antes de sair e o aviso mostra uma barra com o tempo que falta. Com "reduzir movimento"
  ligado no sistema, tudo isso é desligado.
- **Confirmações do próprio app:** cancelar aula, inativar ou excluir aluno, excluir plano, desativar acesso e remover
  feriado perguntam antes numa janela do EMMOO (no lugar do `confirm` do navegador), que diz o que vai acontecer.
- **Teclado certo:** campos numéricos abrem o teclado de números; os campos têm 16 px, o que evita o zoom automático
  do iPhone ao tocar.
- **Na tela inicial:** o app tem manifesto e ícones — no Chrome (Android), **Adicionar à tela inicial / Instalar app**;
  no Safari (iPhone), **Compartilhar → Adicionar à Tela de Início**. Abre em tela cheia, como um aplicativo. Não há
  *service worker* de propósito: sem cache offline, cada abertura carrega a versão atual (ver ADR 21).
- **Agenda num relance:** no alto do calendário, uma faixa com os dias da janela — o ponto marca o dia com aula e o
  anel, feriado ou recesso; tocar num dia leva até ele. Dias sem aula ficam mais baixos e discretos.
- **Agenda no computador:** a partir de 1100 px, os 7 dias aparecem lado a lado, em colunas, com o dia de hoje
  destacado.
- **A aula num toque:** tocar numa aula (agenda, Início, Aulas ou histórico) abre os detalhes dela, com o que dá para
  fazer agora — registrar presença e diário, avisar falta, escolher o horário da reposição ou cancelar.
- **Menu "Mais":** a coordenação tem mais páginas do que cabem na barra do celular; Mensalidades, Relatórios, Planos,
  Usuários e Escola ficam em **Mais** (no computador, todas estão no menu lateral).
- **Pagar pelo celular:** no Pix da mensalidade, **Copiar código** põe o "copia e cola" na área de transferência para
  colar no app do banco; no computador, o QR é lido com a câmera do celular.
- **Relatório no celular:** cada linha das tabelas vira um bloco com o nome de cada coluna, sem rolar de lado.
- **Feito para o toque:** o realce de "mouse por cima" não fica grudado depois de tocar; o telefone do aluno, no
  histórico, liga ao ser tocado (e o e-mail abre a mensagem); a barra superior e o menu respeitam o entalhe e a barra
  de início do iPhone; e os indicadores do Início e do histórico são compactos, para caber mais sem rolar.

## Testes e cobertura

```powershell
cd api
npm test                # todos os testes
npm run test:coverage   # falha se a cobertura ficar abaixo de 75%
npm run lint

cd ..\web
npm test
npm run test:coverage   # falha se a cobertura ficar abaixo de 25%
```

As metas seguem a direção da linha Web App: **75% no backend e 25% no frontend**.

## API — endpoints disponíveis

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/health` | público | Saúde do serviço (monitoramento) |
| GET | `/api/escolas/configuracao` | público | Informa se o cadastro de escolas está aberto (`cadastroDeEscolas`) e se o "esqueci minha senha" por e-mail está disponível (`recuperacaoDeSenha`) |
| POST | `/api/escolas` | público | Cadastra escola nova (`nomeEscola`, `codigo`) e quem a coordena (`nome`, `email`, `login` opcional, `senha`); devolve a sessão. Código em uso → 409; cadastro fechado → 403 |
| POST | `/api/auth/login` | público | Autenticação (RF01): `{ escola, login, senha }` — `login` aceita o usuário ou o e-mail; retorna token JWT com a escola |
| GET | `/api/auth/me` | autenticado | Perfil do usuário logado, com a escola |
| PUT | `/api/auth/senha` | autenticado | Troca a própria senha (`senhaAtual`, `novaSenha`): encerra as outras sessões e devolve a sessão nova; 5 senhas atuais erradas em 15 min → 429 |
| POST | `/api/auth/esqueci` | público | `{ escola, login }`: manda ao e-mail cadastrado o link de redefinição (1 hora, uso único); resposta sempre igual; sem SMTP → 409; muitos pedidos → 429 |
| POST | `/api/auth/redefinir` | público | `{ token, novaSenha }`: cria a senha nova pelo link e encerra todas as sessões — devolve o código da escola; link inválido, usado ou vencido → 400 |
| GET | `/api/escola` | coordenação | Dados da escola: nome, código e Pix (`tipo`, `chave`, `recebedor`, `cidade`, `exemplo` com QR e "copia e cola" sem valor) |
| PUT | `/api/escola` | coordenação | Edita o nome e o Pix (`pix: null` remove); a chave é conferida pelo tipo (CPF/CNPJ com dígito verificador, celular, e-mail, aleatória) |
| GET | `/api/usuarios?papel=professor` | coordenação | Lista os usuários da escola, com filtro opcional por papel |
| POST | `/api/usuarios` | coordenação | Cria acesso (`papel`, `nome`, `email`, `login` opcional, `senha`); para professor, `horarios` opcional (`dias`, `inicio`, `fim`, `duracaoMin`) cria a grade de atendimento junto — `horariosCriados`; e-mail ou usuário repetido na escola → 409 |
| PUT | `/api/usuarios/:id` | coordenação | Edita acesso; senha em branco mantém a atual; ninguém muda o próprio perfil; trocar o perfil ou redefinir a senha de outra pessoa encerra as sessões dela |
| PATCH | `/api/usuarios/:id/desativar` | coordenação | Tira o acesso: a sessão aberta termina (401) e o login passa a ser recusado (403); ninguém desativa a si mesmo (409) |
| PATCH | `/api/usuarios/:id/reativar` | coordenação | Devolve o acesso |
| GET | `/api/planos` | autenticado | Lista os planos, com quantos alunos usam cada um (`totalAlunos`, `alunosAtivos`) |
| POST | `/api/planos` | coordenação | Cadastra plano: tipo, valor mensal, 1 a 7 aulas por semana e duração (RF03) |
| PUT | `/api/planos/:id` | coordenação | Edita plano (RF03) |
| DELETE | `/api/planos/:id` | coordenação | Exclui plano sem alunos — recusa (409) se algum aluno, mesmo inativo, usa o plano |
| GET | `/api/alunos?status=ativo` | coordenação, professor | Lista alunos, com filtro opcional |
| GET | `/api/alunos/:id` | coordenação, professor | Detalha um aluno |
| POST | `/api/alunos` | coordenação | Cadastra aluno (RF02) |
| PUT | `/api/alunos/:id` | coordenação | Atualiza aluno (RF02) |
| PATCH | `/api/alunos/:id/inativar` | coordenação | Inativa aluno: as aulas que ainda não começaram saem da agenda e os horários ficam livres (RN08) — `aulasCanceladas`; com `cancelarMensalidades: true`, cancela também as mensalidades em aberto — `mensalidadesCanceladas` |
| PATCH | `/api/alunos/:id/reativar` | coordenação | Reativa aluno inativo e devolve à agenda as aulas que a inativação cancelou e ainda não passaram; as de horário ocupado nesse meio-tempo ficam canceladas — `aulasRestauradas`, `aulasNaoRestauradas` |
| DELETE | `/api/alunos/:id` | coordenação | Exclui **permanentemente** aluno inativo, com todo o histórico (aulas, diários, solicitações, mensalidades); ativo → 409 |
| GET | `/api/horarios?professorId=` | coordenação, professor | Horários de atendimento (professor: só os próprios) (RF04) |
| POST | `/api/horarios` | coordenação, professor | Cadastra horário; recusa sobreposição no mesmo dia (RF04) |
| POST | `/api/horarios/grade` | coordenação, professor | Grade de uma vez (`dias`, `inicio`, `fim`, `duracaoMin`; a coordenação informa `professorId`): cria os horários que faltam e pula os que já existem — `criados`, `ignorados` |
| DELETE | `/api/horarios/:id` | coordenação, professor | Remove horário (professor: só os próprios) |
| GET | `/api/horarios/livres?inicio=&fim=&professorId=` | autenticado | Vagas livres no período, sem as que já passaram (RF05); o responsável, só dos professores dos dependentes |
| GET | `/api/alunos/:id/historico` | autenticado | Histórico do aluno (RF14): aulas com presença e diário, próximas, reposições, avisos e mensalidades — responsável só dos dependentes; professor só as próprias aulas, sem financeiro nem contato |
| GET | `/api/aulas?inicio=&fim=` | autenticado | Agenda do período — coordenação vê tudo (filtros `professorId`, `alunoId`), professor só as suas, responsável só as dos dependentes; aulas canceladas (à mão, pela inativação do aluno ou por feriado) não aparecem. Cada aula diz se tem falta avisada, se é reposição e se tem diário |
| GET | `/api/aulas/:id` | autenticado | Detalhe da aula: diário, aviso de falta, reposição, remarcação (`remarcadaDe`), o plano deixado na aula anterior do aluno e as ações possíveis agora (`acoes`) |
| POST | `/api/aulas` | coordenação | Agenda aula ou série semanal (`semanas` 1–26) a partir de agora; recusa conflito de professor ou aluno (RF05, RN08–RN10) |
| PATCH | `/api/aulas/:id/cancelar` | coordenação, professor | Cancela aula agendada que ainda não começou e libera o horário; dá ao aluno direito a reposição (RN12) |
| PATCH | `/api/aulas/:id/remarcar` | coordenação, professor | Remarca aula agendada que ainda não começou (`data`, `hora`): sem conflito com o professor ou o aluno (RN09/RN10), fora de feriado e, na reposição, no prazo de 30 dias; fica no histórico como "remarcação" |
| POST | `/api/aulas/:id/falta` | coordenação, responsável | Avisa falta (RF06): o horário fica livre; com 24 h ou mais de antecedência, dá direito a reposição (RN05) — `liberaReposicao` |
| PATCH | `/api/aulas/:id/presenca` | coordenação, professor | Registra presença (`realizada`) ou `falta`, a partir do início da aula (RF08) |
| PUT | `/api/aulas/:id/diario` | coordenação, professor | Diário da aula (RF09): `conteudoMinistrado` e `planoProxima` (opcional) |
| GET | `/api/reposicoes/disponiveis` | coordenação, responsável | Aulas perdidas que podem ser repostas — e as que não podem, com o motivo (aviso fora do prazo, limite do mês, prazo encerrado) |
| GET | `/api/reposicoes/:aulaId/vagas` | coordenação, responsável | Horários livres para repor a aula: mesmo professor, até 30 dias, sem conflito com o aluno |
| POST | `/api/reposicoes` | coordenação, responsável | Marca a reposição (`aulaId`, `data`, `hora`) sem custo extra (RF07, RN06); horário ocupado → 409 com sugestões |
| GET | `/api/mensalidades?mes=&status=&alunoId=` | coordenação, responsável | Mensalidades do mês (coordenação: atrasadas, pendentes, pagas e canceladas, nessa ordem; `mes=todos` traz todos os meses) ou dos dependentes (responsável, com `pixDisponivel`), com a situação de hoje (RN07) |
| GET | `/api/mensalidades/pagamentos?alunoId=` | coordenação, responsável | Histórico de pagamentos: as pagas, da mais recente à mais antiga, com o total e o total por forma (`porForma.pix`, `porForma.dinheiro`) — responsável, só dos dependentes |
| POST | `/api/mensalidades/gerar` | coordenação | Gera as do mês (`mes`: o atual ou até 2 à frente) para os alunos ativos, sem duplicar (RF10, RN08, RN13) |
| PATCH | `/api/mensalidades/:id/pagamento` | coordenação | Baixa com `dataPagamento` (até hoje) e `formaPagamento`: `pix` ou `dinheiro`, as formas que a escola recebe (RF11); na primeira baixa, a mensalidade recebe o próximo `numeroRecibo` da escola |
| DELETE | `/api/mensalidades/:id/pagamento` | coordenação | Desfaz uma baixa registrada por engano (o número do recibo fica com a mensalidade) |
| PATCH | `/api/mensalidades/:id/valor` | coordenação | Ajusta o valor da cobrança em aberto (`valor`, `motivo`); voltar ao valor do plano desfaz o ajuste; paga ou cancelada → 409 |
| PATCH | `/api/mensalidades/:id/cancelar` | coordenação | Cancela a cobrança em aberto (`motivo`): sai dos totais, da inadimplência e dos alertas |
| PATCH | `/api/mensalidades/:id/reabrir` | coordenação | Reabre a cancelada: volta a pendente (ou atrasada, se já venceu) |
| GET | `/api/mensalidades/:id/pix` | coordenação, responsável | Pix da cobrança em aberto: "copia e cola" (BR Code com a chave da escola e o valor) e o QR Code em SVG; sem chave cadastrada, paga ou cancelada → 409 |
| GET | `/api/mensalidades/:id/recibo` | coordenação, responsável | Recibo em PDF da mensalidade paga, com o valor por extenso (RF15) |
| GET | `/api/mensalidades/alertas` | coordenação | Atrasadas, vencendo nos próximos 3 dias e situação do envio por e-mail (RF12) |
| POST | `/api/mensalidades/alertas/enviar` | coordenação | Processa e envia os alertas agora, sem o limite de tentativas automáticas |
| GET | `/api/indicadores` | autenticado | Painel por perfil (RF13): agenda, aulas a registrar, presença, inadimplência, mês financeiro e alunos para agendar (`alunosParaAgendar`, com a sugestão de professor, data e horário — coordenação); cada dependente (responsável) |
| GET | `/api/relatorios/mensal?mes=` | coordenação | Relatório do mês: financeiro e presença por aluno (RF15) |
| GET | `/api/relatorios/mensal/pdf?mes=` | coordenação | O mesmo relatório em PDF |
| GET | `/api/relatorios/mensal/csv?mes=&tipo=` | coordenação | Planilha do mês para a contabilidade: `tipo=mensalidades` (padrão) ou `presenca`, em CSV para o Excel (UTF-8 com BOM, `;`, vírgula decimal) |
| GET | `/api/feriados?inicio=&fim=` | autenticado | Feriados e recessos que tocam o período (sem período: de hoje em diante) |
| POST | `/api/feriados` | coordenação | Cadastra feriado (`descricao`, `inicio`, `fim` opcional): as aulas desses dias saem da agenda — `aulasCanceladas` |
| DELETE | `/api/feriados/:id` | coordenação | Remove o feriado e devolve as aulas que ainda não passaram, se o horário seguir livre — `aulasRestauradas` |
| GET | `/api/feriados/nacionais?ano=` | coordenação | Feriados nacionais do ano (o atual ou até 2 à frente), com `passado` e `jaCadastrado`; Carnaval e Corpus Christi como pontos facultativos |
| POST | `/api/feriados/nacionais` | coordenação | Cadastra os escolhidos (`ano`, `datas`: o início de cada um), pulando os passados e os já cadastrados — `criados`, `ignorados`, `aulasCanceladas` |

Toda rota autenticada age só na escola do token: um id de outra escola responde 404.
Erros seguem o formato `{ "error": { "code", "message", "details" } }`. Datas trafegam como `AAAA-MM-DD` e horas como `HH:MM`;
períodos de consulta têm no máximo 62 dias.

## Roadmap (marcos da RFC)

- [x] Arquitetura em camadas, CI, Docker e schema do banco (DER completo)
- [x] Autenticação JWT com perfis (RF01) e autorização por papel (RN01–RN03)
- [x] Cadastro de planos (RF03) e de alunos com inativação (RF02, RN08)
- [x] Regras de negócio com testes: antecedência de falta, limite e prazo de reposição, conflitos de agenda, pro rata e status de mensalidade (RN05, RN07, RN09–RN13)
- [x] Agenda do professor e horários disponíveis (RF04–RF05): horários de atendimento, vagas livres, agendamento
  semanal com bloqueio de conflitos (RN09/RN10) e agenda por papel no front (celular e desktop), de hoje em diante,
  em janelas de 7 dias — aulas canceladas e as que já terminaram não aparecem
- [x] Várias escolas (multi-tenant): login por escola, cadastro de escola nova, gestão de usuários pela coordenação e
  isolamento dos dados testado na API e no MySQL
- [x] Acesso desativável (encerra a sessão na hora) e feriados/recessos por escola na agenda
- [x] Uso no celular: formulários em folha, confirmações do próprio app, teclado certo e instalação na tela inicial;
  agenda em colunas no computador
- [x] Aviso de falta e reposição (RF06–RF07): antecedência de 24 h, limite de uma por mês, prazo de 30 dias e
  cancelamento pela escola sem contar no limite (RN04–RN06, RN11, RN12); horário ocupado recusado com sugestões
- [x] Presença e diário de aula (RF08–RF09), com o plano da aula anterior na aula seguinte
- [x] Geração automática e manual, baixa, recibo e alertas de mensalidades por e-mail (RF10–RF12, RN07, RN08, RN13)
- [x] Painel por perfil, histórico do aluno e relatório mensal na tela e em PDF (RF13–RF15)
- [x] Dia a dia da escola: ajuste e cancelamento de cobrança, recibo numerado, Pix da escola com QR, remarcação de aula,
  alunos para agendar, troca e recuperação de senha com limite de tentativas, planilhas CSV e feriados nacionais
- [ ] Deploy em nuvem com CI/CD e observabilidade

## Documentação

- [Arquitetura, decisões e rastreabilidade](docs/arquitetura.md)
- [Como contribuir](CONTRIBUTING.md)
