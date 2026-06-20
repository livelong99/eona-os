# Agent OS dashboard — Vite SPA built to static assets, served by nginx.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner
# As a template: the nginx entrypoint runs envsubst over /etc/nginx/templates/*.template
# at start (injecting ${HERMES_URL} + ${API_SERVER_KEY}) → /etc/nginx/conf.d/default.conf.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 3737
CMD ["nginx", "-g", "daemon off;"]
