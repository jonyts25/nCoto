


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."extend_paqueteria_visit_next_day"("visit_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r public.visits%ROWTYPE;
  new_day date;
BEGIN
  SELECT * INTO r FROM public.visits WHERE id = visit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;
  IF r.visit_type <> 'paqueteria' THEN
    RAISE EXCEPTION 'Solo aplica a visitas de paquetería';
  END IF;

  new_day := COALESCE(r.valid_day, (r.valid_until AT TIME ZONE 'utc')::date) + 1;

  UPDATE public.visits
  SET
    valid_day = new_day,
    valid_until = r.valid_until + interval '1 day',
    status = 'active',
    ingreso_confirmado_at = NULL,
    package_followup_sent_at = NULL,
    tenant_package_received = NULL
  WHERE id = visit_id;
END;
$$;


ALTER FUNCTION "public"."extend_paqueteria_visit_next_day"("visit_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."extend_paqueteria_visit_next_day"("visit_id" "uuid") IS 'Extiende vigencia al día siguiente cuando el inquilino indica que no recibió el paquete.';



CREATE OR REPLACE FUNCTION "public"."mark_visit_used"("visit_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  r public.visits%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.visits WHERE id = visit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;

  INSERT INTO public.visit_access_log (visit_id, actor, detail)
  VALUES (visit_id, 'guard', 'Registro de acceso / ingreso');

  IF r.visit_type = 'frecuente' THEN
    UPDATE public.visits
    SET last_access_at = now()
    WHERE id = visit_id;
  ELSIF r.visit_type = 'paqueteria' THEN
    UPDATE public.visits
    SET
      ingreso_confirmado_at = now(),
      status = 'used'
    WHERE id = visit_id;
  ELSE
    -- eventual, servicio u otros: un solo uso
    UPDATE public.visits
    SET status = 'used'
    WHERE id = visit_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."mark_visit_used"("visit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."paqueteria_followup_candidates"("p_tz" "text" DEFAULT 'America/Mexico_City'::"text") RETURNS TABLE("visit_id" "uuid", "resident_id" "uuid", "guest_name" "text", "valid_day" "date")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT v.id, v.resident_id, v.guest_name, v.valid_day
  FROM public.visits v
  WHERE v.visit_type = 'paqueteria'
    AND v.status = 'active'
    AND v.ingreso_confirmado_at IS NULL
    AND v.valid_day = (timezone(p_tz, now()))::date
    AND v.package_followup_sent_at IS NULL;
$$;


ALTER FUNCTION "public"."paqueteria_followup_candidates"("p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resident_id" "uuid",
    "provider" "text" NOT NULL,
    "expected_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "visit_id" "uuid",
    "message" "text" NOT NULL,
    "guard_id" "uuid"
);


ALTER TABLE "public"."logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_followup_prompts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "resident_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "outcome" "text",
    CONSTRAINT "package_followup_prompts_outcome_check" CHECK ((("outcome" IS NULL) OR ("outcome" = ANY (ARRAY['received'::"text", 'not_received'::"text", 'ignored'::"text"]))))
);


ALTER TABLE "public"."package_followup_prompts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proxy_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "sender" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."proxy_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proxy_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "guard_id" "uuid",
    "resident_id" "uuid",
    "resident_phone" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."proxy_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."residents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "house_number" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'Inquilino'::"text" NOT NULL
);


ALTER TABLE "public"."residents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visit_access_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor" "text" DEFAULT 'guard'::"text" NOT NULL,
    "detail" "text"
);


ALTER TABLE "public"."visit_access_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visits" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "guest_name" "text" NOT NULL,
    "house_number" "text",
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "valid_until" timestamp with time zone,
    "plates" "text",
    "note" "text",
    "resident_id" "uuid",
    "visit_type" "text" DEFAULT 'eventual'::"text" NOT NULL,
    "schedule" "jsonb",
    "valid_day" "date",
    "ingreso_confirmado_at" timestamp with time zone,
    "last_access_at" timestamp with time zone,
    "package_followup_sent_at" timestamp with time zone,
    "tenant_package_received" boolean,
    CONSTRAINT "visits_visit_type_check" CHECK (("visit_type" = ANY (ARRAY['eventual'::"text", 'frecuente'::"text", 'servicio'::"text", 'paqueteria'::"text"])))
);


