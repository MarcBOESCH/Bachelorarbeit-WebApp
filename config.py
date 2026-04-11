import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")


class BaseConfig:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "sqlite:///" + os.path.join(INSTANCE_DIR, "jass.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    SECRET_KEY = os.environ.get("SECRET_KEY")
    USER_PIN = os.environ.get("USER_PIN")
    ADMIN_PIN = os.environ.get("ADMIN_PIN")


class DevelopmentConfig(BaseConfig):
    DEBUG = True

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