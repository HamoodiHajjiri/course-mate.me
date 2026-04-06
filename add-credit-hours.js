/**
 * Generate SQL to add credit_hours to the courses table.
 * Only includes courses that exist in the database.
 *
 * Usage: node add-credit-hours.js <data_file.json>
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load env vars from .env.local
function loadEnv() {
    const envPath = path.join(__dirname, '.env.local');
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        process.env[key] = value;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const jsonFile = args[0];

    if (!jsonFile) {
        console.error('Usage: node add-credit-hours.js <data_file.json>');
        process.exit(1);
    }

    const jsonPath = path.join(__dirname, jsonFile);
    if (!fs.existsSync(jsonPath)) {
        console.error(`File not found: ${jsonPath}`);
        process.exit(1);
    }

    // Load env and connect to Supabase
    loadEnv();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials in .env.local');
        process.exit(1);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all course IDs from the database
    console.log('Fetching courses from database...');
    const { data: dbCourses, error } = await supabase
        .from('courses')
        .select('course_id');

    if (error) {
        console.error('Failed to fetch courses:', error.message);
        process.exit(1);
    }

    const DB_COURSE_IDS = new Set(dbCourses.map(c => c.course_id));
    console.log(`Found ${DB_COURSE_IDS.size} courses in database`);

    // Read JSON data
    console.log(`Reading ${jsonFile}...`);
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(raw);

    // Build map: course_id -> credit_hours (from JSON)
    const creditMap = new Map();

    const rawSections = [];
    if (Array.isArray(data)) {
        for (const term of data) {
            for (const subject of (term.subjects || [])) {
                for (const cls of (subject.classes || [])) {
                    rawSections.push(cls);
                }
            }
        }
    } else {
        for (const [, departments] of Object.entries(data)) {
            for (const [, clsList] of Object.entries(departments)) {
                for (const cls of clsList) {
                    rawSections.push(cls);
                }
            }
        }
    }

    for (const cls of rawSections) {
        const courseId = cls.subjectCourse;
        if (!courseId) continue;
        // Only include courses that exist in the database
        if (!DB_COURSE_IDS.has(courseId)) continue;

        const credits = cls.creditHours ?? cls.creditHourLow ?? 0;
        if (!creditMap.has(courseId) || (credits > 0 && creditMap.get(courseId) === 0)) {
            creditMap.set(courseId, credits);
        }
    }

    console.log(`Found credit hours for ${creditMap.size} courses (in DB)`);

    // Generate SQL
    const lines = [];
    lines.push(`-- =====================================================`);
    lines.push(`-- ADD CREDIT HOURS TO COURSES TABLE`);
    lines.push(`-- Generated from ${jsonFile}`);
    lines.push(`-- Generated on ${new Date().toISOString().split('T')[0]}`);
    lines.push(`-- Only includes courses present in the database`);
    lines.push(`-- =====================================================`);
    lines.push(``);
    lines.push(`-- Step 1: Add credit_hours column`);
    lines.push(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS credit_hours INTEGER DEFAULT 0;`);
    lines.push(``);
    lines.push(`-- Step 2: Update credit hours for each course`);
    lines.push(`UPDATE courses SET credit_hours = CASE course_id`);

    for (const [courseId, credits] of creditMap.entries()) {
        lines.push(`    WHEN '${courseId}' THEN ${credits}`);
    }

    lines.push(`    ELSE credit_hours`);
    lines.push(`END`);
    lines.push(`WHERE course_id IN (`);

    const ids = [...creditMap.keys()].map(id => `    '${id}'`);
    lines.push(ids.join(',\n'));
    lines.push(`);`);
    lines.push(``);
    lines.push(`-- Verify`);
    lines.push(`SELECT course_id, credit_hours FROM courses ORDER BY course_id LIMIT 20;`);

    const sql = lines.join('\n');
    const outputPath = path.join(__dirname, 'supabase', 'add_credit_hours.sql');
    fs.writeFileSync(outputPath, sql);

    console.log(`\nGenerated: supabase/add_credit_hours.sql`);
    console.log(`Run this SQL in your Supabase SQL Editor.`);
}

main().catch(console.error);
