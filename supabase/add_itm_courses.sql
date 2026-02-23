-- =====================================================
-- INFORMATION TECHNOLOGY MULTIMEDIA MAJOR COURSES
-- Run this AFTER add_majors.sql
-- =====================================================

-- STEP 1: Add Information Technology Multimedia major
INSERT INTO majors (code, name, college) VALUES
    ('ITM', 'Information Technology Multimedia', 'College of Computing and Informatics')
ON CONFLICT (code) DO NOTHING;

-- STEP 2: Add/update courses (safe to re-run)
INSERT INTO courses (course_id, college_code, college_name, course_number, course_name) VALUES

-- Mathematics
('1440181', '1440', 'Department of Mathematics', '181', 'Statistics for Science'),
('1440182', '1440', 'Department of Mathematics', '182', 'Statistics for Science Lab'),

-- Business Information Systems
('1503431', '1503', 'Department of Business Information Systems', '431', 'Project Management'),

-- Computer Science - ITM specific
('1501114', '1501', 'Department of Computer Science', '114', 'Problem Solving'),
('1501214', '1501', 'Department of Computer Science', '214', 'Programming with Data Str.'),
('1501240', '1501', 'Department of Computer Science', '240', 'Graphic Design'),
('1501242', '1501', 'Department of Computer Science', '242', 'Interactive Multimedia'),
('1501244', '1501', 'Department of Computer Science', '244', 'Design and Authoring'),
('1501247', '1501', 'Department of Computer Science', '247', 'Multimedia Prog.and Design'),
('1501330', '1501', 'Department of Computer Science', '330', 'Introduction to Artif.Intelig.'),
('1501341', '1501', 'Department of Computer Science', '341', 'Web Programming'),
('1501342', '1501', 'Department of Computer Science', '342', '2d/3d Animation'),
('1501343', '1501', 'Department of Computer Science', '343', 'Interactive 3D Design'),
('1501361', '1501', 'Department of Computer Science', '361', 'Obj.Ori.Software Design & Imp'),
('1501393', '1501', 'Department of Computer Science', '393', 'Multimedia Junior Project'),
('1501396', '1501', 'Department of Computer Science', '396', 'CO-OP Summer Training'),
('1501444', '1501', 'Department of Computer Science', '444', 'Game Design and Development'),
('1501445', '1501', 'Department of Computer Science', '445', 'IT Application in E.Comm.'),
('1501465', '1501', 'Department of Computer Science', '465', 'Development of Web Applica.'),
('1501496', '1501', 'Department of Computer Science', '496', 'Multimedia Senior Project')

ON CONFLICT (course_id) DO UPDATE SET
    course_name = EXCLUDED.course_name;

-- STEP 3: Add major_courses relationships for Information Technology Multimedia
INSERT INTO major_courses (major_code, course_id) VALUES

-- Sharia & Islamic Studies (General Education)
('ITM', '0103103'),
('ITM', '0103104'),
('ITM', '0104100'),
('ITM', '0104130'),

-- Arts & Humanities
('ITM', '0201102'),
('ITM', '0201140'),
('ITM', '0202112'),
('ITM', '0202130'),
('ITM', '0202227'),
('ITM', '0203100'),
('ITM', '0203102'),
('ITM', '0203200'),
('ITM', '0204102'),
('ITM', '0204103'),
('ITM', '0206102'),
('ITM', '0206103'),

-- Business Administration
('ITM', '0302150'),
('ITM', '0302200'),
('ITM', '0308131'),
('ITM', '0308150'),

-- Sciences
('ITM', '0401142'),
('ITM', '0406102'),

-- Health Sciences
('ITM', '0503101'),
('ITM', '0505100'),
('ITM', '0505101'),
('ITM', '0507101'),

-- Law
('ITM', '0601109'),
('ITM', '0602246'),

-- Fine Arts & Design
('ITM', '0700100'),

-- Communication
('ITM', '0800107'),

-- Medicine
('ITM', '0900107'),

-- Education
('ITM', '1602100'),

-- Mathematics
('ITM', '1440131'),
('ITM', '1440181'),
('ITM', '1440182'),

-- Chemistry
('ITM', '1420101'),
('ITM', '1420102'),

-- Physics
('ITM', '1430110'),
('ITM', '1430116'),

-- Biology
('ITM', '1450101'),
('ITM', '1450107'),

-- Management
('ITM', '0302170'),

-- Business Information Systems
('ITM', '1503431'),

-- Computer Science / IT Core
('ITM', '1501100'),
('ITM', '1501114'),
('ITM', '1501116'),
('ITM', '1501214'),
('ITM', '1501240'),
('ITM', '1501242'),
('ITM', '1501244'),
('ITM', '1501247'),
('ITM', '1501250'),
('ITM', '1501263'),
('ITM', '1501319'),
('ITM', '1501330'),
('ITM', '1501341'),
('ITM', '1501342'),
('ITM', '1501343'),
('ITM', '1501344'),
('ITM', '1501352'),
('ITM', '1501361'),
('ITM', '1501365'),
('ITM', '1501366'),
('ITM', '1501370'),
('ITM', '1501393'),
('ITM', '1501396'),
('ITM', '1501433'),
('ITM', '1501440'),
('ITM', '1501441'),
('ITM', '1501442'),
('ITM', '1501443'),
('ITM', '1501444'),
('ITM', '1501445'),
('ITM', '1501452'),
('ITM', '1501454'),
('ITM', '1501455'),
('ITM', '1501457'),
('ITM', '1501458'),
('ITM', '1501459'),
('ITM', '1501465'),
('ITM', '1501490'),
('ITM', '1501491'),
('ITM', '1501492'),
('ITM', '1501496')

ON CONFLICT (major_code, course_id) DO NOTHING;
