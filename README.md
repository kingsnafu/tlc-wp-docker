# TLC WordPress Docker CMS

Reusable template for spinning up a private WordPress editing environment for static site generation. WordPress runs in Docker as a sandboxed CMS — the public site is served as static HTML from Cloudflare.

## Architecture

```
[Docker: nginx + php-fpm + mariadb]  ←  private CMS (editing only)
         ↓ Simply Static crawl
[Static HTML + JSON]  →  Cloudflare Pages/R2  ←  public site
```

## New Site Setup

### 1. Clone this repo

```bash
git clone git@github.com:kingsnafu/tlc-wp-docker.git clientname-cms
cd clientname-cms
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:
- `SITE_SLUG` — short identifier for the site (used in container names)
- `SITE_URL` — local URL (e.g. `http://localhost` or `http://localhost:8080`)
- `PHP_VERSION` / `MARIADB_VERSION` — match the source hosting environment
- `HTTP_PORT` / `HTTPS_PORT` / `DB_PORT` — change if running multiple sites simultaneously
- Database credentials

### 3. Add WordPress files

Extract the site backup into `./wordpress/`:

```
wordpress/
  wp-admin/
  wp-content/
  wp-includes/
  wp-config.php
  ...
```

### 4. Add database dump

Put the `.sql` file in `./dumps/`. MariaDB will auto-import it on first run.

### 5. Run setup

```bash
chmod +x scripts/*.sh
./scripts/setup.sh
```

### 6. Update wp-config.php

Update the database credentials in `wordpress/wp-config.php` to match your `.env`:

```php
define( 'DB_NAME', 'your_db_name' );
define( 'DB_USER', 'wpuser' );
define( 'DB_PASSWORD', 'your_password' );
define( 'DB_HOST', 'db' );  // always 'db' inside Docker
```

### 7. Update site URL in database

Via the import-db script or phpMyAdmin:

```sql
UPDATE wp_options 
SET option_value = 'http://localhost' 
WHERE option_name IN ('siteurl', 'home');
```

### 8. Visit the site

```
http://localhost (or whatever HTTP_PORT you set)
```

---

## Daily Use

```bash
./scripts/start.sh    # start containers
./scripts/stop.sh     # stop containers
```

## Database

```bash
./scripts/import-db.sh    # import SQL dump from dumps/
./scripts/export-db.sh    # export current DB to dumps/
```

## Uploads

Sync uploads to/from Linode Object Storage (requires rclone configured):

```bash
./scripts/sync-uploads.sh push    # local → object storage
./scripts/sync-uploads.sh pull    # object storage → local
```

Configure rclone with a `linode` remote pointing to your Linode Object Storage bucket.

---

## Running Multiple Sites Simultaneously

Change ports in `.env` to avoid conflicts:

| Site | HTTP_PORT | HTTPS_PORT | DB_PORT |
|------|-----------|------------|---------|
| Site 1 | 80 | 443 | 3306 |
| Site 2 | 8080 | 8443 | 3307 |
| Site 3 | 8081 | 8444 | 3308 |

---

## Directory Structure

```
tlc-wp-docker/
  docker-compose.yml      parameterized via .env
  .env.example            template — copy to .env
  .gitignore
  nginx/
    default.conf          nginx server config
  php/
    Dockerfile            php-fpm + WordPress extensions
    php.ini               PHP settings
  scripts/
    setup.sh              one-time setup
    start.sh              start containers
    stop.sh               stop containers
    import-db.sh          import SQL dump
    export-db.sh          export current DB
    sync-uploads.sh       rclone sync for uploads
  dumps/                  gitignored — SQL dumps go here
  wordpress/              gitignored — WP files go here
```

---

## Notes

- `wordpress/` and `dumps/` are gitignored — never committed
- `.env` is gitignored — never committed
- The WordPress instance is private — not exposed to public traffic
- Shut down containers when not in use to save resources
- Simply Static Pro is used for static export — install it in WP admin after setup
