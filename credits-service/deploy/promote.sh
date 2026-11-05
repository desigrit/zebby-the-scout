#!/usr/bin/env bash
set -Eeuo pipefail
sha=$1
stage=$2
server_digest=$3
smoke_digest=$4
[[ $sha =~ ^[a-f0-9]{40}$ && $stage =~ ^/tmp/zebby-upload\.[a-zA-Z0-9]+$ ]]
[[ $server_digest =~ ^[a-f0-9]{64}$ && $smoke_digest =~ ^[a-f0-9]{64}$ ]]
cd "$stage"
trap 'rm -f -- "$stage/server.mjs" "$stage/provider-smoke.mjs" "$stage/promote.sh" "$stage/SHA256SUMS" "$stage/bundle.tar.gz"; rmdir -- "$stage" || true' EXIT
printf '%s  server.mjs\n%s  provider-smoke.mjs\n' "$server_digest" "$smoke_digest" | sha256sum --check --status
root=/opt/zebby
release="$root/releases/$sha"
previous=$(readlink -f "$root/current")
[[ "$previous" == "$root/releases/"* && -f "$previous/server.mjs" ]]
sudo -n install -d -m 0755 "$release"
for file in server.mjs provider-smoke.mjs; do
  if [[ -e "$release/$file" ]]; then cmp -- "$file" "$release/$file"; else sudo -n install -m 0644 "$file" "$release/$file"; fi
done
sudo -n systemd-run --quiet --wait --collect --pipe --property=User=zebby --property=EnvironmentFile=/etc/zebby/credits.env \
  /opt/zebby/node/bin/node "$release/provider-smoke.mjs"
activate() {
  sudo -n ln -sfn -- "$1" "$root/current.$sha"
  sudo -n mv -Tf -- "$root/current.$sha" "$root/current"
  sudo -n systemctl restart zebby-credits.service
}
restore() {
  trap - ERR
  activate "$previous"
  exit 1
}
trap restore ERR
activate "$release"
ready=false
for _ in {1..20}; do
  if curl --silent --fail --max-time 5 http://127.0.0.1:8080/health | /opt/zebby/node/bin/node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{try{const h=JSON.parse(s);process.exitCode=Number(!h.ok||h.mode!=="live"||h.commit!==process.argv[1])}catch{process.exitCode=1}})' "$sha"; then
    ready=true
    break
  fi
  sleep 2
done
"$ready"
trap - ERR
