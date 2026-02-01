# Activities Service

## Overview
Microservice responsible for managing school activities and events.

## Responsibilities
- Activity creation, editing, and deletion
- Activity scheduling
- Enrollment management
- Activity information retrieval

## API Endpoints (To Be Implemented)
- `POST /api/activities` - Create a new activity
- `GET /api/activities` - Get all activities
- `GET /api/activities/:id` - Get activity by ID
- `PUT /api/activities/:id` - Update activity information
- `DELETE /api/activities/:id` - Remove activity
- `POST /api/activities/:id/enroll` - Enroll student in activity
- `DELETE /api/activities/:id/enroll/:studentId` - Unenroll student from activity
- `GET /api/activities/:id/participants` - Get activity participants

## Technology Stack (To Be Decided)
- Backend framework: TBD (e.g., Node.js/Express, Python/Flask, Java/Spring Boot)
- Database: TBD
- Authentication: TBD

## Setup Instructions
To be added when service is implemented.
