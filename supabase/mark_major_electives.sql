-- =====================================================
-- MARK MAJOR ELECTIVES SCRIPT
-- Run this script to define which courses count as "Major Elective"
-- =====================================================

-- Example usage for adding electives for a major:
-- UPDATE major_courses 
-- SET category = 'Major Elective' 
-- WHERE major_code = 'MATH' 
--   AND course_id IN ('1440235', '1440312');

-- =====================================================
-- STEP 1: ADD CATEGORY COLUMN IF MISSING
-- =====================================================
ALTER TABLE major_courses 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Core';

CREATE INDEX IF NOT EXISTS idx_major_courses_category 
ON major_courses(category);

-- =====================================================
-- STEP 2: ADD DEPT_ELECTIVES_COUNT COLUMN TO MAJORS
-- =====================================================
ALTER TABLE majors 
ADD COLUMN IF NOT EXISTS dept_electives_count INTEGER DEFAULT 0;

-- =====================================================
-- STEP 3: Computer Science (CS) Electives
-- =====================================================
UPDATE majors SET dept_electives_count = 4 WHERE code = 'CS';

UPDATE major_courses
SET category = 'Major Elective'
WHERE major_code = 'CS'
  AND course_id IN (
    '1501341',
    '1501342',
    '1501343',
    '1501344',
    '1501365',
    '1501370',
    '1501433',
    '1501440',
    '1501441',
    '1501442',
    '1501443',
    '1501444',
    '1501445',
    '1501452',
    '1501455',
    '1501457',
    '1501458',
    '1501465',
    '1501490',
    '1501491',
    '1501492'
  );

-- =====================================================
-- STEP 4: Information Technology Multimedia (ITM) Electives
-- =====================================================
UPDATE majors SET dept_electives_count = 4 WHERE code = 'ITM';

UPDATE major_courses
SET category = 'Major Elective'
WHERE major_code = 'ITM'
  AND course_id IN (
    '1501319',
    '1501344',
    '1501352',
    '1501365',
    '1501366',
    '1501370',
    '1501433',
    '1501440',
    '1501441',
    '1501442',
    '1501452',
    '1501454',
    '1501455',
    '1501457',
    '1501458',
    '1501490',
    '1501491',
    '1501492'
  );

-- =====================================================
-- STEP 5: Computer Engineering (CPE) Electives
-- =====================================================
UPDATE majors SET dept_electives_count = 3 WHERE code = 'CPE';

UPDATE major_courses
SET category = 'Major Elective'
WHERE major_code = 'CPE'
  AND course_id IN (
    '0402330',
    '0402341',
    '0402353',
    '0402354',
    '0402415',
    '0402437',
    '0402442',
    '0402444',
    '0402446',
    '0402447',
    '0402448',
    '0402460',
    '0402461',
    '0402462',
    '0402463',
    '0402464',
    '0406320',
    '1501263',
    '1501366',
    '1501371',
    '1501440',
    '1502412',
    '1502414',
    '1502416',
    '1502424',
    '1502425',
    '1502430',
    '1502442', -- User provided missing course
    '1502443',
    '1502445',
    '1502449',
    '1502452',
    '1502460',
    '1502463',
    '1502465',
    '1502493'
  );

-- =====================================================
-- STEP 6: Cyber Security (CYBER) Electives
-- =====================================================
UPDATE majors SET dept_electives_count = 3 WHERE code = 'CYBER';

UPDATE major_courses
SET category = 'Major Elective'
WHERE major_code = 'CYBER'
  AND course_id IN (
    '1502442',
    '1502461',
    '1502470',
    '1502471',
    '1502473',
    '1502474'
  );
