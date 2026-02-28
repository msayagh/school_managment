const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'School Management System API',
      version: '1.0.0',
      description: 'API documentation for the School Management System. Use the Authorize button to provide a Bearer token for protected endpoints.',
    },
    servers: [
      {
        url: 'http://localhost:8000',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        Student: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            address: { type: 'string' },
            date_of_birth: { type: 'string', format: 'date' },
            enrollment_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'inactive', 'graduated'] },
          },
        },
        StudentInput: {
          type: 'object',
          required: ['first_name', 'last_name', 'email'],
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            address: { type: 'string' },
            date_of_birth: { type: 'string', format: 'date' },
            enrollment_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'inactive', 'graduated'] },
          },
        },
        Teacher: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            specialization: { type: 'string' },
            hire_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        TeacherInput: {
          type: 'object',
          required: ['first_name', 'last_name', 'email'],
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            specialization: { type: 'string' },
            hire_date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        Activity: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            description: { type: 'string' },
            teacher_id: { type: 'integer' },
            room_id: { type: 'integer' },
            capacity: { type: 'integer' },
            start_date: { type: 'string', format: 'date' },
            end_date: { type: 'string', format: 'date' },
            schedule: { type: 'string' },
            status: { type: 'string', enum: ['active', 'cancelled', 'completed'] },
          },
        },
        ActivityInput: {
          type: 'object',
          required: ['name', 'capacity'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            teacher_id: { type: 'integer' },
            room_id: { type: 'integer' },
            capacity: { type: 'integer' },
            start_date: { type: 'string', format: 'date' },
            end_date: { type: 'string', format: 'date' },
            schedule: { type: 'string' },
            status: { type: 'string', enum: ['active', 'cancelled', 'completed'] },
          },
        },
        Room: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            capacity: { type: 'integer' },
            room_type: { type: 'string', enum: ['classroom', 'lab', 'auditorium', 'gym', 'other'] },
            location: { type: 'string' },
            equipment: { type: 'string' },
            status: { type: 'string', enum: ['available', 'maintenance', 'unavailable'] },
          },
        },
        RoomInput: {
          type: 'object',
          required: ['name', 'capacity'],
          properties: {
            name: { type: 'string' },
            capacity: { type: 'integer' },
            room_type: { type: 'string', enum: ['classroom', 'lab', 'auditorium', 'gym', 'other'] },
            location: { type: 'string' },
            equipment: { type: 'string' },
            status: { type: 'string', enum: ['available', 'maintenance', 'unavailable'] },
          },
        },
        Booking: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            room_id: { type: 'integer' },
            activity_id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled', 'completed'] },
            created_by: { type: 'integer' },
          },
        },
        BookingInput: {
          type: 'object',
          required: ['room_id', 'title', 'start_time', 'end_time'],
          properties: {
            room_id: { type: 'integer' },
            activity_id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['pending', 'confirmed', 'cancelled', 'completed'] },
            created_by: { type: 'integer' },
          },
        },
        AuthRegisterInput: {
          type: 'object',
          required: ['username', 'email', 'password'],
          properties: {
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password' },
            role: { type: 'string', enum: ['admin', 'teacher', 'student'], default: 'student' },
          },
        },
        AuthLoginInput: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string', format: 'password' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                username: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
              },
            },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          tags: ['System'],
          responses: {
            200: {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'healthy' },
                      service: { type: 'string', example: 'api-gateway' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/auth/register': {
        post: {
          summary: 'Register a new user',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthRegisterInput' },
              },
            },
          },
          responses: {
            201: {
              description: 'User registered successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthResponse' },
                },
              },
            },
            400: { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            409: { description: 'Username or email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/login': {
        post: {
          summary: 'Login with username and password',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthLoginInput' },
              },
            },
          },
          responses: {
            200: {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthResponse' },
                },
              },
            },
            400: { description: 'Missing credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/auth/me': {
        get: {
          summary: 'Get current authenticated user',
          tags: ['Authentication'],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Current user info',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      username: { type: 'string' },
                      email: { type: 'string' },
                      role: { type: 'string' },
                    },
                  },
                },
              },
            },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'User not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/students': {
        get: {
          summary: 'Get all students',
          tags: ['Students'],
          responses: {
            200: {
              description: 'List of students',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Student' } },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create a new student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StudentInput' },
              },
            },
          },
          responses: {
            201: {
              description: 'Student created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Student' } } },
            },
            400: { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            409: { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/students/{id}': {
        get: {
          summary: 'Get student by ID',
          tags: ['Students'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Student found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Student' } } } },
            404: { description: 'Student not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        put: {
          summary: 'Update student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StudentInput' } } },
          },
          responses: {
            200: { description: 'Student updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Student' } } } },
            400: { description: 'No fields to update', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Student not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          summary: 'Delete student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Student deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Student not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/students/{id}/activities': {
        get: {
          summary: "Get student's enrolled activities",
          tags: ['Students'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'List of activities', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Activity' } } } } },
            404: { description: 'Student not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/teachers': {
        get: {
          summary: 'Get all teachers',
          tags: ['Teachers'],
          responses: {
            200: { description: 'List of teachers', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Teacher' } } } } },
          },
        },
        post: {
          summary: 'Create a new teacher',
          tags: ['Teachers'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TeacherInput' } } },
          },
          responses: {
            201: { description: 'Teacher created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Teacher' } } } },
            400: { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            409: { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/teachers/{id}': {
        get: {
          summary: 'Get teacher by ID',
          tags: ['Teachers'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Teacher found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Teacher' } } } },
            404: { description: 'Teacher not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        put: {
          summary: 'Update teacher',
          tags: ['Teachers'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TeacherInput' } } },
          },
          responses: {
            200: { description: 'Teacher updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Teacher' } } } },
            400: { description: 'No fields to update', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Teacher not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          summary: 'Delete teacher',
          tags: ['Teachers'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Teacher deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Teacher not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/teachers/{id}/activities': {
        get: {
          summary: "Get teacher's activities",
          tags: ['Teachers'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'List of activities', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Activity' } } } } },
            404: { description: 'Teacher not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/teachers/{id}/schedule': {
        get: {
          summary: "Get teacher's schedule",
          tags: ['Teachers'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: {
              description: "Teacher's schedule",
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      teacher_id: { type: 'integer' },
                      schedule: { type: 'array', items: { $ref: '#/components/schemas/Activity' } },
                    },
                  },
                },
              },
            },
            404: { description: 'Teacher not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/activities': {
        get: {
          summary: 'Get all activities',
          tags: ['Activities'],
          responses: {
            200: { description: 'List of activities', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Activity' } } } } },
          },
        },
        post: {
          summary: 'Create a new activity',
          tags: ['Activities'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ActivityInput' } } },
          },
          responses: {
            201: { description: 'Activity created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Activity' } } } },
            400: { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/activities/{id}': {
        get: {
          summary: 'Get activity by ID',
          tags: ['Activities'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Activity found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Activity' } } } },
            404: { description: 'Activity not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        put: {
          summary: 'Update activity',
          tags: ['Activities'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ActivityInput' } } },
          },
          responses: {
            200: { description: 'Activity updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Activity' } } } },
            400: { description: 'No fields to update', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Activity not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          summary: 'Delete activity',
          tags: ['Activities'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Activity deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Activity not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/activities/{id}/enroll': {
        post: {
          summary: 'Enroll a student in an activity',
          tags: ['Activities'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['student_id'],
                  properties: { student_id: { type: 'integer' } },
                },
              },
            },
          },
          responses: {
            201: { description: 'Student enrolled', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, enrollment_id: { type: 'integer' } } } } } },
            400: { description: 'Activity full or missing student_id', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Activity or student not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            409: { description: 'Student already enrolled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/activities/{id}/enroll/{studentId}': {
        delete: {
          summary: 'Unenroll a student from an activity',
          tags: ['Activities'],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'studentId', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'Student unenrolled', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Enrollment not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/activities/{id}/participants': {
        get: {
          summary: 'Get activity participants',
          tags: ['Activities'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'List of participants', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Student' } } } } },
            404: { description: 'Activity not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/activities/{id}/teacher': {
        put: {
          summary: 'Assign a teacher to an activity',
          tags: ['Activities'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { teacher_id: { type: 'integer' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Teacher assigned', content: { 'application/json': { schema: { $ref: '#/components/schemas/Activity' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Activity or teacher not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/rooms': {
        get: {
          summary: 'Get all rooms',
          tags: ['Rooms'],
          responses: {
            200: { description: 'List of rooms', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Room' } } } } },
          },
        },
        post: {
          summary: 'Create a new room',
          tags: ['Rooms'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoomInput' } } },
          },
          responses: {
            201: { description: 'Room created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Room' } } } },
            400: { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/rooms/available': {
        get: {
          summary: 'Get available rooms',
          tags: ['Rooms'],
          parameters: [
            { name: 'start_time', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'end_time', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'capacity', in: 'query', schema: { type: 'integer' } },
            { name: 'room_type', in: 'query', schema: { type: 'string', enum: ['classroom', 'lab', 'auditorium', 'gym', 'other'] } },
          ],
          responses: {
            200: { description: 'List of available rooms', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Room' } } } } },
          },
        },
      },
      '/api/rooms/{id}': {
        get: {
          summary: 'Get room by ID',
          tags: ['Rooms'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Room found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Room' } } } },
            404: { description: 'Room not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        put: {
          summary: 'Update room',
          tags: ['Rooms'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoomInput' } } },
          },
          responses: {
            200: { description: 'Room updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Room' } } } },
            400: { description: 'No fields to update', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Room not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          summary: 'Delete room',
          tags: ['Rooms'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Room deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Room not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/rooms/{id}/availability': {
        get: {
          summary: 'Check room availability',
          tags: ['Rooms'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'start_time', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'end_time', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            200: {
              description: 'Room availability info',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      room_id: { type: 'integer' },
                      name: { type: 'string' },
                      status: { type: 'string' },
                      available: { type: 'boolean' },
                      conflicts: { type: 'integer' },
                      bookings: { type: 'array', items: { $ref: '#/components/schemas/Booking' } },
                    },
                  },
                },
              },
            },
            404: { description: 'Room not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/bookings': {
        get: {
          summary: 'Get all bookings',
          tags: ['Bookings'],
          responses: {
            200: { description: 'List of bookings', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Booking' } } } } },
          },
        },
        post: {
          summary: 'Create a new booking',
          tags: ['Bookings'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingInput' } } },
          },
          responses: {
            201: { description: 'Booking created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Booking' } } } },
            400: { description: 'Missing required fields or invalid time range', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Room not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            409: { description: 'Room already booked for this time slot', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/bookings/conflicts': {
        get: {
          summary: 'Check for booking conflicts',
          tags: ['Bookings'],
          parameters: [
            { name: 'room_id', in: 'query', required: true, schema: { type: 'integer' } },
            { name: 'start_time', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
            { name: 'end_time', in: 'query', required: true, schema: { type: 'string', format: 'date-time' } },
            { name: 'exclude_id', in: 'query', schema: { type: 'integer' } },
          ],
          responses: {
            200: {
              description: 'Conflict check result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      has_conflicts: { type: 'boolean' },
                      count: { type: 'integer' },
                      conflicts: { type: 'array', items: { $ref: '#/components/schemas/Booking' } },
                    },
                  },
                },
              },
            },
            400: { description: 'Missing required query parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/bookings/room/{roomId}': {
        get: {
          summary: 'Get bookings for a room',
          tags: ['Bookings'],
          parameters: [{ name: 'roomId', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'List of bookings for the room', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Booking' } } } } },
            404: { description: 'Room not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/bookings/{id}': {
        get: {
          summary: 'Get booking by ID',
          tags: ['Bookings'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Booking found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Booking' } } } },
            404: { description: 'Booking not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        put: {
          summary: 'Update booking',
          tags: ['Bookings'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingInput' } } },
          },
          responses: {
            200: { description: 'Booking updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Booking' } } } },
            400: { description: 'No fields to update or invalid time range', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Booking not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            409: { description: 'Room already booked for this time slot', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          summary: 'Delete booking',
          tags: ['Bookings'],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            200: { description: 'Booking deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Booking not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
