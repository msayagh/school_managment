# Teachers Service

## Overview
Microservice responsible for managing teacher-related operations.

## Responsibilities
- Teacher registration and profile management
- Teacher assignment to activities
- Teacher information retrieval and updates
- Track teacher specializations and status

## API Endpoints
- `POST /api/teachers` - Register a new teacher
- `GET /api/teachers` - Get all teachers
- `GET /api/teachers/:id` - Get teacher by ID
- `PUT /api/teachers/:id` - Update teacher information
- `DELETE /api/teachers/:id` - Remove teacher
- `GET /api/teachers/:id/activities` - Get teacher's assigned activities

## Technology Stack
- Backend framework: Node.js/Express
- Database: MySQL
- Authentication: JWT

## Setup Instructions
```bash
npm install
npm start
```

## Running Tests
```bash
npm test
```
