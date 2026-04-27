FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl bash git sudo ca-certificates libseccomp2 fuse3 python3 python3-pip jq \
    netcat-openbsd nmap \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/canyonroad/agentsh/releases/download/v0.18.3/agentsh_0.18.3_linux_amd64.deb \
    -o /tmp/agentsh.deb && dpkg -i /tmp/agentsh.deb && rm /tmp/agentsh.deb

RUN mkdir -p /etc/agentsh/policies /var/lib/agentsh/sessions /workspace

COPY config.yaml /etc/agentsh/config.yaml
COPY default.yaml /etc/agentsh/policies/default.yaml

COPY package.json package-lock.json /app/
RUN cd /app && npm ci --production
COPY src/ /app/src/

COPY startup.sh /usr/local/bin/startup.sh
RUN chmod +x /usr/local/bin/startup.sh

ENV AGENTSH_SERVER=http://127.0.0.1:18080
ENV PORT=10000

WORKDIR /workspace
EXPOSE 10000

CMD ["/usr/local/bin/startup.sh"]