ALTER TABLE "public"."visits" OWNER TO "postgres";


COMMENT ON COLUMN "public"."visits"."schedule" IS 'Solo visit_type=frecuente: [{ "weekday": 0-6 (dom-sáb), "start": "HH:MM", "end": "HH:MM" }]';



COMMENT ON COLUMN "public"."visits"."valid_day" IS 'Día calendario de vigencia para eventual/servicio/paquetería (un solo día).';



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_followup_prompts"
    ADD CONSTRAINT "package_followup_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proxy_messages"
    ADD CONSTRAINT "proxy_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proxy_sessions"
    ADD CONSTRAINT "proxy_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."residents"
    ADD CONSTRAINT "residents_house_number_key" UNIQUE ("house_number");



ALTER TABLE ONLY "public"."residents"
    ADD CONSTRAINT "residents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_access_log"
    ADD CONSTRAINT "visit_access_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_pkg_followup_open" ON "public"."package_followup_prompts" USING "btree" ("resident_id") WHERE ("closed_at" IS NULL);



CREATE INDEX "idx_visit_access_log_visit" ON "public"."visit_access_log" USING "btree" ("visit_id", "created_at" DESC);



CREATE INDEX "idx_visits_paqueteria_followup" ON "public"."visits" USING "btree" ("visit_type", "valid_day") WHERE (("visit_type" = 'paqueteria'::"text") AND ("status" = 'active'::"text"));



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_guard_id_fkey" FOREIGN KEY ("guard_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id");



ALTER TABLE ONLY "public"."package_followup_prompts"
    ADD CONSTRAINT "package_followup_prompts_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proxy_messages"
    ADD CONSTRAINT "proxy_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."proxy_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proxy_sessions"
    ADD CONSTRAINT "proxy_sessions_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_access_log"
    ADD CONSTRAINT "visit_access_log_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_house_number_fkey" FOREIGN KEY ("house_number") REFERENCES "public"."residents"("house_number");



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Allow full access for service roles" ON "public"."visits" USING (true) WITH CHECK (true);



CREATE POLICY "Residents can create their own visits" ON "public"."visits" FOR INSERT WITH CHECK (("auth"."uid"() = "resident_id"));



CREATE POLICY "Residents can view their own visits" ON "public"."visits" FOR SELECT USING (("auth"."uid"() = "resident_id"));



ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."package_followup_prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proxy_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proxy_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."residents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visit_access_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visits" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."logs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."visits";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."extend_paqueteria_visit_next_day"("visit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."extend_paqueteria_visit_next_day"("visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extend_paqueteria_visit_next_day"("visit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_visit_used"("visit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_visit_used"("visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_visit_used"("visit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."paqueteria_followup_candidates"("p_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."paqueteria_followup_candidates"("p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."paqueteria_followup_candidates"("p_tz" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."deliveries" TO "anon";
GRANT ALL ON TABLE "public"."deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."logs" TO "anon";
GRANT ALL ON TABLE "public"."logs" TO "authenticated";
GRANT ALL ON TABLE "public"."logs" TO "service_role";



GRANT ALL ON TABLE "public"."package_followup_prompts" TO "anon";
GRANT ALL ON TABLE "public"."package_followup_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."package_followup_prompts" TO "service_role";



GRANT ALL ON TABLE "public"."proxy_messages" TO "anon";
GRANT ALL ON TABLE "public"."proxy_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."proxy_messages" TO "service_role";



GRANT ALL ON TABLE "public"."proxy_sessions" TO "anon";
GRANT ALL ON TABLE "public"."proxy_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."proxy_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."residents" TO "anon";
GRANT ALL ON TABLE "public"."residents" TO "authenticated";
GRANT ALL ON TABLE "public"."residents" TO "service_role";



GRANT ALL ON TABLE "public"."visit_access_log" TO "anon";
GRANT ALL ON TABLE "public"."visit_access_log" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_access_log" TO "service_role";



GRANT ALL ON TABLE "public"."visits" TO "anon";
GRANT ALL ON TABLE "public"."visits" TO "authenticated";
GRANT ALL ON TABLE "public"."visits" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";


