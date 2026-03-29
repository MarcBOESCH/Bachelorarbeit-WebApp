from sqlalchemy import func

from extensions import db


class PlayerRating(db.Model):
    __tablename__ = "player_ratings"

    id = db.Column(db.Integer, primary_key=True)

    player_id = db.Column(db.Integer, db.ForeignKey("players.id"), nullable=False)
    system_name = db.Column(db.String(20), nullable=False)  # elo, glicko2, trueskill

    rating = db.Column(db.Float, nullable=True)
    rating_deviation = db.Column(db.Float, nullable=True)
    volatility = db.Column(db.Float, nullable=True)

    mu = db.Column(db.Float, nullable=True)
    sigma = db.Column(db.Float, nullable=True)

    matches_played = db.Column(db.Integer, default=0, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    player = db.relationship("Player", back_populates="ratings")

    __table_args__ = (
        db.UniqueConstraint("player_id", "system_name", name="uq_player_rating_system"),
    )

    def __repr__(self):
        return f"<PlayerRating player={self.player_id}, system={self.system_name}>"