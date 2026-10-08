#!/usr/bin/env bash
#
# Prepara l'ambiente wp-env per gli E2E. Fallisce (set -e) sui passi essenziali.
# Le pagine con lo shortcode le crea auth.setup.js via REST: cosi' lo stesso
# setup vale anche con WordPress Playground (npm run env:playground), che
# non ha wp-env run.
#
set -euo pipefail

run() { npx wp-env run cli wp "$@"; }

echo "→ Plugin attivo"
run plugin activate pic-simulator || true
if ! run plugin is-active pic-simulator 2>/dev/null; then
	echo "::error::WebPicSimulator non attivo. Setup fallito." >&2
	run plugin list
	exit 1
fi

echo "Setup E2E completato."
