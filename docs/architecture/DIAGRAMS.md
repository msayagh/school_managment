# System Diagrams

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             CLIENT LAYER                                 │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │   Web App    │  │  Mobile App  │  │  API Client  │                 │
│  │  (Browser)   │  │   (Future)   │  │   (Future)   │                 │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                 │
│         │                 │                  │                          │
└─────────┼─────────────────┼──────────────────┼──────────────────────────┘
          │                 │                  │
          └─────────────────┴──────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                               │
│                                                                          │
│                     ┌─────────────────────┐                             │
│                     │   UI Service        │                             │
│                     │   React/Vue/Angular │                             │
│                     │   Port: 3000        │                             │
│                     └──────────┬──────────┘                             │
│                                │                                         │
└────────────────────────────────┼─────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          API GATEWAY LAYER                               │
│                                                                          │
│                     ┌─────────────────────┐                             │
│                     │   API Gateway       │                             │
│                     │   Port: 8000        │                             │
│                     │                     │                             │
│                     │  ┌───────────────┐  │                             │
│                     │  │ Auth & JWT    │  │                             │
│                     │  │ Rate Limiting │  │                             │
│                     │  │ Load Balancer │  │                             │
│                     │  │ Routing       │  │                             │
│                     │  └───────────────┘  │                             │
│                     └──────────┬──────────┘                             │
│                                │                                         │
└────────────────────────────────┼─────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      BUSINESS LOGIC LAYER                                │
│                       (Microservices)                                    │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Students   │  │  Teachers   │  │ Activities  │  │   Rooms     │  │
│  │  Service    │  │  Service    │  │  Service    │  │  Service    │  │
│  │  Port: 3001 │  │  Port: 3002 │  │  Port: 3003 │  │  Port: 3004 │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                 │                │          │
│         │                │                 │                │          │
│  ┌──────┴────────────────┴─────────┐       │                │          │
│  │       Bookings Service           │       │                │          │
│  │       Port: 3005                 │───────┴────────────────┘          │
│  └──────────────┬───────────────────┘                                   │
│                 │                                                        │
└─────────────────┼────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                      │
│                                                                          │
│                     ┌─────────────────────┐                             │
│                     │   PostgreSQL        │                             │
│                     │   Port: 5432        │                             │
│                     │                     │                             │
│                     │  ┌───────────────┐  │                             │
│                     │  │ Students DB   │  │                             │
│                     │  │ Teachers DB   │  │                             │
│                     │  │ Activities DB │  │                             │
│                     │  │ Rooms DB      │  │                             │
│                     │  │ Bookings DB   │  │                             │
│                     │  └───────────────┘  │                             │
│                     └─────────────────────┘                             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Service Communication Flow

### Example: Admin Registers a New Student

```
┌─────┐     ┌─────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐
│Admin│     │ UI  │     │   API   │     │ Students │     │ Database │
│     │     │     │     │ Gateway │     │ Service  │     │          │
└──┬──┘     └──┬──┘     └────┬────┘     └────┬─────┘     └────┬─────┘
   │           │             │                │                │
   │  1. Fill  │             │                │                │
   │  Form     │             │                │                │
   ├──────────>│             │                │                │
   │           │             │                │                │
   │           │ 2. POST     │                │                │
   │           │ /students   │                │                │
   │           ├────────────>│                │                │
   │           │             │                │                │
   │           │             │ 3. Validate    │                │
   │           │             │    JWT Token   │                │
   │           │             │                │                │
   │           │             │ 4. Route to    │                │
   │           │             │    Students    │                │
   │           │             ├───────────────>│                │
   │           │             │                │                │
   │           │             │                │ 5. Validate    │
   │           │             │                │    Data        │
   │           │             │                │                │
   │           │             │                │ 6. INSERT      │
   │           │             │                │    Student     │
   │           │             │                ├───────────────>│
   │           │             │                │                │
   │           │             │                │ 7. Return ID   │
   │           │             │                │<───────────────┤
   │           │             │                │                │
   │           │             │ 8. Return      │                │
   │           │             │    Student     │                │
   │           │             │<───────────────┤                │
   │           │             │                │                │
   │           │ 9. Return   │                │                │
   │           │    Response │                │                │
   │           │<────────────┤                │                │
   │           │             │                │                │
   │ 10. Show  │             │                │                │
   │ Success   │             │                │                │
   │<──────────┤             │                │                │
   │           │             │                │                │
```

## Room Booking Flow with Conflict Check

