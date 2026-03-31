

from extensions import db


class MatchRatingStatus(db.Model):
    __tablename__ = "match_rating_status"

    id = db.Column(db.Integer, primary_key=True)

    match_id = db.Column(db.Integer, db.ForeignKey("matches.id"), nullable=False)
    system_name = db.Column(db.String(20), nullable=False)
    processed = db.Column(db.Boolean, default=False, nullable=False)
    processed_at = db.Column(db.DateTime, nullable=True)

    match = db.relationship("Match", back_populates="rating_status_entries")

    __table_args__ = (
        db.UniqueConstraint("match_id", "system_name", name="uq_match_rating_status"),
    )

    def __repr__(self):
        return (
            f"<MatchRatingStatus match={self.match_id}, "
            f"system={self.system_name}, processed={self.processed}>"
        )