
set -euo pipefail

ORIGEM="/DATA/AppData/controle-gastos/gastos.db"
DESTINO="${BACKUP_DIR:-/DATA/Backups/controle-gastos}"
MANTER_DIAS=30

mkdir -p "$DESTINO"
ARQUIVO="$DESTINO/gastos-$(date +%F).db"

rm -f "/DATA/AppData/controle-gastos/backup-tmp.db"
docker exec controle-gastos node -e "
  const { DatabaseSync } = require('node:sqlite');
  new DatabaseSync('/data/gastos.db').exec(\"VACUUM INTO '/data/backup-tmp.db'\");
"
mv "/DATA/AppData/controle-gastos/backup-tmp.db" "$ARQUIVO"

find "$DESTINO" -name 'gastos-*.db' -mtime +$MANTER_DIAS -delete
echo "Backup salvo em $ARQUIVO"
