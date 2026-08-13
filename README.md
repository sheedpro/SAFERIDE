# SAFERIDE WhatsApp Bot

PSV safety reporting bot built with Node.js, Express, Twilio WhatsApp, and Supabase/PostGIS — following the same deployment pattern as `ecz-chatbot`.

## Start

1. Run `npm install`, then copy `.env.example` to `.env` and set Twilio and Supabase credentials.
2. In Supabase SQL Editor, run the migrations in order: `001_initial_schema.sql`, `002_dispatch_functions.sql`, `003_map_dispatch_data.sql`, then `004_predicted_interception.sql`.
3. Run `npm run db:seed` and `npm run dev`.
4. Configure Twilio's incoming-message webhook as `POST https://your-domain/twilio/webhook`.
5. Run `npm run setup-templates`, then add the printed `TWILIO_TPL_*` values to your local environment and Vercel. Until templates are configured, the bot uses the numbered-text fallback.

The service exposes `GET /health`, `GET /api/routes/nearby?lat=&lng=`, `GET /api/reports/:caseId`, and `POST /webhook/police-ack`.

## Predicted interception

SafeRide does not claim to live-track a vehicle. It preserves the passenger's last reported GPS point, estimates corridor progress from the report age and configured PSV speed, and sends officers a clearly labelled predicted position plus a navigation link to the checkpoint ahead. If an officer replies `NOTSEEN SR-YYYY-NNNNNN`, the system excludes that checkpoint and re-dispatches to the next viable checkpoint ahead.
