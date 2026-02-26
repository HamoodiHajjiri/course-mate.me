# CourseMate

CourseMate (formerly Course Swap) is a mobile-first web application designed specifically for University of Sharjah (UoS) students. It facilitates the seamless swapping of course sections and the announcement of section giveaways. 

## Features

* **Authentication & Profiles**: Secure user registration and login using Supabase authentication, complete with personalized user profiles.
* **Section Swapping & Giveaways**: Create posts to swap a specific course section you have for one you want, or offer a section you no longer need.
* **Smart Matching Algorithm**: Automatically finds and alerts users of compatible swap matches.
* **Real-Time Search & Filtering**: Fast search functionality with advanced filtering, including campus-specific filters (Main, Men's, Women's) and gender-based access.
* **Schedule Builder**: Visually plan and manage your academic timetable within the app.
* **Watchlist**: Keep track of desired sections and get notified when they become available.
* **Notifications**: Instant in-app alerts and reliable email notifications (powered by Resend) for successful matches.

## Tech Stack

* **Framework**: [Next.js](https://nextjs.org/) (React)
* **Database & Backend**: [Supabase](https://supabase.com/) (PostgreSQL, Authentication, Row Level Security)
* **Styling**: Vanilla CSS for custom, high-performance styling
* **Emails**: [Resend](https://resend.com/)

## Getting Started

### Prerequisites

* Node.js (v18 or higher recommended)
* npm 
* Supabase account and project

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd CourseMate
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory and add your Supabase and Resend credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   RESEND_API_KEY=your_resend_api_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Architecture & Database

The backend relies on Supabase. The core database schema includes tables for:
*   `profiles`: User information and campus preferences.
*   `posts`: Swap requests and giveaway announcements.
*   `matches`: Records of successful and pending swaps.
*   `courses`, `majors`, `sections`: Academic catalog data updated regularly (e.g., via JSON data dumps).

Security is enforced using deep Row Level Security (RLS) policies within Supabase to ensure user data privacy.

## License

This project is tailored for academic community use.
