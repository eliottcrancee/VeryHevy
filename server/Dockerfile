FROM node:22-alpine
WORKDIR /srv
COPY server.mjs package.json ./
RUN mkdir -p /data
ENV PORT=8443 DATA_DIR=/data
EXPOSE 8443
CMD ["node", "server.mjs"]
