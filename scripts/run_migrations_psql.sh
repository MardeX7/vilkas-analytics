#!/bin/bash
# Ajaa KPI migraatiot psql:llä
#
# Käyttö:
#   1. Hae database password: https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/settings/database
#   2. Aja: PGPASSWORD="xxxx" ./scripts/run_migrations_psql.sh

PSQL="/usr/local/Cellar/libpq/18.1/bin/psql"
PROJECT_REF="tlothekaphtiwvusgwzh"
DB_HOST="db.${PROJECT_REF}.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

cd "$(dirname "$0")/.."

echo "🟩 VilkasAnalytics - KPI Migrations via psql"
echo ""

if [ -z "$PGPASSWORD" ]; then
    echo "❌ PGPASSWORD ei ole asetettu"
    echo ""
    echo "Käyttö:"
    echo "  1. Hae salasana: https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/settings/database"
    echo "  2. Aja: PGPASSWORD=\"xxx\" ./scripts/run_migrations_psql.sh"
    exit 1
fi

echo "📄 Ajetaan: 020_create_kpi_index_tables.sql"
$PSQL "postgresql://${DB_USER}:${PGPASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" -f supabase/migrations/020_create_kpi_index_tables.sql

if [ $? -eq 0 ]; then
    echo "✅ 020 OK"
else
    echo "❌ 020 epäonnistui"
    exit 1
fi

echo ""
echo "📄 Ajetaan: 021_create_kpi_helper_functions.sql"
$PSQL "postgresql://${DB_USER}:${PGPASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" -f supabase/migrations/021_create_kpi_helper_functions.sql

if [ $? -eq 0 ]; then
    echo "✅ 021 OK"
else
    echo "❌ 021 epäonnistui"
    exit 1
fi

echo ""
echo "🎉 Migraatiot ajettu onnistuneesti!"
