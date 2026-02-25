-- Add ALL UoS Courses to existing database
-- Run this in Supabase SQL Editor

INSERT INTO courses (course_id, college_code, college_name, course_number, course_name) VALUES
-- Sharia & Islamic Studies
('0103103', '0103', 'College of Sharia & Islamic Studies', '103', 'Islamic System'),
('0103104', '0103', 'College of Sharia & Islamic Studies', '104', 'Prof. Ethics in Islamic Sharia'),
('0104100', '0104', 'College of Sharia & Islamic Studies', '100', 'Islamic Culture'),
('0104130', '0104', 'College of Sharia & Islamic Studies', '130', 'Analytical Biog of the Prophet'),

-- Arts & Humanities
('0201102', '0201', 'College of Arts & Humanities', '102', 'Arabic Language'),
('0201140', '0201', 'College of Arts & Humanities', '140', 'Intro. to Arabic Literature'),
('0202112', '0202', 'College of Arts & Humanities', '112', 'English for Academic Purposes'),
('0202130', '0202', 'College of Arts & Humanities', '130', 'French Language'),
('0202227', '0202', 'College of Arts & Humanities', '227', 'Critical Reading and Writing'),
('0203100', '0203', 'College of Arts & Humanities', '100', 'Islamic Civilization'),
('0203102', '0203', 'College of Arts & Humanities', '102', 'History of the Arabian Gulf'),
('0203200', '0203', 'College of Arts & Humanities', '200', 'Hist of Sciences among Muslims'),
('0204102', '0204', 'College of Arts & Humanities', '102', 'UAE Society'),
('0204103', '0204', 'College of Arts & Humanities', '103', 'Principles of Sign Language'),
('0206102', '0206', 'College of Arts & Humanities', '102', 'Fundamentals/Islamic Education'),
('0206103', '0206', 'College of Arts & Humanities', '103', 'Introduction to Psychology'),

-- Business Administration
('0302150', '0302', 'College of Business Administration', '150', 'Intro.to Bus for Non-Bus.'),
('0302200', '0302', 'College of Business Administration', '200', 'Fund. of Innovation & Entrep.'),
('0308131', '0308', 'College of Business Administration', '131', 'Personal Finance'),
('0308150', '0308', 'College of Business Administration', '150', 'Intro to Economics(Non-B)'),

-- Sciences
('0401142', '0401', 'College of Sciences', '142', 'Man and The Environment'),
('0406102', '0406', 'College of Sciences', '102', 'Introduction to Sustainability'),

-- Health Sciences
('0503101', '0503', 'College of Health Sciences', '101', 'Health and Safety'),
('0505100', '0505', 'College of Health Sciences', '100', 'Understanding Disabilities'),
('0505101', '0505', 'College of Health Sciences', '101', 'Fitness and Wellness'),
('0507101', '0507', 'College of Health Sciences', '101', 'Health Awareness and Nutrition'),

-- Law
('0601109', '0601', 'College of Law', '109', 'Legal Culture'),
('0602246', '0602', 'College of Law', '246', 'Human Rights in Islam'),

-- Fine Arts & Design
('0700100', '0700', 'College of Fine Arts & Design', '100', 'Intro to Islamic Art & Design'),

-- Communication
('0800107', '0800', 'College of Communication', '107', 'Media in Modern Societies'),

-- Medicine
('0900107', '0900', 'College of Medicine', '107', 'History of Medical and H.Sc.'),

-- Chemistry
('1420101', '1420', 'Department of Chemistry', '101', 'General Chemistry (1)'),
('1420102', '1420', 'Department of Chemistry', '102', 'General Chemistry (1) Lab'),

-- Physics
('1430101', '1430', 'Department of Physics', '101', 'Astro & Space Sciences'),
('1430110', '1430', 'Department of Physics', '110', 'Physics I for Sciences'),
('1430116', '1430', 'Department of Physics', '116', 'Physics 1 Lab'),

-- Mathematics
('1440131', '1440', 'Department of Mathematics', '131', 'Calculus I'),
('1440132', '1440', 'Department of Mathematics', '132', 'Calculus II'),
('1440211', '1440', 'Department of Mathematics', '211', 'Linear Algebra I'),
('1440281', '1440', 'Department of Mathematics', '281', 'Intro Probability & Statistics'),

-- Biology
('1450100', '1450', 'Department of Biology', '100', 'Biology and Society'),

