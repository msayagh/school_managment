# Database Service

## Overview
Database configuration and management for the school management system.

## Database Strategy
This folder contains database configurations, schemas, and migration scripts.

### Approach Options
1. **Shared Database** - Single database with separate schemas for each service
2. **Database per Service** - Each microservice has its own database (recommended for true microservices)

## Databases (To Be Configured)
- Students Database
- Teachers Database
- Activities Database
- Rooms Database
- Bookings Database

## Technology Stack (To Be Decided)
- Database: TBD (e.g., PostgreSQL, MySQL, MongoDB)
- Migration Tool: TBD (e.g., Flyway, Liquibase, Alembic)
- Connection Pooling: TBD

## Schema Structure (To Be Defined)
### Students
- id, name, email, phone, address, enrollment_date, status, etc.

### Teachers
- id, name, email, phone, specialization, hire_date, etc.

### Activities
- id, name, description, schedule, capacity, teacher_id, room_id, etc.

### Rooms
- id, name, capacity, type, location, equipment, etc.

### Bookings
- id, room_id, activity_id, start_time, end_time, status, etc.

## Setup Instructions
To be added when service is implemented.
