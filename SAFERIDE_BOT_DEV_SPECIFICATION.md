# SAFERIDE — PSV TRANSPORT SAFETY WHATSAPP BOT
## Complete Developer Build Specification

**Version:** 1.0 | **Prepared by:** Veritas Interactive Limited
**Stack:** Node.js 18+ | Express.js | MongoDB 6.0+ (geospatial) | Redis 6.0+ | Meta WhatsApp Cloud API
**Companion system:** PoliceConnect Uganda (UPF records & command intelligence)

---

# 1. CONCEPT & SCOPE

## The idea
One WhatsApp number, printed on a sticker inside every licensed PSV (public service vehicle — matatu/taxi, boda, bus):

> **"Unsafe driving? Report NOW — WhatsApp 0800-XXX-XXX"**

A passenger sitting inside the vehicle reports a violation in under 90 seconds. The bot identifies the nearest police checkpoint **ahead of the vehicle's direction of travel** on that road corridor and dispatches an alert in real time — turning a complaint into an interception opportunity, not just a filed report.

## What this bot does (in scope)
| # | Function |
|---|----------|
| 1 | Mandatory GPS capture (report cannot proceed without it) |
| 2 | Route / corridor selection |
| 3 | Vehicle identification (plate number, or guided description if plate unreadable) |
| 4 | Traffic violation classification |
| 5 | Real-time dispatch to nearest checkpoint **ahead on the corridor** |
| 6 | Case status tracking for the reporter |
| 7 | Repeat-offender detection (plate-based) |
| 8 | Emergency triage (routes danger situations to 999, not to this bot) |

## Explicitly out of scope
- ❌ Not an emergency line — never positioned as one; always defers to 999 for immediate danger
- ❌ No payments, no fines issuance, no on-the-spot penalties
- ❌ No driver-facing app in v1 (police + passenger sides only)
- ❌ No photo/video *requirement* — optional only, never solicited for dangerous-driving categories (reporter safety)
- ❌ No reporter identity disclosure to police UI (case number only)

## Companion integration
Police-side alerts land in **PoliceConnect Uganda** as a new module (`SafeRide Reports`), reusing UPF officer accounts, station/checkpoint directories, and command dashboards already planned for that system. This spec treats PoliceConnect as an external service with a defined API contract (section 11) rather than duplicating its build.

---

# 2. WHY GPS MUST BE MANDATORY (design rationale)

Unlike NIRA (status lookup, GPS optional), SafeRide's entire value proposition — routing to the checkpoint **ahead** of the vehicle — is impossible without a location fix. A report with no GPS is just a diary entry.

**Rule:** the bot refuses to advance past Step 2 without a location pin. Text describing a location ("near Kireka") is accepted only as a *fallback* if the user's WhatsApp client cannot send a pin (rare, old clients) — flagged as `locationSource: "text-fallback"` and surfaced to police with lower routing confidence.

---

# 3. ARCHITECTURE

```
Passenger's WhatsApp
     │
     ▼
Meta WhatsApp Cloud API
     │ (webhook)
     ▼
Express.js Server
     │
     ├── /webhook/whatsapp        (report intake)
     ├── /webhook/police-ack      (officer action from PoliceConnect)
     ├── Router / State Machine   <──> Session (Redis, 15-min TTL — reports are urgent, shorter than NIRA's 30)
     │
     ▼
Service Layer
     ├── ReportService        ──► MongoDB: reports
     ├── DispatchService       ──► MongoDB: checkpoints, routes (2dsphere geo queries)
     ├── VehicleService        ──► MongoDB: vehicles (repeat-offender tracking)
     ├── EmergencyTriageService (first-line safety gate, no DB write)
     └── NotificationService    ──► PoliceConnect API + WhatsApp template to duty officer
     │
     ▼
Reply to passenger (case #, dispatched checkpoint)
Alert to duty officer (WhatsApp template + PoliceConnect dashboard entry)
```

**Key architectural difference from NIRA:** this is a **write-heavy, dispatch-triggering** system, not a read-only lookup bot. Every completed report writes a new record and fires an outbound alert — so the dispatch logic (section 8) is the heart of the build, not a side feature.

---

# 4. DATABASE STRUCTURE (MongoDB)

## 4.1 `reports` collection — the core write

```javascript
{
  _id: ObjectId,
  caseId: "SR-2026-004521",              // sequential, shown to reporter & police
  reporterPhoneHash: sha256("+256701234567" + SALT),  // NEVER store plaintext phone in police-visible fields
  reporterPhoneRaw: "+256701234567",     // separate field, access-restricted, for status replies only

  reportedAt: ISODate("2026-08-06T14:32:00Z"),

  location: {
    type: "Point",
    coordinates: [32.6499, 0.3550]       // [lng, lat] — GeoJSON order
  },
  locationSource: "gps-pin",             // gps-pin | text-fallback
  locationLabel: "Near Kireka",          // reverse-geocoded or user-typed

  routeId: "RT-KLA-JINJA-001",           // FK -> routes
  routeName: "Kampala – Jinja Rd (Mukono)",
  directionOfTravel: "eastbound",        // derived from route polyline + GPS bearing if available

  vehicle: {
    plateNumber: "UBH123K",              // normalized, no spaces
    plateConfidence: "confirmed",        // confirmed | unconfirmed (SKIP path)
    description: null                    // filled when plate unreadable: "white taxi, Gulu Express sticker"
  },

  violationType: "Overspeeding",         // enum, see 4.5
  violationDetail: null,                 // free text for "Other"
  mediaId: null,                         // optional WhatsApp media ID if passenger attaches a photo

  dispatch: {
    checkpointId: "CKP-SEETA-001",
    checkpointName: "Seeta Checkpoint",
    distanceAheadKm: 4.1,
    estimatedEtaMinutes: 9,
    dispatchedAt: ISODate,
    channel: "whatsapp-template+policeconnect"
  },

  status: "Dispatched",                  // Dispatched | Acknowledged | Intercepted | NotSeen | Closed | Escalated
  officerAction: null,                   // set on ack: Intercepted | NotSeen | Escalate
  officerActionAt: null,
  officerBadgeId: null,

  corroboration: {
    isCorroborated: false,               // true if another report on same plate within 20 min
    linkedCaseIds: []
  },

  createdAt: ISODate,
  updatedAt: ISODate
}
```

