#!/bin/bash
# Roda no GitHub Actions (job "deploy"): manda o servidor (EC2) se atualizar pelo SSM — sem SSH — e espera o
# resultado. O servidor baixa os arquivos de deploy deste mesmo commit e roda o atualizar.sh com a imagem nova.
set -euo pipefail
: "${INSTANCIA:?}" "${IMAGEM:?}" "${GITHUB_SHA:?}" "${GITHUB_REPOSITORY:?}" "${AWS_REGION:?}"

BASE="https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${GITHUB_SHA}/deploy"
PARAMETROS=$(jq -n --arg base "$BASE" --arg imagem "$IMAGEM" '{commands: [
  "set -euo pipefail",
  "install -d -m 0700 /opt/emmoo /opt/emmoo/nginx /opt/emmoo/backups",
  "cd /opt/emmoo",
  "curl -fsSL \($base)/aws/docker-compose.yml -o docker-compose.yml",
  "curl -fsSL \($base)/aws/atualizar.sh -o atualizar.sh",
  "curl -fsSL \($base)/aws/backup.sh -o backup.sh",
  "curl -fsSL \($base)/nginx/default.conf.template -o nginx/default.conf.template",
  "IMAGEM=\($imagem) bash atualizar.sh"
]}')

ID=$(aws ssm send-command --region "$AWS_REGION" --instance-ids "$INSTANCIA" --document-name AWS-RunShellScript \
  --comment "deploy ${GITHUB_SHA:0:7}" --timeout-seconds 900 --parameters "$PARAMETROS" \
  --query Command.CommandId --output text)
echo "Comando SSM: $ID"

# Até 10 minutos (a primeira vez baixa as imagens do MySQL e do Nginx).
for tentativa in $(seq 1 120); do
  SITUACAO=$(aws ssm get-command-invocation --region "$AWS_REGION" --command-id "$ID" --instance-id "$INSTANCIA" \
    --query Status --output text 2>/dev/null || echo Pending)
  case "$SITUACAO" in Pending | InProgress | Delayed) sleep 5 ;; *) break ;; esac
done

aws ssm get-command-invocation --region "$AWS_REGION" --command-id "$ID" --instance-id "$INSTANCIA" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text
echo "Situação: $SITUACAO"
[ "$SITUACAO" = "Success" ]
