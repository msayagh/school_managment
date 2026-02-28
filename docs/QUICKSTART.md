# Quick Start Guide

This guide will help you get the School Management System up and running quickly.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Docker](https://docs.docker.com/get-docker/) (version 20.10 or higher)
- [Docker Compose](https://docs.docker.com/compose/install/) (version 2.0 or higher)
- [Git](https://git-scm.com/downloads)

Optional (for local development without Docker):
- [Node.js](https://nodejs.org/) (version 18 or higher)
- [MySQL 8.0](https://dev.mysql.com/downloads/) (for local development without Docker)

## Quick Setup

### 1. Clone the Repository

```bash
git clone https://github.com/msayagh/school_managment.git
cd school_managment
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env if needed (optional for development)
# nano .env
```

### 3. Start All Services

```bash
# Start all services in detached mode
docker-compose up -d

# View logs
docker-compose logs -f
```

### 4. Verify Services Are Running

```bash
# Check service status
docker-compose ps

# You should see all services running
```

### 5. Access the Application

Once services are running, you can access:

- **UI Application**: http://localhost:3000
- **API Gateway**: http://localhost:8000
- **Students Service**: http://localhost:3001
- **Teachers Service**: http://localhost:3002
- **Activities Service**: http://localhost:3003
- **Rooms Service**: http://localhost:3004
- **Bookings Service**: http://localhost:3005

## Common Commands

### Starting Services

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d students-service

# Start with logs visible
docker-compose up
```

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes data)
docker-compose down -v
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f students-service

# Last 100 lines
docker-compose logs --tail=100 students-service
```

### Rebuilding Services

```bash
# Rebuild all services
docker-compose build

# Rebuild specific service
docker-compose build students-service

# Rebuild and restart
docker-compose up -d --build
```

### Database Access

```bash
# Connect to MySQL
docker-compose exec database mysql -u school_admin -p school_management

# Backup database
docker-compose exec database mysqldump -u school_admin -p school_management > backup.sql

# Restore database
docker-compose exec -T database mysql -u school_admin -p school_management < backup.sql
```

## Development Setup

### Option 1: Docker Development (Recommended)

```bash
# Start services
docker-compose up -d

# Make code changes in your editor
# Services will auto-reload (if configured)

# View logs to debug
docker-compose logs -f service-name
```

### Option 2: Local Development

```bash
# Start only database
docker-compose up -d database

# Navigate to service directory
cd services/students

# Install dependencies (example for Node.js)
npm install

# Start development server
npm run dev

# Service runs on localhost:3001
```

## Troubleshooting

### Services Won't Start

```bash
# Check if ports are already in use
lsof -i :3000  # Check UI port
lsof -i :8000  # Check API Gateway port

# Stop conflicting services or change ports in docker-compose.yml
```

### Database Connection Issues

```bash
# Verify database is running
docker-compose ps database

# Check database logs
docker-compose logs database

# Restart database
docker-compose restart database
```

### Permission Issues

```bash
# Fix Docker permission issues (Linux)
sudo usermod -aG docker $USER
newgrp docker

# Fix file permissions
sudo chown -R $USER:$USER .
```

### Clean Start

```bash
# Stop and remove everything
docker-compose down -v

# Remove all Docker artifacts
docker system prune -a

# Start fresh
docker-compose up -d
```

## Next Steps

### For Administrators
1. Access the UI at http://localhost:3000
2. Set up school information
3. Create rooms and facilities
4. Add teachers and students
5. Create activities

### For Developers
1. Read [CONTRIBUTING.md](CONTRIBUTING.md)
2. Check [Architecture Documentation](docs/architecture/ARCHITECTURE.md)
3. Choose a service to develop
4. Read service-specific README
5. Start coding!

### For System Operators
1. Review [docker-compose.yml](docker-compose.yml)
2. Plan infrastructure deployment
3. Set up monitoring and logging
4. Configure backups
5. Plan scaling strategy

## Getting Help

- **Documentation**: Check the [README.md](README.md) and [Architecture docs](docs/architecture/)
- **Issues**: Open an issue on GitHub
- **Discussions**: Use GitHub Discussions for questions

## Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [REST API Best Practices](https://restfulapi.net/)
- [Microservices Architecture](https://microservices.io/)

Happy coding! 🚀