**Indexes:**
```javascript
db.reports.createIndex({ caseId: 1 }, { unique: true })
db.reports.createIndex({ location: "2dsphere" })
db.reports.createIndex({ "vehicle.plateNumber": 1 })
db.reports.createIndex({ reporterPhoneHash: 1 })
db.reports.createIndex({ status: 1, reportedAt: -1 })
```

## 4.2 `checkpoints` collection

```javascript
{
  checkpointId: "CKP-SEETA-001",
  name: "Seeta Checkpoint",
  location: { type: "Point", coordinates: [32.6890, 0.3410] },
  routeIdsCovered: ["RT-KLA-JINJA-001"],    // which corridors this checkpoint sits on
  directionsCovered: ["eastbound", "westbound"],  // both directions if 2-way manned

  dutyOfficers: [
    { badgeId: "UPF-88213", name: "Insp. K. Byaruhanga", whatsapp: "+256772000111", onDuty: true }
  ],
  shiftHours: { start: "06:00", end: "22:00" },

  isActive: true,
  fallbackStationId: "STN-MUKONO-CENTRAL"  // used outside shift hours or if unmanned
}
```

**Indexes:**
```javascript
db.checkpoints.createIndex({ checkpointId: 1 }, { unique: true })
db.checkpoints.createIndex({ location: "2dsphere" })
db.checkpoints.createIndex({ routeIdsCovered: 1 })
```

## 4.3 `stations` collection (fallback when no checkpoint ahead)

```javascript
{
  stationId: "STN-MUKONO-CENTRAL",
  name: "Mukono Central Police Station",
  location: { type: "Point", coordinates: [32.7550, 0.3530] },
  phoneNumber: "0312-500-100",
  whatsapp: "+256772000222",
  isActive: true
}
```

## 4.4 `routes` collection (corridor definitions)

```javascript
{
  routeId: "RT-KLA-JINJA-001",
  name: "Kampala – Jinja Rd (Mukono)",
  aliases: ["Kampala-Jinja", "Jinja road", "Mukono route"],   // what passengers actually type
  polyline: [ [32.58,0.31], [32.63,0.335], [32.69,0.341], [32.755,0.353] ], // [lng,lat] sequence, Kampala -> Jinja
  district: "Mukono",
  isActive: true
}
```

## 4.5 `vehicles` collection (repeat-offender tracking, built from reports)

```javascript
{
  plateNumber: "UBH123K",
  reportCount30d: 4,
  reportCount90d: 9,
  violationBreakdown: { "Overspeeding": 3, "Overloading": 1 },
  flagLevel: "HIGH",                    // NONE | WATCH (>=2/30d) | HIGH (>=3/30d)
  lastReportedAt: ISODate,
  firstSeenAt: ISODate
}
```
Updated by a post-save hook on `reports`: increment counts, recompute `flagLevel`, and if it crosses `HIGH` on this save, upgrade the current report's dispatch priority (section 8.4).

## 4.6 `sessions` (Redis, 15-min TTL — reports are time-sensitive)

```javascript
// KEY: session:{phoneHash}
{
  state: "AWAITING_ROUTE",
  draftReport: {
    location: { lat, lng },
    routeId: null,
    plateNumber: null,
    violationType: null
  },
  updatedAt: 1728912345
}
```

## 4.7 `audit_logs` (analytics, abuse detection)

```javascript
{ phoneHash, direction: "in"|"out", messageText, matchedIntent, caseId, timestamp }
```

## 4.8 Violation type enum

```
DANGEROUS_DRIVING    "Dangerous / reckless driving"
OVERSPEEDING         "Overspeeding"
OVERLOADING          "Overloading passengers"
IMPAIRED_DRIVER      "Driver appears drunk / impaired"
UNROADWORTHY         "Unroadworthy vehicle"
HARASSMENT           "Harassment of passengers"
ROUTE_DEVIATION      "Route deviation / dumping passengers"
OVERCHARGING         "Overcharging"
OTHER                "Other"
```
`DANGEROUS_DRIVING`, `IMPAIRED_DRIVER`, and `HARASSMENT` are flagged `highRiskCategory: true` — these trigger the emergency-triage gate (section 6.1) and skip the photo prompt entirely.

---

# 5. CONVERSATION STATE MACHINE

```
STATES:
  MAIN_MENU
  AWAITING_LOCATION        – GPS gate; will not advance without a pin
  AWAITING_ROUTE           – route list shown, filtered by proximity to GPS
  AWAITING_PLATE           – plate number or SKIP
  AWAITING_DESCRIPTION     – only if plate SKIPped
  AWAITING_VIOLATION       – violation list shown
  EMERGENCY_CHECK          – "are you in immediate danger?" gate (high-risk categories only)
  AWAITING_MEDIA_OPTIONAL  – optional photo prompt (skipped for high-risk categories)
  CONFIRM_REPORT           – final review before dispatch
  AWAITING_STATUS_LOOKUP   – case ID or "my last report"

TRANSITIONS (report flow, happy path):
  MAIN_MENU        --"1" or "report"-->     AWAITING_LOCATION
  AWAITING_LOCATION --location pin received--> AWAITING_ROUTE
  AWAITING_LOCATION --text (no pin)-->        re-prompt (max 2x) then text-fallback path
  AWAITING_ROUTE    --valid route pick-->     AWAITING_PLATE
  AWAITING_PLATE    --plate text-->           AWAITING_VIOLATION
  AWAITING_PLATE    --"SKIP"-->               AWAITING_DESCRIPTION
  AWAITING_DESCRIPTION --description text-->  AWAITING_VIOLATION
  AWAITING_VIOLATION --pick, highRiskCategory--> EMERGENCY_CHECK
  AWAITING_VIOLATION --pick, normal category--> AWAITING_MEDIA_OPTIONAL
  EMERGENCY_CHECK   --"I'm safe, continue"-->  AWAITING_MEDIA_OPTIONAL (media prompt SKIPPED, goes to CONFIRM)
  EMERGENCY_CHECK   --"I need help now"-->     show 999 screen, END (report still filed in background)
  AWAITING_MEDIA_OPTIONAL --photo or "skip"--> CONFIRM_REPORT
  CONFIRM_REPORT    --"confirm"-->             DISPATCH (writes report, fires alert) -> MAIN_MENU
  CONFIRM_REPORT    --"edit"-->                back to AWAITING_ROUTE (restart from route)

GLOBAL KEYWORDS:
  "menu", "cancel", "0"      -> MAIN_MENU (draftReport discarded)
  "999", "help", "emergency" -> IMMEDIATE 999 screen, from ANY state, no delay
  "status" / case ID pattern (SR-YYYY-NNNNNN) -> AWAITING_STATUS_LOOKUP handling
```

