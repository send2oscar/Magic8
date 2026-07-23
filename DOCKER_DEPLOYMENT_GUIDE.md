# Shirt Changer App - Docker 部署指南（Synology NAS）

本指南將幫助您在 Synology NAS 上使用 Docker 部署 Shirt Changer 應用程式。

## 前置要求

- Synology NAS（DSM 6.0 或更新版本）
- 管理員帳戶存取權限
- 至少 4GB 記憶體和 20GB 儲存空間
- 穩定的網路連接

## 第一步：在 Synology NAS 上安裝 Docker

1. 開啟 **DSM 套件中心**
2. 搜尋 **Docker**
3. 點擊 **安裝**
4. 等待安裝完成

## 第二步：準備部署檔案

### 2.1 克隆 GitHub 儲存庫

1. 開啟 **File Station**
2. 建立新資料夾：`/volume1/docker/shirt-changer`（或您偏好的位置）
3. 通過 SSH 連接到 NAS：
   ```bash
   ssh admin@<NAS_IP_ADDRESS>
   ```
4. 克隆儲存庫：
   ```bash
   cd /volume1/docker
   git clone https://github.com/send2oscar/Magic8.git shirt-changer
   cd shirt-changer
   ```

### 2.2 建立必要的配置檔案

在 `/volume1/docker/shirt-changer` 目錄中建立以下檔案：

#### `.env.production` - 環境變數配置

```env
# 資料庫配置
DATABASE_URL=mysql://root:your_secure_password@mysql:3306/shirt_changer

# JWT 和會話配置
JWT_SECRET=your_jwt_secret_key_here
ADMIN_SESSION_SECRET=your_admin_session_secret_here

# OAuth 配置
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im

# 應用配置
VITE_APP_TITLE=Shirt Changer
NODE_ENV=production
PORT=3000

# 其他必要的環境變數
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_admin_password
OWNER_NAME=Oscar
OWNER_OPEN_ID=your_owner_id
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key
VITE_FRONTEND_FORGE_API_KEY=your_frontend_api_key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
```

**重要：** 將所有 `your_*` 的值替換為您自己的安全值。

## 第三步：構建和運行 Docker 容器

### 3.1 構建應用程式映像

在 `/volume1/docker/shirt-changer` 目錄中執行：

```bash
docker build -t shirt-changer:latest .
```

### 3.2 運行 MySQL 容器

```bash
docker run -d \
  --name shirt-changer-mysql \
  -e MYSQL_ROOT_PASSWORD=your_secure_password \
  -e MYSQL_DATABASE=shirt_changer \
  -v /volume1/docker/mysql-data:/var/lib/mysql \
  -p 3306:3306 \
  mysql:8.0
```

### 3.3 運行應用程式容器

```bash
docker run -d \
  --name shirt-changer-app \
  --link shirt-changer-mysql:mysql \
  -e DATABASE_URL=mysql://root:your_secure_password@mysql:3306/shirt_changer \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -p 3000:3000 \
  -v /volume1/docker/uploads:/app/uploads \
  --env-file /volume1/docker/shirt-changer/.env.production \
  shirt-changer:latest
```

## 第四步：使用 Docker Compose（推薦方式）

### 4.1 建立 `docker-compose.yml`

