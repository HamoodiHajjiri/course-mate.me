'use client';

import { createContext, Fragment, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SearchIcon } from '@/components/Icons';
import styles from '../admin.module.css';
import CourseEditModal from './CourseEditModal';

const Ctx = createContext(null);

function CoursesProvider({ children }) {
    const [courses, setCourses] = useState([]);
    const [search, setSearch] = useState('');
    const [major, setMajor] = useState('');
    const [category, setCategory] = useState('');
    const [majors, setMajors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [editingCourse, setEditingCourse] = useState(null);
    const [creating, setCreating] = useState(false);
    const supabase = createClient();

    const load = useCallback(async (overrides = {}) => {
        const q = overrides.search !== undefined ? overrides.search : search;
        const m = overrides.major !== undefined ? overrides.major : major;
        const cat = overrides.category !== undefined ? overrides.category : category;
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ detail: '1' });
            if (q) params.set('q', q);
            if (m) params.set('major', m);
            if (cat) params.set('category', cat);
            const res = await fetch(`/api/admin/courses?${params}`);
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setCourses(data.courses || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [search, major, category]);

    useEffect(() => {
        (async () => {
            const { data } = await supabase.from('majors').select('code, name').order('name');
            setMajors(data || []);
        })();
        load({ search: '', major: '', category: '' });
        // eslint-disable-next-line
    }, []);

    const setMajorAndLoad = (v) => { setMajor(v); setExpandedId(null); load({ major: v }); };
    const setCategoryAndLoad = (v) => { setCategory(v); setExpandedId(null); load({ category: v }); };
    const submitSearch = (e) => { e?.preventDefault(); setExpandedId(null); load({ search }); };
    const reset = () => { setSearch(''); setMajor(''); setCategory(''); setExpandedId(null); load({ search: '', major: '', category: '' }); };
    const toggleExpand = (id) => setExpandedId(prev => (prev === id ? null : id));
    const reload = () => load({});

    return (
        <Ctx.Provider value={{
            courses, search, setSearch, major, category, majors, loading, error,
            expandedId, toggleExpand, setMajorAndLoad, setCategoryAndLoad, submitSearch, reset,
            editingCourse, setEditingCourse, creating, setCreating, reload,
        }}>
            {children}
        </Ctx.Provider>
    );
}

const CATEGORY_FILTERS = [
    { value: '', label: 'Every type' },
    { value: 'Core', label: 'Core' },
    { value: 'Major Elective', label: 'Major elective' },
    { value: 'Support Elective', label: 'Support elective' },
    { value: 'University Elective', label: 'University elective' },
];

function CoursesSidebar() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { major, category, majors, setMajorAndLoad, setCategoryAndLoad, reset, setCreating } = ctx;

    return (
        <>
            <div className={styles.sidebarCard}>
                <p className={styles.sectionTitle}>Courses</p>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`} onClick={() => setCreating(true)}>
                    New course
                </button>
            </div>

            <div className={styles.sidebarCard}>
                <p className={styles.sectionTitle}>Type</p>
                <div className={styles.navList}>
                    {CATEGORY_FILTERS.map(c => (
                        <button
                            key={c.value || 'all'}
                            type="button"
                            className={`${styles.navBtn} ${category === c.value ? styles.navBtnActive : ''}`}
                            onClick={() => setCategoryAndLoad(c.value)}
                        >
                            <span>{c.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.sidebarCard}>
                <p className={styles.sectionTitle}>Major</p>
                <div className={`${styles.navList} ${styles.scrollList}`}>
                    <button
                        type="button"
                        className={`${styles.navBtn} ${major === '' ? styles.navBtnActive : ''}`}
                        onClick={() => setMajorAndLoad('')}
                    >
                        <span>Every major</span>
                    </button>
                    {majors.map(m => (
                        <button
                            key={m.code}
                            type="button"
                            className={`${styles.navBtn} ${major === m.code ? styles.navBtnActive : ''}`}
                            onClick={() => setMajorAndLoad(m.code)}
                            title={m.name}
                        >
                            <span>{m.name}</span>
                            <span className={styles.navCount}>{m.code}</span>
                        </button>
                    ))}
                </div>
                <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnFull}`} onClick={reset}>
                    Clear the filters
                </button>
            </div>
        </>
    );
}

