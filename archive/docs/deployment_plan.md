# Comprehensive Deployment Strategy & Implementation Plan

This document outlines the deployment strategy for the HARTEK Group CMD Office Command Center, covering both the Windows 11 testing environment and the production deployment on a Linux VPS.

---

## Architecture Overview

The application consists of:
1. **Frontend**: Next.js App Router (running on port `3000` in dev).
2. **Backend**: NestJS REST API (running on port `4000`, prefixed with `/api`).
3. **Database**: PostgreSQL (relational database managed via Prisma ORM).

---

## Phase 1: Windows 11 Testing Environment

This phase outlines how to configure a clean, reproducible testing environment on a Windows 11 local machine or VM.

### 1. Prerequisites
- **Node.js**: Install Node.js LTS (v20.x or newer).
- **PostgreSQL**: Install PostgreSQL (v15 or newer) via the official installer or run it inside Docker.
- **Git**: Ensure Git is installed for cloning and updates.

### 2. Database Provisioning (Local PostgreSQL)
1. Open PGAdmin or run `psql` in a command prompt.
2. Create the database user and database:
   ```sql
   CREATE USER postgres WITH PASSWORD 'root123';
   CREATE DATABASE cmd_office OWNER postgres;
   ```

### 3. Application Configuration & Installation
1. Clone the project files to a local directory (e.g. `C:\apps\cmd-dashboard`).
2. Run the bootstrap script in the root directory to install all dependencies for the root, backend, and frontend packages:
   ```cmd
   npm run bootstrap
   ```
3. Create the root `.env` file from the environment template and ensure the database connection string and JWT secrets are set:
   ```env
   DATABASE_URL="postgresql://postgres:root123@localhost:5432/cmd_office?schema=public"
   JWT_SECRET="hartek_cmd_super_secure_access_token_secret_key_2026"
   JWT_REFRESH_SECRET="hartek_cmd_super_secure_refresh_token_secret_key_2026"
   JWT_ACCESS_EXPIRATION="15m"
   JWT_REFRESH_EXPIRATION="7d"
   SECURE_COOKIES="false" # Set to false since local testing is HTTP-only
   PORT=4000
   NEXT_PUBLIC_API_URL="http://localhost:4000/api"
   ```
4. Synchronize the environment variables across the backend and frontend folders:
   ```cmd
   npm run sync-env
   ```

### 4. Database Schema Setup & Seed
1. Generate the Prisma client and push the schema to the database:
   ```cmd
   cd backend
   npx prisma db push
   ```
2. Seed the database with master lookup tables and the initial administrator account:
   ```cmd
   npx prisma db seed
   ```

### 5. Running the Application for Verification
- **Development / Watch Mode**:
  Run `npm run dev` in the root directory. This will boot NestJS (with hot reload) and Next.js concurrently.
- **Production Testing Build**:
  1. Build both projects:
     ```cmd
     npm run build
     ```
  2. Start the production processes:
     ```cmd
     npm run start
     ```
  3. Verify that the app is accessible at `http://localhost:3000` and the API endpoints are reachable on `http://localhost:4000/api`.

---

## Phase 2: Production Deployment on a Linux VPS

This phase details a production-grade deployment on a Linux Virtual Private Server (VPS) running Ubuntu 22.04/24.04 LTS.

