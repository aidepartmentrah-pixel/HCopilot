# Throwaway image: genuine Firefox 97.0 (Feb 2022) driven by geckodriver, to test HCopilot compatibility.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl bzip2 python3 python3-pip \
      libgtk-3-0 libdbus-glib-1-2 libasound2 libx11-xcb1 libxtst6 libxt6 libxcomposite1 libxdamage1 \
      libxrandr2 libxfixes3 libxcursor1 libxi6 libpci3 libegl1 fonts-dejavu-core fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://archive.mozilla.org/pub/firefox/releases/97.0/linux-x86_64/en-US/firefox-97.0.tar.bz2 \
      | tar -xj -C /opt \
 && ln -s /opt/firefox/firefox /usr/local/bin/firefox

RUN curl -fsSL https://github.com/mozilla/geckodriver/releases/download/v0.30.0/geckodriver-v0.30.0-linux64.tar.gz \
      | tar -xz -C /usr/local/bin

RUN pip3 install --break-system-packages --no-cache-dir selenium==4.8.3

ENV MOZ_HEADLESS=1 HOME=/tmp
WORKDIR /work
