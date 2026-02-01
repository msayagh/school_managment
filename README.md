# School Management System

A microservices-based web application for managing school operations including activities, student registrations, rooms, and bookings.

## Overview

The School Management System is designed to help administrators efficiently manage various aspects of a school, including:
- Student registration and management
- Teacher management
- Activity creation and scheduling
- Room and facility management
- Booking and reservation system

## Architecture

This project follows a **microservices architecture** with the following components:

### Services
- **UI Service**: Frontend web application for user interaction
- **API Gateway**: Single entry point for all API requests with authentication and routing
- **Students Service**: Manages student data and operations
- **Teachers Service**: Manages teacher profiles and assignments
- **Activities Service**: Handles activity creation, scheduling, and enrollment
- **Rooms Service**: Manages school rooms and facilities
- **Bookings Service**: Handles room bookings and reservations
- **Database Service**: MySQL database for persistent storage

For detailed architecture documentation, see [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)

## Project Structure

```
school_managment/
├── services/                    # Microservices
│   ├── api-gateway/            # API Gateway service
│   ├── students/               # Students microservice
│   ├── teachers/               # Teachers microservice
│   ├── activities/             # Activities microservice
│   ├── rooms/                  # Rooms microservice
│   ├── bookings/               # Bookings microservice
│   ├── ui/                     # Frontend UI service
│   └── database/               # Database configurations
├── shared/                      # Shared code
│   ├── models/                 # Common data models
│   └── utils/                  # Shared utilities
├── infrastructure/             # Infrastructure as Code
├── docs/                       # Documentation
│   └── architecture/           # Architecture documentation
├── docker-compose.yml          # Docker orchestration
├── .env.example               # Environment variables template
└── README.md                  # This file
```

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- MySQL 8.0 (or use Docker)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/msayagh/school_managment.git
   cd school_managment
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start all services with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - UI: http://localhost:3000
   - API Gateway: http://localhost:8000
   - Individual services: Ports 3001-3005

### Development Setup

Each service can be developed independently. Navigate to the service directory and follow its README for specific setup instructions.

Example for Students Service:
```bash
cd services/students
npm install
npm run dev
```

## Service Ports

| Service       | Port |
|---------------|------|
| UI            | 3000 |
| API Gateway   | 8000 |
| Students      | 3001 |
| Teachers      | 3002 |
| Activities    | 3003 |
| Rooms         | 3004 |
| Bookings      | 3005 |
| Database      | 3306 |

## User Roles

### Admin
- Full system access
- School setup and configuration
- Manage rooms, activities, students, and teachers
- View reports and analytics

### Teacher (Future)
- View and manage assigned activities
- View enrolled students
- Manage activity schedules

### Student (Future)
- View enrolled activities
- Manage profile
- View personal schedule

## API Documentation

API documentation will be available at:
- Swagger UI: http://localhost:8000/api-docs (to be implemented)
- OpenAPI Spec: `/docs/api/` (to be created)

## Technology Stack

### Backend (Implemented)
- Framework: Node.js with Express
- Database: MySQL 8.0
- Authentication: JWT (JSON Web Tokens)
- Logging: log4js
- API Documentation: Swagger/OpenAPI (to be added)

### Frontend (To Be Implemented)
- Framework: React, Vue.js, or Angular
- State Management: Redux/Vuex
- UI Library: Material-UI/Ant Design

### Infrastructure
- Containerization: Docker
- Orchestration: Docker Compose (dev), Kubernetes (prod)
- CI/CD: GitHub Actions

## Development Roadmap

### Phase 1: Foundation (Completed)
- [x] Architecture design
- [x] Project structure setup
- [x] Documentation
- [x] Technology stack selection (Node.js + MySQL)

### Phase 2: Core Services (Completed)
- [x] Implement Students Service
- [x] Implement Teachers Service
- [x] Implement Activities Service
- [x] Implement Rooms Service
- [x] Implement Bookings Service

### Phase 3: Integration (Completed)
- [x] Implement API Gateway
- [x] Service communication via HTTP proxying
- [x] Authentication & authorization with JWT

### Phase 4: Frontend
- [ ] UI design and implementation
- [ ] Admin dashboard
- [ ] User interfaces

### Phase 5: Testing & Deployment (In Progress)
- [x] Unit tests for all services
- [x] CI/CD pipeline with GitHub Actions
- [ ] Integration tests
- [ ] Production deployment

## Contributing

Guidelines for contributing will be added as the project develops.

## License

To be determined.

## Contact

For questions or suggestions, please open an issue in the repository.
