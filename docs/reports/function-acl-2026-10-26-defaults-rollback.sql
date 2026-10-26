-- Only restores postgres FUNCTION defaults captured 2026-10-26.
-- Does NOT reopen existing functions. Never execute automatically during monitoring.
BEGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres,anon,authenticated,service_role;
COMMIT;
