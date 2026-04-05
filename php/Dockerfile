ARG PHP_VERSION=8.3
FROM php:${PHP_VERSION}-fpm

RUN apt-get update && apt-get install -y \
    libfreetype6-dev \
    libjpeg62-turbo-dev \
    libpng-dev \
    libwebp-dev \
    libzip-dev \
    libicu-dev \
    libonig-dev \
    libmagickwand-dev \
    unzip \
    curl \
  && docker-php-ext-configure gd \
    --with-freetype \
    --with-jpeg \
    --with-webp \
  && docker-php-ext-install -j$(nproc) \
    gd \
    mysqli \
    pdo_mysql \
    zip \
    intl \
    exif \
    opcache \
    mbstring \
  && pecl install imagick \
  && docker-php-ext-enable imagick \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY php.ini /usr/local/etc/php/conf.d/custom.ini
