# Arquitetura

Implementação da arquitetura definida na RFC (C4 — contexto, containers e componentes).

## Containers

```
Navegador (desktop ou celular)
        │  HTTPS
        ▼
 Web — SPA React servida pelo Nginx ──/api──►  API REST — Node.js + Express  ──SQL──►  MySQL (Prisma)
                                                      │
                                                      └──SMTP──► Serviço de e-mail (próximas iterações)
```

## Componentes da API (camadas)

```
Requisição HTTP
  → routes        (define URL, método e middlewares da rota)
  → middlewares   (authenticate: valida o JWT · authorize: confere o papel)
  → controller    (traduz HTTP ⇄ caso de uso; não contém regra de negócio)
  → service       (casos de uso: valida dados, aplica regras, orquestra repositórios)
  → repository    (acesso a dados: memória ou Prisma/MySQL — mesma interface)
  ← errorHandler  (converte qualquer erro em resposta JSON padronizada)
```

- `src/domain/regras.js` concentra as regras de negócio puras (sem Express nem banco), o que permite testá-las isoladamente (TDD).
- `src/domain/agenda.js` reúne as regras puras da agenda (intervalo da aula, conflito, série semanal, vagas livres),
  construídas sobre `criarIntervalo`/`intervalosSeSobrepoem` de `regras.js`.
- `src/shared/datas.js` trata datas de calendário (`AAAA-MM-DD`) e horas (`HH:MM`) em UTC, sem distorção de fuso.
- `src/container.js` é a raiz de composição: decide quais implementações usar e injeta as dependências nos serviços.

## Decisões de arquitetura (ADRs)

| # | Decisão | Motivo | Consequência |
|---|---|---|---|
| 1 | Camadas routes → controller → service → repository | Separar HTTP, regra de negócio e persistência (SRP) | Cada camada é testável isoladamente |
| 2 | Injeção de dependências por *factories* | Inversão de dependência (DIP) sem framework extra | Serviços recebem repositórios, hasher e tokens por parâmetro |
| 3 | Repositório em memória + Prisma com a mesma interface | Rodar e demonstrar sem instalar banco; testes rápidos | Trocar de persistência é mudar `DB_DRIVER` |
| 4 | Regras de negócio como funções puras | Regras da RFC (RN05, RN07, RN09–RN13) testáveis e reutilizáveis | Agenda, reposição e mensalidades reaproveitam as mesmas funções |
| 5 | Erros tipados (`AppError` e subclasses) | Respostas HTTP consistentes | Um único middleware trata todos os erros |
| 6 | `node:test` na API e Vitest no front | Test runner nativo, sem dependências na API | Cobertura medida no CI com metas de 75% / 25% |
| 7 | Conflito de agenda verificado no serviço, com índices no banco | Conflito é sobreposição de intervalos (14:00–14:45 × 14:30), não só hora igual; e uma restrição única impediria reagendar o horário de uma aula cancelada, que fica no histórico | `aula.service` usa `encontrarAulaEmConflito` (RN09/RN10); `@@index` em professor/aluno + data. *Revisado na iteração 2 — antes era `@@unique`.* |
| 8 | Deploy com Docker + Nginx em nuvem via CI/CD | Diretrizes da disciplina (sem PaaS de front, sem deploy manual por ssh/ftp) | Imagens construídas no pipeline |
| 9 | Série semanal atômica | Agendar "toda segunda às 14h" não pode deixar metade das aulas criadas | Todas as datas são checadas antes; o Prisma grava a série numa `$transaction` |
| 10 | Escopo da agenda por papel decidido no serviço | Uma única rota `GET /aulas` atende os três perfis sem vazar dados (RN01–RN03) | Professor recebe só as próprias aulas; responsável, só as dos dependentes |

## Rastreabilidade RFC → código

| RFC | Onde está |
|---|---|
| RF01 — autenticação por papel | `modules/auth`, `middlewares/auth.js`, `infra/security` |
| RF02 — cadastro de alunos | `modules/alunos` |
| RF03 — cadastro de planos | `modules/planos` |
| RN01–RN03 — permissões por papel | `authorize(...)` nas rotas de `modules/*/*.routes.js` |
| RN05 — antecedência do aviso de falta | `domain/regras.js` → `avisoDentroDaAntecedencia` |
| RN07 — mensalidade atrasada | `domain/regras.js` → `calcularStatusMensalidade` |
| RF04 — horários de atendimento do professor | `modules/horarios`, `domain/agenda.js` → `horariosSeSobrepoem`; front: `HorariosDisponiveis.jsx` |
| RF05 — agenda, vagas livres e agendamento | `modules/aulas`, `horario.service.js` → `livres`, `domain/agenda.js` → `calcularHorariosLivres`, `gerarDatasSemanais`; front: `AgendaPage.jsx`, `FormAgendarAula.jsx` |
| RN08 — aluno inativo | `aluno.service.js` → `inativar` (cancela aulas futuras) e `aula.service.js` (não agenda aluno inativo) |
| RN09/RN10 — conflitos de agenda | `domain/agenda.js` → `encontrarAulaEmConflito` (sobre `regras.js`); usado em `aula.service.js` → `agendar` |
| RN11/RN12 — limite e prazo de reposição | `domain/regras.js` → `avaliarSolicitacaoDeReposicao`, `reposicaoDentroDoPrazo` |
| RN13 — cobrança proporcional | `domain/regras.js` → `calcularValorProRata` |
| RNF03 — senha com hash e JWT | `infra/security/passwordHasher.js`, `tokenService.js` |
| RNF04 — responsivo / mobile-first | `web/src/styles.css` (menu inferior no celular, lateral no desktop) |
| Modelo de dados (DER) | `api/prisma/schema.prisma` |

## Estratégia de testes

- **Unitários** (`api/tests/unit`): regras de negócio, validadores, serviços, controllers e middlewares com *fakes* — sem rede nem banco.
- **Adaptadores** (`api/tests/adapters`): bcrypt e JWT reais; mapeamento das consultas do Prisma com cliente falso.
- **Integração** (`api/tests/integration`): sobe a API em porta aleatória e exercita os endpoints via HTTP (login, permissões, CRUD, erros).
- **Front-end** (`web/src/**/*.test.*`): cliente da API, sessão/autenticação, rota protegida, utilitários de data e as telas
  de login, início, alunos e agenda (API simulada com `vi.mock`, relógio fixo com `vi.setSystemTime`).

## Observabilidade

- Atual: endpoint `GET /api/health` (usado pelo `HEALTHCHECK` do Docker) e logs de erro centralizados no `errorHandler`.
- Falha cedo e explicada: com `DB_DRIVER=mysql`, a API testa o banco ao iniciar (`conectarPrisma`) e, se não
  conseguir, encerra dizendo o motivo (MySQL desligado, banco não importado, cliente do Prisma não gerado, porta em uso).
  Se o banco cair com a API no ar, as requisições recebem `503 DATABASE_UNAVAILABLE` em vez de `500`.
- Em desenvolvimento, o proxy do Vite responde `503 API_OFFLINE` (com a instrução para subir a API) quando ela não está rodando.
- Próximo passo: logs estruturados e métricas (Prometheus + Grafana), com alertas de disponibilidade.
