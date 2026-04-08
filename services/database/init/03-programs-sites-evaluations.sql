-- ============================================================
-- Migration 03: Programs, Sites, Schedules, Evaluations
-- ============================================================
-- Run after 01-schema.sql. Safe to re-run (uses IF NOT EXISTS / IF EXISTS).

-- --------------------------------------------------------
-- SITES  (physical locations that contain rooms)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    address     TEXT,
    description TEXT,
    status      ENUM('active', 'inactive') DEFAULT 'active',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add site_id to rooms (nullable so existing rows keep working)
ALTER TABLE rooms
    ADD COLUMN site_id INT NULL AFTER name,
    ADD CONSTRAINT fk_rooms_site
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL;

-- --------------------------------------------------------
-- PROGRAMS  (e.g. "Summer Camp 2026")
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS programs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    start_date  DATE,
    end_date    DATE,
    capacity    INT,
    room_id     INT NULL,                         -- default location for all activities in this program
    color       VARCHAR(20) DEFAULT '#3B82F6',   -- hex / CSS colour for calendar display
    status      ENUM('draft', 'active', 'completed', 'cancelled') DEFAULT 'draft',
    created_by  INT NULL,                         -- user id
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
);

-- --------------------------------------------------------
-- PROGRAM INSTRUCTORS  (many teachers ↔ many programs)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS program_instructors (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    program_id  INT NOT NULL,
    teacher_id  INT NOT NULL,
    role        ENUM('lead', 'assistant', 'instructor') DEFAULT 'assistant',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_program_instructor (program_id, teacher_id),
    FOREIGN KEY (program_id)  REFERENCES programs(id)  ON DELETE CASCADE,
    FOREIGN KEY (teacher_id)  REFERENCES teachers(id)  ON DELETE CASCADE
);

-- --------------------------------------------------------
-- Link activities to programs
-- --------------------------------------------------------
ALTER TABLE activities
    ADD COLUMN program_id INT NULL AFTER id,
    ADD CONSTRAINT fk_activities_program
        FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE;

-- --------------------------------------------------------
-- ACTIVITY SCHEDULES  (recurring rule per activity)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_schedules (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    activity_id      INT NOT NULL,
    -- recurrence
    recurrence_type  ENUM('once', 'daily', 'weekly', 'bi_weekly', 'monthly', 'custom') DEFAULT 'once',
    days_of_week     JSON NULL,        -- [0..6] where 0=Sun; used for weekly/bi_weekly
    -- time window
    start_time       TIME NOT NULL,    -- e.g. 10:00:00
    end_time         TIME NOT NULL,    -- e.g. 16:00:00
    -- date range for the rule
    valid_from       DATE NOT NULL,
    valid_until      DATE NULL,        -- NULL = open-ended
    -- optional room override (inherits activity.room_id when NULL)
    room_id          INT NULL,
    -- full RFC-5545 RRULE string for advanced/custom patterns (optional)
    rrule            TEXT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (activity_id) REFERENCES activities(id)  ON DELETE CASCADE,
    FOREIGN KEY (room_id)     REFERENCES rooms(id)       ON DELETE SET NULL
);

-- --------------------------------------------------------
-- SCHEDULE OCCURRENCE OVERRIDES  (per-date exceptions to a rule)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_schedule_overrides (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id     INT NOT NULL,
    occurrence_date DATE NOT NULL,
    -- nullable overrides: NULL means "use rule/activity default"
    teacher_id      INT NULL,
    room_id         INT NULL,
    start_time      TIME NULL,
    end_time        TIME NULL,
    is_cancelled    TINYINT(1) NOT NULL DEFAULT 0,
    notes           TEXT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sched_date (schedule_id, occurrence_date),
    FOREIGN KEY (schedule_id) REFERENCES activity_schedules(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id)     REFERENCES rooms(id)              ON DELETE SET NULL,
    FOREIGN KEY (teacher_id)  REFERENCES teachers(id)           ON DELETE SET NULL
);

