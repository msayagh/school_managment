# Contributing to School Management System

Thank you for your interest in contributing to the School Management System!

## Development Workflow

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/school_managment.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Commit your changes: `git commit -m "Add your feature"`
6. Push to your fork: `git push origin feature/your-feature-name`
7. Submit a pull request

### Project Structure

Each microservice is independent and should be developed in isolation. Follow the directory structure:

```
services/
├── service-name/
│   ├── src/              # Source code
│   ├── tests/            # Unit and integration tests
│   ├── Dockerfile        # Docker configuration
│   ├── package.json      # Dependencies (Node.js)
│   ├── requirements.txt  # Dependencies (Python)
│   └── README.md         # Service documentation
```

### Development Guidelines

#### Code Style
- Follow the existing code style in each service
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

#### API Design
- Use RESTful principles
- Return appropriate HTTP status codes
- Use JSON for request/response bodies
- Document all endpoints in service README

#### Database
- Use migrations for schema changes
- Never commit database credentials
- Use environment variables for configuration

#### Testing
- Write unit tests for all business logic
- Write integration tests for API endpoints
- Aim for >80% code coverage
- Run tests before submitting PR

#### Docker
- Each service should have its own Dockerfile
- Use multi-stage builds for production images
- Keep images small and secure
- Document any special build requirements

### Service Development Process

1. **Design Phase**
   - Define API endpoints
   - Design database schema
   - Create data models
   - Document in service README

2. **Implementation Phase**
   - Set up service structure
   - Implement business logic
   - Create API endpoints
   - Add error handling

3. **Testing Phase**
   - Write unit tests
   - Write integration tests
   - Test service independently
   - Test service in Docker

4. **Integration Phase**
   - Update docker-compose.yml
   - Test with other services
   - Update API Gateway routes
   - Update documentation

### Technology Stack Selection

When implementing a new service, choose from:

#### Backend Frameworks
- **Node.js + Express**: Recommended for JavaScript/TypeScript developers
- **Python + Flask/FastAPI**: Recommended for Python developers
- **Java + Spring Boot**: Recommended for enterprise-grade services

#### Database
- **PostgreSQL**: Primary database (already configured)
- Each service can have its own database or schema

#### Authentication
- **JWT**: For stateless authentication
- Implement in API Gateway

### Pull Request Guidelines

#### Before Submitting
- [ ] Code follows project style guidelines
- [ ] All tests pass
- [ ] Documentation is updated
- [ ] Commit messages are clear
- [ ] No sensitive data in code
- [ ] Docker build succeeds

#### PR Description Should Include
- What was changed
- Why the change was needed
- How to test the changes
- Any breaking changes
- Screenshots (for UI changes)

### Code Review Process

1. Automated tests will run
2. Code will be reviewed by maintainers
3. Address any feedback
4. Once approved, PR will be merged

### Reporting Issues

When reporting issues, include:
- Clear description of the problem
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Docker version, etc.)
- Screenshots or logs if applicable

### Feature Requests

For feature requests:
- Check if feature already exists or is planned
- Describe the use case
- Explain expected behavior
- Consider implementation impact

### Communication

- Open an issue for bugs or features
- Use discussions for questions
- Be respectful and constructive
- Follow the code of conduct

## Service-Specific Guidelines

### Students Service
- Validate all student data
- Ensure privacy compliance
- Handle enrollment logic

### Teachers Service
- Manage teacher assignments
- Handle schedule conflicts
- Track workload

### Activities Service
- Validate capacity limits
- Handle scheduling conflicts
- Manage enrollments

### Rooms Service
- Track room availability
- Manage capacity
- Handle maintenance status

### Bookings Service
- Prevent double bookings
- Handle cancellations
- Manage booking conflicts

### API Gateway
- Route all requests correctly
- Implement authentication
- Add rate limiting
- Log all requests

### UI Service
- Follow accessibility guidelines
- Ensure responsive design
- Validate user inputs
- Handle errors gracefully

## Questions?

If you have questions:
1. Check the documentation
2. Search existing issues
3. Open a new issue
4. Ask in discussions

Thank you for contributing!
