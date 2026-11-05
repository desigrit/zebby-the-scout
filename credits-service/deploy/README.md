# Run the credits service on a Linux VM

The service runs as a dedicated `zebby` user, behind Caddy HTTPS. Supabase remains the wallet ledger and Stripe delivers signed payment events. Node runs separately from other projects on the VM.

## Prepare the host

Use Ubuntu 24.04 or a compatible systemd host with Node 22.13 or later. Install a supported Node 22 release under `/opt/zebby/node`, verifying the download against Node's published SHA-256 checksum. Install Caddy from a maintained package repository.

Create the service account and directories:

```sh
sudo useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin zebby
sudo install -d -m 755 /opt/zebby/releases
sudo install -d -m 700 /etc/zebby
```

Transfer the environment file through SSH. Store it at `/etc/zebby/credits.env`, owned by root with mode `0600`. Start with [environment.example](../environment.example), then set:

```dotenv
PORT=8080
ZEBBY_BIND_ADDRESS=127.0.0.1
ZEBBY_TRUST_PROXY_HOPS=1
ZEBBY_PUBLIC_SERVICE_URL=https://YOUR-HOSTNAME
```

Set the Supabase, Stripe and provider credentials in that file. The Stripe signing secret must belong to this host's webhook destination. Keep secret values out of shell arguments, deployment logs and source control.

Assign a static public IP and DNS name. Allow inbound TCP 80 and 443, retaining the existing SSH source restriction. Keep port 8080 private. On Azure, set the public IP's TCP idle timeout to 15 minutes so a long analysis is not interrupted by the default four-minute timeout.

## Install a release

Build from the repository root:

```sh
npm ci
node scripts/build-credits-service.mjs --standalone
```

Upload `credits-service/dist/server.mjs` to a new directory such as `/opt/zebby/releases/RELEASE/`. This bundle includes its JavaScript dependencies. Keep the previous release for rollback.

Copy [zebby-credits.service](zebby-credits.service) to `/etc/systemd/system/`. Adapt [Caddyfile.example](Caddyfile.example) for the hostname, integrating its site block into the existing Caddy configuration. Set the `current` symlink to the release directory:

```sh
sudo ln -sfn releases/RELEASE /opt/zebby/current
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now zebby-credits
sudo systemctl reload caddy
```

Set `ZEBBY_SERVICE_COMMIT` to the deployed Git commit. `/health` exposes only the version, commit and payment mode. Check HTTPS `/health` and `/v1/catalog` after each deployment. Review startup failures with `journalctl -u zebby-credits`; logs exclude request bodies, keys and resumes.

The unit restarts on failure and at boot. Its 512 MB memory limit and one-core CPU limit leave capacity for other VM projects. The nine-minute proxy header timeout accommodates the app's analysis deadline. Disable VM auto-shutdown if this is an always-on service.

## Release public Boards

The **Verify the Boards service and release desktop** workflow builds the exact main commit and publishes a service prerelease containing the standalone server, a direct-provider smoke test and a promotion script. Desktop clients receive stable desktop tags only.

1. In the production Supabase SQL Editor, run [the Boards ledger migration](../migrations/20261104_boards.sql). It extends the existing quote kinds and preserves balances, reservations and history.
2. On the credits VM, use Azure Run Command or an existing administrative session. Set `sha` to the full main commit and `digest` to the tarball SHA-256 shown by the workflow. Run the following in Bash.

```bash
set -euo pipefail
stage=$(mktemp -d /tmp/zebby-upload.XXXXXXXX)
tag="credits-2.7.0-${sha:0:12}"
curl --fail --silent --show-error --location --proto '=https' \
  "https://github.com/desigrit/zebby-the-scout/releases/download/$tag/zebby-credits-$sha.tar.gz" -o "$stage/bundle.tar.gz"
cd "$stage"
printf '%s  bundle.tar.gz\n' "$digest" | sha256sum --check --status
tar --no-same-owner -xzf bundle.tar.gz server.mjs provider-smoke.mjs promote.sh SHA256SUMS
sha256sum --check SHA256SUMS
bash promote.sh "$sha" "$stage" "$(sha256sum server.mjs | cut -d' ' -f1)" "$(sha256sum provider-smoke.mjs | cut -d' ' -f1)"
```

The script verifies both configured provider keys with synthetic role data, restarts the service and checks the running commit. A failed health check restores the previous release. Rerun the workflow's failed verification job after promotion. It checks the deployed commit and confirms that an unfunded ordinary wallet can quote both models and recover from insufficient funds. Once those checks pass, GitHub tags that main commit and starts the desktop installer and Microsoft Store builds.

## Update and roll back

GitHub pushes do not deploy to the VM automatically. Upload a new bundle, update the `current` symlink and run `sudo systemctl restart zebby-credits`. Existing requests get up to nine minutes to finish during a graceful stop. Check health before announcing the deployment.

To roll back, point `current` at the previous release and restart the service. Keep the same environment and Supabase project. Do not recreate wallet tables or change device credentials during a host migration.

## Moving existing clients

The desktop client recognizes only the explicitly approved Render and Azure origins as the same wallet service. It retains the original encrypted storage origin, allowing older installers to read the same wallet after a rollback. Unrelated origins cannot receive saved credentials. Wallets, recovery codes and pending analysis receipts stay intact.

Keep the old service and its Stripe destination active while installed clients still use it. Both destinations can deliver the same Stripe event: the Supabase ledger deduplicates payment and refund events. Set `ZEBBY_CREDITS_SERVICE_URL` to the new origin for future desktop builds, and update Android's `CREDITS_URL` alongside its release.