-- --------------------------------------------------------
-- EVALUATION TEMPLATES  (reusable rubrics / criteria sets)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_templates (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    -- criteria is a JSON array, e.g.:
    -- [{"name":"Participation","type":"score","max_score":10},
    --  {"name":"Behaviour","type":"grade"},
    --  {"name":"Overall","type":"pass_fail"},
    --  {"name":"Notes","type":"comment"}]
    criteria    JSON NOT NULL,
    created_by  INT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- ASSIGN TEMPLATES TO PROGRAMS / ACTIVITIES
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS program_evaluation_templates (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    program_id              INT NULL,
    activity_id             INT NULL,
    evaluation_template_id  INT NOT NULL,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_prog_tpl   (program_id,  evaluation_template_id),
    UNIQUE KEY unique_act_tpl    (activity_id, evaluation_template_id),
    FOREIGN KEY (program_id)             REFERENCES programs(id)              ON DELETE CASCADE,
    FOREIGN KEY (activity_id)            REFERENCES activities(id)            ON DELETE CASCADE,
    FOREIGN KEY (evaluation_template_id) REFERENCES evaluation_templates(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- EVALUATIONS  (one row per student-per-template instance)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluations (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    evaluation_template_id  INT NOT NULL,
    program_id              INT NULL,
    activity_id             INT NULL,
    student_id              INT NOT NULL,
    instructor_id           INT NOT NULL,
    -- scores keyed by criteria name, e.g. {"Participation":8,"Behaviour":"A","Overall":"pass"}
    scores                  JSON NULL,
    instructor_comments     TEXT NULL,
    parent_visible          TINYINT(1) DEFAULT 1,   -- 1 = parents can see this
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (evaluation_template_id) REFERENCES evaluation_templates(id) ON DELETE RESTRICT,
    FOREIGN KEY (program_id)             REFERENCES programs(id)              ON DELETE CASCADE,
    FOREIGN KEY (activity_id)            REFERENCES activities(id)            ON DELETE CASCADE,
    FOREIGN KEY (student_id)             REFERENCES students(id)              ON DELETE CASCADE,
    FOREIGN KEY (instructor_id)          REFERENCES teachers(id)              ON DELETE RESTRICT
);

-- --------------------------------------------------------
-- Indexes
-- --------------------------------------------------------
CREATE INDEX idx_programs_status        ON programs(status);
CREATE INDEX idx_programs_dates         ON programs(start_date, end_date);
CREATE INDEX idx_prog_instr_program     ON program_instructors(program_id);
CREATE INDEX idx_prog_instr_teacher     ON program_instructors(teacher_id);
CREATE INDEX idx_act_schedules_activity ON activity_schedules(activity_id);
CREATE INDEX idx_act_schedules_dates    ON activity_schedules(valid_from, valid_until);
CREATE INDEX idx_evaluations_student    ON evaluations(student_id);
CREATE INDEX idx_evaluations_program    ON evaluations(program_id);
CREATE INDEX idx_evaluations_activity   ON evaluations(activity_id);
CREATE INDEX idx_rooms_site             ON rooms(site_id);
CREATE INDEX idx_activities_program     ON activities(program_id);

-- --------------------------------------------------------
-- SCOPED BOOKINGS (general / program default / activity override)
-- --------------------------------------------------------
-- Note: the ALTER statements below are intended to be applied once on upgraded databases.
-- Runtime idempotent bootstrap is also handled by bookings-service on startup.
ALTER TABLE bookings
    ADD COLUMN program_id INT NULL AFTER activity_id,
    ADD COLUMN schedule_id INT NULL AFTER program_id,
    ADD COLUMN occurrence_date DATE NULL AFTER schedule_id,
    ADD COLUMN source_booking_id INT NULL AFTER occurrence_date,
    ADD COLUMN scope ENUM('GENERAL','PROGRAM_DEFAULT','ACTIVITY_OVERRIDE') NOT NULL DEFAULT 'GENERAL' AFTER source_booking_id,
    ADD COLUMN priority INT NOT NULL DEFAULT 1 AFTER scope;

ALTER TABLE bookings
    ADD INDEX idx_bookings_scope (scope),
    ADD INDEX idx_bookings_program (program_id),
    ADD INDEX idx_bookings_activity_scope_day (activity_id, scope, occurrence_date);

CREATE TABLE IF NOT EXISTS booking_conflict_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    requested_scope       ENUM('GENERAL','PROGRAM_DEFAULT','ACTIVITY_OVERRIDE') NOT NULL,
    requested_room_id     INT NOT NULL,
    requested_program_id  INT NULL,
    requested_activity_id INT NULL,
    requested_start_time  DATETIME NOT NULL,
    requested_end_time    DATETIME NOT NULL,
    conflict_count        INT NOT NULL DEFAULT 0,
    proposal_count        INT NOT NULL DEFAULT 0,
    resolution_strategy   VARCHAR(100) NULL,
    created_by            VARCHAR(100) NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requested_room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
    FOREIGN KEY (requested_program_id) REFERENCES programs(id) ON DELETE SET NULL,
    FOREIGN KEY (requested_activity_id) REFERENCES activities(id) ON DELETE SET NULL
);

-- --------------------------------------------------------
-- PARENT MODEL (parents can have multiple children/students)
-- --------------------------------------------------------
ALTER TABLE users MODIFY COLUMN role ENUM('admin','teacher','student','parent') NOT NULL DEFAULT 'student';

CREATE TABLE IF NOT EXISTS parents (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name  VARCHAR(100) NOT NULL,
    email      VARCHAR(255) UNIQUE NOT NULL,
    phone      VARCHAR(50),
    address    TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parent_children (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    parent_id    INT NOT NULL,
    student_id   INT NOT NULL,
    relationship VARCHAR(50) DEFAULT 'parent',
    UNIQUE KEY uq_parent_child (parent_id, student_id),
    FOREIGN KEY (parent_id)  REFERENCES parents(id)  ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- PROGRAM ENROLLMENTS (enrollment is at program level, not activity level)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS program_enrollments (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    student_id      INT NOT NULL,
    program_id      INT NOT NULL,
    enrollment_date DATE NOT NULL DEFAULT (CURDATE()),
    status          ENUM('enrolled','completed','dropped') DEFAULT 'enrolled',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_student_program (student_id, program_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);
