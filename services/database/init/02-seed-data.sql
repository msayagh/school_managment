-- Seed Data for School Management System
-- Creates default admin user and sample data

-- Default Admin User
-- Username: admin
-- Password: admin123 (bcrypt hash below)
-- IMPORTANT: Change this password in production!
INSERT INTO users (username, email, password_hash, role, status) VALUES
('admin', 'admin@school.com', '$2b$10$rKJ3YLZi6vQ7LZnqQ8tNZeCq9p5W7YvhqhPxGZmKX3PZJ5YqYQn7K', 'admin', 'active')
ON DUPLICATE KEY UPDATE username=username;

-- Link existing teachers to user accounts
-- Password for all: teacher123
INSERT INTO users (username, email, password_hash, role, related_id, status)
SELECT 
    LOWER(CONCAT(first_name, '.', last_name)) as username,
    email,
    '$2b$10$w5XJ3LZi6vQ7LZnqQ8tNZeCq9p5W7YvhqhPxGZmKX3PZJ5YqYQn7K' as password_hash,
    'teacher' as role,
    id as related_id,
    'active' as status
FROM teachers
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE users.email = teachers.email
);

-- Link existing students to user accounts
-- Password for all: student123
INSERT INTO users (username, email, password_hash, role, related_id, status)
SELECT 
    LOWER(CONCAT(first_name, '.', last_name, id)) as username,
    email,
    '$2b$10$x6YK4MZj7wR8MZoqR9uOZfDr0q6X8ZwiriqQyHanLY4QK6ZrZRo8S' as password_hash,
    'student' as role,
    id as related_id,
    'active' as status
FROM students
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE users.email = students.email
);
