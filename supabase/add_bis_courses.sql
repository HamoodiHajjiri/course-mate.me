-- =====================================================
-- BUSINESS INFORMATION SYSTEMS (BIS) MAJOR COURSES
-- Run this AFTER add_majors.sql
-- =====================================================

-- STEP 1: Add Business Information Systems major
INSERT INTO majors (code, name, college) VALUES
    ('BIS', 'Business Information Systems', 'College of Computing and Informatics')
ON CONFLICT (code) DO NOTHING;

-- STEP 2: Add missing courses that don't exist yet
INSERT INTO courses (course_id, college_code, college_name, course_number, course_name) VALUES

-- Department of Business Information Systems (1503)
('1503130', '1503', 'Department of Business Information Systems', '130', 'Introduction to BIS'),
('1503211', '1503', 'Department of Business Information Systems', '211', 'Business Analytics'),
('1503228', '1503', 'Department of Business Information Systems', '228', 'E-Business'),
('1503230', '1503', 'Department of Business Information Systems', '230', 'Database Management'),
('1503231', '1503', 'Department of Business Information Systems', '231', 'Business Programming'),
('1503330', '1503', 'Department of Business Information Systems', '330', 'Systems Analysis and Design'),
('1503332', '1503', 'Department of Business Information Systems', '332', 'Business Data Telecom & Networks'),
('1503333', '1503', 'Department of Business Information Systems', '333', 'Information Security'),
('1503334', '1503', 'Department of Business Information Systems', '334', 'Advanced Business Programming'),
('1503347', '1503', 'Department of Business Information Systems', '347', 'Customer Relationship Mng. Sys'),
('1503430', '1503', 'Department of Business Information Systems', '430', 'Big Data & Business Intelligence'),
('1503431', '1503', 'Department of Business Information Systems', '431', 'Project Management'),
('1503437', '1503', 'Department of Business Information Systems', '437', 'Internship in BIS'),
('1503439', '1503', 'Department of Business Information Systems', '439', 'Project in BIS'),
('1503441', '1503', 'Department of Business Information Systems', '441', 'Enterprise Systems'),
('1503446', '1503', 'Department of Business Information Systems', '446', 'Decision Support Systems'),

-- Computer Engineering (1502) - for BIS (Intro to AI)
('1502133', '1502', 'Department of Computer Engineering', '133', 'Introduction to AI'),

-- Accounting (0301)
('0301120', '0301', 'Department of Accounting', '120', 'Financial Accounting'),
('0301211', '0301', 'Department of Accounting', '211', 'Managerial Accounting'),
('0301327', '0301', 'Department of Accounting', '327', 'Taxation and Zakat'),
('0301425', '0301', 'Department of Accounting', '425', 'Financial Statement Analysis'),

-- Management (0302)
('0302160', '0302', 'Department of Management', '160', 'Principles of Management'),
('0302170', '0302', 'Department of Management', '170', 'Principles of Marketing'),
('0302250', '0302', 'Department of Management', '250', 'Legal Environment of Business'),
('0302254', '0302', 'Department of Management', '254', 'Business Communication'),
('0302262', '0302', 'Department of Management', '262', 'Organizational Behavior'),
('0302350', '0302', 'Department of Management', '350', 'Ethics and Islamic Val in Bus'),
('0302361', '0302', 'Department of Management', '361', 'Operat. and Supply Chain Mgt.'),
('0302383', '0302', 'Department of Management', '383', 'Business and Government'),
('0302461', '0302', 'Department of Management', '461', 'Research Methods'),
('0302467', '0302', 'Department of Management', '467', 'Strategic Management'),

-- Finance and Economics (0308)
('0308151', '0308', 'Department of Finance and Economics', '151', 'Principles of Microeconomics'),
('0308230', '0308', 'Department of Finance and Economics', '230', 'Financial Management'),
('0308252', '0308', 'Department of Finance and Economics', '252', 'Principles of Macroeconomics'),
('0308334', '0308', 'Department of Finance and Economics', '334', 'Real Estate Finance'),
('0308450', '0308', 'Department of Finance and Economics', '450', 'Money and Banking'),

-- Mathematics (1440)
('1440100', '1440', 'Department of Mathematics', '100', 'Mathematics for Business'),
('1440264', '1440', 'Department of Mathematics', '264', 'Business Statistics')

ON CONFLICT (course_id) DO UPDATE SET
    course_name = EXCLUDED.course_name;

-- STEP 3: Add major_courses relationships for Business Information Systems
INSERT INTO major_courses (major_code, course_id) VALUES

-- General Education (Sharia & Islamic Studies)
('BIS', '0103103'),
('BIS', '0103104'),
('BIS', '0104100'),
('BIS', '0104130'),

-- Arts & Humanities
('BIS', '0201102'),
('BIS', '0201140'),
('BIS', '0202112'),
('BIS', '0202130'),
('BIS', '0202227'),
('BIS', '0203100'),
('BIS', '0203102'),
('BIS', '0203200'),
('BIS', '0204102'),
('BIS', '0204103'),
('BIS', '0206102'),
('BIS', '0206103'),

-- Business (General)
('BIS', '0302150'), -- Intro to Bus for Non-Bus (Listed in image, though odd for a business-related major, sticking to image)
('BIS', '0302200'), -- Fund. of Innovation & Entrep.
('BIS', '0308131'), -- Personal Finance
('BIS', '0308150'), -- Intro to Economics(Non-B)

-- Sciences
('BIS', '0401142'),
('BIS', '0406102'),

-- Health Sciences
('BIS', '0503101'),
('BIS', '0505100'),
('BIS', '0505101'),
('BIS', '0507101'),

-- Law
('BIS', '0601109'),
('BIS', '0602246'),

-- Fine Arts & Design
('BIS', '0700100'),

-- Communication
('BIS', '0800107'),

-- Medicine
('BIS', '0900107'),

-- Education
('BIS', '1602100'),

-- Core BIS Courses
('BIS', '1503130'),
('BIS', '1503211'),
('BIS', '1503228'),
('BIS', '1503230'),
('BIS', '1503231'),
('BIS', '1503330'),
('BIS', '1503332'),
('BIS', '1503333'),
('BIS', '1503334'),
('BIS', '1503347'),
('BIS', '1503430'),
('BIS', '1503431'),
('BIS', '1503437'),
('BIS', '1503439'),
('BIS', '1503441'),
('BIS', '1503446'),

-- Other Major Requirements
('BIS', '1502133'), -- Intro to AI
('BIS', '0301120'),
('BIS', '0301211'),
('BIS', '0301327'),
('BIS', '0301425'),
('BIS', '0302160'),
('BIS', '0302170'),
('BIS', '0302250'),
('BIS', '0302254'),
('BIS', '0302262'),
('BIS', '0302350'),
('BIS', '0302361'),
('BIS', '0302383'),
('BIS', '0302461'),
('BIS', '0302467'),
('BIS', '0308151'),
('BIS', '0308230'),
('BIS', '0308252'),
('BIS', '0308334'),
('BIS', '0308450'),
('BIS', '1440100'),
('BIS', '1440264')

ON CONFLICT (major_code, course_id) DO NOTHING;
