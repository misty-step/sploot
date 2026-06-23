# Fly substrate spike (backlog 044 child 6) — throwaway proof that an agent can
# stand up + operate sploot on Fly with only the Fly token on disk.
#
# Pragmatic full-install image (reliability over size): a production migration
# would switch to Next.js `output: 'standalone'` to shrink this. The load-bearing
# claim here is agent deploy + atomic migrate-on-deploy + pgvector-on-MPG, none
# of which depend on image minimalism.
#
# Build context is the repo ROOT (monorepo: apps/web depends on @sploot/common).
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# openssl: Prisma engine + TLS to MPG. ca-certificates: outbound HTTPS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS build
# Copy the whole workspace (node_modules/.next/.git excluded via .dockerignore)
# so --frozen-lockfile sees a complete workspace. --ignore-scripts avoids host
# postinstall surprises (lefthook); we run prisma generate explicitly.
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter web exec prisma generate
# next build prerenders pages wrapped in <ClerkProvider>, which throws on a
# missing publishable key. The spike build injected a format-valid but FAKE key
# via this arg (a base64 pk_test_ value decoding to "clerk.example.com$");
# runtime auth stays unconfigured. Empty default so no secret-shaped literal is
# committed — pass `--build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…` if
# prerender throws.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
# `web build` = migrate-deploy.mjs (skips with no DATABASE_URL at build) + next build.
RUN pnpm --filter web build

FROM base AS runner
ENV NODE_ENV=production
# The built workspace, including dev deps so the Prisma CLI is present for the
# release_command (atomic migrate-on-deploy).
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-p", "3000"]
