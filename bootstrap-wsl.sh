cat << 'EOF' > ~/bootstrap-wsl.sh
#!/usr/bin/env bash
set -e

echo "========================================="
echo " WSL Ubuntu 24.04 Dev Bootstrap (FIXED)  "
echo "========================================="

# -------- BASE SYSTEM --------
sudo apt update && sudo apt upgrade -y

sudo apt install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  software-properties-common \
  build-essential \
  git \
  unzip \
  zip \
  pkg-config \
  openssh-client \
  jq \
  tree \
  htop \
  ripgrep \
  fd-find \
  neovim \
  python3 \
  python3-pip \
  python3-venv \
  openjdk-21-jdk

echo "alias fd=fdfind" >> ~/.bashrc

# -------- FNM (NODE MANAGER) --------
echo "[Node] Installing fnm..."
curl -fsSL https://fnm.vercel.app/install | bash

# Persist fnm for ALL future shells
if ! grep -q "fnm env" ~/.bashrc; then
  echo 'export PATH="$HOME/.fnm:$PATH"' >> ~/.bashrc
  echo 'eval "$(fnm env --use-on-cd)"' >> ~/.bashrc
fi

# Load fnm NOW for this script
export PATH="$HOME/.fnm:$PATH"
eval "$(fnm env)"

# -------- NODE INSTALL --------
echo "[Node] Installing Node 18..."
fnm install 18

echo "[Node] Installing latest LTS..."
fnm install --lts

echo "[Node] Setting LTS as default..."
fnm default lts
fnm use lts

# Verify
node -v
npm -v

# -------- PACKAGE MANAGERS --------
corepack enable
corepack prepare pnpm@latest --activate
npm install -g yarn

# -------- DISK SAFETY --------
sudo mkdir -p /etc/systemd/journald.conf.d

sudo tee /etc/systemd/journald.conf.d/limit.conf >/dev/null <<EOL
[Journal]
SystemMaxUse=100M
RuntimeMaxUse=50M
EOL

sudo tee /etc/apt/apt.conf.d/02nocache >/dev/null <<EOL
APT::Keep-Downloaded-Packages "false";
EOL

sudo systemctl restart systemd-journald || true

sudo apt autoremove -y
sudo apt clean

echo "========================================="
echo " Bootstrap Complete ✅"
echo " Node LTS is active & default"
echo "========================================="
EOF

chmod +x ~/bootstrap-wsl.sh
bash ~/bootstrap-wsl.sh
