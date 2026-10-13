FROM python:3.13-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client git ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

COPY entry.sh /usr/local/bin/entry.sh

ENV DAILY_REPO=/work/repo \
    DAILY_DATA=/data \
    TZ=America/Toronto \
    PYTHONUNBUFFERED=1

WORKDIR /work
CMD ["bash", "/usr/local/bin/entry.sh"]
