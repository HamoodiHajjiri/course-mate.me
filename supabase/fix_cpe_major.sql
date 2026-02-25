-- =====================================================
-- FIX CE TO CPE MIGRATION SCRIPT
-- =====================================================

-- 1. Insert CPE if it doesn't exist
INSERT INTO majors (code, name, college, dept_electives_count) 
VALUES ('CPE', 'Computer Engineering', 'College of Engineering', 3)
ON CONFLICT (code) DO UPDATE SET dept_electives_count = 3;

-- 2. Update major_courses from CE to CPE
UPDATE major_courses SET major_code = 'CPE' WHERE major_code = 'CE';

-- 3. Update any profiles using CE
UPDATE profiles SET major = 'CPE' WHERE major = 'CE';

-- 4. Delete the old CE row (will fail if there are any remaining foreign key references we missed)
DELETE FROM majors WHERE code = 'CE';

-- 5. Re-apply the Major Elective categories just in case they were missed
UPDATE major_courses
SET category = 'Major Elective'
WHERE major_code = 'CPE'
  AND course_id IN (
    '0402330', '0402341', '0402353', '0402354', '0402415', '0402437',
    '0402442', '0402444', '0402446', '0402447', '0402448', '0402460',
    '0402461', '0402462', '0402463', '0402464', '0406320', '1501263',
    '1501366', '1501371', '1501440', '1502412', '1502414', '1502416',
    '1502424', '1502425', '1502430', '1502442', '1502443', '1502445',
    '1502449', '1502452', '1502460', '1502463', '1502465', '1502493'
  );
