#!/bin/bash
# Atualiza o EMMOO no servidor. Chamado pelo GitHub Actions via SSM (sem SSH), depois que os testes passam:
#   IMAGEM=<conta>.dkr.ecr.sa-east-1.amazonaws.com/emmoo:<commit> bash atualizar.sh
# Escreve o .env a partir do Parameter Store, baixa a imagem nova do ECR, sobe os containers, espera a API
# responder pelo Nginx e instala a rotina de backup diário (RNF07).
set -euo pipefail
cd /opt/emmoo
: "${IMAGEM:?Informe IMAGEM (repositório:versão no ECR)}"
REGIAO=sa-east-1

parametro() { aws ssm get-parameter --region "$REGIAO" --name "/emmoo/$1" --with-decryption --query Parameter.Value --output text; }
umask 077
{
  echo "IMAGEM=$IMAGEM"
  echo "JWT_SECRET=$(parametro JWT_SECRET)"
  echo "MYSQL_PASSWORD=$(parametro MYSQL_PASSWORD)"
  echo "MYSQL_ROOT_PASSWORD=$(parametro MYSQL_ROOT_PASSWORD)"
  echo "ORIGEM_SEGREDO=$(parametro ORIGEM_SEGREDO)"
  echo "APP_URL=$(parametro APP_URL)"
} > .env.novo
mv .env.novo .env

aws ecr get-login-password --region "$REGIAO" | docker login --username AWS --password-stdin "${IMAGEM%%/*}" >/dev/null
docker compose pull --quiet
docker compose up -d --remove-orphans

# A API alinha as tabelas ao iniciar e só então responde; o Nginx exige o cabeçalho do CloudFront.
SEGREDO=$(grep '^ORIGEM_SEGREDO=' .env | cut -d= -f2-)
for tentativa in $(seq 1 60); do
  if curl -fsS -H "X-Origem-Emmoo: $SEGREDO" http://127.0.0.1/api/health >/dev/null 2>&1; then
    echo "EMMOO no ar: $IMAGEM"
    break
  fi
  if [ "$tentativa" = 60 ]; then
    echo "A API não respondeu em 3 minutos. Últimas linhas do log:"
    docker compose logs --tail 60 app
    exit 1
  fi
  sleep 3
done

# Imagens antigas ocupam disco (o servidor tem 12 GB); as versões continuam no ECR para voltar atrás.
docker image prune -af --filter "until=24h" >/dev/null || true

# Backup diário às 3h (horário de Brasília), também depois de um período desligado (Persistent).
install -m 0755 backup.sh /usr/local/bin/emmoo-backup
cat > /etc/systemd/system/emmoo-backup.service <<'UNIDADE'
[Unit]
Description=Backup diário do banco do EMMOO (servidor e S3)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/emmoo-backup
UNIDADE
cat > /etc/systemd/system/emmoo-backup.timer <<'UNIDADE'
[Unit]
Description=Agenda o backup diário do banco do EMMOO

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=10m
Persistent=true

[Install]
WantedBy=timers.target
UNIDADE
systemctl daemon-reload
systemctl enable --now emmoo-backup.timer >/dev/null
echo "Backup diário agendado: $(systemctl list-timers emmoo-backup.timer --no-legend | awk '{print $1, $2, $3}')"
