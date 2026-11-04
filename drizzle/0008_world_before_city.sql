ALTER TABLE worlds ADD COLUMN city_started INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE world_before_city (
  owner TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER archive_world_before_city AFTER UPDATE OF city_started ON worlds
WHEN OLD.city_started = 0 AND NEW.city_started = 1
BEGIN
  INSERT INTO world_before_city(owner, state, version) VALUES (OLD.owner, OLD.state, OLD.version);
END;
