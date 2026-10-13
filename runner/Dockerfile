FROM python:3.13-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY entry.sh /usr/local/bin/entry.sh

ENV RELEASE_SNAPSHOT_DIR=/data/snapshots \
    RELEASE_REPO=/work/repo \
    PYTHONUNBUFFERED=1

WORKDIR /work
CMD ["bash", "/usr/local/bin/entry.sh"]
