#!/usr/bin/env bash
# Despliega la Edge Function coupon-emails (cupones por correo) en el VPS.
#
# Uso (en el VPS, como root), después de copiar los archivos de la función:
#   scp -r supabase/functions/coupon-emails root@VPS:/root/supabase/functions/
#   scp supabase/functions/_shared/{coupon-email,secret-box,unsubscribe-token,email-contract-cases,cors,staff-auth}.ts root@VPS:/root/supabase/functions/_shared/
#   scp supabase/functions/client-pii/index.ts root@VPS:/root/supabase/functions/client-pii/index.ts
#   bash /root/supabase/deploy-coupon-emails.sh
#
# Igual que deploy-client-pii.sh: recrea supabase_edge_runtime_root con la entrada
# `coupon-emails` en SUPABASE_INTERNAL_FUNCTIONS_CONFIG (cada función recibe sus
# secretos ahí, no como variables del contenedor) y deja el viejo como *_old para
# volver atrás:
#   docker rm -f supabase_edge_runtime_root && docker rename supabase_edge_runtime_root_old supabase_edge_runtime_root && docker start supabase_edge_runtime_root
#
# Secretos (en /root/supabase/.coupon-email.env, 600; se generan la primera vez):
#   RESEND_API_KEY             la de GodCode; por defecto la del SMTP de Auth (.resend-smtp.env)
#   EMAIL_SENDER_SECRET_KEY    32 bytes base64. La MISMA tiene que ir en la app GodCode (Coolify)
#   EMAIL_UNSUBSCRIBE_SECRET   La MISMA tiene que ir en la app GodCode (Coolify)
set -euo pipefail

NAME=supabase_edge_runtime_root
OLD=${NAME}_old
DIR=/root/supabase
TMP=$DIR/.temp
ENV_FILE=$TMP/edge-runtime.env
SECRETS=$DIR/.coupon-email.env

for f in coupon-emails/index.ts _shared/coupon-email.ts _shared/secret-box.ts _shared/unsubscribe-token.ts _shared/cors.ts _shared/staff-auth.ts; do
  [ -f "$DIR/functions/$f" ] || { echo "Falta $DIR/functions/$f: cópialo antes." >&2; exit 1; }
done

if docker inspect "$OLD" >/dev/null 2>&1; then
  echo "Ya existe $OLD (de un intento anterior). Bórralo o renómbralo antes de seguir." >&2
  exit 1
fi

if [ ! -f "$SECRETS" ]; then
  umask 077
  smtp_key=$(grep '^RESEND_SMTP_KEY=' "$DIR/.resend-smtp.env" | cut -d= -f2- | tr -d '"')
  {
    echo "RESEND_API_KEY=$smtp_key"
    echo "COUPON_EMAIL_FROM=cupones@godcode.me"
    echo "EMAIL_SENDER_SECRET_KEY=$(head -c 32 /dev/urandom | base64)"
    echo "EMAIL_UNSUBSCRIBE_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '/+=')"
    echo "EMAIL_UNSUBSCRIBE_BASE_URL=https://www.godcode.me"
    echo "TENANT_STOREFRONT_ORIGIN=https://www.godcode.me"
  } > "$SECRETS"
  echo "Secretos nuevos en $SECRETS. Copia EMAIL_SENDER_SECRET_KEY y EMAIL_UNSUBSCRIBE_SECRET a la app GodCode en Coolify."
fi

python3 - "$ENV_FILE" "$SECRETS" <<'PY'
import base64, json, os, subprocess, sys
secrets = {}
for line in open(sys.argv[2]):
    line = line.strip()
    if line and not line.startswith("#"):
        k, v = line.split("=", 1)
        secrets[k] = v
for k in ("RESEND_API_KEY", "COUPON_EMAIL_FROM", "EMAIL_SENDER_SECRET_KEY", "EMAIL_UNSUBSCRIBE_SECRET"):
    if not secrets.get(k):
        sys.exit(f"Falta {k} en {sys.argv[2]}")
if len(base64.b64decode(secrets["EMAIL_SENDER_SECRET_KEY"])) != 32:
    sys.exit("EMAIL_SENDER_SECRET_KEY tiene que ser 32 bytes en base64")
if len(secrets["EMAIL_UNSUBSCRIBE_SECRET"]) < 32:
    sys.exit("EMAIL_UNSUBSCRIBE_SECRET tiene que tener al menos 32 caracteres")
c = json.loads(subprocess.check_output(["docker", "inspect", "supabase_edge_runtime_root"]))[0]
out = []
for e in c["Config"]["Env"]:
    k, v = e.split("=", 1)
    if "\n" in v:
        sys.exit(f"{k} tiene saltos de línea; no se puede usar --env-file")
    if k == "SUPABASE_INTERNAL_FUNCTIONS_CONFIG":
        cfg = json.loads(v)
        cfg["coupon-emails"] = {
            "verifyJWT": True,
            "entrypointPath": "supabase/functions/coupon-emails/index.ts",
            "env": secrets,
        }
        v = json.dumps(cfg, separators=(",", ":"))
    out.append(f"{k}={v}")
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, ("\n".join(out) + "\n").encode())
os.close(fd)
print("Funciones:", ", ".join(sorted(cfg)))
PY

IMAGE=$(docker inspect -f '{{.Config.Image}}' "$NAME")
docker cp "$NAME:/root/index.ts" "$TMP/edge-main-index.ts"

docker rename "$NAME" "$OLD"
docker create --name "$NAME" \
  --network supabase_network_root --network-alias edge_runtime \
  --add-host host.docker.internal:host-gateway \
  --restart unless-stopped \
  --log-opt max-file=3 --log-opt max-size=10m \
  -v /root/supabase/functions:/root/supabase/functions:ro \
  -v supabase_edge_runtime_root:/root/.cache/deno \
  -w /root \
  --label com.docker.compose.project=root \
  --label com.supabase.cli.project=root \
  --label com.supabase.cli.workdir=/root \
  --env-file "$ENV_FILE" \
  --entrypoint sh \
  "$IMAGE" -c 'exec edge-runtime start --main-service=/root --port=8081 --policy=per_worker
' >/dev/null
docker cp "$TMP/edge-main-index.ts" "$NAME:/root/index.ts"
rm -f "$ENV_FILE"

docker stop "$OLD" >/dev/null
docker update --restart=no "$OLD" >/dev/null
docker start "$NAME" >/dev/null
sleep 4

if docker exec "$NAME" sh -c 'exit 0' && [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = true ]; then
  echo "OK: $NAME arriba con coupon-emails. Contenedor viejo detenido como $OLD."
  docker logs --tail 5 "$NAME"
else
  echo "El contenedor nuevo no arrancó; vuelvo al anterior." >&2
  docker logs --tail 30 "$NAME" >&2 || true
  docker rm -f "$NAME" >/dev/null
  docker rename "$OLD" "$NAME"
  docker update --restart=unless-stopped "$NAME" >/dev/null
  docker start "$NAME" >/dev/null
  exit 1
fi
