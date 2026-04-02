<div align="center">
  <img src="public/coursemate.svg" alt="CourseMate" width="100%" />
  <p><em>The intelligent web application for seamless course registration and scheduling at the University of Sharjah.</em></p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  </p>

  <p>
    <img src="https://img.shields.io/github/contributors/Karam-Kreidli/CourseMate?logo=github&color=blue" alt="Contributors" />
    <img src="https://img.shields.io/github/last-commit/Karam-Kreidli/CourseMate?logo=github&color=green" alt="Last Commit" />
    <img src="https://img.shields.io/github/repo-size/Karam-Kreidli/CourseMate?logo=github&color=orange" alt="Repo Size" />
    <img src="https://img.shields.io/github/license/Karam-Kreidli/CourseMate?logo=github&color=yellow" alt="License" />
  </p>
</div>

---

## 🛑 The Problem

During registration periods, getting into the right course sections with preferred timings or instructors can be incredibly difficult. Students often resort to constantly refreshing the registration portal hoping a seat opens up, or they turn to social media groups trying to arrange manual "swaps" with other students. This process is highly uncoordinated, relies heavily on luck, and requires tedious manual communication that often falls through at the last minute.

## 💡 The Idea

**CourseMate** acts as an intelligent intermediary. Instead of hunting through WhatsApp groups or hoping for a random drop, students can use CourseMate to declare exactly what course section they *have*, and what section they *want*. The platform handles the rest securely and intelligently.

---

## 🚀 How It Solves These Problems

CourseMate streamlines the entire process through several key mechanisms:

*   **Smart Swapping:** If Student A has Section 1 but wants Section 2, and Student B has Section 2 but wants Section 1, CourseMate's smart matching algorithm instantly connects them.
*   **Giveaways & Requests:** If a student is simply dropping a course and doesn't need a swap, they can list it as a **Giveaway** for anyone who needs it. Conversely, students can post **Requests** for sections they desperately need.
*   **Instant Notifications:** Students no longer need to constantly monitor the app. They can receive instant notifications the moment a relevant swap or giveaway becomes available.
*   **Tailored Academic Experience:** The platform natively understands the University of Sharjah's structure. By capturing a student's gender and major, it automatically filters out irrelevant sections.
*   **Visual Schedule Builder:** To prevent overlapping swaps, students can visually master and preview their potential schedule right within the app before finalizing changes.

---

## 🧭 Platform Architecture & Routing

Every single aspect of the app is engineered to funnel students toward successful, stress-free schedules.

### 1. `/` (Home & Feed)
This is the central nervous system of CourseMate. The feed natively applies intelligent filtering to **only** show posts (swaps, giveaways, and requests) that match your declared major and gender (preventing campus overlap). 
*   **Capabilities:** Users can instantly search this curated feed by Course CRN, Course Name, or Course ID to hunt for sections they need.

### 2. `/post` (Creation Hub)
The dashboard where students officially register a "Have" or "Want" section. 
*   **Logic:** It dynamically parses the user's major to only allow submitting posts for relevant courses. It enforces constraints—preventing users from exceeding the 5 active post maximum, keeping them from submitting identical swap requests, and ensuring no bad data permeates the system.

### 3. `/matches` (Activity & Transaction Dashboard)
When the system finds a 1-to-1 swap match or a giveaway claim is submitted, an entity here is created in a **Pending Match** state. 
*   **The 24-Hour Timer:** Matches are securely held for exactly 24 hours. 
*   **Dual Acceptance Logic:** Only when *both* independent parties click "Accept" inside the 24-hour window will the match finalize and exchange contact details. If a match is declined or expires, the original post is **auto-requeued** and placed back on the market instantly.

### 4. `/schedule` (Visual Builder)
An advanced graphical permutations tool natively built into the platform. 
*   **Complexity Management:** It dynamically renders lectures, linked labs, and tutorial combinations so they never overlap.
*   **Preferences:** Students can customize gap minimization rules, instruct the system to pack classes into compact days, strictly avoid Arabic or English designated classes (e.g., stopping section "01A" if English is preferred), and cleanly ingest "Major Elective" baskets flawlessly.

### 5. `/profile` (User Settings)
The core setup and onboarding view that forcefully captures necessary metadata required to feed the logic loops for the rest of the application. 

### 6. `/auth` (Authentication)
Dedicated, fully secure authentication proxy built seamlessly onto Supabase's OAuth/OTP ecosystem. It guards all internal APIs to protect student data.

---

## 🔐 Data Collection, Storage, and Privacy Philosophy

CourseMate handles sensitive data carefully. Here is exactly **why** we collect what we do, and **how** it is managed:

| Data Point | Rationale For Collection | Storage & Privacy Guarantees |
| :--- | :--- | :--- |
| **Gender** | UoS strictly segregates campuses (e.g., `Main/Men` vs `Main/Women`). Without knowing a user's gender, a male student could inadvertently accept a swap for a female-designated course section, which is physically impossible to attend. | Stored encrypted in the DB. Used entirely in the background as a route-filter constraint. |
| **Major** | Prevents the system from showing Engineering swaps to a Med student. It's the central pillar that enables the `/schedule` route to dynamically look up a user's applicable Department Electives. | Retained in profiles and queried passively via the UI. |
| **Phone Number** | Crucial for the final step of a swap coordination where users sync up on WhatsApp to click "Drop" in the actual university portal at the exact same millisecond. | **Strictly Hidden.** We do *not* display phone numbers publicly. A user's phone number is securely locked behind our `/matches` Row Level Security (RLS) system and is **ONLY** unveiled specifically to Party B once **both** Party A and Party B have actively hit "Accept" on a pending match. |
| **Student ID** | Defends the platform against spam. Guarantees that active accounts are verifiable, enrolled University of Sharjah students. | Visible internally for trust & accountability metrics. |
| **Full Name** | Personalizes the interactions, injecting a human element into automated notifications (e.g., *"Karam accepted your swap request!"*). | Publicly associated strictly with your respective swaps/giveaways. |

---

## 🛠️ Technical Stack Overview

*   **Frontend Ecosystem:** Next.js (App Router), React 19, Vanilla CSS Modules (to maintain highly isolated, premium and modular styling across dynamic pages).
*   **Backend & DB Layer:** Supabase (PostgreSQL implementation layered with extremely tight Row-Level-Security rules locking down the APIs).
*   **Automations & Crons:** Built-in Background Tasks (`/api/expire-posts`, `/api/expire-matches`) executing securely to gracefully strip away old, stale requests so the active feed remains permanently healthy. 

---

## 👩‍💻 Authors & Credits

*   **Karam Kreidli** - [karam@course-mate.me](mailto:karam@course-mate.me)
*   **Mohammad Hajjiri** - [hajjiri@course-mate.me](mailto:hajjiri@course-mate.me)

> **Data Source:** Our platform relies on robust real-time course metadata retrieved from the [UoS Curriculum Scraper](https://github.com/hamoodihajjiri/uos-curriculum-scraper/).

---

## 📜 Copyright and License

This project is open-source and licensed under the **MIT License**.