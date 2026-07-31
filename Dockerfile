# Hugging Face Space (Docker) for the Stratax AI frontend
# - Builds the Vite app
# - Serves it via nginx on port 7860 with SPA routing

FROM node:20-alpine AS build
WORKDIR /app

# Install deps first (better caching)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and build
COPY . .

# Build-time env for Vite (optional)
# For Hugging Face private Spaces, leaving this empty makes requests go to /api/... on the same origin.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build


FROM nginx:1.25-alpine AS runtime

# Nginx config for SPA routing + HF port
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 7860

CMD ["nginx", "-g", "daemon off;"]
