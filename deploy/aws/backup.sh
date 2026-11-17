#!/bin/bash
# Backup do banco do EMMOO (RNF07): uma cópia comprimida no servidor (guardada por 7 dias) e outra no S3 (o bucket
# apaga as de mais de 30 dias). Roda todo dia pelo timer do systemd; à mão: sudo emmoo-backup
# Restaurar: gunzip -c emmoo-AAAA-MM-DD-HHMM.sql.gz | docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot emmoo'
set -euo pipefail
cd /opt/emmoo
BUCKET=emmoo-backups-740997306124
ARQUIVO="backups/emmoo-$(date +%Y-%m-%d-%H%M).sql.gz"
mkdir -p backups

docker compose exec -T db sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --no-tablespaces emmoo' \
  | gzip > "$ARQUIVO"
# Um backup vazio ou cortado não pode passar por bom.
if ! gunzip -c "$ARQUIVO" | grep -q "CREATE TABLE"; then
  echo "Backup inválido: $ARQUIVO não tem as tabelas." >&2
  rm -f "$ARQUIVO"
  exit 1
fi

aws s3 cp --region sa-east-1 --only-show-errors "$ARQUIVO" "s3://$BUCKET/$(basename "$ARQUIVO")"
find backups -name 'emmoo-*.sql.gz' -mtime +7 -delete
echo "Backup concluído: $ARQUIVO ($(du -h "$ARQUIVO" | cut -f1)), cópia em s3://$BUCKET"
