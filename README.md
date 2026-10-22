# CSC SYNC Org

Standalone org application. Serve `index.html` from this repository root.
Shared JavaScript, styles and images are copied locally; no sibling repository is required.

## Local use

Run `npm run dev`, then open http://127.0.0.1:5173/.
Run `npm run check` to validate local imports and assets.
No dependency installation or build is required. Static hosting can publish the repository root.

## Database

Uses the existing shared CSC SYNC Supabase project and its public client key.
No private credentials are included. Access is enforced by database policies.

`database/migrations` contains the shared backend schema and migrations, copied into this repository for reference and setup. These files do not run automatically. The Admin and Org apps use the same database; apply each migration once to that shared project, not once per repository.

## Main-calendar date/time blocks

Apply `database/migrations/042_calendar_time_blocks.sql` once in the shared Supabase project before using the updated schedule forms.
An admin can open the main-calendar creation form, choose **Block date / time**, select a range (or **All day**), enter a reason and save.
The block creator can still create their own schedules in that range. Other admins and organizations cannot create or move schedules into it, including recurring occurrences.
Existing schedules are retained. Only the block creator can remove a block, using **Remove Block** in the schedule form for that date.
Blocks are visible only to signed-in dashboards. Times use Asia/Manila (UTC+8); touching endpoints are allowed.
The database checks writes and approvals, and schedule saves are atomic. Rejected drafts remain available for correction.


## Shared notices and blocked dates

Errors use the same dismissible notice card above all open dialogs. In Admin and Org calendars, timed blocks share schedule-strip lanes and all-day blocks shade the date light red. Selecting a blocked date or range shows a notice before opening the form; partially blocked single dates offer an available time. Existing schedules remain viewable, and the block creator retains the existing scheduling exemption. Database migration 042 still enforces conflicts, including recurring schedules. This UI update requires no additional SQL.
