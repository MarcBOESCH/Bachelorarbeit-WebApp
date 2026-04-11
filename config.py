import os
from datetime import timedelta


class BaseConfig:
    SQLALCHEMY_DATABASE_URI = os.environ.get("NEON_DATABASE_URL") or os.environ.get("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_REFRESH_EACH_REQUEST = True
    PERMANENT_SESSION_LIFETIME = timedelta(hours=12)

    SECRET_KEY = os.environ.get("SECRET_KEY")
    USER_PIN = os.environ.get("USER_PIN")
    ADMIN_PIN = os.environ.get("ADMIN_PIN")


class DevelopmentConfig(BaseConfig):
    DEBUG = True

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "NEON_DATABASE_URL"
    ) or os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://localhost/jasstistics_dev"
    )

    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")
    USER_PIN = os.environ.get("USER_PIN", "1234")
    ADMIN_PIN = os.environ.get("ADMIN_PIN", "5678")

    TEMPLATES_AUTO_RELOAD = True
    SEND_FILE_MAX_AGE_DEFAULT = 0

    ENABLE_LIVERELOAD = True
    SESSION_COOKIE_SECURE = False


class ProductionConfig(BaseConfig):
    DEBUG = False

    TEMPLATES_AUTO_RELOAD = False
    SEND_FILE_MAX_AGE_DEFAULT = 3600

    ENABLE_LIVERELOAD = False
    SESSION_COOKIE_SECURE = True


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}