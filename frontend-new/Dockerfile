# frontend-new/Dockerfile — HCopilot new React frontend, multi-stage build
#
# Stage 1 compiles the Vite/React/TS app; stage 2 serves the static output
# with nginx, same base image as frontend/Dockerfile for consistency.
# Must be built with the frontend-new/ directory as build context.

FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# See frontend/Dockerfile for why 127.0.0.1, not localhost.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