-- Computer Science / IT
('1501100', '1501', 'Department of Computer Science', '100', 'Introduction to IT(English)'),
('1501116', '1501', 'Department of Computer Science', '116', 'Programming I'),
('1501211', '1501', 'Department of Computer Science', '211', 'Programming II'),
('1501215', '1501', 'Department of Computer Science', '215', 'Data Structures'),
('1501246', '1501', 'Department of Computer Science', '246', 'Obj. Oriented Design with Java'),
('1501250', '1501', 'Department of Computer Science', '250', 'Networking Fundamentals'),
('1501252', '1501', 'Department of Computer Science', '252', 'Comp.Org.and Assembly Language'),
('1501263', '1501', 'Department of Computer Science', '263', 'Intro. to Database Manag. Sys.'),
('1501279', '1501', 'Department of Computer Science', '279', 'Discrete Structures'),
('1501319', '1501', 'Department of Computer Science', '319', 'Prog. Languages and Paradigms'),
('1501322', '1501', 'Department of Computer Science', '322', 'Prof.So.and Ethical Issu.in CS'),
('1501330', '1501', 'Department of Computer Science', '330', 'Introduction to Artif.Intelig.'),
('1501341', '1501', 'Department of Computer Science', '341', 'Web Programming'),
('1501342', '1501', 'Department of Computer Science', '342', '2D/3D Computer Animation'),
('1501343', '1501', 'Department of Computer Science', '343', 'Interactive 3D Design'),
('1501344', '1501', 'Department of Computer Science', '344', '2D Character Design'),
('1501352', '1501', 'Department of Computer Science', '352', 'Operating Systems'),
('1501365', '1501', 'Department of Computer Science', '365', 'Advanced Database System'),
('1501366', '1501', 'Department of Computer Science', '366', 'Software Engineering'),
('1501370', '1501', 'Department of Computer Science', '370', 'Numerical Methods'),
('1501371', '1501', 'Department of Computer Science', '371', 'Design&Analysis of Algorithms'),
('1501372', '1501', 'Department of Computer Science', '372', 'Formal Lang.and Automa. theory'),
('1501394', '1501', 'Department of Computer Science', '394', 'Junior Project in CS'),
('1501397', '1501', 'Department of Computer Science', '397', 'CO-OP Summer Training'),
('1501433', '1501', 'Department of Computer Science', '433', 'Intro.to Com.Visi.and Img.Proc'),
('1501440', '1501', 'Department of Computer Science', '440', 'Intro.to Computer Graphics'),
('1501441', '1501', 'Department of Computer Science', '441', 'Multimedia Technology'),
('1501442', '1501', 'Department of Computer Science', '442', '3D Character Anim. & Visual FX'),
('1501443', '1501', 'Department of Computer Science', '443', 'Human Computer Interaction'),
('1501444', '1501', 'Department of Computer Science', '444', 'Game Design and Development'),
('1501445', '1501', 'Department of Computer Science', '445', 'IT Application in E-Comm.'),
('1501452', '1501', 'Department of Computer Science', '452', 'Introduction to IoT Systems'),
('1501454', '1501', 'Department of Computer Science', '454', 'Cloud Computing'),
('1501455', '1501', 'Department of Computer Science', '455', 'Database Security'),
('1501457', '1501', 'Department of Computer Science', '457', 'Data Hiding'),
('1501458', '1501', 'Department of Computer Science', '458', 'Mobile Application & Design'),
('1501459', '1501', 'Department of Computer Science', '459', 'Information Security'),
('1501465', '1501', 'Department of Computer Science', '465', 'Development of Web Applica.'),
('1501490', '1501', 'Department of Computer Science', '490', 'Topics in Computer Science I'),
('1501491', '1501', 'Department of Computer Science', '491', 'Topics in Computer Science II'),
('1501492', '1501', 'Department of Computer Science', '492', 'Special Topics in IT'),
('1501494', '1501', 'Department of Computer Science', '494', 'Senior Project in CS'),

-- Computer Engineering
('1502201', '1502', 'Department of Computer Engineering', '201', 'Digital Logic Design'),
('1502202', '1502', 'Department of Computer Engineering', '202', 'Digital Logic Design Lab.'),
('1502442', '1502', 'Department of Computer Engineering', '442', 'Network Programming'),
('1502461', '1502', 'Department of Computer Engineering', '461', 'S. T. in Cyber Security'),
('1502470', '1502', 'Department of Computer Engineering', '470', 'Data Confid. and Cloud Secur.'),
('1502471', '1502', 'Department of Computer Engineering', '471', 'Internet and Web Security'),
('1502473', '1502', 'Department of Computer Engineering', '473', 'Ethical Hacking'),
('1502474', '1502', 'Department of Computer Engineering', '474', 'Data Hiding and Staganography'),

-- Education
('1602100', '1602', 'College of Education', '100', 'Smart & Effec. Learning Skills')

ON CONFLICT (course_id) DO UPDATE SET
    course_name = EXCLUDED.course_name;
