FROM postgres:17

# pg_dump 17 must be at least the server's major version (DS1 runs 17). python3 is for the run log (scripts/runlog/runlog.py), git for the code.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 git ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory '*'

COPY entry.sh /usr/local/bin/entry.sh

ENV BACKUP_REPO=/work/repo \
    BACKUP_DATA=/data \
    BACKUP_DIR=/backups \
    RUNLOG_SPOOL=/data/runlog-pending.jsonl \
    TZ=America/Toronto \
    PYTHONUNBUFFERED=1

WORKDIR /work
# the base image's own entrypoint would start a database
ENTRYPOINT ["bash", "/usr/local/bin/entry.sh"]
