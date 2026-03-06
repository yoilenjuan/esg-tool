# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests first (better layer caching)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/scanner/package.json ./packages/scanner/
COPY packages/report/package.json ./packages/report/
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Build shared packages then API
RUN pnpm --filter shared build
RUN pnpm --filter scanner build
RUN pnpm --filter report build
RUN pnpm --filter api build

# pnpm deploy creates a fully self-contained folder:
# - copies dist + package.json
# - resolves ALL workspace:* deps and copies their built dist into node_modules
# - no symlinks, all real files — fixes MODULE_NOT_FOUND at runtime
RUN pnpm --filter api deploy --prod /app/standalone

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim AS runner

# Install system dependencies required by Playwright's Chromium
RUN apt-get update && apt-get install -y \
  ca-certificates \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Copy the self-contained bundle produced by pnpm deploy
# All deps are real files (no symlinks), workspace:* packages resolved into node_modules
COPY --from=builder /app/standalone ./

# Install Playwright's Chromium + all its OS dependencies in one step
RUN npx playwright install --with-deps chromium

RUN mkdir -p /app/runs

EXPOSE 3001

CMD ["node", "dist/index.js"]
