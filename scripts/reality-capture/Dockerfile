FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive QT_QPA_PLATFORM=offscreen
RUN apt-get update && apt-get upgrade -y --no-install-recommends && apt-get install -y --no-install-recommends curl ca-certificates xz-utils blender blender-data python3-numpy libgomp1 libglib2.0-0 libgl1 libxrender1 libxi6 libxkbcommon0 libfontconfig1 libdbus-1-3 && rm -rf /var/lib/apt/lists/*
COPY scripts/reality-capture/install-container-node.sh /tmp/we3d-install-node.sh
RUN sh /tmp/we3d-install-node.sh && rm /tmp/we3d-install-node.sh
# Reviewed release bytes, streamed and hashed in the security Cloud Build.
RUN curl -fL --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 2 https://github.com/alicevision/Meshroom/releases/download/v2023.3.0/Meshroom-2023.3.0-linux.tar.gz -o /tmp/meshroom.tgz \
 && printf '%s  %s\n' 92b81246356df3fd37ea08e1d09519392897aaa730843eb9fd4bd0582916d391 /tmp/meshroom.tgz | sha256sum --check --status \
 && mkdir /opt/meshroom && tar -xzf /tmp/meshroom.tgz --strip-components=1 -C /opt/meshroom && rm /tmp/meshroom.tgz
ENV MESHROOM_BATCH_BIN=/opt/meshroom/meshroom_batch WE3D_RECONSTRUCTION_PROVIDER=meshroom BLENDER_BIN=/usr/bin/blender WE3D_RECONSTRUCTION_REVISION=meshroom-2023.3.0-blender-ubuntu22
WORKDIR /worker
COPY scripts/reality-capture/ /worker/
COPY functions/reality-capture-glb.js /worker/glb-inspection.cjs
COPY functions/reality-capture-diagnostics.js /worker/registration-diagnostics.cjs
RUN useradd --uid 10001 --create-home capture
USER 10001
RUN node /worker/blender-export-selftest.cjs
ENTRYPOINT ["node", "/worker/broker-worker.cjs"]
