# Arquitetura

Implementação da arquitetura definida na RFC (C4 — contexto, containers e componentes).

## Containers

```
Navegador (desktop ou celular)
        │  HTTPS
        ▼
 Web — SPA React servida pelo Nginx ──/api──►  API REST — Node.js + Express  ──SQL──►  MySQL (Prisma)
                                                      │
                                                      ├──SMTP──► Serviço de e-mail (alertas de pagamento, opcional)
                                                      └── rotina de hora em hora (mensalidades do mês e alertas)
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
- `src/domain/reposicoes.js` decide se uma aula perdida dá direito a reposição (falta avisada no prazo ou aula
  cancelada pela escola), o prazo de 30 dias e o limite mensal; `src/domain/mensalidades.js`, o vencimento, o valor
  (pro rata no mês da matrícula), a situação de hoje e o alerta devido. Ambos são puros, sobre `regras.js`.
- `src/domain/pix.js` valida a chave Pix pelo tipo (CPF/CNPJ com dígito verificador, celular, e-mail, aleatória) e monta
  o "Pix copia e cola" (BR Code EMV com CRC16); `src/domain/feriadosNacionais.js` calcula a Páscoa e os feriados do ano.
  Ambos são puros e testados com os exemplos oficiais.
- `src/infra/pdf/documentos.js` desenha o recibo e o relatório mensal (PDFKit); `src/infra/email/mailer.js` envia
  e-mail por SMTP (Nodemailer) — ou, sem `SMTP_URL`, falha de propósito para o alerta ficar pendente;
  `src/infra/pix/qrcode.js` desenha o QR Code do Pix em SVG.
- `src/shared/csv.js` monta planilhas para o Excel em português; `src/shared/limitador.js` conta tentativas numa janela
  de tempo (limite de login, de pedidos de redefinição e de senha atual errada).
- `src/rotinas.js` roda, ao iniciar e a cada hora, a rotina de cada escola (`mensalidades.rotina()`).
- `src/shared/datas.js` trata datas de calendário (`AAAA-MM-DD`) e horas (`HH:MM`) em UTC, sem distorção de fuso.
- `src/container.js` é a raiz de composição: decide quais implementações usar e injeta as dependências nos serviços.

## Várias escolas (multi-tenant)

Um único sistema atende várias escolas, cada uma vendo só os próprios dados. Modelo: **banco compartilhado com
`escola_id` em todas as tabelas** (ver ADR 12).

```
Login: { escola: "emmoo", login: "admin", senha }  ─►  token JWT { sub, papel, escola: 1 }
Requisição com o token
  → authenticate     lê a escola do token e põe em req.servicos os serviços DAQUELA escola
  → controller       usa só req.servicos (não há outro caminho até os dados)
  → service          igual a antes — não sabe que existem outras escolas
  → paraEscola(1)    repositórios que filtram TODA leitura, edição e exclusão por escola_id
