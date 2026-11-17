# Produção na AWS

Como o EMMOO roda na AWS e como recriar a infraestrutura. Decisões na ADR 44 (`docs/arquitetura.md`).

```
Navegador ──HTTPS──► CloudFront ──HTTP + X-Origem-Emmoo──► EC2 (sa-east-1): Nginx ──► app (imagem do ECR) ──► MySQL
                                                                              backup diário (systemd) ──► S3
```

## Recursos (sa-east-1, etiqueta `Projeto=emmoo`)

| Recurso | Nome | Para quê |
|---|---|---|
| EC2 t3.micro (Amazon Linux 2023, 12 GB gp3 cifrado, créditos de CPU "standard") | `emmoo-producao` | Docker com `docker-compose.yml` desta pasta |
| IP fixo | `emmoo-ip` | Origem estável para o CloudFront |
| Grupo de segurança | `emmoo-web` | Só a porta 80, só para a lista `com.amazonaws.global.cloudfront.origin-facing`; sem porta 22 |
| CloudFront | `E27WMM60LTHQNS` (`d1uyezscfz84pc.cloudfront.net`) | HTTPS; `/assets/*` em cache (CachingOptimized); o resto sem cache, pela política `emmoo-api-sem-cache`, que inclui o `Authorization` (sem ela, o CloudFront tira esse cabeçalho dos GET) |
| ECR | `emmoo` | Imagens, com a versão do commit; guarda as 5 mais recentes |
| S3 | `emmoo-backups-740997306124` | Backups (bloqueio de acesso público, apagados com 30 dias) |
| Parameter Store | `/emmoo/JWT_SECRET`, `/emmoo/MYSQL_PASSWORD`, `/emmoo/MYSQL_ROOT_PASSWORD`, `/emmoo/ORIGEM_SEGREDO` (cifrados), `/emmoo/APP_URL`; opcionais: `/emmoo/SMTP_URL` (cifrado) e `/emmoo/EMAIL_REMETENTE` | Lidos pelo `atualizar.sh` a cada deploy (sem os de e-mail, os alertas ficam pendentes e o "esqueci minha senha" desligado) |
| Papel da máquina | `emmoo-ec2` | SSM, leitura do ECR, leitura de `/emmoo/*`, gravação no bucket |
| Papel do deploy | `emmoo-github-deploy` | Assumido pelo GitHub Actions por OIDC: envia imagem ao ECR e manda comando SSM só para máquinas com `Projeto=emmoo` |

## Confiança do GitHub (OIDC)

O papel `emmoo-github-deploy` só aceita a `main` deste repositório. Repositórios criados no GitHub depois de julho de 2026
mandam o `sub` com os ids numéricos (formato imutável); a política aceita os dois formatos:

```json
"token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
"token.actions.githubusercontent.com:sub": [
  "repo:luizpassoss@136658114/EMMOO@1396122080:ref:refs/heads/main",
  "repo:luizpassoss/EMMOO:ref:refs/heads/main"
]
```

Sem um job `environment` no workflow: com ele, o `sub` passaria a dizer o ambiente, não o ramo.

## Deploy

Automático a cada push na `main` com os testes passando (job `deploy` em `.github/workflows/ci.yml`):
imagem → ECR → `disparar.sh` (SSM) → no servidor, `atualizar.sh` baixa os arquivos daquele commit, escreve o `.env`
a partir do Parameter Store, atualiza os containers e espera `/api/health`.

## Tarefas no servidor

Pelo console: EC2 → `emmoo-producao` → Conectar → Session Manager. Depois `sudo -i` e `cd /opt/emmoo`.

- Logs: `docker compose logs -f app`
- Nova escola: `docker compose exec app npm run escola:criar -- --nome "..." --codigo ... --responsavel "..." --email ...`
- Testar o e-mail: `docker compose exec app npm run email:testar -- --para alguem@exemplo.com`
- Backup agora: `emmoo-backup` · próximos: `systemctl list-timers emmoo-backup.timer`
- Restaurar: ver o cabeçalho de `backup.sh`

## Custo

Cerca de US$ 17–19 por mês (t3.micro, disco, IP público e CloudFront dentro da cota gratuita), pagos com os créditos do
plano gratuito da conta. Quando os créditos ou o prazo do plano acabarem, a conta precisa passar para o plano pago para
o sistema continuar no ar.
