#!/bin/bash
# nas-run.sh with bash instead of ssh and a fake docker that prints its arguments: checks the quoting and the arguments of every step.
#   bash scripts/wikidata_dump/test/test_nas_run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RUN="$HERE/../nas-run.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/docker"
cat > "$T/fakedocker" <<'EOF'
#!/bin/bash
printf 'docker'; for a in "$@"; do printf ' [%s]' "$a"; done; echo
EOF
chmod +x "$T/fakedocker"
export NAS_RUN_LOCAL=1 NAS_RUN_SUDO= NAS1_DOCKER_BIN="$T/fakedocker" NAS1_DOCKER_DIR="$T/docker" NAS1_SSH_ALIAS=unused SPX_HOSTS_CONFIG=/nonexistent
D="$T/docker/spx-wikidata-dump"
ok() { echo "ok   $1"; }
has() { case "$2" in *"$3"*) ok "$1";; *) echo "FAIL $1: '$3' not in: $2" >&2; exit 1;; esac; }

bash "$RUN" push >/dev/null
[ -f "$D/code/filter.py" ] && [ -f "$D/code/occupations.tsv" ] && [ -d "$D/out" ] && ok "push copies the two files and makes out/"

out="$(bash "$RUN" extract --workers 2)"
has "extract removes an old container first" "$(NAS_RUN_DRY=1 bash "$RUN" extract)" '$S $B rm -f spx-wikidata-filter'

has "extract runs detached with limits" "$out" "docker [run] [-d] [--name] [spx-wikidata-filter] [--init] [--network] [none] [--cpus] [2] [--memory] [1g]"
has "dump is read-only" "$out" "[-v] [$D/latest-all.json.gz:/data/dump.json.gz:ro]"
has "code is read-only" "$out" "[-v] [$D/code:/app:ro]"
has "out is writable" "$out" "[-v] [$D/out:/out]"
has "root fs read-only, no capabilities" "$out" "[--cap-drop] [ALL] [--security-opt] [no-new-privileges] [--read-only] [--tmpfs] [/tmp]"
has "extract arguments" "$out" "[python:3.13-slim] [python] [-I] [/app/filter.py] [extract] [/data/dump.json.gz] [/out] [--resume] [--dump-md5] [83b2d2e3f578e50209fd7d3ded7364b1] [--dump-path] [spx-wikidata-dump/latest-all.json.gz] [--workers] [2]"

out="$(bash "$RUN" refs)"
has "refs runs in the foreground and is removed" "$out" "[run] [--rm] [--name] [spx-wikidata-refs]"
has "refs arguments" "$out" "[/app/filter.py] [refs] [/out]"
out="$(bash "$RUN" labels)"
has "labels arguments" "$out" "[/app/filter.py] [labels] [/data/dump.json.gz] [/out] [--resume]"
has "stop" "$(bash "$RUN" stop)" "docker [stop] [spx-wikidata-filter]"
has "status asks for both containers" "$(bash "$RUN" status)" "== spx-wikidata-labels"
has "dry run prints and runs nothing" "$(NAS_RUN_DRY=1 bash "$RUN" sha256)" "sha256sum"
bash "$RUN" nonsense >/dev/null 2>&1 && { echo "FAIL: unknown step accepted" >&2; exit 1; } || ok "unknown step refused"
echo "all nas-run checks passed"
