import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in .env")

# Supabase requires SSL; local Postgres does not — we detect context via URL
_use_ssl = "supabase" in DATABASE_URL or os.getenv("DB_SSL", "false").lower() == "true"
_is_sqlite = DATABASE_URL.startswith("sqlite")

connect_args = {"sslmode": "require"} if _use_ssl else {}
if _is_sqlite:
    connect_args = {"check_same_thread": False}

from sqlalchemy.pool import NullPool

# Detect if we are using the transaction pooler (port 6543)
_is_transaction_pooler = ":6543" in DATABASE_URL

engine_kwargs = {
    "connect_args": connect_args,
}

if _is_sqlite or _is_transaction_pooler:
    # Transaction mode and SQLite work best with NullPool to avoid pooling issues
    engine_kwargs["poolclass"] = NullPool
elif not _is_sqlite:
    # Standard Postgres mode (Session or direct) - use SQLAlchemy's pool
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": 5,
        "max_overflow": 10,
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency: yields a DB session and ensures it is closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()