**Critical rule:** the `"999"/"emergency"/"help"` keyword check happens **before any other routing logic**, in every state, with zero DB calls in the hot path — this must be the fastest possible response in the entire system.

```javascript
async function route(phoneHash, text, rawMessage) {
  const clean = text.trim().toLowerCase();

  // ABSOLUTE PRIORITY — check before session load, before anything
  if (["999","help","emergency","sos","danger"].includes(clean))
    return sendEmergencyScreen(phoneHash);   // no session needed, immediate reply

  const session = await getSession(phoneHash);

  if (["menu","cancel","0"].includes(clean)) {
    await clearDraft(phoneHash);
    return showMainMenu(phoneHash);
  }

  const caseMatch = text.match(/SR-\d{4}-\d{6}/i);
  if (caseMatch) return handleStatusLookup(phoneHash, caseMatch[0].toUpperCase());

  switch (session.state) {
    case "AWAITING_LOCATION":       return handleLocationInput(phoneHash, rawMessage, session);
    case "AWAITING_ROUTE":          return handleRoutePick(phoneHash, text, session);
    case "AWAITING_PLATE":          return handlePlateInput(phoneHash, text, session);
    case "AWAITING_DESCRIPTION":    return handleDescriptionInput(phoneHash, text, session);
    case "AWAITING_VIOLATION":      return handleViolationPick(phoneHash, text, session);
    case "EMERGENCY_CHECK":         return handleEmergencyCheck(phoneHash, text, session);
    case "AWAITING_MEDIA_OPTIONAL": return handleMediaOptional(phoneHash, rawMessage, session);
    case "CONFIRM_REPORT":          return handleConfirm(phoneHash, text, session);
    default:                        return showMainMenu(phoneHash);
  }
}
```

---

# 6. WORKFLOWS + SCREENS (exact message templates)

## 6.0 EMERGENCY SCREEN (highest priority — reachable from ANY state, ANY time)

```
🚨 *IF YOU ARE IN IMMEDIATE DANGER*

Call *999* or *112* right now.
This WhatsApp bot is NOT an
emergency line and is not monitored
every second.

Once you are safe, you can still
file a report here for follow-up.

Reply *REPORT* to continue when safe.
Reply *MENU* to go back.
```
**Logic:** zero DB read before this reply — precomputed constant string, sent immediately. Then (async, after reply sent) log the trigger to `audit_logs` for pattern monitoring.

---

## 6.1 MAIN MENU

**Trigger:** first contact, "hi", "menu", "0"

```
🚌 *SAFERIDE — PSV SAFETY REPORTING*

See something unsafe? Report it in
under 2 minutes. Your identity is
never shared with the driver.

1️⃣ 🚨 Report this vehicle NOW
2️⃣ 📋 Check my report status
3️⃣ ❓ How this works

⚠️ In immediate danger? Reply *999*
```

**Logic:** `setSession(phoneHash, { state: "MAIN_MENU" })`; clear any stale `draftReport`.

---

## 6.2 STEP 1 — LOCATION (mandatory gate)

**Trigger:** "1"/"report" from main menu

```
📍 *SHARE YOUR LOCATION*

Tap the 📎 (attach) icon → *Location*
→ *Send your current location*

I need this to find the nearest
police checkpoint on your road —
a report can't be filed without it.

⚠️ Immediate danger? Reply *999*
```

**If user sends text instead of a pin (1st and 2nd attempt):**
```
📍 I need your *actual GPS location*,
not typed text.

Tap 📎 → Location → Send current
location. It only takes a second.
```

**If user sends text a 3rd time (fallback path activates):**
```
Having trouble sharing location?

Reply with the name of the nearest
trading center, junction, or landmark
instead (e.g. "Kireka junction").

This is less accurate, so please
also tell me your direction of
travel (e.g. "heading to Jinja").
```
`locationSource` is set to `"text-fallback"`; the free-text is reverse-matched against a `landmarks` lookup or stored as raw `locationLabel` with `coordinates: null` — dispatch logic (section 8) degrades gracefully in this case.

**On successful GPS pin:**
```javascript
async function handleLocationInput(phoneHash, msg, session) {
  if (msg.type !== "location") {
    session.locationAttempts = (session.locationAttempts||0) + 1;
    if (session.locationAttempts >= 3) return startTextFallback(phoneHash, session);
    return send(phoneHash, TPL.LOCATION_RETRY);
  }
  const { latitude, longitude } = msg.location;
  session.draftReport.location = { lat: latitude, lng: longitude };
  session.state = "AWAITING_ROUTE";
  await saveSession(phoneHash, session);
  const nearbyRoutes = await findNearbyRoutes(latitude, longitude);   // section 8.1
  return send(phoneHash, renderRouteMenu(nearbyRoutes));
}
```

---

## 6.3 STEP 2 — ROUTE SELECTION (auto-filtered by GPS proximity)

```
📍 Got it — you're near *Kireka*.

Which route are you on?

1️⃣ Kampala – Jinja Rd (Mukono)
2️⃣ Kampala – Kireka – Bweyogerere
3️⃣ Ntinda – Kireka
4️⃣ Other (type the route name)

0️⃣ Cancel report
```

**Logic:** `findNearbyRoutes()` queries `routes` for polylines within ~3km of the GPS point, ranked by proximity — not a static list. If zero routes match (rural/unmapped area), fall back to a full district-level list or free-text entry.

**"Other" free text:** matched fuzzily against `routes.aliases`; if no match, stored as `routeName` free text with `routeId: null` — dispatch then uses **nearest checkpoint by straight-line distance** rather than corridor-ahead logic (degraded but still useful).

---

## 6.4 STEP 3 — VEHICLE / PLATE NUMBER

```
🚌 *WHICH VEHICLE ARE YOU IN?*

Type the number plate if you can
see it, e.g. *UBH 123K*

Can't see it? Reply *SKIP* and
I'll ask you to describe it instead.
```

**On SKIP:**
```
No problem. Describe the vehicle:

Colour + type + anything visible
(route sticker, sacco name, damage,
sticker text, etc.)

Example: "White taxi, Gulu Highway
Express sticker, cracked windscreen"
```

