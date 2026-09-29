# Como contribuir

Este projeto é desenvolvido individualmente, com **revisão por pares do squad** (PAC Extensionista).

## Fluxo de trabalho

1. Crie uma *issue* descrevendo a tarefa ou o bug (use os templates).
2. Crie uma branch a partir de `develop`: `feature/<assunto>` ou `fix/<assunto>`.
3. Escreva os testes junto com o código (TDD) e mantenha o CI verde.
4. Abra um **Pull Request** para `develop` preenchendo o template.
5. Pelo menos **um colega do squad** revisa o PR antes do merge.
6. `develop` é integrada em `main` a cada entrega (MVP).

## Mensagens de commit

Padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português:

```
feat(alunos): permite inativar aluno
fix(auth): trata token expirado
test(regras): cobre cálculo pro rata em fevereiro
docs: atualiza instruções de execução
```

## Padrões de código

- Camadas: `routes → controller → service → repository`. Regra de negócio fica em `service` ou `domain`, nunca no controller.
- Dependências são injetadas (factories), o que mantém tudo testável.
- Nada de segredos no código: use `.env` (veja `.env.example`).
- Antes do PR: `npm run lint` e `npm run test:coverage` na `api/`, `npm run test:coverage` e `npm run build` no `web/`.

## Revisão de código (para o squad)

Ao revisar, comente sobre: clareza e nomes, responsabilidade de cada camada, casos de teste faltando,
tratamento de erros, segurança (permissões, validação de entrada) e aderência à RFC.
