from datetime import datetime
from sqlalchemy.ext.hybrid import hybrid_property

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
    four_twenty_mode = db.Column(db.Boolean, default=False, nullable=False)

    team_a = db.relationship("Team", foreign_keys=[team_a_id])
    team_b = db.relationship("Team", foreign_keys=[team_b_id])

    rating_status_entries = db.relationship(
        "MatchRatingStatus",
        back_populates="match",
        cascade="all, delete-orphan",
    )

    @hybrid_property
    def rating_eligible(self):
        """Only actual 420-point victories in 420 mode are unrated."""
        winner_score = self.score_team_a if self.winner_team == "A" else self.score_team_b
        return not (self.four_twenty_mode and winner_score == 420)

    @rating_eligible.expression
    def rating_eligible(cls):
        is_420_victory = (
            ((cls.winner_team == "A") & (cls.score_team_a == 420))
            | ((cls.winner_team == "B") & (cls.score_team_b == 420))
        )
        return ~(cls.four_twenty_mode.is_(True) & is_420_victory)

    def __repr__(self):
        return f"<Match {self.id}: A={self.score_team_a}, B={self.score_team_b}>"
