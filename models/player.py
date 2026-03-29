from sqlalchemy import func

from extensions import db


class Player(db.Model):
    __tablename__ = "players"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=func.now(), nullable=False)

    match_entries = db.relationship(
        "MatchPlayer",
        back_populates="player",
        cascade="all, delete-orphan"
    )

    ratings = db.relationship(
        "PlayerRating",
        back_populates="player",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Player {self.id}: {self.name}>"