**Plate validation:**
```javascript
function validatePlate(input) {
  const cleaned = input.toUpperCase().replace(/\s/g, "");
  // Uganda format: 3 letters + 3 digits + 1 letter (UBH123K)
  return /^U[A-Z]{2}\d{3}[A-Z]$/.test(cleaned) ? cleaned : null;
}
```
**Invalid plate format entered:**
```
That doesn't look like a Uganda
plate number (format: UBH 123K).

Try again, or reply *SKIP* to
describe the vehicle instead.
```

---

## 6.5 STEP 4 — VIOLATION TYPE (List Message)

```
⚠️ *WHAT'S HAPPENING?*
Pick the main issue:

○ Dangerous / reckless driving
○ Overspeeding
○ Overloading passengers
○ Driver appears drunk / impaired
○ Unroadworthy vehicle
○ Harassment of passengers
○ Route deviation / dumping passengers
○ Overcharging
○ Other
```

**Logic:** on selection, check `highRiskCategory` flag (section 4.8). If true → jump to `EMERGENCY_CHECK` (6.6). If false → `AWAITING_MEDIA_OPTIONAL` (6.7).

---

## 6.6 EMERGENCY CHECK GATE (only for Dangerous Driving / Impaired Driver / Harassment)

```
⚠️ *ARE YOU SAFE RIGHT NOW?*

You selected: Driver appears drunk
or impaired.

┌────────────────────────────────┐
│   🚨 I need help NOW           │
├────────────────────────────────┤
│   ✅ I'm safe, continue report │
└────────────────────────────────┘
```

**"I need help NOW":**
```
📞 Please call *999* or *112*
immediately.

I'm still filing your report in
the background so police get the
details too — you don't need to
do anything else.

Case will be created as: SR-2026-XXXXXX
```
**Logic:** the report is auto-submitted with whatever fields are already captured (location + route + plate/description + violation), marked `status: "Escalated"`, `dispatch` still fires. No photo prompt, no confirm screen — speed over completeness here.

