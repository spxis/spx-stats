#!/bin/bash
# Run the Wikidata dump filter on nas1 from a Mac, one command per step (the coordinating session; README.md says what each does).
#   bash scripts/wikidata_dump/nas-run.sh push            copy filter.py and occupations.tsv to the job folder on nas1
#   bash scripts/wikidata_dump/nas-run.sh extract [args]  start (or resume) the main pass in the background (people, events, items)
#   bash scripts/wikidata_dump/nas-run.sh refs            the ids the outputs point at (minutes, waits for it)
#   bash scripts/wikidata_dump/nas-run.sh labels [args]   start (or resume) the label pass in the background
#   bash scripts/wikidata_dump/nas-run.sh status          last log lines, container states, sizes in out/
#   bash scripts/wikidata_dump/nas-run.sh stop [name]     clean stop (finishes the batch, writes the state); run the same step again to resume
#   bash scripts/wikidata_dump/nas-run.sh sha256          sha256 of the raw dump into out/latest-all.json.gz.sha256 (background on nas1)
#   bash scripts/wikidata_dump/nas-run.sh fetch           rsync out/ into ~/Projects/backups/spx-stats/<dump day>-wikidata-dump-out/
# NAS_RUN_DRY=1 prints the command that would run on nas1 instead of running it. Every path and name comes from the private host
# mapping (scripts/mac/lib/hosts.sh): NAS1_SSH_ALIAS, NAS1_DOCKER_DIR, NAS1_DOCKER_BIN.
# Tests (test/test_nas_run.sh) run it with NAS_RUN_LOCAL=1 (bash instead of ssh) and a fake docker.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
# shellcheck source=../mac/lib/hosts.sh
. "$REPO/scripts/mac/lib/hosts.sh"
spx_hosts_need NAS1_SSH_ALIAS NAS1_DOCKER_DIR || exit 1

FOLDER="${WD_FOLDER:-spx-wikidata-dump}"                       # the job folder under NAS1_DOCKER_DIR
DUMP_FILE="${WD_DUMP_FILE:-latest-all.json.gz}"
DUMP_MD5="${WD_DUMP_MD5:-83b2d2e3f578e50209fd7d3ded7364b1}"    # the dump of 2026-10-12, recorded in summary.json
DUMP_DAY="${WD_DUMP_DAY:-2026-10-12}"
IMAGE="${WD_IMAGE:-python:3.13-slim}"
CPUS="${WD_CPUS:-2}"
MEM="${WD_MEM:-1g}"
SUDO="${NAS_RUN_SUDO-sudo}"
B="$NAS1_DOCKER_BIN"
D="$NAS1_DOCKER_DIR/$FOLDER"

remote() {
  if [ "${NAS_RUN_DRY:-0}" = 1 ]; then printf '%s\n' "$1"; return 0; fi
  if [ "${NAS_RUN_LOCAL:-0}" = 1 ]; then bash -c "$1"; else ssh "$NAS1_SSH_ALIAS" "$1"; fi
}

# docker_run <container name> <-d | --rm> <filter.py arguments...>
docker_run() {
  local name="$1" mode="$2"; shift 2
  local args="" a
  for a in "$@"; do args="$args '$a'"; done
  remote "D='$D'; B='$B'; S='$SUDO'; \$S \$B rm -f $name >/dev/null 2>&1; \$S \$B run $mode --name $name --init --network none --cpus $CPUS --memory $MEM --memory-swap $MEM --pids-limit 64 --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp --stop-timeout 120 --log-opt max-size=10m --log-opt max-file=3 -v \$D/$DUMP_FILE:/data/dump.json.gz:ro -v \$D/code:/app:ro -v \$D/out:/out $IMAGE python -I /app/filter.py$args"
}

cmd="${1:-}"; [ $# -gt 0 ] && shift
case "$cmd" in
  push)
    tar -C "$HERE" -cf - filter.py occupations.tsv | remote "D='$D'; S='$SUDO'; \$S mkdir -p \$D/code \$D/out && \$S tar -C \$D/code -xf - && ls -l \$D/code"
    ;;
  extract)
    docker_run spx-wikidata-filter -d extract /data/dump.json.gz /out --resume --dump-md5 "$DUMP_MD5" --dump-path "$FOLDER/$DUMP_FILE" "$@"
    echo "started spx-wikidata-filter; watch it with: bash scripts/wikidata_dump/nas-run.sh status"
    ;;
  refs)
    docker_run spx-wikidata-refs --rm refs /out
    ;;
  labels)
    docker_run spx-wikidata-labels -d labels /data/dump.json.gz /out --resume --dump-md5 "$DUMP_MD5" --dump-path "$FOLDER/$DUMP_FILE" "$@"
    echo "started spx-wikidata-labels; watch it with: bash scripts/wikidata_dump/nas-run.sh status"
    ;;
  status)
    remote "D='$D'; B='$B'; S='$SUDO'; for n in spx-wikidata-filter spx-wikidata-labels; do echo \"== \$n: \$(\$S \$B ps -a --filter name=\$n --format '{{.Status}}')\"; \$S \$B logs --tail 2 \$n 2>&1 | cut -c1-300; done; ls -l \$D/out"
    ;;
  stop)
    remote "B='$B'; S='$SUDO'; \$S \$B stop ${1:-spx-wikidata-filter}"
    ;;
  sha256)
    remote "D='$D'; S='$SUDO'; (nohup \$S sh -c \"sha256sum \$D/$DUMP_FILE | sed 's# .*/# #' > \$D/out/$DUMP_FILE.sha256\" >/dev/null 2>&1 &); echo started"
    ;;
  fetch)
    dest="$HOME/Projects/backups/spx-stats/$DUMP_DAY-wikidata-dump-out"
    mkdir -p "$dest"
    rsync -av --partial --exclude '*.state.json' "$NAS1_SSH_ALIAS:$D/out/" "$dest/"
    ls -l "$dest"
    ;;
  *)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
