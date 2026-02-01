# API Specifications

This document defines the API contracts for all microservices in the School Management System.

## API Standards

### Base URL Structure
```
http://localhost:8000/api/{service}/{resource}
```

### Common Response Format

#### Success Response
```json
{
  "success": true,
  "data": { /* resource data */ },
  "message": "Operation successful"
}
```

#### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { /* additional error details */ }
  }
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (e.g., duplicate) |
| 422 | Unprocessable Entity | Validation error |
| 500 | Internal Server Error | Server error |

### Authentication

All API requests (except public endpoints) require JWT authentication:

```http
Authorization: Bearer {jwt_token}
```

### Pagination

List endpoints support pagination:

```http
GET /api/students?page=1&limit=20&sort=createdAt&order=desc
```

Response includes pagination metadata:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

## Students Service API

### Base URL: `/api/students`

#### List Students
```http
GET /api/students
Query Parameters:
  - page: number (default: 1)
  - limit: number (default: 20)
  - status: string (active|inactive|graduated)
  - search: string (search by name or email)
```

#### Get Student
```http
GET /api/students/:id
```

#### Create Student
```http
POST /api/students
Body:
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "phone": "string",
  "dateOfBirth": "ISO8601 date",
  "address": "string"
}
```

#### Update Student
```http
PUT /api/students/:id
Body: (same as create, all fields optional)
```

#### Delete Student
```http
DELETE /api/students/:id
```

#### Get Student Activities
```http
GET /api/students/:id/activities
```

## Teachers Service API

### Base URL: `/api/teachers`

#### List Teachers
```http
GET /api/teachers
Query Parameters:
  - page: number
  - limit: number
  - status: string (active|inactive)
  - specialization: string
```

#### Get Teacher
```http
GET /api/teachers/:id
```

#### Create Teacher
```http
POST /api/teachers
Body:
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "phone": "string",
  "specialization": ["string"],
  "hireDate": "ISO8601 date"
}
```

#### Update Teacher
```http
PUT /api/teachers/:id
Body: (same as create, all fields optional)
```

#### Delete Teacher
```http
DELETE /api/teachers/:id
```

#### Get Teacher Activities
```http
GET /api/teachers/:id/activities
```

#### Get Teacher Schedule
```http
GET /api/teachers/:id/schedule
Query Parameters:
  - startDate: ISO8601 date
  - endDate: ISO8601 date
```

## Activities Service API

### Base URL: `/api/activities`

#### List Activities
```http
GET /api/activities
Query Parameters:
  - page: number
  - limit: number
  - status: string (active|cancelled|completed)
  - teacherId: string
  - dayOfWeek: string
```

#### Get Activity
```http
GET /api/activities/:id
```

#### Create Activity
```http
POST /api/activities
Body:
{
  "name": "string",
  "description": "string",
  "teacherId": "string",
  "roomId": "string",
  "schedule": {
    "dayOfWeek": "Monday|Tuesday|...",
    "startTime": "HH:mm",
    "endTime": "HH:mm"
  },
  "capacity": number
}
```

#### Update Activity
```http
PUT /api/activities/:id
Body: (same as create, all fields optional)
```

#### Delete Activity
```http
DELETE /api/activities/:id
```

#### Enroll Student
```http
POST /api/activities/:id/enroll
Body:
{
  "studentId": "string"
}
```

#### Unenroll Student
```http
DELETE /api/activities/:id/enroll/:studentId
```

#### Get Activity Participants
```http
GET /api/activities/:id/participants
```

## Rooms Service API

### Base URL: `/api/rooms`

#### List Rooms
```http
GET /api/rooms
Query Parameters:
  - page: number
  - limit: number
  - type: string (classroom|lab|auditorium|gym|other)
  - status: string (available|maintenance|unavailable)
  - minCapacity: number
```

#### Get Room
```http
GET /api/rooms/:id
```

#### Create Room
```http
POST /api/rooms
Body:
{
  "name": "string",
  "capacity": number,
  "type": "classroom|lab|auditorium|gym|other",
  "location": "string",
  "equipment": ["string"]
}
```

#### Update Room
```http
PUT /api/rooms/:id
Body: (same as create, all fields optional)
```

#### Delete Room
```http
DELETE /api/rooms/:id
```

#### Check Room Availability
```http
GET /api/rooms/:id/availability
Query Parameters:
  - startDate: ISO8601 datetime
  - endDate: ISO8601 datetime
```

#### Get Available Rooms
```http
GET /api/rooms/available
Query Parameters:
  - startTime: ISO8601 datetime
  - endTime: ISO8601 datetime
  - capacity: number
  - type: string
```

## Bookings Service API

### Base URL: `/api/bookings`

#### List Bookings
```http
GET /api/bookings
Query Parameters:
  - page: number
  - limit: number
  - roomId: string
  - startDate: ISO8601 date
  - endDate: ISO8601 date
  - status: string (confirmed|cancelled|completed)
```

#### Get Booking
```http
GET /api/bookings/:id
```

#### Create Booking
```http
POST /api/bookings
Body:
{
  "roomId": "string",
  "activityId": "string",
  "title": "string",
  "startTime": "ISO8601 datetime",
  "endTime": "ISO8601 datetime"
}
```

#### Update Booking
```http
PUT /api/bookings/:id
Body: (same as create, all fields optional)
```

#### Cancel Booking
```http
DELETE /api/bookings/:id
```

#### Get Room Bookings
```http
GET /api/bookings/room/:roomId
Query Parameters:
  - startDate: ISO8601 date
  - endDate: ISO8601 date
```

#### Check Conflicts
```http
POST /api/bookings/conflicts
Body:
{
  "roomId": "string",
  "startTime": "ISO8601 datetime",
  "endTime": "ISO8601 datetime",
  "excludeBookingId": "string" (optional)
}
```

## Authentication API

### Base URL: `/api/auth`

#### Login
```http
POST /api/auth/login
Body:
{
  "email": "string",
  "password": "string"
}
Response:
{
  "success": true,
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "string",
      "email": "string",
      "role": "admin|teacher|student",
      "name": "string"
    }
  }
}
```

#### Logout
```http
POST /api/auth/logout
```

#### Refresh Token
```http
POST /api/auth/refresh
Body:
{
  "refreshToken": "string"
}
```

#### Get Current User
```http
GET /api/auth/me
```

## Data Validation Rules

### Email
- Valid email format
- Unique across system

### Phone
- Optional
- Format: +[country code][number]

### Date of Birth
- Must be in the past
- Format: ISO8601

### Capacity
- Positive integer
- Greater than 0

### Time Slots
- Start time before end time
- No overlapping bookings for same room

## Rate Limiting

- 100 requests per minute per IP
- 1000 requests per hour per authenticated user

## OpenAPI/Swagger

Full OpenAPI 3.0 specifications will be available at:
```
http://localhost:8000/api-docs
```

## Testing

Use tools like:
- Postman
- cURL
- HTTPie
- Swagger UI

Example cURL request:
```bash
curl -X GET "http://localhost:8000/api/students?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

## Versioning

APIs are versioned through URL path:
```
/api/v1/students
/api/v2/students
```

Current version: v1 (implicit, no version in URL for now)

## Notes

- All timestamps are in UTC
- All IDs are UUIDs
- All text fields are UTF-8 encoded
- Maximum request body size: 10MB
- Request timeout: 30 seconds
