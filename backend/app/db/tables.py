from sqlalchemy import BigInteger, CheckConstraint, Column, DateTime, ForeignKey, Index, Table, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base

metadata = Base.metadata


def timestamp(name):
    return Column(name, DateTime(timezone=True), nullable=False, server_default=func.now())


users = Table("users", metadata,
    Column("id", Uuid, primary_key=True),
    Column("email", Text, nullable=False, unique=True),
    Column("password_hash", Text, nullable=False),
    timestamp("created_at"), timestamp("updated_at"),
)

sessions = Table("sessions", metadata,
    Column("id", Uuid, primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), index=True),
    Column("token_hash", Text, nullable=False, unique=True),
    Column("csrf_token_hash", Text, nullable=False),
    timestamp("created_at"), timestamp("last_seen_at"),
    Column("expires_at", DateTime(timezone=True), nullable=False, index=True),
)

notebooks = Table("notebooks", metadata,
    Column("id", Uuid, primary_key=True),
    Column("owner_id", ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("title", Text, nullable=False), Column("description", Text, nullable=False),
    Column("document", JSONB, nullable=False),
    Column("revision", BigInteger, nullable=False, server_default="1"),
    timestamp("created_at"), timestamp("updated_at"),
    CheckConstraint("revision BETWEEN 1 AND 9007199254740991", name="revision_range"),
    CheckConstraint("jsonb_typeof(document) = 'object' AND (document #>> '{metadata,title}') IS NOT DISTINCT FROM title AND (document #>> '{metadata,description}') IS NOT DISTINCT FROM description", name="metadata_projection"),
)
Index("ix_notebooks_owner_updated_id", notebooks.c.owner_id, notebooks.c.updated_at.desc(), notebooks.c.id.desc())
