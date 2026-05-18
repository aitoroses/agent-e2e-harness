FROM node:22-bookworm-slim

WORKDIR /workspace

ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY packages/harness/package.json packages/harness/package.json
COPY apps/showcase/package.json apps/showcase/package.json

RUN npm ci --ignore-scripts

COPY tsconfig.base.json tsconfig.public-types.json ./
COPY packages/harness/tsconfig.json packages/harness/tsconfig.json
COPY packages/harness/src packages/harness/src
COPY apps/showcase apps/showcase

RUN npm run build --workspace @agent-e2e/harness

CMD ["npm", "run", "dev", "--workspace", "@agent-e2e/showcase", "--", "--hostname", "0.0.0.0", "--port", "3100"]
