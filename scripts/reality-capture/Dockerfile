FROM node:22-bookworm-slim AS node
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive QT_QPA_PLATFORM=offscreen
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates blender libgomp1 libglib2.0-0 libgl1 libxrender1 libxi6 libxkbcommon0 libfontconfig1 libdbus-1-3 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN curl -fL --retry 2 https://github.com/alicevision/Meshroom/releases/download/v2023.3.0/Meshroom-2023.3.0-linux.tar.gz -o /tmp/meshroom.tgz && mkdir /opt/meshroom && tar -xzf /tmp/meshroom.tgz --strip-components=1 -C /opt/meshroom && rm /tmp/meshroom.tgz
ENV MESHROOM_BATCH_BIN=/opt/meshroom/meshroom_batch WE3D_RECONSTRUCTION_PROVIDER=meshroom BLENDER_BIN=/usr/bin/blender WE3D_RECONSTRUCTION_REVISION=meshroom-2023.3.0-blender-ubuntu22
WORKDIR /worker
COPY scripts/reality-capture/ /worker/
COPY functions/reality-capture-glb.js /worker/glb-inspection.cjs
RUN useradd --uid 10001 --create-home capture
USER 10001
ENTRYPOINT ["node", "/worker/broker-worker.cjs"]