```

- `escolas` é o único repositório global (busca por código no login, cadastro de escola nova).
- `paraEscola(id)` existe nas duas persistências (memória e Prisma): no Prisma, edição e exclusão usam
  `updateMany`/`deleteMany` com `{ id, escolaId }` — um id de outra escola simplesmente não é encontrado (404).
- Referências também ficam na escola: um aluno não pode usar o plano ou o responsável de outra escola.
- E-mail e usuário são únicos **dentro** da escola (`@@unique([escolaId, email])`), então o `admin` de cada escola é outra pessoa.
- Escola nova: `POST /api/escolas` cria a escola e a coordenação, já com sessão; a coordenação cadastra professores
  e responsáveis em **Usuários**. O cadastro público é controlado por `CADASTRO_ESCOLAS` (aberto em desenvolvimento,
  fechado em produção).
- Token de antes do multi-tenant (sem escola) recebe 401 "Sessão expirada" e a pessoa entra de novo.

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
| 11 | "Voltar" nas subpáginas e formulários na URL (`?aluno=novo`, `?aluno=3`, `?plano=novo`, `?aula=nova`) | O voltar do navegador/celular deve fechar o formulário, não sair da página; link aberto direto não pode tirar a pessoa do sistema | `BotaoVoltar` usa `history.state.idx` do React Router (sem página anterior → Início) e aparece só onde `CabecalhoPagina` recebe `voltar` (histórico do aluno, histórico de pagamentos, minha conta) — as páginas do menu já estão a um toque (ver ADR 39); `usePainel` abre o formulário com uma entrada no histórico e fecha voltando a ela |
| 12 | Multi-tenant em banco compartilhado, com `escola_id` em todas as tabelas e o filtro no repositório | Escolas de música são pequenas e parecidas: um banco por escola (ou um schema por escola) multiplicaria migrações, backups e custo sem ganho real; o filtro no repositório não depende de cada serviço lembrar de filtrar | Uma migração serve todas as escolas; `paraEscola(id)` é o único jeito de chegar aos dados; testes provam que outra escola não lê, edita nem exclui por id. Se uma escola grande exigir isolamento físico, a interface de repositório permite apontá-la para outro banco |
| 13 | Escola identificada pelo código no login e gravada no token | Funciona em `localhost`, no XAMPP e em qualquer domínio, sem DNS curinga; o mesmo usuário (`admin`) pode existir em cada escola | O login lembra a última escola no aparelho e aceita `?escola=codigo` no link; trocar para subdomínio (`sol.emmoo.app`) depois só muda de onde vem o código |
| 14 | Aula cancelada guarda o motivo (`manual` ou `inativacao`) | Reativar um aluno precisa desfazer a inativação: devolver as aulas que ela cancelou, e não as canceladas à mão (feriado, falta avisada) | `inativar` grava `inativacao` num único `updateMany`; `reativar` devolve só essas, se ainda não começaram e o horário continua livre (RN09/RN10). Toda aula cancelada, qualquer que seja o motivo, sai do calendário (`GET /aulas` não a devolve) e libera o horário; o registro fica guardado como histórico |
| 15 | "Já começou" decide o que ainda se pode mudar | Uma aula que já começou aconteceu (será realizada ou falta, RF08): não pode ser cancelada, nem pela inativação; e não se agenda num horário de hoje que já passou | `jaComecou` (`domain/agenda.js`) é usada em agendar, cancelar, inativar, reativar e nas vagas livres; data e hora vêm de relógios injetados (`hoje`, `agora`) para os testes |
| 16 | Sessão conferida no banco a cada requisição (`ativo` + `versaoSessao` no token) | Um JWT vale até expirar (8 h): sem conferir, quem foi desativado continuaria usando o sistema — inaceitável com dados de alunos menores | `authenticate` chama `auth.validarSessao` (uma consulta por requisição) e usa o perfil atual do banco; desativar, trocar o perfil ou redefinir a senha de alguém sobe a versão e invalida os tokens antigos. A própria senha trocada não derruba quem a trocou |
| 17 | Feriados como período da escola, que tira aulas da agenda com motivo `feriado` | Escolas de música param em feriados e recessos; cancelar aula por aula seria trabalho e erro | O mesmo mecanismo da inativação (ADR 14): cadastrar cancela as aulas do período que ainda não começaram, remover devolve as que seguem livres (`separarRestauraveis`); séries semanais pulam as datas, vagas livres não as oferecem e a reativação de aluno não devolve aula em feriado |
| 18 | A agenda mostra só de hoje em diante, em janelas de 7 dias a partir de hoje | A agenda serve para o que vem pela frente; o que passou é histórico (presença e relatórios, RF08 e RF13–RF15, têm telas próprias: Aulas, histórico do aluno e Relatórios). Semanas de segunda a domingo deixariam a tela quase vazia no fim da semana | `AgendaPage` não volta antes de hoje ("Semana anterior" desativado) e esconde a aula que já terminou (`aulaJaTerminou`; a que está em andamento fica até acabar), com um relógio que atualiza a cada minuto. A regra é da tela: `GET /aulas` continua devolvendo períodos passados para o histórico |
| 19 | Identidade visual monocromática dos mockups da RFC, em tokens de CSS | A RFC define a interface pelos mockups (grafite sobre cinzas, cartões brancos com sombra suave, botões em pílula, ícones em círculo) e não pede paleta colorida; cor só ajuda quando tem significado | Cores, raios e sombras ficam em variáveis no topo de `styles.css` (contraste conferido: texto suave ≥ 5:1); a marca é a colcheia dupla (♫) dos mockups, desenhada em SVG e repetida no favicon; duas fontes vão empacotadas (sem CDN), iguais em qualquer aparelho — Plus Jakarta Sans em títulos, números e botões (com `word-spacing` compensando o espaço estreito dela) e Inter no texto e nos campos. Vermelho só para erro |
| 20 | Formulários em janela (`Painel`: folha que sobe de baixo no celular, janela centralizada no computador) e confirmações do próprio app (`useConfirmacao`), não o `window.confirm` | O `confirm` do navegador sai do visual, mostra o endereço do site e não explica a consequência; e o formulário no meio da página longa obrigava a rolar até ele e até o botão de salvar | `Painel` é um `dialog` modal: trava a rolagem da página atrás, leva o foco ao primeiro campo (no celular, à janela, sem abrir o teclado sozinho), prende o Tab e devolve o foco a quem a abriu; no celular, fecha arrastando o cabeçalho para baixo; com `alterado`, pergunta antes de descartar o que não foi salvo; cabeçalho e rodapé ficam parados ("Cancelar" e a ação principal à direita, ações secundárias à esquerda) e só o conteúdo rola. A confirmação é um `alertdialog` com ícone conforme o peso da ação, foco em "Voltar" (a opção segura) e preso nos botões. `confirmar()` é uma promessa, então o código das telas continua `if (!(await confirmar(...))) return` |
| 21 | App instalável (manifesto + ícones) sem *service worker* | Na escola, o sistema é aberto no celular várias vezes ao dia: ícone na tela inicial e tela cheia ajudam. Já o cache offline de um *service worker* poderia servir uma versão velha do app depois de um deploy, e sem rede não há o que mostrar (todos os dados vêm da API) | `public/manifest.webmanifest`, ícones de 192/512 px (e *maskable*) e `apple-touch-icon`; o Nginx serve o manifesto com o tipo certo e sem cache longo. Se um dia for preciso funcionar offline, entra um *service worker* com estratégia "rede primeiro" |
| 22 | Linguagem formal e por extenso em toda a interface e nas mensagens da API | O sistema é usado por uma escola diante de famílias e professores: abreviações como "1x/semana", "(a)" nos avisos ou jargão técnico ("AAAA-MM-DD", "inteiro") passam informalidade ou confundem | O nome sugerido do plano é "Particular · 1 aula por semana" (`nomeSugeridoPlano`); os avisos usam frases neutras ("Cadastro de Ana Beatriz inativado."); as mensagens de validação falam a língua da tela ("Informe um horário válido."). Planos já gravados com o nome antigo são renomeados pela migração `04-nomes-dos-planos.sql`, que só toca nos nomes no padrão antigo |
| 23 | Reposição marcada direto num horário livre, sem etapa de aprovação | O fluxo da RFC é "o sistema verifica a disponibilidade; se não houver, bloqueia e sugere outro horário". Todas as regras (antecedência, limite, prazo, conflitos) são conferidas pelo sistema, então uma aprovação manual só atrasaria a família e ocuparia a coordenação | `POST /reposicoes` cria a aula (com `reposicaoDeId`) e a solicitação já aprovadas; horário ocupado → 409 com até 3 horários livres no prazo. A tela oferece só vagas válidas (`GET /reposicoes/:aulaId/vagas`), e o 409 cobre a corrida entre duas famílias |
| 24 | Regras de crédito de reposição: a falta avisada libera o horário; o limite mensal conta pelo mês da aula perdida; reposição não gera outra | Avisada a falta, o horário pode ir para outro aluno ou para uma reposição; contar pelo mês da falta (e não da reposição) evita contornar o limite remarcando para o mês seguinte; uma reposição que gerasse outra duplicaria o crédito quando a escola a cancelasse | `ocupaHorario` só considera `agendada` e `realizada`; aviso com menos de 24 h fica registrado com `liberaReposicao = false`; cancelamento manual pela escola dá crédito sem contar no limite (RN12); cancelar a reposição devolve o crédito da aula original; o horário da própria aula perdida não é oferecido como reposição |
| 25 | Rotina interna (de hora em hora) para gerar mensalidades e processar alertas, idempotente | A RFC pede geração automática e alertas sem ação de ninguém; um agendador externo (cron, fila) seria mais uma peça para instalar no XAMPP e no Docker | `iniciarRotinas` roda ao iniciar e a cada hora; rodar duas vezes não duplica nada (únicos `aluno + mês` e `mensalidade + tipo` de alerta); o erro de uma escola não para as outras; `ROTINAS=desligadas` desliga. Com várias instâncias da API, todas rodam a rotina sem efeito duplicado — num cenário maior, ela iria para um agendador dedicado |
| 26 | E-mail opcional: o alerta é registrado antes e só marcado como enviado quando o envio funciona | Escola sem servidor de e-mail precisa usar o sistema mesmo assim; e nunca se deve fingir que o aviso chegou | Sem `SMTP_URL`, os alertas ficam pendentes e aparecem na tela de mensalidades; falha de envio guarda o erro e conta a tentativa (a rotina para depois de 5; "Enviar agora" tenta de novo). Só recebe alerta o responsável com acesso ativo e e-mail |
| 27 | PDFs gerados na API e baixados com a sessão (`fetch` + `Blob`) | O recibo e o relatório têm dados pessoais e financeiros: o link precisa do token, que vai no cabeçalho e não numa URL; gerar no servidor garante o mesmo documento em qualquer aparelho | `api.baixar()` devolve o conteúdo e o nome do arquivo (`Content-Disposition`, exposto no CORS); `salvarArquivo` dispara o download. PDFKit com a fonte Helvetica padrão (acentos do português) e valor por extenso (`shared/extenso.js`) |
| 28 | Ações da aula calculadas pela API (`acoes` no `GET /aulas/:id`) | Quem pode registrar, cancelar, avisar falta ou repor depende do perfil, do horário (já começou? faltam 24 h?) e do crédito de reposição; repetir essas regras no front criaria duas versões delas | A folha da aula (`AulaPainel`) mostra só o que `acoes` permite e usa as mensagens da API para explicar bloqueios (`reposicaoPossivel.mensagem`); a API confere tudo de novo em cada ação |
| 29 | Histórico do aluno com recorte por perfil, sem financeiro nem contato para o professor | Menor privilégio (e LGPD): o professor precisa da presença e do diário dos próprios alunos para dar continuidade, não das mensalidades nem do telefone da família | `historico.service` filtra as aulas do professor (sem nenhuma, 403), omite `contato` e devolve `mensalidades: []`; o responsável só vê dependentes (outro aluno → 404, sem revelar que existe) |
| 30 | Professor criado já com a grade de atendimento (dias, período e duração) | Sem horários de atendimento, o agendamento não tem o que sugerir (RF05) e a coordenação não sabia que precisava cadastrá-los à parte, horário por horário, na Agenda | O cadastro de professor traz a grade sugerida (segunda a sexta, 14:00–18:00, 45 min), com a prévia dos horários; `usuario.service` valida a grade antes de criar o acesso e cria tudo junto (`criarAplicadorDeGrade`). `POST /horarios/grade` aplica a mesma grade a quem já existe, pulando o que se sobrepõe — aplicar de novo não duplica. O agendamento avisa quando o professor não tem horários e leva à configuração |
| 31 | Só Pix e dinheiro como formas de pagamento, conferidas na API | É como a escola recebe: oferecer cartão, transferência ou boleto convidava a registros errados | `FORMAS_PAGAMENTO` (API e front) tem só `pix` e `dinheiro`, e a baixa recusa outras; a coluna continua texto, e `nomeDaForma` ainda nomeia formas antigas, para um pagamento já registrado não perder o nome. No formulário, as duas viram botões grandes (um toque), e o histórico de pagamentos mostra o total de cada uma |
| 32 | Mensalidade cancelada como situação própria (`cancelada`), com motivo, em vez de apagar a cobrança; ajuste de valor guardando o valor do plano | Aluno que saiu, mês sem aula, desconto de irmãos e bolsa são o dia a dia da escola. Apagar a cobrança perderia o histórico (e a gerada de novo voltaria); mudar o valor sem registro deixaria o relatório sem explicação | `situacaoDaMensalidade` mantém a cancelada; `naoPagas` (repositórios) passa a ser só pendente/atrasada, então previsto, inadimplência, alertas e "em aberto" ignoram a cancelada sem mudar cada consulta. O ajuste grava `valorOriginal` (só no primeiro) e `ajusteMotivo`; voltar ao valor do plano limpa os dois. Paga não se ajusta nem se cancela (tem recibo): desfaz-se a baixa antes. Os motivos são anotações da coordenação e não vão para o responsável |
| 33 | Número de recibo sequencial por escola, dado na primeira baixa e preso à mensalidade | O contador e a família esperam recibos numerados em sequência; usar o id da tabela pulava números (o id é de todas as escolas) | `registrarNumeroRecibo` dá `max + 1` da escola só se a mensalidade ainda não tem número; índice único (`escola_id`, `numero_recibo`) barra a corrida entre duas baixas, e o repositório tenta o seguinte (até 5 vezes). Desfeita a baixa, o número fica: um recibo já entregue nunca passa a valer para outra mensalidade. A migração 06 numerou os pagamentos antigos em ordem de data |
| 34 | Pix estático (BR Code gerado na API), com a baixa continuando manual | A família quer pagar na hora pelo celular; um Pix dinâmico com confirmação automática exigiria contrato com um banco (API Pix, certificados), fora do alcance da escola | `GET /mensalidades/:id/pix` monta o "copia e cola" (chave, recebedor e cidade da escola, valor e uma descrição que o banco mostra) e o QR em SVG; `txid` "***", aceito por todos os bancos. A chave é validada pelo tipo e guardada já no formato do Pix; nome e cidade, sem acento e no tamanho do padrão. A coordenação confere o extrato e registra a baixa, que gera o recibo |
| 35 | Remarcação como alteração da própria aula, registrada como solicitação `remarcacao` | Remarcar cancelando e agendando de novo gerava um crédito de reposição indevido (cancelamento pela escola, RN12) e perdia o vínculo com o diário e a reposição | `PATCH /aulas/:id/remarcar` muda data e hora (mesmo aluno, professor e duração) com as mesmas conferências do agendamento — conflito de professor e de aluno sem contar a própria aula, feriado, horário que já passou — e, na reposição, o prazo de 30 dias da aula perdida. A solicitação guarda `dataAnterior` e `novaData`, que aparecem no histórico e no detalhe da aula |
| 36 | Senha: troca pela própria pessoa, redefinição por link de uso único e limite de tentativas em memória | Até aqui, só a coordenação redefinia senhas, e não havia proteção contra quem tenta adivinhar senhas | O link leva 32 bytes aleatórios; o banco guarda só o SHA-256 (`redefinicao_senha`), com validade de 1 hora e uso marcado num `UPDATE` condicionado (dois cliques não usam duas vezes); pedir de novo, trocar ou redefinir a senha invalida os pendentes, e qualquer troca sobe a versão da sessão. O pedido sempre responde o mesmo (a resposta não revela quem existe), e o envio do e-mail — a parte demorada — segue em segundo plano, sem pesar no tempo de resposta. O limite (`shared/limitador.js`: 5 erros por conta e 30 por endereço em 15 minutos) fica em memória — uma instância, o caso da escola; com várias, cada uma conta a sua. `TRUST_PROXY` diz se o endereço vem do `X-Forwarded-For` |
| 37 | Planilha CSV (UTF-8 com BOM, `;`, vírgula decimal) em vez de XLSX | A contabilidade abre no Excel; CSV não precisa de biblioteca e abre em qualquer planilha | `shared/csv.js` põe a marca BOM (acentos certos no Excel), separa por `;` e escreve números e datas no formato brasileiro; texto que começa com `=`, `+`, `-` ou `@` ganha um apóstrofo, contra injeção de fórmula |
| 38 | Feriados nacionais calculados (não uma tabela fixa) e cadastrados como feriados comuns da escola | Os móveis mudam todo ano (Páscoa); cadastrados como os outros, a escola pode remover um que não segue e as regras de agenda continuam as mesmas | `feriadosNacionais(ano)` (algoritmo de Meeus para a Páscoa) devolve os fixos e os móveis; Carnaval e Corpus Christi vêm como pontos facultativos, desmarcados na tela. O cadastro em lote reaproveita `criar` (tira as aulas do dia) e pula os passados e os já cobertos |
| 39 | Interface minimalista: menos texto, cartões planos | Telas com subtítulos explicativos, dicas em quase todo campo, caixas de informação longas e cartões grandes com ícones cansavam e escondiam o que importa (números, nomes, ações), principalmente no celular | Páginas sem subtítulo (fica só o que é dado, como a data no Início); `Indicador` sem ícone (rótulo, número e um ponto no que pede ação), em grade de três no computador; descrições das janelas só quando dizem um estado (ex.: cadastro inativo); dicas só onde mudam o preenchimento (o exemplo vira `placeholder`); cartões sem sombra, bordas mais leves; ações do cabeçalho compactas no celular (o histórico de pagamentos vira ícone, com o nome para leitores de tela); `TituloDaSecao` recolhe feriados e horários no fim da agenda; a faixa de alertas só aparece quando há o que fazer |

## Rastreabilidade RFC → código

| RFC | Onde está |
|---|---|
| RF01 — autenticação por papel | `modules/auth` (login por escola + usuário ou e-mail), `modules/usuarios` (a coordenação cria e edita acessos), `middlewares/auth.js`, `infra/security` |
| Multi-tenant (várias escolas) | `modules/escolas`, `infra/*/…Repositories.js` → `paraEscola`, `container.js` → `servicosDaEscola`; front: `LoginPage.jsx`, `CadastroEscolaPage.jsx`, `UsuariosPage.jsx` |
| RF02 — cadastro de alunos | `modules/alunos` |
| RF03 — cadastro de planos | `modules/planos` (cadastrar, editar e excluir plano sem alunos); front: `PlanosPage.jsx` |
| RN01–RN03 — permissões por papel | `authorize(...)` nas rotas de `modules/*/*.routes.js` |
| RN05 — antecedência do aviso de falta | `domain/regras.js` → `avisoDentroDaAntecedencia`, `domain/reposicoes.js` → `avisoNoPrazo`; usado em `aula.service.js` → `avisarFalta` |
| RN07 — mensalidade atrasada | `domain/regras.js` → `calcularStatusMensalidade`, `domain/mensalidades.js` → `situacaoDaMensalidade`; a rotina grava "atrasada" (`mensalidade.service.js` → `processarAlertas`) |
| RF06 — aviso de falta | `aula.service.js` → `avisarFalta` (`POST /aulas/:id/falta`); front: `AulaPainel.jsx`, `DashboardPage.jsx` (portal do responsável) |
| RF07 — reposição | `modules/reposicoes` (`disponiveis`, `vagas`, `solicitar`), `domain/reposicoes.js` → `origemDaReposicao`, `avaliarReposicao`; front: `AulaPainel.jsx` (escolha do horário) |
| RN04/RN06 — reposição a pedido e sem custo | `reposicao.service.js` (só existe a partir de uma aula perdida; não cria cobrança — a mensalidade é do plano) |
| RF08 — presença | `aula.service.js` → `registrarPresenca` (a partir do início da aula); front: `AulasPage.jsx`, `AulaPainel.jsx` |
| RF09 — diário de aula | `aula.service.js` → `salvarDiario`, `detalhe` (`planoAnterior`: continuidade pedagógica); front: `AulaPainel.jsx` |
| RF10 — geração de mensalidades | `mensalidade.service.js` → `gerarDoMes` (manual e na rotina), `domain/mensalidades.js` → `valorDaMensalidade`, `vencimentoDaMensalidade`; `rotinas.js`; front: `MensalidadesPage.jsx` |
| RF11 — baixa de pagamento (Pix ou dinheiro) e histórico de pagamentos | `mensalidade.service.js` → `registrarPagamento`, `desfazerPagamento`, `pagamentos`; `domain/mensalidades.js` → `FORMAS_PAGAMENTO`, `nomeDaForma`; front: `MensalidadesPage.jsx`, `PagamentosPage.jsx` |
| Ajuste, cancelamento e reabertura de cobrança | `mensalidade.service.js` → `ajustarValor`, `cancelar`, `reabrir`; `aluno.service.js` → `inativar` (`cancelarMensalidades`); front: `MensalidadesPage.jsx` (`PainelDaMensalidade`), `AlunosPage.jsx` |
| Pix da escola | `domain/pix.js`, `infra/pix/qrcode.js`, `modules/escolas/dadosEscola.*`, `mensalidade.service.js` → `pix`; front: `EscolaPage.jsx`, `CodigoPix.jsx`, `MensalidadesPage.jsx` (`PainelDoPix`) |
| Remarcação de aula | `aula.service.js` → `remarcar`, `detalhe` (`remarcadaDe`, `acoes.remarcar`); front: `AulaPainel.jsx`, `HistoricoAlunoPage.jsx` |
| Fim da série de aulas | `indicador.service.js` → `alunosParaAgendar`, `proximaDataSemanal`; front: `DashboardPage.jsx` (`AlunosParaAgendar`), `AgendaPage.jsx` + `FormAgendarAula.jsx` (agendamento preenchido pela URL) |
| Senha (troca, recuperação e limite de tentativas) | `auth.service.js` → `trocarSenha`, `esqueciSenha`, `redefinirSenha`, `login`; `shared/limitador.js`; tabela `redefinicao_senha`; front: `PerfilPage.jsx`, `RecuperarSenhaPage.jsx`, `RedefinirSenhaPage.jsx`, `LoginPage.jsx` |
| Planilhas para a contabilidade | `relatorio.service.js` → `csv`, `shared/csv.js`; front: `RelatoriosPage.jsx` |
| RF12 — alertas de vencimento e atraso | `mensalidade.service.js` → `processarAlertas`, `resumoDeAlertas`, `domain/mensalidades.js` → `alertaDevido`, `infra/email/mailer.js`, tabela `alerta` |
| RF13 — painel com indicadores | `modules/indicadores`; front: `DashboardPage.jsx` (coordenação, professor e responsável) |
| RF14 — histórico do aluno | `modules/historico` (`GET /alunos/:id/historico`); front: `HistoricoAlunoPage.jsx` |
| RF15 — relatórios e recibos em PDF | `modules/relatorios`, `mensalidade.service.js` → `recibo`, `infra/pdf/documentos.js`, `shared/extenso.js`; front: `RelatoriosPage.jsx`, `MensalidadesPage.jsx` |
| RF04 — horários de atendimento do professor | `modules/horarios` (`criarGrade`, `criarAplicadorDeGrade`), `usuario.service.js` → `criar` (professor já com a grade), `domain/agenda.js` → `horariosSeSobrepoem`, `gerarGradeDeHorarios`; front: `HorariosDisponiveis.jsx`, `GradeDeHorarios.jsx`, `HorariosDoProfessor.jsx` |
| RF05 — agenda, vagas livres e agendamento | `modules/aulas`, `horario.service.js` → `livres`, `domain/agenda.js` → `calcularHorariosLivres`, `gerarDatasSemanais`; front: `AgendaPage.jsx`, `FormAgendarAula.jsx` |
| RN08 — aluno inativo | `aluno.service.js` → `inativar` (as aulas que ainda não começaram saem da agenda — `aula.service.js` → `listar` — e liberam o horário), `reativar` (devolve as que a inativação cancelou, se o horário seguir livre), `excluir` (exclusão permanente só de inativo, com o histórico) e `aula.service.js` (não agenda aluno inativo) |
| RN09/RN10 — conflitos de agenda | `domain/agenda.js` → `encontrarAulaEmConflito` (sobre `regras.js`); usado em `aula.service.js` → `agendar` |
| RN11/RN12 — limite e prazo de reposição | `domain/regras.js` → `avaliarSolicitacaoDeReposicao`, `reposicaoDentroDoPrazo`; `domain/reposicoes.js` → `avaliarReposicao`, `prazoDaReposicao`; aplicadas em `reposicao.service.js` |
| RN13 — cobrança proporcional | `domain/regras.js` → `calcularValorProRata`, aplicada em `domain/mensalidades.js` → `valorDaMensalidade` (mês da matrícula) |
| RNF03 — senha com hash e JWT | `infra/security/passwordHasher.js`, `tokenService.js`; sessão revogável: `middlewares/auth.js` + `auth.service.js` → `validarSessao`, `usuario.service.js` → `desativar` |
| Feriados e recessos (agenda da escola) | `modules/feriados` (com `nacionais` e `cadastrarNacionais`), `domain/agenda.js` → `feriadoNaData`, `separarRestauraveis`, `domain/feriadosNacionais.js`; front: `FeriadosDaEscola.jsx` (`FeriadosNacionais`), `AgendaPage.jsx` |
| RNF04 — responsivo / mobile-first | `web/src/styles.css` (menu inferior no celular, lateral no desktop; alvos de toque ≥ 40 px no celular; formulário em folha e campos de 16 px no celular; faixa de dias no alto da agenda; agenda em colunas a partir de 1100 px), `components/Estrutura.jsx` → `Painel`, `useConfirmacao`; `public/manifest.webmanifest` (instalável) |
| Mockups 1–6 (identidade visual) | `web/src/styles.css` (tokens no `:root`), `components/Icone.jsx` → `nota` (marca ♫), `public/favicon.svg` |
| Modelo de dados (DER) | `api/prisma/schema.prisma` |

## Estratégia de testes

- **Unitários** (`api/tests/unit`): regras de negócio, validadores, serviços, controllers e middlewares com *fakes* — sem rede nem banco.
  Falta, reposição, presença e diário (`reposicoes.test.js`), mensalidades, alertas e valor por extenso (`mensalidades.test.js`),
  painel, histórico e relatório (`painel.test.js`) e a rotina (`rotinas.test.js`) rodam com relógio fixo e e-mail e PDF falsos.
- **Adaptadores** (`api/tests/adapters`): bcrypt e JWT reais; mapeamento das consultas do Prisma com cliente falso; PDFs reais
  do recibo e do relatório (inclusive a quebra de página) e o envio de e-mail com transporte injetado (`documentos.test.js`).
- **Integração** (`api/tests/integration`): sobe a API em porta aleatória e exercita os endpoints via HTTP (login, permissões, CRUD, erros) —
  inclusive o isolamento entre escolas: uma escola recém-cadastrada tenta ler, editar e excluir dados da EMMOO pelo id e recebe 404.
  `rfc.test.js` percorre RF06–RF15 pela HTTP: aviso de falta, vagas e reposição, presença e diário, mensalidades, recibo em PDF,
  alertas, painel, histórico e relatório, com as permissões de cada perfil. `gestao.test.js` cobre o dia a dia: ajuste,
  cancelamento e Pix da mensalidade, recibo numerado, remarcação, troca de senha, limite de tentativas (inclusive pelo
  `X-Forwarded-For`), planilhas CSV e feriados nacionais.
- **Regras novas com exemplos oficiais**: o "Pix copia e cola" é comparado byte a byte com o exemplo do manual do BR Code do
  Banco Central (e o CRC16 com o valor de referência `29B1`); a Páscoa, com as datas conhecidas de 2024 a 2028.
- **Front-end** (`web/src/**/*.test.*`): cliente da API (inclusive o download de arquivo), sessão/autenticação, rota protegida,
  utilitários de data e as telas de login, cadastro de escola, início (por perfil), alunos, planos, usuários, agenda, aulas,
  mensalidades, relatórios, histórico e a folha da aula (`AulaPainel`) (API simulada com `vi.mock`, relógio fixo com `vi.setSystemTime`);
  o painel e a confirmação têm testes próprios de teclado e foco (Esc, Tab preso, foco devolvido), e as telas respondem
  à confirmação com `responderConfirmacao` (`src/apoioTestes.js`).

## Observabilidade

- Atual: endpoint `GET /api/health` (usado pelo `HEALTHCHECK` do Docker) e logs de erro centralizados no `errorHandler`.
- Falha cedo e explicada: com `DB_DRIVER=mysql`, a API testa o banco ao iniciar (`conectarPrisma`) e, se não
  conseguir, encerra dizendo o motivo (MySQL desligado, banco não importado, cliente do Prisma não gerado, porta em uso).
  Se o banco cair com a API no ar, as requisições recebem `503 DATABASE_UNAVAILABLE` em vez de `500`.
- Em desenvolvimento, o proxy do Vite responde `503 API_OFFLINE` (com a instrução para subir a API) quando ela não está rodando.
- A rotina registra no log o que fez em cada escola (`[rotinas] emmoo: 2 mensalidade(s) gerada(s), 1 alerta(s) registrado(s).`)
  e os erros, sem parar as outras escolas; a tela de mensalidades mostra os alertas pendentes e a última falha de envio.
- Próximo passo: logs estruturados e métricas (Prometheus + Grafana), com alertas de disponibilidade.
