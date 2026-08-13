# SAFERIDE WhatsApp Bot

PSV safety reporting bot built with Node.js, Express, Twilio WhatsApp, and Supabase/PostGIS — following the same deployment pattern as `ecz-chatbot`.

## Start

1. Run `npm install`, then copy `.env.example` to `.env` and set Twilio and Supabase credentials.
2. In Supabase SQL Editor, run the migrations in order: `001_initial_schema.sql`, `002_dispatch_functions.sql`, then `003_map_dispatch_data.sql`.
3. Run `npm run db:seed` and `npm run dev`.
4. Configure Twilio's incoming-message webhook as `POST https://your-domain/twilio/webhook`.

The service exposes `GET /health`, `GET /api/routes/nearby?lat=&lng=`, `GET /api/reports/:caseId`, and `POST /webhook/police-ack`.
