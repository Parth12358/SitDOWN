CREATE TABLE IF NOT EXISTS events (
  entity TEXT NOT NULL,
  name   TEXT NOT NULL,
  value  TEXT,
  ts     TEXT NOT NULL
);
INSERT INTO events (entity, name, value, ts) VALUES ('d4fcb0aa-b341-5a81-bf77-91a23dbec92d', 'FeatureTouched', 'payments', '2026-10-11T18:02:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('d4fcb0aa-b341-5a81-bf77-91a23dbec92d', 'HumanIntervened', NULL, '2026-10-11T18:09:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('d4fcb0aa-b341-5a81-bf77-91a23dbec92d', 'AgentSession', 'claude_code', '2026-10-11T18:40:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('d4fcb0aa-b341-5a81-bf77-91a23dbec92d', 'DecisionRecorded', 'refund-idempotency', '2026-10-11T18:40:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('d4fcb0aa-b341-5a81-bf77-91a23dbec92d', 'FeatureTouched', 'payments', '2026-10-11T18:45:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('d4fcb0aa-b341-5a81-bf77-91a23dbec92d', 'CommitMade', '39', '2026-10-11T18:45:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('d4fcb0aa-b341-5a81-bf77-91a23dbec92d', 'AuthorType', 'agent_edited', '2026-10-11T18:45:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('82a3f137-3a00-5621-b175-e38aca401708', 'FeatureTouched', 'auth', '2026-10-11T16:48:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('82a3f137-3a00-5621-b175-e38aca401708', 'AgentSession', 'claude_code', '2026-10-11T16:48:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('82a3f137-3a00-5621-b175-e38aca401708', 'DecisionRecorded', 'jwt-refresh-rotation', '2026-10-11T16:48:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('82a3f137-3a00-5621-b175-e38aca401708', 'FeatureTouched', 'auth', '2026-10-11T17:16:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('82a3f137-3a00-5621-b175-e38aca401708', 'AgentSession', 'codex', '2026-10-11T17:16:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('82a3f137-3a00-5621-b175-e38aca401708', 'FeatureTouched', 'auth', '2026-10-11T17:20:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('82a3f137-3a00-5621-b175-e38aca401708', 'CommitMade', '57', '2026-10-11T17:20:00Z');
INSERT INTO events (entity, name, value, ts) VALUES ('82a3f137-3a00-5621-b175-e38aca401708', 'AuthorType', 'agent', '2026-10-11T17:20:00Z');
