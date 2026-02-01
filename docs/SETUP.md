# Development Setup Guide

This guide will help you set up the School Management System for local development.

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development without Docker)
- MySQL 8.0 (for local development without Docker)
- Git

## Quick Start with Docker

The easiest way to run the entire system is using Docker Compose:

### 1. Clone the repository
```bash
git clone https://github.com/msayagh/school_managment.git
cd school_managment
```

### 2. Set up environment variables
```bash
cp .env.example .env
# Edit .env if needed (default values work for Docker setup)
```

### 3. Start all services
```bash
docker-compose up -d
```

This will start:
- MySQL database on port 3306
- API Gateway on port 8000
- Students service on port 3001
- Teachers service on port 3002
- Activities service on port 3003
- Rooms service on port 3004
- Bookings service on port 3005

### 4. Verify services are running
```bash
docker-compose ps
```

### 5. Check logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f students-service
```

### 6. Access the services
- API Gateway: http://localhost:8000
- Health check: http://localhost:8000/health

## Local Development (Without Docker)

### 1. Install MySQL
Install MySQL 8.0 and create the database:

```bash
mysql -u root -p
CREATE DATABASE school_management;
CREATE USER 'school_admin'@'localhost' IDENTIFIED BY 'changeme';
GRANT ALL PRIVILEGES ON school_management.* TO 'school_admin'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 2. Initialize database schema
```bash
mysql -u school_admin -p school_management < services/database/init/01-schema.sql
```

### 3. Set up environment variables
Create a `.env` file in the root directory:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=school_admin
DB_PASSWORD=changeme
DB_NAME=school_management
JWT_SECRET=your-secret-key-change-in-production
NODE_ENV=development
```

### 4. Install dependencies

#### Shared utilities
```bash
cd shared
npm install
```

#### API Gateway
```bash
cd services/api-gateway
npm install
```

#### Microservices
```bash
cd services/students && npm install
cd ../teachers && npm install
cd ../activities && npm install
cd ../rooms && npm install
cd ../bookings && npm install
```

### 5. Start services

Open separate terminal windows for each service:

```bash
# Terminal 1 - Students Service
cd services/students
npm start

# Terminal 2 - Teachers Service
cd services/teachers
npm start

# Terminal 3 - Activities Service
cd services/activities
npm start

# Terminal 4 - Rooms Service
cd services/rooms
npm start

# Terminal 5 - Bookings Service
cd services/bookings
npm start

# Terminal 6 - API Gateway
cd services/api-gateway
npm start
```

Or use development mode with auto-reload:
```bash
npm run dev
```

## Testing

### Run all tests
```bash
# From root directory
npm test --workspaces
```

### Run tests for a specific service
```bash
cd services/students
npm test

# With coverage
npm test -- --coverage
```

### Run tests in watch mode
```bash
npm test -- --watch
```

## API Usage Examples

### 1. Register a user
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@school.com",
    "password": "password123",
    "role": "admin"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "password123"
  }'
```

Save the returned token for authenticated requests.

### 3. Create a student (requires authentication)
```bash
curl -X POST http://localhost:8000/api/students \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "1234567890",
    "date_of_birth": "2000-01-01"
  }'
```

### 4. Get all students
```bash
curl http://localhost:8000/api/students
```

### 5. Create a teacher (requires authentication)
```bash
curl -X POST http://localhost:8000/api/teachers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane.smith@example.com",
    "specialization": "Mathematics"
  }'
```

### 6. Create an activity (requires authentication)
```bash
curl -X POST http://localhost:8000/api/activities \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Math Class",
    "description": "Introduction to Algebra",
    "capacity": 30,
    "start_date": "2024-01-15",
    "schedule": "Monday 9:00-10:30"
  }'
```

### 7. Enroll a student in an activity (requires authentication)
```bash
curl -X POST http://localhost:8000/api/activities/1/enroll \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "student_id": 1
  }'
```

## Troubleshooting

### Database connection errors
- Verify MySQL is running: `mysql -u school_admin -p`
- Check database exists: `SHOW DATABASES;`
- Verify credentials in `.env` file

### Port conflicts
If ports are already in use, you can change them in:
- `docker-compose.yml` for Docker setup
- `.env` file for local development

### Service not starting
Check logs for errors:
```bash
# Docker
docker-compose logs service-name

# Local
Check terminal output
```

### Tests failing
- Ensure database is initialized
- Check environment variables
- Run `npm install` in each service directory

## Database Management

### View database structure
```bash
mysql -u school_admin -p school_management
SHOW TABLES;
DESCRIBE students;
```

### Reset database
```bash
mysql -u school_admin -p school_management < services/database/init/01-schema.sql
```

### Backup database
```bash
mysqldump -u school_admin -p school_management > backup.sql
```

### Restore database
```bash
mysql -u school_admin -p school_management < backup.sql
```

## CI/CD

The project includes GitHub Actions workflows:

- **test-and-build.yml**: Runs tests and builds Docker images on push/PR
- **docker-publish.yml**: Publishes Docker images on releases

## Next Steps

1. Explore the API endpoints in each service
2. Add frontend UI implementation
3. Implement integration tests
4. Set up monitoring and logging infrastructure
5. Deploy to production environment

## Support

For issues and questions, please open an issue in the GitHub repository.
