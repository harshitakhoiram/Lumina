from sqlalchemy import Column, ForeignKey, Text, TIMESTAMP, text
from sqlalchemy.dialects.postgresql import ARRAY

from app.core.database import Base


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id = Column(Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    interest = Column(Text)
    language = Column(Text)
    genre = Column(ARRAY(Text))
    selected_titles = Column(ARRAY(Text))
    selected_actors = Column(ARRAY(Text))
    updated_at = Column(TIMESTAMP(timezone=True), server_default=text("NOW()"))