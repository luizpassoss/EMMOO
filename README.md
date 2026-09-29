# EMMOO — Sistema de Gestão de Agenda, Mensalidades e Presença

[![CI](https://github.com/luizpassoss/EMMOO/actions/workflows/ci.yml/badge.svg)](https://github.com/luizpassoss/EMMOO/actions/workflows/ci.yml)

Aplicação web (responsiva, *mobile-first*) que substitui o controle manual e o WhatsApp da **Escola de Música EMMOO**,
centralizando agenda de aulas, reposições, presença, diário de aula e mensalidades.

Projeto de Portfólio — Engenharia de Software, Católica SC · Linha **Web App** · Parceiro externo: **Escola de Música EMMOO**
· Autor: **Luiz Fernando Passos de Oliveira**

> **Status:** em desenvolvimento — iteração 2 (agenda do professor, horários livres e agendamento de aulas).

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | React 18 + Vite (SPA), React Router |
| Back-end | Node.js 22 + Express (API REST em camadas) |
| Banco de dados | MySQL 8 via Prisma ORM |
| Segurança | JWT + bcrypt, Helmet, CORS |
| Testes | `node:test` (API) e Vitest + Testing Library (Web) |
| DevOps | Docker, Docker Compose, Nginx, GitHub Actions (CI) |

## Estrutura

```
emmoo-gestao/
├── api/                  # API REST (Node.js + Express)
│   ├── prisma/           # schema.prisma (espelha o DER da RFC) e seed
│   ├── src/
│   │   ├── domain/       # regras puras: regras.js (RN05, RN07, RN09–RN13) e agenda.js (RF04–RF05)
│   │   ├── modules/      # auth, usuarios, planos, alunos, horarios, aulas (routes → controller → service)
│   │   ├── infra/        # repositórios (memória e Prisma/MySQL) e segurança (JWT, bcrypt)
│   │   ├── middlewares/  # autenticação, autorização por papel, tratamento de erros
│   │   ├── app.js        # montagem do Express
│   │   ├── container.js  # raiz de composição (injeção de dependências)
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

| Perfil | E-mail | Senha |
|---|---|---|
| Coordenação (Lucimara) | `lucimara@emmoo.com.br` | `emmoo123` |
| Professor (Luiz) | `luiz@emmoo.com.br` | `emmoo123` |
| Responsável (Mary) | `mary@emmoo.com.br` | `emmoo123` |

> Apenas para desenvolvimento. Troque as senhas e o `JWT_SECRET` antes de qualquer uso real.

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
| POST | `/api/auth/login` | público | Autenticação — retorna token JWT (RF01) |
| GET | `/api/auth/me` | autenticado | Perfil do usuário logado |
| GET | `/api/usuarios?papel=professor` | coordenação | Lista usuários por papel (seletores de professor e responsável) |
| GET | `/api/planos` | autenticado | Lista os planos |
| POST | `/api/planos` | coordenação | Cadastra plano (RF03) |
| GET | `/api/alunos?status=ativo` | coordenação, professor | Lista alunos, com filtro opcional |
| GET | `/api/alunos/:id` | coordenação, professor | Detalha um aluno |
| POST | `/api/alunos` | coordenação | Cadastra aluno (RF02) |
| PUT | `/api/alunos/:id` | coordenação | Atualiza aluno (RF02) |
| PATCH | `/api/alunos/:id/inativar` | coordenação | Inativa aluno e cancela as aulas futuras (RN08) |
| PATCH | `/api/alunos/:id/reativar` | coordenação | Reativa aluno inativo |
| GET | `/api/horarios?professorId=` | coordenação, professor | Horários de atendimento (professor: só os próprios) (RF04) |
| POST | `/api/horarios` | coordenação, professor | Cadastra horário; recusa sobreposição no mesmo dia (RF04) |
| DELETE | `/api/horarios/:id` | coordenação, professor | Remove horário (professor: só os próprios) |
| GET | `/api/horarios/livres?inicio=&fim=&professorId=` | coordenação, professor | Vagas livres no período (RF05) |
| GET | `/api/aulas?inicio=&fim=` | autenticado | Agenda do período — coordenação vê tudo (filtros `professorId`, `alunoId`), professor só as suas, responsável só as dos dependentes |
| POST | `/api/aulas` | coordenação | Agenda aula ou série semanal (`semanas` 1–26) de hoje em diante; recusa conflito de professor ou aluno (RF05, RN08–RN10) |
| PATCH | `/api/aulas/:id/cancelar` | coordenação, professor | Cancela aula agendada (de hoje em diante) e libera o horário |

Erros seguem o formato `{ "error": { "code", "message", "details" } }`. Datas trafegam como `AAAA-MM-DD` e horas como `HH:MM`;
períodos de consulta têm no máximo 62 dias.

## Roadmap (marcos da RFC)

- [x] Arquitetura em camadas, CI, Docker e schema do banco (DER completo)
- [x] Autenticação JWT com perfis (RF01) e autorização por papel (RN01–RN03)
- [x] Cadastro de planos (RF03) e de alunos com inativação (RF02, RN08)
- [x] Regras de negócio com testes: antecedência de falta, limite e prazo de reposição, conflitos de agenda, pro rata e status de mensalidade (RN05, RN07, RN09–RN13)
- [x] Agenda do professor e horários disponíveis (RF04–RF05): horários de atendimento, vagas livres, agendamento
  semanal com bloqueio de conflitos (RN09/RN10) e agenda por papel no front (semana, celular e desktop)
- [ ] Aviso de falta e solicitação de reposição (RF06–RF07)
- [ ] Presença e diário de aula (RF08–RF09)
- [ ] Geração, baixa e alertas de mensalidades (RF10–RF12)
- [ ] Dashboard, histórico e relatórios (RF13–RF15)
- [ ] Deploy em nuvem com CI/CD e observabilidade

## Documentação

- [Arquitetura, decisões e rastreabilidade](docs/arquitetura.md)
- [Como contribuir](CONTRIBUTING.md)
