# Shared Data Models

This directory contains shared data models and interfaces used across multiple microservices.

## Purpose
- Ensure consistency in data structures across services
- Define common interfaces and types
- Facilitate service-to-service communication

## Models

### Student Model
```typescript
interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth: Date;
  address?: string;
  enrollmentDate: Date;
  status: 'active' | 'inactive' | 'graduated';
  createdAt: Date;
  updatedAt: Date;
}
```

### Teacher Model
```typescript
interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  specialization: string[];
  hireDate: Date;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}
```

### Activity Model
```typescript
interface Activity {
  id: string;
  name: string;
  description: string;
  teacherId: string;
  roomId?: string;
  schedule: {
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  };
  capacity: number;
  currentEnrollment: number;
  status: 'active' | 'cancelled' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}
```

### Room Model
```typescript
interface Room {
  id: string;
  name: string;
  capacity: number;
  type: 'classroom' | 'lab' | 'auditorium' | 'gym' | 'other';
  location: string;
  equipment?: string[];
  status: 'available' | 'maintenance' | 'unavailable';
  createdAt: Date;
  updatedAt: Date;
}
```

### Booking Model
```typescript
interface Booking {
  id: string;
  roomId: string;
  activityId?: string;
  title: string;
  startTime: Date;
  endTime: Date;
  bookedBy: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}
```

## Usage
Each microservice can import these models to ensure type safety and consistency.
