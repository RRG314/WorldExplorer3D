FROM node:22.23.4-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /srv/racing
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node generated ./generated
COPY --chown=node:node authority.mjs firestore-store.mjs transport.mjs server.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
