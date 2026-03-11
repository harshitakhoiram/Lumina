from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.sql import text
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Text, primary_key=True)
    name = Column(Text, nullable=True)
    email = Column(Text, unique=True, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))
