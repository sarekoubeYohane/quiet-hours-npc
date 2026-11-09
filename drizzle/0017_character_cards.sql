CREATE TABLE character_card_assessments (
 owner TEXT NOT NULL,
 draft_id TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 body TEXT NOT NULL,
 PRIMARY KEY (owner, draft_id, operation_id)
);
CREATE TABLE character_cards (
 owner TEXT NOT NULL,
 id TEXT NOT NULL,
 version INTEGER NOT NULL,
 body TEXT NOT NULL,
 PRIMARY KEY (owner, id)
);