**"I'm safe, continue":** proceeds to `CONFIRM_REPORT` directly — **photo prompt is skipped entirely** for high-risk categories (reporter safety: don't ask someone to point a phone camera at a driver who is currently dangerous).

---

## 6.7 STEP 5 — OPTIONAL PHOTO (non-high-risk categories only)

```
📷 *OPTIONAL: Add a photo?*

If it's safe to do so, you can
attach one photo (e.g. of the
plate or vehicle condition).

Reply *SKIP* if you'd rather not,
or just send a photo now.
```

---

## 6.8 CONFIRM & DISPATCH SCREEN

```
✅ *REVIEW YOUR REPORT*

📍 Location: Near Kireka
🛣️ Route: Kampala – Jinja Rd (Mukono)
🚌 Vehicle: UBH 123K
⚠️ Issue: Overspeeding

┌────────────────────────────────┐
│      ✅ Confirm & Send         │
├────────────────────────────────┤
│      ✏️ Edit details           │
├────────────────────────────────┤
│      ❌ Cancel                 │
└────────────────────────────────┘
```

**On Confirm → DISPATCH fires (section 8):**
```
✅ *REPORT DISPATCHED*

Case #: SR-2026-004521

Vehicle: UBH 123K
Route: Kampala – Jinja Rd
Issue: Overspeeding
Time: Today, 14:32

🚓 Alerted: *Seeta Checkpoint*
(~4.1 km ahead on your route)
Officers now have the plate and
direction of travel.

Your identity stays confidential —
never shared with the driver.

Reply *STATUS SR-2026-004521* anytime
for updates.

⚠️ In immediate danger? Reply *999*
```

---

## 6.9 NO CHECKPOINT AHEAD (fallback dispatch variant)

```
✅ *REPORT DISPATCHED*

Case #: SR-2026-004518

No active checkpoint sits ahead on
this stretch right now, so we've
alerted the nearest station instead:

🚓 *Mukono Central Police Station*
📞 0312-500-100

They have your full report and
will follow up.

Reply *STATUS SR-2026-004518* anytime.
```

---

## 6.10 STATUS LOOKUP

**Trigger:** "2" from menu, or typing/pasting a case ID directly

```
📋 *CHECK REPORT STATUS*

Reply with your case number
(e.g. SR-2026-004521), or reply
*LAST* for your most recent report.
```

**Status result — Dispatched:**
```
📋 *SR-2026-004521*

Filed: Today, 14:32
Vehicle: UBH 123K
Issue: Overspeeding

Status: ⟳ *DISPATCHED*
Alerted: Seeta Checkpoint
Awaiting officer response.

0️⃣ Menu
```

**Status result — Intercepted (officer acted):**
```
📋 *SR-2026-004521*

Status: ✅ *INTERCEPTED*
Seeta Checkpoint stopped the
vehicle at 14:44.

Thank you for helping keep the
roads safe. 🙏

0️⃣ Menu
```

**Status result — Not Seen:**
```
📋 *SR-2026-004521*

Status: The vehicle was not
located by the checkpoint.

Your report remains on file and
contributes to this vehicle's
safety record.

0️⃣ Menu
```

---

## 6.11 REPEAT OFFENDER NOTICE (shown to reporter, builds trust in the system)

Appended to the dispatch screen (6.8) when `vehicles.flagLevel` is `WATCH` or `HIGH`:

```
ℹ️ This vehicle has been reported
3 times in the last 30 days. Your
report adds to an active pattern
already being monitored.
```

---

## 6.12 "HOW THIS WORKS" (Screen — "3" from main menu)

```
❓ *HOW SAFERIDE WORKS*

1️⃣ You share your GPS location
   (required — finds the nearest
   checkpoint on your road)

2️⃣ Pick your route & the vehicle
   (plate or description)

3️⃣ Select what's happening

4️⃣ We alert the nearest police
   checkpoint AHEAD of the vehicle
   in real time

5️⃣ Track what happened with your
   case number

Your identity is NEVER shared with
the driver or vehicle owner.

1️⃣ Report now
0️⃣ Menu
```

---

## 6.13 ERROR SCREENS

**Invalid violation choice:**
```
Sorry, please pick a number from
the list above, or reply *MENU*.
```

**Case ID not found (status lookup):**
```
😕 I couldn't find case SR-2026-009999.

Double check the case number from
your confirmation message, or
reply *MENU*.
```

**Rate limit hit:**
```
You've filed several reports
recently. To keep the system fair
for everyone, please wait a short
while before filing another.

Genuine emergency? Reply *999* to
call police directly.
```

**System error:**
```
⚠️ Sorry — I'm having trouble
reaching the system right now.
Your report has NOT been lost if
you already confirmed it — please
try *STATUS* in a few minutes.

If this is urgent, call 999.
```

# 7. VALIDATION RULES

| Field | Rule | Regex / Logic |
|-------|------|----------------|
| Plate number | 3 letters + 3 digits + 1 letter (Uganda) | `/^U[A-Z]{2}\d{3}[A-Z]$/` after stripping spaces |
| GPS coordinates | Must be within Uganda bounding box | lat: -1.5 to 4.3, lng: 29.5 to 35.1 (reject/flag outliers) |
| Case ID | `SR-YYYY-NNNNNN` | `/^SR-\d{4}-\d{6}$/i` |
| Report rate limit | Max 5 reports / phone / 24h | Redis counter `rl:{phoneHash}`, 24h TTL |
| Duplicate suppress | Same phone + same plate within 2 min | Redis dedup key, prevents accidental double-submit |

```javascript
function isWithinUganda(lat, lng) {
  return lat >= -1.5 && lat <= 4.3 && lng >= 29.5 && lng <= 35.1;
}
```

---

# 8. DISPATCH ENGINE (the core of the system)

This is what separates SafeRide from a generic complaint form: routing to the checkpoint **ahead of the vehicle**, not just the nearest one.

## 8.1 Finding nearby routes from a GPS point

```javascript
async function findNearbyRoutes(lat, lng, maxKm = 3) {
  // Since routes are polylines (not points), approximate by checking
  // distance from the GPS point to each polyline segment.
  const allRoutes = await db.routes.find({ isActive: true }).toArray();
  return allRoutes
    .map(r => ({ ...r, distanceKm: minDistanceToPolyline(lat, lng, r.polyline) }))
    .filter(r => r.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 4);
}

function minDistanceToPolyline(lat, lng, polyline) {
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    min = Math.min(min, pointToSegmentDistanceKm(
      lat, lng, polyline[i][1], polyline[i][0], polyline[i+1][1], polyline[i+1][0]
    ));
  }
  return min;
}
// pointToSegmentDistanceKm: standard haversine + segment projection — use a
// library (turf.js: turf.pointToLineDistance) rather than hand-rolling in production.
```

**Recommendation:** use **Turf.js** (`@turf/turf`) for all geospatial math (point-to-line distance, bearing, nearest point on line) rather than custom haversine code — it's the standard for this in Node and avoids subtle bugs.

## 8.2 Determining direction of travel

```javascript
function estimateDirection(routePolyline, gpsPoint, previousGpsPoint = null) {
  // Best case: if we have 2 GPS fixes (rare in a single-shot report),
  // compute bearing between them and compare to polyline bearing.
  // Practical v1 case: single GPS fix only ->
  // ask the passenger directly as a disambiguation question ONLY
  // when the route serves both directions and checkpoints differ by direction.

  const nearestPointIdx = turf.nearestPointOnLine(
    turf.lineString(routePolyline), turf.point(gpsPoint)
  ).properties.index;

  // Default assumption: direction matches the route's natural A->B order.
  // This is refined by asking a quick disambiguation question (8.2.1)
  // whenever the corridor is bidirectional AND checkpoints differ by direction.
}
```

### 8.2.1 Direction disambiguation (only shown when needed)

If a route has checkpoints in both directions, the bot asks one extra quick question right after route selection:

```
🧭 Quick check — which way are you
heading?

1️⃣ Towards Jinja
2️⃣ Towards Kampala
```

This is the ONE case where the flow adds a step — justified because sending an alert to a checkpoint the vehicle is driving *away from* is worse than useless (it wastes officer attention and delays the real dispatch).

## 8.3 Selecting the dispatch target — the core algorithm

```javascript
async function selectDispatchTarget(report) {
  const { location, routeId, directionOfTravel } = report;

  // 1. Find checkpoints on this route corridor
  let candidates = await db.checkpoints.find({
    routeIdsCovered: routeId,
    isActive: true,
    directionsCovered: directionOfTravel ?? { $exists: true }
  }).toArray();

  // 2. Filter to checkpoints AHEAD of the vehicle (not behind)
  candidates = candidates.filter(cp =>
    isAheadOnRoute(location, cp.location, routeId, directionOfTravel)
  );

  // 3. Filter to currently-on-shift officers
  const now = currentTimeUgandaTZ();
  candidates = candidates.filter(cp => isWithinShift(cp.shiftHours, now));

  // 4. Sort by distance ahead (closest first — soonest interception chance)
  candidates.sort((a, b) =>
    distanceAlongRoute(location, a.location) - distanceAlongRoute(location, b.location)
  );

  if (candidates.length > 0) {
    const target = candidates[0];
    const distanceKm = distanceAlongRoute(location, target.location);
    return {
      type: "checkpoint",
      target,
      distanceAheadKm: distanceKm,
      etaMinutes: Math.round((distanceKm / AVG_CORRIDOR_SPEED_KMH) * 60)
    };
  }

  // 5. FALLBACK: no active checkpoint ahead -> nearest police station (straight-line)
  const nearestStation = await db.stations.findOne(
    { isActive: true },
    { sort: { location: 1 } }   // or $near query, see below
  );
  return { type: "station", target: await nearestStationByLocation(location) };
}

async function nearestStationByLocation(location) {
  return db.stations.find({
    isActive: true,
    location: { $near: { $geometry: { type: "Point", coordinates: [location.lng, location.lat] } } }
  }).limit(1).toArray().then(r => r[0]);
}

const AVG_CORRIDOR_SPEED_KMH = 35;   // conservative urban/peri-urban PSV average — tune per route if data allows
```

**`isAheadOnRoute`**: projects both the report location and the checkpoint location onto the route polyline (using `turf.nearestPointOnLine`, which returns a `location` property = distance along the line from the start). "Ahead" means the checkpoint's along-line distance is greater than the report's (for the "A→B" direction) or smaller (for "B→A").

## 8.4 Priority escalation for repeat offenders

```javascript
async function applyRepeatOffenderPriority(report, vehicleRecord) {
  if (vehicleRecord.flagLevel === "HIGH") {
    report.dispatch.priority = "HIGH";
    // HIGH priority: send to ALL checkpoints ahead within 10km, not just nearest one
    // (increases interception probability for known problem vehicles)
  }
}
```

## 8.5 Corroboration — linking independent reports on the same vehicle

```javascript
async function checkCorroboration(newReport) {
  const window = new Date(newReport.reportedAt.getTime() - 20*60*1000); // 20 min window
  const recent = await db.reports.find({
    "vehicle.plateNumber": newReport.vehicle.plateNumber,
    reportedAt: { $gte: window },
    reporterPhoneHash: { $ne: newReport.reporterPhoneHash }   // different reporter
  }).toArray();

  if (recent.length > 0) {
    newReport.corroboration = { isCorroborated: true, linkedCaseIds: recent.map(r => r.caseId) };
    // Corroborated reports jump the dispatch queue — two independent
    // passengers reporting the same plate within 20 min is a strong signal.
  }
}
```

## 8.6 Full dispatch sequence (end to end)

```javascript
async function dispatchReport(report) {
  await checkCorroboration(report);
  const vehicleRecord = await upsertVehicleRecord(report.vehicle.plateNumber);
  await applyRepeatOffenderPriority(report, vehicleRecord);

  const result = await selectDispatchTarget(report);
  report.dispatch = buildDispatchRecord(result);
  report.status = "Dispatched";

  await db.reports.insertOne(report);

  if (result.type === "checkpoint") {
    await notifyOfficer(result.target, report);          // WhatsApp template, section 9
    await postToPoliceConnect(report);                    // API call, section 11
  } else {
    await notifyStation(result.target, report);
  }

  return report;
}
```

---

# 9. NOTIFICATION TO DUTY OFFICER (Meta template — outside 24h window by definition)

The officer has never messaged the bot, so this is **always** a template send, never free-form.

```
Template: saferide_report_alert (category: UTILITY)
──────────────────────────────────────────────
Body: 🚨 SafeRide Alert — Case {{1}}
Vehicle: {{2}} | Issue: {{3}}
Route: {{4}}, heading {{5}}
Reported: {{6}} ago, ~{{7}} km ahead of your position
ETA to your checkpoint: ~{{8}} min

Buttons: [Quick Reply: "Intercepted"]
         [Quick Reply: "Not seen"]
         [Quick Reply: "Escalate"]
```

```javascript
async function notifyOfficer(checkpoint, report) {
  for (const officer of checkpoint.dutyOfficers.filter(o => o.onDuty)) {
    await sendTemplate(officer.whatsapp, "saferide_report_alert", [
      report.caseId, report.vehicle.plateNumber || report.vehicle.description,
      report.violationType, report.routeName, report.directionOfTravel,
      "2 min", report.dispatch.distanceAheadKm, report.dispatch.estimatedEtaMinutes
    ]);
  }
}
```

**Officer reply handling** (button tap → webhook → update case):
```javascript
app.post("/webhook/whatsapp", async (req, res) => {
  // ... existing passenger routing ...
  const buttonId = msg.interactive?.button_reply?.id; // "INTERCEPTED_SR-2026-004521" etc.
  if (buttonId?.startsWith("INTERCEPTED_") || buttonId?.startsWith("NOTSEEN_") || buttonId?.startsWith("ESCALATE_")) {
    return handleOfficerAction(buttonId, msg.from);
  }
});

async function handleOfficerAction(buttonId, officerPhone) {
  const [action, caseId] = buttonId.split("_");
  await db.reports.updateOne({ caseId }, { $set: {
    status: action === "INTERCEPTED" ? "Intercepted" : action === "NOTSEEN" ? "NotSeen" : "Escalated",
    officerAction: action, officerActionAt: new Date()
  }});
  const report = await db.reports.findOne({ caseId });
  await notifyReporterOfOutcome(report);   // sends screen 6.10 variant to original reporter
}
```

---

# 10. ABUSE PREVENTION & TRUST SAFEGUARDS

| Risk | Mitigation |
|------|-----------|
| Malicious false reports (targeting a rival driver/vehicle) | Rate limit 5/24h/phone; corroboration boosts trust, isolated single reports on a plate with no history get standard (not HIGH) priority |
| Reporter identity leak to driver | Police-facing API/UI **never** exposes `reporterPhoneRaw` — only `caseId`; officer alert template contains zero reporter-identifying info |
| Spam/nonsense plates | Plate format validation; unparseable free-text descriptions still accepted (SKIP path) but flagged `plateConfidence: "unconfirmed"` |
| GPS spoofing | Reject coordinates outside Uganda bounding box (7); flag reports where GPS accuracy metadata (if WhatsApp provides it) is unusually poor |
| Officer alert fatigue | HIGH-priority multi-checkpoint alerts reserved for `flagLevel: HIGH` vehicles only — not every report fans out |
| Reporter never hears back | Every dispatch has a status lookup path (6.10); officer action always triggers a reporter-facing outcome message |

---

# 11. POLICECONNECT INTEGRATION (API contract)

SafeRide is the intake channel; **PoliceConnect Uganda** (see [[policeconnect]]) is the command-and-records system of record for UPF. This bot POSTs into it rather than building a duplicate dashboard.

```
POST /policeconnect/api/v1/saferide-reports
Headers: Authorization: Bearer {SAFERIDE_SERVICE_TOKEN}
Body:
{
  "caseId": "SR-2026-004521",
  "reportedAt": "2026-08-06T14:32:00Z",
  "location": { "lat": 0.3550, "lng": 32.6499 },
  "routeName": "Kampala – Jinja Rd (Mukono)",
  "directionOfTravel": "eastbound",
  "vehicle": { "plateNumber": "UBH123K", "description": null },
  "violationType": "Overspeeding",
  "dispatchedCheckpointId": "CKP-SEETA-001",
  "priority": "STANDARD",
  "mediaUrl": null
  // NOTE: no reporter phone number or identity field — by design
}

Response: { "policeConnectRefId": "PC-INC-88213", "acknowledged": true }
```

```
POST /webhook/police-ack   (PoliceConnect -> SafeRide, when action logged in their system instead of via WhatsApp button)
Body: { "caseId": "SR-2026-004521", "action": "Intercepted", "badgeId": "UPF-88213", "note": "Driver cautioned, vehicle inspected" }
```

Two paths to the same outcome (officer taps a WhatsApp button, OR logs it in the PoliceConnect dashboard) both update `reports.status` and both trigger `notifyReporterOfOutcome`.

---

# 12. API ENDPOINTS (internal REST)

```
GET  /health

POST /webhook/whatsapp                    -> passenger + officer message intake
POST /webhook/police-ack                  -> PoliceConnect action callback

GET  /api/reports/:caseId                 -> full report (internal/admin use)
GET  /api/reports/by-phone/:phoneHash     -> reporter's own report history

GET  /api/routes/nearby?lat=&lng=&maxKm=3 -> section 8.1
GET  /api/checkpoints?routeId=            -> checkpoints on a corridor
GET  /api/vehicles/:plateNumber           -> repeat-offender record

POST /api/dispatch/simulate               -> dry-run dispatch logic for testing (no DB write, no real alert)
```

# 13. SEED DATA

## 13.1 Sample routes (3 to start; full corridor mapping is a real GIS task with Ministry of Works)

```javascript
[
  { routeId: "RT-KLA-JINJA-001", name: "Kampala – Jinja Rd (Mukono)",
    aliases: ["Kampala-Jinja","Jinja road","Mukono route"],
    polyline: [[32.58,0.31],[32.63,0.335],[32.69,0.341],[32.755,0.353]],
    district: "Mukono", isActive: true },
  { routeId: "RT-KLA-KIREKA-001", name: "Kampala – Kireka – Bweyogerere",
    aliases: ["Kireka route","Bweyogerere"],
    polyline: [[32.58,0.31],[32.62,0.336],[32.645,0.355]],
    district: "Wakiso", isActive: true },
  { routeId: "RT-NTINDA-KIREKA-001", name: "Ntinda – Kireka",
    aliases: ["Ntinda route"], polyline: [[32.615,0.348],[32.645,0.355]],
    district: "Kampala", isActive: true }
]
```

## 13.2 Sample checkpoints

```javascript
[
  { checkpointId: "CKP-SEETA-001", name: "Seeta Checkpoint",
    location: { type:"Point", coordinates:[32.689,0.341] },
    routeIdsCovered: ["RT-KLA-JINJA-001"], directionsCovered: ["eastbound","westbound"],
    dutyOfficers: [{ badgeId:"UPF-88213", name:"Insp. K. Byaruhanga",
                      whatsapp:"+256772000111", onDuty: true }],
    shiftHours: { start:"06:00", end:"22:00" },
    isActive: true, fallbackStationId: "STN-MUKONO-CENTRAL" },
  { checkpointId: "CKP-KIREKA-001", name: "Kireka Checkpoint",
    location: { type:"Point", coordinates:[32.645,0.355] },
    routeIdsCovered: ["RT-KLA-KIREKA-001","RT-NTINDA-KIREKA-001"],
    directionsCovered: ["eastbound","westbound"],
    dutyOfficers: [{ badgeId:"UPF-77104", name:"Sgt. R. Amuge",
                      whatsapp:"+256772000222", onDuty: true }],
    shiftHours: { start:"06:00", end:"20:00" }, isActive: true,
    fallbackStationId: "STN-KIREKA" }
]
```

## 13.3 Sample stations (fallback)

```javascript
[
  { stationId: "STN-MUKONO-CENTRAL", name: "Mukono Central Police Station",
    location: { type:"Point", coordinates:[32.755,0.353] },
    phoneNumber: "0312-500-100", whatsapp: "+256772000333", isActive: true }
]
```

## 13.4 Sample reports (test cases covering each dispatch path)

```javascript
[
  // Path 1: normal dispatch, checkpoint ahead found
  { caseId:"SR-2026-004521", vehicle:{plateNumber:"UBH123K", plateConfidence:"confirmed"},
    violationType:"Overspeeding", routeId:"RT-KLA-JINJA-001", directionOfTravel:"eastbound",
    location:{type:"Point",coordinates:[32.6499,0.3550]}, status:"Dispatched" },

  // Path 2: no checkpoint ahead -> station fallback
  { caseId:"SR-2026-004518", vehicle:{plateNumber:"UAX998P", plateConfidence:"confirmed"},
    violationType:"Overloading", routeId:"RT-NTINDA-KIREKA-001",
    status:"Dispatched", dispatch:{ checkpointId:null } },

  // Path 3: repeat offender, HIGH flag
  { caseId:"SR-2026-004530", vehicle:{plateNumber:"UBH123K", plateConfidence:"confirmed"},
    violationType:"Overspeeding", status:"Dispatched" },
  // (2 more prior reports on UBH123K within 30 days needed to trigger HIGH — seed those too)

  // Path 4: emergency-escalated report, no plate confirmed
  { caseId:"SR-2026-004533", vehicle:{plateNumber:null, description:"White Drone taxi, cracked windscreen", plateConfidence:"unconfirmed"},
    violationType:"Impaired driver (drunk)", status:"Escalated" }
]
```

---

# 14. PROJECT STRUCTURE

```
saferide-bot/
├── src/
│   ├── server.js
│   ├── webhook/
│   │   ├── whatsapp.js          # passenger + officer message intake
│   │   └── policeAck.js         # PoliceConnect callback
│   ├── router/
│   │   └── stateMachine.js      # section 5
│   ├── services/
│   │   ├── reportService.js
│   │   ├── dispatchService.js   # section 8 — core geospatial logic
│   │   ├── vehicleService.js    # repeat-offender tracking
│   │   ├── emergencyTriage.js   # zero-DB fast path
│   │   └── policeConnectClient.js  # section 11 API calls
│   ├── templates/
│   │   └── messages.js          # section 6
│   ├── utils/
│   │   ├── validators.js        # section 7
│   │   ├── geo.js               # turf.js wrappers, section 8.1-8.3
│   │   └── session.js
│   └── db/
│       ├── mongo.js
│       └── redis.js
├── seed/
│   ├── routes.js
│   ├── checkpoints.js
│   ├── stations.js
│   ├── reports.js
│   └── run.js
├── tests/
│   ├── validators.test.js
│   ├── dispatchService.test.js   # critical — test isAheadOnRoute exhaustively
│   └── stateMachine.test.js
├── .env.example
├── Dockerfile
└── package.json
```

---

# 15. ENVIRONMENT & SETUP

```bash
# .env.example
PORT=3000
MONGODB_URI=mongodb://localhost:27017/saferide_bot
REDIS_HOST=localhost
REDIS_PORT=6379

WA_PHONE_NUMBER_ID=
WA_TOKEN=
WEBHOOK_VERIFY_TOKEN=

REPORTER_PHONE_SALT=              # for sha256 hashing, section 4.1 — rotate carefully, breaks history lookup

POLICECONNECT_API_URL=
POLICECONNECT_SERVICE_TOKEN=

AVG_CORRIDOR_SPEED_KMH=35
LOG_LEVEL=info
```

```bash
git clone <repo> && cd saferide-bot
npm install
npm install @turf/turf                 # REQUIRED for geospatial math
cp .env.example .env
npm run db:seed
npm run dev

# Test dispatch logic without WhatsApp:
curl -X POST localhost:3000/api/dispatch/simulate \
  -H "Content-Type: application/json" \
  -d '{"location":{"lat":0.355,"lng":32.6499},"routeId":"RT-KLA-JINJA-001","directionOfTravel":"eastbound"}'
```

---

# 16. TEST CHECKLIST

```
EMERGENCY PATH (highest priority — test first)
[ ] "999" from ANY state -> emergency screen, <500ms response, no session load required
[ ] "help"/"emergency"/"sos" all trigger the same screen
[ ] Emergency screen shown mid-report -> report NOT lost, resumable

GPS GATE
[ ] Text sent instead of location pin -> retry prompt (up to 2x)
[ ] 3rd text attempt -> text-fallback path activates, locationSource recorded correctly
[ ] Valid location pin -> routes filtered by proximity, correct nearest-route ordering
[ ] GPS outside Uganda bounding box -> flagged/rejected

DISPATCH LOGIC (critical — the core value prop)
[ ] Checkpoint exists ahead on route+direction -> selected, correct ETA calculation
[ ] Checkpoint exists but BEHIND vehicle -> correctly excluded
[ ] Checkpoint outside shift hours -> excluded, falls through to next candidate
[ ] No checkpoint at all on route -> station fallback fires correctly
[ ] Bidirectional route with different checkpoints per direction -> disambiguation question asked
[ ] Repeat offender (3rd report in 30 days) -> flagLevel escalates to HIGH, multi-checkpoint alert

REPORT FLOW
[ ] Full happy path: location -> route -> plate -> violation -> confirm -> dispatched
[ ] Plate SKIP -> description path -> report still dispatches correctly
[ ] Invalid plate format -> re-prompt, not silently accepted
[ ] High-risk violation (impaired/dangerous/harassment) -> emergency check gate shown, photo prompt SKIPPED
[ ] Normal violation -> optional photo prompt shown, SKIP works
[ ] "Edit" at confirm screen -> returns to route step, draft preserved except violation
[ ] "Cancel" at any point -> draft discarded, clean return to menu

OFFICER SIDE
[ ] Template alert delivers all 8 parameters correctly formatted
[ ] "Intercepted" button tap -> report status updates, reporter notified
[ ] "Not seen" button tap -> correct reporter message
[ ] PoliceConnect API POST succeeds and stores policeConnectRefId
[ ] PoliceConnect webhook callback (action logged their side) also updates report + notifies reporter

PRIVACY & ABUSE
[ ] reporterPhoneRaw NEVER appears in PoliceConnect API payload
[ ] 6th report in 24h from same phone -> rate limited
[ ] Duplicate submit within 2 min (same phone+plate) -> deduped, not double-dispatched

STATUS LOOKUP
[ ] Valid case ID -> correct status variant shown
[ ] "LAST" -> most recent report by that phone
[ ] Invalid/unknown case ID -> not-found screen
```

---

# 17. DEPLOYMENT

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "src/server.js"]
```

**Production notes specific to SafeRide:**
- `REPORTER_PHONE_SALT` must be in a secrets vault, never in the repo — it's the only thing standing between a case record and reporter re-identification
- PoliceConnect API token scoped read/write to `saferide-reports` only, not full UPF records access
- Officer WhatsApp numbers in `checkpoints.dutyOfficers` need a rotation/shift-update process (who updates this when officers change shift?) — recommend a simple admin endpoint or manual DB update process for pilot, proper roster sync in phase 2
- Consider a **backup alert channel** (SMS) to duty officers in case WhatsApp delivery fails for a dispatch — a missed alert on this system has real safety consequences, unlike a missed NIRA status check

---

# 18. BUILD PLAN

```
WEEK 1 — FOUNDATION
[ ] Repo scaffold, Mongo/Redis wiring, /health
[ ] Webhook verify + receive + send round-trip
[ ] Schemas + seed script (routes, checkpoints, stations)
[ ] Emergency triage fast-path (999 keyword) — build and test FIRST, it's the safety-critical piece
[ ] State machine skeleton + main menu

