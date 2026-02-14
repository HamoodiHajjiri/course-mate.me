---
description: How to perform a semester rollover when new section data is available
---

# Semester Rollover Workflow

When a new semester starts and you have a new Banner JSON data file (e.g., `data_202610.json`):

## Prerequisites
- A new JSON data file in the same format as `data_202520.json`, placed in the project root
- The `courses` table in Supabase must be up to date (the script fetches course IDs from it)

## Steps

### Method 1: Direct Execution (Faster)
// turbo
1. Add your `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (Get it from Supabase Dashboard → Settings → API).

2. Run the script with the `--run` flag:

**Start of semester (rollover):**
```
node extract-sections.js data_XXXXXX.json --rollover --run
```

**Mid-semester (sync):**
```
node extract-sections.js data_XXXXXX.json --sync --run
```
This connects to Supabase and updates the database directly. No manual SQL steps needed.

### Method 2: Generate SQL (Manual)
If you prefer to review the SQL before running it:

// turbo
1. Run without the `--run` flag:
```
node extract-sections.js data_XXXXXX.json --sync
```
This generates `supabase/semester_sync_XXXXXX.sql`.

2. **Review** the generated SQL.

3. **Run** it in Supabase Dashboard → SQL Editor.

### Verifying
Regardless of method:
1. Check `sections` table count in Supabase
2. Spot-check a few sections for correct campus/time

5. Commit and push:
```
git add -A
git commit -m "chore: semester update XXXXXX"
git push origin main
```

## What the script does
- Connects to Supabase and fetches all course IDs from the `courses` table
- Reads the JSON file and detects the term code automatically
- Extracts only sections for courses that exist in the database
- Maps campus descriptions to `main`/`men`/`women` and filters out non-UOS campuses
- Generates a transactional SQL script that clears matches → posts → sections → inserts new sections

## Adding new majors
If a new major needs to be supported before rollover:
1. Add the major to the `majors` table
2. Add course entries to the `courses` table
3. Add `major_courses` relationships
4. Run the rollover as normal — the script automatically picks up all courses in the database