```
┌─────┐   ┌─────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│Admin│   │ UI  │   │   API   │   │ Bookings │   │  Rooms   │   │ Database │
│     │   │     │   │ Gateway │   │ Service  │   │ Service  │   │          │
└──┬──┘   └──┬──┘   └────┬────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
   │         │           │              │              │              │
   │ Create  │           │              │              │              │
   │ Booking │           │              │              │              │
   ├────────>│           │              │              │              │
   │         │           │              │              │              │
   │         │ POST      │              │              │              │
   │         │ /bookings │              │              │              │
   │         ├──────────>│              │              │              │
   │         │           │              │              │              │
   │         │           │ Route        │              │              │
   │         │           ├─────────────>│              │              │
   │         │           │              │              │              │
   │         │           │              │ Check Room   │              │
   │         │           │              │ Exists       │              │
   │         │           │              ├─────────────>│              │
   │         │           │              │              │              │
   │         │           │              │              │ Query Room   │
   │         │           │              │              ├─────────────>│
   │         │           │              │              │              │
   │         │           │              │              │ Return Room  │
   │         │           │              │              │<─────────────┤
   │         │           │              │              │              │
   │         │           │              │ Room OK      │              │
   │         │           │              │<─────────────┤              │
   │         │           │              │              │              │
   │         │           │              │ Check        │              │
   │         │           │              │ Conflicts    │              │
   │         │           │              ├───────────────────────────>│
   │         │           │              │                            │
   │         │           │              │ No Conflicts               │
   │         │           │              │<───────────────────────────┤
   │         │           │              │                            │
   │         │           │              │ Create Booking             │
   │         │           │              ├───────────────────────────>│
   │         │           │              │                            │
   │         │           │              │ Return ID                  │
   │         │           │              │<───────────────────────────┤
   │         │           │              │                            │
   │         │           │ Return       │                            │
   │         │           │ Booking      │                            │
   │         │           │<─────────────┤                            │
   │         │           │              │                            │
   │         │ Response  │              │                            │
   │         │<──────────┤              │                            │
   │         │           │              │                            │
   │ Show    │           │              │                            │
   │ Success │           │              │                            │
   │<────────┤           │              │                            │
   │         │           │              │                            │
```

## Deployment Architecture (Production)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Load Balancer / CDN                         │
│                    (HTTPS Termination)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                   ┌─────────┴─────────┐
                   │                   │
          ┌────────▼────────┐  ┌──────▼───────┐
          │   UI Service    │  │ API Gateway  │
          │   (Multiple     │  │ (Multiple    │
          │   Instances)    │  │ Instances)   │
          └─────────────────┘  └──────┬───────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
          ┌─────────▼─────┐  ┌────────▼────┐  ┌────────▼────┐
          │ Students Svc  │  │Teachers Svc │  │Activity Svc │
          │ (Replicated)  │  │(Replicated) │  │(Replicated) │
          └───────┬───────┘  └──────┬──────┘  └──────┬──────┘
                  │                 │                 │
          ┌───────▼────────┐  ┌────▼─────────┐       │
          │  Rooms Svc     │  │Bookings Svc  │       │
          │  (Replicated)  │  │(Replicated)  │       │
          └───────┬────────┘  └──────┬───────┘       │
                  │                  │                │
                  └──────────┬───────┴────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  Database        │
                    │  (PostgreSQL)    │
                    │  - Primary       │
                    │  - Read Replicas │
                    │  - Backups       │
                    └──────────────────┘
```

## Data Flow Patterns

### Synchronous Communication (Current)
- REST APIs over HTTP
- Request-Response pattern
- Direct service-to-service calls when needed

### Asynchronous Communication (Future)
- Message Queue (RabbitMQ/Kafka)
- Event-driven architecture
- Pub-Sub pattern for notifications

## Security Layers

```
┌─────────────────────────────────────────────┐
│ Layer 1: Network Security                   │
│ - HTTPS/TLS                                 │
│ - Firewall Rules                            │
│ - VPC/Network Segmentation                  │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ Layer 2: API Gateway Security               │
│ - JWT Authentication                        │
│ - Rate Limiting                             │
│ - Input Validation                          │
│ - API Key Management                        │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ Layer 3: Service-Level Security             │
│ - Authorization (RBAC)                      │
│ - Data Validation                           │
│ - Business Logic Validation                 │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ Layer 4: Data Security                      │
│ - Encryption at Rest                        │
│ - Encrypted Connections                     │
│ - Backup Encryption                         │
│ - PII Data Protection                       │
└─────────────────────────────────────────────┘
```

## Monitoring Architecture (Future)

```
┌──────────────────────────────────────────────────┐
│              Logging & Monitoring                 │
│                                                   │
│  ┌───────────────┐  ┌───────────────┐           │
│  │  Prometheus   │  │    Grafana    │           │
│  │  (Metrics)    │  │  (Dashboards) │           │
│  └───────┬───────┘  └───────┬───────┘           │
│          │                  │                    │
│          └──────────┬───────┘                    │
│                     │                            │
│          ┌──────────▼──────────┐                 │
│          │   Alert Manager     │                 │
│          └─────────────────────┘                 │
│                                                   │
│  ┌───────────────┐  ┌───────────────┐           │
│  │ Elasticsearch │  │    Kibana     │           │
│  │   (Logs)      │  │  (Log Viewer) │           │
│  └───────────────┘  └───────────────┘           │
│                                                   │
└──────────────────────────────────────────────────┘
                     ▲
                     │
          All Services Send Logs & Metrics
```

This visual documentation helps understand the system architecture and interactions between components.