function CourseDetail({ course }) {
    return (
        <div className={styles.detail}>
            <dl className={styles.detailFacts}>
                <div><dt>College</dt><dd>{course.college_name || <span className={styles.cellMuted}>not set</span>}</dd></div>
                <div><dt>Credits</dt><dd className={styles.mono}>{course.credit_hours ?? '—'}</dd></div>
                {course.university_elective_basket && <div><dt>Elective basket</dt><dd>{course.university_elective_basket}</dd></div>}
            </dl>

            <div className={styles.detailCols}>
                <section>
                    <p className={styles.sectionLabel}>Majors · {course.majors.length}</p>
                    {course.majors.length === 0 ? (
                        <p className={styles.previewMuted}>In no major’s plan.</p>
                    ) : (
                        <ul className={styles.plainList}>
                            {course.majors.map(m => (
                                <li key={m.code}>{m.name}{m.category && <span className={styles.rowMeta}> · {m.category}</span>}</li>
                            ))}
                        </ul>
                    )}
                </section>
                <section>
                    <p className={styles.sectionLabel}>Instructors · {course.instructors.length}</p>
                    {course.instructors.length === 0 ? (
                        <p className={styles.previewMuted}>None listed.</p>
                    ) : (
                        <ul className={styles.plainList}>
                            {course.instructors.map((ins, i) => <li key={i}>{ins}</li>)}
                        </ul>
                    )}
                </section>
            </div>

            <section>
                <p className={styles.sectionLabel}>Sections · {course.section_count}</p>
                {course.section_count === 0 ? (
                    <p className={styles.previewMuted}>None offered.</p>
                ) : (
                    <table className={styles.table}>
                        <thead>
                            <tr><th>Section</th><th>CRN</th><th>Term</th><th>When</th><th>Instructor</th><th>Campus</th></tr>
                        </thead>
                        <tbody>
                            {course.sections.map((s, i) => (
                                <tr key={i}>
                                    <td className={styles.mono}>§{s.section_num}</td>
                                    <td className={styles.mono}>{s.crn || '—'}</td>
                                    <td className={styles.mono}>{s.term_code || '—'}</td>
                                    <td>{s.class_time || <span className={styles.cellMuted}>no set time</span>}</td>
                                    <td>{s.instructor || <span className={styles.cellMuted}>none</span>}</td>
                                    <td>{s.campus || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}

function CoursesMain() {
    const ctx = useContext(Ctx);
    if (!ctx) return null;
    const { courses, search, setSearch, loading, error, expandedId, toggleExpand, submitSearch, majors, editingCourse, setEditingCourse, creating, setCreating, reload } = ctx;

    return (
        <>
            <form onSubmit={submitSearch} className={styles.toolbar}>
                <div className={`${styles.searchWrapper} ${styles.searchGrow}`}>
                    <span className={styles.searchIcon}><SearchIcon /></span>
                    <input
                        type="search"
                        className={styles.searchInput}
                        placeholder="Course code or name, then Enter"
                        aria-label="Search courses"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </form>

            {error && <div className={styles.error}>{error}</div>}
            {loading ? (
                <div className={styles.loading}><div className={styles.spinner} />Reading courses…</div>
            ) : courses.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyTitle}>No courses match.</div>
                    <span>Try another search, type or major.</span>
                </div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Course</th>
                                <th className={styles.num}>Majors</th>
                                <th className={styles.num}>Sections</th>
                                <th className={styles.num}>Instructors</th>
                                <th className={styles.cellActions}><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {courses.map(c => {
                                const expanded = expandedId === c.course_id;
                                return (
                                    <Fragment key={c.course_id}>
                                        <tr className={expanded ? styles.rowOpen : ''}>
                                            <td>
                                                <button type="button" className={styles.expand} onClick={() => toggleExpand(c.course_id)} aria-expanded={expanded}>
                                                    <span className={styles.expandMark} aria-hidden="true">{expanded ? '−' : '+'}</span>
                                                    <span className={styles.mono}>{c.course_id}</span>
                                                    <span className={styles.expandName}>{c.course_name}</span>
                                                </button>
                                            </td>
                                            <td className={`${styles.num} ${styles.mono}`}>{c.majors.length}</td>
                                            <td className={`${styles.num} ${styles.mono} ${c.section_count === 0 ? styles.cellMuted : ''}`}>{c.section_count}</td>
                                            <td className={`${styles.num} ${styles.mono}`}>{c.instructors.length}</td>
                                            <td className={styles.cellActions}>
                                                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditingCourse(c)}>Edit</button>
                                            </td>
                                        </tr>
                                        {expanded && (
                                            <tr className={styles.detailRow}>
                                                <td colSpan={5}><CourseDetail course={c} /></td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className={styles.tableFoot}>{courses.length} {courses.length === 1 ? 'course' : 'courses'}</p>
                </div>
            )}

            {editingCourse && (
                <CourseEditModal
                    course={editingCourse}
                    majors={majors}
                    onClose={() => setEditingCourse(null)}
                    onSaved={reload}
                />
            )}

            {creating && (
                <CourseEditModal
                    course={null}
                    majors={majors}
                    onClose={() => setCreating(false)}
                    onSaved={reload}
                />
            )}
        </>
    );
}

const coursesTab = { Provider: CoursesProvider, Sidebar: CoursesSidebar, Main: CoursesMain };
export default coursesTab;