在 `/volume1/docker/shirt-changer` 目錄中建立檔案：

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: shirt-changer-mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
    volumes:
      - mysql-data:/var/lib/mysql
    ports:
      - "3306:3306"
    networks:
      - shirt-changer-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: shirt-changer-app
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      DATABASE_URL: mysql://root:${MYSQL_ROOT_PASSWORD}@mysql:3306/${MYSQL_DATABASE}
      NODE_ENV: production
      PORT: 3000
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_SESSION_SECRET: ${ADMIN_SESSION_SECRET}
      VITE_APP_ID: ${VITE_APP_ID}
      OAUTH_SERVER_URL: ${OAUTH_SERVER_URL}
      VITE_OAUTH_PORTAL_URL: ${VITE_OAUTH_PORTAL_URL}
      VITE_APP_TITLE: ${VITE_APP_TITLE}
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      OWNER_NAME: ${OWNER_NAME}
      OWNER_OPEN_ID: ${OWNER_OPEN_ID}
      BUILT_IN_FORGE_API_URL: ${BUILT_IN_FORGE_API_URL}
      BUILT_IN_FORGE_API_KEY: ${BUILT_IN_FORGE_API_KEY}
      VITE_FRONTEND_FORGE_API_KEY: ${VITE_FRONTEND_FORGE_API_KEY}
      VITE_FRONTEND_FORGE_API_URL: ${VITE_FRONTEND_FORGE_API_URL}
    ports:
      - "3000:3000"
    volumes:
      - ./uploads:/app/uploads
    networks:
      - shirt-changer-network
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    container_name: shirt-changer-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    networks:
      - shirt-changer-network
    restart: unless-stopped

volumes:
  mysql-data:

networks:
  shirt-changer-network:
    driver: bridge
```

### 4.2 建立 `.env` 檔案

在 `/volume1/docker/shirt-changer` 目錄中建立 `.env`：

```env
# MySQL 配置
MYSQL_ROOT_PASSWORD=your_secure_mysql_password
MYSQL_DATABASE=shirt_changer

# JWT 和會話
JWT_SECRET=your_jwt_secret_key_here
ADMIN_SESSION_SECRET=your_admin_session_secret_here

# OAuth
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://oauth.manus.im

# 應用配置
VITE_APP_TITLE=Shirt Changer
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_admin_password
OWNER_NAME=Oscar
OWNER_OPEN_ID=your_owner_id

# API 配置
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key
VITE_FRONTEND_FORGE_API_KEY=your_frontend_api_key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im
```

### 4.3 啟動所有容器

```bash
cd /volume1/docker/shirt-changer
docker-compose up -d
```

### 4.4 檢查容器狀態

```bash
docker-compose ps
```

## 第五步：配置 Nginx 反向代理

### 5.1 建立 `nginx.conf`

在 `/volume1/docker/shirt-changer` 目錄中建立：

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    upstream app {
        server app:3000;
    }

    server {
        listen 80;
        server_name _;

        location / {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

## 第六步：初始化資料庫

### 6.1 進入 MySQL 容器

```bash
docker exec -it shirt-changer-mysql mysql -u root -p
```

### 6.2 建立必要的表

在 MySQL 中執行應用程式的資料庫遷移指令。

## 第七步：訪問應用程式

1. 開啟瀏覽器
2. 訪問 `http://<NAS_IP_ADDRESS>:3000`（如果使用 Nginx，則為 `http://<NAS_IP_ADDRESS>:80`）
3. 使用您在 `.env` 中設定的管理員帳戶登入

## 常用 Docker 命令

```bash
# 查看容器日誌
docker-compose logs -f app

# 重新啟動應用
docker-compose restart app

# 停止所有容器
docker-compose down

# 刪除所有容器和卷
docker-compose down -v

# 進入應用容器
docker exec -it shirt-changer-app bash

# 更新應用（重新構建並重新啟動）
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## 故障排除

### 容器無法啟動
- 檢查日誌：`docker-compose logs app`
- 確認環境變數正確設定
- 確認埠 3000 未被佔用

### 資料庫連接失敗
- 確認 MySQL 容器正在運行：`docker-compose ps`
- 檢查 `DATABASE_URL` 環境變數
- 確認 MySQL 密碼正確

### 無法訪問應用
- 確認 NAS 防火牆允許埠 3000 或 80
- 檢查 Nginx 配置
- 確認應用容器正在運行

## 備份和還原

### 備份資料庫
```bash
docker exec shirt-changer-mysql mysqldump -u root -p shirt_changer > backup.sql
```

### 還原資料庫
```bash
docker exec -i shirt-changer-mysql mysql -u root -p shirt_changer < backup.sql
```

## 下一步

1. 配置 SSL/TLS 加密（HTTPS）
2. 設定定期備份
3. 監控容器效能
4. 配置日誌管理

有任何問題，請隨時提問！
