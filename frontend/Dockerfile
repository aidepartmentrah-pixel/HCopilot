# frontend/Dockerfile — HCopilot static frontend, served by nginx
#
# No build step: the frontend is plain HTML/CSS/JS, nothing to compile.
# Must be built with the frontend/ directory as build context.

FROM nginx:1.27-alpine

COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1, not localhost: inside the container, "localhost" resolves to
# ::1 (IPv6) first, and nginx's plain "listen 80;" only binds IPv4 — wget
# would get "Connection refused" and the container would show (unhealthy)
# even though it's actually serving requests fine (confirmed during Stage 3
# testing: external curl through the mapped port succeeded throughout).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
