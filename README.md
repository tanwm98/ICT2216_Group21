# Kirby Chope - Restaurant Booking System

A secure restaurant booking system that enables seamless interaction between diners and restaurant owners.

## Team Members
- Chia Xing Ying (2302058)
- Chua Xin Jing (2302123)
- Liew DaiXuan (2302089)
- Lim Su Shuan Sammi (2300473)
- Tan Wei Ming (2301777)
- Tok Yi Xun Jonathan (2303331)
- Yen Cheng Keh Yolanda (2302026)

**Lab Group:** P2-21

## Project Overview

Kirby Chope is a comprehensive restaurant booking platform that facilitates connections between diners and restaurant owners through a secure web application.

### For Customers
- **Secure Registration & Authentication** - Create accounts and log in securely
- **Restaurant Discovery** - Browse nearby restaurants and their details
- **Reservation Management** - Make, modify, or cancel reservations easily
- **Notifications** - Receive email/SMS confirmations and reminders
- **Reviews & Ratings** - Leave authenticated reviews after dining experiences
- **Profile Management** - Update personal information and preferences

### For Restaurant Owners
- **Administrative Dashboard** - Comprehensive management interface
- **Table Management** - Configure tables, time slots, and capacity constraints
- **Reservation Handling** - View and manage upcoming reservations
- **Manual Overrides** - Handle special cases and adjustments
- **Business Analytics** - Generate exportable booking reports
- **Revenue Tracking** - Monitor booking patterns and performance

## Technology Stack

### Frontend
- **HTML5** - Structure and content
- **Bootstrap** - Responsive UI framework
- **JavaScript** - Client-side interactions

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web application framework
- **JavaScript** - Server-side logic

### Database
- **PostgreSQL** - Primary database (via Neon Console)
- Structured data storage for users, restaurants, bookings, and reviews

### Infrastructure
- **Docker & Docker Compose** - Containerization and orchestration
- **Caddy** - Web server and reverse proxy with automatic HTTPS
- **Let's Encrypt** - SSL/TLS certificates
- **Splunk** - Logging and monitoring

## Key Features

### User Management
- Multi-role authentication (Customer, Restaurant Owner, Admin)
- Password reset functionality
- Session management
- Profile management

### Restaurant Management
- Restaurant registration and verification
- Menu and details management
- Operating hours and availability
- Table configuration

### Booking System
- Real-time availability checking
- Reservation confirmation system
- Booking modifications and cancellations
- Waitlist management
- Double-booking prevention

### Communication
- Email confirmations and reminders
- SMS notifications (planned)
- In-app messaging system

### Analytics & Reporting
- Booking statistics
- Revenue reports
- Customer insights
- Performance metrics

## Prerequisites

- **Docker Desktop** - For containerized deployment
- **Node.js 18+** - For local development
- **Git** - Version control
- **PostgreSQL** - Database (or use Neon Console)

## Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd ICT2216_Group21
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
# Database Configuration
DB_URL=postgresql://username:password@hostname/database

# Session Configuration
SESSION_SECRET=your_strong_session_secret_here
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=1h

# Email Configuration
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Splunk Configuration (Optional)
SPLUNK_ADMIN_PASSWORD=your_splunk_password
SPLUNK_HEC_TOKEN=your_hec_token
```

### 3. Development Setup

#### Option A: Local Development
```bash
# Install dependencies
npm install

# Start the development server
npm start

# The application will be available at http://localhost:3000
```

#### Option B: Docker Development
```bash
# Build and start all services
docker-compose up --build

# The application will be available at http://localhost
```

### 4. Production Deployment
```bash
# Start infrastructure services (Splunk, etc.)
docker-compose -f splunk.yml up -d

# Start the main application
docker-compose up -d

# The application will be available at your configured domain
```

## Project Structure

```
ICT2216_Group21/
├── backend/
│   ├── routes/          # API route handlers
│   ├── middleware/      # Custom middleware
│   ├── logger.js        # Logging utilities
│   └── models/          # Data models
├── frontend/
│   ├── html/            # Protected pages
│   ├── public/          # Public pages
│   ├── js/              # Client-side JavaScript
│   ├── css/             # Stylesheets
│   └── static/          # Static assets
├── tests/               # Test suites
├── ssl/                 # SSL certificates
├── .github/workflows/   # CI/CD pipelines
├── docker-compose.yml   # Main application services
├── splunk.yml          # Logging infrastructure
├── Dockerfile          # Application container
├── server.js           # Main application entry point
├── db.js               # Database connection
└── package.json        # Node.js dependencies
```

## Available Scripts

```bash
# Start the application
npm start

# Run tests
npm test

# Run development server with auto-reload
npm run dev

# Build Docker images
docker-compose build

# View application logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## API Endpoints

### Authentication
- `POST /login` - User login
- `POST /register` - User registration
- `POST /logout` - User logout
- `GET /api/session` - Check session status

### Restaurant Management
- `GET /api/restaurants` - List restaurants
- `POST /api/restaurants` - Create restaurant (owner)
- `PUT /api/restaurants/:id` - Update restaurant (owner)

### Booking Management
- `GET /api/bookings` - Get user bookings
- `POST /api/bookings` - Create new booking
- `PUT /api/bookings/:id` - Modify booking
- `DELETE /api/bookings/:id` - Cancel booking

### User Management
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `GET /api/admin/users` - Admin user management

## Database Schema

The application uses PostgreSQL with the following main tables:
- `users` - User accounts and authentication
- `restaurants` - Restaurant information and settings
- `bookings` - Reservation records
- `reviews` - Customer reviews and ratings
- `tables` - Restaurant table configurations

## Contributing

1. Create a feature branch from `develop`
2. Make your changes with appropriate tests
3. Submit a pull request for review
4. Ensure all CI/CD checks pass

## Monitoring & Logging

The application includes comprehensive logging via Splunk:
- Application logs and errors
- Authentication events
- Business metrics (bookings, revenue)
- Security events and monitoring

Access Splunk dashboard at `http://localhost:9000` (credentials in `.env`)

## Health Checks

- Application health: `GET /api/health`
- Service status via Docker health checks
- Monitoring dashboards in Splunk

## Support

For technical issues or questions, please contact the development team or refer to the project documentation.

---

**ICT2216 Secure Software Development - Trimester 3, AY2024/2025**
