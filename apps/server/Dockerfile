# syntax=docker/dockerfile:1.7
# Context: apps/server. Named migrations remain the separate Node PRE_DEPLOY job.
FROM --platform=$BUILDPLATFORM golang:1.27.1-bookworm@sha256:648f440f42a0958804efb24df176f806f9d353b41f1c0627f666428e40310f6b AS build
ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOFLAGS=-mod=readonly
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd/ ./cmd/
COPY internal/ ./internal/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -buildvcs=false -o /out/sploot ./cmd/sploot \
    && GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -buildvcs=false -o /out/library-backup ./cmd/library-backup

FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171 AS runtime
# Bookworm security updates supply FFmpeg/ffprobe and the matched PostgreSQL 15
# dump/restore pair for the pgvector:pg15 reference. A newer source DB major
# requires a matching supported client pair before taking a production backup.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates ffmpeg postgresql-client-15 tini \
    && groupadd --system --gid 10001 sploot \
    && useradd --system --uid 10001 --gid 10001 --home-dir /var/lib/sploot --create-home --shell /usr/sbin/nologin sploot \
    && install -d -o 10001 -g 10001 -m 0700 /var/lib/sploot /tmp/sploot \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chmod=0555 /out/sploot /out/library-backup /usr/local/bin/
ENV SPLOOT_LISTEN_ADDR=0.0.0.0:3001 SPLOOT_DEPLOYMENT_ENV=production TMPDIR=/tmp/sploot HOME=/var/lib/sploot
WORKDIR /var/lib/sploot
USER 10001:10001
EXPOSE 3001
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["/usr/local/bin/sploot"]
