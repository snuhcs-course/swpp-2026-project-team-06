from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# 모든 모듈의 models를 불러와 Base.metadata에 테이블을 모은다(autogenerate용).
from app.accounts import models as _accounts_models  # noqa: F401
from app.ai import models as _ai_models  # noqa: F401
from app.analytics import models as _analytics_models  # noqa: F401
from app.catalog import models as _catalog_models  # noqa: F401
from app.core.config import get_settings
from app.core.db import Base
from app.farms import models as _farms_models  # noqa: F401
from app.messaging import models as _messaging_models  # noqa: F401
from app.orders import models as _orders_models  # noqa: F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# DB URL은 alembic.ini가 아니라 core/config(환경 변수 DATABASE_URL)에서 읽는다.
config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
