# syntax=docker/dockerfile:1.7
# Context: apps/server. SQLite schema, native inference and media tools ship together.
FROM golang:1.27.1-bookworm@sha256:648f440f42a0958804efb24df176f806f9d353b41f1c0627f666428e40310f6b AS build
ENV CGO_ENABLED=1 GOTOOLCHAIN=local GOFLAGS=-mod=readonly
RUN apt-get update \
    && apt-get install --yes --no-install-recommends libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY cmd/ ./cmd/
COPY internal/ ./internal/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -buildvcs=false -o /out/sploot ./cmd/sploot \
    && go build -trimpath -buildvcs=false -o /out/library-backup ./cmd/library-backup

FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171 AS runtime
# CPU ONNX Runtime is provisioned into the persistent model cache on first start.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates ffmpeg libgomp1 tini \
    && groupadd --system --gid 10001 sploot \
    && useradd --system --uid 10001 --gid 10001 --home-dir /var/lib/sploot --create-home --shell /usr/sbin/nologin sploot \
    && install -d -o 10001 -g 10001 -m 0700 /var/lib/sploot/library /var/cache/sploot/models /tmp/sploot \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chmod=0555 /out/sploot /out/library-backup /usr/local/bin/
ENV SPLOOT_LISTEN_ADDR=0.0.0.0:3001 SPLOOT_DEPLOYMENT_ENV=production SPLOOT_DATA_DIR=/var/lib/sploot/library SPLOOT_MODEL_DIR=/var/cache/sploot/models TMPDIR=/tmp/sploot HOME=/var/lib/sploot
WORKDIR /var/lib/sploot
USER 10001:10001
EXPOSE 3001
VOLUME ["/var/lib/sploot/library", "/var/cache/sploot/models"]
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["/usr/local/bin/sploot"]
