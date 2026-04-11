from datetime import datetime

from extensions import db


class Match(db.Model):
    __tablename__ = "matches"

    id = db.Column(db.Integer, primary_key=True)
    played_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    team_a_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False)
    team_b_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False)

    score_team_a = db.Column(db.Integer, nullable=False)
    score_team_b = db.Column(db.Integer, nullable=False)
    point_diff = db.Column(db.Integer, nullable=False)
    winner_team = db.Column(db.String(1), nullable=False)

    team_a = db.relationship("Team", foreign_keys=[team_a_id])
    team_b = db.relationship("Team", foreign_keys=[team_b_id])

    rating_status_entries = db.relationship(
        "MatchRatingStatus",
        back_populates="match",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Match {self.id}: A={self.score_team_a}, B={self.score_team_b}>"