# =============================================================================
# HELM — Nginx Reverse Proxy
# Simple: just nginx:alpine with our config
# =============================================================================
FROM nginx:1.27-alpine

# Remove the default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom config
COPY nginx.conf /etc/nginx/nginx.conf

# Note: We skip `nginx -t` at build time because the upstream hosts
# (helm-ui, helm-server) are Docker Compose service names that only
# resolve at runtime via Docker's internal DNS. nginx -t would fail
# with "host not found in upstream" during the build.

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