### 1. VPS Provisioning & Security
1. **Update System Packages**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
2. **Setup Firewall (UFW)**:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow ssh
   sudo ufw allow http
   sudo ufw allow https
   sudo ufw enable
   ```
3. **Install Core Dependencies** (Node.js & PM2):
   ```bash
   # Install NVM
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   source ~/.bashrc
   nvm install 20
   nvm use 20

   # Install PM2 globally
   npm install pm2 -g
   ```

### 2. Production PostgreSQL Server Setup
1. **Install PostgreSQL**:
   ```bash
   sudo apt install postgresql postgresql-contrib -y
   ```
2. **Configure Database**:
   ```bash
   sudo -i -u postgres psql
   ```
   Run the SQL commands to create the database:
   ```sql
   CREATE DATABASE cmd_office_prod;
   CREATE USER cmd_admin WITH PASSWORD 'StrongProdPassword123!';
   GRANT ALL PRIVILEGES ON DATABASE cmd_office_prod TO cmd_admin;
   \q
   ```
3. **Secure PostgreSQL**:
   Ensure PostgreSQL is only listening on `localhost` (default) so that it is not exposed to the internet.

### 3. Application Deployment
1. Clone the repository to the VPS (e.g. `/var/www/cmd-dashboard`).
2. Run package bootstrap:
   ```bash
   npm run bootstrap
   ```
3. Configure the production `.env` file in the root directory:
   - Point `DATABASE_URL` to your production database:
     `DATABASE_URL="postgresql://cmd_admin:StrongProdPassword123!@localhost:5432/cmd_office_prod?schema=public"`
   - Generate strong JWT secrets (e.g., using `openssl rand -base64 32`).
   - Enable secure HTTP-Only cookies:
     `SECURE_COOKIES="true"`
   - **Note on NEXT_PUBLIC_API_URL:** You do NOT need to hardcode this environment variable anymore! The application has been upgraded with a dynamic client-side resolver. It will automatically detect the server IP/domain at runtime in the browser and fetch relative to it, meaning a single build works for `localhost`, private network IP, or public DNS without rebuilding.
4. Sync environment configurations:
   ```bash
   npm run sync-env
   ```
5. Apply database schema and seed:
   ```bash
   cd backend
   npx prisma migrate deploy
   npx prisma db seed
   cd ..
   ```
6. Build both frontend and backend for production:
   ```bash
   npm run build
   ```

### 4. Process Management (PM2)
To keep the application running continuously, configure PM2 processes using the pre-configured ecosystem file in the root.
1. Inspect the `ecosystem.config.js` file in the root folder.
2. Start the application under PM2:
   ```bash
   pm2 start ecosystem.config.js
   ```
3. Setup PM2 to automatically start on server reboot:
   ```bash
   pm2 startup
   pm2 save
   ```

### 5. Nginx Reverse Proxy & SSL/TLS Configuration
Nginx acts as a reverse proxy, directing external traffic to Next.js on port `3000` and API requests on `/api` to NestJS on port `4000`.

1. **Install Nginx**:
   ```bash
   sudo apt install nginx -y
   ```
2. **Create Configuration**:
   A template file `nginx.conf` has been provided in the project root. Copy this configuration to Nginx's site-available directory:
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/cmd.hartek.com
   ```
   *Note: Open `/etc/nginx/sites-available/cmd.hartek.com` and replace `server_name localhost;` with your actual domain name (e.g. `cmd.hartek.com`) or VPS IP address.*
3. **Enable Site & Restart Nginx**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/cmd.hartek.com /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```
4. **Provision SSL/TLS Certificate** via Let's Encrypt Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d cmd.hartek.com
   ```
   Choose the option to automatically redirect HTTP traffic to HTTPS. Certbot will configure SSL keys and set up a systemd timer to renew certificates automatically.


---

## Alternative/Preferred Full-Stack Architecture Strategy

If we choose to proceed with the **Restructured Application** layout (where NestJS serves Next.js static files directly on port `4000`), the VPS setup becomes even simpler:
- You do NOT need PM2 to run Next.js (port `3000`) or Nginx proxy routing to port `3000`.
- PM2 only runs the backend process (`cmd-backend` on port `4000`).
- Nginx configuration simply forwards all traffic directly to port `4000`:
  ```nginx
  location / {
      proxy_pass http://127.0.0.1:4000;
      ...
  }
  ```
This decreases resource utilization, simplifies management, and avoids cross-port cookie routing.
