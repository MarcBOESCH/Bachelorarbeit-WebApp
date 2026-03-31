from datetime import datetime

from extensions import db


class Match(db.Model):
    __tablename__ = "matches"

    id = db.Column(db.Integer, primary_key=True)
    played_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    score_team_a = db.Column(db.Integer, nullable=False)
    score_team_b = db.Column(db.Integer, nullable=False)
    point_diff = db.Column(db.Integer, nullable=False)
    winner_team = db.Column(db.String(1), nullable=False)

    rating_processed = db.Column(db.Boolean, default=False, nullable=False)

    rating_status_entries = db.relationship(
        "MatchRatingStatus",
        back_populates="match",
        cascade="all, delete-orphan"
    )

    players = db.relationship(
        "MatchPlayer",
        back_populates="match",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return (
            f"<Match {self.id}: "
            f"A={self.score_team_a}, B={self.score_team_b}, winner={self.winner_team}>"
        )


class MatchPlayer(db.Model):
    __tablename__ = "match_players"

    id = db.Column(db.Integer, primary_key=True)

    match_id = db.Column(db.Integer, db.ForeignKey("matches.id"), nullable=False)
    player_id = db.Column(db.Integer, db.ForeignKey("players.id"), nullable=False)

    team = db.Column(db.String(1), nullable=False)
    team_slot = db.Column(db.Integer, nullable=False)

    match = db.relationship("Match", back_populates="players")
    player = db.relationship("Player", back_populates="match_entries")

    __table_args__ = (
        db.UniqueConstraint("match_id", "player_id", name="uq_match_player"),
        db.UniqueConstraint("match_id", "team", "team_slot", name="uq_match_team_slot"),
    )

    def __repr__(self):
        return (
            f"<MatchPlayer match={self.match_id}, player={self.player_id}, "
            f"team={self.team}, slot={self.team_slot}>"
        )