FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY ml/requirements.txt ./ml/requirements.txt
RUN python3 -m venv /opt/ml && /opt/ml/bin/pip install --no-cache-dir -r ml/requirements.txt
ENV PYTHON=/opt/ml/bin/python
COPY server.js ./
COPY src ./src
COPY public ./public
COPY ml ./ml
COPY scripts ./scripts
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME /app/data
EXPOSE 3000
CMD ["node","server.js"]
