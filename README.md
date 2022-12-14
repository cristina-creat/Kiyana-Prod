# Backend server deploy

## Intall NGINX
(https://www.digitalocean.com/community/tutorials/how-to-install-nginx-on-ubuntu-20-04)
```
sudo apt update
sudo apt install nginx

sudo ufw app list
sudo ufw allow 'Nginx HTTP'
sudo ufw status

systemctl status nginx
```
Get IP
```
curl -4 icanhazip.com
```
Enable server blocks
```
sudo mkdir -p /var/www/conciliaciones.future.com.mx/public_html
```
Assign permissions
```
sudo chown -R $USER:$USER /var/www/conciliaciones.future.com.mx/public_html
sudo chmod -R 755 /var/www/conciliaciones.future.com.mx
```
Create empy public HTML
```
nano /var/www/conciliaciones.future.com.mx/public_html/index.html
```
Open vhost file
```
sudo nano /etc/nginx/sites-available/conciliaciones.future.com.mx
```
Enter this config
```
server {
        listen 80;
        listen [::]:80;

        root /var/www/conciliaciones.future.com.mx/public_html;
        index index.html index.htm index.nginx-debian.html;

        server_name conciliaciones.future.com.mx;

        location / {
                if (!-e $request_filename){
                         rewrite ^(.*)$ /index.html break;
                }
                try_files $uri $uri/ =404;
        }
}
```
Enable block
```
sudo ln -s /etc/nginx/sites-available/conciliaciones.future.com.mx /etc/nginx/sites-enabled/
sudo nano /etc/nginx/nginx.conf
```
Uncomment server_names_hash_bucket_size
Upgrade max body size (Add line)
```
client_max_body_size 100M;
```
Test Blocks
```
sudo nginx -t
```
Restart NGINX
```
sudo systemctl restart nginx
```

## NODE Installation
Testes over 14.+ Version
```
cd ~
curl -sL https://deb.nodesource.com/setup_14.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install nodejs
```
Get node version
```
node -v
npm -v
sudo apt install build-essential
```
## Install GIT
```
sudo apt install git
git --version
```
## Clone Repo
```
git clone https://gitlab.com/future-co/creatsol-concilia-back.git
```
Install dependencies
```
cd creatsol-concilia-back && git checkout master && npm install && cd ../
```

Manual copy Config folder into creatsol-concilia-back/config
Create downloads dir
```
mkdir creatsol-concilia-back/downloads
```

## Install MongoDb
Docs (https://www.digitalocean.com/community/tutorials/how-to-install-mongodb-on-ubuntu-20-04-es)
```
curl -fsSL https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -
apt-key list
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
sudo apt update
sudo apt install mongodb-org
sudo systemctl start mongod.service
sudo systemctl status mongod
sudo systemctl enable mongod
```
- Validate mongod
```
mongo --eval 'db.runCommand({ connectionStatus: 1 })'
```


## Export dev Database
In local machine
```
mongodump --db protec_concilia --out dumps/protec_concilia_dev_2022_01_24
```
Upload files to ~/dumps folder
```
mongorestore --db=protec_concilia  dumps/protec_concilia_dev_2022_01_24/protec_concilia
```


## Install PM2
Install Node as a service
```
sudo npm install pm2@latest -g
pm2 start process.json
pm2 startup systemd
```
Copy command output an exec
```
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
pm2 save
systemctl status pm2-ubuntu
```
List running proccesses
```
pm2 list
```
## Reverse proxy
Send request from nginx to node
```
sudo nano /etc/nginx/sites-available/conciliaciones.future.com.mx
```
Add block to config files
```
location /api/ {
    proxy_pass http://localhost:2121;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```
Test Nginx
```
sudo nginx -t
```
Restart NGINX
```
sudo systemctl restart nginx
```


## Install SSL certs
Using certbot (https://www.digitalocean.com/community/tutorials/how-to-secure-nginx-with-let-s-encrypt-on-ubuntu-20-04-es)
Install certbot
```
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d conciliaciones.future.com.mx
```
Validate renewal
```
sudo systemctl status certbot.timer
```


## Upload Website
Upload from local website (Angular Website ROOT path) to prod server
```
npm run deploy
```


## Enable Cron Tabs
Read full docs (https://www.digitalocean.com/community/tutorials/how-to-use-cron-to-automate-tasks-ubuntu-1804-es)
```
sudo apt update
sudo apt install cron
sudo systemctl enable cron
crontab -e
```
Insert next lines
```
* * * * * wget -q -O - https://conciliaciones.future.com.mx/api/v1/crons/proccess-queue >/dev/null 2>&1
* * * * * wget -q -O - https://conciliaciones.future.com.mx/api/v1/crons/conciliar >/dev/null 2>&1
```
List crontabs
```
crontab -l
```

## Set server timezone
Read full docs (https://linuxize.com/post/how-to-set-or-change-timezone-on-ubuntu-20-04/)
Print local time
```
ls -l /etc/localtime
```
List time zones
```
timedatectl list-timezones
```
Set timezone
```
sudo timedatectl set-timezone America/Mexico_City
```

## Install puppeteer
Manage RPA from puppeteer
```
sudo npm install -g puppeteer --unsafe-perm=true -allow-root && sudo apt install chromium-browser -y
sudo apt update && sudo apt install -y gconf-service libgbm-dev libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
```