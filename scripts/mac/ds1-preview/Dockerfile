# The always-on DS1 preview site (scripts/mac/ds1-preview.sh --install / --update). Build context: a clean `git archive` of the repository.
# Builds for linux/amd64 and linux/arm64 alike (no native image deps beyond what pnpm installs). Holds source and dependencies only: the pages
# are built when the container starts (site-entry.sh), because `next build` reads the data and the data is behind the compose network.
FROM node:22-bookworm-slim

ARG SPX_SHA=unknown
ARG SPX_REVALIDATE=300
ENV NEXT_TELEMETRY_DISABLED=1 \
    SPX_PREVIEW=1 \
    SPX_REVALIDATE=${SPX_REVALIDATE} \
    SPX_PREVIEW_SHA=${SPX_SHA} \
    VERCEL_GIT_COMMIT_SHA=${SPX_SHA}
LABEL org.opencontainers.image.revision=${SPX_SHA}

RUN npm install -g pnpm@10.28.0 && mkdir -p /app/web/.next && chown -R node:node /app
USER node
WORKDIR /app/web

COPY --chown=node:node web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY --chown=node:node web/ ./

# Pages repeat the revalidate time as a literal number (Next reads segment config statically), so the preview rewrites it to SPX_REVALIDATE
# here, on this image's copy of the source only; the repository and production keep 86400 (live) or 2592000 (historical). Fails the build if one was missed.
RUN grep -rlE "^export const revalidate = (86400|2592000);" src | xargs sed -i -E "s/^export const revalidate = (86400|2592000);/export const revalidate = ${SPX_REVALIDATE};/" \
 && ! grep -rE "^export const revalidate = (86400|2592000)" src

COPY --chown=node:node scripts/mac/ds1-preview/site-entry.sh /app/site-entry.sh
EXPOSE 3000
CMD ["sh", "/app/site-entry.sh"]