WEEK 2 — REPORT FLOW
[ ] GPS gate + text-fallback path
[ ] Route selection with proximity filtering (turf.js integration)
[ ] Plate/description capture + validation
[ ] Violation selection + high-risk category branching
[ ] Confirm & review screen

WEEK 3 — DISPATCH ENGINE (the hard part — budget extra time here)
[ ] isAheadOnRoute + direction disambiguation logic
[ ] Checkpoint selection algorithm + shift-hour filtering
[ ] Station fallback path
[ ] Repeat-offender tracking (vehicles collection)
[ ] Corroboration logic
[ ] Officer WhatsApp template alert + button-tap handling

WEEK 4 — INTEGRATION & POLISH
[ ] PoliceConnect API integration (both directions)
[ ] Status lookup flow for reporters
[ ] Full test checklist (section 16) green
[ ] Meta template messages submitted for approval (officer alert template — submit THIS WEEK, not later)
[ ] Docker deploy, pilot on 1-2 real corridors with real checkpoint staffing data
```

**Team:** 1 backend developer with geospatial/Turf.js familiarity (this is the one skill gap vs the NIRA build — budget for a short ramp-up or pair with someone who's done geo queries before) + coordination with UPF for checkpoint/officer roster data and PoliceConnect API access.

**Phase 2 (post-pilot):**
- SMS/USSD fallback channel for feature-phone users (sticker could show both a WhatsApp number and a USSD short code)
- Officer roster self-service (shift check-in/out via the bot itself)
- Heatmap dashboard of violation hotspots by route/time-of-day for Ministry of Works corridor planning
- Driver-facing appeal/response channel (currently one-sided)

---

*Prepared by Veritas Interactive Limited — GovTech & Digital Public Infrastructure. Integrates with [[policeconnect]] (PoliceConnect Uganda).*
