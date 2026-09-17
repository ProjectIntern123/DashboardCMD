#!/usr/bin/env bash

# =========================================================================
# HARTEK Group CMD Office Command Center - Server Provisioning Script
# Target OS: Ubuntu Linux 20.04 / 22.04 / 24.04 LTS (Hostinger KVM VPS)
# =========================================================================

set -e

echo "========================================================================="
echo "       HARTEK CMD COMMAND CENTER — UBUNTU VPS PROVISIONING SCRIPT"
echo "========================================================================="
echo ""

# 1. Verify Ubuntu OS
echo "[TASK 1/8] Verifying Ubuntu Linux Distribution..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "Operating System: $NAME $VERSION"
    if [[ "$ID" != "ubuntu" ]]; then
        echo "[WARNING] This script is tailored for Ubuntu Linux. Detected: $ID"
    fi
else
    echo "[UNVERIFIED] Cannot read /etc/os-release. Proceeding with standard apt toolchain."
fi
echo ""

# 2. Update System Packages
echo "[TASK 2/8] Updating System Repositories and Packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ufw unzip nano software-properties-common
echo "[SUCCESS] System packages updated."
echo ""

# 3. Install Node.js v20.x LTS & npm
echo "[TASK 3/8] Installing Node.js v20 LTS & npm..."
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "Node.js Version: $(node -v)"
echo "npm Version:     $(npm -v)"
echo ""

# 4. Install & Enable PostgreSQL Database
echo "[TASK 4/8] Installing PostgreSQL Database Engine..."
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
echo "[SUCCESS] PostgreSQL service is active and enabled at boot."
echo ""

# 5. Install PM2 Process Manager
echo "[TASK 5/8] Installing PM2 Process Manager Globally..."
sudo npm install -g pm2
echo "PM2 Version: $(pm2 -v)"
echo ""

# 6. Install Nginx & Certbot
echo "[TASK 6/8] Installing Nginx Web Server & Certbot SSL Engine..."
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl start nginx
sudo systemctl enable nginx
echo "[SUCCESS] Nginx web server active."
echo ""

# 7. Configure UFW Firewall
echo "[TASK 7/8] Configuring UFW Firewall Security Policies..."
sudo ufw allow 22/tcp comment 'SSH Access'
sudo ufw allow 80/tcp comment 'HTTP Web Traffic'
sudo ufw allow 443/tcp comment 'HTTPS Secure Traffic'
sudo ufw --force enable
sudo ufw status verbose
echo ""

# 8. Summary & Next Steps
echo "========================================================================="
echo "       VPS PROVISIONING COMPLETE! SYSTEM IS READY FOR APP SETUP"
echo "========================================================================="
echo "Next Steps:"
echo " 1. Configure PostgreSQL Database & User"
echo " 2. Clone Repository to /var/www/cmd-dashboard"
echo " 3. Copy and configure .env from .env.example"
echo " 4. Run './setup.sh' to compile builds & initialize database"
echo " 5. Configure Nginx and run Certbot SSL"
echo "========================================================================="
